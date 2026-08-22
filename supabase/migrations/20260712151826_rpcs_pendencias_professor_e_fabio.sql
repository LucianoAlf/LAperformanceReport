-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Entrega HIBRIDA (decisao do Alf): agrupado por AULA, com os ALUNOS dentro.
-- "3 aulas · 7 alunos sem registro" — o professor pensa por aula, o prontuario e por aluno.

-- 1) Porta do APP (professor logado)
create or replace function public.app_minhas_pendencias(p_incluir_passivo boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = public
as $function$
declare
  v_prof integer := public.fn_professor_do_usuario();
  v_res  jsonb;
begin
  if v_prof is null then raise exception 'sem_professor_vinculado' using errcode='42501'; end if;
  return public.fn_pendencias_do_professor(v_prof, p_incluir_passivo);
end $function$;

-- 2) A logica (compartilhada com o Fabio)
create or replace function public.fn_pendencias_do_professor(
  p_professor_id integer,
  p_incluir_passivo boolean default false
)
returns jsonb
language sql stable security definer set search_path = public
as $function$
  with p as (
    select * from public.vw_registro_pendencia
     where professor_id = p_professor_id
       and (p_incluir_passivo or cobravel)
  ), por_aula as (
    select
      p.aula_ancora_id, p.data_aula, p.data_hora_inicio,
      to_char(p.data_hora_inicio at time zone 'America/Sao_Paulo','HH24:MI') as hora,
      p.curso_nome, p.turma_nome, p.tipo,
      max(p.dias_em_atraso) as dias_em_atraso,
      bool_and(p.chamada_feita) as chamada_feita,
      count(*) as n_alunos,
      jsonb_agg(jsonb_build_object(
        'aluno_id', p.aluno_id,
        'nome', p.aluno_nome,
        'primeiro_nome', p.aluno_primeiro_nome,
        'aula_alvo_id', p.aula_alvo_id
      ) order by p.aluno_nome) as alunos
    from p group by 1,2,3,4,5,6,7
  )
  select jsonb_build_object(
    'professor_id', p_professor_id,
    'total_aulas',  (select count(*) from por_aula),
    'total_alunos', (select coalesce(sum(n_alunos),0) from por_aula),
    'pior_atraso_dias', (select coalesce(max(dias_em_atraso),0) from por_aula),
    'aulas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'aula_id', a.aula_ancora_id,
        'data', a.data_aula,
        'hora', a.hora,
        'curso', a.curso_nome,
        'turma', a.turma_nome,
        'dias_em_atraso', a.dias_em_atraso,
        'chamada_feita', a.chamada_feita,
        'n_alunos', a.n_alunos,
        'alunos', a.alunos
      ) order by a.data_hora_inicio desc)
      from por_aula a), '[]'::jsonb)
  )
$function$;

revoke all on function public.fn_pendencias_do_professor(integer,boolean) from public, anon, authenticated;
grant execute on function public.fn_pendencias_do_professor(integer,boolean) to service_role;

revoke all on function public.app_minhas_pendencias(boolean) from public, anon;
grant execute on function public.app_minhas_pendencias(boolean) to authenticated;

-- 3) Porta do FABIO (cron/WhatsApp). So o que e cobravel — a anistia e estrutural aqui.
create or replace function public.fabio_pendencias_professor(p_professor_id integer)
returns jsonb
language sql stable security definer set search_path = public
as $function$
  select public.fn_pendencias_do_professor(p_professor_id, false)   -- nunca o passivo
$function$;

comment on function public.fabio_pendencias_professor(integer) is
  'Pendencias COBRAVEIS de um professor (pos linha de corte). O Fabio nao consegue cobrar o passivo — a anistia e estrutural, nao instrucao de prompt.';

revoke all on function public.fabio_pendencias_professor(integer) from public, anon, authenticated;
grant execute on function public.fabio_pendencias_professor(integer) to service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname='fabio_agent') then
    execute 'grant execute on function public.fabio_pendencias_professor(integer) to fabio_agent';
  end if;
end $$;
