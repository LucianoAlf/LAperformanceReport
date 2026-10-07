create table public.evento_comunicacao (
  id              bigint generated always as identity primary key,
  participacao_id bigint not null references public.evento_participacao(id) on delete cascade,
  unidade_id      uuid   not null references public.unidades(id),
  canal           text   not null
    check (canal in ('whatsapp', 'email', 'impresso', 'pessoalmente', 'outro')),
  texto           text,
  enviado_em      timestamptz not null default now(),
  enviado_por     uuid,          -- auth.users.id, null quando automatico (aprovado)
  origem          text           -- canal da escrita, mesmo vocabulario do audit
);
comment on table public.evento_comunicacao is
  'Cada envio de convite/comunicado a familia e UMA linha — historico, nunca sobrescrito. '
  'Ligado a participacao (pessoa no evento), nao a apresentacao.';

create or replace function public.fn_evento_comunicacao_deriva()
returns trigger language plpgsql
set search_path = 'public', 'pg_temp'
as $$
begin
  select p.unidade_id into new.unidade_id
    from public.evento_participacao p where p.id = new.participacao_id;
  if new.unidade_id is null then
    raise exception 'evento_comunicacao: participacao % nao existe', new.participacao_id
      using errcode = 'P0001';
  end if;
  new.enviado_por := coalesce(new.enviado_por, auth.uid());
  new.origem      := coalesce(new.origem, public.fn_evento_origem_escrita());
  return new;
end;
$$;
create trigger trg_evento_comunicacao_deriva
  before insert on public.evento_comunicacao
  for each row execute function public.fn_evento_comunicacao_deriva();
create trigger trg_audit_evento_comunicacao
  after insert or update or delete on public.evento_comunicacao
  for each row execute function public.fn_evento_audit_log();

alter table public.evento_comunicacao enable row level security;
-- historico nunca sobrescrito: SELECT e INSERT apenas, sem UPDATE/DELETE em lugar nenhum
create policy evento_comunicacao_leitura on public.evento_comunicacao
  for select using (is_admin() or unidade_id in (select get_user_unidade_ids()));
create policy evento_comunicacao_escrita on public.evento_comunicacao
  for insert with check (is_admin() or unidade_id in (select get_user_unidade_ids()));
revoke update, delete on public.evento_comunicacao from authenticated;
