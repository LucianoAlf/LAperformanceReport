-- Lia / Fase B: permitir repetir o piloto controlado no mesmo dia.
--
-- A unicidade diária pertence ao resumo produtivo por operador. O piloto usa
-- ambiente=teste, idempotency_key por pesquisa e destino governado do Alf; a
-- constraint ampla impedia validar uma correção com uma segunda pesquisa de
-- teste no mesmo dia. Mantemos a trava produtiva como índice único parcial.

do $guard$
begin
  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.lia_followup_resumos'::regclass
      and constraint_row.conname =
        'lia_followup_resumos_operador_usuario_id_ambiente_data_cort_key'
      and constraint_row.contype = 'u'
  ) then
    raise exception
      'constraint_diaria_followup_esperada_nao_encontrada';
  end if;
end;
$guard$;

alter table public.lia_followup_resumos
  drop constraint lia_followup_resumos_operador_usuario_id_ambiente_data_cort_key;

create unique index lia_followup_resumos_producao_operador_data_uidx
  on public.lia_followup_resumos (operador_usuario_id, data_corte_brt)
  where ambiente = 'producao';

comment on index public.lia_followup_resumos_producao_operador_data_uidx is
  'Garante um resumo produtivo diário por operador; testes permanecem isolados pela idempotency_key por pesquisa.';

create or replace function public.produzir_lia_resumos_followup_72h(
  p_agora timestamptz default clock_timestamp()
)
returns table (
  resumos_criados integer,
  casos_vinculados integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_hora_local time;
  v_data_local date;
  v_operador record;
  v_resumo_id uuid;
  v_destino public.lia_destinos_privados%rowtype;
  v_usuario_ativo boolean;
  v_alertas_liberados boolean;
  v_total integer;
  v_mensagem text;
  v_status text;
  v_motivo text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;

  resumos_criados := 0;
  casos_vinculados := 0;

  select
    config.followup_72h_liberado,
    config.alertas_producao_liberados
  into strict v_usuario_ativo, v_alertas_liberados
  from public.lia_alertas_configuracao config
  where config.id = 1;

  if not v_usuario_ativo then
    return next;
    return;
  end if;

  v_hora_local := (p_agora at time zone 'America/Sao_Paulo')::time;
  v_data_local := (p_agora at time zone 'America/Sao_Paulo')::date;

  if v_hora_local < time '09:00' or v_hora_local >= time '09:01' then
    return next;
    return;
  end if;

  for v_operador in
    select distinct estado.operador_usuario_id
    from public.fn_pesquisa_evasao_followup_estado(p_agora) estado
    where estado.followup_pendente
      and estado.operador_usuario_id is not null
      and not exists (
        select 1
        from public.lia_followup_resumo_itens item
        where item.pesquisa_id = estado.pesquisa_id
          and item.ambiente = 'producao'
      )
    order by estado.operador_usuario_id
  loop
    insert into public.lia_followup_resumos (
      ambiente,
      operador_usuario_id,
      data_corte_brt,
      total_casos,
      idempotency_key
    ) values (
      'producao',
      v_operador.operador_usuario_id,
      v_data_local,
      1,
      format(
        'followup_3d_operador:%s:%s',
        v_operador.operador_usuario_id,
        to_char(v_data_local, 'YYYYMMDD')
      )
    )
    on conflict (idempotency_key) do nothing
    returning id into v_resumo_id;

    if v_resumo_id is null then
      continue;
    end if;

    insert into public.lia_followup_resumo_itens (
      resumo_id,
      pesquisa_id,
      ambiente,
      vencido_em_snapshot,
      interacao_nao_substantiva_snapshot
    )
    select
      v_resumo_id,
      estado.pesquisa_id,
      'producao',
      estado.vencido_em,
      estado.interagiu_sem_resposta_valida
    from public.fn_pesquisa_evasao_followup_estado(p_agora) estado
    where estado.followup_pendente
      and estado.operador_usuario_id = v_operador.operador_usuario_id
      and not exists (
        select 1
        from public.lia_followup_resumo_itens item
        where item.pesquisa_id = estado.pesquisa_id
          and item.ambiente = 'producao'
      )
    on conflict (pesquisa_id, ambiente) do nothing;

    get diagnostics v_total = row_count;

    if v_total = 0 then
      delete from public.lia_followup_resumos where id = v_resumo_id;
      continue;
    end if;

    update public.lia_followup_resumos
    set total_casos = v_total
    where id = v_resumo_id;

    select usuario.ativo
    into v_usuario_ativo
    from public.usuarios usuario
    where usuario.id = v_operador.operador_usuario_id;

    select destino.*
    into v_destino
    from public.lia_destinos_privados destino
    where destino.usuario_id = v_operador.operador_usuario_id
      and destino.canal = 'whatsapp'
      and destino.ativo;

    v_mensagem := public.fn_lia_renderizar_resumo_followup(v_resumo_id);

    if v_usuario_ativo is distinct from true then
      v_status := 'fila_administrativa';
      v_motivo := 'operador_inativo_ou_ausente';
    elsif v_destino.id is null then
      v_status := 'fila_administrativa';
      v_motivo := 'destino_ausente_ou_alterado';
    elsif v_alertas_liberados then
      v_status := 'pendente';
      v_motivo := null;
    else
      v_status := 'aguardando_liberacao';
      v_motivo := null;
    end if;

    insert into public.lia_alertas_privados (
      followup_resumo_id,
      destinatario_usuario_id,
      destino_id,
      destino_snapshot,
      template_codigo,
      template_versao,
      mensagem_renderizada,
      status,
      motivo_pendencia,
      caixa_id
    ) values (
      v_resumo_id,
      v_operador.operador_usuario_id,
      case when v_status = 'fila_administrativa' then null else v_destino.id end,
      case when v_status = 'fila_administrativa' then null else v_destino.destino_normalizado end,
      'lia_evasao_followup_3d_resumo',
      1,
      case when v_status = 'fila_administrativa' then null else v_mensagem end,
      v_status,
      v_motivo,
      3
    );

    resumos_criados := resumos_criados + 1;
    casos_vinculados := casos_vinculados + v_total;
  end loop;

  return next;
end;
$function$;
