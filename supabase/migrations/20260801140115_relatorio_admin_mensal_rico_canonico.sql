-- Enriquece o relatorio mensal administrativo em tempo de leitura, sem alterar
-- snapshots fechados. Julho de 2026 nao capturou trancamentos_periodo; esse
-- unico campo e reconstruido pela fonte canonica com corte e guarda de auditoria.

alter function public.montar_relatorio_admin_mensal_payload_v1(uuid, integer, integer)
  rename to montar_relatorio_admin_mensal_payload_base_v3;

revoke all on function public.montar_relatorio_admin_mensal_payload_base_v3(uuid, integer, integer)
  from public, anon, authenticated, service_role;

create or replace function public.montar_relatorio_admin_mensal_payload_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_payload jsonb;
  v_resumo jsonb;
  v_inicio date := make_date(p_ano, p_mes, 1);
  v_fim_exclusivo date := (make_date(p_ano, p_mes, 1) + interval '1 month')::date;
  v_capturado_em timestamptz;
  v_trancamentos_periodo integer := 0;
  v_evasoes jsonb := '[]'::jsonb;
  v_evasoes_esperadas integer := 0;
  v_evasoes_reconstruidas integer := 0;
begin
  v_payload := public.montar_relatorio_admin_mensal_payload_base_v3(
    p_unidade_id,
    p_ano,
    p_mes
  );
  v_capturado_em := nullif(v_payload->>'capturado_em', '')::timestamptz;

  if v_capturado_em is null then
    raise exception 'RELATORIO_ADMIN_MENSAL_CAPTURA_AUSENTE';
  end if;

  select count(*)::integer
  into v_trancamentos_periodo
  from public.movimentacoes_admin m
  where m.unidade_id = p_unidade_id
    and m.tipo = 'trancamento'
    and coalesce(m.competencia_referencia, m.data) >= v_inicio
    and coalesce(m.competencia_referencia, m.data) < v_fim_exclusivo
    and m.created_at <= v_capturado_em;

  select coalesce(
           jsonb_agg(
             case
               when nullif(trim(coalesce(e.item->>'tipo_evasao', '')), '') is not null then e.item
               when m.id is null then e.item
               else e.item || jsonb_build_object(
                 'tipo_evasao', case
                   when nullif(trim(coalesce(m.tipo_evasao, '')), '') is not null then trim(m.tipo_evasao)
                   when coalesce(a.tipo_matricula_id, 0) = 5 then 'interrompido_banda'
                   when coalesce(a.is_segundo_curso, false)
                     or coalesce(a.tipo_matricula_id, 0) = 2 then 'interrompido_2_curso'
                   when coalesce(a.tipo_matricula_id, 0) in (3, 4) then 'interrompido_bolsista'
                   else 'interrompido'
                 end
               )
             end
             order by e.ord
           ),
           '[]'::jsonb
         ),
         count(*) filter (
           where nullif(trim(coalesce(e.item->>'tipo_evasao', '')), '') is null
         )::integer,
         count(*) filter (
           where nullif(trim(coalesce(e.item->>'tipo_evasao', '')), '') is null
             and m.id is not null
         )::integer
  into v_evasoes, v_evasoes_esperadas, v_evasoes_reconstruidas
  from jsonb_array_elements(coalesce(v_payload->'evasoes', '[]'::jsonb))
    with ordinality e(item, ord)
  left join public.movimentacoes_admin m
    on m.id = nullif(e.item->>'id', '')::bigint
  left join public.alunos a on a.id = m.aluno_id;

  if v_evasoes_reconstruidas <> v_evasoes_esperadas then
    raise exception 'EVASOES_MENSAL_DIVERGENTE';
  end if;

  v_payload := jsonb_set(v_payload, '{evasoes}', v_evasoes, true);

  v_resumo := coalesce(v_payload->'resumo', '{}'::jsonb)
    || jsonb_build_object('trancamentos_periodo', v_trancamentos_periodo);

  return jsonb_set(v_payload, '{resumo}', v_resumo, true);
end;
$function$;

revoke all on function public.montar_relatorio_admin_mensal_payload_v1(uuid, integer, integer)
  from public, anon, authenticated, service_role;

comment on function public.montar_relatorio_admin_mensal_payload_v1(uuid, integer, integer) is
  'Monta futuros payloads mensais administrativos com trancamentos_periodo capturado antes do fechamento.';

create or replace function public.get_relatorio_admin_mensal_rico_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_mensal public.fechamento_mensal_snapshots%rowtype;
  v_admin public.fechamento_mensal_snapshots%rowtype;
  v_gerencial public.fechamento_mensal_snapshots%rowtype;
  v_admin_id uuid;
  v_admin_hash text;
  v_gerencial_id uuid;
  v_gerencial_hash text;
  v_autorizado boolean := false;
  v_inicio date := make_date(p_ano, p_mes, 1);
  v_fim_exclusivo date := (make_date(p_ano, p_mes, 1) + interval '1 month')::date;
  v_financeiro jsonb := '{}'::jsonb;
  v_gestao jsonb := '{}'::jsonb;
  v_retencao jsonb := '{}'::jsonb;
  v_metas jsonb := '{}'::jsonb;
  v_resumo jsonb := '{}'::jsonb;
  v_trancamentos_periodo integer := 0;
  v_alteracoes_trancamentos integer := 0;
  v_evasoes jsonb := '[]'::jsonb;
  v_evasoes_esperadas integer := 0;
  v_evasoes_reconstruidas integer := 0;
  v_alteracoes_evasoes integer := 0;
  v_alunos_pagantes integer := 0;
  v_nao_renovacoes integer := 0;
  v_total_evasoes integer := 0;
  v_evasoes_base integer := 0;
  v_inadimplentes integer := 0;
  v_ticket_medio numeric;
  v_faturamento_previsto numeric;
  v_mrr_atual numeric;
  v_ltv_medio numeric;
  v_tempo_permanencia numeric;
  v_taxa_renovacao numeric;
  v_reajuste_medio numeric;
  v_mrr_perdido numeric;
  v_renovacoes_previstas integer;
  v_churn_rate numeric := 0;
  v_inadimplencia numeric := 0;
  v_payload_rico jsonb;
begin
  if p_unidade_id is null or p_ano is null or p_mes not between 1 and 12 then
    raise exception 'RELATORIO_ADMIN_MENSAL_PARAMETROS_INVALIDOS';
  end if;

  v_autorizado := public.pode_gerar_relatorio_admin_v1(p_unidade_id);
  if auth.role() <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin')
     and coalesce(v_autorizado, false) is not true then
    raise exception 'ACESSO_NEGADO_RELATORIO_MENSAL';
  end if;

  select * into v_mensal
  from public.fechamento_mensal_snapshots s
  where s.unidade_id = p_unidade_id
    and s.ano = p_ano
    and s.mes = p_mes
    and s.escopo = 'unidade'
    and s.dominio = 'relatorio_admin_mensal'
    and s.status = 'fechado'
  order by s.versao desc
  limit 1;

  if v_mensal.id is null
     or v_mensal.payload_hash is null
     or public.hash_jsonb_canonico(v_mensal.payload) <> v_mensal.payload_hash then
    raise exception 'RELATORIO_ADMIN_MENSAL_FECHADO_INVALIDO';
  end if;

  v_admin_id := nullif(v_mensal.payload#>>'{fontes,alunos_admin,snapshot_id}', '')::uuid;
  v_admin_hash := nullif(v_mensal.payload#>>'{fontes,alunos_admin,payload_hash}', '');
  v_gerencial_id := nullif(v_mensal.payload#>>'{fontes,relatorio_gerencial,snapshot_id}', '')::uuid;
  v_gerencial_hash := nullif(v_mensal.payload#>>'{fontes,relatorio_gerencial,payload_hash}', '');

  select * into v_admin
  from public.fechamento_mensal_snapshots s
  where s.id = v_admin_id
    and s.unidade_id = p_unidade_id
    and s.ano = p_ano
    and s.mes = p_mes
    and s.escopo = 'unidade'
    and s.dominio = 'alunos_admin'
    and s.status = 'fechado';

  if v_admin.id is null
     or v_admin.payload_hash is null
     or v_admin.payload_hash <> v_admin_hash
     or public.hash_jsonb_canonico(v_admin.payload) <> v_admin.payload_hash then
    raise exception 'RELATORIO_ADMIN_MENSAL_FONTE_ADMIN_INVALIDA';
  end if;

  select * into v_gerencial
  from public.fechamento_mensal_snapshots s
  where s.id = v_gerencial_id
    and s.unidade_id = p_unidade_id
    and s.ano = p_ano
    and s.mes = p_mes
    and s.escopo = 'unidade'
    and s.dominio = 'relatorio_gerencial'
    and s.status = 'fechado';

  if v_gerencial.id is null
     or v_gerencial.payload_hash is null
     or v_gerencial.payload_hash <> v_gerencial_hash
     or public.hash_jsonb_canonico(v_gerencial.payload) <> v_gerencial.payload_hash then
    raise exception 'RELATORIO_ADMIN_MENSAL_FONTE_GERENCIAL_INVALIDA';
  end if;

  v_resumo := coalesce(v_mensal.payload->'resumo', '{}'::jsonb);

  if coalesce((v_admin.payload->>'alunos_ativos')::integer, -1)
       <> coalesce((v_resumo->>'alunos_ativos')::integer, -2)
     or coalesce((v_admin.payload->>'alunos_pagantes')::integer, -1)
       <> coalesce((v_resumo->>'alunos_pagantes')::integer, -2)
     or coalesce((v_admin.payload->>'matriculas_ativas')::integer, -1)
       <> coalesce((v_resumo->>'matriculas_ativas')::integer, -2) then
    raise exception 'RELATORIO_ADMIN_MENSAL_ESTRUTURA_DIVERGENTE';
  end if;

  if nullif(v_resumo->>'trancamentos_periodo', '') is not null then
    v_trancamentos_periodo := (v_resumo->>'trancamentos_periodo')::integer;
  else
    select count(*)::integer
    into v_alteracoes_trancamentos
    from public.audit_log a
    where a.tabela = 'movimentacoes_admin'
      and a.created_at > v_mensal.capturado_em
      and a.acao in ('INSERT', 'UPDATE', 'DELETE')
      and (
        (
          coalesce(a.dados_antigos->>'unidade_id', '') = p_unidade_id::text
          and coalesce(a.dados_antigos->>'tipo', '') = 'trancamento'
          and coalesce(
            nullif(a.dados_antigos->>'competencia_referencia', '')::date,
            nullif(a.dados_antigos->>'data', '')::date
          ) >= v_inicio
          and coalesce(
            nullif(a.dados_antigos->>'competencia_referencia', '')::date,
            nullif(a.dados_antigos->>'data', '')::date
          ) < v_fim_exclusivo
          and nullif(a.dados_antigos->>'created_at', '')::timestamptz <= v_mensal.capturado_em
        )
        or (
          coalesce(a.dados_novos->>'unidade_id', '') = p_unidade_id::text
          and coalesce(a.dados_novos->>'tipo', '') = 'trancamento'
          and coalesce(
            nullif(a.dados_novos->>'competencia_referencia', '')::date,
            nullif(a.dados_novos->>'data', '')::date
          ) >= v_inicio
          and coalesce(
            nullif(a.dados_novos->>'competencia_referencia', '')::date,
            nullif(a.dados_novos->>'data', '')::date
          ) < v_fim_exclusivo
          and nullif(a.dados_novos->>'created_at', '')::timestamptz <= v_mensal.capturado_em
        )
      );

    if v_alteracoes_trancamentos > 0 then
      raise exception 'TRANCAMENTOS_MENSAL_DIVERGENTE';
    end if;

    select count(*)::integer
    into v_trancamentos_periodo
    from public.movimentacoes_admin m
    where m.unidade_id = p_unidade_id
      and m.tipo = 'trancamento'
      and coalesce(m.competencia_referencia, m.data) >= v_inicio
      and coalesce(m.competencia_referencia, m.data) < v_fim_exclusivo
      and m.created_at <= v_mensal.capturado_em;
  end if;

  select count(*)::integer
  into v_alteracoes_evasoes
  from public.audit_log a
  where a.created_at > v_mensal.capturado_em
    and a.acao in ('INSERT', 'UPDATE', 'DELETE')
    and (
      (
        a.tabela = 'movimentacoes_admin'
        and coalesce(a.registro_id_text, a.registro_id::text) in (
          select e.item->>'id'
          from jsonb_array_elements(coalesce(v_mensal.payload->'evasoes', '[]'::jsonb)) e(item)
          where nullif(trim(coalesce(e.item->>'tipo_evasao', '')), '') is null
        )
        and (
          a.dados_antigos->'tipo_evasao' is distinct from a.dados_novos->'tipo_evasao'
          or a.dados_antigos->'aluno_id' is distinct from a.dados_novos->'aluno_id'
        )
      )
      or (
        a.tabela = 'alunos'
        and coalesce(a.registro_id_text, a.registro_id::text) in (
          select m.aluno_id::text
          from jsonb_array_elements(coalesce(v_mensal.payload->'evasoes', '[]'::jsonb)) e(item)
          join public.movimentacoes_admin m
            on m.id = nullif(e.item->>'id', '')::bigint
          where nullif(trim(coalesce(e.item->>'tipo_evasao', '')), '') is null
        )
        and (
          a.dados_antigos->'tipo_matricula_id' is distinct from a.dados_novos->'tipo_matricula_id'
          or a.dados_antigos->'is_segundo_curso' is distinct from a.dados_novos->'is_segundo_curso'
        )
      )
    );

  if v_alteracoes_evasoes > 0 then
    raise exception 'EVASOES_MENSAL_DIVERGENTE';
  end if;

  select coalesce(
           jsonb_agg(
             case
               when nullif(trim(coalesce(e.item->>'tipo_evasao', '')), '') is not null then e.item
               when m.id is null then e.item
               else e.item || jsonb_build_object(
                 'tipo_evasao', case
                   when nullif(trim(coalesce(m.tipo_evasao, '')), '') is not null then trim(m.tipo_evasao)
                   when coalesce(a.tipo_matricula_id, 0) = 5 then 'interrompido_banda'
                   when coalesce(a.is_segundo_curso, false)
                     or coalesce(a.tipo_matricula_id, 0) = 2 then 'interrompido_2_curso'
                   when coalesce(a.tipo_matricula_id, 0) in (3, 4) then 'interrompido_bolsista'
                   else 'interrompido'
                 end
               )
             end
             order by e.ord
           ),
           '[]'::jsonb
         ),
         count(*) filter (
           where nullif(trim(coalesce(e.item->>'tipo_evasao', '')), '') is null
         )::integer,
         count(*) filter (
           where nullif(trim(coalesce(e.item->>'tipo_evasao', '')), '') is null
             and m.id is not null
         )::integer
  into v_evasoes, v_evasoes_esperadas, v_evasoes_reconstruidas
  from jsonb_array_elements(coalesce(v_mensal.payload->'evasoes', '[]'::jsonb))
    with ordinality e(item, ord)
  left join public.movimentacoes_admin m
    on m.id = nullif(e.item->>'id', '')::bigint
  left join public.alunos a on a.id = m.aluno_id;

  if v_evasoes_reconstruidas <> v_evasoes_esperadas then
    raise exception 'EVASOES_MENSAL_DIVERGENTE';
  end if;

  v_financeiro := coalesce(
    v_gerencial.payload#>'{financeiro_faturas_emusys,totais}',
    v_gerencial.payload#>'{kpis_gestao,0,financeiro_faturas_emusys}',
    v_gerencial.payload#>'{dados_mes_atual,0,financeiro_faturas_emusys}',
    '{}'::jsonb
  );
  v_gestao := case jsonb_typeof(v_gerencial.payload->'kpis_gestao')
    when 'array' then coalesce(v_gerencial.payload->'kpis_gestao'->0, '{}'::jsonb)
    when 'object' then v_gerencial.payload->'kpis_gestao'
    else '{}'::jsonb
  end;
  v_retencao := case jsonb_typeof(v_gerencial.payload->'kpis_retencao')
    when 'array' then coalesce(v_gerencial.payload->'kpis_retencao'->0, '{}'::jsonb)
    when 'object' then v_gerencial.payload->'kpis_retencao'
    else '{}'::jsonb
  end;

  if jsonb_typeof(v_gerencial.payload->'metas_kpi') = 'object' then
    v_metas := v_gerencial.payload->'metas_kpi';
  elsif jsonb_typeof(v_gerencial.payload->'metas_kpi') = 'array' then
    select coalesce(
      jsonb_object_agg(item->>'tipo', to_jsonb((item->>'valor')::numeric)),
      '{}'::jsonb
    )
    into v_metas
    from jsonb_array_elements(v_gerencial.payload->'metas_kpi') item
    where nullif(item->>'tipo', '') is not null
      and nullif(item->>'valor', '') is not null;
  end if;

  if not (v_metas ?& array['churn_rate', 'inadimplencia', 'taxa_renovacao', 'reajuste_medio']) then
    raise exception 'RELATORIO_ADMIN_MENSAL_METAS_AUSENTES';
  end if;

  v_alunos_pagantes := coalesce((v_resumo->>'alunos_pagantes')::integer, 0);
  v_nao_renovacoes := coalesce((v_resumo->>'nao_renovacoes')::integer, 0);
  v_total_evasoes := coalesce((v_resumo->>'evasoes')::integer, 0);
  v_evasoes_base := coalesce((v_retencao->>'evasoes_base_alunos')::integer, 0);
  v_inadimplentes := coalesce((v_gestao->>'inadimplentes')::integer, 0);
  v_ticket_medio := nullif(v_financeiro->>'ticket_medio', '')::numeric;
  v_faturamento_previsto := nullif(v_financeiro->>'faturamento_previsto', '')::numeric;
  v_mrr_atual := nullif(v_financeiro->>'mrr_atual', '')::numeric;
  v_ltv_medio := nullif(v_gestao->>'ltv_medio', '')::numeric;
  v_tempo_permanencia := coalesce(
    nullif(v_gestao->>'tempo_permanencia_medio', '')::numeric,
    nullif(v_gestao->>'tempo_permanencia', '')::numeric
  );
  v_taxa_renovacao := nullif(v_retencao->>'taxa_renovacao', '')::numeric;
  v_reajuste_medio := coalesce(
    nullif(v_gestao->>'reajuste_medio', '')::numeric,
    nullif(v_gestao->>'reajuste_pct', '')::numeric
  );
  v_mrr_perdido := nullif(v_retencao->>'mrr_perdido', '')::numeric;
  v_renovacoes_previstas := nullif(v_retencao->>'renovacoes_previstas', '')::integer;

  if v_ticket_medio is null
     or v_faturamento_previsto is null
     or v_mrr_atual is null
     or v_ltv_medio is null
     or v_tempo_permanencia is null
     or v_taxa_renovacao is null
     or v_reajuste_medio is null
     or v_mrr_perdido is null
     or v_renovacoes_previstas is null then
    raise exception 'RELATORIO_ADMIN_MENSAL_INDICADORES_AUSENTES';
  end if;

  if v_alunos_pagantes > 0 then
    v_churn_rate := round(
      (v_evasoes_base + v_nao_renovacoes)::numeric / v_alunos_pagantes * 100,
      2
    );
    v_inadimplencia := round(
      v_inadimplentes::numeric / v_alunos_pagantes * 100,
      2
    );
  end if;

  v_payload_rico := v_mensal.payload || jsonb_build_object(
    'evasoes', v_evasoes,
    'trancamentos_periodo', v_trancamentos_periodo,
    'indicadores_financeiros', jsonb_build_object(
      'ticket_medio', v_ticket_medio,
      'faturamento_previsto', v_faturamento_previsto,
      'mrr_atual', v_mrr_atual,
      'ltv_medio', v_ltv_medio,
      'tempo_permanencia', v_tempo_permanencia
    ),
    'indicadores_retencao', jsonb_build_object(
      'churn_rate', v_churn_rate,
      'taxa_renovacao', v_taxa_renovacao,
      'reajuste_medio', v_reajuste_medio,
      'inadimplentes', v_inadimplentes,
      'inadimplencia', v_inadimplencia,
      'mrr_perdido', v_mrr_perdido,
      'total_evasoes', v_total_evasoes,
      'nao_renovacoes', v_nao_renovacoes,
      'renovacoes_previstas', v_renovacoes_previstas,
      'renovacoes_realizadas', coalesce((v_resumo->>'renovacoes_realizadas')::integer, 0)
    ),
    'metas_fideliza', v_metas
  );

  return jsonb_build_object(
    'snapshot_id', v_mensal.id,
    'payload_hash', v_mensal.payload_hash,
    'versao', v_mensal.versao,
    'status', v_mensal.status,
    'payload', v_payload_rico
  );
end;
$function$;

revoke all on function public.get_relatorio_admin_mensal_rico_v1(uuid, integer, integer)
  from public, anon;
grant execute on function public.get_relatorio_admin_mensal_rico_v1(uuid, integer, integer)
  to authenticated, service_role;

comment on function public.get_relatorio_admin_mensal_rico_v1(uuid, integer, integer) is
  'Leitura rica do mensal administrativo: valida snapshots fechados e reconstrui apenas trancamentos_periodo sob guarda de auditoria.';
