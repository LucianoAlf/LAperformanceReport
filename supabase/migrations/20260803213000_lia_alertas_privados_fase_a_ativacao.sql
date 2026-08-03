-- Lia / Fase A: ativacao assistida apos aceite explicito do piloto.
-- O segredo e provisionado manualmente no Vault e nunca entra neste arquivo.
-- A migration apenas libera a outbox produtiva e agenda um claim por minuto.

do $activation$
declare
  v_secret_count integer;
  v_config_count integer;
  v_aguardando integer;
  v_liberadas integer;
  v_administrativas integer;
  v_job record;
  v_job_id bigint;
begin
  select count(*)
  into v_secret_count
  from vault.decrypted_secrets
  where name = 'lia_alertas_service_role_key'
    and nullif(btrim(decrypted_secret), '') is not null;

  if v_secret_count <> 1 then
    raise exception 'lia_alertas_service_role_key_required';
  end if;

  select count(*)
  into v_config_count
  from public.lia_alertas_configuracao
  where id = 1
    and alertas_producao_liberados = false;

  if v_config_count <> 1 then
    raise exception 'lia_alertas_configuracao_bloqueada_required';
  end if;

  select count(*)
  into v_aguardando
  from public.lia_alertas_privados alerta
  join public.lia_pesquisa_eventos evento
    on evento.id = alerta.evento_id
  where alerta.status = 'aguardando_liberacao'
    and evento.ambiente = 'producao';

  update public.lia_alertas_privados alerta
  set status = 'pendente',
      motivo_pendencia = null,
      atualizado_em = now()
  from public.lia_pesquisa_eventos evento,
       public.usuarios usuario,
       public.lia_destinos_privados destino
  where alerta.evento_id = evento.id
    and alerta.status = 'aguardando_liberacao'
    and evento.ambiente = 'producao'
    and usuario.id = evento.operador_usuario_id
    and usuario.ativo = true
    and alerta.destinatario_usuario_id = evento.operador_usuario_id
    and alerta.caixa_id = 3
    and alerta.tentativas = 0
    and alerta.provider_message_id is null
    and alerta.mensagem_renderizada is not null
    and destino.id = alerta.destino_id
    and destino.usuario_id = evento.operador_usuario_id
    and destino.canal = 'whatsapp'
    and destino.ativo = true
    and destino.destino_normalizado = alerta.destino_snapshot;

  get diagnostics v_liberadas = row_count;

  update public.lia_alertas_privados alerta
  set status = 'fila_administrativa',
      motivo_pendencia = case
        when evento.operador_usuario_id is null
          or not exists (
            select 1
            from public.usuarios usuario
            where usuario.id = evento.operador_usuario_id
              and usuario.ativo = true
          ) then 'operador_inativo_ou_ausente'
        when alerta.destinatario_usuario_id is distinct from evento.operador_usuario_id
          then 'destinatario_divergente'
        when alerta.caixa_id is distinct from 3
          then 'caixa_divergente'
        when alerta.tentativas <> 0 or alerta.provider_message_id is not null
          then 'entrega_preprocessada'
        when alerta.mensagem_renderizada is null
          then 'mensagem_ausente'
        when not exists (
          select 1
          from public.lia_destinos_privados destino
          where destino.id = alerta.destino_id
            and destino.usuario_id = evento.operador_usuario_id
            and destino.canal = 'whatsapp'
            and destino.ativo = true
            and destino.destino_normalizado = alerta.destino_snapshot
        ) then 'destino_ausente_ou_alterado'
        else 'ativacao_rejeitada'
      end,
      atualizado_em = now()
  from public.lia_pesquisa_eventos evento
  where alerta.evento_id = evento.id
    and alerta.status = 'aguardando_liberacao'
    and evento.ambiente = 'producao';

  get diagnostics v_administrativas = row_count;

  if v_liberadas + v_administrativas <> v_aguardando then
    raise exception 'lia_alertas_reavaliacao_incompleta';
  end if;

  update public.lia_alertas_configuracao
  set alertas_producao_liberados = true,
      atualizado_em = now()
  where id = 1
    and alertas_producao_liberados = false;

  get diagnostics v_config_count = row_count;

  if v_config_count <> 1 then
    raise exception 'lia_alertas_configuracao_ativacao_failed';
  end if;

  for v_job in
    select jobid
    from cron.job
    where jobname = 'lia-alertas-privados-dispatcher-minuto'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  select cron.schedule(
    'lia-alertas-privados-dispatcher-minuto',
    '* * * * *',
    $cron$
      select net.http_post(
        url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/processar-alertas-lia',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'lia_alertas_service_role_key'
          ),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000
      );
    $cron$
  ) into v_job_id;

  if v_job_id is null then
    raise exception 'lia_alertas_cron_schedule_failed';
  end if;

  raise notice
    'lia_alertas_ativados: aguardando=%, liberadas=%, fila_administrativa=%, cron_job_id=%',
    v_aguardando,
    v_liberadas,
    v_administrativas,
    v_job_id;
end;
$activation$;
