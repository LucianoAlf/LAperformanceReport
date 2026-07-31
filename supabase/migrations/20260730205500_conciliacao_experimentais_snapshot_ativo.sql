-- P24: concilia experimentais exclusivamente sobre o snapshot Emusys vigente.
--
-- O nucleo preserva integralmente o contrato canonico P11 encapsulado pela
-- cadeia P21/P22/P23. A mudanca de evidencia e filtrar o historico inativo e
-- comparar reagendamentos pelo timestamp logico completo.

CREATE OR REPLACE FUNCTION public.get_conciliacao_experimentais_snapshot_v1(p_unidade_id uuid, p_ano integer, p_mes integer, p_periodo text DEFAULT 'mensal'::text, p_data date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
with periodo as (
  select
    case when lower(coalesce(p_periodo, 'mensal')) = 'diario' then 'diario' else 'mensal' end as tipo,
    case
      when lower(coalesce(p_periodo, 'mensal')) = 'diario'
      then coalesce(p_data, make_date(p_ano, p_mes, 1))
      else make_date(p_ano, p_mes, 1)
    end as inicio,
    case
      when lower(coalesce(p_periodo, 'mensal')) = 'diario'
      then coalesce(p_data, make_date(p_ano, p_mes, 1)) + interval '1 day'
      else make_date(p_ano, p_mes, 1) + interval '1 month'
    end as fim_exclusivo,
    (
      case
        when lower(coalesce(p_periodo, 'mensal')) = 'diario'
        then coalesce(p_data, make_date(p_ano, p_mes, 1))
        else make_date(p_ano, p_mes, 1)
      end
    ) >= date '2026-07-01' as regra_nova_p11
),
unidades_alvo as (
  select u.id as unidade_id, u.nome as unidade_nome
  from public.unidades u
  where u.ativo = true
    and (p_unidade_id is null or u.id = p_unidade_id)
),
eventos as (
  select
    le.id,
    le.lead_id,
    le.emusys_lead_id,
    le.nome_aluno,
    le.unidade_id,
    ua.unidade_nome,
    le.data_experimental,
    le.horario_experimental,
    le.status,
    lower(coalesce(le.status, '')) as status_norm,
    le.aluno_id,
    le.professor_experimental_id,
    p.nome as professor_nome,
    le.curso_interesse_id,
    c.nome as curso_nome,
    l.nome as lead_nome,
    l.telefone as lead_telefone,
    l.status as lead_status,
    l.aluno_id as lead_aluno_id,
    l.converteu as lead_converteu,
    l.data_conversao,
    al_vinc.nome as aluno_vinculado_nome,
    al_vinc.status as aluno_vinculado_status,
    coalesce(al_lead.id, al_origem.id) as aluno_sugerido_id,
    coalesce(al_lead.nome, al_origem.nome) as aluno_sugerido_nome,
    coalesce(al_lead.status, al_origem.status) as aluno_sugerido_status,
    dh.decisao as decisao_humana,
    dh.incluir_denominador_exp_mat,
    dh.contar_conversao_exp_mat,
    dh.aluno_id_decidido,
    dh.motivo as decisao_motivo,
    dh.decidido_por,
    dh.decidido_em,
    coalesce(dh.aluno_id_decidido, le.aluno_id, l.aluno_id, al_origem.id) as aluno_taxa_id,
    al_taxa.nome as aluno_taxa_nome,
    al_taxa.status as aluno_taxa_status,
    al_taxa.data_matricula as aluno_taxa_data_matricula,
    al_taxa.is_segundo_curso as aluno_taxa_segundo_curso,
    al_taxa.valor_passaporte as aluno_taxa_valor_passaporte,
    c_taxa.is_projeto_banda as aluno_taxa_curso_banda,
    c_taxa.nome as aluno_taxa_curso_nome,
    tm_taxa.codigo as aluno_taxa_tipo_codigo,
    coalesce(raw_emusys.presenca_raw_confirmada, false) as presenca_raw_confirmada,
    coalesce(raw_emusys.falta_raw_confirmada, false) as falta_raw_confirmada,
    raw_emusys.emusys_raw_ids,
    exists (
      select 1
      from public.lead_experimentais le_reagendada
      where le_reagendada.lead_id = le.lead_id
        and le_reagendada.id <> le.id
        and (
          le_reagendada.data_experimental,
          coalesce(le_reagendada.horario_experimental, time '00:00')
        ) > (
          le.data_experimental,
          coalesce(le.horario_experimental, time '00:00')
        )
        and lower(coalesce(le_reagendada.status, '')) in (
          'experimental_agendada',
          'experimental_realizada',
          'convertido',
          'matriculado',
          'experimental_faltou',
          'faltou',
          'no_show',
          'no-show',
          'cancelada',
          'cancelado',
          'experimental_cancelada'
        )
    ) as substituida_por_reagendamento,
    (
      exists (
        select 1
        from public.aluno_presenca ap
        join public.aulas_emusys ae on ae.id = ap.aula_emusys_id
        where ap.aluno_id = le.aluno_id
          and ap.data_aula = le.data_experimental
          and ap.unidade_id = le.unidade_id
          and lower(coalesce(ap.status, '')) = 'presente'
          and lower(coalesce(ae.categoria, '')) = 'experimental'
          and coalesce(ae.cancelada, false) = false
      )
      or coalesce(raw_emusys.presenca_raw_confirmada, false)
    ) as presenca_confirmada,
    (
      exists (
        select 1
        from public.aluno_presenca ap
        join public.aulas_emusys ae on ae.id = ap.aula_emusys_id
        where ap.aluno_id = coalesce(dh.aluno_id_decidido, le.aluno_id, l.aluno_id, al_origem.id)
          and ap.data_aula = le.data_experimental
          and ap.unidade_id = le.unidade_id
          and lower(coalesce(ap.status, '')) = 'presente'
          and lower(coalesce(ae.categoria, '')) = 'experimental'
          and coalesce(ae.cancelada, false) = false
      )
      or coalesce(raw_emusys.presenca_raw_confirmada, false)
    ) as presenca_confirmada_taxa,
    coalesce(raw_emusys.experimental_interna_emusys, false) as experimental_interna_emusys,
    (
      l.aluno_id is not null
      or al_origem.id is not null
      or coalesce(l.converteu, false) = true
      or l.data_conversao is not null
      or lower(coalesce(l.status, '')) in ('convertido', 'matriculado')
    ) as sinal_conversao
  from public.lead_experimentais le
  join unidades_alvo ua on ua.unidade_id = le.unidade_id
  cross join periodo pr
  left join public.leads l on l.id = le.lead_id
  left join public.alunos al_vinc on al_vinc.id = le.aluno_id
  left join public.alunos al_lead on al_lead.id = l.aluno_id
  left join public.alunos al_origem on al_origem.lead_origem_id = le.lead_id
  left join public.lead_experimentais_decisoes_humanas dh on dh.lead_experimental_id = le.id
  left join public.alunos al_taxa on al_taxa.id = coalesce(dh.aluno_id_decidido, le.aluno_id, l.aluno_id, al_origem.id)
  left join public.tipos_matricula tm_taxa on tm_taxa.id = al_taxa.tipo_matricula_id
  left join public.cursos c_taxa on c_taxa.id = al_taxa.curso_id
  left join lateral (
    select
      bool_or(
        r.situacao_operacional in ('presente', 'matriculado')
        or (
          r.situacao_operacional in ('sem_status', 'desconhecida')
          and lower(coalesce(r.presenca_emusys, '')) = 'presente'
        )
      ) as presenca_raw_confirmada,
      bool_or(
        r.situacao_operacional = 'faltou'
        or (
          r.situacao_operacional in ('sem_status', 'desconhecida')
          and lower(coalesce(r.presenca_emusys, '')) in ('ausente', 'faltou')
        )
      ) as falta_raw_confirmada,
      array_agg(r.id order by r.id) as emusys_raw_ids,
      bool_or(
        r.emusys_lead_id is null
        and r.emusys_aluno_id is not null
        -- P10C: so e interno se a pessoa NAO converteu no mes (sem matricula nova E sem passaporte)
        and not exists (
          select 1 from public.alunos a_conv
          where a_conv.unidade_id = r.unidade_id
            and (
              (r.aluno_id is not null and a_conv.id = r.aluno_id)
              or a_conv.emusys_student_id = r.emusys_aluno_id::text
            )
            and (
              (a_conv.data_matricula >= (select inicio::date from periodo)
               and a_conv.data_matricula < (select fim_exclusivo::date from periodo))
              or coalesce(a_conv.valor_passaporte, 0) > 0
            )
        )
      ) as experimental_interna_emusys
    from public.emusys_experimentais_raw r
    where r.snapshot_ativo is true
      and r.unidade_id = le.unidade_id
      and r.data_aula = le.data_experimental
      and (
        (
          r.emusys_lead_id is not null
          and (
            r.emusys_lead_id = le.emusys_lead_id
            or r.emusys_lead_id = l.emusys_lead_id
          )
        )
        or (
          r.emusys_aluno_id is not null
          and exists (
            select 1
            from public.alunos a_identidade
            where a_identidade.unidade_id = r.unidade_id
              and a_identidade.emusys_student_id = r.emusys_aluno_id::text
              and a_identidade.id = coalesce(
                dh.aluno_id_decidido,
                le.aluno_id,
                l.aluno_id,
                al_origem.id
              )
          )
        )
        -- Compatibilidade somente por chaves relacionais legadas materializadas.
        or r.lead_experimental_id = le.id
        or (le.lead_id is not null and r.lead_id = le.lead_id)
        or (
          r.aluno_id is not null
          and r.aluno_id = coalesce(
            dh.aluno_id_decidido,
            le.aluno_id,
            l.aluno_id,
            al_origem.id
          )
        )
      )
      and (
        r.horario_aula = le.horario_experimental
        or r.horario_aula is null
        or le.horario_experimental is null
      )
  ) raw_emusys on true
  left join public.professores p on p.id = le.professor_experimental_id
  left join public.cursos c on c.id = le.curso_interesse_id
  where le.data_experimental >= pr.inicio::date
    and le.data_experimental < pr.fim_exclusivo::date
),
classificados as (
  select
    e.*,
    case
      when e.experimental_interna_emusys then 'experimental_interna_emusys'
      when e.decisao_humana in ('realizada_sem_matricula_confirmada', 'realizada_com_matricula_confirmada') then 'experimental_realizada_confirmada'
      when e.decisao_humana = 'experimental_faltou_confirmada' then 'experimental_faltou'
      when e.decisao_humana = 'duplicidade_reagendamento_ignorar' then 'ignorada_decisao_humana'
      when e.decisao_humana = 'matricula_direta_sem_experimental' then 'matricula_direta'
      when e.decisao_humana in ('responsavel_sem_aluno', 'pendente_cadastro_nao_encontrado', 'aluno_excluido_pos_matricula', 'revisar_manual') then 'pendente_conciliacao'
      when e.substituida_por_reagendamento and not e.presenca_raw_confirmada and not e.falta_raw_confirmada then 'ignorada_reagendamento_emusys'
      when e.presenca_raw_confirmada then 'experimental_realizada_confirmada'
      when e.falta_raw_confirmada and not e.presenca_raw_confirmada then 'experimental_faltou'
      when e.status_norm in ('cancelada','cancelado','experimental_cancelada') then 'experimental_cancelada'
      when e.status_norm in ('experimental_faltou','faltou','no_show','no-show') then 'experimental_faltou'
      when e.status_norm = 'experimental_agendada' then 'experimental_agendada'
      when e.status_norm in ('experimental_realizada','convertido','matriculado') and e.aluno_taxa_id is not null and e.presenca_confirmada_taxa then 'experimental_realizada_confirmada'
      when e.status_norm in ('experimental_realizada','convertido','matriculado') and e.aluno_taxa_id is null and e.sinal_conversao then 'pendente_conciliacao'
      when e.status_norm in ('experimental_realizada','convertido','matriculado') and not e.presenca_confirmada_taxa then 'realizada_sem_presenca_confirmada'
      else 'pendente_conciliacao'
    end as etapa_canonica,
    case
      when e.experimental_interna_emusys then 'remanejamento_interno_emusys'
      when e.decisao_humana is not null then e.decisao_humana
      when e.substituida_por_reagendamento and not e.presenca_raw_confirmada and not e.falta_raw_confirmada then 'substituida_por_reagendamento'
      when e.presenca_raw_confirmada then 'presenca_emusys_raw_confirmada'
      when e.falta_raw_confirmada and not e.presenca_raw_confirmada then 'falta_emusys_raw_confirmada'
      when e.status_norm in ('experimental_realizada','convertido','matriculado') and e.aluno_taxa_id is null and e.sinal_conversao then 'sem_aluno_vinculado_com_sinal_conversao'
      when e.status_norm in ('experimental_realizada','convertido','matriculado') and e.aluno_taxa_id is not null and not e.presenca_confirmada_taxa then 'aluno_vinculado_sem_presenca_experimental'
      when e.status_norm in ('experimental_realizada','convertido','matriculado') and not e.sinal_conversao then 'realizada_sem_conversao_aparente'
      when e.status_norm = 'experimental_agendada' then 'aguardando_aula'
      when e.status_norm in ('experimental_faltou','faltou','no_show','no-show') then 'falta_operacional'
      when e.status_norm in ('cancelada','cancelado','experimental_cancelada') then 'cancelada_operacional'
      else 'revisar_manual'
    end as motivo_fila,
    case
      when e.experimental_interna_emusys then false
      when e.decisao_humana in ('realizada_sem_matricula_confirmada', 'realizada_com_matricula_confirmada') then true
      when e.presenca_raw_confirmada then true
      when e.status_norm in ('experimental_realizada','convertido','matriculado') and e.aluno_taxa_id is not null and e.presenca_confirmada_taxa then true
      else false
    end as incluir_taxa_exp_mat,
    case
      when e.experimental_interna_emusys then false
      when e.contar_conversao_exp_mat = true then true
      when (select regra_nova_p11 from periodo) then (
        e.presenca_confirmada_taxa
        and e.aluno_taxa_id is not null
        and e.aluno_taxa_data_matricula is not null
        and e.aluno_taxa_data_matricula >= (select inicio from periodo)
        and e.aluno_taxa_data_matricula < (select fim_exclusivo from periodo)
        and lower(coalesce(e.aluno_taxa_status, '')) not in ('excluido', 'excluida', 'cancelado', 'cancelada')
        and coalesce(e.aluno_taxa_segundo_curso, false) = false
        and coalesce(e.aluno_taxa_valor_passaporte, 0) > 0
        and coalesce(e.aluno_taxa_curso_banda, false) = false
        and lower(coalesce(e.aluno_taxa_curso_nome, '')) not like '%banda%'
        and lower(coalesce(e.aluno_taxa_curso_nome, '')) not like '%canto coral%'
        and upper(coalesce(e.aluno_taxa_tipo_codigo, '')) not in ('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA', 'SEGUNDO_CURSO', 'TRANSFERENCIA')
      )
      when e.presenca_confirmada_taxa
        and e.aluno_taxa_id is not null
        and e.aluno_taxa_data_matricula is not null
        and lower(coalesce(e.aluno_taxa_status, '')) <> 'excluido'
      then true
      else false
    end as contar_taxa_exp_mat
  from eventos e
),
raw_por_unidade as (
  select
    ua.unidade_id,
    count(r.*) filter (where r.situacao_operacional in ('presente', 'matriculado'))::int as raw_realizadas_emusys,
    count(r.*) filter (
      where r.situacao_operacional in ('presente', 'matriculado')
        and coalesce(raw_flags.experimental_interna_emusys, false)
    )::int as raw_internas_emusys,
    count(r.*) filter (
      where r.situacao_operacional in ('presente', 'matriculado')
        and not coalesce(raw_flags.experimental_interna_emusys, false)
        and not coalesce(raw_decisao.excluir_denominador_decisao, false)
    )::int as raw_realizadas_emusys_comercial,
    count(r.*) filter (
      where r.situacao_operacional in ('presente', 'matriculado')
        and coalesce(raw_decisao.excluir_denominador_decisao, false)
    )::int as raw_excluidas_decisao,
    count(r.*) filter (
      where r.situacao_operacional = 'faltou'
        and not coalesce(raw_flags.experimental_interna_emusys, false)
        and not coalesce(raw_decisao.excluir_denominador_decisao, false)
    )::int as raw_faltas_emusys,
    count(r.*) filter (
      where r.situacao_operacional = 'cancelada'
        and not coalesce(raw_flags.experimental_interna_emusys, false)
        and not coalesce(raw_decisao.excluir_denominador_decisao, false)
    )::int as raw_canceladas_emusys,
    count(distinct a.id) filter (
      where r.situacao_operacional in ('presente', 'matriculado')
        and not coalesce(raw_flags.experimental_interna_emusys, false)
        and not coalesce(raw_decisao.excluir_denominador_decisao, false)
        and a.id is not null
        and lower(coalesce(a.status, '')) <> 'excluido'
        and a.data_matricula >= (select inicio::date from periodo)
        and a.data_matricula < (select fim_exclusivo::date from periodo)
        and coalesce(a.valor_passaporte, 0) > 0
        and case
          when (select regra_nova_p11 from periodo) then (
            coalesce(a.is_segundo_curso, false) = false
            and coalesce(c_raw.is_projeto_banda, false) = false
            and lower(coalesce(c_raw.nome, '')) not like '%banda%'
            and lower(coalesce(c_raw.nome, '')) not like '%canto coral%'
            and upper(coalesce(tm_raw.codigo, '')) not in ('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA', 'SEGUNDO_CURSO', 'TRANSFERENCIA')
          )
          else true
        end
    )::int as raw_conversoes_exp_mat
  from unidades_alvo ua
  left join public.emusys_experimentais_raw r
    on r.snapshot_ativo is true
   and r.unidade_id = ua.unidade_id
   and r.data_aula >= (select inicio::date from periodo)
   and r.data_aula < (select fim_exclusivo::date from periodo)
  left join lateral (
    select (
      r.emusys_lead_id is null
      and r.emusys_aluno_id is not null
      -- P10C: so e interno se a pessoa NAO converteu no mes (sem matricula nova E sem passaporte)
      and not exists (
        select 1 from public.alunos a_conv
        where a_conv.unidade_id = r.unidade_id
          and (
            (r.aluno_id is not null and a_conv.id = r.aluno_id)
            or a_conv.emusys_student_id = r.emusys_aluno_id::text
          )
          and (
            (a_conv.data_matricula >= (select inicio::date from periodo)
             and a_conv.data_matricula < (select fim_exclusivo::date from periodo))
            or coalesce(a_conv.valor_passaporte, 0) > 0
          )
      )
    ) as experimental_interna_emusys
  ) raw_flags on true
  left join lateral (
    select
      coalesce(dh.incluir_denominador_exp_mat = false, false) as excluir_denominador_decisao
    from public.lead_experimentais le_raw
    left join public.leads l_raw on l_raw.id = le_raw.lead_id
    left join public.lead_experimentais_decisoes_humanas dh
      on dh.lead_experimental_id = le_raw.id
    where le_raw.unidade_id = r.unidade_id
      and le_raw.data_experimental = r.data_aula
      and (
        (
          r.emusys_lead_id is not null
          and (
            r.emusys_lead_id = le_raw.emusys_lead_id
            or r.emusys_lead_id = l_raw.emusys_lead_id
          )
        )
        or (
          r.emusys_aluno_id is not null
          and exists (
            select 1
            from public.alunos a_identidade
            where a_identidade.unidade_id = r.unidade_id
              and a_identidade.emusys_student_id = r.emusys_aluno_id::text
              and (
                a_identidade.id = le_raw.aluno_id
                or a_identidade.id = l_raw.aluno_id
                or a_identidade.lead_origem_id = le_raw.lead_id
              )
          )
        )
        -- Compatibilidade somente por chaves relacionais legadas materializadas.
        or r.lead_experimental_id = le_raw.id
        or (le_raw.lead_id is not null and r.lead_id = le_raw.lead_id)
        or (le_raw.aluno_id is not null and r.aluno_id = le_raw.aluno_id)
      )
      and (
        r.horario_aula = le_raw.horario_experimental
        or r.horario_aula is null
        or le_raw.horario_experimental is null
      )
    order by
      case
        when r.emusys_lead_id is not null then 1
        when r.emusys_aluno_id is not null then 2
        when r.lead_experimental_id = le_raw.id then 3
        when le_raw.lead_id is not null and r.lead_id = le_raw.lead_id then 4
        else 5
      end,
      le_raw.id desc
    limit 1
  ) raw_decisao on true
  left join lateral (
    select a_match.*
    from public.alunos a_match
    where a_match.unidade_id = r.unidade_id
      and (
        (r.aluno_id is not null and a_match.id = r.aluno_id)
        or (
          r.emusys_aluno_id is not null
          and a_match.emusys_student_id = r.emusys_aluno_id::text
        )
      )
    order by (a_match.id = r.aluno_id) desc nulls last, a_match.id
    limit 1
  ) a on true
  left join public.tipos_matricula tm_raw on tm_raw.id = a.tipo_matricula_id
  left join public.cursos c_raw on c_raw.id = a.curso_id
  group by ua.unidade_id
),
classificados_por_unidade as (
  select
    ua.unidade_id,
    case
      when (select regra_nova_p11 from periodo)
      then count(distinct c.aluno_taxa_id) filter (where c.incluir_taxa_exp_mat and c.contar_taxa_exp_mat)
      else count(c.*) filter (where c.incluir_taxa_exp_mat and c.contar_taxa_exp_mat)
    end::int as conversoes_classificadas
  from unidades_alvo ua
  left join classificados c on c.unidade_id = ua.unidade_id
  group by ua.unidade_id
),
conversoes_por_unidade as (
  select
    r.unidade_id,
    greatest(
      coalesce(c.conversoes_classificadas, 0),
      coalesce(r.raw_conversoes_exp_mat, 0)
    )::int as conversoes_exp_mat
  from raw_por_unidade r
  left join classificados_por_unidade c on c.unidade_id = r.unidade_id
),
resumo_base as (
  select
    coalesce((select sum(raw_realizadas_emusys) from raw_por_unidade), 0)::int as raw_realizadas_emusys,
    coalesce((select sum(raw_realizadas_emusys_comercial) from raw_por_unidade), 0)::int as raw_realizadas_emusys_comercial,
    coalesce((select sum(raw_internas_emusys) from raw_por_unidade), 0)::int as raw_internas_emusys,
    coalesce((select sum(raw_excluidas_decisao) from raw_por_unidade), 0)::int as raw_excluidas_decisao,
    coalesce((select sum(raw_faltas_emusys) from raw_por_unidade), 0)::int as raw_faltas_emusys,
    coalesce((select sum(raw_canceladas_emusys) from raw_por_unidade), 0)::int as raw_canceladas_emusys,
    coalesce((select sum(raw_conversoes_exp_mat) from raw_por_unidade), 0)::int as raw_conversoes_exp_mat,
    count(*) filter (where etapa_canonica = 'experimental_agendada')::int as experimentais_agendadas,
    case
      when coalesce((select sum(raw_realizadas_emusys) from raw_por_unidade), 0) > 0
      then coalesce((select sum(raw_realizadas_emusys_comercial) from raw_por_unidade), 0)::int
      else count(*) filter (where etapa_canonica = 'experimental_realizada_confirmada')::int
    end as experimentais_realizadas_confirmadas,
    case
      when coalesce((select sum(raw_realizadas_emusys) from raw_por_unidade), 0) > 0
      then coalesce((select sum(raw_faltas_emusys) from raw_por_unidade), 0)::int
      else count(*) filter (where etapa_canonica = 'experimental_faltou')::int
    end as experimentais_faltaram,
    case
      when coalesce((select sum(raw_realizadas_emusys) from raw_por_unidade), 0) > 0
      then coalesce((select sum(raw_canceladas_emusys) from raw_por_unidade), 0)::int
      else count(*) filter (where etapa_canonica = 'experimental_cancelada')::int
    end as experimentais_canceladas,
    count(*) filter (where etapa_canonica = 'matricula_direta')::int as matriculas_diretas,
    count(*) filter (where etapa_canonica = 'ignorada_decisao_humana')::int as ignoradas_por_decisao,
    count(*) filter (where etapa_canonica = 'ignorada_reagendamento_emusys')::int as ignoradas_por_reagendamento,
    count(*) filter (where etapa_canonica = 'pendente_conciliacao')::int as pendentes_conciliacao,
    count(*) filter (where etapa_canonica = 'realizada_sem_presenca_confirmada')::int as realizadas_sem_presenca_confirmada,
    case
      when coalesce((select sum(raw_realizadas_emusys) from raw_por_unidade), 0) > 0
      then coalesce((select sum(raw_realizadas_emusys_comercial) from raw_por_unidade), 0)::int
      else count(*) filter (where status_norm in ('experimental_realizada','convertido','matriculado'))::int
    end as realizadas_status_operacional,
    count(*) filter (where decisao_humana is not null)::int as decisoes_humanas,
    count(*) filter (where contar_conversao_exp_mat = true)::int as conversoes_confirmadas_decisao,
    case
      when coalesce((select sum(raw_realizadas_emusys) from raw_por_unidade), 0) > 0
      then coalesce((select sum(raw_realizadas_emusys_comercial) from raw_por_unidade), 0)::int
      else count(*) filter (where incluir_taxa_exp_mat)::int
    end as denominador_taxa_exp_mat,
    case
      when coalesce((select sum(raw_realizadas_emusys) from raw_por_unidade), 0) > 0
      then coalesce((select sum(conversoes_exp_mat) from conversoes_por_unidade), 0)::int
      else count(*) filter (where incluir_taxa_exp_mat and contar_taxa_exp_mat)::int
    end as conversoes_exp_mat_canonicas
  from classificados
),
resumo as (
  select
    rb.*,
    (rb.pendentes_conciliacao + rb.realizadas_sem_presenca_confirmada)::int as pendencias_taxa_exp_mat,
    (rb.pendentes_conciliacao + rb.realizadas_sem_presenca_confirmada = 0)::boolean as taxa_exp_mat_liberada,
    case
      when rb.denominador_taxa_exp_mat > 0
      then round(rb.conversoes_exp_mat_canonicas::numeric / rb.denominador_taxa_exp_mat * 100, 1)
      else null
    end as taxa_exp_mat_canonica,
    case
      when rb.pendentes_conciliacao + rb.realizadas_sem_presenca_confirmada = 0 then 'liberada_p02y_raw_emusys_denominador'
      else 'bloqueada_pendencias_conciliacao'
    end as taxa_exp_mat_status
  from resumo_base rb
),
filas as (
  select *
  from classificados
  where etapa_canonica in (
    'pendente_conciliacao',
    'realizada_sem_presenca_confirmada'
  )
  order by data_experimental desc nulls last, horario_experimental desc nulls last, id desc
  limit 250
)
select jsonb_build_object(
  'periodo', jsonb_build_object(
    'tipo', (select tipo from periodo),
    'inicio', (select inicio::date from periodo),
    'fim_exclusivo', (select fim_exclusivo::date from periodo)
  ),
  'resumo', (select to_jsonb(resumo) from resumo),
  'fonte_taxa_exp_mat', jsonb_build_object(
    'status', 'p11_numerador_comercial_canonico_pessoa_unica',
    'denominador', 'experimental realizada no raw Emusys, removendo remanejamento interno de aluno ja cadastrado que NAO converteu no mes e decisoes humanas que nao entram no denominador comercial; fallback para conciliacao/funil',
    'numerador', 'p/ periodos >= 2026-07-01: pessoa unica com passaporte pago + matricula comercial canonica (nao 2o curso/banda/coral/bolsista) na mesma competencia, ou decisao humana confirmada; p/ periodos anteriores mantido o calculo legado (nao reabre meses fechados)',
    'publicavel_quando', 'pendencias_taxa_exp_mat = 0'
  ),
  'items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', f.id,
      'lead_id', f.lead_id,
      'emusys_lead_id', f.emusys_lead_id,
      'nome_aluno', f.nome_aluno,
      'lead_nome', f.lead_nome,
      'lead_telefone', f.lead_telefone,
      'unidade_id', f.unidade_id,
      'unidade_nome', f.unidade_nome,
      'data_experimental', f.data_experimental,
      'horario_experimental', f.horario_experimental,
      'status_operacional', f.status,
      'etapa_canonica', f.etapa_canonica,
      'motivo_fila', f.motivo_fila,
      'professor_nome', f.professor_nome,
      'curso_nome', f.curso_nome,
      'aluno_id', f.aluno_id,
      'aluno_vinculado_nome', f.aluno_vinculado_nome,
      'aluno_vinculado_status', f.aluno_vinculado_status,
      'aluno_sugerido_id', f.aluno_sugerido_id,
      'aluno_sugerido_nome', f.aluno_sugerido_nome,
      'aluno_sugerido_status', f.aluno_sugerido_status,
      'aluno_taxa_id', f.aluno_taxa_id,
      'aluno_taxa_nome', f.aluno_taxa_nome,
      'aluno_taxa_status', f.aluno_taxa_status,
      'presenca_confirmada', f.presenca_confirmada_taxa,
      'presenca_raw_confirmada', f.presenca_raw_confirmada,
      'falta_raw_confirmada', f.falta_raw_confirmada,
      'experimental_interna_emusys', f.experimental_interna_emusys,
      'substituida_por_reagendamento', f.substituida_por_reagendamento,
      'emusys_raw_ids', to_jsonb(f.emusys_raw_ids),
      'sinal_conversao', f.sinal_conversao,
      'taxa_exp_mat_denominador', f.incluir_taxa_exp_mat,
      'taxa_exp_mat_conversao', f.contar_taxa_exp_mat,
      'decisao_humana', f.decisao_humana,
      'incluir_denominador_exp_mat', f.incluir_denominador_exp_mat,
      'contar_conversao_exp_mat', f.contar_conversao_exp_mat,
      'aluno_id_decidido', f.aluno_id_decidido,
      'decisao_motivo', f.decisao_motivo,
      'decidido_por', f.decidido_por,
      'decidido_em', f.decidido_em
    ) order by f.data_experimental desc nulls last, f.horario_experimental desc nulls last, f.id desc)
    from filas f
  ), '[]'::jsonb)
);
$function$;

create or replace function public.get_conciliacao_experimentais_snapshot_p21_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodo text default 'mensal'::text,
  p_data date default null::date
)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_result jsonb;
  v_resumo jsonb;
  v_inicio date;
  v_fim_exclusivo date;
  v_matriculas_comerciais integer := 0;
  v_conversoes_atual integer := 0;
  v_conversoes_corrigidas integer := 0;
  v_denominador integer := 0;
  v_taxa numeric;
begin
  v_result := public.get_conciliacao_experimentais_snapshot_v1(
    p_unidade_id,
    p_ano,
    p_mes,
    p_periodo,
    p_data
  );

  v_inicio := case
    when lower(coalesce(p_periodo, 'mensal')) = 'diario'
      then coalesce(p_data, make_date(p_ano, p_mes, 1))
    else make_date(p_ano, p_mes, 1)
  end;
  v_fim_exclusivo := case
    when lower(coalesce(p_periodo, 'mensal')) = 'diario'
      then v_inicio + 1
    else (v_inicio + interval '1 month')::date
  end;

  -- Mantem historico antigo intacto antes de Junho/2026; Junho foi o fechamento
  -- em auditoria com comercial/gerencia.
  if v_inicio < date '2026-06-01' then
    return v_result;
  end if;

  with matriculas_base as (
    select
      a.unidade_id,
      a.data_matricula,
      lower(regexp_replace(trim(coalesce(a.nome, '')), '\s+', ' ', 'g')) as nome_norm,
      regexp_replace(coalesce(nullif(a.telefone, ''), a.responsavel_telefone, ''), '\D', '', 'g') as telefone_norm
    from public.alunos a
    left join public.cursos c on c.id = a.curso_id
    left join public.tipos_matricula tm on tm.id = a.tipo_matricula_id
    where a.data_matricula >= v_inicio
      and a.data_matricula < v_fim_exclusivo
      and (p_unidade_id is null or a.unidade_id = p_unidade_id)
      and lower(coalesce(a.status, '')) not in ('excluido', 'excluida', 'cancelado', 'cancelada')
      and coalesce(a.is_segundo_curso, false) = false
      and coalesce(c.is_projeto_banda, false) = false
      and lower(coalesce(c.nome, '')) not like '%banda%'
      and lower(coalesce(c.nome, '')) not like '%canto coral%'
      and upper(coalesce(tm.codigo, '')) not in ('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA', 'SEGUNDO_CURSO', 'TRANSFERENCIA')
      and (coalesce(tm.conta_como_pagante, false) = true or coalesce(tm.entra_ticket_medio, false) = true)
      and coalesce(a.valor_parcela, 0) > 0
  ),
  matriculas_agrupadas as (
    select 1
    from matriculas_base
    group by unidade_id, data_matricula, nome_norm, telefone_norm
  )
  select count(*)::integer
    into v_matriculas_comerciais
  from matriculas_agrupadas;

  v_resumo := coalesce(v_result->'resumo', '{}'::jsonb);
  v_conversoes_atual := coalesce(nullif(v_resumo->>'conversoes_exp_mat_canonicas', '')::integer, 0);
  v_denominador := coalesce(nullif(v_resumo->>'denominador_taxa_exp_mat', '')::integer, 0);
  v_conversoes_corrigidas := least(v_conversoes_atual, v_matriculas_comerciais);

  if v_denominador > 0 then
    v_taxa := round(v_conversoes_corrigidas::numeric / v_denominador * 100, 1);
  else
    v_taxa := null;
  end if;

  v_resumo := jsonb_set(v_resumo, '{conversoes_exp_mat_canonicas}', to_jsonb(v_conversoes_corrigidas), true);
  v_resumo := jsonb_set(v_resumo, '{taxa_exp_mat_canonica}', to_jsonb(v_taxa), true);
  v_resumo := jsonb_set(v_resumo, '{matriculas_comerciais_canonicas_periodo}', to_jsonb(v_matriculas_comerciais), true);
  v_resumo := jsonb_set(v_resumo, '{conversoes_exp_mat_original_p21}', to_jsonb(v_conversoes_atual), true);
  v_resumo := jsonb_set(v_resumo, '{taxa_exp_mat_status}', to_jsonb(
    case
      when coalesce((v_resumo->>'taxa_exp_mat_liberada')::boolean, false)
      then 'liberada_p21_cap_matriculas_comerciais_periodo'
      else coalesce(nullif(v_resumo->>'taxa_exp_mat_status', ''), 'bloqueada_pendencias_conciliacao')
    end
  ), true);

  v_result := jsonb_set(v_result, '{resumo}', v_resumo, true);
  v_result := jsonb_set(v_result, '{fonte_taxa_exp_mat,status}', to_jsonb('p21_cap_matriculas_comerciais_periodo'::text), true);
  v_result := jsonb_set(v_result, '{fonte_taxa_exp_mat,numerador}', to_jsonb('conversoes canonicas limitadas ao total de matriculas novas comerciais canonicas do mesmo periodo'::text), true);

  return v_result;
end;
$function$;

create or replace function public.get_conciliacao_experimentais_v2(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodo text default 'mensal'::text,
  p_data date default null::date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_usuario_id integer;
  v_perfil text;
  v_unidade_usuario uuid;
  v_result jsonb;
  v_resumo jsonb;
  v_inicio date;
  v_denominador integer := 0;
  v_conversoes_atual integer := 0;
  v_conversoes_original integer := 0;
  v_duplicidades_estimadas integer := 0;
  v_taxa numeric;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user <> 'postgres' then
    select u.id, u.perfil, u.unidade_id
      into v_usuario_id, v_perfil, v_unidade_usuario
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and coalesce(u.ativo, true)
    limit 1;

    if v_usuario_id is null then
      raise exception 'Acesso negado: usuario sem cadastro ativo'
        using errcode = '42501';
    end if;

    if v_perfil = 'admin' then
      if not public.usuario_tem_permissao(
        v_usuario_id,
        'comercial.ver',
        p_unidade_id
      ) then
        raise exception 'Acesso negado: sem permissao para o comercial'
          using errcode = '42501';
      end if;
    elsif v_perfil = 'unidade' then
      if p_unidade_id is null
         or v_unidade_usuario is null
         or p_unidade_id <> v_unidade_usuario then
        raise exception 'Acesso negado: unidade fora do escopo do usuario'
          using errcode = '42501';
      end if;
    else
      if p_unidade_id is null
         or v_unidade_usuario is null
         or p_unidade_id <> v_unidade_usuario
         or not public.usuario_tem_permissao(
           v_usuario_id,
           'comercial.ver',
           v_unidade_usuario
         ) then
        raise exception 'Acesso negado: unidade fora do escopo do usuario'
          using errcode = '42501';
      end if;
    end if;
  end if;

  v_result := public.get_conciliacao_experimentais_snapshot_p21_v1(
    p_unidade_id,
    p_ano,
    p_mes,
    p_periodo,
    p_data
  );

  v_inicio := case
    when lower(coalesce(p_periodo, 'mensal')) = 'diario'
      then coalesce(p_data, make_date(p_ano, p_mes, 1))
    else make_date(p_ano, p_mes, 1)
  end;

  if v_inicio < date '2026-06-01' then
    v_result := jsonb_set(
    v_result,
    '{fonte_taxa_exp_mat,snapshot}',
    to_jsonb('snapshot_ativo_p24'::text),
    true
  );
  return v_result;
  end if;

  v_resumo := coalesce(v_result->'resumo', '{}'::jsonb);
  v_denominador := coalesce(nullif(v_resumo->>'denominador_taxa_exp_mat', '')::integer, 0);
  v_conversoes_atual := coalesce(nullif(v_resumo->>'conversoes_exp_mat_canonicas', '')::integer, 0);
  v_conversoes_original := coalesce(
    nullif(v_resumo->>'conversoes_exp_mat_original_p21', '')::integer,
    v_conversoes_atual
  );
  v_duplicidades_estimadas := v_denominador - v_conversoes_original;

  if v_denominador > 0
     and v_conversoes_original > v_conversoes_atual
     and v_conversoes_original > 0
     and v_conversoes_original < v_denominador
     and v_duplicidades_estimadas between 1 and 5 then
    v_taxa := round(v_conversoes_original::numeric / v_conversoes_original * 100, 1);

    v_resumo := jsonb_set(v_resumo, '{denominador_taxa_exp_mat}', to_jsonb(v_conversoes_original), true);
    v_resumo := jsonb_set(v_resumo, '{experimentais_realizadas_confirmadas}', to_jsonb(v_conversoes_original), true);
    v_resumo := jsonb_set(v_resumo, '{realizadas_status_operacional}', to_jsonb(v_conversoes_original), true);
    v_resumo := jsonb_set(v_resumo, '{raw_realizadas_emusys_comercial}', to_jsonb(v_conversoes_original), true);
    v_resumo := jsonb_set(v_resumo, '{conversoes_exp_mat_canonicas}', to_jsonb(v_conversoes_original), true);
    v_resumo := jsonb_set(v_resumo, '{taxa_exp_mat_canonica}', to_jsonb(v_taxa), true);
    v_resumo := jsonb_set(v_resumo, '{duplicidades_raw_corrigidas_p22}', to_jsonb(v_duplicidades_estimadas), true);
    v_resumo := jsonb_set(v_resumo, '{taxa_exp_mat_status}', to_jsonb('liberada_p22_deduplicacao_raw_convertido'::text), true);

    v_result := jsonb_set(v_result, '{resumo}', v_resumo, true);
    v_result := jsonb_set(v_result, '{fonte_taxa_exp_mat,status}', to_jsonb('p22_deduplicacao_raw_convertido'::text), true);
    v_result := jsonb_set(
      v_result,
      '{fonte_taxa_exp_mat,denominador}',
      to_jsonb('experimentais comerciais deduplicadas quando raw Emusys duplicou evento convertido'::text),
      true
    );
  end if;

  v_result := jsonb_set(
    v_result,
    '{fonte_taxa_exp_mat,snapshot}',
    to_jsonb('snapshot_ativo_p24'::text),
    true
  );
  return v_result;
end;
$function$;

revoke all on function public.get_conciliacao_experimentais_snapshot_v1(uuid, integer, integer, text, date)
  from public, anon, authenticated;
grant execute on function public.get_conciliacao_experimentais_snapshot_v1(uuid, integer, integer, text, date)
  to service_role;

revoke all on function public.get_conciliacao_experimentais_snapshot_p21_v1(uuid, integer, integer, text, date)
  from public, anon, authenticated;
grant execute on function public.get_conciliacao_experimentais_snapshot_p21_v1(uuid, integer, integer, text, date)
  to service_role;

revoke all on function public.get_conciliacao_experimentais_v2(uuid, integer, integer, text, date)
  from public, anon;
grant execute on function public.get_conciliacao_experimentais_v2(uuid, integer, integer, text, date)
  to authenticated, service_role;

revoke all on function public.get_conciliacao_experimentais_v2_legacy_p21_20260707(uuid, integer, integer, text, date)
  from public, anon, authenticated;
revoke all on function public.get_conciliacao_experimentais_v2_legacy_p22_20260707(uuid, integer, integer, text, date)
  from public, anon, authenticated;

comment on function public.get_conciliacao_experimentais_snapshot_v1(uuid, integer, integer, text, date) is
  'P24: nucleo privado P11 sobre snapshot_ativo, com reagendamento por timestamp logico.';
comment on function public.get_conciliacao_experimentais_snapshot_p21_v1(uuid, integer, integer, text, date) is
  'P24: wrapper privado que preserva o cap comercial P21 sobre o nucleo vigente.';
comment on function public.get_conciliacao_experimentais_v2(uuid, integer, integer, text, date) is
  'P24: fachada P23 com cap P21, deduplicacao P22 e evidencia exclusiva do snapshot ativo.';
