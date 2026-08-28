import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const ROOT = process.cwd();
const IMAGE = process.env.PRESENCA_PENDENCIAS_V2_POSTGRES_IMAGE || 'postgres:17-alpine';
const ocorrenciaMigration = join(ROOT, 'supabase', 'migrations', '20260827030100_presenca_ocorrencia_canonica_v2.sql');
const pendenciasMigration = join(ROOT, 'supabase', 'migrations', '20260827031000_presenca_pendencias_canonicas_v2.sql');
const agentesMigration = join(ROOT, 'supabase', 'migrations', '20260827031200_presenca_contexto_agentes_v1.sql');
const pendenciasEscopoMigration = join(ROOT, 'supabase', 'migrations', '20260828084658_presenca_pendencias_view_escopo.sql');
const pendenciasMaterializadaMigration = join(ROOT, 'supabase', 'migrations', '20260828085519_presenca_pendencias_view_materializada.sql');
const U_A = '11111111-1111-1111-1111-111111111111';
const U_B = '22222222-2222-2222-2222-222222222222';
const U_C = '33333333-3333-3333-3333-333333333333';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} falhou\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}
function docker(args, options = {}) { return run('docker', args, options); }
function psql(container, sql) {
  return docker(['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-tA'], { input: sql });
}
function waitForPostgres(container) {
  let consecutivos = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = spawnSync('docker', ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-c', 'select 1'], { encoding: 'utf8' });
    consecutivos = probe.status === 0 ? consecutivos + 1 : 0;
    if (consecutivos >= 3) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error('PostgreSQL 17 descartavel nao ficou pronto');
}
function lastJson(output) { return JSON.parse(output.split(/\r?\n/u).at(-1)); }

const schema = String.raw`
  create extension if not exists unaccent;
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create role sol_acesso_restrito nologin;
  create role lia_acesso_restrito nologin;
  create role mila_acesso_restrito nologin;
  grant usage on schema public to sol_acesso_restrito, lia_acesso_restrito, mila_acesso_restrito;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
  $$;
  create function auth.role() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claim.role',true),'')
  $$;
  create table public.unidades(id uuid primary key, nome text not null);
  create table public.professores(id integer primary key, nome text not null);
  create table public.alunos(id integer primary key, nome text not null);
  create table public.aulas_emusys(
    id integer primary key, emusys_id integer not null, unidade_id uuid not null,
    data_aula date not null, data_hora_inicio timestamptz not null, data_hora_fim timestamptz,
    duracao_minutos integer, tipo text, categoria text, curso_nome text, turma_nome text,
    sala_nome text, professor_id integer, matricula_disciplina_id bigint,
    professor_presenca text, professor_presenca_origem text,
    cancelada boolean default false, justificada boolean default false
  );
  create table public.aluno_presenca(
    id uuid primary key, aluno_id integer not null, professor_id integer, unidade_id uuid not null,
    data_aula date not null, horario_aula time, status text, respondido_por text,
    respondido_em timestamptz, created_at timestamptz default now(),
    aula_emusys_id integer references public.aulas_emusys(id), curso_nome text,
    status_presenca text, emusys_presenca_bruta text, sincronizado_emusys_em timestamptz
  );
  create table public.presenca_politicas_confiabilidade(
    id uuid primary key, unidade_id uuid not null, data_inicio date not null, data_fim date not null,
    ausencia_emusys_resultado text not null, exige_revisao_operacional boolean not null,
    decidido_em date not null, decidido_por text not null, evidencia text not null,
    regra_versao text not null, ativa boolean not null default true, created_at timestamptz not null default now()
  );
  create table public.aula_alunos_emusys(
    id bigint generated always as identity primary key, aula_emusys_id integer not null,
    unidade_id uuid not null, aluno_id integer, aluno_emusys_id bigint, aluno_chave text not null,
    aluno_nome text not null, sincronizado_em timestamptz not null default now(),
    ativo_operacional boolean not null default true
  );
  create table public.aula_roster_sync_estado(
    aula_id integer primary key, run_id uuid not null, estado text not null,
    qtd_esperada integer, qtd_recebida integer, snapshot_hash text, sincronizado_em timestamptz not null
  );
  create view public.vw_aula_roster_operacional_v1 with (security_invoker=true) as
    select aa.id as vinculo_id, aa.aula_emusys_id, aa.unidade_id, aa.aluno_id,
           aa.aluno_emusys_id, aa.aluno_chave, aa.aluno_nome,
           aa.sincronizado_em as vinculo_sincronizado_em, e.run_id,
           e.estado as roster_estado, e.qtd_esperada, e.qtd_recebida,
           e.snapshot_hash, e.sincronizado_em as roster_sincronizado_em
    from public.aula_alunos_emusys aa join public.aula_roster_sync_estado e on e.aula_id=aa.aula_emusys_id
    where aa.ativo_operacional and e.estado='completo';
  create table public.presenca_sync_cobertura(
    unidade_id uuid not null, modo text not null, data_alvo date not null, run_id uuid not null,
    status text not null, lease_ate timestamptz, heartbeat_em timestamptz, snapshot_hash text,
    paginas_lidas integer default 0, aulas_lidas integer default 0, presencas_lidas integer default 0,
    finalizada_em timestamptz, atualizada_em timestamptz, primary key(unidade_id,modo,data_alvo)
  );
  create function public.fn_presenca_dados_frescos_v1(uuid,date)
  returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  create function public.fn_presenca_pendencia_elegivel(uuid,integer,date,bigint,text)
  returns boolean language sql stable as $$ select true $$;
  create function public.is_admin() returns boolean language sql stable security definer as $$ select false $$;
  create function public.get_user_unidade_ids() returns setof uuid language sql stable security definer as $$
    select '${U_A}'::uuid
  $$;
  create table public.usuarios(id integer primary key,auth_user_id uuid,ativo boolean default true);
  insert into public.usuarios values (1,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',true);
  create function public.usuario_tem_permissao(integer,text,uuid)
  returns boolean language sql stable security definer as $$ select $3='${U_A}'::uuid $$;
  create function public.get_agenda_dia(p_data date, p_unidade_id uuid default null)
  returns table(chave text) language sql stable as $$ select 'agenda|'||p_data::text||'|'||coalesce(p_unidade_id::text,'todas') $$;
  create function public.fn_enfileirar_relatorio_presenca(p_data date default current_date-1,p_dry_run boolean default true)
  returns jsonb language plpgsql security definer as $$ begin return jsonb_build_object('fonte','fn_enfileirar_relatorio_presenca'); end; $$;
  create table public.fila_relatorios_sol_hermes(
    id bigint generated always as identity primary key, tipo_relatorio text, origem text,
    unidade_id uuid, unidade_nome text, jid text, grupo_nome text, texto text, status text,
    agendada_para timestamptz, data_dia date, tentativas integer, metadata jsonb,
    enviada_em timestamptz default now()
  );
  create table public.whatsapp_destinatarios_relatorio(
    id integer generated always as identity primary key, tipo text, nome text,
    jid text, unidade_id uuid, ativo boolean default true, caixa_id integer
  );
  create table public.presenca_comandos(
    request_id uuid primary key, status text not null, tipo text, fonte text,
    unidade_id uuid, professor_id integer, data_referencia date
  );
  create table public.presenca_acao_eventos(
    id bigint generated always as identity primary key, request_id uuid not null,
    tipo text not null, aluno_id integer, aula_id integer, professor_id integer, status_novo text,
    fonte text, criado_em timestamptz not null default now()
  );
  insert into public.unidades values ('${U_A}','Barra'),('${U_B}','Recreio'),('${U_C}','Campo Grande');
  insert into public.professores values (1,'Professor A'),(2,'Professor B'),(3,'Professor C');
  insert into public.alunos values
    (101,'Aluno Regular'),(102,'Aluno Conflito'),(103,'Aluno Fantasma'),
    (201,'Aluno Incompleto'),(301,'Aluno Sem Cobertura');
  insert into public.presenca_politicas_confiabilidade values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','${U_A}','2026-01-01','2026-12-31','nao_conclusivo',true,
     '2026-08-01','auditoria','politica teste','temporal-v1',true,now());
  insert into public.aulas_emusys
    (id,emusys_id,unidade_id,data_aula,data_hora_inicio,data_hora_fim,tipo,categoria,curso_nome,turma_nome,sala_nome,professor_id,matricula_disciplina_id)
  values
    (10,1010,'${U_A}','2026-08-25','2026-08-25 10:00-03','2026-08-25 11:00-03','individual','normal','Piano','Piano regular','Sala 1',1,1001),
    (11,1011,'${U_A}','2026-08-25','2026-08-25 10:00-03','2026-08-25 11:00-03','individual','experimental','Piano','Experimental','Sala 1',1,2001),
    (12,1012,'${U_A}','2026-08-25','2026-08-25 11:00-03','2026-08-25 12:00-03','individual','normal','Bateria','Roster vazio','Sala 2',1,3001),
    (13,1013,'${U_A}','2026-08-25','2026-08-25 13:00-03','2026-08-25 14:00-03','individual','normal','Canto','Conflito','Sala 3',1,4001),
    (20,2020,'${U_B}','2026-08-25','2026-08-25 10:00-03','2026-08-25 11:00-03','individual','normal','Teclado','Incompleta','Sala 1',2,5001),
    (30,3030,'${U_C}','2026-08-25','2026-08-25 10:00-03','2026-08-25 11:00-03','individual','normal','Violao','Sem cobertura','Sala 1',3,6001);
  insert into public.aula_alunos_emusys(aula_emusys_id,unidade_id,aluno_id,aluno_emusys_id,aluno_chave,aluno_nome) values
    (10,'${U_A}',101,10001,'emusys:10001','Aluno Regular'),(11,'${U_A}',101,10001,'emusys:10001','Aluno Regular'),
    (12,'${U_A}',103,10003,'emusys:10003','Aluno Fantasma'),(13,'${U_A}',102,10002,'emusys:10002','Aluno Conflito'),
    (20,'${U_B}',201,20001,'emusys:20001','Aluno Incompleto'),(30,'${U_C}',301,30001,'emusys:30001','Aluno Sem Cobertura');
  insert into public.aula_roster_sync_estado(aula_id,run_id,estado,qtd_esperada,qtd_recebida,snapshot_hash,sincronizado_em) values
    (10,'10000000-0000-0000-0000-000000000010','completo',1,1,'h10','2026-08-26 08:00-03'),
    (11,'10000000-0000-0000-0000-000000000011','completo',1,1,'h11','2026-08-26 08:00-03'),
    (12,'10000000-0000-0000-0000-000000000012','vazio_confirmado',0,0,'h12','2026-08-26 08:00-03'),
    (13,'10000000-0000-0000-0000-000000000013','completo',1,1,'h13','2026-08-26 08:00-03'),
    (20,'20000000-0000-0000-0000-000000000020','incompleto',2,1,'h20','2026-08-26 08:00-03'),
    (30,'30000000-0000-0000-0000-000000000030','completo',1,1,'h30','2026-08-26 08:00-03');
  insert into public.presenca_sync_cobertura
    (unidade_id,modo,data_alvo,run_id,status,heartbeat_em,snapshot_hash,paginas_lidas,aulas_lidas,presencas_lidas,finalizada_em,atualizada_em)
  values
    ('${U_A}','presenca','2026-08-25','40000000-0000-0000-0000-000000000001','concluida','2026-08-26 08:30-03','sync-a',1,4,3,'2026-08-26 08:30-03','2026-08-26 08:30-03'),
    ('${U_B}','presenca','2026-08-25','40000000-0000-0000-0000-000000000002','concluida','2026-08-26 08:31-03','sync-b',1,1,0,'2026-08-26 08:31-03','2026-08-26 08:31-03'),
    ('${U_C}','presenca','2026-08-25','40000000-0000-0000-0000-000000000003','falhou','2026-08-26 08:32-03',null,0,0,0,'2026-08-26 08:32-03','2026-08-26 08:32-03');
  insert into public.aluno_presenca
    (id,aluno_id,professor_id,unidade_id,data_aula,horario_aula,status,respondido_por,respondido_em,aula_emusys_id,curso_nome,status_presenca,emusys_presenca_bruta,sincronizado_emusys_em)
  values
    ('50000000-0000-0000-0000-000000000001',101,1,'${U_A}','2026-08-25','10:00','presente','emusys',null,11,'Piano',null,'presente','2026-08-26 08:30-03'),
    ('50000000-0000-0000-0000-000000000002',102,1,'${U_A}','2026-08-25','13:00','presente','agenda_secretaria','2026-08-25 14:01-03',13,'Canto','presente','ausente','2026-08-26 08:30-03'),
    ('50000000-0000-0000-0000-000000000003',102,1,'${U_A}','2026-08-25','13:00','ausente','emusys',null,13,'Canto',null,'ausente','2026-08-26 08:30-03');
  insert into public.presenca_comandos values
    ('60000000-0000-0000-0000-000000000001','concluido','agenda_chamada','agenda_secretaria','${U_A}',null,'2026-08-25'),
    ('60000000-0000-0000-0000-000000000002','concluido','professor_aula','agenda_secretaria','${U_A}',1,'2026-08-25');
  insert into public.presenca_acao_eventos
    (request_id,tipo,aluno_id,aula_id,professor_id,status_novo,fonte,criado_em)
  values
    ('60000000-0000-0000-0000-000000000001','item_aplicado',102,13,null,'presente','agenda_secretaria','2026-08-25 14:01:20-03'),
    ('60000000-0000-0000-0000-000000000002','item_aplicado',null,13,1,'presente','agenda_secretaria','2026-08-25 14:02:20-03');
  update public.aulas_emusys
     set professor_presenca='ausente', professor_presenca_origem=null
   where id=10;
  update public.aulas_emusys
     set professor_presenca='presente', professor_presenca_origem='agenda_secretaria'
   where id=13;
  insert into public.fila_relatorios_sol_hermes(unidade_id,unidade_nome,jid,grupo_nome,status,enviada_em) values
    ('${U_A}','Barra','grupo-a','RELATORIOS DIARIOS BR','enviada',now()),
    ('${U_B}','Recreio','grupo-b','RELATORIOS DIARIOS RC','enviada',now()),
    ('${U_C}','Campo Grande','grupo-c','RELATORIOS DIARIOS CG','enviada',now());
`;

test('Agenda e Sol compartilham membros e bloqueiam roster ou sync inseguros', () => {
  assert.match(IMAGE, /^postgres:17(?:[-.][a-z0-9.-]+)?$/iu);
  const container = `la-presenca-pendencias-v2-${process.pid}`;
  docker(['run','--rm','--name',container,'-e','POSTGRES_PASSWORD=postgres','-d',IMAGE]);
  try {
    waitForPostgres(container);
    psql(container, schema);
    psql(container, readFileSync(ocorrenciaMigration, 'utf8'));
    psql(container, readFileSync(pendenciasMigration, 'utf8'));
    psql(container, readFileSync(agentesMigration, 'utf8'));
    psql(container, readFileSync(pendenciasEscopoMigration, 'utf8'));
    psql(container, readFileSync(pendenciasMaterializadaMigration, 'utf8'));

    const pendenciasDef = psql(container, String.raw`
      select pg_get_functiondef(
        'public.fn_presenca_pendencias_do_dia_v2(uuid,date)'::regprocedure
      );
    `);
    assert.match(
      pendenciasDef,
      /o\.slot_key\s*=\s*p\.slot_key[\s\S]*o\.unidade_id\s*=\s*p\.unidade_id[\s\S]*o\.data_aula\s*=\s*p_data/iu,
    );
    assert.match(
      pendenciasDef,
      /with\s+ocorrencias\s+as\s+materialized\s*\([\s\S]*where\s+unidade_id\s*=\s*p_unidade_id[\s\S]*data_aula\s*=\s*p_data/iu,
    );

    const a = lastJson(psql(container, `select public.fn_presenca_pendencias_do_dia_v2('${U_A}','2026-08-25');`));
    assert.equal(a.dados_status, 'atualizados');
    assert.equal(a.regra_versao, 'presenca-v2');
    assert.deepEqual(a.pendencias.map((x)=>[x.aluno_nome,x.curso_nome]), [['Aluno Regular','Piano']]);
    assert.deepEqual(a.conflitos.map((x)=>[x.aluno_nome,x.curso_nome]), [['Aluno Conflito','Canto']]);
    assert.equal(JSON.stringify(a).includes('Aluno Fantasma'), false);
    assert.equal(JSON.stringify(a).includes('Experimental'), false);

    const contextoSol = lastJson(psql(container, `select public.get_presenca_contexto_agente_v1('${U_A}','2026-08-25','sol');`));
    assert.equal(contextoSol.dados_status, 'atualizados');
    assert.equal(contextoSol.estado_publicacao, 'publicavel');
    assert.equal(contextoSol.regra_versao, 'presenca-agentes-v1+presenca-v2');
    assert.equal(contextoSol.pendencias.length, 1);
    assert.equal(contextoSol.conflitos_detalhes.length, 1);
    assert.equal(contextoSol.universo_eventos, 2);
    assert.equal(contextoSol.presentes, 0);
    assert.equal(contextoSol.faltas_confirmadas, 0);
    assert.equal(contextoSol.indeterminados, 1);
    assert.equal(contextoSol.conflitos, 1);
    assert.equal(contextoSol.revisoes_estruturais, 0);
    assert.deepEqual(contextoSol.revisoes_estruturais_detalhes, []);

    const contextoLia = lastJson(psql(container, `select public.get_presenca_contexto_agente_v1('${U_A}','2026-08-25','lia');`));
    assert.deepEqual(contextoLia.pendencias, []);
    assert.deepEqual(contextoLia.conflitos_detalhes, []);
    assert.deepEqual(contextoLia.ocorrencias, []);

    const contextoMila = lastJson(psql(container, `select public.get_presenca_contexto_agente_v1('${U_A}','2026-08-25','mila');`));
    assert.equal(contextoMila.dados_status, 'contrato_experimental');
    assert.equal(contextoMila.experimentais.presenca_regular_como_atalho, false);

    const contextoFabio = lastJson(psql(container, `select public.get_presenca_contexto_agente_v1('${U_A}','2026-08-25','fabio',1);`));
    assert.equal(contextoFabio.ocorrencias.every((x)=>x.professor_id===1), true);
    assert.equal(JSON.stringify(contextoFabio).includes('aluno_nome'), false);

    const agenda = lastJson(psql(container, `select public.get_agenda_dia_v2('2026-08-25','${U_A}');`));
    assert.deepEqual(agenda.pendencias.map((x)=>x.slot_key), a.pendencias.map((x)=>x.slot_key));
    assert.deepEqual(agenda.conflitos.map((x)=>x.slot_key), a.conflitos.map((x)=>x.slot_key));
    assert.equal(agenda.aulas.length, 1);
    assert.deepEqual(
      agenda.ocorrencias.map((x)=>[x.aluno_id,x.resultado_canonico,x.fonte_decisao,x.possui_conflito]),
      [[102,'presente','agenda_secretaria',true]],
    );
    assert.equal(agenda.ocorrencias.find((x)=>x.aluno_id===102).request_id, '60000000-0000-0000-0000-000000000001');
    assert.equal(agenda.ocorrencias.find((x)=>x.aluno_id===102).recibo_status, 'concluido');
    assert.equal(agenda.professores_ocorrencias.some((x)=>x.aula_emusys_id===10), false);
    assert.deepEqual(
      agenda.professores_ocorrencias.map((x)=>[x.aula_emusys_id,x.professor_id,x.estado,x.fonte,x.request_id,x.recibo_status]),
      [[13,1,'presente','agenda_secretaria','60000000-0000-0000-0000-000000000002','concluido']],
    );

    const semana = lastJson(psql(container, `select public.get_agenda_semana_v2('2026-08-24','${U_A}');`));
    assert.equal(Object.keys(semana).length, 6);
    assert.equal(semana['2026-08-25'].dados_status, 'atualizados');
    assert.deepEqual(semana['2026-08-25'].ocorrencias, agenda.ocorrencias);
    assert.deepEqual(semana['2026-08-25'].professores_ocorrencias, agenda.professores_ocorrencias);

    psql(container, `
      insert into public.aulas_emusys
        (id,emusys_id,unidade_id,data_aula,data_hora_inicio,data_hora_fim,tipo,categoria,curso_nome,turma_nome,sala_nome,professor_id,matricula_disciplina_id)
      values
        (31,3031,'${U_C}','2026-08-24','2026-08-24 10:00-03','2026-08-24 11:00-03','individual','experimental','Piano','Somente experimental','Sala 1',3,7001);
    `);
    const consolidadoSomenteExperimental = lastJson(psql(container, `select public.get_agenda_dia_v2('2026-08-24',null);`));
    assert.equal(consolidadoSomenteExperimental.dados_status, 'atualizados');
    assert.deepEqual(consolidadoSomenteExperimental.pendencias, []);

    const legado = JSON.parse(psql(container, `select coalesce(json_agg(json_build_object('motivo',motivo,'aluno',aluno_nome,'curso',curso_nome) order by motivo,aluno_nome),'[]'::json) from public.fn_presenca_pendencias_do_dia('${U_A}','2026-08-25');`));
    assert.deepEqual(legado, [
      { motivo:'divergencia', aluno:'Aluno Conflito', curso:'Canto' },
      { motivo:'sem_resposta', aluno:'Aluno Regular', curso:'Piano' },
    ]);

    const textoA = psql(container, `select public.fn_texto_relatorio_presenca('${U_A}','2026-08-25');`);
    assert.match(textoA, /Dados sincronizados às 08:30/u);
    assert.match(textoA, /Aluno Regular \(Piano\)/u);
    assert.match(textoA, /Aluno Conflito \(Canto\)/u);
    assert.doesNotMatch(textoA, /Experimental|Aluno Fantasma/u);

    psql(container, `update public.presenca_sync_cobertura set finalizada_em='2026-08-25 09:00-03' where unidade_id='${U_A}' and data_alvo='2026-08-25';`);
    const coberturaAntiga = lastJson(psql(container, `select public.fn_presenca_pendencias_do_dia_v2('${U_A}','2026-08-25');`));
    assert.equal(coberturaAntiga.dados_status, 'dados_desatualizados');
    assert.deepEqual(coberturaAntiga.pendencias, []);
    psql(container, `update public.presenca_sync_cobertura set finalizada_em='2026-08-26 08:30-03' where unidade_id='${U_A}' and data_alvo='2026-08-25';`);

    psql(container, "update public.aula_roster_sync_estado set sincronizado_em='2025-08-25 08:00-03' where aula_id=10;");
    const rosterAntigo = lastJson(psql(container, `select public.fn_presenca_pendencias_do_dia_v2('${U_A}','2026-08-25');`));
    assert.equal(rosterAntigo.dados_status, 'roster_em_revisao');
    assert.deepEqual(rosterAntigo.pendencias, []);
    assert.equal(rosterAntigo.revisoes_estruturais.some((x)=>x.aula_emusys_id===10 && x.estado==='roster_desatualizado'), true);
    psql(container, "update public.aula_roster_sync_estado set sincronizado_em='2026-08-26 08:00-03' where aula_id=10;");

    const b = lastJson(psql(container, `select public.fn_presenca_pendencias_do_dia_v2('${U_B}','2026-08-25');`));
    assert.equal(b.dados_status, 'roster_em_revisao');
    assert.deepEqual(b.pendencias, []);
    assert.equal(JSON.stringify(b.revisoes_estruturais).includes('Aluno Incompleto'), false);
    const textoB = psql(container, `select public.fn_texto_relatorio_presenca('${U_B}','2026-08-25');`);
    assert.match(textoB, /ROSTER EM REVISAO ESTRUTURAL/u);
    assert.doesNotMatch(textoB, /Tudo fechado|Aluno Incompleto/u);

    const c = lastJson(psql(container, `select public.fn_presenca_pendencias_do_dia_v2('${U_C}','2026-08-25');`));
    assert.equal(c.dados_status, 'dados_desatualizados');
    assert.deepEqual(c.pendencias, []);
    const textoC = psql(container, `select public.fn_texto_relatorio_presenca('${U_C}','2026-08-25');`);
    assert.match(textoC, /DADOS DE PRESENCA AINDA NAO PUBLICAVEIS/u);
    assert.doesNotMatch(textoC, /Tudo fechado|Aluno Sem Cobertura/u);

    const consolidado = psql(container, `select public.fn_texto_relatorio_presenca_consolidado('2026-08-25');`);
    assert.match(consolidado, /ROSTER EM REVISAO ESTRUTURAL/u);
    assert.match(consolidado, /DADOS DE PRESENCA AINDA NAO PUBLICAVEIS/u);
    assert.doesNotMatch(consolidado, /Aluno Incompleto|Aluno Sem Cobertura/u);

    const cron = lastJson(psql(container, "select public.fn_enfileirar_relatorio_presenca_se_coberto_v1('2026-08-25');"));
    assert.equal(cron.ok, true);
    const enfileiradas = JSON.parse(psql(container, `
      select json_agg(json_build_object('unidade',unidade_nome,'texto',texto) order by unidade_nome)
      from public.fila_relatorios_sol_hermes
      where tipo_relatorio='presenca_pendencias' and data_dia='2026-08-25';
    `));
    assert.equal(enfileiradas.length, 3);
    assert.doesNotMatch(enfileiradas.find((x)=>x.unidade==='Recreio').texto, /Aluno Incompleto|Tudo fechado/u);
    assert.doesNotMatch(enfileiradas.find((x)=>x.unidade==='Campo Grande').texto, /Aluno Sem Cobertura|Tudo fechado/u);

    const acl = JSON.parse(psql(container, `select json_build_object(
      'anon',has_function_privilege('anon','public.fn_presenca_pendencias_do_dia_v2(uuid,date)','execute'),
      'auth',has_function_privilege('authenticated','public.fn_presenca_pendencias_do_dia_v2(uuid,date)','execute'),
      'service',has_function_privilege('service_role','public.fn_presenca_pendencias_do_dia_v2(uuid,date)','execute'),
      'contexto_anon',has_function_privilege('anon','public.get_presenca_contexto_agente_v1(uuid,date,text,integer)','execute'),
      'contexto_auth',has_function_privilege('authenticated','public.get_presenca_contexto_agente_v1(uuid,date,text,integer)','execute'),
      'contexto_service',has_function_privilege('service_role','public.get_presenca_contexto_agente_v1(uuid,date,text,integer)','execute'),
      'contexto_sol',has_function_privilege('sol_acesso_restrito','public.get_presenca_contexto_agente_v1(uuid,date,text,integer)','execute'),
      'contexto_lia',has_function_privilege('lia_acesso_restrito','public.get_presenca_contexto_agente_v1(uuid,date,text,integer)','execute'),
      'contexto_mila',has_function_privilege('mila_acesso_restrito','public.get_presenca_contexto_agente_v1(uuid,date,text,integer)','execute'),
      'lia_raw',has_table_privilege('lia_acesso_restrito','public.aluno_presenca','select'),
      'semana_anon',has_function_privilege('anon','public.get_agenda_semana_v2(date,uuid)','execute'),
      'semana_auth',has_function_privilege('authenticated','public.get_agenda_semana_v2(date,uuid)','execute'),
      'internal_auth',has_function_privilege('authenticated','public.fn_presenca_dados_frescos_interno_v1(uuid,date)','execute'),
      'metadata_v2',position('presenca-v2' in pg_get_functiondef('public.fn_enfileirar_relatorio_presenca(date,boolean)'::regprocedure))>0
    );`));
    assert.deepEqual(acl,{
      anon:false,auth:true,service:true,
      contexto_anon:false,contexto_auth:false,contexto_service:true,
      contexto_sol:true,contexto_lia:true,contexto_mila:true,lia_raw:false,
      semana_anon:false,semana_auth:true,internal_auth:false,metadata_v2:true,
    });

    const liaRestrita = psql(container, `
      set session authorization lia_acesso_restrito;
      select public.get_presenca_contexto_agente_v1('${U_A}','2026-08-25','lia')->>'estado_publicacao';
      do $lia$
      begin
        begin
          perform public.get_presenca_contexto_agente_v1('${U_A}','2026-08-25','sol');
          raise exception 'Lia conseguiu trocar de finalidade';
        exception when insufficient_privilege then null;
        end;
      end;
      $lia$;
    `);
    assert.match(liaRestrita, /publicavel/u);

    const autorizado = psql(container, `
      set session authorization authenticated;
      select set_config('request.jwt.claim.role','authenticated',false);
      select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false);
      select public.fn_presenca_pendencias_do_dia_v2('${U_A}','2026-08-25')->>'dados_status';
      select public.fn_texto_relatorio_presenca('${U_A}','2026-08-25');
      do $auth$
      begin
        begin
          perform public.fn_presenca_pendencias_do_dia_v2('${U_B}','2026-08-25');
          raise exception 'unidade cruzada nao foi bloqueada';
        exception when insufficient_privilege then
          null;
        end;
        begin
          perform public.fn_texto_relatorio_presenca('${U_B}','2026-08-25');
          raise exception 'texto da Sol vazou unidade cruzada';
        exception when insufficient_privilege then
          null;
        end;
      end;
      $auth$;
    `);
    assert.match(autorizado, /atualizados/u);

    psql(container, `
      create or replace function public.usuario_tem_permissao(integer,text,uuid)
      returns boolean language sql stable security definer as $$ select false $$;
    `);
    const somenteLeitura = psql(container, `
      set session authorization authenticated;
      select set_config('request.jwt.claim.role','authenticated',false);
      select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false);
      select public.fn_presenca_pendencias_do_dia_v2('${U_A}','2026-08-25')->>'dados_status';
    `);
    assert.match(somenteLeitura, /atualizados/u);

    psql(container, `
      create or replace function public.is_admin()
      returns boolean language sql stable security definer as $$ select true $$;
    `);
    const admin = psql(container, `
      set session authorization authenticated;
      select set_config('request.jwt.claim.role','authenticated',false);
      select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false);
      select public.fn_presenca_pendencias_do_dia_v2('${U_B}','2026-08-25')->>'dados_status';
    `);
    assert.match(admin, /roster_em_revisao/u);
  } finally {
    spawnSync('docker',['rm','-f',container],{encoding:'utf8'});
  }
});
