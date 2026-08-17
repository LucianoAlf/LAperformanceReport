import assert from 'node:assert/strict';
import test from 'node:test';

import {
  carregarFaturasAlunosFinanceiras,
  filtrarFaturasFinanceirasLocais,
  normalizarFaturasAlunosFinanceiras,
} from '../src/lib/faturasAlunosFinanceiras.ts';

const UNIDADE = '11111111-1111-1111-1111-111111111111';

const item = (overrides = {}) => ({
  canonical_fatura_id: '11111111-1111-1111-1111-111111111111:1001',
  unidade_id: UNIDADE,
  unidade_codigo: 'CG',
  competencia: '2026-08-01',
  emusys_fatura_id: '1001',
  emusys_matricula_id: '2001',
  emusys_contrato_id: '3001',
  emusys_student_id: '4001',
  descricao: 'Parcela 08/2026',
  tipo_fatura: 'parcela',
  numero_parcela: 8,
  total_parcelas_contrato: 12,
  status: 'aberta',
  data_vencimento: '2026-08-05',
  data_pagamento: null,
  aluno: { id: 10, nome: 'Ana Financeira', curso_nome: 'Bateria', estado_operacional: 'ativo' },
  forma_pagamento: { rotulo: 'Forma prevista', nome: 'PIX Automático', fonte: 'matricula' },
  valores: {
    valor_com_desconto: 420,
    valor_sem_desconto_condicional: 450,
    multa: 9,
    mora: 1.65,
    valor_hoje: 460.65,
    valor_pago: null,
    juros_e_multa_snapshot: 0,
  },
  cobranca: { d0: true, d2_elegivel: true, motivo_nao_elegivel: null },
  sync_completed_at: '2026-08-17T12:00:00Z',
  sync_fresh_until: '2026-08-17T12:15:00Z',
  ...overrides,
});

const payload = (overrides = {}) => ({
  schema_version: 1,
  fonte: 'sync_run_items',
  status: 'ok',
  as_of_date: '2026-08-17',
  periodo: { modo: 'janela_3', competencia_inicio: '2026-06-01', competencia_fim: '2026-08-01' },
  freshness: {
    competencias_necessarias: 3,
    competencias_frescas: 3,
    competencias_stale: 0,
    sync_mais_antigo: '2026-08-17T12:00:00Z',
    valido_ate: '2026-08-17T12:15:00Z',
  },
  operational: { collection_allowed: true, collection_scope: 'confirmed_only' },
  totais: {
    todas: { quantidade: 1, valor: 460.65 },
    pagas: { quantidade: 0, valor: 0 },
    em_aberto: { quantidade: 1, valor: 460.65 },
    em_atraso_d0: { quantidade: 1, valor: 460.65 },
    a_vencer: { quantidade: 0, valor: 0 },
    canceladas: { quantidade: 0, valor: 0 },
    cobranca_d2: { quantidade: 1, valor: 460.65 },
    visao_atual: { quantidade: 1, valor: 460.65, status: 'todas' },
  },
  items: [item()],
  reconciliation: {
    source_missing: 0,
    identidade_invalida: 0,
    status_desconhecido: 0,
    validacoes_origem: 0,
    forma_pagamento_ausente: 0,
    contato_pendente: 0,
    total: 0,
    items: [],
  },
  ...overrides,
});

test('adaptador financeiro chama a RPC com os filtros canônicos', async () => {
  const calls = [];
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: payload(), error: null };
    },
  };

  const state = await carregarFaturasAlunosFinanceiras(client, {
    unidadeId: UNIDADE,
    ano: 2026,
    mes: 8,
    modoPeriodo: 'janela_3',
    situacao: 'em_atraso_d0',
    asOfDate: '2026-08-17',
  });

  assert.deepEqual(calls, [{
    name: 'get_faturas_alunos_financeiro_v1',
    args: {
      p_unidade_id: UNIDADE,
      p_ano: 2026,
      p_mes: 8,
      p_modo_periodo: 'janela_3',
      p_status: 'em_atraso_d0',
      p_as_of_date: '2026-08-17',
    },
  }]);
  assert.equal(state.status, 'ok');
  assert.equal(state.items[0].valores.valor_hoje, 460.65);
});

test('adaptador bloqueia a leitura se uma fatura traz valor financeiro inválido', () => {
  const invalid = item({
    valores: { ...item().valores, valor_hoje: 'não é número' },
  });
  const state = normalizarFaturasAlunosFinanceiras(payload({ items: [invalid] }));

  assert.equal(state.status, 'error');
  assert.equal(state.collectionAllowed, false);
  assert.equal(state.items.length, 0);
});

test('snapshot stale nunca libera Cobrar agora D+2 mesmo se a origem disser que libera', () => {
  const state = normalizarFaturasAlunosFinanceiras(payload({
    status: 'stale',
    freshness: {
      competencias_necessarias: 3,
      competencias_frescas: 2,
      competencias_stale: 1,
      sync_mais_antigo: '2026-08-17T08:00:00Z',
      valido_ate: '2026-08-17T10:00:00Z',
    },
    operational: { collection_allowed: true, collection_scope: 'confirmed_only' },
  }));

  assert.equal(state.status, 'stale');
  assert.equal(state.collectionAllowed, false);
  assert.equal(state.collectionScope, 'blocked');
});

test('adaptador bloqueia reconciliacao que chega com data invalida', () => {
  const pendencia = item({ data_vencimento: '2026-02-31' });
  const state = normalizarFaturasAlunosFinanceiras(payload({
    items: [],
    reconciliation: {
      source_missing: 1,
      identidade_invalida: 0,
      status_desconhecido: 0,
      validacoes_origem: 0,
      forma_pagamento_ausente: 0,
      contato_pendente: 0,
      total: 1,
      items: [{ ...pendencia, motivos: ['source_missing'], validation_issues: [], source_missing_reason: 'not_observed' }],
    },
  }));

  assert.equal(state.status, 'error');
  assert.equal(state.reconciliation.items.length, 0);
});

test('adaptador aceita forma prevista pela matricula Emusys e separa itens fora da operacao', () => {
  const pending = item({
    forma_pagamento: { rotulo: 'Forma prevista', nome: 'Pix Automático', fonte: 'emusys_matricula' },
    valores: { ...item().valores, valor_original: 450 },
    motivos: ['forma_pagamento_ausente'],
  });
  const state = normalizarFaturasAlunosFinanceiras(payload({
    items: [],
    reconciliation: {
      source_missing: 0,
      identidade_invalida: 0,
      status_desconhecido: 0,
      validacoes_origem: 0,
      forma_pagamento_ausente: 0,
      contato_pendente: 0,
      total: 1,
      resolvidas_manualmente: 2,
      fora_operacao: { historico_ex_aluno: 3, registro_nao_aluno: 4, total: 7 },
      items: [pending],
    },
  }));

  assert.equal(state.status, 'ok');
  assert.equal(state.reconciliation.items[0].forma_pagamento.fonte, 'emusys_matricula');
  assert.equal(state.reconciliation.resolvidasManualmente, 2);
  assert.deepEqual(state.reconciliation.foraOperacao, {
    historicoExAluno: 3,
    registroNaoAluno: 4,
    total: 7,
  });
});

test('filtro de tipo separa passaporte de parcela sem misturar forma de pagamento', () => {
  const passaporte = item({
    emusys_fatura_id: '1002',
    descricao: 'Passaporte promocional do curso de Canto',
    tipo_fatura: 'passaporte_taxa_matricula',
    numero_parcela: null,
    forma_pagamento: { rotulo: 'Pago via', nome: 'Cartão de Crédito Mastercard', fonte: 'transacao' },
    status: 'paga',
    data_pagamento: '2026-07-30',
    valores: { ...item().valores, valor_hoje: null, valor_pago: 400 },
  });

  const result = filtrarFaturasFinanceirasLocais([item(), passaporte], {
    tipoFatura: 'passaporte_taxa_matricula',
    pagamento: 'Cartão de Crédito Mastercard',
  });

  assert.deepEqual(result.map((row) => row.emusys_fatura_id), ['1002']);
  assert.equal(result[0].valores.valor_pago, 400);
});
