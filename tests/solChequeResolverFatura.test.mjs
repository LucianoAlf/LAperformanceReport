import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const migrationsDir = path.join(root, 'supabase', 'migrations');

function migrationSource() {
  const migrationName = fs.readdirSync(migrationsDir)
    .filter((name) => /_sol_cheque_resolver_fatura\.sql$/u.test(name))
    .sort()
    .at(-1);
  assert.ok(migrationName, 'migration do resolver de cheque ausente');
  return fs.readFileSync(path.join(migrationsDir, migrationName), 'utf8');
}

test('resolver de cheque: assinatura e saida do contrato com o Super Folha', () => {
  const source = migrationSource();

  assert.match(source, /create or replace function public\.sol_cheque_resolver_fatura_v1\s*\(/i);
  assert.match(source, /p_unidade_id\s+uuid/i);
  assert.match(source, /p_emitente_nome\s+text/i);
  assert.match(source, /p_valor\s+numeric/i);
  assert.match(source, /p_bom_para\s+date/i);
  assert.match(source, /p_emitente_documento_hash\s+text/i);
  // a Sol precisa dos dois identificadores que o cheques-sol aceita
  assert.match(source, /emusys_fatura_id/i);
  assert.match(source, /la_report_fatura_id/i);
  // ja_quitada alimenta o retirar_do_malote do Super Folha
  assert.match(source, /ja_quitada/i);
});

test('resolver de cheque: caminhos de resolucao documento, recebimento e nome', () => {
  const source = migrationSource();

  // documento do emitente so via HMAC, nunca CPF em claro
  assert.match(source, /emusys_cpf_hmac_vinculos/i);
  assert.match(source, /calcular_emusys_cpf_hmac/i);
  assert.match(source, /\^\[0-9a-f\]\{64\}\$/);
  // linha de recebimento "<Emitente> (Cheque Pre Datado ...)" carrega fatura_id
  assert.match(source, /financeiro_emusys_lancamentos/i);
  assert.match(source, /conta_descricao\s+is\s+null/i);
  assert.match(source, /forma_pagamento_descricao\s+ilike\s+'%cheque%'/i);
  // nome: guarda de primeiro nome — nunca confunde familia diferente
  assert.match(source, /sol_nome_mesma_pessoa_v1/i);
  assert.match(source, /emusys_pessoas_documentos/i);
  // fallback por valor quando o emitente nao esta no cadastro
  assert.match(source, /cardinality\(v_sids\)\s*=\s*0/i);
});

test('resolver de cheque: seguranca — definer, guarda de papel e grants minimos', () => {
  const source = migrationSource();

  assert.match(source, /security definer/i);
  assert.match(source, /'service_role',\s*'sol_acesso_restrito'/i);
  assert.match(source, /is_admin\(\)/i);
  assert.match(source, /get_user_unidade_ids\(\)/i);
  assert.match(source, /revoke\s+all\s+on\s+function\s+public\.sol_cheque_resolver_fatura_v1\([^)]*\)\s+from\s+public,\s*anon/is);
  assert.match(source, /grant\s+execute\s+on\s+function\s+public\.sol_cheque_resolver_fatura_v1\([^)]*\)\s+to\s+service_role,\s*sol_acesso_restrito,\s*authenticated/is);
});
