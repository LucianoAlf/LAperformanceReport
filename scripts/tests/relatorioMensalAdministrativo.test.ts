import assert from 'node:assert/strict';
import {
  calcularKpisMensaisAdministrativos,
  valorPerdidoRelatorioMensal,
} from '../../src/lib/relatorioMensalAdministrativo.js';

const evasoes = [
  { tipo: 'evasao', valor_parcela_evasao: 397 },
  { tipo: 'evasao', valor_parcela_anterior: 280 },
];

const naoRenovacoes = [
  { tipo: 'nao_renovacao', alunos: { valor_parcela: 350 } },
];

assert.equal(valorPerdidoRelatorioMensal(evasoes[0]), 397);
assert.equal(valorPerdidoRelatorioMensal(evasoes[1]), 280);
assert.equal(valorPerdidoRelatorioMensal(naoRenovacoes[0]), 350);

const kpis = calcularKpisMensaisAdministrativos({
  resumo: {
    alunos_pagantes: 431,
    ticket_medio: 390,
    faturamento: 0,
    ltv_meses: 19.5,
    churn_rate: 0,
    mrr_perdido: 0,
    evasoes_interrompido: 10,
    evasoes_nao_renovou: 2,
  },
  evasoes,
  naoRenovacoes,
});

assert.equal(kpis.ticketMedio, 390);
assert.equal(kpis.mrrAtual, 168090);
assert.equal(kpis.ltv, 7605);
assert.equal(kpis.mrrPerdido, 1027);
assert.equal(kpis.churnRate.toFixed(1), '2.8');

console.log('relatorioMensalAdministrativo OK');
