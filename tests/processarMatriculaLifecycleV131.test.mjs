import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const webhookPath = 'supabase/functions/processar-matricula-emusys/index.ts';
const source = readFileSync(webhookPath, 'utf8');

test('webhook usa o resolvedor canonico e consulta o estado atual quando a finalizacao e esparsa', () => {
  assert.match(source, /resolveEmusysMatriculaLifecycle\s*\(/);
  assert.match(source, /buscarMatriculaApiPorId\s*\(/);
  assert.match(source, /status=todas&limite=50/i);
  assert.match(source, /resolverFinalizacaoCanonica\s*\(/);
});

test('trancamento continua produzindo estado trancado e movimentacao idempotente', () => {
  assert.match(source, /async function handleTrancamento/);
  assert.match(source, /trancamentoId:\s*Number\.isFinite\(trancamentoId\)/);
  assert.match(source, /id:\s*p\.trancamentoId/);
  assert.match(source, /status:\s*'trancado'/);
  assert.match(
    source,
    /registrarMovimentacao\(\s*supabase,\s*'trancamento'/,
  );
  assert.match(source, /matricula_trancamento:\$\{p\.matriculaIdEmusys/);
});

test('conclusao vira inativo e nao renovacao, nunca evasao', () => {
  assert.match(source, /async function handleNaoRenovacao/);
  assert.match(
    source,
    /handleSaidaFinalizada\(\s*supabase,\s*p,\s*\{[\s\S]{0,220}statusLocal:\s*'inativo'[\s\S]{0,220}movimento:\s*'nao_renovacao'/,
  );
  assert.match(source, /movementKind\s*===\s*'nao_renovacao'/);
});

test('interrupcao permanece evadido e evasao', () => {
  assert.match(source, /movementKind\s*===\s*'evasao'/);
  assert.match(source, /async function handleEvasao/);
  assert.match(
    source,
    /handleSaidaFinalizada\(\s*supabase,\s*p,\s*\{[\s\S]{0,220}statusLocal:\s*'evadido'[\s\S]{0,220}movimento:\s*'evasao'/,
  );
});

test('finalizacao ambigua somente registra auditoria', () => {
  const handler = source.match(
    /async function handleFinalizacaoAmbigua[\s\S]*?\n}\n\nasync function/,
  )?.[0] ?? '';

  assert.ok(handler, 'handler de finalizacao ambigua nao localizado');
  assert.match(handler, /finalizacao_em_auditoria/);
  assert.match(handler, /auditReason|motivo_auditoria/);
  assert.doesNotMatch(handler, /\.from\(\s*'alunos'\s*\)\.update/);
  assert.doesNotMatch(handler, /registrarMovimentacao\s*\(/);
});

test('dispatcher nao envia finalizacao diretamente para evasao', () => {
  assert.match(
    source,
    /case\s+'matricula_finalizacao':\s*result\s*=\s*await\s+handleFinalizacaoCanonica/,
  );
  assert.doesNotMatch(
    source,
    /case\s+'matricula_finalizacao':\s*result\s*=\s*await\s+handleEvasao/,
  );
});

test('reentrega usa a data real do evento e a mesma chave idempotente', () => {
  assert.match(source, /dataEvento:\s*dateOnlyISO\s*\(/);
  assert.match(source, /matricula_finalizacao:\$\{p\.matriculaIdEmusys[\s\S]{0,160}\$\{p\.dataEvento/);
  assert.match(source, /dataMovimento:\s*p\.dataEvento/);
});

test('IDs externos invalidos nao entram na consulta de reconciliacao', () => {
  assert.match(source, /Number\.isFinite\(alunoEmusysId\)/);
  assert.match(source, /Number\.isFinite\(matriculaId\)/);
});
