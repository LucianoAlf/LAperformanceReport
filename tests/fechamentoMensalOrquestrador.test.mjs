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
  // Existem DOIS "exception when others" no arquivo (passo 0 e o laco por
  // unidade) — checar em qualquer lugar do arquivo passaria mesmo com o
  // laco por unidade desprotegido. Recorta so o trecho do laco.
  const match = sql.match(/for\s+v_unidade\s+in[\s\S]*?end\s+loop\s*;/iu);
  assert.ok(match, 'laco "for v_unidade in ... end loop;" nao encontrado');
  const trechoLaco = match[0];
  assert.match(trechoLaco, /exception\s+when\s+others/iu,
    'sem bloco protegido DENTRO do laco por unidade, uma unidade travada aborta as demais');
  assert.match(trechoLaco, /sqlerrm/iu,
    'o erro precisa ser capturado dentro do laco para virar alarme legivel');
  assert.match(trechoLaco, /sqlstate/iu);
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
  // Precisa travar o SINAL da operacao — "+ interval '1 month'" tambem
  // bateria em /interval\s+'1 month'/ sozinho, e daria o mes ERRADO
  // (quebrando a virada de ano na direcao oposta).
  assert.match(
    sql,
    /date_trunc\s*\(\s*'month'[^)]*\)\s*-\s*interval\s+'1 month'/u,
    'a competencia tem de ser o mes anterior (subtracao), nao o mes seguinte',
  );
  assert.match(sql, /America\/Sao_Paulo/u, 'data de negocio precisa ser BRT, nao UTC');
});

test('revoga execute de anon nominalmente', () => {
  const sql = fs.readFileSync(orquestrador, 'utf8');
  assert.match(
    sql,
    /revoke\s+execute\s+on\s+function\s+public\.fechar_competencia_mensal_dia1_v1[^;]*from[^;]*anon/isu,
  );
});

test('placar tem RLS ligada, acesso revogado por padrao e leitura restrita a admin', () => {
  const sql = fs.readFileSync(tabela, 'utf8');
  assert.match(
    sql,
    /alter\s+table\s+public\.fechamento_mensal_execucoes\s+enable\s+row\s+level\s+security/isu,
    'sem RLS ligada, qualquer authenticated leria o placar por engano',
  );
  assert.match(
    sql,
    /revoke\s+all\s+on\s+table\s+public\.fechamento_mensal_execucoes\s+from\s+public\s*,\s*anon\s*,\s*authenticated/isu,
    'revoke precisa alcancar public, anon E authenticated nominalmente',
  );
  assert.match(
    sql,
    /create\s+policy\s+fechamento_mensal_execucoes_leitura_admin[\s\S]*?is_admin\s*\(\s*\)/isu,
    'a policy de leitura precisa restringir a is_admin()',
  );
});
