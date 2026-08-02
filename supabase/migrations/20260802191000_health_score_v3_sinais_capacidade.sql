begin;

alter table public.cursos
  add column if not exists capacidade_maxima integer;

comment on column public.cursos.capacidade_maxima is
  'Limite fisico global opcional do curso. Turma e sala reais prevalecem; configuracao segmentada e apenas estimativa diagnostica.';

create or replace function public.resolver_health_score_professor_v3_capacidade(
  p_capacidade_turma integer,
  p_capacidade_sala integer,
  p_capacidade_curso integer,
  p_capacidade_segmento numeric
)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $function$
  with fisicas as (
    select capacidade, fonte, prioridade
    from (values
      (case when p_capacidade_turma > 0 then p_capacidade_turma end, 'turma'::text, 1),
      (case when p_capacidade_sala > 0 then p_capacidade_sala end, 'sala'::text, 2),
      (case when p_capacidade_curso > 0 then p_capacidade_curso end, 'curso'::text, 3)
    ) as limites(capacidade, fonte, prioridade)
    where capacidade is not null
  ), resolvida as (
    select
      least(
        coalesce(min(capacidade), 2147483647),
        coalesce(min(capacidade), 2147483647)
      )::numeric as capacidade,
      (
        select f.fonte
        from fisicas f
        order by f.capacidade, f.prioridade
        limit 1
      ) as fonte
    from fisicas
  )
  select case
    when r.fonte is not null then jsonb_build_object(
      'capacidade', r.capacidade,
      'fonte', r.fonte,
      'fisica', true
    )
    when p_capacidade_segmento > 0 then jsonb_build_object(
      'capacidade', p_capacidade_segmento,
      'fonte', 'estimada_segmento',
      'fisica', false
    )
    else jsonb_build_object(
      'capacidade', null,
      'fonte', 'sem_referencia',
      'fisica', false
    )
  end
  from resolvida r;
$function$;

revoke all on function
  public.resolver_health_score_professor_v3_capacidade(
    integer, integer, integer, numeric
  ) from public, anon, authenticated;
grant execute on function
  public.resolver_health_score_professor_v3_capacidade(
    integer, integer, integer, numeric
  ) to service_role;

create or replace function public.get_health_score_professor_v3_capacidade_diagnostico(
  p_competencia date,
  p_unidade_id uuid
)
returns table (
  professor_id integer,
  unidade_id uuid,
  curso_id integer,
  modalidade text,
  turma_chave text,
  turma_explicita_id integer,
  sala_id integer,
  ocupacoes_unicas integer,
  capacidade numeric,
  fonte_capacidade text,
  capacidade_fisica boolean,
  capacidade_excedida boolean,
  evidencias jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  perform public.fn_health_score_professor_v3_ator_leitura(p_unidade_id);

  if p_competencia is null or p_unidade_id is null then
    raise exception 'HEALTH_SCORE_V3_CAPACIDADE_INVALIDA: competencia e unidade obrigatorias'
      using errcode = '22023';
  end if;

  return query
  with config as (
    select c.id
    from public.health_score_professor_v3_config_versoes c
    where c.status = 'ativa'
      and c.vigencia_inicio <= date_trunc('month', p_competencia)::date
      and (
        c.vigencia_fim is null
        or c.vigencia_fim >= date_trunc('month', p_competencia)::date
      )
    order by c.vigencia_inicio desc, c.versao desc
    limit 1
  ), ocupacao as (
    select
      d.professor_id,
      d.unidade_id,
      d.curso_id,
      d.modalidade,
      d.turma_chave,
      count(distinct d.pessoa_chave)::integer as ocupacoes_unicas
    from public.get_carteira_professor_periodo_detalhe_canonico_v1(
      extract(year from p_competencia)::integer,
      extract(month from p_competencia)::integer,
      p_unidade_id,
      date_trunc('month', p_competencia)::date,
      (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date
    ) d
    where d.elegivel_media
      and d.curso_resolvido
      and d.modalidade_resolvida
    group by
      d.professor_id, d.unidade_id, d.curso_id,
      d.modalidade, d.turma_chave
  ), contexto as (
    select
      o.*,
      te.id as turma_explicita_id,
      te.sala_id,
      te.capacidade_maxima as capacidade_turma,
      sa.capacidade_maxima as capacidade_sala,
      cu.capacidade_maxima as capacidade_curso,
      seg.capacidade_maxima as capacidade_segmento
    from ocupacao o
    left join lateral (
      select t.*
      from public.turmas_explicitas t
      where t.ativo = true
        and t.professor_id = o.professor_id
        and t.unidade_id = o.unidade_id
        and t.curso_id = o.curso_id
        and (
          lower(btrim(coalesce(t.nome, ''))) = lower(btrim(
            regexp_replace(o.turma_chave, '^turma:[^:]+:', '')
          ))
          or o.turma_chave = 'turma:' || o.curso_id::text || ':' || lower(btrim(coalesce(t.nome, '')))
        )
      order by
        (t.capacidade_maxima is not null) desc,
        t.id
      limit 1
    ) te on true
    left join public.salas sa
      on sa.id = te.sala_id
     and sa.unidade_id = o.unidade_id
     and sa.ativo = true
    left join public.cursos cu
      on cu.id = o.curso_id
    left join config cfg on true
    left join public.health_score_professor_v3_config_metas_curso_modalidade seg
      on seg.config_id = cfg.id
     and seg.unidade_id = o.unidade_id
     and seg.curso_id = o.curso_id
     and seg.modalidade = o.modalidade
     and seg.estado = 'configurada'
  )
  select
    c.professor_id,
    c.unidade_id,
    c.curso_id,
    c.modalidade,
    c.turma_chave,
    c.turma_explicita_id,
    c.sala_id,
    c.ocupacoes_unicas,
    (r.resolucao ->> 'capacidade')::numeric,
    r.resolucao ->> 'fonte',
    coalesce((r.resolucao ->> 'fisica')::boolean, false),
    (r.resolucao ->> 'capacidade') is not null
      and c.ocupacoes_unicas > (r.resolucao ->> 'capacidade')::numeric,
    jsonb_build_object(
      'ocupacoes_unicas', c.ocupacoes_unicas,
      'capacidade_turma', c.capacidade_turma,
      'capacidade_sala', c.capacidade_sala,
      'capacidade_curso', c.capacidade_curso,
      'capacidade_segmento', c.capacidade_segmento,
      'turma_explicita_encontrada', c.turma_explicita_id is not null,
      'resolucao', r.resolucao
    )
  from contexto c
  cross join lateral (
    select public.resolver_health_score_professor_v3_capacidade(
      c.capacidade_turma,
      c.capacidade_sala,
      c.capacidade_curso,
      c.capacidade_segmento
    ) as resolucao
  ) r
  order by c.professor_id, c.curso_id, c.modalidade, c.turma_chave;
end;
$function$;

create or replace function public.get_health_score_professor_v3_sinais(
  p_competencia date,
  p_unidade_id uuid
)
returns table (
  professor_id integer,
  unidade_id uuid,
  sinal text,
  severidade text,
  evidencias jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  perform public.fn_health_score_professor_v3_ator_leitura(p_unidade_id);

  if p_competencia is null then
    raise exception 'HEALTH_SCORE_V3_SINAIS_INVALIDO: competencia obrigatoria'
      using errcode = '22023';
  end if;

  return query
  with performance as (
    select *
    from public.get_health_score_professor_v3_performance(
      p_competencia,
      p_unidade_id,
      'mensal'
    )
  ), professores as (
    select
      p.professor_id,
      p.unidade_id,
      max(p.estado) as estado,
      max(p.score) as score,
      max(p.valor_bruto) filter (where p.metrica = 'numero_alunos') as carteira,
      max(p.valor_bruto) filter (where p.metrica = 'retencao') as retencao,
      max(p.meta) filter (where p.metrica = 'retencao') as meta_retencao,
      max(p.valor_bruto) filter (where p.metrica = 'presenca') as presenca,
      max(p.meta) filter (where p.metrica = 'presenca') as meta_presenca,
      max(p.codigo_evidencia) filter (where p.metrica = 'retencao') as evidencia_retencao,
      max(p.codigo_evidencia) filter (where p.metrica = 'presenca') as evidencia_presenca,
      bool_or(p.codigo_evidencia = 'professor_em_maturacao') as em_maturacao
    from performance p
    group by p.professor_id, p.unidade_id
  ), percentis as (
    select
      percentile_cont(0.5) within group (order by f.carteira) as p50,
      percentile_cont(0.75) within group (order by f.carteira) as p75
    from professores f
    where f.carteira is not null
  ), capacidade as (
    select
      d.professor_id,
      d.unidade_id,
      bool_or(d.capacidade_excedida) as excedida,
      jsonb_agg(d.evidencias order by d.curso_id, d.turma_chave)
        filter (where d.capacidade_excedida) as evidencias
    from public.get_health_score_professor_v3_capacidade_diagnostico(
      p_competencia,
      p_unidade_id
    ) d
    where p_unidade_id is not null
    group by d.professor_id, d.unidade_id
  ), disponibilidade as (
    select
      pu.professor_id,
      pu.unidade_id,
      coalesce(pu.disponibilidade, '{}'::jsonb) not in ('{}'::jsonb, '[]'::jsonb)
        as disponivel
    from public.professores_unidades pu
    where p_unidade_id is null or pu.unidade_id = p_unidade_id
  ), base as (
    select
      f.*,
      q.p50,
      q.p75,
      coalesce(c.excedida, false) as capacidade_excedida,
      c.evidencias as evidencias_capacidade,
      coalesce(d.disponivel, false) as tem_disponibilidade,
      coalesce(f.retencao >= f.meta_retencao, false) as retencao_saudavel,
      coalesce(f.presenca >= f.meta_presenca, false) as presenca_saudavel
    from professores f
    cross join percentis q
    left join capacidade c
      on c.professor_id = f.professor_id
     and c.unidade_id is not distinct from f.unidade_id
    left join disponibilidade d
      on d.professor_id = f.professor_id
     and d.unidade_id is not distinct from f.unidade_id
  ), sinais as (
    select
      b.professor_id, b.unidade_id,
      'possivel_sobrecarga'::text as sinal,
      case when b.capacidade_excedida then 'alto' else 'medio' end::text as severidade,
      jsonb_build_object(
        'carteira', b.carteira, 'p75_unidade', b.p75,
        'retencao', b.retencao, 'meta_retencao', b.meta_retencao,
        'presenca', b.presenca, 'meta_presenca', b.meta_presenca,
        'capacidade_excedida', b.capacidade_excedida,
        'motivo', 'carteira_acima_p75_com_indicador_pedagogico_fragil'
      ) as evidencias
    from base b
    where b.carteira > b.p75
      and (not b.retencao_saudavel or not b.presenca_saudavel or b.capacidade_excedida)

    union all
    select b.professor_id, b.unidade_id,
      'expansao_sustentavel', 'baixo',
      jsonb_build_object(
        'carteira', b.carteira, 'p50_unidade', b.p50,
        'retencao', b.retencao, 'presenca', b.presenca,
        'motivo', 'carteira_relevante_com_indicadores_saudaveis'
      )
    from base b
    where b.carteira >= b.p50
      and b.retencao_saudavel and b.presenca_saudavel
      and not b.capacidade_excedida

    union all
    select b.professor_id, b.unidade_id,
      'oportunidade_distribuicao', 'baixo',
      jsonb_build_object(
        'carteira', b.carteira, 'p50_unidade', b.p50,
        'disponibilidade_cadastrada', b.tem_disponibilidade,
        'motivo', 'carteira_abaixo_p50_com_saude_e_disponibilidade'
      )
    from base b
    where b.carteira < b.p50
      and b.retencao_saudavel and b.presenca_saudavel
      and b.tem_disponibilidade

    union all
    select b.professor_id, b.unidade_id,
      'concentracao_operacional', 'alto',
      jsonb_build_object(
        'capacidade_excedida', true,
        'turmas', coalesce(b.evidencias_capacidade, '[]'::jsonb),
        'motivo', 'ocupacao_acima_da_capacidade_fisica_ou_estimada'
      )
    from base b
    where b.capacidade_excedida

    union all
    select b.professor_id, b.unidade_id,
      'maturacao', 'baixo',
      jsonb_build_object(
        'estado', b.estado, 'score', b.score,
        'evidencia_retencao', b.evidencia_retencao,
        'evidencia_presenca', b.evidencia_presenca,
        'motivo', 'professor_ou_base_em_maturacao'
      )
    from base b
    where b.em_maturacao or b.estado = 'em_maturacao'
  )
  select s.professor_id, s.unidade_id, s.sinal, s.severidade, s.evidencias
  from sinais s
  order by
    case s.severidade when 'alto' then 1 when 'medio' then 2 else 3 end,
    s.professor_id,
    s.sinal;
end;
$function$;

revoke all on function
  public.get_health_score_professor_v3_capacidade_diagnostico(date, uuid)
  from public, anon;
revoke all on function
  public.get_health_score_professor_v3_sinais(date, uuid)
  from public, anon;

grant execute on function
  public.get_health_score_professor_v3_capacidade_diagnostico(date, uuid)
  to authenticated, service_role;
grant execute on function
  public.get_health_score_professor_v3_sinais(date, uuid)
  to authenticated, service_role;

comment on function
  public.get_health_score_professor_v3_capacidade_diagnostico(date, uuid) is
  'Diagnostico de ocupacao por turma e sala reais; nunca altera o Health Score.';
comment on function
  public.get_health_score_professor_v3_sinais(date, uuid) is
  'Mapa diagnostico com evidencias observadas; nao pontua nem altera snapshots.';

commit;
