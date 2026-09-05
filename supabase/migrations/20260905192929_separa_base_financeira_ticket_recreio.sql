-- Separa duas fotografias que a retificacao de 05/09/2026 acoplou por engano:
--   * alunos_pagantes: KPI administrativo do fechamento de alunos;
--   * ticket_denominador_pagantes: universo financeiro congelado usado no ticket.
--
-- A correcao e global no leitor e pontual no backfill de agosto/Recreio. Os
-- snapshots fechados anteriores continuam imutaveis; novas versoes guardam a
-- retificacao e sua auditoria. A tabela dados_mensais recebe campos aditivos,
-- porque sua coluna gerada faturamento_estimado ainda depende da formula antiga.

begin;

alter table public.dados_mensais
  add column if not exists ticket_denominador_pagantes integer,
  add column if not exists ticket_medio_contratual numeric(12, 2),
  add column if not exists mrr_contratual numeric(14, 2);

comment on column public.dados_mensais.ticket_denominador_pagantes is
  'Universo financeiro congelado usado exclusivamente como denominador do ticket medio contratual; nao equivale a alunos ativos nem a alunos_pagantes administrativo.';
comment on column public.dados_mensais.ticket_medio_contratual is
  'Ticket medio do fechamento financeiro canonico. Campo aditivo para nao acoplar a metrica a faturamento_estimado gerado pelo legado.';
comment on column public.dados_mensais.mrr_contratual is
  'Receita contratual congelada do fechamento financeiro, incluindo parcelas pagas e inadimplentes conforme a regra canonica.';

create or replace function public.aplicar_financeiro_ticket_contratual_v3(
  p_base jsonb,
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
  v_vivo jsonb;
  v_result jsonb;
  v_por_unidade jsonb;
  v_totais jsonb;
  v_faturamento_total numeric;
  v_ticket_denominador_total numeric;
begin
  v_vivo := public.aplicar_financeiro_ticket_contratual_v1(p_base, p_ano, p_mes);

  if coalesce((v_vivo->>'tem_dados')::boolean, false) is not true
     or jsonb_typeof(v_vivo->'por_unidade') <> 'array' then
    return v_vivo;
  end if;

  with unidades as (
    select
      (value->>'unidade_id')::uuid as unidade_id,
      value as payload_unidade
    from jsonb_array_elements(v_vivo->'por_unidade')
    where nullif(value->>'unidade_id', '') is not null
  ), fechamentos as (
    select distinct on (s.unidade_id)
      s.unidade_id,
      coalesce(
        nullif(s.payload#>>'{financeiro_ticket_contratual,mrr_contratual}', '')::numeric,
        nullif(s.payload->>'faturamento_previsto', '')::numeric,
        nullif(s.payload->>'mrr', '')::numeric
      ) as faturamento_fechado,
      coalesce(
        nullif(s.payload#>>'{financeiro_ticket_contratual,ticket_denominador_pagantes}', '')::numeric,
        nullif(s.payload->>'ticket_denominador_pagantes', '')::numeric,
        nullif(s.payload#>>'{financeiro_ticket_contratual,alunos_pagantes_canonicos}', '')::numeric,
        nullif(s.payload->>'alunos_pagantes_canonicos', '')::numeric,
        nullif(s.payload->>'alunos_pagantes', '')::numeric
      ) as ticket_denominador_pagantes
    from public.fechamento_mensal_snapshots s
    join unidades u on s.unidade_id = u.unidade_id
    where s.ano = p_ano
      and s.mes = p_mes
      and s.escopo = 'unidade'
      and s.dominio = 'alunos_executivo'
      and s.status = 'fechado'
    order by
      s.unidade_id,
      s.versao desc,
      s.fechado_em desc nulls last,
      s.created_at desc
  ), calculada as (
    select
      u.unidade_id,
      case
        when f.faturamento_fechado > 0
         and f.ticket_denominador_pagantes > 0 then
          u.payload_unidade || jsonb_build_object(
            'faturamento_previsto', round(f.faturamento_fechado, 2),
            'ticket_medio', round(f.faturamento_fechado / f.ticket_denominador_pagantes, 2),
            'ticket_medio_previsto', round(f.faturamento_fechado / f.ticket_denominador_pagantes, 2),
            'ticket_denominador_pagantes', f.ticket_denominador_pagantes,
            'alunos_pagantes_canonicos', f.ticket_denominador_pagantes,
            'fonte_denominador_ticket', 'fechamento_mensal_snapshots.alunos_executivo.financeiro_ticket_contratual.ticket_denominador_pagantes',
            'fonte_receita_ticket', 'fechamento_mensal_snapshots.alunos_executivo.financeiro_ticket_contratual.mrr_contratual',
            'regra_ticket_medio', 'competencia fechada: receita contratual congelada com pagas e inadimplentes / denominador financeiro congelado'
          )
        else u.payload_unidade
      end as payload_final,
      coalesce(
        f.faturamento_fechado,
        nullif(u.payload_unidade->>'faturamento_previsto', '')::numeric,
        0::numeric
      ) as faturamento_final,
      coalesce(
        f.ticket_denominador_pagantes,
        nullif(u.payload_unidade->>'ticket_denominador_pagantes', '')::numeric,
        nullif(u.payload_unidade->>'alunos_pagantes_canonicos', '')::numeric,
        0::numeric
      ) as ticket_denominador_final
    from unidades u
    left join fechamentos f on f.unidade_id = u.unidade_id
  )
  select
    coalesce(
      jsonb_agg(payload_final order by payload_final->>'unidade_nome'),
      '[]'::jsonb
    ),
    coalesce(sum(faturamento_final), 0),
    coalesce(sum(ticket_denominador_final), 0)
  into v_por_unidade, v_faturamento_total, v_ticket_denominador_total
  from calculada;

  v_totais := coalesce(v_vivo->'totais', '{}'::jsonb)
    || jsonb_build_object(
      'faturamento_previsto', round(v_faturamento_total, 2),
      'ticket_medio', case
        when v_ticket_denominador_total > 0
          then round(v_faturamento_total / v_ticket_denominador_total, 2)
        else 0::numeric
      end,
      'ticket_medio_previsto', case
        when v_ticket_denominador_total > 0
          then round(v_faturamento_total / v_ticket_denominador_total, 2)
        else 0::numeric
      end,
      'ticket_denominador_pagantes', v_ticket_denominador_total,
      'alunos_pagantes_canonicos', v_ticket_denominador_total,
      'fonte_denominador_ticket', 'fechamento mensal financeiro quando a competencia esta fechada',
      'fonte_receita_ticket', 'fechamento mensal financeiro quando a competencia esta fechada',
      'regra_ticket_medio', 'competencia fechada preserva receita e denominador financeiros; competencia aberta usa leitura viva contratual'
    );

  v_result := jsonb_set(v_vivo, '{por_unidade}', v_por_unidade, true);
  v_result := jsonb_set(v_result, '{totais}', v_totais, true);
  return v_result;
end;
$function$;

revoke all on function public.aplicar_financeiro_ticket_contratual_v3(jsonb, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.aplicar_financeiro_ticket_contratual_v3(jsonb, uuid, integer, integer)
  to service_role;

create or replace function public.get_financeiro_faturas_emusys(
  p_unidade_id uuid default null::uuid,
  p_ano integer default (extract(year from (now() at time zone 'America/Sao_Paulo')))::integer,
  p_mes integer default (extract(month from (now() at time zone 'America/Sao_Paulo')))::integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_base jsonb;
begin
  v_base := public.get_financeiro_faturas_emusys_base_ticket_contratual_v1(
    p_unidade_id,
    p_ano,
    p_mes
  );

  return public.aplicar_financeiro_ticket_contratual_v3(
    v_base,
    p_unidade_id,
    p_ano,
    p_mes
  );
end;
$function$;

revoke all on function public.get_financeiro_faturas_emusys(uuid, integer, integer)
  from public, anon;
grant execute on function public.get_financeiro_faturas_emusys(uuid, integer, integer)
  to authenticated, service_role;

comment on function public.get_financeiro_faturas_emusys(uuid, integer, integer) is
  'Competencia fechada usa receita e denominador financeiros congelados, independentes dos KPIs administrativos de ativos e pagantes.';

create or replace function public.get_relatorio_admin_mensal_rico_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_resultado jsonb;
  v_gerencial public.fechamento_mensal_snapshots%rowtype;
  v_gerencial_payload jsonb;
  v_retificacao public.fechamento_mensal_retificacoes%rowtype;
  v_retificacao_id uuid := null;
  v_gerencial_id uuid;
  v_gerencial_hash text;
  v_totais jsonb;
  v_faturas jsonb;
  v_pagantes_relatorio integer;
  v_pagantes_fonte integer;
  v_ticket_denominador_pagantes integer;
  v_mrr numeric;
  v_ticket numeric;
  v_faturamento_previsto numeric;
  v_faturamento_realizado numeric;
  v_faturado_emusys numeric;
  v_ltv numeric;
  v_permanencia numeric;
  v_financeiro jsonb;
  v_fideliza public.programa_fideliza_config%rowtype;
  v_metas_fideliza jsonb;
begin
  v_resultado := public.get_relatorio_admin_mensal_rico_base_v3(p_unidade_id, p_ano, p_mes);

  v_gerencial_id := nullif(v_resultado#>>'{payload,fontes,relatorio_gerencial,snapshot_id}', '')::uuid;
  v_gerencial_hash := nullif(v_resultado#>>'{payload,fontes,relatorio_gerencial,payload_hash}', '');

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
    raise exception 'RELATORIO_ADMIN_MENSAL_FONTE_FINANCEIRA_INVALIDA';
  end if;

  v_gerencial_payload := v_gerencial.payload;

  select * into v_retificacao
  from public.fechamento_mensal_retificacoes r
  where r.snapshot_id = v_gerencial.id
    and r.base_payload_hash = v_gerencial.payload_hash
  order by r.created_at desc
  limit 1;

  if v_retificacao.id is not null then
    if public.hash_jsonb_canonico(v_retificacao.payload_corrigido) <> v_retificacao.payload_corrigido_hash then
      raise exception 'RELATORIO_ADMIN_MENSAL_RETIFICACAO_CORROMPIDA';
    end if;
    v_gerencial_payload := v_retificacao.payload_corrigido;
    v_retificacao_id := v_retificacao.id;
  end if;

  v_totais := v_gerencial_payload#>'{kpis_alunos_canonicos,totais}';
  if jsonb_typeof(v_totais) <> 'object' then
    raise exception 'RELATORIO_ADMIN_MENSAL_BASE_FINANCEIRA_AUSENTE';
  end if;

  v_faturas := coalesce(
    v_gerencial_payload#>'{financeiro_faturas_emusys,totais}',
    v_gerencial_payload#>'{kpis_gestao,0,financeiro_faturas_emusys}',
    v_gerencial_payload#>'{dados_mes_atual,0,financeiro_faturas_emusys}',
    '{}'::jsonb
  );
  if jsonb_typeof(v_faturas) <> 'object' or v_faturas = '{}'::jsonb then
    raise exception 'RELATORIO_ADMIN_MENSAL_FONTE_FATURAS_AUSENTE';
  end if;

  v_pagantes_relatorio := nullif(v_resultado#>>'{payload,resumo,alunos_pagantes}', '')::integer;
  v_pagantes_fonte := coalesce(
    nullif(v_totais->>'alunos_pagantes', '')::integer,
    nullif(v_totais->>'total_alunos_pagantes', '')::integer
  );
  v_ticket_denominador_pagantes := coalesce(
    nullif(v_gerencial_payload#>>'{financeiro_ticket_contratual,ticket_denominador_pagantes}', '')::integer,
    nullif(v_faturas->>'ticket_denominador_pagantes', '')::integer,
    nullif(v_faturas->>'alunos_pagantes_canonicos', '')::integer
  );
  v_mrr := coalesce(
    nullif(v_totais->>'mrr', '')::numeric,
    nullif(v_totais->>'mrr_atual', '')::numeric
  );
  v_ticket := nullif(v_totais->>'ticket_medio', '')::numeric;
  v_faturamento_previsto := nullif(v_totais->>'faturamento_previsto', '')::numeric;
  v_faturamento_realizado := nullif(v_faturas->>'mrr_atual', '')::numeric;
  v_faturado_emusys := nullif(v_faturas->>'faturamento_previsto', '')::numeric;
  v_ltv := nullif(v_totais->>'ltv_medio', '')::numeric;
  v_permanencia := coalesce(
    nullif(v_totais->>'tempo_permanencia_medio', '')::numeric,
    nullif(v_totais->>'tempo_permanencia', '')::numeric
  );

  if v_pagantes_relatorio is null or v_pagantes_fonte is null
     or v_ticket_denominador_pagantes is null or v_mrr is null
     or v_ticket is null or v_faturamento_previsto is null
     or v_faturamento_realizado is null or v_faturado_emusys is null
     or v_ltv is null or v_permanencia is null then
    raise exception 'RELATORIO_ADMIN_MENSAL_BASE_FINANCEIRA_INCOMPLETA';
  end if;

  if v_pagantes_relatorio <> v_pagantes_fonte then
    raise exception 'RELATORIO_ADMIN_MENSAL_PAGANTES_DIVERGENTES';
  end if;
  if v_ticket_denominador_pagantes <= 0 then
    raise exception 'RELATORIO_ADMIN_MENSAL_DENOMINADOR_TICKET_INVALIDO';
  end if;
  if round(v_mrr / v_ticket_denominador_pagantes, 2) <> round(v_ticket, 2) then
    raise exception 'RELATORIO_ADMIN_MENSAL_TICKET_DIVERGENTE';
  end if;
  if round(v_faturamento_previsto, 2) <> round(v_mrr, 2) then
    raise exception 'RELATORIO_ADMIN_MENSAL_MRR_DIVERGENTE';
  end if;
  if round(v_faturamento_realizado, 2) > round(v_faturado_emusys, 2) then
    raise exception 'RELATORIO_ADMIN_MENSAL_REALIZADO_ACIMA_DO_FATURADO';
  end if;
  if least(v_mrr, v_ticket, v_faturamento_previsto, v_faturamento_realizado,
           v_faturado_emusys, v_ltv, v_permanencia) < 0 then
    raise exception 'RELATORIO_ADMIN_MENSAL_FINANCEIRO_NEGATIVO';
  end if;

  v_financeiro := jsonb_build_object(
    'ticket_medio', v_ticket,
    'ticket_denominador_pagantes', v_ticket_denominador_pagantes,
    'alunos_pagantes_administrativos', v_pagantes_relatorio,
    'faturamento_previsto', v_faturamento_previsto,
    'faturamento_realizado', v_faturamento_realizado,
    'faturado_emusys', v_faturado_emusys,
    'mrr_atual', v_mrr,
    'ltv_medio', v_ltv,
    'tempo_permanencia', v_permanencia,
    'fonte', 'kpis_alunos_canonicos.totais + financeiro_ticket_contratual + financeiro_faturas_emusys',
    'semantica_pagantes', 'KPI administrativo; nao e o denominador do ticket',
    'semantica_denominador_ticket', 'universo financeiro congelado da competencia',
    'semantica_mrr', 'base_contratual_ativa',
    'semantica_realizado', 'faturas_de_parcela_pagas_na_competencia',
    'semantica_faturado_emusys', 'faturas_de_parcela_pagas_e_em_aberto',
    'retificacao_id', v_retificacao_id
  );

  v_resultado := jsonb_set(v_resultado, '{payload,indicadores_financeiros}', v_financeiro, true);
  v_resultado := jsonb_set(
    v_resultado,
    '{payload,indicadores_retencao,inadimplentes}',
    coalesce(v_gerencial_payload#>'{kpis_gestao,0,inadimplentes}', '0'::jsonb),
    true
  );
  v_resultado := jsonb_set(
    v_resultado,
    '{payload,indicadores_retencao,inadimplencia}',
    coalesce(v_gerencial_payload#>'{kpis_gestao,0,inadimplencia}', '0'::jsonb),
    true
  );

  select * into v_fideliza from public.programa_fideliza_config c where c.ano = p_ano;
  if v_fideliza.ano is null then
    raise exception 'RELATORIO_ADMIN_MENSAL_FIDELIZA_CONFIG_AUSENTE';
  end if;

  v_metas_fideliza := jsonb_build_object(
    'churn_rate', v_fideliza.meta_churn_maximo,
    'inadimplencia', v_fideliza.meta_inadimplencia_maxima,
    'taxa_renovacao', v_fideliza.meta_renovacao_minima,
    'reajuste_medio', v_fideliza.meta_reajuste_minimo,
    'fonte', 'programa_fideliza_config',
    'ano_config', v_fideliza.ano
  );

  return jsonb_set(v_resultado, '{payload,metas_fideliza}', v_metas_fideliza, true);
end;
$function$;

comment on function public.get_relatorio_admin_mensal_rico_v1(uuid, integer, integer) is
  'Relatorio mensal rico: pagantes administrativos e denominador financeiro do ticket sao validados como metricas independentes.';

do $migration$
declare
  v_recreio_id uuid;
  v_barra_id uuid;
  v_campo_grande_id uuid;
  v_qtd integer;

  v_ativos constant integer := 344;
  v_pagantes_administrativos constant integer := 334;
  v_matriculas constant integer := 422;
  v_ticket_denominador_pagantes constant integer := 325;
  v_mrr constant numeric := 144749.17;
  v_ticket constant numeric := 445.38;
  v_churn constant numeric := 8.38;

  v_exec public.fechamento_mensal_snapshots%rowtype;
  v_gerencial public.fechamento_mensal_snapshots%rowtype;
  v_mensal public.fechamento_mensal_snapshots%rowtype;
  v_exec_new jsonb;
  v_gerencial_new jsonb;
  v_mensal_new jsonb;
  v_financeiro jsonb;
  v_financeiro_totais jsonb;
  v_financeiro_ticket jsonb;
  v_bloco jsonb;
  v_resumo jsonb;
  v_fontes jsonb;
  v_exec_id uuid;
  v_exec_hash text;
  v_gerencial_id uuid;
  v_gerencial_hash text;
  v_mensal_id uuid;
  v_mensal_hash text;
  v_rico jsonb;
  v_relatorio_gerencial jsonb;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);

  select
    (max(id::text) filter (where lower(btrim(nome)) = 'recreio'))::uuid,
    (max(id::text) filter (where lower(btrim(nome)) = 'barra'))::uuid,
    (max(id::text) filter (where lower(btrim(nome)) = 'campo grande'))::uuid,
    count(*)::integer
  into v_recreio_id, v_barra_id, v_campo_grande_id, v_qtd
  from public.unidades
  where lower(btrim(nome)) in ('recreio', 'barra', 'campo grande');

  if v_qtd <> 3
     or v_recreio_id <> '95553e96-971b-4590-a6eb-0201d013c14d'::uuid
     or v_barra_id <> '368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid
     or v_campo_grande_id <> '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid then
    raise exception 'TICKET_BASE_FINANCEIRA_UNIDADES_INVALIDAS';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('ticket_agosto_2026_base_financeira|' || v_recreio_id::text, 0)
  );

  select * into v_exec
  from public.fechamento_mensal_snapshots s
  where s.ano = 2026 and s.mes = 8 and s.escopo = 'unidade'
    and s.unidade_id = v_recreio_id and s.dominio = 'alunos_executivo'
    and s.status = 'fechado'
  order by s.versao desc, s.created_at desc limit 1;

  if v_exec.payload_hash <> 'a3eab135005a847c91661b6ba25cce1668f179e00505f217aced6713d206d1c2'
     or public.hash_jsonb_canonico(v_exec.payload) <> v_exec.payload_hash
     or coalesce((v_exec.payload->>'alunos_ativos')::integer, -1) <> v_ativos
     or coalesce((v_exec.payload->>'alunos_pagantes')::integer, -1) <> v_pagantes_administrativos
     or coalesce((v_exec.payload->>'matriculas_ativas')::integer, -1) <> v_matriculas
     or round(coalesce((v_exec.payload->>'churn_rate')::numeric, -1), 2) <> v_churn
     or round(coalesce((v_exec.payload->>'mrr')::numeric, -1), 2) <> v_mrr
     or round(coalesce((v_exec.payload->>'ticket_medio')::numeric, -1), 2) <> 433.38 then
    raise exception 'TICKET_BASE_FINANCEIRA_EXECUTIVO_MUDOU';
  end if;

  select * into v_gerencial
  from public.fechamento_mensal_snapshots s
  where s.ano = 2026 and s.mes = 8 and s.escopo = 'unidade'
    and s.unidade_id = v_recreio_id and s.dominio = 'relatorio_gerencial'
    and s.status = 'fechado'
  order by s.versao desc, s.created_at desc limit 1;

  if v_gerencial.payload_hash <> 'e1825f35146d095c936fc9c8b661e9f7dbab6870bbe5f33396fd415b0e4de942'
     or public.hash_jsonb_canonico(v_gerencial.payload) <> v_gerencial.payload_hash then
    raise exception 'TICKET_BASE_FINANCEIRA_GERENCIAL_MUDOU';
  end if;

  select * into v_mensal
  from public.fechamento_mensal_snapshots s
  where s.ano = 2026 and s.mes = 8 and s.escopo = 'unidade'
    and s.unidade_id = v_recreio_id and s.dominio = 'relatorio_admin_mensal'
    and s.status = 'fechado'
  order by s.versao desc, s.created_at desc limit 1;

  if v_mensal.payload_hash <> '95251b15f82a720e08d702fe68178f2632b42c2794b86b345012fe56fa56dd99'
     or public.hash_jsonb_canonico(v_mensal.payload) <> v_mensal.payload_hash then
    raise exception 'TICKET_BASE_FINANCEIRA_ADMIN_MENSAL_MUDOU';
  end if;

  if not exists (
    select 1 from public.dados_mensais dm
    where dm.unidade_id = v_recreio_id and dm.ano = 2026 and dm.mes = 8
      and dm.alunos_ativos = v_ativos
      and dm.alunos_pagantes = v_pagantes_administrativos
      and dm.matriculas_ativas = v_matriculas
      and round(dm.churn_rate, 2) = v_churn
      and round(dm.ticket_medio, 2) = 433.38
      and round(dm.faturamento_estimado, 2) = 144748.92
  ) then
    raise exception 'TICKET_BASE_FINANCEIRA_DADOS_MENSAIS_MUDARAM';
  end if;

  v_financeiro_ticket := jsonb_build_object(
    'ticket_medio', v_ticket,
    'mrr_contratual', v_mrr,
    'faturamento_previsto', v_mrr,
    'faturamento_realizado', 143346.97,
    'ticket_denominador_pagantes', v_ticket_denominador_pagantes,
    'alunos_pagantes_canonicos', v_ticket_denominador_pagantes,
    'alunos_pagantes_administrativos', v_pagantes_administrativos,
    'fonte', 'fechamento_financeiro_agosto_2026'
  );

  v_exec_new := v_exec.payload || jsonb_build_object(
    'alunos_ativos', v_ativos,
    'total_alunos_ativos', v_ativos,
    'alunos_pagantes', v_pagantes_administrativos,
    'total_alunos_pagantes', v_pagantes_administrativos,
    'matriculas_ativas', v_matriculas,
    'churn_rate', v_churn,
    'mrr', v_mrr,
    'faturamento_previsto', v_mrr,
    'faturamento_estimado', v_mrr,
    'ticket_medio', v_ticket,
    'ticket_denominador_pagantes', v_ticket_denominador_pagantes,
    'financeiro_ticket_contratual', v_financeiro_ticket,
    'retificacao_ticket_agosto_2026', jsonb_build_object(
      'motivo', 'separacao entre KPI administrativo e denominador financeiro do ticket',
      'alunos_ativos', v_ativos,
      'alunos_pagantes_administrativos', v_pagantes_administrativos,
      'ticket_denominador_pagantes', v_ticket_denominador_pagantes
    )
  );

  insert into public.fechamento_mensal_snapshots (
    ano, mes, escopo, unidade_id, dominio, versao, status,
    fonte, payload, payload_hash, financeiro_realizado_disponivel,
    observacao, capturado_em, capturado_por,
    aprovado_em, aprovado_por, fechado_em, fechado_por
  ) values (
    2026, 8, 'unidade', v_recreio_id, 'alunos_executivo', v_exec.versao + 1, 'fechado',
    'retificacao_ticket_agosto_2026_base_financeira_v2', v_exec_new,
    public.hash_jsonb_canonico(v_exec_new), v_exec.financeiro_realizado_disponivel,
    format('retificacao append-only; snapshot anterior: %s', v_exec.id),
    v_exec.capturado_em, v_exec.capturado_por,
    now(), auth.uid(), now(), auth.uid()
  ) returning id, payload_hash into v_exec_id, v_exec_hash;

  insert into public.fechamento_mensal_auditoria (
    snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
  ) values (
    v_exec_id, 2026, 8, 'unidade', v_recreio_id, 'snapshot_gravado',
    jsonb_build_object(
      'dominio', 'alunos_executivo',
      'snapshot_anterior_id', v_exec.id,
      'payload_anterior_hash', v_exec.payload_hash,
      'alunos_ativos', v_ativos,
      'alunos_pagantes_administrativos', v_pagantes_administrativos,
      'ticket_denominador_pagantes', v_ticket_denominador_pagantes,
      'mrr_contratual', v_mrr,
      'ticket_medio', v_ticket
    ), auth.uid()
  );

  v_financeiro := public.get_financeiro_faturas_emusys(v_recreio_id, 2026, 8);
  v_financeiro_totais := v_financeiro->'totais';
  if coalesce((v_financeiro->>'tem_dados')::boolean, false) is not true
     or round(coalesce((v_financeiro_totais->>'faturamento_previsto')::numeric, -1), 2) <> v_mrr
     or coalesce((v_financeiro_totais->>'ticket_denominador_pagantes')::integer, -1) <> v_ticket_denominador_pagantes
     or coalesce((v_financeiro_totais->>'alunos_pagantes_canonicos')::integer, -1) <> v_ticket_denominador_pagantes
     or round(coalesce((v_financeiro_totais->>'ticket_medio')::numeric, -1), 2) <> v_ticket then
    raise exception 'TICKET_BASE_FINANCEIRA_RECONCILIACAO_FALHOU: %', v_financeiro_totais;
  end if;

  v_gerencial_new := v_gerencial.payload || jsonb_build_object(
    'financeiro_faturas_emusys', jsonb_build_object('totais', v_financeiro_totais),
    'financeiro_ticket_contratual', v_financeiro_ticket,
    'retificacao_ticket_agosto_2026', v_exec_new->'retificacao_ticket_agosto_2026'
  );

  v_bloco := (v_gerencial_new#>'{kpis_gestao,0}') || jsonb_build_object(
    'alunos_ativos', v_ativos,
    'alunos_pagantes', v_pagantes_administrativos,
    'ticket_medio', v_ticket,
    'ticket_denominador_pagantes', v_ticket_denominador_pagantes,
    'financeiro_faturas_emusys', v_financeiro_totais
  );
  v_gerencial_new := jsonb_set(v_gerencial_new, '{kpis_gestao,0}', v_bloco, true);

  v_bloco := (v_gerencial_new#>'{dados_mes_atual,0}') || jsonb_build_object(
    'alunos_ativos', v_ativos,
    'alunos_pagantes', v_pagantes_administrativos,
    'ticket_medio', v_ticket,
    'ticket_denominador_pagantes', v_ticket_denominador_pagantes
  );
  v_gerencial_new := jsonb_set(v_gerencial_new, '{dados_mes_atual,0}', v_bloco, true);

  v_bloco := (v_gerencial_new#>'{kpis_alunos_canonicos,totais}') || jsonb_build_object(
    'alunos_ativos', v_ativos,
    'alunos_pagantes', v_pagantes_administrativos,
    'ticket_medio', v_ticket,
    'ticket_denominador_pagantes', v_ticket_denominador_pagantes
  );
  v_gerencial_new := jsonb_set(v_gerencial_new, '{kpis_alunos_canonicos,totais}', v_bloco, true);

  v_bloco := (v_gerencial_new#>'{kpis_alunos_canonicos,por_unidade,0}') || jsonb_build_object(
    'alunos_ativos', v_ativos,
    'alunos_pagantes', v_pagantes_administrativos,
    'ticket_medio', v_ticket,
    'ticket_denominador_pagantes', v_ticket_denominador_pagantes
  );
  v_gerencial_new := jsonb_set(
    v_gerencial_new, '{kpis_alunos_canonicos,por_unidade,0}', v_bloco, true
  );

  insert into public.fechamento_mensal_snapshots (
    ano, mes, escopo, unidade_id, dominio, versao, status,
    fonte, payload, payload_hash, financeiro_realizado_disponivel,
    observacao, capturado_em, capturado_por,
    aprovado_em, aprovado_por, fechado_em, fechado_por
  ) values (
    2026, 8, 'unidade', v_recreio_id, 'relatorio_gerencial', v_gerencial.versao + 1, 'fechado',
    'retificacao_ticket_agosto_2026_base_financeira_v2', v_gerencial_new,
    public.hash_jsonb_canonico(v_gerencial_new), v_gerencial.financeiro_realizado_disponivel,
    format('retificacao append-only; snapshot anterior: %s', v_gerencial.id),
    v_gerencial.capturado_em, v_gerencial.capturado_por,
    now(), auth.uid(), now(), auth.uid()
  ) returning id, payload_hash into v_gerencial_id, v_gerencial_hash;

  insert into public.fechamento_mensal_auditoria (
    snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
  ) values (
    v_gerencial_id, 2026, 8, 'unidade', v_recreio_id, 'snapshot_gravado',
    jsonb_build_object(
      'dominio', 'relatorio_gerencial',
      'snapshot_anterior_id', v_gerencial.id,
      'payload_anterior_hash', v_gerencial.payload_hash,
      'alunos_pagantes_administrativos', v_pagantes_administrativos,
      'ticket_denominador_pagantes', v_ticket_denominador_pagantes,
      'ticket_medio', v_ticket
    ), auth.uid()
  );

  v_resumo := (v_mensal.payload->'resumo') || jsonb_build_object(
    'alunos_ativos', v_ativos,
    'alunos_pagantes', v_pagantes_administrativos,
    'matriculas_ativas', v_matriculas,
    'churn_rate', v_churn,
    'ticket_medio', v_ticket,
    'ticket_denominador_pagantes', v_ticket_denominador_pagantes,
    'faturamento_previsto', v_mrr
  );
  v_fontes := coalesce(v_mensal.payload->'fontes', '{}'::jsonb);
  v_fontes := jsonb_set(
    v_fontes, '{relatorio_gerencial}',
    jsonb_build_object('snapshot_id', v_gerencial_id, 'payload_hash', v_gerencial_hash), true
  );
  v_fontes := jsonb_set(
    v_fontes, '{financeiro_ticket_contratual}', v_financeiro_ticket, true
  );
  v_mensal_new := jsonb_set(v_mensal.payload, '{resumo}', v_resumo, true);
  v_mensal_new := jsonb_set(v_mensal_new, '{fontes}', v_fontes, true);
  v_mensal_new := v_mensal_new || jsonb_build_object(
    'retificacao_ticket_agosto_2026', v_exec_new->'retificacao_ticket_agosto_2026'
  );

  insert into public.fechamento_mensal_snapshots (
    ano, mes, escopo, unidade_id, dominio, versao, status,
    fonte, payload, payload_hash, financeiro_realizado_disponivel,
    observacao, capturado_em, capturado_por,
    aprovado_em, aprovado_por, fechado_em, fechado_por
  ) values (
    2026, 8, 'unidade', v_recreio_id, 'relatorio_admin_mensal', v_mensal.versao + 1, 'fechado',
    'retificacao_ticket_agosto_2026_base_financeira_v2', v_mensal_new,
    public.hash_jsonb_canonico(v_mensal_new), v_mensal.financeiro_realizado_disponivel,
    format('retificacao append-only; snapshot anterior: %s', v_mensal.id),
    v_mensal.capturado_em, v_mensal.capturado_por,
    now(), auth.uid(), now(), auth.uid()
  ) returning id, payload_hash into v_mensal_id, v_mensal_hash;

  insert into public.fechamento_mensal_auditoria (
    snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
  ) values (
    v_mensal_id, 2026, 8, 'unidade', v_recreio_id, 'snapshot_gravado',
    jsonb_build_object(
      'dominio', 'relatorio_admin_mensal',
      'snapshot_anterior_id', v_mensal.id,
      'payload_anterior_hash', v_mensal.payload_hash,
      'relatorio_gerencial_snapshot_id', v_gerencial_id,
      'relatorio_gerencial_payload_hash', v_gerencial_hash,
      'alunos_pagantes_administrativos', v_pagantes_administrativos,
      'ticket_denominador_pagantes', v_ticket_denominador_pagantes,
      'ticket_medio', v_ticket
    ), auth.uid()
  );

  update public.dados_mensais
     set ticket_denominador_pagantes = v_ticket_denominador_pagantes,
         ticket_medio_contratual = v_ticket,
         mrr_contratual = v_mrr,
         updated_at = now()
   where unidade_id = v_recreio_id
     and ano = 2026 and mes = 8
     and alunos_ativos = v_ativos
     and alunos_pagantes = v_pagantes_administrativos
     and matriculas_ativas = v_matriculas
     and round(churn_rate, 2) = v_churn
     and round(ticket_medio, 2) = 433.38
     and round(faturamento_estimado, 2) = 144748.92;
  get diagnostics v_qtd = row_count;
  if v_qtd <> 1 then
    raise exception 'TICKET_BASE_FINANCEIRA_COMPATIBILIDADE_FALHOU: %/1', v_qtd;
  end if;

  insert into public.fechamento_mensal_auditoria (
    snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
  ) values (
    v_exec_id, 2026, 8, 'unidade', v_recreio_id,
    'compatibilidade_dados_mensais_atualizada',
    jsonb_build_object(
      'dados_mensais_alunos_pagantes_administrativos', v_pagantes_administrativos,
      'dados_mensais_ticket_medio_legado_preservado', 433.38,
      'ticket_denominador_pagantes', v_ticket_denominador_pagantes,
      'ticket_medio_contratual', v_ticket,
      'mrr_contratual', v_mrr
    ), auth.uid()
  );

  v_rico := public.get_relatorio_admin_mensal_rico_v1(v_recreio_id, 2026, 8);
  if coalesce((v_rico#>>'{payload,resumo,alunos_ativos}')::integer, -1) <> v_ativos
     or coalesce((v_rico#>>'{payload,resumo,alunos_pagantes}')::integer, -1) <> v_pagantes_administrativos
     or coalesce((v_rico#>>'{payload,resumo,matriculas_ativas}')::integer, -1) <> v_matriculas
     or round(coalesce((v_rico#>>'{payload,indicadores_retencao,churn_rate}')::numeric, -1), 2) <> v_churn
     or coalesce((v_rico#>>'{payload,indicadores_financeiros,ticket_denominador_pagantes}')::integer, -1) <> v_ticket_denominador_pagantes
     or round(coalesce((v_rico#>>'{payload,indicadores_financeiros,ticket_medio}')::numeric, -1), 2) <> v_ticket
     or round(coalesce((v_rico#>>'{payload,indicadores_financeiros,faturamento_previsto}')::numeric, -1), 2) <> v_mrr then
    raise exception 'TICKET_BASE_FINANCEIRA_RELATORIO_RICO_FALHOU: %', v_rico;
  end if;

  v_relatorio_gerencial := public.get_relatorio_gerencial_canonico_v1(v_recreio_id, 2026, 8);
  if coalesce((v_relatorio_gerencial#>>'{administrativo,resumo,alunos_ativos}')::integer, -1) <> v_ativos
     or coalesce((v_relatorio_gerencial#>>'{administrativo,resumo,alunos_pagantes}')::integer, -1) <> v_pagantes_administrativos
     or round(coalesce((v_relatorio_gerencial#>>'{administrativo,indicadores_financeiros,ticket_medio}')::numeric, -1), 2) <> v_ticket
     or coalesce((v_relatorio_gerencial#>>'{administrativo,indicadores_financeiros,ticket_denominador_pagantes}')::integer, -1) <> v_ticket_denominador_pagantes then
    raise exception 'TICKET_BASE_FINANCEIRA_RELATORIO_GERENCIAL_FALHOU: %', v_relatorio_gerencial;
  end if;

  v_financeiro := public.get_financeiro_faturas_emusys(v_barra_id, 2026, 8);
  if round(coalesce((v_financeiro#>>'{totais,ticket_medio}')::numeric, -1), 2) <> 446.30 then
    raise exception 'TICKET_BASE_FINANCEIRA_BARRA_REGREDIU';
  end if;

  v_financeiro := public.get_financeiro_faturas_emusys(v_campo_grande_id, 2026, 8);
  if round(coalesce((v_financeiro#>>'{totais,ticket_medio}')::numeric, -1), 2) <> 398.87 then
    raise exception 'TICKET_BASE_FINANCEIRA_CAMPO_GRANDE_REGREDIU';
  end if;
end;
$migration$;

commit;
