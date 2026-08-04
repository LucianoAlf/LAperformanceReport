import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const migrationPath = 'supabase/migrations/20260804220000_kpis_turmas_canonicos_v1.sql';
const helperPath = 'src/lib/turmasKpisCanonicos.ts';

const read = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('RPC neutra publica numerador, denominador e media da fonte homologada', () => {
  const migration = read(migrationPath);

  assert.match(migration, /get_kpis_turmas_canonicos_v1/i);
  assert.match(migration, /p_unidade_id\s+uuid/i);
  assert.match(migration, /p_ano\s+integer/i);
  assert.match(migration, /p_mes\s+integer/i);
  assert.match(migration, /p_data_inicio\s+date/i);
  assert.match(migration, /p_data_fim\s+date/i);
  assert.match(migration, /get_carteira_professor_periodo_canonica/i);
  assert.match(migration, /alunos_via_turmas\s+as\s+ocupacoes_elegiveis/i);
  assert.match(migration, /turmas_elegiveis_media\s+as\s+turmas_elegiveis/i);
  assert.match(migration, /media_alunos_turma/i);
  assert.match(migration, /competencia_status/i);
  assert.match(migration, /turmas_v1_pessoa_turma_regular/i);
});

test('RPC neutra protege escopo e grants do navegador', () => {
  const migration = read(migrationPath);

  assert.match(migration, /security\s+definer/i);
  assert.match(migration, /set\s+search_path\s*=\s*public/i);
  assert.match(migration, /usuario_tem_permissao/i);
  assert.match(migration, /professores\.ver/i);
  assert.match(migration, /alunos\.ver/i);
  assert.match(migration, /revoke\s+all[\s\S]+from\s+public,\s*anon,\s*authenticated/i);
  assert.match(migration, /grant\s+execute[\s\S]+to\s+authenticated,\s*service_role/i);
});

test('cliente unico consulta e normaliza a RPC neutra sem fallback', () => {
  const helper = read(helperPath);

  assert.match(helper, /get_kpis_turmas_canonicos_v1/);
  assert.match(helper, /buscarKpisTurmasCanonicos/);
  assert.match(helper, /ocupacoes_elegiveis:\s*numero/);
  assert.match(helper, /turmas_elegiveis:\s*numero/);
  assert.match(helper, /media_alunos_turma:\s*numero/);
  assert.match(helper, /consultasEmAndamento/);
  assert.doesNotMatch(helper, /vw_turmas_implicitas/);
});

test('consolidado divide somas e nunca calcula media das medias', () => {
  const helper = read(helperPath);

  assert.match(helper, /calcularTotaisKpisTurmasCanonicos/);
  assert.match(helper, /totalOcupacoes\s*\/\s*totalTurmas/);
  assert.doesNotMatch(helper, /media_alunos_turma[^\n]+\/\s*linhas\.length/);

  const linhas = [
    { ocupacoes: 18, turmas: 6 },
    { ocupacoes: 13, turmas: 13 },
    { ocupacoes: 49, turmas: 40 },
  ];
  const ocupacoes = linhas.reduce((soma, linha) => soma + linha.ocupacoes, 0);
  const turmas = linhas.reduce((soma, linha) => soma + linha.turmas, 0);
  assert.equal(ocupacoes / turmas, 80 / 59);
  assert.equal(18 / 6, 3);
  assert.equal(13 / 13, 1);
  assert.equal(Number((49 / 40).toFixed(2)), 1.23);
});

test('cliente indexa o grao professor e unidade para os consumidores detalhados', () => {
  const helper = read(helperPath);

  assert.match(helper, /indexarKpisTurmasCanonicos/);
  assert.match(helper, /professor_id/);
  assert.match(helper, /unidade_id/);
  assert.match(helper, /_todos/);
});
