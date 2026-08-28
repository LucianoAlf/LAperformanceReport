import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const CONFIG = 'supabase/migrations/20260827031600_presenca_rollout_config.sql';
const ADAPTERS = 'supabase/migrations/20260827031700_presenca_rollout_adapters.sql';
const BASELINE = 'supabase/migrations/20260827030000_presenca_funcoes_vivas_baseline.sql';
const CONSOLIDATED_AGENDA_FIX = 'supabase/migrations/20260828025700_agenda_consolidada_rollout_legado.sql';
const AGENDA_AUTH_ROLE_FIX = 'supabase/migrations/20260828034000_presenca_auth_role_canonico.sql';
const REPORT_PROVENANCE_HOTFIX = 'supabase/migrations/20260827032300_presenca_relatorio_rollout_proveniencia_hotfix.sql';
const UNIT = '91000000-0000-0000-0000-000000000001';
const UNIT_2 = '91000000-0000-0000-0000-000000000002';

function docker(args, input) {
  return spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 32 * 1024 * 1024,
  });
}

function psql(container, sql) {
  const result = docker([
    'exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1',
    '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres', '-At',
  ], sql);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function psqlFalha(container, sql) {
  const result = docker([
    'exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1',
    '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres', '-At',
  ], sql);
  assert.notEqual(result.status, 0, 'SQL deveria falhar fechado');
  return `${result.stdout}\n${result.stderr}`;
}

function ultimoJson(output) {
  const linhas = output.split(/\r?\n/u).map((linha) => linha.trim()).filter(Boolean);
  return JSON.parse(linhas.at(-1));
}

function extrairDefinicaoFuncao(sql, nome) {
  const inicio = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nome}(`);
  assert.notEqual(inicio, -1, `definicao de ${nome} ausente`);
  const proximos = [
    sql.indexOf('\n\nCREATE OR REPLACE FUNCTION ', inicio + 1),
    sql.indexOf('\n\nCREATE OR REPLACE VIEW ', inicio + 1),
    sql.indexOf('\n\nCOMMENT ON FUNCTION ', inicio + 1),
  ].filter((indice) => indice > inicio);
  const fim = proximos.length > 0 ? Math.min(...proximos) : sql.length;
  return sql.slice(inicio, fim).trim();
}

async function waitForPostgres(container) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (docker([
      'exec', container, 'pg_isready', '-h', '127.0.0.1',
      '-U', 'postgres', '-d', 'postgres',
    ]).status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail('PostgreSQL 17 descartavel nao ficou pronto');
}

test('baseline preserva o texto legado e adapters governam todas as superficies vivas', () => {
  assert.equal(existsSync(ADAPTERS), true, 'migration de adapters ausente');
  assert.equal(existsSync(CONSOLIDATED_AGENDA_FIX), true, 'hotfix da Agenda consolidada ausente');
  assert.equal(existsSync(AGENDA_AUTH_ROLE_FIX), true, 'hotfix do claim JWT real ausente');
  assert.equal(existsSync(REPORT_PROVENANCE_HOTFIX), true, 'hotfix de proveniencia do relatorio ausente');
  const baseline = readFileSync(BASELINE, 'utf8');
  const adapters = readFileSync(ADAPTERS, 'utf8');
  const authRoleFix = readFileSync(AGENDA_AUTH_ROLE_FIX, 'utf8');
  assert.match(baseline, /fn_texto_relatorio_presenca_legado_v1/iu);
  for (const name of [
    'get_agenda_dia_canonica_v2',
    'app_minha_agenda_sessao_canonica_v2',
    'get_presenca_contexto_agente_canonico_v1',
    'fn_texto_relatorio_presenca_canonica_v2',
  ]) assert.match(adapters, new RegExp(name, 'u'));
  for (const surface of ['agenda', 'sol', 'la_teacher', 'lia', 'mila']) {
    assert.match(adapters, new RegExp(`'${surface}'`, 'u'));
  }
  assert.match(adapters, /(?:if|when)\s+v_modo\s*=\s*'sombra'/iu);
  assert.match(adapters, /(?:if|when)\s+v_modo\s*=\s*'canonico_v2'/iu);
  assert.match(adapters, /exception\s+when others/iu);
  assert.doesNotMatch(adapters, /delete\s+from|truncate\s+/iu);
  assert.equal((authRoleFix.match(/^CREATE OR REPLACE FUNCTION public\./gmu) ?? []).length, 20);
  assert.equal((authRoleFix.match(/^CREATE OR REPLACE VIEW public\./gmu) ?? []).length, 2);
  assert.doesNotMatch(authRoleFix, /request\.jwt\.claim\.role/iu);
  assert.match(authRoleFix, /auth\.role\(\)/u);
  for (const nome of [
    'get_agenda_dia_v2',
    'fn_presenca_pendencias_do_dia_v2',
    'presenca_sync_iniciar_v1',
    'presenca_sync_heartbeat_v1',
    'presenca_sync_finalizar_v1',
    'get_presenca_contexto_agente_canonico_v1',
  ]) assert.match(authRoleFix, new RegExp(`FUNCTION public\\.${nome}\\(`, 'u'));
});

test('sombra calcula sem expor, canonico ativa e legado reverte sem migration destrutiva', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel');
    return;
  }

  const container = `la-presenca-adapters-${process.pid}`;
  const started = docker([
    'run', '--rm', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres', '-d', 'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr);

  try {
    await waitForPostgres(container);
    psql(container, String.raw`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create role authenticator nologin;
      grant authenticated to authenticator;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create function auth.role() returns text language sql stable as $$
        select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
      $$;
      create function public.is_admin() returns boolean language sql stable as $$
        select coalesce(current_setting('app.test_admin', true), 'false') = 'true'
      $$;
      create function public.get_user_unidade_ids() returns setof uuid language sql stable as $$
        select '${UNIT}'::uuid
      $$;
      create table public.unidades(id uuid primary key, nome text, ativa boolean);
      insert into public.unidades values
        ('${UNIT}', 'Recreio', true),
        ('${UNIT_2}', 'Barra', true);

      create type public.agenda_fixture as (
        chave text, unidade_id uuid, professor_id integer, professor_presenca text,
        alunos jsonb, aula_ids integer[]
      );
      create function public.get_agenda_dia(p_data date, p_unidade_id uuid default null)
      returns setof public.agenda_fixture language sql stable security definer as $$
        select v.chave, v.unidade_id, v.professor_id, v.professor_presenca,
               v.alunos, v.aula_ids
        from (values
          ('slot-legado'::text, '${UNIT}'::uuid, 7, 'presente'::text,
            jsonb_build_array(jsonb_build_object(
              'aluno_id',101,'aula_emusys_id',10,'status_presenca','presente'
            )), array[10]::integer[]),
          ('slot-legado-barra'::text, '${UNIT_2}'::uuid, 8, 'ausente'::text,
            jsonb_build_array(jsonb_build_object(
              'aluno_id',102,'aula_emusys_id',11,'status_presenca','ausente'
            )), array[11]::integer[])
        ) as v(chave, unidade_id, professor_id, professor_presenca, alunos, aula_ids)
        where p_unidade_id is null or v.unidade_id = p_unidade_id
      $$;
      create function public.get_agenda_dia_v2(p_data date, p_unidade_id uuid default null)
      returns jsonb language sql stable security definer as $$
        select jsonb_build_object('fonte','agenda-canonica','aulas','[]'::jsonb)
      $$;
      create function public.fn_presenca_pendencias_do_dia(p_unidade_id uuid, p_data date)
      returns table(motivo text, aluno_id integer) language plpgsql stable as $$
      begin
        if p_unidade_id is null or p_data is null then
          raise exception 'UNIDADE_E_DATA_OBRIGATORIAS' using errcode = '22023';
        end if;
        return query select 'sem_resposta'::text,
          case when p_unidade_id = '${UNIT}'::uuid then 202 else 303 end;
      end
      $$;

      create function public.fn_texto_relatorio_presenca_legado_v1(p_unidade_id uuid, p_data date)
      returns text language sql stable security definer as $$ select 'sol-legado'::text $$;
      create function public.fn_texto_relatorio_presenca(p_unidade_id uuid, p_data date)
      returns text language sql stable security definer as $$ select 'sol-canonico'::text $$;

      create function public.fn_professor_do_usuario() returns integer language sql stable as $$ select 7 $$;
      create table public.aulas_emusys(
        id integer primary key, unidade_id uuid, professor_id integer, data_aula date,
        data_hora_fim timestamptz, categoria text, cancelada boolean default false
      );
      insert into public.aulas_emusys values
        (10,'${UNIT}',7,'2026-08-26','2026-08-26 11:00-03','normal',false);
      create function public.app_minha_agenda_sessao_base_v1(p_data date default current_date)
      returns jsonb language sql stable security definer as $$
        select jsonb_build_array(jsonb_build_object('fonte','teacher-legado'))
      $$;
      create function public.app_minha_agenda_sessao(p_data date default current_date)
      returns jsonb language sql stable security definer as $$
        select jsonb_build_object('fonte','teacher-canonico','sessoes','[]'::jsonb)
      $$;

      create function public.get_presenca_contexto_agente_v1(
        p_unidade_id uuid, p_data date, p_escopo text, p_professor_id integer default null
      )
      returns jsonb language sql stable security definer as $$
        select jsonb_build_object('fonte','agente-canonico','estado_publicacao','publicavel')
      $$;
      create function public.fn_texto_relatorio_presenca_consolidado(p_data date)
      returns text language sql stable security definer as $$ select 'consolidado-sem-gate'::text $$;
      create table public.fila_relatorios_sol_hermes(
        id bigint generated always as identity primary key,
        tipo_relatorio text, unidade_id uuid, metadata jsonb
      );
    `);
    psql(container, readFileSync(CONFIG, 'utf8'));
    psql(container, readFileSync(ADAPTERS, 'utf8'));
    psql(container, readFileSync(CONSOLIDATED_AGENDA_FIX, 'utf8'));
    psql(container, extrairDefinicaoFuncao(
      readFileSync(AGENDA_AUTH_ROLE_FIX, 'utf8'),
      'get_agenda_dia_v2',
    ));
    psql(container, readFileSync(REPORT_PROVENANCE_HOTFIX, 'utf8'));

    const shadow = JSON.parse(psql(container, String.raw`
      select json_build_object(
        'agenda', public.get_agenda_dia_v2('2026-08-26','${UNIT}'),
        'sol', public.fn_texto_relatorio_presenca('${UNIT}','2026-08-26'),
        'teacher', public.app_minha_agenda_sessao('2026-08-26'),
        'lia', public.get_presenca_contexto_agente_v1('${UNIT}','2026-08-26','lia',null)
      );
    `));
    assert.equal(shadow.agenda.rollout_modo, 'sombra');
    assert.equal(shadow.agenda.fonte, 'agenda-legado');
    assert.equal(shadow.agenda.ocorrencias[0].resultado_canonico, 'presente');
    assert.equal(shadow.sol, 'sol-legado');
    assert.equal(shadow.teacher[0].fonte, 'teacher-legado');
    assert.equal(shadow.lia.estado_publicacao, 'legado');
    assert.notEqual(shadow.lia.fonte, 'agente-canonico');

    const agendaConsolidada = JSON.parse(psql(container, String.raw`
      select public.get_agenda_dia_v2('2026-08-26', null);
    `));
    assert.equal(agendaConsolidada.rollout_modo, 'sombra');
    assert.equal(agendaConsolidada.fonte, 'agenda-legado');
    assert.equal(agendaConsolidada.aulas.length, 2);
    assert.equal(agendaConsolidada.pendencias.length, 2);
    assert.deepEqual(
      agendaConsolidada.pendencias.map((item) => item.aluno_id).sort((a, b) => a - b),
      [202, 303],
    );
    assert.equal(
      agendaConsolidada.ocorrencias.find((item) => item.aluno_id === 102)?.resultado_canonico,
      'indeterminado',
    );
    assert.equal(
      agendaConsolidada.professores_ocorrencias.find((item) => item.professor_id === 8)?.estado,
      'indeterminado',
    );

    const agendaDaPropriaUnidade = ultimoJson(psql(container, String.raw`
      set session authorization authenticator;
      set role authenticated;
      select set_config('request.jwt.claims', '{"role":"authenticated"}', false);
      select set_config('app.test_admin', 'false', false);
      select public.get_agenda_dia_v2('2026-08-26', '${UNIT}');
    `));
    assert.equal(agendaDaPropriaUnidade.aulas.length, 1);

    assert.match(psqlFalha(container, String.raw`
      set session authorization authenticator;
      set role authenticated;
      select set_config('request.jwt.claims', '{"role":"authenticated"}', false);
      select set_config('app.test_admin', 'false', false);
      select public.get_agenda_dia_v2('2026-08-26', '${UNIT_2}');
    `), /UNIDADE_NAO_AUTORIZADA/u);

    assert.match(psqlFalha(container, String.raw`
      set session authorization authenticator;
      set role authenticated;
      select set_config('request.jwt.claims', '{"role":"authenticated"}', false);
      select set_config('app.test_admin', 'false', false);
      select public.get_agenda_dia_v2('2026-08-26', null);
    `), /CONSOLIDADO_REQUER_ADMIN/u);

    const agendaConsolidadaAdmin = ultimoJson(psql(container, String.raw`
      set session authorization authenticator;
      set role authenticated;
      select set_config('request.jwt.claims', '{"role":"authenticated"}', false);
      select set_config('app.test_admin', 'true', false);
      select public.get_agenda_dia_v2('2026-08-26', null);
    `));
    assert.equal(agendaConsolidadaAdmin.aulas.length, 2);

    assert.match(psql(container, "select public.fn_texto_relatorio_presenca_consolidado('2026-08-26');"), /sol-legado/u);
    const provenanceShadow = psql(container, `
      insert into public.fila_relatorios_sol_hermes(tipo_relatorio,unidade_id,metadata)
      values ('presenca_pendencias','${UNIT}','{"regra_versao":"presenca-v2","fonte":"fn_presenca_pendencias_do_dia_v2"}')
      returning metadata->>'regra_versao';
    `);
    assert.equal(provenanceShadow.split(/\r?\n/u)[0], 'presenca-legado-v1');

    psql(container, `update public.presenca_rollout_config set modo='canonico_v2';`);
    const canonical = JSON.parse(psql(container, String.raw`
      select json_build_object(
        'agenda', public.get_agenda_dia_v2('2026-08-26','${UNIT}'),
        'sol', public.fn_texto_relatorio_presenca('${UNIT}','2026-08-26'),
        'teacher', public.app_minha_agenda_sessao('2026-08-26'),
        'lia', public.get_presenca_contexto_agente_v1('${UNIT}','2026-08-26','lia',null)
      );
    `));
    assert.equal(canonical.agenda.fonte, 'agenda-canonica');
    assert.equal(canonical.agenda.rollout_modo, 'canonico_v2');
    assert.equal(canonical.sol, 'sol-canonico');
    assert.equal(canonical.teacher.fonte, 'teacher-canonico');
    assert.equal(canonical.lia.fonte, 'agente-canonico');
    assert.match(psql(container, "select public.fn_texto_relatorio_presenca_consolidado('2026-08-26');"), /sol-canonico/u);
    const provenanceCanonical = psql(container, `
      insert into public.fila_relatorios_sol_hermes(tipo_relatorio,unidade_id,metadata)
      values ('presenca_pendencias','${UNIT}','{"regra_versao":"presenca-v2","fonte":"fn_presenca_pendencias_do_dia_v2"}')
      returning metadata->>'regra_versao';
    `);
    assert.equal(provenanceCanonical.split(/\r?\n/u)[0], 'presenca-v2');

    psql(container, `update public.presenca_rollout_config set modo='legado';`);
    const rollback = JSON.parse(psql(container, String.raw`
      select json_build_object(
        'agenda', public.get_agenda_dia_v2('2026-08-26','${UNIT}'),
        'sol', public.fn_texto_relatorio_presenca('${UNIT}','2026-08-26'),
        'teacher', public.app_minha_agenda_sessao('2026-08-26'),
        'lia', public.get_presenca_contexto_agente_v1('${UNIT}','2026-08-26','lia',null)
      );
    `));
    assert.equal(rollback.agenda.rollout_modo, 'legado');
    assert.equal(rollback.sol, 'sol-legado');
    assert.equal(rollback.teacher[0].fonte, 'teacher-legado');
    assert.equal(rollback.lia.estado_publicacao, 'legado');

    const acl = JSON.parse(psql(container, `select json_build_object(
      'agenda_canonica_public', has_function_privilege('public','public.get_agenda_dia_canonica_v2(date,uuid)','execute'),
      'teacher_canonica_public', has_function_privilege('public','public.app_minha_agenda_sessao_canonica_v2(date)','execute'),
      'agente_canonico_public', has_function_privilege('public','public.get_presenca_contexto_agente_canonico_v1(uuid,date,text,integer)','execute'),
      'sol_canonica_public', has_function_privilege('public','public.fn_texto_relatorio_presenca_canonica_v2(uuid,date)','execute')
    );`));
    assert.deepEqual(acl, {
      agenda_canonica_public: false,
      teacher_canonica_public: false,
      agente_canonico_public: false,
      sol_canonica_public: false,
    });
  } finally {
    docker(['rm', '-f', container]);
  }
});
