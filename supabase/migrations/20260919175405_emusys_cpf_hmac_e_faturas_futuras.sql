-- CPF do Emusys: identidade por HMAC-SHA256 sem persistencia do documento.
-- Tambem amplia o backlog de faturas para os tres meses futuros.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

do $migration$
declare
  v_secret text;
begin
  select decrypted_secret
    into v_secret
    from vault.decrypted_secrets
   where name = 'emusys_cpf_hmac_key_v1'
   limit 1;

  if v_secret is null or v_secret !~ '^[0-9a-f]{64}$' then
    raise exception 'EMUSYS_CPF_HMAC_KEY_INVALIDA: configure emusys_cpf_hmac_key_v1 no Vault com 32 bytes em hexadecimal';
  end if;
end;
$migration$;

create or replace function private.remover_cpf_claro_jsonb(p_valor jsonb)
returns jsonb
language plpgsql
immutable
strict
set search_path = pg_catalog, private
as $function$
declare
  v_tipo text := jsonb_typeof(p_valor);
begin
  if v_tipo = 'object' then
    return coalesce(
      (
        select jsonb_object_agg(item.key, private.remover_cpf_claro_jsonb(item.value))
          from jsonb_each(p_valor) as item
         where not (
           lower(item.key) like '%cpf%'
           and lower(item.key) not like '%hash%'
         )
      ),
      '{}'::jsonb
    );
  end if;

  if v_tipo = 'array' then
    return coalesce(
      (
        select jsonb_agg(private.remover_cpf_claro_jsonb(item.value) order by item.ordinality)
          from jsonb_array_elements(p_valor) with ordinality as item(value, ordinality)
      ),
      '[]'::jsonb
    );
  end if;

  return p_valor;
end;
$function$;

revoke all on function private.remover_cpf_claro_jsonb(jsonb)
  from public, anon, authenticated;

create table if not exists private.emusys_cpf_hmac_vinculos (
  unidade_id uuid not null references public.unidades(id) on delete cascade,
  emusys_matricula_id bigint not null,
  emusys_aluno_id bigint,
  aluno_id integer references public.alunos(id) on delete set null,
  papel text not null,
  emusys_pessoa_id bigint,
  cpf_hmac text not null,
  primeiro_visto_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (unidade_id, emusys_matricula_id, papel),
  constraint emusys_cpf_hmac_vinculos_papel_check
    check (papel in ('aluno', 'responsavel')),
  constraint emusys_cpf_hmac_vinculos_digest_check
    check (cpf_hmac ~ '^[0-9a-f]{64}$')
);

create index if not exists idx_emusys_cpf_hmac_vinculos_digest
  on private.emusys_cpf_hmac_vinculos (cpf_hmac, unidade_id);

create index if not exists idx_emusys_cpf_hmac_vinculos_aluno
  on private.emusys_cpf_hmac_vinculos (aluno_id)
  where aluno_id is not null;

alter table private.emusys_cpf_hmac_vinculos enable row level security;
revoke all on table private.emusys_cpf_hmac_vinculos
  from public, anon, authenticated;
grant select, insert, update, delete on table private.emusys_cpf_hmac_vinculos
  to service_role;

comment on table private.emusys_cpf_hmac_vinculos is
  'Vinculo backend-only por HMAC-SHA256 de CPF. Nunca armazena o documento em claro.';

create or replace function private.calcular_emusys_cpf_hmac(p_cpf_digitos text)
returns text
language plpgsql
security definer
stable
set search_path = pg_catalog, private, vault, extensions
as $function$
declare
  v_secret text;
begin
  if p_cpf_digitos is null or p_cpf_digitos !~ '^[0-9]{11}$' then
    raise exception 'EMUSYS_CPF_INVALIDO: esperado documento com onze digitos'
      using errcode = '22023';
  end if;

  select decrypted_secret
    into v_secret
    from vault.decrypted_secrets
   where name = 'emusys_cpf_hmac_key_v1'
   limit 1;

  if v_secret is null or v_secret !~ '^[0-9a-f]{64}$' then
    raise exception 'EMUSYS_CPF_HMAC_KEY_INVALIDA'
      using errcode = '55000';
  end if;

  return encode(
    extensions.hmac(
      convert_to(p_cpf_digitos, 'UTF8'),
      decode(v_secret, 'hex'),
      'sha256'
    ),
    'hex'
  );
end;
$function$;

revoke all on function private.calcular_emusys_cpf_hmac(text)
  from public, anon, authenticated;

create or replace function public.replace_emusys_cpf_hmac_vinculos(
  p_unidade_id uuid,
  p_matriculas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_recebidas integer;
  v_vinculos integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'EMUSYS_CPF_HMAC_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;
  if p_unidade_id is null then
    raise exception 'EMUSYS_CPF_HMAC_UNIDADE_OBRIGATORIA'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_matriculas) is distinct from 'array' then
    raise exception 'EMUSYS_CPF_HMAC_MATRICULAS_DEVEM_SER_ARRAY'
      using errcode = '22023';
  end if;

  select jsonb_array_length(p_matriculas) into v_recebidas;

  if exists (
    select 1
      from jsonb_array_elements(p_matriculas) as linha(item)
     where coalesce(linha.item->>'emusys_matricula_id', '') !~ '^[0-9]+$'
        or (
          nullif(linha.item->>'aluno_cpf', '') is not null
          and linha.item->>'aluno_cpf' !~ '^[0-9]{11}$'
        )
        or (
          nullif(linha.item->>'responsavel_cpf', '') is not null
          and linha.item->>'responsavel_cpf' !~ '^[0-9]{11}$'
        )
  ) then
    raise exception 'EMUSYS_CPF_HMAC_LOTE_INVALIDO'
      using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_matriculas) as linha(item)
     group by (linha.item->>'emusys_matricula_id')::bigint
    having count(*) > 1
  ) then
    raise exception 'EMUSYS_CPF_HMAC_MATRICULA_DUPLICADA'
      using errcode = '22023';
  end if;

  delete from private.emusys_cpf_hmac_vinculos vinculo
   where vinculo.unidade_id = p_unidade_id
     and vinculo.emusys_matricula_id in (
       select (linha.item->>'emusys_matricula_id')::bigint
         from jsonb_array_elements(p_matriculas) as linha(item)
     );

  with matriculas as (
    select
      (linha.item->>'emusys_matricula_id')::bigint as emusys_matricula_id,
      case when coalesce(linha.item->>'emusys_aluno_id', '') ~ '^[0-9]+$'
        then (linha.item->>'emusys_aluno_id')::bigint end as emusys_aluno_id,
      case when coalesce(linha.item->>'aluno_id', '') ~ '^[0-9]+$'
        then (linha.item->>'aluno_id')::integer end as aluno_id_sugerido,
      case when coalesce(linha.item->>'emusys_responsavel_id', '') ~ '^[0-9]+$'
        then (linha.item->>'emusys_responsavel_id')::bigint end as emusys_responsavel_id,
      nullif(linha.item->>'aluno_cpf', '') as aluno_cpf,
      nullif(linha.item->>'responsavel_cpf', '') as responsavel_cpf
    from jsonb_array_elements(p_matriculas) as linha(item)
  ),
  normalizadas as (
    select
      m.*,
      a.id as aluno_id
    from matriculas m
    left join public.alunos a
      on a.id = m.aluno_id_sugerido
     and a.unidade_id = p_unidade_id
  ),
  candidatas as (
    select
      p_unidade_id as unidade_id,
      n.emusys_matricula_id,
      n.emusys_aluno_id,
      n.aluno_id,
      'aluno'::text as papel,
      n.emusys_aluno_id as emusys_pessoa_id,
      n.aluno_cpf as cpf_digitos
    from normalizadas n
    where n.aluno_cpf is not null
    union all
    select
      p_unidade_id,
      n.emusys_matricula_id,
      n.emusys_aluno_id,
      n.aluno_id,
      'responsavel'::text,
      n.emusys_responsavel_id,
      n.responsavel_cpf
    from normalizadas n
    where n.responsavel_cpf is not null
  ),
  gravadas as (
    insert into private.emusys_cpf_hmac_vinculos (
      unidade_id,
      emusys_matricula_id,
      emusys_aluno_id,
      aluno_id,
      papel,
      emusys_pessoa_id,
      cpf_hmac,
      primeiro_visto_em,
      atualizado_em
    )
    select
      c.unidade_id,
      c.emusys_matricula_id,
      c.emusys_aluno_id,
      c.aluno_id,
      c.papel,
      c.emusys_pessoa_id,
      private.calcular_emusys_cpf_hmac(c.cpf_digitos),
      now(),
      now()
    from candidatas c
    on conflict (unidade_id, emusys_matricula_id, papel) do update set
      emusys_aluno_id = excluded.emusys_aluno_id,
      aluno_id = coalesce(excluded.aluno_id, private.emusys_cpf_hmac_vinculos.aluno_id),
      emusys_pessoa_id = excluded.emusys_pessoa_id,
      cpf_hmac = excluded.cpf_hmac,
      atualizado_em = now()
    returning 1
  )
  select count(*) into v_vinculos from gravadas;

  return jsonb_build_object(
    'matriculas_processadas', v_recebidas,
    'vinculos_gravados', v_vinculos
  );
end;
$function$;

revoke all on function public.replace_emusys_cpf_hmac_vinculos(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_emusys_cpf_hmac_vinculos(uuid, jsonb)
  to service_role;

create or replace function public.resolver_emusys_cpf_hmac(p_cpf_hmac text)
returns table (
  papel_cpf text,
  unidade_id uuid,
  unidade_nome text,
  aluno_id integer,
  aluno_nome text,
  responsavel_nome text,
  emusys_aluno_id bigint,
  emusys_responsavel_id bigint,
  emusys_matricula_id bigint
)
language plpgsql
security definer
stable
set search_path = pg_catalog, public, private
as $function$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'EMUSYS_CPF_HMAC_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;
  if p_cpf_hmac is null or lower(trim(p_cpf_hmac)) !~ '^[0-9a-f]{64}$' then
    raise exception 'EMUSYS_CPF_HMAC_INVALIDO'
      using errcode = '22023';
  end if;

  return query
  select
    vinculo.papel as papel_cpf,
    vinculo.unidade_id,
    unidade.nome::text as unidade_nome,
    aluno.id as aluno_id,
    aluno.nome::text as aluno_nome,
    aluno.responsavel_nome::text,
    vinculo.emusys_aluno_id,
    case when vinculo.papel = 'responsavel' then vinculo.emusys_pessoa_id end,
    vinculo.emusys_matricula_id
  from private.emusys_cpf_hmac_vinculos vinculo
  join public.unidades unidade on unidade.id = vinculo.unidade_id
  left join lateral (
    select candidato.id, candidato.nome, candidato.responsavel_nome
      from public.alunos candidato
     where candidato.unidade_id = vinculo.unidade_id
       and (
         candidato.id = vinculo.aluno_id
         or candidato.emusys_matricula_id = vinculo.emusys_matricula_id::text
       )
     order by (candidato.id = vinculo.aluno_id) desc, candidato.id
     limit 1
  ) aluno on true
  where vinculo.cpf_hmac = lower(trim(p_cpf_hmac))
  order by unidade.nome, aluno.nome nulls last, vinculo.emusys_matricula_id, vinculo.papel;
end;
$function$;

revoke all on function public.resolver_emusys_cpf_hmac(text)
  from public, anon, authenticated;
grant execute on function public.resolver_emusys_cpf_hmac(text)
  to service_role;

-- backfill_emusys_cpf_hmac: deriva todos os digests antes de apagar o passivo.
with segredo as (
  select decrypted_secret
    from vault.decrypted_secrets
   where name = 'emusys_cpf_hmac_key_v1'
   limit 1
),
base as (
  select
    estado.unidade_id,
    estado.emusys_matricula_id,
    estado.emusys_aluno_id,
    estado.aluno_id,
    case when coalesce(estado.payload_snapshot#>>'{responsavel,id}', '') ~ '^[0-9]+$'
      then (estado.payload_snapshot#>>'{responsavel,id}')::bigint end as emusys_responsavel_id,
    regexp_replace(coalesce(estado.payload_snapshot#>>'{aluno,cpf}', ''), '\D', '', 'g') as aluno_cpf,
    regexp_replace(coalesce(estado.payload_snapshot#>>'{responsavel,cpf}', ''), '\D', '', 'g') as responsavel_cpf
  from public.emusys_matriculas_estado_atual estado
),
vinculos as (
  select
    base.unidade_id,
    base.emusys_matricula_id,
    base.emusys_aluno_id,
    base.aluno_id,
    'aluno'::text as papel,
    base.emusys_aluno_id as emusys_pessoa_id,
    base.aluno_cpf as cpf_digitos
  from base
  where base.aluno_cpf ~ '^[0-9]{11}$'
  union all
  select
    base.unidade_id,
    base.emusys_matricula_id,
    base.emusys_aluno_id,
    base.aluno_id,
    'responsavel'::text,
    base.emusys_responsavel_id,
    base.responsavel_cpf
  from base
  where base.responsavel_cpf ~ '^[0-9]{11}$'
)
insert into private.emusys_cpf_hmac_vinculos (
  unidade_id,
  emusys_matricula_id,
  emusys_aluno_id,
  aluno_id,
  papel,
  emusys_pessoa_id,
  cpf_hmac,
  primeiro_visto_em,
  atualizado_em
)
select
  vinculo.unidade_id,
  vinculo.emusys_matricula_id,
  vinculo.emusys_aluno_id,
  vinculo.aluno_id,
  vinculo.papel,
  vinculo.emusys_pessoa_id,
  encode(
    extensions.hmac(
      convert_to(vinculo.cpf_digitos, 'UTF8'),
      decode(segredo.decrypted_secret, 'hex'),
      'sha256'
    ),
    'hex'
  ),
  now(),
  now()
from vinculos vinculo
cross join segredo
on conflict (unidade_id, emusys_matricula_id, papel) do update set
  emusys_aluno_id = excluded.emusys_aluno_id,
  aluno_id = coalesce(excluded.aluno_id, private.emusys_cpf_hmac_vinculos.aluno_id),
  emusys_pessoa_id = excluded.emusys_pessoa_id,
  cpf_hmac = excluded.cpf_hmac,
  atualizado_em = now();

-- scrub_cpf_claro_existente: a derivacao acima e a limpeza abaixo sao uma transacao.
update public.emusys_matriculas_estado_atual
set
  payload_snapshot = private.remover_cpf_claro_jsonb(payload_snapshot),
  payload_hash = md5(private.remover_cpf_claro_jsonb(payload_snapshot)::text),
  updated_at = now()
where payload_snapshot is distinct from private.remover_cpf_claro_jsonb(payload_snapshot);

update public.emusys_api_payload
set payload = private.remover_cpf_claro_jsonb(payload)
where payload is distinct from private.remover_cpf_claro_jsonb(payload);

update public.matriculas_emusys_decisoes_canonicas
set snapshot_emusys = private.remover_cpf_claro_jsonb(snapshot_emusys)
where snapshot_emusys is distinct from private.remover_cpf_claro_jsonb(snapshot_emusys);

update public.automacao_log
set
  payload_bruto = private.remover_cpf_claro_jsonb(payload_bruto),
  detalhes = private.remover_cpf_claro_jsonb(detalhes)
where (payload_bruto is not null and payload_bruto is distinct from private.remover_cpf_claro_jsonb(payload_bruto))
   or (detalhes is not null and detalhes is distinct from private.remover_cpf_claro_jsonb(detalhes));

update public.webhook_debug_log
set payload = private.remover_cpf_claro_jsonb(payload)
where payload is distinct from private.remover_cpf_claro_jsonb(payload);

update public.leads_automacao_log
set payload_bruto = private.remover_cpf_claro_jsonb(payload_bruto)
where payload_bruto is distinct from private.remover_cpf_claro_jsonb(payload_bruto);

create or replace function private.remover_cpf_claro_jsonb_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_documento jsonb := to_jsonb(new);
  v_coluna text;
begin
  foreach v_coluna in array tg_argv loop
    if v_documento ? v_coluna then
      v_documento := jsonb_set(
        v_documento,
        array[v_coluna],
        private.remover_cpf_claro_jsonb(v_documento->v_coluna),
        false
      );
    end if;
  end loop;

  if tg_table_schema = 'public' and tg_table_name = 'emusys_matriculas_estado_atual' then
    v_documento := jsonb_set(
      v_documento,
      '{payload_hash}',
      to_jsonb(md5((v_documento->'payload_snapshot')::text)),
      true
    );
  end if;

  new := jsonb_populate_record(new, v_documento);
  return new;
end;
$function$;

revoke all on function private.remover_cpf_claro_jsonb_trigger()
  from public, anon, authenticated;

drop trigger if exists trg_remover_cpf_emusys_matriculas_estado_atual
  on public.emusys_matriculas_estado_atual;
create trigger trg_remover_cpf_emusys_matriculas_estado_atual
before insert or update of payload_snapshot
on public.emusys_matriculas_estado_atual
for each row execute function private.remover_cpf_claro_jsonb_trigger('payload_snapshot');

drop trigger if exists trg_remover_cpf_emusys_api_payload
  on public.emusys_api_payload;
create trigger trg_remover_cpf_emusys_api_payload
before insert or update of payload
on public.emusys_api_payload
for each row execute function private.remover_cpf_claro_jsonb_trigger('payload');

drop trigger if exists trg_remover_cpf_matriculas_decisoes
  on public.matriculas_emusys_decisoes_canonicas;
create trigger trg_remover_cpf_matriculas_decisoes
before insert or update of snapshot_emusys
on public.matriculas_emusys_decisoes_canonicas
for each row execute function private.remover_cpf_claro_jsonb_trigger('snapshot_emusys');

drop trigger if exists trg_remover_cpf_automacao_log
  on public.automacao_log;
create trigger trg_remover_cpf_automacao_log
before insert or update of payload_bruto, detalhes
on public.automacao_log
for each row execute function private.remover_cpf_claro_jsonb_trigger('payload_bruto', 'detalhes');

drop trigger if exists trg_remover_cpf_webhook_debug_log
  on public.webhook_debug_log;
create trigger trg_remover_cpf_webhook_debug_log
before insert or update of payload
on public.webhook_debug_log
for each row execute function private.remover_cpf_claro_jsonb_trigger('payload');

drop trigger if exists trg_remover_cpf_leads_automacao_log
  on public.leads_automacao_log;
create trigger trg_remover_cpf_leads_automacao_log
before insert or update of payload_bruto
on public.leads_automacao_log
for each row execute function private.remover_cpf_claro_jsonb_trigger('payload_bruto');

drop policy if exists emusys_api_payload_select_authenticated
  on public.emusys_api_payload;
revoke all on table public.emusys_api_payload from anon, authenticated;
grant select, insert, update, delete on table public.emusys_api_payload to service_role;

comment on column public.emusys_matriculas_estado_atual.payload_snapshot is
  'Snapshot operacional sanitizado. Campos de CPF em claro sao removidos antes da persistencia.';
comment on column public.emusys_api_payload.payload is
  'Snapshot legado de debug sanitizado. Campos de CPF em claro sao removidos por trigger.';

do $audit$
begin
  if exists (
    select 1 from public.emusys_matriculas_estado_atual
     where payload_snapshot is distinct from private.remover_cpf_claro_jsonb(payload_snapshot)
  ) or exists (
    select 1 from public.emusys_api_payload
     where payload is distinct from private.remover_cpf_claro_jsonb(payload)
  ) or exists (
    select 1 from public.matriculas_emusys_decisoes_canonicas
     where snapshot_emusys is distinct from private.remover_cpf_claro_jsonb(snapshot_emusys)
  ) or exists (
    select 1 from public.automacao_log
     where (payload_bruto is not null and payload_bruto is distinct from private.remover_cpf_claro_jsonb(payload_bruto))
        or (detalhes is not null and detalhes is distinct from private.remover_cpf_claro_jsonb(detalhes))
  ) or exists (
    select 1 from public.webhook_debug_log
     where payload is distinct from private.remover_cpf_claro_jsonb(payload)
  ) or exists (
    select 1 from public.leads_automacao_log
     where payload_bruto is not null
       and payload_bruto is distinct from private.remover_cpf_claro_jsonb(payload_bruto)
  ) then
    raise exception 'EMUSYS_CPF_SCRUB_INCOMPLETO';
  end if;
end;
$audit$;

create or replace function public.enqueue_financeiro_sync_backlog(
  p_trigger_source text,
  p_requested_by text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
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
    where i.status = 'aberta'
       or i.source_missing is true
  )
  select array_agg(distinct candidatas.competencia order by candidatas.competencia)
  into v_competencias
  from candidatas;

  return public.enqueue_financeiro_sync_competencias(
    v_competencias,
    p_trigger_source,
    p_requested_by,
    100
  );
end;
$function$;

revoke all on function public.enqueue_financeiro_sync_backlog(text, text)
  from public, anon, authenticated;
grant execute on function public.enqueue_financeiro_sync_backlog(text, text)
  to service_role;

notify pgrst, 'reload schema';
