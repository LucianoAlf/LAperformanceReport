-- Health Score Professor V3 - metas segmentadas, Task 2.
-- Schema aditivo para configuracao por unidade/curso/modalidade e auditoria
-- estruturada dos segmentos usados em snapshots. Nenhum consumidor e ativado.

create table if not exists public.health_score_professor_v3_config_metas_curso_modalidade (
  id uuid primary key default gen_random_uuid(),
  config_id uuid not null
    references public.health_score_professor_v3_config_versoes(id)
    on delete restrict,
  unidade_id uuid not null
    references public.unidades(id)
    on delete restrict,
  curso_id integer not null
    references public.cursos(id)
    on delete restrict,
  modalidade text not null
    check (modalidade in ('individual', 'turma')),
  estado text not null
    check (estado in ('configurada', 'nao_ofertada')),
  capacidade_maxima numeric,
  meta_media_turma numeric,
  meta_carteira_curso numeric,
  parametros jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint health_score_professor_v3_config_meta_segmentada_estado_chk
    check (
      (
        estado = 'nao_ofertada'
        and capacidade_maxima is null
        and meta_media_turma is null
        and meta_carteira_curso is null
      )
      or
      (
        estado = 'configurada'
        and capacidade_maxima is not null
        and meta_media_turma is not null
        and meta_carteira_curso is not null
        and capacidade_maxima > 0
        and meta_media_turma > 0
        and meta_carteira_curso > 0
        and meta_media_turma <= capacidade_maxima
      )
    ),
  unique (config_id, unidade_id, curso_id, modalidade),
  unique (id, unidade_id, curso_id, modalidade)
);

create table if not exists public.health_score_professor_v3_snapshot_metrica_segmentos (
  id uuid primary key default gen_random_uuid(),
  snapshot_metrica_id uuid not null
    references public.health_score_professor_v3_snapshot_metricas(id)
    on delete restrict,
  config_meta_segmento_id uuid,
  unidade_id uuid not null
    references public.unidades(id)
    on delete restrict,
  curso_id integer not null
    references public.cursos(id)
    on delete restrict,
  modalidade text not null
    check (modalidade in ('individual', 'turma')),
  pessoas_unicas integer not null default 0
    check (pessoas_unicas >= 0),
  vinculos_ativos integer not null default 0
    check (vinculos_ativos >= 0),
  turmas_elegiveis integer not null default 0
    check (turmas_elegiveis >= 0),
  ocupacoes_unicas integer not null default 0
    check (ocupacoes_unicas >= 0),
  capacidade_maxima numeric
    check (capacidade_maxima is null or capacidade_maxima >= 0),
  meta_aplicada numeric
    check (meta_aplicada is null or meta_aplicada >= 0),
  numerador numeric
    check (numerador is null or numerador >= 0),
  denominador numeric
    check (denominador is null or denominador >= 0),
  nota numeric(6,2)
    check (nota is null or nota between 0 and 100),
  estado_base text not null
    check (estado_base in (
      'ok',
      'sem_base_zero_carteira',
      'sem_base_sem_meta',
      'sem_base_sem_turmas',
      'regra_ausente',
      'segmentacao_incompleta',
      'nao_ofertada',
      'divergencia_nao_ofertada'
    )),
  fonte text not null
    check (nullif(btrim(fonte), '') is not null),
  regra_versao text not null
    check (nullif(btrim(regra_versao), '') is not null),
  detalhes jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  foreign key (
    config_meta_segmento_id,
    unidade_id,
    curso_id,
    modalidade
  ) references public.health_score_professor_v3_config_metas_curso_modalidade (
    id,
    unidade_id,
    curso_id,
    modalidade
  ) on delete restrict,
  unique (snapshot_metrica_id, unidade_id, curso_id, modalidade)
);

create index if not exists
  idx_health_score_professor_v3_config_metas_unidade_id
  on public.health_score_professor_v3_config_metas_curso_modalidade (
    unidade_id
  );

create index if not exists
  idx_health_score_professor_v3_config_metas_curso_id
  on public.health_score_professor_v3_config_metas_curso_modalidade (
    curso_id
  );

create index if not exists
  idx_health_score_professor_v3_snapshot_segmentos_config_meta_id
  on public.health_score_professor_v3_snapshot_metrica_segmentos (
    config_meta_segmento_id
  )
  where config_meta_segmento_id is not null;

create index if not exists
  idx_health_score_professor_v3_snapshot_segmentos_unidade_id
  on public.health_score_professor_v3_snapshot_metrica_segmentos (
    unidade_id
  );

create index if not exists
  idx_health_score_professor_v3_snapshot_segmentos_curso_id
  on public.health_score_professor_v3_snapshot_metrica_segmentos (
    curso_id
  );

create or replace function public.fn_health_score_professor_v3_bloquear_config_meta_segmentada()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_config_ids uuid[];
begin
  v_config_ids := case tg_op
    when 'INSERT' then array[new.config_id]
    when 'DELETE' then array[old.config_id]
    else array[old.config_id, new.config_id]
  end;

  if tg_op = 'UPDATE'
    and new.config_id is distinct from old.config_id
    and exists (
      select 1
      from public.health_score_professor_v3_snapshot_metrica_segmentos sms
      where sms.config_meta_segmento_id = old.id
    )
  then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_IMUTAVEL: meta segmentada referenciada nao muda de configuracao';
  end if;

  if exists (
    select 1
    from public.health_score_professor_v3_config_versoes c
    where c.id = any(v_config_ids)
      and (
        c.status is distinct from 'rascunho'
        or exists (
          select 1
          from public.health_score_professor_v3_snapshots s
          where s.config_id = c.id
            and s.estado in ('fechado', 'invalidado')
        )
      )
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_IMUTAVEL: metas segmentadas de configuracao nao rascunho ou historica';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists trg_health_score_professor_v3_config_meta_segmentada_imutavel
  on public.health_score_professor_v3_config_metas_curso_modalidade;
create trigger trg_health_score_professor_v3_config_meta_segmentada_imutavel
before insert or update or delete
on public.health_score_professor_v3_config_metas_curso_modalidade
for each row
execute function public.fn_health_score_professor_v3_bloquear_config_meta_segmentada();

create or replace function public.fn_health_score_professor_v3_bloquear_snapshot_segmento_fechado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_snapshot_metrica_ids uuid[];
begin
  v_snapshot_metrica_ids := case tg_op
    when 'INSERT' then array[new.snapshot_metrica_id]
    when 'DELETE' then array[old.snapshot_metrica_id]
    else array[old.snapshot_metrica_id, new.snapshot_metrica_id]
  end;

  if exists (
    select 1
    from public.health_score_professor_v3_snapshot_metricas sm
    join public.health_score_professor_v3_snapshots s
      on s.id = sm.snapshot_id
    where sm.id = any(v_snapshot_metrica_ids)
      and s.estado in ('fechado', 'invalidado')
  ) then
    raise exception
      'HEALTH_SCORE_V3_SNAPSHOT_IMUTAVEL: segmentos de snapshot fechado ou invalidado';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_health_score_professor_v3_snapshot_segmento_imutavel
  on public.health_score_professor_v3_snapshot_metrica_segmentos;
create trigger trg_health_score_professor_v3_snapshot_segmento_imutavel
before insert or update or delete
on public.health_score_professor_v3_snapshot_metrica_segmentos
for each row
execute function public.fn_health_score_professor_v3_bloquear_snapshot_segmento_fechado();

create or replace function public.fn_health_score_professor_v3_validar_snapshot_segmento_config()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.config_meta_segmento_id is null then
    return new;
  end if;

  if exists (
    select 1
    from public.health_score_professor_v3_snapshot_metricas sm
    join public.health_score_professor_v3_snapshots s
      on s.id = sm.snapshot_id
    join public.health_score_professor_v3_config_metas_curso_modalidade m
      on m.id = new.config_meta_segmento_id
    where sm.id = new.snapshot_metrica_id
      and m.config_id is distinct from s.config_id
  ) then
    raise exception
      'HEALTH_SCORE_V3_SEGMENTO_CONFIG_INVALIDA: meta e snapshot usam configuracoes diferentes';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_health_score_v3_snapshot_segmento_config_consistente
  on public.health_score_professor_v3_snapshot_metrica_segmentos;
create trigger trg_health_score_v3_snapshot_segmento_config_consistente
before insert or update
on public.health_score_professor_v3_snapshot_metrica_segmentos
for each row
execute function public.fn_health_score_professor_v3_validar_snapshot_segmento_config();

alter table public.health_score_professor_v3_config_metas_curso_modalidade
  enable row level security;
alter table public.health_score_professor_v3_snapshot_metrica_segmentos
  enable row level security;

revoke all on table public.health_score_professor_v3_config_metas_curso_modalidade
  from public, anon, authenticated;
revoke all on table public.health_score_professor_v3_snapshot_metrica_segmentos
  from public, anon, authenticated;

-- O projeto possui privilegios padrao para agentes restritos. Estas tabelas
-- alimentam apenas RPCs guardadas; nenhum agente deve le-las diretamente.
do $segmented_grants$
declare
  role_name text;
begin
  foreach role_name in array array[
    'fabio_agent',
    'lia_acesso_restrito',
    'mila_acesso_restrito',
    'sol_acesso_restrito'
  ]
  loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format(
        'revoke all on table public.health_score_professor_v3_config_metas_curso_modalidade from %I',
        role_name
      );
      execute format(
        'revoke all on table public.health_score_professor_v3_snapshot_metrica_segmentos from %I',
        role_name
      );
    end if;
  end loop;
end;
$segmented_grants$;

revoke all on table public.health_score_professor_v3_config_metas_curso_modalidade
  from service_role;
revoke all on table public.health_score_professor_v3_snapshot_metrica_segmentos
  from service_role;
grant select
  on table public.health_score_professor_v3_config_metas_curso_modalidade
  to service_role;
grant select
  on table public.health_score_professor_v3_snapshot_metrica_segmentos
  to service_role;

revoke all on function public.fn_health_score_professor_v3_bloquear_config_meta_segmentada()
  from public, anon, authenticated;
revoke all on function public.fn_health_score_professor_v3_bloquear_snapshot_segmento_fechado()
  from public, anon, authenticated;
revoke all on function public.fn_health_score_professor_v3_validar_snapshot_segmento_config()
  from public, anon, authenticated;

comment on table public.health_score_professor_v3_config_metas_curso_modalidade is
  'Matriz versionada de metas V3 por configuracao, unidade, curso e modalidade.';
comment on table public.health_score_professor_v3_snapshot_metrica_segmentos is
  'Decomposicao auditavel das metricas segmentadas armazenadas em snapshots V3.';
