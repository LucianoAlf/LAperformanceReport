import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migracao = path.join(
  root,
  'supabase/migrations/20260902120500_fechar_competencia_mensal_canonica_v2.sql',
);
const sql = () => fs.readFileSync(migracao, 'utf8');

test('a migration existe', () => {
  assert.ok(fs.existsSync(migracao));
});

test('o update de snapshots filtra escopo E unidade', () => {
  const corpo = sql();
  const inicio = corpo.search(/update\s+public\.fechamento_mensal_snapshots/iu);
  assert.ok(inicio !== -1, 'UPDATE de fechamento_mensal_snapshots nao encontrado');
  const restante = corpo.slice(inicio);
  const fimRelativo = restante.search(/returning/iu);
  assert.ok(fimRelativo !== -1, 'clausula RETURNING do UPDATE nao encontrada');
  // recorta so o proprio UPDATE (ate o RETURNING) -- nao pode aceitar
  // escopo/unidade_id aparecendo num INSERT ou comentario mais adiante no arquivo
  const update = restante.slice(0, fimRelativo);
  assert.match(update, /escopo\s*=\s*'unidade'/u,
    'sem filtro de escopo, fechar uma unidade carimba os 11 snapshots consolidados');
  assert.match(update, /unidade_id\s*=\s*p_unidade_id/u);
});

test('exige os 6 dominios da unidade', () => {
  const corpo = sql();
  const inicio = corpo.search(/from\s*\(\s*values/iu);
  assert.ok(inicio !== -1, 'bloco VALUES dos dominios esperados nao encontrado');
  const restante = corpo.slice(inicio);
  const fimRelativo = restante.search(/\)\s*esperado\s*\(\s*dominio\s*\)/iu);
  assert.ok(fimRelativo !== -1, 'fechamento "esperado(dominio)" do bloco VALUES nao encontrado');
  // amarra a checagem ao bloco VALUES que alimenta v_faltantes -- presenca do
  // literal em qualquer outro lugar do arquivo (ex.: comentario) nao deve contar
  const valuesBlock = restante.slice(0, fimRelativo);
  for (const dominio of [
    'alunos_admin', 'alunos_executivo', 'comercial',
    'relatorio_gerencial', 'relatorio_admin_mensal', 'relatorio_comercial_mensal',
  ]) {
    assert.ok(valuesBlock.includes(dominio), `dominio ausente do bloco VALUES: ${dominio}`);
  }
});

test('nao altera a v1', () => {
  const corpo = sql();
  assert.doesNotMatch(
    corpo,
    /(create\s+or\s+replace|drop)\s+function\s+public\.fechar_competencia_mensal_canonica_v1/isu,
    'a v1 tem consumidores e deve ficar intacta',
  );
});

test('guarda de acesso: fail-closed mesmo com auth.role() NULL, e sinaliza ACESSO_NEGADO', () => {
  // Mesmo raciocinio do teste analogo em fechamentoMensalBlocoFinanceiro:
  // o schema public concede EXECUTE a `authenticated` por ALTER DEFAULT
  // PRIVILEGES, e a guarda dentro da funcao e a UNICA protecao para esse
  // papel (o revoke nominal so alcanca anon).
  const corpo = sql();
  const funcao = corpo.slice(corpo.indexOf('create or replace function'));
  assert.match(
    funcao,
    /if\s+coalesce\s*\(\s*auth\.role\(\)\s*,\s*''\s*\)\s*<>\s*'service_role'/isu,
    'sem coalesce, auth.role() NULL faz NULL <> \'service_role\' avaliar NULL — '
      + 'o if nao dispara e a guarda vira fail-open',
  );
  assert.match(
    funcao,
    /raise\s+exception\s+'ACESSO_NEGADO_FECHAMENTO_RELATORIO_MENSAL/isu,
    'a guarda precisa recusar com ACESSO_NEGADO_FECHAMENTO_RELATORIO_MENSAL',
  );
});

test('revoga execute de anon nominalmente', () => {
  assert.match(
    sql(),
    /revoke\s+execute\s+on\s+function\s+public\.fechar_competencia_mensal_canonica_v2[^;]*from[^;]*anon/isu,
  );
});
