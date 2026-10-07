/**
 * M11 — contrato fechado com o LA Teacher (30/09): palco com quantidade, pedidos de
 * "toca junto" e selo de edição após envio.
 *
 * O que estes testes travam:
 *  - o palco de um NÚMERO é a SOMA do que cada integrante pediu (toque simultâneo) —
 *    dois alunos com teclado ×1 precisam de dois teclados, não de um compartilhado;
 *  - a grade renderiza a fila de pedidos e o selo "editou após envio" — textos que a
 *    coordenação procura na tela e que um refactor silencioso apagaria;
 *  - a migration M11 guarda a ordem do contrato: juntar na grade ANTES de confirmar
 *    no LA Teacher (o órfão 'confirmado' era o defeito que se queria evitar).
 *
 * O caminho de dados ponta a ponta (relatório → view → sync → itens → decisão) está
 * em tests/sql/eventos_m11_rider_toca_junto.sql, rodado contra o banco com ROLLBACK.
 */
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

// Mesma forma de eventosPalco.test.mjs: roda a FUNÇÃO REAL transpilada, nunca cópia.
const lib = await (async () => {
  const { code } = await esbuild.transform(readFileSync('src/lib/eventos.ts', 'utf8'), {
    loader: 'ts',
    format: 'esm',
  });
  const arquivo = path.join(mkdtempSync(path.join(tmpdir(), 'evt-tj-')), 'eventos.mjs');
  writeFileSync(arquivo, code);
  return import(pathToFileURL(arquivo).href);
})();

const { palcoDosNumeros, consolidarItensDoPalco } = lib;

const item = (nome, quantidade = 1) => ({ tipo: 'instrumento', nome, quantidade });

/* ─────────── soma de palco por número (grupo_id) ─────────── */

test('número com 2 integrantes (1 teclado cada) pede 2 teclados no palco', () => {
  // Os dois sobem juntos e cada um toca o seu — a regra "cada aluno marca só o que
  // ELE usa" torna a soma a leitura certa, e consolidarItensDoPalco a implementa.
  const grade = palcoDosNumeros([
    { id: 1, ordem: 1, grupo_id: 'g1', curso_nome: null, itens: [item('Teclado')] },
    { id: 2, ordem: 2, grupo_id: 'g1', curso_nome: null, itens: [item('Teclado')] },
  ]);
  const palco = consolidarItensDoPalco(grade);
  const teclado = palco.find((i) => i.nome === 'Teclado');
  assert.equal(teclado.quantidade, 2, 'dois integrantes com teclado x1 somam 2');
});

test('quantidade vinda do professor é respeitada: teclado ×2 de um aluno só', () => {
  // rider_quantidades no sync grava quantidade 2 num item só — a consolidação não
  // pode achatar de volta para 1.
  const grade = palcoDosNumeros([
    { id: 1, ordem: 1, grupo_id: null, curso_nome: null, itens: [item('Teclado', 2)] },
  ]);
  const palco = consolidarItensDoPalco(grade);
  assert.equal(palco.find((i) => i.nome === 'Teclado').quantidade, 2);
});

test('grupos diferentes NÃO somam entre si — tocam em horários diferentes', () => {
  // O mesmo instrumento em dois números separados se reveza: o palco precisa do
  // pico de um número, não da soma do bloco.
  const grade = palcoDosNumeros([
    { id: 1, ordem: 1, grupo_id: 'g1', curso_nome: null, itens: [item('Teclado')] },
    { id: 2, ordem: 2, grupo_id: 'g1', curso_nome: null, itens: [item('Teclado')] },
    { id: 3, ordem: 3, grupo_id: null, curso_nome: null, itens: [item('Teclado')] },
  ]);
  const palco = consolidarItensDoPalco(grade);
  // Número g1 pede 2 (soma interna); o solo pede 1; sequenciais se revezam → pico 2.
  assert.equal(palco.find((i) => i.nome === 'Teclado').quantidade, 2);
});

/* ─────────── grade: selo de edição e fila de pedidos ─────────── */

test('a linha do integrante mostra o selo "editou após envio"', () => {
  const grade = readFileSync('src/components/App/Eventos/GradeTab.tsx', 'utf8');
  assert.match(grade, /editado_apos_envio_em/, 'coluna não foi ligada na grade');
  assert.match(grade, /editou após envio/, 'selo ausente na linha do integrante');
});

test('a grade renderiza a fila de pedidos de toca junto', () => {
  const grade = readFileSync('src/components/App/Eventos/GradeTab.tsx', 'utf8');
  assert.match(grade, /<FilaTocaJunto/, 'fila não está montada na GradeTab');
  assert.match(grade, /useTocaJunto/, 'hook de pedidos não é usado');
  // Aprovar e recusar existem e a recusa pede motivo — o prompt não pode sumir,
  // senão a RPC recusa com TOCA_JUNTO_MOTIVO_OBRIGATORIO e a tela não explica por quê.
  assert.match(grade, /aprovar/, 'botão de aprovar ausente');
  assert.match(grade, /Motivo da recusa/, 'recusa sem pedir motivo vai quebrar na RPC');
});

/* ─────────── migration M11 guarda a ordem do contrato ─────────── */

test('M11: decidir aprova DEPOIS do juntar — a ordem das chamadas é o contrato', () => {
  const sql = readFileSync(
    'supabase/migrations/20260930200000_eventos_m11_rider_toca_junto.sql',
    'utf8',
  );
  const juntar = sql.indexOf('evento_apresentacao_juntar_v1(');
  const confirmar = sql.indexOf("relatorio_anual_toca_junto_decidir_v1(v.id, 'confirmado'");
  assert.ok(juntar > 0, 'o juntar não está na RPC de decisão');
  assert.ok(confirmar > juntar, 'confirmar antes de juntar recria o pedido confirmado órfão');
});

test('M11: sync usa catálogo, quantidades e extras — e não duplica rider_outros', () => {
  const sql = readFileSync(
    'supabase/migrations/20260930200000_eventos_m11_rider_toca_junto.sql',
    'utf8',
  );
  assert.match(sql, /relatorio_anual_item_palco/, 'join no catálogo ausente');
  assert.match(sql, /rider_quantidades ->> v_codigo/, 'quantidade por id ausente');
  assert.match(sql, /rider_extras/, 'extras não mapeados');
  // rider_outros só entra quando NÃO há extras — o guarda-chuva anti-duplicata.
  assert.match(sql, /v\.rider_extras is null[\s\S]*?rider_outros/, 'fallback de outros sem guarda');
  assert.match(sql, /editado_apos_envio_em = v\.editado_apos_envio_em/, 'selo não espelhado');
});

test('M11: RPCs de toca junto são escopadas e não executáveis por anon', () => {
  const sql = readFileSync(
    'supabase/migrations/20260930200000_eventos_m11_rider_toca_junto.sql',
    'utf8',
  );
  assert.match(sql, /fn_evento_pode_ver\(p_evento_id\)/, 'lista sem escopo de evento');
  assert.match(sql, /fn_evento_pode_ver\(v\.evento_id\)/, 'decidir sem escopo do evento');
  assert.match(sql, /revoke all on function public\.evento_toca_junto_lista_v1.*anon/s);
  assert.match(sql, /revoke all on function public\.evento_toca_junto_decidir_v1.*anon/s);
});
