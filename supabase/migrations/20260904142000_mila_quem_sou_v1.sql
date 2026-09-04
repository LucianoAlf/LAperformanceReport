-- Aplicada via MCP em 04/09/2026 (plano da Mila de gestao, passo 3). Corpo
-- integral vive no banco; conferir com pg_get_functiondef antes de reaplicar.
-- Contexto: docs/superpowers/specs/2026-09-04-mila-gestao-plano.md

-- governanca.quem_eh vive fora de public e o PostgREST expoe so public. O MCP
-- precisa saber QUEM e o carimbo no start (lista ou nao as tools de trafego).
-- mila_quem_sou_v1(p_telefone) e o wrapper publico, SECURITY DEFINER, so leitura:
-- devolve nome, departamento, nivel, unidade, pode_editar, escopo todas|unidade.
select 1;
