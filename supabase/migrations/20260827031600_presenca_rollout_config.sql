-- Flags governadas por unidade e superficie. A publicacao desta estrutura nao
-- ativa consumidores: todas as unidades existentes nascem em sombra.

create table public.presenca_rollout_config (
  unidade_id uuid not null references public.unidades(id),
  superficie text not null check (
    superficie in ('agenda', 'sol', 'la_teacher', 'lia', 'mila', 'relatorios', 'kpis')
  ),
  modo text not null check (modo in ('legado', 'sombra', 'canonico_v2')),
  ativado_por text not null,
  ativado_em timestamptz not null default clock_timestamp(),
  motivo text not null check (char_length(btrim(motivo)) between 10 and 500),
  versao bigint not null default 1 check (versao > 0),
  primary key (unidade_id, superficie)
);

create table public.presenca_rollout_eventos (
  id bigint generated always as identity primary key,
  request_id uuid not null unique,
  unidade_id uuid not null references public.unidades(id),
  superficie text not null check (
    superficie in ('agenda', 'sol', 'la_teacher', 'lia', 'mila', 'relatorios', 'kpis')
  ),
  modo_anterior text not null check (modo_anterior in ('legado', 'sombra', 'canonico_v2')),
  modo_novo text not null check (modo_novo in ('legado', 'sombra', 'canonico_v2')),
  ativado_por text not null,
  motivo text not null check (char_length(btrim(motivo)) between 10 and 500),
  evidencia jsonb not null default '{}'::jsonb check (jsonb_typeof(evidencia) = 'object'),
  criado_em timestamptz not null default clock_timestamp()
);

create index presenca_rollout_eventos_unidade_superficie_idx
  on public.presenca_rollout_eventos(unidade_id, superficie, criado_em desc);

alter table public.presenca_rollout_config enable row level security;
alter table public.presenca_rollout_eventos enable row level security;

revoke all on table public.presenca_rollout_config
  from public, anon, authenticated, service_role;
revoke all on table public.presenca_rollout_eventos
  from public, anon, authenticated, service_role;
revoke all on sequence public.presenca_rollout_eventos_id_seq
  from public, anon, authenticated, service_role;
grant select on table public.presenca_rollout_config to service_role;
grant select on table public.presenca_rollout_eventos to service_role;

insert into public.presenca_rollout_config(
  unidade_id, superficie, modo, ativado_por, motivo
)
select
  u.id,
  s.superficie,
  'sombra',
  'migration:presenca_rollout_config',
  'publicacao_tecnica_inicial_sem_cutover'
from public.unidades u
cross join (values
  ('agenda'), ('sol'), ('la_teacher'), ('lia'), ('mila'), ('relatorios'), ('kpis')
) s(superficie)
on conflict (unidade_id, superficie) do nothing;

create or replace function public.fn_presenca_rollout_modo_interno_v1(
  p_unidade_id uuid,
  p_superficie text
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_modo text;
begin
  if p_unidade_id is null or p_superficie not in (
    'agenda', 'sol', 'la_teacher', 'lia', 'mila', 'relatorios', 'kpis'
  ) then
    raise exception using errcode = '22023', message = 'unidade ou superficie invalida';
  end if;
  select c.modo into v_modo
    from public.presenca_rollout_config c
   where c.unidade_id = p_unidade_id
     and c.superficie = p_superficie;
  return coalesce(v_modo, 'legado');
end;
$$;

create or replace function public.get_presenca_rollout_modo_v1(
  p_unidade_id uuid,
  p_superficie text
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise insufficient_privilege using message = 'service_role obrigatorio';
  end if;
  return public.fn_presenca_rollout_modo_interno_v1(p_unidade_id, p_superficie);
end;
$$;

create or replace function public.admin_alterar_presenca_rollout_v1(
  p_unidade_id uuid,
  p_superficie text,
  p_modo text,
  p_motivo text,
  p_request_id uuid,
  p_evidencia jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_ator text;
  v_atual public.presenca_rollout_config%rowtype;
  v_evento public.presenca_rollout_eventos%rowtype;
  v_agora timestamptz := clock_timestamp();
begin
  if v_role = 'service_role' then
    v_ator := coalesce(auth.uid()::text, 'service_role');
  elsif v_role = 'authenticated'
        and auth.uid() is not null
        and public.is_admin() then
    v_ator := auth.uid()::text;
  else
    raise insufficient_privilege using message = 'administrador obrigatorio';
  end if;

  if p_unidade_id is null
     or p_superficie not in ('agenda', 'sol', 'la_teacher', 'lia', 'mila', 'relatorios', 'kpis')
     or p_modo not in ('legado', 'sombra', 'canonico_v2')
     or p_request_id is null
     or char_length(btrim(coalesce(p_motivo, ''))) not between 10 and 500
     or jsonb_typeof(coalesce(p_evidencia, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'parametros de rollout invalidos';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_unidade_id::text || ':' || p_superficie, 0
  ));

  select e.* into v_evento
    from public.presenca_rollout_eventos e
   where e.request_id = p_request_id;
  if found then
    if v_evento.unidade_id <> p_unidade_id
       or v_evento.superficie <> p_superficie
       or v_evento.modo_novo <> p_modo
       or v_evento.motivo <> btrim(p_motivo)
       or v_evento.evidencia <> coalesce(p_evidencia, '{}'::jsonb) then
      raise exception using errcode = '23505', message = 'request_id reutilizado com payload diferente';
    end if;
    return jsonb_build_object(
      'aplicada', false,
      'idempotente', true,
      'evento_id', v_evento.id,
      'modo_anterior', v_evento.modo_anterior,
      'modo_atual', v_evento.modo_novo
    );
  end if;

  if not exists (select 1 from public.unidades u where u.id = p_unidade_id) then
    raise exception using errcode = '23503', message = 'unidade inexistente';
  end if;

  insert into public.presenca_rollout_config(
    unidade_id, superficie, modo, ativado_por, ativado_em, motivo
  ) values (
    p_unidade_id, p_superficie, 'legado', v_ator, v_agora,
    'configuracao_criada_em_modo_legado'
  ) on conflict (unidade_id, superficie) do nothing;

  select c.* into v_atual
    from public.presenca_rollout_config c
   where c.unidade_id = p_unidade_id
     and c.superficie = p_superficie
   for update;

  if p_modo = 'canonico_v2' then
    if v_atual.modo <> 'sombra' then
      raise exception using errcode = '23514', message = 'canonico_v2 exige transicao previa por sombra';
    end if;
    if coalesce((p_evidencia ->> 'dias_operacionais')::integer, -1) < 7
       or coalesce((p_evidencia ->> 'sem_explicacao')::integer, -1) <> 0
       or coalesce((p_evidencia ->> 'sync_completo')::boolean, false) is not true
       or coalesce((p_evidencia ->> 'agenda_sol_convergente')::boolean, false) is not true
       or coalesce((p_evidencia ->> 'comandos_sem_recibo')::integer, -1) <> 0
       or coalesce((p_evidencia ->> 'decisoes_humanas_sobrescritas')::integer, -1) <> 0
       or coalesce((p_evidencia ->> 'vazamento_acl')::integer, -1) <> 0 then
      raise exception using errcode = '23514', message = 'evidencia insuficiente para canonico_v2';
    end if;
  elsif p_modo = 'legado' and v_atual.modo <> 'legado' then
    if lower(btrim(p_motivo)) not like 'rollback:%'
       or coalesce(p_evidencia ->> 'gatilho', '') not in (
         'sync_incompleto_sem_bloqueio',
         'divergencia_agenda_sol',
         'comando_sem_recibo',
         'decisao_humana_sobrescrita',
         'vazamento_acl',
         'delta_sem_explicacao'
       ) then
      raise exception using errcode = '23514', message = 'rollback exige gatilho governado';
    end if;
  end if;

  if v_atual.modo = p_modo then
    insert into public.presenca_rollout_eventos(
      request_id, unidade_id, superficie, modo_anterior, modo_novo,
      ativado_por, motivo, evidencia
    ) values (
      p_request_id, p_unidade_id, p_superficie, v_atual.modo, p_modo,
      v_ator, btrim(p_motivo), coalesce(p_evidencia, '{}'::jsonb)
    ) returning * into v_evento;
    return jsonb_build_object(
      'aplicada', false,
      'idempotente', true,
      'evento_id', v_evento.id,
      'modo_anterior', v_atual.modo,
      'modo_atual', p_modo
    );
  end if;

  update public.presenca_rollout_config c set
    modo = p_modo,
    ativado_por = v_ator,
    ativado_em = v_agora,
    motivo = btrim(p_motivo),
    versao = c.versao + 1
  where c.unidade_id = p_unidade_id
    and c.superficie = p_superficie;

  insert into public.presenca_rollout_eventos(
    request_id, unidade_id, superficie, modo_anterior, modo_novo,
    ativado_por, motivo, evidencia
  ) values (
    p_request_id, p_unidade_id, p_superficie, v_atual.modo, p_modo,
    v_ator, btrim(p_motivo), coalesce(p_evidencia, '{}'::jsonb)
  ) returning * into v_evento;

  return jsonb_build_object(
    'aplicada', true,
    'idempotente', false,
    'evento_id', v_evento.id,
    'modo_anterior', v_atual.modo,
    'modo_atual', p_modo,
    'versao', v_atual.versao + 1
  );
end;
$$;

revoke all on function public.fn_presenca_rollout_modo_interno_v1(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_presenca_rollout_modo_v1(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_alterar_presenca_rollout_v1(
  uuid, text, text, text, uuid, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.get_presenca_rollout_modo_v1(uuid, text)
  to service_role;
grant execute on function public.admin_alterar_presenca_rollout_v1(
  uuid, text, text, text, uuid, jsonb
) to authenticated, service_role;

comment on table public.presenca_rollout_config is
  'Estado atual governado por unidade e superficie. Sombra nao ativa consumidor.';
comment on table public.presenca_rollout_eventos is
  'Trilha append-only das transicoes e rollbacks de presenca canonica.';
comment on function public.admin_alterar_presenca_rollout_v1(
  uuid, text, text, text, uuid, jsonb
) is 'Transicao administrativa idempotente. Canonico exige sete dias e gates verdes; rollback so altera flag.';
