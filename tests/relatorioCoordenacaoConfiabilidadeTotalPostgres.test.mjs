import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationDirectory = new URL('../supabase/migrations/', import.meta.url);
const coreMigrationName = '20260909142301_coordenacao_confiabilidade_total.sql';
const observedPresenceMigrationName = '20260909143251_coordenacao_presenca_amostra_observada.sql';
const ciclosMigrationName = '20260719120000_health_score_v3_ciclos_publicacao_parcial.sql';
const snapshotsMigrationName = '20260717170000_health_score_v3_config_snapshots.sql';
const unidadeA = '10000000-0000-0000-0000-000000000001';
const unidadeB = '20000000-0000-0000-0000-000000000002';
const unidadeNegada = '30000000-0000-0000-0000-000000000003';
const dockerWindows = join(
  process.env.LOCALAPPDATA || '',
  'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe',
);
const dockerExecutable = process.platform === 'win32' && existsSync(dockerWindows)
  ? dockerWindows : 'docker';

function readMigration(name) {
  return readFileSync(new URL(name, migrationDirectory), 'utf8').replace(/\r\n/gu, '\n');
}

// Only explicit function definitions are loaded. In particular, none of the new
// migration's DO blocks, production materializations, or repairs run on fixtures.
function extractFunction(sql, name) {
  const start = sql.search(new RegExp(`^create or replace function public\\.${name}\\s*\\(`, 'mu'));
  assert.notEqual(start, -1, `Funcao ${name} ausente`);
  const opening = /\bas\s+(\$[a-zA-Z_0-9]*\$)/u.exec(sql.slice(start));
  assert.ok(opening, `Corpo da funcao ${name} ausente`);
  const bodyStart = start + opening.index + opening[0].length;
  const end = sql.indexOf(`${opening[1]};`, bodyStart);
  assert.notEqual(end, -1, `Fim da funcao ${name} ausente`);
  return sql.slice(start, end + opening[1].length + 1);
}

function docker(args, input) {
  return spawnSync(dockerExecutable, args, {
    input, encoding: 'utf8', timeout: 30_000, maxBuffer: 12 * 1024 * 1024,
  });
}

function psql(container, sql) {
  return docker([
    'exec', '-i', container,
    'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres', '-qAt',
  ], sql);
}

function execute(container, sql) {
  const result = psql(container, sql);
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  return result.stdout.trim();
}

function queryJson(container, sql) {
  return JSON.parse(execute(container, sql));
}

function expectSqlError(container, sql, pattern) {
  const result = psql(container, sql);
  assert.notEqual(result.status, 0, 'SQL deveria ter sido rejeitado');
  assert.match(result.stderr, pattern);
}

async function withPostgres(t, suffix, run) {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }
  const container = `la-coord-confiabilidade-${suffix}-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres', 'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.error?.message || started.stderr || started.stdout);
  try {
    let ready = 0;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      ready = psql(container, 'select 1;').status === 0 ? ready + 1 : 0;
      // The image briefly restarts PostgreSQL after initialization.
      if (ready >= 3) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.equal(ready, 3, 'PostgreSQL nao iniciou de forma estavel');
    await run(container);
  } finally {
    const stopped = docker(['stop', container]);
    assert.equal(stopped.status, 0, stopped.stderr || stopped.stdout);
  }
}

const presenceFixture = String.raw`
  create table public.professores (
    id integer primary key, nome text, ativo boolean default true,
    mesclado_em_professor_id integer
  );
  create table public.professores_unidades (
    professor_id integer, unidade_id uuid, emusys_ativo boolean default true,
    validacao_status text default 'validado'
  );
  create table public.fixture_ocorrencias (
    professor_id integer, unidade_id uuid, data_aula date,
    considera_frequencia_denominador boolean,
    considera_presenca boolean, considera_falta boolean,
    considera_falta_justificada boolean,
    ocorrencia_incompleta boolean, possui_conflito boolean
  );
  create function public.fn_health_score_v3_unidades_permitidas_sombra(uuid)
  returns table (unidade_id uuid) language sql stable as $$
    select u.id from (values ('${unidadeA}'::uuid), ('${unidadeB}'::uuid)) u(id)
    where $1 is null or u.id = $1
  $$;
  create function public.fn_presenca_ocorrencias_escopo_interno_v2(
    uuid, date, date, integer, integer
  ) returns setof public.fixture_ocorrencias language sql stable as $$
    select o.* from public.fixture_ocorrencias o
    where o.unidade_id = $1 and o.data_aula between $2 and $3
      and ($4 is null or o.professor_id = $4)
  $$;
  insert into public.professores (id, nome) values
    (101, 'Duas unidades'), (102, 'Amostra nove'), (103, 'Sem eventos'),
    (104, 'Somente excluidas'), (105, 'Observado sem vinculo'),
    (107, 'Todas faltas'), (108, 'Amostra consolidada');
  insert into public.professores_unidades (professor_id, unidade_id)
    select p.id, '${unidadeA}'::uuid from public.professores p where p.id <> 105;
  insert into public.professores_unidades (professor_id, unidade_id)
    values (101, '${unidadeB}'), (108, '${unidadeB}'), (101, '${unidadeA}');

  -- A: 8/10 plus two excluded events; flags also occur on eligible events.
  insert into public.fixture_ocorrencias
    select 101, '${unidadeA}', date '2020-06-15', true,
      n <= 8, n = 9, n = 10, n = 1, n = 2
    from generate_series(1, 10) n;
  insert into public.fixture_ocorrencias values
    (101, '${unidadeA}', '2020-06-15', false, false, false, false, true, false),
    (101, '${unidadeA}', '2020-06-15', false, false, false, false, false, true);
  -- B: 12/30, so consolidated attendance must be 20/40 = 50%, not 60%.
  insert into public.fixture_ocorrencias
    select 101, '${unidadeB}', date '2020-06-15', true,
      n <= 12, n between 13 and 27, n >= 28, false, false
    from generate_series(1, 30) n;
  insert into public.fixture_ocorrencias
    select 102, '${unidadeA}', date '2020-06-15', true,
      n <= 4, n > 4, false, false, false from generate_series(1, 9) n;
  insert into public.fixture_ocorrencias values
    (102, '${unidadeA}', '2020-06-15', false, false, false, false, true, true),
    (104, '${unidadeA}', '2020-06-15', false, false, false, false, true, false),
    (104, '${unidadeA}', '2020-06-15', false, false, false, false, false, true);
  insert into public.fixture_ocorrencias
    select p.id, '${unidadeA}', date '2020-06-15', true,
      p.id = 105, p.id = 107, false, false, false
    from (values (105), (107)) p(id) cross join generate_series(1, 10);
  insert into public.fixture_ocorrencias
    select 108, '${unidadeA}', date '2020-06-15', true, true, false, false, false, false
    from generate_series(1, 6);
  insert into public.fixture_ocorrencias
    select 108, '${unidadeB}', date '2020-06-15', true, false, true, false, false, false
    from generate_series(1, 4);

  -- Poison rows catch unit leaks and inclusive/exclusive period mistakes.
  insert into public.fixture_ocorrencias
    select 101, x.unidade_id, x.data_aula, true, true, false, false, false, false
    from (values
      ('${unidadeNegada}'::uuid, date '2020-06-15'),
      ('${unidadeA}'::uuid, date '2020-05-31'),
      ('${unidadeA}'::uuid, date '2020-09-01')
    ) x(unidade_id, data_aula) cross join generate_series(1, 100);
`;

function presenceRows(container, unidade = null, periodicidade = 'mensal', date = "date '2020-06-19'") {
  return queryJson(container, `
    select coalesce(jsonb_agg(to_jsonb(p) order by professor_id), '[]'::jsonb)
    from public.get_health_score_professor_v3_presenca_periodo_v2(
      ${date}, ${unidade ? `'${unidade}'::uuid` : 'null'}, '${periodicidade}'
    ) p;
  `);
}

test('confiabilidade: presenca real em PostgreSQL por ocorrencia e unidade', { timeout: 120_000 }, async (t) => {
  await withPostgres(t, 'presenca', async (container) => {
    execute(container, presenceFixture
      + extractFunction(readMigration(ciclosMigrationName), 'fn_health_score_v3_periodo')
      + extractFunction(readMigration(observedPresenceMigrationName), 'get_health_score_professor_v3_presenca_periodo_v2'));

    await t.test('flags nao vetam eventos classificados; denominador e faltas respeitam o veredito', () => {
      const rows = presenceRows(container, unidadeA);
      assert.deepEqual(rows.map((p) => p.professor_id), [101, 102, 103, 104, 105, 107, 108]);
      const p = rows[0];
      assert.equal(p.unidade_id, unidadeA);
      assert.equal(p.competencia, '2020-06-01');
      assert.equal(p.valor_bruto, 80);
      assert.equal(p.numerador, 8);
      assert.equal(p.denominador, 10);
      assert.equal(p.amostra, 10);
      assert.equal(p.estado_base, 'ok');
      assert.equal(p.publicavel, true);
      assert.equal(p.motivo_sem_base, null);
      assert.equal(p.confianca, 'alta');
      assert.equal(p.fonte, 'fn_presenca_ocorrencias_escopo_interno_v2');
      assert.deepEqual(p.detalhes, {
        periodicidade: 'mensal', periodo_inicio: '2020-06-01', periodo_fim: '2020-06-30',
        fim_recorte: '2020-06-30', ciclo_codigo: '2020-06',
        ocorrencias_observadas: 12, denominador_observado: 10, presentes_observados: 8,
        faltas_observadas: 1, faltas_justificadas_observadas: 1, faltas_total_observado: 2,
        ocorrencias_fora_calculo: 2, ocorrencias_incompletas: 2, ocorrencias_com_conflito: 2,
        estado_publicacao: 'ok', fonte_veredito: 'fn_presenca_ocorrencias_escopo_interno_v2',
        apta_oficial: false,
      });
    });

    await t.test('consolidado soma eventos de unidades permitidas sem duplicar vinculos', () => {
      const b = presenceRows(container, unidadeB).find((p) => p.professor_id === 101);
      const p = presenceRows(container).find((row) => row.professor_id === 101);
      assert.equal(b.valor_bruto, 40);
      assert.equal(b.denominador, 30);
      assert.equal(p.unidade_id, null);
      assert.equal(p.valor_bruto, 50);
      assert.equal(p.numerador, 20);
      assert.equal(p.denominador, 40);
      assert.equal(p.amostra, 40);
      assert.equal(p.detalhes.ocorrencias_observadas, 42);
      assert.equal(p.detalhes.faltas_observadas, 16);
      assert.equal(p.detalhes.faltas_justificadas_observadas, 4);
      assert.equal(p.detalhes.faltas_total_observado, 20);
      assert.equal(p.detalhes.ocorrencias_fora_calculo, 2);
      assert.equal(p.detalhes.ocorrencias_incompletas, 2);
      assert.equal(p.detalhes.ocorrencias_com_conflito, 2);
      assert.deepEqual(presenceRows(container, unidadeNegada), []);
    });

    await t.test('amostra nove expoe 4/9 e 44.44% observados, mas nao habilita publicacao para score', () => {
      const p = presenceRows(container, unidadeA).find((row) => row.professor_id === 102);
      assert.equal(p.valor_bruto, 44.44);
      assert.equal(p.numerador, 4);
      assert.equal(p.denominador, 9);
      assert.equal(p.amostra, 9);
      assert.equal(p.estado_base, 'sem_base_amostra');
      assert.equal(p.publicavel, false);
      assert.equal(p.confianca, 'baixa');
      assert.match(p.motivo_sem_base, /10 eventos/);
      assert.equal(p.detalhes.denominador_observado, 9);
      assert.equal(p.detalhes.presentes_observados, 4);
      assert.equal(p.detalhes.ocorrencias_observadas, 10);
      assert.equal(p.detalhes.ocorrencias_fora_calculo, 1);
      assert.equal(p.detalhes.ocorrencias_incompletas, 1);
      assert.equal(p.detalhes.ocorrencias_com_conflito, 1);
      const ciclo = presenceRows(container, unidadeA, 'ciclo').find((row) => row.professor_id === 102);
      assert.equal(ciclo.valor_bruto, 44.44);
      assert.equal(ciclo.publicavel, false);
      assert.equal(ciclo.detalhes.apta_oficial, false);
    });

    await t.test('sem eventos e somente excluidas mantem sem_base; dez faltas produzem zero real', () => {
      const rows = presenceRows(container, unidadeA);
      for (const id of [103, 104]) {
        const p = rows.find((row) => row.professor_id === id);
        assert.equal(p.estado_base, 'sem_base');
        assert.equal(p.publicavel, false);
        for (const field of ['valor_bruto', 'numerador', 'denominador', 'amostra']) {
          assert.equal(p[field], null, `${id}: ${field}`);
        }
        assert.equal(p.detalhes.denominador_observado, 0);
        assert.equal(p.detalhes.ocorrencias_observadas, id === 103 ? 0 : 2);
        assert.equal(p.detalhes.ocorrencias_fora_calculo, id === 103 ? 0 : 2);
      }
      const faltas = rows.find((p) => p.professor_id === 107);
      assert.equal(faltas.valor_bruto, 0);
      assert.equal(faltas.numerador, 0);
      assert.equal(faltas.denominador, 10);
      assert.equal(faltas.publicavel, true);
    });

    await t.test('quorum e aplicado depois da consolidacao, incluindo professor observado sem vinculo', () => {
      for (const unit of [unidadeA, unidadeB]) {
        const p = presenceRows(container, unit).find((row) => row.professor_id === 108);
        assert.equal(p.estado_base, 'sem_base_amostra');
        assert.equal(p.publicavel, false);
        assert.equal(p.valor_bruto, unit === unidadeA ? 100 : 0);
        assert.equal(p.numerador, unit === unidadeA ? 6 : 0);
        assert.equal(p.denominador, unit === unidadeA ? 6 : 4);
        assert.equal(p.amostra, unit === unidadeA ? 6 : 4);
      }
      const rows = presenceRows(container);
      const p = rows.find((row) => row.professor_id === 108);
      assert.equal(p.valor_bruto, 60);
      assert.equal(p.denominador, 10);
      assert.equal(p.publicavel, true);
      assert.equal(rows.find((row) => row.professor_id === 105).valor_bruto, 100);
    });

    await t.test('ciclo fechado pode ser oficial; mes e recorte atual nao usam eventos futuros', () => {
      const fechado = presenceRows(container, unidadeA, 'ciclo')[0];
      assert.equal(fechado.detalhes.periodo_inicio, '2020-06-01');
      assert.equal(fechado.detalhes.periodo_fim, '2020-08-31');
      assert.equal(fechado.detalhes.apta_oficial, true);
      assert.equal(fechado.denominador, 10);
      execute(container, `
        insert into public.fixture_ocorrencias
        select 101, '${unidadeA}', current_date, true, true, false, false, false, false
        from generate_series(1, 10);
        insert into public.fixture_ocorrencias
        select 101, '${unidadeA}', current_date + 1, true, false, true, false, false, false
        from generate_series(1, 100);
      `);
      const atual = presenceRows(container, unidadeA, 'mensal', 'current_date')[0];
      assert.equal(atual.valor_bruto, 100);
      assert.equal(atual.denominador, 10);
      assert.equal(atual.detalhes.fim_recorte, queryJson(container, 'select to_jsonb(current_date);'));
      assert.equal(atual.detalhes.apta_oficial, false);
    });

    await t.test('parametros invalidos falham explicitamente', () => {
      for (const args of ["null, null, 'mensal'", "date '2020-06-01', null, 'anual'"]) {
        expectSqlError(container,
          `select * from public.get_health_score_professor_v3_presenca_periodo_v2(${args});`,
          /HEALTH_SCORE_V3_PRESENCA_PERIODO_INVALIDO/);
      }
    });
  });
});

function documentFixture() {
  const professor = (id, estado, score, ranking, conversao, amostraTurmas, presenca) => ({
    professor_id: id, nome: `Professor ${id}`, comparabilidade_estado: estado,
    score_comparavel: score, estado_publicacao: id === 2 ? 'parcial' : 'oficial',
    ranking_habilitado: ranking,
    metricas: { conversao, media_turma: { amostra: amostraTurmas }, presenca },
    operacional: { total_turmas: 999, turmas_elegiveis_media: 999 },
  });
  const presenca = (denominador, numerador, observados, presentes, total, fora, incompletas, conflitos) => ({
    denominador, numerador, valor_bruto: denominador ? numerador / denominador * 100 : null,
    amostra: denominador, publicavel: denominador >= 10,
    detalhes: {
      denominador_observado: observados, presentes_observados: presentes,
      ocorrencias_observadas: total, ocorrencias_fora_calculo: fora,
      ocorrencias_incompletas: incompletas, ocorrencias_com_conflito: conflitos,
    },
  });
  return {
    schema_version: 4,
    periodo: { ano: 2020, mes: 6, publicacao_oficial: true, ranking_habilitado: true, ciclo_estado: 'fechado' },
    professores: [
      professor(1, 'comparavel', 90, true,
        { peso_efetivo: 15, peso_disponivel: false }, 2, presenca(10, 8, 10, 8, 12, 2, 2, 2)),
      professor(2, 'comparavel', 70, true,
        { peso_efetivo: 0, peso_disponivel: true }, 3, presenca(30, 12, 30, 12, 30, 0, 0, 0)),
      professor(3, 'em_maturacao', null, false,
        { peso_efetivo: '0.5', peso_disponivel: false }, 0, presenca(9, 4, 9, 4, 10, 1, 1, 1)),
      professor(4, 'sem_base_operacional', null, false,
        { peso_efetivo: null, peso_disponivel: true }, null, presenca(null, null, 0, 0, 0, 0, 0, 0)),
      professor(5, 'sem_base_operacional', null, false,
        {}, -1, presenca(null, null, 0, 0, 2, 2, 1, 1)),
    ],
    resumo_equipe: { total_professores: 999, preservar: 'resumo' },
    experimentais: { professores_conversao_pontuando: 999, preservar: 'experimentais' },
    carteira_carga: { turmas_usadas_na_media_individual: 999, preservar: 'carteira' },
    presenca: {
      presenca_media: 999, eventos_elegiveis: 999, pendencias: 999,
      sem_aulas_elegiveis: 999, preservar: 'presenca',
    },
    ranking_oficial: [{ professor_id: 1, score: 90 }],
    qualidade_dados: { preservar: true }, motor_documento: { versao: 'antiga' },
  };
}

function documentSql(payload, periodicidade = 'ciclo') {
  // Fixtures are serialized as SQL literals, never interpolated into shell code.
  const literal = payload === null ? 'null' : `'${JSON.stringify(payload).replace(/'/gu, "''")}'::jsonb`;
  return `begin;
    update public.fixture_documento set payload = ${literal};
    select public.montar_relatorio_coordenacao_conteudo_v4(null, 2020, 6, '${periodicidade}');
    rollback;`;
}

test('confiabilidade: wrapper do documento executa agregacoes reais em PostgreSQL', { timeout: 120_000 }, async (t) => {
  await withPostgres(t, 'documento', async (container) => {
    execute(container, `
      create table public.fixture_documento (payload jsonb);
      insert into public.fixture_documento values ('{}');
      create function public.montar_rel_coord_before_confiabilidade_20260909(uuid, integer, integer, text)
      returns jsonb language sql stable as $$ select payload from public.fixture_documento $$;
      ${extractFunction(readMigration(observedPresenceMigrationName), 'montar_relatorio_coordenacao_conteudo_v4')}
    `);

    await t.test('conversao conta peso efetivo positivo e universo de turmas soma amostras positivas', () => {
      const fixture = documentFixture();
      const result = queryJson(container, documentSql(fixture));
      assert.equal(result.experimentais.professores_conversao_pontuando, 2);
      assert.equal(result.carteira_carga.turmas_usadas_na_media_individual, 5);
      assert.deepEqual(result.professores, fixture.professores);
      assert.deepEqual(result.qualidade_dados, fixture.qualidade_dados);
      assert.equal(result.resumo_equipe.preservar, 'resumo');
      assert.equal(result.experimentais.preservar, 'experimentais');
      assert.equal(result.carteira_carga.preservar, 'carteira');
      assert.deepEqual(result.motor_documento, {
        versao: 'coordenacao-v4-confiabilidade-total-20260909', periodicidade: 'ciclo',
      });
    });

    await t.test('totais verdadeiros incluem amostra nao publicavel sem somar flags como pendencias', () => {
      const result = queryJson(container, documentSql(documentFixture()));
      assert.deepEqual(result.presenca, {
        preservar: 'presenca', total_professores: 5, professores_com_evidencia: 3,
        professores_sem_eventos: 2, presenca_media: 49, eventos_elegiveis: 49,
        presencas_confirmadas: 24, ocorrencias_observadas: 54,
        ocorrencias_fora_calculo: 5, ocorrencias_incompletas: 4, ocorrencias_com_conflito: 4,
        regra_agregacao: 'soma_das_presencas_dividida_pelas_ocorrencias_elegiveis',
      });
      assert.equal(Object.hasOwn(result.presenca, 'pendencias'), false);
      assert.equal(Object.hasOwn(result.presenca, 'sem_aulas_elegiveis'), false);
    });

    await t.test('amostras 1 e 9 chegam ao documento com valores observados, sem score nem sem_aulas_elegiveis', () => {
      // Feed the real presence function into the previous-producer stub so the
      // document is exercised with its actual below-quorum metric contract.
      execute(container, presenceFixture
        + extractFunction(readMigration(ciclosMigrationName), 'fn_health_score_v3_periodo')
        + extractFunction(readMigration(observedPresenceMigrationName), 'get_health_score_professor_v3_presenca_periodo_v2')
        + `
          insert into public.professores (id, nome) values (109, 'Uma presenca elegivel');
          insert into public.professores_unidades (professor_id, unidade_id)
            values (109, '${unidadeA}');
          insert into public.fixture_ocorrencias values (
            109, '${unidadeA}', '2020-06-15', true, true, false, false, false, false
          );
        `);
      const rows = presenceRows(container, unidadeA);
      for (const sample of [
        { id: 109, presentes: 1, eventos: 1, percentual: 100, agregado: 100 },
        { id: 102, presentes: 4, eventos: 9, percentual: 44.44, agregado: 44.4 },
      ]) {
        const metric = rows.find((p) => p.professor_id === sample.id);
        assert.ok(metric);
        assert.equal(metric.detalhes.denominador_observado, sample.eventos);
        assert.equal(metric.detalhes.presentes_observados, sample.presentes);
        assert.equal(metric.valor_bruto, sample.percentual);
        assert.equal(metric.numerador, sample.presentes);
        assert.equal(metric.denominador, sample.eventos);
        assert.equal(metric.amostra, sample.eventos);
        assert.equal(metric.estado_base, 'sem_base_amostra');
        assert.equal(metric.publicavel, false);

        const payload = documentFixture();
        const teacher = payload.professores[2];
        teacher.professor_id = metric.professor_id;
        teacher.nome = metric.professor_nome;
        teacher.estado_publicacao = 'parcial';
        teacher.metricas.presenca = metric;
        payload.professores = [teacher];
        payload.ranking_oficial = [];
        payload.periodo.publicacao_oficial = false;
        const result = queryJson(container, documentSql(payload, 'mensal'));
        assert.equal(result.presenca.total_professores, 1);
        assert.equal(result.presenca.professores_com_evidencia, 1);
        assert.equal(result.presenca.professores_sem_eventos, 0);
        assert.equal(result.presenca.eventos_elegiveis, sample.eventos);
        assert.equal(result.presenca.presencas_confirmadas, sample.presentes);
        assert.equal(result.presenca.presenca_media, sample.agregado);
        assert.equal(Object.hasOwn(result.presenca, 'sem_aulas_elegiveis'), false);
        assert.deepEqual(result.professores[0].metricas.presenca, metric);
        assert.equal(result.resumo_equipe.comparaveis, 0);
        assert.equal(result.professores[0].score_comparavel, null);
        assert.deepEqual(result.ranking_oficial, []);
      }
    });

    await t.test('contagem observada usa denominador original quando detalhe ausente, mas respeita zero explicito', () => {
      for (const observed of [undefined, null, '', 0]) {
        const payload = documentFixture();
        const metric = payload.professores[2].metricas.presenca;
        metric.denominador = 1;
        metric.detalhes.denominador_observado = observed;
        const result = queryJson(container, documentSql(payload));
        assert.equal(result.presenca.professores_com_evidencia, observed === 0 ? 2 : 3,
          `denominador_observado=${String(observed)}`);
      }
    });

    await t.test('ciclo misto reporta oficiais e parciais e permanece em acompanhamento', () => {
      const result = queryJson(container, documentSql(documentFixture()));
      assert.deepEqual(result.resumo_equipe, {
        preservar: 'resumo', total_professores: 5, comparaveis: 2, oficiais: 1, parciais: 1,
      });
      assert.equal(result.periodo.estado_publicacao, 'ciclo_em_acompanhamento');
    });

    await t.test('oficial exige todos comparaveis, ranking completo e metadados de fechamento', () => {
      const complete = documentFixture();
      complete.professores[1].estado_publicacao = 'oficial';
      complete.ranking_oficial.push({ professor_id: 2, score: 70 });
      const official = queryJson(container, documentSql(complete));
      assert.equal(official.periodo.estado_publicacao, 'oficial');
      assert.equal(official.resumo_equipe.oficiais, 2);
      assert.equal(official.resumo_equipe.parciais, 0);

      for (const change of [
        (p) => { p.periodo.publicacao_oficial = false; },
        (p) => { p.periodo.ranking_habilitado = false; },
        (p) => { p.periodo.ciclo_estado = 'aberto'; },
        (p) => { p.professores[1].ranking_habilitado = false; },
        (p) => { p.ranking_oficial.pop(); },
        (p) => { p.ranking_oficial.push({ professor_id: 99 }); },
        (p) => { p.ranking_oficial[1].professor_id = 99; },
        (p) => { p.ranking_oficial[1] = { ...p.ranking_oficial[0] }; },
        (p) => { p.ranking_oficial[1].score = 71; },
        (p) => { p.ranking_oficial[1].score = null; },
        (p) => { p.ranking_oficial = null; },
      ]) {
        const payload = structuredClone(complete);
        change(payload);
        const result = queryJson(container, documentSql(payload));
        assert.equal(result.periodo.estado_publicacao, 'ciclo_em_acompanhamento', JSON.stringify(payload.periodo));
      }
      const monthly = queryJson(container, documentSql(complete, 'mensal'));
      assert.equal(monthly.periodo.estado_publicacao, 'mensal');
    });

    await t.test('metricas detalhadas sem eventos elegiveis produzem taxa null, nao zero', () => {
      const payload = documentFixture();
      payload.professores = payload.professores.slice(3);
      payload.ranking_oficial = [];
      payload.periodo.publicacao_oficial = false;
      const result = queryJson(container, documentSql(payload));
      assert.equal(result.presenca.presenca_media, null);
      assert.equal(result.presenca.eventos_elegiveis, 0);
      assert.equal(result.presenca.presencas_confirmadas, 0);
      assert.equal(result.presenca.professores_com_evidencia, 0);
      assert.equal(result.presenca.professores_sem_eventos, 2);
      assert.equal(result.presenca.ocorrencias_observadas, 2);
      assert.equal(result.presenca.ocorrencias_fora_calculo, 2);
      assert.equal(result.experimentais.professores_conversao_pontuando, 0);
      assert.equal(result.carteira_carga.turmas_usadas_na_media_individual, 0);
    });

    await t.test('uma metrica legada ou ausente preserva o agregado anterior sem fabricar zeros', () => {
      for (const change of [
        (p) => { delete p.professores[3].metricas.presenca.detalhes.ocorrencias_fora_calculo; },
        (p) => { delete p.professores[3].metricas.presenca.detalhes; },
        (p) => { delete p.professores[3].metricas.presenca; },
      ]) {
        const payload = documentFixture();
        payload.presenca = {
          presenca_media: 87.5, eventos_elegiveis: 80, presencas_confirmadas: 70,
          pendencias: 6, regra_agregacao: 'legada',
        };
        change(payload);
        const result = queryJson(container, documentSql(payload));
        assert.deepEqual(result.presenca, { ...payload.presenca, total_professores: 5 });
        assert.equal(result.experimentais.professores_conversao_pontuando, 2);
      }
    });

    await t.test('roster vazio preserva agregado recebido e nunca declara ciclo oficial', () => {
      const payload = documentFixture();
      payload.professores = [];
      payload.ranking_oficial = [];
      payload.presenca = { presenca_media: null, eventos_elegiveis: 0 };
      const empty = queryJson(container, documentSql(payload));
      assert.equal(empty.resumo_equipe.total_professores, 0);
      assert.equal(empty.resumo_equipe.comparaveis, 0);
      assert.equal(empty.periodo.estado_publicacao, 'ciclo_em_acompanhamento');
      assert.deepEqual(empty.presenca, { ...payload.presenca, total_professores: 0 });
    });

    await t.test('wrapper rejeita periodo ou produtor invalido', () => {
      for (const args of ["null, 2019, 6, 'mensal'", "null, 2020, 13, 'mensal'", "null, 2020, 6, 'anual'"]) {
        expectSqlError(container, `select public.montar_relatorio_coordenacao_conteudo_v4(${args});`,
          /RELATORIO_COORDENACAO_V4_PERIODO_INVALIDO/);
      }
      for (const payload of [null, { professores: {} }]) {
        expectSqlError(container, documentSql(payload), /RELATORIO_COORDENACAO_V4_CONTEUDO_INVALIDO/);
      }
    });
  });
});

const snapshotFixture = String.raw`
  create table public.health_score_professor_v3_snapshots (
    id uuid primary key default gen_random_uuid(), professor_id integer default 1,
    escopo text default 'consolidado', unidade_id uuid, competencia date default '2020-06-01',
    trimestre_inicio date default '2020-06-01', revisao integer default 1,
    config_id uuid, config_versao integer default 1, regra_versao text default 'fixture',
    snapshot_anterior_id uuid, justificativa_retificacao text, criado_por integer default 1,
    criado_em timestamptz default now(), fechado_em timestamptz,
    score numeric default 80, cobertura numeric default 100, classificacao text default 'saudavel',
    estado text not null, publicado boolean not null, publicavel boolean not null,
    ranking_habilitado boolean not null, estado_publicacao text not null,
    invalidado_em timestamptz, motivo_bloqueio text
  );
`;

test('confiabilidade: constraint de invalidacao preserva historico publicado em PostgreSQL', { timeout: 120_000 }, async (t) => {
  await withPostgres(t, 'invalidacao', async (container) => {
    const constraintName = 'health_score_professor_v3_snapshot_publicacao_chk';
    const old = readMigration(ciclosMigrationName);
    const start = old.indexOf(`add constraint ${constraintName} check (`);
    assert.notEqual(start, -1, 'Constraint anterior ausente');
    const end = old.indexOf(';', start);
    assert.notEqual(end, -1);
    const oldConstraint = `alter table public.health_score_professor_v3_snapshots ${old.slice(start, end + 1)}`;
    const migration = readMigration(coreMigrationName);
    const newConstraint = migration.match(
      /^alter table public\.health_score_professor_v3_snapshots\s+drop constraint health_score_professor_v3_snapshot_publicacao_chk,[\s\S]*?;/mu,
    );
    assert.ok(newConstraint, 'ALTER TABLE da constraint de publicacao ausente');
    execute(container, snapshotFixture + oldConstraint);

    // Exercise the same inputs before and after the ALTER, in a real constraint.
    execute(container, String.raw`
      create table public.fixture_constraint_casos as
      select row_number() over ()::integer as id, e.estado, p.publicado,
        v.publicavel, r.ranking_habilitado, ep.estado_publicacao, i.invalidado_em
      from (values ('provisorio'), ('em_maturacao'), ('fechado'), ('invalidado')) e(estado)
      cross join (values (false), (true)) p(publicado)
      cross join (values (false), (true)) v(publicavel)
      cross join (values (false), (true)) r(ranking_habilitado)
      cross join (values ('sem_base'), ('parcial'), ('oficial')) ep(estado_publicacao)
      cross join (values (null::timestamptz), ('2020-09-01'::timestamptz)) i(invalidado_em);
      create function public.fixture_constraint_aceita(p_id integer)
      returns boolean language plpgsql as $$
      declare v_id uuid;
      begin
        insert into public.health_score_professor_v3_snapshots (
          estado, publicado, publicavel, ranking_habilitado, estado_publicacao, invalidado_em
        ) select estado, publicado, publicavel, ranking_habilitado, estado_publicacao, invalidado_em
          from public.fixture_constraint_casos where id = p_id returning id into v_id;
        delete from public.health_score_professor_v3_snapshots where id = v_id;
        return true;
      exception when check_violation then return false;
      end;
      $$;
    `);
    const casesSql = `select jsonb_agg(to_jsonb(c) || jsonb_build_object('aceita',
      public.fixture_constraint_aceita(c.id)) order by c.id) from public.fixture_constraint_casos c;`;
    const before = queryJson(container, casesSql);

    await t.test('constraint antiga reproduz bloqueio de invalidacao mantendo publicado', () => {
      const blocked = before.find((c) => c.estado === 'invalidado' && c.publicado
        && !c.publicavel && !c.ranking_habilitado && c.invalidado_em !== null
        && c.estado_publicacao === 'oficial');
      assert.ok(blocked);
      assert.equal(blocked.aceita, false);
    });

    execute(container, newConstraint[0]);
    const after = queryJson(container, casesSql);
    await t.test('192 combinacoes: invalidacao exige data e exclusao; demais estados preservam check anterior', () => {
      assert.equal(after.length, 192);
      const oldById = new Map(before.map((c) => [c.id, c]));
      for (const c of after) {
        const expected = c.estado === 'invalidado'
          ? c.invalidado_em !== null && !c.publicavel && !c.ranking_habilitado
          : oldById.get(c.id).aceita;
        assert.equal(c.aceita, expected, JSON.stringify(c));
      }
    });

    // The actual legacy trigger (not a permissive stub) must still accept the
    // formal transition and forbid clearing the immutable publication history.
    execute(container, extractFunction(readMigration(snapshotsMigrationName),
      'fn_health_score_professor_v3_bloquear_snapshot_fechado') + `
      create trigger trg_health_score_professor_v3_snapshot_imutavel
      before update or delete on public.health_score_professor_v3_snapshots
      for each row execute function public.fn_health_score_professor_v3_bloquear_snapshot_fechado();
      insert into public.health_score_professor_v3_snapshots (
        id, estado, publicado, publicavel, ranking_habilitado, estado_publicacao, fechado_em
      ) values ('00000000-0000-0000-0000-000000000001', 'fechado', true, true, true, 'oficial', '2020-09-01');
    `);
    const invalidation = `update public.health_score_professor_v3_snapshots
      set estado = 'invalidado', invalidado_em = now(), publicavel = false, ranking_habilitado = false`;
    await t.test('trigger real aceita invalidacao controlada sem reescrever publicado ou valores historicos', () => {
      const result = queryJson(container, `begin;
        set local app.health_score_v3_mutacao_controlada = 'on';
        ${invalidation};
        select to_jsonb(s) from public.health_score_professor_v3_snapshots s;
        rollback;`);
      assert.equal(result.estado, 'invalidado');
      assert.equal(result.publicado, true);
      assert.equal(result.publicavel, false);
      assert.equal(result.ranking_habilitado, false);
      assert.ok(result.invalidado_em);
      assert.equal(result.estado_publicacao, 'oficial');
      assert.equal(result.score, 80);
      assert.equal(result.cobertura, 100);
      assert.equal(result.classificacao, 'saudavel');
    });

    await t.test('trigger continua proibindo apagar publicado, alterar score e mutacao nao controlada', () => {
      for (const change of [', publicado = false', ', score = 1']) {
        expectSqlError(container, `begin;
          set local app.health_score_v3_mutacao_controlada = 'on';
          ${invalidation}${change}; rollback;`, /HEALTH_SCORE_V3_SNAPSHOT_IMUTAVEL/);
      }
      expectSqlError(container, invalidation, /HEALTH_SCORE_V3_SNAPSHOT_IMUTAVEL/);
      const persisted = queryJson(container, 'select to_jsonb(s) from public.health_score_professor_v3_snapshots s;');
      assert.equal(persisted.estado, 'fechado');
      assert.equal(persisted.publicado, true);
      assert.equal(persisted.score, 80);
    });
  });
});
