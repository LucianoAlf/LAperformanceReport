-- ============================================================
-- FIX: Criar registro do usuário admin na tabela usuarios
-- Data: 18/01/2026
-- Problema: Usuário existe no Supabase Auth mas não na tabela usuarios
-- ============================================================

-- Primeiro, verificar se o usuário já existe
SELECT id, email, nome, perfil, auth_user_id 
FROM usuarios 
WHERE email = 'lucianoalf.la@gmail.com';

-- Se não existir, inserir o registro
-- IMPORTANTE: Substitua 'SEU-UUID-AQUI' pelo UUID real do Supabase Auth
-- Para obter o UUID:
-- 1. Acesse: https://supabase.com/dashboard/project/ouqwbbermlzqqvtqwlul/auth/users
-- 2. Encontre o usuário lucianoalf.la@gmail.com
-- 3. Copie o UUID da coluna "ID"

INSERT INTO usuarios (nome, email, perfil, unidade_id, auth_user_id, ativo)
VALUES (
  'Luciano Alf',
  'lucianoalf.la@gmail.com',
  'admin',
  NULL, -- Admin não tem unidade específica
  'SEU-UUID-AQUI', -- SUBSTITUA PELO UUID REAL
  true
)
ON CONFLICT (email) DO UPDATE SET
  auth_user_id = EXCLUDED.auth_user_id,
  nome = EXCLUDED.nome,
  perfil = EXCLUDED.perfil,
  ativo = EXCLUDED.ativo;

-- Verificar se foi criado corretamente
SELECT id, email, nome, perfil, auth_user_id, ativo 
FROM usuarios 
WHERE email = 'lucianoalf.la@gmail.com';
