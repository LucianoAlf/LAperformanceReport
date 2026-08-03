-- Adapta a outbox da Lia ao dispatcher Edge sem liberar produção.
-- Esta migration não cria eventos, não envia WhatsApp e não toca no webhook.

do $preflight$
declare
  v_caixa_nome text;
  v_caixa_ativa boolean;
begin
  select nome, ativo
  into v_caixa_nome, v_caixa_ativa
  from public.whatsapp_caixas
  where id = 3;

  if not found then
    raise exception 'lia_caixa_3_inexistente';
  end if;

  if v_caixa_ativa is distinct from true then
    raise exception 'lia_caixa_3_inativa';
  end if;

  if v_caixa_nome is distinct from 'Lia - Sucesso do Aluno' then
    raise exception 'lia_caixa_3_nome_invalido';
  end if;
end;
$preflight$;

alter table public.lia_alertas_privados
  add column caixa_id integer;

update public.lia_alertas_privados
set caixa_id = 3
where caixa_id is null;

alter table public.lia_alertas_privados
  alter column caixa_id set default 3,
  alter column caixa_id set not null;

alter table public.lia_alertas_privados
  add constraint lia_alertas_privados_caixa_id_fkey
  foreign key (caixa_id) references public.whatsapp_caixas(id);

comment on column public.lia_alertas_privados.caixa_id is
  'Caixa de saída auditada. Fase A usa exclusivamente whatsapp_caixas.id=3.';

-- O tipo de retorno muda para incluir a caixa auditada; por isso as duas
-- funções são recriadas na ordem de dependência.
drop function public.claim_lia_alerta_privado(uuid, uuid);
drop function public.fn_lia_claim_alerta_privado_em(uuid, uuid, timestamptz);

create function public.fn_lia_claim_alerta_privado_em(
  p_worker_id uuid,
  p_alerta_id uuid,
  p_agora timestamptz
)
returns table (
  alerta_id uuid,
  claim_token uuid,
  destino text,
  mensagem text,
  evento_tipo text,
  ambiente text,
  caixa_id integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;

  if not public.fn_lia_janela_envio_permitida(p_agora) then
    return;
  end if;

  update public.lia_alertas_privados alerta
  set status = 'fila_administrativa',
      motivo_pendencia = 'processamento_abandonado',
      destino_id = null,
      destino_snapshot = null,
      mensagem_renderizada = null,
      worker_id = null,
      claim_token = null,
      atualizado_em = p_agora
  where alerta.status = 'processando'
    and alerta.claimed_em < p_agora - interval '15 minutes';

  update public.lia_alertas_privados alerta
  set status = 'fila_administrativa',
      motivo_pendencia = case
        when usuario.ativo is distinct from true then 'operador_inativo_ou_ausente'
        else 'destino_ausente_ou_alterado'
      end,
      destino_id = null,
      destino_snapshot = null,
      mensagem_renderizada = null,
      atualizado_em = p_agora
  from public.lia_pesquisa_eventos evento
  left join public.usuarios usuario
    on usuario.id = evento.operador_usuario_id
  where alerta.evento_id = evento.id
    and alerta.status = 'pendente'
    and (p_alerta_id is null or alerta.id = p_alerta_id)
    and not exists (
      select 1
      from public.lia_destinos_privados destino
      where usuario.ativo = true
        and destino.id = alerta.destino_id
        and destino.usuario_id = alerta.destinatario_usuario_id
        and destino.canal = 'whatsapp'
        and destino.ativo
        and destino.destino_normalizado = alerta.destino_snapshot
    );

  return query
  with candidato as (
    select alerta.id
    from public.lia_alertas_privados alerta
    join public.lia_pesquisa_eventos evento
      on evento.id = alerta.evento_id
    join public.usuarios usuario
      on usuario.id = alerta.destinatario_usuario_id
     and usuario.ativo = true
    join public.lia_destinos_privados destino
      on destino.id = alerta.destino_id
     and destino.usuario_id = alerta.destinatario_usuario_id
     and destino.canal = 'whatsapp'
     and destino.ativo
     and destino.destino_normalizado = alerta.destino_snapshot
    where alerta.status = 'pendente'
      and alerta.caixa_id = 3
      and (p_alerta_id is null or alerta.id = p_alerta_id)
    order by alerta.criado_em, alerta.id
    for update of alerta skip locked
    limit 1
  ), atualizado as (
    update public.lia_alertas_privados alerta
    set status = 'processando',
        tentativas = alerta.tentativas + 1,
        worker_id = p_worker_id,
        claim_token = gen_random_uuid(),
        claimed_em = p_agora,
        atualizado_em = p_agora
    from candidato
    where alerta.id = candidato.id
    returning alerta.*
  )
  select
    atualizado.id,
    atualizado.claim_token,
    atualizado.destino_snapshot,
    atualizado.mensagem_renderizada,
    evento.tipo,
    evento.ambiente,
    atualizado.caixa_id
  from atualizado
  join public.lia_pesquisa_eventos evento
    on evento.id = atualizado.evento_id;
end;
$function$;

create function public.claim_lia_alerta_privado(
  p_worker_id uuid,
  p_alerta_id uuid default null
)
returns table (
  alerta_id uuid,
  claim_token uuid,
  destino text,
  mensagem text,
  evento_tipo text,
  ambiente text,
  caixa_id integer
)
language sql
security definer
set search_path = public, pg_temp
as $function$
  select *
  from public.fn_lia_claim_alerta_privado_em(
    p_worker_id,
    p_alerta_id,
    clock_timestamp()
  );
$function$;

revoke all on function public.fn_lia_claim_alerta_privado_em(
  uuid, uuid, timestamptz
) from public, anon, authenticated;
revoke all on function public.claim_lia_alerta_privado(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.fn_lia_claim_alerta_privado_em(
  uuid, uuid, timestamptz
) to service_role;
grant execute on function public.claim_lia_alerta_privado(uuid, uuid)
  to service_role;

create or replace function public.falhar_lia_alerta_privado(
  p_alerta_id uuid,
  p_claim_token uuid,
  p_erro_codigo text,
  p_resultado_ambiguo boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;

  if p_erro_codigo not in (
    'provider_timeout',
    'provider_conexao_encerrada',
    'provider_json_invalido',
    'provider_confirmacao_ambigua',
    'provider_rejeitado',
    'provider_http',
    'provider_configuracao',
    'provider_interno'
  ) then
    raise exception 'erro_codigo_invalido';
  end if;

  update public.lia_alertas_privados
  set status = case
        when p_resultado_ambiguo then 'resultado_ambiguo'
        else 'falha'
      end,
      erro_codigo = p_erro_codigo,
      worker_id = null,
      claim_token = null,
      atualizado_em = now()
  where id = p_alerta_id
    and status = 'processando'
    and claim_token = p_claim_token;

  return found;
end;
$function$;

-- Defesa explícita: o contrato continua exclusivo do backend.
revoke all on function public.falhar_lia_alerta_privado(uuid, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.falhar_lia_alerta_privado(uuid, uuid, text, boolean)
  to service_role;

do $postflight$
begin
  if exists (
    select 1
    from public.lia_alertas_privados
    where caixa_id <> 3
  ) then
    raise exception 'lia_alerta_caixa_divergente';
  end if;

  if coalesce((
    select alertas_producao_liberados
    from public.lia_alertas_configuracao
    where id = 1
  ), true) then
    raise exception 'lia_alertas_producao_nao_podem_ser_liberados';
  end if;
end;
$postflight$;
