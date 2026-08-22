-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

create or replace function public.sol_caixa_dados_abertura(p_unidade_id uuid, p_data date default null)
returns jsonb language sql stable security definer set search_path to 'pg_catalog','public' as $fn$
  select jsonb_build_object(
    'unidadeNome', (select nome from public.unidades where id=p_unidade_id),
    'data', to_char(coalesce(p_data,(now() at time zone 'America/Sao_Paulo')::date),'DD/MM/YYYY'),
    'data_iso', to_char(coalesce(p_data,(now() at time zone 'America/Sao_Paulo')::date),'YYYY-MM-DD'),
    'saldoInicial', coalesce((
       select saldo_final_conferido from public.caixas_diarios
       where unidade_id=p_unidade_id and data_caixa < coalesce(p_data,(now() at time zone 'America/Sao_Paulo')::date)
         and status='fechado' order by data_caixa desc limit 1), 0),
    'caixa_id_aberto', (select id from public.caixas_diarios
       where unidade_id=p_unidade_id and data_caixa=coalesce(p_data,(now() at time zone 'America/Sao_Paulo')::date) and status='aberto' limit 1),
    'ja_aberto', exists(select 1 from public.caixas_diarios
       where unidade_id=p_unidade_id and data_caixa=coalesce(p_data,(now() at time zone 'America/Sao_Paulo')::date) and status='aberto'),
    'ja_existe', exists(select 1 from public.caixas_diarios
       where unidade_id=p_unidade_id and data_caixa=coalesce(p_data,(now() at time zone 'America/Sao_Paulo')::date))
  );
$fn$;
