import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = new URL(
  '../supabase/migrations/20260808193000_health_score_v3_cron_diario_idempotente.sql',
  import.meta.url,
);

async function migration() {
  try {
    await access(migrationPath);
    return await readFile(migrationPath, 'utf8');
  } catch {
    return '';
  }
}

test('cron diario registra fingerprint e evita nova revisao quando o retrato nao muda', async () => {
  const sql = await migration();

  assert.match(sql, /health_score_professor_v3_materializacao_execucoes/i);
  assert.match(sql, /fingerprint_fonte\s+text\s+not null/i);
  assert.match(sql, /'sem_alteracao'/i);
  assert.match(sql, /jsonb_agg\([\s\S]*order by[\s\S]*professor_id[\s\S]*metrica/i);
  assert.match(sql, /if v_fingerprint_atual is not distinct from v_fingerprint_anterior then[\s\S]*'sem_alteracao'/i);
});

test('cron usa somente as tres unidades reais, mais o consolidado explicito', async () => {
  const sql = await migration();

  assert.match(sql, /from public\.unidades[\s\S]*where ativo/i);
  assert.match(sql, /order by id/i);
  assert.match(sql, /'unidade'[\s\S]*v_unidade\.id/i);
  assert.match(sql, /'consolidado'[\s\S]*null::uuid/i);
  assert.doesNotMatch(sql, /materializar_health_score_professor_v3_periodo\([^)]*null::uuid/i);
  assert.match(sql, /where f\.escopo is distinct from v_escopo[\s\S]*or f\.unidade_id is distinct from v_unidade_id[\s\S]*HEALTH_SCORE_V3_ESCOPO_DIVERGENTE/i);
});

test('cron fica restrito ao mes aberto e usa teto explicito de 600 segundos', async () => {
  const sql = await migration();

  assert.match(sql, /date_trunc\('month',\s*current_date\)::date/i);
  assert.match(sql, /set_config\('statement_timeout',\s*'600s',\s*true\)/i);
  assert.doesNotMatch(sql, /statement_timeout',\s*'0'/i);
  assert.doesNotMatch(sql, /estado\s*=\s*'fechado'/i);
  assert.doesNotMatch(sql, /estado_publicacao\s*=\s*'oficial'/i);
});

test('cron nao infere destinatario de alerta por um e-mail Hugo nao homologado', async () => {
  const sql = await migration();

  assert.doesNotMatch(sql, /hugo@gmail\.com/i);
  assert.match(sql, /health_score_professor_v3_alerta_url/i);
  assert.match(sql, /values\s*\('health_score_professor_v3_falha',\s*false,\s*0,\s*0\)/i);
});
