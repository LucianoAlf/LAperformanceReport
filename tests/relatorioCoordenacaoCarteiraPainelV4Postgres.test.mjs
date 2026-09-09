import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationPath = new URL(
  '../supabase/migrations/20260909053853_relatorio_coordenacao_carteira_espelha_painel_v4.sql',
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
    maxBuffer: 10 * 1024 * 1024,
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
  let ready = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (psql(container, 'select 1;').status === 0) {
      ready += 1;
      if (ready >= 2) return;
    } else ready = 0;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL de teste nao iniciou a tempo');
}

const fixture = String.raw`
  create role anon;
  create role authenticated;
  create role service_role;

  create function public.fn_health_score_professor_v3_competencia_ciclo_vivo(date,date)
  returns date language sql stable as $$ select $1 $$;

  create function public.get_health_score_professor_v3_performance_snapshot_v3(
    p_competencia date,
    p_unidade_id uuid,
    p_periodicidade text
  ) returns table (
    professor_id integer, metrica text, valor_bruto numeric,
    numerador numeric, denominador numeric, nota numeric, peso numeric,
    peso_disponivel boolean, peso_efetivo numeric, contribuicao numeric,
    meta numeric, amostra integer, estado_base text,
    metrica_publicavel boolean, confianca text, fonte text,
    regra_versao_metrica text, motivo_sem_base text,
    codigo_evidencia text, papel text, detalhes jsonb
  ) language sql stable as $$
    select v.professor_id, 'numero_alunos', v.valor, v.valor, v.valor,
      null::numeric, 0::numeric, false, 0::numeric, null::numeric,
      null::numeric, v.valor::integer, 'valida', true, 'alta',
      'painel', 'regra-painel', null::text, 'valor_disponivel',
      'diagnostico', jsonb_build_object('competencia', p_competencia)
    from (values (1,12::numeric),(2,23::numeric)) v(professor_id,valor)
  $$;

  create function public.montar_relatorio_coordenacao_conteudo_v4(
    uuid,integer,integer,text
  ) returns jsonb language sql stable as $$
    select jsonb_build_object(
      'professores', jsonb_build_array(
        jsonb_build_object(
          'professor_id',1,
          'metricas',jsonb_build_object('numero_alunos',jsonb_build_object('valor',1)),
          'operacional',jsonb_build_object('carteira_alunos',1)
        ),
        jsonb_build_object(
          'professor_id',2,
          'metricas',jsonb_build_object('numero_alunos',jsonb_build_object('valor',2)),
          'operacional',jsonb_build_object('carteira_alunos',2)
        )
      ),
      'carteira_carga',jsonb_build_object(
        'alunos_na_carteira',3,
        'professores_com_carteira_observada',2,
        'media_por_professor',1.5
      )
    )
  $$;
`;

test('documento substitui carteira pela metrica exata do painel e recompõe o total', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `la-carteira-painel-${process.pid}-${Date.now()}`;
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
      select public.montar_relatorio_coordenacao_conteudo_v4(
        null,2026,9,'mensal'
      )::text;
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());

    assert.deepEqual(
      payload.professores.map((p) => p.metricas.numero_alunos.valor),
      [12,23],
    );
    assert.deepEqual(
      payload.professores.map((p) => p.operacional.carteira_alunos),
      [12,23],
    );
    assert.equal(payload.carteira_carga.alunos_na_carteira, 35);
    assert.equal(payload.carteira_carga.professores_com_carteira_observada, 2);
    assert.equal(payload.carteira_carga.media_por_professor, 17.5);
  } finally {
    docker(['stop', container]);
  }
});
