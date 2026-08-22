-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =============================================================================
-- LA MUSIC - CRIAÇÃO DE ÍNDICES PARA FOREIGN KEYS (BATCH 3)
-- =============================================================================

-- INVENTARIO
CREATE INDEX IF NOT EXISTS idx_inventario_created_by ON public.inventario(created_by);
CREATE INDEX IF NOT EXISTS idx_inventario_manut_created_by ON public.inventario_manutencoes(created_by);
CREATE INDEX IF NOT EXISTS idx_inv_mov_sala_destino ON public.inventario_movimentacoes(sala_destino_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_sala_origem ON public.inventario_movimentacoes(sala_origem_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_usuario ON public.inventario_movimentacoes(usuario_id);

-- LOJA
CREATE INDEX IF NOT EXISTS idx_loja_estoque_variacao ON public.loja_estoque(variacao_id);
CREATE INDEX IF NOT EXISTS idx_loja_mov_estoque_colaborador ON public.loja_movimentacoes_estoque(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_loja_mov_estoque_variacao ON public.loja_movimentacoes_estoque(variacao_id);
CREATE INDEX IF NOT EXISTS idx_loja_vendas_aluno ON public.loja_vendas(aluno_id);
CREATE INDEX IF NOT EXISTS idx_loja_vendas_colab_cliente ON public.loja_vendas(colaborador_cliente_id);
CREATE INDEX IF NOT EXISTS idx_loja_vendas_estornada_por ON public.loja_vendas(estornada_por);
CREATE INDEX IF NOT EXISTS idx_loja_vendas_prof_indicador ON public.loja_vendas(professor_indicador_id);
CREATE INDEX IF NOT EXISTS idx_loja_vendas_itens_produto ON public.loja_vendas_itens(produto_id);
CREATE INDEX IF NOT EXISTS idx_loja_vendas_itens_variacao ON public.loja_vendas_itens(variacao_id);

-- FARMER
CREATE INDEX IF NOT EXISTS idx_farmer_recados_aluno ON public.farmer_recados(aluno_id);
CREATE INDEX IF NOT EXISTS idx_farmer_recados_unidade ON public.farmer_recados(unidade_id);
CREATE INDEX IF NOT EXISTS idx_farmer_recados_camp_colaborador ON public.farmer_recados_campanhas(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_farmer_recados_camp_template ON public.farmer_recados_campanhas(template_id);
CREATE INDEX IF NOT EXISTS idx_farmer_recados_dest_professor ON public.farmer_recados_destinatarios(professor_id);
CREATE INDEX IF NOT EXISTS idx_farmer_tarefas_aluno ON public.farmer_tarefas(aluno_id);
CREATE INDEX IF NOT EXISTS idx_exp_prof_mensal_unidade ON public.experimentais_professor_mensal(unidade_id);
