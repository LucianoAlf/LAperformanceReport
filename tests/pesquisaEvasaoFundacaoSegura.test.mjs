import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260730170000_pesquisa_evasao_fundacao_segura.sql';
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

const rolloutIdentities = [
  [29, 'jessyca@lamusic.com.br'],
  [30, 'fabi@gmail.com'],
];

const rolloutUnitIds = [
  '368d47f5-2d88-4475-bc14-ba084a9a348e',
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
  '95553e96-971b-4590-a6eb-0201d013c14d',
];

const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeSql = (value) =>
  value
    .replace(/--.*$/gm, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),])\s*/g, '$1')
    .trim()
    .toLowerCase();

const statements = (value) =>
  value
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);

const normalizedType = (value) =>
  value
    .trim()
    .replace(/\s+default\s+[\s\S]*$/i, '')
    .replace(/^p_[a-z0-9_]+\s+/i, '')
    .replace(/\bcharacter\s+varying\b/i, 'varchar')
    .replace(/\s+/g, ' ')
    .toLowerCase();

function getFunctionDefinition(name, expectedTypes) {
  const matcher = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${escapeRegex(name)}\\s*\\(([^)]*)\\)`,
    'gi',
  );

  for (const match of sql.matchAll(matcher)) {
    const actualTypes = match[1]
      .split(',')
      .map(normalizedType);

    if (
      actualTypes.length === expectedTypes.length &&
      actualTypes.every((type, index) => type === expectedTypes[index])
    ) {
      const tail = sql.slice(match.index);
      const nextDefinition = tail
        .slice(match[0].length)
        .search(/\bcreate\s+or\s+replace\s+function\s+public\./i);
      return nextDefinition === -1
        ? tail
        : tail.slice(0, match[0].length + nextDefinition);
    }
  }

  assert.fail(
    `funcao ${name}(${expectedTypes.join(', ')}) ausente na migration`,
  );
}

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

function assertExactReturns(definition, expectedReturns) {
  assert.ok(
    normalizeSql(definition).includes(normalizeSql(expectedReturns)),
    `RETURNS foi alterado: esperado ${normalizeSql(expectedReturns)}`,
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

function findPrivilegeStatements(tableName, roleName) {
  const tablePattern = new RegExp(
    `\\bpublic\\.${escapeRegex(tableName)}\\b`,
    'i',
  );
  const rolePattern = new RegExp(`\\b${escapeRegex(roleName)}\\b`, 'i');

  return statements(sql).filter(
    (statement) =>
      /\b(?:grant|revoke)\b/i.test(statement) &&
      tablePattern.test(statement) &&
      rolePattern.test(statement),
  );
}

function assertAllRevoked(tableName) {
  const revokes = statements(sql).filter(
    (statement) =>
      /\brevoke\s+all\b/i.test(statement) &&
      new RegExp(`\\bpublic\\.${escapeRegex(tableName)}\\b`, 'i').test(statement),
  );

  assert.ok(revokes.length > 0, `REVOKE ALL ausente em ${tableName}`);
  const revokeSql = revokes.join('\n');

  for (const role of [
    'public',
    'anon',
    'authenticated',
    'mila_acesso_restrito',
    'sol_acesso_restrito',
  ]) {
    assert.match(
      revokeSql,
      new RegExp(`\\b${escapeRegex(role)}\\b`, 'i'),
      `${tableName} nao revoga ${role}`,
    );
  }
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

test('migration da fundacao segura existe antes de validar seus contratos', () => {
  assert.ok(
    sql,
    `migration da fundacao segura ainda nao existe: ${migrationPath}`,
  );
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
  const headerPolicies = statements(sql).filter(
    (statement) =>
      /\bcreate\s+policy\b/i.test(statement) &&
      /\bon\s+public\.pesquisa_evasao\b/i.test(statement),
  );
  const governedPolicy = headerPolicies.find(
    (statement) =>
      /sucesso_aluno\.evasao\.ver/i.test(statement) &&
      /fn_usuario_atual_tem_permissao_estrita/i.test(statement) &&
      /\bunidade_id\b/i.test(statement),
  );

  assert.ok(
    governedPolicy,
    'policy de pesquisa_evasao nao usa ver + helper estrito + unidade da linha',
  );
  assert.doesNotMatch(
    headerPolicies.join('\n'),
    /\busing\s*\(\s*true\s*\)/i,
  );
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
  assert.match(currentUserHelper, /\bauth\.uid\s*\(\s*\)/i);
  assert.match(currentUserHelper, /\busuario_tem_permissao_estrita\s*\(/i);
  assert.doesNotMatch(helpers, /\bperfil\s*=\s*['"]admin['"]/i);
  assert.doesNotMatch(helpers, /\busuarios?\.unidade_id\s+is\s+null\b/i);
  assert.doesNotMatch(
    helpers,
    /(?<!estrita)\bfn_usuario_atual_tem_permissao\s*\(/i,
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

contractTest('rollout fica fora da migration e usa identidades estaveis exatas', () => {
  assert.equal(
    rolloutIdentities.map(([id, email]) => `${id}:${email}`).join('|'),
    '29:jessyca@lamusic.com.br|30:fabi@gmail.com',
  );
  assert.equal(
    rolloutUnitIds.join('|'),
    [
      '368d47f5-2d88-4475-bc14-ba084a9a348e',
      '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
      '95553e96-971b-4590-a6eb-0201d013c14d',
    ].join('|'),
  );
  assert.doesNotMatch(
    sql,
    /\binsert\s+into\s+public\.usuario_perfis\b/i,
    'atribuicao nominal pertence ao runbook futuro, nao a migration',
  );
  assert.doesNotMatch(sql, /\b(?:nome|email)\s+(?:i?like)\b/i);
  assert.doesNotMatch(sql, /\blower\s*\(\s*(?:[a-z_]+\.)?nome\s*\)/i);
  assert.doesNotMatch(sql, /jessyca@lamusic\.com\.br|fabi@gmail\.com/i);
});

contractTest('tabelas privadas nascem com RLS e revogacao ampla', () => {
  for (const tableName of privateTables) {
    assertRlsEnabled(tableName);
    assertAllRevoked(tableName);
  }
});

contractTest('grants autenticados sao minimos nas tabelas privadas', () => {
  for (const tableName of ['pesquisa_evasao', ...conversationTables]) {
    const grants = findPrivilegeStatements(tableName, 'authenticated')
      .filter((statement) => /\bgrant\b/i.test(statement));

    assert.ok(grants.length > 0, `GRANT SELECT ausente em ${tableName}`);
    for (const grant of grants) {
      assert.match(grant, /\bgrant\s+select\b/i);
      assert.doesNotMatch(grant, /\b(?:insert|update|delete|all)\b/i);
    }
  }

  for (const tableName of serviceOnlyTables) {
    const authenticatedGrants =
      findPrivilegeStatements(tableName, 'authenticated')
        .filter((statement) => /\bgrant\b/i.test(statement));
    assert.equal(
      authenticatedGrants.length,
      0,
      `${tableName} deve permanecer service-only`,
    );

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
});

contractTest('assinatura ativa usa indice unico parcial', () => {
  const signatureDefinition =
    getCreateTableDefinition('pesquisa_evasao_assinaturas');
  assert.doesNotMatch(
    signatureDefinition,
    /\bunique\s*\(\s*usuario_id\s*,\s*ativo\s*\)/i,
  );
  assert.match(
    sql,
    /create\s+unique\s+index[\s\S]*?on\s+public\.pesquisa_evasao_assinaturas\s*\(\s*usuario_id\s*\)[\s\S]*?where\s+(?:\(\s*)?ativo(?:\s*=\s*true)?(?:\s*\))?\s*;/i,
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

  assert.equal(ids.length, 6, 'allowlist deve conter exatamente seis UUIDs');
  assert.equal(new Set(ids).size, 6, 'allowlist nao pode repetir UUID');
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

contractTest('legados de teste ficam fora de analytics, acoes e professor', () => {
  const modeComment = statements(sql).find(
    (statement) =>
      /\bcomment\s+on\s+column\s+public\.pesquisa_evasao\.modo_teste\b/i
        .test(statement),
  );
  assert.ok(modeComment, 'comentario de governanca de modo_teste ausente');
  assert.match(modeComment, /\b6\b[\s\S]*\btestes?\b/i);
  assert.match(modeComment, /\banalytics\b/i);
  assert.match(modeComment, /\ba[cç][oõ]es\b/i);
  assert.match(modeComment, /\bindicadores?\b/i);
  assert.match(modeComment, /\bprofessor(?:es)?\b/i);

  const stats = getFunctionDefinition(
    'stats_pesquisa_evasao',
    ['uuid', 'integer', 'integer'],
  );
  assert.match(
    stats,
    /(?:pe|pesquisa_evasao)\.modo_teste\s*=\s*false\b/i,
    'stats precisa excluir modo_teste=true',
  );
});

contractTest('slots de teste e producao sao independentes', () => {
  assert.match(
    sql,
    /create\s+unique\s+index[\s\S]*?on\s+public\.pesquisa_evasao\s*\(\s*evasao_id\s*\)[\s\S]*?where\s+(?:\(\s*)?modo_teste\s*=\s*false/i,
  );
  assert.doesNotMatch(
    sql,
    /(?:constraint\s+[a-z0-9_]+\s+)?unique\s*\(\s*evasao_id\s*\)\s*[,;]/i,
  );
  assert.doesNotMatch(
    sql,
    /on\s+conflict\s*\(\s*evasao_id\s*\)\s+do\s+update/i,
  );

  const testSlotIndex = statements(sql).find(
    (statement) =>
      /\bcreate\s+unique\s+index\b/i.test(statement) &&
      /\bon\s+public\.pesquisa_evasao\s*\(/i.test(statement) &&
      /\bmodo_teste\s*=\s*true\b/i.test(statement) &&
      /['"]enviando['"]/i.test(statement) &&
      /['"]incerto['"]/i.test(statement),
  );
  assert.ok(
    testSlotIndex,
    'indice parcial do slot ativo de teste precisa cobrir enviando e incerto',
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
    const revoke = statements(sql).find(
      (statement) =>
        /\brevoke\s+all\s+on\s+function\b/i.test(statement) &&
        new RegExp(
          `public\\.${escapeRegex(name)}\\s*\\(\\s*${escapeRegex(args).replace(/,\\ /g, ',\\s*')}\\s*\\)`,
          'i',
        ).test(statement) &&
        /\bpublic\b/i.test(statement) &&
        /\banon\b/i.test(statement),
    );

    assert.ok(revoke, `REVOKE PUBLIC/anon ausente para ${name}(${args})`);
  }
});

contractTest('criar pesquisa e service-only e nao antecipa sucesso do provedor', () => {
  const definition = getFunctionDefinition(
    'criar_pesquisa_evasao',
    ['integer', 'text'],
  );
  const revoke = statements(sql).find(
    (statement) =>
      /\brevoke\s+all\s+on\s+function\s+public\.criar_pesquisa_evasao\s*\(\s*integer\s*,\s*text\s*\)/i
        .test(statement),
  );
  const serviceGrant = statements(sql).find(
    (statement) =>
      /\bgrant\s+execute\s+on\s+function\s+public\.criar_pesquisa_evasao\s*\(\s*integer\s*,\s*text\s*\)\s+to\s+service_role\b/i
        .test(statement),
  );

  assert.match(definition, /\bsecurity\s+definer\b/i);
  assert.match(definition, /\bset\s+search_path\s*=\s*public\s*,\s*pg_temp\b/i);
  assert.match(
    definition,
    /\bauth\.role\s*\(\s*\)\s*(?:<>|!=)\s*['"]service_role['"]/i,
  );
  assert.ok(revoke, 'REVOKE de criar_pesquisa_evasao ausente');
  assert.match(revoke, /\bauthenticated\b/i);
  assert.ok(serviceGrant, 'criar_pesquisa_evasao nao foi concedida a service_role');
  assert.doesNotMatch(
    definition,
    /\b(?:status|envio_status)\s*=\s*['"]enviado['"]/i,
  );
  assert.doesNotMatch(
    definition,
    /['"]enviado['"]\s*,\s*(?:now|clock_timestamp)\s*\(\s*\)/i,
  );
});

contractTest('pode_enviar exige permissao concreta ou service role', () => {
  const definition = getFunctionDefinition(
    'pode_enviar_pesquisa_evasao',
    ['integer'],
  );

  assert.match(definition, /\bmovimentacoes_admin\b/i);
  assert.match(
    definition,
    /fn_usuario_atual_tem_permissao_estrita\s*\(\s*['"]sucesso_aluno\.evasao\.enviar['"](?:\s*::\s*varchar)?\s*,\s*[a-z_]+\.unidade_id\s*\)/i,
  );
  assert.match(definition, /\bauth\.role\s*\(\s*\)\s*=\s*['"]service_role['"]/i);
  assert.doesNotMatch(
    definition,
    /fn_usuario_atual_tem_permissao_estrita\s*\([^)]*,\s*null\s*\)/i,
  );
});
