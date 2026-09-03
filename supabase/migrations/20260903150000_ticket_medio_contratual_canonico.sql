-- Ticket médio contratual canônico.
--
-- Contrato validado para Recreio, agosto/2026:
--   R$ 144.749,17 / 325 pagantes fechados = R$ 445,38.
--
-- A receita da competência é a parcela contratada (valor original menos
-- desconto aplicado), para paga e aberta. Encargos cobrados depois do
-- vencimento pertencem ao realizado/cobrança, não ao ticket mensal.
-- O denominador histórico vem do snapshot fechado de alunos, e não da
-- quantidade incidental de pessoas com fatura no sincronismo.

do $migration$
declare
  v_unidade_id constant uuid := '95553e96-971b-4590-a6eb-0201d013c14d'::uuid;
  v_financeiro jsonb;
  v_totais jsonb;
  v_ticket numeric;
  v_faturamento numeric;
  v_realizado numeric;

  v_exec public.fechamento_mensal_snapshots%rowtype;
  v_gerencial public.fechamento_mensal_snapshots%rowtype;
  v_admin public.fechamento_mensal_snapshots%rowtype;

  v_exec_id uuid;
  v_exec_hash text;
  v_gerencial_id uuid;
  v_gerencial_hash text;
  v_admin_id uuid;
  v_payload jsonb;
  v_gestao jsonb;
  v_kpis_alunos jsonb;
  v_resumo jsonb;
  v_fontes jsonb;

  v_dados_mensais_antes jsonb;
  v_dados_mensais_depois jsonb;
  v_compatibilidade jsonb;
begin
  execute $helper$
create or replace function public.aplicar_financeiro_ticket_contratual_v1(
  p_base jsonb,
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
  v_competencia date;
  v_run_id uuid;
  v_por_unidade jsonb := '[]'::jsonb;
  v_totais jsonb := '{}'::jsonb;
  v_faturamento_total numeric := 0;
  v_pagantes_total numeric := 0;
begin
  if coalesce((v_result->>'tem_dados')::boolean, false) is not true then
    return v_result;
  end if;

  if p_ano is null or p_ano < 2000 or p_ano > 2100
     or p_mes is null or p_mes < 1 or p_mes > 12 then
    raise exception using
      errcode = '22023',
      message = 'ano/mes invalidos para ticket medio contratual';
  end if;

  v_competencia := make_date(p_ano, p_mes, 1);
  v_run_id := nullif(v_result #>> '{freshness,sync_run_id}', '')::uuid;

  if v_run_id is null then
    raise exception 'FINANCEIRO_TICKET_CONTRATUAL_RUN_AUSENTE';
  end if;

  with unidades as (
    select
      (value->>'unidade_id')::uuid as unidade_id,
      value as payload_unidade
    from jsonb_array_elements(coalesce(v_result->'por_unidade', '[]'::jsonb))
    where nullif(value->>'unidade_id', '') is not null
  ), pagantes_fechados as (
    select distinct on (s.unidade_id)
      s.unidade_id,
      nullif(s.payload->>'alunos_pagantes', '')::numeric as alunos_pagantes
    from public.fechamento_mensal_snapshots s
    join unidades u on u.unidade_id = s.unidade_id
    where s.ano = p_ano
      and s.mes = p_mes
      and s.escopo = 'unidade'
      and s.dominio = 'alunos_admin'
      and s.status = 'fechado'
    order by
      s.unidade_id,
      s.versao desc,
      s.fechado_em desc nulls last,
      s.created_at desc
  ), faturas as (
    select
      u.unidade_id,
      coalesce(sum(
        case
          when i.status in ('paga', 'aberta')
           and lower(btrim(i.descricao)) like 'parcela %'
            then coalesce(i.valor_original, 0) - coalesce(i.desconto_aplicado, 0)
          else 0
        end
      ), 0)::numeric(12,2) as faturamento_contratual
    from unidades u
    left join public.sync_run_items i
      on i.unidade_id = u.unidade_id
     and i.run_id = v_run_id
     and i.competencia = v_competencia
     and i.source_missing is false
    group by u.unidade_id
  ), calculada as (
    select
      u.unidade_id,
      u.payload_unidade,
      f.faturamento_contratual,
      coalesce(
        pf.alunos_pagantes,
        nullif((u.payload_unidade->>'alunos_pagantes_canonicos')::numeric, 0),
        nullif((u.payload_unidade->>'alunos_locais_com_parcela')::numeric, 0),
        nullif((u.payload_unidade->>'alunos_emusys_com_parcela')::numeric, 0)
      ) as alunos_pagantes,
      case
        when pf.alunos_pagantes is not null
          then 'fechamento_mensal_snapshots.alunos_admin'
        else 'cobertura_de_faturas_fallback'
      end as fonte_denominador
    from unidades u
    join faturas f on f.unidade_id = u.unidade_id
    left join pagantes_fechados pf on pf.unidade_id = u.unidade_id
  )
  select
    coalesce(
      jsonb_agg(
        payload_unidade
          || jsonb_build_object(
            'faturamento_previsto', faturamento_contratual,
            'ticket_medio_realizado',
              coalesce((payload_unidade->>'ticket_medio')::numeric, 0),
            'ticket_medio',
              case
                when coalesce(alunos_pagantes, 0) > 0
                  then round(faturamento_contratual / alunos_pagantes, 2)
                else 0::numeric
              end,
            'ticket_medio_previsto',
              case
                when coalesce(alunos_pagantes, 0) > 0
                  then round(faturamento_contratual / alunos_pagantes, 2)
                else 0::numeric
              end,
            'alunos_pagantes_canonicos', coalesce(alunos_pagantes, 0),
            'fonte_denominador_ticket', fonte_denominador,
            'regra_ticket_medio',
              'parcela contratual (valor_original - desconto_aplicado) / pagantes canonicos'
          )
        order by payload_unidade->>'unidade_nome'
      ),
      '[]'::jsonb
    ),
    coalesce(sum(faturamento_contratual), 0),
    coalesce(sum(alunos_pagantes), 0)
  into v_por_unidade, v_faturamento_total, v_pagantes_total
  from calculada;

  v_totais := coalesce(v_result->'totais', '{}'::jsonb)
    || jsonb_build_object(
      'faturamento_previsto', round(v_faturamento_total, 2),
      'ticket_medio_realizado',
        coalesce((v_result #>> '{totais,ticket_medio}')::numeric, 0),
      'ticket_medio',
        case
          when v_pagantes_total > 0
            then round(v_faturamento_total / v_pagantes_total, 2)
          else 0::numeric
        end,
      'ticket_medio_previsto',
        case
          when v_pagantes_total > 0
            then round(v_faturamento_total / v_pagantes_total, 2)
          else 0::numeric
        end,
      'alunos_pagantes_canonicos', v_pagantes_total,
      'fonte_denominador_ticket',
        'fechamento_mensal_snapshots.alunos_admin quando a competencia esta fechada',
      'regra_ticket_medio',
        'parcela contratual (valor_original - desconto_aplicado) / pagantes canonicos'
    );

  v_result := jsonb_set(v_result, '{por_unidade}', v_por_unidade, true);
  v_result := jsonb_set(v_result, '{totais}', v_totais, true);
  v_result := jsonb_set(
    v_result,
    '{regra_ticket_medio}',
    to_jsonb(
      'Ticket da competencia usa parcela contratual e base fechada de pagantes; realizado permanece em mrr_atual.'::text
    ),
    true
  );

  return v_result;
end;
$function$;
$helper$;

  execute 'revoke all on function public.aplicar_financeiro_ticket_contratual_v1(jsonb, integer, integer) from public, anon, authenticated';
  execute 'grant execute on function public.aplicar_financeiro_ticket_contratual_v1(jsonb, integer, integer) to service_role';

  if to_regprocedure(
    'public.get_financeiro_faturas_emusys_base_ticket_contratual_v1(uuid,integer,integer)'
  ) is null then
    if to_regprocedure('public.get_financeiro_faturas_emusys(uuid,integer,integer)') is null then
      raise exception 'ANCORA_AUSENTE: get_financeiro_faturas_emusys(uuid,integer,integer)';
    end if;

    execute 'alter function public.get_financeiro_faturas_emusys(uuid, integer, integer) rename to get_financeiro_faturas_emusys_base_ticket_contratual_v1';
  end if;

  execute $wrapper$
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

  return public.aplicar_financeiro_ticket_contratual_v1(
    v_base,
    p_ano,
    p_mes
  );
end;
$function$;
$wrapper$;

  execute 'revoke all on function public.get_financeiro_faturas_emusys_base_ticket_contratual_v1(uuid, integer, integer) from public, anon, authenticated';
  execute 'grant execute on function public.get_financeiro_faturas_emusys_base_ticket_contratual_v1(uuid, integer, integer) to service_role';

  execute 'revoke all on function public.get_financeiro_faturas_emusys(uuid, integer, integer) from public, anon';
  execute 'grant execute on function public.get_financeiro_faturas_emusys(uuid, integer, integer) to authenticated, service_role';

  execute $comment$
comment on function public.get_financeiro_faturas_emusys(uuid, integer, integer) is
  'Faturas por ultimo snapshot live completo. Ticket medio usa receita contratual (sem encargos pos-vencimento) e pagantes do fechamento de alunos quando a competencia esta fechada.'
$comment$;

  -- A migration roda fora de uma requisicao PostgREST; a identidade temporaria
  -- abaixo permite que a mesma guarda de acesso da RPC seja exercitada.
  perform set_config('request.jwt.claim.role', 'service_role', true);

  v_financeiro := public.get_financeiro_faturas_emusys(v_unidade_id, 2026, 8);
  if coalesce((v_financeiro->>'tem_dados')::boolean, false) is not true then
    raise exception 'TICKET_MEDIO_CONTRATUAL_FONTE_INDISPONIVEL: %',
      coalesce(v_financeiro->>'status', 'sem_status');
  end if;

  v_totais := v_financeiro->'totais';
  v_ticket := nullif(v_totais->>'ticket_medio', '')::numeric;
  v_faturamento := nullif(v_totais->>'faturamento_previsto', '')::numeric;
  v_realizado := nullif(v_totais->>'mrr_atual', '')::numeric;

  if v_ticket is null or v_faturamento is null or v_realizado is null
     or v_ticket <= 0 or v_faturamento <= 0 then
    raise exception 'TICKET_MEDIO_CONTRATUAL_TOTAIS_INVALIDOS';
  end if;

  -- 1) Atualiza a fonte histórica do KPI executivo por nova versão, sem
  -- modificar o snapshot fechado que registrou a divergência.
  select *
  into v_exec
  from public.fechamento_mensal_snapshots s
  where s.ano = 2026
    and s.mes = 8
    and s.escopo = 'unidade'
    and s.unidade_id = v_unidade_id
    and s.dominio = 'alunos_executivo'
    and s.status = 'fechado'
  order by s.versao desc, s.created_at desc
  limit 1;

  if v_exec.id is null then
    raise exception 'TICKET_MEDIO_CONTRATUAL_SNAPSHOT_EXECUTIVO_AUSENTE';
  end if;

  if coalesce((v_exec.payload->>'ticket_medio')::numeric, -1) = v_ticket
     and coalesce((v_exec.payload->>'faturamento_previsto')::numeric, -1) = v_faturamento then
    v_exec_id := v_exec.id;
    v_exec_hash := v_exec.payload_hash;
  else
    v_payload := v_exec.payload || jsonb_build_object(
      'ticket_medio', v_ticket,
      'faturamento_previsto', v_faturamento,
      'faturamento_estimado', v_faturamento,
      'financeiro_ticket_contratual', jsonb_build_object(
        'ticket_medio', v_ticket,
        'faturamento_previsto', v_faturamento,
        'alunos_pagantes_canonicos', v_totais->'alunos_pagantes_canonicos',
        'fonte', 'get_financeiro_faturas_emusys'
      )
    );

    insert into public.fechamento_mensal_snapshots (
      ano, mes, escopo, unidade_id, dominio, versao, status,
      fonte, payload, payload_hash, financeiro_realizado_disponivel,
      observacao, capturado_em, capturado_por,
      aprovado_em, aprovado_por, fechado_em, fechado_por
    )
    values (
      2026, 8, 'unidade', v_unidade_id, 'alunos_executivo', v_exec.versao + 1, 'fechado',
      'retificacao_ticket_medio_contratual_v1',
      v_payload, public.hash_jsonb_canonico(v_payload), v_exec.financeiro_realizado_disponivel,
      format('Ticket medio contratual corrigido; snapshot anterior: %s', v_exec.id),
      v_exec.capturado_em, auth.uid(), now(), auth.uid(), now(), auth.uid()
    )
    returning id, payload_hash into v_exec_id, v_exec_hash;

    insert into public.fechamento_mensal_auditoria (
      snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
    )
    values (
      v_exec_id, 2026, 8, 'unidade', v_unidade_id,
      'snapshot_gravado',
      jsonb_build_object(
        'dominio', 'alunos_executivo',
        'snapshot_anterior_id', v_exec.id,
        'ticket_medio_anterior', v_exec.payload->'ticket_medio',
        'ticket_medio_novo', v_ticket,
        'faturamento_previsto_novo', v_faturamento
      ),
      auth.uid()
    );
  end if;

  -- 2) A versão gerencial passa a carregar o bloco de faturas, o ticket e os
  -- totais aninhados com a mesma regra.
  select *
  into v_gerencial
  from public.fechamento_mensal_snapshots s
  where s.ano = 2026
    and s.mes = 8
    and s.escopo = 'unidade'
    and s.unidade_id = v_unidade_id
    and s.dominio = 'relatorio_gerencial'
    and s.status = 'fechado'
  order by s.versao desc, s.created_at desc
  limit 1;

  if v_gerencial.id is null then
    raise exception 'TICKET_MEDIO_CONTRATUAL_SNAPSHOT_GERENCIAL_AUSENTE';
  end if;

  if coalesce((v_gerencial.payload #>> '{kpis_gestao,0,ticket_medio}')::numeric, -1) = v_ticket
     and coalesce((v_gerencial.payload #>> '{kpis_gestao,0,faturamento_previsto}')::numeric, -1) = v_faturamento
     and coalesce((v_gerencial.payload #>> '{kpis_gestao,0,financeiro_faturas_emusys,ticket_medio}')::numeric, -1) = v_ticket then
    v_gerencial_id := v_gerencial.id;
    v_gerencial_hash := v_gerencial.payload_hash;
  else
    if jsonb_typeof(v_gerencial.payload->'kpis_gestao') <> 'array'
       or v_gerencial.payload->'kpis_gestao'->0 is null then
      raise exception 'TICKET_MEDIO_CONTRATUAL_KPIS_GESTAO_INVALIDO';
    end if;

    v_gestao := v_gerencial.payload->'kpis_gestao'->0
      || jsonb_build_object(
        'ticket_medio', v_ticket,
        'faturamento_previsto', v_faturamento,
        'faturamento_realizado', v_realizado,
        'financeiro_faturas_emusys', v_totais
      );
    v_kpis_alunos := coalesce(
      v_gerencial.payload #> '{kpis_alunos_canonicos,totais}',
      '{}'::jsonb
    ) || jsonb_build_object(
      'ticket_medio', v_ticket,
      'faturamento_previsto', v_faturamento,
      'faturamento_realizado', v_realizado
    );

    v_payload := jsonb_set(
      v_gerencial.payload,
      '{kpis_gestao,0}',
      v_gestao,
      true
    );
    v_payload := jsonb_set(
      v_payload,
      '{kpis_alunos_canonicos,totais}',
      v_kpis_alunos,
      true
    );
    v_payload := jsonb_set(
      v_payload,
      '{financeiro_faturas_emusys}',
      jsonb_build_object('totais', v_totais),
      true
    );
    v_payload := jsonb_set(
      v_payload,
      '{financeiro_ticket_contratual}',
      jsonb_build_object(
        'ticket_medio', v_ticket,
        'faturamento_previsto', v_faturamento,
        'alunos_pagantes_canonicos', v_totais->'alunos_pagantes_canonicos',
        'fonte', 'get_financeiro_faturas_emusys'
      ),
      true
    );

    insert into public.fechamento_mensal_snapshots (
      ano, mes, escopo, unidade_id, dominio, versao, status,
      fonte, payload, payload_hash, financeiro_realizado_disponivel,
      observacao, capturado_em, capturado_por,
      aprovado_em, aprovado_por, fechado_em, fechado_por
    )
    values (
      2026, 8, 'unidade', v_unidade_id, 'relatorio_gerencial', v_gerencial.versao + 1, 'fechado',
      'retificacao_ticket_medio_contratual_v1',
      v_payload, public.hash_jsonb_canonico(v_payload), true,
      format('Ticket medio contratual corrigido; snapshot anterior: %s', v_gerencial.id),
      v_gerencial.capturado_em, auth.uid(), now(), auth.uid(), now(), auth.uid()
    )
    returning id, payload_hash into v_gerencial_id, v_gerencial_hash;

    insert into public.fechamento_mensal_auditoria (
      snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
    )
    values (
      v_gerencial_id, 2026, 8, 'unidade', v_unidade_id,
      'snapshot_gravado',
      jsonb_build_object(
        'dominio', 'relatorio_gerencial',
        'snapshot_anterior_id', v_gerencial.id,
        'ticket_medio_anterior', v_gerencial.payload #> '{kpis_gestao,0,ticket_medio}',
        'ticket_medio_novo', v_ticket,
        'faturamento_previsto_novo', v_faturamento
      ),
      auth.uid()
    );
  end if;

  -- 3) O snapshot administrativo é reemitido apontando para a versão gerencial
  -- corrigida. Assim o gerador WhatsApp e a tela rica leem a mesma fonte.
  select *
  into v_admin
  from public.fechamento_mensal_snapshots s
  where s.ano = 2026
    and s.mes = 8
    and s.escopo = 'unidade'
    and s.unidade_id = v_unidade_id
    and s.dominio = 'relatorio_admin_mensal'
    and s.status = 'fechado'
  order by s.versao desc, s.created_at desc
  limit 1;

  if v_admin.id is null then
    raise exception 'TICKET_MEDIO_CONTRATUAL_SNAPSHOT_ADMIN_AUSENTE';
  end if;

  if coalesce((v_admin.payload #>> '{resumo,ticket_medio}')::numeric, -1) = v_ticket
     and v_admin.payload #>> '{fontes,relatorio_gerencial,snapshot_id}' = v_gerencial_id::text
     and v_admin.payload #>> '{fontes,relatorio_gerencial,payload_hash}' = v_gerencial_hash then
    v_admin_id := v_admin.id;
  else
    v_resumo := coalesce(v_admin.payload->'resumo', '{}'::jsonb)
      || jsonb_build_object(
        'ticket_medio', v_ticket,
        'faturamento_previsto', v_faturamento,
        'faturamento_realizado', v_realizado
      );
    v_fontes := coalesce(v_admin.payload->'fontes', '{}'::jsonb);
    v_fontes := jsonb_set(
      v_fontes,
      '{relatorio_gerencial}',
      jsonb_build_object(
        'snapshot_id', v_gerencial_id,
        'payload_hash', v_gerencial_hash
      ),
      true
    );
    v_fontes := jsonb_set(
      v_fontes,
      '{financeiro_ticket_contratual}',
      jsonb_build_object(
        'ticket_medio', v_ticket,
        'faturamento_previsto', v_faturamento,
        'fonte', 'get_financeiro_faturas_emusys'
      ),
      true
    );

    v_payload := jsonb_set(v_admin.payload, '{resumo}', v_resumo, true);
    v_payload := jsonb_set(v_payload, '{fontes}', v_fontes, true);

    insert into public.fechamento_mensal_snapshots (
      ano, mes, escopo, unidade_id, dominio, versao, status,
      fonte, payload, payload_hash, financeiro_realizado_disponivel,
      observacao, capturado_em, capturado_por,
      aprovado_em, aprovado_por, fechado_em, fechado_por
    )
    values (
      2026, 8, 'unidade', v_unidade_id, 'relatorio_admin_mensal', v_admin.versao + 1, 'fechado',
      'retificacao_ticket_medio_contratual_v1',
      v_payload, public.hash_jsonb_canonico(v_payload), true,
      format('Ticket medio contratual corrigido; snapshot anterior: %s', v_admin.id),
      v_admin.capturado_em, auth.uid(), now(), auth.uid(), now(), auth.uid()
    )
    returning id into v_admin_id;

    insert into public.fechamento_mensal_auditoria (
      snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
    )
    values (
      v_admin_id, 2026, 8, 'unidade', v_unidade_id,
      'snapshot_gravado',
      jsonb_build_object(
        'dominio', 'relatorio_admin_mensal',
        'snapshot_anterior_id', v_admin.id,
        'snapshot_gerencial_corrigido_id', v_gerencial_id,
        'ticket_medio_anterior', v_admin.payload #> '{resumo,ticket_medio}',
        'ticket_medio_novo', v_ticket
      ),
      auth.uid()
    );
  end if;

  -- dados_mensais ainda alimenta telas históricas. É um espelho compatível;
  -- atualizá-lo pelo procedimento oficial preserva os snapshots como fonte.
  select to_jsonb(dm)
  into v_dados_mensais_antes
  from public.dados_mensais dm
  where dm.unidade_id = v_unidade_id
    and dm.ano = 2026
    and dm.mes = 8;

  v_compatibilidade := public.atualizar_dados_mensais_por_snapshot(2026, 8, v_unidade_id, false);

  select to_jsonb(dm)
  into v_dados_mensais_depois
  from public.dados_mensais dm
  where dm.unidade_id = v_unidade_id
    and dm.ano = 2026
    and dm.mes = 8;

  if v_dados_mensais_antes is distinct from v_dados_mensais_depois
     and not exists (
       select 1
       from public.dados_mensais_retificacoes r
       where r.unidade_id = v_unidade_id
         and r.ano = 2026
         and r.mes = 8
         and r.origem = 'ticket_medio_contratual_canonico_v1'
         and r.status = 'aplicada'
     ) then
    insert into public.dados_mensais_retificacoes (
      unidade_id, ano, mes, motivo, solicitado_por, aprovado_por, origem,
      snapshot_antes, snapshot_depois, diff, observacoes,
      status, aplicada_em, aplicada_por
    )
    values (
      v_unidade_id,
      2026,
      8,
      'Ticket medio historico usava base financeira divergente do fechamento de pagantes.',
      'migration:ticket_medio_contratual_canonico_v1',
      'migration:ticket_medio_contratual_canonico_v1',
      'ticket_medio_contratual_canonico_v1',
      v_dados_mensais_antes,
      v_dados_mensais_depois,
      jsonb_build_object(
        'ticket_medio_antes', v_dados_mensais_antes->'ticket_medio',
        'ticket_medio_depois', v_dados_mensais_depois->'ticket_medio',
        'faturamento_estimado_antes', v_dados_mensais_antes->'faturamento_estimado',
        'faturamento_estimado_depois', v_dados_mensais_depois->'faturamento_estimado',
        'compatibilidade', v_compatibilidade
      ),
      'Correção proveniente do snapshot financeiro contratual e do fechamento de 325 pagantes.',
      'aplicada',
      now(),
      coalesce(auth.uid()::text, 'migration:ticket_medio_contratual_canonico_v1')
    );
  end if;

end;
$migration$;
