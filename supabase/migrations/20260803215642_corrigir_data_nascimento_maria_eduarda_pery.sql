-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Maria Eduarda Pery Natividade (aluno id 1398, CG, matricula Emusys 2173, aluno.id 3073)
-- Banco tinha 2003-03-31; Emusys (REST API GET /matriculas e tela do sistema) tem 2003-05-31.
-- Divergencia de mes (03<->05), dia igual (31). Nao e o padrao do bug responsavel->aluno.
-- Evidencia: GET /matriculas CG retornou aluno.data_nascimento='2003-05-31' para matricula 2173
-- e a tela Dados Pessoais do Emusys mostra '31/05/2003 - Idade: 23 anos'.

INSERT INTO migrations_audit_data_nascimento (migration_name, aluno_id, campo, valor_antigo, valor_novo)
SELECT 'corrigir_data_nascimento_maria_eduarda_pery', id, 'data_nascimento', data_nascimento::text, '2003-05-31'
FROM alunos
WHERE id = 1398 AND data_nascimento = '2003-03-31';

UPDATE alunos
SET data_nascimento = '2003-05-31'
WHERE id = 1398 AND data_nascimento = '2003-03-31';
