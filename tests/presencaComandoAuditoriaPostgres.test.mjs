import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const IMAGE = process.env.PRESENCA_COMANDO_POSTGRES_IMAGE || 'postgres:17-alpine';
const MIGRATION = 'supabase/migrations/20260827030600_presenca_comando_auditoria.sql';
const UNIDADE = '11111111-1111-1111-1111-111111111111';
const AUTH = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} falhou\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}
function docker(args, options = {}) { return run('docker', args, options); }
function psql(container, sql) {
  return docker(['exec', '-i', container, 'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-tA'], { input: sql });
}
function psqlFalha(container, sql) {
  return spawnSync('docker', ['exec', '-i', container, 'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-tA'], { input: sql, encoding: 'utf8' });
}
function waitForPostgres(container) {
  let ok = 0;
  for (let i = 0; i < 60; i += 1) {
    const probe = spawnSync('docker', ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-c', 'select 1'], { encoding: 'utf8' });
    ok = probe.status === 0 ? ok + 1 : 0;
    if (ok >= 3) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error('PostgreSQL 17 descartavel nao ficou pronto');
}
function json(output) { return JSON.parse(output.split(/\r?\n/u).at(-1)); }
function asAuth(sql) {
  return `select set_config('request.jwt.claim.sub','${AUTH}',false); select set_config('request.jwt.claim.role','authenticated',false); ${sql}`;
}

test('comando duravel cobre parcial, retry, retificacao, permissao e append-only', () => {
  const container = `la-presenca-comando-${process.pid}`;
  docker(['run', '--rm', '--name', container, '-e', 'POSTGRES_PASSWORD=postgres', '-d', IMAGE]);
  try {
    waitForPostgres(container);
    psql(container, String.raw`
      create schema extensions;
      create extension if not exists pgcrypto with schema extensions;
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create function auth.role() returns text language sql stable as $$
        select nullif(current_setting('request.jwt.claim.role', true), '')
      $$;
      create table public.usuarios(id integer primary key, auth_user_id uuid, ativo boolean default true);
      create table public.aulas_emusys(
        id integer primary key, unidade_id uuid not null, professor_id integer,
        professor_presenca text, professor_presenca_origem text, data_aula date
      );
      create table public.aluno_presenca(
        aula_id integer not null, aluno_id integer not null, status text not null,
        primary key(aula_id, aluno_id)
      );
      create table public.teste_permissoes(usuario_id integer, unidade_id uuid, permitido boolean);
      insert into public.usuarios values(1,'${AUTH}',true);
      insert into public.aulas_emusys values(10,'${UNIDADE}',7,null,null,current_date);
      insert into public.teste_permissoes values(1,'${UNIDADE}',true);

      create function public.usuario_tem_permissao(p_usuario integer,p_permissao text,p_unidade uuid)
      returns boolean language sql stable as $$
        select coalesce((select permitido from public.teste_permissoes where usuario_id=p_usuario and unidade_id=p_unidade),false)
      $$;
      create function public.fn_professor_do_usuario() returns integer language sql stable as $$ select 7 $$;
      create function public.fn_registrar_presencas_core(integer,integer,integer[],text,boolean)
      returns jsonb language sql as $$ select jsonb_build_object('aplicado',true) $$;
      create function public.app_registrar_chamada_agenda(p_itens jsonb)
      returns jsonb language plpgsql as $$
      declare i jsonb; v_aula integer; v_aluno integer; v_status text;
      begin
        i := p_itens->0; v_aula := (i->>'aula_emusys_id')::integer;
        v_aluno := (i->>'aluno_id')::integer; v_status := i->>'status';
        if v_aluno = 999 then return jsonb_build_object('erros',jsonb_build_array(jsonb_build_object('aluno_id',v_aluno,'erro','aluno_fora_do_roster'))); end if;
        insert into public.aluno_presenca values(v_aula,v_aluno,v_status)
        on conflict(aula_id,aluno_id) do update set status=excluded.status;
        return jsonb_build_object('inseridos',1,'erros','[]'::jsonb);
      end $$;
      create function public.app_marcar_presenca_professor_aula(p_aula integer,p_presente boolean)
      returns jsonb language plpgsql as $$ begin
        update public.aulas_emusys set professor_presenca=case when p_presente then 'presente' else 'ausente' end,
          professor_presenca_origem='agenda_secretaria' where id=p_aula;
        return jsonb_build_object('registrado',true);
      end $$;
      create function public.app_registrar_presenca_professor_dia(integer,date,uuid,time,time)
      returns jsonb language sql as $$ select '{}'::jsonb $$;
      create function public.app_remover_presenca_professor_dia(integer,date,uuid)
      returns jsonb language sql as $$ select '{}'::jsonb $$;
    `);
    psql(container, readFileSync(MIGRATION, 'utf8'));

    const request = '10000000-0000-0000-0000-000000000001';
    const itens = JSON.stringify([
      { aula_emusys_id: 10, aluno_id: 101, status: 'presente' },
      { aula_emusys_id: 10, aluno_id: 999, status: 'falta' },
    ]);
    const recebido = json(psql(container, asAuth(`select public.app_criar_comando_presenca_v1('${request}','agenda_chamada','${UNIDADE}',10,'${itens}'::jsonb);`)));
    assert.equal(recebido.status, 'recebido');

    const parcial = json(psql(container, asAuth(`select public.app_aplicar_comando_presenca_v1('${request}');`)));
    assert.equal(parcial.status, 'parcial');
    assert.equal(parcial.aplicados, 1);
    assert.equal(parcial.rejeitados, 1);
    assert.equal(parcial.erros[0].codigo, 'ALUNO_FORA_DO_ROSTER');

    const eventos = JSON.parse(psql(container, `select json_agg(json_build_object('tipo',tipo,'erro',erro_codigo) order by sequencia) from public.presenca_acao_eventos where request_id='${request}';`));
    assert.equal(eventos[0].tipo, 'recebido');
    assert.equal(eventos.at(-1).tipo, 'concluido');

    const duplicado = json(psql(container, asAuth(`select public.app_aplicar_comando_presenca_v1('${request}');`)));
    assert.equal(duplicado.aplicados, 1);
    assert.equal(Number(psql(container, `select count(*) from public.presenca_acao_eventos where request_id='${request}' and tipo='item_aplicado';`)), 1);

    const retificacaoId = '10000000-0000-0000-0000-000000000002';
    const retificacaoItens = JSON.stringify([{ aula_emusys_id: 10, aluno_id: 101, status: 'falta' }]);
    psql(container, asAuth(`select public.app_criar_comando_presenca_v1('${retificacaoId}','agenda_chamada','${UNIDADE}',10,'${retificacaoItens}'::jsonb); select public.app_aplicar_comando_presenca_v1('${retificacaoId}');`));
    assert.equal(psql(container, 'select status from public.aluno_presenca where aula_id=10 and aluno_id=101;'), 'falta');
    assert.equal(Number(psql(container, `select count(*) from public.presenca_acao_eventos where request_id in ('${request}','${retificacaoId}');`)) >= 7, true);

    const reutilizado = psqlFalha(container, asAuth(`select public.app_criar_comando_presenca_v1('${request}','agenda_chamada','${UNIDADE}',10,'${retificacaoItens}'::jsonb);`));
    assert.notEqual(reutilizado.status, 0);
    assert.match(reutilizado.stderr, /request_id_reutilizado/i);

    psql(container, `update public.teste_permissoes set permitido=false;`);
    const negado = psqlFalha(container, asAuth(`select public.app_criar_comando_presenca_v1('10000000-0000-0000-0000-000000000003','agenda_chamada','${UNIDADE}',10,'${retificacaoItens}'::jsonb);`));
    assert.notEqual(negado.status, 0);
    assert.equal(Number(psql(container, `select count(*) from public.presenca_comandos where request_id='10000000-0000-0000-0000-000000000003';`)), 0);

    const appendOnly = psqlFalha(container, `update public.presenca_acao_eventos set erro_codigo='ALTERADO' where request_id='${request}';`);
    assert.notEqual(appendOnly.status, 0);
    assert.match(appendOnly.stderr, /append_only/i);

    const acl = JSON.parse(psql(container, `select json_build_object(
      'anon_criar',has_function_privilege('anon','public.app_criar_comando_presenca_v1(uuid,text,uuid,integer,jsonb)','execute'),
      'auth_criar',has_function_privilege('authenticated','public.app_criar_comando_presenca_v1(uuid,text,uuid,integer,jsonb)','execute'),
      'auth_eventos',has_table_privilege('authenticated','public.presenca_acao_eventos','select')
    );`));
    assert.deepEqual(acl, { anon_criar: false, auth_criar: true, auth_eventos: false });
  } finally {
    spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' });
  }
});
