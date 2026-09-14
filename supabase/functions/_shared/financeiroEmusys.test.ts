/// <reference lib="deno.ns" />
import { assert, assertEquals, assertRejects, assertThrows } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import {
  extrairCodigoPlano,
  janelaRotinaDiaria,
  mapearLancamento,
  resumoJanela,
  validarData,
  validarNatureza,
} from './financeiroEmusys.ts';

Deno.test('extrairCodigoPlano pega o código do INÍCIO do nome', () => {
  assertEquals(extrairCodigoPlano('5.2.4 Aluguel'), '5.2.4');
  assertEquals(extrairCodigoPlano('3.1.1 Parcelas'), '3.1.1');
  assertEquals(extrairCodigoPlano('7 Não Operacionais'), '7');
  assertEquals(extrairCodigoPlano('\u00A0 4.1.3 Taxa de Operadora de Cartão'), '4.1.3');
  assertEquals(extrairCodigoPlano('Taxas de Antecipação de Valores'), null);
  assertEquals(extrairCodigoPlano(null), null);
  // ⚠️ o campo codigo da API é numeração INTERNA ("6") — não entra aqui
});

Deno.test('validarNatureza aceita só as 5 naturezas medidas', () => {
  for (const n of ['entrada', 'saida', 'transferencia', 'estorno', 'estornado']) {
    assertEquals(validarNatureza(n), n);
  }
  assertThrows(() => validarNatureza('transferência'));
  assertThrows(() => validarNatureza(''));
});

Deno.test('mapearLancamento espelha o item cru com tracking preparado', async () => {
  // transferência "Repasse da Operadora" de verdade (medida 14/09/2026):
  // conta vem {id fantasma, descricao ''} e forma_pagamento null
  const linha = await mapearLancamento({
    id: 82420,
    data: '2026-08-05',
    valor: -728.57,
    natureza: 'transferencia',
    conta: { id: 1002, descricao: '' },
    plano_contas: { id: 12, nome: '3.1.1 Parcelas' },
    forma_pagamento: null,
    descricao: 'Repasse da Operadora (Pgtos em Débito) - Parcelas 08/2026 de Kamilly Azevedo',
  }, '2ec861f6-023f-4d7b-9927-3960ad8c2a92');

  assertEquals(linha.emusys_lancamento_id, 82420);
  assertEquals(linha.valor, -728.57); // sinal preservado como vem
  assertEquals(linha.natureza, 'transferencia');
  assertEquals(linha.conta_emusys_id, 1002);
  assertEquals(linha.conta_descricao, null); // '' vira null — não finge cadastro
  assertEquals(linha.plano_codigo, '3.1.1');
  assertEquals(linha.forma_pagamento_emusys_id, null);
  assert(linha.hash_conteudo.length === 64);
  assertEquals(linha.emusys_lancamento_id, 82420);

  // mesmo payload muda de unidade: hash NÃO entra unidade (chave única carrega isso)
  const outra = await mapearLancamento({
    id: 82420, data: '2026-08-05', valor: -728.57, natureza: 'transferencia',
    conta: { id: 1002, descricao: '' }, plano_contas: { id: 12, nome: '3.1.1 Parcelas' },
    forma_pagamento: null, descricao: 'Repasse da Operadora (Pgtos em Débito) - Parcelas 08/2026 de Kamilly Azevedo',
  }, '368d47f5-2d88-4475-bc14-ba084a9a348e');
  assertEquals(outra.hash_conteudo, linha.hash_conteudo);
});

Deno.test('mapearLancamento recusa payload quebrado em vez de gravar lixo', async () => {
  await assertRejects(() => mapearLancamento({
    id: 1, data: '32/08/2026', valor: 1, natureza: 'entrada',
    conta: null, plano_contas: null, forma_pagamento: null, descricao: null,
  }, 'u'));
  await assertRejects(() => mapearLancamento({
    id: 'abc', data: '2026-08-01', valor: 1, natureza: 'entrada',
    conta: null, plano_contas: null, forma_pagamento: null, descricao: null,
  }, 'u'));
});

Deno.test('resumoJanela lista os dias e rejeita janela invertida', () => {
  assertEquals(resumoJanela('2026-08-30', '2026-09-01'), ['2026-08-30', '2026-08-31', '2026-09-01']);
  assertThrows(() => resumoJanela('2026-09-05', '2026-09-01'));
});

Deno.test('janelaRotinaDiaria = mês corrente + 2 anteriores, teto em hoje', () => {
  assertEquals(janelaRotinaDiaria('2026-09-14'), { inicio: '2026-07-01', fim: '2026-09-14' });
  assertEquals(janelaRotinaDiaria('2026-01-10'), { inicio: '2025-11-01', fim: '2026-01-10' });
});

Deno.test('validarData exige ISO YYYY-MM-DD', () => {
  assertEquals(validarData('2026-09-01'), '2026-09-01');
  assertThrows(() => validarData('2026-9-1'));
});
