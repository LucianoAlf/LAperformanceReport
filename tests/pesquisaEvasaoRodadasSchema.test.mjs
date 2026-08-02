import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(
  root,
  'supabase/migrations/20260802213000_pesquisa_evasao_rodadas_revisao.sql',
);
const workerPath = resolve(
  root,
  'supabase/functions/processar-conversa-evasao/index.ts',
);
const read = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('migration associa cada mensagem a uma versao de analise', () => {
  const sql = read(migrationPath);
  assert.ok(sql, 'migration de rodadas ainda nao existe');
  assert.match(sql, /add column if not exists analise_versao integer/i);
  assert.match(sql, /foreign key\s*\(pesquisa_id,\s*analise_versao\)/i);
  assert.match(sql, /fn_atribuir_rodada_pesquisa_evasao/i);
  assert.match(sql, /interval\s*'15 minutes'/i);
});

test('analise guarda limites e versao revisada e imutavel', () => {
  const sql = read(migrationPath);
  for (const coluna of [
    'primeira_mensagem_id',
    'ultima_mensagem_id',
    'iniciada_em',
    'ultima_mensagem_em',
    'encerrada_em',
  ]) {
    assert.match(sql, new RegExp(`add column if not exists ${coluna}`, 'i'));
  }
  assert.match(sql, /fn_proteger_analise_evasao_revisada/i);
  assert.match(sql, /old\.status\s*=\s*'revisada'/i);
});

test('nova rodada apos revisao religa sinal e fila sem apagar a anterior', () => {
  const sql = read(migrationPath);
  assert.match(sql, /conteudo_novo_desde_revisao/i);
  assert.match(sql, /resposta_status\s*=\s*'coletando'/i);
  assert.match(sql, /concluir_revisao_pesquisa_evasao/i);
  assert.match(sql, /resposta_status\s*=\s*'revisada'/i);
});

test('worker consolida por analise_versao e nao todas as mensagens da pesquisa', () => {
  const edge = read(workerPath);
  assert.match(edge, /\.eq\(["']analise_versao["'],\s*analise\.versao\)/);
  assert.doesNotMatch(edge, /preparar_nova_analise_pesquisa_evasao/);
  assert.match(edge, /status:\s*pronta\s*\?\s*["']pronta_para_revisao["']/);
});

test('RPCs da timeline e revisao sao internas e sem anon', () => {
  const sql = read(migrationPath);
  assert.match(sql, /get_conversa_pesquisa_evasao/i);
  assert.match(sql, /listar_pesquisas_evasao_revisao/i);
  assert.match(sql, /iniciar_revisao_pesquisa_evasao/i);
  assert.match(sql, /concluir_revisao_pesquisa_evasao/i);
  assert.match(sql, /fn_pesquisa_evasao_usuario_interno_ativo\(\)/i);
  assert.match(sql, /revoke all[\s\S]*from public, anon/i);
});
