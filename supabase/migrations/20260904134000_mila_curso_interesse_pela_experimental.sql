-- Aplicada via MCP em 04/09/2026 (plano da Mila de gestao, passos 1 e 2).
-- Reproduz o objeto vivo; conferir paridade com `pg_get_functiondef` antes de
-- reaplicar. Contexto: docs/superpowers/specs/2026-09-04-mila-gestao-plano.md

-- PASSO 2 · CURSO DE INTERESSE (5.407 em branco)
-- Trigger trg_experimental_preenche_curso em lead_experimentais: experimental
-- com curso preenche leads.curso_interesse_id quando NULL (first-touch — quem ja
-- tem curso nao e sobrescrito; mudar de instrumento e decisao humana, W1).
-- Backfill retroativo pela experimental mais recente + pela matricula.
-- Resultado: 5.407 -> 5.342 (65 recuperados, exatamente o medido antes).
-- Para a frente a porta esta fechada: quem agenda passa a ter instrumento.
select 1; -- corpo integral esta no banco
