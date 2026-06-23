create or replace function public.get_conciliacao_experimentais_v2(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodo text default 'mensal'::text,
  p_data date default null::date
)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
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
      array_agg(r.id order by r.id) as emusys_raw_ids
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
      when e.decisao_humana in ('realizada_sem_matricula_confirmada', 'realizada_com_matricula_confirmada') then 'experimental_realizada_confirmada'
      when e.decisao_humana = 'experimental_faltou_confirmada' then 'experimental_faltou'
      when e.decisao_humana = 'duplicidade_reagendamento_ignorar' then 'ignorada_decisao_humana'
      when e.decisao_humana = 'matricula_direta_sem_experimental' then 'matricula_direta'
      when e.decisao_humana in ('responsavel_sem_aluno', 'pendente_cadastro_nao_encontrado', 'aluno_excluido_pos_matricula', 'revisar_manual') then 'pendente_conciliacao'
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
      when e.decisao_humana is not null then e.decisao_humana
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
      when e.decisao_humana in ('realizada_sem_matricula_confirmada', 'realizada_com_matricula_confirmada') then true
      when e.presenca_raw_confirmada then true
      when e.status_norm in ('experimental_realizada','convertido','matriculado') and e.aluno_taxa_id is not null and e.presenca_confirmada_taxa then true
      else false
    end as incluir_taxa_exp_mat,
    case
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
resumo_base as (
  select
    count(*) filter (where etapa_canonica = 'experimental_agendada')::int as experimentais_agendadas,
    count(*) filter (where etapa_canonica = 'experimental_realizada_confirmada')::int as experimentais_realizadas_confirmadas,
    count(*) filter (where etapa_canonica = 'experimental_faltou')::int as experimentais_faltaram,
    count(*) filter (where etapa_canonica = 'experimental_cancelada')::int as experimentais_canceladas,
    count(*) filter (where etapa_canonica = 'matricula_direta')::int as matriculas_diretas,
    count(*) filter (where etapa_canonica = 'ignorada_decisao_humana')::int as ignoradas_por_decisao,
    count(*) filter (where etapa_canonica = 'pendente_conciliacao')::int as pendentes_conciliacao,
    count(*) filter (where etapa_canonica = 'realizada_sem_presenca_confirmada')::int as realizadas_sem_presenca_confirmada,
    count(*) filter (where status_norm in ('experimental_realizada','convertido','matriculado'))::int as realizadas_status_operacional,
    count(*) filter (where decisao_humana is not null)::int as decisoes_humanas,
    count(*) filter (where contar_conversao_exp_mat = true)::int as conversoes_confirmadas_decisao,
    count(*) filter (where incluir_taxa_exp_mat)::int as denominador_taxa_exp_mat,
    count(*) filter (where incluir_taxa_exp_mat and contar_taxa_exp_mat)::int as conversoes_exp_mat_canonicas
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
      when rb.pendentes_conciliacao + rb.realizadas_sem_presenca_confirmada = 0 then 'liberada_p02w_raw_emusys'
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
    'status', 'p02w_conciliacao_raw_emusys',
    'denominador', 'experimental realizada confirmada por raw Emusys, presenca individual ou decisao humana',
    'numerador', 'denominador com aluno matriculado ativo ou decisao humana de conversao',
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
  'Conciliacao v2 de experimentais. Usa raw Emusys como confirmacao canonica de presenca/falta quando casa com lead_experimentais.';
