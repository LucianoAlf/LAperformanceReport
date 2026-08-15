-- Corrige o cast do token varchar no retorno text da RPC.
create or replace function public.ficha_emitir_token(
  p_colaborador_id integer,
  p_criado_por integer
)
returns table(
  token text,
  cargo_contexto text,
  ja_existia boolean,
  ja_respondeu boolean,
  criado_em timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_colaborador public.colaboradores%rowtype;
  v_cargo text;
  v_token public.ficha_tokens%rowtype;
  v_respondeu boolean;
  v_slug text;
  v_novo_token text;
  v_criado_em timestamptz;
begin
  if p_colaborador_id is null then
    raise exception using errcode = '22023', message = 'COLABORADOR_ID_INVALIDO';
  end if;

  if p_criado_por is null then
    raise exception using errcode = '22023', message = 'CRIADO_POR_INVALIDO';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('ficha_emitir_token:' || p_colaborador_id::text, 0)
  );

  select c.* into v_colaborador
  from public.colaboradores c
  where c.id = p_colaborador_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'COLABORADOR_NAO_ENCONTRADO';
  end if;

  if lower(btrim(coalesce(v_colaborador.situacao, ''))) = 'desligado' then
    raise exception using errcode = 'P0003', message = 'COLABORADOR_INATIVO';
  end if;

  case lower(btrim(coalesce(v_colaborador.departamento, '')))
    when 'professores' then v_cargo := 'PROFESSOR';
    when 'atendimento' then v_cargo := 'ATENDIMENTO';
    else
      raise exception using errcode = 'P0001', message = 'DEPARTAMENTO_SEM_CENARIOS';
  end case;

  select t.* into v_token
  from public.ficha_tokens t
  where t.colaborador_id = p_colaborador_id and t.ativo
  order by t.criado_em
  limit 1;

  if found then
    return query select v_token.token::text, v_cargo, true,
      v_token.usado_em is not null, v_token.criado_em;
    return;
  end if;

  select exists (
    select 1 from public.ficha_tokens t
    where t.colaborador_id = p_colaborador_id and t.usado_em is not null
  ) into v_respondeu;

  if v_respondeu then
    return query select null::text, v_cargo, false, true, null::timestamptz;
    return;
  end if;

  v_slug := nullif(regexp_replace(
    public.unaccent_imutavel(split_part(btrim(v_colaborador.nome), ' ', 1)),
    '[^a-zA-Z]', '', 'g'
  ), '');
  v_novo_token := coalesce(v_slug, 'ficha') || '-' ||
    substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);

  insert into public.ficha_tokens (
    token, colaborador_id, cargo_contexto, criado_por, ativo
  ) values (
    v_novo_token, p_colaborador_id, v_cargo, p_criado_por, true
  ) returning criado_em into v_criado_em;

  return query select v_novo_token, v_cargo, false, false, v_criado_em;
end;
$$;

revoke all on function public.ficha_emitir_token(integer, integer) from public, anon, authenticated;
grant execute on function public.ficha_emitir_token(integer, integer) to service_role;
