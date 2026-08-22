-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Tabela para membros da equipe de projetos (coordenadores, assistentes)
CREATE TABLE IF NOT EXISTS projeto_equipe_membros (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  nome VARCHAR(255) NOT NULL,
  cargo VARCHAR(255),
  tipo VARCHAR(50) NOT NULL DEFAULT 'assistente', -- 'coordenador', 'assistente'
  avatar_cor VARCHAR(50) DEFAULT 'violet',
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela para configurações de permissões de professores no módulo de projetos
CREATE TABLE IF NOT EXISTS projeto_config_permissoes (
  id SERIAL PRIMARY KEY,
  chave VARCHAR(100) UNIQUE NOT NULL,
  valor BOOLEAN DEFAULT false,
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir permissões padrão
INSERT INTO projeto_config_permissoes (chave, valor, descricao) VALUES
  ('ver_projetos', true, 'Visualizar lista de projetos'),
  ('ver_tarefas', true, 'Visualizar tarefas atribuídas'),
  ('concluir_tarefas', true, 'Marcar tarefas como concluídas'),
  ('comentar_tarefas', true, 'Adicionar comentários em tarefas'),
  ('editar_tarefas', false, 'Modificar detalhes das tarefas'),
  ('criar_tarefas', false, 'Criar novas tarefas em projetos')
ON CONFLICT (chave) DO NOTHING;

-- Inserir membros da equipe baseado nos usuários existentes
INSERT INTO projeto_equipe_membros (usuario_id, nome, cargo, tipo, avatar_cor) 
SELECT id, nome, 
  CASE 
    WHEN nome = 'Quintela' THEN 'Coordenador LAMK'
    WHEN nome = 'Ju' THEN 'Coordenadora EMLA'
    WHEN nome = 'Krissya' THEN 'Diretora Pedagógica'
    ELSE 'Equipe Pedagógica'
  END as cargo,
  CASE 
    WHEN nome IN ('Quintela', 'Ju', 'Krissya') THEN 'coordenador'
    ELSE 'assistente'
  END as tipo,
  CASE 
    WHEN nome = 'Quintela' THEN 'emerald'
    WHEN nome = 'Ju' THEN 'violet'
    WHEN nome = 'Krissya' THEN 'rose'
    ELSE 'cyan'
  END as avatar_cor
FROM usuarios 
WHERE perfil = 'admin' AND nome IN ('Quintela', 'Ju', 'Krissya', 'Ana', 'Hugo')
ON CONFLICT DO NOTHING;
