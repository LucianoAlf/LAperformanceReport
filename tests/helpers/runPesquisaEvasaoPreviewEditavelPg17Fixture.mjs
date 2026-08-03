import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const CONTAINER_PERMITIDO = /^pesquisa-evasao-pg17-[a-z0-9-]+$/;
const IMAGEM_PG17_PERMITIDA = /^postgres:17(?:[-.][a-z0-9.-]+)?$/i;
const BANCO_PERMITIDO = /^pesquisa_evasao_fixture_[0-9a-f]{16}$/;

function runDocker(container, args) {
  const result = spawnSync('docker', ['exec', container, ...args], {
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  return result;
}

function requireSuccess(result, context) {
  assert.equal(
    result.status,
    0,
    `${context}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
  );
  return result.stdout.trim();
}

function psql(container, database, args = []) {
  return runDocker(container, [
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'postgres',
    '-d',
    database,
    ...args,
  ]);
}

export function runPesquisaEvasaoPreviewEditavelPg17Fixture({
  container,
  fixturePath = '/workspace/tests/fixtures/pesquisa_evasao_preview_editavel_pg17.sql',
} = {}) {
  assert.match(container ?? '', CONTAINER_PERMITIDO);

  const metadata = requireSuccess(
    spawnSync(
      'docker',
      ['inspect', '--format', '{{.Config.Image}}|{{.State.Running}}', container],
      { encoding: 'utf8' },
    ),
    'falha ao inspecionar o container PostgreSQL 17',
  );
  const [image, running] = metadata.split('|');
  assert.match(image ?? '', IMAGEM_PG17_PERMITIDA);
  assert.equal(running, 'true');

  const version = requireSuccess(
    psql(container, 'postgres', ['-Atc', 'show server_version_num']),
    'falha ao consultar a versao do PostgreSQL',
  );
  assert.match(version, /^17\d{4}$/);

  const database = `pesquisa_evasao_fixture_${randomBytes(8).toString('hex')}`;
  assert.match(database, BANCO_PERMITIDO);

  let created = false;
  let fixtureResult;
  let mainError;
  try {
    requireSuccess(
      runDocker(container, ['createdb', '-U', 'postgres', database]),
      'falha ao criar banco descartavel',
    );
    created = true;
    fixtureResult = psql(container, database, ['-f', fixturePath]);
    requireSuccess(fixtureResult, 'fixture da previa editavel falhou');
    assert.match(fixtureResult.stdout, /PESQUISA_EVASAO_PREVIEW_EDITAVEL_PG17_OK/);
  } catch (error) {
    mainError = error;
  } finally {
    if (created) {
      const drop = runDocker(container, [
        'dropdb',
        '--force',
        '-U',
        'postgres',
        database,
      ]);
      if (drop.status !== 0 && !mainError) {
        mainError = new Error(
          `falha ao remover banco descartavel\n${drop.stdout}\n${drop.stderr}`,
        );
      }
    }
  }

  if (mainError) throw mainError;

  const remaining = requireSuccess(
    psql(
      container,
      'postgres',
      ['-Atc', `select count(*) from pg_database where datname = '${database}'`],
    ),
    'falha ao confirmar remocao do banco descartavel',
  );
  assert.equal(remaining, '0');
  return fixtureResult.stdout;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const container =
    process.argv[2] ?? process.env.PESQUISA_EVASAO_PG17_CONTAINER;
  const output = runPesquisaEvasaoPreviewEditavelPg17Fixture({ container });
  process.stdout.write(output);
}
