import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const migrationPath =
  'supabase/migrations/20260717224500_health_score_v3_revisoes_periodos_efetivos.sql';
const isolationMigrationPath =
  'supabase/migrations/20260717225000_health_score_v3_revisoes_roles_isolamento.sql';
const exactPromotionMigrationPath =
  'supabase/migrations/20260727121000_health_score_v3_promocao_periodos_ativos_exatos.sql';

function readMigration() {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  return readFileSync(migrationPath, 'utf8');
}

function readExactPromotionMigration() {
  assert.equal(
    existsSync(exactPromotionMigrationPath),
    true,
    `${exactPromotionMigrationPath} deve existir`,
  );
  return readFileSync(exactPromotionMigrationPath, 'utf8');
}

test('camada efetiva aplica somente a ultima revisao humana ao baseline', () => {
  const sql = readMigration();

  assert.match(sql, /vw_professor_periodos_baseline_v3_sombra/i);
  assert.match(sql, /vw_professor_periodos_efetivos_v3_sombra/i);
  assert.match(sql, /security_invoker\s*=\s*true/i);
  assert.match(sql, /professor_periodos_revisoes_v1/i);
  assert.match(sql, /distinct\s+on\s*\(\s*(?:\w+\.)?periodo_id\s*\)/i);
  assert.match(sql, /order\s+by\s+(?:\w+\.)?periodo_id[\s\S]*created_at\s+desc[\s\S]*id\s+desc/i);
  assert.match(
    sql,
    /periodo_chave\s*=\s*'baseline:'\s*\|\|\s*(?:\w+\.)?periodo_id::text/i,
  );
});

test('decisoes aprovadas corrigem a leitura e decisoes abertas nao publicam', () => {
  const sql = readMigration();

  assert.match(sql, /decisao\s+in\s*\(\s*'aprovado'\s*,\s*'corrigido'\s*\)/i);
  assert.match(sql, /professor_corrigido_id/i);
  assert.match(sql, /emusys_professor_corrigido_id/i);
  assert.match(sql, /data_inicio_corrigida/i);
  assert.match(sql, /data_fim_corrigida/i);
  assert.match(sql, /'revisado_aprovado'/i);
  assert.match(sql, /decisao\s*=\s*'rejeitado'[\s\S]*'invalidado'/i);
  assert.match(sql, /decisao\s+in\s*\(\s*'rejeitado'\s*,\s*'manter_revisao'\s*\)[\s\S]*false/i);
  assert.match(sql, /30\.44::numeric/i);
  assert.match(sql, />=\s*4/i);
});

test('overlay preserva historico bruto e continua isolado do frontend', () => {
  const sql = readMigration();

  assert.doesNotMatch(
    sql,
    /(insert\s+into|update|delete\s+from)\s+public\.(professor_matricula_disciplina_periodos_v1|professor_periodos_revisoes_v1|aulas_emusys|aluno_presenca)/i,
  );
  assert.match(
    sql,
    /revoke\s+all\s+on\s+table\s+public\.vw_professor_periodos_(?:baseline|efetivos)_v3_sombra[\s\S]*from\s+public,\s*anon,\s*authenticated/i,
  );
  assert.match(
    sql,
    /grant\s+select\s+on\s+table\s+public\.vw_professor_periodos_(?:baseline|efetivos)_v3_sombra[\s\S]*to\s+service_role/i,
  );
  assert.doesNotMatch(sql, /grant\s+.*\s+to\s+(?:public|anon|authenticated)/i);
});

test('migration corretiva remove grants padrao dos agentes e deixa service role somente leitura', () => {
  assert.equal(
    existsSync(isolationMigrationPath),
    true,
    `${isolationMigrationPath} deve existir`,
  );
  const sql = readFileSync(isolationMigrationPath, 'utf8');

  for (const role of [
    'fabio_agent',
    'lia_acesso_restrito',
    'mila_acesso_restrito',
    'sol_acesso_restrito',
  ]) {
    assert.match(sql, new RegExp(`revoke all[\\s\\S]*${role}`, 'i'));
  }

  assert.match(sql, /revoke all[\s\S]*service_role/i);
  assert.match(sql, /grant select[\s\S]*service_role/i);
  assert.doesNotMatch(sql, /grant\s+.*\s+to\s+(?:public|anon|authenticated|fabio_agent|lia_acesso_restrito|mila_acesso_restrito|sol_acesso_restrito)/i);
});

test('promocao automatica tem origem estruturada sem apagar revisoes humanas', () => {
  const sql = readExactPromotionMigration();

  assert.match(
    sql,
    /add\s+column\s+if\s+not\s+exists\s+origem_revisao\s+text\s+not\s+null\s+default\s+'revisao_humana'/i,
  );
  assert.match(
    sql,
    /origem_revisao[\s\S]*'revisao_humana'[\s\S]*'promocao_automatica'/i,
  );
  assert.match(
    sql,
    /insert\s+into\s+public\.professor_periodos_revisoes_v1[\s\S]*origem_revisao/i,
  );
  assert.match(sql, /'promocao_automatica'/i);
  assert.match(
    sql,
    /not\s+exists\s*\([\s\S]*from\s+public\.professor_periodos_revisoes_v1[\s\S]*periodo_id/i,
  );
  assert.doesNotMatch(
    sql,
    /update\s+public\.professor_periodos_revisoes_v1/i,
  );
  assert.doesNotMatch(
    sql,
    /update\s+public\.professor_matricula_disciplina_periodos_v1/i,
  );
});

test('origem efetiva sem ator nao bloqueia futura ativa com ator governado valido', () => {
  const sql = readExactPromotionMigration();
  const actorSelection = sql.match(
    /select\s+c\.ativado_por[\s\S]*?into\s+v_revisado_por[\s\S]*?limit\s+1\s*;/i,
  )?.[0] ?? '';

  assert.notEqual(actorSelection, '', 'selecao deterministica do ator deve existir');
  assert.match(actorSelection, /health_score_professor_v3_config_versoes/i);
  assert.match(actorSelection, /join\s+public\.usuarios\s+u/i);
  assert.match(actorSelection, /c\.status\s*=\s*'ativa'/i);
  assert.match(actorSelection, /c\.ativado_por\s+is\s+not\s+null/i);
  assert.match(actorSelection, /u\.ativo\s*=\s*true/i);
  assert.match(
    actorSelection,
    /usuario_tem_permissao\s*\(\s*c\.ativado_por\s*,\s*'professores\.editar'\s*,\s*null\s*\)/i,
  );
  assert.match(actorSelection, /order\s+by\s+c\.versao\s+desc/i);
  assert.match(actorSelection, /limit\s+1/i);
  assert.doesNotMatch(actorSelection, /current_date/i);
  assert.doesNotMatch(sql, /v_total_configuracoes_ativas/i);
  assert.match(sql, /v_revisado_por\s+is\s+null/i);
  assert.match(
    sql,
    /raise\s+exception[\s\S]*CONFIGURACAO_ATIVA_SEM_ATOR_VALIDO/i,
  );
  assert.doesNotMatch(
    sql,
    /revisado_por[\s\S]{0,200}'[0-9a-f]{8}-[0-9a-f-]{27,}'/i,
  );
});

test('assertions transacionais abortam em drift do universo exato', () => {
  const sql = readExactPromotionMigration();

  assert.match(sql, /^\s*begin\s*;/i);
  assert.match(sql, /commit\s*;\s*$/i);
  assert.match(sql, /vw_professor_periodos_baseline_v3_sombra/i);
  assert.match(sql, /aluno_jornada_matricula_disciplina/i);
  assert.match(sql, /cardinalidade_jornada_ativa\s*=\s*1/i);
  assert.match(sql, /v_total_exato\s*<>\s*207/i);
  assert.match(sql, /v_total_barra\s*<>\s*75/i);
  assert.match(sql, /v_total_campo_grande\s*<>\s*71/i);
  assert.match(sql, /v_total_recreio\s*<>\s*61/i);
  assert.match(sql, /v_total_conflitos\s*<>\s*0/i);
  assert.match(sql, /v_total_inicio_incompleto\s*<>\s*0/i);
  assert.match(sql, /raise\s+exception[\s\S]*DRIFT/i);
});

test('idempotencia concorrente combina lock e indice unico parcial', () => {
  const sql = readExactPromotionMigration();

  assert.match(
    sql,
    /lock\s+table\s+public\.professor_periodos_revisoes_v1\s+in\s+share\s+row\s+exclusive\s+mode/i,
  );
  assert.match(
    sql,
    /create\s+unique\s+index\s+if\s+not\s+exists[\s\S]*periodo_id[\s\S]*where\s+origem_revisao\s*=\s*'promocao_automatica'/i,
  );
  assert.match(sql, /on\s+conflict\s+do\s+nothing/i);
});

test('view efetiva separa confianca e fonte automatica da revisao humana', () => {
  const sql = readExactPromotionMigration();

  assert.match(
    sql,
    /create\s+or\s+replace\s+view\s+public\.vw_professor_periodos_efetivos_v3_sombra/i,
  );
  assert.match(
    sql,
    /origem_revisao\s*=\s*'promocao_automatica'[\s\S]*then\s+'alta'/i,
  );
  assert.match(
    sql,
    /origem_revisao\s*=\s*'revisao_humana'[\s\S]*then\s+'revisado_aprovado'/i,
  );
  assert.match(sql, /\+promocao_automatica_v1/i);
  assert.match(sql, /\+revisao_humana_v1/i);
});
