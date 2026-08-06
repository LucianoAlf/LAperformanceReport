import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const webhookPath = 'supabase/functions/debug-webhook-emusys-observador/index.ts';
const source = readFileSync(webhookPath, 'utf8');

// --- retry contra a corrida com o webhook de lead (v8) ---

test('retry so acontece quando a RPC recusa por lead_not_found', () => {
  assert.match(source, /async function registrarExperimentalComRetry/);
  assert.match(source, /function recusouPorLeadNaoEncontrado\(data: any\)/);
  // sai na primeira tentativa se deu erro, se nao pode reesperar, ou se a RPC nao recusou
  assert.match(source, /if \(error \|\| !podeReesperar \|\| !recusouPorLeadNaoEncontrado\(data\)\) \{/);
});

test('cancelamento nao fica esperando por lead que talvez nunca venha', () => {
  assert.match(source, /registrarExperimentalComRetry\(sb, args, !cancelamento\)/);
});

test('janela do retry e maior que o Delay 5s que o n8n tinha', () => {
  const esperas = source.match(/const ESPERAS_RETRY_MS = \[([^\]]+)\]/);
  assert.ok(esperas, 'ESPERAS_RETRY_MS nao encontrado');
  const total = esperas[1].split(',').reduce((s, n) => s + Number(n.trim()), 0);
  assert.ok(total > 5000, `janela do retry (${total}ms) precisa superar os 5000ms do n8n`);
});

test('numero de tentativas fica no log, para saber se a corrida esta ocorrendo', () => {
  assert.match(source, /tentativas_rpc: tentativas,/);
});

// --- fallback de criacao de lead (v7, ampliado no v8) ---

test('fallback dispara em qualquer recusa da criacao, nao so quando falta telefone', () => {
  assert.match(
    source,
    /evento === 'aula_experimental_criada' && recusouPorLeadNaoEncontrado\(data\)/,
  );
  // o gatilho antigo exigia ausencia de telefone; nao pode ter voltado
  assert.doesNotMatch(source, /&&\s*!telefone\s*\n\s*&& data\?\.success === false/);
});

test('lead fallback nasce com o telefone do payload, na unidade certa', () => {
  assert.match(source, /async function criarLeadFallbackExperimental/);
  assert.match(source, /criarLeadFallbackExperimental\(sb, unidadeId, emusysLeadId, nomeAluno, telefone\)/);
  assert.match(source, /emusys_lead_id: emusysLeadId,/);
  assert.match(source, /unidade_id: unidadeId,/);
  assert.match(source, /\n\s+telefone,\n/);
});

test('nao cria lead quando o telefone ja e de outro lead da unidade', () => {
  assert.match(source, /async function leadExistentePorTelefone/);
  assert.match(source, /acao: 'lead_existente_nao_casado'/);
  // a busca da guarda NAO pode filtrar arquivado — e justamente o caso que a RPC nao casa
  const corpo = source.slice(
    source.indexOf('async function leadExistentePorTelefone'),
    source.indexOf('async function criarLeadFallbackExperimental'),
  );
  assert.doesNotMatch(corpo, /arquivado', false/);
});

test('lead_fallback aparece no retorno final da experimental', () => {
  assert.match(source, /lead_fallback:\s*leadFallback,/);
});

// --- classificacao no log ---

test('status warn cobre colisao de telefone e recuo do fallback', () => {
  assert.match(source, /acaoInterna === 'colisao_telefone_familia'/);
  assert.match(source, /acaoInterna === 'lead_existente_nao_casado'/);
});

test('processarLead detecta colisao de telefone via releitura, nao via excecao', () => {
  assert.match(source, /acao: 'colisao_telefone_familia'/);
  assert.match(source, /leadAtual\.telefone !== telefone/);
});
