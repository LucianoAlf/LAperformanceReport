import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const webhook = readFileSync(
  new URL('../supabase/functions/webhook-whatsapp-inbox/index.ts', import.meta.url),
  'utf8',
);
const processador = readFileSync(
  new URL('../supabase/functions/processar-resposta-pesquisa/index.ts', import.meta.url),
  'utf8',
);
const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');

test('encaminha primeira aula antes da evasao e preserva a inbox', () => {
  const encaminhamento = webhook.indexOf('encaminharPesquisaPrimeiraAula({');
  const evasao = webhook.indexOf('await handleRespostaEvasao(');
  const inbox = webhook.indexOf('// ========== ROTEAMENTO ADMIN ==========');

  assert.ok(encaminhamento >= 0, 'encaminhamento da primeira aula deve existir');
  assert.ok(evasao > encaminhamento, 'primeira aula deve ser encaminhada antes da evasao');
  assert.ok(inbox > evasao, 'roteamento normal da inbox deve continuar depois das pesquisas');
  assert.match(webhook, /deveProcessarRespostaEvasao\(msg\)/);
});

test('processador ignora botao desconhecido e e idempotente por nota pendente', () => {
  assert.match(processador, /if \(nota == null\)/);
  assert.match(processador, /motivo: 'botao_desconhecido'/);
  assert.match(processador, /\.is\('nota', null\)/);
});

test('processar-resposta-pesquisa permanece protegido por JWT', () => {
  const bloco = config.match(
    /\[functions\.processar-resposta-pesquisa\][\s\S]*?(?=\n\[functions\.|$)/,
  )?.[0];

  assert.ok(bloco, 'configuracao explicita da Edge interna deve existir');
  assert.match(bloco, /verify_jwt\s*=\s*true/);
});

test('webhook nao registra o valor de buttonOrListid em log', () => {
  assert.doesNotMatch(webhook, /console\.(?:log|warn|error)\([^\n]*buttonOrListid/);
});
