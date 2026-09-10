import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

const migrations = new URL('../supabase/migrations/', import.meta.url);
const materializer = 'materializar_health_score_professor_v3_escopo_diario';
const executor = 'executar_health_score_professor_v3_escopo_diario';
const signature = 'public.' + materializer + '(date,text,text,uuid)';
const unit = '10000000-0000-0000-0000-000000000001';
const config = '20000000-0000-0000-0000-000000000001';
const current = "date_trunc('month',current_date)::date";
const tx = "begin isolation level repeatable read; set local statement_timeout='20s'; ";
const windowsDocker = join(process.env.LOCALAPPDATA || '',
  'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe');
const dockerExecutable = process.platform === 'win32' && existsSync(windowsDocker)
  ? windowsDocker : 'docker';

function docker(args, input) {
  return spawnSync(dockerExecutable, args, {
    input, encoding: 'utf8', timeout: 30_000, maxBuffer: 16 * 1024 * 1024,
  });
}
function psql(container, query) {
  // JIT compilation is irrelevant to this tiny correctness fixture, not a
  // production latency benchmark. Avoid compiling each short-lived connection.
  return docker(['exec','-i',container,'psql','--no-psqlrc','-v','ON_ERROR_STOP=1',
    '-v','VERBOSITY=verbose','-U','postgres','-d','postgres','-qAt'], 'set jit=off;\n'+query);
}
function sql(container, query) {
  const r = psql(container, query);
  assert.equal(r.status, 0, r.error?.message || r.stderr || r.stdout);
  return r.stdout.trim();
}
function json(container, query) {
  return JSON.parse(sql(container, query).split(/\r?\n/u).filter(Boolean).at(-1));
}
function error(container, query, code, pattern) {
  const r = psql(container, query);
  assert.notEqual(r.status, 0, 'SQL deveria falhar');
  assert.match(r.stderr, new RegExp('ERROR:\\s+' + code + ':'));
  assert.match(r.stderr, pattern);
}
function migration(name) {
  return readFileSync(new URL(name, migrations), 'utf8').replace(/\r\n/gu, '\n');
}
function extractFunction(text, name) {
  const start = text.search(new RegExp(
    '^create or replace function public\\.' + name + '\\s*\\(', 'imu'));
  assert.notEqual(start, -1, 'Funcao ausente: ' + name);
  const open = /\bas\s+(\$[a-zA-Z_0-9]*\$)/iu.exec(text.slice(start));
  assert.ok(open);
  const end = text.indexOf(open[1] + ';', start + open.index + open[0].length);
  assert.notEqual(end, -1);
  return text.slice(start, end + open[1].length + 1);
}
function extractDo(text, tag) {
  const token = '$' + tag + '$';
  const start = text.indexOf('do ' + token);
  assert.notEqual(start, -1, 'Bloco DDL ausente: ' + tag);
  const end = text.indexOf(token + ';', start + 3 + token.length);
  assert.notEqual(end, -1);
  return text.slice(start, end + token.length + 1);
}
function correction() {
  const names = readdirSync(migrations).filter((name) =>
    /^\d{14}_health_score_v3_diario_estado_persistencia\.sql$/u.test(name));
  assert.equal(names.length, 1, 'Esperada nova migration de estado persistivel');
  return migration(names[0]);
}
function call(name = materializer, period = 'mensal', scope = 'unidade') {
  return 'public.' + name + '(' + current + ",'" + period + "','" + scope + "'," +
    (scope === 'unidade' ? "'" + unit + "'::uuid" : 'null::uuid') + ')';
}

const fixture = `
  create schema auth;
  create role anon;
  create role authenticated;
  create role service_role;
  create function auth.role() returns text language sql stable as $$ select 'service_role'::text $$;
  create table public.unidades(id uuid primary key,ativo boolean not null);
  create table public.professores(id integer primary key,ativo boolean not null);
  create table public.professores_unidades(
    professor_id integer,unidade_id uuid,emusys_ativo boolean,validacao_status text
  );
  create table public.health_score_professor_v3_config_versoes(
    id uuid primary key,versao integer,status text,vigencia_inicio date,vigencia_fim date
  );
  create table public.health_score_professor_v3_config_metricas(config_id uuid,metrica text);
  insert into public.unidades values('${unit}',true);
  insert into public.professores values(1,true),(2,true),(3,true);
  insert into public.professores_unidades select id,'${unit}',true,'validado' from public.professores;
  insert into public.health_score_professor_v3_config_versoes
    values('${config}',4,'ativa','2020-01-01',null);
  insert into public.health_score_professor_v3_config_metricas
    select '${config}',m from unnest(array[
      'retencao','permanencia','conversao','media_turma','numero_alunos','presenca']) m;
  create table public.health_score_professor_v3_snapshots(
    id uuid primary key default gen_random_uuid(),professor_id integer not null,
    escopo text not null,unidade_id uuid,competencia date not null,trimestre_inicio date not null,
    revisao integer not null check(revisao>0),estado text not null,
    config_id uuid not null,config_versao integer not null,
    score numeric(6,2) check(score is null or score between 0 and 100),
    cobertura numeric(5,2) not null check(cobertura between 0 and 100),
    classificacao text check(classificacao in ('saudavel','atencao','critico','sem_base')),
    publicavel boolean not null,publicado boolean not null,motivo_bloqueio text,
    regra_versao text not null,criado_por integer,criado_em timestamptz default now(),
    periodicidade text not null,periodo_inicio date not null,periodo_fim date not null,
    ciclo_codigo text,estado_publicacao text not null,score_exibivel boolean not null,
    ranking_habilitado boolean not null,invalidado_em timestamptz,
    constraint health_score_professor_v3_snapshots_estado_check
      check(estado in ('provisorio','em_maturacao','fechado','invalidado')),
    constraint health_score_professor_v3_snapshot_estado_publicacao_chk
      check(estado_publicacao in ('parcial','oficial','sem_base','em_andamento','ciclo_em_acompanhamento')),
    constraint health_score_professor_v3_snapshot_competencia_chk
      check(competencia=date_trunc('month',competencia)::date
        and periodo_inicio<=competencia and periodo_fim>=competencia and periodo_fim>=periodo_inicio),
    constraint health_score_professor_v3_snapshot_escopo_chk
      check((escopo='unidade' and unidade_id is not null) or (escopo='consolidado' and unidade_id is null)),
    constraint health_score_professor_v3_snapshot_publicacao_chk check(
      case when estado='invalidado' then invalidado_em is not null and not publicavel and not ranking_habilitado
      else (not publicado or (estado='fechado' and publicavel and estado_publicacao='oficial'))
        and (not ranking_habilitado or (estado_publicacao='oficial' and publicavel and publicado)) end
    )
  );
  create unique index fixture_revisao on public.health_score_professor_v3_snapshots(
    professor_id,escopo,unidade_id,competencia,periodicidade,revisao
  ) nulls not distinct;
  create table public.health_score_professor_v3_snapshot_metricas(
    id uuid primary key default gen_random_uuid(),snapshot_id uuid not null
      references public.health_score_professor_v3_snapshots(id),
    metrica text,valor_bruto numeric,numerador numeric,denominador numeric,amostra integer,
    estado_base text,publicavel boolean,confianca text,fonte text,regra_versao text,
    motivo_sem_base text,detalhes jsonb,nota numeric,peso numeric,peso_disponivel boolean,
    contribuicao numeric,meta_aplicada numeric,peso_efetivo numeric,codigo_evidencia text,papel text,
    unique(snapshot_id,metrica)
  );
  create table public.health_score_professor_v3_materializacao_execucoes(
    id uuid primary key default gen_random_uuid(),competencia date,periodicidade text,
    escopo text,unidade_id uuid,fingerprint_fonte text,status text,
    snapshot_ids jsonb default '[]',snapshots_criados integer default 0,erro text,
    professores_incompletos jsonb default '[]',professores_configuracao_inconsistente jsonb default '[]',
    iniciado_em timestamptz default now(),finalizado_em timestamptz
  );
  create table public.fixture_capturas(id bigserial primary key,periodicidade text,unidade_id uuid);
  create type public.fixture_performance as(
    professor_id integer,unidade_id uuid,escopo text,competencia date,trimestre_inicio date,
    periodicidade text,periodo_inicio date,periodo_fim date,ciclo_codigo text,
    estado_publicacao text,score_exibivel boolean,ranking_habilitado boolean,
    config_versao integer,config_id uuid,revisao integer,score numeric,cobertura numeric,
    classificacao text,estado text,snapshot_publicavel boolean,publicado boolean,
    motivo_bloqueio text,regra_versao_snapshot text,metrica text,valor_bruto numeric,
    numerador numeric,denominador numeric,nota numeric,peso numeric,peso_disponivel boolean,
    peso_efetivo numeric,contribuicao numeric,meta numeric,amostra integer,estado_base text,
    metrica_publicavel boolean,confianca text,fonte text,regra_versao_metrica text,
    motivo_sem_base text,codigo_evidencia text,papel text,detalhes jsonb
  );
  -- ONLY the expensive performance producer is substituted. The daily executor,
  -- materializer, cycle patches and metric immutability trigger below are real SQL.
  create function public.get_health_score_professor_v3_performance(
    p_competencia date,p_unidade_id uuid,p_periodicidade text
  ) returns setof public.fixture_performance language plpgsql as $$
  begin
    insert into public.fixture_capturas(periodicidade,unidade_id) values(p_periodicidade,p_unidade_id);
    return query select (jsonb_populate_record(null::public.fixture_performance,
      jsonb_build_object(
        'professor_id',p.id,'unidade_id',p_unidade_id,
        'escopo',case when p_unidade_id is null then 'consolidado' else 'unidade' end,
        'competencia',date_trunc('month',p_competencia)::date,
        'trimestre_inicio',r.periodo_inicio,'periodicidade',p_periodicidade,
        'periodo_inicio',r.periodo_inicio,'periodo_fim',r.periodo_fim,'ciclo_codigo',r.ciclo_codigo,
        'estado_publicacao',case when p_periodicidade='ciclo' then 'ciclo_em_acompanhamento' else 'em_andamento' end,
        'score_exibivel',true,'ranking_habilitado',false,'config_versao',4,'config_id','${config}',
        'revisao',0,'score',case when p.id=2 then 12.34 else 87.25 end,
        'cobertura',case when p.id=2 then 30 else 100 end,
        'classificacao',case when p.id=2 then null else 'saudavel' end,
        'estado',case when p.id=1 then coalesce(nullif(current_setting('fixture.estado',true),''),
          'em_andamento') when p.id=2 then 'em_maturacao' else 'provisorio' end,
        'snapshot_publicavel',false,
        'publicado',coalesce(current_setting('fixture.publicado',true),'off')='on',
        'motivo_bloqueio','fixture acompanhamento','regra_versao_snapshot','fixture-regra-original'
      ) || jsonb_build_object(
        'metrica',c.metrica,'valor_bruto',66.67,'numerador',2,'denominador',3,'amostra',3,
        'nota',case when p.id=2 then null else 91.25 end,'peso',15,
        'peso_disponivel',p.id<>2,'peso_efetivo',case when p.id=2 then 0 else 20 end,
        'contribuicao',case when p.id=2 then null else 18.25 end,'meta',80,
        'estado_base',case when p.id=2 then 'sem_base_amostra' else 'ok' end,
        'metrica_publicavel',p.id<>2,'confianca','baixa','fonte','fixture-canonica',
        'regra_versao_metrica','fixture-metrica-1','motivo_sem_base','fixture amostra',
        'codigo_evidencia','fixture-observada','papel',case when c.metrica='numero_alunos' then 'diagnostico' else 'nota' end,
        'detalhes',jsonb_build_object('preservar','integral','presentes_observados',2,
          'denominador_observado',3,'ocorrencias_fora_calculo',0,'periodicidade',p_periodicidade)
      )
    )).* from public.professores p
      cross join public.health_score_professor_v3_config_metricas c
      cross join public.fn_health_score_v3_periodo(p_competencia,p_periodicidade) r
    where not(coalesce(current_setting('fixture.incompleto',true),'off')='on'
      and p.id=3 and c.metrica='retencao');
  end $$;
  create function public.fixture_snapshot_imutavel() returns trigger language plpgsql as $$
  begin raise exception 'FIXTURE_SNAPSHOT_IMUTAVEL'; end $$;
  create trigger fixture_snapshot_imutavel before update or delete
    on public.health_score_professor_v3_snapshots for each row
    execute function public.fixture_snapshot_imutavel();
`;

function reset(container) {
  sql(container, `truncate public.health_score_professor_v3_snapshot_metricas,
    public.health_score_professor_v3_snapshots,public.health_score_professor_v3_materializacao_execucoes,
    public.fixture_capturas restart identity;`);
}
function capture(container) {
  return sql(container, `select jsonb_build_object(
    'snapshots',(select jsonb_agg(to_jsonb(s) order by id) from public.health_score_professor_v3_snapshots s),
    'metricas',(select jsonb_agg(to_jsonb(m) order by id) from public.health_score_professor_v3_snapshot_metricas m)
  );`);
}
function assertStored(container, period, scope) {
  assert.equal(sql(container, `select count(*) from public.health_score_professor_v3_snapshots
    where estado=case when professor_id=2 then 'em_maturacao' else 'provisorio' end
      and estado_publicacao='${period==='ciclo'?'ciclo_em_acompanhamento':'em_andamento'}'
      and periodicidade='${period}' and escopo='${scope}'
      and competencia=${current} and not publicavel and not publicado and not ranking_habilitado
      and score_exibivel and config_id='${config}' and config_versao=4
      and score=case when professor_id=2 then 12.34 else 87.25 end
      and cobertura=case when professor_id=2 then 30 else 100 end
      and classificacao is not distinct from case when professor_id=2 then null else 'saudavel' end
      and regra_versao='fixture-regra-original';`), '3');
  assert.equal(sql(container, `select count(*) from public.health_score_professor_v3_snapshot_metricas m
    join public.health_score_professor_v3_snapshots s on s.id=m.snapshot_id
    where m.valor_bruto=66.67 and m.numerador=2 and m.denominador=3 and m.amostra=3
      and m.nota is not distinct from case when s.professor_id=2 then null::numeric else 91.25 end
      and m.peso=15 and m.peso_disponivel=(s.professor_id<>2)
      and m.peso_efetivo=case when s.professor_id=2 then 0 else 20 end
      and m.contribuicao is not distinct from case when s.professor_id=2 then null::numeric else 18.25 end
      and m.meta_aplicada=80 and m.publicavel=(s.professor_id<>2)
      and m.fonte='fixture-canonica' and m.regra_versao='fixture-metrica-1'
      and m.confianca='baixa' and m.codigo_evidencia='fixture-observada'
      and m.motivo_sem_base='fixture amostra'
      and m.papel=case when m.metrica='numero_alunos' then 'diagnostico' else 'nota' end
      and m.detalhes=jsonb_build_object('preservar','integral','presentes_observados',2,
        'denominador_observado',3,'ocorrencias_fora_calculo',0,'periodicidade','${period}');`), '18');
}

test('adapter estado diario: materializador/executor reais + CHECK/trigger em PostgreSQL',
  { timeout: 120_000 }, async (t) => {
    if (docker(['info']).status !== 0) { t.skip('Docker indisponivel'); return; }
    const container = 'la-hs-diario-estado-' + process.pid + '-' + Date.now();
    const started = docker(['run','--detach','--rm','--name',container,
      '--env','POSTGRES_PASSWORD=postgres','postgres:17-alpine']);
    assert.equal(started.status, 0, started.error?.message || started.stderr || started.stdout);
    try {
      let ready=0;
      for(let i=0;i<60;i+=1) {
        ready=psql(container,'select 1;').status===0?ready+1:0;
        if(ready===3) break;
        await delay(500);
      }
      assert.equal(ready,3);
      sql(container, extractFunction(migration('20260719120000_health_score_v3_ciclos_publicacao_parcial.sql'),
        'fn_health_score_v3_periodo'));
      sql(container, fixture);
      const base = migration('20260813151923_health_score_v3_materializacao_resiliente.sql');
      sql(container, extractFunction(base,materializer) + extractFunction(base,executor));
      const cycle = migration('20260908230249_professores_ciclo_vivo_matriculador_canonico.sql');
      const presence = migration('20260909000911_professores_ciclo_presenca_referencia_top10.sql');
      // Only the identified function-DDL blocks; no cron/backfill from old migrations.
      sql(container, extractDo(cycle,'patch_materializador') + extractDo(cycle,'patch_executor'));
      sql(container, extractFunction(presence,'get_health_score_professor_v3_presenca_ciclo_acompanhamento_v1') +
        extractDo(presence,'patch_materializador') + extractDo(presence,'patch_executor'));
      sql(container, extractFunction(migration('20260903130000_health_score_v3_gate_roster_sem_base.sql'),
        'fn_health_score_professor_v3_bloquear_metrica_fechada') + `
        create trigger fixture_metrica_imutavel before insert or update or delete
          on public.health_score_professor_v3_snapshot_metricas for each row execute function
          public.fn_health_score_professor_v3_bloquear_metrica_fechada();
        revoke all on function ${signature} from public,anon,authenticated,service_role;
        revoke all on function public.${executor}(date,text,text,uuid)
          from public,anon,authenticated,service_role;
      `);
      const beforeDef = sql(container, "select pg_get_functiondef('" + signature + "'::regprocedure);");
      const securitySql = `select jsonb_build_object('acl',proacl,'owner',proowner,
        'definer',prosecdef,'volatile',provolatile,'config',proconfig)
        from pg_proc where oid='${signature}'::regprocedure;`;
      const beforeAcl = sql(container,securitySql);
      const constraintsSql = `select jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid))
        order by conname) from pg_constraint
        where conrelid='public.health_score_professor_v3_snapshots'::regclass;`;
      const beforeConstraints = sql(container,constraintsSql);

      for(const period of ['mensal','ciclo']) {
        await t.test('controle antigo '+period+': estado em_andamento viola CHECK real', () => {
          reset(container);
          error(container,tx+'select '+call(materializer,period)+';',
            '23514',/health_score_professor_v3_snapshots_estado_check/u);
          assert.equal(sql(container,'select count(*) from public.health_score_professor_v3_snapshots;'),'0');
          const r=json(container,tx+'select '+call(executor,period)+'; rollback;');
          assert.equal(r.status,'erro');
          assert.match(r.erro,/health_score_professor_v3_snapshots_estado_check/u);
        });
      }

      const fix = correction(); // RED only AFTER real old behavior was reproduced.
      sql(container,fix);
      await t.test('migration altera apenas adapter e preserva CHECK, ACL, owner e search_path', () => {
        assert.equal(sql(container,securitySql),beforeAcl);
        assert.equal(sql(container,constraintsSql),beforeConstraints);
        const after=sql(container,"select pg_get_functiondef('"+signature+"'::regprocedure);");
        assert.notEqual(after,beforeDef);
        assert.match(after,/v_linha\.estado_publicacao/u);
        assert.match(after,/presenca_ciclo_em_acompanhamento/u);
        sql(container,fix);
        assert.equal(sql(container,"select pg_get_functiondef('"+signature+"'::regprocedure);"),after);
        for(const role of ['anon','authenticated','service_role']) {
          error(container,tx+'set local role '+role+'; select '+call()+';',
            '42501',/permission denied/u);
        }
      });

      for(const period of ['mensal','ciclo']) for(const scope of ['unidade','consolidado']) {
        await t.test('direto '+period+'/'+scope+': estados persistiveis, 18 metricas e flags intactos', () => {
          reset(container);
          const r=json(container,tx+'select '+call(materializer,period,scope)+'; commit;');
          assert.equal(r.snapshots_criados,3);
          assert.equal(r.snapshot_ids.length,3);
          assert.deepEqual(r.professores_incompletos,[]);
          assertStored(container,period,scope);
        });
        await t.test('executor preparado '+period+'/'+scope+': materializado com uma captura', () => {
          reset(container);
          const r=json(container,tx+'select '+call(executor,period,scope)+'; commit;');
          assert.equal(r.status,'materializado');
          assert.equal(r.snapshots_criados,3);
          assert.equal(sql(container,'select count(*) from public.fixture_capturas;'),'1');
          assertStored(container,period,scope);
        });
      }

      await t.test('ciclo_em_acompanhamento tambem e estado aberto, nunca fechado', () => {
        reset(container);
        json(container,tx+"set local fixture.estado='ciclo_em_acompanhamento'; select "+
          call(materializer,'ciclo')+'; commit;');
        assertStored(container,'ciclo','unidade');
      });

      await t.test('estado desconhecido continua falhando; nao alarga CHECK nem mascara erro', () => {
        reset(container);
        error(container,tx+"set local fixture.estado='estado_inventado'; select "+call()+';',
          '23514',/health_score_professor_v3_snapshots_estado_check/u);
        assert.equal(sql(container,'select count(*) from public.health_score_professor_v3_snapshots;'),'0');
      });
      await t.test('adapter nao promove publicacao de snapshot aberto', () => {
        reset(container);
        error(container,tx+"set local fixture.publicado='on'; select "+call()+';',
          '23514',/health_score_professor_v3_snapshot_publicacao_chk/u);
      });
      await t.test('completude continua parcial quando fonte omite uma metrica', () => {
        reset(container);
        const r=json(container,tx+"set local fixture.incompleto='on'; select "+call(executor)+'; commit;');
        assert.equal(r.status,'parcial');
        assert.equal(r.snapshots_criados,2);
        assert.deepEqual(r.professores_incompletos,[{professor_id:3,metricas_ausentes:['retencao']}]);
      });
      await t.test('novas revisoes nao alteram retratos nem metricas anteriores', () => {
        reset(container);
        const first=json(container,tx+'select '+call()+'; commit;');
        const before=capture(container);
        json(container,tx+'select '+call()+'; commit;');
        assert.equal(sql(container,'select count(*) from public.health_score_professor_v3_snapshots where revisao=2;'),'3');
        const ids=first.snapshot_ids.map((id)=>"'"+id+"'").join(',');
        assert.equal(sql(container,`select jsonb_build_object(
          'snapshots',(select jsonb_agg(to_jsonb(s) order by id) from public.health_score_professor_v3_snapshots s
            where id in(${ids})),
          'metricas',(select jsonb_agg(to_jsonb(m) order by id) from public.health_score_professor_v3_snapshot_metricas m
            where snapshot_id in(${ids}))); `),before);
      });
      await t.test('guarda da migration recusa definicao inesperada sem sobrescrever funcao', () => {
        reset(container);
        const body=extractFunction(base,materializer).replace(
          'v_linha.estado, v_linha.config_id, v_linha.config_versao,',
          'v_linha.estado::text, v_linha.config_id, v_linha.config_versao,');
        sql(container,body);
        const unexpected=sql(container,"select pg_get_functiondef('"+signature+"'::regprocedure);");
        error(container,fix,'P0001',/ESTADO_PERSISTENCIA.*INESPERAD/u);
        assert.equal(sql(container,"select pg_get_functiondef('"+signature+"'::regprocedure);"),unexpected);
      });
    } finally {
      const stopped=docker(['stop',container]);
      assert.equal(stopped.status,0,stopped.stderr||stopped.stdout);
    }
  });
