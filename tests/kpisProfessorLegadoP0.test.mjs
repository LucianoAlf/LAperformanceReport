import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const migrationPath =
  'supabase/migrations/20260715181000_kpis_professor_legado_wrapper_seguro.sql';

const lerArquivosRuntime = (diretorio) => {
  if (!existsSync(diretorio)) return '';

  return readdirSync(diretorio)
    .flatMap((nome) => {
      const caminho = join(diretorio, nome);
      return statSync(caminho).isDirectory()
        ? [lerArquivosRuntime(caminho)]
        : /\.(ts|tsx|js|jsx|mjs)$/.test(nome)
          ? [readFileSync(caminho, 'utf8')]
          : [];
    })
    .join('\n');
};

test('RPC legada delega para a v2 e nunca calcula KPI em fonte bruta', () => {
  assert.equal(existsSync(migrationPath), true, 'migration de fechamento P0 ausente');
  const migration = readFileSync(migrationPath, 'utf8');

  assert.match(migration, /create\s+or\s+replace\s+function\s+public\.get_kpis_professor_periodo\s*\(/i);
  assert.match(migration, /from\s+public\.get_kpis_professor_periodo_canonico_v2\s*\(/i);
  assert.match(migration, /case\s+when\s+k\.presenca_publicavel\s+then\s+k\.media_presenca\s+else\s+null/i);
  assert.match(migration, /case\s+when\s+k\.presenca_publicavel\s+then\s+k\.taxa_faltas\s+else\s+null/i);
  assert.doesNotMatch(migration, /\bfrom\s+(public\.)?aluno_presenca\b/i);
  assert.doesNotMatch(migration, /\bfrom\s+(public\.)?alunos\b/i);
  assert.doesNotMatch(migration, /coalesce\s*\([^)]*(media_presenca|taxa_faltas)[^)]*,\s*0/i);
});

test('RPC legada deixa de ser publica e preserva apenas compatibilidade autenticada', () => {
  assert.equal(existsSync(migrationPath), true, 'migration de fechamento P0 ausente');
  const migration = readFileSync(migrationPath, 'utf8');

  assert.match(migration, /security\s+invoker/i);
  assert.match(migration, /set\s+search_path\s*=\s*public,\s*pg_temp/i);
  assert.match(migration, /revoke\s+all\s+on\s+function[\s\S]*from\s+public,\s*anon,\s*authenticated,\s*service_role/i);
  assert.match(migration, /grant\s+execute\s+on\s+function[\s\S]*to\s+authenticated,\s*service_role/i);
  assert.doesNotMatch(migration, /grant\s+execute[\s\S]*to\s+(public|anon)/i);
});

test('codigo executavel do repositorio nao chama a assinatura legada', () => {
  const runtime = [
    lerArquivosRuntime('src'),
    lerArquivosRuntime('supabase/functions'),
  ].join('\n');

  assert.doesNotMatch(
    runtime,
    /\.rpc\(\s*['"]get_kpis_professor_periodo['"]/i,
  );
  assert.match(runtime, /get_kpis_professor_periodo_canonico_v3/i);
});
