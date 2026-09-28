-- cota de cortesias por aluno, por evento (NULL = sem cota configurada ainda)
alter table public.evento
  add column if not exists cortesias_por_aluno integer
  check (cortesias_por_aluno is null or cortesias_por_aluno >= 0);
comment on column public.evento.cortesias_por_aluno is
  'Quantas entradas de CORTESIA cada participante pode nomear. Acima dela e ingresso '
  'vendido (M9). NULL = a unidade ainda nao definiu — a tela trata como "sem teto".';

create table public.evento_convidado (
  id          bigint generated always as identity primary key,
  evento_id   bigint not null references public.evento(id) on delete cascade,
  unidade_id  uuid   not null references public.unidades(id),
  nome        text   not null,
  documento   text,
  observacao  text,
  -- tipo_entrada ja nasce aqui porque o trigger de cota o conta; a M9 so adiciona
  -- venda_id/meia/bloco e o CHECK de coerencia
  tipo_entrada text  not null default 'cortesia'
    check (tipo_entrada in ('cortesia', 'vendido')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.evento_convidado is
  'Convidado NOMINAL do evento — cortesia ou ingresso vendido (tipo_entrada, M9). '
  'Pertence ao evento; o vinculo com quem o convidou fica na ponte '
  'evento_convidado_participacao — irmaos dividem a mesma linha de convidado.';

-- unidade vem do evento, como nas tabelas irmaes (RLS por unidade)
create or replace function public.fn_evento_convidado_deriva()
returns trigger language plpgsql
set search_path = 'public', 'pg_temp'
as $$
begin
  select e.unidade_id into new.unidade_id from public.evento e where e.id = new.evento_id;
  if new.unidade_id is null then
    raise exception 'evento_convidado: evento % nao existe', new.evento_id using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger trg_evento_convidado_deriva
  before insert or update of evento_id on public.evento_convidado
  for each row execute function public.fn_evento_convidado_deriva();
create trigger trg_evento_convidado_touch
  before update on public.evento_convidado
  for each row execute function public.fn_evento_touch();
create trigger trg_audit_evento_convidado
  after insert or update or delete on public.evento_convidado
  for each row execute function public.fn_evento_audit_log();

alter table public.evento_convidado enable row level security;
create policy evento_convidado_escopada on public.evento_convidado
  for all using (is_admin() or unidade_id in (select get_user_unidade_ids()))
  with check (is_admin() or unidade_id in (select get_user_unidade_ids()));

-- a ponte: um convidado pode ser "a convite de" varios participantes (irmaos)
create table public.evento_convidado_participacao (
  convidado_id    bigint not null references public.evento_convidado(id) on delete cascade,
  participacao_id bigint not null references public.evento_participacao(id) on delete cascade,
  primary key (convidado_id, participacao_id)
);
comment on table public.evento_convidado_participacao is
  'Quem convidou quem. Dois irmaos apontam para o MESMO convidado — credenciamento conta '
  'a pessoa uma vez, e a lista mostra a familia inteira.';

-- MESMO EVENTO: convidado do evento A nunca se liga a participacao do evento B
create or replace function public.fn_evento_convidado_participacao_deriva()
returns trigger language plpgsql
set search_path = 'public', 'pg_temp'
as $$
begin
  if (select c.evento_id from public.evento_convidado c where c.id = new.convidado_id)
     is distinct from
     (select p.evento_id from public.evento_participacao p where p.id = new.participacao_id)
  then
    raise exception 'evento_convidado_participacao: convidado e participacao sao de eventos diferentes'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger trg_evento_convidado_participacao_deriva
  before insert or update on public.evento_convidado_participacao
  for each row execute function public.fn_evento_convidado_participacao_deriva();
create trigger trg_audit_evento_convidado_participacao
  after insert or update or delete on public.evento_convidado_participacao
  for each row execute function public.fn_evento_audit_log();

alter table public.evento_convidado_participacao enable row level security;
create policy evento_convidado_participacao_escopada on public.evento_convidado_participacao
  for all using (
    exists (select 1 from public.evento_convidado c
             where c.id = convidado_id
               and (is_admin() or c.unidade_id in (select get_user_unidade_ids())))
  ) with check (
    exists (select 1 from public.evento_convidado c
             where c.id = convidado_id
               and (is_admin() or c.unidade_id in (select get_user_unidade_ids())))
  );

-- credenciamento por BLOCO: evento de varios dias cobija o mesmo convidado em cada dia
create table public.evento_convidado_checkin (
  convidado_id bigint not null references public.evento_convidado(id) on delete cascade,
  bloco_id     bigint not null references public.evento_bloco(id) on delete cascade,
  checkin_em   timestamptz not null default now(),
  primary key (convidado_id, bloco_id)
);
comment on table public.evento_convidado_checkin is
  'Chegada do convidado por bloco/dia — a Barra tem 2 dias, o mesmo convidado entra nos dois.';

-- MESMO EVENTO: o bloco tem que pertencer ao evento do convidado.
-- (A regra "vendido so entra pago" NAO fica aqui: a tabela de vendas nasce na M9 —
-- ela sobrescreve esta funcao la, e a M3 aplicada sozinha continua funcionando.)
create or replace function public.fn_evento_convidado_checkin_deriva()
returns trigger language plpgsql
set search_path = 'public', 'pg_temp'
as $$
begin
  if (select c.evento_id from public.evento_convidado c where c.id = new.convidado_id)
     is distinct from
     (select b.evento_id from public.evento_bloco b where b.id = new.bloco_id)
  then
    raise exception 'evento_convidado_checkin: bloco nao e do evento do convidado'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger trg_evento_convidado_checkin_deriva
  before insert or update on public.evento_convidado_checkin
  for each row execute function public.fn_evento_convidado_checkin_deriva();
create trigger trg_audit_evento_convidado_checkin
  after insert or update or delete on public.evento_convidado_checkin
  for each row execute function public.fn_evento_audit_log();

alter table public.evento_convidado_checkin enable row level security;
create policy evento_convidado_checkin_escopada on public.evento_convidado_checkin
  for all using (
    exists (select 1 from public.evento_convidado c
             where c.id = convidado_id
               and (is_admin() or c.unidade_id in (select get_user_unidade_ids())))
  ) with check (
    exists (select 1 from public.evento_convidado c
             where c.id = convidado_id
               and (is_admin() or c.unidade_id in (select get_user_unidade_ids())))
  );

-- a cota e por PARTICIPANTE, contando so CORTESIAS: constraint trigger no COMMIT
-- (lote insere varios de uma vez). Vendidos nao entram na conta — sao da M9.
create or replace function public.fn_evento_convidado_cortesia()
returns trigger language plpgsql
set search_path = 'public', 'pg_temp'
as $$
declare
  v_limite integer;
  v_total  integer;
begin
  select e.cortesias_por_aluno
    into v_limite
    from public.evento_participacao p
    join public.evento e on e.id = p.evento_id
   where p.id = new.participacao_id;

  if v_limite is null then
    return null;  -- unidade ainda nao definiu a cota
  end if;

  select count(*) into v_total
    from public.evento_convidado_participacao cp
    join public.evento_convidado c on c.id = cp.convidado_id
   where cp.participacao_id = new.participacao_id
     and c.tipo_entrada = 'cortesia';

  if v_total > v_limite then
    raise exception 'Este aluno ja chegou a cota de % cortesias — o restante e ingresso vendido.',
      v_limite using errcode = 'P0001';
  end if;
  return null;
end;
$$;
create constraint trigger trg_evento_convidado_cortesia
  after insert on public.evento_convidado_participacao
  deferrable initially deferred
  for each row execute function public.fn_evento_convidado_cortesia();
