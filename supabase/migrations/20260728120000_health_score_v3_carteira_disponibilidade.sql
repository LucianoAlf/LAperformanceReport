begin;

create table if not exists
  public.health_score_professor_v3_carteira_politicas_unidade (
    id uuid primary key default gen_random_uuid(),
    unidade_id uuid not null references public.unidades(id),
    versao integer not null,
    vigencia_inicio date not null,
    vigencia_fim date,
    meta_alunos_hora_p50 numeric(10,4) not null
      check (meta_alunos_hora_p50 > 0),
    meta_alunos_hora_p75 numeric(10,4) not null
      check (meta_alunos_hora_p75 > 0),
    meses_maturacao integer not null default 6
      check (meses_maturacao >= 0),
    fonte text not null,
    justificativa text not null,
    decidido_por text not null,
    decidido_em timestamptz not null,
    created_at timestamptz not null default now(),
    constraint health_score_v3_carteira_politica_periodo_check
      check (vigencia_fim is null or vigencia_fim >= vigencia_inicio),
    constraint health_score_v3_carteira_politica_versao_uq
      unique (unidade_id, versao)
  );

comment on table
  public.health_score_professor_v3_carteira_politicas_unidade is
  'Politica temporal do pilar numero_alunos: meta total proporcional a disponibilidade canonica salva no LA Report.';

alter table public.health_score_professor_v3_carteira_politicas_unidade
  enable row level security;

revoke all on table
  public.health_score_professor_v3_carteira_politicas_unidade
  from public, anon, authenticated;
grant select on table
  public.health_score_professor_v3_carteira_politicas_unidade
  to service_role;

insert into public.health_score_professor_v3_carteira_politicas_unidade (
  unidade_id,
  versao,
  vigencia_inicio,
  vigencia_fim,
  meta_alunos_hora_p50,
  meta_alunos_hora_p75,
  meses_maturacao,
  fonte,
  justificativa,
  decidido_por,
  decidido_em
)
select
  u.id,
  1,
  date '2026-06-01',
  date '2026-08-31',
  x.p50,
  x.p75,
  6,
  'professores_unidades.disponibilidade',
  'P75 por unidade aprovado para o ciclo Jun-Ago/2026; P50 preservado somente como diagnostico.',
  'Alf',
  timestamptz '2026-07-28 00:00:00-03'
from (
  values
    ('Barra'::text, 0.946::numeric, 1.143::numeric),
    ('Campo Grande'::text, 1.300::numeric, 1.607::numeric),
    ('Recreio'::text, 0.921::numeric, 1.141::numeric)
) x(unidade_nome, p50, p75)
join public.unidades u on lower(u.nome) = lower(x.unidade_nome)
on conflict (unidade_id, versao) do nothing;

create or replace function public.fn_health_score_v3_disponibilidade_resumo(
  p_disponibilidade jsonb
)
returns table (
  horas_semanais numeric,
  disponibilidade_hash text,
  dias_validos integer,
  disponibilidade_normalizada jsonb
)
language sql
immutable
set search_path = public, pg_temp
as $$
  with faixas as (
    select
      e.key as dia,
      e.value ->> 'inicio' as inicio,
      e.value ->> 'fim' as fim,
      extract(epoch from (
        (e.value ->> 'fim')::time - (e.value ->> 'inicio')::time
      ))::numeric / 3600::numeric as horas
    from jsonb_each(coalesce(p_disponibilidade, '{}'::jsonb)) e
    where jsonb_typeof(e.value) = 'object'
      and e.value ? 'inicio'
      and e.value ? 'fim'
      and (e.value ->> 'inicio') ~ '^[0-2][0-9]:[0-5][0-9]$'
      and (e.value ->> 'fim') ~ '^[0-2][0-9]:[0-5][0-9]$'
      and (e.value ->> 'fim')::time > (e.value ->> 'inicio')::time
  )
  select
    round(coalesce(sum(f.horas), 0), 4),
    md5(coalesce(p_disponibilidade, '{}'::jsonb)::text),
    count(*)::integer,
    coalesce(
      jsonb_object_agg(
        f.dia,
        jsonb_build_object(
          'inicio', f.inicio,
          'fim', f.fim,
          'horas', round(f.horas, 4)
        )
        order by f.dia
      ),
      '{}'::jsonb
    )
  from faixas f;
$$;

revoke all on function
  public.fn_health_score_v3_disponibilidade_resumo(jsonb)
  from public, anon, authenticated;
grant execute on function
  public.fn_health_score_v3_disponibilidade_resumo(jsonb)
  to service_role;

comment on function
  public.fn_health_score_v3_disponibilidade_resumo(jsonb) is
  'Normaliza a disponibilidade canonica do LA Report e congela horas e hash deterministico para o snapshot V3.';

create or replace function
  public.get_health_score_professor_v3_numero_alunos_disponibilidade(
    p_competencia date,
    p_unidade_id uuid default null,
    p_periodicidade text default 'mensal'
  )
returns table (
  metrica text,
  professor_id integer,
  professor_nome text,
  unidade_id uuid,
  competencia date,
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
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_periodo record;
begin
  if p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'HEALTH_SCORE_V3_PERIODO_INVALIDO: use mensal ou ciclo';
  end if;

  select * into v_periodo
  from public.fn_health_score_v3_periodo(p_competencia, p_periodicidade);

  return query
  with carteira as (
    select c.*
    from public.get_health_score_professor_v3_carteira_periodo(
      p_competencia,
      p_unidade_id,
      p_periodicidade
    ) c
    where c.metrica = 'numero_alunos'
  ), inicio_periodos as (
    select
      v.professor_id,
      v.unidade_id,
      min(v.data_inicio)::date as data_inicio
    from public.vw_professor_periodos_efetivos_v3_sombra v
    group by v.professor_id, v.unidade_id
  ), vinculos as (
    select
      pu.professor_id,
      pu.unidade_id,
      u.nome::text as unidade_nome,
      pu.disponibilidade,
      d.horas_semanais,
      d.disponibilidade_hash,
      d.dias_validos,
      d.disponibilidade_normalizada,
      coalesce(
        ip.data_inicio,
        p.data_admissao,
        pu.created_at::date
      ) as data_inicio_vinculo_unidade,
      round(greatest(
        0::numeric,
        (v_periodo.periodo_fim - coalesce(
          ip.data_inicio,
          p.data_admissao,
          pu.created_at::date
        ))::numeric / 30.44::numeric
      ), 4) as meses_vinculo_unidade,
      pol.id as politica_id,
      pol.versao as politica_versao,
      pol.meta_alunos_hora_p50,
      pol.meta_alunos_hora_p75,
      pol.meses_maturacao,
      round(
        d.horas_semanais * pol.meta_alunos_hora_p75,
        4
      ) as meta_carteira
    from public.professores_unidades pu
    join public.professores p
      on p.id = pu.professor_id
     and p.ativo = true
    join public.unidades u
      on u.id = pu.unidade_id
     and u.ativo = true
    left join inicio_periodos ip
      on ip.professor_id = pu.professor_id
     and ip.unidade_id = pu.unidade_id
    cross join lateral
      public.fn_health_score_v3_disponibilidade_resumo(
        pu.disponibilidade
      ) d
    left join lateral (
      select cp.*
      from public.health_score_professor_v3_carteira_politicas_unidade cp
      where cp.unidade_id = pu.unidade_id
        and date_trunc('month', p_competencia)::date
          >= cp.vigencia_inicio
        and (
          cp.vigencia_fim is null
          or date_trunc('month', p_competencia)::date <= cp.vigencia_fim
        )
      order by cp.versao desc
      limit 1
    ) pol on true
    where coalesce(pu.emusys_ativo, true)
      and coalesce(pu.validacao_status, 'validado')
        not in ('ignorado', 'rejeitado')
      and (p_unidade_id is null or pu.unidade_id = p_unidade_id)
  ), agregado as (
    select
      v.professor_id,
      case
        when p_unidade_id is null then null::uuid
        else min(v.unidade_id::text)::uuid
      end as unidade_saida,
      sum(v.horas_semanais)::numeric as horas_semanais,
      sum(v.meta_carteira)::numeric as meta_carteira,
      count(*) filter (
        where v.horas_semanais <= 0 or v.dias_validos = 0
      )::integer as vinculos_sem_disponibilidade,
      count(*) filter (
        where v.politica_id is null
      )::integer as vinculos_sem_politica,
      count(*) filter (
        where v.meses_vinculo_unidade < coalesce(v.meses_maturacao, 6)
      )::integer as vinculos_em_maturacao,
      min(v.data_inicio_vinculo_unidade) as data_inicio_vinculo_unidade,
      min(v.meses_vinculo_unidade) as meses_vinculo_unidade,
      coalesce(
        jsonb_agg(jsonb_build_object(
          'unidade_id', v.unidade_id,
          'unidade_nome', v.unidade_nome,
          'horas_semanais', v.horas_semanais,
          'meta_alunos_hora_p50', v.meta_alunos_hora_p50,
          'meta_alunos_hora_p75', v.meta_alunos_hora_p75,
          'meta_carteira', v.meta_carteira,
          'disponibilidade_hash', v.disponibilidade_hash,
          'dias_validos', v.dias_validos,
          'disponibilidade_normalizada', v.disponibilidade_normalizada,
          'data_inicio_vinculo_unidade', v.data_inicio_vinculo_unidade,
          'meses_vinculo_unidade', v.meses_vinculo_unidade,
          'politica_id', v.politica_id,
          'politica_versao', v.politica_versao
        ) order by v.unidade_nome),
        '[]'::jsonb
      ) as unidades_detalhes,
      max(v.meta_alunos_hora_p50) filter (
        where p_unidade_id is not null
      ) as meta_alunos_hora_p50,
      max(v.meta_alunos_hora_p75) filter (
        where p_unidade_id is not null
      ) as meta_alunos_hora_p75,
      max(v.politica_versao) filter (
        where p_unidade_id is not null
      ) as politica_versao,
      max(v.disponibilidade_hash) filter (
        where p_unidade_id is not null
      ) as disponibilidade_hash
    from vinculos v
    group by v.professor_id
  ), avaliadas as (
    select
      c.*,
      a.horas_semanais,
      a.meta_carteira,
      a.vinculos_sem_disponibilidade,
      a.vinculos_sem_politica,
      a.vinculos_em_maturacao,
      a.data_inicio_vinculo_unidade,
      a.meses_vinculo_unidade,
      a.unidades_detalhes,
      a.meta_alunos_hora_p50,
      a.meta_alunos_hora_p75,
      a.politica_versao,
      a.disponibilidade_hash,
      case
        when a.professor_id is null
          or a.vinculos_sem_disponibilidade > 0
          then 'sem_base_disponibilidade'
        when a.vinculos_sem_politica > 0
          then 'sem_base_politica'
        when coalesce(c.valor_bruto, 0) = 0
          then 'sem_base_zero_carteira'
        when a.vinculos_em_maturacao > 0
          then 'em_maturacao'
        when a.meta_carteira is null or a.meta_carteira <= 0
          then 'sem_base_disponibilidade'
        else 'ok'
      end::text as estado_calculado
    from carteira c
    left join agregado a
      on a.professor_id = c.professor_id
     and a.unidade_saida is not distinct from c.unidade_id
  )
  select
    'numero_alunos'::text,
    a.professor_id,
    a.professor_nome,
    a.unidade_id,
    date_trunc('month', p_competencia)::date,
    a.valor_bruto,
    a.valor_bruto as numerador,
    a.meta_carteira as denominador,
    coalesce(a.valor_bruto, 0)::integer as amostra,
    a.estado_calculado,
    a.estado_calculado = 'ok' as publicavel,
    case
      when a.estado_calculado = 'ok' then 'alta'
      when a.estado_calculado = 'em_maturacao' then 'observada'
      else 'sem_base'
    end::text,
    'get_health_score_professor_v3_carteira_periodo+professores_unidades.disponibilidade'::text,
    'health-score-professor-v3-carteira-disponibilidade-1'::text,
    case a.estado_calculado
      when 'sem_base_disponibilidade'
        then 'disponibilidade canonica ausente ou sem horas validas'
      when 'sem_base_politica'
        then 'politica versionada de alunos por hora ausente'
      when 'sem_base_zero_carteira'
        then 'carteira canonica zerada; valor observado sem nota'
      when 'em_maturacao'
        then 'vinculo professor-unidade com menos de seis meses'
      else null::text
    end,
    coalesce(a.detalhes, '{}'::jsonb) || jsonb_build_object(
      'nome_exibicao', 'Numero de alunos',
      'periodicidade', p_periodicidade,
      'pessoas_canonicas_unicas', a.valor_bruto,
      'horas_semanais_aplicadas', a.horas_semanais,
      'meta_alunos_hora_p50', a.meta_alunos_hora_p50,
      'meta_alunos_hora_p75', a.meta_alunos_hora_p75,
      'meta_carteira_resultante', a.meta_carteira,
      'disponibilidade_hash', a.disponibilidade_hash,
      'data_inicio_vinculo_unidade', a.data_inicio_vinculo_unidade,
      'meses_vinculo_unidade', a.meses_vinculo_unidade,
      'politica_versao', a.politica_versao,
      'unidades', coalesce(a.unidades_detalhes, '[]'::jsonb),
      'maturacao_meses', 6,
      'meta_por_curso_somente_diagnostico', true,
      'valor_real_preservado', true
    )
  from avaliadas a;
end;
$$;

revoke all on function
  public.get_health_score_professor_v3_numero_alunos_disponibilidade(
    date, uuid, text
  )
  from public, anon, authenticated;
grant execute on function
  public.get_health_score_professor_v3_numero_alunos_disponibilidade(
    date, uuid, text
  )
  to service_role;

comment on function
  public.get_health_score_professor_v3_numero_alunos_disponibilidade(
    date, uuid, text
  ) is
  'Pilar numero_alunos pela carteira canonica de pessoas e meta total proporcional as horas salvas no LA Report.';

alter function public.materializar_health_score_professor_v3_periodo_impl(
  date, text, uuid, integer
) rename to materializar_health_score_professor_v3_periodo_impl_base_20260728;

revoke all on function
  public.materializar_health_score_professor_v3_periodo_impl_base_20260728(
    date, text, uuid, integer
  )
  from public, anon, authenticated;
grant execute on function
  public.materializar_health_score_professor_v3_periodo_impl_base_20260728(
    date, text, uuid, integer
  )
  to service_role;

create or replace function public.materializar_health_score_professor_v3_periodo_impl(
  p_competencia date,
  p_periodicidade text default 'mensal',
  p_unidade_id uuid default null,
  p_professor_id integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_resultado jsonb;
  v_snapshot record;
  v_numero record;
  v_config public.health_score_professor_v3_config_versoes%rowtype;
  v_cobertura numeric;
  v_score numeric;
  v_tem_fidelizacao boolean;
  v_classificacao text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user <> 'postgres' then
    raise exception 'HEALTH_SCORE_V3_ACESSO_NEGADO: materializacao interna'
      using errcode = '42501';
  end if;

  v_resultado :=
    public.materializar_health_score_professor_v3_periodo_impl_base_20260728(
      p_competencia,
      p_periodicidade,
      p_unidade_id,
      p_professor_id
    );

  for v_snapshot in
    select s.*
    from jsonb_array_elements_text(v_resultado -> 'snapshot_ids') j(id)
    join public.health_score_professor_v3_snapshots s
      on s.id = j.id::uuid
    where s.estado <> 'fechado'
  loop
    select n.* into v_numero
    from public.get_health_score_professor_v3_numero_alunos_disponibilidade(
      v_snapshot.competencia,
      v_snapshot.unidade_id,
      v_snapshot.periodicidade
    ) n
    where n.professor_id = v_snapshot.professor_id
      and n.unidade_id is not distinct from v_snapshot.unidade_id;

    update public.health_score_professor_v3_snapshot_metricas sm
    set
      valor_bruto = v_numero.valor_bruto,
      numerador = v_numero.numerador,
      denominador = v_numero.denominador,
      amostra = v_numero.amostra,
      estado_base = coalesce(v_numero.estado_base, 'sem_base_disponibilidade'),
      publicavel = coalesce(v_numero.publicavel, false),
      confianca = coalesce(v_numero.confianca, 'sem_base'),
      fonte = coalesce(
        v_numero.fonte,
        'professores_unidades.disponibilidade'
      ),
      regra_versao = coalesce(
        v_numero.regra_versao,
        'health-score-professor-v3-carteira-disponibilidade-1'
      ),
      motivo_sem_base = v_numero.motivo_sem_base,
      detalhes = coalesce(v_numero.detalhes, '{}'::jsonb)
        || jsonb_build_object(
          'normalizacao', 'meta_total_disponibilidade_unidade',
          'meta_por_curso_somente_diagnostico', true
        ),
      nota = case
        when coalesce(v_numero.estado_base, 'sem_base_disponibilidade') in (
          'em_maturacao',
          'sem_base_disponibilidade',
          'sem_base_zero_carteira',
          'sem_base_politica'
        ) then null::numeric
        when v_numero.publicavel
          and v_numero.denominador > 0
          then round(least(
            100::numeric,
            100::numeric * v_numero.valor_bruto
              / nullif(v_numero.denominador, 0)
          ), 2)
        else null::numeric
      end,
      peso_disponivel = (
        v_numero.publicavel
        and v_numero.denominador > 0
        and v_numero.estado_base = 'ok'
      ),
      contribuicao = case
        when v_numero.publicavel
          and v_numero.denominador > 0
          and v_numero.estado_base = 'ok'
          then round(
            least(
              100::numeric,
              100::numeric * v_numero.valor_bruto
                / nullif(v_numero.denominador, 0)
            ) * sm.peso / 100,
            4
          )
        else null::numeric
      end,
      meta_aplicada = v_numero.denominador
    where sm.snapshot_id = v_snapshot.id
      and sm.metrica = 'numero_alunos';

    update public.health_score_professor_v3_snapshot_metrica_segmentos seg
    set
      estado_base = 'diagnostico_nao_pontuavel',
      detalhes = coalesce(seg.detalhes, '{}'::jsonb)
        || jsonb_build_object(
          'diagnostico_nao_pontuavel', true,
          'nao_bloqueia_agregador', true
        )
    from public.health_score_professor_v3_snapshot_metricas sm
    where sm.id = seg.snapshot_metrica_id
      and sm.snapshot_id = v_snapshot.id
      and sm.metrica in ('media_turma', 'numero_alunos')
      and seg.atribuicao_pontuavel is not true
      and seg.estado_base in (
        'regra_ausente',
        'segmentacao_incompleta',
        'divergencia_nao_ofertada'
      );

    with segmentos_pontuaveis as (
      select s.*
      from public.health_score_professor_v3_snapshot_metrica_segmentos s
      join public.health_score_professor_v3_snapshot_metricas sm
        on sm.id = s.snapshot_metrica_id
      where s.atribuicao_pontuavel is true
        and sm.snapshot_id = v_snapshot.id
        and sm.metrica = 'media_turma'
    ), agregado as (
      select
        sum(s.ocupacoes_unicas)::numeric as ocupacoes,
        sum(s.turmas_elegiveis)::numeric as turmas,
        sum(s.numerador) filter (
          where s.numerador is not null
        )::numeric as numerador,
        sum(s.denominador) filter (
          where s.denominador is not null
        )::numeric as denominador,
        bool_or(s.estado_base in (
          'regra_ausente',
          'segmentacao_incompleta',
          'divergencia_nao_ofertada'
        )) as tem_bloqueio,
        count(*)::integer as segmentos_pontuaveis
      from segmentos_pontuaveis s
    )
    update public.health_score_professor_v3_snapshot_metricas sm
    set
      valor_bruto = case
        when a.turmas > 0
          then round(a.ocupacoes / nullif(a.turmas, 0), 2)
        else null::numeric
      end,
      numerador = a.numerador,
      denominador = a.denominador,
      amostra = coalesce(a.turmas, 0)::integer,
      estado_base = case
        when coalesce(a.segmentos_pontuaveis, 0) = 0
          or coalesce(a.turmas, 0) = 0
          then 'sem_base_sem_turmas'
        when coalesce(a.tem_bloqueio, false)
          then 'segmentacao_incompleta'
        else 'ok'
      end,
      publicavel = (
        coalesce(a.segmentos_pontuaveis, 0) > 0
        and coalesce(a.turmas, 0) > 0
        and not coalesce(a.tem_bloqueio, false)
        and coalesce(a.denominador, 0) > 0
      ),
      confianca = case
        when coalesce(a.segmentos_pontuaveis, 0) > 0
          and coalesce(a.turmas, 0) > 0
          and not coalesce(a.tem_bloqueio, false)
          and coalesce(a.denominador, 0) > 0
          then 'alta'
        else 'sem_base'
      end,
      motivo_sem_base = case
        when coalesce(a.segmentos_pontuaveis, 0) = 0
          then 'nenhuma atribuicao pontuavel para media/turma'
        when coalesce(a.turmas, 0) = 0
          then 'professor sem turma regular elegivel no periodo'
        when coalesce(a.tem_bloqueio, false)
          then 'atribuicao pontuavel ainda possui segmentacao incompleta'
        else null::text
      end,
      detalhes = coalesce(sm.detalhes, '{}'::jsonb)
        || jsonb_build_object(
          'atribuicoes_nao_pontuaveis_bloqueiam', false,
          'segmentos_pontuaveis', coalesce(a.segmentos_pontuaveis, 0),
          'normalizacao', 'segmentada_unidade_curso_modalidade'
        ),
      nota = case
        when coalesce(a.segmentos_pontuaveis, 0) > 0
          and coalesce(a.turmas, 0) > 0
          and not coalesce(a.tem_bloqueio, false)
          and coalesce(a.denominador, 0) > 0
          then round(least(
            100::numeric,
            100::numeric * a.numerador / nullif(a.denominador, 0)
          ), 2)
        else null::numeric
      end,
      peso_disponivel = (
        coalesce(a.segmentos_pontuaveis, 0) > 0
        and coalesce(a.turmas, 0) > 0
        and not coalesce(a.tem_bloqueio, false)
        and coalesce(a.denominador, 0) > 0
      ),
      contribuicao = case
        when coalesce(a.segmentos_pontuaveis, 0) > 0
          and coalesce(a.turmas, 0) > 0
          and not coalesce(a.tem_bloqueio, false)
          and coalesce(a.denominador, 0) > 0
          then round(
            least(
              100::numeric,
              100::numeric * a.numerador / nullif(a.denominador, 0)
            ) * sm.peso / 100,
            4
          )
        else null::numeric
      end
    from agregado a
    where sm.snapshot_id = v_snapshot.id
      and sm.metrica = 'media_turma';

    select * into v_config
    from public.health_score_professor_v3_config_versoes c
    where c.id = v_snapshot.config_id;

    select
      coalesce(sum(m.peso) filter (where m.nota is not null), 0),
      case
        when coalesce(sum(m.peso) filter (where m.nota is not null), 0) > 0
          then round(
            sum(m.nota * m.peso) filter (where m.nota is not null)
              / sum(m.peso) filter (where m.nota is not null),
            2
          )
        else null::numeric
      end,
      coalesce(bool_or(
        m.metrica in ('retencao', 'permanencia')
          and m.nota is not null
      ), false)
    into v_cobertura, v_score, v_tem_fidelizacao
    from public.health_score_professor_v3_snapshot_metricas m
    where m.snapshot_id = v_snapshot.id;

    if v_cobertura < v_config.cobertura_minima
      or (
        v_config.exige_pilar_fidelizacao
        and not v_tem_fidelizacao
      ) then
      v_score := null;
    end if;

    v_classificacao := case
      when v_score is null then 'sem_base'
      when v_score >= v_config.faixa_saudavel_min then 'saudavel'
      when v_score >= v_config.faixa_atencao_min then 'atencao'
      else 'critico'
    end;

    update public.health_score_professor_v3_snapshots s
    set
      score = v_score,
      cobertura = v_cobertura,
      classificacao = v_classificacao,
      estado = case
        when exists (
          select 1
          from public.health_score_professor_v3_snapshot_metricas m
          where m.snapshot_id = v_snapshot.id
            and m.estado_base = 'em_maturacao'
        ) then 'em_maturacao'
        else 'provisorio'
      end,
      publicavel = false,
      publicado = false,
      estado_publicacao = case
        when v_score is null then 'sem_base'
        else 'parcial'
      end,
      score_exibivel = v_score is not null,
      ranking_habilitado = false,
      motivo_bloqueio = case
        when v_score is null
          then 'cobertura ou pilar de fidelizacao insuficiente'
        else 'Health Score parcial; ranking e premiacao dependem do fechamento oficial do ciclo'
      end,
      regra_versao = 'health-score-professor-v3-carteira-disponibilidade-1'
    where s.id = v_snapshot.id
      and s.estado <> 'fechado';
  end loop;

  return v_resultado || jsonb_build_object(
    'carteira_regra_versao',
    'health-score-professor-v3-carteira-disponibilidade-1',
    'consumidores_alterados',
    false
  );
end;
$$;

revoke all on function
  public.materializar_health_score_professor_v3_periodo_impl(
    date, text, uuid, integer
  )
  from public, anon, authenticated;
grant execute on function
  public.materializar_health_score_professor_v3_periodo_impl(
    date, text, uuid, integer
  )
  to service_role;

comment on function
  public.materializar_health_score_professor_v3_periodo_impl(
    date, text, uuid, integer
  ) is
  'Materializa revisao provisoria V3 e aplica carteira total proporcional a disponibilidade canonica, sem trocar consumidores.';

commit;
