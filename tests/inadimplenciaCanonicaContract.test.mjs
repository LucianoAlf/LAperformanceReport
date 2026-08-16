import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const migrations = [
  path.join(root, 'supabase', 'migrations', '20260816003732_inadimplencia_canonica_frescor.sql'),
  path.join(root, 'supabase', 'migrations', '20260816004257_inadimplencia_canonica_dedupe_global.sql'),
  path.join(root, 'supabase', 'migrations', '20260816013502_inadimplencia_canonica_quarentena_identidade.sql'),
  path.join(root, 'supabase', 'migrations', '20260816020631_inadimplencia_canonica_vencimento_estrito.sql'),
  path.join(root, 'supabase', 'migrations', '20260816115755_inadimplencia_canonica_ignora_competencia_futura.sql'),
  path.join(root, 'supabase', 'migrations', '20260816125329_inadimplencia_canonica_ativos_janela_tres.sql'),
  path.join(root, 'supabase', 'migrations', '20260816150000_inadimplencia_canonica_liberacao_parcial_v3.sql'),
];

function sql() {
  return migrations.map((migration) => fs.readFileSync(migration, 'utf8')).join('\n');
}

function effectiveSql() {
  return fs.readFileSync(migrations.at(-1), 'utf8');
}

function remoteLedgerStatementBytes(migration) {
  const normalizedLf = fs.readFileSync(migration, 'utf8').replace(/\r\n?/g, '\n');
  return Buffer.concat([Buffer.from(normalizedLf, 'utf8'), Buffer.from('\r\n')]);
}

test('published canonical migrations retain their ledger MD5 checksums', () => {
  const expectedRemoteMd5 = new Map([
    ['20260816003732_inadimplencia_canonica_frescor.sql', '820ece01b47640f467cb42963b2731b3'],
    ['20260816004257_inadimplencia_canonica_dedupe_global.sql', 'badcb830c5475154f83a6dddf8c9af43'],
  ]);

  for (const migration of migrations.slice(0, 2)) {
    assert.equal(
      createHash('md5').update(remoteLedgerStatementBytes(migration)).digest('hex'),
      expectedRemoteMd5.get(path.basename(migration)),
      `drift detectado em ${path.basename(migration)}`,
    );
  }
});

test('effective canonical migration is the v3 partial-release contract', () => {
  const effectiveMigration = migrations.at(-1);
  assert.equal(
    path.basename(effectiveMigration),
    '20260816150000_inadimplencia_canonica_liberacao_parcial_v3.sql',
  );
  assert.equal(fs.existsSync(effectiveMigration), true, 'migration canonica v3 ausente');
});

test('canonical delinquency reader exposes freshness and a fail-closed status', () => {
  const source = sql();
  assert.match(source, /get_inadimplencia_canonica\s*\(/);
  assert.match(source, /'status'/);
  assert.match(source, /'freshness'/);
  assert.match(source, /'fresh_until'/);
  assert.match(source, /'stale'/);
  assert.match(source, /'items'/);
  assert.match(source, /then\s*'\[\]'::jsonb|jsonb_build_object\([^;]*'items'/is);
});

test('canonical v3 reader is unit-scoped, strict about identity, and centralizes contract interest', () => {
  const source = effectiveSql();
  assert.match(source, /'schema_version',\s*3/i);
  assert.match(source, /'partial'/i);
  assert.match(source, /'collection_allowed'/i);
  assert.match(source, /'collection_scope'/i);
  assert.match(source, /'block_reasons'/i);
  assert.match(source, /vw_alunos_estado_operacional_v131/i);
  assert.match(source, /entra_financeiro_ativo\s+is\s+true/i);
  assert.match(source, /source_missing_open_count/i);
  assert.match(source, /source_missing_other_count/i);
  assert.match(source, /duplicate_confirmed_fatura/i);
  assert.match(source, /invalid_invoice_identity/i);
  assert.match(source, /grupos_fatura_todos/i);
  assert.match(source, /status_nao_suportado/i);
  assert.match(source, /unsupported_invoice_status/i);
  assert.match(source, /'error'\s*,\s*case[\s\S]*?then\s+'unsupported_invoice_status'/i);
  assert.match(source, /canonical_fatura_id/);
  assert.match(source, /emusys_fatura_id/);
  assert.match(source, /emusys_matricula_id/);
  assert.match(source, /source_missing\s+is\s+false/i);
  assert.match(source, /valor_original/);
  assert.match(source, /0\.02/);
  assert.match(source, /0\.01/);
  assert.match(source, /data_vencimento/);
  assert.match(source, /data_vencimento\s*<\s*p_as_of_date/i);
  assert.doesNotMatch(source, /data_vencimento\s*<=\s*p_as_of_date/i);
  assert.match(source, /valor_atualizado/);
  assert.match(source, /partition\s+by\s+\w+\.unidade_id\s*,\s*\w+\.canonical_fatura_id/i);
  assert.doesNotMatch(source, /partition\s+by\s+\w+\.canonical_fatura_id\s*(?:\)|order)/i);
  assert.match(source, /duplicatas_canonicas/i);
});

test('canonical reader exposes unknown source_missing rows instead of calling them paid', () => {
  const source = effectiveSql();
  assert.match(source, /source_missing.*true|is\s+true.*source_missing/is);
  assert.match(source, /incomplete|reconciliation|reconcili/i);
  assert.doesNotMatch(source, /source_missing[^\n]*pago|pago[^\n]*source_missing/i);
});

test('canonical reader quarantines invalid unit-scoped invoice identity instead of charging it', () => {
  const source = effectiveSql();
  const compactSource = source.replace(/\s+/g, ' ');
  assert.match(source, /invalid_invoice_identity/i);
  assert.match(source, /emusys_matricula_id\s+is\s+null/i);
  assert.doesNotMatch(compactSource, /\b(?:nome|aluno_nome)\b.*?(?:=|is not distinct from).*?\b(?:nome|aluno_nome)\b/i);
  assert.doesNotMatch(compactSource, /\bor\s*\(\s*i\.emusys_matricula_id\s+is\s+null\s+and\s+i\.emusys_student_id\s+is\s+not\s+null/i);
});

test('canonical reader limits collection by operational state, financial scope, and three current competencies', () => {
  const source = effectiveSql();
  assert.match(source, /janela_competencias/i);
  assert.match(source, /interval\s+'2 months'/i);
  assert.match(source, /vw_alunos_estado_operacional_v131/i);
  assert.match(source, /entra_financeiro_ativo\s+is\s+true/i);
  assert.match(source, /a\.arquivado_em\s+is\s+null/i);
  assert.match(source, /a\.data_saida\s+is\s+null/i);
  assert.match(source, /i\.competencia\s+between\s+jc\.inicio\s+and\s+jc\.fim/i);
});

test('canonical reader has explicit authenticated/service-role authorization and no Sol operational RPCs', () => {
  const source = effectiveSql();
  assert.match(source, /security\s+definer/i);
  assert.match(source, /auth\.role\(\)/i);
  assert.match(source, /get_user_unidade_ids/i);
  assert.match(source, /service_role/i);
  for (const forbidden of [
    'sol_caixa_lancar_recebimento',
    'sol_caixa_abrir',
    'sol_caixa_fechar',
    'sol_caixa_casar_parcela',
  ]) {
    assert.doesNotMatch(source, new RegExp(forbidden));
  }
});

test('canonical reader fixes the public signature, BRT default, and explicit grants', () => {
  const source = effectiveSql();
  assert.match(source, /get_inadimplencia_canonica\s*\(\s*p_unidade_id\s+uuid\s+default\s+null\s*,\s*p_as_of_date\s+date\s+default\s+\(now\(\)\s+at\s+time\s+zone\s+'America\/Sao_Paulo'\)::date/is);
  assert.match(source, /revoke\s+all\s+on\s+function\s+public\.get_inadimplencia_canonica\(uuid,\s*date\)\s+from\s+public,\s*anon/is);
  assert.match(source, /grant\s+execute\s+on\s+function\s+public\.get_inadimplencia_canonica\(uuid,\s*date\)\s+to\s+authenticated,\s*service_role/is);
});
