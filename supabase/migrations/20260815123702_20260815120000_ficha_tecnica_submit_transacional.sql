-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

begin;

alter table public.professor_perfil_testes
  add column if not exists ficha_token_id bigint;

do $$
begin
  alter table public.professor_perfil_testes
    add constraint professor_perfil_testes_ficha_token_id_fkey
    foreign key (ficha_token_id)
    references public.ficha_tokens(id)
    on delete set null;
exception
  when duplicate_object then null;
end;
$$;

create unique index if not exists uq_professor_perfil_testes_ficha_token
  on public.professor_perfil_testes (ficha_token_id)
  where ficha_token_id is not null;

create or replace function public.ficha_concluir_tecnica(
  p_token text,
  p_cargo_contexto text,
  p_versao_questionario integer,
  p_temperamento_primario text,
  p_temperamento_secundario text,
  p_temperamento_codinome text,
  p_temperamento_contagem jsonb,
  p_valorizacao_primaria text,
  p_valorizacao_secundaria text,
  p_valorizacao_contagem jsonb,
  p_valores_primario text,
  p_valores_secundario text,
  p_valores_sacrificado text,
  p_valores_contagem jsonb,
  p_respostas jsonb,
  p_fixos_count integer,
  p_desempates_count integer,
  p_bloco_b_count integer,
  p_bloco_d_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_token public.ficha_tokens%rowtype;
  v_colaborador public.colaboradores%rowtype;
  v_teste_id bigint;
  v_agora timestamptz := now();
  v_total_a integer;
  v_count_a integer;
  v_count_b integer;
  v_count_d integer;
begin
  if coalesce(btrim(p_token), '') = '' then
    raise exception 'FICHA_TOKEN_INVALIDO';
  end if;

  if p_fixos_count is null or p_fixos_count < 1
     or p_desempates_count is null or p_desempates_count < 0
     or p_bloco_b_count is null or p_bloco_b_count < 1
     or p_bloco_d_count is null or p_bloco_d_count < 1 then
    raise exception 'FICHA_CONFIGURACAO_INVALIDA';
  end if;

  v_total_a := p_fixos_count + p_desempates_count;

  select * into v_token
  from public.ficha_tokens
  where token = p_token
  for update;

  if not found or not v_token.ativo then
    raise exception 'FICHA_TOKEN_INVALIDO';
  end if;
  if v_token.usado_em is not null then
    raise exception 'FICHA_TOKEN_USADO';
  end if;
  if v_token.cargo_contexto is distinct from p_cargo_contexto then
    raise exception 'FICHA_CARGO_INCOMPATIVEL';
  end if;

  select * into v_colaborador
  from public.colaboradores
  where id = v_token.colaborador_id;
  if not found then
    raise exception 'FICHA_COLABORADOR_INEXISTENTE';
  end if;

  if jsonb_typeof(p_respostas) is distinct from 'array'
     or jsonb_array_length(p_respostas) <> v_total_a + p_bloco_b_count + p_bloco_d_count then
    raise exception 'FICHA_RESPOSTAS_INCOMPLETAS';
  end if;

  select
    count(*) filter (where r.bloco = 'A'),
    count(*) filter (where r.bloco = 'B'),
    count(*) filter (where r.bloco = 'D')
  into v_count_a, v_count_b, v_count_d
  from jsonb_to_recordset(p_respostas) as r(
    bloco text,
    pergunta_numero integer,
    opcao_canonica text,
    resposta_posicao integer
  );

  if v_count_a <> v_total_a or v_count_b <> p_bloco_b_count or v_count_d <> p_bloco_d_count then
    raise exception 'FICHA_RESPOSTAS_INCOMPLETAS';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_respostas) as r(
      bloco text,
      pergunta_numero integer,
      opcao_canonica text,
      resposta_posicao integer
    )
    where r.bloco is null
    or r.pergunta_numero is null
    or r.opcao_canonica is null
    or r.resposta_posicao is null
    or (r.bloco = 'A' and (
      r.pergunta_numero < 1 or r.pergunta_numero > v_total_a
      or r.opcao_canonica not in ('A', 'B', 'C', 'D')
      or r.resposta_posicao not between 0 and 3
    ))
    or (r.bloco = 'B' and (
      r.pergunta_numero < 1 or r.pergunta_numero > p_bloco_b_count
      or r.opcao_canonica not in ('PAL', 'TEM', 'APO', 'SIM', 'CEL')
      or r.resposta_posicao not between 0 and 1
    ))
    or (r.bloco = 'D' and (
      r.pergunta_numero < 1 or r.pergunta_numero > p_bloco_d_count
      or r.opcao_canonica not in ('COR', 'EMP', 'EXC', 'PAI')
      or r.resposta_posicao not between 0 and 1
    ))
    or r.bloco not in ('A', 'B', 'D')
  ) then
    raise exception 'FICHA_RESPOSTAS_INVALIDAS';
  end if;

  if exists (
    select r.bloco, r.pergunta_numero
    from jsonb_to_recordset(p_respostas) as r(
      bloco text,
      pergunta_numero integer,
      opcao_canonica text,
      resposta_posicao integer
    )
    group by r.bloco, r.pergunta_numero
    having count(*) > 1
  ) then
    raise exception 'FICHA_PERGUNTA_REPETIDA';
  end if;

  insert into public.professor_perfil_testes (
    colaborador_id,
    unidade_id,
    contexto,
    versao_questionario,
    cargo_contexto,
    evento_token,
    ficha_token_id,
    status,
    temperamento_primario,
    temperamento_secundario,
    temperamento_codinome,
    temperamento_contagem,
    valorizacao_primaria,
    valorizacao_secundaria,
    valorizacao_contagem,
    valores_primario,
    valores_secundario,
    valores_sacrificado,
    valores_contagem,
    concluido_em
  ) values (
    v_token.colaborador_id,
    v_colaborador.unidade_id,
    'COLAB',
    p_versao_questionario,
    p_cargo_contexto,
    p_token,
    v_token.id,
    'concluido',
    p_temperamento_primario,
    p_temperamento_secundario,
    p_temperamento_codinome,
    p_temperamento_contagem,
    p_valorizacao_primaria,
    p_valorizacao_secundaria,
    p_valorizacao_contagem,
    p_valores_primario,
    p_valores_secundario,
    p_valores_sacrificado,
    p_valores_contagem,
    v_agora
  )
  returning id into v_teste_id;

  insert into public.professor_perfil_respostas (
    teste_id,
    pergunta_numero,
    opcao_canonica,
    resposta_posicao,
    created_at,
    bloco
  )
  select
    v_teste_id,
    r.pergunta_numero,
    r.opcao_canonica,
    r.resposta_posicao,
    v_agora,
    r.bloco::char(1)
  from jsonb_to_recordset(p_respostas) as r(
    bloco text,
    pergunta_numero integer,
    opcao_canonica text,
    resposta_posicao integer
  );

  update public.colaboradores
  set temperamento_codinome = p_temperamento_codinome,
      valorizacao_codinome = p_valorizacao_primaria || '/' || p_valorizacao_secundaria,
      valores_codinome = p_valores_primario || '/' || p_valores_secundario
  where id = v_token.colaborador_id;

  update public.ficha_tokens
  set usado_em = v_agora
  where id = v_token.id
    and usado_em is null;
  if not found then
    raise exception 'FICHA_TOKEN_USADO';
  end if;

  return jsonb_build_object('teste_id', v_teste_id, 'concluido_em', v_agora);
end;
$function$;

revoke all on function public.ficha_concluir_tecnica(
  text, text, integer, text, text, text, jsonb, text, text, jsonb,
  text, text, text, jsonb, jsonb, integer, integer, integer, integer
) from public, anon, authenticated;

grant execute on function public.ficha_concluir_tecnica(
  text, text, integer, text, text, text, jsonb, text, text, jsonb,
  text, text, text, jsonb, jsonb, integer, integer, integer, integer
) to service_role;

commit;
