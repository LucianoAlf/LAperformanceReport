-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =============================================================================
-- LA MUSIC - CRIAÇÃO DE ÍNDICES PARA FOREIGN KEYS (BATCH 1)
-- =============================================================================
-- Apenas índices que NÃO existem ainda
-- Data: 2026-02-04
-- =============================================================================

-- ALUNOS - FKs sem índice
CREATE INDEX IF NOT EXISTS idx_alunos_canal_origem ON public.alunos(canal_origem_id);
CREATE INDEX IF NOT EXISTS idx_alunos_forma_pagamento ON public.alunos(forma_pagamento_id);
CREATE INDEX IF NOT EXISTS idx_alunos_motivo_saida ON public.alunos(motivo_saida_id);
CREATE INDEX IF NOT EXISTS idx_alunos_professor_experimental ON public.alunos(professor_experimental_id);
CREATE INDEX IF NOT EXISTS idx_alunos_tipo_matricula ON public.alunos(tipo_matricula_id);
CREATE INDEX IF NOT EXISTS idx_alunos_tipo_saida ON public.alunos(tipo_saida_id);

-- COLABORADORES
CREATE INDEX IF NOT EXISTS idx_colaboradores_usuario ON public.colaboradores(usuario_id);

-- LEADS
CREATE INDEX IF NOT EXISTS idx_leads_aluno ON public.leads(aluno_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_by ON public.leads(created_by);
CREATE INDEX IF NOT EXISTS idx_leads_professor_experimental ON public.leads(professor_experimental_id);

-- LEADS_DIARIOS
CREATE INDEX IF NOT EXISTS idx_leads_diarios_created_by ON public.leads_diarios(created_by);
CREATE INDEX IF NOT EXISTS idx_leads_diarios_forma_pagamento ON public.leads_diarios(forma_pagamento_id);
CREATE INDEX IF NOT EXISTS idx_leads_diarios_forma_pagamento_passaporte ON public.leads_diarios(forma_pagamento_passaporte_id);
CREATE INDEX IF NOT EXISTS idx_leads_diarios_motivo_arquivamento ON public.leads_diarios(motivo_arquivamento_id);
CREATE INDEX IF NOT EXISTS idx_leads_diarios_motivo_nao_matricula ON public.leads_diarios(motivo_nao_matricula_id);
CREATE INDEX IF NOT EXISTS idx_leads_diarios_professor_experimental ON public.leads_diarios(professor_experimental_id);
CREATE INDEX IF NOT EXISTS idx_leads_diarios_professor_fixo ON public.leads_diarios(professor_fixo_id);
