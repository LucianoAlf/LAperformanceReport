import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const helperPath = 'supabase/functions/_shared/sync-grade-authorization.ts';
const edgePath = 'supabase/functions/sync-grade-futura-emusys/index.ts';
const migrationPath =
  'supabase/migrations/20260815200000_sync_grade_autorizacao_interna.sql';
const chaveServiceRole =
  'eyJhbGciOiJIUzI1NiJ9.service-role-assinatura-de-teste';

async function carregarHelper() {
  assert.ok(existsSync(helperPath), `helper ausente: ${helperPath}`);
  return import(`../${helperPath}`);
}

function criarDependencias(overrides = {}) {
  const chamadas = [];
  return {
    chamadas,
    deps: {
      chaveServiceRole,
      validarTokenInterno: async (token) => {
        chamadas.push(token);
        return token === 'token-grade-interno-valido';
      },
      ...overrides,
    },
  };
}

test('grade rejeita chamada sem credencial antes de criar o cliente privilegiado', async () => {
  const { prepararExecucaoSyncGrade } = await carregarHelper();
  const cenario = criarDependencias();

  const resultado = await prepararExecucaoSyncGrade(
    { authorization: null, xSyncToken: null },
    cenario.deps,
  );

  assert.deepEqual(resultado, {
    permitido: false,
    status: 401,
    codigo: 'NAO_AUTENTICADO',
  });
  assert.deepEqual(cenario.chamadas, []);
});

test('grade nao aceita o bearer anon que os crons antigos usavam', async () => {
  const { prepararExecucaoSyncGrade } = await carregarHelper();
  const cenario = criarDependencias();

  const resultado = await prepararExecucaoSyncGrade(
    { authorization: 'Bearer jwt-anon-publico', xSyncToken: null },
    cenario.deps,
  );

  assert.equal(resultado.permitido, false);
  assert.equal(resultado.status, 401);
  assert.deepEqual(cenario.chamadas, []);
});

test('grade aceita somente service role ou token interno validado', async () => {
  const { prepararExecucaoSyncGrade } = await carregarHelper();

  const serviceRole = criarDependencias();
  const direto = await prepararExecucaoSyncGrade(
    { authorization: `Bearer ${chaveServiceRole}`, xSyncToken: null },
    serviceRole.deps,
  );
  assert.deepEqual(direto, { permitido: true, origem: 'service_role' });
  assert.deepEqual(serviceRole.chamadas, []);

  const interno = criarDependencias();
  const porToken = await prepararExecucaoSyncGrade(
    { authorization: null, xSyncToken: 'token-grade-interno-valido' },
    interno.deps,
  );
  assert.deepEqual(porToken, { permitido: true, origem: 'x_sync_token' });
  assert.deepEqual(interno.chamadas, ['token-grade-interno-valido']);
});

test('grade falha fechada quando a validacao do token interno falha', async () => {
  const { prepararExecucaoSyncGrade } = await carregarHelper();
  const cenario = criarDependencias({
    validarTokenInterno: async (token) => {
      cenario.chamadas.push(token);
      throw new Error('vault indisponivel');
    },
  });

  const resultado = await prepararExecucaoSyncGrade(
    { authorization: null, xSyncToken: 'token-indisponivel' },
    cenario.deps,
  );

  assert.deepEqual(resultado, {
    permitido: false,
    status: 401,
    codigo: 'NAO_AUTENTICADO',
  });
  assert.deepEqual(cenario.chamadas, ['token-indisponivel']);
});

test('contrato da Edge e do cron fecha o caminho anon e preserva o cron interno', () => {
  const edge = readFileSync(edgePath, 'utf8');
  const migration = readFileSync(migrationPath, 'utf8');
  const config = readFileSync('supabase/config.toml', 'utf8');
  const serve = edge.slice(edge.indexOf('serve(async'));

  assert.match(edge, /prepararExecucaoSyncGrade/);
  assert.match(edge, /req\.headers\.get\('x-sync-token'\)/);
  assert.match(edge, /validar_token_sync_grade_interno_v1/);
  assert.ok(
    serve.indexOf('prepararExecucaoSyncGrade(')
      < serve.indexOf('const supabase = createClient('),
    'a autorizacao precisa acontecer antes do cliente de escrita',
  );
  assert.match(
    config,
    /\[functions\.sync-grade-futura-emusys\][\s\S]{0,240}verify_jwt\s*=\s*true/,
  );
  assert.match(migration, /sync_grade_edge_token/);
  assert.match(migration, /validar_token_sync_grade_interno_v1/);
  assert.match(migration, /'x-sync-token'/);
  assert.match(migration, /cron\.alter_job/);
  assert.match(migration, /'Authorization',\s*'Bearer '\s*\|\|/);
  assert.match(migration, /supabase_anon_key/);
  assert.doesNotMatch(migration, /eyJhbGciOi/);
});
