import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const syncPresenca = readFileSync(
  new URL('../supabase/functions/sync-presenca-emusys/index.ts', import.meta.url),
  'utf8',
);
const syncGrade = readFileSync(
  new URL('../supabase/functions/sync-grade-futura-emusys/index.ts', import.meta.url),
  'utf8',
);
const professorEmusys = readFileSync(
  new URL('../supabase/functions/_shared/professor-emusys.ts', import.meta.url),
  'utf8',
);
const syncProfessores = readFileSync(
  new URL('../supabase/functions/sync-professores-emusys/index.ts', import.meta.url),
  'utf8',
);
const processarMatricula = readFileSync(
  new URL('../supabase/functions/processar-matricula-emusys/index.ts', import.meta.url),
  'utf8',
);
const syncMatriculas = readFileSync(
  new URL('../supabase/functions/sync-matriculas-emusys/index.ts', import.meta.url),
  'utf8',
);
const jornadaCanonica = readFileSync(
  new URL('../supabase/functions/_shared/jornada-canonica.ts', import.meta.url),
  'utf8',
);

test('resolver compartilhado usa o id Emusys dentro da unidade', () => {
  assert.match(professorEmusys, /id\?:\s*number\s*\|\s*null/);
  assert.match(professorEmusys, /\.from\('professores_unidades'\)/);
  assert.match(professorEmusys, /\.eq\('unidade_id',\s*unidadeId\)/);
  assert.match(professorEmusys, /identidade_historica_valida/);
  assert.match(professorEmusys, /emusysProfessorId\s*===\s*0/);
  assert.match(professorEmusys, /semAcompanhamento:\s*true/);
  assert.match(professorEmusys, /professorId:\s*null/);
});

for (const [nome, source] of [
  ['presenca', syncPresenca],
  ['grade futura', syncGrade],
]) {
  test(`sync de ${nome} vincula professor pelo id namespaced da unidade`, () => {
    assert.match(source, /_shared\/professor-emusys\.ts/);
    assert.match(source, /carregarMapaProfessoresEmusys/);
    assert.match(source, /resolverProfessorDaAula/);
    assert.match(source, /emusys_professor_id:\s*professor\.emusysProfessorId/);
    assert.match(source, /professor_id:\s*professor\.professorId/);
    assert.match(source, /sem_acompanhamento:\s*professor\.semAcompanhamento/);
  });

  test(`sync de ${nome} reserva prof_id zero para aula sem acompanhamento`, () => {
    assert.match(source, /resolverProfessorDaAula/);
  });

  test(`sync de ${nome} nao usa nome como vinculo canonico`, () => {
    assert.doesNotMatch(source, /function matchProfessor/);
    assert.doesNotMatch(source, /matchProfessor\(/);
    assert.doesNotMatch(source, /profMapa|profNomes/);
  });

  test(`sync de ${nome} preserva anotacao exclusiva do Fabio`, () => {
    assert.doesNotMatch(source, /anotacoes_fabio\s*:/);
  });
}

test('sync de professores usa identidade por unidade e nao cria vinculo por nome', () => {
  assert.match(syncProfessores, /vinculosPorEmusysId/);
  assert.match(syncProfessores, /professores_emusys_divergencias/);
  assert.match(syncProfessores, /identidade_historica_valida/);
  assert.doesNotMatch(syncProfessores, /vinculou_emusys_id_por_nome/);
  assert.doesNotMatch(syncProfessores, /vinculou_unidade_existente/);
  assert.doesNotMatch(syncProfessores, /criado_novo/);
});

test('sync de professores usa secrets e desativa somente o vinculo operacional ausente', () => {
  assert.match(syncProfessores, /requiredEnv\('EMUSYS_TOKEN_CG'\)/);
  assert.match(syncProfessores, /requiredEnv\('EMUSYS_TOKEN_BARRA'\)/);
  assert.match(syncProfessores, /requiredEnv\('EMUSYS_TOKEN_RECREIO'\)/);
  assert.match(syncProfessores, /emusys_ativo:\s*false/);
  assert.match(syncProfessores, /identidade_historica_valida:\s*true/);
  assert.doesNotMatch(syncProfessores, /nEAlBC5gjtqojA7qberYVOttD1lXdx/);
});

test('webhook de matricula nao autocorrige professor por nome', () => {
  assert.match(processarMatricula, /resolverProfessorOperacional/);
  assert.match(processarMatricula, /identidade_historica_valida/);
  assert.doesNotMatch(processarMatricula, /fallback por nome normalizado \+ unidade \(auto-cura\)/i);
  assert.doesNotMatch(processarMatricula, /update\(\{ emusys_id: emusysId \}\)/);
});

test('sync de matriculas separa professor operacional de autoria historica', () => {
  assert.match(syncMatriculas, /profMapJornada/);
  assert.match(syncMatriculas, /identidade_historica_valida/);
  assert.match(syncMatriculas, /validacao_status/);
  assert.match(syncMatriculas, /professorIdPorProfessorEmusys:\s*profMapJornada/);
});

test('jornada canonica aceita apenas vinculo ativo ou identidade historica auditada', () => {
  assert.match(jornadaCanonica, /identidade_historica_valida/);
  assert.match(jornadaCanonica, /emusys_ativo/);
  assert.match(jornadaCanonica, /validacao_status/);
});
