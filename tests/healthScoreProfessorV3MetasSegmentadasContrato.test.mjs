import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const schemaMigration =
  'supabase/migrations/20260719200000_health_score_v3_metas_segmentadas_schema.sql';
const professorSegmentMigration =
  'supabase/migrations/20260719201000_professor_unidade_curso_modalidade.sql';

const targetMigrations = [schemaMigration, professorSegmentMigration];
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

  for (const role of ['public', 'anon']) {
    assert.match(
      sql,
      new RegExp(
        `revoke\\s+all(?:\\s+privileges)?\\s+on\\s+(?:table\\s+)?public\\.${tableName}\\s+from\\s+[^;]*\\b${role}\\b`,
        'i',
      ),
      `${tableName} deve revogar acesso de ${role}`,
    );
  }
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

test('migrations futuras definem o contrato das metas segmentadas do Health Score Professor V3', () => {
  const missingMigrations = targetMigrations.filter((path) => !existsSync(path));

  assert.deepEqual(
    missingMigrations,
    [],
    `migrations futuras ainda nao existem: ${missingMigrations.join(', ')}`,
  );

  const schemaSql = read(schemaMigration);
  const professorSegmentSql = read(professorSegmentMigration);
  const sql = `${schemaSql}\n${professorSegmentSql}`;

  const configMetasTableSql = extractCreateTable(
    schemaSql,
    'health_score_professor_v3_config_metas_curso_modalidade',
  );
  const snapshotSegmentosTableSql = extractCreateTable(
    schemaSql,
    'health_score_professor_v3_snapshot_metrica_segmentos',
  );
  const professorSegmentTableSql = extractCreateTable(
    professorSegmentSql,
    'professor_unidade_curso_modalidade',
  );

  for (const [tableName, tableSql] of [
    ['health_score_professor_v3_config_metas_curso_modalidade', configMetasTableSql],
    ['health_score_professor_v3_snapshot_metrica_segmentos', snapshotSegmentosTableSql],
    ['professor_unidade_curso_modalidade', professorSegmentTableSql],
  ]) {
    assertColumnAllowedValues({
      tableSql,
      allSql: sql,
      tableName,
      columnName: 'modalidade',
      requiredValues: ['individual', 'turma'],
      exact: true,
    });
  }

  assert.match(
    schemaSql,
    /unique\s*\(\s*config_id\s*,\s*unidade_id\s*,\s*curso_id\s*,\s*modalidade\s*\)/i,
  );
  assert.match(
    schemaSql,
    /check\s*\([\s\S]{0,200}\bmeta_media_turma\b\s*<=\s*\bcapacidade_maxima\b[\s\S]{0,200}\)/i,
  );
  assertColumnAllowedValues({
    tableSql: snapshotSegmentosTableSql,
    allSql: sql,
    tableName: 'health_score_professor_v3_snapshot_metrica_segmentos',
    columnName: 'estado_base',
    requiredValues: ['sem_base_zero_carteira'],
  });

  assertSecuredTable(
    schemaSql,
    'health_score_professor_v3_config_metas_curso_modalidade',
  );
  assertSecuredTable(
    schemaSql,
    'health_score_professor_v3_snapshot_metrica_segmentos',
  );
  assertSecuredTable(professorSegmentSql, 'professor_unidade_curso_modalidade');

  for (const protectedTable of ['aluno_presenca', 'aulas_emusys']) {
    assert.doesNotMatch(
      sql,
      protectedTableMutationPattern(protectedTable),
      `migrations de metas segmentadas nao podem escrever ou alterar ${protectedTable}`,
    );
  }

  assert.doesNotMatch(
    sql,
    /(?:insert\s+into|update|delete\s+from|merge\s+into|alter\s+table|truncate(?:\s+table)?|drop\s+table)\s+(?:if\s+exists\s+)?(?:only\s+)?(?:"?public"?\.)?"?[a-z_][a-z0-9_]*churn[a-z0-9_]*"?/i,
    'migrations de metas segmentadas nao podem escrever ou alterar tabelas do pipeline de churn',
  );
  assert.doesNotMatch(
    sql,
    /(?:alter\s+(?:function|(?:materialized\s+)?view)|drop\s+(?:function|(?:materialized\s+)?view)|create\s+or\s+replace\s+(?:function|(?:materialized\s+)?view))\s+(?:if\s+exists\s+)?(?:"?public"?\.)?"?[a-z_][a-z0-9_]*churn[a-z0-9_]*"?/i,
    'migrations de metas segmentadas nao podem redefinir funcoes ou views do pipeline de churn',
  );

  assert.equal(
    hasProfessorCourseUnitCartesianProduct(professorSegmentSql),
    false,
    'professores_cursos e professores_unidades nao podem formar produto cartesiano',
  );
});
