import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const schemaMigration =
  'supabase/migrations/20260719200000_health_score_v3_metas_segmentadas_schema.sql';
const professorSegmentMigration =
  'supabase/migrations/20260719201000_professor_unidade_curso_modalidade.sql';

const read = (path) => readFileSync(path, 'utf8');
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sqlIdentifier = (value) => {
  const escaped = escapeRegExp(value);
  return `(?:"${escaped}"|${escaped})`;
};
const qualifiedPublicIdentifier = (value) =>
  `(?:${sqlIdentifier('public')}\\s*\\.\\s*)?${sqlIdentifier(value)}(?![a-z0-9_"])`;

const protectedTableMutationPattern = (tableName) => new RegExp(
  `(?:insert\\s+into|update|delete\\s+from|merge\\s+into|alter\\s+table|truncate(?:\\s+table)?|drop\\s+table)\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?${qualifiedPublicIdentifier(tableName)}`,
  'i',
);

const professorCourseUnitCartesianProductPatterns = () => {
  const courses = qualifiedPublicIdentifier('professores_cursos');
  const units = qualifiedPublicIdentifier('professores_unidades');
  const alias = String.raw`(?:\s+(?:as\s+)?[a-z_][a-z0-9_]*)?`;
  const predicateBoundary = String.raw`(?=\s*(?:$|;|\b(?:where|group\s+by|order\s+by|having|limit|offset|fetch|union|intersect|except|returning|window|for)\b|\b(?:(?:inner|left(?:\s+outer)?|right(?:\s+outer)?|full(?:\s+outer)?|cross|natural)\s+)?join\b))`;
  const truePredicate = String.raw`(?:\(\s*)*true\b(?:\s*\))*`;
  const oneEqualsOnePredicate = String.raw`(?:\(\s*)*1(?![0-9])\s*(?:\)\s*)*=\s*(?:\(\s*)*1(?![0-9])\s*(?:\)\s*)*`;
  const alwaysTruePredicate =
    `(?:${truePredicate}|${oneEqualsOnePredicate})${predicateBoundary}`;

  return [
    new RegExp(`${courses}[\\s\\S]{0,240}\\bcross\\s+join\\s+${units}`, 'i'),
    new RegExp(`${units}[\\s\\S]{0,240}\\bcross\\s+join\\s+${courses}`, 'i'),
    new RegExp(`from\\s+${courses}${alias}\\s*,\\s*${units}`, 'i'),
    new RegExp(`from\\s+${units}${alias}\\s*,\\s*${courses}`, 'i'),
    new RegExp(
      `${courses}[\\s\\S]{0,320}\\bjoin\\s+${units}${alias}\\s+on\\s+${alwaysTruePredicate}`,
      'i',
    ),
    new RegExp(
      `${units}[\\s\\S]{0,320}\\bjoin\\s+${courses}${alias}\\s+on\\s+${alwaysTruePredicate}`,
      'i',
    ),
  ];
};

const hasProfessorCourseUnitCartesianProduct = (sql) =>
  professorCourseUnitCartesianProductPatterns().some((pattern) => pattern.test(sql));

const extractCreateTable = (sql, tableName) => {
  const match = sql.match(
    new RegExp(
      `create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+public\\.${tableName}\\s*\\([\\s\\S]*?\\)\\s*;`,
      'i',
    ),
  );

  assert.ok(match, `${tableName} deve ser criada pela migration esperada`);
  return match[0];
};

const extractFunction = (sql, functionName) => {
  const match = sql.match(
    new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\s*\\(\\s*\\)[\\s\\S]*?\\$\\$\\s*;`,
      'i',
    ),
  );

  assert.ok(match, `${functionName} deve ser criada pela migration esperada`);
  return match[0];
};

const quotedValues = (valueList) =>
  [...valueList.matchAll(/'([^']+)'/g)].map((match) => match[1].toLowerCase());

const enumDefinitions = (sql) =>
  [...sql.matchAll(
    /create\s+type\s+((?:public\.)?[a-z_][a-z0-9_]*)\s+as\s+enum\s*\(([^;]+?)\)\s*;/gi,
  )].map((match) => ({
    name: match[1],
    values: quotedValues(match[2]),
  }));

const assertColumnAllowedValues = ({
  tableSql,
  allSql,
  tableName,
  columnName,
  requiredValues,
  exact = false,
}) => {
  const expected = requiredValues.map((value) => value.toLowerCase());
  const checkMatch = tableSql.match(
    new RegExp(
      `check\\s*\\(\\s*(?:[a-z_][a-z0-9_]*\\.)?${columnName}(?:\\s*::\\s*[a-z_][a-z0-9_]*)?\\s+in\\s*\\(([^)]*)\\)\\s*\\)`,
      'i',
    ),
  );
  const checkValues = checkMatch ? quotedValues(checkMatch[1]) : [];
  const checkAllowsRequired = expected.every((value) => checkValues.includes(value));
  const checkIsExact = !exact || (
    checkValues.length === expected.length &&
    checkValues.every((value) => expected.includes(value))
  );

  const enumAllowsRequired = enumDefinitions(allSql).some((definition) => {
    const enumName = definition.name.replace(/^public\./i, '');
    const columnUsesEnum = new RegExp(
      `\\b${columnName}\\b\\s+(?:public\\.)?${escapeRegExp(enumName)}\\b`,
      'i',
    ).test(tableSql);
    const enumHasRequired = expected.every((value) => definition.values.includes(value));
    const enumIsExact = !exact || (
      definition.values.length === expected.length &&
      definition.values.every((value) => expected.includes(value))
    );

    return columnUsesEnum && enumHasRequired && enumIsExact;
  });

  assert.ok(
    (checkAllowsRequired && checkIsExact) || enumAllowsRequired,
    `${tableName}.${columnName} deve restringir em SQL os valores ${requiredValues.join(', ')}`,
  );
};

const assertSecuredTable = (sql, tableName) => {
  assert.match(
    sql,
    new RegExp(
      `alter\\s+table(?:\\s+if\\s+exists)?\\s+public\\.${tableName}\\s+enable\\s+row\\s+level\\s+security`,
      'i',
    ),
    `${tableName} deve habilitar RLS`,
  );

  for (const role of ['public', 'anon', 'authenticated']) {
    assert.match(
      sql,
      new RegExp(
        `revoke\\s+all(?:\\s+privileges)?\\s+on\\s+(?:table\\s+)?public\\.${tableName}\\s+from\\s+[^;]*\\b${role}\\b`,
        'i',
      ),
      `${tableName} deve revogar acesso de ${role}`,
    );
  }

  assert.doesNotMatch(
    sql,
    new RegExp(
      `grant\\s+[^;]+\\s+on\\s+(?:table\\s+)?public\\.${tableName}\\s+to\\s+[^;]*\\b(?:public|anon|authenticated)\\b`,
      'i',
    ),
    `${tableName} nao pode conceder acesso direto ao browser`,
  );
  assert.doesNotMatch(
    sql,
    new RegExp(
      `create\\s+policy\\s+[^;]+\\s+on\\s+public\\.${tableName}\\b`,
      'i',
    ),
    `${tableName} nao deve criar policy de acesso direto`,
  );
};

const assertRestrictForeignKey = ({ tableSql, columnName, referencedTable }) => {
  assert.match(
    tableSql,
    new RegExp(
      `\\b${columnName}\\b[\\s\\S]{0,160}references\\s+public\\.${referencedTable}\\s*\\(\\s*id\\s*\\)\\s*on\\s+delete\\s+restrict`,
      'i',
    ),
    `${columnName} deve referenciar ${referencedTable} com ON DELETE RESTRICT`,
  );
};

const assertLeadingIndex = ({ sql, tableName, columnName }) => {
  assert.match(
    sql,
    new RegExp(
      `create\\s+index\\s+if\\s+not\\s+exists\\s+[a-z_][a-z0-9_]*\\s+on\\s+public\\.${tableName}\\s*\\(\\s*\\b${columnName}\\b`,
      'i',
    ),
    `${tableName}.${columnName} deve liderar um indice explicito`,
  );
};

const assertTriggerFunctionHardened = (sql, functionName) => {
  const block = extractFunction(sql, functionName);

  assert.match(block, /security\s+definer/i);
  assert.match(block, /set\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
  assert.match(
    sql,
    new RegExp(
      `revoke\\s+all(?:\\s+privileges)?\\s+on\\s+function\\s+public\\.${functionName}\\s*\\(\\s*\\)\\s+from\\s+[^;]*\\bpublic\\b[^;]*\\banon\\b[^;]*\\bauthenticated\\b`,
      'i',
    ),
    `${functionName} deve revogar EXECUTE dos papeis de browser`,
  );

  return block;
};

test('guarda reconhece mutacoes em tabelas operacionais com identificadores SQL quoted', () => {
  const mutations = [
    ['aluno_presenca', 'UPDATE "public"."aluno_presenca" SET status = \'presente\''],
    ['aluno_presenca', 'ALTER TABLE ONLY "public" . "aluno_presenca" ADD COLUMN origem text'],
    ['aulas_emusys', 'DELETE FROM "public"."aulas_emusys" WHERE id = 1'],
  ];

  for (const [tableName, sql] of mutations) {
    assert.match(sql, protectedTableMutationPattern(tableName));
  }

  assert.doesNotMatch(
    'UPDATE "public"."aluno_presenca_backup" SET status = \'presente\'',
    protectedTableMutationPattern('aluno_presenca'),
  );
});

test('guarda reconhece JOIN cartesiano com ON TRUE ou ON 1 = 1', () => {
  const cartesianJoins = [
    'FROM public.professores_cursos pc JOIN public.professores_unidades pu ON TRUE',
    'FROM public.professores_cursos pc JOIN public.professores_unidades pu ON ( TRUE )',
    'FROM public.professores_cursos pc JOIN public.professores_unidades pu ON ((TRUE))',
    'FROM public.professores_cursos pc JOIN public.professores_unidades pu ON 1 = 1',
    'FROM public.professores_cursos pc JOIN public.professores_unidades pu ON ((1=1))',
    'FROM public.professores_unidades pu JOIN public.professores_cursos pc ON (1) = (1)',
    'FROM public.professores_unidades pu JOIN public.professores_cursos pc ON (((1) = (1)))',
    'FROM public.professores_cursos pc JOIN public.professores_unidades pu ON 1 = 1 WHERE pc.ativo',
    'FROM public.professores_cursos pc JOIN public.professores_unidades pu ON TRUE LEFT JOIN public.unidades u ON u.id = pu.unidade_id',
  ];

  for (const sql of cartesianJoins) {
    assert.equal(hasProfessorCourseUnitCartesianProduct(sql), true, sql);
  }

  const relationalJoins = [
    'FROM public.professores_cursos pc JOIN public.professores_unidades pu ON pu.unidade_id = pc.unidade_id',
    'FROM public.professores_cursos pc JOIN public.professores_unidades pu ON 1 = 1.5',
    'FROM public.professores_cursos pc JOIN public.professores_unidades pu ON 1 = 1 AND pu.unidade_id = pc.unidade_id',
    'FROM public.professores_cursos pc JOIN public.professores_unidades pu ON TRUE AND pu.unidade_id = pc.unidade_id',
    'FROM public.professores_cursos pc JOIN public.professores_unidades pu ON ((1=1)) OR pu.unidade_id = pc.unidade_id',
  ];

  for (const sql of relationalJoins) {
    assert.equal(hasProfessorCourseUnitCartesianProduct(sql), false, sql);
  }
});

test('Task 2 disponibiliza a migration aditiva do schema segmentado', () => {
  assert.equal(
    existsSync(schemaMigration),
    true,
    `${schemaMigration} deve existir antes de validar o contrato da Task 2`,
  );
});

test(
  'Task 2 cria matriz de metas e segmentos de snapshot com FKs restritivas',
  { skip: !existsSync(schemaMigration) },
  () => {
    const sql = read(schemaMigration);
    const configTableName =
      'health_score_professor_v3_config_metas_curso_modalidade';
    const snapshotTableName =
      'health_score_professor_v3_snapshot_metrica_segmentos';
    const configTableSql = extractCreateTable(sql, configTableName);
    const snapshotTableSql = extractCreateTable(sql, snapshotTableName);

    assert.match(configTableSql, /\bid\s+uuid\s+primary\s+key\s+default\s+gen_random_uuid\s*\(\s*\)/i);
    assert.match(snapshotTableSql, /\bid\s+uuid\s+primary\s+key\s+default\s+gen_random_uuid\s*\(\s*\)/i);

    for (const foreignKey of [
      {
        tableSql: configTableSql,
        columnName: 'config_id',
        referencedTable: 'health_score_professor_v3_config_versoes',
      },
      {
        tableSql: configTableSql,
        columnName: 'unidade_id',
        referencedTable: 'unidades',
      },
      {
        tableSql: configTableSql,
        columnName: 'curso_id',
        referencedTable: 'cursos',
      },
      {
        tableSql: snapshotTableSql,
        columnName: 'snapshot_metrica_id',
        referencedTable: 'health_score_professor_v3_snapshot_metricas',
      },
      {
        tableSql: snapshotTableSql,
        columnName: 'unidade_id',
        referencedTable: 'unidades',
      },
      {
        tableSql: snapshotTableSql,
        columnName: 'curso_id',
        referencedTable: 'cursos',
      },
    ]) {
      assertRestrictForeignKey(foreignKey);
    }

    assert.doesNotMatch(
      snapshotTableSql,
      /\bconfig_meta_segmento_id\b\s+uuid\s+not\s+null/i,
      'config_meta_segmento_id deve continuar nullable para registrar regra ausente',
    );
    assert.match(
      configTableSql,
      /unique\s*\(\s*config_id\s*,\s*unidade_id\s*,\s*curso_id\s*,\s*modalidade\s*\)/i,
    );
    assert.match(
      configTableSql,
      /unique\s*\(\s*id\s*,\s*unidade_id\s*,\s*curso_id\s*,\s*modalidade\s*\)/i,
      'a matriz deve expor chave candidata composta para a FK do segmento',
    );
    assert.match(
      snapshotTableSql,
      /foreign\s+key\s*\(\s*config_meta_segmento_id\s*,\s*unidade_id\s*,\s*curso_id\s*,\s*modalidade\s*\)\s*references\s+public\.health_score_professor_v3_config_metas_curso_modalidade\s*\(\s*id\s*,\s*unidade_id\s*,\s*curso_id\s*,\s*modalidade\s*\)\s*on\s+delete\s+restrict/i,
      'config_meta_segmento_id deve preservar unidade, curso e modalidade',
    );
    assert.doesNotMatch(
      snapshotTableSql,
      /\bconfig_meta_segmento_id\b\s+uuid[\s\S]{0,160}references\s+public\.health_score_professor_v3_config_metas_curso_modalidade\s*\(\s*id\s*\)/i,
      'a FK simples por id nao impede meta de outro segmento',
    );
    assert.match(
      snapshotTableSql,
      /unique\s*\(\s*snapshot_metrica_id\s*,\s*unidade_id\s*,\s*curso_id\s*,\s*modalidade\s*\)/i,
    );
  },
);

test(
  'Task 2 restringe modalidade e estados da matriz sem fallback numerico',
  { skip: !existsSync(schemaMigration) },
  () => {
    const sql = read(schemaMigration);
    const tableName = 'health_score_professor_v3_config_metas_curso_modalidade';
    const tableSql = extractCreateTable(sql, tableName);

    assertColumnAllowedValues({
      tableSql,
      allSql: sql,
      tableName,
      columnName: 'modalidade',
      requiredValues: ['individual', 'turma'],
      exact: true,
    });
    assertColumnAllowedValues({
      tableSql,
      allSql: sql,
      tableName,
      columnName: 'estado',
      requiredValues: ['configurada', 'nao_ofertada'],
      exact: true,
    });

    assert.match(
      tableSql,
      /check\s*\(\s*\(\s*estado\s*=\s*'nao_ofertada'\s+and\s+capacidade_maxima\s+is\s+null\s+and\s+meta_media_turma\s+is\s+null\s+and\s+meta_carteira_curso\s+is\s+null\s*\)\s+or\s+\(\s*estado\s*=\s*'configurada'\s+and\s+capacidade_maxima\s+is\s+not\s+null\s+and\s+meta_media_turma\s+is\s+not\s+null\s+and\s+meta_carteira_curso\s+is\s+not\s+null\s+and\s+capacidade_maxima\s*>\s*0\s+and\s+meta_media_turma\s*>\s*0\s+and\s+meta_carteira_curso\s*>\s*0\s+and\s+meta_media_turma\s*<=\s*capacidade_maxima\s*\)\s*\)/i,
      'estado configurada exige tres metas positivas e nao_ofertada exige metas nulas',
    );
    assert.match(tableSql, /\bparametros\s+jsonb\s+not\s+null\s+default\s+'\{\}'::jsonb/i);
    assert.match(tableSql, /\bcriado_em\s+timestamptz\s+not\s+null\s+default\s+now\s*\(\s*\)/i);
    assert.match(tableSql, /\batualizado_em\s+timestamptz\s+not\s+null\s+default\s+now\s*\(\s*\)/i);
  },
);

test(
  'Task 2 explicita bases, contagens e limites numericos dos segmentos',
  { skip: !existsSync(schemaMigration) },
  () => {
    const sql = read(schemaMigration);
    const tableName = 'health_score_professor_v3_snapshot_metrica_segmentos';
    const tableSql = extractCreateTable(sql, tableName);

    assertColumnAllowedValues({
      tableSql,
      allSql: sql,
      tableName,
      columnName: 'modalidade',
      requiredValues: ['individual', 'turma'],
      exact: true,
    });
    assertColumnAllowedValues({
      tableSql,
      allSql: sql,
      tableName,
      columnName: 'estado_base',
      requiredValues: [
        'ok',
        'sem_base_zero_carteira',
        'sem_base_sem_meta',
        'segmentacao_incompleta',
        'nao_ofertada',
      ],
    });

    for (const column of [
      'pessoas_unicas',
      'vinculos_ativos',
      'turmas_elegiveis',
      'ocupacoes_unicas',
    ]) {
      assert.match(
        tableSql,
        new RegExp(
          `\\b${column}\\b\\s+integer[\\s\\S]{0,100}check\\s*\\(\\s*${column}\\s*>=\\s*0\\s*\\)`,
          'i',
        ),
        `${column} deve ser inteiro nao negativo`,
      );
    }

    for (const column of [
      'capacidade_maxima',
      'meta_aplicada',
      'numerador',
      'denominador',
    ]) {
      assert.match(
        tableSql,
        new RegExp(
          `\\b${column}\\b\\s+numeric(?:\\s*\\([^)]*\\))?[\\s\\S]{0,100}check\\s*\\(\\s*${column}\\s+is\\s+null\\s+or\\s+${column}\\s*>=\\s*0\\s*\\)`,
          'i',
        ),
        `${column} deve ser nulo ou nao negativo`,
      );
    }

    assert.match(
      tableSql,
      /\bnota\s+numeric(?:\s*\([^)]*\))?[\s\S]{0,100}check\s*\(\s*nota\s+is\s+null\s+or\s+nota\s+between\s+0\s+and\s+100\s*\)/i,
    );
    for (const column of ['fonte', 'regra_versao']) {
      assert.match(
        tableSql,
        new RegExp(
          `\\b${column}\\b\\s+text\\s+not\\s+null\\s+check\\s*\\(\\s*nullif\\s*\\(\\s*btrim\\s*\\(\\s*${column}\\s*\\)\\s*,\\s*''\\s*\\)\\s+is\\s+not\\s+null\\s*\\)`,
          'i',
        ),
        `${column} deve ser texto nao vazio`,
      );
    }
    assert.match(tableSql, /\bdetalhes\s+jsonb\s+not\s+null\s+default\s+'\{\}'::jsonb/i);
    assert.match(tableSql, /\bcriado_em\s+timestamptz\s+not\s+null\s+default\s+now\s*\(\s*\)/i);
  },
);

test(
  'Task 2 torna matriz e segmentos imutaveis nos estados historicos',
  { skip: !existsSync(schemaMigration) },
  () => {
    const sql = read(schemaMigration);
    const configFunction = assertTriggerFunctionHardened(
      sql,
      'fn_health_score_professor_v3_bloquear_config_meta_segmentada',
    );
    const snapshotFunction = assertTriggerFunctionHardened(
      sql,
      'fn_health_score_professor_v3_bloquear_snapshot_segmento_fechado',
    );
    const configConsistencyFunction = assertTriggerFunctionHardened(
      sql,
      'fn_health_score_professor_v3_validar_snapshot_segmento_config',
    );

    assert.match(configFunction, /array\s*\[\s*old\.config_id\s*,\s*new\.config_id\s*\]/i);
    assert.match(
      configFunction,
      /if\s+tg_op\s*=\s*'UPDATE'\s+and\s+new\.config_id\s+is\s+distinct\s+from\s+old\.config_id\s+and\s+exists\s*\([\s\S]*?from\s+public\.health_score_professor_v3_snapshot_metrica_segmentos\s+[a-z_][a-z0-9_]*[\s\S]*?config_meta_segmento_id\s*=\s*old\.id[\s\S]*?\)\s+then[\s\S]*?raise\s+exception/i,
      'meta referenciada por segmento de snapshot nao pode mudar de configuracao',
    );
    assert.ok(
      [
        /c\.status\s+is\s+distinct\s+from\s+'rascunho'/i,
        /c\.status\s*<>\s*'rascunho'/i,
        /c\.status\s+in\s*\(\s*'ativa'\s*,\s*'arquivada'\s*\)/i,
      ].some((pattern) => pattern.test(configFunction)),
      'somente configuracao rascunho pode sofrer mutacao na matriz',
    );
    assert.doesNotMatch(
      configFunction,
      /c\.status\s*=\s*'ativa'\s+or\s+exists/i,
      'bloquear apenas ativa deixaria configuracao arquivada mutavel',
    );
    assert.match(
      configFunction,
      /health_score_professor_v3_snapshots[\s\S]*s\.config_id\s*=\s*c\.id[\s\S]*s\.estado\s+in\s*\(\s*'fechado'\s*,\s*'invalidado'\s*\)/i,
    );
    assert.match(
      sql,
      /before\s+insert\s+or\s+update\s+or\s+delete\s+on\s+public\.health_score_professor_v3_config_metas_curso_modalidade/i,
    );

    assert.match(
      snapshotFunction,
      /array\s*\[\s*old\.snapshot_metrica_id\s*,\s*new\.snapshot_metrica_id\s*\]/i,
    );
    assert.match(
      snapshotFunction,
      /health_score_professor_v3_snapshot_metricas[\s\S]*health_score_professor_v3_snapshots[\s\S]*estado\s+in\s*\(\s*'fechado'\s*,\s*'invalidado'\s*\)/i,
    );
    assert.match(
      sql,
      /before\s+insert\s+or\s+update\s+or\s+delete\s+on\s+public\.health_score_professor_v3_snapshot_metrica_segmentos/i,
    );

    assert.match(
      configConsistencyFunction,
      /new\.config_meta_segmento_id\s+is\s+null[\s\S]*return\s+new/i,
      'segmento sem meta configurada deve continuar permitido',
    );
    assert.match(
      configConsistencyFunction,
      /health_score_professor_v3_snapshot_metricas\s+sm[\s\S]*health_score_professor_v3_snapshots\s+s[\s\S]*health_score_professor_v3_config_metas_curso_modalidade\s+m/i,
    );
    assert.match(
      configConsistencyFunction,
      /m\.config_id\s+is\s+distinct\s+from\s+s\.config_id/i,
      'a meta deve usar a mesma config do snapshot pai',
    );
    assert.match(
      sql,
      /create\s+trigger\s+[a-z_][a-z0-9_]*\s+before\s+insert\s+or\s+update\s+on\s+public\.health_score_professor_v3_snapshot_metrica_segmentos[\s\S]{0,180}execute\s+function\s+public\.fn_health_score_professor_v3_validar_snapshot_segmento_config\s*\(\s*\)/i,
    );
  },
);

test(
  'Task 2 nasce privada, indexada e sem alterar dominios existentes',
  { skip: !existsSync(schemaMigration) },
  () => {
    const sql = read(schemaMigration);
    const configTableName =
      'health_score_professor_v3_config_metas_curso_modalidade';
    const snapshotTableName =
      'health_score_professor_v3_snapshot_metrica_segmentos';

    for (const tableName of [configTableName, snapshotTableName]) {
      assertSecuredTable(sql, tableName);
      assert.match(
        sql,
        new RegExp(
          `revoke\\s+all(?:\\s+privileges)?\\s+on\\s+(?:table\\s+)?public\\.${tableName}\\s+from\\s+service_role`,
          'i',
        ),
        `${tableName} deve limpar privilegios implicitos do service_role`,
      );
      assert.match(
        sql,
        new RegExp(
          `grant\\s+select\\s+on\\s+table\\s+public\\.${tableName}\\s+to\\s+service_role`,
          'i',
        ),
        `${tableName} deve conceder ao service_role somente leitura direta`,
      );
      assert.doesNotMatch(
        sql,
        new RegExp(
          `grant\\s+(?:all|[^;]*(?:insert|update|delete|truncate|references|trigger)[^;]*)\\s+on\\s+(?:table\\s+)?public\\.${tableName}\\s+to\\s+service_role`,
          'i',
        ),
        `${tableName} nao pode conceder DML direto ao service_role`,
      );
    }

    for (const roleName of [
      'fabio_agent',
      'lia_acesso_restrito',
      'mila_acesso_restrito',
      'sol_acesso_restrito',
    ]) {
      assert.match(
        sql,
        new RegExp(`['\"]${roleName}['\"]`, 'i'),
        `${roleName} deve ter os privilegios diretos removidos`,
      );
    }

    for (const columnName of ['unidade_id', 'curso_id']) {
      assertLeadingIndex({ sql, tableName: configTableName, columnName });
    }
    for (const columnName of [
      'config_meta_segmento_id',
      'unidade_id',
      'curso_id',
    ]) {
      assertLeadingIndex({ sql, tableName: snapshotTableName, columnName });
    }

    const alteredTables = [
      ...sql.matchAll(
        /alter\s+table(?:\s+if\s+exists)?\s+public\.([a-z_][a-z0-9_]*)/gi,
      ),
    ].map((match) => match[1].toLowerCase());
    assert.deepEqual(
      [...new Set(alteredTables)].sort(),
      [configTableName, snapshotTableName].sort(),
      'a migration so pode alterar as duas tabelas novas para habilitar RLS',
    );

    assert.doesNotMatch(
      sql,
      /create\s+table(?:\s+if\s+not\s+exists)?\s+public\.professor_unidade_curso_modalidade/i,
      'a tabela de atribuicao pertence exclusivamente a Task 3',
    );
    for (const protectedTable of ['aluno_presenca', 'aulas_emusys']) {
      assert.doesNotMatch(
        sql,
        protectedTableMutationPattern(protectedTable),
        `Task 2 nao pode escrever ou alterar ${protectedTable}`,
      );
    }
    assert.doesNotMatch(
      sql,
      /(?:insert\s+into|update|delete\s+from|merge\s+into|alter\s+table|truncate(?:\s+table)?|drop\s+table)\s+(?:if\s+exists\s+)?(?:only\s+)?(?:"?public"?\.)?"?[a-z_][a-z0-9_]*churn[a-z0-9_]*"?/i,
      'Task 2 nao pode alterar tabelas do pipeline de churn',
    );
    assert.doesNotMatch(
      sql,
      /(?:alter\s+(?:function|(?:materialized\s+)?view)|drop\s+(?:function|(?:materialized\s+)?view)|create\s+or\s+replace\s+(?:function|(?:materialized\s+)?view))\s+(?:if\s+exists\s+)?(?:"?public"?\.)?"?[a-z_][a-z0-9_]*churn[a-z0-9_]*"?/i,
      'Task 2 nao pode redefinir funcoes ou views do pipeline de churn',
    );
    assert.doesNotMatch(sql, /ativar_health_score_professor_v3_config\s*\(/i);
  },
);

test('Task 3 cria atribuicao formal, temporal e privada sem produto cartesiano', () => {
  assert.equal(
    existsSync(professorSegmentMigration),
    true,
    `${professorSegmentMigration} deve implementar exclusivamente a Task 3`,
  );

  const sql = read(professorSegmentMigration);
  const tableName = 'professor_unidade_curso_modalidade';
  const tableSql = extractCreateTable(sql, tableName);

  assertColumnAllowedValues({
    tableSql,
    allSql: sql,
    tableName,
    columnName: 'modalidade',
    requiredValues: ['individual', 'turma'],
    exact: true,
  });
  assertColumnAllowedValues({
    tableSql,
    allSql: sql,
    tableName,
    columnName: 'fonte',
    requiredValues: ['manual', 'jornada', 'aula', 'revisao'],
    exact: true,
  });
  assertColumnAllowedValues({
    tableSql,
    allSql: sql,
    tableName,
    columnName: 'confianca',
    requiredValues: ['alta', 'media', 'revisada'],
    exact: true,
  });

  for (const foreignKey of [
    { tableSql, columnName: 'professor_id', referencedTable: 'professores' },
    { tableSql, columnName: 'unidade_id', referencedTable: 'unidades' },
    { tableSql, columnName: 'curso_id', referencedTable: 'cursos' },
    { tableSql, columnName: 'revisado_por', referencedTable: 'usuarios' },
  ]) {
    assertRestrictForeignKey(foreignKey);
  }

  assert.match(
    sql,
    /create\s+unique\s+index\s+if\s+not\s+exists\s+[a-z_][a-z0-9_]*\s+on\s+public\.professor_unidade_curso_modalidade\s*\(\s*professor_id\s*,\s*unidade_id\s*,\s*curso_id\s*,\s*modalidade\s*\)\s*where\s+status\s*=\s*'ativo'\s+and\s+vigencia_fim\s+is\s+null/i,
  );
  assertSecuredTable(sql, tableName);
  assert.match(sql, /get_professor_curso_modalidade_reconciliacao_v1/i);
  assert.match(sql, /salvar_professor_curso_modalidade_atribuicoes_v1/i);
  assert.match(sql, /reconciliar_professor_curso_modalidade_v1/i);
  assert.match(sql, /fn_professor_curso_modalidade_ator_v1\s*\(\s*\)/i);
  assert.doesNotMatch(
    sql,
    /fn_health_score_professor_v3_ator_gerenciador\s*\(\s*\)/i,
    'a Task 3 deve autorizar por unidade sem exigir permissao global cumulativa',
  );
  assert.match(
    sql,
    /usuario_tem_permissao\s*\(\s*v_usuario_id\s*,\s*'professores\.editar'\s*,\s*v_unidade_id\s*\)/i,
  );
  assert.match(sql, /qualidade_vinculo\s*=\s*'vinculo_utilizavel'/i);
  assert.match(sql, /conflito_modalidade_jornada_aula/i);
  assert.match(sql, /ignorados_projeto_banda/i);
  assert.equal(
    hasProfessorCourseUnitCartesianProduct(sql),
    false,
    'professores_cursos e professores_unidades nao podem formar produto cartesiano',
  );
  assert.doesNotMatch(sql, /\bqtd_alunos\b|\bturma_nome\b/i);
});
