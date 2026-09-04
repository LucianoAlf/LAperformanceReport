-- Aplicada via MCP em 04/09/2026 (plano da Mila de gestao, passo 3). Corpo
-- integral vive no banco; conferir com pg_get_functiondef antes de reaplicar.
-- Contexto: docs/superpowers/specs/2026-09-04-mila-gestao-plano.md

-- RETURN QUERY e ESTRITO no tipo: leads.nome e varchar(255) e a funcao declara
-- text. Mesma armadilha do canais_origem.nome — o CREATE passa, o banco recusa
-- na 1a chamada. Cast ::text nos 4 ramos de mila_autoriza_lead.
select 1;
