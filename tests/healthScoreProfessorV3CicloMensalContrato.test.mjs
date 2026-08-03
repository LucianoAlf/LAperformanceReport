import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260803220000_health_score_v3_ciclo_mensal_canonico.sql';
const performanceMigrationPath =
  'supabase/migrations/20260803224500_health_score_v3_ciclo_performance.sql';
const openPeriodMigrationPath =
  'supabase/migrations/20260803225500_health_score_v3_periodo_aberto_carteira.sql';
const timeoutMigrationPath =
  'supabase/migrations/20260803230500_health_score_v3_performance_timeout.sql';
const payloadMigrationPath =
  'supabase/migrations/20260803231500_health_score_v3_performance_payload.sql';
const activeRosterMigrationPath =
  'supabase/migrations/20260803232500_health_score_v3_equipe_ativa.sql';
const periodSourcePath = 'src/lib/healthScoreProfessorV3Periodos.ts';
const periodMigrationPath =
  'supabase/migrations/20260719120000_health_score_v3_ciclos_publicacao_parcial.sql';

const read = (path) => fs.readFileSync(path, 'utf8');

test('calendario mensal e ciclos fixos preservam a virada Dez-Jan-Fev', () => {
  const source = read(periodSourcePath);
  const sql = read(periodMigrationPath);

  assert.match(source, /codigo:\s*`\$\{year\}-MAR-MAI`/i);
  assert.match(source, /codigo:\s*`\$\{year\}-JUN-AGO`/i);
  assert.match(source, /codigo:\s*`\$\{year\}-SET-NOV`/i);
  assert.match(source, /codigo:\s*`\$\{year\}-DEZ-\$\{year \+ 1\}-FEV`/i);
  assert.match(source, /inicio:\s*isoDate\(year,\s*12,\s*1\)[\s\S]*fim:\s*isoDate\(year \+ 1,\s*2,/i);
  assert.match(sql, /v_mes\s*=\s*12[\s\S]*make_date\(v_ano,\s*12,\s*1\)[\s\S]*make_date\(v_ano\s*\+\s*1,\s*3,\s*1\)\s*-\s*1/i);
  assert.match(sql, /v_mes\s+between\s+1\s+and\s+2[\s\S]*make_date\(v_ano\s*-\s*1,\s*12,\s*1\)/i);
});

test('contrato canonico publica pesos brutos e cobertura normalizada', () => {
  assert.equal(
    fs.existsSync(migrationPath),
    true,
    'migration mensal/ciclo ainda nao existe',
  );
  const sql = read(migrationPath);

  assert.match(sql, /calcular_health_score_professor_v3_cobertura_normalizada/i);
  assert.match(sql, /peso_pontuavel_total\s+numeric/i);
  assert.match(sql, /peso_disponivel_total\s+numeric/i);
  assert.match(sql, /cobertura_normalizada\s+numeric/i);
  assert.match(
    sql,
    /p?_peso_disponivel_total[\s\S]*\/\s*nullif\(p?_peso_pontuavel_total,\s*0\)\s*\*\s*100/i,
  );
  assert.match(sql, /comparabilidade_motivos\s+jsonb/i);
});

test('produtor roteia mensal e ciclo sem misturar conversao de periodos', () => {
  const sql = read(migrationPath);

  assert.match(sql, /get_health_score_professor_v3_conversao_mensal/i);
  assert.match(sql, /get_health_score_professor_v3_conversao_ciclo/i);
  assert.match(sql, /p_periodicidade\s*=\s*'mensal'/i);
  assert.match(sql, /p_periodicidade\s*=\s*'ciclo'/i);
  assert.match(sql, /HEALTH_SCORE_V3_PERIODICIDADE_INVALIDA/i);
  assert.doesNotMatch(sql, /v_codigo\s*=\s*'2026-JUN-AGO'/i);
});

test('ausencias conhecidas recebem codigos causais e auditoria exige motivo', () => {
  const sql = read(migrationPath);

  for (const code of [
    'sem_experimental_mes',
    'amostra_experimental_insuficiente',
    'sem_aulas_elegiveis_mes',
    'presenca_ainda_nao_registrada_mes',
    'sem_vinculos_encerrados_elegiveis',
    'amostra_vinculos_insuficiente',
  ]) {
    assert.match(sql, new RegExp(code, 'i'));
  }
  assert.match(sql, /fonte_canonica_indisponivel[\s\S]*motivo_auditoria/i);
});

test('ciclo aberto usa projecao viva e falha de produtor nao fabrica grade nula', () => {
  const sql = read(migrationPath);

  assert.match(sql, /get_health_score_professor_v3_projecao_viva_coerente\([\s\S]*'ciclo'/i);
  assert.match(sql, /ciclo_em_acompanhamento/i);
  assert.match(sql, /HEALTH_SCORE_V3_CICLO_INDISPONIVEL/i);
  assert.doesNotMatch(sql, /HEALTH_SCORE_V3_CICLO_INDISPONIVEL[\s\S]*return\s+query[\s\S]*null::numeric/i);
});

test('projecao viva do ciclo reutiliza a agregacao segmentada ja produzida', () => {
  assert.equal(
    fs.existsSync(performanceMigrationPath),
    true,
    'migration corretiva de performance do ciclo ainda nao existe',
  );
  const sql = read(performanceMigrationPath);

  assert.match(sql, /get_health_score_professor_v3_metricas_periodo\([\s\S]*'ciclo'/i);
  assert.match(sql, /detalhes\s*->>\s*'nota_segmentada'/i);
  assert.doesNotMatch(
    sql,
    /get_health_score_professor_v3_metricas_segmentadas_agregadas_v1/i,
    'a projecao nao pode recalcular a agregacao segmentada do mesmo ciclo',
  );
});

test('periodo aberto usa a mesma carteira canonica da aba Carteira sem alterar historico', () => {
  assert.equal(
    fs.existsSync(openPeriodMigrationPath),
    true,
    'migration da carteira canonica do periodo aberto ainda nao existe',
  );
  const sql = read(openPeriodMigrationPath);

  assert.match(sql, /rename\s+to\s+get_hs_prof_v3_segmentadas_agregadas_base_20260803/i);
  assert.match(sql, /date_trunc\('month',\s*p_competencia\)/i);
  assert.match(sql, /get_carteira_professores\(p_unidade_id\)/i);
  assert.match(sql, /get_hs_prof_v3_segmentadas_agregadas_base_20260803\(/i);
  assert.match(sql, /numero_alunos[\s\S]*diagnostico/i);
});

test('periodo aberto elimina a segunda leitura historica da carteira segmentada', () => {
  assert.equal(
    fs.existsSync(timeoutMigrationPath),
    true,
    'migration de eliminacao do timeout V3 ainda nao existe',
  );
  const sql = read(timeoutMigrationPath);

  assert.match(
    sql,
    /get_health_score_professor_v3_metricas_segmentadas_v1[\s\S]*v_competencia\s*=\s*v_competencia_atual/i,
  );
  assert.match(sql, /hs_v3_segmentos_detalhe_base_canonica\(/i);
  assert.match(sql, /natureza_operacional\s*=\s*'pedagogica'/i);
  assert.match(sql, /hs_v3_metricas_segmentadas_pre_cursos_pedagogicos_v1\(/i);
});

test('produtor mensal e ciclo nao atravessa wrappers legados nem triplica conversao', () => {
  const sql = read(timeoutMigrationPath);

  assert.match(sql, /get_health_score_prof_v3_metricas_base_20260728_c95\(/i);
  assert.doesNotMatch(sql, /get_hs_prof_v3_metricas_periodo_base_20260803\(/i);
  assert.equal(
    (sql.match(/get_health_score_professor_v3_conversao_mensal\(/gi) || []).length,
    1,
  );
  assert.equal(
    (sql.match(/get_health_score_professor_v3_conversao_ciclo\(/gi) || []).length,
    1,
  );
});

test('contrato principal compacta listas segmentadas sem perder os totais canonicos', () => {
  assert.equal(
    fs.existsSync(payloadMigrationPath),
    true,
    'migration de compactacao do payload V3 ainda nao existe',
  );
  const sql = read(payloadMigrationPath);

  assert.match(sql, /-\s*'segmentos_resumo'/i);
  assert.match(sql, /-\s*'divergencias'/i);
  assert.match(sql, /-\s*'alertas_capacidade'/i);
  assert.match(sql, /'segmentos_capacidade_excedida'/i);
  assert.match(sql, /'dados_sem_resolucao'/i);
  assert.match(sql, /'estados_resolucao'/i);
  assert.match(sql, /'codigo_evidencia'/i);
});

test('contrato principal exclui identidades inativas e mescladas da equipe publicada', () => {
  assert.equal(
    fs.existsSync(activeRosterMigrationPath),
    true,
    'migration do roster ativo do Health Score V3 ainda nao existe',
  );
  const sql = read(activeRosterMigrationPath);

  assert.match(sql, /join\s+public\.professores\s+p[\s\S]*p\.ativo\s*=\s*true/i);
  assert.match(sql, /from\s+public\.professores_unidades\s+pu/i);
  assert.match(sql, /pu\.emusys_ativo\s*=\s*true/i);
  assert.match(sql, /coalesce\(pu\.validacao_status,\s*'validado'\)\s*<>\s*'ignorado'/i);
  assert.match(sql, /p_unidade_id\s+is\s+null\s+or\s+pu\.unidade_id\s*=\s*p_unidade_id/i);
});
