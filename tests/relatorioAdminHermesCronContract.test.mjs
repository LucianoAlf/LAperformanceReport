import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const scriptPath = new URL(
  '../scripts/send-lareport-adm-hermes.py',
  import.meta.url,
);

const script = await readFile(scriptPath, 'utf8');
const edge = await readFile(
  new URL('../supabase/functions/relatorio-admin-whatsapp/index.ts', import.meta.url),
  'utf8',
);

test('cron administrativo usa a chave canônica por tipo na fila', () => {
  assert.match(
    script,
    /on_conflict['"]\s*:\s*['"]tipo_relatorio,unidade_id,jid,data_dia['"]/,
  );
});

test('deduplicação diária é isolada ao relatório administrativo', () => {
  assert.match(
    script,
    /def already_sent_today[\s\S]*?['"]tipo_relatorio['"]\s*:\s*['"]eq\.relatorio_admin['"]/,
  );
});

test('todas as gravações na fila identificam o tipo administrativo', () => {
  assert.match(
    script,
    /def upsert_fila[\s\S]*?payload\s*=\s*\{['"]tipo_relatorio['"]\s*:\s*['"]relatorio_admin['"],\s*\*\*row\}/,
  );
  assert.match(script, /http_json\([\s\S]*?['"]POST['"], url, key, payload,/);
});

test('texto administrativo e comercial passam pelo contrato publico', () => {
  assert.doesNotMatch(edge, /\(fonte canônica\)/i);
  assert.match(edge, /validarTextoPublicoRelatorio\(texto\)/);
  assert.match(
    edge,
    /validarTextoPublicoRelatorio\(formatarRelatorioComercialDiario\(dados\)\)/,
  );
});
