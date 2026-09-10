import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20260910001614_kpis_admin_bandas_por_matricula_distinta.sql', import.meta.url), 'utf8');
const original = readFileSync(new URL('../supabase/migrations/20260731163353_relatorio_admin_canonico_multicurso_trancamentos.sql', import.meta.url), 'utf8');
const start = original.indexOf('create or replace function public.get_kpis_alunos_admin_operacional_impl_v2(');
const end = original.indexOf('\n$function$;', start) + '\n$function$;'.length;
const baseline = original.slice(start, end);
const A = '00000000-0000-0000-0000-000000000001';
const B = '00000000-0000-0000-0000-000000000002';
const docker = (args, input) => spawnSync(process.env.DOCKER_BIN || 'docker', args, {
  input, encoding: 'utf8', timeout: 120000, maxBuffer: 10 * 1024 * 1024,
});

test('bandas contam matrículas distintas sem multiplicar pessoas ou renovação', { timeout: 180000 }, () => {
  // Não pular silenciosamente: este teste é a prova PostgreSQL da correção.
  const ready = docker(['version']);
  assert.equal(ready.status, 0, ready.error?.message || ready.stderr);
  const container = `la-bandas-fixture-${process.pid}-${Date.now()}`;
  const run = docker(['run', '--rm', '--name', container, '-e', 'POSTGRES_PASSWORD=postgres', '-d', 'postgres:17-alpine']);
  assert.equal(run.status, 0, run.stderr);
  const sql = (query) => {
    const r = docker(['exec', '-i', container, 'psql', '-h', '127.0.0.1', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-Atq'], query);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    return r.stdout.trim();
  };
  const kpi = (unit = A) => JSON.parse(sql(`select public.get_kpis_alunos_admin_operacional_impl_v2(${unit ? "'" + unit + "'::uuid" : 'null'},2026,9);`));
  try {
    let started = false;
    for (let n = 0; n < 60; n++) {
      if (docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']).status === 0) { started = true; break; }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
    assert.ok(started, 'PostgreSQL de teste deve iniciar');
    sql(`
      create table public.unidades(id uuid primary key,nome text,ativo boolean);
      create table public.cursos(id integer primary key,nome text,is_projeto_banda boolean);
      create table public.tipos_matricula(id integer primary key,codigo text,conta_como_pagante boolean,entra_ticket_medio boolean);
      create table public.alunos(id integer primary key,unidade_id uuid,nome text,idade_atual integer,
        data_matricula date,data_saida date,emusys_matricula_id text,emusys_student_id text,valor_parcela numeric,
        is_segundo_curso boolean,curso_id integer,tipo_matricula_id integer,arquivado_em timestamptz);
      create table public.estado_fixture(aluno_id integer,unidade_id uuid,entra_base_ativa boolean,
        eh_trancamento_atual boolean default false,trancamento_data_inicial date,trancamento_data_final date);
      create view public.vw_alunos_estado_operacional_v131 as select * from public.estado_fixture;
      create table public.emusys_matriculas_estado_atual(unidade_id uuid,emusys_matricula_id bigint,emusys_aluno_id bigint,
        aluno_id integer,status_emusys text,status_local_resolvido text,sincronizado_em timestamptz,
        primary key(unidade_id,emusys_matricula_id));
      create table public.aluno_jornada_matricula_disciplina(unidade_id uuid,emusys_matricula_id bigint,
        emusys_matricula_disciplina_id bigint,emusys_aluno_id bigint,aluno_id integer,ultima_sincronizacao_emusys timestamptz);
      insert into unidades values ('${A}','A',true),('${B}','B',true);
      insert into cursos values (1,'Guitarra',false),(2,'Canto',false),(3,'Garage Band',true);
      insert into tipos_matricula values (1,'REGULAR',true,true),(2,'BANDA',false,false);
      insert into alunos values
        (1,'${A}','Pessoa homonima',15,'2026-08-01',null,'101','7',400,false,1,1,null),
        (2,'${A}','Pessoa homonima',15,'2026-08-01',null,'102','7',200,true,2,1,null),
        (3,'${A}','Pessoa homonima',15,'2026-08-01',null,'202','7',0,false,3,2,null),
        (4,'${B}','Pessoa homonima',15,'2026-08-01',null,'201','7',0,false,3,2,null);
      insert into estado_fixture(aluno_id,unidade_id,entra_base_ativa) select id,unidade_id,true from alunos;
      insert into emusys_matriculas_estado_atual values
        ('${A}',101,7,1,'ativa','ativo',now()),('${A}',102,7,2,'ativa','ativo',now()),
        ('${A}',201,7,3,'ativa','ativo',now()),('${A}',202,7,3,'ativa','ativo',now()),
        ('${B}',201,7,4,'ativa','ativo',now());
      insert into aluno_jornada_matricula_disciplina values
        ('${A}',201,301,7,3,now()),('${A}',201,302,7,3,now()),('${A}',202,303,7,3,now());
      ${baseline}
      revoke all on function public.get_kpis_alunos_admin_operacional_impl_v2(uuid,integer,integer) from public;
    `);
    const before = kpi();
    assert.equal(before.totais.matriculas_banda, 1, 'baseline reproduz perda da segunda banda');
    assert.equal(before.totais.matriculas_ativas, 3);
    const aclBefore = sql("select proacl::text from pg_proc where oid='public.get_kpis_alunos_admin_operacional_impl_v2(uuid,integer,integer)'::regprocedure");
    sql(migration);
    let after = kpi();
    assert.equal(after.totais.matriculas_banda, 2, 'duas bandas ativas devem contar duas matriculas');
    assert.equal(after.totais.matriculas_ativas, 4);
    for (const key of Object.keys(before.totais).filter(k => !['matriculas_banda','matriculas_ativas'].includes(k))) {
      assert.deepEqual(after.totais[key], before.totais[key], `preservar ${key}`);
    }
    assert.equal(after.totais.alunos_ativos, 1);
    assert.equal(after.totais.alunos_pagantes, 1);
    assert.equal(after.totais.matriculas_2_curso, 1);
    assert.equal(kpi(B).totais.matriculas_banda, 1, 'mesmo ID em outra unidade nao colide');
    assert.equal(kpi(null).totais.matriculas_banda, 3);
    assert.equal(aclBefore, sql("select proacl::text from pg_proc where oid='public.get_kpis_alunos_admin_operacional_impl_v2(uuid,integer,integer)'::regprocedure"));
    sql(migration);
    assert.deepEqual(kpi(), after, 'migration idempotente');

    sql(`update emusys_matriculas_estado_atual set status_emusys='inativa',status_local_resolvido='inativo' where unidade_id='${A}' and emusys_matricula_id=202;
      update estado_fixture set entra_base_ativa=false where aluno_id=3;`);
    assert.equal(kpi().totais.matriculas_banda, 1, 'encerrar a matricula projetada nao esconde outra banda ativa');
    sql(`update emusys_matriculas_estado_atual set status_emusys='trancada',status_local_resolvido='trancado' where unidade_id='${A}' and emusys_matricula_id=201;`);
    assert.equal(kpi().totais.matriculas_banda, 0, 'trancada e inativa nao contam');
    sql(`update emusys_matriculas_estado_atual set status_emusys='ativa',status_local_resolvido='ativo' where unidade_id='${A}' and emusys_matricula_id=202;
      update estado_fixture set entra_base_ativa=true where aluno_id=3;
      insert into alunos select 5,unidade_id,'Pessoa local',idade_atual,data_matricula,null,null,null,0,false,3,2,null from alunos where id=3;
      insert into estado_fixture(aluno_id,unidade_id,entra_base_ativa) values(5,'${A}',true);`);
    assert.equal(kpi().totais.matriculas_banda, 2, 'banda local ainda sem sync preservada');
    sql(`insert into alunos select 6,unidade_id,nome,idade_atual,data_matricula,data_saida,emusys_matricula_id,emusys_student_id,valor_parcela,is_segundo_curso,curso_id,tipo_matricula_id,null from alunos where id=3;
      insert into estado_fixture(aluno_id,unidade_id,entra_base_ativa) values(6,'${A}',true);`);
    assert.equal(kpi().totais.matriculas_banda, 2, 'mesma matricula em duas linhas locais conta uma vez');
    sql("update alunos set arquivado_em=now() where id in(3,6)");
    assert.equal(kpi().totais.matriculas_banda, 1, 'vinculo arquivado nao retorna ao total');
    assert.equal(sql('select count(*) from alunos'), '6', 'migration nao duplica cadastros');
  } finally {
    const removed = docker(['rm', '-f', container]);
    assert.equal(removed.status, 0, removed.stderr);
  }
});
