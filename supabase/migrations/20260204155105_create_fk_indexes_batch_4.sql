-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =============================================================================
-- LA MUSIC - CRIAÇÃO DE ÍNDICES PARA FOREIGN KEYS (BATCH 4)
-- =============================================================================

-- PROFESSOR
CREATE INDEX IF NOT EXISTS idx_prof_acoes_created_by ON public.professor_acoes(created_by);
CREATE INDEX IF NOT EXISTS idx_prof_acoes_meta ON public.professor_acoes(meta_id);
CREATE INDEX IF NOT EXISTS idx_prof_acoes_treinamento ON public.professor_acoes(treinamento_id);
CREATE INDEX IF NOT EXISTS idx_prof_acoes_unidade ON public.professor_acoes(unidade_id);
CREATE INDEX IF NOT EXISTS idx_prof_acoes_part_professor ON public.professor_acoes_participantes(professor_id);
CREATE INDEX IF NOT EXISTS idx_prof_checkpoints_created_by ON public.professor_checkpoints(created_by);
CREATE INDEX IF NOT EXISTS idx_prof_checkpoints_unidade ON public.professor_checkpoints(unidade_id);
CREATE INDEX IF NOT EXISTS idx_prof_metas_created_by ON public.professor_metas(created_by);
CREATE INDEX IF NOT EXISTS idx_prof_metas_unidade ON public.professor_metas(unidade_id);

-- PROGRAMA_FIDELIZA
CREATE INDEX IF NOT EXISTS idx_prog_fideliza_hist_unidade ON public.programa_fideliza_historico(unidade_id);
CREATE INDEX IF NOT EXISTS idx_prog_fideliza_pen_unidade ON public.programa_fideliza_penalidades(unidade_id);

-- PROJETOS
CREATE INDEX IF NOT EXISTS idx_projetos_created_by ON public.projetos(created_by);
CREATE INDEX IF NOT EXISTS idx_proj_tarefas_created_by ON public.projeto_tarefas(created_by);

-- NOTIFICACOES
CREATE INDEX IF NOT EXISTS idx_notif_log_config ON public.notificacao_log(config_id);
CREATE INDEX IF NOT EXISTS idx_notif_log_projeto ON public.notificacao_log(projeto_id);
CREATE INDEX IF NOT EXISTS idx_notif_log_tarefa ON public.notificacao_log(tarefa_id);

-- PLANOS_ACAO
CREATE INDEX IF NOT EXISTS idx_planos_acao_criado_por ON public.planos_acao(criado_por);

-- RELATORIOS_DIARIOS
CREATE INDEX IF NOT EXISTS idx_relat_diarios_created_by ON public.relatorios_diarios(created_by);
