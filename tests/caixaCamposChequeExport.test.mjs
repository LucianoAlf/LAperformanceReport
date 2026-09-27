import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Pedido do Super Folha aprovado pelo Alf (26/09): numero/banco/bom-para do
// cheque como campos estruturados na movimentacao do caixa, para o SF nao
// depender mais de parsear a descricao. Cobre: migration (colunas + patch nas
// duas RPCs de lancamento) e o export-caixa-movimentacoes emitindo os campos.

const migracao = readFileSync(
  new URL('../supabase/migrations/20260927120000_caixa_movimentacoes_campos_cheque.sql', import.meta.url),
  'utf8',
);
const exportCaixa = readFileSync(
  new URL('../supabase/functions/export-caixa-movimentacoes/index.ts', import.meta.url),
  'utf8',
);

test('migration cria as 3 colunas nullable na caixa_movimentacoes', () => {
  assert.match(migracao, /alter table public\.caixa_movimentacoes/i);
  assert.match(migracao, /add column if not exists cheque_numero text/i);
  assert.match(migracao, /add column if not exists cheque_banco\s+text/i);
  assert.match(migracao, /add column if not exists cheque_bom_para date/i);
});

test('migration remenda os INSERTs das duas RPCs de lancamento com guarda de ancora', () => {
  // Lote (2+): le o item de entrada por ordem, mesmo caminho do complemento.
  assert.match(migracao, /sol_caixa_lancar_recebimento_lote_v1/);
  assert.match(migracao, /p_payload->'itens'->\(v_ordem - 1\)->>'cheque_numero'/);
  assert.match(migracao, /ANCORA_INSERT_LOTE/);
  // Simples (1 cheque): le do topo do payload.
  assert.match(migracao, /sol_caixa_lancar_recebimento\(jsonb\)/);
  assert.match(migracao, /p_payload->>'cheque_numero'/);
  assert.match(migracao, /ANCORA_INSERT_SIMPLES/);
  // bom-para so entra se vier YYYY-MM-DD; lixo vira NULL, nao erro.
  assert.match(migracao, /cheque_bom_para' ~ '\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$'/);
  // Prova final garante que a guarda de 2 itens do lote sobreviveu ao remendo.
  assert.match(migracao, /multi_aluno_exige_dois_itens/);
});

test('export do caixa seleciona e emite os 3 campos por movimento', () => {
  assert.match(exportCaixa, /'cheque_numero', 'cheque_banco', 'cheque_bom_para'/);
  assert.match(exportCaixa, /cheque_numero: i\.cheque_numero \?\? null/);
  assert.match(exportCaixa, /cheque_banco: i\.cheque_banco \?\? null/);
  assert.match(exportCaixa, /cheque_bom_para: i\.cheque_bom_para \?\? null/);
});
