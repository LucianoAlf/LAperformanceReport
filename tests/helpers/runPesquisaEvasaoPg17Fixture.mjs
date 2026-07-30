import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const CONTAINER_PERMITIDO = /^pesquisa-evasao-pg17-[a-z0-9-]+$/;
const IMAGEM_PG17_PERMITIDA = /^postgres:17(?:[-.][a-z0-9.-]+)?$/i;
const BANCO_FIXTURE_PERMITIDO = /^pesquisa_evasao_fixture_[0-9a-f]{16}$/;

function escaparLiteralSql(valor) {
  return `'${String(valor).replaceAll("'", "''")}'`;
}

function executarDocker(container, argumentos, opcoes = {}) {
  const resultado = spawnSync(
    'docker',
    ['exec', container, ...argumentos],
    { encoding: 'utf8', ...opcoes },
  );
  if (resultado.error) throw resultado.error;
  return resultado;
}

function exigirSucesso(resultado, contexto) {
  assert.equal(
    resultado.status,
    0,
    `${contexto}\nSTDOUT:\n${resultado.stdout}\nSTDERR:\n${resultado.stderr}`,
  );
  return resultado.stdout.trim();
}

function executarPsql(container, database, argumentos = []) {
  return executarDocker(
    container,
    [
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      database,
      ...argumentos,
    ],
  );
}

function criarBanco(container, database) {
  exigirSucesso(
    executarDocker(container, ['createdb', '-U', 'postgres', database]),
    `nao foi possivel criar o banco descartavel ${database}`,
  );
}

function removerBanco(container, database) {
  return executarDocker(
    container,
    ['dropdb', '--force', '-U', 'postgres', database],
  );
}

export function runPesquisaEvasaoPg17Fixture({
  container,
  fixturePath = '/workspace/tests/fixtures/pesquisa_evasao_claim_pg17.sql',
} = {}) {
  assert.match(
    container ?? '',
    CONTAINER_PERMITIDO,
    'container PG17 fora do prefixo explicitamente permitido',
  );

  const inspect = spawnSync(
    'docker',
    [
      'inspect',
      '--format',
      '{{.Config.Image}}|{{.State.Running}}',
      container,
    ],
    { encoding: 'utf8' },
  );
  const metadados = exigirSucesso(inspect, 'falha ao inspecionar container PG17');
  const [imagem, running] = metadados.split('|');
  assert.match(imagem ?? '', IMAGEM_PG17_PERMITIDA, 'imagem nao e PostgreSQL 17');
  assert.equal(running, 'true', 'container PostgreSQL 17 nao esta em execucao');

  const versao = exigirSucesso(
    executarPsql(container, 'postgres', ['-Atc', 'show server_version_num']),
    'falha ao consultar a versao do PostgreSQL',
  );
  assert.match(versao, /^17\d{4}$/, 'servidor precisa executar PostgreSQL 17');

  const database = `pesquisa_evasao_fixture_${randomBytes(8).toString('hex')}`;
  const commonDatabase = `pesquisa_evasao_guard_${randomBytes(8).toString('hex')}`;
  const sentinel = randomBytes(24).toString('hex');
  assert.match(database, BANCO_FIXTURE_PERMITIDO);
  assert.notEqual(database, 'postgres');
  assert.doesNotMatch(database, /^template[01]$/);

  let databaseCriado = false;
  let commonDatabaseCriado = false;
  let fixtureResult;
  let erroPrincipal;

  try {
    criarBanco(container, commonDatabase);
    commonDatabaseCriado = true;

    const commonProbe = executarPsql(
      container,
      commonDatabase,
      [
        '-c',
        `set pesquisa_evasao.fixture_sentinel = ${escaparLiteralSql(sentinel)}`,
        '-f',
        fixturePath,
      ],
    );
    assert.notEqual(
      commonProbe.status,
      0,
      'um GUC isolado jamais pode autorizar a fixture em banco comum',
    );
    assert.match(
      commonProbe.stderr,
      /FIXTURE_GUARD_/,
      'banco comum deve falhar no guard antes de qualquer DROP SCHEMA',
    );
    assert.equal(
      exigirSucesso(
        executarPsql(
          container,
          commonDatabase,
          ['-Atc', "select to_regnamespace('public') is not null"],
        ),
        'falha ao verificar preservacao do schema public no banco comum',
      ),
      't',
      'guard inseguro removeu o schema public de um banco comum',
    );

    criarBanco(container, database);
    databaseCriado = true;
    const prepararSentinela = `
      create schema fixture_safety;
      create table fixture_safety.sentinel (
        secret text primary key,
        database_name text not null
      );
      insert into fixture_safety.sentinel(secret, database_name)
      values (${escaparLiteralSql(sentinel)}, ${escaparLiteralSql(database)});
    `;
    exigirSucesso(
      executarPsql(container, database, ['-c', prepararSentinela]),
      'falha ao preparar sentinela da fixture',
    );

    fixtureResult = executarPsql(
      container,
      database,
      [
        '-c',
        `set pesquisa_evasao.fixture_sentinel = ${escaparLiteralSql(sentinel)}`,
        '-f',
        fixturePath,
      ],
    );
    exigirSucesso(fixtureResult, 'fixture PG17 falhou');
    assert.match(fixtureResult.stdout, /PESQUISA_EVASAO_CLAIM_PG17_OK/);
  } catch (error) {
    erroPrincipal = error;
  } finally {
    const falhasRemocao = [];
    for (const [criado, nome] of [
      [databaseCriado, database],
      [commonDatabaseCriado, commonDatabase],
    ]) {
      if (!criado) continue;
      const resultado = removerBanco(container, nome);
      if (resultado.status !== 0) {
        falhasRemocao.push(
          `${nome}\nSTDOUT:\n${resultado.stdout}\nSTDERR:\n${resultado.stderr}`,
        );
      }
    }
    if (falhasRemocao.length > 0 && !erroPrincipal) {
      erroPrincipal = new Error(
        `falha no dropdb --force dos bancos descartaveis:\n${falhasRemocao.join('\n')}`,
      );
    }
  }

  if (erroPrincipal) throw erroPrincipal;

  const bancosRestantes = exigirSucesso(
    executarPsql(
      container,
      'postgres',
      [
        '-Atc',
        `select count(*) from pg_database where datname in (` +
          `${escaparLiteralSql(database)}, ${escaparLiteralSql(commonDatabase)})`,
      ],
    ),
    'falha ao confirmar remocao dos bancos descartaveis',
  );
  assert.equal(bancosRestantes, '0', 'banco descartavel permaneceu no container');

  return {
    database,
    stdout: fixtureResult.stdout,
    stderr: fixtureResult.stderr,
  };
}
