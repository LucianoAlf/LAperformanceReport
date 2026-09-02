import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migracoes = path.join(root, 'supabase/migrations');
const tabela = path.join(migracoes, '20260902121500_fechamento_mensal_execucoes.sql');
const orquestrador = path.join(migracoes, '20260902122000_fechar_competencia_mensal_dia1.sql');

test('as migrations existem', () => {
  assert.ok(fs.existsSync(tabela), 'migration da tabela de placar ausente');
  assert.ok(fs.existsSync(orquestrador), 'migration do orquestrador ausente');
});

test('cada unidade roda em bloco protegido', () => {
  const sql = fs.readFileSync(orquestrador, 'utf8');
  assert.match(sql, /exception\s+when\s+others/iu,
    'sem bloco protegido, uma unidade travada aborta a transacao inteira');
  assert.match(sql, /sqlerrm/iu, 'o erro precisa ser capturado para virar alarme legivel');
  assert.match(sql, /sqlstate/iu);
});

test('libera o statement_timeout da funcao', () => {
  const sql = fs.readFileSync(orquestrador, 'utf8');
  assert.match(sql, /statement_timeout/u,
    'o papel authenticator corta em 8s e o fechamento leva ~60s');
});

test('respeita a ordem: bloco financeiro antes da captura mensal', () => {
  const sql = fs.readFileSync(orquestrador, 'utf8');
  const posBloco = sql.indexOf('garantir_bloco_financeiro_gerencial_v1');
  const posCaptura = sql.indexOf('capturar_relatorios_mensais_canonicos_v1');
  assert.ok(posBloco > -1 && posCaptura > -1, 'ambas as chamadas devem existir');
  assert.ok(
    posBloco < posCaptura,
    'montar_relatorio_admin_mensal_payload_v1 le o gerencial por versao desc — '
      + 'o bloco tem de existir antes da captura',
  );
});

test('usa a v2 (por unidade), nao a v1 tudo-ou-nada', () => {
  const sql = fs.readFileSync(orquestrador, 'utf8');
  assert.match(sql, /fechar_competencia_mensal_canonica_v2/u);
});

test('a competencia alvo e o mes anterior', () => {
  const sql = fs.readFileSync(orquestrador, 'utf8');
  assert.match(sql, /interval\s+'1 month'/u);
  assert.match(sql, /America\/Sao_Paulo/u, 'data de negocio precisa ser BRT, nao UTC');
});

test('revoga execute de anon nominalmente', () => {
  const sql = fs.readFileSync(orquestrador, 'utf8');
  assert.match(
    sql,
    /revoke\s+execute\s+on\s+function\s+public\.fechar_competencia_mensal_dia1_v1[^;]*from[^;]*anon/isu,
  );
});
