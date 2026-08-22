-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

-- aditivo: expõe a idade da pendência para o agente reconfirmar "pode" tardio
-- (preview das 14:30 não pode ser fechado por um "pode" solto lá pelas 19h sem checar).
create or replace function public.sol_caixa_pendencia_aguardando(p_chat_id text)
returns jsonb language sql stable security definer set search_path to 'pg_catalog','public' as $function$
  select case when p.id is null then null else jsonb_build_object(
    'id', p.id, 'tipo', p.tipo, 'unidade_id', p.unidade_id,
    'data', to_char(p.data_caixa,'YYYY-MM-DD'), 'preview_message_id', p.preview_message_id,
    'criado_em', to_char(p.criado_em at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'idade_min', floor(extract(epoch from (now() - p.criado_em))/60)::int) end
  from (select * from public.sol_caixa_abertura_pendente
        where chat_id = p_chat_id and status='aguardando'
          and data_caixa = (now() at time zone 'America/Sao_Paulo')::date
        order by criado_em desc limit 1) p;
$function$;
