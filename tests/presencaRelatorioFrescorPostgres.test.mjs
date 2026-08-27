import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migration = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260827031000_presenca_pendencias_canonicas_v2.sql',
);
const edge = join(
  process.cwd(),
  'supabase',
  'functions',
  'relatorio-admin-whatsapp',
  'index.ts',
);

test('relatorio de presenca bloqueia texto conclusivo quando o dado nao e publicavel', () => {
  assert.equal(existsSync(migration), true, 'migration presenca_pendencias_canonicas_v2 ausente');
  const sql = readFileSync(migration, 'utf8');
  assert.match(sql, /dados_desatualizados/iu);
  assert.match(sql, /roster_em_revisao/iu);
  assert.match(sql, /Dados sincronizados/iu);
  assert.match(sql, /fn_texto_relatorio_presenca_consolidado/iu);
  assert.match(sql, /fn_enfileirar_relatorio_presenca/iu);
  assert.match(sql, /create or replace function public\.fn_enfileirar_relatorio_presenca_se_coberto_v1/iu);
  assert.match(sql, /return public\.fn_enfileirar_relatorio_presenca\(p_data, false\)/iu);
  assert.match(sql, /from public\.unidades u/iu);
  assert.doesNotMatch(
    sql,
    /from\s+public\.fn_presenca_pendencias_do_dia\s*\(/iu,
    'a migration v2 nao pode manter a regra antiga como fonte do relatorio',
  );
  const edgeSource = readFileSync(edge, 'utf8');
  assert.match(edgeSource, /get_presenca_contexto_agente_v1\s*\(\s*escopo\s*=\s*sol\s*\)\s*->\s*fn_texto_relatorio_presenca/iu);
  assert.doesNotMatch(edgeSource, /\.from\(\s*['"]aluno_presenca['"]\s*\)/iu);
});
