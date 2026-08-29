import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const toggle = readFileSync('src/components/App/Agenda/Chamada/ProfessorPresencaToggle.tsx', 'utf8');
const dia = readFileSync('src/components/App/Agenda/Chamada/ChamadaDia.tsx', 'utf8');
const migrations = readdirSync('supabase/migrations');
const migrationName = migrations
  .filter((name) => /_agenda_roster_operacional_professor\.sql$/u.test(name))
  .sort()
  .at(-1);
const presencaHistoricaMigrationName = migrations
  .filter((name) => /_agenda_presenca_historica_respeita_roster_operacional\.sql$/u.test(name))
  .sort()
  .at(-1);

test('ajuste por aula oferece Presente e Ausente como acoes explicitas', () => {
  assert.match(toggle, /async function marcarAula\(aula: AulaAgenda, novoPresente: boolean\)/u);
  assert.match(toggle, /onClick=\{\(\) => marcarAula\(aula, true\)\}[\s\S]*Presente/u);
  assert.match(toggle, /onClick=\{\(\) => marcarAula\(aula, false\)\}[\s\S]*Ausente/u);
  assert.doesNotMatch(toggle, /onClick=\{\(\) => toggleAula\(aula\)\}/u);
});

test('sem decisao e estado operacional, nao bloqueio nem auditoria falsa', () => {
  assert.match(toggle, /Não marcado/u);
  assert.doesNotMatch(toggle, /const presencaBloqueada/u);
  assert.doesNotMatch(toggle, /Em auditoria/u);
});

test('presenca do professor usa somente aulas regulares com roster operacional', () => {
  assert.match(dia, /const aulasProfessorOperacionais/u);
  assert.match(dia, /aula\.categoria\s*!==\s*'experimental'/u);
  assert.match(dia, /aula\.alunos\.length\s*>\s*0/u);
  assert.match(dia, /for \(const aula of aulasProfessorOperacionais\)/u);
  assert.ok(migrationName, 'falta migration para a Agenda ignorar vinculo de roster inativo');
  const migration = readFileSync(`supabase/migrations/${migrationName}`, 'utf8');
  assert.match(migration, /from (?:public\.)?aula_alunos_emusys aa[\s\S]*where aa\.ativo_operacional/iu);
  assert.ok(presencaHistoricaMigrationName, 'falta migration para impedir que historico reative roster inativo');
  const presencaHistoricaMigration = readFileSync(
    `supabase/migrations/${presencaHistoricaMigrationName}`,
    'utf8',
  );
  assert.match(
    presencaHistoricaMigration,
    /from (?:public\.)?aluno_presenca ap[\s\S]*aa_roster\.ativo_operacional/iu,
  );
});
