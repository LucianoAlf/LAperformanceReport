-- ============================================
-- FASE 5.5c: SEED - CRIAR USUÁRIO ADMIN
-- Execute após criar o usuário no Supabase Auth
-- ============================================

-- INSTRUÇÕES:
-- 1. Acesse o Supabase Dashboard > Authentication > Users
-- 2. Clique em "Add user" > "Create new user"
-- 3. Preencha email e senha para o admin
-- 4. Copie o UUID do usuário criado
-- 5. Execute o SQL abaixo substituindo 'SEU-UUID-AQUI' pelo UUID copiado

-- Exemplo de inserção do usuário admin:
-- INSERT INTO usuarios (id, email, nome, perfil, unidade_id, ativo)
-- VALUES (
--   'SEU-UUID-AQUI',  -- UUID do auth.users
--   'admin@lamusic.com.br',
--   'Luciano',
--   'admin',
--   NULL,  -- admin não tem unidade específica
--   true
-- );

-- Exemplo de inserção de usuário de unidade:
-- INSERT INTO usuarios (id, email, nome, perfil, unidade_id, ativo)
-- VALUES (
--   'UUID-DO-USUARIO',
--   'cg@lamusic.com.br',
--   'Equipe Campo Grande',
--   'unidade',
--   (SELECT id FROM unidades WHERE codigo = 'CG'),  -- ou nome = 'Campo Grande'
--   true
-- );

-- ============================================
-- CONSULTAS ÚTEIS
-- ============================================

-- Ver todos os usuários cadastrados:
-- SELECT u.*, un.nome as unidade_nome 
-- FROM usuarios u 
-- LEFT JOIN unidades un ON u.unidade_id = un.id;

-- Ver IDs das unidades:
-- SELECT id, nome, codigo FROM unidades;

-- Verificar se RLS está habilitado:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
