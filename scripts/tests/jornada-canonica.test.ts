import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildJornadaInputFromMatriculaApi,
  buildJornadaInputFromWebhook,
  buildJornadaRowsForUpsert,
  upsertJornadaMatriculaDisciplina,
} from '../../supabase/functions/_shared/jornada-canonica.ts';

function createSupabaseMock() {
  const captured: Record<string, unknown[]> = {};

  function makeQuery(table: string) {
    const filters: Record<string, unknown> = {};
    const query = {
      select() {
        return query;
      },
      eq(column: string, value: unknown) {
        filters[column] = value;
        return query;
      },
      async maybeSingle() {
        if (table === 'alunos') {
          if (filters.emusys_matricula_id === '9001') return { data: { id: 101 }, error: null };
          if (filters.emusys_student_id === '3001') return { data: { id: 101 }, error: null };
        }
        if (table === 'curso_emusys_depara') {
          return { data: { curso_id: Number(filters.emusys_disciplina_id) + 1000 }, error: null };
        }
        if (table === 'professores_unidades') {
          return { data: { professor_id: Number(filters.emusys_id) + 2000 }, error: null };
        }
        return { data: null, error: null };
      },
      async upsert(rows: unknown[], options: unknown) {
        captured[table] = Array.isArray(rows) ? rows : [rows];
        captured[`${table}:options`] = [options];
        return { data: rows, error: null };
      },
    };
    return query;
  }

  return {
    captured,
    from(table: string) {
      return makeQuery(table);
    },
  };
}

test('builds one canonical journey per matricula disciplina from webhook payload', async () => {
  const input = buildJornadaInputFromWebhook({
    evento: 'matricula_alterada',
    matricula: {
      aluno_id: 3001,
      matricula_id: 9001,
      nome_aluno: 'Joao Silva',
      qtd_contratos: 2,
      status: 'ativa',
      disciplinas: [
        {
          matricula_disciplina_id: 42,
          disciplina_id: 10,
          nome: 'Piano',
          id_professor: 5,
          nome_professor: 'Professor Piano',
          nr_aulas_contratadas: 40,
          nr_aulas_passadas: 35,
          nr_aulas_futuras: 5,
          data_hora_primeira_aula: '2024-02-01 14:00:00',
          data_hora_ultima_aula: '2024-12-15 14:00:00',
          agendamentos: [{ dia_da_semana_nome: 'Segunda-feira', horario: '14:00' }],
        },
        {
          matricula_disciplina_id: 43,
          disciplina_id: 11,
          nome: 'Canto',
          id_professor: 6,
          nome_professor: 'Professor Canto',
          nr_aulas_contratadas: 40,
          nr_aulas_passadas: 3,
          nr_aulas_futuras: 37,
          agendamentos: [{ dia_da_semana_nome: 'Terca-feira', horario: '15:00' }],
        },
      ],
    },
  }, 'unidade-recreio', 'webhook:matricula_alterada');

  assert.equal(input?.disciplinas.length, 2);

  const supabase = createSupabaseMock();
  const result = await upsertJornadaMatriculaDisciplina(supabase, input!);

  assert.equal(result.updated, 2);
  assert.equal(result.errors.length, 0);

  const rows = supabase.captured.aluno_jornada_matricula_disciplina as Array<Record<string, unknown>>;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].aluno_id, 101);
  assert.equal(rows[0].emusys_matricula_disciplina_id, 42);
  assert.equal(rows[0].proxima_aula_numero, 36);
  assert.equal(rows[0].percentual_jornada, 87.5);
  assert.equal(rows[0].curso_id, 1010);
  assert.equal(rows[0].professor_id, 2005);
  assert.equal(rows[1].emusys_matricula_disciplina_id, 43);
  assert.equal(rows[1].proxima_aula_numero, 4);
});

test('builds canonical journey from /matriculas contrato_atual payload', () => {
  const input = buildJornadaInputFromMatriculaApi({
    id: 9001,
    status: 'Em andamento',
    qtd_contratos: 1,
    aluno: { id: 3001, nome: 'Joao Silva' },
    contrato_atual: {
      disciplinas: [{
        matricula_disciplina_id: 44,
        disciplina_id: 12,
        nome: 'Bateria',
        id_professor: 7,
        nr_aulas_contratadas: 40,
        nr_aulas_passadas: 40,
        nr_aulas_futuras: 0,
      }],
    },
  }, 'unidade-barra');

  assert.equal(input?.emusysMatriculaId, 9001);
  assert.equal(input?.disciplinas.length, 1);
  assert.equal(input?.disciplinas[0].matriculaDisciplinaId, 44);
  assert.equal(input?.disciplinas[0].nrAulasFuturas, 0);
});

test('builds batch upsert rows from preloaded sync maps', () => {
  const input = buildJornadaInputFromMatriculaApi({
    id: 9002,
    status: 'Em andamento',
    aluno: { id: 3002, nome: 'Maria Silva' },
    contrato_atual: {
      disciplinas: [{
        matricula_disciplina_id: 45,
        disciplina_id: 13,
        nome: 'Guitarra',
        id_professor: 8,
        nr_aulas_contratadas: 40,
        nr_aulas_passadas: 14,
        nr_aulas_futuras: 26,
      }],
    },
  }, 'unidade-cg');

  const { rows, skipped } = buildJornadaRowsForUpsert(input!, {
    alunoIdPorMatriculaEmusys: new Map([[9002, 102]]),
    alunoIdPorAlunoEmusys: new Map([[3002, 103]]),
    cursoIdPorDisciplinaEmusys: new Map([[13, 2013]]),
    professorIdPorProfessorEmusys: new Map([[8, 3008]]),
  });

  assert.equal(skipped, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].aluno_id, 102);
  assert.equal(rows[0].curso_id, 2013);
  assert.equal(rows[0].professor_id, 3008);
  assert.equal(rows[0].proxima_aula_numero, 15);
  assert.equal(rows[0].percentual_jornada, 35);
});

test('caps journey percentage when Emusys counters pass contracted classes', () => {
  const input = buildJornadaInputFromMatriculaApi({
    id: 9003,
    aluno: { id: 3003, nome: 'Aluno Renovacao' },
    contrato_atual: {
      disciplinas: [{
        matricula_disciplina_id: 46,
        disciplina_id: 14,
        nome: 'Teclado',
        nr_aulas_contratadas: 40,
        nr_aulas_passadas: 41,
        nr_aulas_futuras: 0,
      }],
    },
  }, 'unidade-recreio');

  const { rows } = buildJornadaRowsForUpsert(input!);

  assert.equal(rows[0].nr_aulas_passadas, 41);
  assert.equal(rows[0].nr_aulas_contratadas, 40);
  assert.equal(rows[0].percentual_jornada, 100);
});
