import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { getReconciliationGuidance } from '../src/lib/faturasAlunosReconciliacao.ts';

const root = process.cwd();

const reconciliationItem = (overrides = {}) => ({
  motivos: ['source_missing'],
  status: 'aberta',
  aluno: {
    id: 42,
    nome: 'Daniel Valeriano Motta',
    estado_operacional: 'ativo',
  },
  forma_pagamento: {
    nome: null,
    fonte: 'ausente',
  },
  ...overrides,
});

test('source_missing de aluno ativo vira decisão operacional legível', () => {
  const guidance = getReconciliationGuidance(reconciliationItem());

  assert.equal(guidance.kind, 'decision');
  assert.equal(guidance.title, 'Confirme o que aconteceu com esta fatura');
  assert.match(guidance.instruction, /registre a decisão aqui/i);
  assert.deepEqual(guidance.options.map((option) => option.value), [
    'pagamento_confirmado',
    'renovacao',
    'trancamento',
    'ultima_parcela_aviso_previo',
    'conferido_sem_cobranca',
  ]);
});

test('forma de pagamento ausente vira edição inline e não decisão de pagamento', () => {
  const guidance = getReconciliationGuidance(reconciliationItem({
    motivos: ['forma_pagamento_ausente'],
  }));

  assert.equal(guidance.kind, 'payment_method');
  assert.equal(guidance.title, 'Informe a forma de pagamento');
  assert.match(guidance.instruction, /não altera o status da fatura/i);
});

test('histórico de ex-aluno e lançamento avulso ficam fora da fila operacional', () => {
  for (const motivo of ['historico_ex_aluno', 'registro_nao_aluno']) {
    const guidance = getReconciliationGuidance(reconciliationItem({ motivos: [motivo] }));
    assert.equal(guidance.kind, 'outside_operation');
  }
});

test('migration cria decisão auditável e não permite reescrever histórico da origem', () => {
  const migrationName = fs.readdirSync(path.join(root, 'supabase', 'migrations'))
    .find((name) => /financeiro_faturas_reconciliacao_decisoes/u.test(name));
  assert.ok(migrationName, 'migration de decisões de reconciliação ausente');
  const source = fs.readFileSync(path.join(root, 'supabase', 'migrations', migrationName), 'utf8');

  assert.match(source, /financeiro_fatura_reconciliacao_decisoes/i);
  assert.match(source, /resolver_reconciliacao_fatura/i);
  assert.match(source, /emusys_fatura_id/i);
  assert.match(source, /unidade_id/i);
  assert.match(source, /matriculas_campos_fixados/i);
  assert.match(source, /update public\.alunos/i);
  assert.match(source, /source_missing/i);
  assert.match(source, /create or replace function public\.get_faturas_alunos_financeiro_v1/i);
  assert.match(source, /historico_ex_aluno/i);
  assert.match(source, /registro_nao_aluno/i);
  assert.match(source, /fora_operacao/i);
  assert.match(source, /resolvidas_manualmente/i);
  assert.match(source, /raise exception/i);
});

test('pagina oferece decisão manual e seleção do design system para forma de pagamento', () => {
  const page = fs.readFileSync(path.join(root, 'src', 'components', 'App', 'FaturasAlunos', 'FaturasAlunosFinanceirasPage.tsx'), 'utf8');

  assert.match(page, /resolver_reconciliacao_fatura/);
  assert.match(page, /formas_pagamento/);
  const guidance = fs.readFileSync(path.join(root, 'src', 'lib', 'faturasAlunosReconciliacao.ts'), 'utf8');
  assert.match(guidance, /Pagamento confirmado pela unidade/);
  assert.match(guidance, /Renovação/);
  assert.match(page, /Registrar decisão/);
  assert.match(page, /Forma de pagamento/);
  assert.match(page, /<SelectTrigger/);
  assert.doesNotMatch(page, /<select\b/);
});
