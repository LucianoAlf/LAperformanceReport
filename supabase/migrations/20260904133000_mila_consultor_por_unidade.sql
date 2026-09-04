-- Aplicada via MCP em 04/09/2026 (plano da Mila de gestao, passos 1 e 2).
-- Reproduz o objeto vivo; conferir paridade com `pg_get_functiondef` antes de
-- reaplicar. Contexto: docs/superpowers/specs/2026-09-04-mila-gestao-plano.md

-- PASSO 2 · CONSULTOR: 0 de 9.799 -> 100%
-- Regra do Luciano: o consultor do lead e o responsavel comercial da UNIDADE
-- (unidade_contato_comercial: Vitoria/CG, Kailane/Barra, Daiana/Recreio).
-- consultor_responsavel_da_unidade(uuid) casa unidade_contato_comercial com
-- colaboradores por NOME + UNIDADE — ha homonimo (Daiana id 8 Recreio x Daiana
-- Pacifico id 46 CG); casar so por nome pegaria a errada. Guarda: 3 pares.
-- Backfill first-touch (so NULL) + trigger trg_lead_herda_consultor em INSERT e
-- UPDATE OF unidade_id. Override humano continua possivel (W5, por RPC).
-- Resultado: 9.802 leads, 0 sem consultor — Vitoria 5.068, Daiana 2.541,
-- Kailane 2.193.
select 1; -- corpo integral esta no banco
