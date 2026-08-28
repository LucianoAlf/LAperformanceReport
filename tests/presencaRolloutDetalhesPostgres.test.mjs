import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const CONFIG = 'supabase/migrations/20260827031600_presenca_rollout_config.sql';
const MIGRATION = 'supabase/migrations/20260827032000_presenca_rollout_detalhes.sql';
const UNIT = '91000000-0000-0000-0000-000000000001';
const signature = `returns table(slot_key text,aluno_id integer,aluno_nome text,unidade_id uuid,professor_id integer,professor_nome text,data_aula date,horario_aula time,curso_nome text,resultado_canonico text,fonte_decisao text,possui_conflito boolean,turma_nome text,sala_nome text,anotacoes text,duracao_minutos integer,tipo text,nr_da_aula integer,qtd_alunos integer,universo_eventos bigint,presentes bigint,faltas bigint,faltas_justificadas bigint,dados_status text,estado_publicacao text,sincronizado_em timestamptz,regra_versao text)`;

function docker(args, input) { return spawnSync('docker', args, { input, encoding: 'utf8', timeout: 120_000, maxBuffer: 32 * 1024 * 1024 }); }
function psql(c, sql) {
  const r = docker(['exec','-i',c,'psql','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-U','postgres','-d','postgres','-At'], sql);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`); return r.stdout.trim();
}
async function wait(c) { for (let i=0;i<80;i+=1) { if (docker(['exec',c,'pg_isready','-h','127.0.0.1','-U','postgres']).status===0) return; await new Promise(r=>setTimeout(r,250)); } assert.fail('Postgres nao iniciou'); }

test('detalhe possui leitor legado privado e despacho por relatorios', () => {
  assert.equal(existsSync(MIGRATION), true, 'migration de detalhe governado ausente');
  const sql = readFileSync(MIGRATION, 'utf8');
  assert.match(sql, /get_presenca_ocorrencias_periodo_legado_v1/iu);
  assert.match(sql, /get_presenca_ocorrencias_periodo_canonico_v2/iu);
  assert.match(sql, /fn_presenca_rollout_modo_interno_v1\([^;]+?'relatorios'/isu);
  assert.match(sql, /from public\.aluno_presenca/iu);
  assert.doesNotMatch(sql, /delete\s+from|truncate\s+/iu);
});

test('detalhe retorna legado em sombra e canonico somente apos flag', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) return t.skip('Docker indisponivel');
  const c = `la-presenca-detalhes-${process.pid}`;
  assert.equal(docker(['run','--rm','--name',c,'-e','POSTGRES_PASSWORD=postgres','-d','postgres:17-alpine']).status,0);
  try {
    await wait(c);
    psql(c, String.raw`
      create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema auth; create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create function public.is_admin() returns boolean language sql stable as $$ select true $$;
      create function public.get_user_unidade_ids() returns table(unidade_id uuid) language sql stable as $$ select '${UNIT}'::uuid $$;
      create table public.unidades(id uuid primary key,nome text,ativa boolean); insert into public.unidades values('${UNIT}','Recreio',true);
      create table public.alunos(id integer primary key,nome text,unidade_id uuid); insert into public.alunos values(101,'Aluno legado','${UNIT}');
      create table public.professores(id integer primary key,nome text); insert into public.professores values(7,'Professor');
      create table public.aulas_emusys(id integer primary key,professor_id integer,professor_nome text,categoria text,anotacoes text,duracao_minutos integer,tipo text,nr_da_aula integer,qtd_alunos integer);
      insert into public.aulas_emusys values(10,7,'Professor','normal','nota',50,'regular',3,1);
      create table public.aluno_presenca(id bigint primary key,aluno_id integer,unidade_id uuid,aula_emusys_id integer,data_aula date,horario_aula time,curso_nome text,status text,turma_nome text,sala_nome text);
      insert into public.aluno_presenca values(1,101,'${UNIT}',10,'2026-08-26','10:00','Piano','ausente','T1','S1');
      create function public.get_presenca_ocorrencias_periodo_v2(p_unidade_id uuid,p_data_inicio date,p_data_fim date,p_professor_id integer default null,p_aluno_id integer default null)
      ${signature} language sql stable security definer as $$
        select 'canonico',101,'Aluno canonico','${UNIT}'::uuid,7,'Professor','2026-08-26'::date,'10:00'::time,'Piano','presente','agenda_secretaria',false,null::text,null::text,null::text,50,'regular',3,1,1::bigint,1::bigint,0::bigint,0::bigint,'atualizados','publicado',now(),'presenca-v2'
      $$;
    `);
    psql(c, readFileSync(CONFIG,'utf8'));
    psql(c, readFileSync(MIGRATION,'utf8'));
    const read = () => JSON.parse(psql(c, `select row_to_json(x) from public.get_presenca_ocorrencias_periodo_v2('${UNIT}','2026-08-01','2026-08-26',null,null) x limit 1;`));
    const shadow = read();
    assert.equal(shadow.aluno_nome, 'Aluno legado'); assert.equal(shadow.resultado_canonico, 'falta'); assert.equal(shadow.regra_versao, 'presenca-legado-v1');
    psql(c, `update public.presenca_rollout_config set modo='canonico_v2' where superficie='relatorios';`);
    assert.equal(read().aluno_nome, 'Aluno canonico');
    psql(c, `update public.presenca_rollout_config set modo='legado' where superficie='relatorios';`);
    assert.deepEqual(read(), shadow);
  } finally { docker(['rm','-f',c]); }
});
