-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- DECISAO DO ALF (14/07, brainstorm): silencio geral (horario/dias) NAO PODE afetar governanca
-- ("o professor bota silencio e muda as cobrancas, os lembretes"). Cobranca de pendencia e
-- politica de coordenacao (Quintela/Juliana), nao preferencia de UX do professor.
--
-- Duas categorias de notificacao, regras DIFERENTES:
--   'governanca'  -> pendencia de registro, cobranca. So respeita pausa_ate (ferias). NUNCA
--                    silencio por horario/dia/domingo. Bypass estrutural, nao filtro de prompt.
--   'informativa' -> briefing matinal, aula experimental nova, etc. Respeita tudo: pausa,
--                    dias_silencio, horario_silencio, e o novo toggle de domingo.
--
-- Domingo vira controle DEDICADO (nao o dias_silencio generico) — v1 da UI so expoe:
--   canal_preferido + recebe_domingo. horario_silencio/dias_silencio ficam no schema,
--   prontos, mas fora da tela ate os professores pedirem algo mais fino (decisao do Alf).
alter table public.fabio_professor_preferences
  add column if not exists recebe_domingo boolean not null default false;

comment on column public.fabio_professor_preferences.recebe_domingo is
  'Toggle dedicado (nao o dias_silencio generico). Default false = nao notifica domingo. So vale pra categoria informativa — governanca nunca e bloqueada por isso.';

-- app_atualizar_preferencia_fabio: adiciona o parametro novo, resto identico
create or replace function public.app_atualizar_preferencia_fabio(
  p_canal_preferido text default null,
  p_horario_silencio_inicio time default null,
  p_horario_silencio_fim time default null,
  p_dias_silencio smallint[] default null,
  p_pausa_ate date default null,
  p_limpar_pausa boolean default false,
  p_aceita_cobranca_pendencia boolean default null,
  p_tom_preferido text default null,
  p_recebe_domingo boolean default null
)
returns public.fabio_professor_preferences
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    canal_preferido           = coalesce(p_canal_preferido, canal_preferido),
    horario_silencio_inicio   = coalesce(p_horario_silencio_inicio, horario_silencio_inicio),
    horario_silencio_fim      = coalesce(p_horario_silencio_fim, horario_silencio_fim),
    dias_silencio             = coalesce(p_dias_silencio, dias_silencio),
    pausa_ate                 = case when p_limpar_pausa then null else coalesce(p_pausa_ate, pausa_ate) end,
    aceita_cobranca_pendencia = coalesce(p_aceita_cobranca_pendencia, aceita_cobranca_pendencia),
    tom_preferido             = coalesce(p_tom_preferido, tom_preferido),
    recebe_domingo            = coalesce(p_recebe_domingo, recebe_domingo)
  where professor_id = v_prof
  returning * into v_row;

  return v_row;
end;
$function$;

-- fn_fabio_pode_notificar: agora recebe categoria. Governanca ignora silencio inteiro.
create or replace function public.fn_fabio_pode_notificar(
  p_professor_id integer,
  p_categoria text default 'informativa',
  p_agora timestamptz default now()
)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_pref public.fabio_professor_preferences;
  v_local timestamp;
  v_dow smallint;
begin
  if p_professor_id is null then
    raise exception 'professor_id_obrigatorio';
  end if;
  if p_categoria not in ('governanca','informativa') then
    raise exception 'categoria_invalida: use governanca ou informativa';
  end if;

  select * into v_pref
  from public.fabio_professor_preferences
  where professor_id = p_professor_id;

  -- sem preferencia cadastrada = comportamento padrao (pode notificar)
  if v_pref is null then
    return true;
  end if;

  v_local := p_agora at time zone v_pref.timezone;
  v_dow := extract(dow from v_local)::smallint;

  -- GOVERNANCA: so pausa_ate (ferias) bloqueia. Silencio/domingo NUNCA bloqueiam cobranca.
  -- E' bypass estrutural (na funcao), nao decisao de prompt do Fabio.
  if p_categoria = 'governanca' then
    if v_pref.pausa_ate is not null and v_pref.pausa_ate >= v_local::date then
      return false;
    end if;
    return true;
  end if;

  -- INFORMATIVA: respeita tudo.
  if v_pref.pausa_ate is not null and v_pref.pausa_ate >= v_local::date then
    return false;
  end if;

  if v_dow = 0 and not v_pref.recebe_domingo then
    return false;
  end if;

  if v_dow = any(v_pref.dias_silencio) then
    return false;
  end if;

  if v_pref.horario_silencio_inicio is not null and v_pref.horario_silencio_fim is not null then
    if v_pref.horario_silencio_inicio <= v_pref.horario_silencio_fim then
      if v_local::time between v_pref.horario_silencio_inicio and v_pref.horario_silencio_fim then
        return false;
      end if;
    else
      if v_local::time >= v_pref.horario_silencio_inicio or v_local::time <= v_pref.horario_silencio_fim then
        return false;
      end if;
    end if;
  end if;

  return true;
end;
$function$;

-- reaplica grants explicitamente (CREATE OR REPLACE em funcao EXISTENTE preserva grants,
-- mas verifico de qualquer forma — disciplina do dia, e a licao nova do outro chat foi
-- justamente sobre confiar cego em CREATE)
revoke all on function public.app_atualizar_preferencia_fabio(text,time,time,smallint[],date,boolean,boolean,text,boolean) from public, anon;
grant execute on function public.app_atualizar_preferencia_fabio(text,time,time,smallint[],date,boolean,boolean,text,boolean) to authenticated, service_role;

revoke all on function public.fn_fabio_pode_notificar(integer,text,timestamptz) from public, anon, authenticated;
grant execute on function public.fn_fabio_pode_notificar(integer,text,timestamptz) to fabio_agent, service_role;
