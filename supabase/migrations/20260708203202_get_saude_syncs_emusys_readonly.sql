-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Função SOMENTE LEITURA para o módulo Saúde das Automações.
-- Calcula o status REAL de cada sync Emusys pela idade da última execução
-- (evidência que cada sync grava numa tabela), em vez de confiar no
-- "succeeded" enganoso do pg_cron (net.http_post fire-and-forget).
-- Não escreve nada, não altera dados, não toca em sync/cron.

create or replace function public.get_saude_syncs_emusys()
returns table(
  sync_tipo text,
  unidade_id uuid,
  unidade_codigo text,
  unidade_nome text,
  ultima_execucao timestamptz,
  idade_horas numeric,
  tolerancia_horas numeric,
  status_real text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with cfg as (
    select * from (values
      ('matriculas', 30::numeric),
      ('presenca',   50::numeric),
      ('professores',192::numeric),
      ('faturas',    30::numeric)
    ) as t(sync_tipo, tol)
  ),
  cod as (
    select id, nome,
      case id
        when '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid then 'cg'
        when '95553e96-971b-4590-a6eb-0201d013c14d'::uuid then 'recreio'
        when '368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid then 'barra'
      end as codigo
    from public.unidades
  ),
  matriculas as (
    select 'matriculas'::text as sync_tipo, j.unidade_id, max(j.ultima_sincronizacao_emusys) as ultima
    from public.aluno_jornada_matricula_disciplina j
    where j.fonte_ultima_atualizacao = 'sync-matriculas-emusys'
    group by j.unidade_id
  ),
  presenca as (
    select 'presenca'::text as sync_tipo, l.unidade_id, max(l.executado_em) as ultima
    from public.emusys_sync_log l
    group by l.unidade_id
  ),
  professores as (
    select 'professores'::text as sync_tipo, null::uuid as unidade_id, max(created_at) as ultima
    from public.professores_sync_log
  ),
  faturas as (
    select 'faturas'::text as sync_tipo, null::uuid as unidade_id, max(synced_at) as ultima
    from public.emusys_faturas
  ),
  base as (
    select * from matriculas
    union all select * from presenca
    union all select * from professores
    union all select * from faturas
  )
  select
    b.sync_tipo,
    b.unidade_id,
    c.codigo as unidade_codigo,
    coalesce(c.nome, 'Global') as unidade_nome,
    b.ultima as ultima_execucao,
    case when b.ultima is null then null
         else round(extract(epoch from (now() - b.ultima))/3600.0, 1) end as idade_horas,
    cfg.tol as tolerancia_horas,
    case
      when b.sync_tipo = 'faturas' then 'sem_cron'
      when b.ultima is null then 'nunca'
      when extract(epoch from (now() - b.ultima))/3600.0 <= cfg.tol then 'ok'
      else 'atrasado'
    end as status_real
  from base b
  join cfg on cfg.sync_tipo = b.sync_tipo
  left join cod c on c.id = b.unidade_id;
$function$;

revoke all on function public.get_saude_syncs_emusys() from public, anon;
grant execute on function public.get_saude_syncs_emusys() to authenticated;
