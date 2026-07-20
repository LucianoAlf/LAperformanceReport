import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260719203000_health_score_v3_metricas_segmentadas.sql';
const hardeningMigrationPath =
  'supabase/migrations/20260719203100_health_score_v3_metricas_segmentadas_hardening.sql';
const canonicalTotalMigrationPath =
  'supabase/migrations/20260719206000_health_score_v3_segmentos_preservar_total_canonico.sql';
const baselineMetricsPath =
  'supabase/migrations/20260719123500_health_score_v3_metricas_periodo_otimizada.sql';
const baselineClosePath =
  'supabase/migrations/20260719122000_health_score_v3_readmodels_cutover.sql';

function migration() {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  return readFileSync(migrationPath, 'utf8');
}

function hardeningMigration() {
  assert.equal(
    existsSync(hardeningMigrationPath),
    true,
    `${hardeningMigrationPath} deve existir`,
  );
  return readFileSync(hardeningMigrationPath, 'utf8');
}

function canonicalTotalMigration() {
  assert.equal(
    existsSync(canonicalTotalMigrationPath),
    true,
    `${canonicalTotalMigrationPath} deve existir`,
  );
  return readFileSync(canonicalTotalMigrationPath, 'utf8');
}

test('Gate 10 preserva a carteira canonica completa sem pontuar projetos', () => {
  const sql = canonicalTotalMigration();

  assert.match(sql, /get_carteira_professor_periodo_canonica\s*\(/i);
  assert.match(sql, /hs_v3_segmentos_detalhe_base_canonica/i);
  assert.match(sql, /pessoas_unicas_total/i);
  assert.match(sql, /projeto_sem_segmento_pontuavel/i);
  assert.match(sql, /revoke\s+all[\s\S]*hs_v3_segmentos_detalhe_base_canonica/i);
  assert.match(sql, /grant\s+execute[\s\S]*metricas_segmentadas_v1[\s\S]*service_role/i);
  assert.doesNotMatch(sql, /ativar_health_score_professor_v3_config/i);
});

function functionBlock(sql, name) {
  const start = sql.toLowerCase().indexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, `${name} deve existir`);
  const rest = sql.slice(start);
  const next = rest.slice(1).search(/\ncreate or replace function public\./i);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

function functionDefinition(sql, name) {
  const block = functionBlock(sql, name);
  const end = block.indexOf('\n$$;');
  assert.notEqual(end, -1, `fim de ${name} deve existir`);
  return block.slice(0, end + 4);
}

function viewBlock(sql, name) {
  const start = sql.toLowerCase().indexOf(`create or replace view public.${name}`);
  assert.notEqual(start, -1, `${name} deve existir`);
  const rest = sql.slice(start);
  const next = rest.slice(1).search(/\ncreate or replace function public\./i);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

function between(sql, startMarker, endMarker) {
  const start = sql.indexOf(startMarker);
  assert.notEqual(start, -1, `marcador ausente: ${startMarker}`);
  const end = sql.indexOf(endMarker, start);
  assert.notEqual(end, -1, `marcador ausente: ${endMarker}`);
  return sql.slice(start, end);
}

test('Task 5 cria RPC detalhada e agregadora no contrato segmentado auditavel', () => {
  const sql = migration();
  const detail = functionBlock(
    sql,
    'get_health_score_professor_v3_metricas_segmentadas_v1',
  );
  const aggregate = functionBlock(
    sql,
    'get_health_score_professor_v3_metricas_segmentadas_agregadas_v1',
  );

  for (const block of [detail, aggregate]) {
    assert.match(block, /p_competencia\s+date/i);
    assert.match(block, /p_config_id\s+uuid/i);
    assert.match(block, /p_unidade_id\s+uuid\s+default\s+null/i);
    assert.match(block, /p_periodicidade\s+text\s+default\s+'mensal'/i);
    assert.match(block, /security definer/i);
    assert.match(block, /set search_path\s*=\s*public,\s*pg_temp/i);
  }

  for (const field of [
    'curso_id',
    'modalidade',
    'pessoas_unicas',
    'pessoas_unicas_total',
    'vinculos_ativos',
    'turmas_elegiveis',
    'ocupacoes_unicas',
    'valor_observado',
    'capacidade_maxima',
    'meta_aplicada',
    'numerador',
    'denominador',
    'nota_segmento',
    'estado_base',
    'fonte',
    'atribuicao_id',
    'atribuicao_formal',
    'divergencias',
  ]) {
    assert.match(detail, new RegExp(`\\b${field}\\b`, 'i'), `detalhe sem ${field}`);
  }
});

test('detalhe deriva da base canonica unica e so pontua curso e modalidade oficiais', () => {
  const detail = functionBlock(
    migration(),
    'get_health_score_professor_v3_metricas_segmentadas_v1',
  );

  assert.match(detail, /get_carteira_professor_periodo_detalhe_canonico_v1/i);
  assert.match(detail, /professor_unidade_curso_modalidade/i);
  assert.match(detail, /health_score_professor_v3_config_metas_curso_modalidade/i);
  assert.match(detail, /curso_resolvido/i);
  assert.match(detail, /modalidade_resolvida/i);
  assert.match(detail, /confianca\s+in\s*\(\s*'alta'\s*,\s*'revisada'\s*\)/i);
  assert.match(detail, /is_projeto_banda/i);
  assert.match(detail, /not\s+coalesce\([^)]*is_projeto_banda[^)]*,\s*false\s*\)/i);
  assert.doesNotMatch(detail, /from\s+public\.alunos\b/i);
  assert.doesNotMatch(detail, /rateio|proporcional/i);
});

test('ciclo preserva componentes mensais antes de somar e usa arredondamento canonico', () => {
  const sql = migration();
  const detail = functionBlock(
    sql,
    'get_health_score_professor_v3_metricas_segmentadas_v1',
  );
  const aggregate = functionBlock(
    sql,
    'get_health_score_professor_v3_metricas_segmentadas_agregadas_v1',
  );

  assert.match(detail, /meses\s+as\s*\([\s\S]*?generate_series/i);
  assert.match(
    detail,
    /m\.competencia_mes[\s\S]*?get_carteira_professor_periodo_detalhe_canonico_v1\([\s\S]*?m\.competencia_mes[\s\S]*?m\.mes_fim/i,
  );
  assert.match(
    detail,
    /group\s+by[\s\S]*?competencia_mes[\s\S]*?turma_chave/i,
  );
  assert.match(detail, /fechamentos_com_vinculo/i);
  assert.match(
    detail,
    /fechamentos_com_vinculo::numeric\s*\*\s*l\.meta_carteira_curso/i,
  );
  assert.match(detail, /'competencia'\s*,\s*o\.competencia_mes/i);
  assert.match(detail, /ocupacoes_unicas::numeric[\s\S]*?turmas_elegiveis::numeric[\s\S]*?,\s*2\s*\)/i);
  assert.match(aggregate, /a\.ocupacoes_unicas::numeric[\s\S]*?a\.turmas_elegiveis[\s\S]*?,\s*2\s*\)/i);
  assert.doesNotMatch(aggregate, /a\.ocupacoes_unicas::numeric[\s\S]{0,180}?,\s*4\s*\)/i);
});

test('vigencia da atribuicao e resolvida em cada componente mensal do ciclo', () => {
  const detail = functionBlock(
    migration(),
    'get_health_score_professor_v3_metricas_segmentadas_v1',
  );

  assert.match(detail, /atribuicoes_mensais\s+as\s*\(/i);
  assert.match(
    detail,
    /m\.competencia_mes[\s\S]*?a\.vigencia_inicio\s*<=\s*m\.mes_fim[\s\S]*?coalesce\s*\(\s*a\.vigencia_fim\s*,\s*m\.mes_fim\s*\)\s*>=\s*m\.competencia_mes/i,
  );
  assert.match(
    detail,
    /order\s+by[\s\S]*?m\.competencia_mes[\s\S]*?a\.vigencia_inicio\s+desc[\s\S]*?a\.confianca\s+in/i,
  );
  assert.match(
    detail,
    /dados_resolvidos_mensais[\s\S]*?competencia_mes[\s\S]*?atribuicoes_mensais/i,
  );
  assert.doesNotMatch(
    detail,
    /atribuicoes\s+as\s*\([\s\S]*?cross\s+join\s+periodo\s+p/i,
  );
});

test('materializador serializa recortes global e unitario pela mesma chave', () => {
  const materializer = functionBlock(
    migration(),
    'materializar_health_score_professor_v3_periodo_impl',
  );
  const lock = materializer.match(
    /pg_advisory_xact_lock\s*\([\s\S]*?hashtextextended\s*\([\s\S]*?\)\s*\);/i,
  )?.[0];

  assert.ok(lock, 'materializador deve adquirir advisory lock transacional');
  assert.match(lock, /date_trunc\s*\(\s*'month'\s*,\s*p_competencia/i);
  assert.match(lock, /p_periodicidade/i);
  assert.doesNotMatch(lock, /p_unidade_id|v_scope\.unidade_id|coalesce/i);
});

test('203100 endurece schema intermediario e fresh com tipos, checks, FK e indices', () => {
  const sql = hardeningMigration();

  assert.match(
    sql,
    /alter\s+column\s+pessoas_unicas_total\s+type\s+numeric\s+using\s+pessoas_unicas_total::numeric/i,
  );
  assert.match(
    sql,
    /health_score_professor_v3_snapshot_metrica_diagnosticos[\s\S]*?alter\s+column\s+pessoas_unicas_total\s+type\s+numeric\s+using\s+pessoas_unicas_total::numeric/i,
  );
  assert.match(
    sql,
    /check\s*\(\s*not\s+coalesce\s*\(\s*atribuicao_pontuavel\s*,\s*false\s*\)\s+or\s+coalesce\s*\(\s*atribuicao_formal\s*,\s*false\s*\)\s*\)/i,
  );
  assert.match(
    sql,
    /check\s*\(\s*not\s+coalesce\s*\(\s*atribuicao_formal\s*,\s*false\s*\)\s+or\s+atribuicao_id\s+is\s+not\s+null\s*\)/i,
  );
  assert.match(
    sql,
    /create\s+unique\s+index[\s\S]*?professor_unidade_curso_modalidade\s*\(\s*id\s*,\s*unidade_id\s*,\s*curso_id\s*,\s*modalidade\s*\)/i,
  );
  assert.match(
    sql,
    /foreign\s+key\s*\(\s*atribuicao_id\s*,\s*unidade_id\s*,\s*curso_id\s*,\s*modalidade\s*\)[\s\S]*?professor_unidade_curso_modalidade\s*\(\s*id\s*,\s*unidade_id\s*,\s*curso_id\s*,\s*modalidade\s*\)/i,
  );
  assert.match(sql, /not\s+valid[\s\S]*?validate\s+constraint/i);
  assert.match(
    sql,
    /create\s+index[\s\S]*?health_score_professor_v3_snapshots\s*\([\s\S]*?competencia[\s\S]*?periodicidade[\s\S]*?revisao\s+desc/i,
  );
});

test('203100 preserva ACL privada e metadados de seguranca dos objetos internos', () => {
  const sql = hardeningMigration();

  for (const role of [
    'anon',
    'authenticated',
    'lia_acesso_restrito',
    'mila_acesso_restrito',
  ]) {
    assert.match(sql, new RegExp(`(?:from|role_name\\s*=)[\\s\\S]*?${role}`, 'i'));
  }
  assert.match(sql, /security_invoker\s*=\s*true/i);
  assert.match(sql, /set\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
});

test('203100 converge corpos funcionais para as definicoes finais da 203000', () => {
  const fresh = migration();
  const hardening = hardeningMigration();
  const functions = [
    'get_health_score_professor_v3_metricas_segmentadas_v1',
    'get_health_score_professor_v3_metricas_segmentadas_agregadas_v1',
    'get_health_score_professor_v3_metricas_periodo',
    'materializar_health_score_professor_v3_periodo_impl',
    'materializar_health_score_professor_v3_periodo',
  ];

  assert.match(hardening, /Convergencia funcional da Task 5/i);
  for (const name of functions) {
    assert.equal(
      functionDefinition(hardening, name),
      functionDefinition(fresh, name),
      `${name} deve convergir para o mesmo corpo da instalacao fresh`,
    );
  }
  assert.match(
    hardening,
    /drop\s+function\s+if\s+exists\s+public\.materializar_health_score_professor_v3_periodo[\s\S]*?drop\s+function\s+if\s+exists\s+public\.get_health_score_professor_v3_metricas_segmentadas_v1/i,
  );
});

test('fechamento usa a chave advisory comum antes de calcular revisao', () => {
  const hardening = hardeningMigration();
  const close = functionDefinition(
    hardening,
    'fechar_health_score_professor_v3_ciclo',
  );
  const baselineClose = functionDefinition(
    readFileSync(baselineClosePath, 'utf8'),
    'fechar_health_score_professor_v3_ciclo',
  );
  const lockPosition = close.search(/pg_advisory_xact_lock/i);
  const candidatePosition = close.search(/for\s+v_origem\s+in/i);
  const revisionPosition = close.search(/max\s*\(\s*s\.revisao\s*\)/i);
  const lock = close.match(
    /pg_advisory_xact_lock\s*\([\s\S]*?hashtextextended\s*\([\s\S]*?\)\s*\);/i,
  )?.[0];

  assert.ok(
    lockPosition >= 0
      && lockPosition < candidatePosition
      && candidatePosition < revisionPosition,
  );
  assert.ok(lock, 'fechamento deve adquirir advisory lock transacional');
  assert.match(lock, /health_score_v3_periodo:/i);
  assert.match(lock, /v_lock\.competencia/i);
  assert.match(lock, /v_lock\.periodicidade/i);
  assert.doesNotMatch(lock, /unidade_id|coalesce/i);
  assert.match(
    close,
    /select\s+distinct[\s\S]*?date_trunc\s*\(\s*'month'\s*,\s*s\.competencia\s*\)[\s\S]*?s\.ciclo_codigo\s*=\s*p_ciclo_codigo[\s\S]*?order\s+by\s+competencia/i,
  );
  assert.equal(
    close
      .replace(/\n  v_lock record;/, '')
      .replace(
        /\n\n  for v_lock in[\s\S]*?\n  end loop;(?=\n\n  for v_origem in)/,
        '',
      ),
    baselineClose,
    'fora o lock comum, o fechamento deve permanecer byte a byte',
  );
  assert.match(close, /security\s+definer/i);
  assert.match(close, /set\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
  assert.match(
    hardening,
    /revoke\s+all\s+on\s+function\s+public\.fechar_health_score_professor_v3_ciclo\(text,\s*text\)[\s\S]*?from\s+public,\s*anon,\s*authenticated/i,
  );
  assert.match(
    hardening,
    /grant\s+execute\s+on\s+function\s+public\.fechar_health_score_professor_v3_ciclo\(text,\s*text\)[\s\S]*?to\s+authenticated,\s*service_role/i,
  );
});

test('media turma preserva bruto e calcula nota pela soma de ocupacoes sobre meta de assentos', () => {
  const sql = migration();
  const detail = functionBlock(
    sql,
    'get_health_score_professor_v3_metricas_segmentadas_v1',
  );
  const aggregate = functionBlock(
    sql,
    'get_health_score_professor_v3_metricas_segmentadas_agregadas_v1',
  );

  assert.match(
    detail,
    /turmas_elegiveis[^;]+\*[^;]+meta_media_turma/is,
  );
  assert.match(aggregate, /sum\s*\(\s*u\.ocupacoes_unicas\s*\)/i);
  assert.match(aggregate, /sum\s*\(\s*u\.turmas_elegiveis\s*\)/i);
  assert.match(
    aggregate,
    /least\s*\(\s*100::numeric\s*,\s*100::numeric\s*\*\s*a\.numerador\s*\/\s*nullif\s*\(\s*a\.denominador/is,
  );
  assert.match(
    aggregate,
    /a\.ocupacoes_unicas::numeric\s*\/\s*nullif\s*\(\s*a\.turmas_elegiveis/i,
  );
  assert.match(aggregate, /'media_observada'/i);
  assert.match(aggregate, /'meta_assentos_pontuaveis'/i);
});

test('carteira pontua vinculos por curso sem duplicar a pessoa no total visual', () => {
  const sql = migration();
  const detail = functionBlock(
    sql,
    'get_health_score_professor_v3_metricas_segmentadas_v1',
  );
  const aggregate = functionBlock(
    sql,
    'get_health_score_professor_v3_metricas_segmentadas_agregadas_v1',
  );

  assert.match(detail, /count\s*\(\s*distinct\s+[^)]*pessoa_chave/i);
  assert.match(detail, /meta_carteira_curso/i);
  assert.match(
    aggregate,
    /'nome_exibicao'\s*,\s*case[\s\S]*?numero_alunos'[\s\S]*?'Carteira por curso'/i,
  );
  assert.match(aggregate, /'pessoas_unicas_total'/i);
  assert.match(aggregate, /'vinculos_curso_modalidade'/i);
  assert.match(aggregate, /sum\s*\(\s*u\.numerador\s*\)/i);
  assert.match(aggregate, /sum\s*\(\s*u\.denominador\s*\)/i);
  assert.match(
    aggregate,
    /100::numeric\s*\*\s*a\.numerador\s*\/\s*nullif\s*\(\s*a\.denominador/i,
  );
});

test('zero carteira fica visivel e fora da nota; primeiro vinculo torna o segmento pontuavel', () => {
  const detail = functionBlock(
    migration(),
    'get_health_score_professor_v3_metricas_segmentadas_v1',
  );

  assert.match(detail, /'sem_base_zero_carteira'/i);
  assert.match(
    detail,
    /when\s+[\s\S]*?vinculos_ativos\s*=\s*0[\s\S]*?then\s+'sem_base_zero_carteira'/i,
  );
  assert.match(
    detail,
    /vinculos_ativos\s*>\s*0[\s\S]*?meta_carteira_curso/i,
  );
  assert.match(detail, /else\s+null::numeric\s+end\s+as\s+numerador/i);
  assert.match(detail, /else\s+null::numeric\s+end\s+as\s+denominador/i);
  assert.doesNotMatch(detail, /coalesce\s*\(\s*nota_segmento\s*,\s*0/i);
});

test('regra ausente e divergencias bloqueiam sem meta global ou valor fabricado', () => {
  const sql = migration();
  const detail = functionBlock(
    sql,
    'get_health_score_professor_v3_metricas_segmentadas_v1',
  );
  const aggregate = functionBlock(
    sql,
    'get_health_score_professor_v3_metricas_segmentadas_agregadas_v1',
  );

  for (const state of [
    'regra_ausente',
    'segmentacao_incompleta',
    'divergencia_nao_ofertada',
    'sem_base_sem_turmas',
  ]) {
    assert.match(detail, new RegExp(`'${state}'`, 'i'));
  }
  assert.match(aggregate, /bool_or\s*\([^)]*estado_base\s*=\s*'regra_ausente'/i);
  assert.match(aggregate, /when\s+[^\n]*tem_bloqueio[^\n]*then\s+null::numeric/i);
  assert.doesNotMatch(sql, /meta_global|fallback_global|rateio|proporcional/i);
  assert.doesNotMatch(sql, /coalesce\s*\([^)]*nota[^)]*,\s*0(?:\.0+)?\s*\)/i);
});

test('capacidade excedida gera alerta sem limitar ocupacao, bruto ou nota', () => {
  const detail = functionBlock(
    migration(),
    'get_health_score_professor_v3_metricas_segmentadas_v1',
  );

  assert.match(detail, /capacidade_excedida/i);
  assert.match(detail, /alertas_capacidade/i);
  assert.match(detail, /ocupacoes_unicas\s*>\s*[^\n]*capacidade_maxima/i);
  assert.match(detail, /'turma_chave'/i);
  assert.doesNotMatch(detail, /least\s*\([^)]*ocupacoes_unicas[^)]*capacidade_maxima/i);
  assert.doesNotMatch(detail, /greatest\s*\([^)]*capacidade_maxima[^)]*ocupacoes_unicas/i);
});

test('motor usa nota segmentada, meta nula e persiste cada componente estruturado', () => {
  const sql = migration();
  const metricas = functionBlock(sql, 'get_health_score_professor_v3_metricas_periodo');
  const materializer = functionBlock(
    sql,
    'materializar_health_score_professor_v3_periodo_impl',
  );

  assert.match(metricas, /get_health_score_professor_v3_metricas_segmentadas_agregadas_v1/i);
  assert.doesNotMatch(metricas, /get_health_score_professor_v3_carteira_periodo/i);
  assert.match(materializer, /health_score_professor_v3_snapshot_metrica_segmentos/i);
  assert.match(materializer, /get_health_score_professor_v3_metricas_segmentadas_v1/i);
  assert.match(
    materializer,
    /when\s+cm\.metrica\s+in\s*\(\s*'media_turma'\s*,\s*'numero_alunos'\s*\)\s+then\s+null::numeric/i,
  );
  assert.match(materializer, /sa\.nota_segmentada_estruturada/i);
  assert.doesNotMatch(materializer, /detalhes\s*->>\s*'nota_segmentada'/i);
  assert.match(materializer, /sum\s*\(\s*m\.peso\s*\)\s*filter\s*\(\s*where\s+m\.nota\s+is\s+not\s+null\s*\)/i);
  assert.doesNotMatch(materializer, /coalesce\s*\(\s*m\.nota\s*,\s*0/i);
});

test('leitura parcial reutiliza nota segmentada armazenada e preserva formula dos demais pilares', () => {
  const view = viewBlock(
    migration(),
    'vw_health_score_professor_v3_parcial_observado',
  );

  assert.match(
    view,
    /when\s+m\.metrica\s+in\s*\(\s*'media_turma'\s*,\s*'numero_alunos'\s*\)\s+then\s+m\.nota/i,
  );
  assert.match(view, /m\.valor_bruto\s*\/\s*m\.meta_aplicada\s*\*\s*100/i);
  assert.match(view, /[bm]\.nota_parcial_observada\s+is\s+not\s+null/i);
});

test('RPCs internas ficam privadas e somente service_role recebe execute', () => {
  const sql = migration();

  for (const name of [
    'get_health_score_professor_v3_metricas_segmentadas_v1',
    'get_health_score_professor_v3_metricas_segmentadas_agregadas_v1',
  ]) {
    assert.match(
      sql,
      new RegExp(
        `revoke all on function\\s+public\\.${name}\\([\\s\\S]*?from public, anon, authenticated, service_role`,
        'i',
      ),
    );
    assert.match(
      sql,
      new RegExp(
        `grant execute on function\\s+public\\.${name}\\([\\s\\S]*?to service_role`,
        'i',
      ),
    );
  }
});

test('conversao, retencao, permanencia e presenca permanecem byte a byte', () => {
  const baseline = readFileSync(baselineMetricsPath, 'utf8');
  const current = migration();

  assert.equal(
    between(
      current,
      '-- CONVERSAO EXPERIMENTAL -> MATRICULA',
      '-- MEDIA/TURMA E NUMERO DE ALUNOS',
    ),
    between(
      baseline,
      '-- CONVERSAO EXPERIMENTAL -> MATRICULA',
      '-- MEDIA/TURMA E NUMERO DE ALUNOS',
    ),
  );
  assert.equal(
    between(current, '-- RETENCAO ATRIBUIVEL.', '\nend;\n$$;'),
    between(baseline, '-- RETENCAO ATRIBUIVEL.', '\nend;\n$$;'),
  );
});

test('materializador usa nota agregada estruturada e nao interpreta detalhes JSON', () => {
  const materializer = functionBlock(
    migration(),
    'materializar_health_score_professor_v3_periodo_impl',
  );

  assert.match(
    materializer,
    /health_score_v3_metricas_segmentadas_agregadas_execucao/i,
  );
  assert.match(materializer, /nota_segmentada_estruturada/i);
  assert.doesNotMatch(materializer, /detalhes\s*->>\s*'nota_segmentada'/i);
  assert.doesNotMatch(
    materializer,
    /'nota_segmentada'\s*,\s*case\s+when\s+cm\.metrica/i,
  );
  assert.match(
    materializer,
    /else\s+coalesce\s*\(\s*r\.detalhes[\s\S]*?'meta_versionada'\s*,\s*cm\.meta[\s\S]*?'normalizacao'\s*,\s*'meta_versionada'[\s\S]*?'valor_real_preservado'\s*,\s*true/i,
  );
});

test('snapshot segmentado persiste atribuicao, alertas e diagnostico nao resolvido em colunas', () => {
  const sql = migration();
  const materializer = functionBlock(
    sql,
    'materializar_health_score_professor_v3_periodo_impl',
  );

  for (const column of [
    'atribuicao_id',
    'atribuicao_formal',
    'atribuicao_pontuavel',
    'pessoas_unicas_total',
    'pessoas_fechamentos',
    'meses_com_base',
    'meses_com_base_consolidado',
    'meses_no_periodo',
    'capacidade_excedida',
    'alertas_capacidade',
    'divergencias',
  ]) {
    assert.match(
      sql,
      new RegExp(`add\\s+column\\s+if\\s+not\\s+exists\\s+${column}\\b`, 'i'),
      `trilha filha sem coluna ${column}`,
    );
  }

  assert.match(
    sql,
    /create\s+table\s+if\s+not\s+exists\s+public\.health_score_professor_v3_snapshot_metrica_diagnosticos/i,
  );
  assert.match(
    materializer,
    /insert\s+into\s+public\.health_score_professor_v3_snapshot_metrica_diagnosticos/i,
  );
  assert.match(
    materializer,
    /and\s+not\s+d\.linha_diagnostico[\s\S]*?and\s+d\.curso_id\s+is\s+not\s+null/i,
  );

  const diagnosticGrants = between(
    sql,
    'do $diagnostic_grants$',
    '$diagnostic_grants$;',
  );
  for (const role of [
    'fabio_agent',
    'lia_acesso_restrito',
    'mila_acesso_restrito',
    'sol_acesso_restrito',
  ]) {
    assert.match(diagnosticGrants, new RegExp(`'${role}'`, 'i'));
  }
});

test('materializador le detalhe canonico uma vez e deriva unidade e consolidado do cache', () => {
  const materializer = functionBlock(
    migration(),
    'materializar_health_score_professor_v3_periodo_impl',
  );
  const detailCalls = materializer.match(
    /from\s+public\.get_health_score_professor_v3_metricas_segmentadas_v1\s*\(/gi,
  ) || [];
  const detailInsert = materializer.search(
    /insert\s+into\s+health_score_v3_segmentos_periodo_execucao[\s\S]*?from\s+public\.get_health_score_professor_v3_metricas_segmentadas_v1/i,
  );
  const scopeLoop = materializer.search(/for\s+v_scope\s+in/i);

  assert.equal(detailCalls.length, 1, 'detalhe deve ser materializado uma unica vez');
  assert.ok(detailInsert >= 0 && detailInsert < scopeLoop);
  assert.match(
    materializer,
    /v_scope\.unidade_id\s+is\s+null\s+or\s+d\.unidade_id\s*=\s*v_scope\.unidade_id/i,
  );
});

test(
  'fixture PostgreSQL cobre segmentos, bloqueios e reproducao pai-filhos',
  { timeout: 120_000 },
  () => {
    const dockerVersion = spawnSync(
      'docker',
      ['version', '--format', '{{.Server.Version}}'],
      { encoding: 'utf8' },
    );
    assert.equal(
      dockerVersion.status,
      0,
      `Docker/PostgreSQL obrigatorio indisponivel:\n${dockerVersion.stderr}`,
    );

    const image = process.env.TASK5_POSTGRES_IMAGE || 'postgres:17-alpine';
    const imageInspection = spawnSync('docker', ['image', 'inspect', image], {
      encoding: 'utf8',
    });
    assert.equal(
      imageInspection.status,
      0,
      `imagem PostgreSQL obrigatoria ausente (${image}):\n${imageInspection.stderr}`,
    );

    const sql = migration();
    const hardeningSql = hardeningMigration();
    const structuredSchema = between(
      sql,
      '-- Evidencia estruturada aditiva dos segmentos.',
      '-- Fim da evidencia estruturada aditiva.',
    );
    const hardeningSchema = between(
      hardeningSql,
      '-- Hardening de schema da evidencia segmentada.',
      '-- Fim do hardening de schema da evidencia segmentada.',
    );
    const detailDefinition = functionDefinition(
      sql,
      'get_health_score_professor_v3_metricas_segmentadas_v1',
    );
    const aggregateDefinition = functionDefinition(
      sql,
      'get_health_score_professor_v3_metricas_segmentadas_agregadas_v1',
    );
    const materializerDefinition = functionDefinition(
      sql,
      'materializar_health_score_professor_v3_periodo_impl',
    );
    const intermediateMigrationResult = spawnSync(
      'git',
      [
        'show',
        `38c6f93:${migrationPath.replaceAll('\\', '/')}`,
      ],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
    );
    assert.equal(
      intermediateMigrationResult.status,
      0,
      `nao leu a migration intermediaria 38c6f93:\n${intermediateMigrationResult.stderr}`,
    );
    const intermediateMigration = intermediateMigrationResult.stdout;
    const intermediateDetailDefinition = functionDefinition(
      intermediateMigration,
      'get_health_score_professor_v3_metricas_segmentadas_v1',
    );
    const intermediateAggregateDefinition = functionDefinition(
      intermediateMigration,
      'get_health_score_professor_v3_metricas_segmentadas_agregadas_v1',
    );
    const intermediateEngineDefinition = functionDefinition(
      intermediateMigration,
      'get_health_score_professor_v3_metricas_periodo',
    );
    const intermediateMaterializerDefinition = functionDefinition(
      intermediateMigration,
      'materializar_health_score_professor_v3_periodo_impl',
    );
    const intermediateWrapperDefinition = functionDefinition(
      intermediateMigration,
      'materializar_health_score_professor_v3_periodo',
    );
    const intermediateCloseDefinition = functionDefinition(
      readFileSync(baselineClosePath, 'utf8'),
      'fechar_health_score_professor_v3_ciclo',
    );
    const containerName = `la-task5-postgres-${process.pid}-${Date.now()}`;
    const started = spawnSync(
      'docker',
      [
        'run',
        '--detach',
        '--rm',
        '--name',
        containerName,
        '--env',
        'POSTGRES_PASSWORD=task5',
        image,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(started.status, 0, `nao iniciou PostgreSQL:\n${started.stderr}`);

    try {
      let ready = false;
      let consecutiveReadyChecks = 0;
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const readiness = spawnSync(
          'docker',
          ['exec', containerName, 'pg_isready', '-U', 'postgres', '-d', 'postgres'],
          { encoding: 'utf8' },
        );
        if (readiness.status === 0) {
          consecutiveReadyChecks += 1;
          if (consecutiveReadyChecks >= 3) {
            ready = true;
            break;
          }
        } else {
          consecutiveReadyChecks = 0;
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
      }
      assert.equal(ready, true, 'PostgreSQL da fixture nao ficou pronto');

      const fixtureSql = String.raw`
        \set ON_ERROR_STOP on

        create extension if not exists pgcrypto;
        create extension if not exists dblink;
        create role anon;
        create role authenticated;
        create role service_role;
        create role lia_acesso_restrito;
        create role mila_acesso_restrito;
        create schema auth;
        create function auth.role() returns text
        language sql stable as $$ select 'service_role'::text $$;

        create table public.professores (
          id integer primary key,
          nome text not null
        );
        create table public.unidades (
          id uuid primary key,
          ativo boolean not null default true
        );
        create table public.cursos (
          id integer primary key,
          nome text not null,
          is_projeto_banda boolean not null default false
        );
        create table public.professor_unidade_curso_modalidade (
          id uuid primary key,
          professor_id integer not null,
          unidade_id uuid not null,
          curso_id integer not null,
          modalidade text not null,
          status text not null,
          fonte text not null,
          confianca text not null,
          vigencia_inicio date not null,
          vigencia_fim date,
          evidencias jsonb not null default '{}'::jsonb
        );
        create table public.health_score_professor_v3_config_versoes (
          id uuid primary key default gen_random_uuid(),
          versao integer not null,
          status text not null,
          vigencia_inicio date not null,
          vigencia_fim date,
          cobertura_minima numeric not null default 0,
          faixa_atencao_min numeric not null default 50,
          faixa_saudavel_min numeric not null default 70,
          exige_pilar_fidelizacao boolean not null default false
        );
        create table public.health_score_professor_v3_config_metricas (
          id uuid primary key default gen_random_uuid(),
          config_id uuid not null,
          metrica text not null,
          peso numeric not null,
          meta numeric
        );
        create table public.health_score_professor_v3_config_metas_curso_modalidade (
          id uuid primary key default gen_random_uuid(),
          config_id uuid not null,
          unidade_id uuid not null,
          curso_id integer not null,
          modalidade text not null,
          estado text not null,
          capacidade_maxima numeric,
          meta_media_turma numeric,
          meta_carteira_curso numeric
        );
        create table public.health_score_professor_v3_snapshots (
          id uuid primary key default gen_random_uuid(),
          professor_id integer not null,
          escopo text not null,
          unidade_id uuid,
          competencia date not null,
          trimestre_inicio date,
          revisao integer not null,
          estado text not null,
          config_id uuid not null,
          config_versao integer not null,
          periodicidade text not null,
          periodo_inicio date not null,
          periodo_fim date not null,
          ciclo_codigo text,
          estado_publicacao text,
          score_exibivel boolean,
          ranking_habilitado boolean,
          regra_versao text,
          score numeric,
          cobertura numeric,
          classificacao text,
          publicavel boolean,
          publicado boolean,
          motivo_bloqueio text,
          snapshot_anterior_id uuid,
          justificativa_retificacao text,
          criado_por integer,
          fechado_em timestamptz
        );
        create table public.health_score_professor_v3_ciclos (
          id uuid primary key default gen_random_uuid(),
          codigo text not null unique,
          data_fim date not null,
          estado text not null default 'aberto',
          publicacao_oficial boolean not null default false,
          ranking_habilitado boolean not null default false,
          fechado_em timestamptz,
          fechado_por integer,
          justificativa_fechamento text
        );
        create table public.health_score_professor_v3_snapshot_metricas (
          id uuid primary key default gen_random_uuid(),
          snapshot_id uuid not null,
          metrica text not null,
          valor_bruto numeric,
          numerador numeric,
          denominador numeric,
          amostra integer,
          estado_base text not null,
          publicavel boolean not null,
          confianca text not null,
          fonte text not null,
          regra_versao text not null,
          motivo_sem_base text,
          detalhes jsonb not null default '{}'::jsonb,
          nota numeric,
          peso numeric not null,
          peso_disponivel boolean not null,
          contribuicao numeric,
          meta_aplicada numeric
        );
        create table public.health_score_professor_v3_snapshot_metrica_segmentos (
          id uuid primary key default gen_random_uuid(),
          snapshot_metrica_id uuid not null,
          config_meta_segmento_id uuid,
          unidade_id uuid not null,
          curso_id integer not null,
          modalidade text not null,
          pessoas_unicas integer not null default 0,
          vinculos_ativos integer not null default 0,
          turmas_elegiveis integer not null default 0,
          ocupacoes_unicas integer not null default 0,
          capacidade_maxima numeric,
          meta_aplicada numeric,
          numerador numeric,
          denominador numeric,
          nota numeric,
          estado_base text not null,
          fonte text not null,
          regra_versao text not null,
          detalhes jsonb not null default '{}'::jsonb
        );

        create function public.fn_health_score_professor_v3_bloquear_snapshot_segmento_fechado()
        returns trigger language plpgsql as $$
        begin
          if tg_op = 'DELETE' then return old; end if;
          return new;
        end;
        $$;
        create function public.fn_health_score_professor_v3_ator_gerenciador()
        returns integer language sql stable as $$ select null::integer $$;

        ${structuredSchema}

        create table public.fixture_carteira_canonica (
          professor_id integer not null,
          unidade_id uuid not null,
          pessoa_chave text,
          curso_id integer,
          modalidade text,
          turma_chave text,
          elegivel_media boolean not null,
          fonte text not null,
          curso_resolvido boolean not null,
          modalidade_resolvida boolean not null,
          estado_resolucao text not null,
          ocupacao_chave text,
          carteira_total_auditado integer,
          carteira_total_detalhado integer not null,
          segmentacao_incompleta boolean not null,
          competencia date not null
        );
        create sequence public.fixture_canonical_calls;

        create function public.fn_health_score_v3_periodo(date, text)
        returns table (
          periodo_inicio date,
          periodo_fim date,
          ciclo_codigo text,
          periodo_label text
        ) language sql stable as $$
          select
            case
              when $2 = 'ciclo' then (date_trunc('month', $1) - interval '1 month')::date
              else date_trunc('month', $1)::date
            end,
            case
              when $2 = 'ciclo' then (date_trunc('month', $1) + interval '2 month - 1 day')::date
              else (date_trunc('month', $1) + interval '1 month - 1 day')::date
            end,
            to_char($1, 'YYYY-MM'),
            to_char($1, 'YYYY-MM')
        $$;
        create function public.fn_health_score_v3_unidades_permitidas_sombra(uuid)
        returns table (unidade_id uuid)
        language sql stable as $$
          select u.id from public.unidades u where u.ativo and ($1 is null or u.id = $1)
        $$;
        create function public.get_carteira_professor_periodo_detalhe_canonico_v1(
          integer, integer, uuid default null, date default null, date default null
        )
        returns table (
          professor_id integer,
          unidade_id uuid,
          pessoa_chave text,
          curso_id integer,
          modalidade text,
          turma_chave text,
          elegivel_media boolean,
          fonte text,
          curso_resolvido boolean,
          modalidade_resolvida boolean,
          estado_resolucao text,
          ocupacao_chave text,
          carteira_total_auditado integer,
          carteira_total_detalhado integer,
          segmentacao_incompleta boolean
        ) language plpgsql volatile as $$
        begin
          perform nextval('public.fixture_canonical_calls');
          return query
          select
            f.professor_id,
            f.unidade_id,
            f.pessoa_chave,
            f.curso_id,
            f.modalidade,
            f.turma_chave,
            f.elegivel_media,
            f.fonte,
            f.curso_resolvido,
            f.modalidade_resolvida,
            f.estado_resolucao,
            f.ocupacao_chave,
            f.carteira_total_auditado,
            f.carteira_total_detalhado,
            f.segmentacao_incompleta
          from public.fixture_carteira_canonica f
          where ($3 is null or f.unidade_id = $3)
            and f.competencia between coalesce($4, make_date($1, $2, 1))
              and coalesce($5, (make_date($1, $2, 1) + interval '1 month - 1 day')::date);
        end;
        $$;

        ${detailDefinition}
        ${aggregateDefinition}

        create function public.get_health_score_professor_v3_metricas_periodo(
          p_competencia date,
          p_unidade_id uuid default null,
          p_periodicidade text default 'mensal'
        ) returns table (
          metrica text,
          professor_id integer,
          professor_nome text,
          unidade_id uuid,
          competencia date,
          valor_bruto numeric,
          numerador numeric,
          denominador numeric,
          amostra integer,
          estado_base text,
          publicavel boolean,
          confianca text,
          fonte text,
          regra_versao text,
          motivo_sem_base text,
          detalhes jsonb
        ) language sql stable as $$
          with alvos as (
            select a.professor_id
            from public.professor_unidade_curso_modalidade a
            where p_unidade_id is null or a.unidade_id = p_unidade_id
            union
            select f.professor_id
            from public.fixture_carteira_canonica f
            where p_unidade_id is null or f.unidade_id = p_unidade_id
          )
          select
            'retencao'::text,
            p.id,
            p.nome,
            p_unidade_id,
            date_trunc('month', p_competencia)::date,
            80::numeric,
            80::numeric,
            100::numeric,
            1,
            'ok'::text,
            true,
            'alta'::text,
            'fixture_pilar_legado'::text,
            'fixture-retencao-1'::text,
            null::text,
            '{}'::jsonb
          from alvos a
          join public.professores p on p.id = a.professor_id
        $$;

        ${materializerDefinition}

        create function public.materializar_health_score_professor_v3_periodo(
          p_competencia date,
          p_periodicidade text default 'mensal',
          p_unidade_id uuid default null,
          p_professor_id integer default null
        ) returns jsonb
        language sql
        security definer
        set search_path = public, pg_temp
        as $$
          select public.materializar_health_score_professor_v3_periodo_impl(
            p_competencia,
            p_periodicidade,
            p_unidade_id,
            p_professor_id
          )
        $$;

        create view public.vw_health_score_professor_v3_parcial_observado
        with (security_invoker = false)
        as select 1::integer as fixture;

        ${hardeningSql}

        create table public.fixture_function_defs_fresh (
          assinatura text primary key,
          definicao text not null,
          definicao_hash text not null
        );
        insert into public.fixture_function_defs_fresh
        select
          f.assinatura,
          pg_get_functiondef(f.assinatura::regprocedure::oid),
          md5(pg_get_functiondef(f.assinatura::regprocedure::oid))
        from unnest(array[
          'public.get_health_score_professor_v3_metricas_segmentadas_v1(date,uuid,uuid,text)',
          'public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(date,uuid,uuid,text)',
          'public.get_health_score_professor_v3_metricas_periodo(date,uuid,text)',
          'public.materializar_health_score_professor_v3_periodo_impl(date,text,uuid,integer)',
          'public.materializar_health_score_professor_v3_periodo(date,text,uuid,integer)',
          'public.fechar_health_score_professor_v3_ciclo(text,text)'
        ]) f(assinatura);

        create or replace function public.get_health_score_professor_v3_metricas_periodo(
          p_competencia date,
          p_unidade_id uuid default null,
          p_periodicidade text default 'mensal'
        ) returns table (
          metrica text,
          professor_id integer,
          professor_nome text,
          unidade_id uuid,
          competencia date,
          valor_bruto numeric,
          numerador numeric,
          denominador numeric,
          amostra integer,
          estado_base text,
          publicavel boolean,
          confianca text,
          fonte text,
          regra_versao text,
          motivo_sem_base text,
          detalhes jsonb
        ) language sql stable as $$
          with alvos as (
            select a.professor_id
            from public.professor_unidade_curso_modalidade a
            where p_unidade_id is null or a.unidade_id = p_unidade_id
            union
            select f.professor_id
            from public.fixture_carteira_canonica f
            where p_unidade_id is null or f.unidade_id = p_unidade_id
          )
          select
            'retencao'::text,
            p.id,
            p.nome,
            p_unidade_id,
            date_trunc('month', p_competencia)::date,
            80::numeric,
            80::numeric,
            100::numeric,
            1,
            'ok'::text,
            true,
            'alta'::text,
            'fixture_pilar_legado'::text,
            'fixture-retencao-1'::text,
            null::text,
            '{}'::jsonb
          from alvos a
          join public.professores p on p.id = a.professor_id
        $$;

        do $security_fixture$
        declare
          v_search_path text[];
          v_reloptions text[];
        begin
          if has_table_privilege(
            'anon',
            'public.health_score_professor_v3_snapshot_metrica_segmentos',
            'select'
          ) or has_table_privilege(
            'authenticated',
            'public.health_score_professor_v3_snapshot_metrica_diagnosticos',
            'select'
          ) or has_table_privilege(
            'lia_acesso_restrito',
            'public.health_score_professor_v3_snapshot_metrica_segmentos',
            'select'
          ) or has_table_privilege(
            'mila_acesso_restrito',
            'public.health_score_professor_v3_snapshot_metrica_diagnosticos',
            'select'
          ) then
            raise exception 'ACL de tabelas segmentadas permaneceu aberta';
          end if;

          if not has_table_privilege(
            'service_role',
            'public.health_score_professor_v3_snapshot_metrica_segmentos',
            'select'
          ) or has_function_privilege(
            'anon',
            'public.get_health_score_professor_v3_metricas_segmentadas_v1(date,uuid,uuid,text)',
            'execute'
          ) or not has_function_privilege(
            'service_role',
            'public.get_health_score_professor_v3_metricas_segmentadas_v1(date,uuid,uuid,text)',
            'execute'
          ) then
            raise exception 'ACL de RPCs segmentadas divergente';
          end if;

          select c.reloptions into v_reloptions
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and c.relname = 'vw_health_score_professor_v3_parcial_observado';
          if not coalesce(v_reloptions @> array['security_invoker=true'], false) then
            raise exception 'view sem security_invoker=true: %', v_reloptions;
          end if;

          select p.proconfig into v_search_path
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname = 'get_health_score_professor_v3_metricas_segmentadas_v1';
          if not coalesce(
            v_search_path @> array['search_path=public, pg_temp'],
            false
          ) then
            raise exception 'RPC detalhada sem search_path fixo: %', v_search_path;
          end if;
        end;
        $security_fixture$;

        insert into public.unidades (id) values
          ('11111111-1111-1111-1111-111111111111'),
          ('22222222-2222-2222-2222-222222222222');
        insert into public.cursos (id, nome) values
          (10, 'Guitarra'),
          (20, 'Piano'),
          (30, 'Bateria'),
          (40, 'Violao'),
          (50, 'Canto'),
          (60, 'Temporal revisada'),
          (70, 'Temporal julho');
        insert into public.professores (id, nome) values
          (101, 'Dois cursos'),
          (202, 'Zero carteira'),
          (303, 'Regra ausente'),
          (404, 'Nao ofertada'),
          (505, 'Nao resolvido'),
          (606, 'Troca de atribuicao'),
          (707, 'Atribuicao somente julho');

        insert into public.health_score_professor_v3_config_versoes (
          id, versao, status, vigencia_inicio
        ) values (
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 'ativa', date '2026-01-01'
        );
        insert into public.health_score_professor_v3_config_metricas (
          config_id, metrica, peso, meta
        ) values
          ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'retencao', 17, 100),
          ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'permanencia', 17, 100),
          ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'conversao', 17, 100),
          ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'media_turma', 17, null),
          ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'numero_alunos', 16, null),
          ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'presenca', 16, 100);
        insert into public.health_score_professor_v3_config_metas_curso_modalidade (
          config_id, unidade_id, curso_id, modalidade, estado,
          capacidade_maxima, meta_media_turma, meta_carteira_curso
        ) values
          ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 10, 'turma', 'configurada', 2, 1, 2),
          ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 20, 'individual', 'configurada', 1, 1, 2),
          ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 30, 'turma', 'configurada', 3, 2, 2),
          ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 50, 'turma', 'nao_ofertada', null, null, null),
          ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 60, 'turma', 'configurada', 4, 2, 2),
          ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 70, 'turma', 'configurada', 4, 2, 2),
          ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 10, 'turma', 'configurada', 1, 1, 2);

        insert into public.professor_unidade_curso_modalidade (
          id, professor_id, unidade_id, curso_id, modalidade, status,
          fonte, confianca, vigencia_inicio
        ) values
          ('00000000-0000-0000-0000-000000000001', 101, '11111111-1111-1111-1111-111111111111', 10, 'turma', 'ativo', 'fixture', 'alta', date '2026-01-01'),
          ('00000000-0000-0000-0000-000000000002', 101, '11111111-1111-1111-1111-111111111111', 20, 'individual', 'ativo', 'fixture', 'alta', date '2026-01-01'),
          ('00000000-0000-0000-0000-000000000003', 101, '22222222-2222-2222-2222-222222222222', 10, 'turma', 'ativo', 'fixture', 'alta', date '2026-01-01'),
          ('00000000-0000-0000-0000-000000000004', 202, '11111111-1111-1111-1111-111111111111', 30, 'turma', 'ativo', 'fixture', 'alta', date '2026-01-01'),
          ('00000000-0000-0000-0000-000000000005', 303, '11111111-1111-1111-1111-111111111111', 40, 'turma', 'ativo', 'fixture', 'alta', date '2026-01-01'),
          ('00000000-0000-0000-0000-000000000006', 404, '11111111-1111-1111-1111-111111111111', 50, 'turma', 'ativo', 'fixture', 'alta', date '2026-01-01'),
          ('00000000-0000-0000-0000-000000000008', 606, '11111111-1111-1111-1111-111111111111', 60, 'turma', 'ativo', 'fixture', 'media', date '2026-07-01'),
          ('00000000-0000-0000-0000-000000000009', 707, '11111111-1111-1111-1111-111111111111', 70, 'turma', 'ativo', 'fixture', 'alta', date '2026-07-01');

        insert into public.professor_unidade_curso_modalidade (
          id, professor_id, unidade_id, curso_id, modalidade, status,
          fonte, confianca, vigencia_inicio, vigencia_fim
        ) values (
          '00000000-0000-0000-0000-000000000007',
          606,
          '11111111-1111-1111-1111-111111111111',
          60,
          'turma',
          'encerrado',
          'fixture',
          'alta',
          date '2026-01-01',
          date '2026-06-30'
        );

        insert into public.fixture_carteira_canonica values
          (101, '11111111-1111-1111-1111-111111111111', 'u1:pessoa-a', 10, 'turma', 'u1:t10', true, 'evento', true, true, 'resolvido', 'u1:t10', 1, 1, false, date '2026-06-10'),
          (101, '11111111-1111-1111-1111-111111111111', 'u1:pessoa-a', 10, 'turma', 'u1:t10', true, 'evento', true, true, 'resolvido', 'u1:t10', 1, 1, false, date '2026-07-10'),
          (101, '11111111-1111-1111-1111-111111111111', 'u1:pessoa-a', 20, 'individual', 'u1:i20', true, 'evento', true, true, 'resolvido', 'u1:i20', 1, 1, false, date '2026-07-10'),
          (101, '22222222-2222-2222-2222-222222222222', 'u2:pessoa-b', 10, 'turma', 'u2:t10', true, 'evento', true, true, 'resolvido', 'u2:t10', 2, 2, false, date '2026-07-10'),
          (101, '22222222-2222-2222-2222-222222222222', 'u2:pessoa-c', 10, 'turma', 'u2:t10', true, 'evento', true, true, 'resolvido', 'u2:t10', 2, 2, false, date '2026-07-10'),
          (303, '11111111-1111-1111-1111-111111111111', 'u1:pessoa-d', 40, 'turma', 'u1:t40', true, 'evento', true, true, 'resolvido', 'u1:t40', 1, 1, false, date '2026-07-10'),
          (404, '11111111-1111-1111-1111-111111111111', 'u1:pessoa-e', 50, 'turma', 'u1:t50', true, 'evento', true, true, 'resolvido', 'u1:t50', 1, 1, false, date '2026-07-10'),
          (505, '11111111-1111-1111-1111-111111111111', 'u1:pessoa-f', null, null, null, false, 'evento', false, false, 'curso_nao_resolvido', null, 1, 1, true, date '2026-07-10'),
          (606, '11111111-1111-1111-1111-111111111111', 'u1:pessoa-g', 60, 'turma', 'u1:t60', true, 'evento', true, true, 'resolvido', 'u1:t60', 1, 1, false, date '2026-06-10'),
          (606, '11111111-1111-1111-1111-111111111111', 'u1:pessoa-g', 60, 'turma', 'u1:t60', true, 'evento', true, true, 'resolvido', 'u1:t60', 1, 1, false, date '2026-07-10'),
          (707, '11111111-1111-1111-1111-111111111111', 'u1:pessoa-h', 70, 'turma', 'u1:t70', true, 'evento', true, true, 'resolvido', 'u1:t70', 1, 1, false, date '2026-06-10'),
          (707, '11111111-1111-1111-1111-111111111111', 'u1:pessoa-h', 70, 'turma', 'u1:t70', true, 'evento', true, true, 'resolvido', 'u1:t70', 1, 1, false, date '2026-07-10');

        do $fixture$
        declare
          v_valor numeric;
          v_numerador numeric;
          v_denominador numeric;
          v_nota numeric;
          v_estado text;
          v_count integer;
          v_media_valor numeric;
          v_media_numerador numeric;
          v_media_denominador numeric;
          v_alertas integer;
          v_calls bigint;
          v_called boolean;
          v_atribuicao_id uuid;
          v_atribuicao_formal boolean;
          v_atribuicao_pontuavel boolean;
        begin
          select max(d.pessoas_unicas_total), sum(d.vinculos_ativos)
            into v_valor, v_numerador
          from public.get_health_score_professor_v3_metricas_segmentadas_v1(
            date '2026-07-01',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '11111111-1111-1111-1111-111111111111',
            'mensal'
          ) d
          where d.professor_id = 101 and d.metrica = 'numero_alunos';
          if v_valor <> 1 or v_numerador <> 2 then
            raise exception 'dois cursos nao preservaram 1 pessoa e 2 vinculos: %, %', v_valor, v_numerador;
          end if;

          select a.valor_bruto, a.numerador, a.denominador, a.nota
            into v_valor, v_numerador, v_denominador, v_nota
          from public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
            date '2026-07-01',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            null,
            'mensal'
          ) a
          where a.professor_id = 101 and a.metrica = 'numero_alunos';
          if row(v_valor, v_numerador, v_denominador, v_nota)
             is distinct from row(3::numeric, 4::numeric, 6::numeric, 66.67::numeric) then
            raise exception 'carteira multiunidade divergente: %, %, %, %', v_valor, v_numerador, v_denominador, v_nota;
          end if;

          select a.valor_bruto, a.numerador, a.denominador, a.nota
            into v_valor, v_numerador, v_denominador, v_nota
          from public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
            date '2026-07-01',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            null,
            'mensal'
          ) a
          where a.professor_id = 101 and a.metrica = 'media_turma';
          if row(v_valor, v_numerador, v_denominador, v_nota)
             is distinct from row(1.33::numeric, 4::numeric, 3::numeric, 100::numeric) then
            raise exception 'media multiunidade divergente: %, %, %, %', v_valor, v_numerador, v_denominador, v_nota;
          end if;

          select
            d.estado_base,
            d.numerador,
            d.atribuicao_id,
            d.atribuicao_formal,
            d.atribuicao_pontuavel
            into
              v_estado,
              v_numerador,
              v_atribuicao_id,
              v_atribuicao_formal,
              v_atribuicao_pontuavel
          from public.get_health_score_professor_v3_metricas_segmentadas_v1(
            date '2026-07-01',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '11111111-1111-1111-1111-111111111111',
            'ciclo'
          ) d
          where d.professor_id = 606
            and d.metrica = 'numero_alunos'
            and d.curso_id = 60;
          if row(
            v_estado,
            v_numerador,
            v_atribuicao_id,
            v_atribuicao_formal,
            v_atribuicao_pontuavel
          ) is distinct from row(
            'segmentacao_incompleta'::text,
            null::numeric,
            '00000000-0000-0000-0000-000000000008'::uuid,
            true,
            false
          ) then
            raise exception 'atribuicao posterior nao prevaleceu por componente: %, %, %, %, %', v_estado, v_numerador, v_atribuicao_id, v_atribuicao_formal, v_atribuicao_pontuavel;
          end if;

          select
            d.estado_base,
            d.numerador,
            d.atribuicao_id,
            d.atribuicao_formal
            into
              v_estado,
              v_numerador,
              v_atribuicao_id,
              v_atribuicao_formal
          from public.get_health_score_professor_v3_metricas_segmentadas_v1(
            date '2026-07-01',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '11111111-1111-1111-1111-111111111111',
            'ciclo'
          ) d
          where d.professor_id = 707
            and d.metrica = 'numero_alunos'
            and d.curso_id = 70;
          if row(v_estado, v_numerador, v_atribuicao_id, v_atribuicao_formal)
             is distinct from row(
               'segmentacao_incompleta'::text,
               null::numeric,
               '00000000-0000-0000-0000-000000000009'::uuid,
               false
             ) then
            raise exception 'atribuicao de julho pontuou junho: %, %, %, %', v_estado, v_numerador, v_atribuicao_id, v_atribuicao_formal;
          end if;

          perform setval('public.fixture_canonical_calls', 1, false);
          select
            max(a.valor_bruto) filter (where a.metrica = 'numero_alunos'),
            max(a.numerador) filter (where a.metrica = 'numero_alunos'),
            max(a.denominador) filter (where a.metrica = 'numero_alunos'),
            max(a.nota) filter (where a.metrica = 'numero_alunos'),
            max(a.valor_bruto) filter (where a.metrica = 'media_turma'),
            max(a.numerador) filter (where a.metrica = 'media_turma'),
            max(a.denominador) filter (where a.metrica = 'media_turma'),
            max((a.detalhes->>'segmentos_capacidade_excedida')::integer)
              filter (where a.metrica = 'media_turma')
            into
              v_valor,
              v_numerador,
              v_denominador,
              v_nota,
              v_media_valor,
              v_media_numerador,
              v_media_denominador,
              v_alertas
          from public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
            date '2026-07-01',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            null,
            'ciclo'
          ) a
          where a.professor_id = 101;
          if row(v_valor, v_numerador, v_denominador, v_nota)
             is distinct from row(2::numeric, 5::numeric, 8::numeric, 62.50::numeric) then
            raise exception 'carteira ciclo colapsou fechamento mensal: %, %, %, %', v_valor, v_numerador, v_denominador, v_nota;
          end if;
          if row(v_media_valor, v_media_numerador, v_media_denominador, v_alertas)
             is distinct from row(1.25::numeric, 5::numeric, 4::numeric, 1) then
            raise exception 'media ciclo inflou ou colapsou componentes: %, %, %, %', v_media_valor, v_media_numerador, v_media_denominador, v_alertas;
          end if;
          select last_value, is_called into v_calls, v_called
          from public.fixture_canonical_calls;
          if not v_called or v_calls <> 2 then
            raise exception 'ciclo deveria ler dois recortes mensais, leu %', v_calls;
          end if;

          select a.valor_bruto, a.estado_base, a.nota
            into v_valor, v_estado, v_nota
          from public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
            date '2026-07-01',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            null,
            'ciclo'
          ) a
          where a.professor_id = 303 and a.metrica = 'numero_alunos';
          if v_valor <> 1 or v_estado <> 'regra_ausente' or v_nota is not null then
            raise exception 'ciclo alterou fechamento unico disponivel: %, %, %', v_valor, v_estado, v_nota;
          end if;

          select a.estado_base, a.nota
            into v_estado, v_nota
          from public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
            date '2026-07-01',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '11111111-1111-1111-1111-111111111111',
            'mensal'
          ) a
          where a.professor_id = 202 and a.metrica = 'numero_alunos';
          if v_estado <> 'sem_base_zero_carteira' or v_nota is not null then
            raise exception 'estado inicial zero carteira invalido: %, %', v_estado, v_nota;
          end if;

          insert into public.fixture_carteira_canonica values (
            202,
            '11111111-1111-1111-1111-111111111111',
            'u1:pessoa-primeiro-vinculo',
            30,
            'turma',
            'u1:t30',
            true,
            'evento',
            true,
            true,
            'resolvido',
            'u1:t30',
            1,
            1,
            false,
            date '2026-07-10'
          );
          select a.estado_base, a.numerador, a.denominador, a.nota
            into v_estado, v_numerador, v_denominador, v_nota
          from public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
            date '2026-07-01',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '11111111-1111-1111-1111-111111111111',
            'mensal'
          ) a
          where a.professor_id = 202 and a.metrica = 'numero_alunos';
          if row(v_estado, v_numerador, v_denominador, v_nota)
             is distinct from row('ok'::text, 1::numeric, 2::numeric, 50::numeric) then
            raise exception 'primeiro vinculo nao tornou segmento pontuavel: %, %, %, %', v_estado, v_numerador, v_denominador, v_nota;
          end if;
          delete from public.fixture_carteira_canonica
          where pessoa_chave = 'u1:pessoa-primeiro-vinculo';

          perform setval('public.fixture_canonical_calls', 1, false);
          perform public.materializar_health_score_professor_v3_periodo_impl(
            date '2026-07-01', 'mensal', null, null
          );
          select last_value, is_called into v_calls, v_called
          from public.fixture_canonical_calls;
          if not v_called or v_calls <> 1 then
            raise exception 'detalhe canonico lido % vezes no materializador', v_calls;
          end if;

          select count(*) into v_count
          from public.health_score_professor_v3_snapshots;
          if v_count <> 15 then
            raise exception 'esperados 15 snapshots, obtidos %', v_count;
          end if;

          select s.score, s.cobertura
            into v_valor, v_numerador
          from public.health_score_professor_v3_snapshots s
          where s.professor_id = 202 and s.unidade_id is null;
          if row(v_valor, v_numerador)
             is distinct from row(80::numeric, 17::numeric) then
            raise exception 'peso sem base nao foi redistribuido: score %, cobertura %', v_valor, v_numerador;
          end if;

          select sm.nota, sm.contribuicao, sm.peso_disponivel
            into v_nota, v_valor, v_called
          from public.health_score_professor_v3_snapshots s
          join public.health_score_professor_v3_snapshot_metricas sm
            on sm.snapshot_id = s.id
          where s.professor_id = 202
            and s.unidade_id is null
            and sm.metrica = 'numero_alunos';
          if v_nota is not null or v_valor is not null or v_called then
            raise exception 'zero carteira fabricou nota ou contribuicao: %, %, %', v_nota, v_valor, v_called;
          end if;

          select sm.valor_bruto, sm.numerador, sm.denominador, sm.nota
            into v_valor, v_numerador, v_denominador, v_nota
          from public.health_score_professor_v3_snapshots s
          join public.health_score_professor_v3_snapshot_metricas sm
            on sm.snapshot_id = s.id
          where s.professor_id = 101
            and s.unidade_id is null
            and sm.metrica = 'numero_alunos';
          if row(v_valor, v_numerador, v_denominador, v_nota)
             is distinct from row(3::numeric, 4::numeric, 6::numeric, 66.67::numeric) then
            raise exception 'pai carteira nao preservado: %, %, %, %', v_valor, v_numerador, v_denominador, v_nota;
          end if;

          select sum(x.pessoas), sum(x.numerador), sum(x.denominador)
            into v_valor, v_numerador, v_denominador
          from (
            select
              c.unidade_id,
              max(c.pessoas_unicas_total)::numeric as pessoas,
              sum(c.numerador)::numeric as numerador,
              sum(c.denominador)::numeric as denominador
            from public.health_score_professor_v3_snapshots s
            join public.health_score_professor_v3_snapshot_metricas sm
              on sm.snapshot_id = s.id and sm.metrica = 'numero_alunos'
            join public.health_score_professor_v3_snapshot_metrica_segmentos c
              on c.snapshot_metrica_id = sm.id
            where s.professor_id = 101 and s.unidade_id is null
            group by c.unidade_id
          ) x;
          if row(v_valor, v_numerador, v_denominador)
             is distinct from row(3::numeric, 4::numeric, 6::numeric) then
            raise exception 'filhos carteira nao reproduzem pai: %, %, %', v_valor, v_numerador, v_denominador;
          end if;

          select sm.numerador, sm.denominador, sm.nota
            into v_numerador, v_denominador, v_nota
          from public.health_score_professor_v3_snapshots s
          join public.health_score_professor_v3_snapshot_metricas sm
            on sm.snapshot_id = s.id
          where s.professor_id = 101
            and s.unidade_id is null
            and sm.metrica = 'media_turma';
          if row(v_numerador, v_denominador, v_nota)
             is distinct from row(4::numeric, 3::numeric, 100::numeric) then
            raise exception 'pai media nao preservado: %, %, %', v_numerador, v_denominador, v_nota;
          end if;
          select sum(c.numerador), sum(c.denominador)
            into v_numerador, v_denominador
          from public.health_score_professor_v3_snapshots s
          join public.health_score_professor_v3_snapshot_metricas sm
            on sm.snapshot_id = s.id and sm.metrica = 'media_turma'
          join public.health_score_professor_v3_snapshot_metrica_segmentos c
            on c.snapshot_metrica_id = sm.id
          where s.professor_id = 101 and s.unidade_id is null;
          if row(v_numerador, v_denominador)
             is distinct from row(4::numeric, 3::numeric) then
            raise exception 'filhos media nao reproduzem pai: %, %', v_numerador, v_denominador;
          end if;

          select count(*) into v_count
          from public.health_score_professor_v3_snapshots s
          join public.health_score_professor_v3_snapshot_metricas sm on sm.snapshot_id = s.id
          join public.health_score_professor_v3_snapshot_metrica_segmentos c on c.snapshot_metrica_id = sm.id
          where s.professor_id = 101
            and s.unidade_id is null
            and c.atribuicao_id is not null
            and c.atribuicao_formal
            and c.atribuicao_pontuavel;
          if v_count <> 6 then
            raise exception 'atribuicoes estruturadas esperadas 6, obtidas %', v_count;
          end if;

          select count(*) into v_count
          from public.health_score_professor_v3_snapshot_metrica_segmentos
          where capacidade_excedida;
          if v_count = 0 then
            raise exception 'alerta de capacidade nao foi persistido';
          end if;

          select count(*) into v_count
          from public.health_score_professor_v3_snapshot_metricas
          where metrica in ('retencao', 'permanencia', 'conversao', 'presenca')
            and detalhes ? 'nota_segmentada';
          if v_count <> 0 then
            raise exception 'detalhes legados receberam nota_segmentada';
          end if;

          select sm.estado_base, sm.nota into v_estado, v_nota
          from public.health_score_professor_v3_snapshots s
          join public.health_score_professor_v3_snapshot_metricas sm on sm.snapshot_id = s.id
          where s.professor_id = 202 and s.unidade_id is null and sm.metrica = 'numero_alunos';
          if v_estado <> 'sem_base_zero_carteira' or v_nota is not null then
            raise exception 'zero carteira penalizado: %, %', v_estado, v_nota;
          end if;

          select sm.estado_base, sm.nota into v_estado, v_nota
          from public.health_score_professor_v3_snapshots s
          join public.health_score_professor_v3_snapshot_metricas sm on sm.snapshot_id = s.id
          where s.professor_id = 303 and s.unidade_id is null and sm.metrica = 'numero_alunos';
          if v_estado <> 'regra_ausente' or v_nota is not null then
            raise exception 'regra ausente nao bloqueou: %, %', v_estado, v_nota;
          end if;

          select sm.estado_base, sm.nota into v_estado, v_nota
          from public.health_score_professor_v3_snapshots s
          join public.health_score_professor_v3_snapshot_metricas sm on sm.snapshot_id = s.id
          where s.professor_id = 404 and s.unidade_id is null and sm.metrica = 'numero_alunos';
          if v_estado <> 'divergencia_nao_ofertada' or v_nota is not null then
            raise exception 'nao ofertada com dados nao bloqueou: %, %', v_estado, v_nota;
          end if;

          select sm.estado_base, sm.nota into v_estado, v_nota
          from public.health_score_professor_v3_snapshots s
          join public.health_score_professor_v3_snapshot_metricas sm on sm.snapshot_id = s.id
          where s.professor_id = 505 and s.unidade_id is null and sm.metrica = 'numero_alunos';
          if v_estado <> 'segmentacao_incompleta' or v_nota is not null then
            raise exception 'escopo nao resolvido perdeu bloqueio: %, %', v_estado, v_nota;
          end if;

          select count(*) into v_count
          from public.health_score_professor_v3_snapshots s
          join public.health_score_professor_v3_snapshot_metricas sm on sm.snapshot_id = s.id
          join public.health_score_professor_v3_snapshot_metrica_diagnosticos d
            on d.snapshot_metrica_id = sm.id
          where s.professor_id = 505
            and s.unidade_id is null
            and d.dados_sem_resolucao = 1
            and d.pessoas_unicas_total = 1
            and d.divergencias <> '{}'::jsonb;
          if v_count <> 2 then
            raise exception 'diagnosticos estruturados esperados 2, obtidos %', v_count;
          end if;

          select count(*) into v_count
          from public.health_score_professor_v3_snapshots s
          join public.health_score_professor_v3_snapshot_metricas sm on sm.snapshot_id = s.id
          join public.health_score_professor_v3_snapshot_metrica_segmentos c on c.snapshot_metrica_id = sm.id
          where s.professor_id = 505 and s.unidade_id is null;
          if v_count <> 0 then
            raise exception 'escopo nao resolvido gerou segmento regular indevido';
          end if;

          perform setval('public.fixture_canonical_calls', 1, false);
          perform public.materializar_health_score_professor_v3_periodo_impl(
            date '2026-07-01', 'ciclo', null, null
          );
          select last_value, is_called into v_calls, v_called
          from public.fixture_canonical_calls;
          if not v_called or v_calls <> 2 then
            raise exception 'materializador de ciclo deveria ler dois recortes, leu %', v_calls;
          end if;

          select sm.valor_bruto, sm.numerador, sm.denominador, sm.nota
            into v_valor, v_numerador, v_denominador, v_nota
          from public.health_score_professor_v3_snapshots s
          join public.health_score_professor_v3_snapshot_metricas sm
            on sm.snapshot_id = s.id
          where s.professor_id = 101
            and s.unidade_id is null
            and s.periodicidade = 'ciclo'
            and sm.metrica = 'numero_alunos';
          if row(v_valor, v_numerador, v_denominador, v_nota)
             is distinct from row(2::numeric, 5::numeric, 8::numeric, 62.50::numeric) then
            raise exception 'pai ciclo carteira divergente: %, %, %, %', v_valor, v_numerador, v_denominador, v_nota;
          end if;

          select
            round(
              sum(x.pessoas_fechamentos)::numeric
                / max(x.meses_com_base_consolidado),
              2
            ),
            sum(x.numerador),
            sum(x.denominador)
            into v_valor, v_numerador, v_denominador
          from (
            select
              c.unidade_id,
              max(c.pessoas_fechamentos)::numeric as pessoas_fechamentos,
              max(c.meses_com_base_consolidado)::numeric
                as meses_com_base_consolidado,
              sum(c.numerador)::numeric as numerador,
              sum(c.denominador)::numeric as denominador
            from public.health_score_professor_v3_snapshots s
            join public.health_score_professor_v3_snapshot_metricas sm
              on sm.snapshot_id = s.id and sm.metrica = 'numero_alunos'
            join public.health_score_professor_v3_snapshot_metrica_segmentos c
              on c.snapshot_metrica_id = sm.id
            where s.professor_id = 101
              and s.unidade_id is null
              and s.periodicidade = 'ciclo'
            group by c.unidade_id
          ) x;
          if row(v_valor, v_numerador, v_denominador)
             is distinct from row(2::numeric, 5::numeric, 8::numeric) then
            raise exception 'filhos ciclo carteira nao reproduzem pai: %, %, %', v_valor, v_numerador, v_denominador;
          end if;

          select sum(c.numerador), sum(c.denominador), count(*) filter (
            where c.capacidade_excedida
          )
            into v_numerador, v_denominador, v_count
          from public.health_score_professor_v3_snapshots s
          join public.health_score_professor_v3_snapshot_metricas sm
            on sm.snapshot_id = s.id and sm.metrica = 'media_turma'
          join public.health_score_professor_v3_snapshot_metrica_segmentos c
            on c.snapshot_metrica_id = sm.id
          where s.professor_id = 101
            and s.unidade_id is null
            and s.periodicidade = 'ciclo';
          if row(v_numerador, v_denominador, v_count)
             is distinct from row(5::numeric, 4::numeric, 1::integer) then
            raise exception 'filhos ciclo media inflaram componentes: %, %, %', v_numerador, v_denominador, v_count;
          end if;
        end;
        $fixture$;

        insert into public.health_score_professor_v3_ciclos (
          codigo,
          data_fim
        ) values (
          '2026-07',
          date '2000-01-01'
        );

        create function public.fixture_materializar_e_aguardar()
        returns integer
        language plpgsql
        security definer
        set search_path = public, pg_temp
        as $$
        declare
          v_resultado jsonb;
          v_atualizadas integer;
        begin
          v_resultado := public.materializar_health_score_professor_v3_periodo(
            date '2026-07-01',
            'ciclo',
            null,
            101
          );

          update public.health_score_professor_v3_snapshot_metricas m
          set detalhes = m.detalhes || jsonb_build_object('apta_oficial', true)
          where m.snapshot_id in (
            select value::uuid
            from jsonb_array_elements_text(v_resultado->'snapshot_ids') ids(value)
          );
          get diagnostics v_atualizadas = row_count;

          perform pg_sleep(1);
          return v_atualizadas;
        end;
        $$;

        do $flow_lock_fixture$
        declare
          v_inicio timestamptz;
          v_duracao interval;
          v_fechamento jsonb;
          v_atualizadas integer;
          v_colisoes integer;
          v_revisoes_fora_da_ordem integer;
        begin
          perform dblink_connect('task5_flow', 'dbname=postgres user=postgres');
          perform dblink_send_query(
            'task5_flow',
            'select public.fixture_materializar_e_aguardar()'
          );
          perform pg_sleep(0.2);

          v_inicio := clock_timestamp();
          v_fechamento := public.fechar_health_score_professor_v3_ciclo(
            '2026-07',
            'fixture concorrente Task 5'
          );
          v_duracao := clock_timestamp() - v_inicio;

          while dblink_is_busy('task5_flow') = 1 loop
            perform pg_sleep(0.05);
          end loop;
          select result into v_atualizadas
          from dblink_get_result('task5_flow') as resposta(result integer);
          perform dblink_disconnect('task5_flow');

          if v_atualizadas = 0 then
            raise exception 'fluxo remoto nao materializou metricas';
          end if;
          if v_duracao < interval '600 milliseconds' then
            raise exception
              'fechamento nao aguardou o lock do materializador: %',
              v_duracao;
          end if;
          if coalesce((v_fechamento->>'snapshots_fechados')::integer, 0) = 0 then
            raise exception 'fechamento concorrente nao produziu snapshots';
          end if;

          select count(*) into v_colisoes
          from (
            select
              s.professor_id,
              s.unidade_id,
              s.competencia,
              s.periodicidade,
              s.revisao
            from public.health_score_professor_v3_snapshots s
            where s.professor_id = 101
              and s.competencia = date '2026-07-01'
              and s.periodicidade = 'ciclo'
            group by
              s.professor_id,
              s.unidade_id,
              s.competencia,
              s.periodicidade,
              s.revisao
            having count(*) > 1
          ) duplicadas;
          if v_colisoes <> 0 then
            raise exception 'fluxos concorrentes colidiram revisoes: %', v_colisoes;
          end if;

          select count(*) into v_revisoes_fora_da_ordem
          from public.health_score_professor_v3_snapshots oficial
          where oficial.professor_id = 101
            and oficial.competencia = date '2026-07-01'
            and oficial.periodicidade = 'ciclo'
            and oficial.estado_publicacao = 'oficial'
            and oficial.revisao <> (
              select max(s.revisao)
              from public.health_score_professor_v3_snapshots s
              where s.professor_id = oficial.professor_id
                and s.unidade_id is not distinct from oficial.unidade_id
                and s.competencia = oficial.competencia
                and s.periodicidade = oficial.periodicidade
            );
          if v_revisoes_fora_da_ordem <> 0 then
            raise exception
              'fechamento nao consumiu a proxima revisao serializada: %',
              v_revisoes_fora_da_ordem;
          end if;
        exception
          when others then
            perform dblink_disconnect('task5_flow')
            where 'task5_flow' = any(dblink_get_connections());
            raise;
        end;
        $flow_lock_fixture$;

        do $lock_fixture$
        declare
          v_key bigint := hashtextextended(
            'health_score_v3_periodo:2026-07-01:ciclo',
            0
          );
          v_acquired boolean;
          v_attempt integer;
        begin
          perform dblink_connect('task5_locker', 'dbname=postgres user=postgres');
          perform dblink_send_query(
            'task5_locker',
            format(
              'select 1 from (select pg_advisory_lock(%s)) l cross join lateral (select pg_sleep(1)) s',
              v_key
            )
          );
          perform pg_sleep(0.2);

          select pg_try_advisory_lock(v_key) into v_acquired;
          if v_acquired then
            perform pg_advisory_unlock(v_key);
            raise exception 'lock global e unitario nao se excluem mutuamente';
          end if;

          while dblink_is_busy('task5_locker') = 1 loop
            perform pg_sleep(0.05);
          end loop;
          perform result
          from dblink_get_result('task5_locker') as resposta(result integer);
          perform dblink_disconnect('task5_locker');

          v_acquired := false;
          for v_attempt in 1..20 loop
            select pg_try_advisory_lock(v_key) into v_acquired;
            exit when v_acquired;
            perform pg_sleep(0.05);
          end loop;
          if not v_acquired then
            raise exception 'lock da sessao concorrente nao foi liberado';
          end if;
          perform pg_advisory_unlock(v_key);
        exception
          when others then
            perform dblink_disconnect('task5_locker')
            where 'task5_locker' = any(dblink_get_connections());
            raise;
        end;
        $lock_fixture$;

        insert into public.professores (id, nome)
        select id, format('Carga representativa %s', id)
        from generate_series(808, 823) id;
        insert into public.professor_unidade_curso_modalidade (
          id, professor_id, unidade_id, curso_id, modalidade, status,
          fonte, confianca, vigencia_inicio
        )
        select
          gen_random_uuid(),
          p.id,
          case (p.id - 808) % 4
            when 1 then '22222222-2222-2222-2222-222222222222'::uuid
            else '11111111-1111-1111-1111-111111111111'::uuid
          end,
          case (p.id - 808) % 4
            when 0 then 10
            when 1 then 10
            when 2 then 20
            else 60
          end,
          case (p.id - 808) % 4
            when 2 then 'individual'
            else 'turma'
          end,
          'ativo',
          'fixture',
          'alta',
          date '2026-01-01'
        from public.professores p
        where p.id between 808 and 823;
        with carga as (
          select
            p.professor_id,
            p.unidade_id,
            p.curso_id,
            p.modalidade,
            g,
            case
              when g <= 512 then date '2026-06-10'
              else date '2026-07-10'
            end as competencia
          from generate_series(1, 1000) g
          join public.professor_unidade_curso_modalidade p
            on p.professor_id = 808 + ((g - 1) % 16)
        ), carga_auditada as (
          select
            carga.*,
            count(*) over (
              partition by professor_id, unidade_id, competencia
            )::integer as carteira_total
          from carga
        )
        insert into public.fixture_carteira_canonica
        select
          p.professor_id,
          p.unidade_id,
          format('perf:pessoa-%s', g),
          p.curso_id,
          p.modalidade,
          format('perf:turma-%s-%s', p.professor_id, p.curso_id),
          true,
          'evento',
          true,
          true,
          'resolvido',
          format('perf:ocupacao-%s', g),
          p.carteira_total,
          p.carteira_total,
          false,
          p.competencia
        from carga_auditada p;

        create index idx_fixture_carteira_recorte_segmento
          on public.fixture_carteira_canonica (
            professor_id,
            unidade_id,
            competencia,
            curso_id,
            modalidade
          );
        analyze public.fixture_carteira_canonica;
        analyze public.professor_unidade_curso_modalidade;
        analyze public.health_score_professor_v3_config_metas_curso_modalidade;

        do $scale_fixture$
        declare
          v_professores integer;
          v_unidades integer;
          v_segmentos integer;
        begin
          select
            count(distinct f.professor_id),
            count(distinct f.unidade_id),
            count(distinct row(f.unidade_id, f.curso_id, f.modalidade))
            into v_professores, v_unidades, v_segmentos
          from public.fixture_carteira_canonica f
          where f.professor_id between 808 and 823;
          if row(v_professores, v_unidades, v_segmentos)
             is distinct from row(16, 2, 4) then
            raise exception
              'carga nao foi distribuida: professores %, unidades %, segmentos %',
              v_professores,
              v_unidades,
              v_segmentos;
          end if;
        end;
        $scale_fixture$;

        insert into public.health_score_professor_v3_snapshots (
          professor_id,
          escopo,
          unidade_id,
          competencia,
          revisao,
          estado,
          config_id,
          config_versao,
          periodicidade,
          periodo_inicio,
          periodo_fim
        )
        select
          808 + (g % 16),
          case when g % 3 = 0 then 'consolidado' else 'unidade' end,
          case
            when g % 3 = 0 then null
            when g % 2 = 0 then '11111111-1111-1111-1111-111111111111'::uuid
            else '22222222-2222-2222-2222-222222222222'::uuid
          end,
          (date '2025-01-01' + ((g % 12) * interval '1 month'))::date,
          g,
          'provisorio',
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
          1,
          case when g % 2 = 0 then 'mensal' else 'ciclo' end,
          (date '2025-01-01' + ((g % 12) * interval '1 month'))::date,
          (date '2025-01-01' + ((g % 12) * interval '1 month')
            + interval '1 month - 1 day')::date
        from generate_series(1, 20000) g;
        analyze public.health_score_professor_v3_snapshots;

        explain (analyze, buffers)
        select *
        from public.get_health_score_professor_v3_metricas_segmentadas_v1(
          date '2026-07-01',
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          null,
          'ciclo'
        );

        explain (analyze, buffers)
        select count(*)
        from public.fixture_carteira_canonica f
        where f.professor_id = 808
          and f.unidade_id = '11111111-1111-1111-1111-111111111111'
          and f.competencia between date '2026-06-01' and date '2026-07-31'
          and f.curso_id = 10
          and f.modalidade = 'turma';

        explain (costs off)
        select max(s.revisao)
        from public.health_score_professor_v3_snapshots s
        where s.professor_id = 101
          and s.unidade_id is not distinct from null
          and s.competencia = date '2026-07-01'
          and s.periodicidade = 'ciclo';

        create table public.fixture_behavior_fresh (
          fluxo text primary key,
          resultado_hash text not null
        );
        insert into public.fixture_behavior_fresh
        select 'detalhe', md5(coalesce(jsonb_agg(
          to_jsonb(d)
          order by d.professor_id, d.unidade_id, d.metrica,
            d.curso_id nulls last, d.modalidade nulls last
        )::text, '[]'))
        from public.get_health_score_professor_v3_metricas_segmentadas_v1(
          date '2026-07-01',
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          null,
          'ciclo'
        ) d;
        insert into public.fixture_behavior_fresh
        select 'agregado', md5(coalesce(jsonb_agg(
          to_jsonb(a)
          order by a.professor_id, a.unidade_id, a.metrica
        )::text, '[]'))
        from public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
          date '2026-07-01',
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          null,
          'ciclo'
        ) a;
      `;

      const executed = spawnSync(
        'docker',
        [
          'exec',
          '--interactive',
          containerName,
          'psql',
          '--no-psqlrc',
          '--set',
          'ON_ERROR_STOP=1',
          '--username',
          'postgres',
          '--dbname',
          'postgres',
        ],
        {
          encoding: 'utf8',
          input: fixtureSql,
          maxBuffer: 32 * 1024 * 1024,
        },
      );
      assert.equal(
        executed.status,
        0,
        `fixture PostgreSQL falhou:\nSTDOUT:\n${executed.stdout}\nSTDERR:\n${executed.stderr}`,
      );
      const executionTime = executed.stdout.match(
        /Execution Time:\s*([0-9.]+)\s*ms/i,
      );
      assert.ok(executionTime, 'EXPLAIN ANALYZE deve informar tempo local');
      assert.ok(
        Number(executionTime[1]) < 5_000,
        `fixture representativa excedeu 5s: ${executionTime[1]}ms`,
      );
      assert.match(
        executed.stdout,
        /idx_health_score_v3_snapshots_materializacao_revisao/i,
      );
      assert.match(
        executed.stdout,
        /idx_fixture_carteira_recorte_segmento/i,
      );

      const databaseName = `task5_intermediate_${process.pid}`;
      const createdDatabase = spawnSync(
        'docker',
        [
          'exec',
          containerName,
          'createdb',
          '--username',
          'postgres',
          '--template',
          'postgres',
          databaseName,
        ],
        { encoding: 'utf8' },
      );
      assert.equal(
        createdDatabase.status,
        0,
        `nao criou banco intermediario:\n${createdDatabase.stderr}`,
      );

      const intermediateSql = String.raw`
        \set ON_ERROR_STOP on

        delete from public.health_score_professor_v3_snapshot_metrica_segmentos;
        delete from public.health_score_professor_v3_snapshot_metrica_diagnosticos;

        alter table public.health_score_professor_v3_snapshot_metrica_segmentos
          drop constraint health_score_v3_segmento_atribuicao_escopo_fk,
          drop constraint health_score_v3_segmento_pessoas_fechamentos_chk,
          drop constraint health_score_v3_segmento_meses_com_base_chk,
          drop constraint health_score_v3_segmento_meses_consolidado_chk,
          drop constraint health_score_v3_segmento_meses_periodo_chk,
          drop constraint health_score_v3_segmento_atribuicao_pontuavel_chk,
          drop constraint health_score_v3_segmento_atribuicao_formal_chk;
        drop index public.idx_health_score_v3_snapshot_segmentos_atribuicao_escopo;
        drop index public.idx_health_score_v3_snapshots_materializacao_revisao;
        drop index public.uq_professor_curso_modalidade_id_escopo;
        alter table public.health_score_professor_v3_snapshot_metrica_segmentos
          drop column pessoas_fechamentos,
          drop column meses_com_base,
          drop column meses_com_base_consolidado,
          drop column meses_no_periodo,
          alter column pessoas_unicas_total type integer
            using round(pessoas_unicas_total)::integer;
        alter table public.health_score_professor_v3_snapshot_metrica_diagnosticos
          alter column pessoas_unicas_total type integer
            using round(pessoas_unicas_total)::integer;

        drop function public.materializar_health_score_professor_v3_periodo(
          date, text, uuid, integer
        );
        drop function public.materializar_health_score_professor_v3_periodo_impl(
          date, text, uuid, integer
        );
        drop function public.get_health_score_professor_v3_metricas_periodo(
          date, uuid, text
        );
        drop function
          public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
            date, uuid, uuid, text
          );
        drop function public.get_health_score_professor_v3_metricas_segmentadas_v1(
          date, uuid, uuid, text
        );

        ${intermediateDetailDefinition}
        ${intermediateAggregateDefinition}
        ${intermediateEngineDefinition}
        ${intermediateMaterializerDefinition}
        ${intermediateWrapperDefinition}
        ${intermediateCloseDefinition}

        insert into public.health_score_professor_v3_snapshot_metrica_segmentos (
          snapshot_metrica_id,
          unidade_id,
          curso_id,
          modalidade,
          estado_base,
          fonte,
          regra_versao,
          atribuicao_id,
          atribuicao_formal,
          atribuicao_pontuavel,
          pessoas_unicas_total
        ) values (
          (select id from public.health_score_professor_v3_snapshot_metricas
           order by id limit 1),
          '11111111-1111-1111-1111-111111111111',
          10,
          'turma',
          'ok',
          'fixture_intermediaria',
          'fixture-38c6f93',
          '00000000-0000-0000-0000-000000000001',
          true,
          true,
          3
        );
        insert into public.health_score_professor_v3_snapshot_metrica_diagnosticos (
          snapshot_metrica_id,
          unidade_id,
          pessoas_unicas_total,
          estado_base,
          fonte,
          regra_versao
        ) values (
          (select id from public.health_score_professor_v3_snapshot_metricas
           order by id limit 1),
          '11111111-1111-1111-1111-111111111111',
          2,
          'segmentacao_incompleta',
          'fixture_intermediaria',
          'fixture-38c6f93'
        );

        ${hardeningSql}

        do $upgrade_fixture$
        declare
          v_segmento_type text;
          v_diagnostico_type text;
          v_validated integer;
          v_columns integer;
          v_definition_mismatch integer;
          v_behavior_mismatch integer;
        begin
          select data_type into v_segmento_type
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'health_score_professor_v3_snapshot_metrica_segmentos'
            and column_name = 'pessoas_unicas_total';
          select data_type into v_diagnostico_type
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'health_score_professor_v3_snapshot_metrica_diagnosticos'
            and column_name = 'pessoas_unicas_total';
          if row(v_segmento_type, v_diagnostico_type)
             is distinct from row('numeric'::text, 'numeric'::text) then
            raise exception 'upgrade nao converteu integer para numeric: %, %', v_segmento_type, v_diagnostico_type;
          end if;

          select count(*) into v_columns
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'health_score_professor_v3_snapshot_metrica_segmentos'
            and column_name in (
              'pessoas_fechamentos',
              'meses_com_base',
              'meses_com_base_consolidado',
              'meses_no_periodo'
            );
          if v_columns <> 4 then
            raise exception 'upgrade intermediario deixou colunas ausentes: %', v_columns;
          end if;

          select count(*) into v_validated
          from pg_constraint c
          join pg_class t on t.oid = c.conrelid
          join pg_namespace n on n.oid = t.relnamespace
          where n.nspname = 'public'
            and t.relname = 'health_score_professor_v3_snapshot_metrica_segmentos'
            and c.conname in (
              'health_score_v3_segmento_atribuicao_pontuavel_chk',
              'health_score_v3_segmento_atribuicao_formal_chk',
              'health_score_v3_segmento_atribuicao_escopo_fk'
            )
            and c.convalidated;
          if v_validated <> 3 then
            raise exception 'constraints de hardening nao validadas: %', v_validated;
          end if;

          select count(*) into v_definition_mismatch
          from public.fixture_function_defs_fresh f
          where f.definicao is distinct from
              pg_get_functiondef(f.assinatura::regprocedure::oid)
             or f.definicao_hash is distinct from
              md5(pg_get_functiondef(f.assinatura::regprocedure::oid));
          if v_definition_mismatch <> 0 then
            raise exception
              'upgrade intermediario divergiu de fresh em % definicoes',
              v_definition_mismatch;
          end if;

          with atual as (
            select 'detalhe'::text as fluxo, md5(coalesce(jsonb_agg(
              to_jsonb(d)
              order by d.professor_id, d.unidade_id, d.metrica,
                d.curso_id nulls last, d.modalidade nulls last
            )::text, '[]')) as resultado_hash
            from public.get_health_score_professor_v3_metricas_segmentadas_v1(
              date '2026-07-01',
              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
              null,
              'ciclo'
            ) d
            union all
            select 'agregado'::text, md5(coalesce(jsonb_agg(
              to_jsonb(a)
              order by a.professor_id, a.unidade_id, a.metrica
            )::text, '[]'))
            from public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
              date '2026-07-01',
              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
              null,
              'ciclo'
            ) a
          )
          select count(*) into v_behavior_mismatch
          from public.fixture_behavior_fresh f
          full join atual a using (fluxo)
          where f.resultado_hash is distinct from a.resultado_hash;
          if v_behavior_mismatch <> 0 then
            raise exception
              'upgrade intermediario divergiu de fresh em % comportamentos',
              v_behavior_mismatch;
          end if;

          begin
            insert into public.health_score_professor_v3_snapshot_metrica_segmentos (
              snapshot_metrica_id,
              unidade_id,
              curso_id,
              modalidade,
              estado_base,
              fonte,
              regra_versao,
              atribuicao_formal,
              atribuicao_pontuavel,
              pessoas_unicas_total
            ) values (
              (select id
               from public.health_score_professor_v3_snapshot_metricas
               order by id limit 1),
              '11111111-1111-1111-1111-111111111111',
              11,
              'turma',
              'ok',
              'fixture_invalida',
              'fixture-38c6f93',
              false,
              true,
              1
            );
            raise exception 'check pontuavel=>formal nao bloqueou linha invalida';
          exception
            when check_violation then null;
          end;

          begin
            insert into public.health_score_professor_v3_snapshot_metrica_segmentos (
              snapshot_metrica_id,
              unidade_id,
              curso_id,
              modalidade,
              estado_base,
              fonte,
              regra_versao,
              atribuicao_formal,
              atribuicao_pontuavel,
              pessoas_unicas_total
            ) values (
              (select id
               from public.health_score_professor_v3_snapshot_metricas
               order by id limit 1),
              '11111111-1111-1111-1111-111111111111',
              12,
              'turma',
              'ok',
              'fixture_invalida',
              'fixture-38c6f93',
              true,
              false,
              1
            );
            raise exception 'check formal=>id nao bloqueou linha invalida';
          exception
            when check_violation then null;
          end;

          begin
            insert into public.health_score_professor_v3_snapshot_metrica_segmentos (
              snapshot_metrica_id,
              unidade_id,
              curso_id,
              modalidade,
              estado_base,
              fonte,
              regra_versao,
              atribuicao_id,
              atribuicao_formal,
              atribuicao_pontuavel,
              pessoas_unicas_total
            ) values (
              (select id
               from public.health_score_professor_v3_snapshot_metricas
               order by id limit 1),
              '11111111-1111-1111-1111-111111111111',
              13,
              'turma',
              'ok',
              'fixture_invalida',
              'fixture-38c6f93',
              '00000000-0000-0000-0000-000000000001',
              true,
              true,
              1
            );
            raise exception 'FK composta aceitou atribuicao em escopo divergente';
          exception
            when foreign_key_violation then null;
          end;
        end;
        $upgrade_fixture$;
      `;

      const upgradedIntermediate = spawnSync(
        'docker',
        [
          'exec',
          '--interactive',
          containerName,
          'psql',
          '--no-psqlrc',
          '--set',
          'ON_ERROR_STOP=1',
          '--username',
          'postgres',
          '--dbname',
          databaseName,
        ],
        {
          encoding: 'utf8',
          input: intermediateSql,
          maxBuffer: 16 * 1024 * 1024,
        },
      );
      assert.equal(
        upgradedIntermediate.status,
        0,
        `upgrade 38c6f93 -> 203100 falhou:\nSTDOUT:\n${upgradedIntermediate.stdout}\nSTDERR:\n${upgradedIntermediate.stderr}`,
      );
    } finally {
      spawnSync('docker', ['rm', '--force', containerName], { encoding: 'utf8' });
    }
  },
);
