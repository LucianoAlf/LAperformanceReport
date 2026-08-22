-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

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
    dh.motivo as decisao_motivo,
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
    ) as presenca_confirmada,
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
  left join public.professores p on p.id = le.professor_experimental_id
  left join public.cursos c on c.id = le.curso_interesse_id
  left join public.lead_experimentais_decisoes_humanas dh on dh.lead_experimental_id = le.id
  where le.data_experimental >= pr.inicio::date
    and le.data_experimental < pr.fim_exclusivo::date
),
classificados as (
  select
    e.*,
    case
      when e.decisao_humana = 'duplicidade_reagendamento_ignorar' then 'ignorada_decisao_humana'
      when e.decisao_humana = 'matricula_direta_sem_experimental' then 'matricula_direta'
      when e.decisao_humana in ('responsavel_sem_aluno','pendente_cadastro_nao_encontrado','aluno_excluido_pos_matricula') then 'pendente_conciliacao'
      when e.status_norm in ('cancelada','cancelado','experimental_cancelada') then 'experimental_cancelada'
      when e.status_norm in ('experimental_faltou','faltou','no_show','no-show') then 'experimental_faltou'
      when e.status_norm = 'experimental_agendada' then 'experimental_agendada'
      when e.status_norm in ('experimental_realizada','convertido','matriculado') and e.aluno_id is not null and e.presenca_confirmada then 'experimental_realizada_confirmada'
      when e.status_norm in ('experimental_realizada','convertido','matriculado') and e.aluno_id is null and e.sinal_conversao then 'pendente_conciliacao'
      when e.status_norm in ('experimental_realizada','convertido','matriculado') and not e.presenca_confirmada then 'realizada_sem_presenca_confirmada'
      else 'pendente_conciliacao'
    end as etapa_canonica,
    case
      when e.decisao_humana is not null then e.decisao_humana
      when e.status_norm in ('experimental_realizada','convertido','matriculado') and e.aluno_id is null and e.sinal_conversao then 'sem_aluno_vinculado_com_sinal_conversao'
      when e.status_norm in ('experimental_realizada','convertido','matriculado') and e.aluno_id is not null and not e.presenca_confirmada then 'aluno_vinculado_sem_presenca_experimental'
      when e.status_norm in ('experimental_realizada','convertido','matriculado') and not e.sinal_conversao then 'realizada_sem_conversao_aparente'
      when e.status_norm = 'experimental_agendada' then 'aguardando_aula'
      when e.status_norm in ('experimental_faltou','faltou','no_show','no-show') then 'falta_operacional'
      when e.status_norm in ('cancelada','cancelado','experimental_cancelada') then 'cancelada_operacional'
      else 'revisar_manual'
    end as motivo_fila
  from eventos e
),
resumo as (
  select
    count(*) filter (where etapa_canonica = 'experimental_agendada')::int as experimentais_agendadas,
    count(*) filter (where etapa_canonica = 'experimental_realizada_confirmada')::int as experimentais_realizadas_confirmadas,
    count(*) filter (where etapa_canonica = 'experimental_faltou')::int as experimentais_faltaram,
    count(*) filter (where etapa_canonica = 'experimental_cancelada')::int as experimentais_canceladas,
    count(*) filter (where etapa_canonica = 'matricula_direta')::int as matriculas_diretas,
    count(*) filter (where etapa_canonica = 'ignorada_decisao_humana')::int as ignoradas_por_decisao,
    count(*) filter (where etapa_canonica = 'pendente_conciliacao')::int as pendentes_conciliacao,
    count(*) filter (where etapa_canonica = 'realizada_sem_presenca_confirmada')::int as realizadas_sem_presenca_confirmada,
    count(*) filter (where status_norm in ('experimental_realizada','convertido','matriculado'))::int as realizadas_status_operacional
  from classificados
),
filas as (
  select *
  from classificados
  where etapa_canonica in (
    'pendente_conciliacao',
    'realizada_sem_presenca_confirmada',
    'matricula_direta',
    'ignorada_decisao_humana'
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
  'items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', f.id,
      'lead_id', f.lead_id,
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
      'presenca_confirmada', f.presenca_confirmada,
      'sinal_conversao', f.sinal_conversao,
      'decisao_humana', f.decisao_humana,
      'incluir_denominador_exp_mat', f.incluir_denominador_exp_mat,
      'decisao_motivo', f.decisao_motivo
    ) order by f.data_experimental desc nulls last, f.horario_experimental desc nulls last, f.id desc)
    from filas f
  ), '[]'::jsonb)
);
$function$;

revoke execute on function public.get_conciliacao_experimentais_v2(uuid, integer, integer, text, date) from public;
revoke execute on function public.get_conciliacao_experimentais_v2(uuid, integer, integer, text, date) from anon;
grant execute on function public.get_conciliacao_experimentais_v2(uuid, integer, integer, text, date) to authenticated, service_role;
