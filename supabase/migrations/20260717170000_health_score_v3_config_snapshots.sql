-- Health Score Professor V3 - Gate 5.
-- Configuracao versionada, motor em sombra e snapshots imutaveis.
-- Nenhum consumidor produtivo e alterado por esta migration.

create table if not exists public.health_score_professor_v3_config_versoes (
  id uuid primary key default gen_random_uuid(),
  versao integer not null unique check (versao > 0),
  status text not null default 'rascunho'
    check (status in ('rascunho', 'ativa', 'arquivada')),
  vigencia_inicio date not null,
  vigencia_fim date,
  cobertura_minima numeric(5,2) not null default 60
    check (cobertura_minima between 0 and 100),
  faixa_atencao_min numeric(5,2) not null default 50
    check (faixa_atencao_min between 0 and 100),
  faixa_saudavel_min numeric(5,2) not null default 70
    check (faixa_saudavel_min between 0 and 100),
  exige_pilar_fidelizacao boolean not null default true,
  justificativa text not null,
  criado_por integer references public.usuarios(id),
  ativado_por integer references public.usuarios(id),
  criado_em timestamptz not null default now(),
  ativado_em timestamptz,
  atualizado_em timestamptz not null default now(),
  constraint health_score_professor_v3_config_faixas_chk
    check (faixa_atencao_min < faixa_saudavel_min),
  constraint health_score_professor_v3_config_vigencia_chk
    check (vigencia_fim is null or vigencia_fim >= vigencia_inicio),
  constraint health_score_professor_v3_config_vigencia_ativa_excl
    exclude using gist (
      daterange(
        vigencia_inicio,
        coalesce(vigencia_fim + 1, 'infinity'::date),
        '[)'
      ) with &&
    ) where (status = 'ativa')
);

create table if not exists public.health_score_professor_v3_config_metricas (
  id uuid primary key default gen_random_uuid(),
  config_id uuid not null
    references public.health_score_professor_v3_config_versoes(id)
    on delete restrict,
  metrica text not null
    check (metrica in (
      'retencao',
      'permanencia',
      'conversao',
      'media_turma',
      'numero_alunos',
      'presenca'
    )),
  peso numeric(5,2) not null check (peso > 0 and peso <= 100),
  meta numeric(14,4) check (meta is null or meta > 0),
  amostra_minima integer not null default 1 check (amostra_minima >= 0),
  cobertura_minima numeric(5,2)
    check (cobertura_minima is null or cobertura_minima between 0 and 100),
  parametros jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (config_id, metrica)
);

create table if not exists public.health_score_professor_v3_snapshots (
  id uuid primary key default gen_random_uuid(),
  professor_id integer not null references public.professores(id),
  escopo text not null check (escopo in ('unidade', 'consolidado')),
  unidade_id uuid references public.unidades(id),
  competencia date not null,
  trimestre_inicio date not null,
  revisao integer not null check (revisao > 0),
  estado text not null default 'provisorio'
    check (estado in ('provisorio', 'em_maturacao', 'fechado', 'invalidado')),
  config_id uuid not null
    references public.health_score_professor_v3_config_versoes(id),
  config_versao integer not null,
  score numeric(6,2) check (score is null or score between 0 and 100),
  cobertura numeric(5,2) not null default 0
    check (cobertura between 0 and 100),
  classificacao text not null default 'sem_base'
    check (classificacao in ('saudavel', 'atencao', 'critico', 'sem_base')),
  publicavel boolean not null default false,
  publicado boolean not null default false,
  motivo_bloqueio text,
  regra_versao text not null default 'health-score-professor-v3-motor-1',
  snapshot_anterior_id uuid
    references public.health_score_professor_v3_snapshots(id),
  justificativa_retificacao text,
  criado_por integer references public.usuarios(id),
  criado_em timestamptz not null default now(),
  fechado_em timestamptz,
  invalidado_em timestamptz,
  constraint health_score_professor_v3_snapshot_competencia_chk check (
    competencia = date_trunc('month', competencia)::date
    and trimestre_inicio = date_trunc('quarter', competencia)::date
  ),
  constraint health_score_professor_v3_snapshot_publicacao_chk check (
    not publicado or (estado = 'fechado' and publicavel)
  ),
  constraint health_score_professor_v3_snapshot_escopo_chk check (
    (escopo = 'unidade' and unidade_id is not null)
    or (escopo = 'consolidado' and unidade_id is null)
  )
);

create table if not exists public.health_score_professor_v3_snapshot_metricas (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null
    references public.health_score_professor_v3_snapshots(id)
    on delete restrict,
  metrica text not null
    check (metrica in (
      'retencao',
      'permanencia',
      'conversao',
      'media_turma',
      'numero_alunos',
      'presenca'
    )),
  valor_bruto numeric,
  numerador numeric,
  denominador numeric,
  amostra integer,
  estado_base text not null,
  publicavel boolean not null default false,
  confianca text not null,
  fonte text not null,
  regra_versao text not null,
  motivo_sem_base text,
  detalhes jsonb not null default '{}'::jsonb,
  nota numeric(6,2) check (nota is null or nota between 0 and 100),
  peso numeric(5,2) not null check (peso > 0 and peso <= 100),
  peso_disponivel boolean not null default false,
  contribuicao numeric(8,4),
  meta_aplicada numeric(14,4),
  criado_em timestamptz not null default now(),
  unique (snapshot_id, metrica)
);

create unique index if not exists
  ux_health_score_professor_v3_snapshot_unidade_revisao
  on public.health_score_professor_v3_snapshots (
    professor_id,
    unidade_id,
    competencia,
    revisao
  )
  where unidade_id is not null;

create unique index if not exists
  ux_health_score_professor_v3_snapshot_consolidado_revisao
  on public.health_score_professor_v3_snapshots (
    professor_id,
    competencia,
    revisao
  )
  where unidade_id is null;

create unique index if not exists
  ux_health_score_professor_v3_snapshot_unidade_fechado
  on public.health_score_professor_v3_snapshots (
    professor_id,
    unidade_id,
    competencia
  )
  where unidade_id is not null and estado = 'fechado';

create unique index if not exists
  ux_health_score_professor_v3_snapshot_consolidado_fechado
  on public.health_score_professor_v3_snapshots (
    professor_id,
    competencia
  )
  where unidade_id is null and estado = 'fechado';

create index if not exists idx_health_score_professor_v3_snapshots_lookup
  on public.health_score_professor_v3_snapshots (
    competencia,
    estado,
    unidade_id,
    professor_id,
    revisao desc
  );

create index if not exists idx_health_score_professor_v3_snapshot_metricas_metrica
  on public.health_score_professor_v3_snapshot_metricas (metrica, snapshot_id);

create or replace function public.fn_health_score_professor_v3_ator_gerenciador()
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_usuario_id integer;
begin
  if coalesce(auth.role(), '') = 'service_role' or session_user = 'postgres' then
    return null;
  end if;

  select u.id
    into v_usuario_id
  from public.usuarios u
  where u.auth_user_id = auth.uid()
    and u.ativo = true
  limit 1;

  if v_usuario_id is null
     or not public.fn_usuario_atual_tem_permissao('professores.editar', null) then
    raise exception 'HEALTH_SCORE_V3_ACESSO_NEGADO: configuracao exige permissao global'
      using errcode = '42501';
  end if;

  return v_usuario_id;
end;
$$;

create or replace function public.fn_health_score_professor_v3_bloquear_config_versao()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status <> 'rascunho'
     or exists (
       select 1
       from public.health_score_professor_v3_snapshots s
       where s.config_id = old.id
         and s.estado in ('fechado', 'invalidado')
     ) then
    raise exception 'HEALTH_SCORE_V3_CONFIG_IMUTAVEL: versao ativa ou usada por snapshot fechado';
  end if;

  if tg_op = 'UPDATE' then
    new.atualizado_em := now();
    return new;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_health_score_professor_v3_config_versao_imutavel
  on public.health_score_professor_v3_config_versoes;
create trigger trg_health_score_professor_v3_config_versao_imutavel
before update or delete on public.health_score_professor_v3_config_versoes
for each row execute function public.fn_health_score_professor_v3_bloquear_config_versao();

create or replace function public.fn_health_score_professor_v3_bloquear_config_metrica()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_config_id uuid;
  v_status text;
begin
  v_config_id := case
    when tg_op = 'DELETE' then old.config_id
    else new.config_id
  end;

  select c.status
    into v_status
  from public.health_score_professor_v3_config_versoes c
  where c.id = v_config_id;

  if v_status is distinct from 'rascunho'
     or exists (
       select 1
       from public.health_score_professor_v3_snapshots s
       where s.config_id = v_config_id
         and s.estado in ('fechado', 'invalidado')
     ) then
    raise exception 'HEALTH_SCORE_V3_CONFIG_IMUTAVEL: metricas de versao ativa ou fechada';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists trg_health_score_professor_v3_config_metrica_imutavel
  on public.health_score_professor_v3_config_metricas;
create trigger trg_health_score_professor_v3_config_metrica_imutavel
before insert or update or delete on public.health_score_professor_v3_config_metricas
for each row execute function public.fn_health_score_professor_v3_bloquear_config_metrica();

create or replace function public.fn_health_score_professor_v3_bloquear_snapshot_fechado()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_controlado boolean := coalesce(
    current_setting('app.health_score_v3_mutacao_controlada', true),
    'off'
  ) = 'on';
begin
  if tg_op = 'DELETE' then
    raise exception 'HEALTH_SCORE_V3_SNAPSHOT_IMUTAVEL: snapshots nunca sao apagados';
  end if;

  if not v_controlado then
    raise exception 'HEALTH_SCORE_V3_SNAPSHOT_IMUTAVEL: use materializacao ou retificacao';
  end if;

  if row(
       new.id,
       new.professor_id,
       new.escopo,
       new.unidade_id,
       new.competencia,
       new.trimestre_inicio,
       new.revisao,
       new.config_id,
       new.config_versao,
       new.regra_versao,
       new.snapshot_anterior_id,
       new.justificativa_retificacao,
       new.criado_por,
       new.criado_em,
       new.publicado
     ) is distinct from row(
       old.id,
       old.professor_id,
       old.escopo,
       old.unidade_id,
       old.competencia,
       old.trimestre_inicio,
       old.revisao,
       old.config_id,
       old.config_versao,
       old.regra_versao,
       old.snapshot_anterior_id,
       old.justificativa_retificacao,
       old.criado_por,
       old.criado_em,
       old.publicado
     ) then
    raise exception 'HEALTH_SCORE_V3_SNAPSHOT_IMUTAVEL: identidade e regra da revisao nao mudam';
  end if;

  if old.estado = 'provisorio'
     and new.estado in ('provisorio', 'em_maturacao', 'fechado') then
    return new;
  end if;

  if old.estado = 'fechado'
     and new.estado = 'invalidado'
     and new.score is not distinct from old.score
     and new.cobertura is not distinct from old.cobertura
     and new.classificacao is not distinct from old.classificacao
     and new.fechado_em is not distinct from old.fechado_em
     and new.invalidado_em is not null
     and new.publicavel = false then
    return new;
  end if;

  raise exception 'HEALTH_SCORE_V3_SNAPSHOT_IMUTAVEL: transicao de estado nao permitida';
end;
$$;

drop trigger if exists trg_health_score_professor_v3_snapshot_imutavel
  on public.health_score_professor_v3_snapshots;
create trigger trg_health_score_professor_v3_snapshot_imutavel
before update or delete on public.health_score_professor_v3_snapshots
for each row execute function public.fn_health_score_professor_v3_bloquear_snapshot_fechado();

create or replace function public.fn_health_score_professor_v3_bloquear_metrica_fechada()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_snapshot_id uuid;
  v_estado text;
begin
  v_snapshot_id := case
    when tg_op = 'DELETE' then old.snapshot_id
    else new.snapshot_id
  end;

  select s.estado
    into v_estado
  from public.health_score_professor_v3_snapshots s
  where s.id = v_snapshot_id;

  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'HEALTH_SCORE_V3_SNAPSHOT_IMUTAVEL: metricas sao append-only';
  end if;

  if v_estado <> 'provisorio' then
    raise exception 'HEALTH_SCORE_V3_SNAPSHOT_IMUTAVEL: novas metricas exigem snapshot provisorio';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_health_score_professor_v3_snapshot_metrica_imutavel
  on public.health_score_professor_v3_snapshot_metricas;
create trigger trg_health_score_professor_v3_snapshot_metrica_imutavel
before insert or update or delete on public.health_score_professor_v3_snapshot_metricas
for each row execute function public.fn_health_score_professor_v3_bloquear_metrica_fechada();

create or replace function public.ativar_health_score_professor_v3_config(
  p_config_id uuid,
  p_justificativa text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_config public.health_score_professor_v3_config_versoes%rowtype;
  v_usuario_id integer;
  v_metricas integer;
  v_peso_total numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended('health_score_professor_v3_config', 0));
  v_usuario_id := public.fn_health_score_professor_v3_ator_gerenciador();

  if nullif(btrim(p_justificativa), '') is null then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: justificativa obrigatoria';
  end if;

  select *
    into v_config
  from public.health_score_professor_v3_config_versoes c
  where c.id = p_config_id
  for update;

  if not found then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: versao inexistente';
  end if;
  if v_config.status <> 'rascunho' then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: somente rascunho pode ser ativado';
  end if;
  if v_config.faixa_atencao_min >= v_config.faixa_saudavel_min then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: faixas incoerentes';
  end if;

  select count(distinct metrica), sum(peso)
    into v_metricas, v_peso_total
  from public.health_score_professor_v3_config_metricas
  where config_id = p_config_id;

  if v_metricas <> 6 or v_peso_total <> 100 then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: exige seis pilares e soma de pesos 100';
  end if;

  if exists (
    select 1
    from public.health_score_professor_v3_config_metricas m
    where m.config_id = p_config_id
      and m.metrica in ('media_turma', 'numero_alunos', 'permanencia')
      and m.meta is null
  ) then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: metas de calibracao ainda ausentes';
  end if;

  if exists (
    select 1
    from public.health_score_professor_v3_config_versoes c
    where c.id <> p_config_id
      and c.status = 'ativa'
      and daterange(
        c.vigencia_inicio,
        coalesce(c.vigencia_fim + 1, 'infinity'::date),
        '[)'
      ) && daterange(
        v_config.vigencia_inicio,
        coalesce(v_config.vigencia_fim + 1, 'infinity'::date),
        '[)'
      )
  ) then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: vigencia sobrepoe configuracao ativa';
  end if;

  if exists (
    select 1
    from public.health_score_professor_v3_snapshots s
    where s.config_id = p_config_id
      and s.estado = 'fechado'
  ) then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: versao ja usada por snapshot fechado';
  end if;

  update public.health_score_professor_v3_config_versoes
  set status = 'ativa',
      justificativa = btrim(p_justificativa),
      ativado_por = v_usuario_id,
      ativado_em = now(),
      atualizado_em = now()
  where id = p_config_id;

  return jsonb_build_object(
    'config_id', p_config_id,
    'versao', v_config.versao,
    'status', 'ativa',
    'vigencia_inicio', v_config.vigencia_inicio,
    'vigencia_fim', v_config.vigencia_fim
  );
end;
$$;

create or replace function public.fn_materializar_health_score_professor_v3(
  p_competencia date,
  p_config_id uuid,
  p_modo text,
  p_professor_id integer default null,
  p_unidade_id uuid default null,
  p_escopo_unico boolean default false,
  p_snapshot_anterior_id uuid default null,
  p_justificativa_retificacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_config public.health_score_professor_v3_config_versoes%rowtype;
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_scope record;
  v_alvo record;
  v_snapshot_id uuid;
  v_snapshot_ids jsonb := '[]'::jsonb;
  v_revisao integer;
  v_estado_final text;
  v_cobertura numeric;
  v_score_candidato numeric;
  v_score numeric;
  v_tem_fidelizacao boolean;
  v_base_suficiente boolean;
  v_publicavel boolean;
  v_classificacao text;
  v_motivo text;
  v_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user <> 'postgres' then
    raise exception 'HEALTH_SCORE_V3_ACESSO_NEGADO: materializacao interna'
      using errcode = '42501';
  end if;

  select * into v_config
  from public.health_score_professor_v3_config_versoes c
  where c.id = p_config_id;
  if not found then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: versao inexistente';
  end if;

  if (
    select count(distinct m.metrica) <> 6
      or coalesce(sum(m.peso), 0) <> 100
    from public.health_score_professor_v3_config_metricas m
    where m.config_id = v_config.id
  ) then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: materializacao exige seis pilares e soma de pesos 100';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('health_score_professor_v3:' || v_competencia::text, 0)
  );

  create temporary table if not exists health_score_v3_metricas_execucao (
    metrica text not null,
    professor_id integer not null,
    professor_nome text,
    unidade_id uuid,
    competencia date not null,
    valor_bruto numeric,
    numerador numeric,
    denominador numeric,
    amostra integer,
    estado_base text,
    publicavel boolean,
    confianca text,
    fonte text,
    regra_versao text,
    motivo_sem_base text,
    detalhes jsonb
  ) on commit drop;
  truncate table health_score_v3_metricas_execucao;

  for v_scope in
    select escopos.unidade_id
    from (
      select u.id as unidade_id
      from public.unidades u
      where u.ativo = true and not p_escopo_unico
      union all
      select null::uuid where not p_escopo_unico
      union all
      select p_unidade_id where p_escopo_unico
    ) escopos
  loop
    insert into health_score_v3_metricas_execucao
    select 'conversao', x.*
    from public.get_professor_conversao_v3_sombra(v_competencia, v_scope.unidade_id) x
    where p_professor_id is null or x.professor_id = p_professor_id;

    insert into health_score_v3_metricas_execucao
    select 'media_turma', x.*
    from public.get_professor_media_turma_v3_sombra(v_competencia, v_scope.unidade_id) x
    where p_professor_id is null or x.professor_id = p_professor_id;

    insert into health_score_v3_metricas_execucao
    select 'numero_alunos', x.*
    from public.get_professor_numero_alunos_v3_sombra(v_competencia, v_scope.unidade_id) x
    where p_professor_id is null or x.professor_id = p_professor_id;

    insert into health_score_v3_metricas_execucao
    select 'retencao', x.*
    from public.get_professor_retencao_v3_sombra(v_competencia, v_scope.unidade_id) x
    where p_professor_id is null or x.professor_id = p_professor_id;

    insert into health_score_v3_metricas_execucao
    select 'permanencia', x.*
    from public.get_professor_permanencia_v3_sombra(v_competencia, v_scope.unidade_id) x
    where p_professor_id is null or x.professor_id = p_professor_id;

    insert into health_score_v3_metricas_execucao
    select 'presenca', x.*
    from public.get_professor_presenca_v3_sombra(v_competencia, v_scope.unidade_id) x
    where p_professor_id is null or x.professor_id = p_professor_id;
  end loop;

  if not exists (select 1 from health_score_v3_metricas_execucao) then
    raise exception 'HEALTH_SCORE_V3_SEM_ALVOS: nenhuma metrica retornada para o recorte';
  end if;

  if p_modo = 'fechado' and exists (
    select 1
    from health_score_v3_metricas_execucao r
    where r.estado_base = 'em_maturacao'
  ) then
    raise exception 'HEALTH_SCORE_V3_FECHAMENTO_BLOQUEADO: ha metrica em maturacao';
  end if;

  for v_alvo in
    select
      r.professor_id,
      max(r.professor_nome) as professor_nome,
      r.unidade_id
    from health_score_v3_metricas_execucao r
    group by r.professor_id, r.unidade_id
    order by r.professor_id, r.unidade_id nulls last
  loop
    if p_modo = 'fechado'
       and p_snapshot_anterior_id is null
       and exists (
         select 1
         from public.health_score_professor_v3_snapshots s
         where s.professor_id = v_alvo.professor_id
           and s.unidade_id is not distinct from v_alvo.unidade_id
           and s.competencia = v_competencia
           and s.estado = 'fechado'
       ) then
      raise exception 'HEALTH_SCORE_V3_FECHAMENTO_BLOQUEADO: snapshot fechado existente; use retificacao';
    end if;

    select coalesce(max(s.revisao), 0) + 1
      into v_revisao
    from public.health_score_professor_v3_snapshots s
    where s.professor_id = v_alvo.professor_id
      and s.unidade_id is not distinct from v_alvo.unidade_id
      and s.competencia = v_competencia;

    insert into public.health_score_professor_v3_snapshots (
      professor_id,
      escopo,
      unidade_id,
      competencia,
      trimestre_inicio,
      revisao,
      estado,
      config_id,
      config_versao,
      snapshot_anterior_id,
      justificativa_retificacao
    ) values (
      v_alvo.professor_id,
      case when v_alvo.unidade_id is null then 'consolidado' else 'unidade' end,
      v_alvo.unidade_id,
      v_competencia,
      date_trunc('quarter', v_competencia)::date,
      v_revisao,
      'provisorio',
      v_config.id,
      v_config.versao,
      p_snapshot_anterior_id,
      p_justificativa_retificacao
    ) returning id into v_snapshot_id;

    with base as (
      select
        cm.metrica,
        cm.peso,
        cm.meta,
        cm.parametros,
        r.valor_bruto,
        r.numerador,
        r.denominador,
        r.amostra,
        r.estado_base,
        r.publicavel as base_publicavel,
        r.confianca,
        r.fonte,
        r.regra_versao,
        r.motivo_sem_base,
        r.detalhes
      from public.health_score_professor_v3_config_metricas cm
      left join health_score_v3_metricas_execucao r
        on r.metrica = cm.metrica
       and r.professor_id = v_alvo.professor_id
       and r.unidade_id is not distinct from v_alvo.unidade_id
      where cm.config_id = v_config.id
    ), notas as (
      select
        b.*,
        case
          when b.valor_bruto is null or b.base_publicavel is not true then null
          when b.parametros->>'normalizacao' = 'percentual_direta' then
            least(100::numeric, greatest(0::numeric, b.valor_bruto))
          when b.meta is not null and b.meta > 0 then
            least(100::numeric, greatest(0::numeric, b.valor_bruto / b.meta * 100))
          else null
        end as nota_calculada
      from base b
    )
    insert into public.health_score_professor_v3_snapshot_metricas (
      snapshot_id,
      metrica,
      valor_bruto,
      numerador,
      denominador,
      amostra,
      estado_base,
      publicavel,
      confianca,
      fonte,
      regra_versao,
      motivo_sem_base,
      detalhes,
      nota,
      peso,
      peso_disponivel,
      contribuicao,
      meta_aplicada
    )
    select
      v_snapshot_id,
      n.metrica,
      n.valor_bruto,
      n.numerador,
      n.denominador,
      n.amostra,
      coalesce(n.estado_base, 'sem_base'),
      n.nota_calculada is not null,
      coalesce(n.confianca, 'sem_base'),
      coalesce(n.fonte, 'health-score-v3-rpc-sem-linha'),
      coalesce(n.regra_versao, 'health-score-professor-v3-motor-1'),
      case
        when n.valor_bruto is null and n.motivo_sem_base is null
          then 'RPC canonica nao retornou base para o professor e escopo'
        when n.valor_bruto is not null
             and n.base_publicavel is true
             and n.nota_calculada is null
          then 'meta versionada ainda nao homologada'
        else n.motivo_sem_base
      end,
      coalesce(n.detalhes, '{}'::jsonb) || jsonb_build_object(
        'normalizacao', n.parametros->>'normalizacao',
        'meta_versionada', n.meta,
        'exclusoes_transparentes', true
      ),
      round(n.nota_calculada, 2),
      n.peso,
      n.nota_calculada is not null,
      case
        when n.nota_calculada is not null
          then round(n.nota_calculada * n.peso / 100, 4)
        else null
      end,
      n.meta
    from notas n;

    select
      coalesce(sum(m.peso) filter (where m.nota is not null), 0),
      case
        when coalesce(sum(m.peso) filter (where m.nota is not null), 0) > 0
          then round(
            sum(m.nota * m.peso) filter (where m.nota is not null)
            / sum(m.peso) filter (where m.nota is not null),
            2
          )
        else null
      end,
      coalesce(bool_or(
        m.metrica in ('retencao', 'permanencia') and m.nota is not null
      ), false)
      into v_cobertura, v_score_candidato, v_tem_fidelizacao
    from public.health_score_professor_v3_snapshot_metricas m
    where m.snapshot_id = v_snapshot_id;

    v_base_suficiente := v_cobertura >= v_config.cobertura_minima
      and (not v_config.exige_pilar_fidelizacao or v_tem_fidelizacao);
    v_score := case when v_base_suficiente then v_score_candidato else null end;

    v_classificacao := case
      when v_score is null then 'sem_base'
      when v_score >= v_config.faixa_saudavel_min then 'saudavel'
      when v_score >= v_config.faixa_atencao_min then 'atencao'
      else 'critico'
    end;

    v_estado_final := case
      when p_modo = 'provisorio' and exists (
        select 1
        from public.health_score_professor_v3_snapshot_metricas m
        where m.snapshot_id = v_snapshot_id
          and m.estado_base = 'em_maturacao'
      ) then 'em_maturacao'
      else p_modo
    end;

    v_publicavel := v_estado_final = 'fechado'
      and v_config.status = 'ativa'
      and v_base_suficiente;

    v_motivo := nullif(concat_ws('; ',
      case when v_config.status <> 'ativa' then 'configuracao em rascunho' end,
      case when v_estado_final <> 'fechado' then 'snapshot nao fechado' end,
      case when v_cobertura < v_config.cobertura_minima
        then format('cobertura %s abaixo do minimo %s', v_cobertura, v_config.cobertura_minima)
      end,
      case when v_config.exige_pilar_fidelizacao and not v_tem_fidelizacao
        then 'nenhum pilar de fidelizacao disponivel'
      end
    ), '');

    perform set_config('app.health_score_v3_mutacao_controlada', 'on', true);
    update public.health_score_professor_v3_snapshots
    set estado = v_estado_final,
        score = v_score,
        cobertura = v_cobertura,
        classificacao = v_classificacao,
        publicavel = v_publicavel,
        motivo_bloqueio = v_motivo,
        fechado_em = case when v_estado_final = 'fechado' then now() else null end
    where id = v_snapshot_id;
    perform set_config('app.health_score_v3_mutacao_controlada', 'off', true);

    v_snapshot_ids := v_snapshot_ids || jsonb_build_array(v_snapshot_id);
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'competencia', v_competencia,
    'config_id', v_config.id,
    'config_versao', v_config.versao,
    'modo', p_modo,
    'snapshots_criados', v_count,
    'snapshot_ids', v_snapshot_ids
  );
end;
$$;

create or replace function public.materializar_health_score_professor_v3(
  p_competencia date,
  p_config_versao integer,
  p_modo text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_config public.health_score_professor_v3_config_versoes%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user <> 'postgres' then
    raise exception 'HEALTH_SCORE_V3_ACESSO_NEGADO: materializacao interna'
      using errcode = '42501';
  end if;
  if p_competencia is null then
    raise exception 'HEALTH_SCORE_V3_MATERIALIZACAO_INVALIDA: competencia obrigatoria';
  end if;
  if p_modo not in ('provisorio', 'fechado') then
    raise exception 'HEALTH_SCORE_V3_MATERIALIZACAO_INVALIDA: modo deve ser provisorio ou fechado';
  end if;

  select * into v_config
  from public.health_score_professor_v3_config_versoes c
  where c.versao = p_config_versao;
  if not found then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: versao inexistente';
  end if;

  if p_modo = 'fechado' and v_config.status <> 'ativa' then
    raise exception 'HEALTH_SCORE_V3_FECHAMENTO_BLOQUEADO: configuracao nao ativa';
  end if;
  if p_modo = 'provisorio'
     and v_config.status not in ('rascunho', 'ativa') then
    raise exception 'HEALTH_SCORE_V3_MATERIALIZACAO_INVALIDA: configuracao arquivada';
  end if;
  if date_trunc('month', p_competencia)::date < v_config.vigencia_inicio
     or (
       v_config.vigencia_fim is not null
       and date_trunc('month', p_competencia)::date > v_config.vigencia_fim
     ) then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: competencia fora da vigencia';
  end if;

  return public.fn_materializar_health_score_professor_v3(
    p_competencia,
    v_config.id,
    p_modo,
    null,
    null,
    false,
    null,
    null
  );
end;
$$;

create or replace function public.retificar_health_score_professor_v3(
  p_snapshot_id uuid,
  p_config_versao integer,
  p_justificativa text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_original public.health_score_professor_v3_snapshots%rowtype;
  v_config public.health_score_professor_v3_config_versoes%rowtype;
  v_resultado jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user <> 'postgres' then
    raise exception 'HEALTH_SCORE_V3_ACESSO_NEGADO: retificacao interna'
      using errcode = '42501';
  end if;
  if nullif(btrim(p_justificativa), '') is null then
    raise exception 'HEALTH_SCORE_V3_RETIFICACAO_INVALIDA: justificativa obrigatoria';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('health_score_professor_v3_snapshot:' || p_snapshot_id::text, 0)
  );

  select * into v_original
  from public.health_score_professor_v3_snapshots s
  where s.id = p_snapshot_id
  for update;
  if not found or v_original.estado <> 'fechado' then
    raise exception 'HEALTH_SCORE_V3_RETIFICACAO_INVALIDA: snapshot fechado nao encontrado';
  end if;

  select * into v_config
  from public.health_score_professor_v3_config_versoes c
  where c.versao = p_config_versao
    and c.id = v_original.config_id
    and c.status = 'ativa';
  if not found then
    raise exception 'HEALTH_SCORE_V3_RETIFICACAO_INVALIDA: use a mesma configuracao temporal do snapshot original';
  end if;

  perform set_config('app.health_score_v3_mutacao_controlada', 'on', true);
  update public.health_score_professor_v3_snapshots
  set estado = 'invalidado',
      publicavel = false,
      motivo_bloqueio = 'substituido por retificacao: ' || btrim(p_justificativa),
      invalidado_em = now()
  where id = p_snapshot_id;

  v_resultado := public.fn_materializar_health_score_professor_v3(
    v_original.competencia,
    v_config.id,
    'fechado',
    v_original.professor_id,
    v_original.unidade_id,
    true,
    v_original.id,
    btrim(p_justificativa)
  );
  perform set_config('app.health_score_v3_mutacao_controlada', 'off', true);

  if coalesce((v_resultado->>'snapshots_criados')::integer, 0) <> 1 then
    raise exception 'HEALTH_SCORE_V3_RETIFICACAO_INVALIDA: retificacao nao gerou uma unica revisao';
  end if;

  return v_resultado || jsonb_build_object(
    'snapshot_invalidado_id', p_snapshot_id,
    'justificativa', btrim(p_justificativa)
  );
end;
$$;

alter table public.health_score_professor_v3_config_versoes enable row level security;
alter table public.health_score_professor_v3_config_metricas enable row level security;
alter table public.health_score_professor_v3_snapshots enable row level security;
alter table public.health_score_professor_v3_snapshot_metricas enable row level security;

revoke all on table public.health_score_professor_v3_config_versoes
  from public, anon, authenticated;
revoke all on table public.health_score_professor_v3_config_metricas
  from public, anon, authenticated;
revoke all on table public.health_score_professor_v3_snapshots
  from public, anon, authenticated;
revoke all on table public.health_score_professor_v3_snapshot_metricas
  from public, anon, authenticated;

grant select
  on table public.health_score_professor_v3_config_versoes to service_role;
grant select
  on table public.health_score_professor_v3_config_metricas to service_role;
grant select
  on table public.health_score_professor_v3_snapshots to service_role;
grant select
  on table public.health_score_professor_v3_snapshot_metricas to service_role;

revoke all on function public.fn_health_score_professor_v3_ator_gerenciador()
  from public, anon, authenticated;
grant execute on function public.fn_health_score_professor_v3_ator_gerenciador()
  to service_role;

revoke all on function public.ativar_health_score_professor_v3_config(uuid, text)
  from public, anon, authenticated;
grant execute on function public.ativar_health_score_professor_v3_config(uuid, text)
  to authenticated, service_role;

revoke all on function public.fn_materializar_health_score_professor_v3(
  date, uuid, text, integer, uuid, boolean, uuid, text
) from public, anon, authenticated;
grant execute on function public.fn_materializar_health_score_professor_v3(
  date, uuid, text, integer, uuid, boolean, uuid, text
) to service_role;

revoke all on function public.materializar_health_score_professor_v3(date, integer, text)
  from public, anon, authenticated;
grant execute on function public.materializar_health_score_professor_v3(date, integer, text)
  to service_role;

revoke all on function public.retificar_health_score_professor_v3(uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.retificar_health_score_professor_v3(uuid, integer, text)
  to service_role;

revoke all on function public.fn_health_score_professor_v3_bloquear_config_versao()
  from public, anon, authenticated;
revoke all on function public.fn_health_score_professor_v3_bloquear_config_metrica()
  from public, anon, authenticated;
revoke all on function public.fn_health_score_professor_v3_bloquear_snapshot_fechado()
  from public, anon, authenticated;
revoke all on function public.fn_health_score_professor_v3_bloquear_metrica_fechada()
  from public, anon, authenticated;

with config as (
  insert into public.health_score_professor_v3_config_versoes (
    versao,
    status,
    vigencia_inicio,
    vigencia_fim,
    cobertura_minima,
    faixa_atencao_min,
    faixa_saudavel_min,
    exige_pilar_fidelizacao,
    justificativa
  ) values (
    1,
    'rascunho',
    date '2026-07-01',
    null,
    60,
    50,
    70,
    true,
    'Pesos V5 aprovados; metas de media/turma, numero de alunos e permanencia pendentes de calibracao.'
  )
  on conflict (versao) do update
    set atualizado_em = public.health_score_professor_v3_config_versoes.atualizado_em
  returning id
), config_alvo as (
  select id from config
  union all
  select id
  from public.health_score_professor_v3_config_versoes
  where versao = 1
    and not exists (select 1 from config)
), metricas(metrica, peso, meta, amostra_minima, cobertura_minima, parametros) as (
  values
    ('retencao', 25::numeric, null::numeric, 10, null::numeric,
      '{"normalizacao":"percentual_direta"}'::jsonb),
    ('permanencia', 25::numeric, null::numeric, 3, null::numeric,
      '{"normalizacao":"meta_versionada","corte_minimo_meses":4,"exibir_mediana":true}'::jsonb),
    ('conversao', 15::numeric, null::numeric, 3, null::numeric,
      '{"normalizacao":"percentual_direta","maturacao_dias":30}'::jsonb),
    ('media_turma', 15::numeric, null::numeric, 1, null::numeric,
      '{"normalizacao":"meta_versionada","agregacao":"ocupacoes_sobre_turmas"}'::jsonb),
    ('numero_alunos', 10::numeric, null::numeric, 3, null::numeric,
      '{"normalizacao":"meta_versionada","agregacao":"media_tres_fechamentos"}'::jsonb),
    ('presenca', 10::numeric, null::numeric, 10, 95::numeric,
      '{"normalizacao":"percentual_direta","inicio_pontuacao":"2026-08-03"}'::jsonb)
)
insert into public.health_score_professor_v3_config_metricas (
  config_id,
  metrica,
  peso,
  meta,
  amostra_minima,
  cobertura_minima,
  parametros
)
select
  c.id,
  m.metrica,
  m.peso,
  m.meta,
  m.amostra_minima,
  m.cobertura_minima,
  m.parametros
from config_alvo c
cross join metricas m
on conflict (config_id, metrica) do nothing;

comment on table public.health_score_professor_v3_config_versoes is
  'Gate 5: configuracoes temporais e versionadas do Health Score Professor V3.';
comment on table public.health_score_professor_v3_snapshots is
  'Gate 5: snapshots mensais/trimestrais em sombra; fechado e imutavel.';
comment on function public.materializar_health_score_professor_v3(date, integer, text) is
  'Gate 5: materializa revisao provisoria ou fechada usando exclusivamente as seis RPCs do Gate 4.';
comment on function public.retificar_health_score_professor_v3(uuid, integer, text) is
  'Gate 5: invalida um snapshot fechado sem apagar historico e cria nova revisao auditada.';
