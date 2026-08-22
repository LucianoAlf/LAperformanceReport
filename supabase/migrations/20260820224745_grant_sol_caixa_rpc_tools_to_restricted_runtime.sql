-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

-- Libera ferramentas/RPCs especificas do dominio Caixa para o runtime restrito da Sol.
-- Nao concede SELECT/INSERT/UPDATE/DELETE direto em tabelas.
-- A autorizacao operacional e: evento veio de grupo financeiro oficial da unidade
-- + policy autoriza_qualquer_membro=true + auditoria/idempotencia dentro das RPCs.

grant execute on function public.sol_caixa_ator_ok(uuid, text) to sol_acesso_restrito;
grant execute on function public.sol_caixa_ator_operacao_ok(uuid, text, text) to sol_acesso_restrito;
grant execute on function public.sol_caixa_grupo_operacao_ok(uuid, text, text) to sol_acesso_restrito;

grant execute on function public.sol_caixa_abrir(jsonb) to sol_acesso_restrito;
grant execute on function public.sol_caixa_fechar(jsonb) to sol_acesso_restrito;
grant execute on function public.sol_caixa_lancar_recebimento(jsonb) to sol_acesso_restrito;
grant execute on function public.sol_caixa_lancar_saida(jsonb) to sol_acesso_restrito;
grant execute on function public.sol_caixa_corrigir_forma_recebimento(jsonb) to sol_acesso_restrito;
grant execute on function public.sol_caixa_buscar_lancamento_para_correcao(jsonb) to sol_acesso_restrito;
grant execute on function public.sol_caixa_ingestao_registrar(jsonb) to sol_acesso_restrito;

grant execute on function public.sol_caixa_casar_parcela(uuid, text, numeric, text) to sol_acesso_restrito;
grant execute on function public.sol_caixa_parcela_canonica(uuid, text, numeric, date) to sol_acesso_restrito;
grant execute on function public.sol_caixa_responsavel_aluno(uuid, text) to sol_acesso_restrito;
grant execute on function public.sol_caixa_aluno_por_responsavel(uuid, text) to sol_acesso_restrito;
grant execute on function public.sol_caixa_identificar_por_pagador(uuid, text) to sol_acesso_restrito;
grant execute on function public.sol_caixa_ja_lancado_hoje(uuid, numeric, text, date) to sol_acesso_restrito;
grant execute on function public.sol_caixa_resumo_do_dia(uuid, date) to sol_acesso_restrito;
grant execute on function public.sol_caixa_dados_abertura(uuid, date) to sol_acesso_restrito;
grant execute on function public.sol_caixa_dados_fechamento(uuid) to sol_acesso_restrito;
grant execute on function public.sol_caixa_inadimplentes(uuid, integer, numeric, numeric, integer, integer) to sol_acesso_restrito;
grant execute on function public.sol_caixa_quem_e(text, uuid) to sol_acesso_restrito;

grant execute on function public.sol_caixa_pendencia_aguardando(text) to sol_acesso_restrito;
grant execute on function public.sol_caixa_pendencia_criar(jsonb) to sol_acesso_restrito;
grant execute on function public.sol_caixa_pendencia_resolver(uuid, text, text) to sol_acesso_restrito;

grant execute on function public.sol_caixa_readonly_preflight_v3() to sol_acesso_restrito;
