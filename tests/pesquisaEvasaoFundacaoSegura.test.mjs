import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260730170000_pesquisa_evasao_fundacao_segura.sql',
);
const sql = existsSync(migrationPath)
  ? readFileSync(migrationPath, 'utf8')
  : '';

const privateTables = [
  'pesquisa_evasao',
  'pesquisa_evasao_templates',
  'pesquisa_evasao_assinaturas',
  'pesquisa_evasao_previews',
  'pesquisa_evasao_mensagens',
  'pesquisa_evasao_transcricoes',
  'pesquisa_evasao_analises',
];

const serviceOnlyTables = [
  'pesquisa_evasao_templates',
  'pesquisa_evasao_assinaturas',
  'pesquisa_evasao_previews',
];

const conversationTables = [
  'pesquisa_evasao_mensagens',
  'pesquisa_evasao_transcricoes',
  'pesquisa_evasao_analises',
];

const approvedOperationalPermissions = [
  'sucesso_aluno.evasao.ver',
  'sucesso_aluno.evasao.enviar',
  'sucesso_aluno.evasao.revisar',
  'sucesso_aluno.evasao.gerir_acoes',
  'sucesso_aluno.evasao.modo_teste',
];

const catalogPermissions = [
  ...approvedOperationalPermissions,
  'sucesso_aluno.evasao.relatorios',
];

const approvedLegacyTestIds = [
  '5edc499f-4a91-4ebb-a291-0f052bc16351',
  '416624a9-2d74-4c26-a083-c6aadba21bf2',
  '718fa72e-ca51-4995-960f-575bb00c2b0e',
  '1b918f39-c528-431d-9d7d-3d9160982e6a',
  '61ebbbd0-a8e8-4e77-99ee-d4ff9bcc6f03',
  '147a6632-fccb-4089-9ae0-13db822d7bf9',
];

const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function maskSqlCommentsAndStrings(value) {
  const chars = [...value];

  for (let index = 0; index < chars.length;) {
    if (chars[index] === '-' && chars[index + 1] === '-') {
      chars[index++] = ' ';
      chars[index++] = ' ';
      while (index < chars.length && chars[index] !== '\n') {
        chars[index++] = ' ';
      }
      continue;
    }

    if (chars[index] === '/' && chars[index + 1] === '*') {
      chars[index++] = ' ';
      chars[index++] = ' ';
      while (
        index < chars.length &&
        !(chars[index] === '*' && chars[index + 1] === '/')
      ) {
        if (chars[index] !== '\n') chars[index] = ' ';
        index += 1;
      }
      if (index < chars.length) {
        chars[index++] = ' ';
        chars[index++] = ' ';
      }
      continue;
    }

    if (chars[index] === "'") {
      chars[index++] = ' ';
      while (index < chars.length) {
        if (chars[index] === "'" && chars[index + 1] === "'") {
          chars[index++] = ' ';
          chars[index++] = ' ';
          continue;
        }
        if (chars[index] === "'") {
          chars[index++] = ' ';
          break;
        }
        if (chars[index] !== '\n') chars[index] = ' ';
        index += 1;
      }
      continue;
    }

    index += 1;
  }

  return chars.join('');
}

const stripSqlComments = (value) =>
  value
    .replace(/--.*$/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');

const normalizeSql = (value) =>
  stripSqlComments(value)
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),])\s*/g, '$1')
    .trim()
    .toLowerCase();

const statementRecords = (value) => {
  const result = [];
  const maskedValue = maskSqlCommentsAndStrings(value);
  let start = 0;

  for (let index = 0; index < value.length; index += 1) {
    if (maskedValue[index] !== ';') continue;
    const text = value.slice(start, index).trim();
    if (text) result.push({ text, start });
    start = index + 1;
  }

  const tail = value.slice(start).trim();
  if (tail) result.push({ text: tail, start });
  return result;
};

const statements = (value) =>
  statementRecords(value).map(({ text }) => text);

const normalizedType = (value) =>
  value
    .trim()
    .replace(/\s+default\s+[\s\S]*$/i, '')
    .replace(/^p_[a-z0-9_]+\s+/i, '')
    .replace(/\bcharacter\s+varying\b/i, 'varchar')
    .replace(/\s+/g, ' ')
    .toLowerCase();

function getFunctionParts(name, expectedTypes, source = sql) {
  const maskedSql = maskSqlCommentsAndStrings(source);
  const matcher = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${escapeRegex(name)}\\s*\\(([^)]*)\\)`,
    'gi',
  );

  for (const match of maskedSql.matchAll(matcher)) {
    const actualTypes = match[1]
      .split(',')
      .map(normalizedType);

    if (
      actualTypes.length === expectedTypes.length &&
      actualTypes.every((type, index) => type === expectedTypes[index])
    ) {
      const headerTail = maskedSql.slice(match.index + match[0].length);
      const opening = /\bas\s+(\$[a-z0-9_]*\$)/i.exec(headerTail);
      assert.ok(opening, `delimitador AS ausente em ${name}`);

      const openingTagOffset =
        match.index +
        match[0].length +
        opening.index +
        opening[0].lastIndexOf(opening[1]);
      const tag = opening[1];
      const bodyStart = openingTagOffset + tag.length;
      const closingTagOffset = source.indexOf(tag, bodyStart);
      assert.notEqual(
        closingTagOffset,
        -1,
        `delimitador final ${tag} ausente em ${name}`,
      );
      const semicolonOffset =
        source.indexOf(';', closingTagOffset + tag.length);
      assert.notEqual(
        semicolonOffset,
        -1,
        `terminador da funcao ${name} ausente`,
      );

      return {
        header: source.slice(match.index, openingTagOffset),
        body: source.slice(bodyStart, closingTagOffset),
        definition: source.slice(match.index, semicolonOffset + 1),
      };
    }
  }

  assert.fail(
    `funcao ${name}(${expectedTypes.join(', ')}) ausente na migration`,
  );
}

const getFunctionDefinition = (name, expectedTypes) =>
  getFunctionParts(name, expectedTypes).definition;

function getCreateTableDefinition(tableName) {
  const match = sql.match(
    new RegExp(
      `create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+public\\.${escapeRegex(tableName)}\\s*\\(([\\s\\S]*?)[\\r\\n]\\s*\\)\\s*;`,
      'i',
    ),
  );

  assert.ok(match, `create table de ${tableName} ausente`);
  return match[1];
}

function getReturnsClause(header) {
  const maskedHeader = maskSqlCommentsAndStrings(header);
  const match = maskedHeader.match(
    /\breturns\s+(table\s*\([\s\S]*?\)|uuid|boolean)\s*(?=\blanguage\b|\bsecurity\b|\bset\b|$)/i,
  );
  assert.ok(match, 'clausula RETURNS real ausente no cabecalho da funcao');
  return `returns ${match[1]}`;
}

function assertExactReturns(header, expectedReturns) {
  assert.equal(
    normalizeSql(getReturnsClause(header)),
    normalizeSql(expectedReturns),
    'RETURNS da assinatura foi alterado',
  );
}

function assertNoAuthorizationBypass(value, context) {
  const code = stripSqlComments(value);
  assert.doesNotMatch(
    code,
    /(?:\btrue\b|\b1\s*=\s*1\b)\s*\)*\s*or\b|\bor\s*\(*\s*(?:true\b|1\s*=\s*1\b)/i,
    `${context} aceita TRUE/1=1 em um lado de OR`,
  );
  assert.doesNotMatch(
    code,
    /\breturn\s+true\b/i,
    `${context} aceita RETURN TRUE`,
  );
  assert.doesNotMatch(
    code,
    /['"]admin['"]/i,
    `${context} aceita bypass admin por COALESCE/igualdade/IN/ANY`,
  );
  assert.doesNotMatch(
    code,
    /\b1\s*=\s*1\b|\btrue\s*=\s*true\b|\bfalse\s*=\s*false\b|\b([a-z_][a-z0-9_.]*)\s*=\s*\1\b/i,
    `${context} aceita tautologia`,
  );
}

const forbiddenClientRoles = [
  'public',
  'anon',
  'authenticated',
  'mila_acesso_restrito',
  'sol_acesso_restrito',
  'fabio_agent',
  'lia_acesso_restrito',
];

function assertNoForbiddenSchemaWidePrivileges(source) {
  for (const statement of statements(source)) {
    const executableStatement = stripSqlComments(statement).trim();
    const incompatible =
      /^\s*grant\b[\s\S]*\bon\s+all\s+(?:tables|sequences|functions)\s+in\s+schema\s+public\b[\s\S]*\bto\b/i
        .test(executableStatement) ||
      /^\s*alter\s+default\s+privileges\b[\s\S]*\bgrant\b[\s\S]*\bon\s+(?:tables|sequences|functions)\b[\s\S]*\bto\b/i
        .test(executableStatement);
    if (!incompatible) continue;

    const roles = executableStatement
      .split(/\bto\b/i)
      .at(-1)
      .replace(/\bwith\s+grant\s+option\b/gi, '')
      .split(',')
      .map((role) =>
        role
          .trim()
          .replace(/^group\s+/i, '')
          .replace(/^"|"$/g, '')
          .toLowerCase());
    assert.equal(
      roles.some((role) => forbiddenClientRoles.includes(role)),
      false,
      'GRANT global/default incompatível para role cliente',
    );
  }
}

function extractPartialIndexPredicate(statement) {
  const code = stripSqlComments(statement).trim();
  const match = code.match(
    /^create\s+unique\s+index\b[\s\S]*?\bon\s+public\.[a-z0-9_]+\s*\([^)]*\)\s+where\s+([\s\S]+)$/i,
  );
  assert.ok(match, 'indice unico parcial sem predicado ancorado');
  return match[1].trim();
}

function assertPartialIndexPredicate(statement, expected, context) {
  const predicate = extractPartialIndexPredicate(statement);
  assertNoAuthorizationBypass(predicate, context);
  assert.match(
    normalizeSql(predicate).replace(/\s*=\s*/g, '='),
    expected,
    `${context} invalido`,
  );
}

function assertBlockingServiceRoleGate(body) {
  const serviceGate = [...body.matchAll(
    /\bif\s+([\s\S]*?)\s+then\b([\s\S]*?)\bend\s+if\b/gi,
  )].find((match) =>
    /\bauth\.role\s*\(\s*\)/i.test(match[1]) &&
    /['"]service_role['"]/i.test(match[1]));
  assert.ok(serviceGate, 'criar precisa de gate service_role executavel');

  const condition = normalizeSql(serviceGate[1])
    .replace(/^\(([\s\S]*)\)$/, '$1');
  assert.equal(
    condition,
    normalizeSql("auth.role() is distinct from 'service_role'"),
    'gate deve bloquear exatamente role distinta de service_role',
  );
  assertNoAuthorizationBypass(serviceGate[1], 'gate service_role');
  assert.doesNotMatch(serviceGate[1], /\band\s+false\b/i);
  assert.match(
    serviceGate[2],
    /\b(?:raise|return)\b/i,
    'ramo nao-service precisa interromper a funcao com RAISE/RETURN',
  );
}

function assertGovernedReturn(statement) {
  assert.match(
    statement,
    /fn_usuario_atual_tem_permissao_estrita\s*\(\s*['"]sucesso_aluno\.evasao\.enviar['"](?:\s*::\s*varchar)?\s*,\s*(?:[a-z_][a-z0-9_]*\.)?[a-z_]*unidade_id\s*\)/i,
  );
  assertNoAuthorizationBypass(statement, 'RETURN de pode_enviar');
}

function assertNoNominalSeedDml(source) {
  const protectedTargets =
    '(?:pesquisa_evasao_assinaturas|pesquisa_evasao_templates|pesquisa_evasao_previews|usuario_perfis)';
  const rolloutTokens =
    /public\.usuarios\b|\b(?:email|nome)\b|\b(?:29|30)\b|\blike\b|jessyca@lamusic\.com\.br|fabi@gmail\.com|368d47f5-2d88-4475-bc14-ba084a9a348e|2ec861f6-023f-4d7b-9927-3960ad8c2a92|95553e96-971b-4590-a6eb-0201d013c14d/i;

  for (const statement of statements(source)) {
    const maskedStatement = maskSqlCommentsAndStrings(statement);
    if (
      !new RegExp(
        `\\b(?:insert\\s+into|update|merge\\s+into)\\s+public\\.${protectedTargets}\\b`,
        'i',
      ).test(maskedStatement)
    ) continue;

    assert.doesNotMatch(
      statement,
      rolloutTokens,
      'seed/DML nominal deve ficar no runbook da Task 7',
    );
    assert.doesNotMatch(
      maskedStatement,
      /\b(?:insert\s+into|update|merge\s+into)\s+public\.usuario_perfis\b/i,
      'usuario_perfis nao pode ser populada nesta migration',
    );
  }
}

const privilegeUniverse = {
  table: ['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'],
  sequence: ['usage', 'select', 'update'],
  function: ['execute'],
};

function parsePrivilegeStatement(statement) {
  const executableText = stripSqlComments(statement.text).trim();
  const match = executableText.match(
    /^\s*(grant|revoke)\s+([\s\S]+?)\s+on\s+(?:(table|sequence|function)\s+)?([\s\S]+?)\s+(to|from)\s+([\s\S]+)$/i,
  );
  if (!match) return null;

  const kind = (match[3] ?? 'table').toLowerCase();
  if (!(kind in privilegeUniverse)) return null;

  return {
    action: match[1].toLowerCase(),
    privileges: match[2]
      .split(',')
      .map((privilege) => privilege.trim().toLowerCase())
      .map((privilege) =>
        privilege === 'all privileges' ? 'all' : privilege),
    kind,
    objects: match[4],
    roles: match[6]
      .replace(/\bwith\s+grant\s+option\b/gi, '')
      .replace(/\b(?:cascade|restrict)\b/gi, '')
      .split(',')
      .map((role) =>
        role
          .trim()
          .replace(/^group\s+/i, '')
          .replace(/^"|"$/g, '')
          .toLowerCase()),
    start: statement.start,
    text: executableText,
  };
}

const privilegeEvents = statementRecords(sql)
  .map(parsePrivilegeStatement)
  .filter(Boolean);

function eventTargets(event, kind, objectName, signature = '') {
  if (event.kind !== kind) return false;
  if (kind === 'function') {
    return normalizeSql(event.objects).includes(
      normalizeSql(`public.${objectName}(${signature})`),
    );
  }

  return new RegExp(
    `(?:^|,)\\s*(?:only\\s+)?public\\.${escapeRegex(objectName)}(?:\\s|,|$)`,
    'i',
  ).test(event.objects);
}

function finalPrivilegeState(kind, objectName, role, signature = '') {
  const state = new Set();
  const universe = privilegeUniverse[kind];
  const events = privilegeEvents
    .filter(
      (event) =>
        eventTargets(event, kind, objectName, signature) &&
        event.roles.includes(role.toLowerCase()),
    )
    .sort((left, right) => left.start - right.start);

  for (const event of events) {
    const privileges = event.privileges.includes('all')
      ? universe
      : event.privileges;
    for (const privilege of privileges) {
      if (event.action === 'grant') state.add(privilege);
      else state.delete(privilege);
    }
  }

  return { state, events };
}

function assertFinalPrivileges(
  kind,
  objectName,
  role,
  expected,
  signature = '',
) {
  const { state, events } =
    finalPrivilegeState(kind, objectName, role, signature);
  assert.ok(
    events.length > 0,
    `nenhum GRANT/REVOKE de ${kind} ${objectName} para role ${role}`,
  );
  assert.deepEqual(
    [...state].sort(),
    [...expected].sort(),
    `estado final incorreto em ${kind} ${objectName} para role ${role}`,
  );
}

function assertRlsEnabled(tableName) {
  assert.match(
    sql,
    new RegExp(
      `alter\\s+table\\s+public\\.${escapeRegex(tableName)}\\s+enable\\s+row\\s+level\\s+security`,
      'i',
    ),
  );
}

function assertUniqueHeaderColumn(columnName) {
  const matchingStatements = statements(sql).filter((statement) => {
    const isHeaderAlter =
      /\balter\s+table\s+public\.pesquisa_evasao\b/i.test(statement);
    const isHeaderIndex =
      /\bcreate\s+unique\s+index\b/i.test(statement) &&
      /\bon\s+public\.pesquisa_evasao\s*\(/i.test(statement);
    const isUniqueConstraint = new RegExp(
      `(?:\\b${escapeRegex(columnName)}\\b[^,;]*\\bunique\\b|\\bunique\\s*\\(\\s*${escapeRegex(columnName)}\\s*\\))`,
      'i',
    ).test(statement);
    const isUniqueIndex =
      isHeaderIndex &&
      new RegExp(
        `\\bon\\s+public\\.pesquisa_evasao\\s*\\(\\s*${escapeRegex(columnName)}\\s*\\)`,
        'i',
      ).test(statement);

    return (isHeaderAlter && isUniqueConstraint) || isUniqueIndex;
  });

  assert.ok(
    matchingStatements.length > 0,
    `${columnName} precisa ser unico no cabecalho pesquisa_evasao`,
  );
}

function assertGovernedPrivatePolicy(statement) {
  const policy = stripSqlComments(statement).trim();
  const tableMatch = policy.match(
    /\bon\s+public\.(pesquisa_evasao(?:_(?:templates|assinaturas|previews|mensagens|transcricoes|analises))?)\b/i,
  );
  assert.ok(tableMatch, 'policy nao pertence a tabela privada conhecida');
  const tableName = tableMatch[1].toLowerCase();

  assert.equal(
    serviceOnlyTables.includes(tableName),
    false,
    `${tableName} e service-only e nao pode ter policy`,
  );
  assert.match(policy, /\bfor\s+select\b/i, 'policy privada deve ser SELECT');
  assert.match(policy, /sucesso_aluno\.evasao\.ver/i);
  assert.match(policy, /\bfn_usuario_atual_tem_permissao_estrita\s*\(/i);
  assert.doesNotMatch(policy, /\bauth\.uid\s*\(\s*\)\s+is\s+not\s+null\b/i);
  assertNoAuthorizationBypass(policy, `policy ${tableName}`);

  if (tableName === 'pesquisa_evasao') {
    assert.match(
      policy,
      /fn_usuario_atual_tem_permissao_estrita\s*\([^,]+,\s*(?:[a-z_][a-z0-9_]*\.)?unidade_id\s*\)/i,
      'policy do cabecalho deve usar a unidade concreta da linha',
    );
    return;
  }

  assert.match(policy, /\bexists\s*\(\s*select\b/i);
  assert.match(policy, /\bfrom\s+public\.pesquisa_evasao\b/i);
  assert.match(policy, /\bpesquisa_id\b/i);
  assert.match(
    policy,
    /fn_usuario_atual_tem_permissao_estrita\s*\([^,]+,\s*[a-z_][a-z0-9_]*\.unidade_id\s*\)/i,
    'policy filha deve resolver a unidade no cabecalho',
  );
}

test('migration da fundacao segura existe antes de validar seus contratos', () => {
  assert.ok(
    sql,
    `migration da fundacao segura ainda nao existe: ${migrationPath}`,
  );
});

test('parser de RETURNS ignora assinaturas em comentarios e strings', () => {
  const source = `
    -- create or replace function public.exemplo(p_id integer)
    -- returns uuid language sql as $$ select null::uuid $$;
    select 'create or replace function public.exemplo(p_id integer) returns uuid';
    create or replace function public.exemplo(p_id integer)
    returns boolean
    language plpgsql
    as $body$
    begin
      return false;
    end;
    $body$;
  `;
  const parts = getFunctionParts('exemplo', ['integer'], source);
  assertExactReturns(parts.header, 'RETURNS boolean');
  assert.match(parts.body, /\breturn\s+false\b/i);
});

test('guards rejeitam formas adversariais sem depender da migration', () => {
  for (const bypass of [
    "return true or fn_usuario_atual_tem_permissao_estrita('x', unidade_id);",
    "return fn_usuario_atual_tem_permissao_estrita('x', unidade_id) or 1 = 1;",
    "return coalesce(u.perfil, 'admin') in ('admin');",
  ]) {
    assert.throws(() => assertNoAuthorizationBypass(bypass, 'meta-test'));
  }

  assert.throws(() =>
    assertNoForbiddenSchemaWidePrivileges(
      'grant select on all tables in schema public to authenticated;',
    ));
  assert.throws(() =>
    assertNoForbiddenSchemaWidePrivileges(
      'grant select on all tables in schema public to group anon;',
    ));
  assert.doesNotThrow(() =>
    assertNoForbiddenSchemaWidePrivileges(`
      -- grant select on all tables in schema public to anon;
      revoke all on table public.pesquisa_evasao from anon;
    `));
  assert.deepEqual(
    parsePrivilegeStatement({
      text: `-- comentario
        revoke all on table public.pesquisa_evasao from group anon`,
      start: 0,
    }).roles,
    ['anon'],
  );
  assert.throws(() =>
    assertGovernedPrivatePolicy(`
      create policy pesquisa_evasao_bypass
      on public.pesquisa_evasao
      for select
      using (auth.uid() is not null)
    `));
  assert.throws(() =>
    assertNoForbiddenSchemaWidePrivileges(
      'alter default privileges in schema public grant execute on functions to public;',
    ));
  assert.throws(() =>
    assertPartialIndexPredicate(
      'create unique index x on public.pesquisa_evasao (evasao_id) where modo_teste = false or true',
      /^\(?modo_teste=false\)?$/i,
      'meta-index',
    ));
  assert.throws(() =>
    assertBlockingServiceRoleGate(`
      if auth.role() is distinct from 'service_role' and false then
        raise exception 'negado';
      end if;
    `));
  assert.throws(() =>
    assertGovernedReturn(`
      return true or public.fn_usuario_atual_tem_permissao_estrita(
        'sucesso_aluno.evasao.enviar',
        v_unidade_id
      )
    `));
  assert.throws(() =>
    assertNoNominalSeedDml(`
      insert into public.pesquisa_evasao_assinaturas (usuario_id)
      select id from public.usuarios where id = 30
    `));
  assert.throws(() =>
    assertNoNominalSeedDml(`
      with titular as (
        select id from public.usuarios where email = 'fabi@gmail.com'
      )
      insert into public.pesquisa_evasao_assinaturas (usuario_id)
      select id from titular
    `));
});

const contractTest = (name, callback) =>
  test(name, { skip: !sql }, callback);

contractTest('remove policy ALL aberta de pesquisa_evasao', () => {
  assert.match(sql, /drop\s+policy\s+if\s+exists\s+pesquisa_evasao_all/i);
  assert.doesNotMatch(
    sql,
    /for\s+all\s+to\s+authenticated\s+using\s*\(\s*true\s*\)/i,
  );
});

contractTest('RLS usa permissao estrita e unidade da propria linha', () => {
  const privatePolicies = statements(sql).filter(
    (statement) =>
      /\bcreate\s+policy\b/i.test(statement) &&
      privateTables.some((tableName) =>
        new RegExp(`\\bon\\s+public\\.${escapeRegex(tableName)}\\b`, 'i')
          .test(statement)),
  );

  for (const tableName of ['pesquisa_evasao', ...conversationTables]) {
    assert.ok(
      privatePolicies.some((policy) =>
        new RegExp(`\\bon\\s+public\\.${escapeRegex(tableName)}\\b`, 'i')
          .test(policy)),
      `policy SELECT governada ausente em ${tableName}`,
    );
  }
  for (const tableName of serviceOnlyTables) {
    assert.equal(
      privatePolicies.some((policy) =>
        new RegExp(`\\bon\\s+public\\.${escapeRegex(tableName)}\\b`, 'i')
          .test(policy)),
      false,
      `${tableName} service-only nao pode ter policy`,
    );
  }
  for (const policy of privatePolicies) {
    assertGovernedPrivatePolicy(policy);
    assert.doesNotMatch(
      policy,
      /(?<!estrita)\bfn_usuario_atual_tem_permissao\s*\(/i,
    );
  }
});

contractTest('helper estrito ignora admin legado e exige vinculo granular', () => {
  const explicitHelper = getFunctionDefinition(
    'usuario_tem_permissao_estrita',
    ['integer', 'varchar', 'uuid'],
  );
  const currentUserHelper = getFunctionDefinition(
    'fn_usuario_atual_tem_permissao_estrita',
    ['varchar', 'uuid'],
  );
  const helpers = `${explicitHelper}\n${currentUserHelper}`;

  assert.match(explicitHelper, /\bpublic\.usuario_perfis\b/i);
  assert.match(explicitHelper, /\bpublic\.perfil_permissoes\b/i);
  assert.match(explicitHelper, /\bpublic\.permissoes\b/i);
  assert.match(explicitHelper, /\bp_unidade_id\s+is\s+not\s+null\b/i);
  assert.match(
    explicitHelper,
    /\b(?:up|usuario_perfis)\.unidade_id\s*=\s*p_unidade_id\b/i,
  );
  assert.match(
    explicitHelper,
    /\b(?:up|usuario_perfis)\.ativo\s*=\s*true\b/i,
    'helper estrito exige vinculo ativo na unidade exata',
  );
  assert.match(currentUserHelper, /\bauth\.uid\s*\(\s*\)/i);
  assert.match(currentUserHelper, /\busuario_tem_permissao_estrita\s*\(/i);
  assert.doesNotMatch(helpers, /\busuarios?\.unidade_id\s+is\s+null\b/i);
  assert.doesNotMatch(
    helpers,
    /(?<!estrita)\bfn_usuario_atual_tem_permissao\s*\(/i,
  );
  assertNoAuthorizationBypass(explicitHelper, 'usuario_tem_permissao_estrita');
  assertNoAuthorizationBypass(
    currentUserHelper,
    'fn_usuario_atual_tem_permissao_estrita',
  );
});

contractTest('catalogo e perfil dedicado ligam somente cinco permissoes', () => {
  for (const permission of catalogPermissions) {
    assert.match(sql, new RegExp(escapeRegex(permission), 'i'));
  }

  const profileStatements = statements(sql).filter(
    (statement) =>
      /\bpublic\.perfis\b/i.test(statement) &&
      /Sucesso do Aluno - Evas[aã]o/i.test(statement),
  );
  assert.ok(profileStatements.length > 0, 'perfil dedicado ausente');
  assert.match(
    profileStatements.join('\n'),
    /Sucesso do Aluno - Evas[aã]o[\s\S]*\b30\b|\b30\b[\s\S]*Sucesso do Aluno - Evas[aã]o/i,
  );

  const linkStatements = statements(sql).filter((statement) =>
    /\binsert\s+into\s+public\.perfil_permissoes\b/i.test(statement),
  );
  assert.ok(linkStatements.length > 0, 'vinculo perfil_permissoes ausente');
  const links = linkStatements.join('\n');

  for (const permission of approvedOperationalPermissions) {
    assert.match(links, new RegExp(escapeRegex(permission), 'i'));
  }
  assert.doesNotMatch(
    links,
    /sucesso_aluno\.evasao\.relatorios/i,
    '.relatorios nao pertence ao perfil operacional dedicado',
  );
});

contractTest('rollout nominal fica integralmente fora da migration', () => {
  // A verificacao executavel do runbook, terceiro usuario e escopos e Task 7.
  assertNoNominalSeedDml(sql);
  const rolloutDml = statements(sql).filter(
    (statement) =>
      /^\s*(?:insert|update|merge)\b/i.test(statement) &&
      /\bpublic\.(?:usuarios|usuario_perfis)\b/i.test(statement),
  );

  assert.doesNotMatch(
    sql,
    /\b(?:insert\s+into|update|merge\s+into)\s+public\.usuario_perfis\b/i,
    'vinculos nominais pertencem ao runbook da Task 7',
  );
  assert.doesNotMatch(sql, /\b(?:nome|email)\s+(?:i?like)\b/i);
  assert.doesNotMatch(sql, /\blower\s*\(\s*(?:[a-z_]+\.)?nome\s*\)/i);
  assert.doesNotMatch(sql, /jessyca@lamusic\.com\.br|fabi@gmail\.com/i);
  assert.doesNotMatch(
    sql,
    /368d47f5-2d88-4475-bc14-ba084a9a348e|2ec861f6-023f-4d7b-9927-3960ad8c2a92|95553e96-971b-4590-a6eb-0201d013c14d/i,
  );
  assert.doesNotMatch(
    rolloutDml.join('\n'),
    /(?:\bid\s*(?:=|in\s*\()\s*(?:29|30)\b|\b(?:29|30)\b\s*,?\s*['"])/i,
    'IDs 29/30 so podem aparecer no runbook da Task 7',
  );
});

contractTest('tabelas privadas terminam sem privilegio de roles proibidas', () => {
  for (const tableName of privateTables) {
    assertRlsEnabled(tableName);
    for (const role of forbiddenClientRoles.filter(
      (candidate) => candidate !== 'authenticated',
    )) {
      assertFinalPrivileges('table', tableName, role, []);
    }
  }
});

contractTest('estado final de grants e service-only e minimo', () => {
  assertNoForbiddenSchemaWidePrivileges(sql);
  for (const tableName of ['pesquisa_evasao', ...conversationTables]) {
    assertFinalPrivileges('table', tableName, 'authenticated', ['select']);
  }

  for (const tableName of serviceOnlyTables) {
    for (const role of forbiddenClientRoles) {
      assertFinalPrivileges('table', tableName, role, []);
    }
    const authenticatedPolicies = statements(sql).filter(
      (statement) =>
        /\bcreate\s+policy\b/i.test(statement) &&
        new RegExp(`\\bon\\s+public\\.${escapeRegex(tableName)}\\b`, 'i')
          .test(statement) &&
        /\bto\s+authenticated\b/i.test(statement),
    );
    assert.equal(
      authenticatedPolicies.length,
      0,
      `${tableName} nao pode ter policy para authenticated`,
    );
  }

  const sequenceNames = new Set([
    ...[...sql.matchAll(/\bcreate\s+sequence\s+public\.([a-z0-9_]+)/gi)]
      .map((match) => match[1]),
    ...[...sql.matchAll(/\bnextval\s*\(\s*['"]public\.([a-z0-9_]+)['"]/gi)]
      .map((match) => match[1]),
  ]);
  for (const tableName of privateTables) {
    const definitionMatch = sql.match(
      new RegExp(
        `create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+public\\.${escapeRegex(tableName)}\\s*\\(([\\s\\S]*?)[\\r\\n]\\s*\\)\\s*;`,
        'i',
      ),
    );
    if (
      definitionMatch &&
      /\b(?:smallserial|serial|bigserial)\b|\bgenerated\b[\s\S]*\bas\s+identity\b/i
        .test(definitionMatch[1])
    ) {
      sequenceNames.add(`${tableName}_id_seq`);
    }
  }
  for (const sequenceName of sequenceNames) {
    for (const role of forbiddenClientRoles) {
      assertFinalPrivileges('sequence', sequenceName, role, []);
    }
  }
  for (const event of privilegeEvents.filter(
    (candidate) => candidate.kind === 'sequence' &&
      candidate.action === 'grant',
  )) {
    assert.equal(
      event.roles.some((role) =>
        forbiddenClientRoles.includes(role)),
      false,
      'sequence privada recebeu regrant para role proibida',
    );
  }
});

contractTest('assinatura ativa usa indice unico parcial', () => {
  const signatureDefinition =
    getCreateTableDefinition('pesquisa_evasao_assinaturas');
  assert.doesNotMatch(
    signatureDefinition,
    /\bunique\s*\(\s*usuario_id(?:\s*,\s*ativo)?\s*\)|\busuario_id\b[^,\n]*\bunique\b/i,
    'usuario_id nao pode ter UNIQUE global ou UNIQUE(usuario_id, ativo)',
  );
  const signatureIndexes = statements(sql).filter(
    (statement) =>
      /\bcreate\s+unique\s+index\b/i.test(statement) &&
      /\bon\s+public\.pesquisa_evasao_assinaturas\s*\(\s*usuario_id\s*\)/i
        .test(statement),
  );
  assert.equal(
    signatureIndexes.length,
    1,
    'assinatura precisa de um unico indice em usuario_id',
  );
  assertPartialIndexPredicate(
    signatureIndexes[0],
    /^\(?ativo(?:=true)?\)?$/i,
    'indice parcial de assinatura ativa',
  );
});

contractTest('preview guarda snapshot imutavel, hash, expiracao e uso unico', () => {
  const preview = getCreateTableDefinition('pesquisa_evasao_previews');

  for (const column of [
    'evasao_id',
    'unidade_id',
    'usuario_id',
    'auth_user_id',
    'assinatura_id',
    'template_id',
    'caixa_id',
    'modo_teste',
    'telefone_destino',
    'mensagem_renderizada',
    'payload_hash',
    'idempotency_key',
    'expira_em',
    'consumido_em',
  ]) {
    assert.match(preview, new RegExp(`\\b${column}\\b`, 'i'));
  }

  assert.match(
    preview,
    /\bidempotency_key\b[\s\S]*?\bunique\b|\bunique\s*\(\s*idempotency_key\s*\)/i,
  );
  assert.match(
    preview,
    /\bassinatura_id\b[\s\S]*?references\s+public\.pesquisa_evasao_assinaturas/i,
  );
  assert.match(
    preview,
    /\btemplate_id\b[\s\S]*?references\s+public\.pesquisa_evasao_templates/i,
  );
  assert.match(
    preview,
    /\bcaixa_id\b[\s\S]*?references\s+public\.whatsapp_caixas/i,
  );
});

contractTest('cabecalho ganha status, snapshots e vinculos auditaveis', () => {
  for (const column of [
    'envio_status',
    'resposta_status',
    'modo_teste',
    'telefone_destino_snapshot',
    'caixa_id',
    'executado_por_usuario_id',
    'executado_por_auth_user_id',
    'assinatura_id',
    'assinatura_nome_snapshot',
    'template_id',
    'template_versao',
    'mensagem_renderizada',
    'provider_message_id',
    'preview_id',
    'idempotency_key',
    'envio_iniciado_em',
    'primeira_interacao_em',
    'ultima_interacao_em',
    'pronta_para_revisao_em',
  ]) {
    assert.match(sql, new RegExp(`\\b${column}\\b`, 'i'));
  }

  for (const status of [
    'nao_enviado',
    'enviando',
    'incerto',
    'enviado',
    'falhou',
    'entregue',
    'lido',
    'sem_resposta',
    'coletando',
    'pronta_para_revisao',
    'em_revisao',
    'revisada',
    'expirada',
    'invalidada',
    'recusada_opt_out',
  ]) {
    assert.match(sql, new RegExp(`['"]${status}['"]`, 'i'));
  }

  assert.match(
    sql,
    /preview_id[\s\S]*references\s+public\.pesquisa_evasao_previews\s*\(\s*id\s*\)/i,
  );
  assertUniqueHeaderColumn('preview_id');
  assertUniqueHeaderColumn('idempotency_key');
});

contractTest('tabelas de conversa antecipadas preservam vinculos e idempotencia', () => {
  const messages = getCreateTableDefinition('pesquisa_evasao_mensagens');
  const transcriptions =
    getCreateTableDefinition('pesquisa_evasao_transcricoes');
  const analyses = getCreateTableDefinition('pesquisa_evasao_analises');

  for (const column of [
    'pesquisa_id',
    'caixa_id',
    'direcao',
    'provider_message_id',
    'telefone_normalizado',
    'tipo',
    'texto',
    'audio_storage_path',
    'provider_created_at',
    'recebido_em',
    'resolution_status',
    'substantividade',
    'correlation_id',
    'idempotency_key',
  ]) {
    assert.match(messages, new RegExp(`\\b${column}\\b`, 'i'));
  }
  assert.match(
    sql,
    /unique[\s\S]*\(\s*caixa_id\s*,\s*provider_message_id\s*\)[\s\S]*where[\s\S]*provider_message_id\s+is\s+not\s+null/i,
  );
  assert.match(
    transcriptions,
    /\bunique\s*\(\s*mensagem_id\s*,\s*versao\s*\)/i,
  );
  assert.match(
    analyses,
    /\bunique\s*\(\s*pesquisa_id\s*,\s*versao\s*\)/i,
  );
});

contractTest('allowlist legada tem seis UUIDs e backfill falha fechado', () => {
  const allowlist = sql.match(
    /\bv_ids\s+uuid\[\]\s*:=\s*array\s*\[([\s\S]*?)\]\s*::\s*uuid\[\]/i,
  );
  assert.ok(allowlist, 'allowlist explicita v_ids ausente');

  const uuidPattern =
    /['"]([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})['"]/gi;
  const ids = [...allowlist[1].matchAll(uuidPattern)]
    .map((match) => match[1].toLowerCase());

  assert.deepEqual(
    [...ids].sort(),
    [...approvedLegacyTestIds].sort(),
    'allowlist deve conter somente os seis UUIDs aprovados',
  );
  assert.match(sql, /\bcardinality\s*\(\s*v_ids\s*\)\s*<>\s*6\b/i);
  assert.match(sql, /\bv_total\s*<>\s*6\b/i);
  assert.match(sql, /\bv_telefones\s*<>\s*1\b/i);
  assert.match(sql, /\bv_telefones_vazios\s*<>\s*0\b/i);
  assert.match(
    sql,
    /count\s*\(\s*distinct\s+nullif\s*\(\s*regexp_replace[\s\S]*?['"]\\D['"][\s\S]*?['"]g['"]/i,
  );
  assert.match(
    sql,
    /count\s*\(\s*\*\s*\)\s+filter\s*\([\s\S]*?regexp_replace[\s\S]*?is\s+null/i,
  );

  const backfillUpdates = statements(sql).filter(
    (statement) =>
      /\bupdate\s+public\.pesquisa_evasao\b/i.test(statement) &&
      /\bset\s+modo_teste\s*=\s*true\b/i.test(statement),
  );
  assert.equal(
    backfillUpdates.length,
    1,
    'backfill modo_teste deve ter um unico UPDATE escopado',
  );
  assert.match(
    backfillUpdates[0],
    /\bwhere\s+(?:[a-z_]+\.)?id\s*=\s*any\s*\(\s*v_ids\s*\)/i,
  );
});

contractTest('testes nao alimentam stats nem escritas derivadas', () => {
  const stats = getFunctionDefinition(
    'stats_pesquisa_evasao',
    ['uuid', 'integer', 'integer'],
  );
  assert.match(
    stats,
    /(?:pe|pesquisa_evasao)\.modo_teste\s*=\s*false\b/i,
    'stats precisa excluir modo_teste=true',
  );

  // A homologacao comportamental de acoes e indicadores de professor e Task 7.
  const derivedWrites = statements(sql).filter(
    (statement) =>
      /^\s*(?:insert\s+into|update|merge\s+into)\s+public\.[a-z0-9_]*(?:ac(?:ao|oes)|encaminh|indicador[a-z0-9_]*professor|professor[a-z0-9_]*indicador)/i
        .test(statement) &&
      /\bpesquisa_evasao\b/i.test(statement),
  );
  for (const write of derivedWrites) {
    assert.match(
      write,
      /(?:pe|pesquisa_evasao)\.modo_teste\s*=\s*false\b/i,
      'escrita derivada de pesquisa precisa excluir modo_teste=true',
    );
    assertNoAuthorizationBypass(write, 'escrita derivada');
  }
});

contractTest('slots de teste e producao sao independentes', () => {
  const headerUniqueIndexes = statements(sql).filter(
    (statement) =>
      /\bcreate\s+unique\s+index\b/i.test(statement) &&
      /\bon\s+public\.pesquisa_evasao\s*\(/i.test(statement),
  );
  const productionIndex = headerUniqueIndexes.find(
    (statement) =>
      /\bon\s+public\.pesquisa_evasao\s*\(\s*evasao_id\s*\)/i
        .test(statement) &&
      /\bwhere\s+(?:\(\s*)?modo_teste\s*=\s*false\b/i.test(statement),
  );
  assert.ok(
    productionIndex,
    'producao exige indice unico parcial (evasao_id) WHERE modo_teste=false',
  );
  assertPartialIndexPredicate(
    productionIndex,
    /^\(?modo_teste=false\)?$/i,
    'indice parcial de producao',
  );

  const globalEvasaoConstraints = statements(sql).filter(
    (statement) =>
      /\b(?:alter\s+table|create\s+table)\s+public\.pesquisa_evasao\b/i
        .test(statement) &&
      (
        /\bunique\s*\(\s*evasao_id\s*\)/i.test(statement) ||
        /\bevasao_id\b[^,\n]*\bunique\b/i.test(statement)
      ),
  );
  assert.equal(
    globalEvasaoConstraints.length,
    0,
    'evasao_id nao pode conservar UNIQUE global',
  );
  const globalEvasaoIndexes = headerUniqueIndexes.filter(
    (statement) =>
      /\bon\s+public\.pesquisa_evasao\s*\([^)]*\bevasao_id\b[^)]*\)/i
        .test(statement) &&
      !/\bwhere\b/i.test(statement),
  );
  assert.equal(
    globalEvasaoIndexes.length,
    0,
    'indice UNIQUE com evasao_id precisa ser parcial',
  );
  assert.doesNotMatch(
    stripSqlComments(sql),
    /on\s+conflict\s*\(\s*evasao_id\s*\)\s+do\s+update/i,
  );

  const testSlotIndexes = headerUniqueIndexes.filter(
    (statement) =>
      /\bmodo_teste\s*=\s*true\b/i.test(statement) &&
      /['"]enviando['"]/i.test(statement) &&
      /['"]incerto['"]/i.test(statement),
  );
  assert.equal(
    testSlotIndexes.length,
    1,
    'deve existir um unico indice parcial do slot ativo de teste',
  );
  assert.match(
    testSlotIndexes[0],
    /\bon\s+public\.pesquisa_evasao\s*\(\s*evasao_id\s*,\s*telefone_destino_snapshot\s*\)/i,
    'slot de teste deve ser por evasao_id e telefone de teste',
  );
  assertPartialIndexPredicate(
    testSlotIndexes[0],
    /^\(?modo_teste=true and envio_status in\(['"]enviando['"],['"]incerto['"]\)\)?$/i,
    'indice parcial do slot de teste',
  );
});

contractTest('estado incerto nao possui retry automatico', () => {
  assert.match(sql, /['"]incerto['"]/i);
  assert.doesNotMatch(
    sql,
    /update\s+public\.pesquisa_evasao[\s\S]*?set\s+envio_status\s*=\s*['"]enviando['"][\s\S]*?where[\s\S]*?envio_status\s*=\s*['"]incerto['"]/i,
  );
  assert.doesNotMatch(sql, /\bauto(?:matico|maticamente)?[_\s-]*retry\b/i);
});

contractTest('overload de quatro argumentos preserva RETURNS e escopo por linha', () => {
  const definition = getFunctionDefinition(
    'listar_evadidos_para_pesquisa',
    ['uuid', 'integer', 'integer', 'varchar'],
  );

  assertExactReturns(
    definition,
    `RETURNS TABLE(
      evasao_id integer,
      aluno_id integer,
      nome text,
      telefone text,
      curso text,
      professor text,
      tempo_meses integer,
      data_evasao date,
      motivo_cadastrado text,
      pesquisa_status text,
      pesquisa_id uuid,
      resposta_texto text,
      respondido_em timestamp with time zone
    )`,
  );
  assert.match(definition, /\bmovimentacoes_admin\b/i);
  assert.match(
    definition,
    /fn_usuario_atual_tem_permissao_estrita\s*\(\s*['"]sucesso_aluno\.evasao\.ver['"](?:\s*::\s*varchar)?\s*,\s*[a-z_][a-z0-9_]*\.unidade_id\s*\)/i,
  );
  assert.match(
    definition,
    /\(\s*p_unidade_id\s+is\s+null\s+or\s+[a-z_][a-z0-9_]*\.unidade_id\s*=\s*p_unidade_id\s*\)/i,
  );
  assert.doesNotMatch(
    definition,
    /fn_usuario_atual_tem_permissao_estrita\s*\([^)]*,\s*null\s*\)/i,
  );
  assert.doesNotMatch(
    definition,
    /(?<!estrita)\bfn_usuario_atual_tem_permissao\s*\(/i,
  );
  assertNoAuthorizationBypass(definition, 'listar overload 4');
});

contractTest('overload de seis argumentos preserva RETURNS e escopo por linha', () => {
  const definition = getFunctionDefinition(
    'listar_evadidos_para_pesquisa',
    ['uuid', 'integer', 'integer', 'varchar', 'integer', 'integer'],
  );

  assertExactReturns(
    definition,
    `RETURNS TABLE(
      evasao_id integer,
      aluno_id integer,
      nome text,
      telefone text,
      curso text,
      professor text,
      tempo_meses integer,
      data_evasao date,
      motivo_cadastrado text,
      pesquisa_status text,
      pesquisa_id uuid,
      resposta_texto text,
      resposta_audio_url text,
      resposta_tipo text,
      respondido_em timestamp with time zone,
      is_menor boolean,
      responsavel_nome text
    )`,
  );
  assert.match(definition, /\bmovimentacoes_admin\b/i);
  assert.match(
    definition,
    /fn_usuario_atual_tem_permissao_estrita\s*\(\s*['"]sucesso_aluno\.evasao\.ver['"](?:\s*::\s*varchar)?\s*,\s*[a-z_][a-z0-9_]*\.unidade_id\s*\)/i,
  );
  assert.match(
    definition,
    /\(\s*p_unidade_id\s+is\s+null\s+or\s+[a-z_][a-z0-9_]*\.unidade_id\s*=\s*p_unidade_id\s*\)/i,
  );
  assert.doesNotMatch(
    definition,
    /fn_usuario_atual_tem_permissao_estrita\s*\([^)]*,\s*null\s*\)/i,
  );
  assert.doesNotMatch(
    definition,
    /(?<!estrita)\bfn_usuario_atual_tem_permissao\s*\(/i,
  );
  assertNoAuthorizationBypass(definition, 'listar overload 6');
});

contractTest('stats NULL agrega somente unidades autorizadas e exclui testes', () => {
  const definition = getFunctionDefinition(
    'stats_pesquisa_evasao',
    ['uuid', 'integer', 'integer'],
  );

  assertExactReturns(
    definition,
    `RETURNS TABLE(
      total_evadidos bigint,
      total_com_telefone bigint,
      total_pendentes bigint,
      total_enviados bigint,
      total_respondidos bigint,
      total_falhas bigint,
      taxa_resposta numeric,
      respondidos_texto bigint,
      respondidos_audio bigint
    )`,
  );
  assert.match(
    definition,
    /fn_usuario_atual_tem_permissao_estrita\s*\(\s*['"]sucesso_aluno\.evasao\.ver['"](?:\s*::\s*varchar)?\s*,\s*[a-z_][a-z0-9_]*\.unidade_id\s*\)/i,
  );
  assert.match(
    definition,
    /\(\s*p_unidade_id\s+is\s+null\s+or\s+[a-z_][a-z0-9_]*\.unidade_id\s*=\s*p_unidade_id\s*\)/i,
  );
  assert.match(
    definition,
    /(?:pe|pesquisa_evasao)\.modo_teste\s*=\s*false\b/i,
  );
  assert.doesNotMatch(
    definition,
    /fn_usuario_atual_tem_permissao_estrita\s*\([^)]*,\s*null\s*\)/i,
  );
  assert.doesNotMatch(
    definition,
    /(?<!estrita)\bfn_usuario_atual_tem_permissao\s*\(/i,
  );
  assertNoAuthorizationBypass(definition, 'stats_pesquisa_evasao');
});

contractTest('stats so considera resposta pronta para revisao ou avancada', () => {
  const definition = stripSqlComments(
    getFunctionDefinition(
      'stats_pesquisa_evasao',
      ['uuid', 'integer', 'integer'],
    ),
  );
  const validResponseStatuses = [
    'pronta_para_revisao',
    'em_revisao',
    'revisada',
  ];
  const responseStatusFilters = [
    ...definition.matchAll(
      /(?<!not\s)\b(?:pe|pesquisa_evasao)\.resposta_status\s+in\s*\(([^)]*)\)/gi,
    ),
  ];

  assert.equal(
    responseStatusFilters.length,
    3,
    'stats deve filtrar total, texto e audio pelo mesmo conjunto valido',
  );
  for (const [, rawStatuses] of responseStatusFilters) {
    const statuses = [
      ...rawStatuses.matchAll(/['"]([^'"]+)['"]/g),
    ].map((match) => match[1].toLowerCase());
    assert.deepEqual(statuses, validResponseStatuses);
  }
});

contractTest('stats mantem respostas nao validas no denominador de enviados', () => {
  const definition = normalizeSql(
    getFunctionDefinition(
      'stats_pesquisa_evasao',
      ['uuid', 'integer', 'integer'],
    ),
  );

  assert.match(
    definition,
    /count\(\*\)filter\(where pe\.envio_status in\('enviado','entregue','lido'\)and pe\.resposta_status not in\('pronta_para_revisao','em_revisao','revisada'\)\)as enviados/,
    'envio bem-sucedido sem resposta valida deve permanecer no denominador',
  );
});

contractTest('backfill de compatibilidade preserva estados V2 avancados', () => {
  const mappingUpdates = statements(sql).filter(
    (statement) =>
      /\bupdate\s+public\.pesquisa_evasao\b/i.test(statement) &&
      /\bset\s+envio_status\s*=\s*case\s+status\b/i.test(statement) &&
      /\bresposta_status\s*=\s*case\s+status\b/i.test(statement),
  );

  assert.equal(
    mappingUpdates.length,
    1,
    'deve existir um unico UPDATE de compatibilidade dos status legados',
  );
  const normalizedUpdate = normalizeSql(mappingUpdates[0]);
  assert.match(
    normalizedUpdate,
    /\bwhere envio_status\s*=\s*'nao_enviado' and resposta_status\s*=\s*'sem_resposta'$/,
    'mapeamento legado so pode tocar o par de defaults de bootstrap',
  );
});

contractTest('EXECUTE publico e anon e revogado nas cinco assinaturas', () => {
  const signatures = [
    ['listar_evadidos_para_pesquisa', 'uuid, integer, integer, varchar'],
    [
      'listar_evadidos_para_pesquisa',
      'uuid, integer, integer, varchar, integer, integer',
    ],
    ['stats_pesquisa_evasao', 'uuid, integer, integer'],
    ['criar_pesquisa_evasao', 'integer, text'],
    ['pode_enviar_pesquisa_evasao', 'integer'],
  ];

  for (const [name, args] of signatures) {
    assertFinalPrivileges('function', name, 'public', [], args);
    assertFinalPrivileges('function', name, 'anon', [], args);
  }
});

contractTest('agents restritos nao executam helpers nem RPCs do dominio', () => {
  const signatures = [
    ['usuario_tem_permissao_estrita', 'integer, varchar, uuid'],
    ['fn_usuario_atual_tem_permissao_estrita', 'varchar, uuid'],
    ['listar_evadidos_para_pesquisa', 'uuid, integer, integer, varchar'],
    [
      'listar_evadidos_para_pesquisa',
      'uuid, integer, integer, varchar, integer, integer',
    ],
    ['stats_pesquisa_evasao', 'uuid, integer, integer'],
    ['criar_pesquisa_evasao', 'integer, text'],
    ['pode_enviar_pesquisa_evasao', 'integer'],
  ];

  for (const role of ['fabio_agent', 'lia_acesso_restrito']) {
    for (const [name, args] of signatures) {
      assertFinalPrivileges('function', name, role, [], args);
    }
  }
});

contractTest('criar pesquisa e service-only e nao antecipa sucesso do provedor', () => {
  const parts = getFunctionParts(
    'criar_pesquisa_evasao',
    ['integer', 'text'],
  );
  const { header, body, definition } = parts;

  assertExactReturns(header, 'RETURNS uuid');
  assert.match(header, /\bsecurity\s+definer\b/i);
  assert.match(header, /\bset\s+search_path\s*=\s*public\s*,\s*pg_temp\b/i);

  assertBlockingServiceRoleGate(body);

  assertFinalPrivileges(
    'function',
    'criar_pesquisa_evasao',
    'authenticated',
    [],
    'integer, text',
  );
  assertFinalPrivileges(
    'function',
    'criar_pesquisa_evasao',
    'service_role',
    ['execute'],
    'integer, text',
  );
  assert.doesNotMatch(
    stripSqlComments(body),
    /\benviado_em\b|['"]enviado['"]/i,
    'criar nao pode inserir/atualizar enviado ou enviado_em',
  );
  assert.match(
    body,
    /['"]nao_enviado['"]/i,
    'criar precisa inicializar envio_status em nao_enviado',
  );
  assertNoAuthorizationBypass(definition, 'criar_pesquisa_evasao');
});

contractTest('criar pesquisa rejeita movimentacao que nao seja saida canonica', () => {
  const body = stripSqlComments(
    getFunctionParts(
      'criar_pesquisa_evasao',
      ['integer', 'text'],
    ).body,
  );

  assert.match(
    body,
    /\bm\.tipo\s+in\s*\(\s*['"]evasao['"]\s*,\s*['"]nao_renovacao['"]\s*\)/i,
  );
});

contractTest('pode_enviar exige permissao concreta ou service role', () => {
  const parts = getFunctionParts(
    'pode_enviar_pesquisa_evasao',
    ['integer'],
  );
  const { header, body, definition } = parts;

  assertExactReturns(header, 'RETURNS boolean');
  assert.match(definition, /\bmovimentacoes_admin\b/i);
  const governedReturn = statements(body).find(
    (statement) =>
      /\breturn\b/i.test(statement) &&
      /fn_usuario_atual_tem_permissao_estrita\s*\(\s*['"]sucesso_aluno\.evasao\.enviar['"](?:\s*::\s*varchar)?\s*,\s*(?:[a-z_][a-z0-9_]*\.)?[a-z_]*unidade_id\s*\)/i
        .test(statement),
  );
  assert.ok(
    governedReturn,
    'RETURN governado precisa chamar helper estrito com unidade concreta',
  );
  assertGovernedReturn(governedReturn);
  assert.match(governedReturn, /\bauth\.role\s*\(\s*\)\s*=\s*['"]service_role['"]/i);
  assert.doesNotMatch(
    definition,
    /fn_usuario_atual_tem_permissao_estrita\s*\([^)]*,\s*null\s*\)/i,
  );
  assert.doesNotMatch(
    definition,
    /(?<!estrita)\bfn_usuario_atual_tem_permissao\s*\(/i,
  );
  assertNoAuthorizationBypass(definition, 'pode_enviar_pesquisa_evasao');
});

contractTest('pode_enviar rejeita movimentacao que nao seja saida canonica', () => {
  const body = stripSqlComments(
    getFunctionParts(
      'pode_enviar_pesquisa_evasao',
      ['integer'],
    ).body,
  );

  assert.match(
    body,
    /\bm\.tipo\s+in\s*\(\s*['"]evasao['"]\s*,\s*['"]nao_renovacao['"]\s*\)/i,
  );
});
