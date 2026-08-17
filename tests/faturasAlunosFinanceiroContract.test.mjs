import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const migrationsDir = path.join(root, 'supabase', 'migrations');

function migrationSource() {
  const migrationName = fs.readdirSync(migrationsDir)
    .filter((name) => /_financeiro_faturas_alunos_v2\.sql$/u.test(name))
    .sort()
    .at(-1);
  assert.ok(migrationName, 'migration de faturas financeiras v2 ausente');
  return fs.readFileSync(path.join(migrationsDir, migrationName), 'utf8');
}

test('contrato financeiro v2 centraliza os tres valores da fatura', () => {
  const source = migrationSource();

  assert.match(source, /calcular_valores_fatura_financeiro_v1\s*\(/i);
  assert.match(source, /p_desconto_fixo\s+numeric/i);
  assert.match(source, /p_desconto_condicional\s+numeric/i);
  assert.match(source, /valor_com_desconto/i);
  assert.match(source, /valor_sem_desconto_condicional/i);
  assert.match(source, /valor_hoje/i);
  assert.match(source, /p_data_vencimento\s*<\s*p_as_of_date/i);
  assert.match(source, /\*\s*0\.02/i);
  assert.match(source, /\*\s*0\.01/i);
  assert.match(source, /coalesce\(p_desconto_fixo,\s*0\)/i);
  assert.match(source, /coalesce\(p_desconto_condicional,\s*0\)/i);
});

test('leitura global usa snapshots completos, identidade por unidade e grants explicitos', () => {
  const source = migrationSource();

  assert.match(source, /get_faturas_alunos_financeiro_v1\s*\(/i);
  assert.match(source, /p_unidade_id\s+uuid/i);
  assert.match(source, /p_modo_periodo\s+text/i);
  assert.match(source, /p_status\s+text/i);
  assert.match(source, /sync_runs/i);
  assert.match(source, /snapshot_complete\s+is\s+true/i);
  assert.match(source, /unidades_concluidas\s*=\s*3/i);
  assert.match(source, /unidade_id[\s\S]{0,180}emusys_matricula_id/i);
  assert.match(source, /forma_pagamento_transacao/i);
  assert.match(source, /Forma n[aã]o informada/i);
  assert.match(source, /source_missing/i);
  assert.match(source, /cobranca_d2/i);
  assert.match(source, /revoke\s+all\s+on\s+function\s+public\.get_faturas_alunos_financeiro_v1\(uuid,\s*integer,\s*integer,\s*text,\s*text,\s*date\)\s+from\s+public,\s*anon/is);
  assert.match(source, /grant\s+execute\s+on\s+function\s+public\.get_faturas_alunos_financeiro_v1\(uuid,\s*integer,\s*integer,\s*text,\s*text,\s*date\)\s+to\s+authenticated,\s*service_role/is);
  for (const forbidden of [
    'sol_caixa_lancar_recebimento',
    'sol_caixa_abrir',
    'sol_caixa_fechar',
    'sol_caixa_casar_parcela',
  ]) {
    assert.doesNotMatch(source, new RegExp(forbidden));
  }
});

test('carteira D+2 continua consumindo a mesma formula financeira compartilhada', () => {
  const source = migrationSource();

  assert.match(source, /get_inadimplencia_canonica_v3_base/i);
  assert.match(source, /alter\s+function\s+public\.get_inadimplencia_canonica\(uuid,\s*date\)\s+rename\s+to\s+get_inadimplencia_canonica_v3_base/is);
  assert.match(source, /create\s+or\s+replace\s+function\s+public\.get_inadimplencia_canonica\s*\(/is);
  assert.match(source, /calcular_valores_fatura_financeiro_v1\s*\(/i);
  assert.match(source, /\{totals,total_atualizado\}/i);
});
