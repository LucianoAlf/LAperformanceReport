import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(
  root,
  'supabase/migrations/20260804090000_lia_followup_72h_fase_b.sql',
);
const fixturePath = resolve(
  root,
  'tests/fixtures/lia_followup_72h_fase_b_pg17.sql',
);
const read = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';
const sql = read(migrationPath);
const fixture = read(fixturePath);

test('fase B nasce desligada e nao cria novo cron de transporte', () => {
  assert.match(sql, /followup_72h_liberado\s+boolean\s+not null\s+default false/i);
  assert.doesNotMatch(sql, /cron\.schedule/i);
  assert.match(sql, /interval '72 hours'/i);
  assert.match(sql, /America\/Sao_Paulo/i);
});

test('estado exclui teste, resposta valida e opt-out', () => {
  assert.match(sql, /modo_teste\s*=\s*false/i);
  assert.match(sql, /resposta_valida\s*=\s*false/i);
  assert.match(sql, /opt_out_em\s+is null/i);
  assert.match(sql, /recusada_opt_out/i);
});

test('resumo e privado, diario e idempotente por operador', () => {
  assert.match(sql, /create table public\.lia_followup_resumos/i);
  assert.match(sql, /create table public\.lia_followup_resumo_itens/i);
  assert.match(sql, /operador_usuario_id/i);
  assert.match(sql, /limit 10/i);
  assert.match(sql, /data_corte_brt/i);
  assert.match(sql, /time '09:00'/i);
  assert.match(sql, /followup_3d_operador:/i);
  assert.match(sql, /YYYYMMDD/i);
  assert.doesNotMatch(sql, /YYYYMMDDHH24/i);
  assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /usuarios\.telefone/i);
});

test('acao manual resolve o operador pelo JWT', () => {
  assert.match(sql, /registrar_followup_pesquisa_evasao_v1/i);
  assert.match(sql, /auth\.uid\(\)/i);
  assert.match(sql, /fn_pesquisa_evasao_usuario_interno_ativo/i);
  assert.match(sql, /acao in \('realizado', 'dispensado'\)/i);
});

test('fixture executavel cobre prazo diario concorrencia e isolamento', () => {
  assert.ok(fixture, `fixture ausente: ${fixturePath}`);
  for (const evidence of [
    /EZEQUIEL_DUE_AT_72H_OK/,
    /EZEQUIEL_NEXT_DAILY_SUMMARY_OK/,
    /AFTER_NINE_WAITS_NEXT_DAY_OK/,
    /DAILY_IDEMPOTENCY_OK/,
    /NON_SUBSTANTIVE_STAYS_PENDING_OK/,
    /OPT_OUT_BLOCKS_FOLLOWUP_OK/,
    /RESPONSE_BEFORE_CLAIM_CANCELS_OK/,
    /OPERATOR_ISOLATION_OK/,
    /MANUAL_ACTION_AUDIT_OK/,
    /LIA_FOLLOWUP_72H_FASE_B_PG17_OK/,
  ]) assert.match(fixture, evidence);
});

test(
  'fixture executavel passa em PostgreSQL 17 isolado',
  { skip: !process.env.PESQUISA_EVASAO_PG17_CONTAINER },
  async () => {
    const { runPesquisaEvasaoPg17Fixture } = await import(
      './helpers/runPesquisaEvasaoPg17Fixture.mjs'
    );
    const result = runPesquisaEvasaoPg17Fixture({
      container: process.env.PESQUISA_EVASAO_PG17_CONTAINER,
      fixturePath: '/workspace/tests/fixtures/lia_followup_72h_fase_b_pg17.sql',
    });
    assert.match(result.stdout, /LIA_FOLLOWUP_72H_FASE_B_PG17_OK/);
  },
);
