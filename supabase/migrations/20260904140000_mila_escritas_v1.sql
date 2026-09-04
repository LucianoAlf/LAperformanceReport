-- Aplicada via MCP em 04/09/2026 (plano da Mila de gestao, passo 3). Corpo
-- integral vive no banco; conferir com pg_get_functiondef antes de reaplicar.
-- Contexto: docs/superpowers/specs/2026-09-04-mila-gestao-plano.md

-- AS ESCRITAS (W1-W5, W7): uma RPC nomeada e estreita por intencao — padrao
-- Maria/Sol. mila_autoriza_lead (quem_eh + lead na unidade do solicitante),
-- mila_trilha (automacao_log: aluno_nome NOT NULL, status ok|warn|erro),
-- mila_registrar_curso_interesse_v1 (sobrescreve — mudar de instrumento e
-- decisao humana), mila_registrar_motivo_perda_v1 (NAO mexe em converteu/
-- status), mila_registrar_canal_origem_v1 (first-touch; sobrescrever e opt-in),
-- mila_fechar_sinal_v1 (a VOLTA; desfecho no enum), mila_registrar_consultor_v1
-- (colaborador por nome NA unidade), mila_anotar_lead_v1 (append em
-- leads.observacoes com data+autor). Nome ambiguo -> `ambiguo` + candidatos.
-- NUNCA deleta. Provado em 04/09 no lead de teste 11256 (hugo teste), trilha
-- com quem/antes/depois em 3 linhas.
select 1;
