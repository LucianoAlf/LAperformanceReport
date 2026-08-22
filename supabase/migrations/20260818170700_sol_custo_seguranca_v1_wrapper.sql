-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

-- Leitura read-only do custo do segurança p/ a Sol. caixa_movimentacoes tem RLS que barra a role dela.
-- SECURITY DEFINER (roda como postgres) fura a RLS SÓ para este SELECT escopado em categoria='seguranca'.
-- Não enfraquece a policy da tabela; não permite escrita.
create or replace function public.sol_custo_seguranca_v1(
  p_unidade_id uuid default null::uuid,
  p_desde date default null::date
)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
    'fonte', 'caixa_movimentacoes (categoria=seguranca)',
    'unidade_id', p_unidade_id,
    'desde', p_desde,
    'aviso', 'Livro-caixa pode estar incompleto. NAO e folha/contrato (dominio Maria/Super Folha). Nao somar o periodo cego.',
    'total', coalesce(sum(valor), 0),
    'quantidade', count(*),
    'itens', coalesce(jsonb_agg(jsonb_build_object(
        'data', data_movimento, 'valor', valor, 'descricao', descricao, 'forma', forma_pagamento
      ) order by data_movimento desc), '[]'::jsonb)
  )
  from caixa_movimentacoes
  where categoria = 'seguranca'
    and (p_unidade_id is null or unidade_id = p_unidade_id)
    and (p_desde is null or data_movimento >= p_desde);
$function$;

revoke all on function public.sol_custo_seguranca_v1(uuid, date) from public;
grant execute on function public.sol_custo_seguranca_v1(uuid, date) to sol_acesso_restrito, service_role;
