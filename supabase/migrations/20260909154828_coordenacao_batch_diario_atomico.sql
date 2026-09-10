-- Coordenacao: oito recortes diarios na MESMA fotografia transacional.
-- Esta migration prepara o batch, mas NAO ativa o job nem executa refresh/backfill.
-- O chamador deve abrir REPEATABLE READ ANTES do SELECT e limitar a instrucao
-- inteira a 110s. SET LOCAL statement_timeout dentro da funcao seria tarde demais.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create or replace function public.fn_relatorio_coordenacao_recortes_diarios_v4(
  p_referencia date
)
returns table (
  unidade_id uuid,
  escopo text,
  periodicidade text,
  competencia_hs date,
  ano integer,
  mes integer,
  dominio text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  -- HS diario exige competencia CORRENTE, inclusive para ciclo. O documento
  -- usa o seletor do INICIO do ciclo; em jan/fev esse ano e o anterior.
  with escopos as (
    select u.id as unidade_id, 'unidade'::text as escopo
    from public.unidades u where u.ativo = true
    union all
    select null::uuid, 'consolidado'::text
  )
  select e.unidade_id, e.escopo, p.periodicidade,
    date_trunc('month', p_referencia)::date,
    extract(year from c.periodo_inicio)::integer,
    extract(month from c.periodo_inicio)::integer,
    case when p.periodicidade = 'ciclo'
      then 'relatorio_coordenacao_ciclo' else 'relatorio_coordenacao' end
  from escopos e
  cross join (values ('mensal'::text), ('ciclo'::text)) p(periodicidade)
  cross join lateral public.fn_health_score_v3_periodo(p_referencia, p.periodicidade) c;
$function$;

revoke all on function public.fn_relatorio_coordenacao_recortes_diarios_v4(date)
  from public, anon, authenticated;
grant execute on function public.fn_relatorio_coordenacao_recortes_diarios_v4(date)
  to service_role;

create or replace function public.executar_relatorio_coordenacao_batch_diario_v4()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_recortes jsonb;
  v_item record;
  v_hs jsonb;
  v_forcado jsonb;
  v_documento jsonb;
  v_final boolean;
  v_resultados jsonb := '[]'::jsonb;
  v_atualizados integer := 0;
  v_preservados integer := 0;
begin
  -- Nunca transformar oito transacoes independentes em suposta atomicidade.
  -- SERIALIZABLE tambem nao e aceito implicitamente: contrato operacional RR.
  if current_setting('transaction_isolation') <> 'repeatable read' then
    raise exception 'RELATORIO_COORDENACAO_V4_BATCH_EXIGE_REPEATABLE_READ_NO_CHAMADOR'
      using errcode = '25001';
  end if;
  if current_setting('statement_timeout')::interval <= interval '0 seconds'
     or current_setting('statement_timeout')::interval > interval '110 seconds'
     or current_setting('lock_timeout')::interval <= interval '0 seconds'
     or current_setting('lock_timeout')::interval > interval '3 seconds' then
    raise exception 'RELATORIO_COORDENACAO_V4_BATCH_TIMEOUT_INVALIDO'
      using errcode = '22023',
        hint = 'Antes do SELECT: SET LOCAL statement_timeout=''110s''; SET LOCAL lock_timeout=''3s'';';
  end if;

  if not pg_try_advisory_xact_lock(hashtextextended(
    'relatorio-coordenacao-v4-batch-diario', 0
  )) then
    raise exception 'RELATORIO_COORDENACAO_V4_BATCH_LOCK_OCUPADO'
      using errcode = '55P03';
  end if;

  select jsonb_agg(to_jsonb(r) order by r.unidade_id nulls last, r.periodicidade desc)
  into v_recortes
  from public.fn_relatorio_coordenacao_recortes_diarios_v4(current_date) r;

  -- Limite intencional deste rollout: tres unidades ativas + rede, duas
  -- periodicidades. Mudanca do universo exige revisar tambem o budget do job.
  if jsonb_array_length(v_recortes) is distinct from 8 then
    raise exception 'RELATORIO_COORDENACAO_V4_BATCH_RECORTES_INVALIDOS'
      using errcode = '22023';
  end if;

  -- Adquirir TODOS os locks antes do primeiro refresh, sem esperar outra
  -- captura terminar dentro de uma fotografia RR que ja ficou antiga.
  -- As chaves coincidem com executor HS e materializador documental existentes;
  -- os locks transacionais sao reentrantes para as chamadas internas abaixo.
  for v_item in
    select * from jsonb_to_recordset(v_recortes) as r(
      unidade_id uuid, escopo text, periodicidade text, competencia_hs date,
      ano integer, mes integer, dominio text
    )
  loop
    if not pg_try_advisory_xact_lock(hashtextextended(format(
      'health-score-professor-v3-diario:%s:%s:%s',
      v_item.competencia_hs, v_item.escopo, coalesce(v_item.unidade_id::text, 'rede')
    ), 0)) then
      raise exception 'RELATORIO_COORDENACAO_V4_BATCH_LOCK_HS_OCUPADO'
        using errcode = '55P03';
    end if;
    if not pg_try_advisory_xact_lock(hashtextextended(concat_ws(
      ':', 'relatorio-coordenacao-v4', v_item.ano, v_item.mes,
      v_item.periodicidade, v_item.escopo,
      coalesce(v_item.unidade_id::text, 'consolidado')
    ), 0)) then
      raise exception 'RELATORIO_COORDENACAO_V4_BATCH_LOCK_DOCUMENTO_OCUPADO'
        using errcode = '55P03';
    end if;
  end loop;

  for v_item in
    select * from jsonb_to_recordset(v_recortes) as r(
      unidade_id uuid, escopo text, periodicidade text, competencia_hs date,
      ano integer, mes integer, dominio text
    )
  loop
    -- Mesmo predicado de finalidade do materializador v4. A consulta vem
    -- ANTES do HS: diario nao revisa snapshots de um documento ja final.
    select exists (
      select 1 from public.fechamento_mensal_snapshots s
      where s.ano = v_item.ano and s.mes = v_item.mes
        and s.escopo = v_item.escopo
        and s.unidade_id is not distinct from v_item.unidade_id
        and s.dominio = v_item.dominio
        and s.status in ('aprovado', 'fechado', 'retificado')
        and s.payload @> '{"schema_version": 4}'::jsonb
    ) into v_final;

    v_hs := null;
    if not v_final then
      -- Executor interno: nao chamar wrappers de cron, alertas, HTTP ou
      -- configuradores HS. Todos os writes internos participam desta transacao.
      v_hs := public.executar_health_score_professor_v3_escopo_diario(
        v_item.competencia_hs, v_item.periodicidade, v_item.escopo, v_item.unidade_id
      );
      if v_hs ->> 'status' = 'baseline_adotado'
         and v_hs -> 'professores_incompletos' = '[]'::jsonb
         and v_hs -> 'professores_configuracao_inconsistente' = '[]'::jsonb then
        -- Rejeitar baseline com rollback sem rematerializar repetiria a mesma
        -- baseline para sempre, caso o job HS anterior nao consiga avanca-la.
        -- A chamada direta interna RENOVA este unico escopo; nao tem cron,
        -- alertas ou HTTP. Forcar leitura propria evita depender de temp tables
        -- ou GUC herdado do chamador. A fonte continua na MESMA fotografia RR.
        perform set_config('app.health_score_v3_fonte_preparada', 'off', true);
        v_forcado := public.materializar_health_score_professor_v3_escopo_diario(
          v_item.competencia_hs, v_item.periodicidade, v_item.escopo, v_item.unidade_id
        );
        if (v_forcado ? 'status' and v_forcado ->> 'status' is distinct from 'materializado')
           or v_forcado -> 'professores_incompletos' is distinct from '[]'::jsonb
           or v_forcado -> 'professores_configuracao_inconsistente' is distinct from '[]'::jsonb
           or v_forcado ->> 'competencia' is distinct from v_item.competencia_hs::text
           or v_forcado ->> 'periodicidade' is distinct from v_item.periodicidade
           or v_forcado ->> 'escopo' is distinct from v_item.escopo
           or not (v_forcado ? 'unidade_id')
           or v_forcado ->> 'unidade_id' is distinct from v_item.unidade_id::text
           or jsonb_typeof(v_forcado -> 'snapshot_ids') is distinct from 'array'
           or jsonb_typeof(v_forcado -> 'snapshots_criados') is distinct from 'number'
           or coalesce(v_forcado ->> 'snapshots_criados', '') !~ '^[1-9][0-9]*$' then
          raise exception 'RELATORIO_COORDENACAO_V4_BATCH_REFRESH_FORCADO_NAO_CONFIAVEL'
            using errcode = '22023';
        end if;
        if jsonb_array_length(v_forcado -> 'snapshot_ids')::numeric
           <> (v_forcado ->> 'snapshots_criados')::numeric then
          raise exception 'RELATORIO_COORDENACAO_V4_BATCH_REFRESH_FORCADO_NAO_CONFIAVEL'
            using errcode = '22023';
        end if;
        -- Registro de baseline e snapshots novos so persistem JUNTOS se os
        -- oito documentos passarem. Nao reescrever logs nem snapshots antigos.
        v_hs := v_forcado || jsonb_build_object(
          'status', 'materializado', 'refresh_forcado_apos_baseline', true,
          'baseline_execution_id', v_hs -> 'execution_id'
        );
      end if;
      -- O executor pode capturar uma excecao e devolver status=erro em JSON.
      -- baseline_adotado registra fingerprint SEM renovar snapshots; nao prova
      -- paridade por si so. sem_alteracao exige diagnosticos completos e vazios.
      if coalesce(v_hs ->> 'status', '') not in ('materializado', 'sem_alteracao')
         or v_hs -> 'professores_incompletos' is distinct from '[]'::jsonb
         or v_hs -> 'professores_configuracao_inconsistente' is distinct from '[]'::jsonb then
        raise exception 'RELATORIO_COORDENACAO_V4_BATCH_HS_NAO_CONFIAVEL'
          using errcode = '22023', detail = format(
            'escopo=%s unidade=%s periodicidade=%s status=%s',
            v_item.escopo, coalesce(v_item.unidade_id::text, 'rede'),
            v_item.periodicidade, coalesce(v_hs ->> 'status', 'ausente')
          );
      end if;
    end if;

    -- Preserva a guarda de versao snapshot/fonte do produtor. Qualquer erro
    -- propaga: nao existe savepoint/EXCEPTION que publique os outros sete.
    v_documento := public.materializar_relatorio_coordenacao_documento_v4(
      v_item.unidade_id, v_item.ano, v_item.mes, v_item.periodicidade,
      'preview', 'Atualizacao diaria atomica da Coordenacao (oito recortes RR)'
    );
    if v_documento -> 'ok' is distinct from 'true'::jsonb
       or v_documento ->> 'id' is null
       or v_documento -> 'finalizado' is distinct from to_jsonb(v_final) then
      raise exception 'RELATORIO_COORDENACAO_V4_BATCH_DOCUMENTO_INVALIDO'
        using errcode = '22023';
    end if;

    if v_final then v_preservados := v_preservados + 1;
    else v_atualizados := v_atualizados + 1;
    end if;
    v_resultados := v_resultados || jsonb_build_array(
      to_jsonb(v_item) || jsonb_build_object('hs', v_hs, 'documento', v_documento)
    );
  end loop;

  return jsonb_build_object(
    'ok', true, 'referencia', current_date, 'isolamento', 'repeatable read',
    'atualizados', v_atualizados, 'preservados', v_preservados,
    'recortes', v_resultados
  );
end;
$function$;

revoke all on function public.executar_relatorio_coordenacao_batch_diario_v4()
  from public, anon, authenticated;
grant execute on function public.executar_relatorio_coordenacao_batch_diario_v4()
  to service_role;

create or replace function public.configurar_relatorio_coordenacao_documento_v4_cron()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_job record;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'relatorio-coordenacao-documento-v4-cron', 0
  ));

  -- Lista EXATA dos oito jobs substituidos, nao LIKE prefix%. Preserva jobs
  -- HS mensais/ciclo/alertas, capturador legado e qualquer outro documental.
  for v_job in
    select j.jobid from cron.job j
    where j.jobname = any (array[
      'relatorio-coordenacao-v4-unidade-2ec861f6-023f-4d7b-9927-3960ad8c2a92-mensal',
      'relatorio-coordenacao-v4-unidade-2ec861f6-023f-4d7b-9927-3960ad8c2a92-ciclo',
      'relatorio-coordenacao-v4-unidade-368d47f5-2d88-4475-bc14-ba084a9a348e-mensal',
      'relatorio-coordenacao-v4-unidade-368d47f5-2d88-4475-bc14-ba084a9a348e-ciclo',
      'relatorio-coordenacao-v4-unidade-95553e96-971b-4590-a6eb-0201d013c14d-mensal',
      'relatorio-coordenacao-v4-unidade-95553e96-971b-4590-a6eb-0201d013c14d-ciclo',
      'relatorio-coordenacao-v4-consolidado-mensal',
      'relatorio-coordenacao-v4-consolidado-ciclo'
    ])
    order by j.jobid
  loop
    -- Desativar conserva jobid, configuracao e vinculo com o historico.
    perform cron.alter_job(v_job.jobid, active := false);
  end loop;

  -- Named schedule faz upsert do proprio job. O configurador antigo agora
  -- converge para este unico batch e nao pode ressuscitar os oito separados.
  perform cron.schedule(
    'relatorio-coordenacao-v4-batch-diario', '0 8 * * *',
    $command$begin isolation level repeatable read;
set local statement_timeout = '110s';
set local lock_timeout = '3s';
set local idle_in_transaction_session_timeout = '115s';
select public.executar_relatorio_coordenacao_batch_diario_v4();
commit;$command$
  );
end;
$function$;

revoke all on function public.configurar_relatorio_coordenacao_documento_v4_cron()
  from public, anon, authenticated, service_role;

-- Ativacao separada: executar o configurador somente depois de validar o batch
-- real em REPEATABLE READ dentro do budget de 110s. Ate la, os oito jobs atuais
-- permanecem inalterados. Nao executar refresh/backfill durante esta migration.

commit;
