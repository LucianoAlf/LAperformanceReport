import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20260822233000_sol_caixa_composto_e_abrir_fechar_v3.sql'), 'utf8');
const compostoPorPessoaSql = fs.readFileSync(path.join(root, 'supabase/migrations/20260822234500_sol_caixa_composto_por_pessoa_v1.sql'), 'utf8');
const candidatasDoDiaSql = fs.readFileSync(path.join(root, 'supabase/migrations/20260822240000_sol_caixa_composto_candidatas_do_dia_v1.sql'), 'utf8');
const harness = fs.readFileSync(path.join(root, 'tests/sql/sol_caixa_v3_harness.sql'), 'utf8');

test('Caixa V3: composto usa envelope canônico e falha fechado na ambiguidade', () => {
  assert.match(sql, /sol_faturas_alunos_v1/i);
  assert.doesNotMatch(sql, /from\s+public\.emusys_faturas/i);
  assert.match(sql, /composicao_ambigua/i);
  assert.match(sql, /composicao_exige_duas_faturas/i);
  assert.match(sql, /'aluno_id'.*'canonical_fatura_id'/is);
  assert.match(sql, /tipo_fatura[^\n]+in \('parcela','passaporte_taxa_matricula','matricula'\)/i);
  assert.doesNotMatch(sql, /else 'parcela'/i);
});

test('Caixa V3: composto resolve pessoa por student_id e preserva matrícula por item', () => {
  assert.match(compostoPorPessoaSql, /emusys_student_id/i);
  assert.match(compostoPorPessoaSql, /group by emusys_student_id/i);
  assert.match(compostoPorPessoaSql, /'aluno_id',\s*\(x->'aluno'->>'id'\)::integer/is);
  assert.doesNotMatch(compostoPorPessoaSql, /'aluno_id',\s*v_aluno_id/is);
  assert.match(harness, /pagas anteriores não deveriam tornar matrículas da mesma pessoa ambíguas/i);
  assert.match(harness, /pessoas distintas com mesmo nome deveriam bloquear/i);
});

test('Caixa V3: composto só considera abertas ou pagas no próprio dia', () => {
  assert.match(candidatasDoDiaSql, /x->>'status'\s*=\s*'aberta'/i);
  assert.match(candidatasDoDiaSql, /x->>'status'\s*=\s*'paga'[\s\S]*data_pagamento[\s\S]*=\s*v_as_of/i);
  assert.doesNotMatch(candidatasDoDiaSql, /coalesce\(x->>'status',''\)\s*<>\s*'cancelada'/i);
  assert.match(harness, /pagas anteriores não deveriam tornar matrículas da mesma pessoa ambíguas/i);
  assert.match(harness, /só paga hoje pode compor com cobrança aberta/i);
});

test('Caixa V3: abrir/fechar somente consome approval após revalidar snapshot', () => {
  const execution = sql.slice(sql.indexOf('create or replace function public.sol_caixa_executar_abertura_fechamento_v3'));
  assert.match(execution, /pg_advisory_xact_lock/i);
  assert.match(execution, /sol_caixa_validar_abertura_fechamento_v1/i);
  assert.match(execution, /sol_caixa_snapshot_abertura_fechamento_v3/i);
  assert.ok(execution.indexOf('v_atual := public.sol_caixa_snapshot_abertura_fechamento_v3') < execution.indexOf('insert into public.sol_caixa_v3_approval_consumos_v1'));
  assert.ok(execution.indexOf('update public.caixas_diarios') < execution.indexOf('insert into public.sol_caixa_v3_approval_consumos_v1'));
  assert.match(execution, /on conflict \(unidade_id,data_caixa\) do nothing/i);
  assert.match(sql, /movimentos_por_ambiente/i);
  assert.match(sql, /interval '4 hours'/i);
  assert.match(sql, /America\/Sao_Paulo/i);
  assert.match(sql, /extensions\.digest\(/i);
  assert.doesNotMatch(sql, /(?<![\w.])digest\(/i);
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
  assert.match(harness, /corrida queimou approval sem mutação/i);
});
