-- Remove os triggers incrementais bugados que inflavam dados_comerciais e origem_leads
-- a cada UPDATE em leads (contavam +1 sem descontar o estado anterior -> inflacao 3-17x confirmada).
-- O unico consumidor vivo (alerta CONVERSAO_BAIXA) ja foi migrado para calculo vivo na migration anterior.
--
-- ROLLBACK (se necessario):
--   CREATE TRIGGER tr_sync_leads_comerciais AFTER INSERT OR DELETE OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION sync_leads_to_dados_comerciais();
--   CREATE TRIGGER tr_sync_leads_origem AFTER INSERT OR DELETE OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION sync_leads_to_origem_leads();
-- (as funcoes sync_leads_to_* permanecem no banco, apenas orfas)

DROP TRIGGER IF EXISTS tr_sync_leads_comerciais ON public.leads;
DROP TRIGGER IF EXISTS tr_sync_leads_origem ON public.leads;
