-- P10C: corrige a regra de "experimental interna" da P10B.
-- Problema: a P10B marcava como interna (fora do funil comercial) TODA experimental
-- com aluno.id_lead = 0 e aluno.id_aluno > 0 (pessoa ja cadastrada no Emusys).
-- Esse sinal e ambiguo: pega 3 situacoes com a mesma "cara":
--   1. aluno ATIVO trocando/adicionando instrumento -> interno de verdade (cortar certo)
--   2. ex-aluno que voltou (win-back) -> comercial (estava sendo cortado errado)
--   3. familiar (ex: mae de aluno) que virou aluno -> comercial (cortado errado)
-- Validado pela lider do comercial (Krissya): "e um cliente que pode converter ou nao,
-- nao conta como novo lead, mas tem que contar como experimental".
-- Correcao: so mantem "interno" quem NAO converteu no mes (sem passaporte E sem
-- matricula nova no periodo). Quem converteu (Gael, Flavia) volta a contar como comercial.
-- Guilherme (aluno ativo desde 2021, sem passaporte) segue corretamente interno.
-- Impacto medido (jun/2026): so +3 experimentais no Recreio (Gael x2 + Flavia).
-- CG e Barra sem falso-corte. Recreio jun passa de 43 -> 46 experimentais.
-- Alteracao em 2 pontos (a flag experimental_interna_emusys e calculada 2x na funcao:
-- CTE eventos [detalhe] e CTE raw_por_unidade [resumo agregado]).

CREATE OR REPLACE FUNCTION public.get_conciliacao_experimentais_v2(p_unidade_id uuid, p_ano integer, p_mes integer, p_periodo text DEFAULT 'mensal'::text, p_data date DEFAULT NULL::date)
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
    end as fim_exclusivo
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
    coalesce(raw_emusys.presenca_raw_confirmada, false) as presenca_raw_confirmada,
    coalesce(raw_emusys.falta_raw_confirmada, false) as falta_raw_confirmada,
    raw_emusys.emusys_raw_ids,
    exists (
      select 1
      from public.lead_experimentais le_reagendada
      where le_reagendada.lead_id = le.lead_id
        and le_reagendada.id <> le.id
        and le_reagendada.data_experimental > le.data_experimental
        and lower(coalesce(le_reagendada.status, '')) = 'experimental_agendada'
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
  left join lateral (
    select
      bool_or(
        lower(coalesce(r.presenca_emusys, '')) = 'presente'
        or r.situacao_operacional in ('presente', 'matriculado')
      ) as presenca_raw_confirmada,
      bool_or(
        lower(coalesce(r.presenca_emusys, '')) in ('ausente', 'faltou')
        or r.situacao_operacional = 'faltou'
      ) as falta_raw_confirmada,
      array_agg(r.id order by r.id) as emusys_raw_ids,
      bool_or(
        nullif(r.payload #>> '{aluno,id_lead}', '') = '0'
        and (
          case
            when nullif(r.payload #>> '{aluno,id_aluno}', '') ~ '^[0-9]+$'
            then (r.payload #>> '{aluno,id_aluno}')::bigint
            else 0
          end
        ) > 0
        -- P10C: so e interno se a pessoa NAO converteu no mes (sem matricula nova E sem passaporte)
        and not exists (
          select 1 from public.alunos a_conv
          where a_conv.id = r.aluno_id
            and a_conv.unidade_id = r.unidade_id
            and (
              (a_conv.data_matricula >= (select inicio::date from periodo)
               and a_conv.data_matricula < (select fim_exclusivo::date from periodo))
              or coalesce(a_conv.valor_passaporte, 0) > 0
            )
        )
      ) as experimental_interna_emusys
    from public.emusys_experimentais_raw r
    where r.unidade_id = le.unidade_id
      and r.data_aula = le.data_experimental
      and (
        r.lead_experimental_id = le.id
        or (le.lead_id is not null and r.lead_id = le.lead_id)
        or (
          le.emusys_lead_id is not null
          and (
            case
              when nullif(r.payload #>> '{aluno,id_lead}', '') ~ '^[0-9]+$'
              then (r.payload #>> '{aluno,id_lead}')::bigint
              else null
            end
          ) = le.emusys_lead_id
          and (
            r.horario_aula = le.horario_experimental
            or r.horario_aula is null
            or le.horario_experimental is null
          )
        )
        or (
          nullif(r.payload #>> '{aluno,id_lead}', '') = '0'
          and lower(trim(coalesce(r.aluno_nome, ''))) = lower(trim(coalesce(le.nome_aluno, '')))
          and (
            r.horario_aula = le.horario_experimental
            or r.horario_aula is null
            or le.horario_experimental is null
          )
        )
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
    )::int as raw_conversoes_exp_mat
  from unidades_alvo ua
  left join public.emusys_experimentais_raw r
    on r.unidade_id = ua.unidade_id
   and r.data_aula >= (select inicio::date from periodo)
   and r.data_aula < (select fim_exclusivo::date from periodo)
  left join lateral (
    select (
      nullif(r.payload #>> '{aluno,id_lead}', '') = '0'
      and (
        case
          when nullif(r.payload #>> '{aluno,id_aluno}', '') ~ '^[0-9]+$'
          then (r.payload #>> '{aluno,id_aluno}')::bigint
          else 0
        end
      ) > 0
      -- P10C: so e interno se a pessoa NAO converteu no mes (sem matricula nova E sem passaporte)
      and not exists (
        select 1 from public.alunos a_conv
        where a_conv.id = r.aluno_id
          and a_conv.unidade_id = r.unidade_id
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
    left join public.lead_experimentais_decisoes_humanas dh
      on dh.lead_experimental_id = le_raw.id
    where le_raw.unidade_id = r.unidade_id
      and le_raw.data_experimental = r.data_aula
      and (
        r.lead_experimental_id = le_raw.id
        or (le_raw.lead_id is not null and r.lead_id = le_raw.lead_id)
        or (
          le_raw.emusys_lead_id is not null
          and (
            case
              when nullif(r.payload #>> '{aluno,id_lead}', '') ~ '^[0-9]+$'
              then (r.payload #>> '{aluno,id_lead}')::bigint
              else null
            end
          ) = le_raw.emusys_lead_id
          and (
            r.horario_aula = le_raw.horario_experimental
            or r.horario_aula is null
            or le_raw.horario_experimental is null
          )
        )
        or (
          nullif(r.payload #>> '{aluno,id_lead}', '') = '0'
          and lower(trim(coalesce(r.aluno_nome, ''))) = lower(trim(coalesce(le_raw.nome_aluno, '')))
          and (
            r.horario_aula = le_raw.horario_experimental
            or r.horario_aula is null
            or le_raw.horario_experimental is null
          )
        )
      )
    order by
      case
        when r.lead_experimental_id = le_raw.id then 1
        when le_raw.emusys_lead_id is not null then 2
        when le_raw.lead_id is not null then 3
        else 4
      end,
      le_raw.id desc
    limit 1
  ) raw_decisao on true
  left join public.alunos a
    on a.id = r.aluno_id
   and a.unidade_id = r.unidade_id
  group by ua.unidade_id
),
classificados_por_unidade as (
  select
    ua.unidade_id,
    count(c.*) filter (where c.incluir_taxa_exp_mat and c.contar_taxa_exp_mat)::int as conversoes_classificadas
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
    'status', 'p10c_raw_emusys_comercial_sem_remanejamento_exceto_convertidos',
    'denominador', 'experimental realizada no raw Emusys, removendo remanejamento interno de aluno ja cadastrado que NAO converteu no mes e decisoes humanas que nao entram no denominador comercial; fallback para conciliacao/funil',
    'numerador', 'maior sinal confiavel entre decisao/funil conciliado e raw_aluno_id matriculado',
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

revoke all on function public.get_conciliacao_experimentais_v2(uuid, integer, integer, text, date) from public, anon;
grant execute on function public.get_conciliacao_experimentais_v2(uuid, integer, integer, text, date) to authenticated, service_role;

comment on function public.get_conciliacao_experimentais_v2(uuid, integer, integer, text, date) is
  'Conciliacao v2 de experimentais (P10C). Usa raw Emusys como fonte canonica, separa remanejamento interno de aluno ja cadastrado, MAS mantem no funil comercial quem converteu no mes (matricula nova ou passaporte); e decisoes humanas excluidas do denominador comercial.';
