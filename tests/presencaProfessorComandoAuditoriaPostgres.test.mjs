import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const IMAGE = process.env.PRESENCA_PROFESSOR_POSTGRES_IMAGE || 'postgres:17-alpine';
const UNIDADE = '11111111-1111-1111-1111-111111111111';
const AUTH = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const migrations = [
  'supabase/migrations/20260827030600_presenca_comando_auditoria.sql',
  'supabase/migrations/20260827030700_presenca_comando_porta_professor.sql',
  'supabase/migrations/20260827030800_presenca_comando_portas_fabio.sql',
  'supabase/migrations/20260827030900_presenca_comando_overloads_compatibilidade.sql',
];

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
  return spawnSync('docker', ['exec','-i',container,'psql','--no-psqlrc','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-tA'], { input: sql, encoding: 'utf8' });
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

test('professor e LA Teacher usam recibo sem reativar roster historico nem tocar chamada de aluno indevida', () => {
  const container = `la-presenca-professor-${process.pid}`;
  docker(['run', '--rm', '--name', container, '-e', 'POSTGRES_PASSWORD=postgres', '-d', IMAGE]);
  try {
    waitForPostgres(container);
    psql(container, String.raw`
      create schema extensions;
      create extension if not exists pgcrypto with schema extensions;
      create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
      create table public.usuarios(id integer primary key,auth_user_id uuid,ativo boolean default true);
      create table public.aulas_emusys(
        id integer primary key,unidade_id uuid not null,professor_id integer,cancelada boolean default false,
        data_hora_inicio timestamptz,data_hora_fim timestamptz,data_aula date,curso_nome text,turma_nome text,sala_nome text,
        professor_presenca text,professor_presenca_origem text,tipo text default 'turma'
      );
      create table public.aula_alunos_emusys(
        aula_emusys_id integer,aluno_id integer,ativo_operacional boolean not null,primary key(aula_emusys_id,aluno_id)
      );
      create table public.aula_roster_sync_estado(aula_id integer primary key,estado text not null);
      create table public.aluno_presenca(
        id uuid default gen_random_uuid(),aluno_id integer,aula_emusys_id integer,professor_id integer,unidade_id uuid,
        data_aula date,horario_aula time,status text,status_presenca text,curso_nome text,turma_nome text,sala_nome text,
        respondido_por text,respondido_em timestamptz,unique(aluno_id,aula_emusys_id)
      );
      create table public.professor_ponto_confirmacoes(aula_emusys_id integer,professor_id integer,primary key(aula_emusys_id,professor_id));
      create table public.fabio_registros_aula(
        id uuid primary key,parent_id uuid,modo_entrada text,aula_id integer,aluno_id integer,
        professor_id integer,campos jsonb default '{}'::jsonb
      );
      create table public.fabio_acoes_pendentes(
        id uuid primary key,professor_id integer,tipo text,estado text,expira_em timestamptz,
        aula_id integer,candidatas integer[],payload jsonb,ultima_resposta_wa_id text,
        atualizado_em timestamptz,encerrado_em timestamptz
      );
      create table public.fabio_acao_eventos(
        acao_id uuid,wa_message_id text unique,evento text,resultado jsonb
      );
      insert into public.usuarios values(1,'${AUTH}',true);
      insert into public.aulas_emusys(
        id,unidade_id,professor_id,cancelada,data_hora_inicio,data_hora_fim,data_aula,
        curso_nome,turma_nome,sala_nome,professor_presenca,professor_presenca_origem,tipo
      ) values(10,'${UNIDADE}',7,false,now()-interval '1 hour',now(),current_date,'Piano','Turma','Sala',null,null,'turma');
      insert into public.aula_alunos_emusys values(10,101,true),(10,102,true),(10,103,false);
      insert into public.aula_roster_sync_estado values(10,'completo');

      create function public.usuario_tem_permissao(integer,text,uuid) returns boolean language sql stable as $$ select true $$;
      create function public.fn_professor_do_usuario() returns integer language sql stable as $$ select 7 $$;
      create function public.fn_janela_registro_dias() returns integer language sql stable as $$ select 3 $$;
      create function public.fn_presenca_e_forte(text) returns boolean language sql stable as $$ select $1 in ('agenda_secretaria','professor_la_teacher','professor_whatsapp','fabio_audio') $$;
      create function public.fn_sincronizar_gemeos_presenca(integer) returns integer language sql as $$ select 0 $$;
      create function public.app_registrar_chamada_agenda(jsonb) returns jsonb language sql as $$ select jsonb_build_object('erros','[]'::jsonb) $$;
      create function public.app_registrar_presencas_aula(integer,integer[]) returns jsonb language sql as $$ select '{}'::jsonb $$;
      create function public.app_marcar_presenca_professor_aula(p_aula integer,p_presente boolean) returns jsonb language plpgsql as $$
      begin update public.aulas_emusys set professor_presenca=case when p_presente then 'presente' else 'ausente' end,
        professor_presenca_origem='agenda_secretaria' where id=p_aula; return jsonb_build_object('registrado',true); end $$;
      create function public.app_registrar_presenca_professor_dia(integer,date,uuid,time,time) returns jsonb language sql as $$ select '{}'::jsonb $$;
      create function public.app_remover_presenca_professor_dia(integer,date,uuid) returns jsonb language sql as $$ select '{}'::jsonb $$;
      create function public.teste_sync_professor(p_aula integer) returns void language sql as $$
        update public.aulas_emusys set professor_presenca='ausente' where id=p_aula and professor_presenca_origem is null
      $$;
      create function public.fabio_shortlist_valida(integer,text,integer[],timestamptz) returns boolean language sql stable as $$ select true $$;
      create function public.fabio_acao_json(uuid) returns jsonb language sql stable as $$ select jsonb_build_object('id',$1) $$;
    `);
    for (const migration of migrations) psql(container, readFileSync(migration, 'utf8'));

    const teacherId = '20000000-0000-0000-0000-000000000001';
    const criado = json(psql(container, asAuth(`select public.app_criar_comando_chamada_professor_v1('${teacherId}',10,array[102]);`)));
    assert.equal(criado.status, 'recebido');
    const aplicado = json(psql(container, asAuth(`select public.app_aplicar_comando_presenca_v1('${teacherId}');`)));
    assert.equal(aplicado.status, 'concluido');
    const chamadas = JSON.parse(psql(container, `select json_object_agg(aluno_id,status_presenca order by aluno_id) from public.aluno_presenca;`));
    assert.deepEqual(chamadas, { 101: 'presente', 102: 'falta' });
    assert.equal(Object.hasOwn(chamadas, '103'), false);
    const retry = json(psql(container, asAuth(`select public.app_aplicar_comando_presenca_v1('${teacherId}');`)));
    assert.equal(retry.aplicados, 2);
    assert.equal(Number(psql(container, `select count(*) from public.presenca_acao_eventos where request_id='${teacherId}' and tipo='item_aplicado';`)), 2);

    const antesAluno = Number(psql(container, 'select count(*) from public.aluno_presenca;'));
    const professorId = '20000000-0000-0000-0000-000000000002';
    const itemProfessor = JSON.stringify([{ aula_emusys_id: 10, professor_id: 7, status: 'presente' }]);
    psql(container, asAuth(`select public.app_criar_comando_presenca_v1('${professorId}','professor_aula','${UNIDADE}',10,'${itemProfessor}'::jsonb); select public.app_aplicar_comando_presenca_v1('${professorId}');`));
    const professor = JSON.parse(psql(container, `select json_build_object('presenca',professor_presenca,'origem',professor_presenca_origem) from public.aulas_emusys where id=10;`));
    assert.deepEqual(professor, { presenca: 'presente', origem: 'agenda_secretaria' });
    psql(container, 'select public.teste_sync_professor(10);');
    assert.equal(psql(container, 'select professor_presenca from public.aulas_emusys where id=10;'), 'presente');
    assert.equal(Number(psql(container, 'select count(*) from public.aluno_presenca;')), antesAluno);
    assert.equal(Number(psql(container, `select count(*) from public.presenca_acao_eventos where request_id='${professorId}' and tipo='item_aplicado';`)), 1);

    const fabioRequest = '20000000-0000-0000-0000-000000000003';
    const fabioPrimeiro = json(psql(container, `select set_config('request.jwt.claim.role','service_role',false); select public.fabio_registrar_presencas_aula(7,10,array[102],'${fabioRequest}');`));
    const fabioSegundo = json(psql(container, `select set_config('request.jwt.claim.role','service_role',false); select public.fabio_registrar_presencas_aula(7,10,array[102],'${fabioRequest}');`));
    assert.equal(fabioPrimeiro.request_id, fabioSegundo.request_id);
    assert.equal(fabioSegundo.status, 'concluido');
    assert.equal(Number(psql(container, `select count(*) from public.presenca_comandos where fonte='professor_whatsapp';`)), 1);

    const conflitoRequest = '20000000-0000-0000-0000-000000000004';
    const conflito = json(psql(container, `select set_config('request.jwt.claim.role','service_role',false); select public.fabio_registrar_presencas_aula(7,10,array[101],'${conflitoRequest}');`));
    assert.equal(conflito.status, 'falhou');
    assert.equal(conflito.aplicados, 0);
    assert.equal(conflito.rejeitados, 2);
    assert.deepEqual([...new Set(conflito.erros.map((erro) => erro.codigo))], ['DECISAO_FORTE_PRESERVADA']);

    const aclLegado = JSON.parse(psql(container, `select json_build_object(
      'agenda',has_function_privilege('authenticated','public.app_registrar_chamada_agenda(jsonb)','execute'),
      'teacher',has_function_privilege('authenticated','public.app_registrar_presencas_aula(integer,integer[])','execute'),
      'prof_aula',has_function_privilege('authenticated','public.app_marcar_presenca_professor_aula(integer,boolean)','execute'),
      'prof_dia',has_function_privilege('authenticated','public.app_registrar_presenca_professor_dia(integer,date,uuid,time without time zone,time without time zone)','execute')
    );`));
    assert.deepEqual(aclLegado, { agenda: false, teacher: false, prof_aula: false, prof_dia: false });

    const invalido = psqlFalha(container, asAuth(`select public.app_criar_comando_presenca_v1(
      '20000000-0000-0000-0000-000000000005','professor_dia','${UNIDADE}',null,
      '[{"professor_id":7,"data":"2026-08-26","status":"ausente"}]'::jsonb);`));
    assert.notEqual(invalido.status, 0);
    assert.match(invalido.stderr, /item_invalido_para_tipo_professor_dia/i);

    psql(container, `update public.aula_roster_sync_estado set estado='incompleto' where aula_id=10;`);
    const rosterInseguro = psqlFalha(container, asAuth(`select public.app_criar_comando_chamada_professor_v1(
      '20000000-0000-0000-0000-000000000006',10,array[]::integer[]);`));
    assert.notEqual(rosterInseguro.status, 0);
    assert.match(rosterInseguro.stderr, /roster_nao_confirmado/i);
  } finally {
    spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' });
  }
});
