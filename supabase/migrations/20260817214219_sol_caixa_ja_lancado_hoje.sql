-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

-- Duplicidade que importa é no CAIXA, não no Emusys (correção do Alf 17/08):
-- parcela "paga" no Emusys é o fluxo normal (cliente paga, Emusys baixa, comprovante chega
-- depois e a unidade lança no caixa). O que precisa de aviso é o mesmo recebimento entrar
-- DUAS VEZES no caixa do dia. Read-only.
create or replace function public.sol_caixa_ja_lancado_hoje(
  p_unidade_id uuid, p_valor numeric, p_aluno text default null, p_data date default null)
returns jsonb language sql stable security definer set search_path to 'public','pg_temp' as $function$
  with d as (select coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date) dia),
  cx as (select c.id from public.caixas_diarios c, d
          where c.unidade_id = p_unidade_id and c.data_caixa = d.dia limit 1),
  m as (
    select mv.valor, mv.descricao, mv.forma_pagamento,
           to_char(mv.created_at at time zone 'America/Sao_Paulo','HH24:MI') hora
    from public.caixa_movimentacoes mv, cx
    where mv.caixa_diario_id = cx.id
      and mv.tipo = 'entrada'
      and abs(mv.valor - p_valor) < 0.01
      and (p_aluno is null or unaccent(lower(coalesce(mv.descricao,''))) like
           '%' || unaccent(lower(split_part(btrim(p_aluno),' ',1))) || '%')
  )
  select jsonb_build_object(
    'ok', true,
    'ja_lancado', exists(select 1 from m),
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'valor', valor, 'descricao', descricao, 'forma', forma_pagamento, 'hora', hora)) from m), '[]'::jsonb));
$function$;
revoke all on function public.sol_caixa_ja_lancado_hoje(uuid, numeric, text, date) from public, anon, authenticated;
grant execute on function public.sol_caixa_ja_lancado_hoje(uuid, numeric, text, date) to service_role;
