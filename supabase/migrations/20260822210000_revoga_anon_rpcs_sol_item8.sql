-- Revokes dos itens 1-3 da auditoria de permissões (item 8 do roadmap V3 da Sol).
-- Decisão do Alf, 2026-08-22, após confirmação do Alfredo e da Sol de que o runtime
-- Hermes chama o PostgREST com service_role (medido no caixa-financeiro.cjs vivo:
-- claim service_role em apikey + Authorization) — revogar anon não derruba a Sol.
--
-- ⚠️ O MAPA DE CONSUMIDORES MUDOU O PLANO — "parece backend-only" não é critério:
-- `sol_hermes_caixa_validate`/`caixa_enqueue` são chamadas PELO BROWSER em
-- CaixaWhatsAppPreview.tsx, e `sol_hermes_report_enqueue` em ModalRelatorio.tsx e
-- ComercialPage.tsx (supabase.rpc com JWT do usuário = authenticated). Revogar
-- authenticated delas quebraria a UI do caixa e o envio de relatórios. Nessas três,
-- só o anon cai.
--
-- O que cada revoke fecha (exposição medida em 22/08):
--   1. `sol_kpis_alunos_v1` devolvia 4,3 KB de KPIs para anon (wrapper escala para
--      service_role por dentro, sem guard). Sem consumidor browser/edge → anon E
--      authenticated fora. Idem `sol_custo_seguranca_v1` (mesma família).
--   2. Fila Hermes: anon podia enfileirar (spam/poluição). anon fora em todas;
--      authenticated fica só nas 3 com consumidor browser; `report_error_retryavel`
--      e `report_watchdog` (worker/cron, service_role/postgres) perdem os dois.
--   3. `get_faturas_alunos_financeiro_v1`: o guard interno JÁ barra anon (testado —
--      "papel nao autorizado"), este revoke é defesa em profundidade. authenticated
--      fica: é a fonte do browser em /app/faturas (contrato, faturasAlunosFinanceiras.ts).
--   Higiene: `sol_caixa_ator_ok` e `sol_tel_chave` perdem anon; `sol_registrar_
--   divergencia` (escrita) perde authenticated — nenhum consumidor browser/edge.
--
-- ⚠️ NADA das funções V3 fail-closed é tocado; ledger intacto (pedido do Alfredo).
-- ⚠️ Isto NÃO fecha o item 8: fica aberto o gate pré-STRICT do Alfredo — tirar a
--    service_role do bridge (relay com allowlist OU credencial própria de
--    sol_acesso_restrito), senão a allowlist de 46 RPCs é convenção, não enforcement.
--    Só depois disso a redução dos 421 SELECTs tem efeito real.

-- 1. Wrappers sem guard, sem consumidor browser: anon + authenticated fora
revoke execute on function public.sol_kpis_alunos_v1(uuid, integer, integer) from anon, authenticated;
revoke execute on function public.sol_custo_seguranca_v1(uuid, date) from anon, authenticated;

-- 2. Fila Hermes
revoke execute on function public.sol_hermes_caixa_enqueue(uuid, text) from anon;
revoke execute on function public.sol_hermes_caixa_validate(uuid) from anon;
revoke execute on function public.sol_hermes_report_enqueue(text, text, text, text, text) from anon;
revoke execute on function public.sol_hermes_report_error_retryavel(text) from anon, authenticated;
revoke execute on function public.sol_hermes_report_watchdog(integer, integer, integer, integer) from anon, authenticated;

-- 3. Canônica de faturas: anon fora (guard já barra; higiene), authenticated fica (browser)
revoke execute on function public.get_faturas_alunos_financeiro_v1(uuid, integer, integer, text, text, date) from anon;

-- Higiene
revoke execute on function public.sol_caixa_ator_ok(uuid, text) from anon;
revoke execute on function public.sol_tel_chave(text) from anon;
revoke execute on function public.sol_registrar_divergencia(integer, uuid, text, text, text, text, jsonb, jsonb, text) from authenticated;

-- ⚠️ Em 3 funções o EXECUTE de anon vinha de PUBLIC (`=X/postgres` na ACL), então o
-- revoke nominal de anon acima não surtia efeito — has_function_privilege('anon')
-- continuava true. O revoke certo é FROM PUBLIC (os grants nominais que ficam —
-- authenticated/service_role/sol_* — já estavam na ACL). Verificado pós-revoke:
-- anon=false, authenticated=true nas três.
revoke execute on function public.get_faturas_alunos_financeiro_v1(uuid, integer, integer, text, text, date) from public;
revoke execute on function public.sol_caixa_ator_ok(uuid, text) from public;
revoke execute on function public.sol_tel_chave(text) from public;
