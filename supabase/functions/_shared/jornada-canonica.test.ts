/// <reference lib="deno.ns" />

import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import {
  buildJornadaInputFromMatriculaApi,
  buildJornadaRowsForUpsert,
} from './jornada-canonica.ts';

const UNIDADE = '368d47f5-2d88-4475-bc14-ba084a9a348e';

// Payload real reduzido: Natan Pereira Calvo Demidoff, Barra, matricula 238.
function matriculaFake(overrides: Record<string, unknown> = {}) {
  return {
    id: 238,
    status: 'ativa',
    qtd_contratos: 2,
    aluno: { id: 408, nome: 'Natan Pereira Calvo Demidoff' },
    contrato_atual: {
      id: 834,
      nr_faturas: 12,
      data_primeira_fatura: '2025-06-05',
      dia_vencimento: 5,
      inadimplente: false,
      disciplinas: [{
        matricula_disciplina_id: 834,
        disciplina_id: 7,
        nome: 'Bateria T',
        nr_aulas_contratadas: 40,
        nr_aulas_passadas: 39,
        nr_aulas_futuras: 1,
        data_hora_ultima_aula: '2026-08-08 15:00:00',
        agendamentos: [],
      }],
      ...overrides,
    },
  };
}

Deno.test('extrai campos de contrato do payload da API', () => {
  const input = buildJornadaInputFromMatriculaApi(matriculaFake(), UNIDADE);
  assertEquals(input?.nrFaturas, 12);
  assertEquals(input?.dataPrimeiraFatura, '2025-06-05');
  assertEquals(input?.diaVencimentoEmusys, 5);
  assertEquals(input?.inadimplenteEmusys, false);
});

Deno.test('campos de contrato ausentes viram null', () => {
  const input = buildJornadaInputFromMatriculaApi(
    { id: 1, aluno: { id: 2 }, contrato_atual: { disciplinas: [] } },
    UNIDADE,
  );
  assertEquals(input?.nrFaturas, null);
  assertEquals(input?.dataPrimeiraFatura, null);
  assertEquals(input?.diaVencimentoEmusys, null);
  assertEquals(input?.inadimplenteEmusys, null);
});

Deno.test('campos de contrato repetem em cada linha de disciplina', () => {
  const mat = matriculaFake();
  (mat.contrato_atual.disciplinas as unknown[]).push({
    matricula_disciplina_id: 999,
    disciplina_id: 8,
    nome: 'Canto T',
    nr_aulas_contratadas: 40,
    nr_aulas_passadas: 38,
    nr_aulas_futuras: 2,
    data_hora_ultima_aula: '2026-08-15 11:00:00',
    agendamentos: [],
  });
  const input = buildJornadaInputFromMatriculaApi(mat, UNIDADE)!;
  const { rows } = buildJornadaRowsForUpsert(input, {
    alunoIdPorMatriculaEmusys: new Map(),
    alunoIdPorAlunoEmusys: new Map(),
    cursoIdPorDisciplinaEmusys: new Map(),
    professorIdPorProfessorEmusys: new Map(),
  });
  assertEquals(rows.length, 2);
  for (const row of rows) {
    assertEquals(row.nr_faturas, 12);
    assertEquals(row.data_primeira_fatura, '2025-06-05');
    assertEquals(row.dia_vencimento_emusys, 5);
    assertEquals(row.inadimplente_emusys, false);
  }
});
