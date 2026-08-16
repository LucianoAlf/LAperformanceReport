import assert from 'node:assert/strict';
import test from 'node:test';

import {
  carregarLeituraFaturasAlunos,
  chaveFaturaAluno,
  criarUrlFaturasAlunos,
  filtrarFaturasAlunos,
} from '../src/lib/faturasAlunosCanonicas.ts';

const UNIDADE_A = '11111111-1111-1111-1111-111111111111';
const UNIDADE_B = '22222222-2222-2222-2222-222222222222';

const item = (overrides = {}) => ({
  canonical_fatura_id: '10000000-0000-0000-0000-000000000001',
  unidade_id: UNIDADE_A,
  unidade_codigo: 'CG',
  competencia: '2026-08-01',
  emusys_fatura_id: '1001',
  emusys_matricula_id: '2001',
  emusys_contrato_id: '3001',
  aluno_id_canonico: 10,
  contact_resolution_status: 'resolved',
  descricao: 'Parcela 08/2026',
  status: 'aberta',
  data_vencimento: '2026-08-05',
  dias_atraso: 11,
  valor_original: 447,
  valor_atualizado: 458.58,
  sync_completed_at: '2026-08-16T16:00:00Z',
  ...overrides,
});

const payloadV3 = () => ({
  schema_version: 3,
  status: 'partial',
  avaliado_em: '2026-08-16T16:01:00Z',
  policy: {
    delinquency_rule: 'd_plus_0',
    collection_grace_days: 2,
  },
  operational: {
    collection_allowed: true,
    collection_scope: 'confirmed_only',
    block_reasons: [],
    consumer_must_apply_collection_grace: true,
  },
  freshness: {
    competencias_stale: 0,
    ultimo_sync_mais_antigo: '2026-08-16T16:00:00Z',
    fresh_until: '2026-08-16T20:00:00Z',
  },
  reconciliation: {
    source_missing_count: 1,
    source_missing_open_count: 1,
    source_missing_other_count: 0,
    duplicate_fatura_count: 0,
    invalid_identity_invoice_count: 0,
    validation_issue_count: 0,
    contact_resolution_pending_count: 0,
  },
  totals: {
    total_faturas: 1,
    total_matriculas: 1,
    total_original: 447,
    total_atualizado: 458.58,
    maior_atraso: 11,
  },
  items: [item()],
});

test('adaptador consulta somente a RPC canonica v3 e preserva partial confirmado', async () => {
  const chamadas = [];
  const client = {
    async rpc(nome, args) {
      chamadas.push({ nome, args });
      return { data: payloadV3(), error: null };
    },
  };

  const state = await carregarLeituraFaturasAlunos(client, {
    unidadeId: UNIDADE_A,
    asOfDate: '2026-08-16',
  });

  assert.deepEqual(chamadas, [{
    nome: 'get_inadimplencia_canonica',
    args: { p_unidade_id: UNIDADE_A, p_as_of_date: '2026-08-16' },
  }]);
  assert.equal(state.schemaVersion, 3);
  assert.equal(state.status, 'partial');
  assert.equal(state.collectionAllowed, true);
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].valor_atualizado, 458.58);
  assert.deepEqual({
    unidadeCodigo: state.items[0].unidade_codigo,
    competencia: state.items[0].competencia,
    contrato: state.items[0].emusys_contrato_id,
    descricao: state.items[0].descricao,
    status: state.items[0].status,
  }, {
    unidadeCodigo: 'CG',
    competencia: '2026-08-01',
    contrato: '3001',
    descricao: 'Parcela 08/2026',
    status: 'aberta',
  });
});

test('chave da linha usa unidade, matricula e fatura canonica', () => {
  const mesmaFaturaOutraUnidade = item({ unidade_id: UNIDADE_B });
  assert.equal(
    chaveFaturaAluno(item()),
    `${UNIDADE_A}|2001|10000000-0000-0000-0000-000000000001`,
  );
  assert.notEqual(chaveFaturaAluno(item()), chaveFaturaAluno(mesmaFaturaOutraUnidade));
});

test('filtros mantem D+0 e D+2 distintos e nunca inferem source_missing como pagamento', () => {
  const itens = [
    item({ dias_atraso: 1, competencia: '2026-08-01' }),
    item({
      canonical_fatura_id: '10000000-0000-0000-0000-000000000002',
      emusys_fatura_id: '1002',
      emusys_matricula_id: '2002',
      aluno_id_canonico: 20,
      dias_atraso: 2,
      competencia: '2026-07-01',
    }),
  ];
  const cadastros = new Map([
    [10, { id: 10, nome: 'Brenda Pereira Dias', unidadeId: UNIDADE_A, cursoNome: 'Canto' }],
    [20, { id: 20, nome: 'Renan de Souza Corrêa', unidadeId: UNIDADE_A, cursoNome: 'Bateria' }],
  ]);

  assert.equal(filtrarFaturasAlunos(itens, cadastros, { situacao: 'confirmadas' }).length, 2);
  assert.deepEqual(
    filtrarFaturasAlunos(itens, cadastros, { situacao: 'cobranca_d2' }).map((row) => row.emusys_fatura_id),
    ['1002'],
  );
  assert.deepEqual(
    filtrarFaturasAlunos(itens, cadastros, { competencia: '2026-07-01', busca: 'renan' })
      .map((row) => row.emusys_fatura_id),
    ['1002'],
  );
});

test('atalhos A+C geram uma URL deterministica e compartilhavel', () => {
  assert.equal(
    criarUrlFaturasAlunos({
      unidadeId: UNIDADE_A,
      alunoId: 10,
      matriculaId: '2001',
      competencia: '2026-08-01',
      situacao: 'confirmadas',
    }),
    `/app/faturas?unidade=${UNIDADE_A}&aluno=10&matricula=2001&competencia=2026-08-01&situacao=confirmadas`,
  );
  assert.equal(criarUrlFaturasAlunos({ unidadeId: 'todos' }), '/app/faturas');
});
