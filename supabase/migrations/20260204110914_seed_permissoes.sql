-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =====================================================
-- FASE 2.2: Seed de Permissões
-- Baseado no wireframe painel-permissoes.html
-- =====================================================

-- CATEGORIA: SISTEMA
INSERT INTO permissoes (codigo, modulo, acao, descricao, categoria, ordem) VALUES
  ('dashboard.ver', 'dashboard', 'ver', 'Visualizar dashboard', 'SISTEMA', 1),
  ('dashboard.exportar', 'dashboard', 'exportar', 'Exportar dados do dashboard', 'SISTEMA', 2),
  ('analytics.ver', 'analytics', 'ver', 'Visualizar analytics', 'SISTEMA', 3),
  ('metas.ver', 'metas', 'ver', 'Visualizar metas', 'SISTEMA', 4),
  ('metas.editar', 'metas', 'editar', 'Editar metas', 'SISTEMA', 5),
  ('sistema.consolidado', 'sistema', 'consolidado', 'Ver dados consolidados de todas unidades', 'SISTEMA', 6)
ON CONFLICT (codigo) DO NOTHING;

-- CATEGORIA: OPERACIONAL - Comercial
INSERT INTO permissoes (codigo, modulo, acao, descricao, categoria, ordem) VALUES
  ('comercial.ver', 'comercial', 'ver', 'Acessar módulo comercial', 'OPERACIONAL', 10),
  ('comercial.leads.ver', 'comercial', 'leads.ver', 'Visualizar leads', 'OPERACIONAL', 11),
  ('comercial.leads.criar', 'comercial', 'leads.criar', 'Criar leads', 'OPERACIONAL', 12),
  ('comercial.leads.editar', 'comercial', 'leads.editar', 'Editar leads', 'OPERACIONAL', 13),
  ('comercial.leads.excluir', 'comercial', 'leads.excluir', 'Excluir leads', 'OPERACIONAL', 14),
  ('comercial.experimentais.ver', 'comercial', 'experimentais.ver', 'Visualizar aulas experimentais', 'OPERACIONAL', 15),
  ('comercial.experimentais.criar', 'comercial', 'experimentais.criar', 'Agendar aulas experimentais', 'OPERACIONAL', 16)
ON CONFLICT (codigo) DO NOTHING;

-- CATEGORIA: OPERACIONAL - Administrativo
INSERT INTO permissoes (codigo, modulo, acao, descricao, categoria, ordem) VALUES
  ('administrativo.ver', 'administrativo', 'ver', 'Acessar módulo administrativo', 'OPERACIONAL', 20),
  ('administrativo.lancamentos', 'administrativo', 'lancamentos', 'Realizar lançamentos', 'OPERACIONAL', 21),
  ('administrativo.fideliza', 'administrativo', 'fideliza', 'Acessar Fideliza+', 'OPERACIONAL', 22),
  ('administrativo.lojinha', 'administrativo', 'lojinha', 'Acessar Lojinha', 'OPERACIONAL', 23),
  ('administrativo.lojinha.vender', 'administrativo', 'lojinha.vender', 'Realizar vendas na Lojinha', 'OPERACIONAL', 24),
  ('administrativo.lojinha.estoque', 'administrativo', 'lojinha.estoque', 'Gerenciar estoque da Lojinha', 'OPERACIONAL', 25),
  ('administrativo.painel_farmer', 'administrativo', 'painel_farmer', 'Acessar Painel Farmer', 'OPERACIONAL', 26),
  ('administrativo.rotinas', 'administrativo', 'rotinas', 'Gerenciar rotinas', 'OPERACIONAL', 27),
  ('administrativo.tarefas', 'administrativo', 'tarefas', 'Gerenciar tarefas', 'OPERACIONAL', 28),
  ('administrativo.recados', 'administrativo', 'recados', 'Enviar recados', 'OPERACIONAL', 29)
ON CONFLICT (codigo) DO NOTHING;

-- CATEGORIA: OPERACIONAL - Alunos
INSERT INTO permissoes (codigo, modulo, acao, descricao, categoria, ordem) VALUES
  ('alunos.ver', 'alunos', 'ver', 'Visualizar alunos', 'OPERACIONAL', 30),
  ('alunos.criar', 'alunos', 'criar', 'Matricular alunos', 'OPERACIONAL', 31),
  ('alunos.editar', 'alunos', 'editar', 'Editar dados de alunos', 'OPERACIONAL', 32),
  ('alunos.excluir', 'alunos', 'excluir', 'Excluir alunos', 'OPERACIONAL', 33),
  ('alunos.whatsapp', 'alunos', 'whatsapp', 'Enviar WhatsApp para alunos', 'OPERACIONAL', 34),
  ('alunos.ficha', 'alunos', 'ficha', 'Ver ficha completa do aluno', 'OPERACIONAL', 35),
  ('alunos.health_score', 'alunos', 'health_score', 'Alterar health score', 'OPERACIONAL', 36)
ON CONFLICT (codigo) DO NOTHING;

-- CATEGORIA: OPERACIONAL - Professores
INSERT INTO permissoes (codigo, modulo, acao, descricao, categoria, ordem) VALUES
  ('professores.ver', 'professores', 'ver', 'Visualizar professores', 'OPERACIONAL', 40),
  ('professores.carteira', 'professores', 'carteira', 'Ver carteira de alunos', 'OPERACIONAL', 41),
  ('professores.avaliar', 'professores', 'avaliar', 'Avaliar professores (360)', 'OPERACIONAL', 42),
  ('professores.editar', 'professores', 'editar', 'Editar dados de professores', 'OPERACIONAL', 43)
ON CONFLICT (codigo) DO NOTHING;

-- CATEGORIA: OPERACIONAL - Renovações/Retenção
INSERT INTO permissoes (codigo, modulo, acao, descricao, categoria, ordem) VALUES
  ('renovacoes.ver', 'renovacoes', 'ver', 'Visualizar renovações', 'OPERACIONAL', 50),
  ('renovacoes.registrar', 'renovacoes', 'registrar', 'Registrar renovações', 'OPERACIONAL', 51),
  ('evasoes.ver', 'evasoes', 'ver', 'Visualizar evasões', 'OPERACIONAL', 52),
  ('evasoes.registrar', 'evasoes', 'registrar', 'Registrar evasões', 'OPERACIONAL', 53),
  ('retencao.plano_acao', 'retencao', 'plano_acao', 'Acessar plano de ação de retenção', 'OPERACIONAL', 54)
ON CONFLICT (codigo) DO NOTHING;

-- CATEGORIA: ADMIN
INSERT INTO permissoes (codigo, modulo, acao, descricao, categoria, ordem) VALUES
  ('usuarios.ver', 'usuarios', 'ver', 'Visualizar usuários', 'ADMIN', 60),
  ('usuarios.criar', 'usuarios', 'criar', 'Criar usuários', 'ADMIN', 61),
  ('usuarios.editar', 'usuarios', 'editar', 'Editar usuários', 'ADMIN', 62),
  ('usuarios.excluir', 'usuarios', 'excluir', 'Excluir usuários', 'ADMIN', 63),
  ('permissoes.gerenciar', 'permissoes', 'gerenciar', 'Gerenciar permissões', 'ADMIN', 64),
  ('perfis.gerenciar', 'perfis', 'gerenciar', 'Gerenciar perfis', 'ADMIN', 65),
  ('auditoria.ver', 'auditoria', 'ver', 'Visualizar auditoria', 'ADMIN', 66),
  ('configuracoes.gerenciar', 'configuracoes', 'gerenciar', 'Gerenciar configurações do sistema', 'ADMIN', 67)
ON CONFLICT (codigo) DO NOTHING;
