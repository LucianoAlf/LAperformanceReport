-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =====================================================
-- CORREÇÃO: Atualizar 8 alunos para aviso_previo
-- Conforme relatório diário da Barra (14/02/2026)
-- Estes alunos avisaram em Janeiro e saem em Março
-- =====================================================

-- 1) Bento Rebuli Paulo Gomes (id 737)
-- Motivo: falta de horário por conta de mudar o horário da escola para integral
-- Professor: Matheus
UPDATE alunos SET status = 'aviso_previo', updated_at = NOW() WHERE id = 737;

-- 2) Jefferson Cândido de Souza (id 792)
-- Motivo: período final da faculdade
-- Professor: Léo
UPDATE alunos SET status = 'aviso_previo', updated_at = NOW() WHERE id = 792;

-- 3) Glauce Passos de Souza Maues (id 779)
-- Motivo: por conta de trabalho viajam muito
-- Professor: Gabriel Leão
UPDATE alunos SET status = 'aviso_previo', updated_at = NOW() WHERE id = 779;

-- 4) Alexandre Ferreira (id 712)
-- Motivo: por conta de trabalho viajam muito
-- Professor: Léo
UPDATE alunos SET status = 'aviso_previo', updated_at = NOW() WHERE id = 712;

-- 5) Ana Paula Oliveira Cazarotti (id 718)
-- Motivo: Acha que não conseguia se desenvolver no canto
-- Professora: Daiana
UPDATE alunos SET status = 'aviso_previo', updated_at = NOW() WHERE id = 718;

-- 6) Cecília suhett de Oliveira (id 749)
-- Motivo: Questões financeiras
-- Professora: Mariana
UPDATE alunos SET status = 'aviso_previo', updated_at = NOW() WHERE id = 749;

-- 7) Aline Borges Becker Oliveira (id 716)
-- Motivo: Questão de logística e falta de tempo
-- Professor: Léo
UPDATE alunos SET status = 'aviso_previo', updated_at = NOW() WHERE id = 716;

-- 8) Lívia Becker Oliveira (id 812)
-- Motivo: Falta de horário por conta da alteração na escola
-- Professor: Léo
UPDATE alunos SET status = 'aviso_previo', updated_at = NOW() WHERE id = 812;

-- 9) Vivian Dangelo (id 911)
-- Motivo: Questões internas na empresa que paga a parcela dela
-- Professora: Mariana
UPDATE alunos SET status = 'aviso_previo', updated_at = NOW() WHERE id = 911;

-- Arthur (723), Gabriela (776) e Patrick (864) já foram corrigidos anteriormente
