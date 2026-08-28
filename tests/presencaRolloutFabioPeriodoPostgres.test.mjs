import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const CONFIG = 'supabase/migrations/20260827031600_presenca_rollout_config.sql';
const MIGRATION = 'supabase/migrations/20260827032100_presenca_rollout_fabio_periodo.sql';
const UNIT = '91000000-0000-0000-0000-000000000001';

function docker(args, input) {
  return spawnSync('docker', args, { input, encoding: 'utf8', timeout: 120_000, maxBuffer: 32 * 1024 * 1024 });
}
function psql(c, sql) {
  const r = docker(['exec','-i',c,'psql','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-U','postgres','-d','postgres','-At'], sql);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  return r.stdout.trim();
}
async function wait(c) {
  for (let i = 0; i < 80; i += 1) {
    if (docker(['exec',c,'pg_isready','-h','127.0.0.1','-U','postgres']).status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail('Postgres nao iniciou');
}

test('adaptador do Fabio preserva legado e proibe inferencia de falta', () => {
  assert.equal(existsSync(MIGRATION), true, 'migration do Fabio por periodo ausente');
  const sql = readFileSync(MIGRATION, 'utf8');
  assert.match(sql, /fabio_professor_presencas_periodo_legado_v1/iu);
  assert.match(sql, /vw_presenca_ocorrencia_canonica_v2/iu);
  assert.match(sql, /fn_presenca_rollout_modo_interno_v1[\s\S]*'la_teacher'/iu);
  assert.match(sql, /'falta_provavel'\s*,\s*'\[\]'/iu);
  assert.doesNotMatch(sql, /vw_aluno_presenca_semantica_v1/iu);
});

test('sombra devolve legado, flag ativa v2 e rollback restaura resposta', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) return t.skip('Docker indisponivel');
  const c = `la-presenca-fabio-periodo-${process.pid}`;
  assert.equal(docker(['run','--rm','--name',c,'-e','POSTGRES_PASSWORD=postgres','-d','postgres:17-alpine']).status, 0);
  try {
    await wait(c);
    psql(c, String.raw`
      create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema auth; create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create function public.is_admin() returns boolean language sql stable as $$ select true $$;
      create table public.unidades(id uuid primary key,nome text,ativa boolean);
      insert into public.unidades values('${UNIT}','Recreio',true);
      create table public.aulas_emusys(id integer primary key,unidade_id uuid,professor_id integer,data_aula date,categoria text);
      insert into public.aulas_emusys values(10,'${UNIT}',7,'2026-08-25','normal');
      create table public.alunos(id integer primary key,nome text);
      insert into public.alunos values(101,'Presente'),(102,'Falta'),(103,'Pendente');
      create table public.vw_presenca_ocorrencia_canonica_v2(
        slot_key text,aluno_id integer,unidade_id uuid,professor_id integer,data_aula date,
        curso_nome text,resultado_canonico text,fonte_decisao text,possui_conflito boolean,
        decidido_em timestamptz,regra_versao text
      );
      insert into public.vw_presenca_ocorrencia_canonica_v2 values
        ('s1',101,'${UNIT}',7,'2026-08-25','Piano','presente','emusys',false,now(),'v2'),
        ('s2',102,'${UNIT}',7,'2026-08-25','Piano','falta','agenda_secretaria',false,now(),'v2'),
        ('s3',103,'${UNIT}',7,'2026-08-25','Piano','indeterminado','indeterminado',false,now(),'v2');
      create function public.fn_presenca_dados_frescos_interno_v1(uuid,date)
      returns jsonb language sql stable as $$ select '{"publicavel":true,"status":"concluida"}'::jsonb $$;
      create function public.fabio_professor_presencas_periodo(integer,date,date)
      returns jsonb language sql stable security definer as $$ select '{"ok":true,"fonte":"legado","presentes":99}'::jsonb $$;
      revoke all on function public.fabio_professor_presencas_periodo(integer,date,date) from public,anon,authenticated;
      grant execute on function public.fabio_professor_presencas_periodo(integer,date,date) to service_role;
    `);
    psql(c, readFileSync(CONFIG, 'utf8'));
    psql(c, readFileSync(MIGRATION, 'utf8'));

    const read = () => JSON.parse(psql(c, `select public.fabio_professor_presencas_periodo(7,'2026-08-25','2026-08-25');`));
    const shadow = read();
    assert.equal(shadow.fonte, 'legado');
    assert.equal(shadow.presentes, 99);

    psql(c, `update public.presenca_rollout_config set modo='canonico_v2' where unidade_id='${UNIT}' and superficie='la_teacher';`);
    const canonical = read();
    assert.equal(canonical.fonte, 'vw_presenca_ocorrencia_canonica_v2');
    assert.equal(canonical.presentes, 1);
    assert.equal(canonical.faltas.length, 1);
    assert.equal(canonical.faltas[0].aluno, 'Falta');
    assert.deepEqual(canonical.falta_provavel, []);
    assert.equal(canonical.indeterminado.length, 1);

    psql(c, `create or replace function public.fn_presenca_dados_frescos_interno_v1(uuid,date) returns jsonb language sql stable as $$ select '{"publicavel":false,"status":"sem_cobertura"}'::jsonb $$;`);
    const stale = read();
    assert.equal(stale.ok, false);
    assert.equal(stale.codigo, 'dados_nao_publicaveis');

    psql(c, `update public.presenca_rollout_config set modo='legado' where unidade_id='${UNIT}' and superficie='la_teacher';`);
    assert.deepEqual(read(), shadow);

    const acl = JSON.parse(psql(c, `select json_build_object(
      'legacy_public',has_function_privilege('public','public.fabio_professor_presencas_periodo_legado_v1(integer,date,date)','execute'),
      'canonical_public',has_function_privilege('public','public.fabio_professor_presencas_periodo_canonico_v2(integer,date,date)','execute'),
      'wrapper_service',has_function_privilege('service_role','public.fabio_professor_presencas_periodo(integer,date,date)','execute')
    );`));
    assert.deepEqual(acl, { legacy_public: false, canonical_public: false, wrapper_service: true });
  } finally {
    docker(['rm','-f',c]);
  }
});
