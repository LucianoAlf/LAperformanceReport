// Schema completo do banco LA Music para injeção no system prompt do agente BI
// Atualizado: 2026-04-02

export const FULL_DATABASE_SCHEMA = `
=== SCHEMA DO BANCO DE DADOS — LA MUSIC ===

UNIDADES (escolas):
- unidades: id (uuid PK), nome, codigo ('CG','REC','BARRA'), ativo
  Relação: quase todas tabelas têm unidade_id → unidades.id

ALUNOS:
- alunos: id (int PK), nome, unidade_id (uuid FK), professor_atual_id (int FK → professores), curso_id (int FK → cursos), tipo_matricula_id (int FK → tipos_matricula), status ('ativo','inativo','trancado','evadido','aviso_previo'), data_matricula (date), data_saida (date NULL), valor_parcela (numeric), classificacao ('LAMK'=kids,'EMLA'=adultos), dia_aula, horario_aula, modalidade ('individual','turma'), tempo_permanencia_meses, is_segundo_curso (bool), is_ex_aluno (bool), forma_pagamento_id (int FK), telefone, whatsapp, responsavel_telefone, percentual_presenca (int 0-100)
  Regras: aluno ATIVO = está frequentando. INATIVO/EVADIDO = saiu. data_saida preenchida = aluno que saiu.
  Contagem pagantes: somente tipos_matricula com conta_como_pagante = true
  Ticket médio: somente tipos_matricula com entra_ticket_medio = true

PROFESSORES:
- professores: id (int PK), nome, ativo (bool), nps_medio, media_alunos_turma, data_admissao, telefone_whatsapp, foto_url
- professores_unidades: professor_id, unidade_id — vínculo N:N (professor pode atuar em várias unidades)

CURSOS:
- cursos: id (int PK), nome, ativo, is_projeto_banda (bool), fator_demanda

TIPOS DE MATRÍCULA:
- tipos_matricula: id (int PK), nome, codigo, conta_como_pagante (bool), entra_ticket_medio (bool), entra_ltv (bool), entra_churn (bool)
  Valores: 1=Normal, 2=Segundo Curso, 3=Bolsa Total, 4=Bolsa Parcial, 5=Banda

LEADS (pipeline comercial):
- leads: id (int PK), nome, telefone, unidade_id (uuid FK), curso_interesse_id (int FK → cursos), canal_origem_id (int FK → canais_origem), etapa_pipeline_id (int), status ('novo','em_contato','experimental_agendada','experimental_realizada','convertido','arquivado'), data_contato (date), data_experimental (date), professor_experimental_id, experimental_realizada (bool), faltou_experimental (bool), converteu (bool), data_conversao (date), arquivado (bool), temperatura ('quente','morno','frio')
  Etapas pipeline: 1=Novo, 3=Em contato, 5=Experimental agendada, 7=Experimental realizada, 9=Faltou, 10=Convertido

CANAIS DE ORIGEM:
- canais_origem: id (int PK), nome ('Instagram','Google','Facebook','Indicação','Visita/Placa','Ex-aluno','Ligação','Convênios')

MOVIMENTAÇÕES (evasões, renovações, trancamentos):
- movimentacoes_admin: id (int PK), unidade_id (uuid FK), data (date), tipo ('evasao','cancelamento','renovacao','nao_renovacao','trancamento','aviso_previo'), aluno_nome, aluno_id (int FK), professor_id (int FK), curso_id (int FK), valor_parcela_anterior, valor_parcela_novo, motivo (text), tempo_permanencia_meses

DADOS MENSAIS (snapshots):
- dados_mensais: unidade_id, ano, mes, alunos_ativos, alunos_pagantes, novas_matriculas, evasoes, churn_rate, ticket_medio, taxa_renovacao, faturamento_estimado, matriculas_banda, matriculas_2_curso

METAS:
- metas: unidade_id, ano, mes, meta_leads, meta_experimentais, meta_matriculas, meta_evasoes_maximo, meta_alunos_ativos, meta_alunos_pagantes, meta_ticket_medio, meta_faturamento_parcelas, meta_churn_maximo, meta_taxa_renovacao

TURMAS:
- turmas: id (int PK), unidade_id, professor_id, curso_id, dia_semana, horario_inicio, capacidade_maxima, ativo

FORMAS DE PAGAMENTO:
- formas_pagamento: id (int PK), nome ('Cartão Crédito','Boleto','PIX','Dinheiro'), sigla

PROFESSOR METAS E AÇÕES:
- professor_metas: professor_id, tipo ('media_turma','retencao','conversao','presenca','max_evasoes'), valor_atual, valor_meta, data_inicio, data_fim, status
- professor_acoes: professor_id, tipo ('treinamento','reuniao','checkpoint','feedback','mentoria'), titulo, data_agendada, status ('pendente','em_andamento','concluida'), responsavel ('Juliana','Quintela')

=== RELACIONAMENTOS PRINCIPAIS ===
- alunos.unidade_id → unidades.id
- alunos.professor_atual_id → professores.id
- alunos.curso_id → cursos.id
- alunos.tipo_matricula_id → tipos_matricula.id
- leads.unidade_id → unidades.id
- leads.curso_interesse_id → cursos.id
- leads.canal_origem_id → canais_origem.id
- movimentacoes_admin.unidade_id → unidades.id
- movimentacoes_admin.professor_id → professores.id
- dados_mensais.unidade_id → unidades.id
- professores_unidades.professor_id → professores.id
- professores_unidades.unidade_id → unidades.id

=== QUERIES DE EXEMPLO ===

-- Alunos ativos por unidade
SELECT u.codigo, COUNT(*) FROM alunos a JOIN unidades u ON u.id = a.unidade_id WHERE a.status = 'ativo' GROUP BY u.codigo;

-- Ticket médio real (só tipos que entram no ticket)
SELECT u.codigo, ROUND(AVG(a.valor_parcela)::numeric, 2) as ticket_medio FROM alunos a JOIN unidades u ON u.id = a.unidade_id JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id WHERE a.status = 'ativo' AND tm.entra_ticket_medio = true AND a.valor_parcela > 0 GROUP BY u.codigo;

-- Evasões por professor nos últimos 3 meses
SELECT p.nome, COUNT(*) as evasoes FROM movimentacoes_admin m JOIN professores p ON p.id = m.professor_id WHERE m.tipo IN ('evasao','cancelamento') AND m.data >= CURRENT_DATE - INTERVAL '3 months' GROUP BY p.nome ORDER BY evasoes DESC;

-- Funil comercial do mês atual
SELECT CASE l.etapa_pipeline_id WHEN 1 THEN 'Novo' WHEN 3 THEN 'Em contato' WHEN 5 THEN 'Exp. agendada' WHEN 7 THEN 'Exp. realizada' WHEN 10 THEN 'Convertido' ELSE 'Outro' END as etapa, COUNT(*) FROM leads l WHERE date_trunc('month', l.data_contato) = date_trunc('month', CURRENT_DATE) AND l.arquivado = false GROUP BY l.etapa_pipeline_id ORDER BY l.etapa_pipeline_id;

-- Leads por canal de origem este mês
SELECT co.nome as canal, COUNT(*) as leads FROM leads l JOIN canais_origem co ON co.id = l.canal_origem_id WHERE l.data_contato >= date_trunc('month', CURRENT_DATE) AND l.arquivado = false GROUP BY co.nome ORDER BY leads DESC;

-- Alunos por curso
SELECT c.nome as curso, COUNT(*) as alunos FROM alunos a JOIN cursos c ON c.id = a.curso_id WHERE a.status = 'ativo' GROUP BY c.nome ORDER BY alunos DESC;

-- Evolução mensal de alunos ativos (dados_mensais)
SELECT ano, mes, alunos_ativos, alunos_pagantes, evasoes, ticket_medio FROM dados_mensais WHERE unidade_id IS NOT NULL ORDER BY ano, mes;

-- Taxa de conversão de experimentais por professor
SELECT p.nome, COUNT(*) FILTER (WHERE l.experimental_realizada) as realizadas, COUNT(*) FILTER (WHERE l.converteu) as convertidas, CASE WHEN COUNT(*) FILTER (WHERE l.experimental_realizada) > 0 THEN ROUND(COUNT(*) FILTER (WHERE l.converteu)::numeric / COUNT(*) FILTER (WHERE l.experimental_realizada) * 100, 1) ELSE 0 END as taxa_conversao FROM leads l JOIN professores p ON p.id = l.professor_experimental_id WHERE l.data_experimental >= CURRENT_DATE - INTERVAL '3 months' GROUP BY p.nome HAVING COUNT(*) FILTER (WHERE l.experimental_realizada) > 0 ORDER BY taxa_conversao DESC;

-- Metas vs realizado do mês
SELECT m.meta_alunos_ativos, m.meta_matriculas, m.meta_evasoes_maximo, d.alunos_ativos, d.novas_matriculas, d.evasoes FROM metas m LEFT JOIN dados_mensais d ON d.unidade_id = m.unidade_id AND d.ano = m.ano AND d.mes = m.mes WHERE m.ano = EXTRACT(YEAR FROM CURRENT_DATE) AND m.mes = EXTRACT(MONTH FROM CURRENT_DATE);
`;
