import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrations = new URL('../supabase/migrations/', import.meta.url);
const historicalMigration = '20260909150854_coordenacao_presenca_universo_historico.sql';
const observedMigration = '20260909143251_coordenacao_presenca_amostra_observada.sql';
const cycleMigration = '20260719120000_health_score_v3_ciclos_publicacao_parcial.sql';
const wrapperName = 'montar_relatorio_coordenacao_conteudo_v4';
const cg = '10000000-0000-0000-0000-000000000001';
const barra = '20000000-0000-0000-0000-000000000002';
const recreio = '30000000-0000-0000-0000-000000000003';
const denied = '40000000-0000-0000-0000-000000000004';
const scopes = [null, cg, barra, recreio];
const teamIds = new Map([
  [null, [101, 102, 103, 104, 105]], [cg, [103, 105]],
  [barra, [101, 102]], [recreio, [104]],
]);
const dockerWindows = join(
  process.env.LOCALAPPDATA || '', 'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe',
);
const dockerExecutable = process.platform === 'win32' && existsSync(dockerWindows)
  ? dockerWindows : 'docker';

function migration(name) {
  return readFileSync(new URL(name, migrations), 'utf8').replace(/\r\n/gu, '\n');
}

function readHistoricalMigration() {
  // Applying the migration replaces its planned timestamp with the actual one.
  // Resolve by the exact migration suffix and reject an ambiguous checkout.
  const names = readdirSync(migrations).filter((name) =>
    /^\d{14}_coordenacao_presenca_universo_historico\.sql$/u.test(name));
  assert.equal(names.length, 1,
    'Esperada uma migration historica (planejada: ' + historicalMigration + '): ' + names.join(', '));
  return migration(names[0]);
}

// Execute only explicit functions, never migration DO/data/grant/DDL blocks.
function extractFunction(sql, name) {
  const start = sql.search(new RegExp(
    '^create or replace function public\\.' + name + '\\s*\\(', 'imu',
  ));
  assert.notEqual(start, -1, 'Funcao ausente: ' + name);
  const opening = /\bas\s+(\$[a-zA-Z_0-9]*\$)/iu.exec(sql.slice(start));
  assert.ok(opening, 'Corpo ausente: ' + name);
  const end = sql.indexOf(opening[1] + ';', start + opening.index + opening[0].length);
  assert.notEqual(end, -1, 'Fim ausente: ' + name);
  return sql.slice(start, end + opening[1].length + 1);
}

function docker(args, input) {
  return spawnSync(dockerExecutable, args, {
    input, encoding: 'utf8', timeout: 30_000, maxBuffer: 12 * 1024 * 1024,
  });
}

function psql(container, sql) {
  return docker([
    'exec', '-i', container, 'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1',
    '-v', 'VERBOSITY=verbose',
    '-U', 'postgres', '-d', 'postgres', '-qAt',
  ], sql);
}

function execute(container, sql) {
  const result = psql(container, sql);
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  return result.stdout.trim();
}

function json(container, sql) {
  return JSON.parse(execute(container, sql));
}

function expectSqlError(container, sql, pattern) {
  const result = psql(container, sql);
  assert.notEqual(result.status, 0, 'SQL deveria ter falhado');
  assert.match(result.stderr, pattern);
  assert.match(result.stderr, /ERROR:\s+22023:/u, 'Guard deve retornar SQLSTATE 22023');
}

function literal(value) {
  return "'" + JSON.stringify(value).replace(/'/gu, "''") + "'::jsonb";
}

function unitSql(unit) {
  return unit === null ? 'null::uuid' : "'" + unit + "'::uuid";
}

async function withPostgres(t, run) {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }
  const container = 'la-coord-presenca-historica-' + process.pid + '-' + Date.now();
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--pull=never', '--network=none',
    '--env', 'POSTGRES_PASSWORD=postgres', 'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.error?.message || started.stderr || started.stdout);
  try {
    let ready = 0;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      ready = psql(container, 'select 1;').status === 0 ? ready + 1 : 0;
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

const fixtureSql = `
  create table public.professores (
    id integer primary key, nome text not null, ativo boolean not null default true,
    mesclado_em_professor_id integer
  );
  create table public.professores_unidades (
    professor_id integer, unidade_id uuid, emusys_ativo boolean not null,
    validacao_status text not null
  );
  create table public.fixture_ocorrencias (
    professor_id integer, unidade_id uuid, data_aula date,
    considera_frequencia_denominador boolean,
    considera_presenca boolean, considera_falta boolean,
    considera_falta_justificada boolean,
    ocorrencia_incompleta boolean, possui_conflito boolean
  );
  create table public.fixture_documentos (escopo text primary key, payload jsonb not null);
  create table public.fixture_documentos_congelados (id integer primary key, payload jsonb not null);
  create function public.fn_health_score_v3_unidades_permitidas_sombra(uuid)
  returns table (unidade_id uuid) language sql stable as $$
    select u.id from (values
      ('${cg}'::uuid), ('${barra}'::uuid), ('${recreio}'::uuid)
    ) u(id) where $1 is null or $1 = u.id
  $$;
  create function public.fn_presenca_ocorrencias_escopo_interno_v2(
    uuid, date, date, integer, integer
  ) returns setof public.fixture_ocorrencias language sql stable as $$
    select o.* from public.fixture_ocorrencias o
    where o.unidade_id = $1 and o.data_aula between $2 and $3
      and ($4 is null or o.professor_id = $4)
  $$;
  -- Stub the previous producer, not the classification/aggregation under test.
  create function public.montar_rel_coord_before_confiabilidade_20260909(
    uuid, integer, integer, text
  ) returns jsonb language sql stable as $$
    select payload from public.fixture_documentos
    where escopo = coalesce($1::text, 'rede')
  $$;
  insert into public.professores (id, nome) values
    (101, 'Fixture A'), (102, 'Fixture B'), (103, 'Fixture CG'),
    (104, 'Fixture Recreio'), (105, 'Fixture sem eventos');
  insert into public.professores_unidades values
    (101, '${barra}', true, 'preexistente'),
    (101, '${cg}', false, 'ignorado'),
    (102, '${barra}', true, 'validado_humano'),
    (102, '${recreio}', false, 'pendente'),
    (103, '${cg}', true, 'validado_humano'),
    (104, '${recreio}', true, 'validado_humano'),
    (105, '${cg}', true, 'validado_humano'),
    (101, '${barra}', true, 'preexistente');
  -- Last link is duplicated intentionally; canonical events must not duplicate.
  -- Historical CG: 0/1 + 3 excluded; historical Recreio: 1/5 + 2 excluded.
  insert into public.fixture_ocorrencias
    select v.professor_id, v.unidade_id, v.data_aula, true,
      n <= v.presentes, n > v.presentes, false,
      v.professor_id = 103 and n = 1, v.professor_id = 103 and n = 2
    from (values
      (101, '${barra}'::uuid, date '2020-06-15', 8, 10),
      (101, '${cg}'::uuid, date '2020-06-01', 0, 1),
      (102, '${barra}'::uuid, date '2020-07-15', 4, 4),
      (102, '${recreio}'::uuid, date '2020-08-31', 1, 5),
      (103, '${cg}'::uuid, date '2020-06-30', 8, 10),
      (104, '${recreio}'::uuid, date '2020-08-15', 9, 12)
    ) v(professor_id, unidade_id, data_aula, presentes, elegiveis)
    cross join lateral generate_series(1, v.elegiveis) n;
  insert into public.fixture_ocorrencias
    select v.professor_id, v.unidade_id, v.data_aula,
      false, false, false, false, false, false
    from (values
      (101, '${cg}'::uuid, date '2020-06-01', 3),
      (102, '${recreio}'::uuid, date '2020-08-31', 2),
      (103, '${cg}'::uuid, date '2020-06-30', 2),
      (104, '${recreio}'::uuid, date '2020-08-15', 1)
    ) v(professor_id, unidade_id, data_aula, excluidas)
    cross join lateral generate_series(1, v.excluidas);
  -- Poison rows expose unit leakage and cutoff/month-selection mistakes.
  insert into public.fixture_ocorrencias
    select 101, v.unidade_id, v.data_aula, true, true, false, false, false, false
    from (values
      ('${denied}'::uuid, date '2020-06-15'),
      ('${cg}'::uuid, date '2020-05-31'),
      ('${recreio}'::uuid, date '2020-09-01')
    ) v(unidade_id, data_aula) cross join generate_series(1, 100);
`;

function presenceRows(container, unit) {
  return json(container, `
    select coalesce(jsonb_agg(to_jsonb(p) order by professor_id), '[]'::jsonb)
    from public.get_health_score_professor_v3_presenca_periodo_v2(
      date '2020-06-01', ${unitSql(unit)}, 'ciclo'
    ) p;
  `);
}

function baseDocument(unit, rows) {
  const professores = teamIds.get(unit).map((id) => {
    const observed = rows.find((p) => p.professor_id === id);
    assert.ok(observed, 'Professor da equipe ausente na fonte: ' + id);
    const scored = id !== 105;
    const score = scored ? 90 - (id - 101) : null;
    return {
      professor_id: id, nome: observed.professor_nome,
      score, score_comparavel: score, score_observado: score,
      score_exibivel: scored, ranking_habilitado: scored,
      estado_publicacao: scored ? 'oficial' : 'sem_base',
      comparabilidade_estado: scored ? 'comparavel' : 'sem_base_operacional',
      auditoria_health_score: { data_corte: '2020-08-31', preservar: 'snapshot-fechado' },
      metricas: {
        presenca: {
          valor: observed.valor_bruto, valor_bruto: observed.valor_bruto,
          numerador: observed.numerador, denominador: observed.denominador,
          amostra: observed.amostra, publicavel: observed.publicavel,
          peso_efetivo: observed.publicavel ? 20 : 0, detalhes: observed.detalhes,
        },
        conversao: { peso_efetivo: scored ? 10 : 0 },
        media_turma: { amostra: scored ? 2 : 0 },
      },
      operacional: { matriculas_comerciais: id - 100 },
    };
  });
  return {
    schema_version: 4,
    periodo: {
      ano: 2020, mes: 6, inicio: '2020-06-01', fim: '2020-08-31',
      data_corte: '2020-08-31', periodicidade: 'ciclo', unidade_id: unit,
      ciclo_codigo: '2020-JUN-AGO', ciclo_estado: 'fechado',
      publicacao_oficial: true, ranking_habilitado: true,
    },
    professores,
    ranking_oficial: professores.filter((p) => p.ranking_habilitado)
      .map((p) => ({ professor_id: p.professor_id, score: p.score })),
    resumo_equipe: { total_professores: professores.length },
    presenca: { preservar: 'evidencia', sem_aulas_elegiveis: 999 },
    experimentais: { preservar: 123 }, carteira_carga: { preservar: 456 },
    saidas_retencao: { preservar: 789 }, qualidade_dados: { preservar: true },
    motor_documento: { versao: 'fixture' },
  };
}

function documentCall(unit) {
  return 'public.' + wrapperName + '(' + unitSql(unit) + ", 2020, 6, 'ciclo')";
}

function document(container, unit) {
  // A wrapper remains a reader: PostgreSQL rejects an attempted roster write.
  return json(container, 'begin read only; select ' + documentCall(unit) + '; rollback;');
}

function totals(doc) {
  return [doc.presenca.presencas_confirmadas, doc.presenca.eventos_elegiveis];
}

function assertAdditive(docs) {
  for (const field of [
    'presencas_confirmadas', 'eventos_elegiveis', 'ocorrencias_observadas',
    'ocorrencias_fora_calculo', 'ocorrencias_incompletas', 'ocorrencias_com_conflito',
  ]) {
    const unitSum = docs.slice(1).reduce((sum, doc) => sum + doc.presenca[field], 0);
    assert.equal(docs[0].presenca[field], unitSum, 'Aditividade: ' + field);
  }
}

function persistedInputs(container) {
  return json(container, `
    select jsonb_build_object(
      'vinculos', (select jsonb_agg(to_jsonb(p) order by professor_id, unidade_id)
        from public.professores_unidades p),
      'produtores', (select jsonb_agg(to_jsonb(d) order by escopo)
        from public.fixture_documentos d)
    );
  `);
}

test('presenca historica: wrapper real preserva eventos fora do roster em PostgreSQL',
  { timeout: 180_000 }, async (t) => {
    await withPostgres(t, async (container) => {
      execute(container, fixtureSql
        + extractFunction(migration(cycleMigration), 'fn_health_score_v3_periodo')
        + extractFunction(migration(observedMigration), 'get_health_score_professor_v3_presenca_periodo_v2')
        + extractFunction(migration(observedMigration), wrapperName));
      for (const unit of scopes) {
        const payload = baseDocument(unit, presenceRows(container, unit));
        execute(container, "insert into public.fixture_documentos values ('"
          + (unit ?? 'rede') + "', " + literal(payload) + ');');
      }
      const inputsBefore = persistedInputs(container);
      const oldDocs = scopes.map((unit) => document(container, unit));

      await t.test('controle negativo: wrapper antigo perde exatamente 1 presenca e 6 elegiveis nas unidades', () => {
        assert.deepEqual(oldDocs.map(totals), [[30, 42], [8, 10], [12, 14], [9, 12]]);
        assert.throws(() => assertAdditive(oldDocs), /Aditividade: presencas_confirmadas/);
        assert.equal(oldDocs[0].presenca.eventos_elegiveis
          - oldDocs.slice(1).reduce((sum, d) => sum + d.presenca.eventos_elegiveis, 0), 6);
      });

      const newSql = readHistoricalMigration();
      const newWrapper = extractFunction(newSql, wrapperName);
      execute(container, newWrapper);
      const historicalDocs = scopes.map((unit) => document(container, unit));
      execute(container, `create role fixture_coord_reader;
        revoke all on function public.${wrapperName}(uuid,integer,integer,text) from public;
        grant execute on function public.${wrapperName}(uuid,integer,integer,text) to fixture_coord_reader;`);
      const functionContract = () => json(container, `select jsonb_build_object(
        'acl',proacl,'security_definer',prosecdef,'volatility',provolatile,'config',proconfig)
        from pg_proc where oid='public.${wrapperName}(uuid,integer,integer,text)'::regprocedure;`);
      const previousContract = functionContract();
      const freshNames = readdirSync(migrations).filter((name) =>
        /^\d{14}_coordenacao_presenca_aberta_evidencia_corrente\.sql$/u.test(name));
      assert.ok(freshNames.length <= 1, 'Migration aberta ambigua');
      // Missing migration deliberately runs the deployed historical producer:
      // the fresh-open assertions below must be RED before implementation.
      if (freshNames.length) execute(container, migration(freshNames[0]));
      const docs = scopes.map((unit) => document(container, unit));

      await t.test('DDL nova preserva ACL e saida fechada integral nos quatro escopos', () => {
        assert.deepEqual(functionContract(), previousContract);
        assert.deepEqual(docs, historicalDocs);
        assert.deepEqual(persistedInputs(container), inputsBefore);
      });

      await t.test('recupera seis eventos validos e soma unidades exatamente, incluindo flags e exclusoes', () => {
        assert.deepEqual(docs.map(totals), [[30, 42], [8, 11], [12, 14], [10, 17]]);
        assertAdditive(docs);
        assert.equal(docs[0].presenca.ocorrencias_observadas, 50);
        assert.equal(docs[0].presenca.ocorrencias_fora_calculo, 8);
        assert.equal(docs[0].presenca.ocorrencias_incompletas, 1);
        assert.equal(docs[0].presenca.ocorrencias_com_conflito, 1);
        assert.deepEqual(docs.map((d) => d.presenca.presenca_media), [71.4, 72.7, 85.7, 58.8]);
      });

      await t.test('distingue equipe e universo historico, pequenas amostras e professor sem eventos', () => {
        assert.deepEqual(docs.map((d) => d.presenca.total_professores), [5, 2, 2, 1]);
        assert.deepEqual(docs.map((d) => d.presenca.professores_com_evidencia_equipe), [4, 1, 2, 1]);
        assert.deepEqual(docs.map((d) => d.presenca.professores_com_evidencia), [4, 2, 2, 2]);
      });

      await t.test('suplemento contem somente os vinculos historicos com valores observados, nao score', () => {
        assert.deepEqual(docs[0].presenca.vinculos_historicos, []);
        assert.deepEqual(docs[2].presenca.vinculos_historicos, []);
        const selectContract = (p) => Object.fromEntries(
          ['professor_id', 'nome', 'valor', 'numerador', 'denominador', 'amostra']
            .map((key) => [key, p[key]]),
        );
        assert.deepEqual(docs[1].presenca.vinculos_historicos.map(selectContract), [
          { professor_id: 101, nome: 'Fixture A', valor: 0, numerador: 0, denominador: 1, amostra: 1 },
        ]);
        assert.deepEqual(docs[3].presenca.vinculos_historicos.map(selectContract), [
          { professor_id: 102, nome: 'Fixture B', valor: 20, numerador: 1, denominador: 5, amostra: 5 },
        ]);
        for (const doc of docs) {
          const ids = doc.presenca.vinculos_historicos.map((p) => p.professor_id);
          assert.equal(new Set(ids).size, ids.length);
          for (const p of doc.presenca.vinculos_historicos) {
            assert.ok(!doc.professores.some((member) => member.professor_id === p.professor_id));
            assert.ok(!doc.ranking_oficial.some((member) => member.professor_id === p.professor_id));
          }
        }
      });

      await t.test('nao reativa vinculos nem muda roster, ranking, scores ou outros dominios', () => {
        assert.deepEqual(persistedInputs(container), inputsBefore);
        docs.forEach((doc, index) => {
          for (const field of [
            'professores', 'ranking_oficial', 'resumo_equipe', 'periodo',
            'experimentais', 'carteira_carga', 'saidas_retencao',
          ]) assert.deepEqual(doc[field], oldDocs[index][field], field);
          assert.deepEqual(doc.professores.map((p) => p.professor_id), teamIds.get(scopes[index]));
        });
        const historical = [
          presenceRows(container, cg).find((p) => p.professor_id === 101),
          presenceRows(container, recreio).find((p) => p.professor_id === 102),
          presenceRows(container, null).find((p) => p.professor_id === 102),
        ];
        assert.deepEqual(historical.map((p) => p.denominador), [1, 5, 9]);
        assert.ok(historical.every((p) => !p.publicavel && !p.detalhes.apta_oficial));
      });

      await t.test('payload suplementar capturado nao depende de consulta viva posterior', () => {
        // Self-contained JSON evidence, not the production materializer/trigger.
        execute(container, 'insert into public.fixture_documentos_congelados values (1, '
          + documentCall(recreio) + ');');
        const saved = json(container, 'select payload from public.fixture_documentos_congelados where id=1;');
        const result = json(container, `
          begin;
          update public.professores set nome = 'Nome alterado depois' where id = 102;
          update public.fixture_ocorrencias set considera_presenca = true, considera_falta = false
          where professor_id = 102 and unidade_id = '${recreio}'
            and considera_frequencia_denominador and data_aula = '2020-08-31';
          select jsonb_build_object(
            'salvo', (select payload from public.fixture_documentos_congelados where id=1),
            'novo', ${documentCall(recreio)}
          );
          rollback;
        `);
        assert.deepEqual(result.salvo, saved);
        assert.equal(result.salvo.presenca.vinculos_historicos[0].numerador, 1);
        assert.equal(result.salvo.presenca.vinculos_historicos[0].nome, 'Fixture B');
        assert.equal(result.novo.presenca.vinculos_historicos[0].numerador, 5);
        assert.equal(result.novo.presenca.vinculos_historicos[0].nome, 'Nome alterado depois');
      });

      await t.test('guard rejeita mudanca de numerador, denominador ou ID da equipe, mesmo com soma global igual', () => {
        const mutations = [
          {
            unit: cg,
            sql: "update public.fixture_ocorrencias set considera_presenca=false, considera_falta=true"
              + " where professor_id=103 and considera_presenca;",
          },
          {
            unit: cg,
            sql: "insert into public.fixture_ocorrencias values (103, '" + cg
              + "', '2020-06-30', true, false, true, false, false, false);",
          },
          {
            unit: barra,
            // Move one valid occurrence between team IDs; global num/den stay unchanged.
            sql: "update public.fixture_ocorrencias set professor_id=102 where ctid=("
              + "select ctid from public.fixture_ocorrencias where professor_id=101"
              + " and unidade_id='" + barra + "' and considera_presenca limit 1);",
          },
          {
            unit: cg,
            // A missing source row must fail even when the snapshot has zero events.
            sql: 'delete from public.professores_unidades where professor_id=105;',
          },
        ];
        for (const mutation of mutations) {
          expectSqlError(container, 'begin;' + mutation.sql + 'select '
            + documentCall(mutation.unit) + '; rollback;',
          /RELATORIO_COORDENACAO_V4_PRESENCA_VERSAO_DIVERGENTE/);
        }
        assert.deepEqual(persistedInputs(container), inputsBefore);
        assert.deepEqual(document(container, cg), docs[1]);
      });

      await t.test('guard e totais usam detalhes observados, nao valores de exibicao do snapshot', () => {
        const payload = baseDocument(cg, presenceRows(container, cg));
        // Raw display values are deliberately poisonous; observed evidence is unchanged.
        payload.professores[0].metricas.presenca.numerador = 999;
        payload.professores[0].metricas.presenca.denominador = 999;
        const actual = json(container, "begin; update public.fixture_documentos set payload="
          + literal(payload) + " where escopo='" + cg + "'; select "
          + documentCall(cg) + '; rollback;');
        assert.deepEqual(totals(actual), [8, 11]);
        assert.equal(actual.presenca.professores_com_evidencia_equipe, 1);
        for (const key of ['presentes_observados', 'denominador_observado']) {
          const divergent = structuredClone(payload);
          divergent.professores[0].metricas.presenca.detalhes[key] += 1;
          expectSqlError(container, "begin; update public.fixture_documentos set payload="
            + literal(divergent) + " where escopo='" + cg + "'; select "
            + documentCall(cg) + '; rollback;',
          /RELATORIO_COORDENACAO_V4_PRESENCA_VERSAO_DIVERGENTE/);
        }
      });

      await t.test('historico com somente excluidas e congelado, mas nao conta como professor com eventos elegiveis', () => {
        const actual = json(container, `
          begin;
          insert into public.professores (id, nome) values (106, 'Fixture so excluidas');
          insert into public.professores_unidades values
            (106, '${recreio}', false, 'ignorado');
          insert into public.fixture_ocorrencias
            select 106, '${recreio}', date '2020-08-15',
              false, false, false, false, false, false from generate_series(1, 2);
          select ${documentCall(recreio)};
          rollback;
        `);
        assert.deepEqual(totals(actual), [10, 17]);
        assert.equal(actual.presenca.professores_com_evidencia, 2);
        assert.equal(actual.presenca.professores_com_evidencia_equipe, 1);
        assert.equal(actual.presenca.ocorrencias_observadas, 22);
        assert.equal(actual.presenca.ocorrencias_fora_calculo, 5);
        const historical = actual.presenca.vinculos_historicos.find((p) => p.professor_id === 106);
        assert.ok(historical);
        for (const key of ['valor', 'numerador', 'denominador', 'amostra']) {
          assert.equal(historical[key], null, key);
        }
        assert.equal(historical.detalhes.ocorrencias_observadas, 2);
        assert.equal(historical.detalhes.ocorrencias_fora_calculo, 2);
        assert.deepEqual(actual.ranking_oficial, docs[3].ranking_oficial);
        assert.deepEqual(actual.professores, docs[3].professores);
      });

      await t.test('detalhe legado em qualquer professor preserva agregado sem consultar fonte', () => {
        for (const change of [
          (p) => { delete p.professores[1].metricas.presenca.detalhes.ocorrencias_fora_calculo; },
          (p) => { delete p.professores[1].metricas.presenca.detalhes; },
          (p) => { delete p.professores[1].metricas.presenca; },
          (p) => { p.professores = []; p.ranking_oficial = []; },
        ]) {
          const payload = baseDocument(cg, presenceRows(container, cg));
          payload.presenca = {
            presenca_media: 87.5, presencas_confirmadas: 70, eventos_elegiveis: 80,
            pendencias: 6, regra_agregacao: 'legada', marcador: 'nao-reescrever',
          };
          change(payload);
          const actual = json(container, `
            begin;
            update public.fixture_documentos set payload=${literal(payload)} where escopo='${cg}';
            create or replace function public.fn_presenca_ocorrencias_escopo_interno_v2(
              uuid, date, date, integer, integer
            ) returns setof public.fixture_ocorrencias language plpgsql stable as $$
            begin
              raise exception 'FIXTURE_FONTE_NAO_DEVE_SER_CHAMADA';
            end;
            $$;
            select ${documentCall(cg)};
            rollback;
          `);
          assert.deepEqual(actual.presenca, {
            ...payload.presenca, total_professores: payload.professores.length,
          });
        }
      });

      await t.test('sem eventos nao fabrica percentual nem vinculos historicos', () => {
        const payload = baseDocument(cg, presenceRows(container, cg));
        for (const member of payload.professores) {
          member.metricas.presenca = {
            valor: null, valor_bruto: null, numerador: null, denominador: null,
            amostra: null, publicavel: false, peso_efetivo: 0,
            detalhes: {
              presentes_observados: 0, denominador_observado: 0,
              ocorrencias_observadas: 0, ocorrencias_fora_calculo: 0,
              ocorrencias_incompletas: 0, ocorrencias_com_conflito: 0,
            },
          };
        }
        const empty = json(container, 'begin; delete from public.fixture_ocorrencias;'
          + ' update public.fixture_documentos set payload=' + literal(payload)
          + " where escopo='" + cg + "'; select " + documentCall(cg) + '; rollback;');
        assert.equal(empty.presenca.presenca_media, null);
        assert.equal(empty.presenca.presencas_confirmadas, 0);
        assert.equal(empty.presenca.eventos_elegiveis, 0);
        assert.equal(empty.presenca.professores_com_evidencia, 0);
        assert.equal(empty.presenca.professores_com_evidencia_equipe, 0);
        assert.equal(empty.presenca.total_professores, 2);
        assert.deepEqual(empty.presenca.vinculos_historicos, []);
        assert.deepEqual(empty.ranking_oficial, docs[1].ranking_oficial);
      });

      // Raw occurrence/scope boundaries are fixtures; canonical aggregation and
      // the entire new producer definition execute in real PostgreSQL.
      const shiftCurrent = "update public.fixture_ocorrencias set data_aula=current_date"
        + " where data_aula between date '2020-06-01' and date '2020-08-31';";
      const period = (kind) => json(container, `select to_jsonb(p) || jsonb_build_object(
        'today',current_date,'year',extract(year from current_date)::integer,
        'month',extract(month from current_date)::integer)
        from public.fn_health_score_v3_periodo(current_date,'${kind}') p;`);
      const currentRows = (unit, kind) => json(container, `begin; ${shiftCurrent}
        select jsonb_agg(to_jsonb(p) order by professor_id)
        from public.get_health_score_professor_v3_presenca_periodo_v2(
          current_date,${unitSql(unit)},'${kind}') p; rollback;`);
      const freshDoc = (unit, kind, detailed = false) => {
        const rows = currentRows(unit, kind);
        const dates = period(kind);
        const payload = baseDocument(unit, rows);
        Object.assign(payload.periodo, {
          ano: dates.year, mes: dates.month, inicio: dates.periodo_inicio,
          fim: dates.periodo_fim, data_corte: dates.today, periodicidade: kind,
          ciclo_codigo: dates.ciclo_codigo,
          publicacao_oficial: false, ranking_habilitado: false,
          ciclo_estado: kind === 'ciclo' ? 'aberto' : null,
          estado_publicacao: kind === 'ciclo' ? 'ciclo_em_acompanhamento' : 'mensal',
        });
        payload.ranking_oficial = null;
        payload.presenca = { presenca_media: 70, pendencias: 0, marcador: 'preservar' };
        for (const p of payload.professores) {
          p.ranking_habilitado = false;
          p.estado_publicacao = 'em_andamento';
          p.auditoria_health_score.data_corte = dates.today;
          const m = p.metricas.presenca;
          m.numerador = m.detalhes.presentes_observados;
          m.denominador = m.detalhes.denominador_observado;
          m.amostra = m.denominador;
          m.codigo_evidencia = m.denominador > 0
            ? 'evidencia_observada_em_andamento' : 'sem_eventos_elegiveis_periodo';
          if (!detailed) m.detalhes = { competencias: [{ competencia: dates.today }], regra_agregacao: 'legada' };
        }
        const comparable = payload.professores.filter((p) => p.score_comparavel !== null).length;
        Object.assign(payload.resumo_equipe, { comparaveis: comparable, oficiais: 0, parciais: comparable });
        payload.experimentais.professores_conversao_pontuando = comparable;
        payload.carteira_carga.turmas_usadas_na_media_individual = comparable * 2;
        return payload;
      };
      const freshCall = (unit, kind) => `public.${wrapperName}(${unitSql(unit)},
        extract(year from current_date)::integer,extract(month from current_date)::integer,'${kind}')`;
      const freshSql = (unit, kind, payload, mutation = '') => `begin; ${shiftCurrent}
        update public.fixture_documentos set payload=${literal(payload)}
        where escopo='${unit ?? 'rede'}'; ${mutation} select ${freshCall(unit,kind)}; rollback;`;
      const withoutObserved = (payload) => {
        const copy = structuredClone(payload);
        delete copy.presenca;
        delete copy.motor_documento;
        for (const p of copy.professores) delete p.metricas.presenca.detalhes;
        return copy;
      };

      await t.test('aberto mensal/ciclo captura metadados atuais em todos os escopos sem alterar HS', () => {
        for (const kind of ['mensal', 'ciclo']) {
          const actuals = scopes.map((unit) => {
            const payload = freshDoc(unit, kind, kind === 'mensal');
            const actual = json(container, freshSql(unit,kind,payload));
            assert.equal(actual.presenca.ocorrencias_fora_calculo,
              [8,5,0,3][scopes.indexOf(unit)]);
            assert.equal(actual.presenca.ocorrencias_incompletas, unit === null || unit === cg ? 1 : 0);
            assert.equal(actual.presenca.ocorrencias_com_conflito, unit === null || unit === cg ? 1 : 0);
            assert.deepEqual(withoutObserved(actual), withoutObserved(payload));
            const zero = actual.professores.find((p) => p.professor_id === 105);
            if (zero) {
              assert.equal(zero.metricas.presenca.numerador, 0);
              assert.equal(zero.metricas.presenca.denominador, 0);
              assert.equal(zero.metricas.presenca.detalhes.denominador_observado, 0);
              assert.equal(zero.metricas.presenca.valor_bruto, null);
              assert.equal(actual.presenca.professores_sem_eventos, 1);
            }
            return actual;
          });
          assertAdditive(actuals);
          assert.deepEqual(actuals.map(totals), [[30,42],[8,11],[12,14],[10,17]]);
        }
      });

      await t.test('aberto falha por professor: numerador/denominador divergente, faltante ou falso zero', () => {
        for (const kind of ['mensal', 'ciclo']) for (const mutate of [
          (p) => { p.professores[0].metricas.presenca.numerador += 1; },
          (p) => { p.professores[0].metricas.presenca.denominador += 1; },
          (p) => { delete p.professores[0].metricas.presenca.numerador; },
          (p) => { delete p.professores[0].metricas.presenca.denominador; },
          (p) => { p.professores[0].metricas.presenca.numerador = null; },
          (p) => { p.professores[0].metricas.presenca.denominador = null; },
          (p) => { p.professores[1].metricas.presenca.numerador = 1; },
          (p) => { p.professores[0].metricas.presenca.codigo_evidencia='sem_eventos_elegiveis_periodo'; },
          (p) => { p.professores.push(structuredClone(p.professores[0])); },
        ]) {
          const payload = freshDoc(cg,kind);
          mutate(payload);
          expectSqlError(container, freshSql(cg,kind,payload), /PRESENCA_VERSAO_DIVERGENTE/u);
        }
      });

      await t.test('aberto rejeita fonte ausente inclusive professor com zero e troca de IDs com soma igual', () => {
        expectSqlError(container, freshSql(cg,'ciclo',freshDoc(cg,'ciclo'),
          'delete from public.professores_unidades where professor_id=105;'), /PRESENCA_VERSAO_DIVERGENTE/u);
        expectSqlError(container, freshSql(barra,'ciclo',freshDoc(barra,'ciclo'),
          `update public.fixture_ocorrencias set professor_id=102 where ctid=(select ctid
           from public.fixture_ocorrencias where professor_id=101 and unidade_id='${barra}'
           and considera_presenca limit 1);`), /PRESENCA_VERSAO_DIVERGENTE/u);
      });

      await t.test('rotulo aberto sem contrato de metrica ou corte atual nao promove legado ausente', () => {
        const throwSource = `create or replace function public.fn_presenca_ocorrencias_escopo_interno_v2(
          uuid,date,date,integer,integer) returns setof public.fixture_ocorrencias language plpgsql stable as $$
          begin raise exception 'FIXTURE_FONTE_NAO_DEVE_SER_CHAMADA'; end; $$;`;
        for (const change of [
          (p) => { for (const t of p.professores) t.metricas.presenca.codigo_evidencia='legado'; },
          (p) => { delete p.professores[0].metricas.presenca.codigo_evidencia; },
          (p) => { p.periodo.data_corte='2020-08-31'; },
          (p) => { p.periodo.publicacao_oficial=true; },
          (p) => { p.periodo.ranking_habilitado=true; },
          (p) => { p.periodo.inicio='2020-06-01'; },
          (p) => { p.periodo.fim='2100-11-30'; },
        ]) {
          const payload = freshDoc(cg,'ciclo'); change(payload);
          const actual = json(container,freshSql(cg,'ciclo',payload,throwSource));
          assert.deepEqual(actual.presenca,{...payload.presenca,total_professores:2});
          assert.deepEqual(actual.professores,payload.professores);
        }
      });

      await t.test('mudanca somente de flags atualiza evidencias/hash sem alterar fracao nem score', () => {
        for (const kind of ['mensal', 'ciclo']) {
        const payload = freshDoc(cg,kind,kind === 'mensal');
        const before = json(container,freshSql(cg,kind,payload));
        assert.equal(before.presenca.ocorrencias_incompletas,1);
        const after = json(container,freshSql(cg,kind,payload,
          'update public.fixture_ocorrencias set ocorrencia_incompleta=true, possui_conflito=true'
          + ' where professor_id=103 and not considera_frequencia_denominador;'));
        assert.deepEqual(totals(after),totals(before));
        assert.deepEqual(withoutObserved(after),withoutObserved(before));
        assert.equal(after.presenca.ocorrencias_incompletas,before.presenca.ocorrencias_incompletas+2);
        assert.equal(after.presenca.ocorrencias_com_conflito,before.presenca.ocorrencias_com_conflito+2);
        const updatedDetails = after.professores.find((p) => p.professor_id === 103).metricas.presenca.detalhes;
        assert.equal(updatedDetails.ocorrencias_incompletas, 3);
        assert.equal(updatedDetails.ocorrencias_com_conflito, 3);
        assert.deepEqual(json(container,freshSql(cg,kind,payload)),before);
        const hashes = json(container,'select jsonb_build_array(md5('+literal(before)+'::text),md5('+literal(after)+'::text));');
        assert.notEqual(hashes[0],hashes[1]);
        assert.deepEqual(persistedInputs(container),inputsBefore);
        assert.deepEqual(document(container,cg),docs[1]);
        }
      });

      await t.test('zero aberto exige fonte atual e ignora eventos futuros, sem fabricar percentual', () => {
        for (const kind of ['mensal', 'ciclo']) for (const code of [
          'sem_eventos_elegiveis_periodo', 'sem_aulas_elegiveis', 'calendario_sem_aulas_elegiveis',
        ]) {
          const payload = freshDoc(cg,kind);
          for (const p of payload.professores) {
            Object.assign(p.metricas.presenca, {
              numerador:0, denominador:0, amostra:0, valor:null, valor_bruto:null, codigo_evidencia:code,
            });
          }
          const result = json(container,freshSql(cg,kind,payload,
            'update public.fixture_ocorrencias set data_aula=current_date+1;'));
          assert.deepEqual(totals(result), [0,0]);
          assert.equal(result.presenca.presenca_media, null);
          assert.equal(result.presenca.ocorrencias_observadas, 0);
          assert.equal(result.presenca.ocorrencias_fora_calculo, 0);
          assert.equal(result.presenca.professores_sem_eventos, 2);
          assert.deepEqual(result.presenca.vinculos_historicos, []);
          assert.deepEqual(withoutObserved(result),withoutObserved(payload));
        }
      });
    });
  });
