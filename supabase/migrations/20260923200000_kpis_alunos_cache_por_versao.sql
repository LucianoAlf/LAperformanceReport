-- LAPE-42 · Cache POR VERSAO dos dois KPIs de alunos (Lista de Alunos, Administrativo, Dashboard)
--
-- O QUE E': portas novas get_kpis_alunos_admin_operacional_cache_v1 e
-- get_kpis_alunos_canonicos_cache_v1, com a MESMA assinatura e o MESMO retorno dos originais.
-- Na falta, chamam o original e guardam; na presenca, devolvem o guardado.
--
-- 🔴 POR QUE NAO E' DADO VELHO: a chave carrega uma impressao digital de TODAS as tabelas que
-- a arvore dos dois KPIs le (17 funcoes, levantadas do banco em 23/09/2026), feita dos
-- contadores de insert/update/delete que o proprio Postgres mantem (pg_stat_user_tables).
-- Qualquer escrita em qualquer uma delas muda a chave -> o proximo pedido recalcula.
--   - Sem trigger, sem trava, zero custo de escrita (os contadores ja existem).
--   - Diferente do cache do dashboard (20260924190000), que olha count+max(updated_at) de 3
--     tabelas + prazo de 5 min: aquilo deixa passar UPDATE sem updated_at e tabela fora da lista.
--   - Os contadores sobem na hora do commit, com atraso de ~1 s (ate ~10 s em backend ocioso).
--     A direcao do atraso e' SEGURA: o dado novo fica visivel antes da chave mudar, entao o
--     pior caso e' servir, por esses segundos, o mesmo que um pedido feito um instante antes.
--   - Contador zerado (pg_stat_reset) ou transacao abortada so geram recalculo a mais.
-- A data de hoje em BRT entra na chave: os KPIs usam now() so para a data.
--
-- ACESSO: o original continua checando quem pede (auth.uid() dentro dele). A chave inclui o
-- usuario e o papel, e as tabelas de permissao estao na impressao digital -- perder acesso
-- invalida o cache da pessoa na hora. Erro do original nao e' guardado.
--
-- ⚠️ POR QUE PORTA NOVA E NAO O NOME ORIGINAL: get_situacao_alunos_resumo_v1 (RPC canonica
-- da Sol/TOM/Lia/app) e' STABLE e chama get_kpis_alunos_admin_operacional por dentro. O
-- PostgREST roda STABLE em transacao READ ONLY, e o INSERT do cache la dentro quebraria a
-- situacao do aluno. Funcoes do banco seguem chamando os originais; so as telas usam o cache.
--
-- ⚠️ Ao acrescentar leitura de TABELA NOVA em qualquer funcao da arvore, incluir a tabela em
-- kpis_alunos_cache_impressao_v1 -- senao a mudanca nela nao invalida o cache.
--
-- ROLLBACK (as telas voltam ao original trocando o nome no front):
--   drop function if exists public.get_kpis_alunos_admin_operacional_cache_v1(uuid, integer, integer);
--   drop function if exists public.get_kpis_alunos_canonicos_cache_v1(uuid, integer, integer);
--   drop function if exists public.kpis_alunos_cache_impressao_v1();
--   drop table if exists public.kpis_alunos_cache;

create table public.kpis_alunos_cache (
  cache_key  text primary key,
  funcao     text not null,
  payload    jsonb not null,
  built_at   timestamptz not null default now()
);

comment on table public.kpis_alunos_cache is
  'LAPE-42. Cache por versao dos KPIs de alunos. Chave = funcao + usuario + parametros + data BRT + impressao digital das tabelas lidas (kpis_alunos_cache_impressao_v1). Lido/escrito so pelas funcoes *_cache_v1.';

revoke all on public.kpis_alunos_cache
  from public, anon, authenticated, service_role, mila_acesso_restrito, fabio_agent, lia_acesso_restrito;
alter table public.kpis_alunos_cache enable row level security;

-- Impressao digital: tabelas lidas pela arvore de get_kpis_alunos_admin_operacional e
-- get_kpis_alunos_canonicos (inclusive por dentro de movimentacoes_admin_vigentes e
-- vw_alunos_estado_operacional_v131) + as de permissao usadas na checagem de acesso.
create or replace function public.kpis_alunos_cache_impressao_v1()
returns text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select md5(coalesce(string_agg(
           s.relname || ':' || (s.n_tup_ins + s.n_tup_upd + s.n_tup_del), ',' order by s.relname), ''))
         || ':' || count(*)
  from pg_stat_user_tables s
  where s.schemaname = 'public'
    and s.relname = any (array[
      'aluno_jornada_matricula_disciplina', 'alunos', 'alunos_historico', 'banda',
      'competencias_mensais', 'cursos', 'dados_mensais', 'emusys_matriculas_estado_atual',
      'fechamento_mensal_snapshots', 'movimentacoes', 'movimentacoes_admin',
      'tipos_matricula', 'unidades',
      'usuarios', 'usuario_perfis', 'perfil_permissoes', 'permissoes'
    ])
$$;

create or replace function public.get_kpis_alunos_admin_operacional_cache_v1(
  p_unidade_id uuid default null,
  p_ano integer default (extract(year from (now() at time zone 'America/Sao_Paulo')))::integer,
  p_mes integer default (extract(month from (now() at time zone 'America/Sao_Paulo')))::integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_key     text;
  v_payload jsonb;
begin
  v_key := md5(concat_ws('|',
    'admin_operacional', coalesce(auth.uid()::text, '-'), coalesce(auth.role(), '-'),
    coalesce(p_unidade_id::text, 'consolidado'), p_ano, p_mes,
    (now() at time zone 'America/Sao_Paulo')::date,
    public.kpis_alunos_cache_impressao_v1()));

  select c.payload into v_payload from public.kpis_alunos_cache c where c.cache_key = v_key;
  if found then
    return v_payload;
  end if;

  v_payload := public.get_kpis_alunos_admin_operacional(p_unidade_id, p_ano, p_mes);

  if v_payload is not null then
    insert into public.kpis_alunos_cache (cache_key, funcao, payload)
    values (v_key, 'admin_operacional', v_payload)
    on conflict (cache_key) do nothing;
    delete from public.kpis_alunos_cache where built_at < now() - interval '1 day';
  end if;

  return v_payload;
end;
$$;

create or replace function public.get_kpis_alunos_canonicos_cache_v1(
  p_unidade_id uuid default null,
  p_ano integer default (extract(year from (now() at time zone 'America/Sao_Paulo')))::integer,
  p_mes integer default (extract(month from (now() at time zone 'America/Sao_Paulo')))::integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_key     text;
  v_payload jsonb;
begin
  v_key := md5(concat_ws('|',
    'canonicos', coalesce(auth.uid()::text, '-'), coalesce(auth.role(), '-'),
    coalesce(p_unidade_id::text, 'consolidado'), p_ano, p_mes,
    (now() at time zone 'America/Sao_Paulo')::date,
    public.kpis_alunos_cache_impressao_v1()));

  select c.payload into v_payload from public.kpis_alunos_cache c where c.cache_key = v_key;
  if found then
    return v_payload;
  end if;

  v_payload := public.get_kpis_alunos_canonicos(p_unidade_id, p_ano, p_mes);

  if v_payload is not null then
    insert into public.kpis_alunos_cache (cache_key, funcao, payload)
    values (v_key, 'canonicos', v_payload)
    on conflict (cache_key) do nothing;
    delete from public.kpis_alunos_cache where built_at < now() - interval '1 day';
  end if;

  return v_payload;
end;
$$;

revoke all on function public.kpis_alunos_cache_impressao_v1() from public, anon, authenticated;
revoke all on function public.get_kpis_alunos_admin_operacional_cache_v1(uuid, integer, integer) from public, anon;
revoke all on function public.get_kpis_alunos_canonicos_cache_v1(uuid, integer, integer) from public, anon;
grant execute on function public.get_kpis_alunos_admin_operacional_cache_v1(uuid, integer, integer) to authenticated, service_role;
grant execute on function public.get_kpis_alunos_canonicos_cache_v1(uuid, integer, integer) to authenticated, service_role;

-- ── Guarda de saida ─────────────────────────────────────────────────────────────────────
do $$
declare
  v_falhas text[] := '{}';
begin
  if has_function_privilege('anon', 'public.get_kpis_alunos_admin_operacional_cache_v1(uuid,integer,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_kpis_alunos_canonicos_cache_v1(uuid,integer,integer)', 'EXECUTE') then
    v_falhas := v_falhas || 'porta de cache executavel por anon'::text;
  end if;
  if has_table_privilege('authenticated', 'public.kpis_alunos_cache', 'SELECT')
     or has_table_privilege('anon', 'public.kpis_alunos_cache', 'SELECT') then
    v_falhas := v_falhas || 'tabela de cache legivel por anon/authenticated'::text;
  end if;
  if exists (select 1 from pg_proc where proname in ('get_kpis_alunos_admin_operacional_cache_v1', 'get_kpis_alunos_canonicos_cache_v1')
             and provolatile <> 'v') then
    v_falhas := v_falhas || 'porta de cache precisa ser VOLATILE (grava)'::text;
  end if;
  -- As 17 tabelas precisam existir, senao a impressao digital fica cega para uma delas.
  if (select split_part(public.kpis_alunos_cache_impressao_v1(), ':', 2))::int <> 17 then
    v_falhas := v_falhas || ('impressao digital cobre ' || split_part(public.kpis_alunos_cache_impressao_v1(), ':', 2) || ' de 17 tabelas')::text;
  end if;
  if array_length(v_falhas, 1) > 0 then
    raise exception E'GUARDA kpis_alunos_cache:\n  %', array_to_string(v_falhas, E'\n  ');
  end if;
end $$;
