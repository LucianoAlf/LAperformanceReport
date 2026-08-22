-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function public.maria_lareport_faltas_periodo(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date
)
returns table (
  aluno_id integer,
  nome text,
  unidade_id uuid,
  unidade_codigo text,
  curso_nome text,
  professor_nome text,
  total_aulas bigint,
  faltas bigint,
  presencas bigint,
  pct_presenca numeric,
  is_projeto_banda boolean
)
language sql
security definer
set search_path = public
as $$
  select
    f.aluno_id,
    f.nome,
    f.unidade_id,
    f.unidade_codigo,
    f.curso_nome,
    f.professor_nome,
    f.total_aulas,
    f.faltas,
    f.presencas,
    f.pct_presenca,
    f.is_projeto_banda
  from public.get_faltas_periodo(p_unidade_id, p_data_inicio, p_data_fim) f;
$$;

grant execute on function public.maria_lareport_faltas_periodo(uuid, date, date) to maria_lareport_rpc;
revoke execute on function public.get_faltas_periodo(uuid, date, date) from maria_lareport_rpc;

alter function public.get_kpis_experimentais_professor(integer, integer, uuid) security definer set search_path = public;
