import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migracao = path.join(
  root,
  'supabase/migrations/20260902120000_garantir_bloco_financeiro_gerencial.sql',
);

test('a migration do bloco financeiro existe', () => {
  assert.ok(fs.existsSync(migracao), 'migration nao encontrada');
});

test('grava o bloco na forma canonica kpis_gestao[0]', () => {
  const sql = fs.readFileSync(migracao, 'utf8');
  // O regex antigo (/kpis_gestao,0,financeiro_faturas_emusys/) casava com o
  // literal do check de leitura ("ja presente"), nao com a escrita — passaria
  // mesmo que a gravacao estivesse em outro lugar. Aqui exige-se as DUAS peças
  // do caminho de escrita real: o jsonb_set com o path '{kpis_gestao,0}' e a
  // chave 'financeiro_faturas_emusys' dentro de um jsonb_build_object.
  assert.match(
    sql,
    /jsonb_set\s*\([^;]*?'\{kpis_gestao,0\}'/su,
    'a escrita precisa usar jsonb_set com o path {kpis_gestao,0}',
  );
  assert.match(
    sql,
    /jsonb_build_object\s*\([^;]*?'financeiro_faturas_emusys'/su,
    'a chave financeiro_faturas_emusys precisa estar dentro de um jsonb_build_object',
  );
});

test('recusa quando totais nao traz os campos que a leitura exige', () => {
  const sql = fs.readFileSync(migracao, 'utf8');
  assert.match(
    sql,
    /v_totais->'ticket_medio'\s+is\s+null/isu,
    'falta a guarda de ticket_medio ausente em totais',
  );
  assert.match(
    sql,
    /v_totais->'faturamento_previsto'\s+is\s+null/isu,
    'falta a guarda de faturamento_previsto ausente em totais',
  );
  assert.match(
    sql,
    /v_totais->'mrr_atual'\s+is\s+null/isu,
    'falta a guarda de mrr_atual ausente em totais',
  );
});

test('preserva capturado_em da versao anterior', () => {
  const sql = fs.readFileSync(migracao, 'utf8');
  assert.match(
    sql,
    /v_snapshot\.capturado_em/u,
    'capturado_em da nova versao tem de vir da versao anterior — e o corte '
      + '(a.created_at <= capturado_em) que a lista do relatorio usa',
  );
});

test('e fail-closed quando a fonte financeira nao tem dados', () => {
  const sql = fs.readFileSync(migracao, 'utf8');
  assert.match(sql, /fonte_indisponivel/u);
  assert.match(sql, /tem_dados/u);
});

test('nunca sobrescreve bloco ja existente', () => {
  const sql = fs.readFileSync(migracao, 'utf8');
  assert.match(sql, /ja_presente/u);
});

test('guarda de acesso: fail-closed mesmo com auth.role() NULL, e sinaliza ACESSO_NEGADO', () => {
  // O schema public concede EXECUTE a `anon` E a `authenticated` via
  // ALTER DEFAULT PRIVILEGES. O revoke nominal (teste acima) tira o anon;
  // para authenticated a UNICA protecao e esta guarda dentro da funcao.
  // Recorta so o corpo da funcao (apos o "create or replace function"),
  // para nao aceitar coalesce/ACESSO_NEGADO vindos de comentario de cabecalho.
  const corpo = fs.readFileSync(migracao, 'utf8');
  const funcao = corpo.slice(corpo.indexOf('create or replace function'));
  assert.match(
    funcao,
    /if\s+coalesce\s*\(\s*auth\.role\(\)\s*,\s*''\s*\)\s*<>\s*'service_role'/isu,
    'auth.role() sem coalesce volta NULL fora de sessao PostgREST/JWT — '
      + 'NULL <> \'service_role\' e NULL, o if nao dispara e a guarda vira fail-open',
  );
  assert.match(
    funcao,
    /raise\s+exception\s+'ACESSO_NEGADO_BLOCO_FINANCEIRO_GERENCIAL/isu,
    'a guarda precisa recusar com ACESSO_NEGADO_BLOCO_FINANCEIRO_GERENCIAL',
  );
});

test('revoga execute de anon nominalmente', () => {
  const sql = fs.readFileSync(migracao, 'utf8');
  assert.match(
    sql,
    /revoke\s+execute\s+on\s+function\s+public\.garantir_bloco_financeiro_gerencial_v1[^;]*from[^;]*anon/isu,
    'ALTER DEFAULT PRIVILEGES concede execute a anon — revoke precisa ser nominal',
  );
});

// Divide uma lista SQL de valores respeitando profundidade de parenteses --
// necessario porque o INSERT tem uma virgula DENTRO do argumento de format()
// (o texto de 'observacao'), e um split ingenuo por virgula desalinharia a
// correspondencia posicional entre colunas e valores.
function splitTopLevel(texto) {
  const partes = [];
  let profundidade = 0;
  let atual = '';
  for (const ch of texto) {
    if (ch === '(') profundidade += 1;
    if (ch === ')') profundidade -= 1;
    if (ch === ',' && profundidade === 0) {
      partes.push(atual);
      atual = '';
    } else {
      atual += ch;
    }
  }
  partes.push(atual);
  return partes;
}

test('marca financeiro_realizado_disponivel=true no INSERT', () => {
  const sql = fs.readFileSync(migracao, 'utf8');
  // fechamento_mensal_snapshots.financeiro_realizado_disponivel e NOT NULL
  // DEFAULT false; sem listar a coluna, a versao gravada carregaria o bloco
  // financeiro mas ficaria marcada como se nao tivesse -- contraditorio.
  const insertMatch = sql.match(
    /insert\s+into\s+public\.fechamento_mensal_snapshots\s*\(([^)]*)\)\s*values\s*\(([\s\S]*?)\)\s*returning\s+id\s+into\s+v_novo_id;/iu,
  );
  assert.ok(
    insertMatch,
    'INSERT em fechamento_mensal_snapshots (com "returning id into v_novo_id") nao encontrado',
  );
  const [, colunasTexto, valoresTexto] = insertMatch;

  const colunas = splitTopLevel(colunasTexto).map((c) => c.trim()).filter(Boolean);
  const idx = colunas.indexOf('financeiro_realizado_disponivel');
  assert.notEqual(
    idx,
    -1,
    'a lista de colunas do INSERT precisa incluir financeiro_realizado_disponivel',
  );

  const valores = splitTopLevel(valoresTexto.replace(/--[^\n]*/gu, ''))
    .map((v) => v.trim())
    .filter(Boolean);

  assert.equal(
    colunas.length,
    valores.length,
    `colunas (${colunas.length}) e valores (${valores.length}) do INSERT fora de correspondencia 1:1`,
  );
  assert.equal(
    valores[idx],
    'true',
    `financeiro_realizado_disponivel precisa ser gravado como true (achou: ${JSON.stringify(valores[idx])})`,
  );
});
