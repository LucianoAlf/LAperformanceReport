import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationPath = new URL(
  '../supabase/migrations/20260909060143_relatorio_coordenacao_espelho_integral_painel_v4.sql',
  import.meta.url,
);
const cicloCompetenciaMigrationPath = new URL(
  '../supabase/migrations/20260909081124_relatorio_coordenacao_ciclo_competencia_painel_v4.sql',
  import.meta.url,
);
const dockerWindows = join(
  process.env.LOCALAPPDATA || '',
  'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe',
);
const dockerExecutable = process.platform === 'win32' && existsSync(dockerWindows)
  ? dockerWindows
  : 'docker';

function docker(args, input) {
  return spawnSync(dockerExecutable, args, {
    input,
    encoding: 'utf8',
    maxBuffer: 12 * 1024 * 1024,
  });
}

function psql(container, sql) {
  return docker([
    'exec', '-i', container,
    'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres', '-At',
  ], sql);
}

async function waitForPostgres(container) {
  let consecutiveReadyChecks = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (psql(container, 'select 1;').status === 0) {
      consecutiveReadyChecks += 1;
      if (consecutiveReadyChecks >= 3) return;
    } else {
      consecutiveReadyChecks = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL de teste nao iniciou a tempo');
}

const fixture = String.raw`
  create role anon;
  create role authenticated;
  create role service_role;

  create function public.get_health_score_professor_v3_performance_snapshot_v3(
    date, uuid, text
  ) returns table (professor_id integer)
  language sql stable as $$ values (1),(2) $$;

  create function public.montar_relatorio_coordenacao_conteudo_v4(
    uuid,integer,integer,text
  ) returns jsonb language sql stable as $$
    select jsonb_build_object(
      'periodo',jsonb_build_object('ano',$2,'mes',$3,'periodicidade',$4),
      'professores', jsonb_build_array(
        jsonb_build_object(
          'professor_id',1,'nome','Primeira','score_observado',90,
          'score_comparavel',90,'comparabilidade_estado','comparavel',
          'classificacao','saudavel','ranking_habilitado',true,
          'estado_publicacao','oficial','cobertura',100,'pilares_validos',5,
          'metricas',jsonb_build_object(
            'numero_alunos',jsonb_build_object('valor',10,'valor_bruto',10),
            'presenca',jsonb_build_object('valor_bruto',80,'numerador',8,'denominador',10,'codigo_evidencia','evidencia_valida'),
            'retencao',jsonb_build_object('valor_bruto',90,'numerador',9,'denominador',10),
            'permanencia',jsonb_build_object('valor_bruto',12,'numerador',120,'denominador',10),
            'conversao',jsonb_build_object('valor_bruto',50,'numerador',2,'denominador',4,'peso_disponivel',true,'peso_efetivo',15)
          ),
          'operacional',jsonb_build_object('total_turmas',2,'alunos_via_turmas',3,'turmas_elegiveis_media',2)
        ),
        jsonb_build_object(
          'professor_id',2,'nome','Segunda','score_observado',70,
          'score_comparavel',null,'comparabilidade_estado','em_maturacao',
          'classificacao',null,'ranking_habilitado',true,
          'estado_publicacao','oficial','cobertura',40,'pilares_validos',2,
          'metricas',jsonb_build_object(
            'numero_alunos',jsonb_build_object('valor',20,'valor_bruto',20),
            'presenca',jsonb_build_object('valor_bruto',90,'numerador',9,'denominador',10,'codigo_evidencia','evidencia_valida'),
            'retencao',jsonb_build_object('valor_bruto',80,'numerador',8,'denominador',10),
            'permanencia',jsonb_build_object('valor_bruto',10,'numerador',100,'denominador',10),
            'conversao',jsonb_build_object('valor_bruto',50,'numerador',1,'denominador',2,'peso_disponivel',false,'peso_efetivo',0)
          ),
          'operacional',jsonb_build_object('total_turmas',4,'alunos_via_turmas',8,'turmas_elegiveis_media',4)
        ),
        jsonb_build_object(
          'professor_id',3,'nome','Nao esta no painel','score_observado',null,
          'score_comparavel',null,'comparabilidade_estado','sem_base_operacional',
          'classificacao',null,'ranking_habilitado',true,
          'estado_publicacao','oficial','cobertura',0,'pilares_validos',0,
          'metricas',jsonb_build_object(
            'numero_alunos',jsonb_build_object('valor',99,'valor_bruto',99),
            'presenca',jsonb_build_object('valor_bruto',100,'numerador',1,'denominador',1,'codigo_evidencia','evidencia_valida')
          ),
          'operacional',jsonb_build_object('total_turmas',99,'alunos_via_turmas',99,'turmas_elegiveis_media',99)
        )
      ),
      'resumo_equipe',jsonb_build_object('total_professores',3,'sem_base_operacional',1),
      'qualidade_dados',jsonb_build_object('professores_sem_fonte',1,'preservar','sim'),
      'carteira_carga',jsonb_build_object('alunos_na_carteira',129,'grao_carteira','fixture'),
      'presenca',jsonb_build_object('eventos_elegiveis',21),
      'retencao_permanencia',jsonb_build_object('regra_agregacao','antiga'),
      'experimentais',jsonb_build_object('experimentais_confirmadas',6),
      'ranking_oficial',jsonb_build_array(
        jsonb_build_object('professor_id',1,'nome','Primeira','score',90),
        jsonb_build_object('professor_id',3,'nome','Nao esta no painel','score',99)
      ),
      'mapa_sinais',jsonb_build_array(
        jsonb_build_object('professor_id',1,'sinal','ok'),
        jsonb_build_object('professor_id',3,'sinal','fora')
      )
    )
  $$;
`;

test('documento V4 espelha integralmente o roster e os agregados da pagina', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  assert.equal(existsSync(migrationPath), true, 'migration do espelho integral ausente');

  const container = `la-coord-espelho-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres', 'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const migration = readFileSync(migrationPath, 'utf8');
    const setup = psql(container, `${fixture}\n${migration}`);
    assert.equal(setup.status, 0, setup.stderr || setup.stdout);

    const result = psql(container, String.raw`
      set role service_role;
      select public.montar_relatorio_coordenacao_conteudo_v4(
        null,2026,6,'mensal'
      )::text;
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));

    assert.deepEqual(payload.professores.map((p) => p.professor_id), [1,2]);
    assert.deepEqual(payload.resumo_equipe, {
      total_professores: 2,
      com_score: 2,
      comparaveis: 1,
      em_maturacao: 1,
      sem_base_operacional: 0,
      com_evidencia_pendente: 0,
      saudaveis: 1,
      atencao: 0,
      criticos: 0,
      score_medio_comparavel: 90,
      score_medio_observado: 80,
      score_medio_visivel: 90,
    });
    assert.equal(payload.qualidade_dados.professores_sem_fonte, 0);
    assert.equal(payload.qualidade_dados.preservar, 'sim');
    assert.equal(payload.carteira_carga.alunos_na_carteira, 30);
    assert.equal(payload.carteira_carga.professores_com_carteira_observada, 2);
    assert.equal(payload.carteira_carga.media_por_professor, 15);
    assert.equal(payload.carteira_carga.total_turmas_operacionais, 6);
    assert.equal(payload.carteira_carga.ocupacoes_elegiveis, 11);
    assert.equal(payload.carteira_carga.turmas_elegiveis, 6);
    assert.equal(payload.carteira_carga.media_alunos_turma, 1.83);
    assert.equal(payload.presenca.presenca_media, 85);
    assert.equal(payload.presenca.eventos_elegiveis, 20);
    assert.equal(payload.retencao_permanencia.retencao_media, 85);
    assert.equal(payload.retencao_permanencia.permanencia_media_meses, 11);
    assert.equal(payload.experimentais.taxa_conversao_observada, 50);
    assert.deepEqual(payload.ranking_oficial.map((p) => p.professor_id), [1]);
    assert.deepEqual(payload.mapa_sinais.map((p) => p.professor_id), [1]);
  } finally {
    docker(['stop', container]);
  }
});

test('ciclo de outubro usa o roster de outubro e preserva setembro como chave do seletor', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  assert.equal(existsSync(cicloCompetenciaMigrationPath), true, 'migration da competencia viva ausente');

  const container = `la-coord-ciclo-vivo-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres', 'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const migration = readFileSync(migrationPath, 'utf8');
    const cicloMigration = readFileSync(cicloCompetenciaMigrationPath, 'utf8');
    const setup = psql(container, `${fixture}\n${migration}\n${String.raw`
      create function public.fn_health_score_professor_v3_competencia_ciclo_vivo(date,date)
      returns date language sql stable security definer as $$
        select date '2026-10-01'
      $$;

      create or replace function public.get_health_score_professor_v3_performance_snapshot_v3(
        date, uuid, text
      ) returns table (professor_id integer)
      language sql stable as $$
        select case when $1 = date '2026-10-01' then 1 else 3 end
      $$;
    `}\n${cicloMigration}`);
    assert.equal(setup.status, 0, setup.stderr || setup.stdout);

    const result = psql(container, String.raw`
      set role service_role;
      select public.montar_relatorio_coordenacao_conteudo_v4(
        null,2026,9,'ciclo'
      )::text;
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));

    assert.deepEqual(payload.professores.map((p) => p.professor_id), [1]);
    assert.equal(payload.periodo.ano, 2026);
    assert.equal(payload.periodo.mes, 9);
    assert.equal(payload.periodo.periodicidade, 'ciclo');
  } finally {
    docker(['stop', container]);
  }
});
