-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- FASE 1 do ROADMAP-CHAT-FABIO-DUAL-CHANNEL: preferências do professor
-- Tabela de domínio do Fábio (fabio_*), mesmo Supabase do LA Report/LA Teacher.
-- Não expõe a tabela ao cliente: RLS ligado, sem policy de SELECT/UPDATE direta.
-- Todo acesso passa por RPC SECURITY DEFINER.

create table public.fabio_professor_preferences (
  professor_id                integer primary key references public.professores(id),
  canal_preferido              text not null default 'ambos'
                                  check (canal_preferido in ('app','whatsapp','ambos')),
  horario_silencio_inicio      time,
  horario_silencio_fim         time,
  -- dia da semana no padrão extract(dow): 0=domingo ... 6=sábado
  dias_silencio                smallint[] not null default '{}',
  pausa_ate                    date,
  aceita_cobranca_pendencia    boolean not null default true,
  tom_preferido                text not null default 'neutro'
                                  check (tom_preferido in ('direto','caloroso','neutro')),
  timezone                     text not null default 'America/Sao_Paulo',
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

alter table public.fabio_professor_preferences enable row level security;
-- Sem policies: nenhum acesso direto via PostgREST/anon/authenticated.
-- Leitura e escrita só pelas RPCs abaixo (security definer).

revoke all on public.fabio_professor_preferences from anon, authenticated;

create or replace function public.fn_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_fabio_professor_preferences_touch
before update on public.fabio_professor_preferences
for each row execute function public.fn_touch_updated_at();

-- ============================================================
-- RPC 1: o professor lê a própria preferência (sessão).
-- Se ainda não existe linha, cria com defaults e devolve.
-- ============================================================
create or replace function public.app_minhas_preferencias_fabio()
returns public.fabio_professor_preferences
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_prof integer := public.fn_professor_do_usuario();
  v_row  public.fabio_professor_preferences;
begin
  if v_prof is null then
    raise exception 'sem_professor_vinculado' using errcode = '42501';
  end if;

  insert into public.fabio_professor_preferences (professor_id)
  values (v_prof)
  on conflict (professor_id) do nothing;

  select * into v_row
  from public.fabio_professor_preferences
  where professor_id = v_prof;

  return v_row;
end;
$$;

-- ============================================================
-- RPC 2: o professor atualiza a própria preferência (campos opcionais,
-- só altera o que vier não-nulo — null = "não mexe nesse campo").
-- ============================================================
create or replace function public.app_atualizar_preferencia_fabio(
  p_canal_preferido           text default null,
  p_horario_silencio_inicio   time default null,
  p_horario_silencio_fim      time default null,
  p_dias_silencio              smallint[] default null,
  p_pausa_ate                  date default null,
  p_limpar_pausa                boolean default false,
  p_aceita_cobranca_pendencia  boolean default null,
  p_tom_preferido               text default null
)
returns public.fabio_professor_preferences
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_prof integer := public.fn_professor_do_usuario();
  v_row  public.fabio_professor_preferences;
begin
  if v_prof is null then
    raise exception 'sem_professor_vinculado' using errcode = '42501';
  end if;

  insert into public.fabio_professor_preferences (professor_id)
  values (v_prof)
  on conflict (professor_id) do nothing;

  update public.fabio_professor_preferences set
    canal_preferido            = coalesce(p_canal_preferido, canal_preferido),
    horario_silencio_inicio    = coalesce(p_horario_silencio_inicio, horario_silencio_inicio),
    horario_silencio_fim       = coalesce(p_horario_silencio_fim, horario_silencio_fim),
    dias_silencio               = coalesce(p_dias_silencio, dias_silencio),
    pausa_ate                   = case when p_limpar_pausa then null else coalesce(p_pausa_ate, pausa_ate) end,
    aceita_cobranca_pendencia   = coalesce(p_aceita_cobranca_pendencia, aceita_cobranca_pendencia),
    tom_preferido                = coalesce(p_tom_preferido, tom_preferido)
  where professor_id = v_prof
  returning * into v_row;

  return v_row;
end;
$$;

-- ============================================================
-- RPC 3: o Fábio lê a preferência de um professor específico (escopado,
-- professor_id obrigatório — mesma trava estrutural do prontuário).
-- ============================================================
create or replace function public.fabio_preferencias_professor(p_professor_id integer)
returns public.fabio_professor_preferences
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_row public.fabio_professor_preferences;
begin
  if p_professor_id is null then
    raise exception 'professor_id_obrigatorio: o Fabio so pode ler a preferencia de um professor especifico' using errcode = '42501';
  end if;

  insert into public.fabio_professor_preferences (professor_id)
  values (p_professor_id)
  on conflict (professor_id) do nothing;

  select * into v_row
  from public.fabio_professor_preferences
  where professor_id = p_professor_id;

  return v_row;
end;
$$;

-- ============================================================
-- Trava estrutural que a Fase 2 (notificações/crons) vai consumir:
-- "pode mandar notificação proativa pra esse professor agora?"
-- Nunca decisão de prompt — sempre essa função.
-- ============================================================
create or replace function public.fn_fabio_pode_notificar(
  p_professor_id integer,
  p_agora timestamptz default now()
)
returns boolean
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_pref public.fabio_professor_preferences;
  v_local timestamp;
  v_dow smallint;
begin
  if p_professor_id is null then
    raise exception 'professor_id_obrigatorio';
  end if;

  select * into v_pref
  from public.fabio_professor_preferences
  where professor_id = p_professor_id;

  -- sem preferência cadastrada ainda = comportamento padrão (pode notificar)
  if v_pref is null then
    return true;
  end if;

  if v_pref.pausa_ate is not null and v_pref.pausa_ate >= (p_agora at time zone v_pref.timezone)::date then
    return false;
  end if;

  v_local := p_agora at time zone v_pref.timezone;
  v_dow := extract(dow from v_local)::smallint;

  if v_dow = any(v_pref.dias_silencio) then
    return false;
  end if;

  if v_pref.horario_silencio_inicio is not null and v_pref.horario_silencio_fim is not null then
    if v_pref.horario_silencio_inicio <= v_pref.horario_silencio_fim then
      if v_local::time between v_pref.horario_silencio_inicio and v_pref.horario_silencio_fim then
        return false;
      end if;
    else
      -- janela cruza a meia-noite (ex: 22:00 às 07:00)
      if v_local::time >= v_pref.horario_silencio_inicio or v_local::time <= v_pref.horario_silencio_fim then
        return false;
      end if;
    end if;
  end if;

  return true;
end;
$$;

revoke all on function public.app_minhas_preferencias_fabio() from public;
revoke all on function public.app_atualizar_preferencia_fabio(text,time,time,smallint[],date,boolean,boolean,text) from public;
revoke all on function public.fabio_preferencias_professor(integer) from public;
revoke all on function public.fn_fabio_pode_notificar(integer,timestamptz) from public;

grant execute on function public.app_minhas_preferencias_fabio() to authenticated, service_role;
grant execute on function public.app_atualizar_preferencia_fabio(text,time,time,smallint[],date,boolean,boolean,text) to authenticated, service_role;
grant execute on function public.fabio_preferencias_professor(integer) to fabio_agent, service_role;
grant execute on function public.fn_fabio_pode_notificar(integer,timestamptz) to fabio_agent, service_role;
