/// <reference lib="deno.ns" />

import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { decidirLeadId } from './lead-id-reconciliacao.ts';

const UNIDADE_RECREIO = '95553e96-971b-4590-a6eb-0201d013c14d';

Deno.test('Lead ID remoto preenche somente o valor local ausente', () => {
  assertEquals(
    decidirLeadId({ unidadeId: UNIDADE_RECREIO, local: null, emusys: 701 }),
    { acao: 'preencher', valor: 701 },
  );
});

Deno.test('Lead ID igual e idempotente e sem dado remoto nao altera nada', () => {
  assertEquals(
    decidirLeadId({ unidadeId: UNIDADE_RECREIO, local: 701, emusys: 701 }),
    { acao: 'manter', valor: 701 },
  );
  assertEquals(
    decidirLeadId({ unidadeId: UNIDADE_RECREIO, local: 701, emusys: null }),
    { acao: 'sem_dado' },
  );
});

Deno.test('Lead ID divergente preserva o local e abre auditoria', () => {
  assertEquals(
    decidirLeadId({ unidadeId: UNIDADE_RECREIO, local: 700, emusys: 701 }),
    { acao: 'auditar_divergencia', local: 700, remoto: 701 },
  );
});

Deno.test('decisao nao usa nome e permanece escopada ao contexto da unidade', () => {
  const homonimo = decidirLeadId({ unidadeId: 'u-barra', local: null, emusys: 701 });
  assertEquals(homonimo, { acao: 'preencher', valor: 701 });
});
