import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const IMAGE = process.env.PRESENCA_TEACHER_V2_POSTGRES_IMAGE || 'postgres:17-alpine';
const MIGRATION = 'supabase/migrations/20260827031100_la_teacher_presenca_canonica_v2.sql';
const UNIDADE = '11111111-1111-1111-1111-111111111111';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} falhou\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}
const docker = (args, options = {}) => run('docker', args, options);
const psql = (container, sql) => docker(['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres', '-tA'], { input: sql });
function wait(container) {
  for (let i = 0; i < 60; i += 1) {
    if (spawnSync('docker', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], { encoding: 'utf8' }).status === 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error('Postgres descartavel nao iniciou');
}

test('LA Teacher recebe estado, fonte, trava, conflito e frescor da ocorrencia v2', () => {
  assert.match(IMAGE, /^postgres:17(?:[-.][a-z0-9.-]+)?$/iu);
  const container = `la-teacher-presenca-v2-${process.pid}`;
  docker(['run', '--rm', '--name', container, '-e', 'POSTGRES_PASSWORD=postgres', '-d', IMAGE]);
  try {
    wait(container);
    psql(container, `
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create function public.fn_professor_do_usuario() returns integer language sql stable as $$ select 1 $$;
      create table public.aulas_emusys(
        id integer primary key, unidade_id uuid, professor_id integer, data_aula date,
        data_hora_inicio timestamptz, data_hora_fim timestamptz, categoria text,
        cancelada boolean default false
      );
      create table public.aula_roster_sync_estado(
        aula_id integer primary key, estado text, sincronizado_em timestamptz
      );
      create table public.frescor_fixture(
        unidade_id uuid primary key, publicavel boolean, finalizada_em timestamptz
      );
      create function public.fn_presenca_dados_frescos_interno_v1(uuid,date)
      returns jsonb language sql stable security definer as $$
        select jsonb_build_object('publicavel',f.publicavel,'finalizada_em',f.finalizada_em)
        from public.frescor_fixture f where f.unidade_id=$1
      $$;
      create table public.ocorrencias_fixture(
        slot_key text, aluno_id integer, professor_id integer, data_aula date,
        ids_aulas_emusys integer[], resultado_canonico text, fonte_decisao text,
        fecha_chamada boolean, decidido_em timestamptz, possui_conflito boolean
      );
      create view public.vw_presenca_ocorrencia_canonica_v2 as select * from public.ocorrencias_fixture;
      create function public.app_minha_agenda_sessao(p_data date default current_date)
      returns jsonb language sql stable security definer as $$
        select jsonb_build_array(jsonb_build_object(
          'aula_id_ancora',10,'hora','10:00','alunos',jsonb_build_array(jsonb_build_object(
            'aluno_id',101,'nome','Aluno','aula_id_alvo',10,'presenca','a_confirmar',
            'tem_presenca_registrada',false
          ))
        ))
      $$;
      insert into public.aulas_emusys values
        (10,'${UNIDADE}',1,'2026-08-25','2026-08-25 10:00-03','2026-08-25 11:00-03','normal',false);
      insert into public.aula_roster_sync_estado values (10,'completo','2026-08-25 11:01-03');
      insert into public.frescor_fixture values ('${UNIDADE}',true,'2026-08-25 12:00-03');
      insert into public.ocorrencias_fixture values
        ('slot',101,1,'2026-08-25',array[10,11],'presente','agenda_secretaria',true,'2026-08-25 11:05-03',true);
    `);
    psql(container, readFileSync(MIGRATION, 'utf8'));

    const atualizado = JSON.parse(psql(container, `select public.app_minha_agenda_sessao('2026-08-25');`));
    assert.equal(atualizado.dados_status, 'atualizados');
    assert.equal(atualizado.regra_versao, 'presenca-v2');
    assert.equal(atualizado.sincronizado_em, '2026-08-25T15:00:00+00:00');
    assert.deepEqual(
      Object.fromEntries(Object.entries(atualizado.sessoes[0].alunos[0]).filter(([key]) => key.startsWith('presenca_'))),
      {
        presenca_conflito: true,
        presenca_decidida_em: '2026-08-25T14:05:00+00:00',
        presenca_estado_v2: 'presente',
        presenca_fonte: 'agenda_secretaria',
        presenca_regra_versao: 'presenca-v2',
        presenca_travada: true,
      },
    );

    psql(container, `update public.frescor_fixture set publicavel=false;`);
    const inseguro = JSON.parse(psql(container, `select public.app_minha_agenda_sessao('2026-08-25');`));
    assert.equal(inseguro.dados_status, 'dados_desatualizados');
    assert.equal(inseguro.sessoes[0].alunos[0].presenca_estado_v2, 'dados_desatualizados');
    assert.equal(inseguro.sessoes[0].alunos[0].presenca_travada, true);

    const acl = JSON.parse(psql(container, `select json_build_object(
      'anon',has_function_privilege('anon','public.app_minha_agenda_sessao(date)','execute'),
      'auth',has_function_privilege('authenticated','public.app_minha_agenda_sessao(date)','execute'),
      'base_auth',has_function_privilege('authenticated','public.app_minha_agenda_sessao_base_v1(date)','execute')
    );`));
    assert.deepEqual(acl, { anon: false, auth: true, base_auth: false });
  } finally {
    spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' });
  }
});
