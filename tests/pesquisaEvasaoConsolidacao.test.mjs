import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(
  root,
  'supabase/migrations/20260801191500_pesquisa_evasao_consolidacao_worker.sql',
);
const cronTokenCompatPath = resolve(
  root,
  'supabase/migrations/20260802184500_pesquisa_evasao_consolidacao_cron_token_compat.sql',
);
const edgePath = resolve(root, 'supabase/functions/processar-conversa-evasao/index.ts');
const configPath = resolve(root, 'supabase/config.toml');
const read = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('fila tem claim atômico service-only e SKIP LOCKED', () => {
  const sql = read(migrationPath);
  assert.match(sql, /create table[\s\S]*pesquisa_evasao_processamento/i);
  assert.match(sql, /claim_pesquisas_evasao_processamento/i);
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /auth\.role\(\)[\s\S]*service_role/i);
  assert.match(sql, /revoke all[\s\S]*claim_pesquisas_evasao_processamento/i);
});

test('mensagem e transcrição reagendam a consolidação', () => {
  const sql = read(migrationPath);
  assert.match(sql, /after insert[\s\S]*pesquisa_evasao_mensagens/i);
  assert.match(sql, /interval\s*'60 seconds'/i);
  assert.match(sql, /pesquisa_evasao_transcricoes[\s\S]*after update/i);
});

test('cron interno usa token de Vault e não JWT de usuário', () => {
  const sql = read(migrationPath);
  const compat = read(cronTokenCompatPath);
  const config = read(configPath);
  const edge = read(edgePath);
  assert.match(sql, /cron\.schedule/i);
  assert.match(sql, /sync_presenca_edge_token/i);
  assert.match(sql, /x-sync-token/i);
  assert.ok(compat, 'migration corretiva do token do cron ainda nao existe');
  assert.match(compat, /sync_matriculas_admin_token/i);
  assert.match(compat, /cron\.unschedule/i);
  assert.match(compat, /cron\.schedule/i);
  assert.match(edge, /SYNC_PRESENCA_EDGE_TOKEN[\s\S]*SYNC_MATRICULAS_ADMIN_TOKEN/);
  assert.match(edge, /x-sync-token/i);
  assert.match(config, /\[functions\.processar-conversa-evasao\][\s\S]*verify_jwt\s*=\s*false/);
});

test('worker persiste apenas consolidação derivada e não registra conteúdo em log', () => {
  const edge = read(edgePath);
  assert.match(edge, /pesquisa_evasao_analises/);
  assert.match(edge, /pesquisa_evasao_processamento/);
  assert.match(edge, /\.eq\(["']analise_versao["'],\s*analise\.versao\)/);
  assert.doesNotMatch(edge, /preparar_nova_analise_pesquisa_evasao/);
  assert.doesNotMatch(edge, /console\.(log|error)\([^\n]*(texto|mensagem|transcri)/i);
  assert.doesNotMatch(edge, /\[áudio pendente\]/i);
});

test('worker retenta transcrições pendentes antes de reagendar a conversa', () => {
  const edge = read(edgePath);
  assert.match(edge, /listarMensagensComTranscricaoPendente/);
  const disparo = edge.match(
    /functions\.invoke\(\s*["']transcrever-mensagem-evasao["']/,
  );
  assert.ok(disparo);
  assert.ok(
    disparo.index < edge.indexOf('decidirConsolidacao(conversa'),
  );
});
