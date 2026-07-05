-- Aposenta as tabelas zumbi (escritas pelo trigger bugado ja removido, sem leitor vivo restante).
-- Dados preservados integralmente — rename apenas sinaliza aposentadoria.
-- ROLLBACK: ALTER TABLE dados_comerciais_legado RENAME TO dados_comerciais; ALTER TABLE origem_leads_legado RENAME TO origem_leads;

ALTER TABLE public.dados_comerciais RENAME TO dados_comerciais_legado;
ALTER TABLE public.origem_leads RENAME TO origem_leads_legado;

COMMENT ON TABLE public.dados_comerciais_legado IS 'LEGADO (aposentada 2026-07-05). Agregacao comercial mensal inflada por trigger incremental bugado (3-17x). Substituida por calculo vivo de leads no Dashboard e alerta CONVERSAO_BAIXA. Historico canonico mensal = dados_mensais + fechamento_mensal_snapshots. Nao usar.';
COMMENT ON TABLE public.origem_leads_legado IS 'LEGADO (aposentada 2026-07-05). Agregacao por canal inflada pelo mesmo trigger bugado. Nunca teve leitor no frontend. Nao usar.';

NOTIFY pgrst, 'reload schema';
