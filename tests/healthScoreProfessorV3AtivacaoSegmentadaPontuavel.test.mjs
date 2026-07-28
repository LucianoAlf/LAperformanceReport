import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260727125000_health_score_v3_ativacao_segmentos_pontuaveis.sql';

function migration() {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  return readFileSync(migrationPath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\r\n]*/g, '');
}

test('ativacao do ciclo aberto bloqueia somente excecoes segmentadas pontuaveis', () => {
  const sql = migration();

  assert.match(
    sql,
    /create\s+or\s+replace\s+function\s+public\.ativar_health_score_professor_v3_config_revisao_ciclo_aberto/i,
  );
  assert.match(
    sql,
    /d\.atribuicao_pontuavel\s+and\s*\([\s\S]*d\.estado_base\s+in\s*\([\s\S]*'regra_ausente'[\s\S]*'segmentacao_incompleta'/i,
    'regra ausente e segmentacao incompleta so podem bloquear atribuicao pontuavel',
  );
  assert.match(
    sql,
    /d\.divergencias\s*->>\s*'nao_ofertada_com_dados'\s*=\s*'true'/i,
    'combinacao declarada nao ofertada com dados observados continua bloqueante',
  );
});

test('diagnosticos nao pontuaveis permanecem visiveis sem bloquear o ciclo', () => {
  const sql = migration();
  const jsonGuard = sql.match(
    /if\s+jsonb_array_length\([\s\S]*?then\s+raise\s+exception\s+'HEALTH_SCORE_V3_CONFIG_INVALIDA:\s+excecoes atuais bloqueiam a ativacao'/i,
  )?.[0];

  assert.ok(jsonGuard, 'guard JSON de excecoes deve permanecer explicito');
  assert.match(jsonGuard, /nao_ofertada_observada/i);
  assert.match(jsonGuard, /atribuicoes_pontuaveis_sem_meta/i);
  assert.doesNotMatch(jsonGuard, /resultado_simulacao\s*->\s*'regra_ausente'/i);
  assert.doesNotMatch(
    jsonGuard,
    /resultado_simulacao\s*->\s*'segmentacao_incompleta'/i,
  );
});

test('RPC corrigida preserva search_path e grants restritos', () => {
  const sql = migration();

  assert.match(sql, /security\s+definer/i);
  assert.match(sql, /set\s+search_path\s*=\s*public/i);
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.ativar_health_score_professor_v3_config_revisao_ciclo_aberto\s*\(\s*uuid\s*,\s*text\s*\)\s+from\s+public,\s*anon/i,
  );
  assert.match(
    sql,
    /grant\s+execute\s+on\s+function\s+public\.ativar_health_score_professor_v3_config_revisao_ciclo_aberto\s*\(\s*uuid\s*,\s*text\s*\)\s+to\s+authenticated/i,
  );
});
