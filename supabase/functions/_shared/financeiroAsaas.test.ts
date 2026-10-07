/// <reference lib="deno.ns" />
import { assertEquals, assertRejects, assertThrows } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import {
  mapearConvenio,
  mapearItemExtrato,
  verificarCadeiaBalance,
} from './financeiroAsaas.ts';

const UNIDADE = '368d47f5-2d88-4475-bc14-ba084a9a348e';

Deno.test('mapearItemExtrato mapeia o item cru da Asaas', async () => {
  const linha = await mapearItemExtrato({
    id: 'ftn_002043948477',
    value: 427,
    balance: 427,
    type: 'PAYMENT_RECEIVED',
    date: '2026-09-01',
    description: 'Cobrança recebida - fatura nr. 892848189 Fulano',
    paymentId: 'pay_abc',
    externalReference: '16329',
    transferId: null,
    pixTransactionId: null,
    splitId: null,
    anticipationId: null,
    billId: null,
    invoiceId: null,
    paymentDunningId: null,
    creditBureauReportId: null,
  }, UNIDADE, 3, 0);
  assertEquals(linha.asaas_id, 'ftn_002043948477');
  assertEquals(linha.convenio_id, 3);
  assertEquals(linha.valor, 427);
  assertEquals(linha.balance, 427);
  assertEquals(linha.tipo, 'PAYMENT_RECEIVED');
  assertEquals(linha.external_reference, '16329');
  assertEquals(linha.posicao_dia, 0);
  assertEquals(typeof linha.hash_conteudo, 'string');
});

Deno.test('mapearItemExtrato aceita type novo (lista aberta) e campos null', async () => {
  const linha = await mapearItemExtrato({
    id: 'ftn_x',
    value: -50,
    balance: null,
    type: 'PAYMENT_CHARGEBACK',
    date: '2026-02-10',
    description: null,
    paymentId: null,
    externalReference: null,
    transferId: null,
    pixTransactionId: null,
    splitId: null,
    anticipationId: null,
    billId: null,
    invoiceId: null,
    paymentDunningId: null,
    creditBureauReportId: null,
  }, UNIDADE, 4, 2);
  assertEquals(linha.tipo, 'PAYMENT_CHARGEBACK');
  assertEquals(linha.balance, null);
  assertEquals(linha.payment_id, null);
});

Deno.test('mapearItemExtrato rejeita item sem id, data inválida ou type vazio', async () => {
  const base = {
    value: 1, balance: 1, type: 'TRANSFER', date: '2026-09-01',
    description: null, paymentId: null, externalReference: null,
    transferId: null, pixTransactionId: null, splitId: null,
    anticipationId: null, billId: null, invoiceId: null,
    paymentDunningId: null, creditBureauReportId: null,
  };
  await assertRejects(() => mapearItemExtrato({ ...base, id: '' }, UNIDADE, 3, 0));
  await assertRejects(() => mapearItemExtrato({ ...base, id: 'ftn_a', date: '01/09/2026' }, UNIDADE, 3, 0));
  await assertRejects(() => mapearItemExtrato({ ...base, id: 'ftn_a', type: '' }, UNIDADE, 3, 0));
  assertThrows(() => mapearConvenio({ id: 'abc' }));
});

Deno.test('mapearConvenio extrai a conta bancária', () => {
  const conv = mapearConvenio({
    id: 5,
    status: 'ativo',
    conta_bancaria: {
      id: 1, descricao: 'Conta Kids CG', banco: 'BANCO SANTANDER (BRASIL) S.A.',
      agencia: '1534', numero: '130023602', titular: 'LA Music Kids LTDA',
    },
  });
  assertEquals(conv.convenio_id, 5);
  assertEquals(conv.conta_agencia, '1534');
  assertEquals(conv.conta_titular, 'LA Music Kids LTDA');
});

Deno.test('cadeia de balance sem quebra não reporta nada', () => {
  const quebras = verificarCadeiaBalance([
    { asaas_id: 'a', data: '2026-09-01', valor: 427, balance: 427 },
    { asaas_id: 'b', data: '2026-09-01', valor: -2.66, balance: 424.34 },
    { asaas_id: 'c', data: '2026-09-01', valor: -424.34, balance: 0 },
  ]);
  assertEquals(quebras, []);
});

Deno.test('cadeia de balance semeada pelo saldo anterior e detecta quebra', () => {
  const quebras = verificarCadeiaBalance([
    { asaas_id: 'a', data: '2026-09-02', valor: 100, balance: 100 },
    { asaas_id: 'b', data: '2026-09-02', valor: 10, balance: 999 },
  ], 0);
  assertEquals(quebras.length, 1);
  assertEquals(quebras[0].data, '2026-09-02');
  assertEquals(quebras[0].esperado, 110);
  assertEquals(quebras[0].encontrado, 999);
});

Deno.test('cadeia tolera centavos e itens sem balance', () => {
  const quebras = verificarCadeiaBalance([
    { asaas_id: 'a', data: '2026-09-01', valor: 0.1, balance: 0.1 },
    { asaas_id: 'b', data: '2026-09-01', valor: 0.2, balance: 0.30000000001 },
    { asaas_id: 'c', data: '2026-09-01', valor: 5, balance: null },
    { asaas_id: 'd', data: '2026-09-01', valor: 1, balance: 6.3 },
  ]);
  assertEquals(quebras, []);
});
