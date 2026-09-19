/// <reference lib="deno.ns" />

import {
  assertEquals,
  assertNotStrictEquals,
} from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import {
  extrairMatriculasCpfParaHmac,
  normalizarCpfDigitos,
  removerCpfClaro,
} from './emusys-cpf-privacy.ts';

Deno.test('normaliza CPF para onze digitos e rejeita documento incompleto', () => {
  assertEquals(normalizarCpfDigitos('123.456.789-01'), '12345678901');
  assertEquals(normalizarCpfDigitos(' 12345678901 '), '12345678901');
  assertEquals(normalizarCpfDigitos('1234'), null);
  assertEquals(normalizarCpfDigitos(null), null);
});

Deno.test('remove campos de CPF recursivamente sem alterar o objeto de origem', () => {
  const origem = {
    aluno: { id: 41, cpf: '123.456.789-01', nome: 'Aluno' },
    responsavel: { cpf_responsavel: '987.654.321-00', nome: 'Responsavel' },
    lista: [{ CPF: '11122233344' }, { cpf_hash: 'digest-ja-seguro' }],
  };

  const limpo = removerCpfClaro(origem);

  assertNotStrictEquals(limpo, origem);
  assertEquals(limpo, {
    aluno: { id: 41, nome: 'Aluno' },
    responsavel: { nome: 'Responsavel' },
    lista: [{}, { cpf_hash: 'digest-ja-seguro' }],
  });
  assertEquals(origem.aluno.cpf, '123.456.789-01');
});

Deno.test('extrai aluno e responsavel por matricula e unidade sem misturar IDs iguais', () => {
  const linhas = extrairMatriculasCpfParaHmac([
    {
      id: 701,
      aluno: { id: 91, cpf: '123.456.789-01' },
      responsavel: { id: 92, cpf: '987.654.321-00' },
    },
    {
      id: 702,
      aluno: { id: 93, cpf: null },
      responsavel: null,
    },
  ], new Map([[701, 1001]]), new Map([[93, 1002]]));

  assertEquals(linhas, [
    {
      emusys_matricula_id: 701,
      emusys_aluno_id: 91,
      aluno_id: 1001,
      emusys_responsavel_id: 92,
      aluno_cpf: '12345678901',
      responsavel_cpf: '98765432100',
    },
    {
      emusys_matricula_id: 702,
      emusys_aluno_id: 93,
      aluno_id: 1002,
      emusys_responsavel_id: null,
      aluno_cpf: null,
      responsavel_cpf: null,
    },
  ]);
});
