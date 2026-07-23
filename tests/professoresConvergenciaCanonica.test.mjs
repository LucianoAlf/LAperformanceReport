import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const mediaMigrationPath =
  'supabase/migrations/20260719160000_professores_media_turma_ocupacao_estavel.sql';
const reportMigrationPath =
  'supabase/migrations/20260719161000_relatorio_gerencial_rankings_professores_canonicos.sql';
const configRepairMigrationPath =
  'supabase/migrations/20260719162000_health_score_v3_meta_status_repair.sql';
const reportLegacyPrivacyMigrationPath =
  'supabase/migrations/20260719163000_relatorio_gerencial_legacy_rankings_privado.sql';
const configComponentPath =
  'src/components/App/Professores/HealthScoreV3Config.tsx';

const readOptional = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('media por turma conta ocupacoes pessoa turma com identidade estavel', () => {
  const sql = readOptional(mediaMigrationPath);

  assert.match(sql, /get_carteira_professor_periodo_canonica/i);
  assert.match(
    sql,
    /count\s*\(\s*distinct\s+jsonb_build_array\s*\(/i,
  );
  assert.match(sql, /b\.fonte\s*=\s*'jornada'/i);
  assert.match(sql, /b\.turma_chave\s+like\s+'turma:%'/i);
  assert.match(sql, /b\.turma_chave\s*~\s*'\^individual:\[0-9\]\+\$'/i);
  assert.doesNotMatch(sql, /extract\s*\(\s*isodow\s+from\s+ae\.data_aula/i);
  assert.doesNotMatch(sql, /to_char\s*\(\s*ae\.data_hora_inicio/i);
});

test('relatorio gerencial recebe rankings da mesma camada canonica de professores', () => {
  const sql = readOptional(reportMigrationPath);

  assert.match(sql, /get_dados_relatorio_gerencial/i);
  assert.match(sql, /get_kpis_professor_periodo_canonico_v3/i);
  assert.match(sql, /get_health_score_professor_v3_performance/i);
  for (const key of [
    'top_professores_media_turma',
    'top_professores_presenca',
    'top_professores_retencao',
    'top_professores_matriculadores',
  ]) {
    assert.match(sql, new RegExp(key, 'i'));
  }
  assert.match(sql, /fonte_rankings_professores/i);
});

test('reparo explicita metas homologadas sem alterar pesos ou valores', () => {
  const sql = readOptional(configRepairMigrationPath);

  assert.match(sql, /versao\s*=\s*2/i);
  assert.match(sql, /meta_status/i);
  assert.match(sql, /aprovada/i);
  assert.match(sql, /meta_reparo/i);
  assert.doesNotMatch(sql, /set\s+meta\s*=/i);
  assert.doesNotMatch(sql, /set\s+peso\s*=/i);
});

test('painel mostra o estado realmente persistido da meta', () => {
  const source = readOptional(configComponentPath);

  assert.match(source, /value=\{metric\.metaStatus\}/i);
  assert.doesNotMatch(
    source,
    /value=\{metric\.meta\s*===\s*null\s*\?\s*metric\.metaStatus\s*:\s*['"]aprovada['"]\}/i,
  );
});

test('implementacao gerencial legada nao pode contornar o wrapper canonico', () => {
  const sql = readOptional(reportLegacyPrivacyMigrationPath);

  assert.match(
    sql,
    /get_dados_relatorio_gerencial_legacy_rankings_p24_20260719/i,
  );
  assert.match(
    sql,
    /revoke\s+all[\s\S]*from\s+public,\s*anon,\s*authenticated,\s*fabio_agent,\s*service_role/i,
  );
  assert.match(sql, /consumir public\.get_dados_relatorio_gerencial/i);
});
