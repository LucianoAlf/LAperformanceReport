import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calcularTotaisFaturasFinanceiras,
  carregarFaturasAlunosFinanceiras,
  faturaAtendeSituacao,
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

test('adaptador preserva a foto canônica do aluno e o fallback legado', () => {
  const fotoAtual = 'https://cdn.example/alunos/10-atual.jpg';
  const fotoLegada = 'https://cdn.example/alunos/10-legada.jpg';
  const state = normalizarFaturasAlunosFinanceiras(payload({
    items: [item({
      aluno: {
        ...item().aluno,
        foto_url: fotoAtual,
        photo_url: fotoLegada,
      },
    })],
  }));

  assert.equal(state.status, 'ok');
  assert.equal(state.items[0].aluno.foto_url, fotoAtual);
  assert.equal(state.items[0].aluno.photo_url, fotoLegada);
});

// --- Totais da visao (cards acompanhando os filtros) -----------------------------------
// A paridade com a RPC e o que sustenta a mudanca: sem filtro local, somar os items no
// cliente tem que dar exatamente o mesmo que o servidor devolveu em `totais`. La eles saem
// do CTE itens_normais, que e o conjunto entregue em items quando p_status='todas'.

const parcelaPaga = (id, valor) => item({
  canonical_fatura_id: `${UNIDADE}:${id}`,
  emusys_fatura_id: String(id),
  tipo_fatura: 'parcela',
  status: 'paga',
  data_pagamento: '2026-08-05',
  valores: { ...item().valores, valor_hoje: null, valor_pago: valor },
  cobranca: { d0: false, d2_elegivel: false, motivo_nao_elegivel: 'paga' },
});

// Taxa de matricula nao e parcelada: o adaptador recusa numero de parcela em tipo que nao
// seja 'parcela', e e assim que o Emusys entrega.
const taxaPaga = (id, valor) => ({
  ...parcelaPaga(id, valor),
  tipo_fatura: 'passaporte_taxa_matricula',
  descricao: 'Taxa de matrícula',
  numero_parcela: null,
  total_parcelas_contrato: null,
});

const abertaAVencer = (id, valor) => item({
  canonical_fatura_id: `${UNIDADE}:${id}`,
  emusys_fatura_id: String(id),
  status: 'aberta',
  data_vencimento: '2026-08-28',
  valores: { ...item().valores, valor_hoje: valor, valor_pago: null },
  cobranca: { d0: false, d2_elegivel: false, motivo_nao_elegivel: 'nao_vencida' },
});

test('totais da visao batem com os totais da RPC quando nenhum filtro local esta ativo', () => {
  const items = [parcelaPaga(1, 400), taxaPaga(2, 50), abertaAVencer(3, 417), item()];
  const state = normalizarFaturasAlunosFinanceiras(payload({
    items,
    totais: {
      todas: { quantidade: 4, valor: 1327.65 },
      pagas: { quantidade: 2, valor: 450 },
      em_aberto: { quantidade: 2, valor: 877.65 },
      em_atraso_d0: { quantidade: 1, valor: 460.65 },
      a_vencer: { quantidade: 1, valor: 417 },
      canceladas: { quantidade: 0, valor: 0 },
      cobranca_d2: { quantidade: 1, valor: 460.65 },
      visao_atual: { quantidade: 4, valor: 1327.65, status: 'todas' },
    },
  }));

  assert.equal(state.status, 'ok', state.error ?? 'sem erro reportado');
  const totais = calcularTotaisFaturasFinanceiras(state.items);
  for (const chave of ['todas', 'pagas', 'em_aberto', 'em_atraso_d0', 'a_vencer', 'cobranca_d2']) {
    assert.deepEqual(totais[chave], state.totals[chave], `divergencia no total de ${chave}`);
  }
});

test('filtrar por tipo recorta os totais: parcela deixa a taxa de matricula de fora', () => {
  const state = normalizarFaturasAlunosFinanceiras(payload({
    items: [parcelaPaga(1, 400), parcelaPaga(2, 355), taxaPaga(3, 50)],
  }));
  const soParcelas = filtrarFaturasFinanceirasLocais(state.items, { tipoFatura: 'parcela' });

  const totais = calcularTotaisFaturasFinanceiras(soParcelas);
  assert.equal(totais.todas.quantidade, 2);
  assert.equal(totais.pagas.quantidade, 2);
  assert.equal(totais.pagas.valor, 755);
  // O total da competencia continua intacto para virar o baseline do cartao.
  assert.equal(state.totals.pagas.quantidade, 0);
});

test('a_vencer e o complemento exato de em_atraso dentro das abertas', () => {
  const state = normalizarFaturasAlunosFinanceiras(payload({
    items: [item(), abertaAVencer(2, 417), parcelaPaga(3, 400)],
  }));

  const abertas = state.items.filter((linha) => faturaAtendeSituacao(linha, 'em_aberto'));
  const atrasadas = state.items.filter((linha) => faturaAtendeSituacao(linha, 'em_atraso_d0'));
  const aVencer = state.items.filter((linha) => faturaAtendeSituacao(linha, 'a_vencer'));

  assert.equal(abertas.length, 2);
  assert.equal(atrasadas.length + aVencer.length, abertas.length);
  assert.equal(atrasadas.some((linha) => aVencer.includes(linha)), false);
});

test('soma nao acumula erro de ponto flutuante', () => {
  const state = normalizarFaturasAlunosFinanceiras(payload({
    items: [parcelaPaga(1, 0.1), parcelaPaga(2, 0.2)],
  }));

  assert.equal(calcularTotaisFaturasFinanceiras(state.items).pagas.valor, 0.3);
});
