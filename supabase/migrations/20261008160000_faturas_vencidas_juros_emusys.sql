-- ============================================================================
-- financeiro: sync diário das faturas abertas+vencidas, juros do Emusys no
-- valor_hoje e vigia de divergência (pedido do Alf via Alfredo, 08/10/2026).
--
-- O que muda:
--   1) emusys_faturas passa a ser relida TODO DIA para faturas abertas e
--      vencidas pela edge sync-faturas-emusys (mode=vencidas_abertas), porque
--      o juros_e_multa das abertas é calculado pelo Emusys "na hora" e antes
--      só atualizava quando a competência era ressincronizada.
--   2) calcular_valores_fatura_financeiro_v1 ganha dois parâmetros opcionais
--      (p_emusys_juros, p_emusys_synced_at): quando o espelho foi relido HOJE
--      (America/Sao_Paulo) e trouxe juros_e_multa > 0, o valor de hoje é
--      valor_original - desconto_fixo + juros_e_multa, com
--      origem_juros='emusys_hoje'. Caso contrário a fórmula por unidade
--      (#612) continua valendo, com origem_juros='formula_unidade'.
--   3) Os 4 chamadores passam o espelho (juros_e_multa + synced_at de
--      emusys_faturas) para a função e emitem origem_juros/juros_emusys.
--   4) publish_faturas_vencidas_sync: RPC única que recebe os itens lidos,
--      upserta em emusys_faturas, compara o juros do Emusys com a fórmula e
--      registra divergências > R$ 0,02 (taxa pode ter mudado no Emusys).
--   5) FIX: enqueue_financeiro_sync_backlog explodia com >24 competências
--      candidatas (toda competência futura tem itens 'aberta') — por isso a
--      fila morreu silenciosamente em 24/09. Agora só competências <= mês
--      corrente com itens abertos VENCIDOS ou source_missing entram, e a
--      lista é limitada a 24.
--   6) cron faturas-vencidas-sync-diario às 09:30 UTC (06:30 BRT).
--
-- Produção anterior preservada: owner/ACL/SECURITY das funções recriadas
-- seguem iguais; a assinatura de 7 argumentos é dropada porque os 2 novos
-- parâmetros têm default — chamadas antigas resolvem pela nova assinatura.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Tabelas: log de execuções + divergências Emusys x fórmula
-- ---------------------------------------------------------------------------

create table if not exists public.financeiro_faturas_vencidas_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_source text not null,
  requested_by text,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unidades_resumo jsonb not null default '{}'::jsonb,
  itens_recebidos integer not null default 0,
  itens_atualizados integer not null default 0,
  divergencias integer not null default 0,
  erro_detalhe text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.financeiro_faturas_vencidas_runs is
  'Log de execuções do refresh diário de faturas abertas+vencidas (edge sync-faturas-emusys mode=vencidas_abertas). Não é sync_runs: aquele é por competência e alimenta o snapshot canônico; este é um append-only de operação.';

create table if not exists public.financeiro_juros_divergencias (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.financeiro_faturas_vencidas_runs(id) on delete cascade,
  unidade_id uuid not null,
  unidade_codigo text,
  emusys_fatura_id bigint not null,
  data_vencimento date,
  juros_emusys numeric(14,2) not null,
  juros_formula numeric(14,2) not null,
  diferenca numeric(14,2) not null,
  detectado_em timestamptz not null default now(),
  resolvido boolean not null default false,
  resolvido_por text,
  resolvido_em timestamptz,
  unique (run_id, unidade_id, emusys_fatura_id)
);

comment on table public.financeiro_juros_divergencias is
  'Vigia de divergência entre juros_e_multa lido do Emusys e a fórmula por unidade. Divergência > R$0,02 sugere taxa alterada no Emusys — revisar financeiro_encargos_unidade. Sem dado pessoal: só ids e valores.';

alter table public.financeiro_faturas_vencidas_runs enable row level security;
alter table public.financeiro_juros_divergencias enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='financeiro_faturas_vencidas_runs' and policyname='vencidas_runs_service_role_all') then
    create policy vencidas_runs_service_role_all on public.financeiro_faturas_vencidas_runs
      for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='financeiro_juros_divergencias' and policyname='juros_divergencias_service_role_all') then
    create policy juros_divergencias_service_role_all on public.financeiro_juros_divergencias
      for all to service_role using (true) with check (true);
  end if;
end $$;

revoke all on public.financeiro_faturas_vencidas_runs from public, anon, authenticated;
grant all on public.financeiro_faturas_vencidas_runs to service_role;
revoke all on public.financeiro_juros_divergencias from public, anon, authenticated;
grant all on public.financeiro_juros_divergencias to service_role;
-- leitura para quem já lê o financeiro (mesma régua de financeiro_encargos_unidade)
grant select on public.financeiro_faturas_vencidas_runs to mila_acesso_restrito, fabio_agent, lia_acesso_restrito;
grant select on public.financeiro_juros_divergencias to mila_acesso_restrito, fabio_agent, lia_acesso_restrito;

-- ---------------------------------------------------------------------------
-- 2) RPC de publicação: upsert no espelho + vigia de divergência, numa só
--    transação. Só service_role (mesmo padrão dos RPCs da fila).
-- ---------------------------------------------------------------------------

create or replace function public.publish_faturas_vencidas_sync(
  p_items jsonb,
  p_trigger_source text,
  p_requested_by text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_run_id uuid;
  v_item jsonb;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_recebidos int := 0;
  v_atualizados int := 0;
  v_divergencias int := 0;
  v_resumo jsonb := '{}'::jsonb;
  v_calc jsonb;
  v_encargos_formula numeric(14,2);
  v_unidade text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'FINANCEIRO_QUEUE_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'FATURAS_VENCIDAS_ITEMS_INVALIDOS';
  end if;

  insert into public.financeiro_faturas_vencidas_runs (trigger_source, requested_by)
  values (btrim(coalesce(p_trigger_source, 'manual')), nullif(btrim(coalesce(p_requested_by, '')), ''))
  returning id into v_run_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_recebidos := v_recebidos + 1;
    insert into public.emusys_faturas (
      unidade_id, unidade_codigo, emusys_fatura_id,
      emusys_matricula_id, emusys_contrato_id, emusys_student_id,
      descricao, status, data_vencimento, data_pagamento, competencia,
      valor_original, valor_pago, juros_e_multa,
      desconto_aplicado, desconto_fixo, desconto_condicional,
      payload, synced_at
    ) values (
      (v_item ->> 'unidade_id')::uuid,
      v_item ->> 'unidade_codigo',
      (v_item ->> 'emusys_fatura_id')::bigint,
      nullif(v_item ->> 'emusys_matricula_id', '')::bigint,
      nullif(v_item ->> 'emusys_contrato_id', '')::bigint,
      nullif(v_item ->> 'emusys_student_id', '')::bigint,
      coalesce(v_item ->> 'descricao', ''),
      coalesce(v_item ->> 'status', 'aberta'),
      (v_item ->> 'data_vencimento')::date,
      nullif(v_item ->> 'data_pagamento', '')::date,
      (v_item ->> 'competencia')::date,
      coalesce((v_item ->> 'valor_original')::numeric, 0),
      nullif(v_item ->> 'valor_pago', '')::numeric,
      coalesce((v_item ->> 'juros_e_multa')::numeric, 0),
      coalesce((v_item ->> 'desconto_aplicado')::numeric, 0),
      coalesce((v_item ->> 'desconto_fixo')::numeric, 0),
      coalesce((v_item ->> 'desconto_condicional')::numeric, 0),
      coalesce(v_item -> 'payload', '{}'::jsonb),
      now()
    )
    on conflict (unidade_id, emusys_fatura_id) do update set
      unidade_codigo = excluded.unidade_codigo,
      emusys_matricula_id = excluded.emusys_matricula_id,
      emusys_contrato_id = excluded.emusys_contrato_id,
      emusys_student_id = excluded.emusys_student_id,
      descricao = excluded.descricao,
      status = excluded.status,
      data_vencimento = excluded.data_vencimento,
      data_pagamento = excluded.data_pagamento,
      competencia = excluded.competencia,
      valor_original = excluded.valor_original,
      valor_pago = excluded.valor_pago,
      juros_e_multa = excluded.juros_e_multa,
      desconto_aplicado = excluded.desconto_aplicado,
      desconto_fixo = excluded.desconto_fixo,
      desconto_condicional = excluded.desconto_condicional,
      payload = excluded.payload,
      synced_at = excluded.synced_at;
    v_atualizados := v_atualizados + 1;

    -- Vigia: em aberta vencida, compara o encargo que o Emusys devolveu com a
    -- fórmula por unidade calculada para hoje. Diferença > R$0,02 = provável
    -- mudança de taxa no Emusys; registra sem dado pessoal.
    if coalesce(v_item ->> 'status', '') = 'aberta'
       and (v_item ->> 'data_vencimento')::date < v_hoje then
      v_calc := public.calcular_valores_fatura_financeiro_v1(
        coalesce((v_item ->> 'valor_original')::numeric, 0),
        coalesce((v_item ->> 'desconto_fixo')::numeric, 0),
        0,
        (v_item ->> 'data_vencimento')::date,
        'aberta',
        v_hoje,
        (v_item ->> 'unidade_id')::uuid
      );
      v_encargos_formula := coalesce((v_calc ->> 'multa')::numeric, 0)
                          + coalesce((v_calc ->> 'mora')::numeric, 0);
      if abs(coalesce((v_item ->> 'juros_e_multa')::numeric, 0) - v_encargos_formula) > 0.02 then
        insert into public.financeiro_juros_divergencias (
          run_id, unidade_id, unidade_codigo, emusys_fatura_id, data_vencimento,
          juros_emusys, juros_formula, diferenca
        ) values (
          v_run_id,
          (v_item ->> 'unidade_id')::uuid,
          v_item ->> 'unidade_codigo',
          (v_item ->> 'emusys_fatura_id')::bigint,
          (v_item ->> 'data_vencimento')::date,
          coalesce((v_item ->> 'juros_e_multa')::numeric, 0),
          v_encargos_formula,
          round(coalesce((v_item ->> 'juros_e_multa')::numeric, 0) - v_encargos_formula, 2)
        )
        on conflict (run_id, unidade_id, emusys_fatura_id) do nothing;
        v_divergencias := v_divergencias + 1;
      end if;
    end if;
  end loop;

  -- Resumo por unidade montado no fim: recebidas do payload, divergencias da
  -- tabela (jsonb_set não cria caminho aninhado sob objeto vazio neste build).
  select coalesce(jsonb_object_agg(unidade_codigo, resumo), '{}'::jsonb)
    into v_resumo
  from (
    select coalesce(i.value ->> 'unidade_codigo', 'desconhecida') as unidade_codigo,
           jsonb_build_object(
             'recebidas', count(*),
             'divergencias', count(d.id)
           ) as resumo
    from jsonb_array_elements(p_items) i
    left join public.financeiro_juros_divergencias d
      on d.run_id = v_run_id
     and d.emusys_fatura_id::text = (i.value ->> 'emusys_fatura_id')
    group by 1
  ) x;

  update public.financeiro_faturas_vencidas_runs set
    status = 'succeeded',
    completed_at = now(),
    itens_recebidos = v_recebidos,
    itens_atualizados = v_atualizados,
    divergencias = v_divergencias,
    unidades_resumo = v_resumo,
    updated_at = now()
  where id = v_run_id;

  return jsonb_build_object(
    'run_id', v_run_id,
    'itens_recebidos', v_recebidos,
    'itens_atualizados', v_atualizados,
    'divergencias', v_divergencias,
    'unidades', v_resumo
  );

exception when others then
  update public.financeiro_faturas_vencidas_runs set
    status = 'failed',
    completed_at = now(),
    erro_detalhe = sqlerrm,
    updated_at = now()
  where id = v_run_id;
  raise;
end;
$function$;

revoke all on function public.publish_faturas_vencidas_sync(jsonb, text, text) from public, anon, authenticated;
grant execute on function public.publish_faturas_vencidas_sync(jsonb, text, text) to service_role;


-- ---------------------------------------------------------------------------
-- 3) calcular com origem_juros: espelho lido hoje + juros>0 => Emusys manda
-- ---------------------------------------------------------------------------

drop function if exists public.calcular_valores_fatura_financeiro_v1(numeric, numeric, numeric, date, text, date, uuid);

create or replace function public.calcular_valores_fatura_financeiro_v1(
  p_valor_original numeric,
  p_desconto_fixo numeric,
  p_desconto_condicional numeric,
  p_data_vencimento date,
  p_status text,
  p_as_of_date date,
  p_unidade_id uuid default null,
  p_emusys_juros numeric default null,
  p_emusys_synced_at timestamptz default null
)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_valor_com_desconto numeric(14, 2);
  v_valor_sem_desconto_condicional numeric(14, 2);
  v_dias_atraso integer := 0;
  v_multa numeric(14, 2) := 0;
  v_mora numeric(14, 2) := 0;
  v_valor_hoje numeric(14, 2);
  v_multa_pct numeric(14, 6) := 0.02;
  v_mora_mensal_pct numeric(14, 6) := 0.01;
begin
  v_valor_com_desconto := round(
    greatest(
      coalesce(p_valor_original, 0)
      - coalesce(p_desconto_fixo, 0)
      - coalesce(p_desconto_condicional, 0),
      0
    ),
    2
  );
  v_valor_sem_desconto_condicional := round(
    greatest(
      coalesce(p_valor_original, 0)
      - coalesce(p_desconto_fixo, 0),
      0
    ),
    2
  );

  if p_data_vencimento is not null and p_as_of_date is not null then
    v_dias_atraso := greatest(p_as_of_date - p_data_vencimento, 0);
  end if;

  if p_unidade_id is not null then
    select e.multa_pct, e.mora_mensal_pct
      into v_multa_pct, v_mora_mensal_pct
      from public.financeiro_encargos_unidade e
     where e.unidade_id = p_unidade_id
       and e.vigente_desde <= coalesce(p_as_of_date, current_date)
     order by e.vigente_desde desc
     limit 1;
    v_multa_pct := coalesce(v_multa_pct, 0.02);
    v_mora_mensal_pct := coalesce(v_mora_mensal_pct, 0.01);
  end if;

  if v_status = 'aberta' and p_data_vencimento < p_as_of_date then
    -- Regra do Alf (08/10/2026): quando o espelho foi relido HOJE pelo sync de
    -- vencidas e o Emusys já devolveu o juros do dia, o valor dele manda — é o
    -- número que a escola cobra. multa/mora ficam null porque o Emusys não
    -- decompõe; origem_juros marca a fonte. A fórmula segue como fallback e
    -- como régua da vigia de divergência no publish_faturas_vencidas_sync.
    if p_as_of_date = (now() at time zone 'America/Sao_Paulo')::date
       and p_emusys_synced_at is not null
       and (p_emusys_synced_at at time zone 'America/Sao_Paulo')::date = p_as_of_date
       and coalesce(p_emusys_juros, 0) > 0
    then
      v_valor_hoje := round(v_valor_sem_desconto_condicional + p_emusys_juros, 2);
      return jsonb_build_object(
        'valor_com_desconto', v_valor_com_desconto,
        'valor_sem_desconto_condicional', v_valor_sem_desconto_condicional,
        'multa', null,
        'mora', null,
        'juros_emusys', p_emusys_juros,
        'dias_atraso', v_dias_atraso,
        'valor_hoje', v_valor_hoje,
        'origem_juros', 'emusys_hoje'
      );
    end if;

    v_multa := round(v_valor_sem_desconto_condicional * v_multa_pct, 2);
    v_mora := round(v_valor_sem_desconto_condicional * v_mora_mensal_pct * v_dias_atraso / 30, 2);
    v_valor_hoje := round(v_valor_sem_desconto_condicional + v_multa + v_mora, 2);
    return jsonb_build_object(
      'valor_com_desconto', v_valor_com_desconto,
      'valor_sem_desconto_condicional', v_valor_sem_desconto_condicional,
      'multa', v_multa,
      'mora', v_mora,
      'juros_emusys', null,
      'dias_atraso', v_dias_atraso,
      'valor_hoje', v_valor_hoje,
      'origem_juros', 'formula_unidade'
    );
  elsif v_status = 'aberta' then
    v_valor_hoje := v_valor_com_desconto;
  else
    v_valor_hoje := null;
  end if;

  return jsonb_build_object(
    'valor_com_desconto', v_valor_com_desconto,
    'valor_sem_desconto_condicional', v_valor_sem_desconto_condicional,
    'multa', v_multa,
    'mora', v_mora,
    'juros_emusys', null,
    'dias_atraso', v_dias_atraso,
    'valor_hoje', v_valor_hoje,
    'origem_juros', 'formula_unidade'
  );
end;
$function$;

revoke all on function public.calcular_valores_fatura_financeiro_v1(numeric, numeric, numeric, date, text, date, uuid, numeric, timestamptz) from public, anon, authenticated;
grant execute on function public.calcular_valores_fatura_financeiro_v1(numeric, numeric, numeric, date, text, date, uuid, numeric, timestamptz) to service_role;


-- ---------------------------------------------------------------------------
-- 4) FIX enqueue_financeiro_sync_backlog: explodia em >24 competências (toda
--    competência futura tem itens 'aberta' ainda não vencidas) — por isso a
--    revarredura morreu em silêncio em 24/09 e as faturas velhas ficaram sem
--    re-leitura. Só meses <= corrente com atraso real/source_missing entram.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enqueue_financeiro_sync_backlog(p_trigger_source text, p_requested_by text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_competencias date[];
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'FINANCEIRO_QUEUE_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;

  with ultimo_run_por_competencia as (
    select distinct on (sr.competencia)
           sr.id,
           sr.competencia
    from public.sync_runs sr
    where sr.run_type = 'live'
      and sr.status = 'succeeded'
      and sr.snapshot_complete = true
      and sr.unidades_concluidas = 3
    order by sr.competencia, sr.completed_at desc nulls last, sr.id desc
  ),
  candidatas as (
    select date_trunc(
      'month',
      (now() at time zone 'America/Sao_Paulo')
    )::date as competencia
    union
    select (
      date_trunc('month', (now() at time zone 'America/Sao_Paulo'))
      - interval '1 month'
    )::date
    union
    select (
      date_trunc('month', (now() at time zone 'America/Sao_Paulo'))
      + interval '1 month'
    )::date
    union
    select (
      date_trunc('month', (now() at time zone 'America/Sao_Paulo'))
      + interval '2 months'
    )::date
    union
    select (
      date_trunc('month', (now() at time zone 'America/Sao_Paulo'))
      + interval '3 months'
    )::date
    union
    select ur.competencia
    from ultimo_run_por_competencia ur
    join public.sync_run_items i on i.run_id = ur.id
    where ur.competencia <= date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date
      and (
        i.source_missing is true
        or (i.status = 'aberta'
            and i.data_vencimento < (now() at time zone 'America/Sao_Paulo')::date)
      )
  )
  select array_agg(competencia order by competencia)
  into v_competencias
  from (
    select distinct candidatas.competencia
    from candidatas
    order by candidatas.competencia
    limit 24
  ) candidatas;

  return public.enqueue_financeiro_sync_competencias(
    v_competencias,
    p_trigger_source,
    p_requested_by,
    300
  );
end;
$function$;


-- ---------------------------------------------------------------------------
-- 5) get_faturas_alunos_financeiro_v1_base: espelho (juros+synced_at) para o cálculo e origem_juros no item
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_faturas_alunos_financeiro_v1_base(p_unidade_id uuid DEFAULT NULL::uuid, p_ano integer DEFAULT (EXTRACT(year FROM (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::integer, p_mes integer DEFAULT (EXTRACT(month FROM (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::integer, p_modo_periodo text DEFAULT 'janela_3'::text, p_status text DEFAULT 'todas'::text, p_as_of_date date DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role text := coalesce(auth.role(), '');
  v_service_role boolean := false;
  v_is_admin boolean := false;
  v_inicio date;
  v_fim date;
  v_canonical jsonb;
  v_collection_allowed boolean := false;
  v_result jsonb;
begin
  if p_ano not between 2000 and 2200
     or p_mes not between 1 and 12 then
    raise exception using
      errcode = '22023',
      message = 'competencia financeira invalida';
  end if;

  if p_modo_periodo not in ('janela_3', 'competencia') then
    raise exception using
      errcode = '22023',
      message = 'p_modo_periodo deve ser janela_3 ou competencia';
  end if;

  if p_status not in (
    'todas',
    'pagas',
    'em_aberto',
    'em_atraso_d0',
    'a_vencer',
    'canceladas',
    'cobranca_d2',
    'reconciliacao'
  ) then
    raise exception using
      errcode = '22023',
      message = 'p_status financeiro invalido';
  end if;

  if p_as_of_date is null
     or p_as_of_date > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception using
      errcode = '22023',
      message = 'p_as_of_date nao pode estar no futuro';
  end if;

  if v_role not in ('authenticated', 'service_role') then
    raise exception using
      errcode = '42501',
      message = 'papel nao autorizado para consultar faturas';
  end if;

  v_service_role := v_role = 'service_role';
  if not v_service_role then
    v_is_admin := public.is_admin();
    if not v_is_admin
       and p_unidade_id is not null
       and not exists (
         select 1
         from public.get_user_unidade_ids() as unidade_autorizada(id)
         where unidade_autorizada.id = p_unidade_id
       ) then
      raise exception using
        errcode = '42501',
        message = 'usuario nao autorizado para esta unidade';
    end if;
  end if;

  v_fim := make_date(p_ano, p_mes, 1);
  v_inicio := case
    when p_modo_periodo = 'janela_3' then (v_fim - interval '2 months')::date
    else v_fim
  end;

  -- A chamada abaixo conserva a regra de negocio ja publicada: somente aluno
  -- matriculado e ativo entra na fila D+2; trancado, evadido e ex-aluno ficam
  -- fora da cobranca, sem desaparecer do historico de faturas.
  v_canonical := public.get_inadimplencia_canonica(p_unidade_id, p_as_of_date);
  v_collection_allowed := coalesce(
    (v_canonical #>> '{operational,collection_allowed}')::boolean,
    false
  );

  with unidades_autorizadas as (
    select u.id
    from public.unidades u
    where u.ativo is true
      and (p_unidade_id is null or u.id = p_unidade_id)
      and (
        v_service_role
        or v_is_admin
        or u.id in (select public.get_user_unidade_ids())
      )
  ),
  competencias_desejadas as (
    select generate_series(v_inicio, v_fim, interval '1 month')::date as competencia
  ),
  runs_ranqueados as (
    select
      sr.id,
      sr.competencia,
      sr.completed_at,
      sr.stale_after,
      row_number() over (
        partition by sr.competencia
        order by sr.completed_at desc nulls last, sr.id desc
      ) as ordem
    from public.sync_runs sr
    join competencias_desejadas cd on cd.competencia = sr.competencia
    where sr.run_type = 'live'
      and sr.status = 'succeeded'
      and sr.snapshot_complete is true
      and sr.unidades_concluidas = 3
      and sr.completed_at is not null
  ),
  ultimo_run_por_competencia as (
    select id, competencia, completed_at, stale_after
    from runs_ranqueados
    where ordem = 1
  ),
  frescor as (
    select
      cd.competencia,
      ur.id as run_id,
      ur.completed_at,
      ur.stale_after as fresh_until,
      ur.id is not null
        and ur.stale_after >= now() as is_fresh
    from competencias_desejadas cd
    left join ultimo_run_por_competencia ur on ur.competencia = cd.competencia
  ),
  local_por_matricula as (
    select
      a.unidade_id,
      btrim(a.emusys_matricula_id) as emusys_matricula_id,
      btrim(a.emusys_student_id) as emusys_student_id,
      min(a.id) as aluno_id,
      min(a.nome) as aluno_nome,
      string_agg(distinct c.nome, ' / ' order by c.nome)
        filter (where c.nome is not null) as curso_nome,
      case
        when count(distinct fp.nome) filter (
          where a.arquivado_em is null and fp.nome is not null
        ) = 1 then min(fp.nome) filter (
          where a.arquivado_em is null and fp.nome is not null
        )
        else null
      end as forma_pagamento_prevista,
      case
        when bool_or(
          coalesce(estado.entra_financeiro_ativo, false)
          and a.arquivado_em is null
        ) then 'ativo'
        when bool_or(
          coalesce(estado.eh_trancamento_atual, false)
          and a.arquivado_em is null
        ) then 'trancado'
        when bool_or(a.data_saida is not null or a.arquivado_em is not null) then 'evadido'
        else coalesce(min(estado.status_operacional), min(a.status), 'desconhecido')
      end as estado_operacional
    from public.alunos a
    join unidades_autorizadas ua on ua.id = a.unidade_id
    left join public.vw_alunos_estado_operacional_v131 estado
      on estado.aluno_id = a.id
    left join public.cursos c on c.id = a.curso_id
    left join public.formas_pagamento fp on fp.id = a.forma_pagamento_id
    where nullif(btrim(a.emusys_matricula_id), '') is not null
      and nullif(btrim(a.emusys_student_id), '') is not null
    group by a.unidade_id, btrim(a.emusys_matricula_id), btrim(a.emusys_student_id)
  ),
  canonical_d2 as (
    select
      (item ->> 'canonical_fatura_id')::uuid as canonical_fatura_id,
      (item ->> 'unidade_id')::uuid as unidade_id,
      coalesce((item ->> 'dias_atraso')::integer, 0) as dias_atraso,
      coalesce(item ->> 'contact_resolution_status', 'missing') as contact_resolution_status
    from jsonb_array_elements(coalesce(v_canonical -> 'items', '[]'::jsonb)) as item
    where coalesce(item ->> 'canonical_fatura_id', '') <> ''
      and coalesce(item ->> 'unidade_id', '') <> ''
  ),
  linhas_snapshot as (
    select
      i.*,
      ur.completed_at as sync_completed_at,
      ef.juros_e_multa as emusys_juros_espelho,
      ef.synced_at as emusys_synced_at,
      ur.stale_after as sync_fresh_until,
      lp.aluno_id,
      lp.aluno_nome,
      lp.curso_nome,
      lp.forma_pagamento_prevista,
      lp.estado_operacional,
      cd2.dias_atraso as canonical_dias_atraso,
      cd2.contact_resolution_status as canonical_contact_status
    from ultimo_run_por_competencia ur
    join public.sync_run_items i on i.run_id = ur.id
    left join public.emusys_faturas ef
      on ef.unidade_id = i.unidade_id
     and ef.emusys_fatura_id = i.emusys_fatura_id
    join unidades_autorizadas ua on ua.id = i.unidade_id
    left join local_por_matricula lp
      on lp.unidade_id = i.unidade_id
     and lp.emusys_matricula_id = btrim(i.emusys_matricula_id::text)
     and lp.emusys_student_id = btrim(i.emusys_student_id::text)
    left join canonical_d2 cd2
      on cd2.unidade_id = i.unidade_id
     and cd2.canonical_fatura_id = i.canonical_fatura_id
    where i.competencia between v_inicio and v_fim
  ),
  classificadas as (
    select
      ls.*,
      lower(btrim(coalesce(ls.status, ''))) as status_normalizado,
      case
        when ls.payload #> '{_la_report,validation_issues}' is null then '[]'::jsonb
        when jsonb_typeof(ls.payload #> '{_la_report,validation_issues}') = 'array'
          then ls.payload #> '{_la_report,validation_issues}'
        else jsonb_build_array(jsonb_build_object(
          'field', 'validation_issues',
          'code', 'invalid_validation_metadata'
        ))
      end as validation_issues,
      (
        ls.emusys_matricula_id is null
        or ls.emusys_student_id is null
        or ls.aluno_id is null
      ) as identidade_invalida,
      nullif(btrim(ls.payload ->> 'forma_pagamento_transacao'), '')
        as forma_pagamento_transacao
    from linhas_snapshot ls
  ),
  calculadas as (
    select
      c.*,
      public.calcular_valores_fatura_financeiro_v1(
        c.valor_original,
        c.desconto_fixo,
        c.desconto_condicional,
        c.data_vencimento,
        c.status_normalizado,
        p_as_of_date,
        c.unidade_id,
        c.emusys_juros_espelho,
        c.emusys_synced_at
      ) as valores_calculados
    from classificadas c
  ),
  avaliadas as (
    select
      c.*,
      c.status_normalizado in ('aberta', 'paga', 'cancelada') as status_suportado,
      not c.source_missing
        and c.status_normalizado in ('aberta', 'paga', 'cancelada')
        and not c.identidade_invalida as entra_nos_totais,
      c.status_normalizado = 'aberta'
        and c.data_vencimento < p_as_of_date as em_atraso_d0,
      c.status_normalizado = 'aberta'
        and c.data_vencimento >= p_as_of_date as a_vencer,
      v_collection_allowed
        and c.canonical_dias_atraso >= 2
        and not c.source_missing
        and not c.identidade_invalida
        and c.status_normalizado = 'aberta' as cobranca_d2,
      case
        when c.status_normalizado = 'paga'
          and c.forma_pagamento_transacao is not null then c.forma_pagamento_transacao
        when c.status_normalizado in ('aberta', 'cancelada')
          and c.forma_pagamento_prevista is not null then c.forma_pagamento_prevista
        else null
      end as forma_pagamento_nome,
      case
        when c.status_normalizado = 'paga'
          and c.forma_pagamento_transacao is not null then 'Pago via'
        when c.status_normalizado in ('aberta', 'cancelada')
          and c.forma_pagamento_prevista is not null then 'Forma prevista'
        else 'Forma nao informada'
      end as forma_pagamento_rotulo,
      case
        when c.status_normalizado = 'paga'
          and c.forma_pagamento_transacao is not null then 'transacao'
        when c.status_normalizado in ('aberta', 'cancelada')
          and c.forma_pagamento_prevista is not null then 'matricula'
        else 'ausente'
      end as forma_pagamento_fonte
    from calculadas c
  ),
  itens_normais as (
    select a.*
    from avaliadas a
    where a.entra_nos_totais
  ),
  itens_filtrados as (
    select n.*
    from itens_normais n
    where p_status = 'todas'
       or (p_status = 'pagas' and n.status_normalizado = 'paga')
       or (p_status = 'em_aberto' and n.status_normalizado = 'aberta')
       or (p_status = 'em_atraso_d0' and n.em_atraso_d0)
       or (p_status = 'a_vencer' and n.a_vencer)
       or (p_status = 'canceladas' and n.status_normalizado = 'cancelada')
       or (p_status = 'cobranca_d2' and n.cobranca_d2)
  ),
  itens_reconciliacao as (
    select a.*,
      array_remove(array[
        case when a.source_missing then 'source_missing' end,
        case when a.identidade_invalida then 'identidade_invalida' end,
        case when not a.status_suportado then 'status_desconhecido' end,
        case when jsonb_array_length(a.validation_issues) > 0 then 'validacao_origem' end,
        case when a.forma_pagamento_nome is null then 'forma_pagamento_ausente' end,
        case when a.canonical_contact_status is not null
          and a.canonical_contact_status <> 'resolved' then 'contato_pendente' end
      ]::text[], null) as motivos
    from avaliadas a
    where a.source_missing
       or a.identidade_invalida
       or not a.status_suportado
       or jsonb_array_length(a.validation_issues) > 0
       or a.forma_pagamento_nome is null
       or (
         a.canonical_contact_status is not null
         and a.canonical_contact_status <> 'resolved'
       )
  ),
  resumo_frescor as (
    select
      count(*)::integer as competencias_necessarias,
      count(*) filter (where is_fresh)::integer as competencias_frescas,
      count(*) filter (where not is_fresh)::integer as competencias_stale,
      min(completed_at) as sync_mais_antigo,
      min(fresh_until) as valido_ate,
      coalesce(jsonb_agg(jsonb_build_object(
        'competencia', competencia,
        'run_id', run_id,
        'completed_at', completed_at,
        'fresh_until', fresh_until,
        'is_fresh', is_fresh
      ) order by competencia), '[]'::jsonb) as competencias
    from frescor
  ),
  totais as (
    select
      count(*)::integer as todas_quantidade,
      coalesce(sum(
        case
          when status_normalizado = 'paga' then coalesce(valor_pago, 0)
          when status_normalizado = 'aberta' then coalesce((valores_calculados ->> 'valor_hoje')::numeric, 0)
          else 0
        end
      ), 0)::numeric as todas_valor,
      count(*) filter (where status_normalizado = 'paga')::integer as pagas_quantidade,
      coalesce(sum(valor_pago) filter (where status_normalizado = 'paga'), 0)::numeric as pagas_valor,
      count(*) filter (where status_normalizado = 'aberta')::integer as em_aberto_quantidade,
      coalesce(sum((valores_calculados ->> 'valor_hoje')::numeric)
        filter (where status_normalizado = 'aberta'), 0)::numeric as em_aberto_valor,
      count(*) filter (where em_atraso_d0)::integer as em_atraso_quantidade,
      coalesce(sum((valores_calculados ->> 'valor_hoje')::numeric)
        filter (where em_atraso_d0), 0)::numeric as em_atraso_valor,
      count(*) filter (where a_vencer)::integer as a_vencer_quantidade,
      coalesce(sum((valores_calculados ->> 'valor_hoje')::numeric)
        filter (where a_vencer), 0)::numeric as a_vencer_valor,
      count(*) filter (where status_normalizado = 'cancelada')::integer as canceladas_quantidade,
      count(*) filter (where cobranca_d2)::integer as cobranca_d2_quantidade,
      coalesce(sum((valores_calculados ->> 'valor_hoje')::numeric)
        filter (where cobranca_d2), 0)::numeric as cobranca_d2_valor
    from itens_normais
  ),
  total_filtrado as (
    select
      count(*)::integer as quantidade,
      coalesce(sum(
        case
          when status_normalizado = 'paga' then coalesce(valor_pago, 0)
          when status_normalizado = 'aberta' then coalesce((valores_calculados ->> 'valor_hoje')::numeric, 0)
          else 0
        end
      ), 0)::numeric as valor
    from itens_filtrados
  ),
  resumo_reconciliacao as (
    select
      count(*) filter (where source_missing)::integer as source_missing,
      count(*) filter (where identidade_invalida)::integer as identidade_invalida,
      count(*) filter (where not status_suportado)::integer as status_desconhecido,
      count(*) filter (where jsonb_array_length(validation_issues) > 0)::integer as validacoes_origem,
      count(*) filter (where forma_pagamento_nome is null)::integer as forma_pagamento_ausente,
      count(*) filter (
        where canonical_contact_status is not null
          and canonical_contact_status <> 'resolved'
      )::integer as contato_pendente,
      count(*)::integer as total
    from itens_reconciliacao
  )
  select jsonb_build_object(
    'schema_version', 1,
    'fonte', 'sync_run_items',
    'as_of_date', p_as_of_date,
    'periodo', jsonb_build_object(
      'modo', p_modo_periodo,
      'competencia_inicio', v_inicio,
      'competencia_fim', v_fim
    ),
    'status', case
      when rf.competencias_stale > 0 then 'stale'
      when rr.total > 0 then 'partial'
      else 'ok'
    end,
    'freshness', jsonb_build_object(
      'policy', 'sync_runs.stale_after',
      'competencias_necessarias', rf.competencias_necessarias,
      'competencias_frescas', rf.competencias_frescas,
      'competencias_stale', rf.competencias_stale,
      'sync_mais_antigo', rf.sync_mais_antigo,
      'valido_ate', rf.valido_ate,
      'competencias', rf.competencias
    ),
    'operational', jsonb_build_object(
      'collection_allowed', v_collection_allowed,
      'collection_scope', coalesce(v_canonical #>> '{operational,collection_scope}', 'blocked'),
      'cobranca_regra', 'd_plus_2_apenas_aluno_ativo'
    ),
    'totais', jsonb_build_object(
      'todas', jsonb_build_object('quantidade', t.todas_quantidade, 'valor', round(t.todas_valor, 2)),
      'pagas', jsonb_build_object('quantidade', t.pagas_quantidade, 'valor', round(t.pagas_valor, 2)),
      'em_aberto', jsonb_build_object('quantidade', t.em_aberto_quantidade, 'valor', round(t.em_aberto_valor, 2)),
      'em_atraso_d0', jsonb_build_object('quantidade', t.em_atraso_quantidade, 'valor', round(t.em_atraso_valor, 2)),
      'a_vencer', jsonb_build_object('quantidade', t.a_vencer_quantidade, 'valor', round(t.a_vencer_valor, 2)),
      'canceladas', jsonb_build_object('quantidade', t.canceladas_quantidade),
      'cobranca_d2', jsonb_build_object('quantidade', t.cobranca_d2_quantidade, 'valor', round(t.cobranca_d2_valor, 2)),
      'visao_atual', jsonb_build_object('status', p_status, 'quantidade', tf.quantidade, 'valor', round(tf.valor, 2))
    ),
    'items', case
      when p_status = 'reconciliacao' then '[]'::jsonb
      else coalesce((
        select jsonb_agg(jsonb_build_object(
          'canonical_fatura_id', i.canonical_fatura_id,
          'unidade_id', i.unidade_id,
          'unidade_codigo', i.unidade_codigo,
          'competencia', i.competencia,
          'emusys_fatura_id', i.emusys_fatura_id::text,
          'emusys_matricula_id', i.emusys_matricula_id::text,
          'emusys_contrato_id', i.emusys_contrato_id::text,
          'emusys_student_id', i.emusys_student_id::text,
          'descricao', i.descricao,
          'status', i.status_normalizado,
          'data_vencimento', i.data_vencimento,
          'data_pagamento', i.data_pagamento,
          'aluno', jsonb_build_object(
            'id', i.aluno_id,
            'nome', coalesce(i.aluno_nome, 'Aluno nao vinculado'),
            'curso_nome', i.curso_nome,
            'estado_operacional', i.estado_operacional
          ),
          'forma_pagamento', jsonb_build_object(
            'rotulo', i.forma_pagamento_rotulo,
            'nome', i.forma_pagamento_nome,
            'fonte', i.forma_pagamento_fonte
          ),
          'valores', jsonb_build_object(
            'valor_com_desconto', i.valores_calculados -> 'valor_com_desconto',
            'valor_sem_desconto_condicional', i.valores_calculados -> 'valor_sem_desconto_condicional',
            'multa', i.valores_calculados -> 'multa',
            'mora', i.valores_calculados -> 'mora',
            'valor_hoje', i.valores_calculados -> 'valor_hoje',
            'valor_pago', i.valor_pago,
            'juros_e_multa_snapshot', i.juros_e_multa,
            'origem_juros', i.valores_calculados -> 'origem_juros',
            'juros_emusys', i.valores_calculados -> 'juros_emusys'
          ),
          'cobranca', jsonb_build_object(
            'd0', i.em_atraso_d0,
            'd2_elegivel', i.cobranca_d2,
            'motivo_nao_elegivel', case
              when i.cobranca_d2 then null
              when not v_collection_allowed then 'leitura_canonica_bloqueada'
              when i.source_missing then 'source_missing'
              when i.identidade_invalida then 'identidade_invalida'
              when i.status_normalizado <> 'aberta' then 'fatura_nao_aberta'
              when not i.em_atraso_d0 then 'nao_vencida'
              when coalesce(i.canonical_dias_atraso, 0) < 2 then 'carencia_d_plus_2'
              else 'fora_da_carteira_ativa'
            end
          ),
          'sync_completed_at', i.sync_completed_at,
          'sync_fresh_until', i.sync_fresh_until
        ) order by i.data_vencimento, i.unidade_codigo, i.emusys_fatura_id)
        from itens_filtrados i
      ), '[]'::jsonb)
    end,
    'reconciliation', jsonb_build_object(
      'source_missing', rr.source_missing,
      'identidade_invalida', rr.identidade_invalida,
      'status_desconhecido', rr.status_desconhecido,
      'validacoes_origem', rr.validacoes_origem,
      'forma_pagamento_ausente', rr.forma_pagamento_ausente,
      'contato_pendente', rr.contato_pendente,
      'total', rr.total,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'canonical_fatura_id', i.canonical_fatura_id,
          'unidade_id', i.unidade_id,
          'unidade_codigo', i.unidade_codigo,
          'competencia', i.competencia,
          'emusys_fatura_id', i.emusys_fatura_id::text,
          'emusys_matricula_id', i.emusys_matricula_id::text,
          'descricao', i.descricao,
          'status', i.status_normalizado,
          'data_vencimento', i.data_vencimento,
          'aluno', jsonb_build_object(
            'id', i.aluno_id,
            'nome', coalesce(i.aluno_nome, 'Aluno nao vinculado'),
            'curso_nome', i.curso_nome,
            'estado_operacional', i.estado_operacional
          ),
          'forma_pagamento', jsonb_build_object(
            'rotulo', i.forma_pagamento_rotulo,
            'nome', i.forma_pagamento_nome,
            'fonte', i.forma_pagamento_fonte
          ),
          'motivos', to_jsonb(i.motivos),
          'validation_issues', i.validation_issues,
          'source_missing_reason', i.source_missing_reason,
          'sync_completed_at', i.sync_completed_at
        ) order by i.data_vencimento, i.unidade_codigo, i.emusys_fatura_id)
        from itens_reconciliacao i
      ), '[]'::jsonb)
    )
  ) into v_result
  from resumo_frescor rf
  cross join totais t
  cross join total_filtrado tf
  cross join resumo_reconciliacao rr;

  return v_result;
end;
$function$;


-- ---------------------------------------------------------------------------
-- 5) get_faturas_alunos_financeiro_v1_reconciliacao_base: espelho (juros+synced_at) para o cálculo e origem_juros no item
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_faturas_alunos_financeiro_v1_reconciliacao_base(p_unidade_id uuid DEFAULT NULL::uuid, p_ano integer DEFAULT (EXTRACT(year FROM (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::integer, p_mes integer DEFAULT (EXTRACT(month FROM (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::integer, p_modo_periodo text DEFAULT 'janela_3'::text, p_status text DEFAULT 'todas'::text, p_as_of_date date DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role text := coalesce(auth.role(), '');
  v_service_role boolean := false;
  v_is_admin boolean := false;
  v_inicio date;
  v_fim date;
  v_canonical jsonb;
  v_collection_allowed boolean := false;
  v_result jsonb;
begin
  if p_ano not between 2000 and 2200
     or p_mes not between 1 and 12 then
    raise exception using
      errcode = '22023',
      message = 'competencia financeira invalida';
  end if;

  if p_modo_periodo not in ('janela_3', 'competencia') then
    raise exception using
      errcode = '22023',
      message = 'p_modo_periodo deve ser janela_3 ou competencia';
  end if;

  if p_status not in (
    'todas',
    'pagas',
    'em_aberto',
    'em_atraso_d0',
    'a_vencer',
    'canceladas',
    'cobranca_d2',
    'reconciliacao'
  ) then
    raise exception using
      errcode = '22023',
      message = 'p_status financeiro invalido';
  end if;

  if p_as_of_date is null
     or p_as_of_date > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception using
      errcode = '22023',
      message = 'p_as_of_date nao pode estar no futuro';
  end if;

  if v_role not in ('authenticated', 'service_role') then
    raise exception using
      errcode = '42501',
      message = 'papel nao autorizado para consultar faturas';
  end if;

  v_service_role := v_role = 'service_role';
  if not v_service_role then
    v_is_admin := public.is_admin();
    if not v_is_admin
       and p_unidade_id is not null
       and not exists (
         select 1
         from public.get_user_unidade_ids() as unidade_autorizada(id)
         where unidade_autorizada.id = p_unidade_id
       ) then
      raise exception using
        errcode = '42501',
        message = 'usuario nao autorizado para esta unidade';
    end if;
  end if;

  v_fim := make_date(p_ano, p_mes, 1);
  v_inicio := case
    when p_modo_periodo = 'janela_3' then (v_fim - interval '2 months')::date
    else v_fim
  end;

  -- A chamada abaixo conserva a regra de negocio ja publicada: somente aluno
  -- matriculado e ativo entra na fila D+2; trancado, evadido e ex-aluno ficam
  -- fora da cobranca, sem desaparecer do historico de faturas.
  v_canonical := public.get_inadimplencia_canonica(p_unidade_id, p_as_of_date);
  v_collection_allowed := coalesce(
    (v_canonical #>> '{operational,collection_allowed}')::boolean,
    false
  );

  with unidades_autorizadas as (
    select u.id
    from public.unidades u
    where u.ativo is true
      and (p_unidade_id is null or u.id = p_unidade_id)
      and (
        v_service_role
        or v_is_admin
        or u.id in (select public.get_user_unidade_ids())
      )
  ),
  competencias_desejadas as (
    select generate_series(v_inicio, v_fim, interval '1 month')::date as competencia
  ),
  runs_ranqueados as (
    select
      sr.id,
      sr.competencia,
      sr.completed_at,
      sr.stale_after,
      row_number() over (
        partition by sr.competencia
        order by sr.completed_at desc nulls last, sr.id desc
      ) as ordem
    from public.sync_runs sr
    join competencias_desejadas cd on cd.competencia = sr.competencia
    where sr.run_type = 'live'
      and sr.status = 'succeeded'
      and sr.snapshot_complete is true
      and sr.unidades_concluidas = 3
      and sr.completed_at is not null
  ),
  ultimo_run_por_competencia as (
    select id, competencia, completed_at, stale_after
    from runs_ranqueados
    where ordem = 1
  ),
  frescor as (
    select
      cd.competencia,
      ur.id as run_id,
      ur.completed_at,
      ur.stale_after as fresh_until,
      ur.id is not null
        and ur.stale_after >= now() as is_fresh
    from competencias_desejadas cd
    left join ultimo_run_por_competencia ur on ur.competencia = cd.competencia
  ),
  local_por_matricula as (
    select
      a.unidade_id,
      btrim(a.emusys_matricula_id) as emusys_matricula_id,
      btrim(a.emusys_student_id) as emusys_student_id,
      min(a.id) as aluno_id,
      min(a.nome) as aluno_nome,
      string_agg(distinct c.nome, ' / ' order by c.nome)
        filter (where c.nome is not null) as curso_nome,
      case
        when count(distinct fp.nome) filter (
          where a.arquivado_em is null and fp.nome is not null
        ) = 1 then min(fp.nome) filter (
          where a.arquivado_em is null and fp.nome is not null
        )
        else null
      end as forma_pagamento_prevista,
      case
        when bool_or(
          coalesce(estado.entra_financeiro_ativo, false)
          and a.arquivado_em is null
        ) then 'ativo'
        when bool_or(
          coalesce(estado.eh_trancamento_atual, false)
          and a.arquivado_em is null
        ) then 'trancado'
        when bool_or(a.data_saida is not null or a.arquivado_em is not null) then 'evadido'
        else coalesce(min(estado.status_operacional), min(a.status), 'desconhecido')
      end as estado_operacional
    from public.alunos a
    join unidades_autorizadas ua on ua.id = a.unidade_id
    left join public.vw_alunos_estado_operacional_v131 estado
      on estado.aluno_id = a.id
    left join public.cursos c on c.id = a.curso_id
    left join public.formas_pagamento fp on fp.id = a.forma_pagamento_id
    where nullif(btrim(a.emusys_matricula_id), '') is not null
      and nullif(btrim(a.emusys_student_id), '') is not null
    group by a.unidade_id, btrim(a.emusys_matricula_id), btrim(a.emusys_student_id)
  ),
  canonical_d2 as (
    select
      (item ->> 'canonical_fatura_id')::uuid as canonical_fatura_id,
      (item ->> 'unidade_id')::uuid as unidade_id,
      coalesce((item ->> 'dias_atraso')::integer, 0) as dias_atraso,
      coalesce(item ->> 'contact_resolution_status', 'missing') as contact_resolution_status
    from jsonb_array_elements(coalesce(v_canonical -> 'items', '[]'::jsonb)) as item
    where coalesce(item ->> 'canonical_fatura_id', '') <> ''
      and coalesce(item ->> 'unidade_id', '') <> ''
  ),
  linhas_snapshot as (
    select
      i.*,
      ur.completed_at as sync_completed_at,
      ef.juros_e_multa as emusys_juros_espelho,
      ef.synced_at as emusys_synced_at,
      ur.stale_after as sync_fresh_until,
      lp.aluno_id,
      lp.aluno_nome,
      lp.curso_nome,
      lp.forma_pagamento_prevista,
      lp.estado_operacional,
      cd2.dias_atraso as canonical_dias_atraso,
      cd2.contact_resolution_status as canonical_contact_status
    from ultimo_run_por_competencia ur
    join public.sync_run_items i on i.run_id = ur.id
    left join public.emusys_faturas ef
      on ef.unidade_id = i.unidade_id
     and ef.emusys_fatura_id = i.emusys_fatura_id
    join unidades_autorizadas ua on ua.id = i.unidade_id
    left join local_por_matricula lp
      on lp.unidade_id = i.unidade_id
     and lp.emusys_matricula_id = btrim(i.emusys_matricula_id::text)
     and lp.emusys_student_id = btrim(i.emusys_student_id::text)
    left join canonical_d2 cd2
      on cd2.unidade_id = i.unidade_id
     and cd2.canonical_fatura_id = i.canonical_fatura_id
    where i.competencia between v_inicio and v_fim
  ),
  classificadas as (
    select
      ls.*,
      lower(btrim(coalesce(ls.status, ''))) as status_normalizado,
      case
        when ls.payload #> '{_la_report,validation_issues}' is null then '[]'::jsonb
        when jsonb_typeof(ls.payload #> '{_la_report,validation_issues}') = 'array'
          then ls.payload #> '{_la_report,validation_issues}'
        else jsonb_build_array(jsonb_build_object(
          'field', 'validation_issues',
          'code', 'invalid_validation_metadata'
        ))
      end as validation_issues,
      (
        ls.emusys_matricula_id is null
        or ls.emusys_student_id is null
        or ls.aluno_id is null
      ) as identidade_invalida,
      nullif(btrim(ls.payload ->> 'forma_pagamento_transacao'), '')
        as forma_pagamento_transacao
    from linhas_snapshot ls
  ),
  calculadas as (
    select
      c.*,
      public.calcular_valores_fatura_financeiro_v1(
        c.valor_original,
        c.desconto_fixo,
        c.desconto_condicional,
        c.data_vencimento,
        c.status_normalizado,
        p_as_of_date,
        c.unidade_id,
        c.emusys_juros_espelho,
        c.emusys_synced_at
      ) as valores_calculados
    from classificadas c
  ),
  avaliadas as (
    select
      c.*,
      c.status_normalizado in ('aberta', 'paga', 'cancelada') as status_suportado,
      not c.source_missing
        and c.status_normalizado in ('aberta', 'paga', 'cancelada') as entra_nos_totais,
      c.status_normalizado = 'aberta'
        and c.data_vencimento < p_as_of_date as em_atraso_d0,
      c.status_normalizado = 'aberta'
        and c.data_vencimento >= p_as_of_date as a_vencer,
      v_collection_allowed
        and c.canonical_dias_atraso >= 2
        and not c.source_missing
        and not c.identidade_invalida
        and c.status_normalizado = 'aberta' as cobranca_d2,
      case
        when c.status_normalizado = 'paga'
          and c.forma_pagamento_transacao is not null then c.forma_pagamento_transacao
        when c.status_normalizado in ('aberta', 'cancelada')
          and c.forma_pagamento_prevista is not null then c.forma_pagamento_prevista
        else null
      end as forma_pagamento_nome,
      case
        when c.status_normalizado = 'paga'
          and c.forma_pagamento_transacao is not null then 'Pago via'
        when c.status_normalizado in ('aberta', 'cancelada')
          and c.forma_pagamento_prevista is not null then 'Forma prevista'
        else 'Forma nao informada'
      end as forma_pagamento_rotulo,
      case
        when c.status_normalizado = 'paga'
          and c.forma_pagamento_transacao is not null then 'transacao'
        when c.status_normalizado in ('aberta', 'cancelada')
          and c.forma_pagamento_prevista is not null then 'matricula'
        else 'ausente'
      end as forma_pagamento_fonte
    from calculadas c
  ),
  itens_normais as (
    select a.*
    from avaliadas a
    where a.entra_nos_totais
  ),
  itens_filtrados as (
    select n.*
    from itens_normais n
    where p_status = 'todas'
       or (p_status = 'pagas' and n.status_normalizado = 'paga')
       or (p_status = 'em_aberto' and n.status_normalizado = 'aberta')
       or (p_status = 'em_atraso_d0' and n.em_atraso_d0)
       or (p_status = 'a_vencer' and n.a_vencer)
       or (p_status = 'canceladas' and n.status_normalizado = 'cancelada')
       or (p_status = 'cobranca_d2' and n.cobranca_d2)
  ),
  itens_reconciliacao as (
    select a.*,
      array_remove(array[
        case when a.source_missing then 'source_missing' end,
        case when a.identidade_invalida then 'identidade_invalida' end,
        case when not a.status_suportado then 'status_desconhecido' end,
        case when jsonb_array_length(a.validation_issues) > 0 then 'validacao_origem' end,
        case when a.forma_pagamento_nome is null then 'forma_pagamento_ausente' end,
        case when a.canonical_contact_status is not null
          and a.canonical_contact_status <> 'resolved' then 'contato_pendente' end
      ]::text[], null) as motivos
    from avaliadas a
    where a.source_missing
       or a.identidade_invalida
       or not a.status_suportado
       or jsonb_array_length(a.validation_issues) > 0
       or a.forma_pagamento_nome is null
       or (
         a.canonical_contact_status is not null
         and a.canonical_contact_status <> 'resolved'
       )
  ),
  resumo_frescor as (
    select
      count(*)::integer as competencias_necessarias,
      count(*) filter (where is_fresh)::integer as competencias_frescas,
      count(*) filter (where not is_fresh)::integer as competencias_stale,
      min(completed_at) as sync_mais_antigo,
      min(fresh_until) as valido_ate,
      coalesce(jsonb_agg(jsonb_build_object(
        'competencia', competencia,
        'run_id', run_id,
        'completed_at', completed_at,
        'fresh_until', fresh_until,
        'is_fresh', is_fresh
      ) order by competencia), '[]'::jsonb) as competencias
    from frescor
  ),
  totais as (
    select
      count(*)::integer as todas_quantidade,
      coalesce(sum(
        case
          when status_normalizado = 'paga' then coalesce(valor_pago, 0)
          when status_normalizado = 'aberta' then coalesce((valores_calculados ->> 'valor_hoje')::numeric, 0)
          else 0
        end
      ), 0)::numeric as todas_valor,
      count(*) filter (where status_normalizado = 'paga')::integer as pagas_quantidade,
      coalesce(sum(valor_pago) filter (where status_normalizado = 'paga'), 0)::numeric as pagas_valor,
      count(*) filter (where status_normalizado = 'aberta')::integer as em_aberto_quantidade,
      coalesce(sum((valores_calculados ->> 'valor_hoje')::numeric)
        filter (where status_normalizado = 'aberta'), 0)::numeric as em_aberto_valor,
      count(*) filter (where em_atraso_d0)::integer as em_atraso_quantidade,
      coalesce(sum((valores_calculados ->> 'valor_hoje')::numeric)
        filter (where em_atraso_d0), 0)::numeric as em_atraso_valor,
      count(*) filter (where a_vencer)::integer as a_vencer_quantidade,
      coalesce(sum((valores_calculados ->> 'valor_hoje')::numeric)
        filter (where a_vencer), 0)::numeric as a_vencer_valor,
      count(*) filter (where status_normalizado = 'cancelada')::integer as canceladas_quantidade,
      count(*) filter (where cobranca_d2)::integer as cobranca_d2_quantidade,
      coalesce(sum((valores_calculados ->> 'valor_hoje')::numeric)
        filter (where cobranca_d2), 0)::numeric as cobranca_d2_valor
    from itens_normais
  ),
  total_filtrado as (
    select
      count(*)::integer as quantidade,
      coalesce(sum(
        case
          when status_normalizado = 'paga' then coalesce(valor_pago, 0)
          when status_normalizado = 'aberta' then coalesce((valores_calculados ->> 'valor_hoje')::numeric, 0)
          else 0
        end
      ), 0)::numeric as valor
    from itens_filtrados
  ),
  resumo_reconciliacao as (
    select
      count(*) filter (where source_missing)::integer as source_missing,
      count(*) filter (where identidade_invalida)::integer as identidade_invalida,
      count(*) filter (where not status_suportado)::integer as status_desconhecido,
      count(*) filter (where jsonb_array_length(validation_issues) > 0)::integer as validacoes_origem,
      count(*) filter (where forma_pagamento_nome is null)::integer as forma_pagamento_ausente,
      count(*) filter (
        where canonical_contact_status is not null
          and canonical_contact_status <> 'resolved'
      )::integer as contato_pendente,
      count(*)::integer as total
    from itens_reconciliacao
  )
  select jsonb_build_object(
    'schema_version', 1,
    'fonte', 'sync_run_items',
    'as_of_date', p_as_of_date,
    'periodo', jsonb_build_object(
      'modo', p_modo_periodo,
      'competencia_inicio', v_inicio,
      'competencia_fim', v_fim
    ),
    'status', case
      when rf.competencias_stale > 0 then 'stale'
      when rr.total > 0 then 'partial'
      else 'ok'
    end,
    'freshness', jsonb_build_object(
      'policy', 'sync_runs.stale_after',
      'competencias_necessarias', rf.competencias_necessarias,
      'competencias_frescas', rf.competencias_frescas,
      'competencias_stale', rf.competencias_stale,
      'sync_mais_antigo', rf.sync_mais_antigo,
      'valido_ate', rf.valido_ate,
      'competencias', rf.competencias
    ),
    'operational', jsonb_build_object(
      'collection_allowed', v_collection_allowed,
      'collection_scope', coalesce(v_canonical #>> '{operational,collection_scope}', 'blocked'),
      'cobranca_regra', 'd_plus_2_apenas_aluno_ativo'
    ),
    'totais', jsonb_build_object(
      'todas', jsonb_build_object('quantidade', t.todas_quantidade, 'valor', round(t.todas_valor, 2)),
      'pagas', jsonb_build_object('quantidade', t.pagas_quantidade, 'valor', round(t.pagas_valor, 2)),
      'em_aberto', jsonb_build_object('quantidade', t.em_aberto_quantidade, 'valor', round(t.em_aberto_valor, 2)),
      'em_atraso_d0', jsonb_build_object('quantidade', t.em_atraso_quantidade, 'valor', round(t.em_atraso_valor, 2)),
      'a_vencer', jsonb_build_object('quantidade', t.a_vencer_quantidade, 'valor', round(t.a_vencer_valor, 2)),
      'canceladas', jsonb_build_object('quantidade', t.canceladas_quantidade),
      'cobranca_d2', jsonb_build_object('quantidade', t.cobranca_d2_quantidade, 'valor', round(t.cobranca_d2_valor, 2)),
      'visao_atual', jsonb_build_object('status', p_status, 'quantidade', tf.quantidade, 'valor', round(tf.valor, 2))
    ),
    'items', case
      when p_status = 'reconciliacao' then '[]'::jsonb
      else coalesce((
        select jsonb_agg(jsonb_build_object(
          'canonical_fatura_id', i.canonical_fatura_id,
          'unidade_id', i.unidade_id,
          'unidade_codigo', i.unidade_codigo,
          'competencia', i.competencia,
          'emusys_fatura_id', i.emusys_fatura_id::text,
          'emusys_matricula_id', i.emusys_matricula_id::text,
          'emusys_contrato_id', i.emusys_contrato_id::text,
          'emusys_student_id', i.emusys_student_id::text,
          'descricao', i.descricao,
          'status', i.status_normalizado,
          'data_vencimento', i.data_vencimento,
          'data_pagamento', i.data_pagamento,
          'aluno', jsonb_build_object(
            'id', i.aluno_id,
            'nome', coalesce(i.aluno_nome, 'Aluno nao vinculado'),
            'curso_nome', i.curso_nome,
            'estado_operacional', i.estado_operacional
          ),
          'forma_pagamento', jsonb_build_object(
            'rotulo', i.forma_pagamento_rotulo,
            'nome', i.forma_pagamento_nome,
            'fonte', i.forma_pagamento_fonte
          ),
          'valores', jsonb_build_object(
            'valor_com_desconto', i.valores_calculados -> 'valor_com_desconto',
            'valor_sem_desconto_condicional', i.valores_calculados -> 'valor_sem_desconto_condicional',
            'multa', i.valores_calculados -> 'multa',
            'mora', i.valores_calculados -> 'mora',
            'valor_hoje', i.valores_calculados -> 'valor_hoje',
            'valor_pago', i.valor_pago,
            'juros_e_multa_snapshot', i.juros_e_multa,
            'origem_juros', i.valores_calculados -> 'origem_juros',
            'juros_emusys', i.valores_calculados -> 'juros_emusys'
          ),
          'cobranca', jsonb_build_object(
            'd0', i.em_atraso_d0,
            'd2_elegivel', i.cobranca_d2,
            'motivo_nao_elegivel', case
              when i.cobranca_d2 then null
              when not v_collection_allowed then 'leitura_canonica_bloqueada'
              when i.source_missing then 'source_missing'
              when i.identidade_invalida then 'identidade_invalida'
              when i.status_normalizado <> 'aberta' then 'fatura_nao_aberta'
              when not i.em_atraso_d0 then 'nao_vencida'
              when coalesce(i.canonical_dias_atraso, 0) < 2 then 'carencia_d_plus_2'
              else 'fora_da_carteira_ativa'
            end
          ),
          'sync_completed_at', i.sync_completed_at,
          'sync_fresh_until', i.sync_fresh_until
        ) order by i.data_vencimento, i.unidade_codigo, i.emusys_fatura_id)
        from itens_filtrados i
      ), '[]'::jsonb)
    end,
    'reconciliation', jsonb_build_object(
      'source_missing', rr.source_missing,
      'identidade_invalida', rr.identidade_invalida,
      'status_desconhecido', rr.status_desconhecido,
      'validacoes_origem', rr.validacoes_origem,
      'forma_pagamento_ausente', rr.forma_pagamento_ausente,
      'contato_pendente', rr.contato_pendente,
      'total', rr.total,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'canonical_fatura_id', i.canonical_fatura_id,
          'unidade_id', i.unidade_id,
          'unidade_codigo', i.unidade_codigo,
          'competencia', i.competencia,
          'emusys_fatura_id', i.emusys_fatura_id::text,
          'emusys_matricula_id', i.emusys_matricula_id::text,
          'emusys_contrato_id', i.emusys_contrato_id::text,
          'emusys_student_id', i.emusys_student_id::text,
          'descricao', i.descricao,
          'status', i.status_normalizado,
          'data_vencimento', i.data_vencimento,
          'data_pagamento', i.data_pagamento,
          'aluno', jsonb_build_object(
            'id', i.aluno_id,
            'nome', coalesce(i.aluno_nome, 'Aluno nao vinculado'),
            'curso_nome', i.curso_nome,
            'estado_operacional', i.estado_operacional
          ),
          'forma_pagamento', jsonb_build_object(
            'rotulo', i.forma_pagamento_rotulo,
            'nome', i.forma_pagamento_nome,
            'fonte', i.forma_pagamento_fonte
          ),
          'valores', jsonb_build_object(
            'valor_original', i.valor_original,
            'valor_com_desconto', i.valores_calculados -> 'valor_com_desconto',
            'valor_sem_desconto_condicional', i.valores_calculados -> 'valor_sem_desconto_condicional',
            'multa', i.valores_calculados -> 'multa',
            'mora', i.valores_calculados -> 'mora',
            'valor_hoje', i.valores_calculados -> 'valor_hoje',
            'valor_pago', i.valor_pago,
            'juros_e_multa_snapshot', i.juros_e_multa,
            'origem_juros', i.valores_calculados -> 'origem_juros',
            'juros_emusys', i.valores_calculados -> 'juros_emusys'
          ),
          'motivos', to_jsonb(i.motivos),
          'validation_issues', i.validation_issues,
          'source_missing_reason', i.source_missing_reason,
          'sync_completed_at', i.sync_completed_at
        ) order by i.data_vencimento, i.unidade_codigo, i.emusys_fatura_id)
        from itens_reconciliacao i
      ), '[]'::jsonb)
    )
  ) into v_result
  from resumo_frescor rf
  cross join totais t
  cross join total_filtrado tf
  cross join resumo_reconciliacao rr;

  return v_result;
end;
$function$;


-- ---------------------------------------------------------------------------
-- 5) get_faturas_alunos_financeiro_v1_canonica_20260817: espelho (juros+synced_at) para o cálculo e origem_juros no item
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_faturas_alunos_financeiro_v1_canonica_20260817(p_unidade_id uuid DEFAULT NULL::uuid, p_ano integer DEFAULT (EXTRACT(year FROM (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::integer, p_mes integer DEFAULT (EXTRACT(month FROM (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::integer, p_modo_periodo text DEFAULT 'janela_3'::text, p_status text DEFAULT 'todas'::text, p_as_of_date date DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '30s'
AS $function$
declare
  v_role text := coalesce(auth.role(), '');
  v_service_role boolean := false;
  v_is_admin boolean := false;
  v_inicio date;
  v_fim date;
  v_canonical jsonb;
  v_collection_allowed boolean := false;
  v_result jsonb;
begin
  if p_ano not between 2000 and 2200
     or p_mes not between 1 and 12 then
    raise exception using
      errcode = '22023',
      message = 'competencia financeira invalida';
  end if;

  if p_modo_periodo not in ('janela_3', 'competencia') then
    raise exception using
      errcode = '22023',
      message = 'p_modo_periodo deve ser janela_3 ou competencia';
  end if;

  if p_status not in (
    'todas',
    'pagas',
    'em_aberto',
    'em_atraso_d0',
    'a_vencer',
    'canceladas',
    'cobranca_d2',
    'reconciliacao'
  ) then
    raise exception using
      errcode = '22023',
      message = 'p_status financeiro invalido';
  end if;

  if p_as_of_date is null
     or p_as_of_date > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception using
      errcode = '22023',
      message = 'p_as_of_date nao pode estar no futuro';
  end if;

  if v_role not in ('authenticated', 'service_role') then
    raise exception using
      errcode = '42501',
      message = 'papel nao autorizado para consultar faturas';
  end if;

  v_service_role := v_role = 'service_role';
  if not v_service_role then
    v_is_admin := public.is_admin();
    if not v_is_admin
       and p_unidade_id is not null
       and not exists (
         select 1
         from public.get_user_unidade_ids() as unidade_autorizada(id)
         where unidade_autorizada.id = p_unidade_id
       ) then
      raise exception using
        errcode = '42501',
        message = 'usuario nao autorizado para esta unidade';
    end if;
  end if;

  v_fim := make_date(p_ano, p_mes, 1);
  v_inicio := case
    when p_modo_periodo = 'janela_3' then (v_fim - interval '2 months')::date
    else v_fim
  end;

  -- A chamada abaixo conserva a regra de negocio ja publicada: somente aluno
  -- matriculado e ativo entra na fila D+2; trancado, evadido e ex-aluno ficam
  -- fora da cobranca, sem desaparecer do historico de faturas.
  v_canonical := public.get_inadimplencia_canonica(p_unidade_id, p_as_of_date);
  v_collection_allowed := coalesce(
    (v_canonical #>> '{operational,collection_allowed}')::boolean,
    false
  );

  with unidades_autorizadas as (
    select u.id
    from public.unidades u
    where u.ativo is true
      and (p_unidade_id is null or u.id = p_unidade_id)
      and (
        v_service_role
        or v_is_admin
        or u.id in (select public.get_user_unidade_ids())
      )
  ),
  competencias_desejadas as (
    select generate_series(v_inicio, v_fim, interval '1 month')::date as competencia
  ),
  runs_ranqueados as (
    select
      sr.id,
      sr.competencia,
      sr.completed_at,
      sr.stale_after,
      row_number() over (
        partition by sr.competencia
        order by sr.completed_at desc nulls last, sr.id desc
      ) as ordem
    from public.sync_runs sr
    join competencias_desejadas cd on cd.competencia = sr.competencia
    where sr.run_type = 'live'
      and sr.status = 'succeeded'
      and sr.snapshot_complete is true
      and sr.unidades_concluidas = 3
      and sr.completed_at is not null
  ),
  ultimo_run_por_competencia as (
    select id, competencia, completed_at, stale_after
    from runs_ranqueados
    where ordem = 1
  ),
  frescor as (
    select
      cd.competencia,
      ur.id as run_id,
      ur.completed_at,
      ur.stale_after as fresh_until,
      ur.id is not null
        and ur.stale_after >= now() as is_fresh
    from competencias_desejadas cd
    left join ultimo_run_por_competencia ur on ur.competencia = cd.competencia
  ),
  -- A identidade financeira usa o estado canônico sincronizado do Emusys.
  -- O cadastro bruto de alunos pode ter matrícula e student_id em linhas
  -- diferentes (ou student_id nulo em uma linha duplicada); cruzá-lo diretamente
  -- cria falsos \"sem vínculo\" e bloqueia cobrança de uma fatura que tem dono.
  local_por_matricula as (
    select
      e.unidade_id,
      btrim(e.emusys_matricula_id::text) as emusys_matricula_id,
      btrim(e.emusys_aluno_id::text) as emusys_student_id,
      min(e.aluno_id) as aluno_id,
      min(a.nome) as aluno_nome,
      (array_agg(a.professor_atual_id order by e.aluno_id nulls last))[1] as professor_id,
      (array_agg(prof.nome order by e.aluno_id nulls last))[1] as professor_nome,
      string_agg(distinct c.nome, ' / ' order by c.nome)
        filter (where c.nome is not null) as curso_nome,
      case
        when count(distinct fp.nome) filter (
          where a.arquivado_em is null and fp.nome is not null
        ) = 1 then min(fp.nome) filter (
          where a.arquivado_em is null and fp.nome is not null
        )
        else null
      end as forma_pagamento_prevista,
      case
        when bool_or(e.status_emusys = 'ativa' and a.arquivado_em is null) then 'ativo'
        when bool_or(e.status_emusys = 'trancada' and a.arquivado_em is null) then 'trancado'
        when bool_or(
          e.status_emusys = 'inativa'
          or a.data_saida is not null
          or a.arquivado_em is not null
        ) then 'evadido'
        else coalesce(min(e.status_emusys), min(a.status), 'desconhecido')
      end as estado_operacional
    from (
      -- espelho canonico (fonte primaria)
      select v.unidade_id, v.emusys_matricula_id::text, v.emusys_aluno_id::text, v.aluno_id, v.status_emusys
      from public.vw_aluno_estado_operacional_canonico v
      union all
      -- fallback_cadastro_pre_espelho: matricula que ja existe no cadastro e ainda
      -- nao foi materializada pelo sync diario. Exige os TRES identificadores
      -- exatos, igual ao ramo de cima; so a origem da linha e diferente.
      select al.unidade_id,
             al.emusys_matricula_id::text,
             al.emusys_student_id::text,
             al.id,
             case al.status when 'ativo' then 'ativa' when 'trancado' then 'trancada' end
      from public.alunos al
      where al.arquivado_em is null
        and al.status in ('ativo', 'trancado')
        and nullif(btrim(al.emusys_matricula_id), '') is not null
        and nullif(btrim(al.emusys_student_id), '') is not null
        and not exists (
          select 1 from public.vw_aluno_estado_operacional_canonico v2
          where v2.unidade_id = al.unidade_id
            and btrim(v2.emusys_matricula_id::text) = btrim(al.emusys_matricula_id)
            and btrim(v2.emusys_aluno_id::text) = btrim(al.emusys_student_id)
        )
    ) e (unidade_id, emusys_matricula_id, emusys_aluno_id, aluno_id, status_emusys)
    join unidades_autorizadas ua on ua.id = e.unidade_id
    left join public.alunos a on a.id = e.aluno_id
    left join public.cursos c on c.id = a.curso_id
    left join public.formas_pagamento fp on fp.id = a.forma_pagamento_id
    left join public.professores prof on prof.id = a.professor_atual_id
    where nullif(btrim(e.emusys_matricula_id::text), '') is not null
      and nullif(btrim(e.emusys_aluno_id::text), '') is not null
    group by
      e.unidade_id,
      btrim(e.emusys_matricula_id::text),
      btrim(e.emusys_aluno_id::text)
  ),
  -- Passaporte e lançamentos antigos podem vir sem matrícula. Só usamos o
  -- student_id como fallback quando ele aponta para uma única pessoa local,
  -- sempre dentro da mesma unidade; student_id ambíguo continua reconciliável.
  local_por_aluno as (
    select
      unidade_id,
      emusys_student_id,
      count(distinct aluno_id) filter (where aluno_id is not null)::integer as aluno_count,
      min(aluno_id) filter (where aluno_id is not null) as aluno_id,
      min(aluno_nome) filter (where aluno_nome is not null) as aluno_nome,
      (array_agg(professor_id order by aluno_id nulls last))[1] as professor_id,
      (array_agg(professor_nome order by aluno_id nulls last))[1] as professor_nome,
      string_agg(distinct curso_nome, ' / ' order by curso_nome)
        filter (where curso_nome is not null) as curso_nome,
      case
        when count(distinct forma_pagamento_prevista) filter (
          where forma_pagamento_prevista is not null
        ) = 1 then min(forma_pagamento_prevista)
        else null
      end as forma_pagamento_prevista,
      case
        when bool_or(estado_operacional = 'ativo') then 'ativo'
        when bool_or(estado_operacional = 'trancado') then 'trancado'
        when bool_or(estado_operacional = 'evadido') then 'evadido'
        else min(estado_operacional)
      end as estado_operacional
    from local_por_matricula
    group by unidade_id, emusys_student_id
  ),
  canonical_d2 as (
    select
      (item ->> 'canonical_fatura_id')::uuid as canonical_fatura_id,
      (item ->> 'unidade_id')::uuid as unidade_id,
      coalesce((item ->> 'dias_atraso')::integer, 0) as dias_atraso,
      coalesce(item ->> 'contact_resolution_status', 'missing') as contact_resolution_status
    from jsonb_array_elements(coalesce(v_canonical -> 'items', '[]'::jsonb)) as item
    where coalesce(item ->> 'canonical_fatura_id', '') <> ''
      and coalesce(item ->> 'unidade_id', '') <> ''
  ),
  linhas_snapshot as (
    select
      i.*,
      ur.completed_at as sync_completed_at,
      ef.juros_e_multa as emusys_juros_espelho,
      ef.synced_at as emusys_synced_at,
      ur.stale_after as sync_fresh_until,
      case
        when lp.aluno_id is not null then lp.aluno_id
        when i.emusys_matricula_id is null and la.aluno_count = 1 then la.aluno_id
        else null
      end as aluno_id,
      case
        when lp.aluno_id is not null then lp.aluno_nome
        when i.emusys_matricula_id is null and la.aluno_count = 1 then la.aluno_nome
        else null
      end as aluno_nome,
      case
        when lp.aluno_id is not null then lp.curso_nome
        when i.emusys_matricula_id is null and la.aluno_count = 1 then la.curso_nome
        else null
      end as curso_nome,
      case
        when lp.aluno_id is not null then lp.professor_id
        when i.emusys_matricula_id is null and la.aluno_count = 1 then la.professor_id
        else null
      end as professor_id,
      case
        when lp.aluno_id is not null then lp.professor_nome
        when i.emusys_matricula_id is null and la.aluno_count = 1 then la.professor_nome
        else null
      end as professor_nome,
      case
        when lp.aluno_id is not null then lp.forma_pagamento_prevista
        when i.emusys_matricula_id is null and la.aluno_count = 1 then la.forma_pagamento_prevista
        else null
      end as forma_pagamento_prevista,
      case
        when lp.aluno_id is not null or lp.estado_operacional is not null then lp.estado_operacional
        when i.emusys_matricula_id is null and la.aluno_count = 1 then la.estado_operacional
        else null
      end as estado_operacional,
      case
        when lp.aluno_id is not null then 'matricula_canonica'
        when i.emusys_matricula_id is null and la.aluno_count = 1 then 'aluno_unico_canonico'
        else null
      end as vinculo_local_fonte,
      cd2.dias_atraso as canonical_dias_atraso,
      cd2.contact_resolution_status as canonical_contact_status
    from ultimo_run_por_competencia ur
    join public.sync_run_items i on i.run_id = ur.id
    left join public.emusys_faturas ef
      on ef.unidade_id = i.unidade_id
     and ef.emusys_fatura_id = i.emusys_fatura_id
    join unidades_autorizadas ua on ua.id = i.unidade_id
    left join local_por_matricula lp
      on lp.unidade_id = i.unidade_id
     and lp.emusys_matricula_id = btrim(i.emusys_matricula_id::text)
     and lp.emusys_student_id = btrim(i.emusys_student_id::text)
    left join local_por_aluno la
      on la.unidade_id = i.unidade_id
     and la.emusys_student_id = btrim(i.emusys_student_id::text)
     and i.emusys_matricula_id is null
    left join canonical_d2 cd2
      on cd2.unidade_id = i.unidade_id
     and cd2.canonical_fatura_id = i.canonical_fatura_id
    where i.competencia between v_inicio and v_fim
  ),
  classificadas as (
    select
      ls.*,
      lower(btrim(coalesce(ls.status, ''))) as status_normalizado,
      case
        when ls.payload #> '{_la_report,validation_issues}' is null then '[]'::jsonb
        when jsonb_typeof(ls.payload #> '{_la_report,validation_issues}') = 'array'
          then ls.payload #> '{_la_report,validation_issues}'
        else jsonb_build_array(jsonb_build_object(
          'field', 'validation_issues',
          'code', 'invalid_validation_metadata'
        ))
      end as validation_issues,
      (
        ls.emusys_student_id is null
        or ls.aluno_id is null
        or (
          ls.emusys_matricula_id is null
          and ls.vinculo_local_fonte is distinct from 'aluno_unico_canonico'
        )
      ) as identidade_invalida,
      nullif(btrim(ls.payload ->> 'forma_pagamento_transacao'), '')
        as forma_pagamento_transacao,
      -- substituta_viva: o Emusys apaga e recria a fatura ao editar a parcela.
      -- Se existe outra fatura da MESMA pessoa na MESMA competencia, com id
      -- diferente e valor > 0, a cobranca continua existindo — so mudou de id.
      (
        ls.source_missing
        and exists (
          select 1 from public.emusys_faturas ef
          where ef.unidade_id = ls.unidade_id
            and ef.emusys_student_id = ls.emusys_student_id
            and ef.competencia = ls.competencia
            and ef.emusys_fatura_id <> ls.emusys_fatura_id
            and coalesce(ef.valor_original, 0) > 0
        )
      ) as substituta_viva
    from linhas_snapshot ls
  ),
  calculadas as (
    select
      c.*,
      public.calcular_valores_fatura_financeiro_v1(
        c.valor_original,
        c.desconto_fixo,
        c.desconto_condicional,
        c.data_vencimento,
        c.status_normalizado,
        p_as_of_date,
        c.unidade_id,
        c.emusys_juros_espelho,
        c.emusys_synced_at
      ) as valores_calculados
    from classificadas c
  ),
  avaliadas as (
    select
      c.*,
      c.status_normalizado in ('aberta', 'paga', 'cancelada') as status_suportado,
      not c.source_missing
        and c.status_normalizado in ('aberta', 'paga', 'cancelada') as entra_nos_totais,
      c.status_normalizado = 'aberta'
        and c.data_vencimento < p_as_of_date as em_atraso_d0,
      c.status_normalizado = 'aberta'
        and c.data_vencimento >= p_as_of_date as a_vencer,
      v_collection_allowed
        and c.canonical_dias_atraso >= 2
        and not c.source_missing
        and not c.identidade_invalida
        and c.status_normalizado = 'aberta' as cobranca_d2,
      case
        when c.status_normalizado = 'paga'
          and c.forma_pagamento_transacao is not null then c.forma_pagamento_transacao
        when c.status_normalizado in ('aberta', 'cancelada')
          and c.forma_pagamento_prevista is not null then c.forma_pagamento_prevista
        else null
      end as forma_pagamento_nome,
      case
        when c.status_normalizado = 'paga'
          and c.forma_pagamento_transacao is not null then 'Pago via'
        when c.status_normalizado in ('aberta', 'cancelada')
          and c.forma_pagamento_prevista is not null then 'Forma prevista'
        else 'Forma nao informada'
      end as forma_pagamento_rotulo,
      case
        when c.status_normalizado = 'paga'
          and c.forma_pagamento_transacao is not null then 'transacao'
        when c.status_normalizado in ('aberta', 'cancelada')
          and c.forma_pagamento_prevista is not null then 'matricula'
        else 'ausente'
      end as forma_pagamento_fonte
    from calculadas c
  ),
  itens_normais as (
    select a.*
    from avaliadas a
    where a.entra_nos_totais
  ),
  itens_filtrados as (
    select n.*
    from itens_normais n
    where p_status = 'todas'
       or (p_status = 'pagas' and n.status_normalizado = 'paga')
       or (p_status = 'em_aberto' and n.status_normalizado = 'aberta')
       or (p_status = 'em_atraso_d0' and n.em_atraso_d0)
       or (p_status = 'a_vencer' and n.a_vencer)
       or (p_status = 'canceladas' and n.status_normalizado = 'cancelada')
       or (p_status = 'cobranca_d2' and n.cobranca_d2)
  ),
  itens_reconciliacao as (
    select a.*,
      coalesce(pp.tem_caixa, false) or coalesce(pp.tem_lancamento, false) as pagamento_detectado,
      pp.prova_pagamento,
      pp.caixa_dup,
      array_remove(array[
        case
          when a.source_missing and not a.substituta_viva
               and not (coalesce(pp.tem_caixa, false) or coalesce(pp.tem_lancamento, false))
            then 'source_missing'
          when a.source_missing and not a.substituta_viva
            then 'pagamento_detectado_fora_origem'
        end,
        case when a.identidade_invalida then 'identidade_invalida' end,
        case when not a.status_suportado then 'status_desconhecido' end,
        case when jsonb_array_length(a.validation_issues) > 0 then 'validacao_origem' end,
        case when a.forma_pagamento_nome is null then 'forma_pagamento_ausente' end,
        case when pp.caixa_dup then 'duplicata_caixa' end,
        case when a.canonical_contact_status is not null
          and a.canonical_contact_status <> 'resolved' then 'contato_pendente' end
      ]::text[], null) as motivos
    from avaliadas a
    -- Prova de pagamento fora do snapshot: baixa manual no caixa linkada a
    -- fatura, ou lancamento bancario que a Rose reconciliou no Emusys
    -- (fatura_id exposto desde 23/09). So' roda para itens da fila.
    left join lateral (
      select
        exists (
          select 1 from public.caixa_movimentacoes m
          join public.vw_caixa_movimentacao_fatura_links lnk on lnk.movimentacao_id = m.id
          join public.emusys_faturas ef on ef.id = lnk.fatura_id
          where ef.unidade_id = a.unidade_id
            and ef.emusys_fatura_id = a.emusys_fatura_id
            and m.tipo = 'entrada'
        ) as tem_caixa,
        exists (
          select 1 from public.financeiro_emusys_lancamentos l
          where l.unidade_id = a.unidade_id
            and l.emusys_fatura_id = a.emusys_fatura_id
            and l.natureza = 'entrada' and l.sumiu_em is null
        ) as tem_lancamento,
        exists (
          select 1
            from public.caixa_movimentacoes m
            join public.vw_caixa_movimentacao_fatura_links lnk on lnk.movimentacao_id = m.id
            join public.emusys_faturas ef on ef.id = lnk.fatura_id
            where ef.unidade_id = a.unidade_id
              and ef.emusys_fatura_id = a.emusys_fatura_id
              and m.tipo = 'entrada'
            group by m.valor
            having count(*) > 1
        ) as caixa_dup,
        jsonb_build_object(
          'caixa', coalesce((
            select jsonb_agg(jsonb_build_object(
              'valor', m.valor,
              'data', m.data_movimento,
              'forma', m.forma_pagamento
            ) order by m.data_movimento)
            from public.caixa_movimentacoes m
            join public.vw_caixa_movimentacao_fatura_links lnk on lnk.movimentacao_id = m.id
            join public.emusys_faturas ef on ef.id = lnk.fatura_id
            where ef.unidade_id = a.unidade_id
              and ef.emusys_fatura_id = a.emusys_fatura_id
              and m.tipo = 'entrada'
          ), '[]'::jsonb),
          'lancamentos', coalesce((
            select jsonb_agg(jsonb_build_object(
              'valor', l.valor,
              'data', l.data,
              'forma', l.forma_pagamento_descricao
            ) order by l.data)
            from public.financeiro_emusys_lancamentos l
            where l.unidade_id = a.unidade_id
              and l.emusys_fatura_id = a.emusys_fatura_id
              and l.natureza = 'entrada' and l.sumiu_em is null
          ), '[]'::jsonb)
        ) as prova_pagamento
    ) pp on true
    where (a.source_missing and not a.substituta_viva)
       or a.identidade_invalida
       or not a.status_suportado
       or jsonb_array_length(a.validation_issues) > 0
       or a.forma_pagamento_nome is null
       or pp.caixa_dup
       or (
         a.canonical_contact_status is not null
         and a.canonical_contact_status <> 'resolved'
       )
  ),
  resumo_frescor as (
    select
      count(*)::integer as competencias_necessarias,
      count(*) filter (where is_fresh)::integer as competencias_frescas,
      count(*) filter (where not is_fresh)::integer as competencias_stale,
      min(completed_at) as sync_mais_antigo,
      min(fresh_until) as valido_ate,
      coalesce(jsonb_agg(jsonb_build_object(
        'competencia', competencia,
        'run_id', run_id,
        'completed_at', completed_at,
        'fresh_until', fresh_until,
        'is_fresh', is_fresh
      ) order by competencia), '[]'::jsonb) as competencias
    from frescor
  ),
  totais as (
    select
      count(*)::integer as todas_quantidade,
      coalesce(sum(
        case
          when status_normalizado = 'paga' then coalesce(valor_pago, 0)
          when status_normalizado = 'aberta' then coalesce((valores_calculados ->> 'valor_hoje')::numeric, 0)
          else 0
        end
      ), 0)::numeric as todas_valor,
      count(*) filter (where status_normalizado = 'paga')::integer as pagas_quantidade,
      coalesce(sum(valor_pago) filter (where status_normalizado = 'paga'), 0)::numeric as pagas_valor,
      count(*) filter (where status_normalizado = 'aberta')::integer as em_aberto_quantidade,
      coalesce(sum((valores_calculados ->> 'valor_hoje')::numeric)
        filter (where status_normalizado = 'aberta'), 0)::numeric as em_aberto_valor,
      count(*) filter (where em_atraso_d0)::integer as em_atraso_quantidade,
      coalesce(sum((valores_calculados ->> 'valor_hoje')::numeric)
        filter (where em_atraso_d0), 0)::numeric as em_atraso_valor,
      count(*) filter (where a_vencer)::integer as a_vencer_quantidade,
      coalesce(sum((valores_calculados ->> 'valor_hoje')::numeric)
        filter (where a_vencer), 0)::numeric as a_vencer_valor,
      count(*) filter (where status_normalizado = 'cancelada')::integer as canceladas_quantidade,
      count(*) filter (where cobranca_d2)::integer as cobranca_d2_quantidade,
      coalesce(sum((valores_calculados ->> 'valor_hoje')::numeric)
        filter (where cobranca_d2), 0)::numeric as cobranca_d2_valor
    from itens_normais
  ),
  total_filtrado as (
    select
      count(*)::integer as quantidade,
      coalesce(sum(
        case
          when status_normalizado = 'paga' then coalesce(valor_pago, 0)
          when status_normalizado = 'aberta' then coalesce((valores_calculados ->> 'valor_hoje')::numeric, 0)
          else 0
        end
      ), 0)::numeric as valor
    from itens_filtrados
  ),
  resumo_reconciliacao as (
    select
      count(*) filter (where source_missing and not substituta_viva and not pagamento_detectado)::integer as source_missing,
      count(*) filter (where 'pagamento_detectado_fora_origem' = any(motivos))::integer as pagamento_detectado,
      count(*) filter (where identidade_invalida)::integer as identidade_invalida,
      count(*) filter (where not status_suportado)::integer as status_desconhecido,
      count(*) filter (where jsonb_array_length(validation_issues) > 0)::integer as validacoes_origem,
      count(*) filter (where forma_pagamento_nome is null)::integer as forma_pagamento_ausente,
      count(*) filter (where caixa_dup)::integer as duplicata_caixa,
      count(*) filter (
        where canonical_contact_status is not null
          and canonical_contact_status <> 'resolved'
      )::integer as contato_pendente,
      count(*)::integer as total
    from itens_reconciliacao
  )
  select jsonb_build_object(
    'schema_version', 1,
    'fonte', 'sync_run_items',
    'as_of_date', p_as_of_date,
    'periodo', jsonb_build_object(
      'modo', p_modo_periodo,
      'competencia_inicio', v_inicio,
      'competencia_fim', v_fim
    ),
    'status', case
      when rf.competencias_stale > 0 then 'stale'
      when rr.total > 0 then 'partial'
      else 'ok'
    end,
    'freshness', jsonb_build_object(
      'policy', 'sync_runs.stale_after',
      'competencias_necessarias', rf.competencias_necessarias,
      'competencias_frescas', rf.competencias_frescas,
      'competencias_stale', rf.competencias_stale,
      'sync_mais_antigo', rf.sync_mais_antigo,
      'valido_ate', rf.valido_ate,
      'competencias', rf.competencias
    ),
    'operational', jsonb_build_object(
      'collection_allowed', v_collection_allowed,
      'collection_scope', coalesce(v_canonical #>> '{operational,collection_scope}', 'blocked'),
      'cobranca_regra', 'd_plus_2_apenas_aluno_ativo'
    ),
    'totais', jsonb_build_object(
      'todas', jsonb_build_object('quantidade', t.todas_quantidade, 'valor', round(t.todas_valor, 2)),
      'pagas', jsonb_build_object('quantidade', t.pagas_quantidade, 'valor', round(t.pagas_valor, 2)),
      'em_aberto', jsonb_build_object('quantidade', t.em_aberto_quantidade, 'valor', round(t.em_aberto_valor, 2)),
      'em_atraso_d0', jsonb_build_object('quantidade', t.em_atraso_quantidade, 'valor', round(t.em_atraso_valor, 2)),
      'a_vencer', jsonb_build_object('quantidade', t.a_vencer_quantidade, 'valor', round(t.a_vencer_valor, 2)),
      'canceladas', jsonb_build_object('quantidade', t.canceladas_quantidade),
      'cobranca_d2', jsonb_build_object('quantidade', t.cobranca_d2_quantidade, 'valor', round(t.cobranca_d2_valor, 2)),
      'visao_atual', jsonb_build_object('status', p_status, 'quantidade', tf.quantidade, 'valor', round(tf.valor, 2))
    ),
    'items', case
      when p_status = 'reconciliacao' then '[]'::jsonb
      else coalesce((
        select jsonb_agg(jsonb_build_object(
          'canonical_fatura_id', i.canonical_fatura_id,
          'unidade_id', i.unidade_id,
          'unidade_codigo', i.unidade_codigo,
          'competencia', i.competencia,
          'emusys_fatura_id', i.emusys_fatura_id::text,
          'emusys_matricula_id', i.emusys_matricula_id::text,
          'emusys_contrato_id', i.emusys_contrato_id::text,
          'emusys_student_id', i.emusys_student_id::text,
          'descricao', i.descricao,
          'status', i.status_normalizado,
          'data_vencimento', i.data_vencimento,
          'data_pagamento', i.data_pagamento,
          'aluno', jsonb_build_object(
            'id', i.aluno_id,
            'nome', coalesce(i.aluno_nome, 'Aluno nao vinculado'),
            'curso_nome', i.curso_nome,
            'estado_operacional', i.estado_operacional,
            'vinculo_local_fonte', i.vinculo_local_fonte,
            'professor_id', i.professor_id,
            'professor_nome', i.professor_nome
          ),
          'forma_pagamento', jsonb_build_object(
            'rotulo', i.forma_pagamento_rotulo,
            'nome', i.forma_pagamento_nome,
            'fonte', i.forma_pagamento_fonte
          ),
          'valores', jsonb_build_object(
            'valor_com_desconto', i.valores_calculados -> 'valor_com_desconto',
            'valor_sem_desconto_condicional', i.valores_calculados -> 'valor_sem_desconto_condicional',
            'multa', i.valores_calculados -> 'multa',
            'mora', i.valores_calculados -> 'mora',
            'valor_hoje', i.valores_calculados -> 'valor_hoje',
            'valor_pago', i.valor_pago,
            'juros_e_multa_snapshot', i.juros_e_multa,
            'origem_juros', i.valores_calculados -> 'origem_juros',
            'juros_emusys', i.valores_calculados -> 'juros_emusys'
          ),
          'cobranca', jsonb_build_object(
            'd0', i.em_atraso_d0,
            'd2_elegivel', i.cobranca_d2,
            'motivo_nao_elegivel', case
              when i.cobranca_d2 then null
              when not v_collection_allowed then 'leitura_canonica_bloqueada'
              when i.source_missing then 'source_missing'
              when i.identidade_invalida then 'identidade_invalida'
              when i.status_normalizado <> 'aberta' then 'fatura_nao_aberta'
              when not i.em_atraso_d0 then 'nao_vencida'
              when coalesce(i.canonical_dias_atraso, 0) < 2 then 'carencia_d_plus_2'
              else 'fora_da_carteira_ativa'
            end
          ),
          'sync_completed_at', i.sync_completed_at,
          'sync_fresh_until', i.sync_fresh_until
        ) order by i.data_vencimento, i.unidade_codigo, i.emusys_fatura_id)
        from itens_filtrados i
      ), '[]'::jsonb)
    end,
    'reconciliation', jsonb_build_object(
      'source_missing', rr.source_missing,
      'pagamento_detectado', rr.pagamento_detectado,
      'identidade_invalida', rr.identidade_invalida,
      'status_desconhecido', rr.status_desconhecido,
      'validacoes_origem', rr.validacoes_origem,
      'forma_pagamento_ausente', rr.forma_pagamento_ausente,
      'contato_pendente', rr.contato_pendente,
      'duplicata_caixa', rr.duplicata_caixa,
      'total', rr.total,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'canonical_fatura_id', i.canonical_fatura_id,
          'unidade_id', i.unidade_id,
          'unidade_codigo', i.unidade_codigo,
          'competencia', i.competencia,
          'emusys_fatura_id', i.emusys_fatura_id::text,
          'emusys_matricula_id', i.emusys_matricula_id::text,
          'emusys_contrato_id', i.emusys_contrato_id::text,
          'emusys_student_id', i.emusys_student_id::text,
          'descricao', i.descricao,
          'status', i.status_normalizado,
          'data_vencimento', i.data_vencimento,
          'data_pagamento', i.data_pagamento,
          'aluno', jsonb_build_object(
            'id', i.aluno_id,
            'nome', coalesce(i.aluno_nome, 'Aluno nao vinculado'),
            'curso_nome', i.curso_nome,
            'estado_operacional', i.estado_operacional,
            'vinculo_local_fonte', i.vinculo_local_fonte,
            'professor_id', i.professor_id,
            'professor_nome', i.professor_nome
          ),
          'forma_pagamento', jsonb_build_object(
            'rotulo', i.forma_pagamento_rotulo,
            'nome', i.forma_pagamento_nome,
            'fonte', i.forma_pagamento_fonte
          ),
          'valores', jsonb_build_object(
            'valor_original', i.valor_original,
            'valor_com_desconto', i.valores_calculados -> 'valor_com_desconto',
            'valor_sem_desconto_condicional', i.valores_calculados -> 'valor_sem_desconto_condicional',
            'multa', i.valores_calculados -> 'multa',
            'mora', i.valores_calculados -> 'mora',
            'valor_hoje', i.valores_calculados -> 'valor_hoje',
            'valor_pago', i.valor_pago,
            'juros_e_multa_snapshot', i.juros_e_multa,
            'origem_juros', i.valores_calculados -> 'origem_juros',
            'juros_emusys', i.valores_calculados -> 'juros_emusys'
          ),
          'motivos', to_jsonb(i.motivos),
          'prova_pagamento', i.prova_pagamento,
          'validation_issues', i.validation_issues,
          'source_missing_reason', i.source_missing_reason,
          'sync_completed_at', i.sync_completed_at
        ) order by i.data_vencimento, i.unidade_codigo, i.emusys_fatura_id)
        from itens_reconciliacao i
      ), '[]'::jsonb)
    )
  ) into v_result
  from resumo_frescor rf
  cross join totais t
  cross join total_filtrado tf
  cross join resumo_reconciliacao rr;

  return v_result || jsonb_build_object('inadimplencia_canonica', v_canonical);
end;
$function$;


-- ---------------------------------------------------------------------------
-- 6) get_inadimplencia_canonica_v4_base: espelho + origem_juros no item
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_inadimplencia_canonica_v4_base(p_unidade_id uuid DEFAULT NULL::uuid, p_as_of_date date DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_base jsonb;
  v_items jsonb;
  v_total_faturas integer := 0;
  v_total_matriculas integer := 0;
  v_total_original numeric := 0;
  v_total_atualizado numeric := 0;
  v_maior_atraso integer := 0;
  v_inicio_competencia date := (
    date_trunc('month', p_as_of_date)::date - interval '2 months'
  )::date;
  v_fim_competencia date := date_trunc('month', p_as_of_date)::date;
  v_collection_allowed boolean := false;
begin
  -- A função-base preserva autorização, frescor, identidade exata, quarentena
  -- e a leitura parcial. Esta camada somente fecha a régua operacional D+2 e
  -- reforça que o aluno deve estar ativo agora.
  v_base := public.get_inadimplencia_canonica_v3_base(p_unidade_id, p_as_of_date);
  v_collection_allowed := coalesce(
    (v_base #>> '{operational,collection_allowed}')::boolean,
    false
  );

  with itens_brutos as (
    select item, ordinality
    from jsonb_array_elements(coalesce(v_base -> 'items', '[]'::jsonb))
      with ordinality as linhas(item, ordinality)
  ),
  itens_elegiveis as (
    select ib.item, ib.ordinality
    from itens_brutos ib
    left join lateral (
      select bool_or(
        coalesce(estado.entra_financeiro_ativo, false)
        and aluno.arquivado_em is null
      ) as aluno_financeiro_ativo
      from public.alunos aluno
      join public.vw_alunos_estado_operacional_v131 estado
        on estado.aluno_id = aluno.id
      where aluno.id = case
        when coalesce(ib.item ->> 'aluno_id_canonico', '') ~ '^[0-9]+$'
          then (ib.item ->> 'aluno_id_canonico')::integer
        else null
      end
        and aluno.unidade_id = (ib.item ->> 'unidade_id')::uuid
        and nullif(btrim(aluno.emusys_matricula_id), '')
          = nullif(btrim(ib.item ->> 'emusys_matricula_id'), '')
    ) estado_atual on true
    where coalesce(estado_atual.aluno_financeiro_ativo, false)
      and coalesce((ib.item ->> 'source_missing')::boolean, false) is false
      and coalesce(ib.item ->> 'status', '') = 'aberta'
      and coalesce((ib.item ->> 'dias_atraso')::integer, 0) >= 2
      and (ib.item ->> 'competencia')::date between v_inicio_competencia and v_fim_competencia
  ),
  recalculados as (
    select
      ie.ordinality,
      ie.item || jsonb_build_object(
        'valor_com_desconto', valores.calculo -> 'valor_com_desconto',
        'valor_sem_desconto_condicional', valores.calculo -> 'valor_sem_desconto_condicional',
        'multa', valores.calculo -> 'multa',
        'mora', valores.calculo -> 'mora',
        'valor_atualizado', valores.calculo -> 'valor_hoje',
        'origem_juros', valores.calculo -> 'origem_juros',
        'juros_emusys', valores.calculo -> 'juros_emusys'
      ) as item
    from itens_elegiveis ie
    left join lateral (
      select i.desconto_fixo
      from public.sync_run_items i
      where i.run_id = (ie.item ->> 'run_id')::uuid
        and i.unidade_id = (ie.item ->> 'unidade_id')::uuid
        and i.canonical_fatura_id::text = ie.item ->> 'canonical_fatura_id'
        and i.emusys_fatura_id::text = ie.item ->> 'emusys_fatura_id'
        and i.competencia = (ie.item ->> 'competencia')::date
      limit 1
    ) snapshot on true
    left join lateral (
      select ef.juros_e_multa, ef.synced_at
      from public.emusys_faturas ef
      where ef.unidade_id = (ie.item ->> 'unidade_id')::uuid
        and ef.emusys_fatura_id::text = ie.item ->> 'emusys_fatura_id'
      limit 1
    ) espelho on true
    cross join lateral (
      select public.calcular_valores_fatura_financeiro_v1(
        (ie.item ->> 'valor_original')::numeric,
        snapshot.desconto_fixo,
        coalesce(
          nullif(ie.item ->> 'desconto_condicional_perdido', '')::numeric,
          nullif(ie.item ->> 'desconto_condicional', '')::numeric,
          0
        ),
        (ie.item ->> 'data_vencimento')::date,
        coalesce(ie.item ->> 'status', 'aberta'),
        p_as_of_date,
        (ie.item ->> 'unidade_id')::uuid,
        espelho.juros_e_multa,
        espelho.synced_at
      ) as calculo
    ) valores
  )
  select
    coalesce(jsonb_agg(item order by ordinality), '[]'::jsonb),
    count(*)::integer,
    count(distinct nullif(item ->> 'emusys_matricula_id', ''))::integer,
    coalesce(round(sum((item ->> 'valor_original')::numeric), 2), 0),
    coalesce(round(sum((item ->> 'valor_atualizado')::numeric), 2), 0),
    coalesce(max((item ->> 'dias_atraso')::integer), 0)
  into
    v_items,
    v_total_faturas,
    v_total_matriculas,
    v_total_original,
    v_total_atualizado,
    v_maior_atraso
  from recalculados;

  v_base := jsonb_set(v_base, '{items}', v_items, true);
  v_base := jsonb_set(v_base, '{totals}', jsonb_build_object(
    'total_faturas', v_total_faturas,
    'total_matriculas', v_total_matriculas,
    'total_original', v_total_original,
    'total_atualizado', v_total_atualizado,
    'maior_atraso', v_maior_atraso
  ), true);
  v_base := jsonb_set(v_base, '{policy,student_scope}', to_jsonb(
    'exact_invoice_enrollment + aluno_ativo_atual; trancado, evadido e arquivado fora da carteira D+2'::text
  ), true);
  v_base := jsonb_set(v_base, '{policy,delinquency_rule}', '"d_plus_2"'::jsonb, true);
  v_base := jsonb_set(v_base, '{policy,competencias_inicio}', to_jsonb(v_inicio_competencia), true);
  v_base := jsonb_set(v_base, '{policy,competencia_fim}', to_jsonb(v_fim_competencia), true);
  v_base := jsonb_set(v_base, '{operational,consumer_must_apply_collection_grace}', 'false'::jsonb, true);
  v_base := jsonb_set(v_base, '{operational,collection_scope}', to_jsonb(case
    when v_collection_allowed then 'confirmed_active_d2_3_competencias'
    else 'blocked'
  end::text), true);

  return v_base;
end;
$function$;


-- ---------------------------------------------------------------------------
-- 7) Cron diário: refresh das vencidas às 09:30 UTC (06:30 em São Paulo),
--    depois do backlog (07:11 UTC) e antes do expediente.
-- ---------------------------------------------------------------------------

select cron.unschedule('faturas-vencidas-sync-diario') where exists (select 1 from cron.job where jobname = 'faturas-vencidas-sync-diario');

select cron.schedule(
  'faturas-vencidas-sync-diario',
  '30 9 * * *',
  $$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-faturas-emusys',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ),
    body := jsonb_build_object('mode', 'vencidas_abertas', 'trigger_source', 'cron_faturas_vencidas_diario'),
    timeout_milliseconds := 240000
  );
  $$
);
