-- Versao aplicada em producao: 20260905195222.
-- Separa definitivamente, na RPC canonica e nos snapshots de agosto/2026:
--   * alunos_pagantes: indicador administrativo;
--   * ticket_denominador_pagantes: universo financeiro do ticket.
--
-- A wrapper operacional v1.3.1 substituia alunos_pagantes pelo indicador
-- administrativo depois de o calculo financeiro ja ter produzido MRR/ticket.
-- Isso deixava a mesma linha com numerador financeiro e denominador implicito
-- diferente. A correcao e aditiva: preserva alunos_pagantes e publica o novo
-- campo financeiro. Snapshots sao versionados; nenhuma versao fechada e
-- atualizada ou apagada.

begin;

create or replace function public.aplicar_denominador_ticket_kpis_v1(
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
  v_result jsonb := coalesce(p_base, '{}'::jsonb);
  v_financeiro_vivo jsonb := '{}'::jsonb;
  v_snapshots jsonb := '{}'::jsonb;
  v_por_unidade jsonb := '[]'::jsonb;
  v_obj jsonb;
  v_fin jsonb;
  v_snapshot jsonb;
  v_unidade_id uuid;
  v_admin_pagantes integer;
  v_ticket_denominador integer;
  v_mrr numeric;
  v_ticket numeric;
  v_faturamento_realizado numeric;
  v_total_admin integer := 0;
  v_total_denominador integer := 0;
  v_total_mrr numeric := 0;
  v_total_realizado numeric := 0;
  v_qtd_linhas integer := 0;
  v_qtd_denominador integer := 0;
begin
  if jsonb_typeof(v_result->'por_unidade') <> 'array' then
    return v_result;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_result->'por_unidade') item
    where item->>'fonte' = 'vivo'
  ) then
    select coalesce(
      jsonb_object_agg(fin.unidade_id::text, to_jsonb(fin)),
      '{}'::jsonb
    )
    into v_financeiro_vivo
    from public.get_kpis_alunos_financeiro_vivo_canonico(
      p_unidade_id,
      p_ano,
      p_mes
    ) fin;
  end if;

  with unidades_resultado as (
    select distinct (item->>'unidade_id')::uuid as unidade_id
    from jsonb_array_elements(v_result->'por_unidade') item
    where nullif(item->>'unidade_id', '') is not null
  ), ultimos as (
    select distinct on (s.unidade_id)
      s.unidade_id,
      s.payload
    from public.fechamento_mensal_snapshots s
    join unidades_resultado ur on ur.unidade_id = s.unidade_id
    where s.ano = p_ano
      and s.mes = p_mes
      and s.escopo = 'unidade'
      and s.dominio = 'alunos_executivo'
      and s.status in ('fechado', 'retificado')
    order by
      s.unidade_id,
      s.versao desc,
      s.fechado_em desc nulls last,
      s.created_at desc
  )
  select coalesce(jsonb_object_agg(unidade_id::text, payload), '{}'::jsonb)
  into v_snapshots
  from ultimos;

  for v_obj in
    select value
    from jsonb_array_elements(v_result->'por_unidade')
  loop
    v_qtd_linhas := v_qtd_linhas + 1;
    v_unidade_id := nullif(v_obj->>'unidade_id', '')::uuid;
    v_admin_pagantes := coalesce((v_obj->>'alunos_pagantes')::integer, 0);
    v_ticket_denominador := null;
    v_mrr := nullif(v_obj->>'mrr', '')::numeric;
    v_ticket := nullif(v_obj->>'ticket_medio', '')::numeric;
    v_faturamento_realizado := nullif(v_obj->>'faturamento_realizado', '')::numeric;

    if v_obj->>'fonte' = 'vivo' then
      v_fin := v_financeiro_vivo->v_unidade_id::text;
      v_ticket_denominador := nullif(v_fin->>'alunos_pagantes', '')::integer;
      v_mrr := coalesce(nullif(v_fin->>'mrr', '')::numeric, v_mrr);
      v_faturamento_realizado := coalesce(
        nullif(v_fin->>'faturamento_realizado', '')::numeric,
        v_faturamento_realizado
      );
      if coalesce(v_ticket_denominador, 0) > 0 and coalesce(v_mrr, 0) >= 0 then
        v_ticket := round(v_mrr / v_ticket_denominador, 2);
      end if;
    else
      v_snapshot := v_snapshots->v_unidade_id::text;
      v_ticket_denominador := coalesce(
        nullif(v_snapshot->>'ticket_denominador_pagantes', '')::integer,
        nullif(v_snapshot#>>'{financeiro_ticket_contratual,ticket_denominador_pagantes}', '')::integer,
        nullif(v_snapshot#>>'{financeiro_ticket_contratual,alunos_pagantes_canonicos}', '')::integer
      );

      if coalesce(v_ticket_denominador, 0) > 0 then
        v_mrr := coalesce(
          nullif(v_snapshot#>>'{financeiro_ticket_contratual,mrr_contratual}', '')::numeric,
          nullif(v_snapshot->>'mrr', '')::numeric,
          v_mrr
        );
        v_ticket := coalesce(
          nullif(v_snapshot->>'ticket_medio', '')::numeric,
          case when coalesce(v_mrr, 0) > 0
            then round(v_mrr / v_ticket_denominador, 2)
            else null
          end,
          v_ticket
        );
        v_faturamento_realizado := coalesce(
          nullif(v_snapshot#>>'{financeiro_ticket_contratual,faturamento_realizado}', '')::numeric,
          nullif(v_snapshot->>'faturamento_realizado', '')::numeric,
          v_faturamento_realizado
        );
      end if;
    end if;

    v_obj := v_obj || jsonb_build_object(
      'alunos_pagantes_administrativos', v_admin_pagantes
    );

    if coalesce(v_ticket_denominador, 0) > 0 then
      v_qtd_denominador := v_qtd_denominador + 1;
      v_total_denominador := v_total_denominador + v_ticket_denominador;
      v_obj := v_obj || jsonb_build_object(
        'ticket_denominador_pagantes', v_ticket_denominador,
        'mrr', round(coalesce(v_mrr, 0), 2),
        'arr', round(coalesce(v_mrr, 0) * 12, 2),
        'ticket_medio', round(coalesce(v_ticket, 0), 2),
        'ticket_medio_previsto', round(coalesce(v_ticket, 0), 2),
        'faturamento_previsto', round(coalesce(v_mrr, 0), 2)
      );
      if v_faturamento_realizado is not null then
        v_obj := jsonb_set(
          v_obj,
          '{faturamento_realizado}',
          to_jsonb(round(v_faturamento_realizado, 2)),
          true
        );
      end if;
    end if;

    v_total_admin := v_total_admin + v_admin_pagantes;
    v_total_mrr := v_total_mrr + coalesce((v_obj->>'mrr')::numeric, 0);
    v_total_realizado := v_total_realizado
      + coalesce((v_obj->>'faturamento_realizado')::numeric, 0);
    v_por_unidade := v_por_unidade || jsonb_build_array(v_obj);
  end loop;

  v_result := jsonb_set(v_result, '{por_unidade}', v_por_unidade, true);
  v_result := jsonb_set(
    v_result,
    '{totais}',
    coalesce(v_result->'totais', '{}'::jsonb) || jsonb_build_object(
      'alunos_pagantes', v_total_admin,
      'total_alunos_pagantes', v_total_admin,
      'alunos_pagantes_administrativos', v_total_admin
    ),
    true
  );

  if v_qtd_linhas > 0 and v_qtd_denominador = v_qtd_linhas then
    v_result := jsonb_set(
      v_result,
      '{totais}',
      (v_result->'totais') || jsonb_build_object(
        'ticket_denominador_pagantes', v_total_denominador,
        'mrr', round(v_total_mrr, 2),
        'arr', round(v_total_mrr * 12, 2),
        'ticket_medio', case when v_total_denominador > 0
          then round(v_total_mrr / v_total_denominador, 2)
          else 0::numeric
        end,
        'ticket_medio_previsto', case when v_total_denominador > 0
          then round(v_total_mrr / v_total_denominador, 2)
          else 0::numeric
        end,
        'faturamento_previsto', round(v_total_mrr, 2),
        'faturamento_realizado', round(v_total_realizado, 2)
      ),
      true
    );
  end if;

  return v_result;
end;
$function$;

revoke all on function public.aplicar_denominador_ticket_kpis_v1(jsonb, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.aplicar_denominador_ticket_kpis_v1(jsonb, uuid, integer, integer)
  to service_role;

do $rename$
begin
  if to_regprocedure(
    'public.get_kpis_alunos_canonicos_base_ticket_denominador_v1(uuid,integer,integer)'
  ) is null then
    if to_regprocedure('public.get_kpis_alunos_canonicos(uuid,integer,integer)') is null then
      raise exception 'TICKET_DENOMINADOR_RPC_BASE_AUSENTE';
    end if;

    alter function public.get_kpis_alunos_canonicos(uuid, integer, integer)
      rename to get_kpis_alunos_canonicos_base_ticket_denominador_v1;
  end if;
end;
$rename$;

alter function public.get_kpis_alunos_canonicos_base_ticket_denominador_v1(uuid, integer, integer)
  set search_path = public, pg_temp;
revoke all on function public.get_kpis_alunos_canonicos_base_ticket_denominador_v1(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_kpis_alunos_canonicos_base_ticket_denominador_v1(uuid, integer, integer)
  to service_role;

create or replace function public.get_kpis_alunos_canonicos(
  p_unidade_id uuid default null::uuid,
  p_ano integer default (
    extract(year from (now() at time zone 'America/Sao_Paulo'))
  )::integer,
  p_mes integer default (
    extract(month from (now() at time zone 'America/Sao_Paulo'))
  )::integer
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
  v_base := public.get_kpis_alunos_canonicos_base_ticket_denominador_v1(
    p_unidade_id,
    p_ano,
    p_mes
  );

  return public.aplicar_denominador_ticket_kpis_v1(
    v_base,
    p_unidade_id,
    p_ano,
    p_mes
  );
end;
$function$;

comment on function public.get_kpis_alunos_canonicos(uuid, integer, integer) is
  'Fonte canonica de alunos: alunos_pagantes permanece administrativo; ticket_denominador_pagantes publica separadamente o universo financeiro do ticket.';

revoke all on function public.get_kpis_alunos_canonicos(uuid, integer, integer)
  from public, anon;
grant execute on function public.get_kpis_alunos_canonicos(uuid, integer, integer)
  to authenticated, service_role;

-- Backfill append-only das fotografias financeiras de agosto nas tres unidades.
-- O leitor v3 ja foi validado contra os valores aceitos pela operacao.
do $backfill$
declare
  v_financeiro jsonb;
  v_item jsonb;
  v_unidade_id uuid;
  v_snapshot public.fechamento_mensal_snapshots%rowtype;
  v_payload jsonb;
  v_financeiro_ticket jsonb;
  v_snapshot_id uuid;
  v_denominador integer;
  v_mrr numeric;
  v_ticket numeric;
  v_realizado numeric;
  v_qtd integer;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  v_financeiro := public.get_financeiro_faturas_emusys(null, 2026, 8);

  if coalesce((v_financeiro->>'tem_dados')::boolean, false) is not true
     or jsonb_array_length(coalesce(v_financeiro->'por_unidade', '[]'::jsonb)) <> 3 then
    raise exception 'TICKET_DENOMINADOR_BACKFILL_FONTE_INVALIDA';
  end if;

  for v_item in
    select value from jsonb_array_elements(v_financeiro->'por_unidade')
  loop
    v_unidade_id := (v_item->>'unidade_id')::uuid;
    v_denominador := nullif(v_item->>'ticket_denominador_pagantes', '')::integer;
    v_mrr := nullif(v_item->>'faturamento_previsto', '')::numeric;
    v_ticket := nullif(v_item->>'ticket_medio', '')::numeric;
    v_realizado := nullif(v_item->>'mrr_atual', '')::numeric;

    if coalesce(v_denominador, 0) <= 0
       or coalesce(v_mrr, 0) <= 0
       or round(v_mrr / v_denominador, 2) <> round(v_ticket, 2) then
      raise exception 'TICKET_DENOMINADOR_BACKFILL_VALORES_INVALIDOS: %', v_item;
    end if;

    select * into v_snapshot
    from public.fechamento_mensal_snapshots s
    where s.ano = 2026
      and s.mes = 8
      and s.escopo = 'unidade'
      and s.unidade_id = v_unidade_id
      and s.dominio = 'alunos_executivo'
      and s.status in ('fechado', 'retificado')
    order by s.versao desc, s.fechado_em desc nulls last, s.created_at desc
    limit 1;

    if v_snapshot.id is null
       or public.hash_jsonb_canonico(v_snapshot.payload) <> v_snapshot.payload_hash then
      raise exception 'TICKET_DENOMINADOR_BACKFILL_SNAPSHOT_INVALIDO: %', v_unidade_id;
    end if;

    if coalesce((v_snapshot.payload->>'ticket_denominador_pagantes')::integer, -1) = v_denominador
       and round(coalesce((v_snapshot.payload->>'mrr')::numeric, -1), 2) = round(v_mrr, 2)
       and round(coalesce((v_snapshot.payload->>'ticket_medio')::numeric, -1), 2) = round(v_ticket, 2) then
      continue;
    end if;

    v_financeiro_ticket := coalesce(
      v_snapshot.payload->'financeiro_ticket_contratual',
      '{}'::jsonb
    ) || jsonb_build_object(
      'mrr_contratual', round(v_mrr, 2),
      'faturamento_previsto', round(v_mrr, 2),
      'faturamento_realizado', round(v_realizado, 2),
      'ticket_medio', round(v_ticket, 2),
      'ticket_denominador_pagantes', v_denominador,
      'alunos_pagantes_canonicos', v_denominador,
      'alunos_pagantes_administrativos',
        coalesce((v_snapshot.payload->>'alunos_pagantes')::integer, 0),
      'fonte', 'get_financeiro_faturas_emusys_v3'
    );

    v_payload := v_snapshot.payload || jsonb_build_object(
      'mrr', round(v_mrr, 2),
      'arr', round(v_mrr * 12, 2),
      'faturamento_previsto', round(v_mrr, 2),
      'faturamento_estimado', round(v_mrr, 2),
      'faturamento_realizado', round(v_realizado, 2),
      'ticket_medio', round(v_ticket, 2),
      'ticket_medio_previsto', round(v_ticket, 2),
      'ticket_denominador_pagantes', v_denominador,
      'financeiro_ticket_contratual', v_financeiro_ticket,
      'retificacao_ticket_agosto_2026_global', jsonb_build_object(
        'motivo', 'separacao global entre pagantes administrativos e denominador financeiro',
        'alunos_pagantes_administrativos',
          coalesce((v_snapshot.payload->>'alunos_pagantes')::integer, 0),
        'ticket_denominador_pagantes', v_denominador
      )
    );

    insert into public.fechamento_mensal_snapshots (
      ano, mes, escopo, unidade_id, dominio, versao, status,
      fonte, payload, payload_hash, financeiro_realizado_disponivel,
      observacao, capturado_em, capturado_por,
      aprovado_em, aprovado_por, fechado_em, fechado_por
    ) values (
      2026, 8, 'unidade', v_unidade_id, 'alunos_executivo',
      v_snapshot.versao + 1, 'fechado',
      'retificacao_ticket_agosto_2026_global_v1',
      v_payload, public.hash_jsonb_canonico(v_payload),
      v_snapshot.financeiro_realizado_disponivel,
      format('retificacao financeira append-only; snapshot anterior: %s', v_snapshot.id),
      v_snapshot.capturado_em, v_snapshot.capturado_por,
      now(), auth.uid(), now(), auth.uid()
    ) returning id into v_snapshot_id;

    insert into public.fechamento_mensal_auditoria (
      snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
    ) values (
      v_snapshot_id, 2026, 8, 'unidade', v_unidade_id, 'snapshot_gravado',
      jsonb_build_object(
        'dominio', 'alunos_executivo',
        'snapshot_anterior_id', v_snapshot.id,
        'payload_anterior_hash', v_snapshot.payload_hash,
        'alunos_pagantes_administrativos', v_snapshot.payload->'alunos_pagantes',
        'ticket_denominador_pagantes', v_denominador,
        'mrr_contratual', round(v_mrr, 2),
        'ticket_medio', round(v_ticket, 2)
      ),
      auth.uid()
    );

    update public.dados_mensais
       set ticket_denominador_pagantes = v_denominador,
           ticket_medio_contratual = round(v_ticket, 2),
           mrr_contratual = round(v_mrr, 2),
           updated_at = now()
     where unidade_id = v_unidade_id
       and ano = 2026
       and mes = 8;
    get diagnostics v_qtd = row_count;
    if v_qtd <> 1 then
      raise exception 'TICKET_DENOMINADOR_BACKFILL_DADOS_MENSAIS: %/%', v_unidade_id, v_qtd;
    end if;
  end loop;

  select count(*) into v_qtd
  from (
    values
      ('368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid, 256, 446.30::numeric),
      ('2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid, 382, 398.87::numeric),
      ('95553e96-971b-4590-a6eb-0201d013c14d'::uuid, 325, 445.38::numeric)
  ) esperado(unidade_id, denominador, ticket)
  join lateral (
    select s.payload
    from public.fechamento_mensal_snapshots s
    where s.ano = 2026 and s.mes = 8
      and s.escopo = 'unidade'
      and s.dominio = 'alunos_executivo'
      and s.status in ('fechado', 'retificado')
      and s.unidade_id = esperado.unidade_id
    order by s.versao desc, s.fechado_em desc nulls last, s.created_at desc
    limit 1
  ) atual on true
  where (atual.payload->>'ticket_denominador_pagantes')::integer = esperado.denominador
    and round((atual.payload->>'ticket_medio')::numeric, 2) = esperado.ticket;

  if v_qtd <> 3 then
    raise exception 'TICKET_DENOMINADOR_BACKFILL_PROVA_UNIDADES_FALHOU: %/3', v_qtd;
  end if;
end;
$backfill$;

-- Prova o contrato novo no leitor publico: pagantes administrativos ficam
-- intactos e o denominador do ticket aparece em campo proprio.
do $validate$
declare
  v_result jsonb;
  v_row jsonb;
  v_fin record;
begin
  v_result := public.get_kpis_alunos_canonicos(
    '95553e96-971b-4590-a6eb-0201d013c14d'::uuid,
    2026,
    8
  );
  v_row := v_result#>'{por_unidade,0}';
  if coalesce((v_row->>'alunos_pagantes')::integer, -1) <> 334
     or coalesce((v_row->>'alunos_pagantes_administrativos')::integer, -1) <> 334
     or coalesce((v_row->>'ticket_denominador_pagantes')::integer, -1) <> 325
     or round(coalesce((v_row->>'ticket_medio')::numeric, -1), 2) <> 445.38
     or round(coalesce((v_row->>'mrr')::numeric, -1), 2) <> 144749.17 then
    raise exception 'TICKET_DENOMINADOR_RPC_AGOSTO_FALHOU: %', v_row;
  end if;

  select * into v_fin
  from public.get_kpis_alunos_financeiro_vivo_canonico(
    '95553e96-971b-4590-a6eb-0201d013c14d'::uuid,
    extract(year from now())::integer,
    extract(month from now())::integer
  )
  limit 1;

  v_result := public.get_kpis_alunos_canonicos(
    '95553e96-971b-4590-a6eb-0201d013c14d'::uuid,
    extract(year from now())::integer,
    extract(month from now())::integer
  );
  v_row := v_result#>'{por_unidade,0}';
  if v_row->>'fonte' = 'vivo'
     and (
       coalesce((v_row->>'ticket_denominador_pagantes')::integer, -1)
         <> coalesce(v_fin.alunos_pagantes, -1)
       or round(coalesce((v_row->>'ticket_medio')::numeric, -1), 2)
         <> round(coalesce(v_fin.mrr, 0) / nullif(v_fin.alunos_pagantes, 0), 2)
     ) then
    raise exception 'TICKET_DENOMINADOR_RPC_VIVO_FALHOU: %', v_row;
  end if;
end;
$validate$;

commit;
