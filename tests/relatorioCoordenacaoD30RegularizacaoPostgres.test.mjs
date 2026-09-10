import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { gerarRelatorioCoordenacaoCanonico } from '../src/lib/relatorioCoordenacaoCanonico.ts';

// Disposable, networkless PostgreSQL only. No project env, remote DB, or API.
// Clock seam substitutes CURRENT_DATE in loaded SQL, including pg_get_functiondef
// anchors. Approved artifact hashes are bound to the synthetic fixture payloads;
// document identity selection, readers, gates and triggers remain real SQL.
const dir = new URL('../supabase/migrations/', import.meta.url);
const read = (name) => readFileSync(new URL(name, dir), 'utf8').replace(/\r\n/gu, '\n');
const names = readdirSync(dir).filter(n => /^\d{14}_coordenacao_d30_regularizacao_governanca\.sql$/u.test(n));
assert.equal(names.length, 1);
const patch = read(names[0]);
const core = read('20260909142301_coordenacao_confiabilidade_total.sql');
const schema = read('20260717170000_health_score_v3_config_snapshots.sql');
const cycle = read('20260719120000_health_score_v3_ciclos_publicacao_parcial.sql');
const docs = read('20260630183500_p09c_fechamento_snapshots_tabelas.sql');
const finality = read('20260909054818_relatorio_coordenacao_finalidade_v4.sql');
function fn(sql, name) {
  const start = sql.search(new RegExp('create\\s+or\\s+replace\\s+function\\s+public\\.' + name + '\\s*\\(', 'iu'));
  assert.notEqual(start, -1, name);
  const open = /\bas\s+(\$[\w]*\$)/iu.exec(sql.slice(start));
  assert.ok(open, name);
  const end = sql.indexOf(open[1] + ';', start + open.index + open[0].length);
  assert.notEqual(end, -1, name);
  return sql.slice(start, end + open[1].length + 1);
}
function table(sql, name) {
  const start = sql.toLowerCase().indexOf('create table if not exists public.' + name + ' (');
  assert.notEqual(start, -1, name);
  return sql.slice(start, sql.indexOf('\n);', start) + 3);
}
const clock = sql => sql.replace(/\bcurrent_date\b/giu, 'public.fixture_today()');
const q = s => "'" + s.replace(/'/gu, "''") + "'";
const j = value => q(JSON.stringify(value)) + '::jsonb';
const win = join(process.env.LOCALAPPDATA || '', 'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe');
const exe = process.platform === 'win32' && existsSync(win) ? win : 'docker';
const docker = (args, input) => spawnSync(exe, args, { input, encoding: 'utf8', timeout: 30_000, maxBuffer: 16 * 1024 * 1024 });
const scopes = [
  { unit: null, total: 44, count: 43, version: 12, doc: '8d7c1ae8-8596-4fce-9012-86714c617070' },
  { unit: '2ec861f6-023f-4d7b-9927-3960ad8c2a92', total: 32, count: 31, version: 12, doc: 'e9e740d2-3ace-4fc8-ae1c-0210f8d3d0f5' },
  { unit: '368d47f5-2d88-4475-bc14-ba084a9a348e', total: 20, count: 19, offset: 12, version: 10, doc: '655d8f97-eb9b-4c10-bb8c-c7f2414554a3' },
  { unit: '95553e96-971b-4590-a6eb-0201d013c14d', total: 24, count: 24, offset: 20, version: 10, doc: 'c2e67faa-951d-40c5-bbd1-7e42f31327c8' },
];
const frozenHashes = [
  'fe85fc8292ddc6e7858d2a89728c467df5e6a0a5bf8c440a18815421b884e29a',
  'ab02a94d2030c07d0f74d6adc99585ccd688a1ba38080c8f623284b3fdcf13b4',
  'b5bd0081f390287bb59bd697e1b84031bf5eb5d0d429f4e99932b0f851a2363a',
  '108d507a5a5466c2cde83f7a4843244045c3cae80da422c8bdf525236087f3c1',
];
const unit = v => v === null ? 'null::uuid' : q(v) + '::uuid';
const repair = "select public.regularizar_coordenacao_jun_ago_2026_d30('Decisao explicita: preservar D+30');";
const fixture = `
create role anon; create role authenticated; create role service_role;
create schema auth; create schema extensions;
create extension pgcrypto with schema extensions;
create table public.fixture_clock(d date not null, instante timestamptz);
insert into public.fixture_clock(d) values ('2026-09-09');
create function public.fixture_today() returns date language sql stable as $$select coalesce(instante::date,d) from public.fixture_clock$$;
create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
create table public.usuarios(id int primary key, auth_user_id uuid, ativo bool);
create table public.unidades(id uuid primary key, ativo bool default true);
create table public.professores(id int primary key, ativo bool default true, mesclado_em_professor_id int);
create table public.professores_unidades(professor_id int, unidade_id uuid, emusys_ativo bool, validacao_status text);
create table public.health_score_professor_v3_config_versoes(
 id uuid primary key, versao int, status text, cobertura_minima numeric, pilares_minimos int,
 exige_pilar_fidelizacao bool, faixa_atencao_min numeric, faixa_saudavel_min numeric);
create table public.health_score_professor_v3_config_metricas(config_id uuid, metrica text, parametros jsonb);
${table(schema, 'health_score_professor_v3_snapshots')}
${table(schema, 'health_score_professor_v3_snapshot_metricas')}
${table(cycle, 'health_score_professor_v3_ciclos')}
${table(docs, 'fechamento_mensal_snapshots').replace("'relatorio_coordenacao',", "'relatorio_coordenacao', 'relatorio_coordenacao_ciclo',")}
alter table public.health_score_professor_v3_snapshots
 add periodicidade text not null default 'ciclo', add periodo_inicio date not null default '2026-06-01',
 add periodo_fim date not null default '2026-08-31', add ciclo_codigo text not null default '2026-JUN-AGO',
 add estado_publicacao text not null default 'oficial', add score_exibivel bool not null default true,
 add ranking_habilitado bool not null default true,
 drop constraint health_score_professor_v3_snapshot_competencia_chk;
alter table public.health_score_professor_v3_snapshot_metricas
 add peso_efetivo numeric, add codigo_evidencia text, add papel text;
${core.slice(core.indexOf('alter table public.health_score_professor_v3_snapshots'), core.indexOf(';', core.indexOf('alter table public.health_score_professor_v3_snapshots')) + 1)}
create unique index fixture_snapshot_revision on public.health_score_professor_v3_snapshots
 (professor_id,unidade_id,competencia,periodicidade,revisao) nulls not distinct;
create unique index fixture_snapshot_closed on public.health_score_professor_v3_snapshots
 (professor_id,unidade_id,competencia,periodicidade) nulls not distinct where estado='fechado';
create unique index fixture_document_revision on public.fechamento_mensal_snapshots
 (ano,mes,escopo,unidade_id,dominio,versao) nulls not distinct;
${fn(docs, 'hash_jsonb_canonico')}
${fn(schema, 'fn_health_score_professor_v3_ator_gerenciador')}
create function public.fn_health_score_professor_v3_ator_leitura(uuid) returns void language sql as $$select$$;
-- Only a config fingerprint boundary is stubbed, not comparability or readers.
create function public.fn_health_score_professor_v3_config_fingerprint_comparabilidade(uuid)
 returns text language sql stable as $$select 'fixture-config-preserved'::text$$;
${fn(read('20260813270200_health_score_v3_comparabilidade_configuravel.sql'), 'avaliar_health_score_professor_v3_comparabilidade')}
${fn(read('20260804003729_health_score_v3_cobertura_pilares_canonica_20260804.sql'), 'calcular_health_score_professor_v3_cobertura_pilares')}
${fn(read('20260813234837_20260813232430_health_score_v3_presenca_canonica_aplicabilidade.sql'), 'get_health_score_professor_v3_performance_snapshot_v1')
  .replace('order by s.revisao desc, s.criado_em desc, s.id desc', 'order by s.competencia desc, s.revisao desc, s.criado_em desc, s.id desc')}
${fn(core, 'fechar_health_score_professor_v3_ciclo')}
${fn(read('20260813270100_health_score_v3_leitor_papel_canonico.sql'), 'get_health_score_professor_v3_performance_snapshot_v3')
  .replace('public.get_health_score_professor_v3_performance_snapshot_v3(', 'public.get_hs_prof_v3_snapshot_before_evid_corrente_20260909(')}
${fn(read('20260909085007_professores_ciclo_evidencia_corrente.sql'), 'get_health_score_professor_v3_performance_snapshot_v3')}
${fn(core, 'retificar_coordenacao_jun_ago_2026')}
revoke all on function public.retificar_coordenacao_jun_ago_2026() from public,anon,authenticated;
grant execute on function public.retificar_coordenacao_jun_ago_2026() to service_role;
revoke all on function public.fechar_health_score_professor_v3_ciclo(text,text) from public,anon;
grant execute on function public.fechar_health_score_professor_v3_ciclo(text,text) to authenticated,service_role;
-- Throwing producers make accidental recalculation an actual PG failure.
create function public.materializar_health_score_professor_v3_periodo(date,text,uuid,integer)
 returns jsonb language plpgsql as $$begin raise exception 'FIXTURE_RECALCULO_PROIBIDO'; end$$;
create function public.materializar_rel_coord_doc_before_finalidade_20260909(uuid,int,int,text,text,text)
 returns jsonb language plpgsql as $$begin raise exception 'FIXTURE_DOCUMENTO_RECALCULO_PROIBIDO'; end$$;
${fn(finality, 'materializar_relatorio_coordenacao_documento_v4')}
${fn(finality, 'get_relatorio_coordenacao_documento_v4')}
insert into public.health_score_professor_v3_config_versoes values
 ('00000000-0000-0000-0000-000000000003',3,'ativa',60,3,true,60,80);
insert into public.health_score_professor_v3_ciclos
 (codigo,data_inicio,data_fim,label,estado,publicacao_oficial,ranking_habilitado,fechado_em)
 values ('2026-JUN-AGO','2026-06-01','2026-08-31','Jun-Ago/2026','fechado',true,true,now()),
 ('2026-SET-NOV','2026-09-01','2026-11-30','Set-Nov/2026','aberto',false,false,null);
insert into public.professores(id) select generate_series(1,44);
${scopes.filter(s => s.unit).map(s => 'insert into public.unidades(id) values (' + unit(s.unit) + ');').join('\n')}
-- All 44 consolidated professors must have an active real reader membership.
insert into public.professores_unidades
 select n, '${scopes[1].unit}',true,'validado' from generate_series(1,32) n;
${scopes.slice(2).map(s => `insert into public.professores_unidades select n+${s.offset}, ${unit(s.unit)},true,'validado' from generate_series(1,${s.total}) n;`).join('\n')}
${scopes.map(s => `
insert into public.health_score_professor_v3_snapshots
 (professor_id,escopo,unidade_id,competencia,trimestre_inicio,revisao,estado,config_id,config_versao,
  score,cobertura,classificacao,publicavel,publicado,estado_publicacao,ranking_habilitado,score_exibivel,fechado_em)
 select n+${s.offset||0},${q(s.unit ? 'unidade' : 'consolidado')},${unit(s.unit)},'2026-08-01','2026-06-01',5,
 case when n<=${s.count} then 'fechado' else 'provisorio' end,
 '00000000-0000-0000-0000-000000000003',3,
 case when n<=${s.count} then 80+n/100.0 else null end,
 case when n<=${s.count} then 100 else 0 end,
 case when n<=${s.count} then 'saudavel' else 'sem_base' end,
 n<=${s.count},n<=${s.count},
 case when n<=${s.count} then 'oficial' else 'sem_base' end,
 n<=${s.count},n<=${s.count},case when n<=${s.count} then now() end
 from generate_series(1,${s.total}) n;
`).join('\n')}
insert into public.health_score_professor_v3_snapshot_metricas
 (snapshot_id,metrica,valor_bruto,numerador,denominador,amostra,estado_base,publicavel,confianca,fonte,regra_versao,
 detalhes,nota,peso,peso_disponivel,peso_efetivo,contribuicao,meta_aplicada,codigo_evidencia,papel)
 select s.id,m,75,3,4,4,'provisorio',false,'alta','fixture-evidencia','fixture-regra',
 jsonb_build_object('apta_oficial',false,'fim_recorte','2026-08-31','sentinela',m,'pendencias',7),
 s.score,20,s.publicado,case when s.publicado then 20 else 0 end,s.score/5,90,'evidencia_preservada',
 case when m='numero_alunos' then 'diagnostico' else 'nota' end
 from public.health_score_professor_v3_snapshots s
 cross join unnest(array['retencao','permanencia','conversao','media_turma','numero_alunos','presenca']) m;
${scopes.map(s => `
insert into public.fechamento_mensal_snapshots
 (id,ano,mes,escopo,unidade_id,dominio,versao,status,fonte,payload,payload_hash)
 select ${q(s.doc)},2026,6,${q(s.unit ? 'unidade' : 'consolidado')},${unit(s.unit)},
 'relatorio_coordenacao_ciclo',${s.version},'retificado','fixture', payload || jsonb_build_object('documento',
 jsonb_build_object('id',${q(s.doc)},'versao',${s.version},'status','retificado','hash',public.hash_jsonb_canonico(payload))),
 public.hash_jsonb_canonico(payload)
 from (select jsonb_build_object(
 'schema_version',4,'periodo',jsonb_build_object('ano',2026,'mes',6,'inicio','2026-06-01','fim','2026-08-31',
 'periodicidade','ciclo','ciclo_codigo','2026-JUN-AGO','label','Jun-Ago/2026','unidade_nome','Fixture','estado_publicacao','oficial',
 'ciclo_estado','fechado','publicacao_oficial',true,'ranking_habilitado',true,'data_corte','2026-08-31'),
 'resumo_equipe',jsonb_build_object('total_professores',${s.total},'comparaveis',${s.count},'oficiais',${s.count},'parciais',0,'score_medio_visivel',80.2),
 'professores',jsonb_agg(jsonb_build_object(
 'professor_id',s.professor_id,'nome','Fixture '||s.professor_id,'score',s.score,'score_observado',s.score,
 'score_comparavel',s.score,'cobertura',s.cobertura,'config_id',s.config_id,'config_versao',3,
 'classificacao',s.classificacao,'estado_publicacao',s.estado_publicacao,
 'score_exibivel',s.score_exibivel,'ranking_habilitado',s.ranking_habilitado,
 'comparabilidade_estado',case when s.publicado then 'comparavel' else 'sem_base_operacional' end,
 'metricas',(select jsonb_object_agg(m.metrica,to_jsonb(m)-'id'-'snapshot_id') from public.health_score_professor_v3_snapshot_metricas m where m.snapshot_id=s.id),
 'operacional',jsonb_build_object('mrr',1234.5,'quantidade',3)) order by s.professor_id),
 'ranking_oficial',jsonb_agg(jsonb_build_object('professor_id',s.professor_id,'score',s.score)) filter(where s.publicado),
 'saidas_retencao',jsonb_build_object('mrr_perdido_total',123.45),'comercial',jsonb_build_object('receita',234.56),
 'presenca',jsonb_build_object('pendencias',null,'eventos_elegiveis',400),
 'experimentais',jsonb_build_object('professores_conversao_pontuando',28),
 'auditoria',jsonb_build_object('imutavel',true,'config_id','00000000-0000-0000-0000-000000000003')
 ) payload from public.health_score_professor_v3_snapshots s
 where s.unidade_id is not distinct from ${unit(s.unit)}) x;
`).join('\n')}
${fn(schema, 'fn_health_score_professor_v3_bloquear_snapshot_fechado')}
${fn(read('20260728127000_health_score_v3_disponibilidade_bloqueia_publicacao.sql'), 'fn_health_score_v3_bloquear_sem_disponibilidade')}
${fn(read('20260903130000_health_score_v3_gate_roster_sem_base.sql'), 'fn_health_score_professor_v3_bloquear_metrica_fechada')}
${fn(finality, 'proteger_relatorio_coordenacao_final_v4')}
${fn(read('20260801115829_relatorios_mensais_fechamento_canonico.sql'), 'proteger_fechamento_mensal_snapshot_imutavel_v1')}
create trigger fixture_snapshot_immutable before update or delete on public.health_score_professor_v3_snapshots
 for each row execute function public.fn_health_score_professor_v3_bloquear_snapshot_fechado();
create trigger fixture_snapshot_availability before update on public.health_score_professor_v3_snapshots
 for each row execute function public.fn_health_score_v3_bloquear_sem_disponibilidade();
create trigger fixture_metric_immutable before insert or update or delete on public.health_score_professor_v3_snapshot_metricas
 for each row execute function public.fn_health_score_professor_v3_bloquear_metrica_fechada();
create trigger fixture_doc_immutable before update or delete on public.fechamento_mensal_snapshots
 for each row execute function public.proteger_relatorio_coordenacao_final_v4();
create trigger fixture_doc_generic_immutable before update or delete on public.fechamento_mensal_snapshots
 for each row execute function public.proteger_fechamento_mensal_snapshot_imutavel_v1();
create table public.fixture_original_snapshots as select * from public.health_score_professor_v3_snapshots;
create table public.fixture_original_metrics as select * from public.health_score_professor_v3_snapshot_metricas;
create table public.fixture_original_docs as select * from public.fechamento_mensal_snapshots;
`;

test('D+30: PostgreSQL real, regularizacao append-only sem recalculo', { timeout: 180_000 }, async t => {
  assert.equal(docker(['info']).status, 0, 'Docker obrigatorio: nao aceitar fixture PG pulada');
  const name = 'la-coord-d30-' + process.pid + '-' + Date.now();
  const start = docker(['run','--detach','--rm','--name',name,'--pull=never','--network=none',
    '--env','POSTGRES_PASSWORD=postgres','postgres:17-alpine']);
  assert.equal(start.status, 0, start.stderr);
  const raw = sql => docker(['exec','-i',name,'psql','--no-psqlrc','-v','ON_ERROR_STOP=1',
    '-v','VERBOSITY=verbose','-U','postgres','-d','postgres','-qAt'], sql);
  const run = sql => {
    const r = raw(sql);
    assert.equal(r.status, 0, r.error?.message || r.stderr || r.stdout);
    return r.stdout.trim();
  };
  const json = sql => JSON.parse(run(sql));
  const error = (sql, pattern) => {
    const r = raw(sql);
    assert.notEqual(r.status, 0, 'SQL deveria falhar');
    assert.match(r.stderr, pattern);
  };
  const fingerprint = () => run(`select public.hash_jsonb_canonico(jsonb_build_object(
    's',(select jsonb_agg(to_jsonb(s) order by id) from public.health_score_professor_v3_snapshots s),
    'm',(select jsonb_agg(to_jsonb(m) order by id) from public.health_score_professor_v3_snapshot_metricas m),
    'd',(select jsonb_agg(to_jsonb(d) order by id) from public.fechamento_mensal_snapshots d),
    'c',(select jsonb_agg(to_jsonb(c) order by id) from public.health_score_professor_v3_ciclos c)));`);
  try {
    let ready = 0;
    for(let i=0;i<60;i++) {
      ready = raw('select 1;').status===0 ? ready+1 : 0;
      if(ready>=3) break;
      await new Promise(resolve=>setTimeout(resolve,300));
    }
    assert.equal(ready,3);
    run(clock(fixture));
    let fixturePatch=patch;
    for (let i=0;i<scopes.length;i++) {
      const hash=run('select payload_hash from public.fixture_original_docs where id='+q(scopes[i].doc));
      fixturePatch=fixturePatch.replaceAll(frozenHashes[i],hash);
    }
    const before = fingerprint();
    const acls = run("select jsonb_agg(jsonb_build_object('oid',oid,'acl',proacl) order by oid) from pg_proc where proname in ('fechar_health_score_professor_v3_ciclo','retificar_coordenacao_jun_ago_2026');");
    run(clock(fixturePatch));
    await t.test('DDL nao regulariza dados e preserva ACL dos dois publicadores', () => {
      assert.equal(fingerprint(),before);
      assert.equal(run("select jsonb_agg(jsonb_build_object('oid',oid,'acl',proacl) order by oid) from pg_proc where proname in ('fechar_health_score_professor_v3_ciclo','retificar_coordenacao_jun_ago_2026');"),acls);
    });
    for(const date of ['2026-09-09','2026-09-29']) {
      await t.test('ambos publicadores bloqueiam antes de D+30: '+date, () => {
        run("update public.fixture_clock set d="+q(date));
        error("select public.fechar_health_score_professor_v3_ciclo('2026-JUN-AGO','fixture');", /D30|D\+30/u);
        error('select public.retificar_coordenacao_jun_ago_2026();', /D30|D\+30/u);
        assert.equal(fingerprint(),before);
      });
    }
    const available = run("select to_regprocedure('public.regularizar_coordenacao_jun_ago_2026_d30(text)') is not null;")==='t';
    await t.test('nova funcao de regularizacao existe', () => assert.ok(available));
    if(!available) return;
    await t.test('service-only: PUBLIC anon authenticated sem EXECUTE', () => {
      for(const role of ['anon','authenticated']) {
        error('set session authorization '+role+'; '+repair, /42501|permission denied/u);
      }
      assert.equal(run("select has_function_privilege('service_role','public.regularizar_coordenacao_jun_ago_2026_d30(text)','EXECUTE');"),'t');
    });
    await t.test('justificativa obrigatoria e D+30 impede desoficializar depois da maturidade', () => {
      error("select public.regularizar_coordenacao_jun_ago_2026_d30('  ');",/JUSTIFICATIVA/u);
      run("update public.fixture_clock set d='2026-09-30';");
      error(repair,/D30|D\+30/u);
      error("select public.fechar_health_score_professor_v3_ciclo('2026-JUN-AGO','fixture');",/ciclo ja oficial/u);
      error('select public.retificar_coordenacao_jun_ago_2026();',/FIXTURE_RECALCULO_PROIBIDO/u);
      assert.equal(fingerprint(),before);
      run("update public.fixture_clock set d='2026-09-09';");
    });
    await t.test('timezone local: 30/09 02:59Z bloqueia ambos, 03:00Z permite o gate', () => {
      const timezoneBefore=run('show timezone;');
      assert.match(timezoneBefore,/^(Etc\/)?UTC$/u);
      try {
        run("update public.fixture_clock set instante='2026-09-30T02:59:00Z';");
        error("select public.fechar_health_score_professor_v3_ciclo('2026-JUN-AGO','fixture');",/D30/u);
        error('select public.retificar_coordenacao_jun_ago_2026();',/D30/u);
        run('begin; '+repair+' rollback;');
        run("update public.fixture_clock set instante='2026-09-30T03:00:00Z';");
        error("select public.fechar_health_score_professor_v3_ciclo('2026-JUN-AGO','fixture');",/ciclo ja oficial/u);
        error('select public.retificar_coordenacao_jun_ago_2026();',/FIXTURE_RECALCULO_PROIBIDO/u);
        error(repair,/D30_REGULARIZACAO_FORA_DA_JANELA/u);
        assert.equal(fingerprint(),before);
        assert.equal(run('show timezone;'),timezoneBefore);
      } finally { run('update public.fixture_clock set instante=null;'); }
    });
    await t.test('rollback integral restaura 117 oficiais, 702 metricas e 4 documentos originais', () => {
      run('begin; '+repair+' rollback;');
      assert.equal(fingerprint(),before);
    });
    await t.test('DDL idempotente preserva dados e nao duplica gate +30', () => {
      run(clock(fixturePatch));
      assert.equal(fingerprint(),before);
      assert.equal(run("select count(*) from pg_proc where proname in ('fechar_health_score_professor_v3_ciclo','retificar_coordenacao_jun_ago_2026') and prosrc like '%v_ciclo.data_fim + 30 then%' and prosrc not like '%+ 30 + 30%';"),'2');
    });
    // Corrupt fixtures inside transactions only; production triggers are restored
    // BEFORE calling the real repair. Closing psql rolls back each rejected case.
    const alterDoc = sql => `begin;
      alter table public.fechamento_mensal_snapshots disable trigger user;
      ${sql}
      alter table public.fechamento_mensal_snapshots enable trigger user;
      ${repair}`;
    await t.test('guard 701/702: metrica ausente aborta sem regularizacao parcial', () => {
      error(`begin; alter table public.health_score_professor_v3_snapshot_metricas disable trigger user;
        delete from public.health_score_professor_v3_snapshot_metricas where id=(select m.id
        from public.health_score_professor_v3_snapshot_metricas m
        join public.health_score_professor_v3_snapshots s on s.id=m.snapshot_id where s.publicado limit 1);
        alter table public.health_score_professor_v3_snapshot_metricas enable trigger user; ${repair}`,
        /COORDENACAO_D30_EVIDENCIA_ORIGINAL_DIVERGENTE/u);
      assert.equal(fingerprint(),before);
    });
    await t.test('guard hash: documento divergente aborta sem tocar historicos', () => {
      error(alterDoc("update public.fechamento_mensal_snapshots set payload_hash='hash-invalido' where id="+q(scopes[0].doc)+';'),/DOCUMENTO_ORIGINAL_DIVERGENTE/u);
      assert.equal(fingerprint(),before);
    });
    await t.test('guard 3/4: documento ausente aborta sem tocar snapshots', () => {
      error(alterDoc('delete from public.fechamento_mensal_snapshots where id='+q(scopes[0].doc)+';'),/ESPERADOS_4_DOCUMENTOS/u);
      assert.equal(fingerprint(),before);
    });
    await t.test('guard IDs: mesma contagem e hash valido nao aceitam professor trocado', () => {
      error(alterDoc(`update public.fechamento_mensal_snapshots
        set payload=jsonb_set(payload,'{professores,0,professor_id}','999') where id=${q(scopes[0].doc)};
        update public.fechamento_mensal_snapshots set payload_hash=public.hash_jsonb_canonico(payload-'documento');
        update public.fechamento_mensal_snapshots set payload=jsonb_set(payload,'{documento,hash}',to_jsonb(payload_hash));`),/DOCUMENTO_ORIGINAL_DIVERGENTE: hash congelado/u);
      assert.equal(fingerprint(),before);
    });
    await t.test('guard posterior: trigger que adultera metrica documental com hash valido deve abortar', () => {
      run(`create function public.fixture_corrupt_document() returns trigger language plpgsql as $$
        begin
          new.payload:=jsonb_set(new.payload,'{professores,0,metricas,conversao,numerador}','999');
          new.payload_hash:=public.hash_jsonb_canonico(new.payload-'documento');
          new.payload:=jsonb_set(new.payload,'{documento,hash}',to_jsonb(new.payload_hash));
          return new;
        end$$;
        create trigger fixture_corrupt_document before insert on public.fechamento_mensal_snapshots
        for each row execute function public.fixture_corrupt_document();`);
      // Explicit BEGIN ensures even an erroneous acceptance rolls back on exit.
      try {
        error('begin; '+repair,/DOCUMENTO_RETIFICADO_DIVERGENTE/u);
        assert.equal(fingerprint(),before);
      } finally { run('drop trigger fixture_corrupt_document on public.fechamento_mensal_snapshots;'); }
    });
    await t.test('falha no quarto documento reverte tambem snapshots e ciclo', () => {
      run(`create function public.fixture_fail_document() returns trigger language plpgsql as $$
        begin if new.unidade_id='${scopes[3].unit}' then raise exception 'FIXTURE_FALHA_DOCUMENTO'; end if;
        return new; end$$;
        create trigger fixture_fail_document before insert on public.fechamento_mensal_snapshots
        for each row execute function public.fixture_fail_document();`);
      error(repair,/FIXTURE_FALHA_DOCUMENTO/u);
      assert.equal(fingerprint(),before);
      run('drop trigger fixture_fail_document on public.fechamento_mensal_snapshots;');
    });
    let result;
    await t.test('clona exatamente 117 snapshots/702 metricas e anexa 4 retificados', () => {
      result = json(repair);
      assert.equal(run("select count(*) from public.health_score_professor_v3_snapshots where snapshot_anterior_id in (select id from public.fixture_original_snapshots where publicado);"),'117');
      assert.equal(run("select count(*) from public.health_score_professor_v3_snapshot_metricas where snapshot_id not in (select id from public.fixture_original_snapshots);"),'702');
      assert.equal(run("select count(*) from public.fechamento_mensal_snapshots where id not in (select id from public.fixture_original_docs);"),'4');
    });
    await t.test('invalida historicos preservando publicado=true, identidade e valores', () => {
      assert.equal(run(`select count(*) from public.health_score_professor_v3_snapshots s
        join public.fixture_original_snapshots o using(id) where o.publicado
        and s.estado='invalidado' and s.invalidado_em is not null and s.publicado
        and not s.publicavel and not s.ranking_habilitado
        and (to_jsonb(s)-array['estado','invalidado_em','publicavel','ranking_habilitado','motivo_bloqueio'])
          = (to_jsonb(o)-array['estado','invalidado_em','publicavel','ranking_habilitado','motivo_bloqueio']);`),'117');
      assert.equal(run(`select count(*) from public.fixture_original_metrics o
        join public.health_score_professor_v3_snapshot_metricas m using(id) where to_jsonb(m)=to_jsonb(o);`),'720');
      assert.equal(run(`select count(*) from public.fixture_original_snapshots o
        join public.health_score_professor_v3_snapshots s using(id) where not o.publicado and to_jsonb(s)=to_jsonb(o);`),'3');
    });
    await t.test('clones preservam seis metricas byte a byte, configuracao e score', () => {
      assert.equal(run(`select count(*) from public.health_score_professor_v3_snapshot_metricas m
        join public.health_score_professor_v3_snapshots s on s.id=m.snapshot_id
        join public.fixture_original_metrics o on o.snapshot_id=s.snapshot_anterior_id and o.metrica=m.metrica
        where (to_jsonb(m)-array['id','snapshot_id'])=(to_jsonb(o)-array['id','snapshot_id']);`),'702');
      assert.equal(run(`select count(*) from public.health_score_professor_v3_snapshots s
        join public.fixture_original_snapshots o on o.id=s.snapshot_anterior_id
        where (to_jsonb(s)-array['id','revisao','estado','publicado','publicavel','ranking_habilitado',
        'estado_publicacao','snapshot_anterior_id','justificativa_retificacao','motivo_bloqueio','criado_em','criado_por','fechado_em'])
        =(to_jsonb(o)-array['id','revisao','estado','publicado','publicavel','ranking_habilitado',
        'estado_publicacao','snapshot_anterior_id','justificativa_retificacao','motivo_bloqueio','criado_em','criado_por','fechado_em']);`),'117');
    });
    for(const s of scopes) {
      await t.test('leitor real: em_maturacao + parcial conserva '+s.count+' comparaveis em '+(s.unit||'consolidado'), () => {
        const r=json(`select jsonb_build_object('comparaveis',count(distinct professor_id) filter(where comparabilidade_estado='comparavel'),
          'parciais',count(distinct professor_id) filter(where comparabilidade_estado='comparavel' and estado='em_maturacao'
          and estado_publicacao='parcial' and score_exibivel and not ranking_habilitado and not snapshot_publicavel and not publicado),
          'score_igual',bool_and(score_comparavel=score) filter(where comparabilidade_estado='comparavel'))
          from public.get_health_score_professor_v3_performance_snapshot_v3('2026-08-01',${unit(s.unit)},'ciclo');`);
        assert.deepEqual(r,{comparaveis:s.count,parciais:s.count,score_igual:true});
      });
    }
    await t.test('4 docs historicos imutaveis; novos IDs/versao/hash, sem mudar metricas/MRR/comercial', () => {
      assert.equal(run(`select count(*) from public.fechamento_mensal_snapshots d join public.fixture_original_docs o using(id) where to_jsonb(d)=to_jsonb(o);`),'4');
      for(const s of scopes) {
        const payload=json(`select public.get_relatorio_coordenacao_documento_v4(${unit(s.unit)},2026,6,'ciclo');`);
        const original=json('select payload from public.fixture_original_docs where id='+q(s.doc));
        assert.equal(payload.documento.versao,s.version+1);
        assert.equal(payload.documento.supersede_id,s.doc);
        assert.equal(payload.documento.status,'retificado');
        assert.equal(payload.periodo.publicacao_oficial,false);
        assert.equal(payload.periodo.ranking_habilitado,false);
        assert.equal(payload.periodo.ciclo_estado,'em_fechamento');
        assert.equal(payload.periodo.estado_publicacao,'ciclo_em_acompanhamento');
        assert.deepEqual(payload.ranking_oficial,[]);
        assert.equal(payload.resumo_equipe.oficiais,0);
        assert.equal(payload.resumo_equipe.parciais,s.count);
        assert.equal(payload.resumo_equipe.comparaveis,s.count);
        for(const key of ['saidas_retencao','comercial','presenca','experimentais']) assert.deepEqual(payload[key],original[key]);
        for(let i=0;i<s.total;i++) {
          const p=payload.professores[i], o=original.professores[i];
          for(const key of ['professor_id','metricas','operacional','score','score_comparavel','config_id','comparabilidade_estado']) assert.deepEqual(p[key],o[key]);
          assert.equal(p.ranking_habilitado,false);
          assert.equal(p.estado_publicacao,i<s.count?'parcial':'sem_base');
        }
        const final=json(`select public.materializar_relatorio_coordenacao_documento_v4(${unit(s.unit)},2026,6,'ciclo','preview',null);`);
        assert.equal(final.id,payload.documento.id);
        assert.equal(final.finalizado,true,'finalizado protege o artefato, nao oficializa o HS');
        const rendered=gerarRelatorioCoordenacaoCanonico({tipo:'ranking',contrato:payload,dataGeracao:new Date('2026-09-09T12:00Z')});
        assert.match(rendered,/Ciclo em acompanhamento/u);
        assert.match(rendered,/relatório retificado/u);
        assert.doesNotMatch(rendered.slice(0,1000),/Ciclo oficial fechado\./u);
      }
      assert.equal(run("select count(*) from public.fechamento_mensal_snapshots where payload_hash=public.hash_jsonb_canonico(payload-'documento') and payload#>>'{documento,hash}'=payload_hash;"),'8');
    });
    await t.test('idempotente: segunda chamada nao altera IDs, versoes nem evidencia', () => {
      const after=fingerprint();
      const repeated=json(repair);
      assert.equal(fingerprint(),after);
      assert.deepEqual(repeated.documentos,result.documentos);
      assert.deepEqual(repeated.snapshot_ids,result.snapshot_ids);
    });
    await t.test('ciclo agora nao oficial continua bloqueado por ambos os gates ate 29/09', () => {
      const after=fingerprint();
      run("update public.fixture_clock set d='2026-09-29';");
      error("select public.fechar_health_score_professor_v3_ciclo('2026-JUN-AGO','fixture');",/D30/u);
      error('select public.retificar_coordenacao_jun_ago_2026();',/D30/u);
      assert.equal(fingerprint(),after);
    });
    const maturityFixture = (snapshotDate, conversionDate) => `begin;
      update public.fixture_clock set d='2026-09-30';
      alter table public.health_score_professor_v3_snapshots disable trigger user;
      update public.health_score_professor_v3_snapshots set criado_em=${q(snapshotDate)}::timestamptz
        where invalidado_em is null;
      alter table public.health_score_professor_v3_snapshots enable trigger user;
      alter table public.health_score_professor_v3_snapshot_metricas disable trigger user;
      update public.health_score_professor_v3_snapshot_metricas m set criado_em=${q(conversionDate)}::timestamptz
        from public.health_score_professor_v3_snapshots s where m.snapshot_id=s.id
        and s.invalidado_em is null and m.metrica='conversao';
      alter table public.health_score_professor_v3_snapshot_metricas enable trigger user;`;
    await t.test('30/09: closer recusa origem 09/09, mesmo depois do gate calendario', () => {
      const after=fingerprint();
      error(maturityFixture('2026-09-09T12:00Z','2026-09-09T12:00Z')+
        "select public.fechar_health_score_professor_v3_ciclo('2026-JUN-AGO','fixture');",/D30_FONTE_DESATUALIZADA/u);
      assert.equal(fingerprint(),after);
    });
    await t.test('30/09: clone novo com conversao copiada de 09/09 tambem e recusado', () => {
      const after=fingerprint();
      error(maturityFixture('2026-09-30T03:00Z','2026-09-09T12:00Z')+
        "select public.fechar_health_score_professor_v3_ciclo('2026-JUN-AGO','fixture');",/D30_FONTE_DESATUALIZADA/u);
      assert.equal(fingerprint(),after);
    });
    await t.test('30/09: origem e conversao frescas liberam 117 sem mudar comparabilidade/apta_oficial', () => {
      const after=fingerprint();
      const closed=json(maturityFixture('2026-09-30T03:00Z','2026-09-30T03:00Z')+
        "select public.fechar_health_score_professor_v3_ciclo('2026-JUN-AGO','fixture'); rollback;");
      assert.equal(closed.snapshots_fechados,117);
      assert.equal(closed.comparaveis_esperados,117);
      assert.equal(fingerprint(),after);
    });
    await t.test('historicos continuam protegidos pelos triggers reais', () => {
      error("update public.fechamento_mensal_snapshots set status='preview' where id="+q(scopes[0].doc),/IMUTAVEL/u);
      error("update public.health_score_professor_v3_snapshot_metricas set numerador=0;",/IMUTAVEL/u);
      error("delete from public.health_score_professor_v3_snapshots;",/IMUTAVEL/u);
    });
  } finally {
    const stop=docker(['stop',name]);
    assert.equal(stop.status,0,stop.stderr);
  }
});
