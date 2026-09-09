-- Cutover dos cinco relatorios da Coordenacao para o documento V4.
-- O clique passa a fazer somente uma leitura indexada. A composicao continua
-- privada e e executada antecipadamente pelos jobs diarios.

begin;

create or replace function public.get_relatorio_coordenacao_documento_v4_por_id(
  p_documento_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_documento public.fechamento_mensal_snapshots%rowtype;
begin
  if p_documento_id is null then
    raise exception 'RELATORIO_COORDENACAO_V4_DOCUMENTO_ID_INVALIDO'
      using errcode = '22023';
  end if;

  select s.*
    into v_documento
  from public.fechamento_mensal_snapshots s
  where s.id = p_documento_id
    and s.dominio in ('relatorio_coordenacao', 'relatorio_coordenacao_ciclo')
    and s.status in ('preview', 'aprovado', 'fechado', 'retificado')
    and s.payload @> '{"schema_version": 4}'::jsonb
  limit 1;

  if v_documento.id is null then
    raise exception 'RELATORIO_COORDENACAO_V4_DOCUMENTO_INDISPONIVEL'
      using errcode = 'P0002';
  end if;

  perform public.fn_health_score_professor_v3_ator_leitura(v_documento.unidade_id);

  if v_documento.payload_hash is distinct from
       public.hash_jsonb_canonico(v_documento.payload - 'documento')
     or v_documento.payload #>> '{documento,id}' is distinct from v_documento.id::text
     or v_documento.payload #>> '{documento,hash}' is distinct from v_documento.payload_hash then
    raise exception 'RELATORIO_COORDENACAO_V4_HASH_INVALIDO'
      using errcode = '22000';
  end if;

  return v_documento.payload;
end;
$function$;

revoke all on function public.get_relatorio_coordenacao_documento_v4_por_id(uuid)
  from public, anon;
grant execute on function public.get_relatorio_coordenacao_documento_v4_por_id(uuid)
  to authenticated, service_role;

comment on function public.get_relatorio_coordenacao_documento_v4_por_id(uuid) is
  'Le o documento materializado exato, valida autorizacao e integridade e nao consulta fontes operacionais.';

-- Cada job processa somente um escopo e uma periodicidade. Uma falha de unidade
-- ou do mensal nao impede os demais documentos do dia.
create or replace function public.executar_relatorio_coordenacao_documento_v4_diario(
  p_escopo text,
  p_unidade_id uuid,
  p_periodicidade text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_hoje date := current_date;
  v_ano integer;
  v_mes integer;
  v_mes_atual integer := extract(month from current_date)::integer;
  v_resultado jsonb;
begin
  if p_escopo not in ('unidade', 'consolidado')
     or p_periodicidade not in ('mensal', 'ciclo')
     or (p_escopo = 'unidade' and p_unidade_id is null)
     or (p_escopo = 'consolidado' and p_unidade_id is not null) then
    raise exception 'RELATORIO_COORDENACAO_V4_JOB_PARAMETRO_INVALIDO'
      using errcode = '22023';
  end if;

  if p_escopo = 'unidade' and not exists (
    select 1 from public.unidades u
    where u.id = p_unidade_id and u.ativo = true
  ) then
    raise exception 'RELATORIO_COORDENACAO_V4_JOB_UNIDADE_INATIVA'
      using errcode = '22023';
  end if;

  if p_periodicidade = 'mensal' then
    v_ano := extract(year from v_hoje)::integer;
    v_mes := v_mes_atual;
  elsif v_mes_atual between 3 and 5 then
    v_ano := extract(year from v_hoje)::integer;
    v_mes := 3;
  elsif v_mes_atual between 6 and 8 then
    v_ano := extract(year from v_hoje)::integer;
    v_mes := 6;
  elsif v_mes_atual between 9 and 11 then
    v_ano := extract(year from v_hoje)::integer;
    v_mes := 9;
  elsif v_mes_atual = 12 then
    v_ano := extract(year from v_hoje)::integer;
    v_mes := 12;
  else
    v_ano := extract(year from v_hoje)::integer - 1;
    v_mes := 12;
  end if;

  v_resultado := public.materializar_relatorio_coordenacao_documento_v4(
    p_unidade_id,
    v_ano,
    v_mes,
    p_periodicidade,
    'preview',
    'Atualizacao diaria automatica da Coordenacao'
  );

  return v_resultado || jsonb_build_object(
    'ano', v_ano,
    'mes', v_mes,
    'periodicidade', p_periodicidade,
    'escopo', p_escopo,
    'unidade_id', p_unidade_id
  );
end;
$function$;

revoke all on function public.executar_relatorio_coordenacao_documento_v4_diario(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.executar_relatorio_coordenacao_documento_v4_diario(text, uuid, text)
  to service_role;

create or replace function public.configurar_relatorio_coordenacao_documento_v4_cron()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_job record;
  v_item record;
  v_jobname text;
  v_command text;
  v_agenda text;
  v_minutos integer;
  v_ordem integer := 0;
  v_inicio_minutos constant integer := 480; -- 08:00 UTC, depois das fotografias pedagogicas.
  v_intervalo_minutos constant integer := 5;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('relatorio-coordenacao-documento-v4-cron', 0)
  );

  for v_job in
    select j.jobid
    from cron.job j
    where j.jobname like 'relatorio-coordenacao-v4-%'
    order by j.jobid
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  for v_item in
    select u.id as unidade_id, p.periodicidade
    from public.unidades u
    cross join (values ('mensal'::text), ('ciclo'::text)) p(periodicidade)
    where u.ativo = true
    order by u.id, p.periodicidade desc
  loop
    v_jobname := 'relatorio-coordenacao-v4-unidade-'
      || v_item.unidade_id::text || '-' || v_item.periodicidade;
    v_command := format(
      'select public.executar_relatorio_coordenacao_documento_v4_diario(''unidade'', %L::uuid, %L);',
      v_item.unidade_id::text,
      v_item.periodicidade
    );
    v_minutos := v_inicio_minutos + (v_ordem * v_intervalo_minutos);
    v_agenda := format('%s %s * * *', mod(v_minutos, 60), v_minutos / 60);
    perform cron.schedule(v_jobname, v_agenda, v_command);
    v_ordem := v_ordem + 1;
  end loop;

  for v_item in
    select periodicidade
    from (values ('mensal'::text), ('ciclo'::text)) p(periodicidade)
    order by periodicidade desc
  loop
    v_jobname := 'relatorio-coordenacao-v4-consolidado-' || v_item.periodicidade;
    v_command := format(
      'select public.executar_relatorio_coordenacao_documento_v4_diario(''consolidado'', null::uuid, %L);',
      v_item.periodicidade
    );
    v_minutos := v_inicio_minutos + (v_ordem * v_intervalo_minutos);
    v_agenda := format('%s %s * * *', mod(v_minutos, 60), v_minutos / 60);
    perform cron.schedule(v_jobname, v_agenda, v_command);
    v_ordem := v_ordem + 1;
  end loop;
end;
$function$;

revoke all on function public.configurar_relatorio_coordenacao_documento_v4_cron()
  from public, anon, authenticated, service_role;

-- Esta migration apenas prepara leitores e jobs privados. O alias publico e o
-- cron sao ativados pela migration de release, na mesma transacao que produz e
-- valida todos os documentos iniciais. Assim um replay limpo sempre alcanca o
-- gate final e nunca publica uma carga pela metade.

commit;
