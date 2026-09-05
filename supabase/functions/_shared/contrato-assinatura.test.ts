/// <reference lib="deno.ns" />

import { assertEquals, assertThrows } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { normalizarMatriculaContrato } from './contrato-assinatura.ts';

const UNIDADE_BARRA = '11111111-1111-4111-8111-111111111111';
const UNIDADE_RECREIO = '22222222-2222-4222-8222-222222222222';

Deno.test('preserva a identidade Emusys no escopo da unidade', () => {
  const matricula = {
    id: 865,
    aluno: { id: 101 },
    contrato_atual: { id: 901, contrato_assinado: true },
  };

  const barra = normalizarMatriculaContrato(matricula, UNIDADE_BARRA);
  const recreio = normalizarMatriculaContrato(matricula, UNIDADE_RECREIO);

  assertEquals(barra.unidade_id, UNIDADE_BARRA);
  assertEquals(recreio.unidade_id, UNIDADE_RECREIO);
  assertEquals(barra.emusys_matricula_id, '865');
  assertEquals(recreio.emusys_matricula_id, '865');
  assertEquals(barra.contrato_emusys_id, '901');
  assertEquals(barra.contrato_assinado, true);
});

Deno.test('false continua false e nao vira um estado intermediario inventado', () => {
  const resultado = normalizarMatriculaContrato({
    id: 867,
    aluno: { id: 102 },
    contrato_atual: { id: 902, contrato_assinado: false },
  }, UNIDADE_BARRA);

  assertEquals(resultado.contrato_assinado, false);
});

Deno.test('matricula ativa sem contrato produz sentinel explicito', () => {
  const resultado = normalizarMatriculaContrato({
    id: 868,
    aluno: { id: 103 },
    contrato_atual: null,
  }, UNIDADE_BARRA);

  assertEquals(resultado.contrato_emusys_id, null);
  assertEquals(resultado.contrato_assinado, null);
});

Deno.test('falha fechada se contrato existir sem booleano de assinatura', () => {
  assertThrows(
    () => normalizarMatriculaContrato({
      id: 869,
      aluno: { id: 104 },
      contrato_atual: { id: 903 },
    }, UNIDADE_BARRA),
    Error,
    'contrato_assinado',
  );
});

Deno.test('falha fechada sem matricula, contrato ou unidade validos', () => {
  assertThrows(
    () => normalizarMatriculaContrato({ id: null }, UNIDADE_BARRA),
    Error,
    'matricula.id',
  );
  assertThrows(
    () => normalizarMatriculaContrato({
      id: 1,
      contrato_atual: { id: null, contrato_assinado: true },
    }, UNIDADE_BARRA),
    Error,
    'contrato_atual.id',
  );
  assertThrows(
    () => normalizarMatriculaContrato({ id: 1, contrato_atual: null }, ''),
    Error,
    'unidade',
  );
});
