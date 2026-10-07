-- Mike: funil canônico por janela arbitrária de datas (semana ou qualquer intervalo).
-- Mesma régua da mike_funil_v2, montada sobre as mesmas fontes:
--   - métricas por data de evento: soma dia a dia da kpis_comercial_v2_sem_cache_20260923
--     ('diario') + get_conciliacao_experimentais_v2 ('diario'). Aditividade medida em
--     produção (set/2026): leads 777, agendadas 153, realizadas 126, canceladas 42,
--     visitas 35 e matrículas 60 somam exatamente o mensal.
--   - matrículas/tickets/passaporte: get_matriculas_comerciais_resumo_v1 no intervalo
--     exato (janela [inicio, fim), fim exclusivo) — réguas P11/P12 e ticket §6.6.
-- NÃO aditivas (ficam marcadas metodo='soma_diaria_diagnostica'): denominador de
-- confirmadas, conversões exp→mat e pendências — a atribuição P21 é por competência
-- (pessoa única + cap mensal). Em set/2026: soma diária 16 conv / 114 denom vs
-- oficiais 37 / 115. Para decisão de taxa exp→mat usar a mike_funil_v2 do mês.
-- Semana não tem snapshot oficial: fechado sai sempre false e os números são vivos.
-- Limite de 62 dias por chamada (cada dia dispara 2 chamadas canônicas pesadas).
-- Produção: NÃO aplicar sem revisão. Rollback pareado em supabase/rollbacks/.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'mike_mcp') then
    raise exception 'papel mike_mcp ausente; criar credencial fora desta migration';
  end if;
end $$;

create or replace function public.mike_funil_semana_v1(
  p_inicio date,
  p_fim_exclusivo date,
  p_unidade text default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_unidade uuid;
  v_nome text := 'Rede (CG + REC + BARRA)';
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dias int;
  d date;
  k jsonb;
  conc jsonb;
  r jsonb;
  v_leads int := 0;
  v_agendadas int := 0;
  v_realizadas int := 0;
  v_presenca int := 0;
  v_faltas int := 0;
  v_canceladas int := 0;
  v_visitas int := 0;
  v_sem_presenca int := 0;
  v_mat_sem_lead int := 0;
  v_denominador int := 0;
  v_conversoes int := 0;
  v_pendencias int := 0;
  v_canais_raw jsonb := '[]'::jsonb;
  v_cursos_raw jsonb := '[]'::jsonb;
  v_canais jsonb;
  v_cursos jsonb;
begin
  if session_user::text not in ('mike_mcp','postgres','supabase_admin')
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'acesso_negado' using errcode = '42501';
  end if;
  if p_inicio is null or p_fim_exclusivo is null or p_fim_exclusivo <= p_inicio then
    return jsonb_build_object('ok', false, 'erro', 'periodo_invalido');
  end if;
  -- cada dia dispara duas chamadas pesadas (sem_cache + conciliação); 62 dias cobre
  -- qualquer semana + mês civil inteiro e limita o custo por chamada.
  if p_fim_exclusivo - p_inicio > 62 then
    return jsonb_build_object('ok', false, 'erro', 'periodo_longo_demais', 'limite_dias', 62);
  end if;
  if nullif(btrim(p_unidade), '') is not null then
    select u.id, u.nome into v_unidade, v_nome
      from public.unidades u where u.codigo = upper(btrim(p_unidade));
    if v_unidade is null then
      return jsonb_build_object('ok', false, 'erro', 'unidade_invalida',
        'unidades_validas', jsonb_build_array('CG', 'REC', 'BARRA'));
    end if;
  end if;
  v_dias := p_fim_exclusivo - p_inicio;

  for d in select generate_series(p_inicio, p_fim_exclusivo - interval '1 day', interval '1 day')::date loop
    k := public.kpis_comercial_v2_sem_cache_20260923(
           v_unidade, extract(year from d)::int, extract(month from d)::int, 'diario', d);
    if k is null or coalesce((k->>'ok')::boolean, true) = false then
      continue;
    end if;
    v_leads      := v_leads      + coalesce((k->'kpis'->>'leads_entrantes')::int, 0);
    v_agendadas  := v_agendadas  + coalesce((k->'kpis'->>'experimentais_agendadas_periodo')::int, 0);
    v_realizadas := v_realizadas + coalesce((k->'kpis'->>'experimentais_realizadas_status_operacional')::int, 0);
    v_presenca   := v_presenca   + coalesce((k->'kpis'->>'experimentais_realizadas_presenca_confirmada')::int, 0);
    v_faltas     := v_faltas     + coalesce((k->'kpis'->>'experimentais_no_show')::int, 0);
    v_canceladas := v_canceladas + coalesce((k->'kpis'->>'experimentais_canceladas')::int, 0);
    v_visitas    := v_visitas    + coalesce((k->'kpis'->>'visitas')::int, 0);
    v_sem_presenca := v_sem_presenca
                   + coalesce((k->'kpis'->>'experimentais_realizadas_status_operacional_sem_presenca')::int, 0);
    v_mat_sem_lead := v_mat_sem_lead
                   + coalesce((k->'kpis'->>'matriculas_sem_lead_vinculado')::int, 0);
    v_canais_raw := v_canais_raw || coalesce(k->'origem_canal', '[]'::jsonb);
    v_cursos_raw := v_cursos_raw || coalesce(k->'cursos_mais_procurados', '[]'::jsonb);

    -- o gate da conciliação reconhece o login real mike_mcp (session_user)
    conc := public.get_conciliacao_experimentais_v2(
              v_unidade, extract(year from d)::int, extract(month from d)::int, 'diario', d);
    if conc is not null then
      v_denominador := v_denominador + coalesce((conc->'resumo'->>'denominador_taxa_exp_mat')::int, 0);
      v_conversoes  := v_conversoes  + coalesce((conc->'resumo'->>'conversoes_exp_mat_canonicas')::int, 0);
      v_pendencias  := v_pendencias  + coalesce((conc->'resumo'->>'pendencias_taxa_exp_mat')::int, 0);
    end if;
  end loop;

  r := public.get_matriculas_comerciais_resumo_v1(v_unidade, p_inicio, p_fim_exclusivo, now());

  with flat as (
    select e->>'canal' canal, e
      from jsonb_array_elements(v_canais_raw) e
  ), agg as (
    select canal,
      sum(coalesce((e->>'leads')::int, 0))::int leads,
      sum(coalesce((e->>'leads_convertidos_operacional')::int, 0))::int conv,
      sum(coalesce((e->>'matriculas_comerciais_principais')::int, 0))::int mat
    from flat group by canal
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'canal', a.canal, 'leads', a.leads,
           'leads_convertidos_operacional', a.conv,
           'matriculas_comerciais_principais', a.mat,
           'canais_originais', a.originais
         ) order by a.leads desc, a.canal), '[]'::jsonb)
    into v_canais
    from (
      select agg.canal, agg.leads, agg.conv, agg.mat,
        coalesce(
          (select jsonb_agg(distinct o.value order by o.value)
             from flat f2,
                  jsonb_array_elements_text(coalesce(f2.e->'canais_originais', '[]'::jsonb)) o(value)
            where f2.canal = agg.canal),
          to_jsonb(array[agg.canal])) originais
      from agg
    ) a;

  select coalesce(jsonb_agg(jsonb_build_object(
           'curso', curso, 'leads', leads,
           'matriculas_comerciais_principais', mat
         ) order by leads desc, curso), '[]'::jsonb)
    into v_cursos
    from (
      select e->>'curso' curso,
        sum(coalesce((e->>'leads')::int, 0))::int leads,
        sum(coalesce((e->>'matriculas_comerciais_principais')::int, 0))::int mat
      from jsonb_array_elements(v_cursos_raw) e
      group by 1
    ) x;

  return jsonb_build_object(
    'ok', true,
    'versao', 'mike_funil_semana_v1',
    'escopo', v_nome,
    'periodo', jsonb_build_object(
      'inicio', p_inicio, 'fim_exclusivo', p_fim_exclusivo, 'dias', v_dias,
      'tipo', 'janela_custom', 'competencias_cobertas',
      (select jsonb_agg(to_char(mm, 'MM/YYYY') order by mm)
         from generate_series(date_trunc('month', p_inicio)::date,
                              (p_fim_exclusivo - interval '1 day')::date,
                              interval '1 month') mm)
    ),
    'fechado', false,
    'fonte', 'ao vivo: não existe fechamento oficial semanal; métricas por data de evento somam dia a dia a mesma fonte do relatório diário (comercial_v2 transacional); matrículas, tickets e passaporte pelo resumo comercial canônico no intervalo exato',
    'gerado_em', now(),
    'kpis', jsonb_build_object(
      'leads', v_leads,
      'experimentais_agendadas', v_agendadas,
      'experimentais_realizadas', v_realizadas,
      'experimentais_confirmadas', v_denominador,
      'experimentais_presenca_confirmada_crm', v_presenca,
      'visitas', v_visitas,
      'faltas', v_faltas,
      'canceladas', v_canceladas,
      'conversoes_exp_mat', v_conversoes,
      'pendencias_conciliacao', v_pendencias,
      'matriculas', coalesce((r->>'matriculas')::int, 0),
      'total_parcelas', coalesce((r->>'total_parcelas')::numeric, 0),
      'total_passaportes', coalesce((r->>'total_passaportes')::numeric, 0),
      'ticket_medio_parcela', r->'ticket_medio_parcela',
      'ticket_medio_passaporte', r->'ticket_medio_passaporte'
    ),
    'funil', jsonb_build_object(
      'lead_para_experimental', round(100.0 * v_realizadas / nullif(v_leads, 0), 1),
      'experimental_para_matricula', round(100.0 * v_conversoes / nullif(v_denominador, 0), 1),
      'lead_para_matricula', round(100.0 * coalesce((r->>'matriculas')::int, 0) / nullif(v_leads, 0), 1),
      'experimental_para_matricula_base', jsonb_build_object(
        'conversoes', v_conversoes,
        'denominador', v_denominador,
        'pendencias', v_pendencias,
        'metodo', 'soma_diaria_diagnostica'
      )
    ),
    'canais_do_periodo', v_canais,
    'cursos_do_periodo', v_cursos,
    'metas', null,
    'qualidade_do_dado', jsonb_build_object(
      'experimentais_realizadas_sem_presenca_confirmada', v_sem_presenca,
      'matriculas_sem_lead_vinculado', v_mat_sem_lead
    ),
    'ressalvas', jsonb_build_array(
      'Semana não tem snapshot oficial: tudo aqui é vivo e pode mudar com retroalimentação.',
      'Conversões, denominador de confirmadas e pendências são soma diária da conciliação (metodo=soma_diaria_diagnostica): a atribuição canônica exp→mat é por competência (pessoa única + cap mensal) e NÃO decompõe em semana — em set/2026 a soma diária deu 16/114/0 vs oficiais 37/115/1. Para a taxa oficial use a mike_funil_v2 do mês.',
      'Faltas podem divergir do mensal em ±1 evento por data de efeito do status (set/2026: 36 somadas vs 35 oficiais).',
      'Metas são mensais por unidade — não existem metas semanais para comparar.',
      'Nenhuma linha, nome, telefone, e-mail ou identificador pessoal é retornado.'
    ),
    'definicoes', jsonb_build_object(
      'experimentais_realizadas', 'status operacional do CRM (experimental_realizada ou convertido) — a mesma chave da v2 canônica',
      'experimentais_confirmadas', 'soma diária do denominador da taxa experimental→matrícula (conciliação v2) — diagnóstico, ver ressalva',
      'experimentais_presenca_confirmada_crm', 'marca de presença individual no CRM — cobertura parcial, não é o denominador oficial'
    ),
    'como_ler', jsonb_build_array(
      'p_fim_exclusivo NÃO entra na janela: a semana 25/09 a 01/10 se pede com fim = 2026-10-02.',
      'Leads, agendadas, realizadas, canceladas, visitas e matrículas são por data de evento e somam o mensal quando as semanas cobrem o mês inteiro.',
      'A taxa experimental→matrícula semanal é diagnóstica (soma diária); a oficial é mensal por competência.',
      '"Sem canal" é lead sem origem registrada: falha de cadastro, não canal.',
      'Matrícula por canal ainda não tem vínculo lead→aluno confiável: zero por canal não quer dizer que o canal não matricula.'
    )
  );
end;
$$;

revoke all on function public.mike_funil_semana_v1(date, date, text) from public, anon, authenticated;
grant execute on function public.mike_funil_semana_v1(date, date, text) to mike_mcp, service_role;

comment on function public.mike_funil_semana_v1(date, date, text) is
  'Mike: funil canônico por janela de datas (fim exclusivo); mesma régua da v2 via soma diária; exp→mat é diagnóstico; sem PII.';
