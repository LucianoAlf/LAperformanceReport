import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const edgePath = 'supabase/functions/sync-contratos-assinatura-emusys/index.ts';
const edge = existsSync(edgePath) ? readFileSync(edgePath, 'utf8') : '';
const config = readFileSync('supabase/config.toml', 'utf8');

test('Edge consulta somente matriculas ativas com token na query string', () => {
  assert.ok(edge, 'Edge sync-contratos-assinatura-emusys ainda nao existe');
  assert.match(edge, /searchParams\.set\(['"]status['"],\s*['"]ativa['"]\)/i);
  assert.match(edge, /searchParams\.set\(['"]limite['"],\s*['"]50['"]\)/i);
  assert.match(edge, /searchParams\.set\(['"]token['"],\s*token\)/i);
  assert.doesNotMatch(edge, /headers\s*:\s*\{\s*token\s*\}/i);
  assert.doesNotMatch(edge, /method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"][\s\S]{0,300}api\.emusys/i);
});

test('Edge pagina ate tem_mais false e limita a rodada', () => {
  assert.match(edge, /paginacao\?\.tem_mais/i);
  assert.match(edge, /paginacao\?\.proximo_cursor/i);
  assert.match(edge, /searchParams\.set\(['"]cursor['"]/i);
  assert.match(edge, /MAX_PAGES/i);
  assert.match(edge, /RATE_LIMIT_DELAY_MS/i);
});

test('Edge valida tudo antes de publicar um unico lote atomico', () => {
  const fetchIndex = edge.indexOf('buscarTodasMatriculasAtivas');
  const normalizeIndex = edge.indexOf('normalizarMatriculaContrato');
  const rpcIndex = edge.indexOf(".rpc('registrar_contrato_assinatura_lote_v1'");
  assert.ok(fetchIndex >= 0 && normalizeIndex >= 0 && rpcIndex >= 0);
  assert.ok(rpcIndex > fetchIndex, 'RPC nao pode ocorrer antes do fim da coleta');
  assert.match(edge, /p_linhas:\s*observacoes/i);
});

test('toda falha atualiza a execucao e nenhuma falha vira sucesso', () => {
  assert.match(edge, /contrato_assinatura_sync_execucoes/i);
  assert.match(edge, /status:\s*['"]running['"]/i);
  assert.match(edge, /status:\s*['"]failed['"]/i);
  assert.match(edge, /completed_at/i);
  assert.match(edge, /catch\s*\(/i);
  assert.doesNotMatch(edge, /catch\s*\([^)]*\)\s*\{\s*\}/i);
});

test('retry pula somente quando ja existe sucesso fresco no dia BRT', () => {
  assert.match(edge, /America\/Sao_Paulo/i);
  assert.match(edge, /status["']?,\s*["']succeeded/i);
  assert.match(edge, /skipped_fresh/i);
});

test('config declara verify_jwt true para a nova Edge tecnica', () => {
  assert.match(
    config,
    /\[functions\.sync-contratos-assinatura-emusys\][\s\S]*?verify_jwt\s*=\s*true/i,
  );
});
