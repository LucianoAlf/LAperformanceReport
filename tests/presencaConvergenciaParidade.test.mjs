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
const edgeManifestPath = path.join(
  repositoryRoot,
  'docs/audits/2026-08-27-presenca-edge-manifest.json',
);

const expectedProjectRef = 'ouqwbbermlzqqvtqwlul';
const expectedCapturedAt = '2026-08-27';
const expectedRemoteLedgerSha256 =
  'faef4111b8b03b62ed99ccb57cfba3c887755a54b7749945353e5a40e5573fe9';
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
const lowerHexSha256 = /^[0-9a-f]{64}$/;
const expectedEdgeManifestSha256 =
  '75fe04da485fa46188900f51303fd1d19c970f8327660e1f07cf7a3cfa33eb8a';
const expectedEdgeFunctions = {
  'bi-agent-lamusic': {
    version: 49,
    status: 'ACTIVE',
    verify_jwt: false,
    ezbr_sha256: '045baedb9c45d8d9fa87cda16eedde70d7c727b560b8c8e92c99891f4bce0d7d',
  },
  'gerar-plano-aluno': {
    version: 39,
    status: 'ACTIVE',
    verify_jwt: false,
    ezbr_sha256: 'ca6c8ce819bebc3003c3a14b678b0b777e53b5779e13404ab55d4bee5ba9d44f',
  },
  'gerar-relatorio-aluno': {
    version: 40,
    status: 'ACTIVE',
    verify_jwt: false,
    ezbr_sha256: '7b6d794afae81ff57dbe523f77f38e2314e4bae2566e1886c5fab7ee2a3d9c22',
  },
  'previsualizar-reconciliacao-grade-emusys': {
    version: 5,
    status: 'ACTIVE',
    verify_jwt: false,
    ezbr_sha256: '3957da9fd890b10e4a984409933edf20e4edff06bff3d18ed8bb4d80fefeb20f',
  },
  'processar-alertas-lia': {
    version: 13,
    status: 'ACTIVE',
    verify_jwt: true,
    ezbr_sha256: '9c687575abdbc2b3965ccb4ec660061d9ee104a2a2425b14b438ce3cf6ffad5e',
  },
  'relatorio-admin-whatsapp': {
    version: 112,
    status: 'ACTIVE',
    verify_jwt: false,
    ezbr_sha256: '97463bd2783d77804133e6aacadeac8ba223788538c6ea1dde8ba452cf8950dd',
  },
  'sync-grade-futura-emusys': {
    version: 34,
    status: 'ACTIVE',
    verify_jwt: true,
    ezbr_sha256: '643081aafae9a08a28bbd2a776888ff921c6eeec47272ebed5ccf7e726c08037',
  },
  'sync-presenca-emusys': {
    version: 102,
    status: 'ACTIVE',
    verify_jwt: false,
    ezbr_sha256: '578dd5232f3d0e927158f5e9ca16bcaaa7ed592916e4768d4c495b2c1dad7736',
  },
};
const expectedEdgeLiveRecheck = {
  captured_at: '2026-08-27T18:41:35.1559589-03:00',
  unchanged_slugs: [
    'bi-agent-lamusic',
    'gerar-plano-aluno',
    'gerar-relatorio-aluno',
    'previsualizar-reconciliacao-grade-emusys',
    'processar-alertas-lia',
    'sync-grade-futura-emusys',
    'sync-presenca-emusys',
  ],
  drift: [{
    slug: 'relatorio-admin-whatsapp',
    baseline_version: 112,
    observed_version: 113,
    baseline_ezbr_sha256: '97463bd2783d77804133e6aacadeac8ba223788538c6ea1dde8ba452cf8950dd',
    observed_ezbr_sha256: '3fc1ae9632ba71fa941102181eb9c5edd7fbc5588488edd2c92db339b812f1f9',
    baseline_entrypoint_sha256_lf: 'f52854f4674be05beb0d3c31542593ffc4b1c1fe27dca2e8331e8e955fbce888',
    observed_entrypoint_sha256_lf: 'ddf02fe99ba2b1ee979c04bd90980ae7c376f2408577d7db72b0b4e7b4cf030a',
    reason: 'mudanca_concorrente_pos_snapshot_presenca',
  }],
};

function canonicalMd5(filePath) {
  const content = readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  return createHash('md5').update(content, 'utf8').digest('hex');
}

function canonicalSha256(filePath) {
  const content = readFileSync(filePath, 'utf8').replace(/\r\n?/g, '\n');
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function canonicalUtf8Bytes(filePath) {
  return Buffer.byteLength(
    readFileSync(filePath, 'utf8').replace(/\r\n?/g, '\n'),
    'utf8',
  );
}

function migrationFileName(item) {
  return `${item.version}_${item.name}.sql`;
}

function remoteLedgerSha256(migrations) {
  const snapshot = migrations.map(
    ({ version, name, statement_count, remote_statements_md5 }) =>
      [version, name, statement_count, remote_statements_md5],
  );
  return createHash('sha256').update(JSON.stringify(snapshot), 'utf8').digest('hex');
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
  assert.deepEqual(versions, expectedVersions, 'MANIFEST_VERSIONS_INVALID');
  assert.equal(
    remoteLedgerSha256(candidate.migrations),
    expectedRemoteLedgerSha256,
    'MANIFEST_REMOTE_LEDGER_SNAPSHOT_INVALID',
  );
}

function assertRegularFileWithMd5(fileName, expectedMd5) {
  const filePath = path.join(migrationsDirectory, fileName);
  assert.equal(statSync(filePath).isFile(), true, `NOT_REGULAR_FILE: ${fileName}`);
  assert.equal(canonicalMd5(filePath), expectedMd5, `MD5_MISMATCH: ${fileName}`);
}

function assertEdgeManifest(candidate) {
  assert.ok(candidate && typeof candidate === 'object' && !Array.isArray(candidate));
  assert.deepEqual(
    Object.keys(candidate).sort(),
    [
      'bundle_file_count',
      'captured_at',
      'functions',
      'live_recheck',
      'project_ref',
      'schema_version',
    ],
    'EDGE_MANIFEST_TOP_LEVEL_INVALID',
  );
  assert.equal(candidate.schema_version, 1, 'EDGE_MANIFEST_SCHEMA_INVALID');
  assert.equal(candidate.project_ref, expectedProjectRef, 'EDGE_MANIFEST_PROJECT_REF_INVALID');
  assert.equal(candidate.captured_at, expectedCapturedAt, 'EDGE_MANIFEST_CAPTURED_AT_INVALID');
  assert.equal(candidate.bundle_file_count, 35, 'EDGE_MANIFEST_FILE_COUNT_INVALID');
  assert.ok(Array.isArray(candidate.functions), 'EDGE_MANIFEST_FUNCTIONS_INVALID');
  assert.deepEqual(
    candidate.functions.map(({ slug }) => slug),
    Object.keys(expectedEdgeFunctions),
    'EDGE_MANIFEST_FUNCTION_SET_INVALID',
  );

  let bundleFileCount = 0;
  for (const fn of candidate.functions) {
    assert.deepEqual(
      Object.keys(fn).sort(),
      ['bundle_file_count', 'ezbr_sha256', 'files', 'slug', 'status', 'verify_jwt', 'version'],
      `EDGE_MANIFEST_FUNCTION_KEYS_INVALID:${fn.slug ?? ''}`,
    );
    assert.deepEqual(
      {
        version: fn.version,
        status: fn.status,
        verify_jwt: fn.verify_jwt,
        ezbr_sha256: fn.ezbr_sha256,
      },
      expectedEdgeFunctions[fn.slug],
      `EDGE_MANIFEST_FUNCTION_METADATA_INVALID:${fn.slug}`,
    );
    assert.match(fn.ezbr_sha256, lowerHexSha256, `EDGE_MANIFEST_EZBR_INVALID:${fn.slug}`);
    assert.ok(Array.isArray(fn.files), `EDGE_MANIFEST_FILES_INVALID:${fn.slug}`);
    assert.equal(fn.bundle_file_count, fn.files.length, `EDGE_MANIFEST_BUNDLE_COUNT_INVALID:${fn.slug}`);

    const paths = new Set();
    for (const file of fn.files) {
      assert.deepEqual(
        Object.keys(file).sort(),
        ['bytes_lf', 'path', 'sha256_lf'],
        `EDGE_MANIFEST_FILE_KEYS_INVALID:${fn.slug}`,
      );
      assert.match(
        file.path,
        /^supabase\/functions\/[a-z0-9_./-]+\.ts$/u,
        `EDGE_MANIFEST_PATH_INVALID:${file.path}`,
      );
      assert.equal(file.path.includes('..'), false, `EDGE_MANIFEST_PATH_INVALID:${file.path}`);
      assert.equal(paths.has(file.path), false, `EDGE_MANIFEST_DUPLICATE_PATH:${fn.slug}:${file.path}`);
      paths.add(file.path);
      assert.match(file.sha256_lf, lowerHexSha256, `EDGE_MANIFEST_FILE_HASH_INVALID:${file.path}`);
      assert.ok(Number.isInteger(file.bytes_lf) && file.bytes_lf > 0, `EDGE_MANIFEST_BYTES_INVALID:${file.path}`);

      const filePath = path.join(repositoryRoot, file.path);
      assert.equal(statSync(filePath).isFile(), true, `NOT_REGULAR_FILE:${file.path}`);
      assert.equal(canonicalSha256(filePath), file.sha256_lf, `SHA256_MISMATCH:${file.path}`);
      assert.equal(canonicalUtf8Bytes(filePath), file.bytes_lf, `BYTE_COUNT_MISMATCH:${file.path}`);
    }
    bundleFileCount += fn.files.length;
  }
  assert.equal(bundleFileCount, candidate.bundle_file_count, 'EDGE_MANIFEST_FILE_COUNT_INVALID');
  assert.deepEqual(candidate.live_recheck, expectedEdgeLiveRecheck, 'EDGE_MANIFEST_LIVE_RECHECK_INVALID');
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
    [/MANIFEST_REMOTE_LEDGER_SNAPSHOT_INVALID/, (item) => { item.migrations[0].statement_count += 1; }],
    [/MANIFEST_REMOTE_LEDGER_SNAPSHOT_INVALID/, (item) => { item.migrations[0].remote_statements_md5 = '0'.repeat(32); }],
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

test('as fontes Edge publicadas estão seladas por versão, JWT e SHA-256', () => {
  const edgeManifest = JSON.parse(readFileSync(edgeManifestPath, 'utf8'));
  assert.equal(
    canonicalSha256(edgeManifestPath),
    expectedEdgeManifestSha256,
    'EDGE_MANIFEST_SNAPSHOT_INVALID',
  );
  assertEdgeManifest(edgeManifest);

  const mutations = [
    [/EDGE_MANIFEST_FUNCTION_METADATA_INVALID/, (item) => { item.functions[0].version += 1; }],
    [/EDGE_MANIFEST_FUNCTION_METADATA_INVALID/, (item) => { item.functions[0].verify_jwt = true; }],
    [/SHA256_MISMATCH/, (item) => { item.functions[0].files[0].sha256_lf = '0'.repeat(64); }],
    [/EDGE_MANIFEST_LIVE_RECHECK_INVALID/, (item) => { item.live_recheck.drift = []; }],
  ];
  for (const [expectedError, mutate] of mutations) {
    const candidate = JSON.parse(JSON.stringify(edgeManifest));
    mutate(candidate);
    assert.throws(() => assertEdgeManifest(candidate), expectedError);
  }

  const syncPresencaSource = readFileSync(
    path.join(repositoryRoot, 'supabase/functions/sync-presenca-emusys/index.ts'),
    'utf8',
  );
  assert.doesNotMatch(syncPresencaSource, /reconciliar_grade_snapshot_emusys_v2/);
});
