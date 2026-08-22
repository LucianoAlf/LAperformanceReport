-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

-- Sol Caixa V3 Gate B real/read-only boundary.
-- Objetivo: criar papel-capacidade dedicado de leitura do dominio Caixa
-- e remover escritas fora do caixa do login legado sol_acesso_restrito.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sol_caixa_readonly') THEN
    CREATE ROLE sol_caixa_readonly NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT;
  END IF;
END $$;

GRANT sol_caixa_readonly TO sol_acesso_restrito;
GRANT USAGE ON SCHEMA public TO sol_caixa_readonly;

-- Fechar escrita fora do caixa no login usado pela Sol para leitura restrita.
REVOKE INSERT ON TABLE public.admin_conversas FROM sol_acesso_restrito;
REVOKE INSERT ON TABLE public.admin_mensagens FROM sol_acesso_restrito;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.bi_ai_query_playbooks FROM sol_acesso_restrito;

-- Leituras seguras necessárias ao Gate B real/read-only.
GRANT SELECT ON TABLE
  public.unidades,
  public.alunos,
  public.colaboradores,
  public.sol_permissoes,
  public.caixas_diarios,
  public.caixa_movimentacoes,
  public.caixa_categorias,
  public.caixa_reaberturas_log,
  public.caixa_financeiro_grupos_whatsapp,
  public.sol_caixa_unidade_policy,
  public.sol_caixa_autorizados,
  public.sol_caixa_ingestao_recebimentos,
  public.sol_caixa_lancamento_auditoria,
  public.sol_caixa_abertura_pendente,
  public.emusys_faturas,
  public.vw_whatsapp_caixas_departamento
TO sol_caixa_readonly;

-- Helpers de leitura/autorizacao. Mutadoras ficam explicitamente sem EXECUTE.
GRANT EXECUTE ON FUNCTION public.sol_caixa_quem_e(text, uuid) TO sol_caixa_readonly;
GRANT EXECUTE ON FUNCTION public.sol_caixa_resumo_do_dia(uuid, date) TO sol_caixa_readonly;
GRANT EXECUTE ON FUNCTION public.sol_caixa_ator_ok(uuid, text) TO sol_caixa_readonly;
GRANT EXECUTE ON FUNCTION public.sol_caixa_aluno_por_responsavel(uuid, text) TO sol_caixa_readonly;
GRANT EXECUTE ON FUNCTION public.sol_caixa_identificar_por_pagador(uuid, text) TO sol_caixa_readonly;
GRANT EXECUTE ON FUNCTION public.sol_caixa_responsavel_aluno(uuid, text) TO sol_caixa_readonly;
GRANT EXECUTE ON FUNCTION public.sol_caixa_parcela_canonica(uuid, text, numeric, date) TO sol_caixa_readonly;
GRANT EXECUTE ON FUNCTION public.sol_caixa_ja_lancado_hoje(uuid, numeric, text, date) TO sol_caixa_readonly;
GRANT EXECUTE ON FUNCTION public.sol_caixa_dados_abertura(uuid, date) TO sol_caixa_readonly;
GRANT EXECUTE ON FUNCTION public.sol_caixa_dados_fechamento(uuid) TO sol_caixa_readonly;
GRANT EXECUTE ON FUNCTION public.sol_caixa_inadimplentes(uuid, integer, numeric, numeric, integer, integer) TO sol_caixa_readonly;
GRANT EXECUTE ON FUNCTION public.sol_caixa_pendencia_aguardando(text) TO sol_caixa_readonly;

REVOKE EXECUTE ON FUNCTION public.sol_caixa_lancar_recebimento(jsonb) FROM sol_caixa_readonly;
REVOKE EXECUTE ON FUNCTION public.sol_caixa_lancar_saida(jsonb) FROM sol_caixa_readonly;
REVOKE EXECUTE ON FUNCTION public.sol_caixa_corrigir_forma_recebimento(jsonb) FROM sol_caixa_readonly;
REVOKE EXECUTE ON FUNCTION public.sol_caixa_fechar(jsonb) FROM sol_caixa_readonly;
REVOKE EXECUTE ON FUNCTION public.sol_caixa_abrir(jsonb) FROM sol_caixa_readonly;
REVOKE EXECUTE ON FUNCTION public.sol_caixa_ingestao_registrar(jsonb) FROM sol_caixa_readonly;
REVOKE EXECUTE ON FUNCTION public.sol_caixa_pendencia_criar(jsonb) FROM sol_caixa_readonly;
REVOKE EXECUTE ON FUNCTION public.sol_caixa_pendencia_resolver(uuid, text, text) FROM sol_caixa_readonly;

COMMENT ON ROLE sol_caixa_readonly IS 'Sol Caixa V3 capability role: read-only boundary for Gate B real. No direct financial write and no WhatsApp side effects.';
