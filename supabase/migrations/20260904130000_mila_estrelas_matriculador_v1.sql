-- Aplicada via MCP em 04/09/2026 (plano da Mila de gestao, passos 1 e 2).
-- Reproduz o objeto vivo; conferir paridade com `pg_get_functiondef` antes de
-- reaplicar. Contexto: docs/superpowers/specs/2026-09-04-mila-gestao-plano.md

-- MILA DE GESTAO · bloco 2 (reports) · OPERACIONAL + TATICA
-- O programa MATRICULADOR + LA (PDF de 04/09) e por ESTRELAS, nao por pontos.
-- `programa_matriculador_config` (pontos, nota 80) e a versao anterior, com
-- historico VAZIO — nunca foi usada. Este e o sistema que vale, do PDF:
--   01 MATRICULA PLUS  matriculas do mes >= 25/20/18 (CG/Recreio/Barra)
--   02 SHOW-UP         experimentais + visitas realizadas >= 55/40/40
--   03 TICKET PREMIADO ticket medio >= referencia + R$10 (380/415/445)
--   04 MAX INDICACAO   >= 5 matriculas de Indicacao/Family
--   05 HUNTER 360      TODAS as matriculas com anamnese E na comunidade
-- Escopo por governanca.quem_eh(telefone): diretoria (unidade nula) ve tudo;
-- consultora so a dela; desconhecido e recusado. max_indicacao e PISO
-- (depende de leads.aluno_id, 36,9% de cobertura) e a RPC diz isso.
-- DDL completa: ver a migration aplicada `mila_estrelas_matriculador_v1`
-- (tabela programa_matriculador_estrelas_config + get_estrelas_matriculador_v1).
select 1; -- corpo integral esta no banco; md5 conferido em 04/09
