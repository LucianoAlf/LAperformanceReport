import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260716155305_health_score_v3_staging_historico.sql';
const isolationMigrationPath =
  'supabase/migrations/20260716155615_health_score_v3_staging_isolamento_roles.sql';
const helperPath = 'supabase/functions/_shared/emusys-aulas.ts';
const edgePath =
  'supabase/functions/backfill-historico-professor-emusys/index.ts';
const cliPath = 'scripts/backfill-historico-professor-emusys.mjs';

test('migration cria staging historico isolado e protegido', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8');

  for (const tabela of [
    'emusys_historico_backfill_execucoes_v1',
    'emusys_aulas_historico_staging_v1',
    'emusys_aula_alunos_historico_staging_v1',
  ]) {
    assert.match(migration, new RegExp(`create table public\\.${tabela}`, 'i'));
    assert.match(
      migration,
      new RegExp(`alter table public\\.${tabela} enable row level security`, 'i'),
    );
    assert.match(
      migration,
      new RegExp(
        `revoke all on (?:table )?public\\.${tabela} from public, anon, authenticated`,
        'i',
      ),
    );
  }

  assert.match(
    migration,
    /unique\s*\(\s*unidade_id\s*,\s*emusys_aula_id\s*\)/i,
  );
  assert.match(migration, /payload_hash\s+text\s+not null/i);
  assert.match(migration, /linha_hash\s+text\s+not null/i);
  assert.match(migration, /where status = 'executando'/i);

  assert.doesNotMatch(migration, /insert\s+into\s+public\.aulas_emusys/i);
  assert.doesNotMatch(migration, /update\s+public\.aulas_emusys/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.aulas_emusys/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.aluno_presenca/i);
  assert.doesNotMatch(
    migration,
    /delete\s+from\s+public\.emusys_aula_alunos_historico_staging_v1/i,
  );
  assert.doesNotMatch(migration, /grant\s+.*\s+to\s+(?:anon|public)/i);
});

test('migration complementar remove default grants de papeis nao autorizados', () => {
  const migration = fs.readFileSync(isolationMigrationPath, 'utf8');

  assert.match(migration, /revoke all privileges on table public\.%I from %I/i);
  assert.match(migration, /revoke all privileges on sequence public\.%I from %I/i);
  assert.match(migration, /emusys_historico_backfill_execucoes_v1/);
  assert.match(migration, /emusys_aulas_historico_staging_v1/);
  assert.match(migration, /emusys_aulas_historico_revisoes_v1/);
  assert.match(migration, /emusys_aula_alunos_historico_staging_v1/);
  assert.match(migration, /not in \('postgres', 'service_role', 'supabase_admin'\)/i);
  assert.doesNotMatch(migration, /grant\s+.*\s+to\s+(?:anon|authenticated|public)/i);
});

test('helper Emusys preserva timezone local e paginacao opaca', () => {
  const helper = fs.readFileSync(helperPath, 'utf8');

  assert.match(
    helper,
    /export function parseDataHoraEmusys\s*\(dataHora:\s*string\):\s*string\s*{[\s\S]*return dataHora\.replace\(' ', 'T'\) \+ ':00-03:00';/,
  );
  assert.match(helper, /data_hora_inicial/);
  assert.match(helper, /data_hora_final/);
  assert.match(helper, /limite=\$\{limite\}/);
  assert.match(helper, /encodeURIComponent\(cursor\)/);
  assert.match(helper, /headers:\s*{\s*token\s*}/);
});

test('Edge e retomavel, limitada, autenticada e escreve somente no staging', () => {
  const edge = fs.readFileSync(edgePath, 'utf8');

  assert.match(
    edge,
    /const maxPaginas = Math\.max\(1, Math\.min\(Number\(body\.max_paginas \?\? 1\), 10\)\)/,
  );
  assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(edge, /roleDoJwt\(bearerToken\)\s*===\s*['"]service_role['"]/);
  assert.match(edge, /auth\.getUser\(\)/);
  assert.match(edge, /perfil[^\n]+admin/);
  assert.match(edge, /Retry-After/);
  assert.match(edge, /MIN_INTERVALO_MS\s*=\s*1350/);
  assert.match(edge, /await delay\(MIN_INTERVALO_MS\)/);
  assert.match(
    edge,
    /\.rpc\(['"]registrar_pagina_backfill_historico_professor_v1['"]\s*,/,
  );
  assert.match(edge, /p_cursor_esperado:/);
  assert.match(edge, /p_proximo_cursor:/);
  assert.match(edge, /p_proxima_janela_inicio:/);
  assert.match(
    edge,
    /execucao\s*=\s*{\s*\.\.\.checkpoint,\s*\.\.\.data,\s*id:\s*data\.execucao_id\s*\?\?\s*checkpoint\.id/s,
  );

  assert.doesNotMatch(edge, /\.from\(['"]aulas_emusys['"]\)/);
  assert.doesNotMatch(edge, /\.from\(['"]aluno_presenca['"]\)/);
  assert.doesNotMatch(edge, /anotacoes_fabio/i);
});

test('CLI controla create, resume, pause e status sem credenciais embutidas', () => {
  const cli = fs.readFileSync(cliPath, 'utf8');

  assert.match(cli, /new Set\(\['create', 'resume', 'run', 'pause', 'status'\]\)/);
  assert.match(cli, /SUPABASE_URL/);
  assert.match(cli, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(cli, /--unidade/);
  assert.match(cli, /--inicio/);
  assert.match(cli, /--fim/);
  assert.match(cli, /\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$/);
  assert.match(cli, /backfill-historico-professor-emusys/);
  assert.doesNotMatch(cli, /eyJ[A-Za-z0-9_-]{20,}/);
});

test('CLI executa lote continuo com backpressure e uma pagina por chamada', () => {
  const cli = fs.readFileSync(cliPath, 'utf8');

  assert.match(cli, /const INTERVALO_MINIMO_MS\s*=\s*20_000/);
  assert.match(cli, /const MAX_CHAMADAS_POR_LOTE\s*=\s*50/);
  assert.match(cli, /['"]run['"]/);
  assert.match(cli, /--intervalo-ms/);
  assert.match(cli, /--max-chamadas/);
  assert.match(cli, /invocarColetor\(\s*config,\s*job\.id,\s*1,/s);
  assert.match(cli, /await delay\(intervaloMs\)/);
  assert.match(cli, /if \(job\.status === 'pausado' \|\| job\.status === 'concluido'\)/);
});
