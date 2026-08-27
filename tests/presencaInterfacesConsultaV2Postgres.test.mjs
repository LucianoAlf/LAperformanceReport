import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260827031400_presenca_interfaces_consulta_v2.sql',
  'utf8',
);

function docker(args, input) {
  return spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
}

function psql(container, sql) {
  const result = docker([
    'exec', '-i', container, 'psql', '-h', '127.0.0.1',
    '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-At',
  ], sql);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

async function ready(container) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']);
    if (result.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail('PostgreSQL descartável não ficou pronto');
}

test('PostgreSQL compila e separa detalhe regular do experimental', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponível');
    return;
  }

  const container = `la-presenca-interfaces-v2-${process.pid}`;
  const started = docker([
    'run', '--rm', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres', '-d', 'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr);

  try {
    await ready(container);
    psql(container, `
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;

      create table public.alunos (
        id integer primary key, nome text, unidade_id uuid
      );
      create table public.professores (id integer primary key, nome text);
      create table public.aulas_emusys (
        id integer primary key, unidade_id uuid, categoria text,
        professor_nome text, anotacoes text, duracao_minutos integer,
        tipo text, nr_da_aula integer, qtd_alunos integer
      );
      create table public.aluno_presenca (
        id integer primary key, aluno_id integer, unidade_id uuid,
        data_aula date, horario_aula time, curso_nome text, status text,
        aula_emusys_id integer, turma_nome text, sala_nome text,
        respondido_em timestamptz
      );
      create table public.vw_presenca_ocorrencia_canonica_v2 (
        slot_key text, aluno_id integer, unidade_id uuid, professor_id integer,
        data_aula date, data_hora_inicio timestamptz, data_hora_fim timestamptz,
        curso_nome text, resultado_canonico text, fecha_chamada boolean,
        fonte_decisao text, decidido_em timestamptz,
        emusys_presenca_bruta text, possui_conflito boolean,
        ids_aulas_emusys integer[], regra_versao text
      );
      create function public.is_admin() returns boolean language sql stable as
        $$ select false $$;
      create function public.get_user_unidade_ids() returns setof uuid
      language sql stable as $$ select null::uuid where false $$;
      create function public.fn_presenca_estado_publicacao_periodo_v2(uuid, date, date)
      returns jsonb language sql stable as $$
        select jsonb_build_object(
          'dados_status', 'atualizados', 'estado_publicacao', 'publicavel',
          'sincronizado_em', now()
        )
      $$;
    `);

    psql(container, migration);

    const regular = psql(container, `
      insert into public.alunos values
        (10, 'Aluno Regular', '11111111-1111-1111-1111-111111111111');
      insert into public.professores values (20, 'Professor');
      insert into public.aulas_emusys values
        (30, '11111111-1111-1111-1111-111111111111', 'normal',
         'Professor', 'Conteúdo', 50, 'individual', 1, 1);
      insert into public.vw_presenca_ocorrencia_canonica_v2 values
        ('slot-1', 10, '11111111-1111-1111-1111-111111111111', 20,
         date '2026-08-25', timestamptz '2026-08-25 12:00:00-03',
         timestamptz '2026-08-25 12:50:00-03', 'Piano', 'presente', true,
         'agenda_secretaria', now(), 'presente', false, array[30], 'v2');
      select resultado_canonico || '|' || estado_publicacao || '|' || universo_eventos
      from public.get_presenca_ocorrencias_periodo_v2(
        '11111111-1111-1111-1111-111111111111',
        date '2026-08-25', date '2026-08-25', null, null
      );
    `);
    assert.equal(regular.split(/\r?\n/u).at(-1), 'presente|publicado|1');

    const experimental = psql(container, `
      insert into public.aulas_emusys values
        (31, '11111111-1111-1111-1111-111111111111', 'experimental',
         'Professor', 'Experimental', 30, 'individual', 1, 1);
      insert into public.aluno_presenca values
        (40, 10, '11111111-1111-1111-1111-111111111111',
         date '2026-08-26', time '13:00', 'Piano', 'presente', 31,
         null, 'Sala 1', now());
      select resultado || '|' || fonte || '|' || estado_publicacao
      from public.get_presenca_experimental_aluno_periodo_v1(
        '11111111-1111-1111-1111-111111111111',
        date '2026-08-26', date '2026-08-26', 10
      );
    `);
    assert.equal(
      experimental.split(/\r?\n/u).at(-1),
      'presente|presenca-experimental|experimental',
    );
  } finally {
    docker(['rm', '-f', container]);
  }
});
