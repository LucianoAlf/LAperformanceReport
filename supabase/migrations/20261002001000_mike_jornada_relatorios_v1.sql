-- Mike: quatro fachadas read-only e sanitizadas para jornada, mídia, professores e radar.
-- Produção: NÃO aplicar sem revisão do gate. Rollback pareado em supabase/rollbacks/.
-- Fontes de jornada/campanha continuam parciais; as respostas carregam cobertura e ressalvas.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'mike_mcp') then
    raise exception 'papel mike_mcp ausente; criar credencial fora desta migration';
  end if;
end $$;

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

create or replace function public.mike_ads_funil_campanha_v1(
  p_inicio date,
  p_fim date,
  p_plataforma text default null,
  p_campanha text default null
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare v_resultado jsonb;
begin
  if session_user::text not in ('mike_mcp','postgres','supabase_admin')
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'acesso_negado' using errcode = '42501';
  end if;
  if p_inicio is null or p_fim is null or p_fim <= p_inicio or p_fim - p_inicio > 370 then
    return jsonb_build_object('ok', false, 'erro', 'periodo_invalido');
  end if;
  with gasto as (
    select a.plataforma,a.campanha_id,a.campanha_nome,a.moeda,
      sum(a.gasto) gasto,sum(a.impressoes)::bigint impressoes,sum(a.cliques)::bigint cliques,
      sum(a.conversoes_plataforma) conversoes_plataforma,max(a.dia) frescor
    from public.vw_ads_gasto_diario_v1 a
    where a.dia>=p_inicio and a.dia<p_fim
      and (nullif(btrim(p_plataforma),'') is null or lower(a.plataforma)=lower(btrim(p_plataforma)))
      and (nullif(btrim(p_campanha),'') is null or a.campanha_id=p_campanha or lower(a.campanha_nome)=lower(btrim(p_campanha)))
    group by a.plataforma,a.campanha_id,a.campanha_nome,a.moeda
  ), atrib as (
    select lower(btrim(j.campanha_meta)) chave,count(*)::int leads,
      count(*) filter(where j.experimentais_realizadas>0)::int realizadas,
      count(*) filter(where j.converteu)::int matriculas
    from public.vw_jornada_lead_v1 j
    where j.entrou_em>=p_inicio and j.entrou_em<p_fim
      and j.meta_ad_source_id is not null and j.campanha_meta is not null
    group by 1
  ), linhas as (
    select g.*,coalesce(a.leads,0) leads,coalesce(a.realizadas,0) realizadas,coalesce(a.matriculas,0) matriculas
    from gasto g left join atrib a on g.plataforma='meta' and a.chave=lower(btrim(g.campanha_nome))
  )
  select jsonb_build_object(
    'ok',true,'versao','mike_ads_funil_campanha_v1','periodo',jsonb_build_object('inicio',p_inicio,'fim_exclusivo',p_fim),
    'campanhas',coalesce(jsonb_agg(jsonb_build_object(
      'plataforma',plataforma,'campanha_id',campanha_id,'campanha',campanha_nome,'moeda',moeda,
      'gasto',gasto,'impressoes',impressoes,'cliques',cliques,'conversoes_plataforma',conversoes_plataforma,
      'leads_atribuicao_direta',leads,'experimentais_atribuicao_direta',realizadas,'matriculas_atribuicao_direta',matriculas,
      'cpl_direto',case when leads>0 then round(gasto/leads,2) end,
      'custo_por_experimental_direto',case when realizadas>=5 then round(gasto/realizadas,2) end,
      'custo_por_matricula',null,
      'status_atribuicao',case when plataforma<>'meta' or leads<10 then 'insuficiente' else 'parcial' end,
      'frescor',frescor
    ) order by gasto desc),'[]'::jsonb),
    'ressalvas',jsonb_build_array(
      'Meta usa vínculo direto do anúncio e casamento exato do nome da campanha; cobertura global continua parcial.',
      'Google não fecha campanha até matrícula; métricas de jornada ficam zeradas e insuficientes.',
      'CPA/CAC permanece não calculável enquanto a cobertura não fechar; conversão da plataforma não é matrícula.'
    )
  ) into v_resultado from linhas;
  return v_resultado;
end;
$$;

create or replace function public.mike_professores_conversao_v1(
  p_ano integer,
  p_mes_inicio integer,
  p_mes_fim integer,
  p_unidade text default null,
  p_amostra_min integer default 5
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare v_unidade uuid; v_resultado jsonb;
begin
  if session_user::text not in ('mike_mcp','postgres','supabase_admin')
     and coalesce(auth.role(), '') <> 'service_role' then raise exception 'acesso_negado' using errcode='42501'; end if;
  if p_ano not between 2020 and 2100 or p_mes_inicio not between 1 and 12 or p_mes_fim not between p_mes_inicio and 12 or p_amostra_min not between 5 and 100 then
    return jsonb_build_object('ok',false,'erro','parametros_invalidos');
  end if;
  if nullif(btrim(p_unidade),'') is not null then
    select id into v_unidade from public.unidades where codigo=upper(btrim(p_unidade));
    if v_unidade is null then return jsonb_build_object('ok',false,'erro','unidade_invalida'); end if;
  end if;
  with base as (
    select * from public.get_experimentais_professor_canonicos_v1(v_unidade,p_ano,p_mes_inicio,p_mes_fim)
  )
  select jsonb_build_object(
    'ok',true,'versao','mike_professores_conversao_v1','amostra_min',p_amostra_min,
    'professores',coalesce(jsonb_agg(jsonb_build_object(
      'professor_id',professor_id,'professor',professor_nome,'unidade',unidade_nome,
      'realizadas',realizadas_emusys,'faltas',faltas_emusys,'canceladas',canceladas_emusys,
      'matriculas_pos_experimental',matriculas_pos_exp,'taxa_exp_para_matricula_pct',taxa_exp_mat
    ) order by realizadas_emusys desc,matriculas_pos_exp desc) filter(where realizadas_emusys>=p_amostra_min),'[]'::jsonb),
    'celulas_suprimidas',count(*) filter(where realizadas_emusys<p_amostra_min),
    'ressalvas',jsonb_build_array('Só experimental realizada pelo professor entra no denominador.','Amostras menores que o corte não viram ranking.','Uso interno; dado de colaborador não deve ser publicado.')
  ) into v_resultado from base;
  return v_resultado;
end;
$$;

create or replace function public.mike_padroes_marketing_v1(p_limite integer default 20)
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare v_resultado jsonb;
begin
  if session_user::text not in ('mike_mcp','postgres','supabase_admin')
     and coalesce(auth.role(), '') <> 'service_role' then raise exception 'acesso_negado' using errcode='42501'; end if;
  if p_limite not between 1 and 50 then return jsonb_build_object('ok',false,'erro','limite_invalido'); end if;
  with p as (
    select rp.codigo,rp.titulo,rp.aprendizado,rp.amostra_n,rp.periodo_medido,rp.confianca,rp.metodo,rp.medido_em,rp.versao,rp.dominio,
      (select jsonb_agg(jsonb_build_object('codigo',rr.codigo,'titulo',rr.titulo,'orientacao',rr.orientacao_padrao) order by rr.codigo)
       from public.radar_regras rr where rr.ativo and rr.padrao_codigo=rp.codigo) regras
    from public.radar_padroes rp
    where rp.ativo and coalesce(rp.visibilidade,'interna')<>'restrita' and coalesce(rp.dominio,'marketing') in ('marketing','comercial')
    order by rp.medido_em desc limit p_limite
  )
  select jsonb_build_object(
    'ok',true,'versao','mike_padroes_marketing_v1',
    'padroes',coalesce(jsonb_agg(jsonb_build_object(
      'codigo',codigo,'titulo',titulo,'aprendizado',aprendizado,'amostra_n',amostra_n,'periodo',periodo_medido,
      'confianca',confianca,'metodo',metodo,'medido_em',medido_em,'versao_padrao',versao,'dominio',dominio,
      'status','ativo','proxima_revisao_ate',(medido_em + interval '90 days')::date,'regras',coalesce(regras,'[]'::jsonb)
    ) order by medido_em desc),'[]'::jsonb),
    'frescor_radar',(select max(concluida_em) from public.radar_rodadas),
    'ressalvas',jsonb_build_array('Não retorna sinais por pessoa, identificação ou evidência bruta.','Padrão é hipótese revalidável, não verdade permanente.')
  ) into v_resultado from p;
  return v_resultado;
end;
$$;

revoke all on function public.mike_jornada_resumo_v1(date,date,text,text) from public,anon,authenticated;
revoke all on function public.mike_ads_funil_campanha_v1(date,date,text,text) from public,anon,authenticated;
revoke all on function public.mike_professores_conversao_v1(integer,integer,integer,text,integer) from public,anon,authenticated;
revoke all on function public.mike_padroes_marketing_v1(integer) from public,anon,authenticated;
grant execute on function public.mike_jornada_resumo_v1(date,date,text,text) to mike_mcp,service_role;
grant execute on function public.mike_ads_funil_campanha_v1(date,date,text,text) to mike_mcp,service_role;
grant execute on function public.mike_professores_conversao_v1(integer,integer,integer,text,integer) to mike_mcp,service_role;
grant execute on function public.mike_padroes_marketing_v1(integer) to mike_mcp,service_role;

comment on function public.mike_jornada_resumo_v1(date,date,text,text) is 'Mike: coorte agregada da jornada; sem PII; fonte diagnóstica e cobertura explícita.';
comment on function public.mike_ads_funil_campanha_v1(date,date,text,text) is 'Mike: gasto e atribuição direta parcial por campanha; CPA bloqueado enquanto cobertura não fecha.';
comment on function public.mike_professores_conversao_v1(integer,integer,integer,text,integer) is 'Mike: wrapper da conversão canônica por professor com corte mínimo de amostra.';
comment on function public.mike_padroes_marketing_v1(integer) is 'Mike: padrões ativos do radar sem sinais por pessoa nem evidência bruta.';
