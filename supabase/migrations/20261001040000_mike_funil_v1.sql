-- Mike v2 (marketing, Hermes): leitura do funil comercial por canal, só números agregados.
-- Não cria métrica nova: embrulha a fonte canônica kpis_comercial_v2_sem_cache_20260923 (somente leitura, STABLE),
-- a mesma que alimenta get_kpis_comercial_canonicos_v2, sem gravar cache.
-- Crachá mike_mcp: sem acesso a tabela; só executa esta função. Login/senha definidos fora do repo.
-- Aprovado pelo Alf em 2026-10-01 ("começa pelo A"). Rollback: supabase/rollbacks/20261001040000_mike_funil_v1_ROLLBACK.sql
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'mike_mcp') then
    create role mike_mcp nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
end $$;

create or replace function public.mike_funil_v1(p_ano integer, p_mes integer, p_unidade text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_unidade uuid;
  v jsonb;
begin
  if p_ano is null or p_mes is null or p_mes not between 1 and 12 or p_ano not between 2020 and 2100 then
    return jsonb_build_object('ok', false, 'erro', 'periodo_invalido', 'dica', 'Informe ano (ex.: 2026) e mês (1 a 12).');
  end if;
  if p_unidade is not null and btrim(p_unidade) <> '' then
    select u.id into v_unidade from public.unidades u where u.codigo = upper(btrim(p_unidade));
    if v_unidade is null then
      return jsonb_build_object('ok', false, 'erro', 'unidade_invalida', 'unidades_validas', jsonb_build_array('CG', 'REC', 'BARRA'));
    end if;
  end if;

  v := public.kpis_comercial_v2_sem_cache_20260923(v_unidade, p_ano, p_mes, 'mensal', null);

  return jsonb_build_object(
    'ok', true,
    'fonte', 'LA Report · funil comercial canônico (' || coalesce(v->>'versao', 'sem versão') || ')',
    'periodo', v->'periodo',
    'escopo', coalesce(v->'escopo'->>'unidade_nome', 'Consolidado'),
    'kpis', v->'kpis',
    'por_canal', coalesce(v->'origem_canal', '[]'::jsonb),
    'por_unidade', v->'por_unidade',
    'cursos_mais_procurados', coalesce(v->'cursos_mais_procurados', '[]'::jsonb),
    'alertas_de_dado', v->'gaps',
    'como_ler', jsonb_build_array(
      'Experimental realizada só conta com presença individual confirmada; o número por status operacional é diagnóstico.',
      'Matrícula comercial por canal ainda não tem vínculo lead→aluno confiável: zero por canal não quer dizer que o canal não matricula.',
      'Matrícula comercial por unidade é diagnóstico em validação, não KPI final.',
      '"Sem canal" é lead sem origem registrada: é falha de cadastro, não um canal.'
    )
  );
end;
$$;

revoke all on function public.mike_funil_v1(integer, integer, text) from public, anon, authenticated;
grant execute on function public.mike_funil_v1(integer, integer, text) to mike_mcp, service_role;
