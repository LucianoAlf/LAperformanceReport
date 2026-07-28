-- Migra o envio manual do Caixa financeiro para a fila Sol/Hermes nativa.
-- Objetivo: botão "Enviar WhatsApp" do Caixa não depender mais de UAZAPI/WAHA.

alter table public.fila_relatorios_sol_hermes
  add column if not exists referencia_tabela text,
  add column if not exists referencia_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_fila_sol_hermes_referencia
  on public.fila_relatorios_sol_hermes (referencia_tabela, referencia_id)
  where referencia_id is not null;

create or replace function public.sol_hermes_caixa_validate(
  p_caixa_diario_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caixa record;
  v_grupo record;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Nao autenticado');
  end if;

  select c.id, c.unidade_id, c.data_caixa, c.status, c.saldo_final_conferido,
         u.nome as unidade_nome, u.codigo as unidade_codigo
    into v_caixa
  from public.caixas_diarios c
  join public.unidades u on u.id = c.unidade_id
  where c.id = p_caixa_diario_id;

  if v_caixa.id is null then
    return jsonb_build_object('success', false, 'error', 'Caixa diario nao encontrado.');
  end if;

  select id, nome_grupo, grupo_jid, ativo
    into v_grupo
  from public.caixa_financeiro_grupos_whatsapp
  where unidade_id = v_caixa.unidade_id
    and ativo = true
  limit 1;

  if v_grupo.id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'Grupo financeiro nao configurado para esta unidade.',
      'unidade', v_caixa.unidade_nome
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'dry_run', true,
    'caixaId', v_caixa.id,
    'unidade', v_caixa.unidade_nome,
    'dataCaixa', v_caixa.data_caixa,
    'statusCaixa', v_caixa.status,
    'caixaFechado', v_caixa.status = 'fechado',
    'saldoConferido', v_caixa.saldo_final_conferido,
    'grupo', v_grupo.nome_grupo,
    'destino', v_grupo.grupo_jid,
    'note', 'Validado para rota Sol/Hermes. Nenhuma mensagem foi enviada.'
  );
end;
$$;

create or replace function public.sol_hermes_caixa_enqueue(
  p_caixa_diario_id uuid,
  p_texto text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caixa record;
  v_grupo record;
  v_texto text := btrim(coalesce(p_texto, ''));
  v_rows int := 0;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Nao autenticado');
  end if;

  select c.id, c.unidade_id, c.data_caixa, c.status, c.saldo_final_conferido,
         c.fechado_por, c.aberto_por,
         u.nome as unidade_nome, u.codigo as unidade_codigo
    into v_caixa
  from public.caixas_diarios c
  join public.unidades u on u.id = c.unidade_id
  where c.id = p_caixa_diario_id;

  if v_caixa.id is null then
    return jsonb_build_object('success', false, 'error', 'Caixa diario nao encontrado.');
  end if;

  if v_caixa.status <> 'fechado' then
    return jsonb_build_object('success', false, 'error', 'Feche o caixa antes de enviar o relatorio ao financeiro.');
  end if;

  if v_caixa.saldo_final_conferido is null then
    return jsonb_build_object('success', false, 'error', 'Informe o saldo final conferido antes de enviar.');
  end if;

  if length(v_texto) < 20 then
    return jsonb_build_object('success', false, 'error', 'Texto do relatorio de caixa invalido.');
  end if;

  select id, nome_grupo, grupo_jid, ativo
    into v_grupo
  from public.caixa_financeiro_grupos_whatsapp
  where unidade_id = v_caixa.unidade_id
    and ativo = true
  limit 1;

  if v_grupo.id is null then
    return jsonb_build_object('success', false, 'error', 'Grupo financeiro nao configurado para esta unidade.');
  end if;

  insert into public.fila_relatorios_sol_hermes (
    tipo_relatorio,
    origem,
    unidade_id,
    unidade_nome,
    jid,
    grupo_nome,
    texto,
    status,
    agendada_para,
    data_dia,
    erro,
    tentativas,
    referencia_tabela,
    referencia_id,
    metadata
  )
  select
    'caixa_financeiro',
    'manual_caixa',
    v_caixa.unidade_id,
    v_caixa.unidade_nome,
    v_grupo.grupo_jid,
    v_grupo.nome_grupo,
    v_texto,
    'sol_pendente',
    now(),
    v_caixa.data_caixa,
    'manual:caixa_financeiro:' || v_caixa.data_caixa::text,
    0,
    'caixas_diarios',
    v_caixa.id,
    jsonb_build_object(
      'caixa_diario_id', v_caixa.id,
      'data_caixa', v_caixa.data_caixa,
      'unidade_codigo', v_caixa.unidade_codigo,
      'fechado_por', coalesce(v_caixa.fechado_por, v_caixa.aberto_por),
      'rota', 'sol_hermes_native'
    )
  where not exists (
    select 1
    from public.fila_relatorios_sol_hermes f
    where f.tipo_relatorio = 'caixa_financeiro'
      and f.unidade_id = v_caixa.unidade_id
      and f.jid = v_grupo.grupo_jid
      and f.data_dia = v_caixa.data_caixa
      and f.status in ('sol_pendente', 'sol_enviando', 'enviada')
  );

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return jsonb_build_object(
      'success', true,
      'queued', 0,
      'skipped', 'already_queued_or_sent',
      'status', 'sol_pendente',
      'grupo', v_grupo.nome_grupo,
      'destino', v_grupo.grupo_jid,
      'note', 'Caixa ja estava enfileirado/enviado hoje para este grupo.'
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'queued', v_rows,
    'status', 'sol_pendente',
    'grupo', v_grupo.nome_grupo,
    'destino', v_grupo.grupo_jid,
    'note', 'Caixa enfileirado para envio pela Sol/Hermes nativo.'
  );
end;
$$;

create or replace function public.sync_caixa_envio_from_fila_sol_hermes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tipo_relatorio <> 'caixa_financeiro'
     or new.referencia_tabela <> 'caixas_diarios'
     or new.referencia_id is null then
    return new;
  end if;

  if new.status = 'enviada' then
    update public.caixas_diarios c
       set ultimo_envio_whatsapp_em = coalesce(new.enviada_em, now()),
           ultimo_envio_whatsapp_por = coalesce(c.fechado_por, c.aberto_por),
           ultimo_envio_whatsapp_status = 'enviado',
           ultimo_envio_whatsapp_erro = null
     where c.id = new.referencia_id;
  elsif new.status = 'erro' then
    update public.caixas_diarios c
       set ultimo_envio_whatsapp_em = coalesce(new.ultima_tentativa_em, now()),
           ultimo_envio_whatsapp_por = coalesce(c.fechado_por, c.aberto_por),
           ultimo_envio_whatsapp_status = 'erro',
           ultimo_envio_whatsapp_erro = coalesce(new.erro, 'Erro no envio Sol/Hermes')
     where c.id = new.referencia_id;
  end if;

  return new;
end;
$$;

drop trigger if exists tr_sync_caixa_envio_from_fila_sol_hermes on public.fila_relatorios_sol_hermes;
create trigger tr_sync_caixa_envio_from_fila_sol_hermes
after update of status, enviada_em, erro, message_id on public.fila_relatorios_sol_hermes
for each row
execute function public.sync_caixa_envio_from_fila_sol_hermes();

revoke all on function public.sol_hermes_caixa_validate(uuid) from public;
revoke all on function public.sol_hermes_caixa_enqueue(uuid, text) from public;
grant execute on function public.sol_hermes_caixa_validate(uuid) to authenticated;
grant execute on function public.sol_hermes_caixa_enqueue(uuid, text) to authenticated;
