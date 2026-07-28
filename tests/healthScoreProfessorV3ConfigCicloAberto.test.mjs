import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260727123000_health_score_v3_config_ciclo_aberto.sql';
const segmentedConfigMigrationPath =
  'supabase/migrations/20260719204000_health_score_v3_config_segmentada_rpc.sql';
const catalogConfigMigrationPath =
  'supabase/migrations/20260720122000_health_score_v3_catalogo_segmentos_config.sql';
const offerGuardMigrationPath =
  'supabase/migrations/20260721152000_health_score_v3_oferta_formal_guard.sql';
const expectedMetrics = [
  'conversao',
  'media_turma',
  'numero_alunos',
  'permanencia',
  'presenca',
  'retencao',
];

function migration() {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  return readFileSync(migrationPath, 'utf8');
}

function functionBlocks(sql, name) {
  const starts = [
    ...sql.matchAll(
      new RegExp(
        `create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(`,
        'gi',
      ),
    ),
  ].map((match) => match.index);

  return starts.map((start) => {
    const rest = sql.slice(start);
    const next = rest.slice(1).search(
      /\ncreate\s+or\s+replace\s+function\s+public\./i,
    );
    return next === -1 ? rest : rest.slice(0, next + 1);
  });
}

function functionBlock(sql, name) {
  const blocks = functionBlocks(sql, name);
  assert.ok(blocks.length > 0, `${name} deve existir`);
  return blocks[0];
}

function sqlWithoutComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\r\n]*/g, '');
}

function sqlStatements(sql) {
  return sqlWithoutComments(sql)
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function exactMetricLists(sql) {
  return [
    ...sql.matchAll(
      /\b(?:[a-z_][a-z0-9_]*\.)?metrica\s+in\s*\(([^()]*)\)/gi,
    ),
  ].map((match) => [
    ...match[1].matchAll(/'([^']+)'/g),
  ].map((value) => value[1]));
}

function assertNoSnapshotWrites(block, operation) {
  assert.doesNotMatch(
    sqlWithoutComments(block),
    /\b(?:insert\s+into|update\s+(?:only\s+)?|delete\s+from\s+(?:only\s+)?|merge\s+into|truncate(?:\s+table)?)\s+(?:public\s*\.\s*)?health_score_professor_v3_snapshot[a-z0-9_]*\b/i,
    `${operation} nao pode escrever em nenhuma tabela health_score_professor_v3_snapshot*`,
  );
}

function runPsql(containerName, input) {
  return spawnSync(
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
    { encoding: 'utf8', input, maxBuffer: 16 * 1024 * 1024 },
  );
}

test('Task 6 disponibiliza a migration do ciclo aberto Jun-Ago', () => {
  assert.equal(
    existsSync(migrationPath),
    true,
    `${migrationPath} ainda nao foi implementada`,
  );
});

test(
  'retries governados usam chave deterministica sem invalidar legado',
  { skip: !existsSync(migrationPath) },
  () => {
    const sql = migration();
    const createBlock = sqlWithoutComments(functionBlock(
      sql,
      'criar_health_score_professor_v3_config_revisao_ciclo_aberto',
    ));
    const activateBlock = sqlWithoutComments(functionBlock(
      sql,
      'ativar_health_score_professor_v3_config_revisao_ciclo_aberto',
    ));

    assert.match(
      sql,
      /alter\s+table\s+public\.health_score_professor_v3_config_versoes\s+add\s+column\s+if\s+not\s+exists\s+chave_criacao_governada\s+text/i,
      'chave governada deve ser nullable para configuracoes legadas',
    );
    assert.match(
      sql,
      /create\s+unique\s+index\s+if\s+not\s+exists\s+\w+\s+on\s+public\.health_score_professor_v3_config_versoes\s*\(\s*chave_criacao_governada\s*\)\s+where\s+chave_criacao_governada\s+is\s+not\s+null/i,
      'chave governada deve ter unicidade parcial',
    );
    for (const component of [
      'p_config_origem_id',
      'p_vigencia_inicio',
      'p_vigencia_fim',
      'p_justificativa',
      'v_ator',
    ]) {
      assert.match(
        createBlock,
        new RegExp(`\\b${component}\\b`, 'i'),
        `chave de criacao deve considerar ${component}`,
      );
    }
    assert.match(
      createBlock,
      /where\s+c\.chave_criacao_governada\s*=\s*v_chave_criacao/i,
      'retry deve localizar a configuracao pela chave governada sob o lock',
    );
    assert.match(createBlock, /'ja_existente'\s*,\s*true/i);
    assert.match(activateBlock, /v_config\.status\s*=\s*'ativa'/i);
    assert.match(activateBlock, /'ja_ativa'\s*,\s*true/i);
    assert.match(activateBlock, /'ja_ativa'\s*,\s*false/i);
  },
);

test(
  'substituicao de configuracao e append only, privada e auditavel',
  { skip: !existsSync(migrationPath) },
  () => {
    const sql = migration();

    assert.match(
      sql,
      /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.health_score_professor_v3_config_substituicoes/i,
    );
    for (const field of [
      'config_anterior_id',
      'config_nova_id',
      'vigencia_inicio',
      'vigencia_fim',
      'justificativa',
      'substituido_por',
      'substituido_em',
    ]) {
      assert.match(sql, new RegExp(`\\b${field}\\b`, 'i'));
    }
    assert.match(
      sql,
      /alter\s+table\s+public\.health_score_professor_v3_config_substituicoes\s+enable\s+row\s+level\s+security/i,
    );
    assert.match(
      sql,
      /revoke\s+all\s+on\s+table\s+public\.health_score_professor_v3_config_substituicoes\s+from\s+public,\s*anon,\s*authenticated/i,
    );
    assert.match(
      sql,
      /grant\s+select\s+on\s+table\s+public\.health_score_professor_v3_config_substituicoes\s+to\s+service_role/i,
    );
    assert.match(
      sql,
      /create\s+trigger\s+trg_health_score_professor_v3_config_substituicoes_append_only[\s\S]*before\s+update\s+or\s+delete/i,
    );
    assert.doesNotMatch(
      sql,
      /create\s+policy[\s\S]*health_score_professor_v3_config_substituicoes/i,
    );
    assert.doesNotMatch(
      sql,
      /update\s+public\.health_score_professor_v3_config_substituicoes/i,
    );
    assert.doesNotMatch(
      sql,
      /delete\s+from\s+public\.health_score_professor_v3_config_substituicoes/i,
    );
  },
);

test(
  'rascunho retroativo clona o conjunto exato de seis metricas e a matriz',
  { skip: !existsSync(migrationPath) },
  () => {
    const block = sqlWithoutComments(functionBlock(
      migration(),
      'criar_health_score_professor_v3_config_revisao_ciclo_aberto',
    ));
    const cloneStatement = sqlStatements(block).find((statement) => (
      /\binsert\s+into\s+public\.health_score_professor_v3_config_metricas\b/i
        .test(statement)
    ));

    assert.match(block, /p_config_origem_id\s+uuid/i);
    assert.match(block, /p_vigencia_inicio\s+date/i);
    assert.match(block, /p_vigencia_fim\s+date/i);
    assert.match(block, /p_justificativa\s+text/i);
    assert.match(block, /fn_health_score_professor_v3_ator_gerenciador/i);
    assert.match(block, /pg_advisory_xact_lock/i);
    assert.match(
      block,
      /insert\s+into\s+public\.health_score_professor_v3_config_metricas/i,
    );
    assert.ok(
      cloneStatement,
      'clonagem de health_score_professor_v3_config_metricas deve existir',
    );
    const clonedMetricSet = exactMetricLists(cloneStatement)
      .find((metrics) => (
        metrics.length === expectedMetrics.length
        && expectedMetrics.every((metric) => metrics.includes(metric))
      ));
    assert.ok(
      clonedMetricSet,
      'clonagem deve restringir explicitamente as seis metricas canonicas',
    );
    assert.deepEqual(
      [...new Set(clonedMetricSet)].sort(),
      expectedMetrics,
      'clonagem nao pode aceitar metrica extra, duplicada ou ausente',
    );
    assert.match(
      block,
      /insert\s+into\s+public\.health_score_professor_v3_config_metas_curso_modalidade/i,
    );
    assert.match(
      block,
      /join\s+public\.cursos[\s\S]*natureza_operacional\s*=\s*'pedagogica'/i,
    );
    assert.match(
      block,
      /where\s+(?:m\.)?config_id\s*=\s*p_config_origem_id/i,
    );
    assert.match(
      block,
      /p_vigencia_inicio\s+(?:is\s+distinct\s+from|<>)\s+date\s+'2026-06-01'/i,
    );
    assert.match(
      block,
      /p_vigencia_fim\s+(?:is\s+distinct\s+from|<>)\s+date\s+'2026-08-31'/i,
    );
    assert.doesNotMatch(
      block,
      /update\s+public\.health_score_professor_v3_config_metricas/i,
    );
    assert.doesNotMatch(
      block,
      /update\s+public\.health_score_professor_v3_config_metas_curso_modalidade/i,
    );
    assert.doesNotMatch(block, /\bon\s+conflict\b/i);
  },
);

test(
  'fingerprint inclui vigencia_fim e continua helper privado',
  { skip: !existsSync(migrationPath) },
  () => {
    const sql = migration();
    const block = functionBlock(
      sql,
      'fn_health_score_professor_v3_config_fingerprint',
    );

    assert.match(block, /'vigencia_fim'\s*,\s*c\.vigencia_fim/i);
    assert.match(
      sql,
      /revoke\s+all\s+on\s+function\s+public\.fn_health_score_professor_v3_config_fingerprint\s*\(\s*uuid\s*\)\s+from\s+public,\s*anon,\s*authenticated/i,
    );
    assert.match(
      sql,
      /grant\s+execute\s+on\s+function\s+public\.fn_health_score_professor_v3_config_fingerprint\s*\(\s*uuid\s*\)\s+to\s+service_role/i,
    );
  },
);

test(
  'criar salvar simular e ativar nao escrevem em nenhuma tabela de snapshot',
  { skip: !existsSync(migrationPath) },
  () => {
    const cycleSql = migration();
    const establishedLifecycleSql = [
      readFileSync(segmentedConfigMigrationPath, 'utf8'),
      readFileSync(catalogConfigMigrationPath, 'utf8'),
      readFileSync(offerGuardMigrationPath, 'utf8'),
      cycleSql,
    ].join('\n');
    const operationBlocks = new Map([
      [
        'criar',
        functionBlocks(
          cycleSql,
          'criar_health_score_professor_v3_config_revisao_ciclo_aberto',
        ),
      ],
      [
        'salvar',
        functionBlocks(
          establishedLifecycleSql,
          'salvar_health_score_professor_v3_config_rascunho',
        ),
      ],
      [
        'simular',
        functionBlocks(
          establishedLifecycleSql,
          'simular_health_score_professor_v3_config',
        ),
      ],
      [
        'ativar',
        functionBlocks(
          cycleSql,
          'ativar_health_score_professor_v3_config_revisao_ciclo_aberto',
        ),
      ],
    ]);

    for (const [operation, blocks] of operationBlocks) {
      assert.ok(blocks.length > 0, `${operation} deve ter definicao auditavel`);
      for (const block of blocks) {
        assertNoSnapshotWrites(block, operation);
      }
    }
  },
);

test(
  'ativacao usa Jun-Ago exato arquiva so o conflito e preserva setembro',
  { skip: !existsSync(migrationPath) },
  () => {
    const block = sqlWithoutComments(functionBlock(
      migration(),
      'ativar_health_score_professor_v3_config_revisao_ciclo_aberto',
    ));
    const statements = sqlStatements(block);
    const snapshotGuard = statements.find((statement) => (
      /\bfrom\s+public\.health_score_professor_v3_snapshot[a-z0-9_]*\b/i
        .test(statement)
      && /\bestado\s*=\s*'fechado'/i.test(statement)
    ));
    const conflictSelector = statements.find((statement) => (
      /\bfrom\s+public\.health_score_professor_v3_config_versoes\b/i
        .test(statement)
      && /\binto\s+v_config_conflitante\b/i.test(statement)
    ));
    const archivalStatements = statements.filter((statement) => (
      /\bupdate\s+public\.health_score_professor_v3_config_versoes\b/i
        .test(statement)
      && /\bstatus\s*=\s*'arquivada'/i.test(statement)
    ));
    const configUpdates = statements.filter((statement) => (
      /\bupdate\s+public\.health_score_professor_v3_config_versoes\b/i
        .test(statement)
    ));
    const simulationSelector = statements.find((statement) => (
      /\bfrom\s+public\.health_score_professor_v3_config_simulacoes\b/i
        .test(statement)
    ));
    const septemberGuard = statements.find((statement) => (
      /\bfrom\s+public\.health_score_professor_v3_config_versoes\b/i
        .test(statement)
      && /date\s+'2026-09-01'/i.test(statement)
      && /\bstatus\s*=\s*'ativa'/i.test(statement)
    ));

    assert.match(block, /fn_health_score_professor_v3_ator_gerenciador/i);
    assert.match(block, /pg_advisory_xact_lock/i);
    assert.match(block, /fn_health_score_professor_v3_config_fingerprint/i);
    assert.match(
      block,
      /health_score_professor_v3_config_simulacoes/i,
    );
    assert.ok(
      simulationSelector,
      'ativacao deve selecionar a simulacao persistida',
    );
    assert.match(
      simulationSelector,
      /\bcompetencia\s+between\s+date\s+'2026-06-01'\s+and\s+date\s+'2026-08-31'/i,
      'simulacao recente deve pertencer ao ciclo revisado',
    );
    assert.match(block, /simulacao\s+atual\s+obrigatoria/i);
    assert.ok(snapshotGuard, 'ativacao deve consultar snapshots fechados');
    assert.match(
      snapshotGuard,
      /\bcompetencia\s+between\s+date\s+'2026-06-01'\s+and\s+date\s+'2026-08-31'/i,
    );
    assert.match(
      block,
      /insert\s+into\s+public\.health_score_professor_v3_config_substituicoes/i,
    );
    assert.ok(
      conflictSelector,
      'configuracao ativa conflitante deve ser selecionada isoladamente',
    );
    assert.match(
      conflictSelector,
      /\bvigencia_inicio\s*<=\s*date\s+'2026-08-31'/i,
    );
    assert.match(block, /v_config_conflitante\.vigencia_inicio\s+is\s+distinct\s+from\s+date\s+'2026-06-01'/i);
    assert.match(block, /v_config_conflitante\.vigencia_fim\s+is\s+distinct\s+from\s+date\s+'2026-08-31'/i);
    assert.match(
      block,
      /set_config\s*\(\s*'app\.health_score_v3_config_ciclo_aberto_arquivar_id'\s*,\s*v_config_conflitante\.id::text\s*,\s*true\s*\)/i,
    );
    assert.equal(
      archivalStatements.length,
      1,
      'ativacao deve ter um unico arquivamento de configuracao',
    );
    assert.match(
      archivalStatements[0],
      /\bwhere\s+(?:[a-z_][a-z0-9_]*\.)?id\s*=\s*v_config_conflitante\.id\b/i,
      'arquivamento deve atingir somente o conflito previamente bloqueado',
    );
    assert.equal(
      configUpdates.length,
      2,
      'ativacao deve atualizar apenas a revisao nova e o conflito',
    );
    const activationUpdate = configUpdates.find((statement) => (
      /\bset\s+status\s*=\s*'ativa'/i.test(statement)
    ));
    assert.ok(activationUpdate, 'revisao nova deve ser ativada');
    assert.match(
      activationUpdate,
      /\bwhere\s+(?:[a-z_][a-z0-9_]*\.)?id\s*=\s*p_config_id\b/i,
      'ativacao deve atingir somente a revisao solicitada',
    );
    assert.ok(
      septemberGuard,
      'configuracao ativa iniciada em 2026-09-01 deve ser revalidada e preservada',
    );
    assert.doesNotMatch(
      septemberGuard,
      /\b(?:insert\s+into|update|delete\s+from|merge\s+into|truncate)\b/i,
      'guarda de setembro deve ser somente leitura',
    );
    assert.doesNotMatch(
      block,
      /get_health_score_professor_v3_config_ui/i,
      'selecao temporal nao pode depender da configuracao mais recente da UI',
    );
  },
);

test(
  'selecao temporal mantem uma configuracao ativa por dia',
  { skip: !existsSync(migrationPath) },
  () => {
    const sql = migration();

    assert.match(sql, /date\s+'2026-06-01'/i);
    assert.match(sql, /date\s+'2026-08-31'/i);
    assert.match(sql, /date\s+'2026-09-01'/i);
    assert.match(
      sql,
      /exclude\s+using\s+gist|HEALTH_SCORE_V3_CONFIG_VIGENCIA_CONFLITANTE/i,
    );
  },
);

test(
  'RPCs do ciclo aberto sao definers com search path e grants governados',
  { skip: !existsSync(migrationPath) },
  () => {
    const sql = migration();

    for (const name of [
      'criar_health_score_professor_v3_config_revisao_ciclo_aberto',
      'ativar_health_score_professor_v3_config_revisao_ciclo_aberto',
    ]) {
      const block = functionBlock(sql, name);
      assert.match(block, /security definer/i);
      assert.match(block, /set search_path\s*=\s*public,\s*pg_temp/i);
      assert.match(
        sql,
        new RegExp(
          `revoke\\s+all\\s+on\\s+function\\s+public\\.${name}\\([^;]+from\\s+public,\\s*anon`,
          'i',
        ),
      );
      assert.match(
        sql,
        new RegExp(
          `grant\\s+execute\\s+on\\s+function\\s+public\\.${name}\\([^;]+to\\s+authenticated,\\s*service_role`,
          'i',
        ),
      );
    }

    assert.match(
      sql,
      /grant\s+execute\s+on\s+function\s+public\.salvar_health_score_professor_v3_config_rascunho\s*\(\s*uuid\s*,\s*date\s*,\s*text\s*,\s*jsonb\s*,\s*jsonb\s*\)\s+to\s+authenticated,\s*service_role/i,
    );
  },
);

test(
  'fixture PostgreSQL prova lifecycle retroativo, guardas, temporalidade e ACL',
  { skip: !existsSync(migrationPath), timeout: 90_000 },
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
    const image = process.env.TASK6_POSTGRES_IMAGE || 'postgres:17-alpine';
    const imageInspection = spawnSync('docker', ['image', 'inspect', image], {
      encoding: 'utf8',
    });
    assert.equal(
      imageInspection.status,
      0,
      `imagem PostgreSQL obrigatoria ausente (${image}):\n${imageInspection.stderr}`,
    );

    const containerName = `la-task6-postgres-${process.pid}-${Date.now()}`;
    const started = spawnSync(
      'docker',
      [
        'run',
        '--detach',
        '--rm',
        '--name',
        containerName,
        '--env',
        'POSTGRES_PASSWORD=task6',
        image,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(started.status, 0, `nao iniciou PostgreSQL:\n${started.stderr}`);

    try {
      let ready = false;
      let consecutiveReadyChecks = 0;
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const check = spawnSync(
          'docker',
          ['exec', containerName, 'pg_isready', '-U', 'postgres', '-d', 'postgres'],
          { encoding: 'utf8' },
        );
        if (check.status === 0) {
          consecutiveReadyChecks += 1;
          if (consecutiveReadyChecks >= 3) {
            ready = true;
            break;
          }
        } else {
          consecutiveReadyChecks = 0;
        }
      }
      assert.equal(ready, true, 'PostgreSQL da fixture nao ficou pronto');

      const schema = String.raw`
        create role anon;
        create role authenticated;
        create role service_role;

        create table public.usuarios (id integer primary key);
        insert into public.usuarios values (1);

        create table public.cursos (
          id integer primary key,
          nome text not null,
          natureza_operacional text not null
            check (natureza_operacional in ('pedagogica', 'comercial'))
        );
        create table public.unidades (id uuid primary key, nome text not null);
        insert into public.cursos values
          (10, 'Piano', 'pedagogica'),
          (45, 'Aula Experimental', 'comercial');
        insert into public.unidades values
          ('368d47f5-2d88-4475-bc14-ba084a9a348e', 'Barra');

        create table public.health_score_professor_v3_config_versoes (
          id uuid primary key default gen_random_uuid(),
          versao integer not null unique check (versao > 0),
          status text not null
            check (status in ('rascunho', 'ativa', 'arquivada')),
          vigencia_inicio date not null,
          vigencia_fim date,
          cobertura_minima numeric(5,2) not null default 60,
          faixa_atencao_min numeric(5,2) not null default 50,
          faixa_saudavel_min numeric(5,2) not null default 70,
          exige_pilar_fidelizacao boolean not null default true,
          justificativa text not null,
          criado_por integer references public.usuarios(id),
          ativado_por integer references public.usuarios(id),
          criado_em timestamptz not null default now(),
          ativado_em timestamptz,
          atualizado_em timestamptz not null default now(),
          check (vigencia_fim is null or vigencia_fim >= vigencia_inicio),
          constraint health_score_professor_v3_config_vigencia_ativa_excl
          exclude using gist (
            daterange(
              vigencia_inicio,
              coalesce(vigencia_fim + 1, 'infinity'::date),
              '[)'
            ) with &&
          ) where (status = 'ativa')
        );
        create table public.health_score_professor_v3_config_metricas (
          id uuid primary key default gen_random_uuid(),
          config_id uuid not null
            references public.health_score_professor_v3_config_versoes(id),
          metrica text not null,
          peso numeric not null,
          meta numeric,
          amostra_minima integer not null,
          cobertura_minima numeric,
          parametros jsonb not null,
          criado_em timestamptz not null default now(),
          atualizado_em timestamptz not null default now(),
          unique (config_id, metrica)
        );
        create table public.health_score_professor_v3_config_metas_curso_modalidade (
          id uuid primary key default gen_random_uuid(),
          config_id uuid not null
            references public.health_score_professor_v3_config_versoes(id),
          unidade_id uuid not null references public.unidades(id),
          curso_id integer not null references public.cursos(id),
          modalidade text not null,
          estado text not null,
          capacidade_maxima numeric,
          meta_media_turma numeric,
          meta_carteira_curso numeric,
          parametros jsonb not null default '{}'::jsonb,
          criado_em timestamptz not null default now(),
          atualizado_em timestamptz not null default now(),
          unique (config_id, unidade_id, curso_id, modalidade)
        );
        create table public.health_score_professor_v3_config_simulacoes (
          id uuid primary key default gen_random_uuid(),
          config_id uuid not null
            references public.health_score_professor_v3_config_versoes(id),
          competencia date not null,
          config_fingerprint text not null,
          resultado jsonb not null,
          simulado_por integer references public.usuarios(id),
          criado_em timestamptz not null default now()
        );
        create table public.health_score_professor_v3_snapshots (
          id uuid primary key default gen_random_uuid(),
          config_id uuid not null
            references public.health_score_professor_v3_config_versoes(id),
          competencia date not null,
          estado text not null
        );
        create table public.professor_unidade_curso_modalidade (
          id uuid primary key default gen_random_uuid(),
          professor_id integer not null,
          unidade_id uuid not null references public.unidades(id),
          curso_id integer not null references public.cursos(id),
          modalidade text not null,
          status text not null,
          vigencia_fim date,
          confianca text not null
        );

        create function public.fn_health_score_professor_v3_ator_gerenciador()
        returns integer language sql stable security definer
        set search_path = public, pg_temp
        as $stub$ select 1 $stub$;

        create function public.fn_health_score_professor_v3_config_json(
          p_config_id uuid
        )
        returns jsonb language sql stable security definer
        set search_path = public, pg_temp
        as $stub$
          select jsonb_build_object(
            'id', c.id,
            'versao', c.versao,
            'status', c.status,
            'vigencia_inicio', c.vigencia_inicio,
            'vigencia_fim', c.vigencia_fim
          )
          from public.health_score_professor_v3_config_versoes c
          where c.id = p_config_id
        $stub$;

        create function public.fn_health_score_professor_v3_segmentos_faltantes_v1(
          uuid
        )
        returns jsonb language sql stable security definer
        set search_path = public, pg_temp
        as $stub$ select '[]'::jsonb $stub$;

        create function public.get_health_score_professor_v3_metricas_segmentadas_v1(
          p_competencia date,
          p_config_id uuid,
          p_unidade_id uuid default null,
          p_periodicidade text default 'mensal'
        )
        returns table (
          metrica text, professor_id integer, professor_nome text,
          unidade_id uuid, competencia date, curso_id integer,
          curso_nome text, modalidade text, config_meta_segmento_id uuid,
          atribuicao_id uuid, atribuicao_formal boolean,
          atribuicao_pontuavel boolean, pessoas_unicas integer,
          pessoas_unicas_total numeric, pessoas_fechamentos integer,
          meses_com_base integer, meses_com_base_consolidado integer,
          meses_no_periodo integer, vinculos_ativos integer,
          turmas_elegiveis integer, ocupacoes_unicas integer,
          valor_observado numeric, capacidade_maxima numeric,
          meta_aplicada numeric, numerador numeric, denominador numeric,
          nota_segmento numeric, estado_base text, publicavel boolean,
          capacidade_excedida boolean, alertas_capacidade jsonb, fonte text,
          regra_versao text, linha_diagnostico boolean,
          dados_sem_resolucao integer, estados_resolucao jsonb,
          divergencias jsonb, detalhes jsonb
        )
        language sql stable security definer
        set search_path = public, pg_temp
        as $stub$
          select
            null::text, null::integer, null::text, null::uuid, null::date,
            null::integer, null::text, null::text, null::uuid, null::uuid,
            null::boolean, null::boolean, null::integer, null::numeric,
            null::integer, null::integer, null::integer, null::integer,
            null::integer, null::integer, null::integer, null::numeric,
            null::numeric, null::numeric, null::numeric, null::numeric,
            null::numeric, null::text, null::boolean, null::boolean,
            null::jsonb, null::text, null::text, null::boolean, null::integer,
            null::jsonb, null::jsonb, null::jsonb
          where false
        $stub$;

        create function public.salvar_health_score_professor_v3_config_rascunho(
          uuid, date, text, jsonb, jsonb
        )
        returns jsonb language sql security definer
        set search_path = public, pg_temp
        as $stub$ select '{}'::jsonb $stub$;

        create function public.fn_health_score_professor_v3_bloquear_config_versao()
        returns trigger language plpgsql
        set search_path = public, pg_temp
        as $stub$
        begin
          if old.status <> 'rascunho' then
            raise exception 'HEALTH_SCORE_V3_CONFIG_IMUTAVEL';
          end if;
          if tg_op = 'UPDATE' then
            new.atualizado_em := now();
            return new;
          end if;
          return old;
        end;
        $stub$;
        create trigger trg_health_score_professor_v3_config_versao_imutavel
        before update or delete
        on public.health_score_professor_v3_config_versoes
        for each row
        execute function public.fn_health_score_professor_v3_bloquear_config_versao();

        insert into public.health_score_professor_v3_config_versoes (
          id, versao, status, vigencia_inicio, vigencia_fim, justificativa,
          criado_por, ativado_por, ativado_em
        ) values
          (
            '11111111-1111-1111-1111-111111111111',
            3,
            'ativa',
            date '2026-06-01',
            date '2026-08-31',
            'origem Jun-Ago',
            1,
            1,
            now()
          ),
          (
            '22222222-2222-2222-2222-222222222222',
            4,
            'ativa',
            date '2026-09-01',
            null,
            'futura setembro',
            1,
            1,
            now()
          );

        insert into public.health_score_professor_v3_config_metricas (
          config_id, metrica, peso, meta, amostra_minima, cobertura_minima,
          parametros
        )
        select
          '11111111-1111-1111-1111-111111111111',
          x.metrica,
          x.peso,
          case when x.metrica in ('media_turma', 'numero_alunos')
            then null else 100 end,
          1,
          null,
          case when x.metrica in ('media_turma', 'numero_alunos')
            then '{"meta_status":"aprovada","normalizacao":"segmentada_unidade_curso_modalidade"}'::jsonb
            else '{"meta_status":"aprovada"}'::jsonb
          end
        from (values
          ('retencao'::text, 20::numeric),
          ('permanencia', 20),
          ('conversao', 15),
          ('media_turma', 15),
          ('numero_alunos', 15),
          ('presenca', 15)
        ) x(metrica, peso);

        insert into public.health_score_professor_v3_config_metas_curso_modalidade (
          config_id, unidade_id, curso_id, modalidade, estado,
          capacidade_maxima, meta_media_turma, meta_carteira_curso, parametros
        ) values
          (
            '11111111-1111-1111-1111-111111111111',
            '368d47f5-2d88-4475-bc14-ba084a9a348e',
            10,
            'turma',
            'configurada',
            4,
            3,
            30,
            '{"origem":"fixture"}'
          ),
          (
            '11111111-1111-1111-1111-111111111111',
            '368d47f5-2d88-4475-bc14-ba084a9a348e',
            45,
            'turma',
            'configurada',
            1,
            1,
            1,
            '{"origem":"fixture_comercial"}'
          );

        insert into public.professor_unidade_curso_modalidade (
          professor_id, unidade_id, curso_id, modalidade, status,
          vigencia_fim, confianca
        ) values (
          7,
          '368d47f5-2d88-4475-bc14-ba084a9a348e',
          10,
          'turma',
          'ativo',
          null,
          'alta'
        );
      `;

      const assertions = String.raw`
        do $fixture$
        declare
          v_nova_id uuid;
          v_criacao_1 jsonb;
          v_criacao_2 jsonb;
          v_criacao_apos_ativacao jsonb;
          v_ativacao_1 jsonb;
          v_ativacao_2 jsonb;
          v_origem_antes text;
          v_origem_depois text;
          v_fingerprint_1 text;
          v_fingerprint_2 text;
          v_temporal_id uuid;
          v_total integer;
        begin
          select md5(
            row_to_json(c)::text
            || coalesce((
              select jsonb_agg(to_jsonb(m) order by m.metrica)::text
              from public.health_score_professor_v3_config_metricas m
              where m.config_id = c.id
            ), '[]')
            || coalesce((
              select jsonb_agg(
                to_jsonb(s) order by s.unidade_id, s.curso_id, s.modalidade
              )::text
              from public.health_score_professor_v3_config_metas_curso_modalidade s
              where s.config_id = c.id
            ), '[]')
          ) into v_origem_antes
          from public.health_score_professor_v3_config_versoes c
          where c.id = '11111111-1111-1111-1111-111111111111';

          select public.criar_health_score_professor_v3_config_revisao_ciclo_aberto(
            '11111111-1111-1111-1111-111111111111',
            date '2026-06-01',
            date '2026-08-31',
            'revisao retroativa fixture'
          ) into v_criacao_1;

          select public.criar_health_score_professor_v3_config_revisao_ciclo_aberto(
            '11111111-1111-1111-1111-111111111111',
            date '2026-06-01',
            date '2026-08-31',
            'revisao retroativa fixture'
          ) into v_criacao_2;

          if (v_criacao_1->>'id')::uuid is distinct from
             (v_criacao_2->>'id')::uuid
             or coalesce((v_criacao_1->>'ja_existente')::boolean, true)
             or not coalesce((v_criacao_2->>'ja_existente')::boolean, false) then
            raise exception 'retry de criacao nao retornou a mesma revisao';
          end if;

          select c.id into strict v_nova_id
          from public.health_score_professor_v3_config_versoes c
          where c.id = (v_criacao_1->>'id')::uuid
            and c.status = 'rascunho'
            and c.chave_criacao_governada is not null;

          select count(*) into v_total
          from public.health_score_professor_v3_config_versoes;
          if v_total <> 3 then
            raise exception 'retry de criacao duplicou versao: %', v_total;
          end if;
          select count(*) into v_total
          from public.health_score_professor_v3_config_versoes
          where chave_criacao_governada is null;
          if v_total <> 2 then
            raise exception 'configuracao historica sem chave deixou de ser valida: %', v_total;
          end if;
          if exists (select 1 from public.health_score_professor_v3_snapshots) then
            raise exception 'retry de criacao escreveu snapshot';
          end if;

          select md5(
            row_to_json(c)::text
            || coalesce((
              select jsonb_agg(to_jsonb(m) order by m.metrica)::text
              from public.health_score_professor_v3_config_metricas m
              where m.config_id = c.id
            ), '[]')
            || coalesce((
              select jsonb_agg(
                to_jsonb(s) order by s.unidade_id, s.curso_id, s.modalidade
              )::text
              from public.health_score_professor_v3_config_metas_curso_modalidade s
              where s.config_id = c.id
            ), '[]')
          ) into v_origem_depois
          from public.health_score_professor_v3_config_versoes c
          where c.id = '11111111-1111-1111-1111-111111111111';

          if v_origem_antes is distinct from v_origem_depois then
            raise exception 'criacao alterou a origem';
          end if;

          select count(*) into v_total
          from public.health_score_professor_v3_config_metricas m
          where m.config_id = v_nova_id;
          if v_total <> 6 then
            raise exception 'clone de metricas incompleto: %', v_total;
          end if;
          if exists (
            (
              select metrica, peso, meta, amostra_minima, cobertura_minima, parametros
              from public.health_score_professor_v3_config_metricas
              where config_id = '11111111-1111-1111-1111-111111111111'
              except
              select metrica, peso, meta, amostra_minima, cobertura_minima, parametros
              from public.health_score_professor_v3_config_metricas
              where config_id = v_nova_id
            )
            union all
            (
              select metrica, peso, meta, amostra_minima, cobertura_minima, parametros
              from public.health_score_professor_v3_config_metricas
              where config_id = v_nova_id
              except
              select metrica, peso, meta, amostra_minima, cobertura_minima, parametros
              from public.health_score_professor_v3_config_metricas
              where config_id = '11111111-1111-1111-1111-111111111111'
            )
          ) then
            raise exception 'clone de metricas divergiu da origem';
          end if;
          if exists (
            select 1
            from public.health_score_professor_v3_config_metas_curso_modalidade
            where config_id = v_nova_id and curso_id = 45
          ) then
            raise exception 'clone copiou curso comercial 45';
          end if;
          select count(*) into v_total
          from public.health_score_professor_v3_config_metas_curso_modalidade
          where config_id = v_nova_id and curso_id = 10;
          if v_total <> 1 then
            raise exception 'clone nao preservou matriz pedagogica';
          end if;

          v_fingerprint_1 :=
            public.fn_health_score_professor_v3_config_fingerprint(v_nova_id);
          update public.health_score_professor_v3_config_versoes
          set vigencia_fim = date '2026-08-30'
          where id = v_nova_id;
          v_fingerprint_2 :=
            public.fn_health_score_professor_v3_config_fingerprint(v_nova_id);
          if v_fingerprint_1 is not distinct from v_fingerprint_2 then
            raise exception 'fingerprint ignorou vigencia_fim';
          end if;
          update public.health_score_professor_v3_config_versoes
          set vigencia_fim = date '2026-08-31'
          where id = v_nova_id;

          alter table public.health_score_professor_v3_config_versoes
            disable trigger user;
          update public.health_score_professor_v3_config_versoes
          set vigencia_fim = date '2026-08-30'
          where id = '11111111-1111-1111-1111-111111111111';
          alter table public.health_score_professor_v3_config_versoes
            enable trigger user;

          insert into public.health_score_professor_v3_config_simulacoes (
            config_id, competencia, config_fingerprint, resultado,
            simulado_por, criado_em
          ) values (
            v_nova_id,
            date '2026-07-01',
            public.fn_health_score_professor_v3_config_fingerprint(v_nova_id),
            '{"total":1}'::jsonb,
            1,
            clock_timestamp() + interval '1 second'
          );

          begin
            perform public.ativar_health_score_professor_v3_config_revisao_ciclo_aberto(
              v_nova_id,
              'revisao retroativa fixture'
            );
            raise exception 'ativacao aceitou conflito com intervalo divergente';
          exception
            when others then
              if sqlerrm not like '%conflito ativo deve cobrir exatamente Jun-Ago%' then
                raise;
              end if;
          end;

          alter table public.health_score_professor_v3_config_versoes
            disable trigger user;
          update public.health_score_professor_v3_config_versoes
          set vigencia_fim = date '2026-08-31'
          where id = '11111111-1111-1111-1111-111111111111';
          alter table public.health_score_professor_v3_config_versoes
            enable trigger user;

          insert into public.health_score_professor_v3_snapshots (
            config_id, competencia, estado
          ) values (
            '11111111-1111-1111-1111-111111111111',
            date '2026-07-01',
            'fechado'
          );
          begin
            perform public.ativar_health_score_professor_v3_config_revisao_ciclo_aberto(
              v_nova_id,
              'revisao retroativa fixture'
            );
            raise exception 'ativacao aceitou snapshot fechado';
          exception
            when others then
              if sqlerrm not like '%snapshot fechado%' then
                raise;
              end if;
          end;
          delete from public.health_score_professor_v3_snapshots;

          select public.ativar_health_score_professor_v3_config_revisao_ciclo_aberto(
            v_nova_id,
            'revisao retroativa fixture'
          ) into v_ativacao_1;

          select public.ativar_health_score_professor_v3_config_revisao_ciclo_aberto(
            v_nova_id,
            'revisao retroativa fixture'
          ) into v_ativacao_2;

          if coalesce((v_ativacao_1->>'ja_ativa')::boolean, true)
             or not coalesce((v_ativacao_2->>'ja_ativa')::boolean, false)
             or (v_ativacao_1->>'id')::uuid is distinct from v_nova_id
             or (v_ativacao_2->>'id')::uuid is distinct from v_nova_id then
            raise exception 'retry de ativacao nao retornou readback idempotente';
          end if;

          select public.criar_health_score_professor_v3_config_revisao_ciclo_aberto(
            '11111111-1111-1111-1111-111111111111',
            date '2026-06-01',
            date '2026-08-31',
            'revisao retroativa fixture'
          ) into v_criacao_apos_ativacao;
          if (v_criacao_apos_ativacao->>'id')::uuid is distinct from v_nova_id
             or v_criacao_apos_ativacao->>'status' is distinct from 'ativa'
             or not coalesce(
               (v_criacao_apos_ativacao->>'ja_existente')::boolean,
               false
             ) then
            raise exception 'retry de criacao nao retornou revisao ja ativa';
          end if;

          begin
            perform public.ativar_health_score_professor_v3_config_revisao_ciclo_aberto(
              v_nova_id,
              'justificativa divergente'
            );
            raise exception 'retry de ativacao aceitou justificativa divergente';
          exception
            when others then
              if sqlerrm not like '%justificativa%' then
                raise;
              end if;
          end;

          if (select status from public.health_score_professor_v3_config_versoes
              where id = '11111111-1111-1111-1111-111111111111')
             is distinct from 'arquivada' then
            raise exception 'origem conflitante nao foi arquivada';
          end if;
          if (select status from public.health_score_professor_v3_config_versoes
              where id = v_nova_id) is distinct from 'ativa' then
            raise exception 'nova revisao nao foi ativada';
          end if;
          if (select status from public.health_score_professor_v3_config_versoes
              where id = '22222222-2222-2222-2222-222222222222')
             is distinct from 'ativa' then
            raise exception 'configuracao de setembro foi alterada';
          end if;

          select c.id into strict v_temporal_id
          from public.health_score_professor_v3_config_versoes c
          where c.status = 'ativa'
            and date '2026-07-01' >= c.vigencia_inicio
            and (c.vigencia_fim is null or date '2026-07-01' <= c.vigencia_fim);
          if v_temporal_id is distinct from v_nova_id then
            raise exception 'julho nao selecionou a revisao nova';
          end if;
          select c.id into strict v_temporal_id
          from public.health_score_professor_v3_config_versoes c
          where c.status = 'ativa'
            and date '2026-09-01' >= c.vigencia_inicio
            and (c.vigencia_fim is null or date '2026-09-01' <= c.vigencia_fim);
          if v_temporal_id is distinct from
             '22222222-2222-2222-2222-222222222222'::uuid then
            raise exception 'setembro nao preservou a configuracao futura';
          end if;

          select count(*) into v_total
          from public.health_score_professor_v3_config_substituicoes;
          if v_total <> 1 then
            raise exception 'trilha de substituicao divergente: %', v_total;
          end if;
          select count(*) into v_total
          from public.health_score_professor_v3_config_versoes;
          if v_total <> 3 then
            raise exception 'retries duplicaram versoes: %', v_total;
          end if;
          if exists (
            select 1
            from public.health_score_professor_v3_config_versoes a
            join public.health_score_professor_v3_config_versoes b
              on a.id < b.id
             and a.status = 'ativa'
             and b.status = 'ativa'
             and daterange(
               a.vigencia_inicio,
               coalesce(a.vigencia_fim + 1, 'infinity'::date),
               '[)'
             ) && daterange(
               b.vigencia_inicio,
               coalesce(b.vigencia_fim + 1, 'infinity'::date),
               '[)'
             )
          ) then
            raise exception 'configuracoes ativas ficaram sobrepostas';
          end if;
          if exists (
            select 1 from public.health_score_professor_v3_snapshots
          ) then
            raise exception 'ativacao escreveu snapshot';
          end if;

          begin
            update public.health_score_professor_v3_config_substituicoes
            set justificativa = 'alterada';
            raise exception 'trilha aceitou update';
          exception
            when others then
              if sqlerrm not like '%APPEND_ONLY%' then
                raise;
              end if;
          end;
          begin
            delete from public.health_score_professor_v3_config_substituicoes;
            raise exception 'trilha aceitou delete';
          exception
            when others then
              if sqlerrm not like '%APPEND_ONLY%' then
                raise;
              end if;
          end;

          select count(*) into v_total
          from pg_policies
          where schemaname = 'public'
            and tablename = 'health_score_professor_v3_config_substituicoes';
          if v_total <> 0 then
            raise exception 'tabela append-only ganhou policy permissiva';
          end if;
          if not has_table_privilege(
            'service_role',
            'public.health_score_professor_v3_config_substituicoes',
            'select'
          ) or has_table_privilege(
            'service_role',
            'public.health_score_professor_v3_config_substituicoes',
            'insert,update,delete'
          ) then
            raise exception 'ACL de service_role na trilha esta incorreta';
          end if;
          if has_table_privilege(
            'authenticated',
            'public.health_score_professor_v3_config_substituicoes',
            'select'
          ) then
            raise exception 'authenticated le trilha privada diretamente';
          end if;
          if not has_function_privilege(
            'service_role',
            'public.salvar_health_score_professor_v3_config_rascunho(uuid,date,text,jsonb,jsonb)',
            'execute'
          ) then
            raise exception 'service_role perdeu salvar de cinco argumentos';
          end if;
          if has_function_privilege(
            'anon',
            'public.ativar_health_score_professor_v3_config_revisao_ciclo_aberto(uuid,text)',
            'execute'
          ) then
            raise exception 'anon executa ativacao retroativa';
          end if;
        end;
        $fixture$;
      `;

      const applied = runPsql(
        containerName,
        `${schema}\n${migration()}\n${assertions}`,
      );
      assert.equal(
        applied.status,
        0,
        `fixture PostgreSQL falhou:\nSTDOUT:\n${applied.stdout}\nSTDERR:\n${applied.stderr}`,
      );
    } finally {
      spawnSync('docker', ['rm', '--force', containerName], {
        encoding: 'utf8',
      });
    }
  },
);
