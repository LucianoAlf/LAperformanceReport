import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { leadExperimentalCobrePendencia } from '../src/lib/agenda.ts';

const migrationPath =
  'supabase/migrations/20260815140235_agenda_dedup_lead_convertido_presenca.sql';
const fixMigrationPath =
  'supabase/migrations/20260912123606_agenda_experimental_aula_canonica.sql';
const read = (path) => fs.readFileSync(path, 'utf8');

test('lead convertido representado no roster não abre uma pendência duplicada', () => {
  assert.equal(
    leadExperimentalCobrePendencia(
      { aluno_id: 2205, status: 'experimental_agendada' },
      [{ aluno_id: 2205 }],
    ),
    false,
  );
});

test('lead convertido sem presença continua sendo responsabilidade do aluno, não do lead duplicado', () => {
  assert.equal(
    leadExperimentalCobrePendencia(
      { aluno_id: 2205, status: 'experimental_agendada' },
      [{ aluno_id: 2205 }],
    ),
    false,
  );
});

test('lead sem aluno vinculado continua pendente até presença ou falta experimental', () => {
  assert.equal(
    leadExperimentalCobrePendencia(
      { aluno_id: null, status: 'experimental_agendada' },
      [],
    ),
    true,
  );
  assert.equal(
    leadExperimentalCobrePendencia(
      { aluno_id: null, status: 'experimental_realizada' },
      [],
    ),
    false,
  );
  assert.equal(
    leadExperimentalCobrePendencia(
      { aluno_id: null, status: 'experimental_faltou' },
      [],
    ),
    false,
  );
});

test('migration deduplica por aluno_id nas agendas diária e semanal', () => {
  assert.equal(fs.existsSync(migrationPath), true, `${migrationPath} deve existir`);
  const sql = read(migrationPath);

  assert.match(sql, /get_agenda_dia\(date, uuid\)/i);
  assert.match(sql, /get_agenda_semana\(date, uuid\)/i);
  assert.match(sql, /coalesce\(\s*le\.aluno_id\s*,\s*l\.aluno_id\s*\)/i);
  assert.match(sql, /['"]aluno_id['"]\s*,\s*coalesce\(\s*le\.aluno_id\s*,\s*l\.aluno_id\s*\)/i);
  assert.match(sql, /participantes/i);
  assert.match(sql, /aula_alunos_emusys/i);
  assert.match(sql, /aluno_presenca/i);
  assert.match(sql, /not exists/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.(?:lead_experimentais|aluno_presenca)/i);
  assert.doesNotMatch(sql, /update\s+public\.(?:lead_experimentais|aluno_presenca)/i);
});

test('experimental com aula Emusys propria nao e deduplicada pelo roster regular do mesmo horario', () => {
  const sql = read(fixMigrationPath);

  assert.match(
    sql,
    /nullif\(le\.emusys_aula_id,\s*0\)[\s\S]*le\.emusys_aula_id\s*=\s*b\.emusys_id/iu,
  );
  assert.match(
    sql,
    /aa_exp\.aula_emusys_id\s*=\s*b\.id[\s\S]*aa_exp\.ativo_operacional/iu,
  );
  assert.match(sql, /experimental_realizada/iu);
  assert.match(sql, /experimental_faltou/iu);
  assert.match(sql, /lead_experimentais/iu);
  assert.doesNotMatch(
    sql,
    /update\s+public\.(?:aluno_presenca|aula_alunos_emusys|alunos)/iu,
  );
});

test('consumidores da Agenda usam a mesma identidade do lead experimental', () => {
  const agendaPage = read('src/components/App/Agenda/AgendaPage.tsx');
  const alerta = read('src/components/App/Agenda/Chamada/AlertaPendencias.tsx');
  const semana = read('src/components/App/Agenda/Chamada/ChamadaSemana.tsx');
  const lista = read('src/components/App/Agenda/Chamada/ChamadaLista.tsx');
  const utils = read('src/components/App/Agenda/Chamada/chamadaUtils.ts');
  const hook = read('src/hooks/useAgendaDia.ts');

  assert.match(hook, /interface LeadExperimentalAgenda[\s\S]*aluno_id:\s*number\s*\|\s*null/i);
  assert.match(utils, /leadExperimentalCobrePendencia/i);
  assert.match(semana, /experimental_leads/i);
  assert.match(lista, /experimental_leads/i);
  assert.match(alerta, /presenca\.pendencias/i);
  assert.doesNotMatch(agendaPage, /leadExperimentalSemDestino/i);
});
