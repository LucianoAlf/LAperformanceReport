-- Aplicada via MCP em 04/09/2026 (plano da Mila de gestao, passos 1 e 2).
-- Reproduz o objeto vivo; conferir paridade com `pg_get_functiondef` antes de
-- reaplicar. Contexto: docs/superpowers/specs/2026-09-04-mila-gestao-plano.md

-- MILA DE GESTAO · bloco 3 (pendencias) · OPERACIONAL
-- radar_pendencias_comerciais_v1(p_solicitante_telefone, p_amostra=8)
-- 5 buckets com total + amostra + acao: sem anamnese, experimental realizada
-- sem ficha, sem canal, sem curso, experimental feita sem desfecho.
-- sem_canal/sem_curso: so 90 dias e quem chegou a experimental — backlog velho
-- e reativacao, nao pendencia (regua da limpeza de 04/09).
-- ⚠️ A v1 filtrava x.unidade_id numa view SEM essa coluna
--    (vw_experimental_realizada_sem_ficha). O CREATE passou — plpgsql so valida
--    o SQL interno na execucao — e o banco pegou na 1a chamada. Unidade vem do
--    join com lead_experimentais por lead_experimental_id.
-- Medido para a Vitoria (CG): 376 / 39 / 33 / 12 / 21.
select 1; -- corpo integral esta no banco
