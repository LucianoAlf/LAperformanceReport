import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = path.join(
  repositoryRoot,
  'docs/audits/2026-08-27-presenca-convergencia-manifest.json',
);
const migrationsDirectory = path.join(repositoryRoot, 'supabase/migrations');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

test('as migrations publicadas mantêm paridade com o manifesto', () => {
  assert.equal(manifest.migrations.length, 24);

  for (const migration of manifest.migrations) {
    const fileName = `${migration.version}_${migration.name}.sql`;
    const filePath = path.join(migrationsDirectory, fileName);

    assert.ok(existsSync(filePath), `migration ausente: ${fileName}`);

    const localFileMd5 = createHash('md5')
      .update(readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n'))
      .digest('hex');

    assert.equal(
      localFileMd5,
      migration.local_file_md5,
      `MD5 local divergente: ${fileName}`,
    );
    assert.match(
      migration.remote_statements_md5,
      /^[0-9a-f]{32}$/i,
      `MD5 remoto inválido: ${fileName}`,
    );
    assert.ok(
      migration.statement_count > 0,
      `statement_count inválido: ${fileName}`,
    );
  }
});

test('preserva o bypass vigente e rejeita as migrations substituídas', () => {
  const bypassFile = path.join(
    migrationsDirectory,
    '20260827151832_agenda_chamada_volta_do_fechamento_de_bypass.sql',
  );
  assert.ok(existsSync(bypassFile), 'migration de bypass vigente ausente');

  const migrationFiles = readdirSync(migrationsDirectory);
  const forbiddenVersions = [
    '20260827143000',
    '20260827143100',
    '20260827143200',
    '20260827143300',
  ];

  for (const version of forbiddenVersions) {
    assert.equal(
      migrationFiles.some((fileName) => fileName.startsWith(version)),
      false,
      `migration substituída encontrada: ${version}`,
    );
  }
});
