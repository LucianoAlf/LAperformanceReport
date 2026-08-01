import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readOrEmpty = async (relativePath) => {
  try {
    return await readFile(new URL(relativePath, import.meta.url), 'utf8');
  } catch {
    return '';
  }
};

const edge = await readOrEmpty(
  '../supabase/functions/relatorio-admin-whatsapp/index.ts',
);
const migration = await readOrEmpty(
  '../supabase/migrations/20260731234500_relatorio_comercial_service_role_preview.sql',
);
const cron = await readOrEmpty(
  '../scripts/send-lareport-comercial-hermes.py',
);

function section(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `início ausente: ${start}`);
  assert.ok(endIndex > startIndex, `fim ausente: ${end}`);
  return source.slice(startIndex, endIndex);
}

test('preview comercial interno usa o mesmo guard escopado do usuário', () => {
  const dryRun = section(
    edge,
    "if (payload.modo === 'dry_run_comercial') {",
    '// === MODO CRON ===',
  );

  assert.match(dryRun, /auth\.getUser\(\)/i);
  assert.match(dryRun, /pode_gerar_relatorio_comercial_v1/i);
  assert.match(dryRun, /autorizacaoError\s*\|\|\s*autorizado\s*!==\s*true/);
  assert.match(dryRun, /authError\s*\|\|\s*!authData\.user\s*\?\s*401\s*:\s*403/);
  assert.doesNotMatch(dryRun, /bearerToken\s*===\s*serviceRoleKey/);
});

test('guard comercial libera somente service_role e unidade ativa', () => {
  assert.match(
    migration,
    /create or replace function public\.pode_gerar_relatorio_comercial_v1\s*\(/i,
  );
  assert.match(migration, /u\.ativo\s*=\s*true/i);
  assert.match(migration, /auth\.role\(\)\s*=\s*['"]service_role['"]/i);
  assert.match(
    migration,
    /grant execute on function public\.pode_gerar_relatorio_comercial_v1\(uuid\)\s*to authenticated, service_role/i,
  );
});

test('cron comercial consome somente o texto do produtor canônico', () => {
  assert.match(cron, /EDGE_FUNCTION\s*=\s*['"]relatorio-admin-whatsapp['"]/);
  assert.match(cron, /def edge_dry_run_comercial\(/);
  assert.match(
    cron,
    /['"]modo['"]\s*:\s*['"]dry_run_comercial['"][\s\S]*?['"]data_referencia['"]/,
  );
  assert.match(cron, /generated\[['"]texto['"]\]/);
  assert.doesNotMatch(cron, /get_dados_comercial_ia/);
  assert.doesNotMatch(cron, /get_kpis_comercial_canonicos_v2/);
  assert.doesNotMatch(cron, /def build_report\(/);
});

test('cron comercial registra e deduplica o automático na fila canônica', () => {
  assert.match(cron, /QUEUE_TABLE\s*=\s*['"]fila_relatorios_whatsapp['"]/);
  assert.match(cron, /COMERCIAL_TIPO\s*=\s*['"]relatorio_comercial['"]/);
  assert.match(
    cron,
    /on_conflict['"]\s*:\s*['"]tipo_relatorio,unidade_id,jid,data_dia['"]/,
  );
  assert.match(
    cron,
    /['"]tipo_relatorio['"]\s*:\s*['"]eq\.relatorio_comercial['"]/,
  );
  assert.match(cron, /['"]status['"]\s*:\s*['"]enviando['"]/);
  assert.match(cron, /send_result\s*=\s*send_report/);
  assert.match(
    cron,
    /from lareport_whatsapp_single import send_single_report/,
  );
  assert.match(cron, /final_status\s*=\s*['"]enviada['"]\s*if\s*send_ok\s*else\s*['"]erro['"]/);
  assert.match(cron, /['"]status['"]\s*:\s*final_status/);
});

test('dry-run preserva o texto inteiro para o gate operacional', () => {
  assert.match(
    cron,
    /['"]status['"]\s*:\s*['"]dry_run['"][\s\S]*?['"]chars['"]\s*:\s*len\(texto\)[\s\S]*?['"]texto['"]\s*:\s*texto/,
  );
});
