-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =====================================================
-- CORREÇÃO 1: INATIVAR DUPLICATA ISABELA CAVALCANTI
-- ID 947 não tem dependências, pode inativar
-- =====================================================
UPDATE alunos 
SET status = 'inativo', 
    updated_at = NOW()
WHERE id = 947;

-- =====================================================
-- CORREÇÃO 2: REATIVAR ALUNOS EM AVISO PRÉVIO
-- =====================================================

-- Arthur Brito de Souza (id 723) — evadido → aviso_previo
-- Professor Matheus Lana (26) já está correto
UPDATE alunos SET
  status = 'aviso_previo',
  updated_at = NOW()
WHERE id = 723;

-- Gabriela Ferreira Noritomi (id 776) — evadido → aviso_previo
-- Dados já estão corretos (Daiana Pacífico, Canto, 467.00)
UPDATE alunos SET
  status = 'aviso_previo',
  updated_at = NOW()
WHERE id = 776;

-- Patrick Menezes Cruz (id 864) — já está aviso_previo, sem alteração necessária

-- =====================================================
-- CORREÇÃO 3: CORRIGIR VALORES INVERTIDOS
-- =====================================================

-- Felipe Alves Fontinele
-- Piano (id 768): 233.00 → 467.00
UPDATE alunos SET valor_parcela = 467.00, updated_at = NOW() WHERE id = 768;
-- Bateria (id 1145): 467.00 → 233.00
UPDATE alunos SET valor_parcela = 233.00, updated_at = NOW() WHERE id = 1145;

-- Maria Clara Miranda Rodrigues
-- Canto (id 1143): 447.00 → 253.00
UPDATE alunos SET valor_parcela = 253.00, updated_at = NOW() WHERE id = 1143;
-- Teclado (id 835): 253.00 → 447.00
UPDATE alunos SET valor_parcela = 447.00, updated_at = NOW() WHERE id = 835;
