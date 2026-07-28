import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260727124000_health_score_v3_origem_segmentada_ciclo_aberto.sql';

function migration() {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  return readFileSync(migrationPath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\r\n]*/g, '');
}

test('origem ativa pode pertencer a outro ciclo, mas o destino continua Jun-Ago', () => {
  const sql = migration();

  assert.match(
    sql,
    /v_origem\.status\s*<>\s*'ativa'/i,
    'a origem precisa continuar ativa',
  );
  assert.doesNotMatch(
    sql,
    /v_origem\.vigencia_inicio[\s\S]{0,160}origem deve cobrir exatamente Jun-Ago/i,
    'a origem segmentada nao pode ser limitada ao mesmo ciclo do destino',
  );
  assert.match(
    sql,
    /p_vigencia_inicio\s+is\s+distinct\s+from\s+date\s+'2026-06-01'/i,
  );
  assert.match(
    sql,
    /p_vigencia_fim\s+is\s+distinct\s+from\s+date\s+'2026-08-31'/i,
  );
});

test('criacao bloqueia matriz vazia ou segmento pedagogico formal sem regra', () => {
  const sql = migration();

  assert.match(sql, /v_metas_pedagogicas\s*=\s*0/i);
  assert.match(sql, /v_segmentos_faltantes\s*>\s*0/i);
  assert.match(
    sql,
    /professor_unidade_curso_modalidade/i,
    'o gate deve partir das atribuicoes formais',
  );
  assert.match(sql, /natureza_operacional\s*=\s*'pedagogica'/i);
  assert.match(
    sql,
    /m\.estado\s*=\s*'configurada'/i,
    'atribuicao formal ativa exige meta configurada, nao nao_ofertada',
  );
});

test('clone preserva somente a matriz pedagogica e nao escreve snapshots', () => {
  const sql = migration();

  assert.match(
    sql,
    /insert\s+into\s+public\.health_score_professor_v3_config_metas_curso_modalidade/i,
  );
  assert.match(
    sql,
    /join\s+public\.cursos[\s\S]*natureza_operacional\s*=\s*'pedagogica'/i,
  );
  assert.doesNotMatch(
    sql,
    /\b(?:insert\s+into|update|delete\s+from)\s+public\.health_score_professor_v3_snapshot/i,
  );
});

test('RPC substituida mantem search_path e ACL governada', () => {
  const sql = migration();

  assert.match(sql, /security\s+definer/i);
  assert.match(sql, /set\s+search_path\s*=\s*public,\s*pg_temp/i);
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.criar_health_score_professor_v3_config_revisao_ciclo_aberto[\s\S]*from\s+public,\s*anon/i,
  );
  assert.match(
    sql,
    /grant\s+execute\s+on\s+function\s+public\.criar_health_score_professor_v3_config_revisao_ciclo_aberto[\s\S]*to\s+authenticated,\s*service_role/i,
  );
});
