import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const IMAGE = process.env.SECURITY_ANON_POSTGRES_IMAGE || 'postgres:17-alpine';
const migrationPath = new URL('../supabase/migrations/20260921013120_security_anon_hardening_20260920.sql', import.meta.url);
const correctionPath = new URL('../supabase/migrations/20260921013409_security_anamnese_public_acl_minima.sql', import.meta.url);
const sequenceMigrationPath = new URL('../supabase/migrations/20260921021929_security_anon_sequences_defaults.sql', import.meta.url);
const shareTokenMigrationPath = new URL('../supabase/migrations/20260921023942_anamnese_share_token_validade.sql', import.meta.url);
const container = 'la-security-anon-' + process.pid + '-' + Date.now();

function docker(args, options = {}) {
  return spawnSync('docker', args, { encoding: 'utf8', ...options });
}

function sql(text) {
  let result;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    result = docker(
      ['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-At'],
      { input: text },
    );
    if (result.status === 0 || !/No such file or directory/.test(result.stderr)) break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  assert.equal(result.status, 0, 'SQL falhou:\n' + result.stderr + '\n' + result.stdout);
  return result.stdout.trim();
}

function waitReady() {
  for (let i = 0; i < 40; i += 1) {
    if (docker(['exec', container, 'pg_isready', '-U', 'postgres']).status === 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  assert.fail('PostgreSQL descartavel nao ficou pronto');
}

const papeis = [
  'anon', 'authenticated', 'service_role', 'fabio_agent', 'fabio_motor_v2_snapshot_ro',
  'la_os_leitor', 'la_os_triador', 'lia_acesso_restrito', 'maria_lareport_rpc',
  'mila_acesso_restrito', 'ml_jobs', 'monitor_coletor', 'sol_acesso_restrito',
  'sol_atendimento_externo', 'sol_caixa_readonly', 'sol_estrategico',
  'sol_operacional', 'sol_tatico', 'supabase_admin',
];

const tabelasP1 = [
  '_auditoria_chave_natural_20260809', '_auditoria_reconstrucao_20260809',
  'calendario_escolar', 'emusys_experimentais_snapshot_execucoes',
  'fabio_memoria_janela', 'fabio_memoria_proposta',
  'fabio_participacao_ocorrencia_eventos', 'fabio_participacao_ocorrencias',
  'fabio_professor_memoria', 'fechamento_snapshots_backup_20260808',
  'health_score_professor_v3_materializacao_execucoes', 'hermes_patch_status',
  'lead_experimentais_arquivadas', 'lead_experimental_aulas_arquivadas',
  'migrations_audit_data_nascimento', 'programa_matriculador_estrelas_config',
  'projecao_aulas', 'projecao_recaculo_log', 'sol_grants_revogados_fatia0',
  'unidade_contato_comercial',
];

test('migration fecha anon de verdade e preserva somente os quatro contratos publicos', { timeout: 120_000 }, (t) => {
  if (docker(['version', '--format', '{{.Server.Version}}']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }
  if (docker(['run', '--rm', '--name', container, '-e', 'POSTGRES_PASSWORD=postgres', '-d', IMAGE]).status !== 0) {
    t.skip('Imagem PostgreSQL indisponivel (' + IMAGE + ')');
    return;
  }
  t.after(() => docker(['rm', '-f', container]));
  waitReady();

  const bootstrap = [
    'create schema private;',
    'create schema extensions;',
    'create schema auth;',
    'create extension pgcrypto with schema extensions;',
    papeis.map((role) => 'create role ' + role + ';').join('\n'),
    tabelasP1.map((table) => 'create table public.' + table + ' (id integer, unidade_id uuid);').join('\n'),
    'create table public.internal_p4 (id integer);',
    'create sequence public.security_fixture_sequence;',
    'create table public.unidades (id uuid primary key, nome text);',
    'create table public.usuarios (id integer primary key, auth_user_id uuid, ativo boolean, perfil text, unidade_id uuid);',
    'create table public.alunos (id integer primary key, nome text, data_nascimento date);',
    'create table public.leads (id integer primary key, unidade_id uuid);',
    'create table public.leads_campanhas (id bigint generated always as identity primary key, lead_id integer not null, agente_id uuid, campanha_slug text not null, campanha_nome text not null, created_at timestamptz not null default now());',
    'create table public.anamnese_convites (id integer primary key, token text, usado_em timestamptz, revogado_em timestamptz, expira_em timestamptz, unidade_id uuid, nome_aluno text, tipo_formulario text, data_nascimento date, aluno_id integer, telefone_aluno text, criado_por integer, anamnese_id integer);',
    'create table public.anamneses (id integer generated always as identity primary key, aluno_id integer, unidade_id uuid, tipo_formulario text, nome_aluno text, telefone_aluno text, share_token text, entrevistador text, modo_resposta text, status text, vinculo_status text, duracao_segundos integer, created_by integer, genero text, possui_instrumento text, cursos_escolhidos text, objetivos jsonb, tempo_para_metas text, tempo_disponivel_estudo text, experiencia_anterior jsonb, interesse_bandas text, cuidado_medico text, medicacao_continua text, diagnosticos jsonb, necessidade_apoio text, observacoes_entrevistador text, generos_musicais jsonb, instrumentos_toca jsonb, nivel_conhecimento_musical text, nivel_habilidade_instrumento text, motivo_procura_pais jsonb, metas_pais jsonb, fonte_exposicao_musical jsonb, musicos_na_familia boolean, interesse_instrumento_cantar boolean, exposicao_telas text, comunicacao_crianca text, sono_crianca jsonb, estereotipias text, situacao_responsaveis text, filiacao text, quem_traz_crianca jsonb, temperamento_primario varchar, temperamento_secundario varchar, temperamento_codinome varchar, temperamento_contagem jsonb, perfil_baby boolean, created_at timestamptz default now(), diagnosticos_outro text);',
    'create table public.anamnese_respostas_perfil (anamnese_id integer, pergunta_numero integer, resposta_posicao integer);',
    'create function public.is_admin() returns boolean language sql stable as $$ select false $$;',
    "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;",
    'create function public.get_user_unidade_ids() returns setof uuid language sql stable security definer as $$ select null::uuid where false $$;',
    'create function public.is_admin_usuario() returns boolean language sql stable security definer as $$ select false $$;',
    'create function public.get_unidade_usuario() returns uuid language sql stable security definer as $$ select null::uuid $$;',
    'create function public.fn_porteiro_requisicao() returns void language plpgsql security definer as $$ begin return; end $$;',
    'create function public.get_anamnese_publica(p_token text) returns jsonb language sql security definer as $$ select null::jsonb $$;',
    'create function public.get_convite_anamnese(p_token text) returns jsonb language sql security definer as $$ select null::jsonb $$;',
    "create function public.salvar_anamnese_online(p_token text, p_respostas jsonb, p_perfil jsonb default '{}'::jsonb) returns jsonb language sql security definer as $$ select null::jsonb $$;",
    'create function public.internal_anon_fn() returns integer language sql as $$ select 1 $$;',
    'create function public.internal_anon_trigger() returns trigger language plpgsql as $$ begin return new; end $$;',
    'grant all on table public.leads_campanhas to anon, authenticated, service_role;',
    'grant all on table public.calendario_escolar to anon, authenticated, service_role;',
    'grant insert, update, delete on table public.internal_p4 to anon;',
    'grant usage, select, update on sequence public.security_fixture_sequence to anon;',
    'alter default privileges for role postgres in schema public grant all on tables to anon;',
    'alter default privileges for role postgres in schema public grant execute on functions to anon;',
    'alter default privileges for role postgres in schema public grant usage, select, update on sequences to anon;',
    'alter default privileges for role supabase_admin in schema public grant all on tables to anon;',
    'alter default privileges for role supabase_admin in schema public grant execute on functions to anon;',
    'grant supabase_admin to postgres;',
    "insert into public.unidades (id, nome) values ('11111111-1111-1111-1111-111111111111', 'teste');",
    "insert into public.usuarios (id, auth_user_id, ativo, perfil, unidade_id) values (1, '22222222-2222-2222-2222-222222222222', true, 'operador', '11111111-1111-1111-1111-111111111111');",
    "insert into public.anamneses (id, unidade_id, status, share_token, created_at) overriding system value values (700, '11111111-1111-1111-1111-111111111111', 'completa', '11111111111111111111111111111111', now() - interval '400 days');",
  ].join('\n');
  sql(bootstrap);
  sql(readFileSync(migrationPath, 'utf8'));
  sql(readFileSync(correctionPath, 'utf8'));
  sql(readFileSync(sequenceMigrationPath, 'utf8'));
  assert.ok(existsSync(shareTokenMigrationPath), 'a migration de validade do share_token deve existir');
  sql(readFileSync(shareTokenMigrationPath, 'utf8'));
  sql('create sequence public.security_default_sequence;');

  const tableList = tabelasP1.map((table) => "'" + table + "'").join(',');
  const evidence = sql([
    'select json_build_object(',
    "'leads_anon_insert', has_table_privilege('anon', 'public.leads_campanhas', 'INSERT'),",
    "'calendario_anon_select', has_table_privilege('anon', 'public.calendario_escolar', 'SELECT'),",
    "'p4_anon_insert', has_table_privilege('anon', 'public.internal_p4', 'INSERT'),",
    "'fixture_sequence_anon_usage', has_sequence_privilege('anon', 'public.security_fixture_sequence', 'USAGE'),",
    "'fixture_sequence_anon_select', has_sequence_privilege('anon', 'public.security_fixture_sequence', 'SELECT'),",
    "'fixture_sequence_anon_update', has_sequence_privilege('anon', 'public.security_fixture_sequence', 'UPDATE'),",
    "'default_sequence_anon_usage', has_sequence_privilege('anon', 'public.security_default_sequence', 'USAGE'),",
    "'internal_anon_execute', has_function_privilege('anon', 'public.internal_anon_fn()', 'EXECUTE'),",
    "'trigger_anon_execute', has_function_privilege('anon', 'public.internal_anon_trigger()', 'EXECUTE'),",
    "'public_anamnese_execute', has_function_privilege('anon', 'public.get_anamnese_publica(text)', 'EXECUTE'),",
    "'public_anamnese_internal_execute', has_function_privilege('fabio_agent', 'public.get_anamnese_publica(text)', 'EXECUTE'),",
    "'app_anon_functions', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE') and not exists (select 1 from pg_depend d join pg_extension e on e.oid = d.refobjid where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')),",
    "'definer_sem_path', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, array[]::text[])) c where c like 'search_path=%')),",
    "'p1_sem_rls', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = any (array[" + tableList + "]) and not c.relrowsecurity),",
    "'default_anon_tables', (select count(*) from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a where d.defaclnamespace = 'public'::regnamespace and d.defaclobjtype = 'r' and a.grantee = 'anon'::regrole),",
    "'default_anon_sequences', (select count(*) from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a where d.defaclnamespace = 'public'::regnamespace and d.defaclobjtype = 'S' and d.defaclrole = 'postgres'::regrole and a.grantee in ('anon'::regrole, 0))",
    ')::text;',
  ].join('\n'));
  assert.deepEqual(JSON.parse(evidence), {
    leads_anon_insert: false,
    calendario_anon_select: false,
    p4_anon_insert: false,
    fixture_sequence_anon_usage: false,
    fixture_sequence_anon_select: false,
    fixture_sequence_anon_update: false,
    default_sequence_anon_usage: false,
    internal_anon_execute: false,
    trigger_anon_execute: false,
    public_anamnese_execute: true,
    public_anamnese_internal_execute: false,
    app_anon_functions: 4,
    definer_sem_path: 0,
    p1_sem_rls: 0,
    default_anon_tables: 0,
    default_anon_sequences: 0,
  });

  // Casos publicos indistinguiveis e operacao autenticada ficam na mesma
  // transacao descartavel. O unico salvamento de anamnese ocorre como anon.
  assert.match(sql([
    'begin;',
    "insert into public.anamneses (id, unidade_id, status, share_token, created_at, share_token_expira_em) overriding system value values (701, '11111111-1111-1111-1111-111111111111', 'completa', '22222222222222222222222222222222', now(), now() + interval '1 day');",
    "insert into public.anamneses (id, unidade_id, status, share_token, created_at, share_token_expira_em) overriding system value values (702, '11111111-1111-1111-1111-111111111111', 'completa', '33333333333333333333333333333333', now() - interval '2 days', now() - interval '1 day');",
    "insert into public.anamneses (id, unidade_id, status, share_token, created_at, share_token_expira_em, share_token_revogado_em) overriding system value values (703, '11111111-1111-1111-1111-111111111111', 'completa', '44444444444444444444444444444444', now(), now() + interval '1 day', now());",
    "insert into public.anamnese_convites (id, token, expira_em, unidade_id, nome_aluno, tipo_formulario) values (900, '55555555555555555555555555555555', now() + interval '1 day', '11111111-1111-1111-1111-111111111111', 'teste', 'EMLA');",
    'set local role authenticated;',
    "do $$ begin begin perform public.regenerar_anamnese_share_token(701); raise exception 'OPERADOR_SEM_SESSAO_AUTORIZADO'; exception when insufficient_privilege then null; end; end $$;",
    "set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';",
    "with r as (select public.regenerar_anamnese_share_token(701) as result) select set_config('test.share_token', r.result ->> 'token', true) from r;",
    'reset role;',
    "do $$ begin if not exists (select 1 from public.anamneses where id = 700 and share_token_expira_em between now() + interval '29 days' and now() + interval '31 days') then raise exception 'LEGADO_SEM_PRAZO_MINIMO'; end if; if not exists (select 1 from public.anamneses where id = 701 and share_token_expira_em between now() + interval '89 days' and now() + interval '91 days') then raise exception 'NOVO_SEM_PRAZO_90_DIAS'; end if; end $$;",
    'set local role anon;',
    "do $$ begin if public.get_anamnese_publica('ffffffffffffffffffffffffffffffff') is not null then raise exception 'DESCONHECIDO_EXPOSTO'; end if; if public.get_anamnese_publica('33333333333333333333333333333333') is not null then raise exception 'EXPIRADO_EXPOSTO'; end if; if public.get_anamnese_publica('44444444444444444444444444444444') is not null then raise exception 'REVOGADO_EXPOSTO'; end if; if public.get_anamnese_publica('22222222222222222222222222222222') is not null then raise exception 'TOKEN_ANTIGO_EXPOSTO'; end if; if public.get_anamnese_publica(current_setting('test.share_token')) is null then raise exception 'TOKEN_REGENERADO_NAO_ACESSIVEL'; end if; end $$;",
    "select public.salvar_anamnese_online('55555555555555555555555555555555', '{}'::jsonb, '{}'::jsonb);",
    'reset role;',
    "do $$ begin if not exists (select 1 from public.anamneses where share_token_expira_em between now() + interval '89 days' and now() + interval '91 days' and share_token_revogado_em is null) then raise exception 'FLUXO_NOVO_SEM_PRAZO_90_DIAS'; end if; end $$;",
    'set local role authenticated;',
    'select public.revogar_anamnese_share_token(701);',
    'set local role anon;',
    "do $$ begin if public.get_anamnese_publica(current_setting('test.share_token')) is not null then raise exception 'TOKEN_REVOGADO_EXPOSTO'; end if; end $$;",
    'rollback;',
    "select 'share_token_lifecycle_rolled_back';",
  ].join('\n')), /share_token_lifecycle_rolled_back$/);

  // A unica tentativa de escrita anon roda em transacao e sempre e desfeita.
  assert.match(sql([
    'begin;',
    'set local role anon;',
    'do $$ begin begin',
    "insert into public.leads_campanhas (lead_id, campanha_slug, campanha_nome) values (-2147483648, 'probe', 'probe');",
    "raise exception 'ESCRITA_ANON_INESPERADA';",
    'exception when insufficient_privilege or with_check_option_violation then null; end; end $$;',
    'rollback;',
    "select 'anon_write_denied_and_rolled_back';",
  ].join('\n')), /anon_write_denied_and_rolled_back$/);

  assert.match(sql([
    'begin;',
    "set local request.headers = '{\"cf-connecting-ip\":\"203.0.113.7\"}';",
    'do $$ declare i integer; begin',
    "for i in 1..30 loop perform public.get_convite_anamnese('00000000000000000000000000000000'); end loop;",
    'begin perform public.get_convite_anamnese(\'00000000000000000000000000000000\'); raise exception \'RATE_LIMIT_NAO_APLICADO\';',
    "exception when sqlstate 'PT429' then null; end;",
    "begin perform public.salvar_anamnese_online('00000000000000000000000000000000', '[]'::jsonb, '{}'::jsonb); raise exception 'VALIDACAO_NAO_APLICADA';",
    "exception when sqlstate '22023' then null; end;",
    'end $$;',
    'rollback;',
    "select 'rate_limit_and_input_validation_rolled_back';",
  ].join('\n')), /rate_limit_and_input_validation_rolled_back$/);
});
