-- Caixa Diario / Caixa-Cofre Administrativo - Reabertura auditada
-- Projeto: LA Performance Report
-- Data: 2026-06-10
--
-- Este arquivo altera schema e cria uma RPC operacional.
-- Objetivo: permitir reabrir caixa fechado somente com motivo, operador e snapshot de auditoria.
-- Nao altera dados_mensais, KPIs, snapshots, views ou relatorios existentes.
-- Nao limpa testes automaticamente.

create table if not exists public.caixa_reaberturas_log (
  id uuid primary key default gen_random_uuid(),
  caixa_diario_id uuid not null references public.caixas_diarios(id) on delete cascade,
  unidade_id uuid not null references public.unidades(id),
  data_caixa date not null,
  motivo text not null,
  reaberto_por text not null,
  reaberto_em timestamptz not null default now(),
  fechado_em_anterior timestamptz,
  fechado_por_anterior text,
  saldo_final_conferido_anterior numeric(12,2),
  saldo_final_calculado_anterior numeric(12,2),
  observacoes_anteriores text,
  caixa_snapshot jsonb not null,
  movimentacoes_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  constraint caixa_reaberturas_motivo_minimo check (length(trim(motivo)) >= 8),
  constraint caixa_reaberturas_reaberto_por_minimo check (length(trim(reaberto_por)) >= 2)
);

create index if not exists idx_caixa_reaberturas_log_caixa
  on public.caixa_reaberturas_log (caixa_diario_id, reaberto_em desc);

create index if not exists idx_caixa_reaberturas_log_unidade_data
  on public.caixa_reaberturas_log (unidade_id, data_caixa desc);

alter table public.caixa_reaberturas_log enable row level security;

drop policy if exists caixa_reaberturas_log_select on public.caixa_reaberturas_log;
create policy caixa_reaberturas_log_select on public.caixa_reaberturas_log
for select using (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and (u.perfil = 'admin' or u.unidade_id = caixa_reaberturas_log.unidade_id)
  )
);

create or replace function public.reabrir_caixa_diario(
  p_caixa_diario_id uuid,
  p_motivo text,
  p_reaberto_por text
)
returns public.caixas_diarios
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caixa public.caixas_diarios%rowtype;
  v_movimentacoes_snapshot jsonb;
  v_auth_role text := coalesce(auth.role(), '');
  v_tem_acesso boolean;
begin
  if p_caixa_diario_id is null then
    raise exception 'caixa_diario_id obrigatorio.';
  end if;

  if length(trim(coalesce(p_motivo, ''))) < 8 then
    raise exception 'Informe um motivo de reabertura com pelo menos 8 caracteres.';
  end if;

  if length(trim(coalesce(p_reaberto_por, ''))) < 2 then
    raise exception 'Informe quem esta reabrindo o caixa.';
  end if;

  select *
    into v_caixa
  from public.caixas_diarios
  where id = p_caixa_diario_id
  for update;

  if not found then
    raise exception 'Caixa diario nao encontrado.';
  end if;

  select exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and (u.perfil = 'admin' or u.unidade_id = v_caixa.unidade_id)
  )
  into v_tem_acesso;

  if not v_tem_acesso and v_auth_role <> 'service_role' then
    raise exception 'Usuario sem permissao para reabrir este caixa.';
  end if;

  if v_caixa.status <> 'fechado' then
    raise exception 'Apenas caixas fechados podem ser reabertos.';
  end if;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at), '[]'::jsonb)
    into v_movimentacoes_snapshot
  from public.caixa_movimentacoes m
  where m.caixa_diario_id = v_caixa.id;

  insert into public.caixa_reaberturas_log (
    caixa_diario_id,
    unidade_id,
    data_caixa,
    motivo,
    reaberto_por,
    fechado_em_anterior,
    fechado_por_anterior,
    saldo_final_conferido_anterior,
    saldo_final_calculado_anterior,
    observacoes_anteriores,
    caixa_snapshot,
    movimentacoes_snapshot
  )
  values (
    v_caixa.id,
    v_caixa.unidade_id,
    v_caixa.data_caixa,
    trim(p_motivo),
    trim(p_reaberto_por),
    v_caixa.fechado_em,
    v_caixa.fechado_por,
    v_caixa.saldo_final_conferido,
    v_caixa.saldo_final_calculado,
    v_caixa.observacoes,
    to_jsonb(v_caixa),
    v_movimentacoes_snapshot
  );

  update public.caixas_diarios
  set
    status = 'aberto',
    fechado_em = null,
    fechado_por = null,
    saldo_final_conferido = null
  where id = v_caixa.id
  returning * into v_caixa;

  return v_caixa;
end;
$$;

grant select on public.caixa_reaberturas_log to authenticated, service_role;
grant execute on function public.reabrir_caixa_diario(uuid, text, text) to authenticated, service_role;

comment on table public.caixa_reaberturas_log is
  'Log auditavel de reaberturas do caixa diario. Guarda snapshot do cabecalho e das movimentacoes antes da reabertura.';

comment on function public.reabrir_caixa_diario(uuid, text, text) is
  'Reabre caixa fechado com motivo e operador, registrando snapshot de auditoria antes de liberar novas edicoes.';
