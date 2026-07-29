/// <reference lib="deno.ns" />

import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import {
  buildJornadaInputFromMatriculaApi,
  buildJornadaInputFromWebhook,
  buildJornadaRowsForUpsert,
  upsertJornadaMatriculaDisciplina,
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

Deno.test('data_primeira_fatura com ano zero da API vira null (regressao de producao)', () => {
  const input = buildJornadaInputFromMatriculaApi(
    matriculaFake({ data_primeira_fatura: '0000-12-18' }),
    UNIDADE,
  );
  assertEquals(input?.dataPrimeiraFatura, null);
});

Deno.test('data_primeira_fatura valida e preservada', () => {
  const input = buildJornadaInputFromMatriculaApi(
    matriculaFake({ data_primeira_fatura: '2025-06-05' }),
    UNIDADE,
  );
  assertEquals(input?.dataPrimeiraFatura, '2025-06-05');
});

Deno.test('data_primeira_fatura ausente ou vazia vira null', () => {
  const inputNula = buildJornadaInputFromMatriculaApi(
    matriculaFake({ data_primeira_fatura: null }),
    UNIDADE,
  );
  assertEquals(inputNula?.dataPrimeiraFatura, null);

  const inputVazia = buildJornadaInputFromMatriculaApi(
    matriculaFake({ data_primeira_fatura: '' }),
    UNIDADE,
  );
  assertEquals(inputVazia?.dataPrimeiraFatura, null);
});

// Payload real reduzido do webhook matricula_alterada (nao traz contrato_atual).
function webhookPayloadFake() {
  return {
    evento: 'matricula_alterada',
    matricula: {
      id: 238,
      aluno_id: 408,
      status: 'ativa',
      nome_aluno: 'Natan Pereira Calvo Demidoff',
      qtd_contratos: 2,
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
    },
  };
}

// Stub minimo de SupabaseClientLike: as chamadas de resolve (aluno/curso/
// professor) sempre devolvem `data: null` (nao afetam o teste); a chamada
// real que interessa e o payload passado a `.upsert()`, capturado aqui.
function fakeSupabaseCapturandoUpsert() {
  const captured: { rows: any[] | null } = { rows: null };
  const resolveChain: any = {
    select: () => resolveChain,
    eq: () => resolveChain,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  const client = {
    from: (table: string) => {
      if (table === 'aluno_jornada_matricula_disciplina') {
        return {
          upsert: (rows: any[]) => {
            captured.rows = rows;
            return Promise.resolve({ error: null });
          },
        };
      }
      return resolveChain;
    },
  };
  return { client, captured };
}

Deno.test('upsertJornadaMatriculaDisciplina: webhook sem contrato nao envia as 4 chaves (nao apaga o que o sync gravou)', async () => {
  const input = buildJornadaInputFromWebhook(webhookPayloadFake(), UNIDADE)!;
  const { client, captured } = fakeSupabaseCapturandoUpsert();

  await upsertJornadaMatriculaDisciplina(client, input);

  const row = captured.rows![0];
  assertEquals('nr_faturas' in row, false);
  assertEquals('data_primeira_fatura' in row, false);
  assertEquals('dia_vencimento_emusys' in row, false);
  assertEquals('inadimplente_emusys' in row, false);
});

Deno.test('upsertJornadaMatriculaDisciplina: input com contrato preenchido mantem as 4 chaves com os valores', async () => {
  const input = buildJornadaInputFromMatriculaApi(matriculaFake(), UNIDADE)!;
  const { client, captured } = fakeSupabaseCapturandoUpsert();

  await upsertJornadaMatriculaDisciplina(client, input);

  const row = captured.rows![0];
  assertEquals(row.nr_faturas, 12);
  assertEquals(row.data_primeira_fatura, '2025-06-05');
  assertEquals(row.dia_vencimento_emusys, 5);
  assertEquals(row.inadimplente_emusys, false);
});

Deno.test('API preserva estado v1.3.1 e detalhes do trancamento na jornada', () => {
  const input = buildJornadaInputFromMatriculaApi({
    ...matriculaFake(),
    status: 'trancada',
    trancamento_ativo: {
      id: 77,
      motivo: 'Viagem',
      data_inicial: '2026-07-10',
      data_final: '2026-08-10',
    },
  }, UNIDADE)!;

  const { rows } = buildJornadaRowsForUpsert(input);
  const row = rows[0];

  assertEquals(row.status_matricula, 'trancada');
  assertEquals(row.status_emusys, 'trancada');
  assertEquals(row.motivo_inativa, null);
  assertEquals(row.trancamento_id, 77);
  assertEquals(row.trancamento_motivo, 'Viagem');
  assertEquals(row.trancamento_data_inicial, '2026-07-10');
  assertEquals(row.trancamento_data_final, '2026-08-10');
});

Deno.test('webhook sem estado v1.3.1 nao envia colunas que apagariam o GET', async () => {
  const payload = webhookPayloadFake();
  delete payload.matricula.status;
  const input = buildJornadaInputFromWebhook(payload, UNIDADE)!;
  const { client, captured } = fakeSupabaseCapturandoUpsert();

  await upsertJornadaMatriculaDisciplina(client, input);

  const row = captured.rows![0];
  for (const field of [
    'status_matricula',
    'status_emusys',
    'motivo_inativa',
    'trancamento_id',
    'trancamento_motivo',
    'trancamento_data_inicial',
    'trancamento_data_final',
  ]) {
    assertEquals(field in row, false, `${field} nao deve ser enviado`);
  }
});

Deno.test('inativa concluida preserva motivo e encerra a jornada sem evasao implicita', () => {
  const input = buildJornadaInputFromMatriculaApi({
    ...matriculaFake(),
    status: 'inativa',
    motivo_inativa: 'concluida',
  }, UNIDADE)!;

  const { rows } = buildJornadaRowsForUpsert(input);
  assertEquals(rows[0].status_matricula, 'finalizada');
  assertEquals(rows[0].status_emusys, 'inativa');
  assertEquals(rows[0].motivo_inativa, 'concluida');
});
