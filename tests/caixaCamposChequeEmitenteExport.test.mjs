import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Pedido do Super Folha (06/10): emitente (nome impresso), hash do documento
// do emitente e agencia/conta do CMC-7 como campos estruturados no export do
// caixa. A Sol le tudo isso na digitalizacao do cheque mas descartava —
// agora persiste quando vier no payload. Documento NUNCA em claro: a RPC so
// aceita HMAC-SHA256 em hex (64 chars), mesmo padrao sol_cheque_documento_hash_v1.

const migracao = readFileSync(
  new URL('../supabase/migrations/20261006120000_caixa_cheque_emitente_cmc7.sql', import.meta.url),
  'utf8',
);
const exportCaixa = readFileSync(
  new URL('../supabase/functions/export-caixa-movimentacoes/index.ts', import.meta.url),
  'utf8',
);

test('migration cria as 4 colunas nullable na caixa_movimentacoes', () => {
  assert.match(migracao, /alter table public\.caixa_movimentacoes/i);
  assert.match(migracao, /add column if not exists cheque_emitente_nome text/i);
  assert.match(migracao, /add column if not exists cheque_emitente_documento_hash text/i);
  assert.match(migracao, /add column if not exists cheque_agencia text/i);
  assert.match(migracao, /add column if not exists cheque_conta text/i);
});

test('migration remenda os INSERTs das duas RPCs de lancamento', () => {
  // Lote (2+): le os campos do item de entrada por ordem (mesmo caminho do numero/banco).
  assert.match(migracao, /sol_caixa_lancar_recebimento_lote_v1/);
  assert.match(migracao, /p_payload->'itens'->\(v_ordem - 1\)->>'cheque_emitente_nome'/);
  assert.match(migracao, /p_payload->'itens'->\(v_ordem - 1\)->>'cheque_agencia'/);
  // Simples (1 cheque): le do topo do payload.
  assert.match(migracao, /p_payload->>'cheque_emitente_nome'/);
  assert.match(migracao, /p_payload->>'cheque_agencia'/);
  // Documento: so entra se for hex de 64 chars (HMAC-SHA256); qualquer outra
  // coisa vira NULL — nunca gravamos documento em claro nem lixo.
  assert.match(migracao, /cheque_emitente_documento_hash' ~ '\^\[0-9a-fA-F\]\{64\}\$'/);
  // A guarda de 2 itens do lote sobreviveu ao remendo.
  assert.match(migracao, /multi_aluno_exige_dois_itens/);
});

test('export do caixa seleciona e emite os 4 campos por movimento', () => {
  for (const campo of [
    'cheque_emitente_nome',
    'cheque_emitente_documento_hash',
    'cheque_agencia',
    'cheque_conta',
  ]) {
    assert.match(exportCaixa, new RegExp(`'${campo}'`));
    assert.match(exportCaixa, new RegExp(`${campo}: i\\.${campo} \\?\\? null`));
  }
});

// Pedido SF (07/10): bloco "fechamentos" com o fechamento diario do caixa
// (caixas_diarios) — a soma acumulada de lancamentos diverge da gaveta real.
test('export emite bloco fechamentos lendo caixas_diarios no mesmo periodo', () => {
  assert.match(exportCaixa, /\.from\('caixas_diarios'\)/);
  assert.match(exportCaixa, /saldo_inicial_cofre/);
  assert.match(exportCaixa, /saldo_final_conferido/);
  assert.match(exportCaixa, /fechamentos: caixasDiarios\.map/);
  // diferenca_contagem = conferido - calculado, null sem conferencia.
  assert.match(exportCaixa, /diferenca_contagem: calculado != null && conferido != null/);
  // nomes canonicos no shape emitido
  for (const campo of ['data', 'status', 'saldo_inicial', 'saldo_final', 'conferido_por', 'conferido_em']) {
    assert.match(exportCaixa, new RegExp(`${campo}: `));
  }
});
