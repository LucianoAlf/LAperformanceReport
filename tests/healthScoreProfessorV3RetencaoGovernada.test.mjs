import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260727120000_health_score_v3_retencao_universo_governado.sql';
const materializerMigrationPath =
  'supabase/migrations/20260719203100_health_score_v3_metricas_segmentadas_hardening.sql';

function migration() {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  return readFileSync(migrationPath, 'utf8');
}

function functionBlock(sql, name) {
  const start = sql
    .toLowerCase()
    .indexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, `${name} deve existir`);
  const rest = sql.slice(start);
  const next = rest.slice(1).search(/\ncreate or replace function public\./i);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

function normalizeEol(value) {
  return value.replace(/\r\n/g, '\n');
}

function sqlWithoutComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\r\n]*/g, '');
}

function functionHeader(block) {
  const bodyStart = block.search(/\bas\s+\$[a-z0-9_]*\$/i);
  assert.notEqual(bodyStart, -1, 'cabecalho da funcao deve terminar antes do corpo');
  return block.slice(0, bodyStart);
}

function parenthesizedCalls(sql, name) {
  const source = sqlWithoutComments(sql);
  const callPattern = new RegExp(`\\b${name}\\s*\\(`, 'gi');
  const calls = [];
  let match;

  while ((match = callPattern.exec(source)) !== null) {
    const open = source.indexOf('(', match.index);
    let depth = 0;
    let quote = null;

    for (let index = open; index < source.length; index += 1) {
      const char = source[index];
      const next = source[index + 1];

      if (quote) {
        if (char === quote && next === quote) {
          index += 1;
        } else if (char === quote) {
          quote = null;
        }
        continue;
      }
      if (char === "'" || char === '"') {
        quote = char;
      } else if (char === '(') {
        depth += 1;
      } else if (char === ')') {
        depth -= 1;
        if (depth === 0) {
          calls.push(source.slice(match.index, index + 1));
          callPattern.lastIndex = index + 1;
          break;
        }
      }
    }
  }

  return calls;
}

function insertSelectExpression(sql, table, column) {
  const source = sqlWithoutComments(sql);
  const insertPattern = new RegExp(
    `\\binsert\\s+into\\s+(?:public\\.)?${table}\\s*\\(`,
    'i',
  );
  const insert = insertPattern.exec(source);
  assert.ok(insert, `insert em ${table} deve existir`);

  const columnsStart = source.indexOf('(', insert.index);
  const columnsEnd = source.indexOf(')', columnsStart);
  assert.notEqual(columnsEnd, -1, `colunas do insert em ${table} devem fechar`);
  const columns = source
    .slice(columnsStart + 1, columnsEnd)
    .split(',')
    .map((item) => item.trim().toLowerCase());

  const selectStart = source.slice(columnsEnd).search(/\bselect\b/i);
  assert.notEqual(selectStart, -1, `select do insert em ${table} deve existir`);
  const absoluteSelectStart = columnsEnd + selectStart;
  const expressions = [];
  let expressionStart = absoluteSelectStart
    + source.slice(absoluteSelectStart).search(/\bselect\b/i)
    + 'select'.length;
  let depth = 0;
  let quote = null;

  for (let index = expressionStart; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (quote) {
      if (char === quote && next === quote) {
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
    } else if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
    } else if (char === ',' && depth === 0) {
      expressions.push(source.slice(expressionStart, index).trim());
      expressionStart = index + 1;
    } else if (
      depth === 0
      && source.slice(index).match(/^\bfrom\b/i)
    ) {
      expressions.push(source.slice(expressionStart, index).trim());
      break;
    }
  }

  assert.equal(
    expressions.length,
    columns.length,
    `insert em ${table} deve alinhar colunas e expressoes`,
  );
  const columnIndex = columns.indexOf(column.toLowerCase());
  assert.notEqual(columnIndex, -1, `${column} deve existir no insert em ${table}`);
  return expressions[columnIndex];
}

test('Task 2 disponibiliza a migration do universo governado de retencao', () => {
  assert.equal(
    existsSync(migrationPath),
    true,
    `${migrationPath} ainda nao foi implementada`,
  );
});

test(
  'retencao usa um unico universo de periodos efetivos para expostos e saidas',
  { skip: !existsSync(migrationPath) },
  () => {
    const block = sqlWithoutComments(functionBlock(
      migration(),
      'get_professor_retencao_v3_governada',
    ));

    assert.match(block, /vw_professor_periodos_efetivos_v3_sombra/i);
    assert.match(block, /vinculos_expostos_limpos/i);
    assert.match(block, /vinculos_em_revisao/i);
    assert.match(block, /encerramentos_penalizadores/i);
    assert.match(block, /publicavel\s+is\s+true/i);
    assert.match(block, /publicavel\s+is\s+false/i);
    assert.doesNotMatch(
      block,
      /\b(?:from|join)\s+(?:public\s*\.\s*)?movimentacoes_admin\b/i,
      'movimentacoes_admin nao pode formar um conjunto estatistico paralelo',
    );
    assert.match(
      block,
      /100(?:\.0+)?\s*\*\s*\(\s*1\s*-\s*[\s\S]*encerramentos_penalizadores[\s\S]*vinculos_expostos_limpos/i,
    );
  },
);

test(
  'retencao preserva a politica temporal aprovada no mesmo universo',
  { skip: !existsSync(migrationPath) },
  () => {
    const block = sqlWithoutComments(functionBlock(
      migration(),
      'get_professor_retencao_v3_governada',
    ));

    assert.match(block, /date\s+'2026-08-03'/i);
    assert.match(
      block,
      /data_fim[\s\S]*<\s*date\s+'2026-08-03'[\s\S]*status_periodo\s*=\s*'encerrado'/i,
    );
    assert.match(
      block,
      /data_fim[\s\S]*>=\s*date\s+'2026-08-03'[\s\S]*atribuicao_confirmada\s+is\s+true[\s\S]*conta_retencao_professor\s+is\s+true[\s\S]*ms\.conta_score_professor\s+is\s+true/i,
    );
    assert.match(
      block,
      /left\s+join\s+public\.motivos_saida\s+ms\s+on\s+ms\.id\s*=\s*pe\.motivo_saida_id/i,
    );
    assert.match(
      block,
      /count\s*\(\s*distinct\s+pe\.periodo_chave\s*\)\s*filter\s*\([\s\S]*ms\.id\s+is\s+null[\s\S]*pe\.conta_retencao_professor\s+is\s+distinct\s+from\s+ms\.conta_score_professor[\s\S]*as\s+encerramentos_pos_corte_pendentes/i,
      'motivo ausente ou divergente deve permanecer pendente',
    );
  },
);

test(
  'amostra limpa governa estado e pendencias ficam apenas no diagnostico',
  { skip: !existsSync(migrationPath) },
  () => {
    const block = functionBlock(
      migration(),
      'get_professor_retencao_v3_governada',
    );
    const code = sqlWithoutComments(block);
    const header = functionHeader(block);
    const diagnosticCalls = parenthesizedCalls(
      block,
      'jsonb_build_object',
    ).filter((call) => /'vinculos_em_revisao'\s*,/i.test(call));

    assert.match(
      code,
      /vinculos_expostos_limpos\s*=\s*0[\s\S]*'sem_base'/i,
    );
    assert.match(
      code,
      /vinculos_expostos_limpos\s*<\s*10[\s\S]*'sem_base_amostra'/i,
    );
    assert.match(
      code,
      /vinculos_expostos_limpos\s*>=\s*10[\s\S]*vinculos_em_revisao\s*>\s*0[\s\S]*'ok_com_pendencias'/i,
    );
    assert.match(
      code,
      /vinculos_expostos_limpos\s*>=\s*10[\s\S]*'ok'/i,
    );
    assert.match(header, /\bdetalhes\s+jsonb\b/i);
    assert.doesNotMatch(
      header,
      /\bvinculos_em_revisao\b/i,
      'vinculos_em_revisao nao pode virar coluna estatistica de retorno',
    );
    assert.equal(
      diagnosticCalls.length,
      1,
      'vinculos_em_revisao deve ser exposto uma unica vez no JSON de diagnostico',
    );
    assert.match(diagnosticCalls[0], /'apta_oficial'\s*,/i);
  },
);

test(
  'motor delega retencao governada e disponibiliza peso para os dois estados ok',
  { skip: !existsSync(migrationPath) },
  () => {
    const block = sqlWithoutComments(functionBlock(
      migration(),
      'get_health_score_professor_v3_metricas_periodo',
    ));
    const materializer = functionBlock(
      readFileSync(materializerMigrationPath, 'utf8'),
      'materializar_health_score_professor_v3_periodo_impl',
    );
    const materializerCode = sqlWithoutComments(materializer);
    const pesoDisponivel = insertSelectExpression(
      materializer,
      'health_score_professor_v3_snapshot_metricas',
      'peso_disponivel',
    );

    assert.match(block, /get_professor_retencao_v3_governada/i);
    assert.match(
      block,
      /(?:case\s+when\s+)?(?:[a-z_][a-z0-9_]*\.)?estado_base\s+in\s*\(\s*'ok'\s*,\s*'ok_com_pendencias'\s*\)(?:\s+then\s+true(?:\s+else\s+false)?\s+end)?\s+as\s+publicavel\b/i,
      'ok e ok_com_pendencias devem entrar no motor como publicaveis',
    );
    assert.match(materializerCode, /\band\s+r\.publicavel\b/i);
    assert.match(
      pesoDisponivel,
      /^calc\.nota_calculada\s+is\s+not\s+null$/i,
      'nota calculada dos estados ok deve persistir peso_disponivel=true',
    );
  },
);

test(
  'motor publico nao executa nem mantem dependencia da retencao legada',
  { skip: !existsSync(migrationPath) },
  () => {
    const sql = sqlWithoutComments(migration());
    const block = sqlWithoutComments(functionBlock(
      migration(),
      'get_health_score_professor_v3_metricas_periodo',
    ));

    assert.doesNotMatch(
      sql,
      /rename\s+to\s+get_health_score_professor_v3_metricas_periodo_base_20260727/i,
    );
    assert.doesNotMatch(
      block,
      /get_health_score_professor_v3_metricas_periodo_base_20260727/i,
    );
    assert.doesNotMatch(
      block,
      /\bmovimentacoes_admin\b/i,
      'o motor publico nao pode consultar a retencao administrativa descartada',
    );
  },
);

test(
  'motor preserva literalmente as outras cinco metricas da definicao final',
  { skip: !existsSync(migrationPath) },
  () => {
    const baseline = functionBlock(
      readFileSync(materializerMigrationPath, 'utf8'),
      'get_health_score_professor_v3_metricas_periodo',
    );
    const atual = functionBlock(
      migration(),
      'get_health_score_professor_v3_metricas_periodo',
    );
    const retencaoMarker =
      '  -- RETENCAO ATRIBUIVEL. Motivos exatos; sem similaridade ou inferencia fuzzy.';
    const permanenciaMarker =
      '  -- PERMANENCIA COM O PROFESSOR: historico acumulado, somente vinculos encerrados.';
    const baselineRetencao = baseline.indexOf(retencaoMarker);
    const atualRetencao = atual.indexOf(retencaoMarker);
    const baselinePermanencia = baseline.indexOf(permanenciaMarker);
    const atualPermanencia = atual.indexOf(permanenciaMarker);
    const baselineEnd = baseline.indexOf('\n$$;', baselinePermanencia);
    const atualEnd = atual.indexOf('\n$$;', atualPermanencia);

    assert.notEqual(baselineRetencao, -1);
    assert.notEqual(atualRetencao, -1);
    assert.notEqual(baselinePermanencia, -1);
    assert.notEqual(atualPermanencia, -1);
    assert.notEqual(baselineEnd, -1);
    assert.notEqual(atualEnd, -1);
    assert.equal(
      normalizeEol(atual.slice(0, atualRetencao)),
      normalizeEol(baseline.slice(0, baselineRetencao)),
      'Conversao e metricas segmentadas devem permanecer byte a byte',
    );
    assert.equal(
      normalizeEol(atual.slice(atualPermanencia, atualEnd + 4)),
      normalizeEol(baseline.slice(baselinePermanencia, baselineEnd + 4)),
      'Permanencia e Presenca devem permanecer byte a byte',
    );
  },
);

test(
  'funcoes internas de retencao mantem search path e ACL restritos',
  { skip: !existsSync(migrationPath) },
  () => {
    const sql = migration();
    const block = functionBlock(sql, 'get_professor_retencao_v3_governada');

    assert.match(block, /security definer/i);
    assert.match(block, /set search_path\s*=\s*public,\s*pg_temp/i);
    assert.match(
      sql,
      /revoke\s+all\s+on\s+function\s+public\.get_professor_retencao_v3_governada\([^;]+from\s+public,\s*anon,\s*authenticated/i,
    );
    assert.match(
      sql,
      /grant\s+execute\s+on\s+function\s+public\.get_professor_retencao_v3_governada\([^;]+to\s+service_role/i,
    );
  },
);

test(
  'motivo neutro divergente nao penaliza e mantem o ciclo pendente',
  { skip: !existsSync(migrationPath), timeout: 30_000 },
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

    const image = process.env.TASK2_POSTGRES_IMAGE || 'postgres:17-alpine';
    const imageInspection = spawnSync('docker', ['image', 'inspect', image], {
      encoding: 'utf8',
    });
    assert.equal(
      imageInspection.status,
      0,
      `imagem PostgreSQL obrigatoria ausente (${image}):\n${imageInspection.stderr}`,
    );

    const containerName = `la-task2-retencao-${process.pid}-${Date.now()}`;
    const started = spawnSync(
      'docker',
      [
        'run',
        '--detach',
        '--rm',
        '--name',
        containerName,
        '--env',
        'POSTGRES_PASSWORD=task2',
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
          [
            'exec',
            containerName,
            'pg_isready',
            '--username',
            'postgres',
            '--dbname',
            'postgres',
          ],
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

      const schemaSql = String.raw`
        \set ON_ERROR_STOP on

        create role anon;
        create role authenticated;
        create role service_role;

        create table public.professores (
          id integer primary key,
          nome text not null
        );
        create table public.unidades (
          id uuid primary key,
          ativo boolean not null
        );
        create table public.motivos_saida (
          id integer primary key,
          conta_score_professor boolean
        );
        create table public.fixture_periodos (
          periodo_chave text primary key,
          professor_id integer,
          unidade_id uuid not null,
          data_inicio timestamptz not null,
          data_fim timestamptz,
          status_periodo text not null,
          publicavel boolean not null,
          motivo_saida_id integer,
          atribuicao_confirmada boolean,
          conta_retencao_professor boolean
        );
        create view public.vw_professor_periodos_efetivos_v3_sombra
        with (security_invoker = true)
        as select * from public.fixture_periodos;

        create function public.fn_health_score_v3_unidades_permitidas_sombra(
          p_unidade_id uuid
        ) returns table (unidade_id uuid)
        language sql stable security definer
        set search_path = public, pg_temp
        as $$
          select u.id
          from public.unidades u
          where u.ativo
            and (p_unidade_id is null or u.id = p_unidade_id)
        $$;

        create function public.fn_health_score_v3_periodo(
          p_competencia date,
          p_periodicidade text
        ) returns table (
          periodo_inicio date,
          periodo_fim date,
          ciclo_codigo text,
          periodo_label text
        )
        language sql stable security definer
        set search_path = public, pg_temp
        as $$
          select
            case when p_periodicidade = 'ciclo'
              then date '2026-06-01'
              else date_trunc('month', p_competencia)::date
            end,
            case when p_periodicidade = 'ciclo'
              then date '2026-08-31'
              else (
                date_trunc('month', p_competencia)
                + interval '1 month - 1 day'
              )::date
            end,
            '2026-T2'::text,
            'Jun-Ago 2026'::text
        $$;

        insert into public.professores values (1, 'Professor Fixture');
        insert into public.unidades
        values ('11111111-1111-1111-1111-111111111111', true);
        insert into public.motivos_saida values (99, false);

        insert into public.fixture_periodos
        select
          'periodo-' || g,
          1,
          '11111111-1111-1111-1111-111111111111'::uuid,
          timestamptz '2026-06-01 12:00:00-03',
          case when g = 1
            then timestamptz '2026-08-10 12:00:00-03'
            else null
          end,
          case when g = 1 then 'encerrado' else 'ativo' end,
          true,
          case when g = 1 then 99 else null end,
          true,
          case when g = 1 then true else null end
        from generate_series(1, 10) g;
      `;
      const prepared = spawnSync(
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
        { encoding: 'utf8', input: schemaSql },
      );
      assert.equal(
        prepared.status,
        0,
        `fixture PostgreSQL falhou:\n${prepared.stderr}`,
      );

      const helperSql = functionBlock(
        migration(),
        'get_professor_retencao_v3_governada',
      ).replace(/\bcurrent_date\b/gi, "date '2026-08-31'");
      const helperApplied = spawnSync(
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
        { encoding: 'utf8', input: helperSql },
      );
      assert.equal(
        helperApplied.status,
        0,
        `helper nao foi aplicado:\n${helperApplied.stderr}`,
      );

      const assertionSql = String.raw`
        \set ON_ERROR_STOP on
        do $fixture$
        declare
          r record;
        begin
          select * into r
          from public.get_professor_retencao_v3_governada(
            date '2026-08-01',
            '11111111-1111-1111-1111-111111111111',
            'ciclo'
          );

          if row(
            r.valor_bruto,
            r.numerador,
            r.denominador,
            r.estado_base,
            r.publicavel
          ) is distinct from row(
            100::numeric,
            10::numeric,
            10::numeric,
            'ok_com_pendencias'::text,
            true
          ) then
            raise exception 'motivo neutro penalizou ou deixou de ficar pendente: %',
              row_to_json(r);
          end if;

          if (r.detalhes->>'encerramentos_penalizadores')::integer <> 0
             or (r.detalhes->>'encerramentos_pos_corte_pendentes')::integer <> 1
             or (r.detalhes->>'apta_oficial')::boolean is not false then
            raise exception 'diagnostico divergente: %', r.detalhes;
          end if;
        end;
        $fixture$;
      `;
      const asserted = spawnSync(
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
        { encoding: 'utf8', input: assertionSql },
      );
      assert.equal(
        asserted.status,
        0,
        `motivo neutro nao respeitou o contrato:\n${asserted.stderr}`,
      );

      const migrationApplied = spawnSync(
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
        { encoding: 'utf8', input: migration() },
      );
      assert.equal(
        migrationApplied.status,
        0,
        `migration integral nao foi aplicada:\n${migrationApplied.stderr}`,
      );
    } finally {
      spawnSync('docker', ['rm', '--force', containerName], {
        encoding: 'utf8',
      });
    }
  },
);
