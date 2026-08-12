-- Remove o overload de 10 args da upsert_lead.
--
-- A migration 20260811160000 fez CREATE OR REPLACE com um parâmetro a mais
-- (p_data_nascimento date DEFAULT NULL). Lista de parâmetros diferente NÃO substitui:
-- criou uma segunda função e deixou a antiga órfã. Como a nova tem DEFAULT no 11º
-- argumento, uma chamada com 10 args casa nas DUAS e o Postgres recusa:
--
--   function upsert_lead(unknown, ..., boolean, date) is not unique
--
-- Efeito em produção: o nó "Upsert Lead1" do workflow n8n EB0LibpOJCLhKp7M falhou em
-- 100% das execuções de 11/08 15:01 a 12/08, e o agente-webhook (campanhas) parou de
-- inserir lead no funil em silêncio (não checa o error da RPC).
--
-- A de 11 args é superconjunto da de 10, conferido linha a linha: além do
-- data_nascimento, só mudou o email para não sobrescrever com string vazia e ganhou
-- dois aliases de canal (FAMILY -> Indicação, INSTAGRAM -> Instagram). O v_action já
-- foi realinhado para 'inserted' em 20260812133837.
--
-- Com a antiga fora, chamadas de 10 args passam a resolver na de 11 (p_data_nascimento
-- cai no DEFAULT NULL) — n8n e campanhas voltam sem alterar workflow nem edge.
-- Validado com uma chamada de 10 args posicionais em transação abortada:
-- devolveu {"action": "inserted", "lead_id": 12702} e nada persistiu.
drop function if exists public.upsert_lead(
  text, text, text, uuid, text, text, integer, text, boolean, date
);
