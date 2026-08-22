-- Reverte os 2 grants dados em 20260822151500 que, sem saber, DESFAZIAM um hardening
-- deliberado do Caixa V3 da Sol. Decisão do Alf, 2026-08-22, após auditoria do
-- repositório da Sol (github.com/LucianoAlf/sol-openclaw-backup).
--
-- O QUE ACONTECEU: a auditoria de 22/08 encontrou `sol_caixa_corrigir_forma_recebimento`
-- e `sol_caixa_autorizar_payload_v1` sem EXECUTE para os papéis da Sol e leu isso como
-- grant esquecido. ERRADO: o ledger do V3 (`docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md` no
-- repo da Sol) registra a migration `20260821094101_sol_caixa_v3_disable_legacy_
-- corrigir_forma_rpc_for_sol` — o grant foi REVOGADO DE PROPÓSITO em 21/08, um dia antes,
-- como parte do fail-closed: no V3 toda mutação passa pelo validador de approval
-- (`sol_caixa_v3_validar_approval_v1` + consumo único em `sol_caixa_v3_approval_consumos_v1`),
-- e a `corrigir_forma_recebimento` é RPC LEGADA que atropela esse fluxo (validação própria,
-- sem approval). O STATUS-2026-08-21 lista "nao esta executavel por sol_acesso_restrito"
-- como item CONFIRMADO do desenho.
--
-- A Sol NÃO perde capacidade: corrigir a forma de um movimento passa pela
-- `sol_caixa_corrigir_movimento_v1` (V3, com approval), que segue com grant.
-- `autorizar_payload_v1` volta a ser só-interna (as 4 chamadoras são SECURITY DEFINER
-- e a alcançam sem grant) — alinhado ao least-privilege da migration `20260820213643`.
--
-- ⚠️ LIÇÃO (a mesma regra do projeto, agora com contra-exemplo próprio): "grant ausente"
-- não é sempre bug — pode ser decisão. Antes de conceder EXECUTE numa função sol_*,
-- conferir o ledger V3 no repo da Sol e o STATUS mais recente.
-- ⚠️ Os DEMAIS itens de 20260822151500 (colunas aluno_id/fatura_id, funções de lançamento
-- gravando o vínculo, revokes de anon/authenticated) NÃO são revertidos — não tocam a
-- cadeia de approval.

revoke execute on function public.sol_caixa_corrigir_forma_recebimento(jsonb) from sol_acesso_restrito;
revoke execute on function public.sol_caixa_autorizar_payload_v1(uuid, jsonb, text) from sol_acesso_restrito;
