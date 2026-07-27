-- Habilita fila Sol/Hermes dedicada para relatórios manuais/automáticos.
-- Necessário porque fila_relatorios_whatsapp tem índice único por unidade/jid/dia
-- e ADM + Comercial usam os mesmos grupos no mesmo dia.

create table if not exists public.fila_relatorios_sol_hermes (
  id bigserial primary key,
  tipo_relatorio text not null,
  origem text not null default 'manual',
  unidade_id uuid not null references public.unidades(id),
  unidade_nome text not null,
  jid text not null,
  grupo_nome text not null,
  texto text not null,
  status text not null default 'sol_pendente',
  agendada_para timestamptz not null default now(),
  enviada_em timestamptz,
  erro text,
  message_id text,
  created_at timestamptz not null default now(),
  data_dia date not null default ((now() at time zone 'America/Sao_Paulo'))::date,
  tentativas integer not null default 0,
  ultima_tentativa_em timestamptz
);

create index if not exists idx_fila_sol_hermes_pendente
  on public.fila_relatorios_sol_hermes (agendada_para)
  where status = 'sol_pendente';

create unique index if not exists idx_fila_sol_hermes_dia_tipo
  on public.fila_relatorios_sol_hermes (tipo_relatorio, unidade_id, jid, data_dia)
  where status in ('sol_pendente', 'sol_enviando', 'enviada');

alter table public.fila_relatorios_sol_hermes enable row level security;

create or replace function public.sol_hermes_report_enqueue(
  p_texto text,
  p_tipo_relatorio text,
  p_unidade text default 'todos',
  p_competencia text default null,
  p_tipo_destino text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_texto text := btrim(coalesce(p_texto, ''));
  v_tipo_relatorio text := btrim(coalesce(p_tipo_relatorio, ''));
  v_unidade text := nullif(btrim(coalesce(p_unidade, 'todos')), '');
  v_tipo_destinatario text;
  v_unidade_ids uuid[];
  v_rows int := 0;
begin
  if length(v_texto) < 20 then
    return jsonb_build_object('success', false, 'error', 'texto inválido');
  end if;

  if v_tipo_relatorio = '' then
    return jsonb_build_object('success', false, 'error', 'tipoRelatorio obrigatório');
  end if;

  v_tipo_destinatario := coalesce(
    nullif(btrim(p_tipo_destino), ''),
    case
      when v_tipo_relatorio in ('diario', 'mensal', 'gerencial_ia', 'renovacoes', 'avisos', 'evasoes') then 'relatorio_admin'
      when v_tipo_relatorio in ('comercial', 'comercial_diario', 'comercial_mensal', 'comercial_lead', 'comercial_experimental', 'comercial_visita', 'comercial_matricula') then 'relatorio_comercial'
      else null
    end
  );

  if v_tipo_destinatario not in ('relatorio_admin', 'relatorio_comercial', 'relatorio_coordenacao') then
    return jsonb_build_object('success', false, 'error', 'tipo de destinatário não permitido: ' || coalesce(v_tipo_destinatario, 'null'));
  end if;

  select array_agg(u.id order by u.nome)
  into v_unidade_ids
  from public.unidades u
  where u.ativo = true
    and (
      coalesce(v_unidade, 'todos') = 'todos'
      or u.nome = v_unidade
      or u.id::text = v_unidade
    );

  if v_unidade_ids is null or array_length(v_unidade_ids, 1) is null then
    return jsonb_build_object('success', false, 'error', 'nenhuma unidade encontrada');
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
    erro,
    tentativas
  )
  select
    v_tipo_relatorio,
    'manual',
    u.id,
    u.nome,
    d.jid,
    d.nome,
    v_texto,
    'sol_pendente',
    now(),
    case
      when p_competencia is not null then 'manual:' || v_tipo_relatorio || ':' || p_competencia
      else 'manual:' || v_tipo_relatorio
    end,
    0
  from public.whatsapp_destinatarios_relatorio d
  join public.unidades u on u.id = d.unidade_id
  where d.ativo = true
    and d.tipo = v_tipo_destinatario
    and d.unidade_id = any(v_unidade_ids)
    and not exists (
      select 1
      from public.fila_relatorios_sol_hermes f
      where f.tipo_relatorio = v_tipo_relatorio
        and f.unidade_id = d.unidade_id
        and f.jid = d.jid
        and f.data_dia = ((now() at time zone 'America/Sao_Paulo'))::date
        and f.status in ('sol_pendente', 'sol_enviando', 'enviada')
    );

  get diagnostics v_rows = row_count;

  return jsonb_build_object(
    'success', true,
    'queued', v_rows,
    'status', 'sol_pendente',
    'tipoDestinatario', v_tipo_destinatario,
    'skipped', case when v_rows = 0 then 'already_queued_or_sent' else null end,
    'note', 'Enfileirado para Sol/Hermes nativo em fila dedicada.'
  );
end;
$$;

create or replace function public.toggle_relatorio_comercial_cron(
  p_unidade_id uuid,
  p_ativo boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Nao autenticado';
  end if;

  update public.unidades
     set relatorio_comercial_diario_cron_ativo = p_ativo
   where id = p_unidade_id;
end;
$$;

revoke all on function public.sol_hermes_report_enqueue(text, text, text, text, text) from public;
grant execute on function public.sol_hermes_report_enqueue(text, text, text, text, text) to authenticated;

update public.unidades
   set relatorio_comercial_diario_cron_ativo = true
 where ativo = true
   and nome in ('Barra', 'Campo Grande', 'Recreio');
