create table public.evento_staff (
  id               bigint generated always as identity primary key,
  evento_id        bigint not null references public.evento(id) on delete cascade,
  unidade_id       uuid   not null references public.unidades(id),
  staff_unidade_id uuid   not null references public.staff_unidade(id),
  funcao           text   not null check (funcao in (
    'roadie_palco', 'roadie_extra', 'higienizacao', 'controle_horario',
    'credenciamento', 'boas_vindas', 'saida', 'outro')),
  funcao_outra     text,   -- obrigatorio quando funcao='outro'
  bloco_id         bigint references public.evento_bloco(id) on delete cascade,  -- null = o evento todo
  observacao       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (funcao <> 'outro' or funcao_outra is not null)
);
comment on table public.evento_staff is
  'Escala de staff do evento. bloco_id null = funcao do evento inteiro (credenciamento, '
  'boas-vindas); preenchido = funcao daquele bloco (roadie de palco do bloco 2).';

create or replace function public.fn_evento_staff_deriva()
returns trigger language plpgsql
set search_path = 'public', 'pg_temp'
as $$
begin
  select e.unidade_id into new.unidade_id from public.evento e where e.id = new.evento_id;
  if new.unidade_id is null then
    raise exception 'evento_staff: evento % nao existe', new.evento_id using errcode = 'P0001';
  end if;
  -- MESMO EVENTO: bloco preenchido tem que ser deste evento
  if new.bloco_id is not null and
     (select b.evento_id from public.evento_bloco b where b.id = new.bloco_id)
       is distinct from new.evento_id
  then
    raise exception 'evento_staff: bloco % nao e do evento %', new.bloco_id, new.evento_id
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger trg_evento_staff_deriva
  before insert or update of evento_id, bloco_id on public.evento_staff
  for each row execute function public.fn_evento_staff_deriva();
create trigger trg_evento_staff_touch
  before update on public.evento_staff
  for each row execute function public.fn_evento_touch();
create trigger trg_audit_evento_staff
  after insert or update or delete on public.evento_staff
  for each row execute function public.fn_evento_audit_log();

alter table public.evento_staff enable row level security;
create policy evento_staff_escopada on public.evento_staff
  for all using (is_admin() or unidade_id in (select get_user_unidade_ids()))
  with check (is_admin() or unidade_id in (select get_user_unidade_ids()));
