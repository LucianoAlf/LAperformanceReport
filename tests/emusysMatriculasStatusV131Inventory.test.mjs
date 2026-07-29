import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const baselinePath = 'docs/auditorias/2026-07-29-emusys-matriculas-v131-baseline.md';

const read = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('baseline registra o grao e os quatro estados canonicos por unidade', () => {
  const baseline = read(baselinePath);

  assert.ok(baseline, 'baseline read-only ainda nao foi criado');
  assert.match(baseline, /unidade_id\s*\+\s*emusys_matricula_id/i);
  assert.match(baseline, /ativa[\s\S]*trancada[\s\S]*inativa\s*\/\s*interrompida[\s\S]*inativa\s*\/\s*concluida/i);
  assert.match(baseline, /Barra[\s\S]*Campo Grande[\s\S]*Recreio/i);
});

test('inventario cobre todas as familias de consumidores vivos', () => {
  const baseline = read(baselinePath);

  for (const consumer of [
    'Administrativo',
    'Alunos',
    'Dashboard',
    'Analytics',
    'Professores',
    'Sucesso do Aluno',
    'LA Teacher',
    'Fabio',
    'Relatorios',
    'Health Score',
    'Churn',
  ]) {
    assert.match(baseline, new RegExp(consumer, 'i'), `consumidor sem inventario: ${consumer}`);
  }
});

test('baseline separa estado atual de movimento no periodo', () => {
  const baseline = read(baselinePath);

  assert.match(baseline, /Trancados agora/i);
  assert.match(baseline, /Trancamentos no per[ií]odo/i);
  assert.match(baseline, /nao compartilham denominador/i);
});
