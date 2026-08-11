/// <reference lib="deno.ns" />

import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { selecionarCandidatoExperimental } from './experimental-reconciliacao.ts';

const CANDIDATOS = [{
  id: 1,
  status: 'experimental_agendada',
  unidadeId: 'u-recreio',
  emusysAulaId: 991,
  emusysLeadId: 700,
  dataAula: '2026-07-10',
  horarioBanco: '10:00:00',
  cursoId: 8,
}];

Deno.test('ID exato da aula vence qualquer diferenca de horario grande', () => {
  assertEquals(
    selecionarCandidatoExperimental({
      unidadeId: 'u-recreio',
      emusysAulaId: 991,
      emusysLeadId: 700,
      data: '2026-07-10',
      horario: '14:00:00',
      cursoId: 99,
    }, CANDIDATOS)?.id,
    1,
  );
});

Deno.test('ID exato da aula vence diferenca de 30 minutos', () => {
  assertEquals(
    selecionarCandidatoExperimental({
      unidadeId: 'u-recreio',
      emusysAulaId: 991,
      emusysLeadId: 700,
      data: '2026-07-10',
      horario: '10:30:00',
      cursoId: 99,
    }, CANDIDATOS)?.id,
    1,
  );
});

Deno.test('sem ID de aula o fallback exige lead e data no mesmo escopo', () => {
  assertEquals(
    selecionarCandidatoExperimental({
      unidadeId: 'u-recreio',
      emusysAulaId: null,
      emusysLeadId: 700,
      data: '2026-07-10',
      horario: '10:00:00',
    }, CANDIDATOS)?.id,
    1,
  );
  assertEquals(
    selecionarCandidatoExperimental({
      unidadeId: 'u-recreio',
      emusysAulaId: null,
      emusysLeadId: 700,
      data: '2026-07-11',
      horario: '10:00:00',
    }, CANDIDATOS),
    null,
  );
});

Deno.test('candidato de outra unidade nunca e selecionado', () => {
  assertEquals(
    selecionarCandidatoExperimental({
      unidadeId: 'u-barra',
      emusysAulaId: 991,
      emusysLeadId: 700,
      data: '2026-07-10',
      horario: '10:00:00',
    }, CANDIDATOS),
    null,
  );
});
