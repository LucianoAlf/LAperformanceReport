import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const CONTAINER = /^pesquisa-evasao-pg17-[a-z0-9-]+$/;
const IMAGE = /^postgres:17(?:[-.][a-z0-9.-]+)?$/i;
const DATABASE = /^pesquisa_evasao_c_[0-9a-f]{16}$/;
const run = (container, args) => spawnSync(
  'docker',
  ['exec', container, ...args],
  { encoding: 'utf8' },
);
const ok = (result, context) => {
  assert.equal(result.status, 0, `${context}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
};
const psql = (container, database, args = []) => run(container, [
  'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database, ...args,
]);

export function runPesquisaEvasaoSubprojetoCPg17Fixture({
  container,
  fixturePath = '/workspace/tests/fixtures/pesquisa_evasao_subprojeto_c_pg17.sql',
} = {}) {
  assert.match(container ?? '', CONTAINER);
  const metadata = ok(spawnSync('docker', [
    'inspect', '--format', '{{.Config.Image}}|{{.State.Running}}', container,
  ], { encoding: 'utf8' }), 'falha ao inspecionar container');
  const [image, running] = metadata.split('|');
  assert.match(image ?? '', IMAGE);
  assert.equal(running, 'true');
  assert.match(ok(
    psql(container, 'postgres', ['-Atc', 'show server_version_num']),
    'falha ao consultar versao',
  ), /^17\d{4}$/);

  const database = `pesquisa_evasao_c_${randomBytes(8).toString('hex')}`;
  assert.match(database, DATABASE);
  let created = false;
  let output = '';
  let failure;
  try {
    ok(run(container, ['createdb', '-U', 'postgres', database]), 'falha ao criar banco');
    created = true;
    output = ok(psql(container, database, ['-f', fixturePath]), 'fixture do Subprojeto C falhou');
    assert.match(output, /PESQUISA_EVASAO_SUBPROJETO_C_PG17_OK/);
  } catch (error) {
    failure = error;
  } finally {
    if (created) {
      const drop = run(container, ['dropdb', '--force', '-U', 'postgres', database]);
      if (drop.status !== 0 && !failure) failure = new Error(drop.stderr);
    }
  }
  if (failure) throw failure;
  assert.equal(ok(psql(container, 'postgres', [
    '-Atc', `select count(*) from pg_database where datname = '${database}'`,
  ]), 'falha ao confirmar remocao'), '0');
  return output;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.stdout.write(runPesquisaEvasaoSubprojetoCPg17Fixture({
    container: process.argv[2] ?? process.env.PESQUISA_EVASAO_PG17_CONTAINER,
  }));
}
