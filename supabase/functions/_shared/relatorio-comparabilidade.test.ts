/// <reference lib="deno.ns" />

import { assertEquals, assertNotEquals, assertStringIncludes } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import {
  classificarComparabilidade,
  fingerprintComparabilidade,
} from './relatorio-comparabilidade.ts';

const BASE = {
  status: 'fechado',
  unidadeId: 'u-recreio',
  dominio: 'comercial',
  grao: 'lead',
  populacao: 'leads-base',
  regra: 'v2',
  competencia: '2026-07',
  semanticaCompetencia: 'mes-calendario-fechado',
  cobertura: 100,
  coberturaMinima: 100,
};

Deno.test('fechamentos equivalentes ficam disponiveis mesmo em competencias diferentes', () => {
  const resultado = classificarComparabilidade(
    BASE,
    { ...BASE, competencia: '2026-06' },
  );
  assertEquals(resultado.disponibilidade, 'disponivel');
  assertEquals(resultado.motivo, 'fechamentos_equivalentes');
  assertEquals(
    fingerprintComparabilidade(BASE),
    fingerprintComparabilidade({ ...BASE, competencia: '2026-06' }),
  );
});

Deno.test('regra diferente bloqueia a comparacao', () => {
  const resultado = classificarComparabilidade(BASE, { ...BASE, regra: 'v1' });
  assertEquals(resultado.disponibilidade, 'indisponivel');
  assertEquals(resultado.motivo, 'regra_incompativel');
});

Deno.test('snapshot aberto bloqueia a comparacao', () => {
  const resultado = classificarComparabilidade(BASE, { ...BASE, status: 'aberto' });
  assertEquals(resultado.disponibilidade, 'indisponivel');
  assertEquals(resultado.motivo, 'snapshot_nao_fechado');
});

Deno.test('cobertura abaixo da politica bloqueia a comparacao', () => {
  const resultado = classificarComparabilidade(
    { ...BASE, cobertura: 80 },
    BASE,
  );
  assertEquals(resultado.disponibilidade, 'indisponivel');
  assertEquals(resultado.motivo, 'cobertura_insuficiente');
});

Deno.test('fingerprint e deterministico e nao depende da ordem das chaves', () => {
  const invertido = {
    coberturaMinima: 100,
    semanticaCompetencia: 'mes-calendario-fechado',
    competencia: '2026-07',
    regra: 'v2',
    populacao: 'leads-base',
    grao: 'lead',
    dominio: 'comercial',
    unidadeId: 'u-recreio',
    status: 'fechado',
    cobertura: 100,
  };
  assertEquals(fingerprintComparabilidade(BASE), fingerprintComparabilidade(invertido));
  assertNotEquals(fingerprintComparabilidade(BASE), fingerprintComparabilidade({ ...BASE, regra: 'v1' }));
  assertStringIncludes(fingerprintComparabilidade(BASE), 'mes-calendario-fechado');
});
