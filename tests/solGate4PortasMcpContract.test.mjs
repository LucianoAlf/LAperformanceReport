import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mcpUrl = new URL('../vps/la-hq/sol/scripts/sol-portas-mcp.mjs', import.meta.url);
const source = readFileSync(mcpUrl, 'utf8');

const expected = new Map([
  ['inadimplencia', 'sol_porta_inadimplencia_v1'],
  ['faturas_do_mes', 'sol_porta_faturas_do_mes_v1'],
  ['numeros_da_unidade', 'sol_porta_numeros_da_unidade_v1'],
  ['situacao_dos_alunos', 'sol_porta_situacao_alunos_v1'],
  ['presenca_pendente', 'sol_porta_presenca_pendente_v1'],
  ['pendencias_de_cadastro', 'sol_porta_pendencias_cadastro_v1'],
  ['aviso_previo', 'sol_porta_aviso_previo_v1'],
  ['renovacoes', 'sol_porta_renovacoes_v1'],
  ['contratos_vencendo', 'sol_porta_contratos_vencendo_v1'],
  ['alunos_sem_fatura', 'sol_porta_alunos_sem_fatura_v1'],
  ['pauta_do_dia', 'sol_porta_pauta_do_dia_v1'],
  ['registrar_desfecho', 'sol_porta_registrar_desfecho_v1'],
  ['agenda_do_dia', 'sol_porta_agenda_do_dia_v1'],
]);

test('MCP expoe exatamente as 13 portas operacionais fora do Caixa', () => {
  const found = new Map();
  for (const match of source.matchAll(/\{ name: '([^']+)', fn: '([^']+)'/g)) {
    if (match[2].startsWith('sol_porta_') && !match[1].startsWith('caixa_')) {
      found.set(match[1], match[2]);
    }
  }
  assert.deepEqual(found, expected);
  assert.equal(found.size, 13);
});

test('a unica porta operacional de escrita permanece explicita', () => {
  const writeDoors = [...expected.keys()].filter((name) => name === 'registrar_desfecho');
  assert.deepEqual(writeDoors, ['registrar_desfecho']);
  assert.match(source, /registrar_desfecho[\s\S]*ÚNICA porta que ESCREVE/);
});
