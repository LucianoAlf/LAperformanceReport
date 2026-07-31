begin;

create table public.emusys_experimentais_snapshot_publicacoes_vigentes (
  unidade_id uuid primary key references public.unidades(id),
  execucao_id uuid not null
    references public.emusys_experimentais_snapshot_execucoes(id),
  data_inicio date not null,
  data_fim date not null,
  origem text not null check (origem in ('admitida', 'metadados')),
  atualizado_em timestamptz not null default clock_timestamp(),
  constraint emusys_experimentais_snapshot_publicacao_intervalo_valido
    check (data_fim >= data_inicio)
);

alter table public.emusys_experimentais_snapshot_publicacoes_vigentes
  enable row level security;

revoke all on table public.emusys_experimentais_snapshot_publicacoes_vigentes
  from public, anon, authenticated;
grant select, insert, update
  on table public.emusys_experimentais_snapshot_publicacoes_vigentes
  to service_role;

create or replace function public.aplicar_snapshot_experimentais_emusys_admitido_v1(
  p_admissao_id uuid,
  p_execucao_id uuid,
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_itens jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_agora timestamptz;
  v_admissao public.emusys_experimentais_refresh_admissoes%rowtype;
  v_resultado jsonb;
begin
  select a.*
  into v_admissao
  from public.emusys_experimentais_refresh_admissoes a
  where a.id = p_admissao_id
    and a.snapshot_execucao_id = p_execucao_id
    and a.unidade_id = p_unidade_id
    and a.data_inicio = p_data_inicio
    and a.data_fim = p_data_fim
    and a.status = 'em_andamento'
  for update;

  if not found then
    raise exception 'SNAPSHOT_ADMISSAO_FENCING_INVALIDO'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'la_report:aplicar_snapshot_experimentais_emusys_v1:unidade:'
        || p_unidade_id::text,
      0
    )
  );

  v_agora := clock_timestamp();
  if v_admissao.lease_ate <= v_agora then
    raise exception 'SNAPSHOT_ADMISSAO_LEASE_EXPIRADO'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.emusys_experimentais_refresh_admissoes a
    where a.id <> p_admissao_id
      and a.unidade_id = p_unidade_id
      and a.status in ('em_andamento', 'completo')
      and a.lease_ate > v_agora
      and a.data_inicio <= p_data_fim
      and a.data_fim >= p_data_inicio
      and (
        a.status = 'completo'
        or (a.criado_em, a.id) < (v_admissao.criado_em, v_admissao.id)
      )
  ) then
    update public.emusys_experimentais_refresh_admissoes
    set
      lease_ate = greatest(lease_ate, v_agora + interval '150 seconds'),
      atualizado_em = v_agora
    where id = p_admissao_id
      and status = 'em_andamento'
      and snapshot_execucao_id = p_execucao_id;

    return jsonb_build_object(
      'execucao_id', p_execucao_id,
      'status', 'adiado_leitura',
      'linhas_recebidas', 0,
      'linhas_ativas', 0,
      'linhas_inseridas', 0,
      'linhas_atualizadas', 0,
      'linhas_versionadas', 0,
      'linhas_inativadas', 0
    );
  end if;

  v_resultado := public.aplicar_snapshot_experimentais_emusys_v1(
    p_execucao_id,
    p_unidade_id,
    p_data_inicio,
    p_data_fim,
    p_itens
  );

  insert into public.emusys_experimentais_snapshot_publicacoes_vigentes (
    unidade_id,
    execucao_id,
    data_inicio,
    data_fim,
    origem,
    atualizado_em
  ) values (
    p_unidade_id,
    p_execucao_id,
    p_data_inicio,
    p_data_fim,
    'admitida',
    clock_timestamp()
  )
  on conflict (unidade_id) do update
  set
    execucao_id = excluded.execucao_id,
    data_inicio = excluded.data_inicio,
    data_fim = excluded.data_fim,
    origem = excluded.origem,
    atualizado_em = excluded.atualizado_em;

  return v_resultado;
end;
$function$;

revoke all on function public.aplicar_snapshot_experimentais_emusys_admitido_v1(
  uuid,
  uuid,
  uuid,
  date,
  date,
  jsonb
) from public, anon, authenticated;
grant execute on function public.aplicar_snapshot_experimentais_emusys_admitido_v1(
  uuid,
  uuid,
  uuid,
  date,
  date,
  jsonb
) to service_role;

create or replace function public.proteger_leitura_snapshot_experimentais_v1(
  p_admissao_id uuid,
  p_execucao_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_agora timestamptz;
  v_admissao public.emusys_experimentais_refresh_admissoes%rowtype;
  v_nova_execucao_id uuid;
begin
  select a.*
  into v_admissao
  from public.emusys_experimentais_refresh_admissoes a
  where a.id = p_admissao_id
    and a.status = 'completo'
    and a.snapshot_execucao_id = p_execucao_id
  for update;

  if not found then
    raise exception 'SNAPSHOT_ADMISSAO_LEITURA_INVALIDA'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'la_report:aplicar_snapshot_experimentais_emusys_v1:unidade:'
        || v_admissao.unidade_id::text,
      0
    )
  );

  v_agora := clock_timestamp();

  perform 1
  from public.emusys_experimentais_snapshot_publicacoes_vigentes p
  where p.unidade_id = v_admissao.unidade_id
    and p.execucao_id = p_execucao_id
    and p.data_inicio = v_admissao.data_inicio
    and p.data_fim = v_admissao.data_fim;

  if not found then
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
    where id = p_admissao_id
      and status = 'completo'
      and snapshot_execucao_id = p_execucao_id
    returning * into v_admissao;

    if not found then
      raise exception 'SNAPSHOT_ADMISSAO_PROMOCAO_CONCORRENTE';
    end if;

    return jsonb_build_object(
      'admissao_id', v_admissao.id,
      'acao', 'atualizar',
      'snapshot_execucao_id', v_admissao.snapshot_execucao_id,
      'protegido_ate', null
    );
  end if;

  update public.emusys_experimentais_refresh_admissoes
  set
    lease_ate = v_agora + interval '60 seconds',
    atualizado_em = v_agora
  where id = p_admissao_id
    and status = 'completo'
    and snapshot_execucao_id = p_execucao_id
  returning * into v_admissao;

  if not found then
    raise exception 'SNAPSHOT_ADMISSAO_PROTECAO_CONCORRENTE';
  end if;

  return jsonb_build_object(
    'admissao_id', v_admissao.id,
    'acao', 'reutilizar',
    'snapshot_execucao_id', v_admissao.snapshot_execucao_id,
    'protegido_ate', v_admissao.lease_ate
  );
end;
$function$;

revoke all on function public.proteger_leitura_snapshot_experimentais_v1(
  uuid,
  uuid
) from public, anon, authenticated;
grant execute on function public.proteger_leitura_snapshot_experimentais_v1(
  uuid,
  uuid
) to service_role;

create or replace function public.aplicar_snapshot_experimentais_emusys_metadados_v1(
  p_execucao_id uuid,
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_itens jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_agora timestamptz;
  v_resultado jsonb;
begin
  if p_execucao_id is null
     or p_unidade_id is null
     or p_data_inicio is null
     or p_data_fim is null
     or p_data_fim < p_data_inicio then
    raise exception 'SNAPSHOT_METADADOS_PARAMETROS_INVALIDOS'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'la_report:aplicar_snapshot_experimentais_emusys_v1:unidade:'
        || p_unidade_id::text,
      0
    )
  );

  v_agora := clock_timestamp();

  if exists (
    select 1
    from public.emusys_experimentais_refresh_admissoes a
    where a.unidade_id = p_unidade_id
      and a.status in ('em_andamento', 'completo')
      and a.data_inicio <= p_data_fim
      and a.data_fim >= p_data_inicio
      and greatest(
        a.lease_ate,
        a.bucket_inicio + interval '5 minutes',
        coalesce(
          a.concluido_em + interval '60 seconds',
          '-infinity'::timestamptz
        )
      ) > v_agora
  ) then
    return jsonb_build_object(
      'execucao_id', p_execucao_id,
      'status', 'adiado_admissao',
      'linhas_recebidas', 0,
      'linhas_ativas', 0,
      'linhas_inseridas', 0,
      'linhas_atualizadas', 0,
      'linhas_versionadas', 0,
      'linhas_inativadas', 0
    );
  end if;

  v_resultado := public.aplicar_snapshot_experimentais_emusys_v1(
    p_execucao_id,
    p_unidade_id,
    p_data_inicio,
    p_data_fim,
    p_itens
  );

  insert into public.emusys_experimentais_snapshot_publicacoes_vigentes (
    unidade_id,
    execucao_id,
    data_inicio,
    data_fim,
    origem,
    atualizado_em
  ) values (
    p_unidade_id,
    p_execucao_id,
    p_data_inicio,
    p_data_fim,
    'metadados',
    clock_timestamp()
  )
  on conflict (unidade_id) do update
  set
    execucao_id = excluded.execucao_id,
    data_inicio = excluded.data_inicio,
    data_fim = excluded.data_fim,
    origem = excluded.origem,
    atualizado_em = excluded.atualizado_em;

  return v_resultado;
end;
$function$;

revoke all on function public.aplicar_snapshot_experimentais_emusys_metadados_v1(
  uuid,
  uuid,
  date,
  date,
  jsonb
) from public, anon, authenticated;
grant execute on function public.aplicar_snapshot_experimentais_emusys_metadados_v1(
  uuid,
  uuid,
  date,
  date,
  jsonb
) to service_role;

comment on table public.emusys_experimentais_snapshot_publicacoes_vigentes is
  'Ponteiro transacional da ultima publicacao completa por unidade para validar leituras admitidas.';

comment on function public.aplicar_snapshot_experimentais_emusys_metadados_v1(
  uuid,
  uuid,
  date,
  date,
  jsonb
) is
  'Publica o snapshot recorrente somente fora da janela protegida de leitura dos relatorios admitidos.';

comment on function public.proteger_leitura_snapshot_experimentais_v1(
  uuid,
  uuid
) is
  'Sob o lock da unidade, protege a publicacao vigente por sessenta segundos ou promove um refresh novo.';

commit;
