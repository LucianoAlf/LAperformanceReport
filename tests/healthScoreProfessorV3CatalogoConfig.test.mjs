import assert from 'node:assert/strict';
import test from 'node:test';
import { readSqlContract } from './helpers/sqlContractHelpers.mjs';

const migrationRelativePath =
  'supabase/migrations/20260720122000_health_score_v3_catalogo_segmentos_config.sql';
const {
  exists: migrationExists,
  filePath: migrationPath,
  executable: executableSql,
} = readSqlContract(import.meta.url, migrationRelativePath);

function escapeRegExp(value) {
  return value.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&');
}

function extractFunction(functionName) {
  const startPattern = new RegExp(
    'create\\s+or\\s+replace\\s+function\\s+public\\.' +
      escapeRegExp(functionName) +
      '\\s*\\(',
    'i',
  );
  const start = executableSql.search(startPattern);
  assert.notEqual(start, -1, functionName + ' deve existir na migration da Task 5');

  const remainder = executableSql.slice(start);
  const header = remainder.match(
    /create\s+or\s+replace\s+function[\s\S]*?\bas\s+\$([a-z0-9_]*)\$/i,
  );
  assert.ok(header, functionName + ' deve possuir corpo SQL delimitado');

  const delimiter = '$' + header[1] + '$';
  const closing = remainder.indexOf(delimiter + ';', header[0].length);
  assert.notEqual(closing, -1, functionName + ' deve possuir corpo SQL completo');
  return remainder.slice(0, closing + delimiter.length + 1);
}

function assertLoadsAndBlocksMissingOfficialSegments(block, functionName) {
  assert.match(
    block,
    /\bv_segmentos_faltantes\s+jsonb\b/i,
    functionName + ' deve declarar v_segmentos_faltantes como jsonb',
  );

  const helperName =
    'public\\.fn_health_score_professor_v3_segmentos_faltantes_v1';
  const assignmentPattern = new RegExp(
    'v_segmentos_faltantes\\s*:=\\s*' +
      helperName +
      '\\s*\\(\\s*p_config_id\\s*\\)',
    'i',
  );
  const selectIntoPattern = new RegExp(
    'select\\s+' +
      helperName +
      '\\s*\\(\\s*p_config_id\\s*\\)\\s+into\\s+v_segmentos_faltantes',
    'i',
  );
  const assignmentIndex = block.search(assignmentPattern);
  const selectIntoIndex = block.search(selectIntoPattern);
  const loadIndex = [assignmentIndex, selectIntoIndex]
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0] ?? -1;

  assert.ok(
    loadIndex >= 0,
    functionName + ' deve carregar o helper oficial em v_segmentos_faltantes',
  );

  const guardPattern =
    /if\s+jsonb_array_length\s*\(\s*v_segmentos_faltantes\s*\)\s*>\s*0\s+then[\s\S]{0,300}?raise\s+exception/i;
  const guardIndex = block.search(guardPattern);
  assert.ok(
    guardIndex > loadIndex,
    functionName +
      ' deve executar IF jsonb_array_length(v_segmentos_faltantes) > 0 THEN RAISE EXCEPTION depois do load',
  );
}

function extractDraftLock(saveFunction) {
  const candidates = saveFunction.match(
    /\bselect\b[\s\S]{0,1200}?\bfrom\s+public\.health_score_professor_v3_config_versoes\b[\s\S]{0,800}?\bwhere\b[\s\S]{0,800}?\bfor\s+update\b\s*;/gi,
  ) || [];

  return candidates.find(
    (candidate) =>
      /\b(?:[a-z_][a-z0-9_]*\.)?id\s*=\s*p_config_id\b/i.test(candidate) &&
      /\b(?:[a-z_][a-z0-9_]*\.)?status\s*=\s*'rascunho'/i.test(candidate),
  );
}

function extractDmlStatements(block, tablePattern) {
  const pattern = new RegExp(
    '\\b(?:insert\\s+into|update|delete\\s+from)\\s+public\\.(' +
      tablePattern +
      ')\\b[\\s\\S]*?;',
    'gi',
  );
  return [...block.matchAll(pattern)].map((match) => match[0]);
}

function assertConfigChildDmlIsScoped(statement, tableName) {
  if (/^\s*(?:update|delete\s+from)\b/i.test(statement)) {
    assert.match(
      statement,
      /where[\s\S]*\b(?:[a-z_][a-z0-9_]*\.)?config_id\s*=\s*p_config_id\b/i,
      tableName + ' deve restringir UPDATE/DELETE por config_id = p_config_id',
    );
    return;
  }

  assert.match(
    statement,
    new RegExp(
      'insert\\s+into\\s+public\\.' + tableName +
        '\\s*\\(\\s*config_id\\s*,',
      'i',
    ),
    tableName + ' deve declarar config_id como primeira coluna do INSERT',
  );
  assert.match(
    statement,
    /\)\s*(?:values\s*\(\s*p_config_id\b|select\s+p_config_id\b)/i,
    tableName + ' deve inserir p_config_id como primeiro valor',
  );
}

test('Task 5 disponibiliza a migration catalog-driven da configuracao V3', () => {
  assert.equal(
    migrationExists,
    true,
    migrationPath + ' deve existir antes de validar a configuracao por catalogo',
  );
});

test(
  'helper de catalogo retorna somente segmentos ativos da origem Emusys',
  { skip: !migrationExists },
  () => {
    const catalogFunction = extractFunction(
      'fn_health_score_professor_v3_catalogo_segmentos_v1',
    );

    assert.match(catalogFunction, /public\.emusys_disciplinas_catalogo/i);
    assert.match(
      catalogFunction,
      /\b(?:where|and)\s+(?:[a-z_][a-z0-9_]*\.)?ativo_origem\s*(?:(?:=\s*true|is\s+true)|(?=(?:and|or|order|group|limit|;|\))))/i,
      'catalogo oficial deve filtrar ativo_origem na fonte bruta',
    );
  },
);

test(
  'leitura da configuracao retorna catalogo_segmentos pelo helper oficial',
  { skip: !migrationExists },
  () => {
    const uiFunction = extractFunction(
      'get_health_score_professor_v3_config_ui',
    );

    assert.match(
      uiFunction,
      /'catalogo_segmentos'\s*,\s*public\.fn_health_score_professor_v3_catalogo_segmentos_v1\s*\([^)]*\)/i,
      'valor de catalogo_segmentos deve chamar diretamente o helper oficial',
    );
  },
);

test(
  'helper de faltantes deriva regras finais do catalogo oficial',
  { skip: !migrationExists },
  () => {
    const missingSegmentsFunction = extractFunction(
      'fn_health_score_professor_v3_segmentos_faltantes_v1',
    );

    assert.match(
      missingSegmentsFunction,
      /from\s+public\.fn_health_score_professor_v3_catalogo_segmentos_v1\s*\([^)]*\)\s+(?:as\s+)?c\b/i,
      'faltantes devem partir do catalogo oficial com alias c',
    );
    assert.match(
      missingSegmentsFunction,
      /left\s+join\s+public\.health_score_professor_v3_config_metas_curso_modalidade\s+(?:as\s+)?m\s+on\s+[\s\S]{0,700}?m\.config_id\s*=\s*p_config_id[\s\S]{0,700}?m\.unidade_id\s*=\s*c\.unidade_id[\s\S]{0,700}?m\.curso_id\s*=\s*c\.curso_id[\s\S]{0,700}?m\.modalidade\s*=\s*c\.modalidade/i,
      'join deve usar config, unidade, curso e modalidade do catalogo oficial',
    );
    assert.match(
      missingSegmentsFunction,
      /where\s+[\s\S]{0,500}?m\.(?:id|config_id)\s+is\s+null[\s\S]{0,500}?or[\s\S]{0,300}?m\.estado\s+not\s+in\s*\(\s*'configurada'\s*,\s*'nao_ofertada'\s*\)/i,
      'faltante e ausencia de regra final configurada ou nao ofertada',
    );
    assert.match(
      missingSegmentsFunction,
      /(?:jsonb_agg|jsonb_build_array|to_jsonb)/i,
      'helper deve devolver os segmentos faltantes como jsonb',
    );
  },
);

test(
  'salvar rascunho aceita lista vazia ou parcial sem fabricar zeros',
  { skip: !migrationExists },
  () => {
    const saveFunction = extractFunction(
      'salvar_health_score_professor_v3_config_rascunho',
    );
    const acceptsEmptyPayload =
      /p_metas_segmentadas\s+jsonb\s+default\s+'\[\]'::jsonb/i.test(
        saveFunction,
      ) ||
      /coalesce\s*\(\s*p_metas_segmentadas\s*,\s*'\[\]'::jsonb\s*\)/i.test(
        saveFunction,
      ) ||
      /p_metas_segmentadas\s+is\s+null[\s\S]{0,300}'\[\]'::jsonb/i.test(
        saveFunction,
      );

    assert.ok(
      acceptsEmptyPayload,
      'salvar deve tratar ausencia de linhas como lista vazia valida',
    );
    assert.match(
      saveFunction,
      /jsonb_to_recordset\s*\(\s*(?:coalesce\s*\(\s*)?p_metas_segmentadas/i,
      'somente linhas enviadas devem ser materializadas',
    );

    for (const field of [
      'capacidade_maxima',
      'meta_media_turma',
      'meta_carteira_curso',
    ]) {
      const fabricatedZero = new RegExp(
        'coalesce\\s*\\([^;]{0,180}\\b' +
          field +
          '\\b[^;]{0,180},\\s*0(?:\\.0+)?\\s*\\)',
        'i',
      );
      assert.doesNotMatch(
        saveFunction,
        fabricatedZero,
        field + ' ausente deve permanecer nulo, nunca zero sintetico',
      );
      assert.doesNotMatch(
        saveFunction,
        new RegExp('\\b' + field + '\\b\\s*:=\\s*0(?:\\.0+)?\\b', 'i'),
      );
    }
  },
);

for (const functionName of [
  'simular_health_score_professor_v3_config',
  'ativar_health_score_professor_v3_config',
]) {
  test(
    functionName + ' bloqueia segmento oficial sem regra final',
    { skip: !migrationExists },
    () => {
      const block = extractFunction(functionName);
      assertLoadsAndBlocksMissingOfficialSegments(block, functionName);
    },
  );
}

test(
  'configuracao ativa e snapshots fechados permanecem imutaveis',
  { skip: !migrationExists },
  () => {
    const saveFunction = extractFunction(
      'salvar_health_score_professor_v3_config_rascunho',
    );

    const draftLock = extractDraftLock(saveFunction);
    assert.ok(
      draftLock,
      'save deve selecionar id = p_config_id e status = rascunho com FOR UPDATE',
    );

    const lockIndex = saveFunction.indexOf(draftLock);
    const guardAfterLock = saveFunction.slice(
      lockIndex + draftLock.length,
      lockIndex + draftLock.length + 600,
    );
    assert.match(
      guardAfterLock,
      /if\s+(?:not\s+found|[a-z_][a-z0-9_.]*\s+is\s+null)(?:\s+or\s+(?:not\s+found|[a-z_][a-z0-9_.]*\s+is\s+null))*\s+then[\s\S]{0,240}?raise\s+exception/i,
      'save deve interromper em NOT FOUND ou valor nulo logo apos travar o rascunho',
    );
    assert.doesNotMatch(
      saveFunction,
      /\b(?:insert\s+into|delete\s+from)\s+public\.health_score_professor_v3_config_versoes\b/i,
      'save nao pode criar nem excluir versoes de configuracao',
    );

    const versionUpdates = extractDmlStatements(
      saveFunction,
      'health_score_professor_v3_config_versoes',
    );
    assert.ok(versionUpdates.length > 0, 'save deve atualizar o rascunho existente');
    for (const statement of versionUpdates) {
      assert.match(statement, /where[\s\S]*\bid\s*=\s*p_config_id\b/i);
      assert.match(statement, /where[\s\S]*\bstatus\s*=\s*'rascunho'/i);
      assert.doesNotMatch(statement, /\bstatus\s*=\s*'ativa'/i);
    }

    for (const tableName of [
      'health_score_professor_v3_config_metricas',
      'health_score_professor_v3_config_metas_curso_modalidade',
    ]) {
      const statements = extractDmlStatements(saveFunction, tableName);
      assert.ok(statements.length > 0, 'save deve persistir ' + tableName);
      for (const statement of statements) {
        assertConfigChildDmlIsScoped(statement, tableName);
      }
    }

    assert.doesNotMatch(
      executableSql,
      /\b(?:insert\s+into(?:\s+only)?|update(?:\s+only)?|delete\s+from(?:\s+only)?|merge\s+into(?:\s+only)?)\s+(?:public\.)?health_score_professor_v3_(?:snapshots|snapshot_metricas|snapshot_metrica_segmentos|snapshot_metrica_diagnosticos)\b/i,
      'migration catalog-driven nao pode reescrever snapshots',
    );

    assert.doesNotMatch(
      executableSql,
      /\bcopy\s+(?:public\.)?health_score_professor_v3_(?:snapshots|snapshot_metricas|snapshot_metrica_segmentos|snapshot_metrica_diagnosticos)\b(?:\s*\([^)]*\))?\s+from\b/i,
      'migration catalog-driven nao pode escrever snapshots via COPY FROM',
    );

    const truncateStatements =
      executableSql.match(/\btruncate\b[\s\S]*?(?:;|$)/gi) || [];
    assert.deepEqual(
      truncateStatements.filter((statement) =>
        /\b(?:public\.)?health_score_professor_v3_(?:snapshots|snapshot_metricas|snapshot_metrica_segmentos|snapshot_metrica_diagnosticos)\b/i.test(
          statement,
        )
      ),
      [],
      'migration catalog-driven nao pode truncar snapshots nem como alvo secundario',
    );
    assert.doesNotMatch(
      executableSql,
      /\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?health_score_professor_v3_[a-z0-9_]*\s+(?:disable\s+trigger|enable\s+replica\s+trigger)\b/i,
      'guards de imutabilidade nao podem ser desabilitados',
    );
    assert.doesNotMatch(
      executableSql,
      /\bdrop\s+trigger\b[\s\S]{0,180}health_score_professor_v3/i,
      'guards de imutabilidade nao podem ser removidos',
    );
    assert.doesNotMatch(
      executableSql,
      /create\s+or\s+replace\s+function\s+(?:public\.)?fn_health_score_professor_v3_(?:bloquear_config_versao|bloquear_config_metrica|bloquear_config_meta_segmentada|bloquear_metrica_fechada|bloquear_snapshot_fechado|bloquear_snapshot_segmento_fechado)\s*\(/i,
      'migration de catalogo nao pode substituir guards de configuracao ou snapshot',
    );
    const droppedRoutines =
      executableSql.match(/\bdrop\s+(?:function|routine)\b[\s\S]*?;/gi) || [];
    assert.deepEqual(
      droppedRoutines.filter((statement) =>
        /\b(?:public\.)?fn_health_score_professor_v3_(?:bloquear_config_versao|bloquear_config_metrica|bloquear_config_meta_segmentada|bloquear_metrica_fechada|bloquear_snapshot_fechado|bloquear_snapshot_segmento_fechado)\b/i.test(
          statement,
        )
      ),
      [],
      'funcoes guard de configuracao ou snapshot nao podem ser removidas',
    );
    assert.doesNotMatch(
      executableSql,
      /\bset\s+(?:(?:session|local)\s+)?session_replication_role\s*(?:=|to)\s*(?:'replica'|replica)\b/i,
      'migration nao pode contornar triggers de imutabilidade pela sessao',
    );
    assert.doesNotMatch(
      executableSql,
      /\bset_config\s*\([\s\S]{0,160}?'session_replication_role'[\s\S]{0,160}?'replica'/i,
      'migration nao pode contornar triggers de imutabilidade via set_config',
    );
  },
);
