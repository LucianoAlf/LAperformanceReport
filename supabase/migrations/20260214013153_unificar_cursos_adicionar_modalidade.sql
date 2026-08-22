-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- ============================================================
-- MIGRATION: Unificar cursos T/IND + adicionar coluna modalidade
-- ============================================================

-- PASSO 1: Adicionar coluna modalidade na tabela alunos
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS modalidade VARCHAR(20) DEFAULT 'turma';

-- PASSO 2: Setar modalidade='individual' nos alunos que estão em cursos IND
-- IDs IND: 1(Mus.Bebês), 3(Mus.Infantil), 5(Canto), 7(Ukulelê), 9(Violão), 11(Violino), 13(Guitarra), 15(Teclado), 17(Piano), 19(Flauta Doce), 22(Contrabaixo), 26(Bateria)
UPDATE alunos SET modalidade = 'individual' 
WHERE curso_id IN (1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 22, 26);

-- PASSO 3: Migrar alunos de cursos IND para o curso T equivalente
UPDATE alunos SET curso_id = 2 WHERE curso_id = 1;   -- Mus. Bebês IND → Mus. Bebês T
UPDATE alunos SET curso_id = 4 WHERE curso_id = 3;   -- Mus. Infantil IND → Mus. Infantil T
UPDATE alunos SET curso_id = 6 WHERE curso_id = 5;   -- Canto IND → Canto T
UPDATE alunos SET curso_id = 8 WHERE curso_id = 7;   -- Ukulelê IND → Ukulelê T
UPDATE alunos SET curso_id = 10 WHERE curso_id = 9;  -- Violão IND → Violão T
UPDATE alunos SET curso_id = 12 WHERE curso_id = 11; -- Violino IND → Violino T
UPDATE alunos SET curso_id = 14 WHERE curso_id = 13; -- Guitarra IND → Guitarra T
UPDATE alunos SET curso_id = 16 WHERE curso_id = 15; -- Teclado IND → Teclado T
UPDATE alunos SET curso_id = 18 WHERE curso_id = 17; -- Piano IND → Piano T
UPDATE alunos SET curso_id = 20 WHERE curso_id = 19; -- Flauta Doce IND → Flauta Doce T
UPDATE alunos SET curso_id = 21 WHERE curso_id = 22; -- Contrabaixo IND → Contrabaixo T
UPDATE alunos SET curso_id = 27 WHERE curso_id = 26; -- Bateria IND → Bateria T

-- PASSO 4: Migrar professores_cursos (eliminar duplicatas com ON CONFLICT)
-- Primeiro deletar registros IND que já existem como T (evitar duplicata)
DELETE FROM professores_cursos pc_ind
WHERE pc_ind.curso_id IN (1,3,5,7,9,11,13,15,17,19,22,26)
  AND EXISTS (
    SELECT 1 FROM professores_cursos pc_t 
    WHERE pc_t.professor_id = pc_ind.professor_id 
      AND pc_t.curso_id = CASE pc_ind.curso_id
        WHEN 1 THEN 2 WHEN 3 THEN 4 WHEN 5 THEN 6 WHEN 7 THEN 8
        WHEN 9 THEN 10 WHEN 11 THEN 12 WHEN 13 THEN 14 WHEN 15 THEN 16
        WHEN 17 THEN 18 WHEN 19 THEN 20 WHEN 22 THEN 21 WHEN 26 THEN 27
      END
  );
-- Agora migrar os restantes
UPDATE professores_cursos SET curso_id = 2 WHERE curso_id = 1;
UPDATE professores_cursos SET curso_id = 4 WHERE curso_id = 3;
UPDATE professores_cursos SET curso_id = 6 WHERE curso_id = 5;
UPDATE professores_cursos SET curso_id = 8 WHERE curso_id = 7;
UPDATE professores_cursos SET curso_id = 10 WHERE curso_id = 9;
UPDATE professores_cursos SET curso_id = 12 WHERE curso_id = 11;
UPDATE professores_cursos SET curso_id = 14 WHERE curso_id = 13;
UPDATE professores_cursos SET curso_id = 16 WHERE curso_id = 15;
UPDATE professores_cursos SET curso_id = 18 WHERE curso_id = 17;
UPDATE professores_cursos SET curso_id = 20 WHERE curso_id = 19;
UPDATE professores_cursos SET curso_id = 21 WHERE curso_id = 22;
UPDATE professores_cursos SET curso_id = 27 WHERE curso_id = 26;

-- PASSO 5: Migrar unidades_cursos (mesma lógica)
DELETE FROM unidades_cursos uc_ind
WHERE uc_ind.curso_id IN (1,3,5,7,9,11,13,15,17,19,22,26)
  AND EXISTS (
    SELECT 1 FROM unidades_cursos uc_t 
    WHERE uc_t.unidade_id = uc_ind.unidade_id 
      AND uc_t.curso_id = CASE uc_ind.curso_id
        WHEN 1 THEN 2 WHEN 3 THEN 4 WHEN 5 THEN 6 WHEN 7 THEN 8
        WHEN 9 THEN 10 WHEN 11 THEN 12 WHEN 13 THEN 14 WHEN 15 THEN 16
        WHEN 17 THEN 18 WHEN 19 THEN 20 WHEN 22 THEN 21 WHEN 26 THEN 27
      END
  );
UPDATE unidades_cursos SET curso_id = 2 WHERE curso_id = 1;
UPDATE unidades_cursos SET curso_id = 4 WHERE curso_id = 3;
UPDATE unidades_cursos SET curso_id = 6 WHERE curso_id = 5;
UPDATE unidades_cursos SET curso_id = 8 WHERE curso_id = 7;
UPDATE unidades_cursos SET curso_id = 10 WHERE curso_id = 9;
UPDATE unidades_cursos SET curso_id = 12 WHERE curso_id = 11;
UPDATE unidades_cursos SET curso_id = 14 WHERE curso_id = 13;
UPDATE unidades_cursos SET curso_id = 16 WHERE curso_id = 15;
UPDATE unidades_cursos SET curso_id = 18 WHERE curso_id = 17;
UPDATE unidades_cursos SET curso_id = 20 WHERE curso_id = 19;
UPDATE unidades_cursos SET curso_id = 21 WHERE curso_id = 22;
UPDATE unidades_cursos SET curso_id = 27 WHERE curso_id = 26;

-- PASSO 6: Migrar leads.curso_interesse_id
UPDATE leads SET curso_interesse_id = 2 WHERE curso_interesse_id = 1;
UPDATE leads SET curso_interesse_id = 4 WHERE curso_interesse_id = 3;
UPDATE leads SET curso_interesse_id = 6 WHERE curso_interesse_id = 5;
UPDATE leads SET curso_interesse_id = 8 WHERE curso_interesse_id = 7;
UPDATE leads SET curso_interesse_id = 10 WHERE curso_interesse_id = 9;
UPDATE leads SET curso_interesse_id = 12 WHERE curso_interesse_id = 11;
UPDATE leads SET curso_interesse_id = 14 WHERE curso_interesse_id = 13;
UPDATE leads SET curso_interesse_id = 16 WHERE curso_interesse_id = 15;
UPDATE leads SET curso_interesse_id = 18 WHERE curso_interesse_id = 17;
UPDATE leads SET curso_interesse_id = 20 WHERE curso_interesse_id = 19;
UPDATE leads SET curso_interesse_id = 21 WHERE curso_interesse_id = 22;
UPDATE leads SET curso_interesse_id = 27 WHERE curso_interesse_id = 26;

-- PASSO 7: Migrar evasoes_v2, movimentacoes (curso_id e curso_anterior_id)
UPDATE evasoes_v2 SET curso_id = 2 WHERE curso_id = 1;
UPDATE evasoes_v2 SET curso_id = 4 WHERE curso_id = 3;
UPDATE evasoes_v2 SET curso_id = 6 WHERE curso_id = 5;
UPDATE evasoes_v2 SET curso_id = 8 WHERE curso_id = 7;
UPDATE evasoes_v2 SET curso_id = 10 WHERE curso_id = 9;
UPDATE evasoes_v2 SET curso_id = 12 WHERE curso_id = 11;
UPDATE evasoes_v2 SET curso_id = 14 WHERE curso_id = 13;
UPDATE evasoes_v2 SET curso_id = 16 WHERE curso_id = 15;
UPDATE evasoes_v2 SET curso_id = 18 WHERE curso_id = 17;
UPDATE evasoes_v2 SET curso_id = 20 WHERE curso_id = 19;
UPDATE evasoes_v2 SET curso_id = 21 WHERE curso_id = 22;
UPDATE evasoes_v2 SET curso_id = 27 WHERE curso_id = 26;

UPDATE movimentacoes SET curso_id = 2 WHERE curso_id = 1;
UPDATE movimentacoes SET curso_id = 4 WHERE curso_id = 3;
UPDATE movimentacoes SET curso_id = 6 WHERE curso_id = 5;
UPDATE movimentacoes SET curso_id = 8 WHERE curso_id = 7;
UPDATE movimentacoes SET curso_id = 10 WHERE curso_id = 9;
UPDATE movimentacoes SET curso_id = 12 WHERE curso_id = 11;
UPDATE movimentacoes SET curso_id = 14 WHERE curso_id = 13;
UPDATE movimentacoes SET curso_id = 16 WHERE curso_id = 15;
UPDATE movimentacoes SET curso_id = 18 WHERE curso_id = 17;
UPDATE movimentacoes SET curso_id = 20 WHERE curso_id = 19;
UPDATE movimentacoes SET curso_id = 21 WHERE curso_id = 22;
UPDATE movimentacoes SET curso_id = 27 WHERE curso_id = 26;

UPDATE movimentacoes SET curso_anterior_id = 2 WHERE curso_anterior_id = 1;
UPDATE movimentacoes SET curso_anterior_id = 4 WHERE curso_anterior_id = 3;
UPDATE movimentacoes SET curso_anterior_id = 6 WHERE curso_anterior_id = 5;
UPDATE movimentacoes SET curso_anterior_id = 8 WHERE curso_anterior_id = 7;
UPDATE movimentacoes SET curso_anterior_id = 10 WHERE curso_anterior_id = 9;
UPDATE movimentacoes SET curso_anterior_id = 12 WHERE curso_anterior_id = 11;
UPDATE movimentacoes SET curso_anterior_id = 14 WHERE curso_anterior_id = 13;
UPDATE movimentacoes SET curso_anterior_id = 16 WHERE curso_anterior_id = 15;
UPDATE movimentacoes SET curso_anterior_id = 18 WHERE curso_anterior_id = 17;
UPDATE movimentacoes SET curso_anterior_id = 20 WHERE curso_anterior_id = 19;
UPDATE movimentacoes SET curso_anterior_id = 21 WHERE curso_anterior_id = 22;
UPDATE movimentacoes SET curso_anterior_id = 27 WHERE curso_anterior_id = 26;

-- PASSO 8: Renomear cursos T (tirar sufixo)
UPDATE cursos SET nome = 'Musicalização para Bebês' WHERE id = 2;
UPDATE cursos SET nome = 'Musicalização Infantil' WHERE id = 4;
UPDATE cursos SET nome = 'Canto' WHERE id = 6;
UPDATE cursos SET nome = 'Ukulelê' WHERE id = 8;
UPDATE cursos SET nome = 'Violão' WHERE id = 10;
UPDATE cursos SET nome = 'Violino' WHERE id = 12;
UPDATE cursos SET nome = 'Guitarra' WHERE id = 14;
UPDATE cursos SET nome = 'Teclado' WHERE id = 16;
UPDATE cursos SET nome = 'Piano' WHERE id = 18;
UPDATE cursos SET nome = 'Flauta Doce' WHERE id = 20;
UPDATE cursos SET nome = 'Contrabaixo' WHERE id = 21;
UPDATE cursos SET nome = 'Bateria' WHERE id = 27;
UPDATE cursos SET nome = 'Cavaquinho' WHERE id = 35;
UPDATE cursos SET nome = 'Harmonia' WHERE id = 32;
UPDATE cursos SET nome = 'SAX' WHERE id = 31;
UPDATE cursos SET nome = 'Home Studio' WHERE id = 36;
UPDATE cursos SET nome = 'Minha Banda Para Sempre' WHERE id = 33;
UPDATE cursos SET nome = 'Teoria Musical' WHERE id = 34;

-- PASSO 9: Desativar cursos IND (não deletar para manter integridade)
UPDATE cursos SET ativo = false WHERE id IN (1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 22, 26);
