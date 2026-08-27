-- ============================================================================
-- A chamada da Agenda volta a ser chamavel pela secretaria.
--
-- CONTEXTO. A migration `20260827030900_presenca_comando_overloads_compatibilidade`
-- criou os overloads com `p_request_id` e fechou as portas antigas:
--
--   -- Fechamento do bypass: apenas os overloads com request_id permanecem publicos.
--   revoke all on function public.app_registrar_chamada_agenda(jsonb)
--     from public, anon, authenticated;
--
-- O front NUNCA foi migrado para mandar `p_request_id` (Task 4.4 do plano
-- `2026-08-26-presenca-canonica-ponta-a-ponta`, que altera
-- src/components/App/Agenda/Chamada/useChamadaAcoes.ts, nao foi executada).
-- O PostgREST continua resolvendo para a assinatura de 1 argumento, que ficou
-- sem EXECUTE: a chamada morre em `42501 permission denied for function`.
-- Medido: `agenda_secretaria` grava 310-400 presencas/dia (e o canal principal
-- da rede, contra 2-7 do LA Teacher e 3-7 do Fabio) e hoje gravou ZERO.
--
-- POR QUE ISSO NAO E REABRIR O BYPASS DE PROPOSITO. O plano de 1.322 linhas
-- nao contem a palavra `revoke` nenhuma vez; ele manda o contrario -- "as
-- portas existentes recebem `p_request_id uuid` (...) e passam a delegar ao
-- protocolo duravel DURANTE O CUTOVER". Fechar a porta antes de o consumidor
-- adotar a nova inverteu a ordem do rollout: `presenca_comandos` tem ZERO
-- linhas, ou seja, a porta nova nunca foi exercitada em producao, e as 7
-- superficies de `presenca_rollout_config` seguem todas em `sombra`.
-- Alem disso o revoke quebrou o proprio rollback previsto (Task 10.4:
-- "rollback e alteracao da flag para `legado`"), que pressupoe a porta antiga
-- viva.
--
-- ESCOPO. Restaura EXATAMENTE o grant que existia e estava versionado desde
-- 11-12/08 (`20260811130000`, `20260811180000`, `20260812130000`,
-- `20260812180000`). Nao cria funcao, nao altera corpo, nao toca nos overloads
-- novos, nao mexe em `presenca_rollout_config`. As quatro continuam
-- `security definer` validando permissao por unidade la dentro -- o grant nao
-- abre porta nenhuma que nao estivesse aberta ontem.
--
-- O FECHAMENTO CORRETO vem depois da Task 4.4: front mandando `p_request_id`
-- (mesmo id reusado no retry, senao a idempotencia nao protege de nada),
-- validado em producao com linha em `presenca_comandos`, e so entao o revoke.
-- ============================================================================

grant execute on function public.app_registrar_chamada_agenda(jsonb)
  to authenticated;

grant execute on function public.app_marcar_presenca_professor_aula(integer, boolean)
  to authenticated;

grant execute on function public.app_registrar_presenca_professor_dia(
  integer, date, uuid, time without time zone, time without time zone)
  to authenticated;

grant execute on function public.app_remover_presenca_professor_dia(integer, date, uuid)
  to authenticated;
