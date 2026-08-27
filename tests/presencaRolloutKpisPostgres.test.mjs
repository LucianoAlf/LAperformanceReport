import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const CONFIG = 'supabase/migrations/20260827031600_presenca_rollout_config.sql';
const MIGRATION = 'supabase/migrations/20260827031800_presenca_rollout_kpis.sql';
const NUMERIC = 'supabase/migrations/20260827031300_presenca_consumidores_numericos_v2.sql';
const UNIT = '91000000-0000-0000-0000-000000000001';

function docker(args, input) {
  return spawnSync('docker', args, { input, encoding: 'utf8', timeout: 120_000, maxBuffer: 32 * 1024 * 1024 });
}
function psql(container, sql) {
  const result = docker(['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres', '-At'], sql);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}
function psqlAs(container, sql) {
  const result = docker(['exec', '-e', 'PGPASSWORD=app', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-U', 'app_user', '-d', 'postgres', '-At'], sql);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}
async function wait(container) {
  for (let i = 0; i < 80; i += 1) {
    if (docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']).status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail('Postgres descartavel nao iniciou');
}

test('consumidores numericos preservam legado e possuem adapters por flag', () => {
  assert.equal(existsSync(MIGRATION), true, 'migration de rollout dos KPIs ausente');
  const numeric = readFileSync(NUMERIC, 'utf8');
  const sql = readFileSync(MIGRATION, 'utf8');
  for (const name of ['get_faltas_periodo_legado_v1', 'vw_absenteismo_aluno_legado_v1', 'vw_radar_aluno_sinais_legado_v1']) {
    assert.match(numeric, new RegExp(name, 'u'));
  }
  for (const name of ['get_faltas_periodo_canonico_v2', 'vw_absenteismo_aluno_canonica_v2', 'vw_radar_aluno_sinais_canonica_v2']) {
    assert.match(sql, new RegExp(name, 'u'));
  }
  assert.match(sql, /fn_presenca_rollout_modo_interno_v1\([^;]+?'kpis'/isu);
  assert.match(sql, /presenca-legado-v1/iu);
  assert.doesNotMatch(sql, /delete\s+from|truncate\s+/iu);
});

test('KPIs ficam legados em sombra, publicam canonico e voltam por flag', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) return t.skip('Docker indisponivel');
  const container = `la-presenca-kpis-rollout-${process.pid}`;
  const started = docker(['run', '--rm', '--name', container, '-e', 'POSTGRES_PASSWORD=postgres', '-d', 'postgres:17-alpine']);
  assert.equal(started.status, 0, started.stderr);
  try {
    await wait(container);
    psql(container, String.raw`
      create role anon nologin; create role authenticated nologin;
      create role service_role nologin bypassrls;
      create role app_user login password 'app' in role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create function public.is_admin() returns boolean language sql stable as $$ select true $$;
      create function public.get_user_unidade_ids() returns table(unidade_id uuid) language sql stable as $$ select '${UNIT}'::uuid $$;
      create table public.unidades(id uuid primary key, nome text, ativa boolean);
      insert into public.unidades values ('${UNIT}','Recreio',true);
      create table public.alunos(id integer primary key, unidade_id uuid);
      insert into public.alunos values (101,'${UNIT}');

      create function public.get_faltas_periodo_legado_v1(p_unidade_id uuid,p_data_inicio date,p_data_fim date)
      returns table(aluno_id integer,nome text,unidade_id uuid,unidade_codigo text,curso_nome text,professor_nome text,telefone text,whatsapp text,responsavel_telefone text,total_aulas bigint,faltas bigint,presencas bigint,pct_presenca numeric,is_projeto_banda boolean)
      language sql stable security definer as $$ select 101,'Legado','${UNIT}'::uuid,'RC','Curso','Prof',null::text,null::text,null::text,4::bigint,1::bigint,3::bigint,75::numeric,false $$;
      create function public.get_faltas_periodo_v2(p_unidade_id uuid,p_data_inicio date,p_data_fim date)
      returns table(aluno_id integer,nome text,unidade_id uuid,unidade_codigo text,curso_nome text,professor_nome text,telefone text,whatsapp text,responsavel_telefone text,denominador bigint,presentes bigint,faltas bigint,faltas_justificadas bigint,faltas_total bigint,percentual_presenca numeric,is_projeto_banda boolean,dados_status text,estado_publicacao text,sincronizado_em timestamptz,regra_versao text)
      language sql stable security definer as $$ select 101,'Canonico','${UNIT}'::uuid,'RC','Curso','Prof',null::text,null::text,null::text,5::bigint,4::bigint,1::bigint,0::bigint,1::bigint,80::numeric,false,'atualizados','publicavel',now(),'faltas-periodo-v2.1' $$;

      create view public.vw_absenteismo_aluno_legado_v1 with (security_invoker=true) as
        select 101 aluno_id,4::bigint total_aulas,1::bigint faltas,.25::numeric taxa_historica,.25::numeric taxa_recente_30d,0::numeric tendencia,current_date ultima_presenca,0 dias_sem_presenca,true confiavel;
      create view public.vw_absenteismo_aluno as
        select 101 aluno_id,5::bigint total_aulas,1::bigint faltas,.2::numeric taxa_historica,.2::numeric taxa_recente_30d,0::numeric tendencia,current_date ultima_presenca,0 dias_sem_presenca,true confiavel,4::bigint presentes,1::bigint faltas_nao_justificadas,0::bigint faltas_justificadas,5::bigint denominador_30d,4::bigint presentes_30d,1::bigint faltas_nao_justificadas_30d,0::bigint faltas_justificadas_30d,'atualizados'::text dados_status,'publicavel'::text estado_publicacao,now() sincronizado_em,'abs-v2'::text regra_versao;

      create view public.vw_radar_aluno_sinais_legado_v1 with (security_invoker=true) as
        select 101 aluno_id,'Legado'::text aluno_nome,'${UNIT}'::uuid unidade_id,'RC'::text unidade_codigo,7 professor_id,'Prof'::text professor_nome,'Curso'::text curso_nome,4::bigint aulas_medidas,1::bigint faltas_janela,25::numeric absenteismo_pct,1::bigint faltas_mes,4::bigint aulas_mes,null::text feedback,null::text pratica_em_casa,null::text evolucao,null::text animo,null::text observacao,null::date feedback_competencia,false avisou_que_sai,null::date mes_saida,1::bigint faltas_consecutivas,null::text aluno_foto_url;
      create view public.vw_radar_aluno_sinais as
        select l.*,0::bigint faltas_justificadas_mes,'atualizados'::text dados_status,'publicavel'::text estado_publicacao,now() sincronizado_em,'radar-v2'::text regra_versao from public.vw_radar_aluno_sinais_legado_v1 l;
    `);
    psql(container, readFileSync(CONFIG, 'utf8'));
    psql(container, readFileSync(MIGRATION, 'utf8'));

    const read = () => JSON.parse(psql(container, `select json_build_object(
      'falta',(select json_build_object('nome',nome,'regra',regra_versao) from public.get_faltas_periodo_v2('${UNIT}','2026-08-01','2026-08-26') limit 1),
      'abs',(select json_build_object('total',total_aulas,'regra',regra_versao) from public.vw_absenteismo_aluno limit 1),
      'radar',(select json_build_object('nome',aluno_nome,'regra',regra_versao) from public.vw_radar_aluno_sinais limit 1)
    );`));
    const shadow = read();
    assert.deepEqual(shadow, { falta: { nome: 'Legado', regra: 'presenca-legado-v1' }, abs: { total: 4, regra: 'presenca-legado-v1' }, radar: { nome: 'Legado', regra: 'presenca-legado-v1' } });
    const authenticatedShadow = JSON.parse(psqlAs(container, `
      select set_config('request.jwt.claim.role','authenticated',false);
      select json_build_object(
        'abs',(select regra_versao from public.vw_absenteismo_aluno limit 1),
        'radar',(select regra_versao from public.vw_radar_aluno_sinais limit 1)
      );
    `).split(/\r?\n/u).at(-1));
    assert.deepEqual(authenticatedShadow, { abs: 'presenca-legado-v1', radar: 'presenca-legado-v1' });

    psql(container, `update public.presenca_rollout_config set modo='canonico_v2' where superficie='kpis';`);
    const canonical = read();
    assert.equal(canonical.falta.nome, 'Canonico');
    assert.equal(canonical.abs.total, 5);
    assert.equal(canonical.radar.regra, 'radar-v2');

    psql(container, `update public.presenca_rollout_config set modo='legado' where superficie='kpis';`);
    assert.deepEqual(read(), shadow);
  } finally {
    docker(['rm', '-f', container]);
  }
});
