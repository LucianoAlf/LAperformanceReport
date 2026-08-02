import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const conversaPath = resolve(
  root,
  'src/components/App/SucessoCliente/ConversaPesquisaEvasao.tsx',
);
const filaPath = resolve(
  root,
  'src/components/App/SucessoCliente/FilaRevisaoEvasao.tsx',
);
const tabPath = resolve(
  root,
  'src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx',
);
const typesPath = resolve(
  root,
  'src/components/App/SucessoCliente/pesquisaEvasao.types.ts',
);
const read = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('timeline separa rodadas e mostra eventos, transcricao e estado', () => {
  const conversa = read(conversaPath);
  assert.ok(conversa, 'componente de conversa ainda nao existe');
  assert.match(conversa, /rodadas\.map/);
  assert.match(conversa, /mensagens\.map/);
  assert.match(conversa, /transcricao/i);
  assert.match(conversa, /Rodada\s*\{/);
  assert.match(conversa, /Novo conteúdo/i);
});

test('fila chama RPC governada e abre a conversa correta', () => {
  const fila = read(filaPath);
  assert.ok(fila, 'fila de revisao ainda nao existe');
  assert.match(fila, /listar_pesquisas_evasao_revisao/);
  assert.match(fila, /ConversaPesquisaEvasao/);
  assert.match(fila, /conteudo_novo_desde_revisao/);
});

test('revisao usa RPC e nunca atualiza tabela privada direto', () => {
  const conversa = read(conversaPath);
  assert.match(conversa, /iniciar_revisao_pesquisa_evasao/);
  assert.match(conversa, /concluir_revisao_pesquisa_evasao/);
  assert.match(conversa, /revisao_iniciada_por_nome/);
  assert.match(conversa, /revisor_nome/);
  assert.doesNotMatch(conversa, /\.from\(["']pesquisa_evasao_analises["']\)\s*\.update/);
});

test('aba principal integra fila e conversa de producao e teste', () => {
  const tab = read(tabPath);
  const types = read(typesPath);
  assert.match(tab, /FilaRevisaoEvasao/);
  assert.match(tab, /ConversaPesquisaEvasao/);
  assert.match(types, /PesquisaEvasaoRodada/);
  assert.match(types, /conteudo_novo_desde_revisao/);
});
