import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const arquivo = new URL(
  '../supabase/functions/previsualizar-reconciliacao-grade-emusys/index.ts',
  import.meta.url,
);

test('a previsualizacao remota e limitada, autenticada e sem comandos de escrita', () => {
  assert.ok(existsSync(arquivo), 'a Edge temporaria de previsualizacao deve existir');
  const edge = readFileSync(arquivo, 'utf8');
  const config = readFileSync(
    new URL('../supabase/config.toml', import.meta.url),
    'utf8',
  );

  assert.match(edge, /const ESCOLA_ID_CAMPO_GRANDE = 39/u);
  assert.match(edge, /x-grade-preview-token/u);
  assert.match(edge, /PREVIEW_TOKEN_SHA256/u);
  assert.match(edge, /if \(req\.method !== "POST"\)/u);
  assert.match(edge, /buscarTodasAulasEmusys/u);
  assert.match(edge, /montarSnapshotGradeEmusys/u);
  assert.match(edge, /previsualizarReconciliacaoGrade/u);
  assert.match(edge, /MAX_PAGINAS_EMUSYS/u);
  assert.match(edge, /AbortSignal\.timeout/u);
  assert.match(edge, /resultado_nao_auditavel_truncado/u);
  assert.match(edge, /fotografia_completa_sha256/u);
  assert.match(edge, /leitura_local_nao_transacional/u);
  assert.match(edge, /Cache-Control": "no-store"/u);
  assert.match(
    config,
    /\[functions\.previsualizar-reconciliacao-grade-emusys\][\s\S]*?verify_jwt = false/u,
  );
  assert.doesNotMatch(edge, /\.(?:insert|upsert|update|delete|rpc)\s*\(/u);
});
