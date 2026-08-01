-- Claim atomico e transicoes auditaveis da pesquisa de evasao.
-- Esta migration e aditiva e nao atribui usuarios, assinaturas ou templates.

alter table public.pesquisa_evasao_previews
  add column if not exists aluno_id integer,
  add column if not exists aluno_nome_snapshot text,
  add column if not exists destinatario_nome_snapshot text,
  add column if not exists publico_template_snapshot text,
  add column if not exists curso_nome_snapshot text,
  add column if not exists professor_nome_snapshot text,
  add column if not exists tempo_permanencia_meses_snapshot integer,
  add column if not exists data_evasao_snapshot date,
  add column if not exists motivo_cadastrado_snapshot text,
  add column if not exists assinatura_nome_snapshot text,
  add column if not exists template_versao integer,
  add column if not exists pesquisa_evasao_id uuid,
  add column if not exists envio_status_tentativa text,
  add column if not exists provider_message_id_tentativa text,
  add column if not exists envio_erro_sanitizado_tentativa text,
  add column if not exists envio_iniciado_em timestamptz,
  add column if not exists envio_finalizado_em timestamptz;

alter table public.pesquisa_evasao_previews
  drop constraint if exists pesquisa_evasao_previews_pesquisa_id_fkey,
  add constraint pesquisa_evasao_previews_pesquisa_id_fkey
    foreign key (pesquisa_evasao_id)
    references public.pesquisa_evasao(id);

alter table public.pesquisa_evasao_previews
  drop constraint if exists pesquisa_evasao_previews_publico_template_check,
  add constraint pesquisa_evasao_previews_publico_template_check
    check (
      publico_template_snapshot is null
      or publico_template_snapshot in ('direto', 'responsavel')
    );

alter table public.pesquisa_evasao_previews
  drop constraint if exists pesquisa_evasao_previews_envio_status_tentativa_check,
  add constraint pesquisa_evasao_previews_envio_status_tentativa_check
    check (
      envio_status_tentativa is null
      or envio_status_tentativa in (
        'enviando',
        'incerto',
        'enviado',
        'falhou',
        'bloqueado'
      )
    );

alter table public.pesquisa_evasao
  add column if not exists envio_erro_sanitizado text;

-- Recriar pelo nome canonico tambem repara um indice homonimo com definicao
-- incorreta. A criacao falha fechada se os dados violarem a unicidade esperada.
drop index if exists public.pesquisa_evasao_templates_publico_ativo_uidx;
create unique index pesquisa_evasao_templates_publico_ativo_uidx
  on public.pesquisa_evasao_templates (publico)
  where ativo;

create or replace function public.pesquisa_evasao_claim_snapshot(
  p_pesquisa_id uuid,
  p_deve_despachar boolean,
  p_preview_id uuid
)
returns table (
  pesquisa_id uuid,
  preview_id uuid,
  evasao_id integer,
  aluno_id integer,
  unidade_id uuid,
  modo_teste boolean,
  destinatario_tipo text,
  aluno_nome text,
  aluno_curso text,
  aluno_professor text,
  tempo_permanencia_meses integer,
  data_evasao date,
  motivo_cadastrado text,
  telefone_destino text,
  mensagem_renderizada text,
  caixa_id integer,
  idempotency_key uuid,
  envio_status text,
  provider_message_id text,
  executado_por_usuario_id integer,
  executado_por_auth_user_id uuid,
  assinatura_id uuid,
  assinatura_nome text,
  template_id uuid,
  template_versao integer,
  deve_despachar boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'PESQUISA_EVASAO_ACESSO_NEGADO'
      using errcode = '42501';
  end if;

  return query
  select
    pe.id,
    pp.id,
    pp.evasao_id,
    pp.aluno_id,
    pp.unidade_id,
    pp.modo_teste,
    pp.destinatario_tipo,
    pp.aluno_nome_snapshot,
    pp.curso_nome_snapshot,
    pp.professor_nome_snapshot,
    pp.tempo_permanencia_meses_snapshot,
    pp.data_evasao_snapshot,
    pp.motivo_cadastrado_snapshot,
    pp.telefone_destino,
    pp.mensagem_renderizada,
    pp.caixa_id,
    pp.idempotency_key,
    pp.envio_status_tentativa,
    pp.provider_message_id_tentativa,
    pp.usuario_id,
    pp.auth_user_id,
    pp.assinatura_id,
    pp.assinatura_nome_snapshot,
    pp.template_id,
    pp.template_versao,
    p_deve_despachar
  from public.pesquisa_evasao pe
  join public.pesquisa_evasao_previews pp
    on pp.id = p_preview_id
   and pp.pesquisa_evasao_id = pe.id
  where pe.id = p_pesquisa_id;
end;
$function$;

create or replace function public.claim_pesquisa_evasao_preview(
  p_preview_id uuid,
  p_auth_user_id uuid
)
returns table (
  pesquisa_id uuid,
  preview_id uuid,
  evasao_id integer,
  aluno_id integer,
  unidade_id uuid,
  modo_teste boolean,
  destinatario_tipo text,
  aluno_nome text,
  aluno_curso text,
  aluno_professor text,
  tempo_permanencia_meses integer,
  data_evasao date,
  motivo_cadastrado text,
  telefone_destino text,
  mensagem_renderizada text,
  caixa_id integer,
  idempotency_key uuid,
  envio_status text,
  provider_message_id text,
  executado_por_usuario_id integer,
  executado_por_auth_user_id uuid,
  assinatura_id uuid,
  assinatura_nome text,
  template_id uuid,
  template_versao integer,
  deve_despachar boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_preview public.pesquisa_evasao_previews%rowtype;
  v_existente public.pesquisa_evasao%rowtype;
  v_pesquisa_id uuid;
  v_operador_nome text;
  v_stale_antes timestamptz := clock_timestamp() - interval '15 minutes';
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'PESQUISA_EVASAO_ACESSO_NEGADO'
      using errcode = '42501';
  end if;

  -- O lock da preview torna o consumo por preview_id linearizavel.
  select pp.*
  into v_preview
  from public.pesquisa_evasao_previews pp
  where pp.id = p_preview_id
  for update;

  if not found then
    raise exception 'PESQUISA_EVASAO_PREVIEW_NAO_ENCONTRADA'
      using errcode = 'P0002';
  end if;

  -- Ownership vem antes da expiracao para nao revelar metadata de outro autor.
  if v_preview.auth_user_id is distinct from p_auth_user_id then
    raise exception 'PESQUISA_EVASAO_PREVIEW_AUTOR_INVALIDO'
      using errcode = '42501';
  end if;

  if v_preview.consumido_em is not null then
    select pe.*
    into v_existente
    from public.pesquisa_evasao pe
    where pe.id = v_preview.pesquisa_evasao_id
    for update;

    if not found then
      raise exception 'PESQUISA_EVASAO_PREVIEW_CONSUMIDA_SEM_PESQUISA'
        using errcode = 'P0001';
    end if;

    if v_existente.preview_id = v_preview.id
       and v_preview.envio_status_tentativa = 'enviando'
       and v_existente.envio_status = 'enviando'
       and v_existente.envio_iniciado_em < v_stale_antes then
      update public.pesquisa_evasao pe
      set envio_status = 'incerto',
          envio_erro_sanitizado =
            'Dispatch sem conclusao persistida dentro do TTL operacional',
          updated_at = clock_timestamp()
      where pe.id = v_existente.id;

      update public.pesquisa_evasao_previews pp
      set envio_status_tentativa = 'incerto',
          provider_message_id_tentativa = null,
          envio_erro_sanitizado_tentativa =
            'Dispatch sem conclusao persistida dentro do TTL operacional',
          envio_finalizado_em = clock_timestamp()
      where pp.id = v_preview.id
        and pp.pesquisa_evasao_id = v_existente.id;
    end if;

    return query
    select *
    from public.pesquisa_evasao_claim_snapshot(
      v_existente.id,
      false,
      v_preview.id
    );
    return;
  end if;

  if v_preview.expira_em <= clock_timestamp() then
    raise exception 'PESQUISA_EVASAO_PREVIEW_EXPIRADA'
      using errcode = '22023';
  end if;

  if v_preview.unidade_id is null
     or v_preview.aluno_id is null
     or v_preview.data_evasao_snapshot is null
     or v_preview.caixa_id is null
     or nullif(btrim(v_preview.aluno_nome_snapshot), '') is null
     or nullif(btrim(v_preview.destinatario_nome_snapshot), '') is null
     or v_preview.publico_template_snapshot not in ('direto', 'responsavel')
     or nullif(btrim(v_preview.assinatura_nome_snapshot), '') is null
     or v_preview.template_versao is null
     or v_preview.template_versao <= 0
     or nullif(btrim(v_preview.telefone_destino), '') is null
     or nullif(btrim(v_preview.mensagem_renderizada), '') is null then
    raise exception 'PESQUISA_EVASAO_PREVIEW_SNAPSHOT_INCOMPLETO'
      using errcode = '22023';
  end if;

  select u.nome
  into v_operador_nome
  from public.usuarios u
  where u.id = v_preview.usuario_id
    and u.auth_user_id = v_preview.auth_user_id
    and u.ativo = true;

  if nullif(btrim(v_operador_nome), '') is null then
    raise exception 'PESQUISA_EVASAO_OPERADOR_INATIVO'
      using errcode = '42501';
  end if;

  if v_preview.modo_teste then
    -- Teste e producao possuem namespaces de lock distintos.
    perform pg_advisory_xact_lock(
      hashtextextended(
        'pesquisa_evasao:teste:' ||
        v_preview.evasao_id::text || ':' ||
        v_preview.telefone_destino,
        0
      )
    );

    select pe.*
    into v_existente
    from public.pesquisa_evasao pe
    where pe.evasao_id = v_preview.evasao_id
      and pe.modo_teste = true
      and pe.telefone_destino_snapshot = v_preview.telefone_destino
      and pe.envio_status in ('enviando', 'incerto')
    order by pe.created_at desc, pe.id desc
    limit 1
    for update;

    if found then
      if v_existente.envio_status = 'enviando'
         and v_existente.envio_iniciado_em < v_stale_antes then
        update public.pesquisa_evasao pe
        set envio_status = 'incerto',
            envio_erro_sanitizado =
              'Dispatch sem conclusao persistida dentro do TTL operacional',
            updated_at = clock_timestamp()
        where pe.id = v_existente.id;

        update public.pesquisa_evasao_previews pp
        set envio_status_tentativa = 'incerto',
            provider_message_id_tentativa = null,
            envio_erro_sanitizado_tentativa =
              'Dispatch sem conclusao persistida dentro do TTL operacional',
            envio_finalizado_em = clock_timestamp()
        where pp.id = v_existente.preview_id
          and pp.pesquisa_evasao_id = v_existente.id;
      end if;

      update public.pesquisa_evasao_previews pp
      set consumido_em = clock_timestamp(),
          pesquisa_evasao_id = v_existente.id,
          envio_status_tentativa = 'bloqueado',
          provider_message_id_tentativa = null,
          envio_erro_sanitizado_tentativa =
            'Slot logico ocupado por tentativa anterior',
          envio_finalizado_em = clock_timestamp()
      where pp.id = v_preview.id
        and pp.consumido_em is null;

      if not found then
        raise exception 'PESQUISA_EVASAO_PREVIEW_CONSUMO_CONCORRENTE'
          using errcode = '40001';
      end if;

      return query
      select *
      from public.pesquisa_evasao_claim_snapshot(
        v_existente.id,
        false,
        v_preview.id
      );
      return;
    end if;
  else
    perform pg_advisory_xact_lock(
      hashtextextended(
        'pesquisa_evasao:producao:' || v_preview.evasao_id::text,
        0
      )
    );

    select pe.*
    into v_existente
    from public.pesquisa_evasao pe
    where pe.evasao_id = v_preview.evasao_id
      and pe.modo_teste = false
    for update;

    if found then
      if v_existente.envio_status = 'enviando'
         and v_existente.envio_iniciado_em < v_stale_antes then
        update public.pesquisa_evasao pe
        set envio_status = 'incerto',
            envio_erro_sanitizado =
              'Dispatch sem conclusao persistida dentro do TTL operacional',
            updated_at = clock_timestamp()
        where pe.id = v_existente.id;

        update public.pesquisa_evasao_previews pp
        set envio_status_tentativa = 'incerto',
            provider_message_id_tentativa = null,
            envio_erro_sanitizado_tentativa =
              'Dispatch sem conclusao persistida dentro do TTL operacional',
            envio_finalizado_em = clock_timestamp()
        where pp.id = v_existente.preview_id
          and pp.pesquisa_evasao_id = v_existente.id;

        v_existente.envio_status := 'incerto';
      end if;

      if not (
        v_existente.envio_status in ('nao_enviado', 'falhou')
        and v_existente.resposta_status = 'sem_resposta'
        and v_existente.status in (
          'pendente',
          'falha_envio',
          'sem_whatsapp'
        )
      ) then
        update public.pesquisa_evasao_previews pp
        set consumido_em = clock_timestamp(),
            pesquisa_evasao_id = v_existente.id,
            envio_status_tentativa = 'bloqueado',
            provider_message_id_tentativa = null,
            envio_erro_sanitizado_tentativa =
              'Slot logico ocupado por tentativa anterior',
            envio_finalizado_em = clock_timestamp()
        where pp.id = v_preview.id
          and pp.consumido_em is null;

        if not found then
          raise exception 'PESQUISA_EVASAO_PREVIEW_CONSUMO_CONCORRENTE'
            using errcode = '40001';
        end if;

        return query
        select *
        from public.pesquisa_evasao_claim_snapshot(
          v_existente.id,
          false,
          v_preview.id
        );
        return;
      end if;
    end if;
  end if;

  update public.pesquisa_evasao_previews pp
  set consumido_em = clock_timestamp(),
      envio_status_tentativa = 'enviando',
      provider_message_id_tentativa = null,
      envio_erro_sanitizado_tentativa = null,
      envio_iniciado_em = clock_timestamp(),
      envio_finalizado_em = null
  where pp.id = v_preview.id
    and pp.consumido_em is null;

  if not found then
    raise exception 'PESQUISA_EVASAO_PREVIEW_CONSUMO_CONCORRENTE'
      using errcode = '40001';
  end if;

  if v_preview.modo_teste then
    insert into public.pesquisa_evasao (
      evasao_id,
      aluno_id,
      unidade_id,
      aluno_nome,
      aluno_telefone,
      aluno_curso,
      aluno_professor,
      tempo_permanencia_meses,
      data_evasao,
      motivo_cadastrado,
      status,
      enviado_em,
      enviado_por,
      envio_status,
      resposta_status,
      modo_teste,
      telefone_destino_snapshot,
      caixa_id,
      executado_por_usuario_id,
      executado_por_auth_user_id,
      assinatura_id,
      assinatura_nome_snapshot,
      template_id,
      template_versao,
      mensagem_renderizada,
      provider_message_id,
      mensagem_uazapi_id,
      preview_id,
      idempotency_key,
      envio_iniciado_em,
      envio_erro_sanitizado
    )
    values (
      v_preview.evasao_id,
      v_preview.aluno_id,
      v_preview.unidade_id,
      v_preview.aluno_nome_snapshot,
      v_preview.telefone_destino,
      v_preview.curso_nome_snapshot,
      v_preview.professor_nome_snapshot,
      greatest(0, coalesce(v_preview.tempo_permanencia_meses_snapshot, 0)),
      v_preview.data_evasao_snapshot,
      v_preview.motivo_cadastrado_snapshot,
      'pendente',
      null,
      v_operador_nome,
      'enviando',
      'sem_resposta',
      true,
      v_preview.telefone_destino,
      v_preview.caixa_id,
      v_preview.usuario_id,
      v_preview.auth_user_id,
      v_preview.assinatura_id,
      v_preview.assinatura_nome_snapshot,
      v_preview.template_id,
      v_preview.template_versao,
      v_preview.mensagem_renderizada,
      null,
      null,
      v_preview.id,
      v_preview.idempotency_key,
      clock_timestamp(),
      null
    )
    returning id into v_pesquisa_id;
  elsif v_existente.id is not null then
    update public.pesquisa_evasao pe
    set aluno_id = v_preview.aluno_id,
        unidade_id = v_preview.unidade_id,
        aluno_nome = v_preview.aluno_nome_snapshot,
        aluno_telefone = v_preview.telefone_destino,
        aluno_curso = v_preview.curso_nome_snapshot,
        aluno_professor = v_preview.professor_nome_snapshot,
        tempo_permanencia_meses =
          greatest(0, coalesce(v_preview.tempo_permanencia_meses_snapshot, 0)),
        data_evasao = v_preview.data_evasao_snapshot,
        motivo_cadastrado = v_preview.motivo_cadastrado_snapshot,
        status = 'pendente',
        enviado_em = null,
        enviado_por = v_operador_nome,
        envio_status = 'enviando',
        resposta_status = 'sem_resposta',
        modo_teste = false,
        telefone_destino_snapshot = v_preview.telefone_destino,
        caixa_id = v_preview.caixa_id,
        executado_por_usuario_id = v_preview.usuario_id,
        executado_por_auth_user_id = v_preview.auth_user_id,
        assinatura_id = v_preview.assinatura_id,
        assinatura_nome_snapshot = v_preview.assinatura_nome_snapshot,
        template_id = v_preview.template_id,
        template_versao = v_preview.template_versao,
        mensagem_renderizada = v_preview.mensagem_renderizada,
        provider_message_id = null,
        mensagem_uazapi_id = null,
        preview_id = v_preview.id,
        idempotency_key = v_preview.idempotency_key,
        envio_iniciado_em = clock_timestamp(),
        envio_erro_sanitizado = null,
        updated_at = clock_timestamp()
    where pe.id = v_existente.id
    returning pe.id into v_pesquisa_id;
  else
    insert into public.pesquisa_evasao (
      evasao_id,
      aluno_id,
      unidade_id,
      aluno_nome,
      aluno_telefone,
      aluno_curso,
      aluno_professor,
      tempo_permanencia_meses,
      data_evasao,
      motivo_cadastrado,
      status,
      enviado_em,
      enviado_por,
      envio_status,
      resposta_status,
      modo_teste,
      telefone_destino_snapshot,
      caixa_id,
      executado_por_usuario_id,
      executado_por_auth_user_id,
      assinatura_id,
      assinatura_nome_snapshot,
      template_id,
      template_versao,
      mensagem_renderizada,
      provider_message_id,
      mensagem_uazapi_id,
      preview_id,
      idempotency_key,
      envio_iniciado_em,
      envio_erro_sanitizado
    )
    values (
      v_preview.evasao_id,
      v_preview.aluno_id,
      v_preview.unidade_id,
      v_preview.aluno_nome_snapshot,
      v_preview.telefone_destino,
      v_preview.curso_nome_snapshot,
      v_preview.professor_nome_snapshot,
      greatest(0, coalesce(v_preview.tempo_permanencia_meses_snapshot, 0)),
      v_preview.data_evasao_snapshot,
      v_preview.motivo_cadastrado_snapshot,
      'pendente',
      null,
      v_operador_nome,
      'enviando',
      'sem_resposta',
      false,
      v_preview.telefone_destino,
      v_preview.caixa_id,
      v_preview.usuario_id,
      v_preview.auth_user_id,
      v_preview.assinatura_id,
      v_preview.assinatura_nome_snapshot,
      v_preview.template_id,
      v_preview.template_versao,
      v_preview.mensagem_renderizada,
      null,
      null,
      v_preview.id,
      v_preview.idempotency_key,
      clock_timestamp(),
      null
    )
    returning id into v_pesquisa_id;
  end if;

  update public.pesquisa_evasao_previews pp
  set pesquisa_evasao_id = v_pesquisa_id
  where pp.id = v_preview.id
    and pp.pesquisa_evasao_id is null;

  if not found then
    raise exception 'PESQUISA_EVASAO_PREVIEW_VINCULO_INCONSISTENTE'
      using errcode = 'P0001';
  end if;

  return query
  select *
  from public.pesquisa_evasao_claim_snapshot(
    v_pesquisa_id,
    true,
    v_preview.id
  );
end;
$function$;

do $legacy_registrar$
begin
  if to_regprocedure(
    'public.registrar_resultado_pesquisa_evasao_envio(uuid,uuid,text,text,text)'
  ) is not null then
    execute
      'revoke all on function ' ||
      'public.registrar_resultado_pesquisa_evasao_envio(' ||
      'uuid,uuid,text,text,text) from public, anon, authenticated, ' ||
      'mila_acesso_restrito, sol_acesso_restrito, fabio_agent, ' ||
      'lia_acesso_restrito, service_role';
  end if;
end;
$legacy_registrar$;

drop function if exists public.registrar_resultado_pesquisa_evasao_envio(
  uuid,
  uuid,
  text,
  text,
  text
);

create or replace function public.registrar_resultado_pesquisa_evasao_envio(
  p_pesquisa_id uuid,
  p_preview_id uuid,
  p_idempotency_key uuid,
  p_auth_user_id uuid,
  p_resultado text,
  p_provider_message_id text,
  p_erro_sanitizado text
)
returns table (
  pesquisa_id uuid,
  envio_status text,
  provider_message_id text,
  enviado_em timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_pesquisa public.pesquisa_evasao%rowtype;
  v_preview public.pesquisa_evasao_previews%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'PESQUISA_EVASAO_ACESSO_NEGADO'
      using errcode = '42501';
  end if;

  if p_resultado not in ('enviado', 'falhou', 'incerto') then
    raise exception 'PESQUISA_EVASAO_RESULTADO_INVALIDO'
      using errcode = '22023';
  end if;

  -- Mesma ordem do claim: a tentativa exata e travada antes do cabecalho.
  select pp.*
  into v_preview
  from public.pesquisa_evasao_previews pp
  where pp.id = p_preview_id
    and pp.idempotency_key = p_idempotency_key
    and pp.auth_user_id = p_auth_user_id
  for update;

  if not found then
    raise exception 'PESQUISA_EVASAO_TENTATIVA_STALE'
      using errcode = 'P0001';
  end if;

  select pe.*
  into v_pesquisa
  from public.pesquisa_evasao pe
  where pe.id = p_pesquisa_id
    and pe.preview_id = p_preview_id
    and pe.idempotency_key = p_idempotency_key
    and pe.executado_por_auth_user_id = p_auth_user_id
  for update;

  if not found
     or v_preview.pesquisa_evasao_id is distinct from p_pesquisa_id
     or v_preview.envio_status_tentativa is distinct from
       v_pesquisa.envio_status then
    raise exception 'PESQUISA_EVASAO_TENTATIVA_STALE'
      using errcode = 'P0001';
  end if;

  if p_resultado = 'enviado' then
    if nullif(btrim(p_provider_message_id), '') is null then
      raise exception 'PESQUISA_EVASAO_PROVIDER_MESSAGE_ID_OBRIGATORIO'
        using errcode = '22023';
    end if;

    if v_pesquisa.envio_status = 'enviado'
       and v_pesquisa.provider_message_id is distinct from
         p_provider_message_id then
      raise exception 'PESQUISA_EVASAO_TRANSICAO_INVALIDA'
        using errcode = '22023';
    end if;

    if v_pesquisa.envio_status not in ('enviando', 'incerto', 'enviado') then
      raise exception 'PESQUISA_EVASAO_TRANSICAO_INVALIDA'
        using errcode = '22023';
    end if;

    update public.pesquisa_evasao pe
    set envio_status = 'enviado',
        status = 'enviado',
        provider_message_id = p_provider_message_id,
        mensagem_uazapi_id = p_provider_message_id,
        enviado_em = coalesce(pe.enviado_em, clock_timestamp()),
        envio_erro_sanitizado = null,
        updated_at = clock_timestamp()
    where pe.id = v_pesquisa.id
      and pe.preview_id = v_preview.id
      and pe.idempotency_key = v_preview.idempotency_key;

    update public.pesquisa_evasao_previews pp
    set envio_status_tentativa = 'enviado',
        provider_message_id_tentativa = p_provider_message_id,
        envio_erro_sanitizado_tentativa = null,
        envio_finalizado_em = clock_timestamp()
    where pp.id = v_preview.id
      and pp.idempotency_key = v_preview.idempotency_key
      and pp.pesquisa_evasao_id = v_pesquisa.id;
  elsif p_resultado = 'falhou' then
    if nullif(btrim(p_erro_sanitizado), '') is null then
      raise exception 'PESQUISA_EVASAO_ERRO_SANITIZADO_OBRIGATORIO'
        using errcode = '22023';
    end if;

    if v_pesquisa.envio_status not in ('enviando', 'incerto', 'falhou') then
      raise exception 'PESQUISA_EVASAO_TRANSICAO_INVALIDA'
        using errcode = '22023';
    end if;

    update public.pesquisa_evasao pe
    set envio_status = 'falhou',
        status = 'falha_envio',
        provider_message_id = null,
        mensagem_uazapi_id = null,
        enviado_em = null,
        envio_erro_sanitizado = left(btrim(p_erro_sanitizado), 200),
        updated_at = clock_timestamp()
    where pe.id = v_pesquisa.id
      and pe.preview_id = v_preview.id
      and pe.idempotency_key = v_preview.idempotency_key;

    update public.pesquisa_evasao_previews pp
    set envio_status_tentativa = 'falhou',
        provider_message_id_tentativa = null,
        envio_erro_sanitizado_tentativa =
          left(btrim(p_erro_sanitizado), 200),
        envio_finalizado_em = clock_timestamp()
    where pp.id = v_preview.id
      and pp.idempotency_key = v_preview.idempotency_key
      and pp.pesquisa_evasao_id = v_pesquisa.id;
  else
    if v_pesquisa.envio_status not in ('enviando', 'incerto') then
      raise exception 'PESQUISA_EVASAO_TRANSICAO_INVALIDA'
        using errcode = '22023';
    end if;

    update public.pesquisa_evasao pe
    set envio_status = 'incerto',
        status = 'pendente',
        provider_message_id = null,
        mensagem_uazapi_id = null,
        enviado_em = null,
        envio_erro_sanitizado =
          'Resultado ambiguo; reconciliacao humana obrigatoria',
        updated_at = clock_timestamp()
    where pe.id = v_pesquisa.id
      and pe.preview_id = v_preview.id
      and pe.idempotency_key = v_preview.idempotency_key;

    update public.pesquisa_evasao_previews pp
    set envio_status_tentativa = 'incerto',
        provider_message_id_tentativa = null,
        envio_erro_sanitizado_tentativa =
          'Resultado ambiguo; reconciliacao humana obrigatoria',
        envio_finalizado_em = clock_timestamp()
    where pp.id = v_preview.id
      and pp.idempotency_key = v_preview.idempotency_key
      and pp.pesquisa_evasao_id = v_pesquisa.id;
  end if;

  return query
  select
    pe.id,
    pe.envio_status,
    pe.provider_message_id,
    pe.enviado_em
  from public.pesquisa_evasao pe
  where pe.id = v_pesquisa.id;
end;
$function$;

create or replace function public.confirmar_resultado_pesquisa_evasao_envio(
  p_pesquisa_id uuid,
  p_preview_id uuid,
  p_idempotency_key uuid,
  p_auth_user_id uuid,
  p_provider_message_id text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'PESQUISA_EVASAO_ACESSO_NEGADO'
      using errcode = '42501';
  end if;

  if nullif(btrim(p_provider_message_id), '') is null then
    return false;
  end if;

  return exists (
    select 1
    from public.pesquisa_evasao_previews pp
    join public.pesquisa_evasao pe
      on pe.id = p_pesquisa_id
     and pe.preview_id = pp.id
     and pe.idempotency_key = pp.idempotency_key
    where pp.id = p_preview_id
      and pp.idempotency_key = p_idempotency_key
      and pp.auth_user_id = p_auth_user_id
      and pp.pesquisa_evasao_id = p_pesquisa_id
      and pp.envio_status_tentativa = 'enviado'
      and pp.provider_message_id_tentativa = p_provider_message_id
      and pe.executado_por_auth_user_id = p_auth_user_id
      and pe.envio_status = 'enviado'
      and pe.provider_message_id = p_provider_message_id
  );
end;
$function$;

revoke all on function public.pesquisa_evasao_claim_snapshot(
  uuid,
  boolean,
  uuid
)
  from public, anon, authenticated, mila_acesso_restrito, sol_acesso_restrito,
       fabio_agent, lia_acesso_restrito;
grant execute on function public.pesquisa_evasao_claim_snapshot(
  uuid,
  boolean,
  uuid
)
  to service_role;

revoke all on function public.claim_pesquisa_evasao_preview(uuid, uuid)
  from public, anon, authenticated, mila_acesso_restrito, sol_acesso_restrito,
       fabio_agent, lia_acesso_restrito;
grant execute on function public.claim_pesquisa_evasao_preview(uuid, uuid)
  to service_role;

revoke all on function public.registrar_resultado_pesquisa_evasao_envio(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text
) from public, anon, authenticated, mila_acesso_restrito, sol_acesso_restrito,
       fabio_agent, lia_acesso_restrito;
grant execute on function public.registrar_resultado_pesquisa_evasao_envio(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text
) to service_role;

revoke all on function public.confirmar_resultado_pesquisa_evasao_envio(
  uuid,
  uuid,
  uuid,
  uuid,
  text
) from public, anon, authenticated, mila_acesso_restrito, sol_acesso_restrito,
       fabio_agent, lia_acesso_restrito;
grant execute on function public.confirmar_resultado_pesquisa_evasao_envio(
  uuid,
  uuid,
  uuid,
  uuid,
  text
) to service_role;

comment on function public.claim_pesquisa_evasao_preview(uuid, uuid) is
  'Consome preview uma unica vez, serializa o slot logico e retorna snapshot imutavel. Estado enviando antigo vira incerto e nunca autoriza novo dispatch.';

comment on function public.registrar_resultado_pesquisa_evasao_envio(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text
) is
  'Finaliza ou reconcilia atomicamente o cabecalho e o snapshot da tentativa atual, sem alterar a idempotency_key.';

comment on function public.confirmar_resultado_pesquisa_evasao_envio(
  uuid,
  uuid,
  uuid,
  uuid,
  text
) is
  'Confirma atomicamente se a tentativa exata ficou enviada com o mesmo comprovante do provider.';
