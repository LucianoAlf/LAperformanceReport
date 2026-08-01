import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';


const load = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [comercial, administrativo, filaManual] = await Promise.all([
  load('../scripts/send-lareport-comercial-hermes.py'),
  load('../scripts/send-lareport-adm-hermes.py'),
  load('../scripts/process-sol-report-queue.py').catch(() => ''),
]);

test('crons e botoes usam o mesmo cliente de mensagem unica', () => {
  for (const [nome, source] of [
    ['comercial', comercial],
    ['administrativo', administrativo],
    ['botoes', filaManual],
  ]) {
    assert.match(
      source,
      /from lareport_whatsapp_single import send_single_report/,
      nome,
    );
    assert.match(source, /send_single_report\(/, nome);
    assert.doesNotMatch(source, /hermes_cli\.main/, nome);
    assert.doesNotMatch(source, /subprocess\.run/, nome);
  }
});

test('worker dos botoes preserva fila e estados existentes', () => {
  assert.match(filaManual, /fila_relatorios_sol_hermes/);
  for (const status of ['sol_pendente', 'sol_enviando', 'enviada', 'erro']) {
    assert.match(filaManual, new RegExp(status), status);
  }
});

test('sucesso publico exige o identificador unico confirmado', () => {
  for (const source of [comercial, administrativo, filaManual]) {
    assert.match(source, /send_result\.get\(['"]message_id['"]\)/);
  }
});
