begin;

create table public.emusys_experimentais_refresh_admissoes (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id),
  data_inicio date not null,
  data_fim date not null,
  origem text not null check (origem in ('preview', 'cron')),
  bucket_inicio timestamptz not null,
  status text not null check (
    status in ('em_andamento', 'completo', 'falhou')
  ),
  snapshot_execucao_id uuid not null,
  lease_ate timestamptz not null,
  tentativas integer not null default 1 check (tentativas > 0),
  erro_codigo text,
  criado_em timestamptz not null default clock_timestamp(),
  atualizado_em timestamptz not null default clock_timestamp(),
  concluido_em timestamptz,
  constraint emusys_experimentais_refresh_intervalo_valido
    check (data_fim >= data_inicio),
  unique (
    unidade_id,
    data_inicio,
    data_fim,
    origem,
    bucket_inicio
  )
);

create index emusys_experimentais_refresh_admissoes_lease_idx
  on public.emusys_experimentais_refresh_admissoes (
    status,
    lease_ate
  );

alter table public.emusys_experimentais_refresh_admissoes
  enable row level security;

revoke all on table public.emusys_experimentais_refresh_admissoes
  from public, anon, authenticated;
grant select, insert, update
  on table public.emusys_experimentais_refresh_admissoes
  to service_role;

create or replace function public.admitir_refresh_snapshot_experimentais_v1(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_origem text,
  p_agora timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_agora timestamptz := coalesce(p_agora, clock_timestamp());
  v_bucket_inicio timestamptz;
  v_admissao public.emusys_experimentais_refresh_admissoes%rowtype;
  v_nova_execucao_id uuid;
  v_snapshot_concluido_em timestamptz;
begin
  if p_unidade_id is null
     or p_data_inicio is null
     or p_data_fim is null
     or p_data_fim < p_data_inicio
     or p_data_fim - p_data_inicio > 44 then
    raise exception 'SNAPSHOT_ADMISSAO_PARAMETROS_INVALIDOS'
      using errcode = '22023';
  end if;
  if p_origem not in ('preview', 'cron') then
    raise exception 'SNAPSHOT_ADMISSAO_ORIGEM_INVALIDA'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.unidades u
    where u.id = p_unidade_id
  ) then
    raise exception 'SNAPSHOT_ADMISSAO_UNIDADE_INVALIDA'
      using errcode = '22023';
  end if;

  v_bucket_inicio := date_bin(
    interval '5 minutes',
    v_agora,
    timestamptz '2020-01-01 00:00:00+00'
  );
  v_nova_execucao_id := gen_random_uuid();

  insert into public.emusys_experimentais_refresh_admissoes (
    unidade_id,
    data_inicio,
    data_fim,
    origem,
    bucket_inicio,
    status,
    snapshot_execucao_id,
    lease_ate
  )
  values (
    p_unidade_id,
    p_data_inicio,
    p_data_fim,
    p_origem,
    v_bucket_inicio,
    'em_andamento',
    v_nova_execucao_id,
    v_agora + interval '150 seconds'
  )
  on conflict (
    unidade_id,
    data_inicio,
    data_fim,
    origem,
    bucket_inicio
  ) do nothing
  returning * into v_admissao;

  if found then
    return jsonb_build_object(
      'admissao_id', v_admissao.id,
      'acao', 'atualizar',
      'snapshot_execucao_id', v_admissao.snapshot_execucao_id,
      'bucket_inicio', v_admissao.bucket_inicio,
      'lease_ate', v_admissao.lease_ate
    );
  end if;

  select a.*
  into strict v_admissao
  from public.emusys_experimentais_refresh_admissoes a
  where a.unidade_id = p_unidade_id
    and a.data_inicio = p_data_inicio
    and a.data_fim = p_data_fim
    and a.origem = p_origem
    and a.bucket_inicio = v_bucket_inicio
  for update;

  if v_admissao.status = 'em_andamento' then
    select e.concluido_em
    into v_snapshot_concluido_em
    from public.emusys_experimentais_snapshot_execucoes e
    where e.id = v_admissao.snapshot_execucao_id
      and e.unidade_id = v_admissao.unidade_id
      and e.data_inicio = v_admissao.data_inicio
      and e.data_fim = v_admissao.data_fim
      and e.status = 'completo';

    if found then
      update public.emusys_experimentais_refresh_admissoes
      set
        status = 'completo',
        erro_codigo = null,
        atualizado_em = v_agora,
        concluido_em = v_snapshot_concluido_em
      where id = v_admissao.id
        and status = 'em_andamento'
        and snapshot_execucao_id = v_admissao.snapshot_execucao_id
      returning * into v_admissao;

      return jsonb_build_object(
        'admissao_id', v_admissao.id,
        'acao', 'reutilizar',
        'snapshot_execucao_id', v_admissao.snapshot_execucao_id,
        'bucket_inicio', v_admissao.bucket_inicio,
        'lease_ate', v_admissao.lease_ate
      );
    end if;
  end if;

  if v_admissao.status = 'completo' then
    return jsonb_build_object(
      'admissao_id', v_admissao.id,
      'acao', 'reutilizar',
      'snapshot_execucao_id', v_admissao.snapshot_execucao_id,
      'bucket_inicio', v_admissao.bucket_inicio,
      'lease_ate', v_admissao.lease_ate
    );
  end if;

  if v_admissao.status = 'falhou'
     and v_admissao.lease_ate > v_agora then
    return jsonb_build_object(
      'admissao_id', v_admissao.id,
      'acao', 'bloqueado',
      'snapshot_execucao_id', v_admissao.snapshot_execucao_id,
      'bucket_inicio', v_admissao.bucket_inicio,
      'lease_ate', v_admissao.lease_ate
    );
  end if;

  if v_admissao.status = 'em_andamento'
     and v_admissao.lease_ate > v_agora then
    return jsonb_build_object(
      'admissao_id', v_admissao.id,
      'acao', 'aguardar',
      'snapshot_execucao_id', v_admissao.snapshot_execucao_id,
      'bucket_inicio', v_admissao.bucket_inicio,
      'lease_ate', v_admissao.lease_ate
    );
  end if;

  if v_admissao.status = 'falhou'
     or v_admissao.lease_ate <= v_agora then
    v_nova_execucao_id := gen_random_uuid();
    update public.emusys_experimentais_refresh_admissoes
    set
      status = 'em_andamento',
      snapshot_execucao_id = v_nova_execucao_id,
      lease_ate = v_agora + interval '150 seconds',
      tentativas = tentativas + 1,
      erro_codigo = null,
      atualizado_em = v_agora,
      concluido_em = null
    where id = v_admissao.id
    returning * into v_admissao;

    return jsonb_build_object(
      'admissao_id', v_admissao.id,
      'acao', 'atualizar',
      'snapshot_execucao_id', v_admissao.snapshot_execucao_id,
      'bucket_inicio', v_admissao.bucket_inicio,
      'lease_ate', v_admissao.lease_ate
    );
  end if;

  raise exception 'SNAPSHOT_ADMISSAO_ESTADO_INVALIDO';
end;
$function$;

revoke all on function public.admitir_refresh_snapshot_experimentais_v1(
  uuid,
  date,
  date,
  text,
  timestamptz
) from public, anon, authenticated;
grant execute on function public.admitir_refresh_snapshot_experimentais_v1(
  uuid,
  date,
  date,
  text,
  timestamptz
) to service_role;

create or replace function public.finalizar_refresh_snapshot_experimentais_v1(
  p_admissao_id uuid,
  p_execucao_id uuid,
  p_sucesso boolean,
  p_erro_codigo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_agora timestamptz := clock_timestamp();
  v_admissao public.emusys_experimentais_refresh_admissoes%rowtype;
begin
  select a.*
  into v_admissao
  from public.emusys_experimentais_refresh_admissoes a
  where a.id = p_admissao_id
  for update;

  if not found then
    raise exception 'SNAPSHOT_ADMISSAO_NAO_ENCONTRADA'
      using errcode = '22023';
  end if;

  if v_admissao.status = 'completo'
     and v_admissao.snapshot_execucao_id = p_execucao_id
     and p_sucesso is true then
    return jsonb_build_object(
      'admissao_id', v_admissao.id,
      'status', v_admissao.status,
      'snapshot_execucao_id', v_admissao.snapshot_execucao_id
    );
  end if;

  if v_admissao.snapshot_execucao_id <> p_execucao_id
     or v_admissao.status <> 'em_andamento' then
    raise exception 'SNAPSHOT_ADMISSAO_IDENTIDADE_INVALIDA'
      using errcode = '22023';
  end if;

  if p_sucesso is true and not exists (
    select 1
    from public.emusys_experimentais_snapshot_execucoes e
    where e.id = p_execucao_id
      and e.unidade_id = v_admissao.unidade_id
      and e.data_inicio = v_admissao.data_inicio
      and e.data_fim = v_admissao.data_fim
      and e.status = 'completo'
  ) then
    raise exception 'SNAPSHOT_ADMISSAO_EXECUCAO_INCOMPLETA'
      using errcode = '22023';
  end if;

  update public.emusys_experimentais_refresh_admissoes
  set
    status = case when p_sucesso then 'completo' else 'falhou' end,
    erro_codigo = case
      when p_sucesso then null
      else left(
        regexp_replace(
          coalesce(nullif(btrim(p_erro_codigo), ''), 'FALHA_SNAPSHOT'),
          '[^A-Z0-9_]',
          '',
          'g'
        ),
        80
      )
    end,
    atualizado_em = v_agora,
    concluido_em = v_agora
  where id = p_admissao_id
    and snapshot_execucao_id = p_execucao_id
    and status = 'em_andamento'
  returning * into v_admissao;

  if not found then
    raise exception 'SNAPSHOT_ADMISSAO_FINALIZACAO_CONCORRENTE';
  end if;

  return jsonb_build_object(
    'admissao_id', v_admissao.id,
    'status', v_admissao.status,
    'snapshot_execucao_id', v_admissao.snapshot_execucao_id
  );
end;
$function$;

revoke all on function public.finalizar_refresh_snapshot_experimentais_v1(
  uuid,
  uuid,
  boolean,
  text
) from public, anon, authenticated;
grant execute on function public.finalizar_refresh_snapshot_experimentais_v1(
  uuid,
  uuid,
  boolean,
  text
) to service_role;

comment on table public.emusys_experimentais_refresh_admissoes is
  'Single-flight e janela de frescor do refresh Emusys por unidade, intervalo e origem.';

commit;
