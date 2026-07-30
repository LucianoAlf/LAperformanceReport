/// <reference lib="deno.ns" />

import { assertEquals } from 'jsr:@std/assert@1';
import {
  resolverTelefonePesquisa,
  telefonePesquisaValido,
} from './contract.ts';

Deno.test('telefone de teste tem prioridade sobre os dados do aluno', () => {
  assertEquals(
    resolverTelefonePesquisa({
      telefoneOverride: '(21) 99999-0000',
      telefoneSnapshot: '21988887777',
      whatsappAluno: '21977776666',
      telefoneAluno: '21966665555',
    }),
    '5521999990000',
  );
});

Deno.test('usa whatsapp do aluno quando o snapshot da movimentacao esta vazio', () => {
  assertEquals(
    resolverTelefonePesquisa({
      telefoneOverride: '',
      telefoneSnapshot: null,
      whatsappAluno: '(21) 98888-7777',
      telefoneAluno: null,
    }),
    '5521988887777',
  );
});

Deno.test('normaliza numero brasileiro local com DDD', () => {
  assertEquals(
    resolverTelefonePesquisa({
      telefoneSnapshot: '21 99929-2881',
    }),
    '5521999292881',
  );
});

Deno.test('rejeita telefone curto', () => {
  assertEquals(telefonePesquisaValido('5521999292881'), true);
  assertEquals(telefonePesquisaValido('999292881'), false);
});
