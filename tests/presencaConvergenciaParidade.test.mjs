import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const migrationsDirectory = path.join(repositoryRoot, 'supabase/migrations');
const manifest = JSON.parse(
  readFileSync(
    path.join(
      repositoryRoot,
      'docs/audits/2026-08-27-presenca-convergencia-manifest.json',
    ),
    'utf8',
  ),
);

const expectedProjectRef = 'ouqwbbermlzqqvtqwlul';
const expectedCapturedAt = '2026-08-27';
const expectedHugoBypass = {
  version: '20260827151832',
  name: 'agenda_chamada_volta_do_fechamento_de_bypass',
  local_file_md5: '296048cedc3b46b80ae0cce8c3e16cf9',
};
const expectedVersions = Array.from(
  { length: 24 },
  (_, minute) => `2026082703${String(minute).padStart(2, '0')}00`,
);
const intervalStart = BigInt(expectedVersions[0]);
const intervalEnd = BigInt(expectedVersions.at(-1));
const lowerHexMd5 = /^[0-9a-f]{32}$/;
const snakeCase = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const versionedSql = /^(\d{14})_.*\.sql$/;
const forbiddenWipSql =
  /^(?:20260827143000|20260827143100|20260827143200|20260827143300)_.*\.sql$/;

function canonicalMd5(filePath) {
  const content = readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  return createHash('md5').update(content, 'utf8').digest('hex');
}

function migrationFileName(item) {
  return `${item.version}_${item.name}.sql`;
}

function assertManifest(candidate) {
  assert.ok(candidate && typeof candidate === 'object' && !Array.isArray(candidate));
  assert.deepEqual(
    Object.keys(candidate).sort(),
    ['captured_at', 'hugo_bypass', 'migrations', 'project_ref'],
    'MANIFEST_TOP_LEVEL_INVALID',
  );
  assert.equal(candidate.project_ref, expectedProjectRef, 'MANIFEST_PROJECT_REF_INVALID');
  assert.equal(candidate.captured_at, expectedCapturedAt, 'MANIFEST_CAPTURED_AT_INVALID');
  assert.deepEqual(candidate.hugo_bypass, expectedHugoBypass, 'HUGO_BYPASS_INVALID');
  assert.ok(Array.isArray(candidate.migrations), 'MANIFEST_MIGRATIONS_INVALID');
  assert.equal(candidate.migrations.length, 24, 'MANIFEST_COUNT_INVALID');

  for (const item of candidate.migrations) {
    assert.deepEqual(
      Object.keys(item).sort(),
      ['local_file_md5', 'name', 'remote_statements_md5', 'statement_count', 'version'],
      'MANIFEST_ITEM_KEYS_INVALID',
    );
    assert.equal(typeof item.version, 'string', 'MANIFEST_VERSION_INVALID');
    assert.match(item.version, /^\d{14}$/, 'MANIFEST_VERSION_INVALID');
    assert.equal(typeof item.name, 'string', 'MANIFEST_NAME_INVALID');
    assert.match(item.name, snakeCase, 'MANIFEST_NAME_INVALID');
    assert.ok(
      Number.isInteger(item.statement_count) && item.statement_count > 0,
      'MANIFEST_STATEMENT_COUNT_INVALID',
    );
    assert.equal(typeof item.local_file_md5, 'string', 'MANIFEST_HASH_INVALID');
    assert.match(item.local_file_md5, lowerHexMd5, 'MANIFEST_HASH_INVALID');
    assert.equal(typeof item.remote_statements_md5, 'string', 'MANIFEST_HASH_INVALID');
    assert.match(item.remote_statements_md5, lowerHexMd5, 'MANIFEST_HASH_INVALID');
  }

  const versions = candidate.migrations.map(({ version }) => version);
  const names = candidate.migrations.map(({ name }) => name);
  const fileNames = candidate.migrations.map(migrationFileName);
  assert.deepEqual(versions, expectedVersions, 'MANIFEST_VERSIONS_INVALID');
  assert.equal(new Set(versions).size, 24, 'MANIFEST_VERSION_DUPLICATE');
  assert.equal(new Set(names).size, 24, 'MANIFEST_NAME_DUPLICATE');
  assert.equal(new Set(fileNames).size, 24, 'MANIFEST_FILENAME_DUPLICATE');
}

function assertRegularFileWithMd5(fileName, expectedMd5) {
  const filePath = path.join(migrationsDirectory, fileName);
  assert.equal(statSync(filePath).isFile(), true, `NOT_REGULAR_FILE: ${fileName}`);
  assert.equal(canonicalMd5(filePath), expectedMd5, `MD5_MISMATCH: ${fileName}`);
}

const cloneManifest = () => JSON.parse(JSON.stringify(manifest));

test('as migrations publicadas mantêm paridade com o manifesto', () => {
  assertManifest(manifest);
  const expectedFileNames = manifest.migrations.map(migrationFileName).sort();
  const intervalFiles = readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => {
      if (!entry.isFile()) return false;
      const match = versionedSql.exec(entry.name);
      if (!match) return false;
      const version = BigInt(match[1]);
      return version >= intervalStart && version <= intervalEnd;
    })
    .map(({ name }) => name)
    .sort();
  assert.deepEqual(intervalFiles, expectedFileNames, 'MIGRATIONS_INTERVAL_SET_INVALID');

  for (const item of manifest.migrations) {
    assertRegularFileWithMd5(migrationFileName(item), item.local_file_md5);
  }

  const mutations = [
    [/MANIFEST_VERSIONS_INVALID/, (item) => { item.migrations[23] = { ...item.migrations[0] }; }],
    [/MANIFEST_PROJECT_REF_INVALID/, (item) => { item.project_ref = 'outro-projeto'; }],
    [/MANIFEST_CAPTURED_AT_INVALID/, (item) => { item.captured_at = '2026-08-28'; }],
    [/MANIFEST_STATEMENT_COUNT_INVALID/, (item) => { item.migrations[0].statement_count = 1.5; }],
    [/MANIFEST_HASH_INVALID/, (item) => { item.migrations[0].local_file_md5 = 'A'.repeat(32); }],
  ];
  for (const [expectedError, mutate] of mutations) {
    const candidate = cloneManifest();
    mutate(candidate);
    assert.throws(() => assertManifest(candidate), expectedError);
  }
});

test('preserva o bypass vigente e rejeita apenas WIPs SQL exatos', () => {
  assert.deepEqual(manifest.hugo_bypass, expectedHugoBypass);
  assertRegularFileWithMd5(
    migrationFileName(expectedHugoBypass),
    expectedHugoBypass.local_file_md5,
  );

  assert.equal(forbiddenWipSql.test('20260827143000_rascunho.sql.bak'), false);
  assert.equal(forbiddenWipSql.test('20260827143100_notas.txt'), false);
  assert.equal(forbiddenWipSql.test('20260827143200_rascunho.sql'), true);

  const realWipFiles = readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && forbiddenWipSql.test(entry.name))
    .map(({ name }) => name);
  assert.deepEqual(realWipFiles, []);
});
