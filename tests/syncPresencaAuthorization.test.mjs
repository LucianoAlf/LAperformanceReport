import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const helperPath = 'supabase/functions/_shared/sync-presenca-authorization.ts';
const migrationPath =
  'supabase/migrations/20260731160000_sync_presenca_authorization.sql';
const cronAuthMigrationPath =
  'supabase/migrations/20260731165000_sync_presenca_cron_token_interno.sql';
const unidadeBarra = {
  id: '368d47f5-2d88-4475-bc14-ba084a9a348e',
  nome: 'Barra',
};
const unidadeRecreio = {
  id: '95553e96-971b-4590-a6eb-0201d013c14d',
  nome: 'Recreio',
};
const chaveServiceRole =
  'eyJhbGciOiJIUzI1NiJ9.service-role-assinatura-de-teste';

async function carregarHelper() {
  assert.ok(existsSync(helperPath), `helper ausente: ${helperPath}`);
  return import(`../${helperPath}`);
}

function criarDependencias(overrides = {}) {
  const chamadas = [];
  const clienteUsuario = {
    auth: {
      getUser: async (token) => {
        chamadas.push(['auth.getUser', token]);
        return {
          data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
          error: null,
        };
      },
    },
    rpc: async (nome, parametros) => {
      chamadas.push(['rpc', nome, parametros]);
      return { data: true, error: null };
    },
  };

  const deps = {
    chaveServiceRole,
    validarTokenInterno: async (token) => {
      chamadas.push(['validarTokenInterno', token]);
      return token === 'token-interno-dedicado';
    },
    criarClienteUsuario: (token) => {
      chamadas.push(['criarClienteUsuario', token]);
      return clienteUsuario;
    },
    criarClienteAdministrativo: () => {
      chamadas.push(['criarClienteAdministrativo']);
      return { tipo: 'service_role' };
    },
    carregarUnidadesProvedor: (unidadesIds) => {
      chamadas.push(['carregarUnidadesProvedor', unidadesIds]);
      return unidadesIds.map((id) => ({ id, token: `token-${id}` }));
    },
    ...overrides,
  };

  return { chamadas, clienteUsuario, deps };
}

test('body malformado retorna 400 antes de qualquer sink privilegiado', async () => {
  const helper = await carregarHelper();
  assert.equal(
    typeof helper.lerCorpoSyncPresenca,
    'function',
    'parser fail-closed ausente',
  );
  const cenario = criarDependencias();

  for (const requisicao of [
    { json: () => Promise.reject(new SyntaxError('JSON invalido')) },
    { json: () => Promise.resolve(null) },
    { json: () => Promise.resolve([]) },
  ]) {
    await assert.rejects(
      async () => {
        const body = await helper.lerCorpoSyncPresenca(requisicao);
        const solicitacao = helper.resolverSolicitacaoSyncPresenca(
          body,
          [unidadeBarra, unidadeRecreio],
        );
        await helper.prepararExecucaoSyncPresenca(
          { authorization: `Bearer ${chaveServiceRole}`, solicitacao },
          cenario.deps,
        );
      },
      (error) => {
        assert.equal(error.name, 'SolicitacaoSyncPresencaInvalida');
        assert.equal(error.status, 400);
        assert.equal(error.message, 'BODY_INVALIDO');
        return true;
      },
    );
  }
  assert.deepEqual(cenario.chamadas, []);
});

test('identidade ausente retorna 401 sem cliente administrativo, token Emusys ou RPC', async () => {
  const { prepararExecucaoSyncPresenca, resolverSolicitacaoSyncPresenca } =
    await carregarHelper();
  const cenario = criarDependencias();
  const solicitacao = resolverSolicitacaoSyncPresenca(
    { modo: 'presenca', unidade_id: unidadeBarra.id, dias: 7 },
    [unidadeBarra, unidadeRecreio],
  );

  const resultado = await prepararExecucaoSyncPresenca(
    { authorization: null, solicitacao },
    cenario.deps,
  );

  assert.deepEqual(resultado, {
    permitido: false,
    status: 401,
    codigo: 'NAO_AUTENTICADO',
  });
  assert.deepEqual(cenario.chamadas, []);
});

test('JWT de usuario invalido retorna 401 antes da permissao e dos sinks privilegiados', async () => {
  const { prepararExecucaoSyncPresenca, resolverSolicitacaoSyncPresenca } =
    await carregarHelper();
  const cenario = criarDependencias();
  cenario.clienteUsuario.auth.getUser = async () => {
    cenario.chamadas.push(['auth.getUser', 'jwt-invalido']);
    return { data: { user: null }, error: new Error('invalid JWT') };
  };
  const solicitacao = resolverSolicitacaoSyncPresenca(
    { modo: 'presenca', unidade_id: unidadeBarra.id },
    [unidadeBarra, unidadeRecreio],
  );

  const resultado = await prepararExecucaoSyncPresenca(
    { authorization: 'Bearer jwt-invalido', solicitacao },
    cenario.deps,
  );

  assert.equal(resultado.status, 401);
  assert.deepEqual(
    cenario.chamadas.map(([nome]) => nome),
    ['criarClienteUsuario', 'auth.getUser'],
  );
});

test('usuario autenticado recebe 403 para modo interno sem consultar permissao ou sinks', async () => {
  const { prepararExecucaoSyncPresenca, resolverSolicitacaoSyncPresenca } =
    await carregarHelper();
  const cenario = criarDependencias();
  const solicitacao = resolverSolicitacaoSyncPresenca(
    {
      modo: 'experimentais',
      unidade_id: unidadeBarra.id,
      data_inicio: '2026-07-01',
      data_fim: '2026-07-31',
    },
    [unidadeBarra, unidadeRecreio],
  );

  const resultado = await prepararExecucaoSyncPresenca(
    { authorization: 'Bearer jwt-usuario', solicitacao },
    cenario.deps,
  );

  assert.equal(resultado.status, 403);
  assert.equal(resultado.codigo, 'ACAO_NAO_AUTORIZADA');
  assert.deepEqual(
    cenario.chamadas.map(([nome]) => nome),
    ['criarClienteUsuario', 'auth.getUser'],
  );
});

test('usuario autenticado recebe 403 quando omite unidade ou pede todas', async () => {
  const { prepararExecucaoSyncPresenca, resolverSolicitacaoSyncPresenca } =
    await carregarHelper();
  const cenario = criarDependencias();
  const solicitacao = resolverSolicitacaoSyncPresenca(
    { modo: 'presenca', dias: 7 },
    [unidadeBarra, unidadeRecreio],
  );

  const resultado = await prepararExecucaoSyncPresenca(
    { authorization: 'Bearer jwt-usuario', solicitacao },
    cenario.deps,
  );

  assert.equal(resultado.status, 403);
  assert.equal(resultado.codigo, 'UNIDADE_EXATA_OBRIGATORIA');
  assert.equal(cenario.chamadas.some(([nome]) => nome === 'rpc'), false);
  assert.equal(
    cenario.chamadas.some(([nome]) => nome === 'criarClienteAdministrativo'),
    false,
  );
  assert.equal(
    cenario.chamadas.some(([nome]) => nome === 'carregarUnidadesProvedor'),
    false,
  );
});

test('falha ou negativa da RPC de unidade retorna 403 sem sinks privilegiados', async () => {
  const { prepararExecucaoSyncPresenca, resolverSolicitacaoSyncPresenca } =
    await carregarHelper();

  for (const respostaRpc of [
    { data: false, error: null },
    { data: null, error: new Error('permission lookup failed') },
  ]) {
    const cenario = criarDependencias();
    cenario.clienteUsuario.rpc = async (nome, parametros) => {
      cenario.chamadas.push(['rpc', nome, parametros]);
      return respostaRpc;
    };
    const solicitacao = resolverSolicitacaoSyncPresenca(
      { modo: 'presenca', unidade_id: unidadeRecreio.id },
      [unidadeBarra, unidadeRecreio],
    );

    const resultado = await prepararExecucaoSyncPresenca(
      { authorization: 'Bearer jwt-usuario', solicitacao },
      cenario.deps,
    );

    assert.equal(resultado.status, 403);
    assert.equal(resultado.codigo, 'UNIDADE_NAO_AUTORIZADA');
    assert.equal(
      cenario.chamadas.some(([nome]) => nome === 'criarClienteAdministrativo'),
      false,
    );
    assert.equal(
      cenario.chamadas.some(([nome]) => nome === 'carregarUnidadesProvedor'),
      false,
    );
  }
});

test('usuario autorizado prepara somente presenca da unidade exata', async () => {
  const { prepararExecucaoSyncPresenca, resolverSolicitacaoSyncPresenca } =
    await carregarHelper();
  const cenario = criarDependencias();
  const solicitacao = resolverSolicitacaoSyncPresenca(
    { unidade_id: unidadeBarra.id, dias: 7 },
    [unidadeBarra, unidadeRecreio],
  );

  const resultado = await prepararExecucaoSyncPresenca(
    { authorization: 'Bearer jwt-usuario', solicitacao },
    cenario.deps,
  );

  assert.equal(resultado.permitido, true);
  assert.equal(resultado.status, 200);
  assert.equal(resultado.interno, false);
  assert.deepEqual(resultado.unidadesProvedor.map(({ id }) => id), [
    unidadeBarra.id,
  ]);
  assert.deepEqual(
    cenario.chamadas.find(([nome]) => nome === 'rpc'),
    [
      'rpc',
      'pode_sincronizar_presenca_emusys_v1',
      { p_unidade_id: unidadeBarra.id, p_acao: 'presenca' },
    ],
  );
});

test('bearer interno usa comparacao por digest e preserva modo experimentais sem auth de usuario', async () => {
  const {
    prepararExecucaoSyncPresenca,
    resolverSolicitacaoSyncPresenca,
    tokensIguaisEmTempoConstante,
  } = await carregarHelper();
  const cenario = criarDependencias();
  const solicitacao = resolverSolicitacaoSyncPresenca(
    {
      modo: 'experimentais',
      unidade_id: unidadeBarra.id,
      data_inicio: '2026-07-01',
      data_fim: '2026-07-31',
    },
    [unidadeBarra, unidadeRecreio],
  );

  assert.equal(
    await tokensIguaisEmTempoConstante(chaveServiceRole, chaveServiceRole),
    true,
  );
  assert.equal(
    await tokensIguaisEmTempoConstante('quase-igual', chaveServiceRole),
    false,
  );
  const resultado = await prepararExecucaoSyncPresenca(
    { authorization: `Bearer ${chaveServiceRole}`, solicitacao },
    cenario.deps,
  );

  assert.equal(resultado.permitido, true);
  assert.equal(resultado.interno, true);
  assert.equal(
    cenario.chamadas.some(([nome]) => nome === 'criarClienteUsuario'),
    false,
  );
  assert.equal(cenario.chamadas.some(([nome]) => nome === 'rpc'), false);
});

test('bearer interno preserva alvos por indice de agenda e metadados dos crons', async () => {
  const { prepararExecucaoSyncPresenca, resolverSolicitacaoSyncPresenca } =
    await carregarHelper();

  for (const modo of ['agenda', 'metadados']) {
    const cenario = criarDependencias();
    const solicitacao = resolverSolicitacaoSyncPresenca(
      { modo, unidade_index: 1 },
      [unidadeRecreio, unidadeBarra],
    );
    const resultado = await prepararExecucaoSyncPresenca(
      { authorization: `Bearer ${chaveServiceRole}`, solicitacao },
      cenario.deps,
    );

    assert.equal(resultado.permitido, true);
    assert.equal(resultado.interno, true);
    assert.deepEqual(resultado.unidadesProvedor.map(({ id }) => id), [
      unidadeBarra.id,
    ]);
  }
});

test('token interno dedicado preserva crons sem depender do JWT anonimo', async () => {
  const { prepararExecucaoSyncPresenca, resolverSolicitacaoSyncPresenca } =
    await carregarHelper();
  const cenario = criarDependencias();
  const solicitacao = resolverSolicitacaoSyncPresenca(
    { modo: 'metadados', unidade_index: 1 },
    [unidadeRecreio, unidadeBarra],
  );

  const resultado = await prepararExecucaoSyncPresenca(
    {
      authorization: null,
      xSyncToken: 'token-interno-dedicado',
      solicitacao,
    },
    cenario.deps,
  );

  assert.equal(resultado.permitido, true);
  assert.equal(resultado.interno, true);
  assert.deepEqual(resultado.unidadesProvedor.map(({ id }) => id), [
    unidadeBarra.id,
  ]);
  assert.deepEqual(
    cenario.chamadas.map(([nome]) => nome),
    [
      'validarTokenInterno',
      'carregarUnidadesProvedor',
      'criarClienteAdministrativo',
    ],
  );
});

test('token interno dedicado invalido falha fechado antes dos sinks', async () => {
  const { prepararExecucaoSyncPresenca, resolverSolicitacaoSyncPresenca } =
    await carregarHelper();
  const cenario = criarDependencias();
  const solicitacao = resolverSolicitacaoSyncPresenca(
    { modo: 'agenda', unidade_index: 0 },
    [unidadeBarra, unidadeRecreio],
  );

  const resultado = await prepararExecucaoSyncPresenca(
    {
      authorization: null,
      xSyncToken: 'token-interno-invalido',
      solicitacao,
    },
    cenario.deps,
  );

  assert.deepEqual(resultado, {
    permitido: false,
    status: 401,
    codigo: 'NAO_AUTENTICADO',
  });
  assert.deepEqual(cenario.chamadas, [
    ['validarTokenInterno', 'token-interno-invalido'],
  ]);
});

test('contrato estatico ordena resolucao/autorizacao antes dos privilegios e fecha o caller web', () => {
  const edge = readFileSync(
    'supabase/functions/sync-presenca-emusys/index.ts',
    'utf8',
  );
  const ui = readFileSync(
    'src/components/App/SucessoCliente/ModalDetalhesSucessoAluno.tsx',
    'utf8',
  );
  const helper = readFileSync(helperPath, 'utf8');
  const serve = edge.slice(edge.indexOf('serve(async'));

  assert.match(serve, /await lerCorpoSyncPresenca\(req\)/);
  assert.doesNotMatch(serve, /catch\s*\{\s*bodyRecebido\s*=\s*\{\}/);
  assert.match(edge, /resolverSolicitacaoSyncPresenca/);
  assert.match(edge, /prepararExecucaoSyncPresenca/);
  assert.match(edge, /req\.headers\.get\('x-sync-token'\)/);
  assert.match(edge, /validar_token_sync_presenca_interno_v1/);
  assert.match(edge, /criarClienteAdministrativo/);
  assert.match(edge, /carregarUnidadesProvedor/);
  assert.ok(
    serve.indexOf('resolverSolicitacaoSyncPresenca(')
      < serve.indexOf('prepararExecucaoSyncPresenca('),
  );
  assert.doesNotMatch(edge, /token:\s*requiredEnv\('EMUSYS_TOKEN_/);
  assert.doesNotMatch(edge, /authorization[^\n]*===\s*SUPABASE_SERVICE_ROLE_KEY/i);
  assert.match(helper, /crypto\.subtle\.digest\('SHA-256'/);
  assert.doesNotMatch(helper, /recebido\s*===\s*esperado/);
  assert.match(
    ui,
    /sync-presenca-emusys[\s\S]{0,180}modo:\s*'presenca'[\s\S]{0,100}unidade_id:\s*aluno\.unidade_id/,
  );
});

test('cron usa segredo dedicado rotacionado e gateway delega auth ao codigo', () => {
  assert.ok(
    existsSync(cronAuthMigrationPath),
    `migration ausente: ${cronAuthMigrationPath}`,
  );
  const migration = readFileSync(cronAuthMigrationPath, 'utf8');
  const config = readFileSync('supabase/config.toml', 'utf8');

  assert.match(
    config,
    /\[functions\.sync-presenca-emusys\][\s\S]{0,240}verify_jwt\s*=\s*false/,
  );
  assert.match(migration, /validar_token_sync_presenca_interno_v1/);
  assert.match(migration, /vault\.update_secret/);
  assert.match(migration, /extensions\.gen_random_bytes\(32\)/);
  assert.match(migration, /'x-sync-token'/);
  assert.match(migration, /cron\.alter_job/);
  assert.match(
    migration,
    /grant execute on function public\.validar_token_sync_presenca_interno_v1\(text\)\s+to service_role/i,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.validar_token_sync_presenca_interno_v1\(text\) to (anon|authenticated)/i,
  );
});

test('presenca autorizada em unidade exata nao reconcilia nem recalcula outras unidades', () => {
  const edge = readFileSync(
    'supabase/functions/sync-presenca-emusys/index.ts',
    'utf8',
  );
  const confirmarInicio = edge.indexOf('async function confirmarExperimentais');
  const confirmarFim = edge.indexOf('serve(async', confirmarInicio);
  const confirmar = edge.slice(confirmarInicio, confirmarFim);

  assert.match(confirmar, /\.in\('unidade_id',\s*unidadesIds\)/);
  assert.match(
    edge,
    /for \(const unidade of unidadesProcessar\)[\s\S]{0,160}atualizar_percentual_presenca/,
  );
  assert.match(
    edge,
    /confirmarExperimentais\(\s*supabase,\s*datasProcessar,\s*solicitacao\.unidadesIds/,
  );
  assert.match(
    edge,
    /get_alunos_ativos_atuais_canonicos'[\s\S]{0,120}p_unidade_id:\s*solicitacao\.alvoExato\s*\?\s*solicitacao\.unidadesIds\[0\]\s*:\s*null/,
  );
});

test('migration cria RPC estreita para usuario ativo, unidade exata e alunos.ver', () => {
  assert.ok(existsSync(migrationPath), `migration ausente: ${migrationPath}`);
  const migration = readFileSync(migrationPath, 'utf8');

  assert.match(
    migration,
    /create or replace function public\.pode_sincronizar_presenca_emusys_v1\(\s*p_unidade_id uuid,\s*p_acao text\s*\)/i,
  );
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path\s*=\s*public,\s*pg_temp/i);
  assert.match(migration, /u\.auth_user_id\s*=\s*auth\.uid\(\)/i);
  assert.match(migration, /u\.ativo\s+is\s+true/i);
  assert.match(migration, /p_acao\s*<>\s*'presenca'/i);
  assert.match(migration, /v_perfil\s*=\s*'unidade'/i);
  assert.match(migration, /v_unidade_usuario\s*=\s*p_unidade_id/i);
  assert.match(
    migration,
    /usuario_tem_permissao\([\s\S]{0,180}'alunos\.ver'[\s\S]{0,80}p_unidade_id/i,
  );
  assert.match(
    migration,
    /revoke all on function public\.pode_sincronizar_presenca_emusys_v1\(uuid, text\)[\s\S]{0,100}from public, anon/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.pode_sincronizar_presenca_emusys_v1\(uuid, text\)[\s\S]{0,80}to authenticated/i,
  );
});
