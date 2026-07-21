import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readSqlContract } from './helpers/sqlContractHelpers.mjs';

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testsDirectory, '..');
const edgeFunctionPath = resolve(
  repositoryRoot,
  'supabase/functions/sync-professor-disciplinas-emusys/index.ts',
);
const configPath = resolve(repositoryRoot, 'supabase/config.toml');

function readOptionalFile(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
}

const migrationRelativePath =
  'supabase/migrations/20260720120000_emusys_catalogo_professor_disciplinas.sql';
const finalizerGuardFixPath = resolve(
  repositoryRoot,
  'supabase/migrations/20260721110000_emusys_catalogo_finalizador_auth_role.sql',
);
const finalizerGuardFix = readOptionalFile(finalizerGuardFixPath);
const {
  exists: migrationExists,
  filePath: migrationPath,
  executable: executableSchema,
} = readSqlContract(import.meta.url, migrationRelativePath);

function extractFunction(functionName) {
  const startPattern = new RegExp(
    'create\\s+or\\s+replace\\s+function\\s+public\\.' +
      functionName +
      '\\s*\\(',
    'i',
  );
  const start = executableSchema.search(startPattern);
  assert.notEqual(start, -1, functionName + ' deve existir na migration do catalogo');

  const remainder = executableSchema.slice(start);
  const header = remainder.match(
    /create\s+or\s+replace\s+function[\s\S]*?\bas\s+\$([a-z0-9_]*)\$/i,
  );
  assert.ok(header, functionName + ' deve possuir corpo SQL delimitado');

  const delimiter = '$' + header[1] + '$';
  const closing = remainder.indexOf(delimiter + ';', header[0].length);
  assert.notEqual(closing, -1, functionName + ' deve possuir corpo SQL completo');
  return remainder.slice(0, closing + delimiter.length + 1);
}

function extractTable(tableName) {
  const pattern = new RegExp(
    'create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.' +
      tableName +
      '\\s*\\(([\\s\\S]*?)\\n\\);',
    'i',
  );
  const match = executableSchema.match(pattern);
  assert.ok(match, tableName + ' deve possuir definicao completa');
  return match[0];
}

function extractTableBody(tableName) {
  const definition = extractTable(tableName);
  return definition.slice(definition.indexOf('(') + 1, definition.lastIndexOf(')'));
}

function assertRealColumn(tableName, columnName) {
  const body = extractTableBody(tableName);
  assert.match(
    body,
    new RegExp(
      '(?:^|\\n)\\s*' + columnName + '\\s+(?:text|varchar|character\\s+varying)\\b',
      'i',
    ),
    tableName + ' deve declarar a coluna real ' + columnName,
  );
}

function assertColumns(tableName, columnNames) {
  const body = extractTableBody(tableName);
  for (const columnName of columnNames) {
    assert.match(
      body,
      new RegExp('(?:^|\\n)\\s*' + columnName + '\\s+[a-z]', 'i'),
      tableName + ' deve declarar a coluna ' + columnName,
    );
  }
}

function revokedTableRoles(tableName) {
  const pattern = new RegExp(
    'revoke\\s+all(?:\\s+privileges)?\\s+on\\s+table\\s+public\\.' +
      tableName +
      '\\s+from\\s+([^;]+);',
    'gi',
  );

  return [...executableSchema.matchAll(pattern)].flatMap((match) =>
    match[1]
      .split(',')
      .map((role) => role.trim().replace(/^"|"$/g, '').toLowerCase()),
  );
}

function grantedRoles(statement) {
  return (statement.match(/\bto\s+([^;]+);/i)?.[1] || '')
    .replace(/\s+granted\s+by\s+(?:current_user|session_user|[a-z_][a-z0-9_$]*|"[^"]+")\s*$/i, '')
    .replace(/\s+with\s+grant\s+option\s*$/i, '')
    .split(',')
    .map((role) =>
      role
        .trim()
        .replace(/^group\s+/i, '')
        .replace(/^"|"$/g, '')
        .toLowerCase()
    );
}

function grantsBrowserRole(statement) {
  return grantedRoles(statement).some((role) =>
    ['public', 'anon', 'authenticated'].includes(role)
  );
}

test('parser de GRANT normaliza GROUP, grant option e granted by', () => {
  assert.deepEqual(
    grantedRoles(
      'grant execute on routine public.exemplo() to group authenticated granted by current_user;',
    ),
    ['authenticated'],
  );
  assert.deepEqual(
    grantedRoles(
      'grant select on table public.exemplo to service_role, group anon with grant option granted by session_user;',
    ),
    ['service_role', 'anon'],
  );
});

test('Task 2 disponibiliza a migration privada do catalogo Emusys', () => {
  assert.equal(
    migrationExists,
    true,
    migrationPath + ' deve existir antes de validar o contrato do catalogo',
  );
});

test(
  'schema preserva o grao Emusys por unidade e registra execucoes completas',
  { skip: !migrationExists },
  () => {
    assert.match(
      executableSchema,
      /create\s+table\s+if\s+not\s+exists\s+public\.emusys_disciplinas_catalogo/i,
    );
    assert.match(
      executableSchema,
      /unique\s*\(\s*unidade_id\s*,\s*emusys_disciplina_id\s*\)/i,
    );
    assert.match(
      executableSchema,
      /create\s+table\s+if\s+not\s+exists\s+public\.emusys_professor_disciplinas/i,
    );
    assert.match(
      executableSchema,
      /unique\s*\(\s*unidade_id\s*,\s*emusys_professor_id\s*,\s*emusys_disciplina_id\s*\)/i,
    );
    assert.match(
      executableSchema,
      /create\s+table\s+if\s+not\s+exists\s+public\.emusys_professor_disciplinas_sync_execucoes/i,
    );

    assertRealColumn('emusys_disciplinas_catalogo', 'hash_payload');
    assertRealColumn('emusys_professor_disciplinas', 'hash_payload');

    assertColumns('emusys_disciplinas_catalogo', [
      'unidade_id',
      'emusys_disciplina_id',
      'nome_emusys',
      'modalidade',
      'ativo_origem',
      'primeiro_visto_em',
      'ultimo_visto_em',
      'sincronizado_em',
      'ultima_execucao_id',
      'payload_snapshot',
      'hash_payload',
    ]);
    assertColumns('emusys_professor_disciplinas', [
      'unidade_id',
      'emusys_professor_id',
      'emusys_disciplina_id',
      'ativo_origem',
      'primeiro_visto_em',
      'ultimo_visto_em',
      'sincronizado_em',
      'ultima_execucao_id',
      'payload_snapshot',
      'hash_payload',
    ]);
    assertColumns('emusys_professor_disciplinas_sync_execucoes', [
      'id',
      'unidade_id',
      'origem',
      'status',
      'iniciado_em',
      'finalizado_em',
      'disciplinas_esperadas',
      'disciplinas_processadas',
      'requisicoes',
      'falhas',
      'estatisticas',
      'solicitado_por',
    ]);
  },
);

test(
  'schema restringe enums, payload, FKs e cria indices operacionais',
  { skip: !migrationExists },
  () => {
    assert.match(
      executableSchema,
      /modalidade\s+text[\s\S]{0,300}check\s*\(\s*modalidade\s+in\s*\(\s*'individual'\s*,\s*'turma'\s*\)\s*\)/i,
    );
    assert.match(
      executableSchema,
      /origem\s+text[\s\S]{0,300}check\s*\(\s*origem\s+in\s*\(\s*'manual'\s*,\s*'cron'\s*\)\s*\)/i,
    );
    assert.match(
      executableSchema,
      /status\s+text[\s\S]{0,300}check\s*\(\s*status\s+in\s*\(\s*'em_andamento'\s*,\s*'completa'\s*,\s*'falhou'\s*\)\s*\)/i,
    );

    for (const tableName of [
      'emusys_disciplinas_catalogo',
      'emusys_professor_disciplinas',
      'emusys_professor_disciplinas_sync_execucoes',
    ]) {
      const body = extractTableBody(tableName);
      const references = body.match(/references\s+public\.[a-z_]+\s*\([^)]*\)[\s\S]{0,60}?on\s+delete\s+restrict/gi) || [];
      assert.ok(references.length >= 1, tableName + ' deve usar FK ON DELETE RESTRICT');
    }

    assert.match(
      executableSchema,
      /create\s+index[\s\S]{0,180}emusys_disciplinas_catalogo\s*\(\s*unidade_id\s*,\s*ativo_origem\s*\)/i,
    );
    assert.match(
      executableSchema,
      /create\s+index[\s\S]{0,180}emusys_professor_disciplinas\s*\(\s*unidade_id\s*,\s*ativo_origem\s*\)/i,
    );
    assert.match(
      executableSchema,
      /create\s+index[\s\S]{0,180}(?:ultima_execucao_id|emusys_professor_disciplinas_sync_execucoes)/i,
    );

    assert.match(executableSchema, /payload_snapshot\s+jsonb[\s\S]{0,500}nome_aluno/i);
    assert.match(executableSchema, /payload_snapshot\s+jsonb[\s\S]{0,500}telefone/i);
    assert.match(executableSchema, /payload_snapshot\s+jsonb[\s\S]{0,500}email/i);
  },
);

test(
  'tabelas brutas usam RLS e nao concedem DML a papeis do navegador',
  { skip: !migrationExists },
  () => {
    for (const tableName of [
      'emusys_disciplinas_catalogo',
      'emusys_professor_disciplinas',
      'emusys_professor_disciplinas_sync_execucoes',
    ]) {
      assert.match(
          executableSchema,
        new RegExp(
          'alter\\s+table\\s+public\\.' +
            tableName +
            '\\s+enable\\s+row\\s+level\\s+security',
          'i',
        ),
        tableName + ' deve nascer com RLS habilitado',
      );

      const revokedRoles = revokedTableRoles(tableName);
      for (const role of ['public', 'anon', 'authenticated']) {
        assert.ok(
          revokedRoles.includes(role),
          tableName + ' deve executar REVOKE ALL ON TABLE de ' + role,
        );
      }
    }

    const protectedTables =
      /(?:public\.)?(?:emusys_disciplinas_catalogo|emusys_professor_disciplinas|emusys_professor_disciplinas_sync_execucoes)\b/i;
    const forbiddenPrivilege =
      /\b(?:all(?:\s+privileges)?|select|insert|update|delete|truncate|references|trigger)\b/i;
    const grants = executableSchema.match(/\bgrant\b[\s\S]*?;/gi) || [];
    const forbiddenGrants = grants.filter(
      (statement) => {
        return protectedTables.test(statement) &&
          forbiddenPrivilege.test(statement) &&
          grantsBrowserRole(statement);
      },
    );

    assert.deepEqual(
      forbiddenGrants,
      [],
      'tabelas brutas nao podem conceder DML a public, anon ou authenticated',
    );

    const broadTableGrants = grants.filter(
      (statement) =>
        /\bon\s+all\s+tables\s+in\s+schema\s+public\b/i.test(statement) &&
        forbiddenPrivilege.test(statement) &&
        grantsBrowserRole(statement),
    );
    assert.deepEqual(
      broadTableGrants,
      [],
      'grant amplo em todas as tabelas public nao pode reabrir o catalogo ao navegador',
    );

    const defaultTableGrants = (
      executableSchema.match(/\balter\s+default\s+privileges\b[\s\S]*?;/gi) || []
    ).filter(
      (statement) =>
        /\bin\s+schema\s+public\b/i.test(statement) &&
        /\bgrant\s+(?:all(?:\s+privileges)?|select|insert|update|delete|truncate|references|trigger)\s+on\s+tables\b/i.test(statement) &&
        grantsBrowserRole(statement),
    );
    assert.deepEqual(
      defaultTableGrants,
      [],
      'default privileges nao podem reabrir novas tabelas public ao navegador',
    );
    assert.doesNotMatch(
      executableSchema,
      /alter\s+table\s+(?:only\s+)?(?:public\.)?(?:emusys_disciplinas_catalogo|emusys_professor_disciplinas|emusys_professor_disciplinas_sync_execucoes)\s+disable\s+row\s+level\s+security/i,
      'RLS das tabelas brutas nao pode ser desabilitado depois do hardening',
    );
  },
);

test(
  'finalizacao valida completude antes de qualquer inativacao e trava por unidade',
  { skip: !migrationExists },
  () => {
    const block = extractFunction(
      'finalizar_sync_professor_disciplinas_emusys_v1',
    );
    const processedIndex = block.search(
      /disciplinas_processadas\s*(?:<>|!=|is\s+distinct\s+from)\s*[a-z0-9_.]*disciplinas_esperadas/i,
    );
    const failuresIndex = block.search(
      /(?:jsonb_array_length\s*\([^)]*falhas[^)]*\)|\bfalhas\b\s*(?:<>|!=|is\s+distinct\s+from)\s*'\[\]'::jsonb)/i,
    );
    const inactivationIndex = block.search(
      /(?:set\s+ativo_origem\s*=\s*false|ativo_origem\s*:=\s*false)/i,
    );

    assert.ok(
      processedIndex >= 0,
      'finalizacao deve comparar processadas e esperadas',
    );
    assert.ok(failuresIndex >= 0, 'finalizacao deve rejeitar execucao com falhas');
    assert.ok(
      inactivationIndex >= 0,
      'finalizacao completa deve inativar registros ausentes',
    );
    assert.ok(
      processedIndex < inactivationIndex && failuresIndex < inactivationIndex,
      'completude deve ser validada antes de qualquer inativacao',
    );
    assert.match(
      block,
      /pg_advisory_xact_lock\s*\([\s\S]{0,300}\bunidade_id\b/i,
      'lock transacional deve ser derivado da unidade da execucao',
    );
    assert.match(block, /status\s*=\s*'completa'/i);
  },
);

test(
  'RPC finalizadora e service-only, hardened e sem execute para o navegador',
  { skip: !migrationExists },
  () => {
    const functionName = 'finalizar_sync_professor_disciplinas_emusys_v1';
    const block = extractFunction(functionName);

    assert.match(
      executableSchema,
      /function\s+public\.finalizar_sync_professor_disciplinas_emusys_v1\s*\(\s*p_execucao_id\s+uuid\s*\)/i,
    );
    assert.match(block, /security\s+definer/i);
    assert.match(block, /set\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
    const requestRoleAssignment = block.match(
      /\b(v_request_role)\s+(?:text\s*)?(?::=|=)\s*current_setting\s*\(\s*'request\.jwt\.claim\.role'\s*,\s*true\s*\)/i,
    );
    assert.ok(
      requestRoleAssignment,
      'guard deve guardar o papel JWT real em v_request_role',
    );
    const requestRoleVariable = requestRoleAssignment?.[1] || 'v_request_role';
    assert.match(
      block,
      new RegExp(
        'if\\s+coalesce\\s*\\(\\s*' + requestRoleVariable +
          "\\s*,\\s*''\\s*\\)\\s*(?:<>|!=)\\s*'service_role'" +
          "\\s+and\\s+session_user\\s*(?:<>|!=)\\s*'postgres'" +
          '\\s+then[\\s\\S]{0,200}?raise\\s+exception',
        'i',
      ),
      'guard deve rejeitar quem nao seja service_role nem sessao postgres',
    );

    assert.match(
      executableSchema,
      /grant\s+execute\s+on\s+function\s+public\.finalizar_sync_professor_disciplinas_emusys_v1\s*\(\s*uuid\s*\)\s+to\s+service_role/i,
    );
    for (const role of ['public', 'anon', 'authenticated']) {
      assert.match(
        executableSchema,
        new RegExp(
          'revoke\\s+(?:all(?:\\s+privileges)?|execute)\\s+on\\s+function\\s+' +
            'public\\.finalizar_sync_professor_disciplinas_emusys_v1\\s*\\(\\s*uuid\\s*\\)' +
            '\\s+from\\s+(?:[^;]*,\\s*)?' + role + '(?:\\s*,|\\s*;)',
          'i',
        ),
        'RPC finalizadora deve revogar execute de ' + role,
      );
    }
    assert.doesNotMatch(
      executableSchema,
      /grant\s+execute\s+on\s+function\s+(?:public\.)?finalizar_sync_professor_disciplinas_emusys_v1\s*\(\s*uuid\s*\)\s+to\s+(?:public|anon|authenticated)/i,
    );
    const broadFunctionGrants = (
      executableSchema.match(/\bgrant\b[\s\S]*?;/gi) || []
    ).filter(
      (statement) =>
        /\bgrant\s+(?:all(?:\s+privileges)?|execute)\s+on\s+all\s+(?:functions|routines)\s+in\s+schema\s+public\b/i.test(statement) &&
        grantsBrowserRole(statement),
    );
    assert.deepEqual(
      broadFunctionGrants,
      [],
      'grant amplo de funcoes public nao pode expor a RPC finalizadora',
    );

    const defaultFunctionGrants = (
      executableSchema.match(/\balter\s+default\s+privileges\b[\s\S]*?;/gi) || []
    ).filter(
      (statement) =>
        /\bin\s+schema\s+public\b/i.test(statement) &&
        /\bgrant\s+(?:all(?:\s+privileges)?|execute)\s+on\s+(?:functions|routines)\b/i.test(statement) &&
        grantsBrowserRole(statement),
    );
    assert.deepEqual(
      defaultFunctionGrants,
      [],
      'default privileges de funcoes nao podem expor a RPC finalizadora',
    );

    const finalizerGrants = (
      executableSchema.match(/\bgrant\b[\s\S]*?;/gi) || []
    ).filter(
      (statement) =>
        /\bgrant\s+(?:all(?:\s+privileges)?|execute)\s+on\s+(?:function|routine)\b/i.test(statement) &&
        /(?:public\.)?finalizar_sync_professor_disciplinas_emusys_v1\b/i.test(statement),
    );
    for (const statement of finalizerGrants) {
      const roles = grantedRoles(statement);
      assert.equal(
        roles.some((role) => ['public', 'anon', 'authenticated'].includes(role)),
        false,
        'grant misto da RPC nao pode incluir papel do navegador',
      );
    }
  },
);

test('finalizador usa auth.role no PostgREST atual sem reabrir o navegador', () => {
  assert.notEqual(
    finalizerGuardFix,
    '',
    finalizerGuardFixPath + ' deve corrigir o guard da RPC ja aplicada',
  );
  assert.match(
    finalizerGuardFix,
    /create\s+or\s+replace\s+function\s+public\.finalizar_sync_professor_disciplinas_emusys_v1\s*\(/i,
  );
  assert.match(
    finalizerGuardFix,
    /coalesce\s*\(\s*auth\.role\s*\(\s*\)\s*,\s*''\s*\)\s*(?:<>|!=)\s*'service_role'/i,
    'guard corrigido deve reconhecer o service_role exposto pelo PostgREST',
  );
  assert.doesNotMatch(
    finalizerGuardFix,
    /request\.jwt\.claim\.role/i,
    'migration corretiva nao deve repetir o claim legado',
  );
  assert.match(finalizerGuardFix, /security\s+definer/i);
  assert.match(finalizerGuardFix, /set\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
  for (const role of ['public', 'anon', 'authenticated']) {
    assert.match(
      finalizerGuardFix,
      new RegExp(
        'revoke\\s+(?:all(?:\\s+privileges)?|execute)\\s+on\\s+function\\s+' +
          'public\\.finalizar_sync_professor_disciplinas_emusys_v1\\s*\\(\\s*uuid\\s*\\)' +
          '\\s+from\\s+(?:[^;]*,\\s*)?' + role + '(?:\\s*,|\\s*;)',
        'i',
      ),
    );
  }
  assert.match(
    finalizerGuardFix,
    /grant\s+execute\s+on\s+function\s+public\.finalizar_sync_professor_disciplinas_emusys_v1\s*\(\s*uuid\s*\)\s+to\s+service_role/i,
  );
});

test('Task 3 implementa sync retomavel com guard duplo e gateway explicito', () => {
  const edgeSource = readOptionalFile(edgeFunctionPath);
  const configSource = readOptionalFile(configPath);

  assert.notEqual(edgeSource, '', edgeFunctionPath + ' deve existir');
  assert.match(edgeSource, /x-sync-token/i);
  assert.match(edgeSource, /SYNC_PROFESSOR_DISCIPLINAS_TOKEN/);
  assert.match(edgeSource, /constantTime|timingSafe|secureCompare/i);
  assert.match(edgeSource, /auth\.getUser\s*\(/);
  assert.match(edgeSource, /fn_usuario_atual_tem_permissao/);
  assert.match(edgeSource, /professores\.editar/);

  assert.match(edgeSource, /disciplinas\?tipo=turma/);
  assert.match(edgeSource, /disciplinas\?tipo=individual/);
  assert.match(edgeSource, /professores\?curso_id=/);
  assert.match(edgeSource, /emusys_disciplinas_catalogo/);
  assert.match(edgeSource, /emusys_professor_disciplinas/);
  assert.match(edgeSource, /finalizar_sync_professor_disciplinas_emusys_v1/);
  assert.match(edgeSource, /status:\s*["']falhou["']/);
  assert.doesNotMatch(
    edgeSource,
    /console\.(?:log|error|warn)\s*\([^\n]*(?:token|payload)/i,
    'sync nao pode registrar token ou payload bruto em console',
  );

  assert.match(
    configSource,
    /\[functions\.sync-professor-disciplinas-emusys\][\s\S]*?verify_jwt\s*=\s*false/i,
  );
});
