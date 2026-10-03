-- Rollback de 20261002040000_jornada_com_agendamento_canonico.sql
-- Restaura o def vigente de mike_jornada_resumo_v1 (critério aulas_experimentais > 0,
-- sem os blocos definicoes/como_ler).

create or replace function public.mike_jornada_resumo_v1(
  p_inicio date,
  p_fim date,
  p_unidade text default null,
  p_canal text default null
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  v_unidade uuid;
  v_resultado jsonb;
begin
  if session_user::text not in ('mike_mcp','postgres','supabase_admin')
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'acesso_negado' using errcode = '42501';
  end if;
  if p_inicio is null or p_fim is null or p_fim <= p_inicio or p_fim - p_inicio > 370 then
    return jsonb_build_object('ok', false, 'erro', 'periodo_invalido');
  end if;
  if nullif(btrim(p_unidade), '') is not null then
    select u.id into v_unidade from public.unidades u where u.codigo = upper(btrim(p_unidade));
    if v_unidade is null then
      return jsonb_build_object('ok', false, 'erro', 'unidade_invalida');
    end if;
  end if;

  with base as (
    select j.*
    from public.vw_jornada_lead_v1 j
    where j.entrou_em >= p_inicio and j.entrou_em < p_fim
      and (v_unidade is null or j.unidade_id = v_unidade)
      and (nullif(btrim(p_canal), '') is null or lower(j.canal_origem) = lower(btrim(p_canal)))
  ), totais as (
    select count(*)::int leads,
      count(*) filter (where aulas_experimentais > 0)::int leads_com_agendamento,
      count(*) filter (where experimentais_realizadas > 0)::int leads_com_experimental_realizada,
      count(*) filter (where converteu)::int leads_convertidos,
      count(distinct aluno_id) filter (where converteu)::int alunos_convertidos_distintos,
      count(*) filter (where meta_ad_source_id is not null)::int leads_com_id_meta,
      count(*) filter (where campanha_meta is not null)::int leads_com_campanha_meta,
      percentile_cont(0.5) within group (order by (convertido_em-entrou_em))
        filter (where converteu and convertido_em >= entrou_em) as p50_dias,
      percentile_cont(0.75) within group (order by (convertido_em-entrou_em))
        filter (where converteu and convertido_em >= entrou_em) as p75_dias,
      percentile_cont(0.9) within group (order by (convertido_em-entrou_em))
        filter (where converteu and convertido_em >= entrou_em) as p90_dias,
      max(greatest(created_at, ultimo_contato_em)) as frescor
    from base
  ), canais as (
    select coalesce(nullif(btrim(canal_origem),''),'Sem canal') canal, count(*)::int leads,
      count(*) filter (where experimentais_realizadas > 0)::int realizadas,
      count(*) filter (where converteu)::int convertidos
    from base group by 1
  )
  select jsonb_build_object(
    'ok', true, 'versao', 'mike_jornada_resumo_v1',
    'periodo', jsonb_build_object('inicio',p_inicio,'fim_exclusivo',p_fim),
    'escopo', jsonb_build_object('unidade',coalesce(upper(nullif(btrim(p_unidade),'')),'REDE'),'canal',p_canal),
    'totais', jsonb_build_object(
      'leads',t.leads,'leads_com_agendamento',t.leads_com_agendamento,
      'leads_com_experimental_realizada',t.leads_com_experimental_realizada,
      'leads_convertidos',t.leads_convertidos,
      'alunos_convertidos_distintos',t.alunos_convertidos_distintos,
      'taxa_lead_para_experimental_pct',round(100.0*t.leads_com_experimental_realizada/nullif(t.leads,0),1),
      'taxa_lead_para_conversao_pct',round(100.0*t.leads_convertidos/nullif(t.leads,0),1)
    ),
    'tempo_lead_matricula_dias',jsonb_build_object('p50',t.p50_dias,'p75',t.p75_dias,'p90',t.p90_dias),
    'cobertura',jsonb_build_object(
      'id_meta_pct',round(100.0*t.leads_com_id_meta/nullif(t.leads,0),1),
      'campanha_meta_pct',round(100.0*t.leads_com_campanha_meta/nullif(t.leads,0),1),
      'status',case when t.leads=0 then 'sem_dados' when t.leads_com_campanha_meta::numeric/t.leads >= .7 then 'parcial' else 'insuficiente' end
    ),
    'por_canal',coalesce((select jsonb_agg(jsonb_build_object('canal',canal,'leads',leads,'realizadas',realizadas,'convertidos',convertidos) order by leads desc) from canais where leads >= 5),'[]'::jsonb),
    'celulas_suprimidas',coalesce((select sum(leads) from canais where leads < 5),0),
    'frescor',t.frescor,
    'ressalvas',jsonb_build_array(
      'Coorte pela entrada do lead; conversões podem ocorrer depois do fim do período.',
      'A view de jornada é diagnóstica: experimental realizada segue o status legado e não substitui o fechamento comercial canônico.',
      'Conversão de lead (vínculo lead→aluno) é KPI separado da matrícula comercial (aluno novo + passaporte, sem bolsista/2º curso/banda); inclui 2º curso, bolsista e leads duplicados do mesmo aluno. Para matrícula, usar o fechamento oficial.',
      'Nenhuma linha, nome, telefone, e-mail ou identificador pessoal é retornado.'
    )
  ) into v_resultado from totais t;
  return v_resultado;
end;
$$;

comment on function public.mike_jornada_resumo_v1(date,date,text,text) is 'Mike: coorte agregada da jornada; sem PII; fonte diagnóstica e cobertura explícita.';
