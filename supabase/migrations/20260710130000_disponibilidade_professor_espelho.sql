-- Disponibilidade continua oficial no Emusys. LA Report mantem o espelho e a trilha de propostas.

create or replace function public.fn_disponibilidade_professor_valida(p_disponibilidade jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_dia record;
  v_inicio time;
  v_fim time;
begin
  if p_disponibilidade is null or jsonb_typeof(p_disponibilidade) <> 'object' then
    return false;
  end if;

  for v_dia in select key, value from jsonb_each(p_disponibilidade)
  loop
    if not (
         v_dia.key in (
           'Segunda', 'Segunda-feira',
           'Terca', 'Terca-feira',
           'Quarta', 'Quarta-feira',
           'Quinta', 'Quinta-feira',
           'Sexta', 'Sexta-feira',
           'Sabado', 'Sabado-feira',
           'Domingo'
         )
         or encode(convert_to(v_dia.key, 'UTF8'), 'hex') in (
           '546572c3a761',
           '546572c3a7612d6665697261',
           '53c3a16261646f',
           '53c3a16261646f2d6665697261'
         )
       )
       or jsonb_typeof(v_dia.value) <> 'object'
       or not (v_dia.value ? 'inicio')
       or not (v_dia.value ? 'fim')
       or (v_dia.value ->> 'inicio') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or (v_dia.value ->> 'fim') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      return false;
    end if;

    v_inicio := (v_dia.value ->> 'inicio')::time;
    v_fim := (v_dia.value ->> 'fim')::time;
    if v_inicio >= v_fim then
      return false;
    end if;
  end loop;

  return true;
exception
  when others then
    return false;
end;
$$;

revoke all on function public.fn_disponibilidade_professor_valida(jsonb) from public, anon;

create table if not exists public.disponibilidade_professor_propostas (
  id uuid primary key default gen_random_uuid(),
  professor_id integer not null references public.professores(id),
  unidade_id uuid not null references public.unidades(id),
  professores_unidade_id integer not null references public.professores_unidades(id),
  disponibilidade_vigente jsonb not null,
  disponibilidade_proposta jsonb not null,
  status text not null default 'pendente_aprovacao' check (status in (
    'pendente_aprovacao',
    'aprovada_aguardando_emusys',
    'rejeitada',
    'efetivada'
  )),
  versao integer not null,
  proposto_por_auth_user_id uuid not null,
  decidido_por_usuario_id integer references public.usuarios(id),
  decidido_em timestamptz,
  motivo_decisao text,
  efetivado_por_usuario_id integer references public.usuarios(id),
  efetivado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint disponibilidade_professor_propostas_versao_uq
    unique (professor_id, unidade_id, versao),
  constraint disponibilidade_professor_propostas_payload_check
    check (
      public.fn_disponibilidade_professor_valida(disponibilidade_vigente)
      and public.fn_disponibilidade_professor_valida(disponibilidade_proposta)
    )
);

create unique index if not exists disponibilidade_professor_proposta_ativa_uq
  on public.disponibilidade_professor_propostas (professor_id, unidade_id)
  where status in ('pendente_aprovacao', 'aprovada_aguardando_emusys');

create index if not exists idx_disponibilidade_propostas_unidade_status
  on public.disponibilidade_professor_propostas (unidade_id, status, created_at desc);

drop trigger if exists set_updated_at_disponibilidade_professor_propostas
  on public.disponibilidade_professor_propostas;
create trigger set_updated_at_disponibilidade_professor_propostas
  before update on public.disponibilidade_professor_propostas
  for each row execute function public.set_updated_at();

alter table public.disponibilidade_professor_propostas enable row level security;

drop policy if exists disponibilidade_propostas_leitura on public.disponibilidade_professor_propostas;
create policy disponibilidade_propostas_leitura
  on public.disponibilidade_professor_propostas
  for select
  to authenticated
  using (
    professor_id = public.fn_professor_do_usuario()
    or public.is_admin()
    or public.usuario_tem_permissao(
      (select u.id from public.usuarios u where u.auth_user_id = auth.uid() limit 1),
      'professores.ver',
      unidade_id
    )
  );

revoke insert, update, delete on table public.disponibilidade_professor_propostas
  from anon, authenticated;
grant select on table public.disponibilidade_professor_propostas to authenticated;

create or replace function public.app_propor_disponibilidade(
  p_unidade_id uuid,
  p_disponibilidade jsonb
)
returns public.disponibilidade_professor_propostas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_professor_id integer := public.fn_professor_do_usuario();
  v_vinculo public.professores_unidades%rowtype;
  v_versao integer;
  v_resultado public.disponibilidade_professor_propostas%rowtype;
begin
  if v_professor_id is null then
    raise exception 'sem_professor_vinculado' using errcode = '42501';
  end if;

  if not public.fn_disponibilidade_professor_valida(p_disponibilidade) then
    raise exception 'disponibilidade_invalida';
  end if;

  select * into v_vinculo
  from public.professores_unidades
  where professor_id = v_professor_id
    and unidade_id = p_unidade_id;

  if not found then
    raise exception 'professor_sem_vinculo_na_unidade' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(v_professor_id, hashtext(p_unidade_id::text));

  if exists (
    select 1
    from public.disponibilidade_professor_propostas
    where professor_id = v_professor_id
      and unidade_id = p_unidade_id
      and status in ('pendente_aprovacao', 'aprovada_aguardando_emusys')
  ) then
    raise exception 'ja_existe_proposta_ativa';
  end if;

  select coalesce(max(versao), 0) + 1 into v_versao
  from public.disponibilidade_professor_propostas
  where professor_id = v_professor_id
    and unidade_id = p_unidade_id;

  insert into public.disponibilidade_professor_propostas (
    professor_id,
    unidade_id,
    professores_unidade_id,
    disponibilidade_vigente,
    disponibilidade_proposta,
    versao,
    proposto_por_auth_user_id
  ) values (
    v_professor_id,
    p_unidade_id,
    v_vinculo.id,
    coalesce(v_vinculo.disponibilidade, '{}'::jsonb),
    p_disponibilidade,
    v_versao,
    auth.uid()
  )
  returning * into v_resultado;

  return v_resultado;
end;
$$;

revoke all on function public.app_propor_disponibilidade(uuid, jsonb) from public, anon;
grant execute on function public.app_propor_disponibilidade(uuid, jsonb) to authenticated;

create or replace function public.admin_decidir_proposta_disponibilidade(
  p_proposta_id uuid,
  p_decisao text,
  p_motivo text default null
)
returns public.disponibilidade_professor_propostas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id integer;
  v_proposta public.disponibilidade_professor_propostas%rowtype;
begin
  if p_decisao not in ('aprovar', 'rejeitar') then
    raise exception 'decisao_invalida';
  end if;

  if p_decisao = 'rejeitar' and length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'motivo_obrigatorio_para_rejeicao';
  end if;

  select id into v_usuario_id
  from public.usuarios
  where auth_user_id = auth.uid()
    and coalesce(ativo, true)
  limit 1;

  select * into v_proposta
  from public.disponibilidade_professor_propostas
  where id = p_proposta_id
  for update;

  if not found then
    raise exception 'proposta_nao_encontrada';
  end if;

  if v_usuario_id is null
     or not public.usuario_tem_permissao(v_usuario_id, 'professores.editar', v_proposta.unidade_id) then
    raise exception 'sem_permissao_para_decidir' using errcode = '42501';
  end if;

  if v_proposta.status <> 'pendente_aprovacao' then
    raise exception 'proposta_ja_decidida';
  end if;

  update public.disponibilidade_professor_propostas
  set
    status = case p_decisao
      when 'aprovar' then 'aprovada_aguardando_emusys'
      else 'rejeitada'
    end,
    decidido_por_usuario_id = v_usuario_id,
    decidido_em = now(),
    motivo_decisao = nullif(btrim(coalesce(p_motivo, '')), '')
  where id = v_proposta.id
  returning * into v_proposta;

  return v_proposta;
end;
$$;

revoke all on function public.admin_decidir_proposta_disponibilidade(uuid, text, text)
  from public, anon;
grant execute on function public.admin_decidir_proposta_disponibilidade(uuid, text, text)
  to authenticated;

create or replace function public.admin_efetivar_proposta_disponibilidade(
  p_proposta_id uuid,
  p_confirmacao_emusys boolean default false
)
returns public.disponibilidade_professor_propostas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id integer;
  v_proposta public.disponibilidade_professor_propostas%rowtype;
begin
  if not p_confirmacao_emusys then
    raise exception 'confirme_a_operacao_no_emusys';
  end if;

  select id into v_usuario_id
  from public.usuarios
  where auth_user_id = auth.uid()
    and coalesce(ativo, true)
  limit 1;

  select * into v_proposta
  from public.disponibilidade_professor_propostas
  where id = p_proposta_id
  for update;

  if not found then
    raise exception 'proposta_nao_encontrada';
  end if;

  if v_usuario_id is null
     or not public.usuario_tem_permissao(v_usuario_id, 'professores.editar', v_proposta.unidade_id) then
    raise exception 'sem_permissao_para_efetivar' using errcode = '42501';
  end if;

  if v_proposta.status <> 'aprovada_aguardando_emusys' then
    raise exception 'proposta_nao_aguarda_emusys';
  end if;

  update public.professores_unidades
  set disponibilidade = v_proposta.disponibilidade_proposta
  where id = v_proposta.professores_unidade_id
    and professor_id = v_proposta.professor_id
    and unidade_id = v_proposta.unidade_id;

  if not found then
    raise exception 'vinculo_professor_unidade_nao_encontrado';
  end if;

  update public.disponibilidade_professor_propostas
  set
    status = 'efetivada',
    efetivado_por_usuario_id = v_usuario_id,
    efetivado_em = now()
  where id = v_proposta.id
  returning * into v_proposta;

  return v_proposta;
end;
$$;

revoke all on function public.admin_efetivar_proposta_disponibilidade(uuid, boolean)
  from public, anon;
grant execute on function public.admin_efetivar_proposta_disponibilidade(uuid, boolean)
  to authenticated;

create or replace view public.vw_disponibilidade_professores
with (security_invoker = true)
as
select
  pu.id as professores_unidade_id,
  pu.professor_id,
  p.nome as professor_nome,
  pu.unidade_id,
  u.nome as unidade_nome,
  coalesce(pu.disponibilidade, '{}'::jsonb) as disponibilidade,
  pu.emusys_id,
  pu.validacao_status,
  pu.last_seen_em,
  proposta.id as proposta_ativa_id,
  proposta.status as proposta_status,
  proposta.disponibilidade_proposta
from public.professores_unidades pu
join public.professores p on p.id = pu.professor_id
join public.unidades u on u.id = pu.unidade_id
left join lateral (
  select dp.id, dp.status, dp.disponibilidade_proposta
  from public.disponibilidade_professor_propostas dp
  where dp.professor_id = pu.professor_id
    and dp.unidade_id = pu.unidade_id
    and dp.status in ('pendente_aprovacao', 'aprovada_aguardando_emusys')
  order by dp.created_at desc
  limit 1
) proposta on true
where p.ativo = true;

grant select on table public.vw_disponibilidade_professores to authenticated;

comment on table public.disponibilidade_professor_propostas is
  'Propostas de disponibilidade. Aprovar nao altera o espelho; efetivar exige confirmacao da operacao no Emusys.';
comment on view public.vw_disponibilidade_professores is
  'Espelho operacional da disponibilidade oficial mantida no Emusys, sem contato ou financeiro.';
