-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =============================================================================
-- LA MUSIC - CRIAÇÃO DE ÍNDICES PARA FOREIGN KEYS (BATCH 2)
-- =============================================================================

-- MOVIMENTACOES
CREATE INDEX IF NOT EXISTS idx_mov_canal_origem ON public.movimentacoes(canal_origem_id);
CREATE INDEX IF NOT EXISTS idx_mov_curso_anterior ON public.movimentacoes(curso_anterior_id);
CREATE INDEX IF NOT EXISTS idx_mov_curso ON public.movimentacoes(curso_id);
CREATE INDEX IF NOT EXISTS idx_mov_motivo_saida ON public.movimentacoes(motivo_saida_id);
CREATE INDEX IF NOT EXISTS idx_mov_professor_anterior ON public.movimentacoes(professor_anterior_id);
CREATE INDEX IF NOT EXISTS idx_mov_professor ON public.movimentacoes(professor_id);
CREATE INDEX IF NOT EXISTS idx_mov_tipo_saida ON public.movimentacoes(tipo_saida_id);
CREATE INDEX IF NOT EXISTS idx_mov_unidade_destino ON public.movimentacoes(unidade_destino_id);
CREATE INDEX IF NOT EXISTS idx_mov_unidade_origem ON public.movimentacoes(unidade_origem_id);

-- MOVIMENTACOES_ADMIN
CREATE INDEX IF NOT EXISTS idx_mov_admin_motivo_saida ON public.movimentacoes_admin(motivo_saida_id);
CREATE INDEX IF NOT EXISTS idx_mov_admin_motivo_trancamento ON public.movimentacoes_admin(motivo_trancamento_id);

-- EVASOES_V2
CREATE INDEX IF NOT EXISTS idx_evasoes_v2_created_by ON public.evasoes_v2(created_by);
CREATE INDEX IF NOT EXISTS idx_evasoes_v2_curso ON public.evasoes_v2(curso_id);
CREATE INDEX IF NOT EXISTS idx_evasoes_v2_motivo_saida ON public.evasoes_v2(motivo_saida_id);

-- TURMAS
CREATE INDEX IF NOT EXISTS idx_turmas_curso ON public.turmas(curso_id);

-- TURMAS_EXPLICITAS
CREATE INDEX IF NOT EXISTS idx_turmas_explicitas_curso ON public.turmas_explicitas(curso_id);
CREATE INDEX IF NOT EXISTS idx_turmas_explicitas_sala ON public.turmas_explicitas(sala_id);

-- TURMAS_HISTORICO
CREATE INDEX IF NOT EXISTS idx_turmas_hist_turma_destino ON public.turmas_historico(turma_destino_id);
CREATE INDEX IF NOT EXISTS idx_turmas_hist_turma_origem ON public.turmas_historico(turma_origem_id);
CREATE INDEX IF NOT EXISTS idx_turmas_hist_usuario ON public.turmas_historico(usuario_id);

-- RENOVACOES
CREATE INDEX IF NOT EXISTS idx_renovacoes_created_by ON public.renovacoes(created_by);
CREATE INDEX IF NOT EXISTS idx_renovacoes_motivo_nao_renovacao ON public.renovacoes(motivo_nao_renovacao_id);
CREATE INDEX IF NOT EXISTS idx_renovacoes_professor ON public.renovacoes(professor_id);
