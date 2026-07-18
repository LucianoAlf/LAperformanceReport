-- Health Score Professor V3 - Gate 7.
-- Persiste a simulacao do rascunho e impede ativacao de uma revisao nao simulada.

create table if not exists public.health_score_professor_v3_config_simulacoes (
  id uuid primary key default gen_random_uuid(),
  config_id uuid not null
    references public.health_score_professor_v3_config_versoes(id)
    on delete restrict,
  competencia date not null,
  config_fingerprint text not null,
  resultado jsonb not null,
  simulado_por integer references public.usuarios(id),
  criado_em timestamptz not null default now(),
  constraint health_score_professor_v3_simulacao_competencia_chk
    check (competencia = date_trunc('month', competencia)::date)
);

create index if not exists idx_health_score_professor_v3_simulacoes_config
  on public.health_score_professor_v3_config_simulacoes (
    config_id,
    criado_em desc
  );

alter table public.health_score_professor_v3_config_simulacoes
  enable row level security;

revoke all on table public.health_score_professor_v3_config_simulacoes
  from public, anon, authenticated;
grant select on table public.health_score_professor_v3_config_simulacoes
  to service_role;

create or replace function public.fn_health_score_professor_v3_config_fingerprint(
  p_config_id uuid
)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select md5(jsonb_build_object(
    'config_id', c.id,
    'versao', c.versao,
    'vigencia_inicio', c.vigencia_inicio,
    'cobertura_minima', c.cobertura_minima,
    'faixa_atencao_min', c.faixa_atencao_min,
    'faixa_saudavel_min', c.faixa_saudavel_min,
    'exige_pilar_fidelizacao', c.exige_pilar_fidelizacao,
    'justificativa', c.justificativa,
    'metricas', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'metrica', m.metrica,
          'peso', m.peso,
          'meta', m.meta,
          'amostra_minima', m.amostra_minima,
          'cobertura_minima', m.cobertura_minima,
          'parametros', m.parametros
        ) order by m.metrica
      )
      from public.health_score_professor_v3_config_metricas m
      where m.config_id = c.id
    ), '[]'::jsonb)
  )::text)
  from public.health_score_professor_v3_config_versoes c
  where c.id = p_config_id;
$$;

revoke all on function public.fn_health_score_professor_v3_config_fingerprint(uuid)
  from public, anon, authenticated;

create or replace function public.simular_health_score_professor_v3_config(
  p_config_id uuid,
  p_competencia date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ator integer;
  v_config public.health_score_professor_v3_config_versoes%rowtype;
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_fingerprint text;
  v_resultado jsonb;
  v_simulacao_id uuid;
  v_simulada_em timestamptz;
begin
  v_ator := public.fn_health_score_professor_v3_ator_gerenciador();

  select c.* into v_config
  from public.health_score_professor_v3_config_versoes c
  where c.id = p_config_id;

  if not found or v_config.status <> 'rascunho' then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: somente rascunho pode ser simulado';
  end if;

  v_fingerprint := public.fn_health_score_professor_v3_config_fingerprint(p_config_id);

  with snapshots as (
    select distinct on (s.professor_id, s.unidade_id)
      s.id,
      s.professor_id,
      s.unidade_id
    from public.health_score_professor_v3_snapshots s
    where s.competencia = v_competencia
      and s.estado in ('provisorio', 'em_maturacao', 'fechado')
    order by s.professor_id, s.unidade_id, s.revisao desc
  ), metricas as (
    select
      s.id as snapshot_id,
      s.professor_id,
      s.unidade_id,
      cm.metrica,
      cm.peso,
      cm.meta,
      sm.valor_bruto,
      case
        when sm.valor_bruto is null
          or cm.meta is null
          or cm.meta <= 0
          or sm.estado_base in ('sem_base', 'em_maturacao', 'bloqueada')
          then null
        else least(100::numeric, greatest(0::numeric, sm.valor_bruto / cm.meta * 100))
      end as nota
    from snapshots s
    cross join public.health_score_professor_v3_config_metricas cm
    left join public.health_score_professor_v3_snapshot_metricas sm
      on sm.snapshot_id = s.id
     and sm.metrica = cm.metrica
    where cm.config_id = p_config_id
  ), scores as (
    select
      m.snapshot_id,
      m.professor_id,
      m.unidade_id,
      coalesce(sum(m.peso) filter (where m.nota is not null), 0) as cobertura,
      case when count(*) filter (where m.nota is not null) > 0 then
        sum(m.nota * m.peso) filter (where m.nota is not null)
        / sum(m.peso) filter (where m.nota is not null)
      end as score_candidato,
      coalesce(bool_or(
        m.metrica in ('retencao', 'permanencia') and m.nota is not null
      ), false) as tem_fidelizacao
    from metricas m
    group by m.snapshot_id, m.professor_id, m.unidade_id
  ), classificados as (
    select
      s.*,
      case
        when s.cobertura < v_config.cobertura_minima then null
        when v_config.exige_pilar_fidelizacao and not s.tem_fidelizacao then null
        else round(s.score_candidato, 2)
      end as score
    from scores s
  )
  select jsonb_build_object(
    'config_id', p_config_id,
    'config_versao', v_config.versao,
    'competencia', v_competencia,
    'total', count(*),
    'saudaveis', count(*) filter (where c.score >= v_config.faixa_saudavel_min),
    'atencao', count(*) filter (
      where c.score >= v_config.faixa_atencao_min
        and c.score < v_config.faixa_saudavel_min
    ),
    'criticos', count(*) filter (where c.score < v_config.faixa_atencao_min),
    'sem_base', count(*) filter (where c.score is null),
    'score_medio', round(avg(c.score), 2),
    'publica', false
  ) into v_resultado
  from classificados c;

  insert into public.health_score_professor_v3_config_simulacoes (
    config_id,
    competencia,
    config_fingerprint,
    resultado,
    simulado_por
  ) values (
    p_config_id,
    v_competencia,
    v_fingerprint,
    v_resultado,
    v_ator
  ) returning id, criado_em into v_simulacao_id, v_simulada_em;

  return v_resultado || jsonb_build_object(
    'simulacao_id', v_simulacao_id,
    'simulada_em', v_simulada_em,
    'config_fingerprint', v_fingerprint
  );
end;
$$;

create or replace function public.fn_health_score_professor_v3_exigir_simulacao_atual()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fingerprint text;
begin
  if old.status = 'rascunho' and new.status = 'ativa' then
    if new.justificativa is distinct from old.justificativa then
      raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: salve e simule a justificativa antes da ativacao';
    end if;

    v_fingerprint := public.fn_health_score_professor_v3_config_fingerprint(old.id);

    if not exists (
      select 1
      from public.health_score_professor_v3_config_simulacoes s
      where s.config_id = old.id
        and s.config_fingerprint = v_fingerprint
        and s.criado_em >= old.atualizado_em
    ) then
      raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: simulacao atual obrigatoria antes da ativacao';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_health_score_professor_v3_exigir_simulacao_atual
  on public.health_score_professor_v3_config_versoes;
create trigger trg_health_score_professor_v3_exigir_simulacao_atual
before update of status on public.health_score_professor_v3_config_versoes
for each row execute function public.fn_health_score_professor_v3_exigir_simulacao_atual();

revoke all on function public.simular_health_score_professor_v3_config(uuid, date)
  from public, anon, authenticated;
grant execute on function public.simular_health_score_professor_v3_config(uuid, date)
  to authenticated, service_role;

revoke all on function public.fn_health_score_professor_v3_exigir_simulacao_atual()
  from public, anon, authenticated;

comment on table public.health_score_professor_v3_config_simulacoes is
  'Gate 7: trilha append-only das simulacoes de configuracao V3, sem publicar snapshots.';
comment on function public.simular_health_score_professor_v3_config(uuid, date) is
  'Gate 7: simula e registra a revisao exata do rascunho; alteracoes posteriores exigem nova simulacao.';
