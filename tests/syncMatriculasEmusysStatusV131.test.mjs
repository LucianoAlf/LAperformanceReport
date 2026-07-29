import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const syncPath = 'supabase/functions/sync-matriculas-emusys/index.ts';
const source = readFileSync(syncPath, 'utf8');

test('sync busca todos os estados e usa o resolvedor compartilhado', () => {
  assert.match(source, /\/matriculas\?status=todas&limite=50/i);
  assert.match(source, /resolveEmusysMatriculaLifecycle\s*\(/);
  assert.doesNotMatch(source, /STATUS_API_PARA_NOSSO/);
  assert.doesNotMatch(source, /\|\|\s*'ativo'/);
});

test('sync materializa o estado bruto por unidade em lotes', () => {
  assert.match(source, /buildEstadoAtualRows\s*\(/);
  assert.match(source, /\.rpc\(\s*'upsert_emusys_matriculas_estado_atual'/);
  assert.match(source, /p_unidade_id:\s*u\.id/);
  assert.match(source, /p_linhas:/);
  assert.match(source, /estados_atual:\s*\{/);
});

test('conclusao usa o payload completo e interrupcao nao vira nao renovacao', () => {
  assert.match(
    source,
    /deveConverterFinalizadaEmNaoRenovacao\(\s*matAtributos\s*,\s*matAtributos\.id/i,
  );
  assert.match(source, /lifecycle\.rawReason\s*===\s*'concluida'/);
  assert.match(source, /lifecycle\.rawReason\s*===\s*'interrompida'/);
});

test('GET sem data real nao fabrica movimento historico', () => {
  const conversionBlock = source.match(
    /if\s*\(\s*matAtributos[\s\S]*?converter_renovacao_pendente_em_nao_renovacao[\s\S]*?\n\s*}\n/i,
  )?.[0] ?? '';

  assert.ok(conversionBlock, 'bloco de conversao automatica nao localizado');
  assert.doesNotMatch(conversionBlock, /new\s+Date\s*\(/);
  assert.match(conversionBlock, /dataFinalizacaoReal/);
});

test('status fixado continua protegido e estado ambiguo vai para auditoria', () => {
  assert.match(source, /fixadosEfetivos\.has\(\s*'status'\s*\)/);
  assert.match(source, /status_emusys_ambiguo/);
  assert.match(source, /automaticTransition|transicao_automatica/);
});
