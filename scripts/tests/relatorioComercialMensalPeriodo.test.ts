import assert from 'node:assert/strict';
import { calcularRangeRelatorioMensalComercial } from '../../src/lib/relatorioComercialMensal.js';

const junho2026 = calcularRangeRelatorioMensalComercial(2026, 6);

assert.equal(junho2026.dataInicio, '2026-06-01');
assert.equal(junho2026.dataFim, '2026-06-30');
assert.equal(junho2026.ano, 2026);
assert.equal(junho2026.mes, 6);
assert.equal(junho2026.periodoLabel, 'JUNHO/2026');

const fevereiroBissexto = calcularRangeRelatorioMensalComercial(2024, 2);

assert.equal(fevereiroBissexto.dataInicio, '2024-02-01');
assert.equal(fevereiroBissexto.dataFim, '2024-02-29');
assert.equal(fevereiroBissexto.periodoLabel, 'FEVEREIRO/2024');

console.log('relatorioComercialMensalPeriodo OK');
