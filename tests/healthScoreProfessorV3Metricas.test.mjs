import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const migrationPath =
  'supabase/migrations/20260717113000_health_score_v3_metricas_sombra.sql';
const mediaPerformanceMigrationPath =
  'supabase/migrations/20260717114500_health_score_v3_media_turma_performance.sql';

const rpcNames = [
  'get_professor_conversao_v3_sombra',
  'get_professor_media_turma_v3_sombra',
  'get_professor_numero_alunos_v3_sombra',
  'get_professor_retencao_v3_sombra',
  'get_professor_permanencia_v3_sombra',
  'get_professor_presenca_v3_sombra',
];

const requiredAuditFields = [
  'valor_bruto',
  'numerador',
  'denominador',
  'amostra',
  'estado_base',
  'publicavel',
  'confianca',
  'fonte',
  'regra_versao',
  'motivo_sem_base',
];

function readMigration() {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  return readFileSync(migrationPath, 'utf8');
}

function functionBlock(sql, name) {
  const start = sql.toLowerCase().indexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, `${name} deve existir`);
  const rest = sql.slice(start);
  const next = rest.slice(1).search(/\ncreate or replace function public\./i);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

test('Gate 4 cria seis RPCs V3 em sombra com contrato auditavel comum', () => {
  const sql = readMigration();

  for (const name of rpcNames) {
    const block = functionBlock(sql, name);
    assert.match(block, /p_competencia\s+date/i);
    assert.match(block, /p_unidade_id\s+uuid\s+default\s+null/i);
    assert.match(block, /security definer/i);
    assert.match(block, /set search_path\s*=\s*public,\s*pg_temp/i);
    for (const field of requiredAuditFields) {
      assert.match(block, new RegExp(`\\b${field}\\b`, 'i'), `${name} sem ${field}`);
    }
  }
});

test('read model efetivo compoe baseline concluido e transicoes sem mutar historico', () => {
  const sql = readMigration();

  assert.match(sql, /vw_professor_periodos_efetivos_v3_sombra/i);
  assert.match(sql, /security_invoker\s*=\s*true/i);
  assert.match(sql, /professor_periodos_reconstrucoes_v1/i);
  assert.match(sql, /professor_matricula_disciplina_periodos_v1/i);
  assert.match(sql, /aluno_professor_transicoes/i);
  assert.match(sql, /periodo_origem_id/i);
  assert.match(sql, /row_number\(\)[\s\S]*partition by[\s\S]*unidade_id/i);
  assert.doesNotMatch(
    sql,
    /(insert\s+into|update|delete\s+from)\s+public\.professor_matricula_disciplina_periodos_v1/i,
  );
});

test('conversao credita uma unica experimental confirmada em ate 30 dias', () => {
  const block = functionBlock(readMigration(), 'get_professor_conversao_v3_sombra');

  assert.match(block, /emusys_experimentais_raw/i);
  assert.match(block, /situacao_operacional\s+in\s*\(\s*'presente'\s*,\s*'matriculado'\s*\)/i);
  assert.match(block, /row_number\(\)[\s\S]*partition by[\s\S]*(aluno|matricula)/i);
  assert.match(block, /interval\s+'30 days'/i);
  assert.match(block, /amostra[\s\S]*>=\s*3/i);
  assert.match(block, /em_maturacao/i);
  assert.doesNotMatch(block, /least\s*\(\s*100/i);
});

test('media por turma usa ocupacao pessoa turma regular sem fallback legado', () => {
  const block = functionBlock(readMigration(), 'get_professor_media_turma_v3_sombra');

  assert.match(block, /aulas_emusys/i);
  assert.match(block, /aula_alunos_emusys/i);
  assert.match(block, /vw_aluno_identidade_unidade_canonica/i);
  assert.match(block, /turma_chave/i);
  assert.match(
    block,
    /count\s*\(\s*distinct\s*\(\s*(?:\w+\.)?pessoa_chave\s*,\s*(?:\w+\.)?turma_chave\s*\)\s*\)/i,
  );
  assert.match(block, /is_projeto_banda/i);
  assert.match(block, /sum\s*\(\s*(?:\w+\.)?ocupacoes/i);
  assert.match(block, /sum\s*\(\s*(?:\w+\.)?turmas/i);
  assert.doesNotMatch(block, /professor_atual_id/i);
  assert.doesNotMatch(block, /legado_periodo|infer/i);
});

test('media por turma resolve identidade por igualdade sem OR com array', () => {
  assert.equal(
    existsSync(mediaPerformanceMigrationPath),
    true,
    `${mediaPerformanceMigrationPath} deve existir`,
  );
  const migration = readFileSync(mediaPerformanceMigrationPath, 'utf8');
  const block = functionBlock(migration, 'get_professor_media_turma_v3_sombra');

  assert.match(block, /aa\.aluno_emusys_id/i);
  assert.match(block, /al\.emusys_student_id/i);
  assert.match(block, /i\.emusys_aluno_id\s*=\s*r\.emusys_aluno_id_resolvido/i);
  assert.doesNotMatch(block, /\bor\s*\([^)]*aluno_ids_locais/i);
  assert.doesNotMatch(block, /=\s*any\s*\(\s*i\.aluno_ids_locais/i);
});

test('numero de alunos usa pessoa canonica nos tres fechamentos mensais', () => {
  const block = functionBlock(readMigration(), 'get_professor_numero_alunos_v3_sombra');

  assert.match(block, /vw_professor_periodos_efetivos_v3_sombra/i);
  assert.match(block, /generate_series/i);
  assert.match(
    block,
    /count\s*\(\s*distinct\s*\([^)]*(?:\w+\.)?pessoa_chave[^)]*\)\s*\)/i,
  );
  assert.match(block, /meses_com_base[\s\S]*=\s*3/i);
  assert.match(block, /avg\s*\(\s*(?:\w+\.)?alunos_fechamento/i);
  assert.doesNotMatch(block, /professor_atual_id/i);
});

test('retencao so penaliza encerramento atribuivel confirmado', () => {
  const block = functionBlock(readMigration(), 'get_professor_retencao_v3_sombra');

  assert.match(block, /vw_professor_periodos_efetivos_v3_sombra/i);
  assert.match(block, /conta_retencao_professor\s+is\s+true/i);
  assert.match(block, /atribuicao_confirmada\s+is\s+true/i);
  assert.match(block, /motivos_saida/i);
  assert.match(block, /vinculos_expostos[\s\S]*>=\s*10/i);
  assert.match(block, /encerramentos_desconhecidos/i);
});

test('permanencia usa somente periodos encerrados elegiveis e publicaveis', () => {
  const block = functionBlock(readMigration(), 'get_professor_permanencia_v3_sombra');

  assert.match(block, /status_periodo\s*=\s*'encerrado'/i);
  assert.match(block, /elegivel_permanencia\s*=\s*true/i);
  assert.match(block, /publicavel\s*=\s*true/i);
  assert.match(block, /confianca\s+in\s*\(\s*'alta'\s*,\s*'revisado_aprovado'\s*\)/i);
  assert.match(block, /percentile_cont\s*\(\s*0\.5\s*\)/i);
  assert.match(block, /amostra[\s\S]*>=\s*3/i);
});

test('presenca usa semantica canonica a partir de 03 de agosto e mede cobertura', () => {
  const block = functionBlock(readMigration(), 'get_professor_presenca_v3_sombra');

  assert.match(block, /vw_aluno_presenca_semantica_v1/i);
  assert.match(block, /date\s+'2026-08-03'/i);
  assert.match(block, /resultado_pedagogico\s+in\s*\(\s*'presente'\s*,\s*'falta_confirmada'\s*\)/i);
  assert.match(block, /aula_alunos_emusys/i);
  assert.match(block, /eventos_esperados/i);
  assert.match(block, /eventos_elegiveis[\s\S]*>=\s*10/i);
  assert.match(block, /cobertura[\s\S]*>=\s*0\.95/i);
  assert.doesNotMatch(block, /professor_presenca\s*=\s*'ausente'/i);
});

test('sem base permanece null e consolidado recalcula eventos brutos', () => {
  const sql = readMigration();

  assert.doesNotMatch(sql, /coalesce\s*\([^)]*,\s*(75|100)(?:\.0)?\s*\)/i);
  assert.doesNotMatch(sql, /coalesce\s*\(\s*valor_bruto\s*,\s*0(?:\.0)?\s*\)/i);
  assert.doesNotMatch(sql, /avg\s*\(\s*(?:score|nota|valor_bruto)/i);
  assert.match(sql, /p_unidade_id\s+is\s+null/i);
  assert.match(sql, /else\s+null/i);
});

test('RPCs sombra validam escopo e nao expoem staging nem acesso anonimo', () => {
  const sql = readMigration();

  assert.match(sql, /fn_health_score_v3_unidades_permitidas_sombra/i);
  assert.match(sql, /usuario_tem_permissao[\s\S]*'professores\.ver'/i);
  assert.doesNotMatch(sql, /emusys_aulas_historico_staging_v1/i);
  assert.doesNotMatch(sql, /emusys_aula_alunos_historico_staging_v1/i);

  for (const name of rpcNames) {
    assert.match(
      sql,
      new RegExp(`revoke all on function public\\.${name}[\\s\\S]*?from public, anon`, 'i'),
    );
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${name}[\\s\\S]*?to authenticated, service_role`, 'i'),
    );
  }
});
