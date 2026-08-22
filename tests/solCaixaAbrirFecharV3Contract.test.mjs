import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20260822233000_sol_caixa_composto_e_abrir_fechar_v3.sql'), 'utf8');
const harness = fs.readFileSync(path.join(root, 'tests/sql/sol_caixa_v3_harness.sql'), 'utf8');

test('Caixa V3: composto usa envelope canônico e falha fechado na ambiguidade', () => {
  assert.match(sql, /sol_faturas_alunos_v1/i);
  assert.doesNotMatch(sql, /from\s+public\.emusys_faturas/i);
  assert.match(sql, /composicao_ambigua/i);
  assert.match(sql, /composicao_exige_duas_faturas/i);
  assert.match(sql, /'aluno_id'.*'canonical_fatura_id'/is);
});

test('Caixa V3: abrir/fechar somente consome approval após revalidar snapshot', () => {
  const execution = sql.slice(sql.indexOf('create or replace function public.sol_caixa_executar_abertura_fechamento_v3'));
  assert.match(execution, /pg_advisory_xact_lock/i);
  assert.match(execution, /sol_caixa_validar_abertura_fechamento_v1/i);
  assert.match(execution, /sol_caixa_snapshot_abertura_fechamento_v3/i);
  assert.ok(execution.indexOf('v_atual := public.sol_caixa_snapshot_abertura_fechamento_v3') < execution.indexOf('insert into public.sol_caixa_v3_approval_consumos_v1'));
  assert.match(sql, /movimentos_por_ambiente/i);
  assert.match(sql, /interval '4 hours'/i);
  assert.match(sql, /America\/Sao_Paulo/i);
});

test('Caixa V3: escopo de reabertura e grants seguem fail-closed', () => {
  assert.match(sql, /Reabertura fica explicitamente fora/i);
  for (const fn of ['sol_caixa_abrir_v3', 'sol_caixa_fechar_v3', 'sol_caixa_resolver_composto_aluno_v1']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}\\([^\\n]+from public, anon, authenticated`, 'i'));
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}`, 'i'));
  }
});

test('Caixa V3: harness SQL é transacional e cobre os contratos críticos', () => {
  assert.match(harness, /current_database\(\)\s*!~\s*'_test\$'/i);
  assert.match(harness, /^begin;/im);
  assert.match(harness, /^rollback;/im);
  for (const scenario of ['duas parcelas', 'pagador/responsável', 'parcela+passaporte', 'ambíguo', 'João/Pedro', 'Abrir/fechar']) {
    assert.ok(harness.toLowerCase().includes(scenario.toLowerCase()), `harness sem cenário ${scenario}`);
  }
});
