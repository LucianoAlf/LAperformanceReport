-- Fila de envio dos toques da pesquisa de evasao.
-- Uma linha por TOQUE (1 = envio original, reservado; 2 = repescagem), para
-- que acrescentar um 3o toque seja dado, nao migration.

create table public.pesquisa_evasao_envios_fila (
  id uuid primary key default gen_random_uuid(),
  pesquisa_id uuid not null references public.pesquisa_evasao(id) on delete cascade,
  unidade_id uuid not null references public.unidades(id),
  toque integer not null check (toque between 1 and 9),
  template_id uuid not null references public.pesquisa_evasao_templates(id),
  template_versao integer not null,
  status text not null default 'pendente'
    check (status in ('pendente','enviando','enviada','falhou','cancelada')),
  agendada_para timestamptz not null,
  enfileirada_por_usuario_id integer references public.usuarios(id),
  enfileirada_em timestamptz not null default now(),
  worker_id uuid,
  lease_expires_at timestamptz,
  tentativas integer not null default 0,
  max_tentativas integer not null default 3,
  ultimo_erro text,
  provider_message_id text,
  enviada_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (pesquisa_id, toque)
);

-- Nunca dois envios vivos para a mesma pessoa ao mesmo tempo, mesmo com regua
-- de N toques.
create unique index pesquisa_evasao_envios_fila_vivo_uidx
  on public.pesquisa_evasao_envios_fila (pesquisa_id)
  where status in ('pendente','enviando');

create index pesquisa_evasao_envios_fila_proxima_idx
  on public.pesquisa_evasao_envios_fila (agendada_para)
  where status = 'pendente';

create index pesquisa_evasao_envios_fila_unidade_idx
  on public.pesquisa_evasao_envios_fila (unidade_id);

alter table public.pesquisa_evasao_envios_fila enable row level security;

-- ALTER DEFAULT PRIVILEGES concede tudo a authenticated em relacao nova;
-- revogar antes de conceder o que de fato deve existir.
revoke all on table public.pesquisa_evasao_envios_fila from public, anon, authenticated;
grant select on table public.pesquisa_evasao_envios_fila to authenticated;
grant all on table public.pesquisa_evasao_envios_fila to service_role;

create policy pesquisa_evasao_envios_fila_leitura_escopada
  on public.pesquisa_evasao_envios_fila
  for select
  to authenticated
  using (
    (select public.is_admin())
    or unidade_id in (select public.get_user_unidade_ids())
  );

create or replace function public.fn_pesquisa_evasao_envios_fila_touch()
returns trigger
language plpgsql
as $function$
begin
  new.atualizado_em := now();
  return new;
end;
$function$;

create trigger trg_pesquisa_evasao_envios_fila_touch
  before update on public.pesquisa_evasao_envios_fila
  for each row execute function public.fn_pesquisa_evasao_envios_fila_touch();

comment on table public.pesquisa_evasao_envios_fila is
  'Fila de envio dos toques da pesquisa de evasao. Grao: um toque por pesquisa. Escrita apenas por service_role e pelas RPCs SECURITY DEFINER.';
