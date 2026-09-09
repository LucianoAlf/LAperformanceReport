import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

// Contract for the forthcoming migration (no implementation lives in this test):
// public.get_health_score_professor_v3_conversao_periodo_canonico(
//   p_competencia date, p_unidade_id uuid, p_periodicidade text
// ) RETURNS TABLE with the existing conversion-source columns, including
// numerador, denominador, amostra, valor_bruto, publicavel and detalhes.
// detalhes must distinguish experimentais_sem_pessoa_canonica from
// conversoes_declaradas_sem_matricula_canonica (CP7).
//
// Monthly and cycle share event eligibility and canonical credit attribution.
// Attribute once BEFORE filtering the requested experimental cohort; otherwise
// September and October can both claim the same enrollment. D+30 credits belong
// to the experimental month, not to the enrollment month. Sample eligibility
// is evaluated after aggregation, without discarding a month's raw small sample.
// Proof of a declared conversion is independent of D+30/credit allocation:
// a proven D+31 enrollment or a credit won by another event is not missing data.
//
// Default: extract the actual NEW function from migrations; fail if absent.
// Optional RED diagnostic against the actual old monthly source, not a mock:
// PowerShell: $env:CONVERSAO_FONTE_TEST_BASELINE='mensal-legado'; node --test <this file>
// Remove that process variable to test the new implementation. No whole migration,
// snapshot writer, API, remote database or Health Score calculator is executed.
// The stored-history sentinel checks source/wrapper reads only, not the separate
// formal-retification migration or its immutable-trigger/publication lifecycle.

const migrations = new URL('../supabase/migrations/', import.meta.url);
const baseline = process.env.CONVERSAO_FONTE_TEST_BASELINE;
assert.ok(!baseline || baseline === 'mensal-legado', 'baseline desconhecida');
const sourceName = baseline
  ? 'get_health_score_professor_v3_conversao_base_v2'
  : 'get_health_score_professor_v3_conversao_periodo_canonico';
const unit = '10000000-0000-0000-0000-000000000001';
const otherUnit = '10000000-0000-0000-0000-000000000002';
const dockerWindows = join(process.env.LOCALAPPDATA || '',
  'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe');
const dockerExecutable = process.platform === 'win32' && existsSync(dockerWindows)
  ? dockerWindows : 'docker';

function docker(args, input) {
  return spawnSync(dockerExecutable, args, {
    input, encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024,
  });
}

function sql(container, query) {
  const result = docker(['exec', '-i', container, 'psql', '--no-psqlrc',
    '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-qAt'], query);
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  return result.stdout.trim();
}

function extractFunction(source, name) {
  const start = source.search(new RegExp(
    `^\\s*create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\s*\\(`, 'im'));
  if (start === -1) return null;
  const rest = source.slice(start);
  const opening = /\bas\s+(\$(?:[a-z_][a-z_0-9]*)?\$)/i.exec(rest);
  assert.ok(opening, `corpo dollar-quoted ausente: ${name}`);
  const closing = rest.indexOf(opening[1], opening.index + opening[0].length);
  assert.notEqual(closing, -1, `fim do corpo ausente: ${name}`);
  const end = rest.indexOf(';', closing + opening[1].length);
  assert.notEqual(end, -1, `fim da definicao ausente: ${name}`);
  return rest.slice(0, end + 1);
}

function latestFunction(name) {
  for (const file of readdirSync(migrations).filter(file => file.endsWith('.sql')).sort().reverse()) {
    const definition = extractFunction(readFileSync(new URL(file, migrations), 'utf8'), name);
    if (definition) return { file, definition };
  }
  assert.fail(`TDD RED: definir public.${name}(date,uuid,text) em nova migration`);
}

// Only scope authorization and the canonical-person view are fixture boundaries.
// Lead resolution, deduplication, D+30, credit allocation and eligibility must run
// inside the REAL extracted source. These tables contain synthetic data only.
const fixture = `
  create role anon;
  create role authenticated;
  create role service_role;
  create table public.unidades (id uuid primary key);
  insert into public.unidades values ('${unit}'), ('${otherUnit}');
  create function public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id uuid)
    returns table(unidade_id uuid) language sql stable as $$
    select id from public.unidades where p_unidade_id is null or id = p_unidade_id
  $$;
  create table public.professores (id integer primary key, nome text);
  insert into public.professores values (2, 'Professor A fixture'), (3, 'Professor B fixture');
  create table public.professores_unidades (
    professor_id integer, unidade_id uuid, emusys_ativo boolean default true,
    validacao_status text default 'validado'
  );
  insert into public.professores_unidades (professor_id, unidade_id)
    select p.id, u.id from public.professores p cross join public.unidades u;
  create table public.leads (
    id integer primary key, unidade_id uuid, emusys_lead_id integer,
    aluno_id integer, converteu boolean default false, data_conversao date
  );
  create table public.lead_experimentais (
    id integer primary key, unidade_id uuid, lead_id integer, aluno_id integer,
    data_experimental date, emusys_lead_id bigint, professor_experimental_id integer
  );
  create table public.alunos (
    id integer primary key, unidade_id uuid, lead_origem_id integer,
    emusys_matricula_id text, data_matricula date, status text default 'ativo'
  );
  create table public.test_identidades (
    aluno_id integer primary key, unidade_id uuid, pessoa_chave text
  );
  create view public.vw_aluno_identidade_unidade_canonica as
    select unidade_id, pessoa_chave, array_agg(aluno_id order by aluno_id) as aluno_ids_locais
    from public.test_identidades group by unidade_id, pessoa_chave;
  create table public.emusys_experimentais_raw (
    id bigint primary key, unidade_id uuid, professor_id integer,
    emusys_aula_id integer, aula_emusys_id integer, data_aula date,
    lead_experimental_id integer, lead_id integer, aluno_id integer,
    emusys_lead_id integer, emusys_lead_id_zero boolean default false,
    situacao_operacional text default 'presente', snapshot_ativo boolean default true
  );
  create table public.health_score_v3_experimental_lead_conciliacoes (
    raw_id bigint primary key, unidade_id uuid, lead_id integer
  );
  create table public.health_score_professor_v3_config_versoes (
    id uuid primary key, status text, vigencia_inicio date, vigencia_fim date, versao integer
  );
  insert into public.health_score_professor_v3_config_versoes values
    ('20000000-0000-0000-0000-000000000003', 'ativa', '2000-01-01', null, 3);
  create table public.health_score_professor_v3_snapshots (
    id uuid primary key, professor_id integer, unidade_id uuid, competencia date,
    periodo_inicio date, periodo_fim date, revisao integer, estado text,
    publicado boolean, publicavel boolean, score numeric, regra_versao text
  );
  insert into public.health_score_professor_v3_snapshots values
    ('30000000-0000-0000-0000-000000000001', 2, '${unit}', '2025-06-01',
      '2025-06-01', '2025-08-31', 1, 'fechado', true, true, 50, 'fixture-historica');
  create table public.health_score_professor_v3_snapshot_metricas (
    snapshot_id uuid, metrica text, numerador numeric, denominador numeric,
    valor_bruto numeric, publicavel boolean, detalhes jsonb
  );
  insert into public.health_score_professor_v3_snapshot_metricas values
    ('30000000-0000-0000-0000-000000000001', 'conversao', 0, 3, 0, true,
      '{"conversoes_declaradas_sem_matricula_canonica":1}');
  create function public.test_history_hash() returns text language sql stable as $$
    select md5(jsonb_build_object(
      'snapshots', (select jsonb_agg(to_jsonb(s) order by s.id) from public.health_score_professor_v3_snapshots s),
      'metricas', (select jsonb_agg(to_jsonb(m) order by m.snapshot_id,m.metrica)
        from public.health_score_professor_v3_snapshot_metricas m))::text)
  $$;
`;

function literal(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function insert(table, fields) {
  return `insert into public.${table} (${Object.keys(fields).join(',')}) values
    (${Object.values(fields).map(literal).join(',')});`;
}

function lead(id, { aluno_id = null, converteu = false, unidade_id = unit } = {}) {
  return insert('leads', { id, unidade_id, emusys_lead_id: id, aluno_id, converteu });
}

function event(id, overrides = {}) {
  return insert('emusys_experimentais_raw', {
    id, unidade_id: unit, professor_id: 2, emusys_aula_id: id,
    data_aula: '2025-09-10', ...overrides,
  });
}

function enrollment(id, data_matricula, overrides = {}) {
  const { pessoa_chave = `pessoa:${id}`, ...fields } = overrides;
  const aluno = { id, unidade_id: unit, data_matricula,
    emusys_matricula_id: `matricula:${id}`, ...fields };
  return insert('alunos', aluno) + insert('test_identidades', {
    aluno_id: id, unidade_id: aluno.unidade_id, pessoa_chave,
  });
}

function request(name, competencia = "date '2025-09-01'", periodicidade = 'mensal', unidade = unit) {
  return { name, competencia, periodicidade, unidade };
}

function metric(result, name, professor = 2) {
  const matches = result[name].filter(row => row.professor_id === professor && row.metrica === 'conversao');
  assert.equal(matches.length, 1, `${name}: exatamente uma linha por professor e metrica`);
  return matches[0];
}

function counts(row, numerador, denominador) {
  assert.equal(row.numerador, numerador, 'matriculas canonicas creditadas');
  assert.equal(row.denominador, denominador, 'eventos elegiveis distintos');
  assert.equal(row.amostra, denominador, 'amostra usa os mesmos eventos do denominador');
  assert.equal(row.valor_bruto, denominador ? Math.round(numerador / denominador * 10_000) / 100 : null);
}

test('fonte unica de conversao: fatos elegiveis e credito canonico independem da periodicidade',
  { timeout: 120_000 }, async (t) => {
    const source = latestFunction(sourceName);
    t.diagnostic(`SQL real extraido de ${source.file}: ${sourceName}`);
    const period = latestFunction('fn_health_score_v3_periodo');
    const wrappers = baseline ? '' : ['mensal', 'ciclo'].map(periodicidade =>
      latestFunction(`get_health_score_professor_v3_conversao_${periodicidade}`).definition).join('\n');
    const info = docker(['info']);
    assert.equal(info.status, 0, info.error?.message || info.stderr || 'Docker necessario; nao aceitar skip');
    const container = `la-conversao-fonte-unica-${process.pid}-${Date.now()}`;
    const started = docker(['run', '--detach', '--rm', '--pull=never', '--network=none',
      '--name', container, '--env', 'POSTGRES_PASSWORD=postgres', 'postgres:17-alpine']);
    assert.equal(started.status, 0, started.error?.message || started.stderr);
    try {
      let ready = 0;
      for (let attempt = 0; attempt < 60 && ready < 3; attempt++) {
        const probe = docker(['exec', container, 'psql', '-U', 'postgres', '-qAt', '-c', 'select 1']);
        ready = probe.status === 0 ? ready + 1 : 0;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      assert.equal(ready, 3, 'PostgreSQL deve estar estavel');
      sql(container, `${fixture}\n${period.definition}\n${source.definition}\n${wrappers}`);

      function evaluate(seed, requests) {
        return JSON.parse(sql(container, `begin;
          create temporary table test_history_before on commit drop as
            select public.test_history_hash() as hash;
          truncate public.emusys_experimentais_raw, public.leads, public.lead_experimentais,
            public.alunos, public.test_identidades, public.health_score_v3_experimental_lead_conciliacoes;
          ${seed}
          select jsonb_build_object(${requests.map(r => `${literal(r.name)},
            (select coalesce(jsonb_agg(to_jsonb(m) order by m.professor_id), '[]'::jsonb)
            from public.${r.wrapper ? `get_health_score_professor_v3_conversao_${r.periodicidade}` : sourceName}(
              ${r.competencia}, ${literal(r.unidade)}::uuid
              ${r.wrapper ? '' : `, ${literal(r.periodicidade)}`}) m)`).join(',')});
          do $$ begin
            if public.test_history_hash() is distinct from (select hash from test_history_before) then
              raise exception 'fonte alterou o historico armazenado';
            end if;
          end $$;
          rollback;`));
      }

      const septemberAndCycle = [request('mensal'), request('ciclo', "date '2025-09-01'", 'ciclo')];

      await t.test('lead nao convertido sem aluno e base real 0/3 nas duas periodicidades', () => {
        const seed = [1, 2, 3].map(id => lead(id) + event(id, { lead_id: id })).join('\n');
        const result = evaluate(seed, [...septemberAndCycle,
          request('ciclo_outubro', "date '2025-10-01'", 'ciclo')]);
        for (const name of ['mensal', 'ciclo', 'ciclo_outubro']) {
          const row = metric(result, name);
          counts(row, 0, 3);
          assert.equal(row.publicavel, true, 'sem aluno nao e, sozinho, defeito da fonte');
          assert.equal(row.detalhes.experimentais_sem_pessoa_canonica, 3);
          assert.equal(row.detalhes.conversoes_declaradas_sem_matricula_canonica, 0);
        }
      });

      await t.test('conversao declarada sem matricula comprovada nao vira zero pontuavel (CP7)', () => {
        const seed = enrollment(20, '2025-09-15')
          + [1, 2, 3].map(id => lead(id, { converteu: id < 3, aluno_id: id === 2 ? 20 : null })
            + event(id, { lead_id: id, aluno_id: id === 2 ? 20 : null })).join('\n');
        const result = evaluate(seed, septemberAndCycle);
        for (const name of ['mensal', 'ciclo']) {
          const row = metric(result, name);
          counts(row, 1, 3);
          assert.equal(row.detalhes.conversoes_declaradas_sem_matricula_canonica, 1);
          assert.equal(row.publicavel, false);
          assert.equal(row.estado_base, 'revisar');
          assert.equal(row.detalhes.apta_oficial, false);
        }
      });

      await t.test('experimental identificada pelo evento nao exige cadastro de aluno no denominador', () => {
        const result = evaluate([1, 2, 3].map(id => event(id)).join('\n'), septemberAndCycle);
        for (const name of ['mensal', 'ciclo']) {
          const row = metric(result, name);
          counts(row, 0, 3);
          assert.equal(row.publicavel, true);
          assert.equal(row.detalhes.experimentais_somente_evento, 3);
        }
      });

      await t.test('pessoa canonica sem data de matricula nao comprova conversao declarada', () => {
        const seed = enrollment(10, null, { emusys_matricula_id: null })
          + lead(10, { aluno_id: 10, converteu: true }) + event(10, { lead_id: 10, aluno_id: 10 })
          + [11, 12].map(id => lead(id) + event(id, { lead_id: id })).join('\n');
        const result = evaluate(seed, septemberAndCycle);
        for (const name of ['mensal', 'ciclo']) {
          const row = metric(result, name);
          counts(row, 0, 3);
          assert.equal(row.publicavel, false, 'pessoa resolvida nao substitui prova da matricula declarada');
          assert.equal(row.estado_base, 'revisar');
          assert.equal(row.detalhes.conversoes_declaradas_sem_matricula_canonica, 1);
        }
      });

      await t.test('lead conciliado resolve pessoa e matricula sem aluno_id gravado no raw', () => {
        const seed = enrollment(10, '2025-09-15') + lead(10, { aluno_id: 10, converteu: true })
          + event(10) + insert('health_score_v3_experimental_lead_conciliacoes', {
            raw_id: 10, unidade_id: unit, lead_id: 10,
          });
        const result = evaluate(seed, septemberAndCycle);
        for (const name of ['mensal', 'ciclo']) counts(metric(result, name), 1, 1);
      });

      await t.test('D+30 inclusivo cruza o mes; D+31 e matricula anterior nao recebem credito', () => {
        const seed = enrollment(11, '2025-10-25') + enrollment(12, '2025-10-26')
          + enrollment(13, '2025-09-24') + [11, 12, 13].map(id => event(id, {
            aluno_id: id, data_aula: '2025-09-25',
          })).join('\n');
        const result = evaluate(seed, [...septemberAndCycle, request('outubro', "date '2025-10-01'")]);
        counts(metric(result, 'mensal'), 1, 3);
        counts(metric(result, 'ciclo'), 1, 3);
        counts(metric(result, 'outubro'), 0, 0);
      });

      await t.test('duas experimentais da mesma pessoa: uma matricula prova ambas, so a ultima recebe credito', () => {
        // Exactly one enrollment and two trials for the declared-converted lead.
        // Other, unconverted leads only complete the sample of three per teacher.
        const seed = enrollment(30, '2025-09-25') + lead(30, { aluno_id: 30, converteu: true })
          + event(30, { lead_id: 30, aluno_id: 30, data_aula: '2025-09-10', professor_id: 2 })
          + event(31, { lead_id: 30, aluno_id: 30, data_aula: '2025-09-20', professor_id: 3 })
          + [32, 33, 34, 35].map(id => lead(id) + event(id, {
            lead_id: id, professor_id: id < 34 ? 2 : 3,
          })).join('\n');
        const result = evaluate(seed, septemberAndCycle);
        for (const name of ['mensal', 'ciclo']) {
          for (const professor of [2, 3]) {
            const row = metric(result, name, professor);
            counts(row, professor === 2 ? 0 : 1, 3);
            assert.equal(row.detalhes.conversoes_declaradas_sem_matricula_canonica, 0,
              'prova existente nao depende de esta experimental ganhar o credito');
            assert.equal(row.publicavel, true, 'zero do professor anterior e observado, nao falta de prova');
            assert.notEqual(row.estado_base, 'revisar');
          }
          assert.equal(result[name].reduce((sum, row) => sum + row.numerador, 0), 1,
            'a mesma matricula comprovada nao pode render dois creditos');
        }
      });

      await t.test('conversao declarada em D+31 tem prova de matricula mas taxa observada zero', () => {
        const seed = enrollment(40, '2025-10-26') + lead(40, { aluno_id: 40, converteu: true })
          + event(40, { lead_id: 40, aluno_id: 40, data_aula: '2025-09-25' })
          + [41, 42].map(id => lead(id) + event(id, {
            lead_id: id, data_aula: '2025-09-25',
          })).join('\n');
        const result = evaluate(seed, septemberAndCycle);
        for (const name of ['mensal', 'ciclo']) {
          const row = metric(result, name);
          counts(row, 0, 3);
          assert.equal(row.detalhes.conversoes_declaradas_sem_matricula_canonica, 0,
            'D+31 exclui credito, nao apaga a prova canonica da matricula');
          assert.equal(row.publicavel, true);
          assert.notEqual(row.estado_base, 'revisar');
          assert.equal(row.detalhes.fora_do_score, false);
        }
      });

      await t.test('atribuicao entre meses e professores nao duplica matricula nem experimental', () => {
        const seed = enrollment(21, '2025-10-10', { pessoa_chave: 'pessoa:comum' })
          + enrollment(22, '2025-10-11', { pessoa_chave: 'pessoa:comum' })
          + enrollment(23, '2025-10-10', { pessoa_chave: 'pessoa:comum', emusys_matricula_id: 'matricula:21' })
          + lead(21, { aluno_id: 21, converteu: true })
          + event(21, { lead_id: 21, aluno_id: 21, data_aula: '2025-09-25' })
          + event(22, { lead_id: 21, aluno_id: 21, data_aula: '2025-10-05', professor_id: 3 })
          + event(23, { lead_id: 21, aluno_id: 21, data_aula: '2025-10-05', professor_id: 3, emusys_aula_id: 22 });
        const result = evaluate(seed, [request('setembro'), request('outubro', "date '2025-10-01'"),
          request('ciclo', "date '2025-10-01'", 'ciclo')]);
        counts(metric(result, 'setembro'), 0, 1);
        counts(metric(result, 'outubro', 3), 1, 1);
        counts(metric(result, 'ciclo'), 0, 1);
        counts(metric(result, 'ciclo', 3), 1, 1);
        for (const professor of [2, 3]) {
          const mensal = ['setembro', 'outubro'].map(name => metric(result, name, professor));
          const ciclo = metric(result, 'ciclo', professor);
          assert.equal(ciclo.detalhes.conversoes_declaradas_sem_matricula_canonica, 0,
            'credito atribuido a outra experimental nao e falta de prova da matricula');
          assert.equal(ciclo.numerador, mensal.reduce((sum, row) => sum + row.numerador, 0));
          assert.equal(ciclo.denominador, mensal.reduce((sum, row) => sum + row.denominador, 0));
        }
      });

      await t.test('amostras mensais 1 e 2 somam 3 eventos; quorum nao descarta fatos mensais', () => {
        const seed = [1, 2, 3].map(id => lead(id) + event(id, {
          lead_id: id, data_aula: id === 1 ? '2025-09-10' : '2025-10-10',
        })).join('\n');
        const result = evaluate(seed, [request('setembro'), request('outubro', "date '2025-10-01'"),
          request('ciclo', "date '2025-10-01'", 'ciclo')]);
        counts(metric(result, 'setembro'), 0, 1);
        counts(metric(result, 'outubro'), 0, 2);
        counts(metric(result, 'ciclo'), 0, 3);
        assert.equal(metric(result, 'setembro').publicavel, false);
        assert.equal(metric(result, 'outubro').publicavel, false);
        assert.equal(metric(result, 'ciclo').publicavel, true);
      });

      await t.test('sem eventos elegiveis: ausencia de base nao e taxa zero', () => {
        const result = evaluate(event(1, { situacao_operacional: 'ausente' })
          + event(2, { situacao_operacional: 'cancelado' }), septemberAndCycle);
        for (const name of ['mensal', 'ciclo']) {
          counts(metric(result, name), 0, 0);
          assert.equal(metric(result, name).publicavel, false);
        }
      });

      await t.test('evento futuro nao entra no mensal nem no ciclo, mesmo ao consultar competencia futura', () => {
        const seed = `insert into public.emusys_experimentais_raw
          (id, unidade_id, professor_id, emusys_aula_id, data_aula)
          values (1, '${unit}', 2, 1, current_date + 1);`;
        const result = evaluate(seed, [request('mensal', 'current_date'),
          request('ciclo', 'current_date', 'ciclo'),
          request('futuro', "(date_trunc('month', current_date) + interval '1 month')::date")]);
        for (const name of ['mensal', 'ciclo', 'futuro']) {
          counts(metric(result, name), 0, 0);
          assert.equal(metric(result, name).publicavel, false);
        }
      });

      await t.test('D+30 aberto e provisoria: amostra real nao equivale a publicacao oficial', () => {
        const seed = [1, 2, 3].map(id => lead(id)).join('\n') + `
          insert into public.emusys_experimentais_raw
            (id, unidade_id, professor_id, emusys_aula_id, data_aula, lead_id)
          select id, '${unit}', 2, id, current_date, id from generate_series(1,3) id;`;
        const result = evaluate(seed, [request('mensal', 'current_date'), request('ciclo', 'current_date', 'ciclo')]);
        for (const name of ['mensal', 'ciclo']) {
          const row = metric(result, name);
          counts(row, 0, 3);
          assert.equal(row.publicavel, true, 'elegibilidade da metrica, nao publicacao do snapshot');
          assert.equal(row.confianca, 'provisoria');
          assert.equal(row.estado_base, 'em_andamento');
          assert.equal(row.detalhes.apta_oficial, false);
        }
      });

      if (!baseline) {
        await t.test('wrappers reais mensal/ciclo devolvem integralmente a mesma fonte', () => {
          const seed = [1, 2, 3].map(id => lead(id) + event(id, { lead_id: id })).join('\n');
          const result = evaluate(seed, [...septemberAndCycle,
            ...septemberAndCycle.map(r => ({ ...r, name: `${r.name}_wrapper`, wrapper: true }))]);
          for (const name of ['mensal', 'ciclo']) assert.deepEqual(result[`${name}_wrapper`], result[name]);
        });
      }

      await t.test('reavaliar a fonte historica nao altera snapshot armazenado nem seu hash', () => {
        const history = () => sql(container, 'select public.test_history_hash()');
        const before = history();
        const seed = [1, 2, 3].map(id => lead(id, { converteu: id === 1 })
          + event(id, { lead_id: id, data_aula: '2025-06-10' })).join('\n');
        const result = evaluate(seed, [request('reavaliacao', "date '2025-06-01'", 'ciclo')]);
        assert.equal(metric(result, 'reavaliacao').publicavel, false,
          'fonte corrigida pode discordar da qualificacao armazenada; exige retificacao separada');
        // evaluate also compares the digest INSIDE the transaction before rollback,
        // so a write cannot hide behind the fixture's rollback cleanup.
        assert.equal(history(), before, 'preservar bytes historicos, nao congelar veredito incorreto');
      });

      await t.test('chaves iguais em unidades distintas nao se fundem nem cruzam credito', () => {
        const seed = enrollment(1, '2025-09-15', { pessoa_chave: 'pessoa:comum', emusys_matricula_id: '77' })
          + enrollment(2, '2025-09-15', { unidade_id: otherUnit, pessoa_chave: 'pessoa:comum', emusys_matricula_id: '77' })
          + event(1, { aluno_id: 1, emusys_aula_id: 99 })
          + event(2, { aluno_id: 2, emusys_aula_id: 99, unidade_id: otherUnit });
        const result = evaluate(seed, [request('unidade_a'), request('unidade_b', "date '2025-09-01'", 'mensal', otherUnit),
          request('global', "date '2025-09-01'", 'mensal', null)]);
        counts(metric(result, 'unidade_a'), 1, 1);
        counts(metric(result, 'unidade_b'), 1, 1);
        counts(metric(result, 'global'), 2, 2);
      });
    } finally {
      const stopped = docker(['stop', container]);
      assert.equal(stopped.status, 0, stopped.error?.message || stopped.stderr);
    }
  });
