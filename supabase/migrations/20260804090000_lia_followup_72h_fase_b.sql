-- Lia / Fase B: fila de follow-up em 72 horas e resumo privado diario.
-- Esta migration e estrutural e nasce bloqueada. Nao cria cron, nao publica
-- Edge Function, nao envia WhatsApp e nao ativa follow-up automatico a familia.

alter table public.lia_alertas_configuracao
  add column if not exists followup_72h_liberado boolean not null default false;

create table public.pesquisa_evasao_followup_acoes (
  id uuid primary key default gen_random_uuid(),
  pesquisa_id uuid not null unique references public.pesquisa_evasao(id),
  acao text not null check (acao in ('realizado', 'dispensado')),
  canal text check (canal in ('whatsapp', 'telefone', 'outro')),
  observacao text check (observacao is null or char_length(observacao) <= 500),
  operador_usuario_id integer not null references public.usuarios(id),
  operador_auth_user_id uuid not null,
  registrado_em timestamptz not null default clock_timestamp(),
  criado_em timestamptz not null default clock_timestamp(),
  check (
    (acao = 'realizado' and canal is not null)
    or (acao = 'dispensado' and canal is null)
  )
);

create table public.lia_followup_resumos (
  id uuid primary key default gen_random_uuid(),
  ambiente text not null check (ambiente in ('producao', 'teste')),
  operador_usuario_id integer not null references public.usuarios(id),
  data_corte_brt date not null,
  total_casos integer not null check (total_casos > 0),
  idempotency_key text not null unique,
  criado_em timestamptz not null default clock_timestamp(),
  unique (operador_usuario_id, ambiente, data_corte_brt)
);

create table public.lia_followup_resumo_itens (
  resumo_id uuid not null references public.lia_followup_resumos(id),
  pesquisa_id uuid not null references public.pesquisa_evasao(id),
  ambiente text not null check (ambiente in ('producao', 'teste')),
  vencido_em_snapshot timestamptz not null,
  interacao_nao_substantiva_snapshot boolean not null,
  cancelado_em timestamptz,
  cancelamento_motivo text check (
    cancelamento_motivo is null
    or cancelamento_motivo in ('resposta_valida', 'opt_out', 'acao_manual')
  ),
  criado_em timestamptz not null default clock_timestamp(),
  primary key (resumo_id, pesquisa_id),
  unique (pesquisa_id, ambiente),
  check (
    (cancelado_em is null and cancelamento_motivo is null)
    or (cancelado_em is not null and cancelamento_motivo is not null)
  )
);

alter table public.lia_alertas_privados
  add column followup_resumo_id uuid unique
    references public.lia_followup_resumos(id);

alter table public.lia_alertas_privados
  alter column evento_id drop not null;

alter table public.lia_alertas_privados
  drop constraint if exists lia_alertas_privados_origem_chk,
  add constraint lia_alertas_privados_origem_chk
    check (num_nonnulls(evento_id, followup_resumo_id) = 1);

alter table public.lia_alertas_privados
  drop constraint if exists lia_alertas_privados_status_check,
  add constraint lia_alertas_privados_status_check check (status in (
    'aguardando_liberacao',
    'pendente',
    'processando',
    'enviado',
    'falha',
    'resultado_ambiguo',
    'fila_administrativa',
    'cancelado'
  ));

create index lia_followup_resumo_itens_pendentes_idx
  on public.lia_followup_resumo_itens (resumo_id, vencido_em_snapshot, pesquisa_id)
  where cancelado_em is null;

alter table public.pesquisa_evasao_followup_acoes enable row level security;
alter table public.lia_followup_resumos enable row level security;
alter table public.lia_followup_resumo_itens enable row level security;

revoke all on table public.pesquisa_evasao_followup_acoes
  from public, anon, authenticated;
revoke all on table public.lia_followup_resumos
  from public, anon, authenticated;
revoke all on table public.lia_followup_resumo_itens
  from public, anon, authenticated;

grant all on table public.pesquisa_evasao_followup_acoes to service_role;
grant all on table public.lia_followup_resumos to service_role;
grant all on table public.lia_followup_resumo_itens to service_role;

do $roles$
declare
  v_role text;
begin
  foreach v_role in array array[
    'fabio_agent',
    'lia_acesso_restrito',
    'mila_acesso_restrito',
    'sol_acesso_restrito',
    'maria_lareport_rpc',
    'ml_jobs'
  ] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format(
        'revoke all on table public.pesquisa_evasao_followup_acoes, public.lia_followup_resumos, public.lia_followup_resumo_itens from %I',
        v_role
      );
    end if;
  end loop;
end;
$roles$;

create or replace function public.fn_pesquisa_evasao_followup_estado(
  p_agora timestamptz default clock_timestamp()
)
returns table (
  pesquisa_id uuid,
  evasao_id integer,
  aluno_nome text,
  unidade_id uuid,
  unidade_nome text,
  enviado_em timestamptz,
  vencido_em timestamptz,
  operador_usuario_id integer,
  operador_nome text,
  estado_visivel text,
  followup_pendente boolean,
  interagiu_sem_resposta_valida boolean,
  alerta_enviado_em timestamptz,
  acao text,
  acao_canal text,
  acao_observacao text,
  acao_registrada_em timestamptz,
  acao_operador_nome text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
with base as (
  select
    pe.id as pesquisa_id,
    pe.evasao_id,
    coalesce(nullif(btrim(mov.aluno_nome), ''), pe.aluno_nome)::text as aluno_nome,
    pe.unidade_id,
    unidade.nome::text as unidade_nome,
    pe.enviado_em,
    pe.enviado_em + interval '72 hours' as vencido_em,
    pe.executado_por_usuario_id as operador_usuario_id,
    operador.nome::text as operador_nome,
    pe.modo_teste,
    pe.envio_status::text,
    pe.resposta_status::text,
    pe.resposta_valida,
    pe.opt_out_em,
    pe.conteudo_novo_desde_revisao,
    acao.acao,
    acao.canal as acao_canal,
    acao.observacao as acao_observacao,
    acao.registrado_em as acao_registrada_em,
    acao_operador.nome::text as acao_operador_nome,
    exists (
      select 1
      from public.pesquisa_evasao_mensagens mensagem
      where mensagem.pesquisa_id = pe.id
        and mensagem.direcao = 'entrada'
        and mensagem.resolution_status = 'resolvida'
        and mensagem.substantividade in ('abertura', 'adiamento', 'indeterminado')
    ) as interagiu_sem_resposta_valida,
    (
      select max(alerta.enviado_em)
      from public.lia_followup_resumo_itens item
      join public.lia_alertas_privados alerta
        on alerta.followup_resumo_id = item.resumo_id
       and alerta.status = 'enviado'
      where item.pesquisa_id = pe.id
        and item.ambiente = 'producao'
        and item.cancelado_em is null
    ) as alerta_enviado_em
  from public.pesquisa_evasao pe
  left join public.movimentacoes_admin mov on mov.id = pe.evasao_id
  join public.unidades unidade on unidade.id = pe.unidade_id
  left join public.usuarios operador on operador.id = pe.executado_por_usuario_id
  left join public.pesquisa_evasao_followup_acoes acao
    on acao.pesquisa_id = pe.id
  left join public.usuarios acao_operador
    on acao_operador.id = acao.operador_usuario_id
  where pe.envio_status in ('enviado', 'entregue', 'lido')
    and pe.enviado_em is not null
    and (
      auth.role() = 'service_role'
      or public.fn_pesquisa_evasao_usuario_interno_ativo()
    )
), classificada as (
  select
    base.*,
    (
      modo_teste = false
      and envio_status in ('enviado', 'entregue', 'lido')
      and enviado_em is not null
      and resposta_valida = false
      and opt_out_em is null
      and resposta_status <> 'recusada_opt_out'
      and acao is null
      and p_agora >= vencido_em
    ) as esta_pendente
  from base
)
select
  classificada.pesquisa_id,
  classificada.evasao_id,
  classificada.aluno_nome,
  classificada.unidade_id,
  classificada.unidade_nome,
  classificada.enviado_em,
  classificada.vencido_em,
  classificada.operador_usuario_id,
  classificada.operador_nome,
  case
    when opt_out_em is not null or resposta_status = 'recusada_opt_out'
      then 'opt_out'
    when conteudo_novo_desde_revisao
      and resposta_status in ('coletando', 'pronta_para_revisao', 'em_revisao')
      then 'nova_rodada'
    when resposta_status = 'coletando' then 'respondendo'
    when resposta_status in ('pronta_para_revisao', 'em_revisao', 'revisada')
      then resposta_status
    when acao = 'realizado' then 'followup_realizado'
    when acao = 'dispensado' then 'followup_dispensado'
    when esta_pendente and alerta_enviado_em is not null then 'followup_avisado'
    when esta_pendente then 'followup_pendente'
    else 'aguardando_resposta'
  end::text as estado_visivel,
  esta_pendente as followup_pendente,
  interagiu_sem_resposta_valida,
  alerta_enviado_em,
  acao,
  acao_canal,
  acao_observacao,
  acao_registrada_em,
  acao_operador_nome
from classificada;
$function$;

revoke all on function public.fn_pesquisa_evasao_followup_estado(timestamptz)
  from public, anon;
grant execute on function public.fn_pesquisa_evasao_followup_estado(timestamptz)
  to authenticated, service_role;

create or replace function public.listar_followups_pesquisa_evasao_v1(
  p_unidade_id uuid default null,
  p_limite integer default 50,
  p_offset integer default 0,
  p_estado text default 'todos',
  p_ano integer default null,
  p_mes integer default null,
  p_busca text default null
)
returns table (
  total_count bigint,
  pesquisa_id uuid,
  evasao_id integer,
  aluno_nome text,
  unidade_id uuid,
  unidade_nome text,
  enviado_em timestamptz,
  vencido_em timestamptz,
  operador_usuario_id integer,
  operador_nome text,
  estado_visivel text,
  followup_pendente boolean,
  interagiu_sem_resposta_valida boolean,
  alerta_enviado_em timestamptz,
  acao text,
  acao_canal text,
  acao_observacao text,
  acao_registrada_em timestamptz,
  acao_operador_nome text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if not public.fn_pesquisa_evasao_usuario_interno_ativo() then
    raise exception 'usuario_interno_ativo_required';
  end if;

  if coalesce(p_estado, 'todos') not in (
    'todos', 'followup_pendente', 'followup_avisado',
    'followup_realizado', 'followup_dispensado', 'aguardando_resposta'
  ) then
    raise exception 'estado_followup_invalido';
  end if;

  return query
  select
    count(*) over ()::bigint,
    estado.*
  from public.fn_pesquisa_evasao_followup_estado(clock_timestamp()) estado
  where (p_unidade_id is null or estado.unidade_id = p_unidade_id)
    and (p_ano is null or extract(year from estado.enviado_em)::integer = p_ano)
    and (p_mes is null or extract(month from estado.enviado_em)::integer = p_mes)
    and (
      nullif(btrim(p_busca), '') is null
      or estado.aluno_nome ilike ('%' || btrim(p_busca) || '%')
      or estado.unidade_nome ilike ('%' || btrim(p_busca) || '%')
      or coalesce(estado.operador_nome, '') ilike ('%' || btrim(p_busca) || '%')
    )
    and (
      coalesce(p_estado, 'todos') = 'todos'
      or (p_estado = 'followup_pendente' and estado.followup_pendente)
      or estado.estado_visivel = p_estado
    )
  order by
    estado.followup_pendente desc,
    estado.vencido_em,
    estado.pesquisa_id
  limit least(greatest(coalesce(p_limite, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$function$;

create or replace function public.contar_followups_pesquisa_evasao_v1(
  p_unidade_id uuid default null,
  p_ano integer default null,
  p_mes integer default null
)
returns bigint
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_total bigint;
begin
  if not public.fn_pesquisa_evasao_usuario_interno_ativo() then
    raise exception 'usuario_interno_ativo_required';
  end if;

  select count(*)
  into v_total
  from public.fn_pesquisa_evasao_followup_estado(clock_timestamp()) estado
  where estado.followup_pendente
    and (p_unidade_id is null or estado.unidade_id = p_unidade_id)
    and (p_ano is null or extract(year from estado.enviado_em)::integer = p_ano)
    and (p_mes is null or extract(month from estado.enviado_em)::integer = p_mes);

  return v_total;
end;
$function$;

create or replace function public.registrar_followup_pesquisa_evasao_v1(
  p_pesquisa_id uuid,
  p_acao text,
  p_canal text default null,
  p_observacao text default null
)
returns table (
  pesquisa_id uuid,
  acao text,
  operador_usuario_id integer,
  registrado_em timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_usuario public.usuarios%rowtype;
  v_pesquisa public.pesquisa_evasao%rowtype;
  v_existente public.pesquisa_evasao_followup_acoes%rowtype;
begin
  if not public.fn_pesquisa_evasao_usuario_interno_ativo() then
    raise exception 'usuario_interno_ativo_required';
  end if;

  select usuario.*
  into v_usuario
  from public.usuarios usuario
  where usuario.auth_user_id = auth.uid()
    and usuario.ativo = true;

  if not found then
    raise exception 'operador_followup_nao_resolvido';
  end if;

  if p_acao not in ('realizado', 'dispensado') then
    raise exception 'acao_followup_invalida';
  end if;
  if p_acao = 'realizado' and p_canal not in ('whatsapp', 'telefone', 'outro') then
    raise exception 'canal_followup_obrigatorio';
  end if;
  if p_acao = 'dispensado' and p_canal is not null then
    raise exception 'canal_followup_proibido_para_dispensa';
  end if;
  if char_length(coalesce(p_observacao, '')) > 500 then
    raise exception 'observacao_followup_excede_limite';
  end if;

  select pesquisa.*
  into v_pesquisa
  from public.pesquisa_evasao pesquisa
  where pesquisa.id = p_pesquisa_id
  for update;

  if not found then
    raise exception 'pesquisa_evasao_nao_encontrada';
  end if;

  select existente.*
  into v_existente
  from public.pesquisa_evasao_followup_acoes existente
  where existente.pesquisa_id = p_pesquisa_id;

  if found then
    if v_existente.acao is distinct from p_acao then
      raise exception 'PESQUISA_EVASAO_FOLLOWUP_CONFLITO';
    end if;
    return query select
      v_existente.pesquisa_id,
      v_existente.acao,
      v_existente.operador_usuario_id,
      v_existente.registrado_em;
    return;
  end if;

  if v_pesquisa.modo_teste
     or v_pesquisa.envio_status not in ('enviado', 'entregue', 'lido')
     or v_pesquisa.enviado_em is null
     or clock_timestamp() < v_pesquisa.enviado_em + interval '72 hours'
     or v_pesquisa.resposta_valida
     or v_pesquisa.opt_out_em is not null
     or v_pesquisa.resposta_status = 'recusada_opt_out' then
    raise exception 'pesquisa_evasao_followup_nao_elegivel';
  end if;

  insert into public.pesquisa_evasao_followup_acoes (
    pesquisa_id,
    acao,
    canal,
    observacao,
    operador_usuario_id,
    operador_auth_user_id
  ) values (
    p_pesquisa_id,
    p_acao,
    p_canal,
    nullif(btrim(p_observacao), ''),
    v_usuario.id,
    auth.uid()
  )
  returning
    pesquisa_evasao_followup_acoes.pesquisa_id,
    pesquisa_evasao_followup_acoes.acao,
    pesquisa_evasao_followup_acoes.operador_usuario_id,
    pesquisa_evasao_followup_acoes.registrado_em
  into pesquisa_id, acao, operador_usuario_id, registrado_em;

  return next;
end;
$function$;

revoke all on function public.listar_followups_pesquisa_evasao_v1(
  uuid, integer, integer, text, integer, integer, text
) from public, anon;
revoke all on function public.contar_followups_pesquisa_evasao_v1(
  uuid, integer, integer
) from public, anon;
revoke all on function public.registrar_followup_pesquisa_evasao_v1(
  uuid, text, text, text
) from public, anon;

grant execute on function public.listar_followups_pesquisa_evasao_v1(
  uuid, integer, integer, text, integer, integer, text
) to authenticated, service_role;
grant execute on function public.contar_followups_pesquisa_evasao_v1(
  uuid, integer, integer
) to authenticated, service_role;
grant execute on function public.registrar_followup_pesquisa_evasao_v1(
  uuid, text, text, text
) to authenticated, service_role;

create or replace function public.fn_lia_renderizar_resumo_followup(
  p_resumo_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_total integer;
  v_lista text;
  v_restantes integer;
  v_base_url text;
begin
  select count(*)
  into v_total
  from public.lia_followup_resumo_itens item
  where item.resumo_id = p_resumo_id
    and item.cancelado_em is null;

  if v_total = 0 then
    return null;
  end if;

  select string_agg(
    format(
      '%s — %s — enviada em %s',
      estado.aluno_nome,
      estado.unidade_nome,
      to_char(estado.enviado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')
    ),
    E'\n' order by estado.vencido_em, estado.pesquisa_id
  )
  into v_lista
  from (
    select estado.*
    from public.lia_followup_resumo_itens item
    join public.fn_pesquisa_evasao_followup_estado(clock_timestamp()) estado
      on estado.pesquisa_id = item.pesquisa_id
    where item.resumo_id = p_resumo_id
      and item.cancelado_em is null
    order by estado.vencido_em, estado.pesquisa_id
    limit 10
  ) estado;

  v_restantes := greatest(v_total - 10, 0);

  select rtrim(config.app_base_url, '/')
  into v_base_url
  from public.lia_alertas_configuracao config
  where config.id = 1;

  return format(
    E'⏰ *Pesquisas aguardando follow-up — 3 dias*\n\nVocê tem %s pesquisa(s) enviada(s) sem resposta válida:\n\n%s%s\n\n👉 %s/app/sucesso-aluno?destino=pesquisas-evasao&filtro=followup_pendente',
    v_total,
    v_lista,
    case
      when v_restantes > 0 then format(E'\n\n... e mais %s caso(s).', v_restantes)
      else ''
    end,
    v_base_url
  );
end;
$function$;

revoke all on function public.fn_lia_renderizar_resumo_followup(uuid)
  from public, anon, authenticated;
grant execute on function public.fn_lia_renderizar_resumo_followup(uuid)
  to service_role;

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

  -- O cron acorda a Edge a cada minuto, mas o produtor roda apenas no minuto
  -- diario das 09:00 BRT. Casos que vencem depois aguardam o dia seguinte.
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
    on conflict (operador_usuario_id, ambiente, data_corte_brt) do nothing
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

create or replace function public.enfileirar_lia_followup_piloto(
  p_pesquisa_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_pesquisa public.pesquisa_evasao%rowtype;
  v_resumo_id uuid;
  v_alerta_id uuid;
  v_destino public.lia_destinos_privados%rowtype;
  v_data_local date := (clock_timestamp() at time zone 'America/Sao_Paulo')::date;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;

  select pesquisa.*
  into v_pesquisa
  from public.pesquisa_evasao pesquisa
  where pesquisa.id = p_pesquisa_id
    and pesquisa.modo_teste = true;

  if not found then
    raise exception 'piloto_exige_pesquisa_modo_teste';
  end if;

  select alerta.id
  into v_alerta_id
  from public.lia_followup_resumo_itens item
  join public.lia_alertas_privados alerta
    on alerta.followup_resumo_id = item.resumo_id
  where item.pesquisa_id = p_pesquisa_id
    and item.ambiente = 'teste';

  if v_alerta_id is not null then
    return v_alerta_id;
  end if;

  insert into public.lia_followup_resumos (
    ambiente,
    operador_usuario_id,
    data_corte_brt,
    total_casos,
    idempotency_key
  ) values (
    'teste',
    2,
    v_data_local,
    1,
    format('followup_3d_piloto:%s', p_pesquisa_id)
  )
  returning id into v_resumo_id;

  insert into public.lia_followup_resumo_itens (
    resumo_id,
    pesquisa_id,
    ambiente,
    vencido_em_snapshot,
    interacao_nao_substantiva_snapshot
  ) values (
    v_resumo_id,
    p_pesquisa_id,
    'teste',
    coalesce(v_pesquisa.enviado_em + interval '72 hours', clock_timestamp()),
    false
  );

  select destino.*
  into strict v_destino
  from public.lia_destinos_privados destino
  where destino.usuario_id = 2
    and destino.canal = 'whatsapp'
    and destino.ativo;

  insert into public.lia_alertas_privados (
    followup_resumo_id,
    destinatario_usuario_id,
    destino_id,
    destino_snapshot,
    template_codigo,
    template_versao,
    mensagem_renderizada,
    status,
    caixa_id
  ) values (
    v_resumo_id,
    2,
    v_destino.id,
    v_destino.destino_normalizado,
    'lia_evasao_followup_3d_resumo',
    1,
    public.fn_lia_renderizar_resumo_followup(v_resumo_id),
    'pendente',
    3
  )
  returning id into v_alerta_id;

  return v_alerta_id;
end;
$function$;

revoke all on function public.produzir_lia_resumos_followup_72h(timestamptz)
  from public, anon, authenticated;
revoke all on function public.enfileirar_lia_followup_piloto(uuid)
  from public, anon, authenticated;
grant execute on function public.produzir_lia_resumos_followup_72h(timestamptz)
  to service_role;
grant execute on function public.enfileirar_lia_followup_piloto(uuid)
  to service_role;

create or replace function public.fn_lia_claim_alerta_privado_em(
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

  update public.lia_followup_resumo_itens item
  set cancelado_em = p_agora,
      cancelamento_motivo = case
        when pesquisa.opt_out_em is not null
          or pesquisa.resposta_status = 'recusada_opt_out' then 'opt_out'
        when acao.pesquisa_id is not null then 'acao_manual'
        else 'resposta_valida'
      end
  from public.lia_alertas_privados alerta
  join public.pesquisa_evasao pesquisa on true
  left join public.pesquisa_evasao_followup_acoes acao
    on acao.pesquisa_id = pesquisa.id
  where alerta.followup_resumo_id = item.resumo_id
    and pesquisa.id = item.pesquisa_id
    and alerta.status = 'pendente'
    and (p_alerta_id is null or alerta.id = p_alerta_id)
    and item.cancelado_em is null
    and (
      pesquisa.resposta_valida
      or pesquisa.opt_out_em is not null
      or pesquisa.resposta_status in (
        'pronta_para_revisao', 'em_revisao', 'revisada', 'recusada_opt_out'
      )
      or acao.pesquisa_id is not null
    );

  update public.lia_followup_resumos resumo
  set total_casos = ativos.total
  from (
    select item.resumo_id, count(*)::integer as total
    from public.lia_followup_resumo_itens item
    where item.cancelado_em is null
    group by item.resumo_id
  ) ativos
  where resumo.id = ativos.resumo_id;

  update public.lia_alertas_privados alerta
  set status = 'cancelado',
      motivo_pendencia = 'sem_casos_elegiveis',
      destino_id = null,
      destino_snapshot = null,
      mensagem_renderizada = null,
      atualizado_em = p_agora
  where alerta.followup_resumo_id is not null
    and alerta.status = 'pendente'
    and (p_alerta_id is null or alerta.id = p_alerta_id)
    and not exists (
      select 1
      from public.lia_followup_resumo_itens item
      where item.resumo_id = alerta.followup_resumo_id
        and item.cancelado_em is null
    );

  update public.lia_alertas_privados alerta
  set mensagem_renderizada = public.fn_lia_renderizar_resumo_followup(
        alerta.followup_resumo_id
      ),
      atualizado_em = p_agora
  where alerta.followup_resumo_id is not null
    and alerta.status = 'pendente'
    and (p_alerta_id is null or alerta.id = p_alerta_id);

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
  from public.usuarios usuario
  where usuario.id = alerta.destinatario_usuario_id
    and alerta.status = 'pendente'
    and (p_alerta_id is null or alerta.id = p_alerta_id)
    and not exists (
      select 1
      from public.lia_destinos_privados destino_privado
      where usuario.ativo = true
        and destino_privado.id = alerta.destino_id
        and destino_privado.usuario_id = alerta.destinatario_usuario_id
        and destino_privado.canal = 'whatsapp'
        and destino_privado.ativo
        and destino_privado.destino_normalizado = alerta.destino_snapshot
    );

  return query
  with candidato as (
    select alerta.id
    from public.lia_alertas_privados alerta
    join public.usuarios usuario
      on usuario.id = alerta.destinatario_usuario_id
     and usuario.ativo = true
    join public.lia_destinos_privados destino_privado
      on destino_privado.id = alerta.destino_id
     and destino_privado.usuario_id = alerta.destinatario_usuario_id
     and destino_privado.canal = 'whatsapp'
     and destino_privado.ativo
     and destino_privado.destino_normalizado = alerta.destino_snapshot
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
    coalesce(evento.tipo, 'followup_3d_resumo')::text,
    coalesce(evento.ambiente, resumo.ambiente)::text,
    atualizado.caixa_id
  from atualizado
  left join public.lia_pesquisa_eventos evento
    on evento.id = atualizado.evento_id
  left join public.lia_followup_resumos resumo
    on resumo.id = atualizado.followup_resumo_id;
end;
$function$;

create or replace function public.listar_lia_alertas_pendencias_administrativas(
  p_limite integer default 50
)
returns table (
  alerta_id uuid,
  pesquisa_id uuid,
  evento_tipo text,
  aluno_nome text,
  unidade_nome text,
  operador_usuario_id integer,
  motivo text,
  criado_em timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.role() is distinct from 'service_role'
     and not public.fn_pesquisa_evasao_usuario_interno_ativo() then
    raise exception 'usuario_interno_ativo_required';
  end if;

  return query
  select
    alerta.id,
    evento.pesquisa_id,
    coalesce(evento.tipo, 'followup_3d_resumo')::text,
    evento.aluno_nome_snapshot,
    evento.unidade_nome_snapshot,
    coalesce(evento.operador_usuario_id, resumo.operador_usuario_id),
    alerta.motivo_pendencia,
    alerta.criado_em
  from public.lia_alertas_privados alerta
  left join public.lia_pesquisa_eventos evento on evento.id = alerta.evento_id
  left join public.lia_followup_resumos resumo
    on resumo.id = alerta.followup_resumo_id
  where alerta.status in ('fila_administrativa', 'falha', 'resultado_ambiguo')
  order by alerta.criado_em desc, alerta.id
  limit least(greatest(coalesce(p_limite, 50), 1), 200);
end;
$function$;

create or replace function public.expurgar_lia_alertas_privados()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_expurgados integer;
begin
  update public.lia_alertas_privados
  set destino_snapshot = null,
      mensagem_renderizada = null,
      expurgado_em = now(),
      atualizado_em = now()
  where status in (
      'enviado', 'falha', 'resultado_ambiguo', 'fila_administrativa', 'cancelado'
    )
    and atualizado_em < now() - interval '30 days'
    and expurgado_em is null;

  get diagnostics v_expurgados = row_count;
  return v_expurgados;
end;
$function$;

revoke all on function public.fn_lia_claim_alerta_privado_em(
  uuid, uuid, timestamptz
) from public, anon, authenticated;
revoke all on function public.listar_lia_alertas_pendencias_administrativas(integer)
  from public, anon;
revoke all on function public.expurgar_lia_alertas_privados()
  from public, anon, authenticated;

grant execute on function public.fn_lia_claim_alerta_privado_em(
  uuid, uuid, timestamptz
) to service_role;
grant execute on function public.listar_lia_alertas_pendencias_administrativas(integer)
  to authenticated, service_role;
grant execute on function public.expurgar_lia_alertas_privados()
  to service_role;

comment on table public.pesquisa_evasao_followup_acoes is
  'Decisao manual terminal e auditavel do follow-up; nao envia mensagem a familia.';
comment on table public.lia_followup_resumos is
  'Resumo privado diario por operador, produzido as 09:00 BRT e entregue pela outbox da Lia.';
comment on table public.lia_followup_resumo_itens is
  'Vinculo auditavel dos casos incluidos no resumo, sem duplicar telefone ou resposta.';
comment on column public.lia_alertas_configuracao.followup_72h_liberado is
  'Gate independente da Fase B; default false e ativacao somente apos piloto aceito.';
