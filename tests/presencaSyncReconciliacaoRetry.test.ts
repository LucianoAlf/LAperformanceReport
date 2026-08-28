/// <reference lib="deno.ns" />

import {
  reconciliarGradeSnapshotEmusys,
} from '../supabase/functions/_shared/reconciliacao-grade-snapshot.ts';

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`esperado ${JSON.stringify(expected)}, recebido ${JSON.stringify(actual)}`);
  }
}

const params = {
  syncRunId: '30000000-0000-4000-8000-000000000001',
  unidadeId: '10000000-0000-0000-0000-000000000001',
  dataInicio: '2026-08-28',
  dataFim: '2026-08-28',
  snapshot: [],
};

Deno.test('reconciliacao repete SQLSTATE transitorio e preserva fallback somente para PGRST202', async () => {
  const chamadas: string[] = [];
  const cliente = {
    rpc: async (nome: string) => {
      chamadas.push(nome);
      if (chamadas.length === 1) {
        return { data: null, error: { code: '55P03', message: 'privado' } };
      }
      return { data: { status: 'ok', estados_gravados: 0 }, error: null };
    },
  };

  const resposta = await reconciliarGradeSnapshotEmusys(
    cliente,
    params,
    { atrasoBaseMs: 1, atrasoMaximoMs: 1, dormir: async () => {} },
  );
  assertEquals(resposta.contrato, 'v2');
  assertEquals(chamadas, [
    'reconciliar_grade_snapshot_emusys_v2',
    'reconciliar_grade_snapshot_emusys_v2',
  ]);

  const fallback: string[] = [];
  const clienteFallback = {
    rpc: async (nome: string) => {
      fallback.push(nome);
      return nome.endsWith('_v2')
        ? { data: null, error: { code: 'PGRST202' } }
        : { data: { status: 'ok' }, error: null };
    },
  };
  const respostaFallback = await reconciliarGradeSnapshotEmusys(
    clienteFallback,
    { ...params, syncRunId: '30000000-0000-4000-8000-000000000002' },
    { dormir: async () => {} },
  );
  assertEquals(respostaFallback.contrato, 'v1_fallback');
  assertEquals(fallback, [
    'reconciliar_grade_snapshot_emusys_v2',
    'reconciliar_grade_snapshot_emusys_v1',
  ]);
});

Deno.test('reconciliacao esgotada propaga somente codigo seguro', async () => {
  let chamadas = 0;
  const cliente = {
    rpc: async () => {
      chamadas += 1;
      return { data: null, error: { code: '55P03', message: 'Aluno Privado' } };
    },
  };

  let recebido: unknown = null;
  try {
    await reconciliarGradeSnapshotEmusys(
      cliente,
      { ...params, syncRunId: '30000000-0000-4000-8000-000000000003' },
      {
        maxTentativas: 3,
        atrasoBaseMs: 1,
        atrasoMaximoMs: 1,
        dormir: async () => {},
      },
    );
  } catch (error) {
    recebido = error;
  }

  if (!(recebido instanceof Error)) throw new Error('falha esperada nao ocorreu');
  assertEquals(recebido.message, 'PRESENCA_SYNC_CONCORRENCIA_ESGOTADA');
  if (recebido.message.includes('Aluno Privado')) throw new Error('PII exposta');
  assertEquals(chamadas, 3);
});
