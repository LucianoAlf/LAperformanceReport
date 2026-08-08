begin;

-- A tabela de execucoes e o contrato de idempotencia do cron. Snapshots V3
-- continuam append-only; o fingerprint impede criar outra revisao fisica
-- quando o retrato logico do mes aberto nao se alterou.
create table if not exists public.health_score_professor_v3_materializacao_execucoes (
  id uuid primary key default gen_random_uuid(),
  competencia date not null,
  periodicidade text not null check (periodicidade = 'mensal'),
  escopo text not null check (escopo in ('unidade', 'consolidado')),
  unidade_id uuid null references public.unidades(id),
  fingerprint_fonte text not null,
  status text not null check (status in ('iniciada', 'baseline_adotado', 'materializado', 'sem_alteracao', 'erro')),
  snapshot_ids jsonb not null default '[]'::jsonb,
  snapshots_criados integer not null default 0 check (snapshots_criados >= 0),
  erro text null,
  iniciado_em timestamptz not null default now(),
  finalizado_em timestamptz null,
  executado_por text not null default session_user,
  constraint health_score_professor_v3_materializacao_execucoes_escopo_chk check (
    (escopo = 'unidade' and unidade_id is not null)
    or (escopo = 'consolidado' and unidade_id is null)
  )
);

create index if not exists idx_hs_v3_materializacao_execucoes_consulta
  on public.health_score_professor_v3_materializacao_execucoes (
    competencia, periodicidade, escopo, unidade_id, finalizado_em desc
  );

create or replace function public.fingerprint_health_score_professor_v3_escopo(
  p_competencia date,
  p_periodicidade text,
  p_escopo text,
  p_unidade_id uuid
)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select md5(coalesce((
    select jsonb_agg(to_jsonb(f) order by f.professor_id, f.metrica)::text
    from public.get_health_score_professor_v3_performance(
      date_trunc('month', p_competencia)::date,
      p_unidade_id,
      p_periodicidade
    ) f
    where f.escopo = p_escopo
      and f.unidade_id is not distinct from p_unidade_id
  ), '[]'));
$function$;

revoke all on function public.fingerprint_health_score_professor_v3_escopo(date, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.fingerprint_health_score_professor_v3_escopo(date, text, text, uuid)
  to service_role;

create or replace function public.materializar_health_score_professor_v3_escopo_diario(
  p_competencia date,
  p_periodicidade text,
  p_escopo text,
  p_unidade_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_escopo text := lower(trim(coalesce(p_escopo, '')));
  v_unidade_id uuid;
  v_linha record;
  v_config record;
  v_snapshot_id uuid;
  v_snapshot_ids jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_classificacao text;
  v_estado_snapshot text;
  v_estado_publicacao text;
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user <> 'postgres' then
    raise exception 'HEALTH_SCORE_V3_ACESSO_NEGADO: materializacao diaria interna'
      using errcode = '42501';
  end if;

  if p_periodicidade <> 'mensal' or v_escopo not in ('unidade', 'consolidado') then
    raise exception 'HEALTH_SCORE_V3_PARAMETRO_INVALIDO: use mensal e escopo explicito'
      using errcode = '22023';
  end if;

  if (v_escopo = 'unidade' and p_unidade_id is null)
    or (v_escopo = 'consolidado' and p_unidade_id is not null) then
    raise exception 'HEALTH_SCORE_V3_ESCOPO_INCOMPATIVEL'
      using errcode = '22023';
  end if;

  if v_competencia <> date_trunc('month', current_date)::date then
    raise exception 'HEALTH_SCORE_V3_COMPETENCIA_NAO_ABERTA'
      using errcode = '22023';
  end if;

  v_unidade_id := case when v_escopo = 'unidade' then p_unidade_id else null::uuid end;

  drop table if exists pg_temp.health_score_v3_diario_fonte;
  drop table if exists pg_temp.health_score_v3_diario_snapshots;

  create temporary table health_score_v3_diario_fonte on commit drop as
  select p.*
  from public.get_health_score_professor_v3_performance(
    v_competencia, v_unidade_id, p_periodicidade
  ) p
  where p.escopo = v_escopo
    and p.unidade_id is not distinct from v_unidade_id;

  if not exists (select 1 from health_score_v3_diario_fonte) then
    raise exception 'HEALTH_SCORE_V3_SEM_FONTE: escopo sem professores'
      using errcode = 'P0002';
  end if;

  -- Defesa contra qualquer regressao no produtor: um escopo explicito nunca
  -- pode persistir linhas de outra unidade nem misturar a rede ao consolidado.
  if exists (
    select 1 from health_score_v3_diario_fonte f
    where f.escopo is distinct from v_escopo
      or f.unidade_id is distinct from v_unidade_id
  ) then
    raise exception 'HEALTH_SCORE_V3_ESCOPO_DIVERGENTE'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1 from health_score_v3_diario_fonte
    group by professor_id having count(distinct metrica) <> 6
  ) then
    raise exception 'HEALTH_SCORE_V3_PILARES_INCOMPLETOS'
      using errcode = 'P0001';
  end if;

  create temporary table health_score_v3_diario_snapshots (
    professor_id integer primary key,
    snapshot_id uuid not null
  ) on commit drop;

  for v_linha in
    select distinct on (f.professor_id) f.*
    from health_score_v3_diario_fonte f
    order by f.professor_id, f.metrica
  loop
    select c.faixa_saudavel_min, c.faixa_atencao_min
      into v_config
    from public.health_score_professor_v3_config_versoes c
    where c.id = v_linha.config_id;

    if not found then
      raise exception 'HEALTH_SCORE_V3_CONFIG_AUSENTE' using errcode = 'P0001';
    end if;

    v_classificacao := coalesce(
      v_linha.classificacao,
      case
        when v_linha.score is null then 'sem_base'
        when v_linha.score >= v_config.faixa_saudavel_min then 'saudavel'
        when v_linha.score >= v_config.faixa_atencao_min then 'atencao'
        else 'critico'
      end
    );
    v_estado_snapshot := case when exists (
      select 1 from health_score_v3_diario_fonte f
      where f.professor_id = v_linha.professor_id and f.estado_base = 'em_maturacao'
    ) then 'em_maturacao' else 'provisorio' end;
    v_estado_publicacao := case when v_linha.score is null then 'sem_base' else 'parcial' end;

    insert into public.health_score_professor_v3_snapshots (
      professor_id, escopo, unidade_id, competencia, trimestre_inicio, revisao,
      estado, config_id, config_versao, score, cobertura, classificacao,
      publicavel, publicado, motivo_bloqueio, regra_versao, criado_por,
      periodicidade, periodo_inicio, periodo_fim, ciclo_codigo,
      estado_publicacao, score_exibivel, ranking_habilitado
    ) values (
      v_linha.professor_id, v_escopo, v_unidade_id, v_linha.competencia, v_linha.trimestre_inicio,
      coalesce((
        select max(s.revisao) + 1
        from public.health_score_professor_v3_snapshots s
        where s.professor_id = v_linha.professor_id
          and s.escopo = v_escopo and s.unidade_id is not distinct from v_unidade_id
          and s.competencia = v_competencia and s.periodicidade = p_periodicidade
      ), 1),
      v_estado_snapshot, v_linha.config_id, v_linha.config_versao,
      v_linha.score, v_linha.cobertura, v_classificacao,
      false, false, v_linha.motivo_bloqueio, v_linha.regra_versao_snapshot, null,
      v_linha.periodicidade, v_linha.periodo_inicio, v_linha.periodo_fim,
      v_linha.ciclo_codigo, v_estado_publicacao, v_linha.score is not null, false
    ) returning id into v_snapshot_id;

    insert into health_score_v3_diario_snapshots (professor_id, snapshot_id)
      values (v_linha.professor_id, v_snapshot_id);
    v_snapshot_ids := v_snapshot_ids || jsonb_build_array(v_snapshot_id);
    v_count := v_count + 1;
  end loop;

  insert into public.health_score_professor_v3_snapshot_metricas (
    snapshot_id, metrica, valor_bruto, numerador, denominador, amostra,
    estado_base, publicavel, confianca, fonte, regra_versao, motivo_sem_base,
    detalhes, nota, peso, peso_disponivel, contribuicao, meta_aplicada,
    peso_efetivo, codigo_evidencia, papel
  )
  select
    ids.snapshot_id, f.metrica, f.valor_bruto, f.numerador, f.denominador, f.amostra,
    f.estado_base, f.metrica_publicavel, f.confianca, f.fonte, f.regra_versao_metrica,
    f.motivo_sem_base, coalesce(f.detalhes, '{}'::jsonb), f.nota, f.peso,
    f.peso_disponivel, f.contribuicao, f.meta, f.peso_efetivo,
    f.codigo_evidencia, f.papel
  from health_score_v3_diario_fonte f
  join health_score_v3_diario_snapshots ids on ids.professor_id = f.professor_id;

  return jsonb_build_object(
    'competencia', v_competencia, 'periodicidade', p_periodicidade,
    'escopo', v_escopo, 'unidade_id', v_unidade_id,
    'snapshots_criados', v_count, 'snapshot_ids', v_snapshot_ids,
    'origem', 'get_health_score_professor_v3_performance', 'formula_alterada', false
  );
end;
$function$;

revoke all on function public.materializar_health_score_professor_v3_escopo_diario(date, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.materializar_health_score_professor_v3_escopo_diario(date, text, text, uuid)
  to service_role;

create or replace function public.executar_health_score_professor_v3_escopo_diario(
  p_competencia date,
  p_periodicidade text,
  p_escopo text,
  p_unidade_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_competencia date := date_trunc('month', current_date)::date;
  v_fingerprint_atual text;
  v_fingerprint_anterior text;
  v_execucao_id uuid;
  v_resultado jsonb;
begin
  if date_trunc('month', p_competencia)::date <> v_competencia or p_periodicidade <> 'mensal' then
    raise exception 'HEALTH_SCORE_V3_COMPETENCIA_NAO_ABERTA' using errcode = '22023';
  end if;
  if (p_escopo = 'unidade' and p_unidade_id is null)
    or (p_escopo = 'consolidado' and p_unidade_id is not null) then
    raise exception 'HEALTH_SCORE_V3_ESCOPO_INCOMPATIVEL' using errcode = '22023';
  end if;

  perform set_config('statement_timeout', '600s', true);
  perform pg_advisory_xact_lock(hashtextextended(
    format('health-score-professor-v3-diario:%s:%s:%s', v_competencia, p_escopo, coalesce(p_unidade_id::text, 'rede')), 0
  ));

  begin
    v_fingerprint_atual := public.fingerprint_health_score_professor_v3_escopo(
      v_competencia, p_periodicidade, p_escopo, p_unidade_id
    );
  exception when others then
    insert into public.health_score_professor_v3_materializacao_execucoes (
      competencia, periodicidade, escopo, unidade_id, fingerprint_fonte, status, erro, finalizado_em
    ) values (
      v_competencia, p_periodicidade, p_escopo, p_unidade_id,
      'erro:' || md5(sqlerrm), 'erro', sqlerrm, now()
    ) returning id into v_execucao_id;
    return jsonb_build_object('execution_id', v_execucao_id, 'status', 'erro', 'erro', sqlerrm);
  end;

  select e.fingerprint_fonte into v_fingerprint_anterior
  from public.health_score_professor_v3_materializacao_execucoes e
  where e.competencia = v_competencia and e.periodicidade = p_periodicidade
    and e.escopo = p_escopo and e.unidade_id is not distinct from p_unidade_id
    and e.status in ('baseline_adotado', 'materializado')
  order by e.finalizado_em desc nulls last, e.iniciado_em desc
  limit 1;

  if v_fingerprint_atual is not distinct from v_fingerprint_anterior then
    insert into public.health_score_professor_v3_materializacao_execucoes (
      competencia, periodicidade, escopo, unidade_id, fingerprint_fonte, status, finalizado_em
    ) values (
      v_competencia, p_periodicidade, p_escopo, p_unidade_id, v_fingerprint_atual, 'sem_alteracao', now()
    ) returning id into v_execucao_id;
    return jsonb_build_object('execution_id', v_execucao_id, 'status', 'sem_alteracao');
  end if;

  if v_fingerprint_anterior is null and exists (
    select 1 from public.health_score_professor_v3_snapshots s
    where s.competencia = v_competencia and s.periodicidade = p_periodicidade
      and s.escopo = p_escopo and s.unidade_id is not distinct from p_unidade_id
  ) then
    insert into public.health_score_professor_v3_materializacao_execucoes (
      competencia, periodicidade, escopo, unidade_id, fingerprint_fonte, status, finalizado_em
    ) values (
      v_competencia, p_periodicidade, p_escopo, p_unidade_id, v_fingerprint_atual, 'baseline_adotado', now()
    ) returning id into v_execucao_id;
    return jsonb_build_object('execution_id', v_execucao_id, 'status', 'baseline_adotado');
  end if;

  insert into public.health_score_professor_v3_materializacao_execucoes (
    competencia, periodicidade, escopo, unidade_id, fingerprint_fonte, status
  ) values (
    v_competencia, p_periodicidade, p_escopo, p_unidade_id, v_fingerprint_atual, 'iniciada'
  ) returning id into v_execucao_id;

  begin
    v_resultado := public.materializar_health_score_professor_v3_escopo_diario(
      v_competencia, p_periodicidade, p_escopo, p_unidade_id
    );
    update public.health_score_professor_v3_materializacao_execucoes
      set status = 'materializado', snapshot_ids = coalesce(v_resultado->'snapshot_ids', '[]'::jsonb),
          snapshots_criados = coalesce((v_resultado->>'snapshots_criados')::integer, 0), finalizado_em = now()
      where id = v_execucao_id;
    return v_resultado || jsonb_build_object('execution_id', v_execucao_id, 'status', 'materializado');
  exception when others then
    update public.health_score_professor_v3_materializacao_execucoes
      set status = 'erro', erro = sqlerrm, finalizado_em = now()
      where id = v_execucao_id;
    return jsonb_build_object('execution_id', v_execucao_id, 'status', 'erro', 'erro', sqlerrm);
  end;
end;
$function$;

create or replace function public.executar_health_score_professor_v3_cron_diario()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_competencia date := date_trunc('month', current_date)::date;
  v_unidade record;
  v_resultado jsonb;
  v_resultados jsonb := '[]'::jsonb;
  v_secret text;
begin
  perform set_config('statement_timeout', '600s', true);

  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'lia_alertas_service_role_key' limit 1;

  for v_unidade in
    select id from public.unidades where ativo order by id
  loop
    v_resultado := public.executar_health_score_professor_v3_escopo_diario(
      v_competencia, 'mensal', 'unidade', v_unidade.id
    );
    v_resultados := v_resultados || jsonb_build_array(v_resultado);
    if v_resultado->>'status' = 'erro'
      and nullif(btrim(v_secret), '') is not null then
      perform net.http_post(
        url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/projeto-alertas-whatsapp',
        headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
        body := jsonb_build_object('action', 'health_score_professor_v3_falha', 'execution_id', v_resultado->>'execution_id'),
        timeout_milliseconds := 55000
      );
    end if;
  end loop;

  v_resultado := public.executar_health_score_professor_v3_escopo_diario(
    v_competencia, 'mensal', 'consolidado', null::uuid
  );
  v_resultados := v_resultados || jsonb_build_array(v_resultado);
  if v_resultado->>'status' = 'erro'
    and nullif(btrim(v_secret), '') is not null then
    perform net.http_post(
      url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/projeto-alertas-whatsapp',
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
      body := jsonb_build_object('action', 'health_score_professor_v3_falha', 'execution_id', v_resultado->>'execution_id'),
      timeout_milliseconds := 55000
    );
  end if;

  return jsonb_build_object('competencia', v_competencia, 'resultados', v_resultados);
end;
$function$;

revoke all on function public.executar_health_score_professor_v3_escopo_diario(date, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.executar_health_score_professor_v3_cron_diario()
  from public, anon, authenticated;
grant execute on function public.executar_health_score_professor_v3_cron_diario() to service_role;

-- O alerta so e ativado quando os dois destinatarios operacionais exatos existem.
-- Nenhuma busca por nome parcial e usada: contatos homonimos/teste nao podem receber alerta.
insert into public.notificacao_config (tipo, ativo, antecedencia_dias, dias_inatividade)
values ('health_score_professor_v3_falha', false, 0, 0)
on conflict (tipo) do nothing;

insert into public.notificacao_destinatarios (config_id, pessoa_tipo, pessoa_id, canal)
select c.id, 'usuario', u.id, 'whatsapp'
from public.notificacao_config c
join public.usuarios u on (
  lower(coalesce(u.email, '')) = 'lucianoalf.la@gmail.com'
  or (
    lower(coalesce(u.nome, '')) = 'hugo'
    and nullif(btrim(coalesce(u.telefone, '')), '') is not null
  )
)
where c.tipo = 'health_score_professor_v3_falha'
on conflict (config_id, pessoa_tipo, pessoa_id) do nothing;

update public.notificacao_config c
set ativo = true
where c.tipo = 'health_score_professor_v3_falha'
  and (
    select count(*)
    from public.notificacao_destinatarios d
    where d.config_id = c.id
      and d.pessoa_tipo = 'usuario'
      and d.canal in ('whatsapp', 'ambos')
  ) = 2;

do $cron$
declare
  v_job record;
begin
  for v_job in select jobid from cron.job where jobname = 'materializar-health-score-professor-v3-diario'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  -- pg_cron e UTC: 06:30 UTC = 03:30 BRT. Fecha nenhum periodo e nao habilita ranking.
  perform cron.schedule(
    'materializar-health-score-professor-v3-diario',
    '30 6 * * *',
    'select public.executar_health_score_professor_v3_cron_diario();'
  );
end;
$cron$;

comment on function public.executar_health_score_professor_v3_cron_diario() is
  'Cron diario do mes aberto: fingerprint idempotente, escopos explicitos e alerta autenticado em erro; nao fecha competencia nem habilita ranking.';

commit;
