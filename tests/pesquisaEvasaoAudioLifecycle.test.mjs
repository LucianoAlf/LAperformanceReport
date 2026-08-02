import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const edgePath = resolve(root, 'supabase/functions/transcrever-mensagem-evasao/index.ts');
const contractPath = resolve(root, 'supabase/functions/transcrever-mensagem-evasao/contract.ts');
const webhookPath = resolve(root, 'supabase/functions/webhook-whatsapp-inbox/evasao.ts');
const configPath = resolve(root, 'supabase/config.toml');
const read = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('áudio é persistido e enfileirado antes da invocação assíncrona', () => {
  const source = read(webhookPath);
  assert.match(source, /criarTranscricaoPendente\(persistida\.id\)/);
  assert.match(source, /dispararTranscricao\(persistida\.id\)/);
  assert.ok(
    source.indexOf('criarTranscricaoPendente(persistida.id)') <
      source.indexOf('dispararTranscricao(persistida.id)'),
  );
});

test('worker recebe somente id interno, exige service role e busca mídia no servidor', () => {
  const edge = read(edgePath);
  const contract = read(contractPath);
  assert.ok(edge, 'worker de transcrição ausente');
  assert.match(edge, /validarPedidoTranscricao/);
  assert.match(edge, /autenticarServiceRole/);
  assert.match(edge, /getUazapiCredentials/);
  assert.match(edge, /\.from\(['"]pesquisa_evasao_mensagens['"]\)/);
  assert.doesNotMatch(contract, /body\.(url|audio_url|media_url)/i);
});

test('áudio fica em storage privado e logs não contêm URL nem transcrição', () => {
  const edge = read(edgePath);
  assert.match(edge, /\.from\(['"]crm-midia['"]\)\.upload/);
  assert.doesNotMatch(edge, /getPublicUrl|createSignedUrl/);
  assert.doesNotMatch(edge, /console\.(log|error)\([^\n]*(transcri|fileURL|url|token)/i);
});

test('gateway da transcrição exige JWT', () => {
  const config = read(configPath);
  assert.match(
    config,
    /\[functions\.transcrever-mensagem-evasao\][\s\S]*?verify_jwt\s*=\s*true/,
  );
});
