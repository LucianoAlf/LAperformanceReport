-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ============================================================
-- Backfill de emusys_student_id a partir do snapshot da REST API
-- 79 alunos ativos/trancados com emusys_student_id NULL mas com
-- emusys_aluno_id no emusys_matriculas_estado_atual.
-- Join por (emusys_matricula_id, unidade_id) — sem unidade_id
-- o matricula_id colide entre unidades (ID 836 existe em CG/BARRA/REC).
-- ============================================================

-- 1. Tabela de auditoria (se nao existir)
CREATE TABLE IF NOT EXISTS migrations_audit_data_nascimento (
  id serial primary key,
  migration_name text not null,
  aluno_id integer not null,
  campo text not null,
  valor_antigo text,
  valor_novo text,
  created_at timestamptz default now()
);

-- 2. Backfill: UPDATE com join por matricula_id + unidade_id
WITH atualizados AS (
  UPDATE alunos a
     SET emusys_student_id = e.emusys_aluno_id::text,
         updated_at = now()
    FROM emusys_matriculas_estado_atual e
   WHERE e.emusys_matricula_id::text = a.emusys_matricula_id
     AND e.unidade_id = a.unidade_id
     AND a.status IN ('ativo','trancado')
     AND a.emusys_matricula_id IS NOT NULL
     AND a.emusys_student_id IS NULL
     AND e.emusys_aluno_id IS NOT NULL
  RETURNING a.id as aluno_id, e.emusys_aluno_id::text as novo_id
)
INSERT INTO migrations_audit_data_nascimento (migration_name, aluno_id, campo, valor_antigo, valor_novo)
SELECT 'backfill_emusys_student_id_do_snapshot', aluno_id, 'emusys_student_id', NULL, novo_id
  FROM atualizados;
