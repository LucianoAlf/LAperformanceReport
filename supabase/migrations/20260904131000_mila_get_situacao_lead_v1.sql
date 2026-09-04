-- Aplicada via MCP em 04/09/2026 (plano da Mila de gestao, passos 1 e 2).
-- Reproduz o objeto vivo; conferir paridade com `pg_get_functiondef` antes de
-- reaplicar. Contexto: docs/superpowers/specs/2026-09-04-mila-gestao-plano.md

-- MILA DE GESTAO · bloco 4 (apoio ao time) · OPERACIONAL
-- get_situacao_lead_v1(p_solicitante_telefone, p_telefone_lead, p_nome_lead, p_lead_id)
-- A FICHA numa chamada: jornada (vw_jornada_lead_v1) + calor
-- (atendimento_conversa_estado) + sinais abertos (radar_sinais). Nada recalculado.
-- Escopo por quem_eh: lead de outra unidade devolve nao_encontrado_no_escopo —
-- a consultora nem descobre que ele existe. Nome com 2+ resultados devolve
-- `ambiguo` + candidatos: ambiguidade vira pergunta, nao sorteio.
-- Provado em 04/09: Daiana ve a Jullyane (Recreio); Hetiene (CG) nao aparece
-- para ela; "Graciele" volta 3 candidatas.
select 1; -- corpo integral esta no banco
