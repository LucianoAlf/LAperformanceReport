import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { origemDoLancamento } from '../src/lib/caixaIdentidade.ts';

const sql = readFileSync(
  new URL('../supabase/migrations/20260908170000_export_receitas_sem_fatura.sql', import.meta.url),
  'utf8',
);

// O Super Folha importa esta view pela RPC receitas_sem_fatura_aplicar. Cada linha que
// escapar do criterio vira receita inventada no DRE — do outro lado da porta estao os
// R$ 130.781,56 de agosto que sao BAIXA de fatura, nao receita.

test('o criterio esta inteiro na view', () => {
  const where = sql.match(/where m\.tipo[\s\S]*?;/)?.[0] ?? '';
  assert.notEqual(where, '', 'clausula where nao encontrada');
  assert.match(where, /m\.tipo = 'entrada'/);
  assert.match(where, /m\.fatura_id is null/);
  assert.match(where, /m\.categoria in \('lojinha', 'outro'\)/);
});

// A view existe para ser lida pelo ferramental da Maria, e a cerca do MCP
// (ensureMariaSafeReadSql) recusa qualquer objeto fora de public.vw_maria_* / public.maria_*.
// O primeiro nome que eu dei foi vw_export_..., que a cerca bloquearia — a view existiria e
// o laudo nunca alcancaria o proprio export.
test('a view vive no namespace que a cerca da Maria aceita', () => {
  assert.match(sql, /create or replace view public\.vw_maria_export_receitas_sem_fatura/);
  assert.match(sql, /drop view if exists public\.vw_export_receitas_sem_fatura/,
    'o nome antigo precisa ser derrubado, senao ficam duas verdades');
});

// criado_por da Sol e 'sol-agente:grupo:<numero>' — tem TELEFONE. Telefone nao atravessa
// para outro banco.
test('o criado_por cru nao sai na view', () => {
  const select = sql.match(/select\r?\n[\s\S]*?from public\.caixa_movimentacoes/)?.[0] ?? '';
  assert.notEqual(select, '', 'select da view nao encontrado');
  assert.doesNotMatch(select, /^\s*m\.criado_por\s*(as|,)/m,
    'criado_por nao pode ser projetado direto');
  assert.match(select, /as\s+registrado_por_origem/);
});

// Duas implementacoes do mesmo julgamento — o CASE no SQL e origemDoLancamento() no TS.
// Se divergirem, o export diz uma coisa e o app diz outra sobre a mesma linha. O teste
// prende as duas nos mesmos exemplos.
test('a normalizacao no SQL concorda com a do TypeScript', () => {
  const caso = sql.match(/case\r?\n[\s\S]*?end\s+as\s+registrado_por_origem/)?.[0] ?? '';
  assert.notEqual(caso, '', 'CASE da origem nao encontrado');

  const exemplos = [
    ['sol-agente:grupo:5521999999999', 'sol'],
    ['migracao:reparo-lote-incompleto', 'migracao'],
    ['Mayra Alves', 'humano'],
    ['Solange Costa da Silva', 'humano'],
    ['', 'desconhecida'],
    [null, 'desconhecida'],
  ];
  for (const [entrada, esperado] of exemplos) {
    assert.equal(origemDoLancamento(entrada), esperado, `TS errou em ${JSON.stringify(entrada)}`);
  }

  // o SQL usa os MESMOS prefixos, com os dois pontos
  assert.match(caso, /like 'sol-agente:%'/);
  assert.match(caso, /like 'migracao:%'/);
  assert.match(caso, /btrim\(m\.criado_por\) = ''/);
  assert.match(caso, /else 'humano'/);
});

// A vigencia mora no Super Folha (2026-09-09). Se ela tambem morasse aqui, seriam duas
// datas para manter iguais — e a que diverge silenciosamente e sempre a copia.
test('a vigencia nao e filtrada na view', () => {
  const where = sql.match(/where m\.tipo[\s\S]*?;/)?.[0] ?? '';
  assert.doesNotMatch(where, /data_movimento\s*>=/,
    'a vigencia e do Super Folha; quem empurra filtra');
});

test('a view nao fica legivel por anon nem authenticated', () => {
  assert.match(sql, /revoke all on public\.vw_maria_export_receitas_sem_fatura from public, anon, authenticated/);
  assert.match(sql, /grant select on public\.vw_maria_export_receitas_sem_fatura to service_role/);
});
