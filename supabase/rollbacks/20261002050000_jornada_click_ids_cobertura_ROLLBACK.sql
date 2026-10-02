-- Rollback de 20261002050000_jornada_click_ids_cobertura.sql
-- Recria a view sem as flags tem_gclid/tem_meta_ctwa_clid (create or replace não remove
-- colunas — por isso drop+create; dependências são só plpgsql, resolvidas em runtime)
-- e restaura a função na versão do PR anterior (união de agendamento, sem click_ids).

drop view public.vw_jornada_lead_v1;

create or replace view public.vw_jornada_lead_v1 as
 WITH exp AS (
         SELECT le.lead_id,
            count(*) AS aulas_experimentais,
            min(le.data_experimental) AS primeira_experimental,
            max(le.data_experimental) AS ultima_experimental,
            count(*) FILTER (WHERE le.status::text = ANY (ARRAY['experimental_realizada'::text, 'convertido'::text])) AS exp_realizadas,
            count(*) FILTER (WHERE le.status::text = 'experimental_faltou'::text) AS exp_faltas,
            count(*) FILTER (WHERE le.status::text = 'cancelada'::text) AS exp_canceladas,
            count(*) FILTER (WHERE le.status::text = 'experimental_agendada'::text) AS exp_agendadas
           FROM lead_experimentais le
          WHERE le.lead_id IS NOT NULL
          GROUP BY le.lead_id
        ), camp AS (
         SELECT lc.lead_id,
            min(lc.created_at) AS primeira_campanha_em,
            string_agg(DISTINCT lc.campanha_nome, ' | '::text) AS campanhas
           FROM leads_campanhas lc
          GROUP BY lc.lead_id
        ), insta AS (
         SELECT s.telefone_chave,
            min(s.iniciada_em) AS ig_primeira_em,
            max(s.ultima_atividade_em) AS ig_ultima_em,
            bool_or(s.transferido) AS ig_transferido,
            (array_agg(s.conta ORDER BY s.ultima_atividade_em DESC))[1] AS ig_conta,
            (array_agg(s.estagio ORDER BY s.ultima_atividade_em DESC))[1] AS ig_estagio,
            (array_agg(s.interesse ORDER BY s.ultima_atividade_em DESC))[1] AS ig_interesse
           FROM instagram_sessoes s
          WHERE s.telefone_chave IS NOT NULL
          GROUP BY s.telefone_chave
        ), base AS (
         SELECT l_1.*,
            (l_1.data_primeiro_contato AT TIME ZONE 'America/Sao_Paulo'::text)::date AS d_primeiro_contato,
            (l_1.data_ultimo_contato AT TIME ZONE 'America/Sao_Paulo'::text)::date AS d_ultimo_contato,
            (l_1.created_at AT TIME ZONE 'America/Sao_Paulo'::text)::date AS d_criado,
            (now() AT TIME ZONE 'America/Sao_Paulo'::text)::date AS hoje_brt
           FROM leads l_1
        )
 SELECT l.id AS lead_id, l.nome, l.telefone,
    fn_normalizar_telefone_br_key(l.telefone::text) AS telefone_chave,
    l.unidade_id, u.nome AS unidade_nome, l.curso_interesse_id,
    cur.nome AS curso_interesse, co.nome AS canal_origem,
    l.meta_ad_source_id, ads.ad_name AS anuncio, ads.campaign_name AS campanha_meta,
    camp.campanhas AS campanhas_whatsapp,
    ins.ig_conta AS instagram_conta, ins.ig_interesse AS instagram_interesse,
    ins.ig_estagio AS instagram_estagio, ins.ig_transferido AS instagram_transferido,
    COALESCE(l.data_contato, l.d_criado) AS entrou_em,
    l.data_primeiro_contato AS primeiro_contato_em,
    l.data_passagem_mila AS passagem_mila_em,
    l.data_experimental AS experimental_agendada_para,
    exp.primeira_experimental AS experimental_real_em,
    l.data_conversao AS convertido_em, l.data_arquivamento AS arquivado_em,
    l.data_ultimo_contato AS ultimo_contato_em,
        CASE
            WHEN l.converteu THEN 'convertido'::text
            WHEN l.status::text = 'arquivado'::text OR l.data_arquivamento IS NOT NULL THEN 'perdido'::text
            -- FONTE CANÔNICA manda quando existe linha
            WHEN COALESCE(exp.aulas_experimentais, 0::bigint) > 0 THEN
            CASE
                WHEN COALESCE(exp.exp_realizadas, 0::bigint) > 0 THEN 'experimental_realizada'::text
                WHEN COALESCE(exp.exp_faltas, 0::bigint) > 0 THEN 'experimental_faltou'::text
                WHEN COALESCE(exp.exp_agendadas, 0::bigint) > 0 THEN 'experimental_agendada'::text
                ELSE 'em_atendimento'::text
            END
            -- resgate para quem não tem NENHUMA linha canônica (histórico antigo)
            WHEN l.experimental_realizada THEN 'experimental_realizada'::text
            WHEN l.faltou_experimental THEN 'experimental_faltou'::text
            WHEN l.experimental_agendada OR l.data_experimental IS NOT NULL THEN 'experimental_agendada'::text
            WHEN l.data_primeiro_contato IS NOT NULL THEN 'em_atendimento'::text
            ELSE 'novo'::text
        END AS etapa,
    l.d_primeiro_contato - COALESCE(l.data_contato, l.d_criado) AS dias_ate_primeiro_contato,
    l.hoje_brt - GREATEST(COALESCE(l.d_ultimo_contato, '-infinity'::date), COALESCE(l.d_primeiro_contato, '-infinity'::date), COALESCE(l.data_experimental, '-infinity'::date), COALESCE(l.data_contato, '-infinity'::date), COALESCE(l.d_criado, '-infinity'::date)) AS dias_parado,
    l.hoje_brt - COALESCE(l.data_contato, l.d_criado) AS dias_no_funil,
    COALESCE(exp.aulas_experimentais, 0::bigint) AS aulas_experimentais,
    COALESCE(exp.exp_realizadas, 0::bigint) AS experimentais_realizadas,
    COALESCE(exp.exp_faltas, 0::bigint) AS experimentais_faltou,
    prof.nome AS professor_experimental,
    l.converteu, l.aluno_id, l.motivo_nao_matricula, l.temperatura,
    l.agente_comercial, l.status AS status_bruto, l.created_at,
    COALESCE(exp.exp_canceladas, 0::bigint) AS experimentais_canceladas,
    COALESCE(exp.exp_agendadas, 0::bigint) AS experimentais_agendadas,
    exp.ultima_experimental AS ultima_experimental_em
   FROM base l
     LEFT JOIN unidades u ON u.id = l.unidade_id
     LEFT JOIN canais_origem co ON co.id = l.canal_origem_id
     LEFT JOIN cursos cur ON cur.id = l.curso_interesse_id
     LEFT JOIN professores prof ON prof.id = l.professor_experimental_id
     LEFT JOIN meta_ads_cache ads ON ads.source_id = l.meta_ad_source_id
     LEFT JOIN exp ON exp.lead_id = l.id
     LEFT JOIN camp ON camp.lead_id = l.id
     LEFT JOIN insta ins ON ins.telefone_chave = fn_normalizar_telefone_br_key(l.telefone::text);


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
      count(*) filter (where experimental_agendada_para is not null or aulas_experimentais > 0)::int leads_com_agendamento,
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
    'definicoes',jsonb_build_object(
      'leads_com_agendamento','evidência de experimental agendada: leads.data_experimental preenchida (agendada_para na view) OU ao menos uma linha em lead_experimentais — toda linha nasce de um agendamento, inclusive cancelada/faltou. Critério anterior (só aulas_experimentais>0) subcontava quem tinha só a data marcada no Emusys.'
    ),
    'ressalvas',jsonb_build_array(
      'Coorte pela entrada do lead; conversões podem ocorrer depois do fim do período.',
      'A view de jornada é diagnóstica: experimental realizada segue o status legado e não substitui o fechamento comercial canônico.',
      'Conversão de lead (vínculo lead→aluno) é KPI separado da matrícula comercial (aluno novo + passaporte, sem bolsista/2º curso/banda); inclui 2º curso, bolsista e leads duplicados do mesmo aluno. Para matrícula, usar o fechamento oficial.',
      'Nenhuma linha, nome, telefone, e-mail ou identificador pessoal é retornado.'
    ),
    'como_ler',jsonb_build_array(
      'p_fim é exclusivo: a semana 25/09 a 01/10 se pede com fim = 2026-10-02.',
      'leads_com_agendamento = qualquer evidência de agendamento (data prevista no lead OU linha em lead_experimentais); ver definicoes.leads_com_agendamento.'
    )
  ) into v_resultado from totais t;
  return v_resultado;
end;
$$;

revoke all on public.vw_jornada_lead_v1 from public, anon, authenticated;
grant select on public.vw_jornada_lead_v1 to authenticated, service_role;
revoke all on function public.mike_jornada_resumo_v1(date,date,text,text) from public,anon,authenticated;
grant execute on function public.mike_jornada_resumo_v1(date,date,text,text) to mike_mcp,service_role;

comment on view public.vw_jornada_lead_v1 is
  'Jornada do lead. etapa: a FONTE CANONICA (lead_experimentais) manda quando existe linha; flags de leads so resgatam quem nao tem nenhuma.';
comment on function public.mike_jornada_resumo_v1(date,date,text,text) is 'Mike: coorte agregada da jornada; sem PII; fonte diagnóstica e cobertura explícita. com_agendamento = agendada_para OU linha de experimental.';
