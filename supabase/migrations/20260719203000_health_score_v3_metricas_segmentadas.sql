-- Health Score Professor V3 - metricas segmentadas, Task 5.
-- Media/turma e Carteira por curso passam a usar metas exatas por
-- unidade/curso/modalidade. A migration permanece em sombra: nao publica
-- snapshots, nao ativa configuracao e nao altera consumidores V2.

-- Evidencia estruturada aditiva dos segmentos.
alter table public.health_score_professor_v3_snapshot_metrica_segmentos
  add column if not exists atribuicao_id uuid
    references public.professor_unidade_curso_modalidade(id)
    on delete restrict,
  add column if not exists atribuicao_formal boolean,
  add column if not exists atribuicao_pontuavel boolean,
  add column if not exists pessoas_unicas_total integer
    check (pessoas_unicas_total >= 0),
  add column if not exists capacidade_excedida boolean,
  add column if not exists alertas_capacidade jsonb
    check (
      alertas_capacidade is null
      or jsonb_typeof(alertas_capacidade) = 'array'
    ),
  add column if not exists divergencias jsonb
    check (
      divergencias is null
      or jsonb_typeof(divergencias) = 'object'
    );

create index if not exists
  idx_health_score_v3_snapshot_segmentos_atribuicao_id
  on public.health_score_professor_v3_snapshot_metrica_segmentos (
    atribuicao_id
  )
  where atribuicao_id is not null;

create table if not exists
  public.health_score_professor_v3_snapshot_metrica_diagnosticos (
    id uuid primary key default gen_random_uuid(),
    snapshot_metrica_id uuid not null
      references public.health_score_professor_v3_snapshot_metricas(id)
      on delete restrict,
    unidade_id uuid not null
      references public.unidades(id)
      on delete restrict,
    pessoas_unicas_total integer not null default 0
      check (pessoas_unicas_total >= 0),
    dados_sem_resolucao integer not null default 0
      check (dados_sem_resolucao >= 0),
    estados_resolucao jsonb not null default '[]'::jsonb
      check (jsonb_typeof(estados_resolucao) = 'array'),
    estado_base text not null
      check (estado_base = 'segmentacao_incompleta'),
    fonte text not null check (nullif(btrim(fonte), '') is not null),
    regra_versao text not null
      check (nullif(btrim(regra_versao), '') is not null),
    divergencias jsonb not null default '{}'::jsonb
      check (jsonb_typeof(divergencias) = 'object'),
    detalhes jsonb not null default '{}'::jsonb,
    criado_em timestamptz not null default now(),
    unique (snapshot_metrica_id, unidade_id)
  );

create index if not exists
  idx_health_score_v3_snapshot_segmento_diagnosticos_unidade
  on public.health_score_professor_v3_snapshot_metrica_diagnosticos (
    unidade_id
  );

drop trigger if exists trg_health_score_v3_snapshot_segmento_diagnostico_imutavel
  on public.health_score_professor_v3_snapshot_metrica_diagnosticos;
create trigger trg_health_score_v3_snapshot_segmento_diagnostico_imutavel
before insert or update or delete
on public.health_score_professor_v3_snapshot_metrica_diagnosticos
for each row
execute function public.fn_health_score_professor_v3_bloquear_snapshot_segmento_fechado();

alter table
  public.health_score_professor_v3_snapshot_metrica_diagnosticos
  enable row level security;

revoke all on table
  public.health_score_professor_v3_snapshot_metrica_diagnosticos
  from public, anon, authenticated, service_role;
grant select on table
  public.health_score_professor_v3_snapshot_metrica_diagnosticos
  to service_role;

do $diagnostic_grants$
declare
  role_name text;
begin
  foreach role_name in array array[
    'fabio_agent',
    'gabriel_agent',
    'juliana_agent',
    'sol_acesso_restrito'
  ]
  loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format(
        'revoke all on table public.health_score_professor_v3_snapshot_metrica_diagnosticos from %I',
        role_name
      );
    end if;
  end loop;
end;
$diagnostic_grants$;

comment on table
  public.health_score_professor_v3_snapshot_metrica_diagnosticos is
  'Diagnosticos estruturados de escopos sem curso ou modalidade oficialmente resolvidos.';
-- Fim da evidencia estruturada aditiva.

create or replace function public.get_health_score_professor_v3_metricas_segmentadas_v1(
  p_competencia date,
  p_config_id uuid,
  p_unidade_id uuid default null,
  p_periodicidade text default 'mensal'
)
returns table (
  metrica text,
  professor_id integer,
  professor_nome text,
  unidade_id uuid,
  competencia date,
  curso_id integer,
  curso_nome text,
  modalidade text,
  config_meta_segmento_id uuid,
  atribuicao_id uuid,
  atribuicao_formal boolean,
  atribuicao_pontuavel boolean,
  pessoas_unicas integer,
  pessoas_unicas_total integer,
  vinculos_ativos integer,
  turmas_elegiveis integer,
  ocupacoes_unicas integer,
  valor_observado numeric,
  capacidade_maxima numeric,
  meta_aplicada numeric,
  numerador numeric,
  denominador numeric,
  nota_segmento numeric,
  estado_base text,
  publicavel boolean,
  capacidade_excedida boolean,
  alertas_capacidade jsonb,
  fonte text,
  regra_versao text,
  linha_diagnostico boolean,
  dados_sem_resolucao integer,
  estados_resolucao jsonb,
  divergencias jsonb,
  detalhes jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with periodo as (
    select
      date_trunc('month', p_competencia)::date as competencia,
      p.periodo_inicio,
      p.periodo_fim,
      least(
        p.periodo_fim,
        (date_trunc('month', p_competencia)::date
          + interval '1 month - 1 day')::date,
        (now() at time zone 'America/Sao_Paulo')::date
      ) as fim_recorte,
      p.ciclo_codigo
    from public.fn_health_score_v3_periodo(
      p_competencia,
      p_periodicidade
    ) p
  ), unidades_permitidas as (
    select up.unidade_id
    from public.fn_health_score_v3_unidades_permitidas_sombra(
      p_unidade_id
    ) up
  ), canonico as (
    select
      d.*,
      curso.nome::text as curso_nome,
      coalesce(curso.is_projeto_banda, false) as is_projeto_banda
    from periodo p
    cross join lateral
      public.get_carteira_professor_periodo_detalhe_canonico_v1(
        extract(year from p.competencia)::integer,
        extract(month from p.competencia)::integer,
        p_unidade_id,
        p.periodo_inicio,
        p.fim_recorte
      ) d
    join unidades_permitidas up
      on up.unidade_id = d.unidade_id
    left join public.cursos curso
      on curso.id = d.curso_id
    where d.curso_id is null
       or not coalesce(curso.is_projeto_banda, false)
  ), totais_unidade as (
    select
      c.professor_id,
      c.unidade_id,
      coalesce(
        max(c.carteira_total_auditado),
        count(distinct c.pessoa_chave) filter (
          where c.pessoa_chave is not null
        )::integer,
        0
      )::integer as pessoas_unicas_total,
      coalesce(bool_or(c.segmentacao_incompleta), false)
        as segmentacao_incompleta,
      count(*) filter (
        where c.pessoa_chave is not null
          and (
            not c.curso_resolvido
            or not c.modalidade_resolvida
          )
      )::integer as dados_sem_resolucao,
      coalesce(
        jsonb_agg(distinct c.estado_resolucao)
          filter (
            where c.pessoa_chave is not null
              and c.estado_resolucao <> 'resolvido'
          ),
        '[]'::jsonb
      ) as estados_resolucao,
      coalesce(
        jsonb_agg(distinct c.fonte order by c.fonte)
          filter (where c.fonte is not null),
        '[]'::jsonb
      ) as fontes
    from canonico c
    group by c.professor_id, c.unidade_id
  ), dados_resolvidos as (
    select
      c.professor_id,
      c.unidade_id,
      c.curso_id,
      min(c.curso_nome)::text as curso_nome,
      c.modalidade,
      count(distinct c.pessoa_chave) filter (
        where c.pessoa_chave is not null
      )::integer as pessoas_unicas,
      count(distinct c.pessoa_chave) filter (
        where c.pessoa_chave is not null
      )::integer as vinculos_ativos,
      count(distinct c.turma_chave) filter (
        where c.elegivel_media
          and c.turma_chave is not null
      )::integer as turmas_elegiveis,
      count(distinct jsonb_build_array(
        c.pessoa_chave,
        c.ocupacao_chave
      )) filter (
        where c.elegivel_media
          and c.pessoa_chave is not null
      )::integer as ocupacoes_unicas,
      coalesce(bool_or(c.segmentacao_incompleta), false)
        as segmentacao_incompleta,
      coalesce(
        jsonb_agg(distinct c.fonte order by c.fonte)
          filter (where c.fonte is not null),
        '[]'::jsonb
      ) as fontes
    from canonico c
    where c.curso_resolvido
      and c.modalidade_resolvida
      and c.curso_id is not null
      and c.modalidade in ('individual', 'turma')
      and not coalesce(c.is_projeto_banda, false)
    group by
      c.professor_id,
      c.unidade_id,
      c.curso_id,
      c.modalidade
  ), ocupacao_turmas as (
    select
      c.professor_id,
      c.unidade_id,
      c.curso_id,
      c.modalidade,
      c.turma_chave,
      count(distinct jsonb_build_array(
        c.pessoa_chave,
        c.ocupacao_chave
      ))::integer as ocupacoes_unicas
    from canonico c
    where c.curso_resolvido
      and c.modalidade_resolvida
      and c.curso_id is not null
      and c.modalidade in ('individual', 'turma')
      and c.elegivel_media
      and c.turma_chave is not null
      and c.pessoa_chave is not null
      and not coalesce(c.is_projeto_banda, false)
    group by
      c.professor_id,
      c.unidade_id,
      c.curso_id,
      c.modalidade,
      c.turma_chave
  ), atribuicoes as (
    select distinct on (
      a.professor_id,
      a.unidade_id,
      a.curso_id,
      a.modalidade
    )
      a.id as atribuicao_id,
      a.professor_id,
      a.unidade_id,
      a.curso_id,
      curso.nome::text as curso_nome,
      a.modalidade,
      a.fonte as atribuicao_fonte,
      a.confianca as atribuicao_confianca,
      a.vigencia_inicio,
      a.vigencia_fim,
      a.confianca in ('alta', 'revisada') as atribuicao_pontuavel,
      a.evidencias as atribuicao_evidencias
    from public.professor_unidade_curso_modalidade a
    cross join periodo p
    join unidades_permitidas up
      on up.unidade_id = a.unidade_id
    join public.cursos curso
      on curso.id = a.curso_id
    where a.status in ('ativo', 'encerrado')
      and a.vigencia_inicio <= p.fim_recorte
      and coalesce(a.vigencia_fim, p.fim_recorte) >= p.periodo_inicio
      and not coalesce(curso.is_projeto_banda, false)
    order by
      a.professor_id,
      a.unidade_id,
      a.curso_id,
      a.modalidade,
      (a.confianca in ('alta', 'revisada')) desc,
      a.vigencia_inicio desc,
      a.id desc
  ), segmentos as (
    select
      d.professor_id,
      d.unidade_id,
      d.curso_id,
      d.modalidade
    from dados_resolvidos d
    union
    select
      a.professor_id,
      a.unidade_id,
      a.curso_id,
      a.modalidade
    from atribuicoes a
  ), regras as (
    select m.*
    from public.health_score_professor_v3_config_metas_curso_modalidade m
    where m.config_id = p_config_id
  ), alertas as (
    select
      o.professor_id,
      o.unidade_id,
      o.curso_id,
      o.modalidade,
      count(*) filter (
        where o.ocupacoes_unicas > r.capacidade_maxima
      )::integer as quantidade,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'turma_chave', o.turma_chave,
            'curso_id', o.curso_id,
            'modalidade', o.modalidade,
            'ocupacoes_unicas', o.ocupacoes_unicas,
            'capacidade_maxima', r.capacidade_maxima,
            'competencia', date_trunc('month', p_competencia)::date
          ) order by o.turma_chave
        ) filter (
          where o.ocupacoes_unicas > r.capacidade_maxima
        ),
        '[]'::jsonb
      ) as alertas_capacidade
    from ocupacao_turmas o
    join regras r
      on r.unidade_id = o.unidade_id
     and r.curso_id = o.curso_id
     and r.modalidade = o.modalidade
    group by
      o.professor_id,
      o.unidade_id,
      o.curso_id,
      o.modalidade
  ), base_segmentos as (
    select
      s.professor_id,
      s.unidade_id,
      s.curso_id,
      coalesce(d.curso_nome, a.curso_nome)::text as curso_nome,
      s.modalidade,
      r.id as config_meta_segmento_id,
      r.estado as regra_estado,
      r.capacidade_maxima,
      r.meta_media_turma,
      r.meta_carteira_curso,
      a.atribuicao_id,
      a.atribuicao_id is not null as atribuicao_formal,
      coalesce(a.atribuicao_pontuavel, false) as atribuicao_pontuavel,
      a.atribuicao_fonte,
      a.atribuicao_confianca,
      a.vigencia_inicio as atribuicao_vigencia_inicio,
      a.vigencia_fim as atribuicao_vigencia_fim,
      a.atribuicao_evidencias,
      coalesce(d.pessoas_unicas, 0)::integer as pessoas_unicas,
      coalesce(t.pessoas_unicas_total, 0)::integer as pessoas_unicas_total,
      coalesce(d.vinculos_ativos, 0)::integer as vinculos_ativos,
      coalesce(d.turmas_elegiveis, 0)::integer as turmas_elegiveis,
      coalesce(d.ocupacoes_unicas, 0)::integer as ocupacoes_unicas,
      coalesce(d.segmentacao_incompleta, false)
        or coalesce(t.segmentacao_incompleta, false)
        as segmentacao_incompleta,
      coalesce(t.dados_sem_resolucao, 0)::integer as dados_sem_resolucao,
      coalesce(t.estados_resolucao, '[]'::jsonb) as estados_resolucao,
      coalesce(al.quantidade, 0)::integer as alertas_quantidade,
      coalesce(al.alertas_capacidade, '[]'::jsonb) as alertas_capacidade,
      coalesce(d.fontes, t.fontes, '[]'::jsonb) as fontes,
      (
        coalesce(d.vinculos_ativos, 0) > 0
        or coalesce(d.turmas_elegiveis, 0) > 0
        or coalesce(d.ocupacoes_unicas, 0) > 0
      ) as tem_dado,
      false as linha_diagnostico
    from segmentos s
    left join dados_resolvidos d
      on d.professor_id = s.professor_id
     and d.unidade_id = s.unidade_id
     and d.curso_id = s.curso_id
     and d.modalidade = s.modalidade
    left join atribuicoes a
      on a.professor_id = s.professor_id
     and a.unidade_id = s.unidade_id
     and a.curso_id = s.curso_id
     and a.modalidade = s.modalidade
    left join regras r
      on r.unidade_id = s.unidade_id
     and r.curso_id = s.curso_id
     and r.modalidade = s.modalidade
    left join totais_unidade t
      on t.professor_id = s.professor_id
     and t.unidade_id = s.unidade_id
    left join alertas al
      on al.professor_id = s.professor_id
     and al.unidade_id = s.unidade_id
     and al.curso_id = s.curso_id
     and al.modalidade = s.modalidade
  ), base_diagnosticos as (
    select
      t.professor_id,
      t.unidade_id,
      null::integer as curso_id,
      null::text as curso_nome,
      null::text as modalidade,
      null::uuid as config_meta_segmento_id,
      null::text as regra_estado,
      null::numeric as capacidade_maxima,
      null::numeric as meta_media_turma,
      null::numeric as meta_carteira_curso,
      null::uuid as atribuicao_id,
      false as atribuicao_formal,
      false as atribuicao_pontuavel,
      null::text as atribuicao_fonte,
      null::text as atribuicao_confianca,
      null::date as atribuicao_vigencia_inicio,
      null::date as atribuicao_vigencia_fim,
      '{}'::jsonb as atribuicao_evidencias,
      0::integer as pessoas_unicas,
      t.pessoas_unicas_total,
      0::integer as vinculos_ativos,
      0::integer as turmas_elegiveis,
      0::integer as ocupacoes_unicas,
      true as segmentacao_incompleta,
      t.dados_sem_resolucao,
      t.estados_resolucao,
      0::integer as alertas_quantidade,
      '[]'::jsonb as alertas_capacidade,
      t.fontes,
      true as tem_dado,
      true as linha_diagnostico
    from totais_unidade t
    where t.segmentacao_incompleta
       or t.dados_sem_resolucao > 0
  ), base as (
    select * from base_segmentos
    union all
    select * from base_diagnosticos
  ), linhas_metricas as (
    select
      b.*,
      m.metrica,
      case m.metrica
        when 'media_turma' then b.meta_media_turma
        when 'numero_alunos' then b.meta_carteira_curso
      end::numeric as meta_aplicada,
      case
        when b.linha_diagnostico then 'segmentacao_incompleta'
        when b.tem_dado and not b.atribuicao_formal
          then 'segmentacao_incompleta'
        when b.atribuicao_formal and not b.atribuicao_pontuavel
          then 'segmentacao_incompleta'
        when b.config_meta_segmento_id is null then 'regra_ausente'
        when b.regra_estado = 'nao_ofertada' and b.tem_dado
          then 'divergencia_nao_ofertada'
        when b.regra_estado = 'nao_ofertada' then 'nao_ofertada'
        when m.metrica = 'media_turma' and b.turmas_elegiveis = 0
          then 'sem_base_sem_turmas'
        when m.metrica = 'numero_alunos' and b.vinculos_ativos = 0
          then 'sem_base_zero_carteira'
        else 'ok'
      end::text as estado_base_calculado
    from base b
    cross join (
      values ('media_turma'::text), ('numero_alunos'::text)
    ) m(metrica)
  ), componentes as (
    select
      l.*,
      case
        when l.estado_base_calculado = 'ok'
          and l.metrica = 'media_turma'
          then l.ocupacoes_unicas::numeric
        when l.estado_base_calculado = 'ok'
          and l.metrica = 'numero_alunos'
          and l.vinculos_ativos > 0
          then l.vinculos_ativos::numeric
        else null::numeric
      end as numerador_calculado,
      case
        when l.estado_base_calculado = 'ok'
          and l.metrica = 'media_turma'
          then l.turmas_elegiveis::numeric * l.meta_media_turma
        when l.estado_base_calculado = 'ok'
          and l.metrica = 'numero_alunos'
          and l.vinculos_ativos > 0
          then l.meta_carteira_curso
        else null::numeric
      end as denominador_calculado
    from linhas_metricas l
  )
  select
    c.metrica,
    c.professor_id,
    p.nome::text as professor_nome,
    c.unidade_id,
    date_trunc('month', p_competencia)::date as competencia,
    c.curso_id,
    c.curso_nome,
    c.modalidade,
    c.config_meta_segmento_id,
    c.atribuicao_id,
    c.atribuicao_formal,
    c.atribuicao_pontuavel,
    c.pessoas_unicas,
    c.pessoas_unicas_total,
    c.vinculos_ativos,
    c.turmas_elegiveis,
    c.ocupacoes_unicas,
    case
      when c.metrica = 'media_turma' and c.turmas_elegiveis > 0
        then round(
          c.ocupacoes_unicas::numeric / c.turmas_elegiveis::numeric,
          4
        )
      when c.metrica = 'numero_alunos'
        then c.vinculos_ativos::numeric
      else null::numeric
    end as valor_observado,
    c.capacidade_maxima,
    c.meta_aplicada,
    c.numerador_calculado as numerador,
    c.denominador_calculado as denominador,
    case
      when c.numerador_calculado is not null
        and c.denominador_calculado > 0
        then round(least(
          100::numeric,
          100::numeric * c.numerador_calculado
            / c.denominador_calculado
        ), 2)
      else null::numeric
    end as nota_segmento,
    c.estado_base_calculado as estado_base,
    c.estado_base_calculado = 'ok' as publicavel,
    c.alertas_quantidade > 0 as capacidade_excedida,
    c.alertas_capacidade,
    'get_carteira_professor_periodo_detalhe_canonico_v1'
      '+professor_unidade_curso_modalidade'
      '+health_score_professor_v3_config_metas_curso_modalidade'::text
      as fonte,
    'health-score-professor-v3-metricas-segmentadas-1'::text
      as regra_versao,
    c.linha_diagnostico,
    c.dados_sem_resolucao,
    c.estados_resolucao,
    jsonb_strip_nulls(jsonb_build_object(
      'linha_diagnostico', case when c.linha_diagnostico then true end,
      'atribuicao_ausente', case
        when c.tem_dado and not c.atribuicao_formal then true
      end,
      'atribuicao_nao_pontuavel', case
        when c.atribuicao_formal and not c.atribuicao_pontuavel then true
      end,
      'regra_ausente', case
        when c.config_meta_segmento_id is null then true
      end,
      'nao_ofertada_com_dados', case
        when c.regra_estado = 'nao_ofertada' and c.tem_dado then true
      end,
      'segmentacao_incompleta', case
        when c.segmentacao_incompleta then true
      end,
      'dados_sem_resolucao', case
        when c.dados_sem_resolucao > 0 then c.dados_sem_resolucao
      end,
      'estados_resolucao', case
        when c.dados_sem_resolucao > 0 then c.estados_resolucao
      end
    )) as divergencias,
    jsonb_strip_nulls(jsonb_build_object(
      'nome_exibicao', case
        when c.metrica = 'numero_alunos' then 'Carteira por curso'
        else 'Media de alunos por turma'
      end,
      'periodicidade', p_periodicidade,
      'config_id', p_config_id,
      'pessoas_unicas_total', c.pessoas_unicas_total,
      'vinculos_curso_modalidade', c.vinculos_ativos,
      'atribuicao_formal', c.atribuicao_formal,
      'atribuicao_pontuavel', c.atribuicao_pontuavel,
      'atribuicao_fonte', c.atribuicao_fonte,
      'atribuicao_confianca', c.atribuicao_confianca,
      'atribuicao_vigencia_inicio', c.atribuicao_vigencia_inicio,
      'atribuicao_vigencia_fim', c.atribuicao_vigencia_fim,
      'atribuicao_evidencias', c.atribuicao_evidencias,
      'fontes_canonicas', c.fontes,
      'capacidade_excedida', c.alertas_quantidade > 0,
      'alertas_capacidade', c.alertas_capacidade,
      'regra_estado', c.regra_estado,
      'valor_real_preservado', true
    )) as detalhes
  from componentes c
  join public.professores p
    on p.id = c.professor_id
  order by
    c.professor_id,
    c.unidade_id,
    c.metrica,
    c.curso_id nulls last,
    c.modalidade nulls last;
$$;

create or replace function public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
  p_competencia date,
  p_config_id uuid,
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
  detalhes jsonb,
  nota numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with detalhe as (
    select d.*
    from public.get_health_score_professor_v3_metricas_segmentadas_v1(
      p_competencia,
      p_config_id,
      p_unidade_id,
      p_periodicidade
    ) d
  ), unidades as (
    select
      d.metrica,
      d.professor_id,
      max(d.professor_nome)::text as professor_nome,
      d.unidade_id,
      max(d.pessoas_unicas_total)::integer as pessoas_unicas_total,
      coalesce(sum(d.vinculos_ativos) filter (
        where d.curso_id is not null
      ), 0)::integer as vinculos_curso_modalidade,
      coalesce(sum(d.turmas_elegiveis) filter (
        where d.curso_id is not null
      ), 0)::integer as turmas_elegiveis,
      coalesce(sum(d.ocupacoes_unicas) filter (
        where d.curso_id is not null
      ), 0)::integer as ocupacoes_unicas,
      sum(d.numerador) filter (
        where d.numerador is not null
      ) as numerador,
      sum(d.denominador) filter (
        where d.denominador is not null
      ) as denominador,
      bool_or(d.estado_base = 'regra_ausente') as tem_regra_ausente,
      bool_or(d.estado_base = 'segmentacao_incompleta')
        as tem_segmentacao_incompleta,
      bool_or(d.estado_base = 'divergencia_nao_ofertada')
        as tem_divergencia_nao_ofertada,
      count(*) filter (
        where d.estado_base = 'sem_base_zero_carteira'
      )::integer as segmentos_zero_carteira,
      count(*) filter (
        where d.estado_base = 'sem_base_sem_turmas'
      )::integer as segmentos_sem_turmas,
      count(*) filter (
        where d.capacidade_excedida
      )::integer as segmentos_capacidade_excedida,
      coalesce(
        jsonb_agg(jsonb_build_object(
          'unidade_id', d.unidade_id,
          'curso_id', d.curso_id,
          'curso_nome', d.curso_nome,
          'modalidade', d.modalidade,
          'estado_base', d.estado_base,
          'pessoas_unicas', d.pessoas_unicas,
          'vinculos_ativos', d.vinculos_ativos,
          'turmas_elegiveis', d.turmas_elegiveis,
          'ocupacoes_unicas', d.ocupacoes_unicas,
          'meta_aplicada', d.meta_aplicada,
          'numerador', d.numerador,
          'denominador', d.denominador,
          'nota_segmento', d.nota_segmento,
          'config_meta_segmento_id', d.config_meta_segmento_id,
          'atribuicao_id', d.atribuicao_id
        ) order by d.curso_id, d.modalidade)
          filter (where d.curso_id is not null),
        '[]'::jsonb
      ) as segmentos_resumo,
      coalesce(
        jsonb_agg(d.divergencias)
          filter (where d.divergencias <> '{}'::jsonb),
        '[]'::jsonb
      ) as divergencias,
      coalesce(
        jsonb_agg(d.alertas_capacidade)
          filter (where d.capacidade_excedida),
        '[]'::jsonb
      ) as alertas_capacidade
    from detalhe d
    group by d.metrica, d.professor_id, d.unidade_id
  ), agregado as (
    select
      u.metrica,
      u.professor_id,
      max(u.professor_nome)::text as professor_nome,
      p_unidade_id as unidade_saida,
      sum(u.pessoas_unicas_total)::integer as pessoas_unicas_total,
      sum(u.vinculos_curso_modalidade)::integer
        as vinculos_curso_modalidade,
      sum(u.turmas_elegiveis)::integer as turmas_elegiveis,
      sum(u.ocupacoes_unicas)::integer as ocupacoes_unicas,
      sum(u.numerador) filter (where u.numerador is not null) as numerador,
      sum(u.denominador) filter (where u.denominador is not null) as denominador,
      bool_or(u.tem_regra_ausente) as tem_regra_ausente,
      bool_or(u.tem_segmentacao_incompleta) as tem_segmentacao_incompleta,
      bool_or(u.tem_divergencia_nao_ofertada)
        as tem_divergencia_nao_ofertada,
      sum(u.segmentos_zero_carteira)::integer as segmentos_zero_carteira,
      sum(u.segmentos_sem_turmas)::integer as segmentos_sem_turmas,
      sum(u.segmentos_capacidade_excedida)::integer
        as segmentos_capacidade_excedida,
      jsonb_agg(u.segmentos_resumo order by u.unidade_id)
        as segmentos_resumo,
      jsonb_agg(u.divergencias order by u.unidade_id) as divergencias,
      jsonb_agg(u.alertas_capacidade order by u.unidade_id)
        as alertas_capacidade
    from unidades u
    group by u.metrica, u.professor_id
  ), avaliadas as (
    select
      a.*,
      (
        a.tem_regra_ausente
        or a.tem_segmentacao_incompleta
        or a.tem_divergencia_nao_ofertada
      ) as tem_bloqueio,
      case
        when a.tem_regra_ausente then 'regra_ausente'
        when a.tem_segmentacao_incompleta then 'segmentacao_incompleta'
        when a.tem_divergencia_nao_ofertada
          then 'divergencia_nao_ofertada'
        when a.denominador is null and a.metrica = 'media_turma'
          then 'sem_base_sem_turmas'
        when a.denominador is null and a.metrica = 'numero_alunos'
          then 'sem_base_zero_carteira'
        else 'ok'
      end::text as estado_base_calculado
    from agregado a
  ), pontuadas as (
    select
      a.*,
      case
        when a.tem_bloqueio then null::numeric
        when a.denominador > 0 then round(least(
          100::numeric,
          100::numeric * a.numerador / nullif(a.denominador, 0)
        ), 2)
        else null::numeric
      end as nota_segmentada
    from avaliadas a
  )
  select
    a.metrica,
    a.professor_id,
    a.professor_nome,
    a.unidade_saida as unidade_id,
    date_trunc('month', p_competencia)::date as competencia,
    case
      when a.metrica = 'media_turma' and a.turmas_elegiveis > 0
        then round(
          a.ocupacoes_unicas::numeric
            / nullif(a.turmas_elegiveis, 0),
          4
        )
      when a.metrica = 'numero_alunos'
        then a.pessoas_unicas_total::numeric
      else null::numeric
    end as valor_bruto,
    a.numerador,
    a.denominador,
    case
      when a.metrica = 'media_turma' then a.turmas_elegiveis
      else a.vinculos_curso_modalidade
    end::integer as amostra,
    a.estado_base_calculado as estado_base,
    a.estado_base_calculado = 'ok'
      and a.nota_segmentada is not null as publicavel,
    case
      when a.estado_base_calculado = 'ok' then 'alta'
      when a.tem_bloqueio then 'revisar'
      else 'sem_base'
    end::text as confianca,
    'get_health_score_professor_v3_metricas_segmentadas_v1'::text
      as fonte,
    'health-score-professor-v3-metricas-segmentadas-agregadas-1'::text
      as regra_versao,
    case
      when a.tem_regra_ausente
        then 'regra segmentada ausente; nenhuma meta de outro segmento foi usada'
      when a.tem_segmentacao_incompleta
        then 'curso, modalidade ou atribuicao formal pendente de resolucao'
      when a.tem_divergencia_nao_ofertada
        then 'segmento marcado como nao ofertado possui dados observados'
      when a.metrica = 'media_turma' and a.denominador is null
        then 'professor sem turma regular elegivel no periodo'
      when a.metrica = 'numero_alunos' and a.denominador is null
        then 'somente segmentos formais com carteira zero; peso indisponivel'
      else null::text
    end as motivo_sem_base,
    jsonb_build_object(
      'nome_exibicao', case
        when a.metrica = 'numero_alunos' then 'Carteira por curso'
        else 'Media de alunos por turma'
      end,
      'periodicidade', p_periodicidade,
      'config_id', p_config_id,
      'pessoas_unicas_total', a.pessoas_unicas_total,
      'vinculos_curso_modalidade', a.vinculos_curso_modalidade,
      'vinculos_ativos_pontuaveis', case
        when a.metrica = 'numero_alunos' then a.numerador
      end,
      'turmas_elegiveis', a.turmas_elegiveis,
      'ocupacoes_unicas', a.ocupacoes_unicas,
      'media_observada', case
        when a.metrica = 'media_turma' and a.turmas_elegiveis > 0
          then round(
            a.ocupacoes_unicas::numeric
              / nullif(a.turmas_elegiveis, 0),
            4
          )
      end,
      'meta_assentos_pontuaveis', case
        when a.metrica = 'media_turma' then a.denominador
      end,
      'metas_carteira_pontuaveis', case
        when a.metrica = 'numero_alunos' then a.denominador
      end,
      'nota_segmentada', a.nota_segmentada,
      'segmentos_zero_carteira', a.segmentos_zero_carteira,
      'segmentos_sem_turmas', a.segmentos_sem_turmas,
      'segmentos_capacidade_excedida', a.segmentos_capacidade_excedida,
      'segmentos_resumo', a.segmentos_resumo,
      'divergencias', a.divergencias,
      'alertas_capacidade', a.alertas_capacidade,
      'valor_real_preservado', true,
      'evidencia_estruturada',
        'health_score_professor_v3_snapshot_metrica_segmentos',
      'apta_oficial', p_periodicidade = 'ciclo'
        and a.estado_base_calculado = 'ok'
        and a.nota_segmentada is not null
    ) as detalhes,
    a.nota_segmentada as nota
  from pontuadas a
  order by a.professor_id, a.metrica;
$$;

revoke all on function
  public.get_health_score_professor_v3_metricas_segmentadas_v1(
    date,
    uuid,
    uuid,
    text
  )
  from public, anon, authenticated, service_role;
grant execute on function
  public.get_health_score_professor_v3_metricas_segmentadas_v1(
    date,
    uuid,
    uuid,
    text
  )
  to service_role;

revoke all on function
  public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
    date,
    uuid,
    uuid,
    text
  )
  from public, anon, authenticated, service_role;
grant execute on function
  public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
    date,
    uuid,
    uuid,
    text
  )
  to service_role;

comment on function
  public.get_health_score_professor_v3_metricas_segmentadas_v1(
    date,
    uuid,
    uuid,
    text
  ) is
  'Detalhe auditavel de Media/turma e Carteira por curso por professor, unidade, curso e modalidade oficial.';

comment on function
  public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
    date,
    uuid,
    uuid,
    text
  ) is
  'Agrega componentes segmentados; zero carteira sai do denominador, divergencias bloqueiam e o consolidado soma componentes.';

-- Remove os calculos antigos de carteira do caminho critico.
-- Os quatro pilares restantes preservam a implementacao periodica anterior;
-- media/turma e numero de alunos delegam para a fonte canonica homologada.

create or replace function public.get_health_score_professor_v3_metricas_periodo(
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
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_inicio date;
  v_fim_periodo date;
  v_fim_recorte date;
  v_codigo text;
  v_label text;
  v_meses_esperados integer;
  v_config_id uuid;
begin
  select p.periodo_inicio, p.periodo_fim, p.ciclo_codigo, p.periodo_label
    into v_inicio, v_fim_periodo, v_codigo, v_label
  from public.fn_health_score_v3_periodo(p_competencia, p_periodicidade) p;

  v_fim_recorte := least(
    v_fim_periodo,
    (v_competencia + interval '1 month - 1 day')::date,
    current_date
  );
  v_meses_esperados := case when p_periodicidade = 'ciclo' then 3 else 1 end;


  select c.id
    into v_config_id
  from public.health_score_professor_v3_config_versoes c
  where c.status = 'ativa'
    and v_competencia >= c.vigencia_inicio
    and (c.vigencia_fim is null or v_competencia <= c.vigencia_fim)
  order by c.versao desc
  limit 1;

  -- CONVERSAO EXPERIMENTAL -> MATRICULA
  return query
  with unidades_permitidas as (
    select up.unidade_id
    from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
  ), raw_vinculado as (
    select
      r.*,
      coalesce(r.aluno_id, vinculo.aluno_id) as aluno_id_resolvido,
      coalesce(
        r.emusys_aula_id::text,
        r.aula_emusys_id::text,
        'raw:' || r.id::text
      ) as evento_chave
    from public.emusys_experimentais_raw r
    join unidades_permitidas up on up.unidade_id = r.unidade_id
    left join lateral (
      select coalesce(le.aluno_id, l.aluno_id, a_origem.id) as aluno_id
      from public.lead_experimentais le
      left join public.leads l on l.id = le.lead_id
      left join public.alunos a_origem
        on a_origem.lead_origem_id = le.lead_id
       and a_origem.unidade_id = le.unidade_id
      where le.unidade_id = r.unidade_id
        and le.data_experimental = r.data_aula
        and (
          le.id = r.lead_experimental_id
          or (r.lead_id is not null and le.lead_id = r.lead_id)
          or (
            nullif(r.payload #>> '{aluno,id_lead}', '') ~ '^[0-9]+$'
            and le.emusys_lead_id = (r.payload #>> '{aluno,id_lead}')::bigint
          )
        )
      order by
        (le.id = r.lead_experimental_id) desc,
        (le.professor_experimental_id = r.professor_id) desc,
        le.id desc
      limit 1
    ) vinculo on true
    where r.data_aula between v_inicio and v_fim_recorte
      and r.professor_id is not null
      and r.situacao_operacional in ('presente', 'matriculado')
  ), experimentais as (
    select distinct on (r.unidade_id, r.evento_chave)
      r.unidade_id,
      r.professor_id,
      r.evento_chave,
      r.data_aula,
      i.pessoa_chave
    from raw_vinculado r
    left join public.vw_aluno_identidade_unidade_canonica i
      on i.unidade_id = r.unidade_id
     and r.aluno_id_resolvido = any(i.aluno_ids_locais)
    order by r.unidade_id, r.evento_chave, r.id desc
  ), matriculas as (
    select distinct
      a.unidade_id,
      coalesce(nullif(a.emusys_matricula_id, ''), 'local:' || a.id::text)
        as matricula_chave,
      i.pessoa_chave,
      a.data_matricula
    from public.alunos a
    join unidades_permitidas up on up.unidade_id = a.unidade_id
    left join public.vw_aluno_identidade_unidade_canonica i
      on i.unidade_id = a.unidade_id
     and a.id = any(i.aluno_ids_locais)
    where a.data_matricula between v_inicio
      and least(v_fim_periodo + 30, current_date)
      and lower(coalesce(a.status, '')) <> 'excluido'
  ), candidatos as (
    select
      m.unidade_id,
      m.matricula_chave,
      m.data_matricula,
      e.professor_id,
      e.evento_chave,
      e.data_aula,
      row_number() over (
        partition by m.unidade_id, m.matricula_chave
        order by e.data_aula desc, e.evento_chave desc
      ) as ordem_matricula
    from matriculas m
    join experimentais e
      on e.unidade_id = m.unidade_id
     and e.pessoa_chave = m.pessoa_chave
     and m.data_matricula between e.data_aula and e.data_aula + 30
    where m.pessoa_chave is not null
  ), candidatos_unicos as (
    select c.*,
      row_number() over (
        partition by c.unidade_id, c.evento_chave
        order by c.data_matricula, c.matricula_chave
      ) as ordem_experimental
    from candidatos c
    where c.ordem_matricula = 1
  ), creditos as (
    select c.* from candidatos_unicos c where c.ordem_experimental = 1
  ), alvo as (
    select distinct pu.professor_id,
      case when p_unidade_id is null then null::uuid else pu.unidade_id end
        as unidade_saida
    from public.professores_unidades pu
    join unidades_permitidas up on up.unidade_id = pu.unidade_id
    where coalesce(pu.emusys_ativo, true)
      and coalesce(pu.validacao_status, 'validado') not in ('ignorado', 'rejeitado')
    union
    select distinct e.professor_id,
      case when p_unidade_id is null then null::uuid else e.unidade_id end
    from experimentais e
  ), estatisticas as (
    select e.professor_id,
      case when p_unidade_id is null then null::uuid else e.unidade_id end
        as unidade_saida,
      count(distinct e.evento_chave)::integer as experimentais,
      count(distinct e.evento_chave) filter (where e.pessoa_chave is null)::integer
        as sem_identidade
    from experimentais e
    group by e.professor_id,
      case when p_unidade_id is null then null::uuid else e.unidade_id end
  ), conversoes as (
    select c.professor_id,
      case when p_unidade_id is null then null::uuid else c.unidade_id end
        as unidade_saida,
      count(distinct c.matricula_chave)::integer as matriculas
    from creditos c
    group by c.professor_id,
      case when p_unidade_id is null then null::uuid else c.unidade_id end
  )
  select
    'conversao'::text,
    a.professor_id,
    pr.nome::text,
    a.unidade_saida,
    v_competencia,
    case when coalesce(e.experimentais, 0) > 0 then round(
      least(coalesce(c.matriculas, 0), e.experimentais)::numeric
      / e.experimentais::numeric * 100, 2
    ) else null end,
    least(coalesce(c.matriculas, 0), coalesce(e.experimentais, 0))::numeric,
    coalesce(e.experimentais, 0)::numeric,
    coalesce(e.experimentais, 0),
    case
      when coalesce(e.experimentais, 0) = 0 then 'sem_base'
      when e.experimentais < 3 then 'sem_base_amostra'
      when e.sem_identidade > 0 then 'revisar'
      when current_date < v_fim_periodo + 30 then 'em_maturacao'
      else 'ok'
    end,
    coalesce(e.experimentais, 0) >= 3 and coalesce(e.sem_identidade, 0) = 0,
    case
      when coalesce(e.experimentais, 0) = 0 then 'sem_base'
      when e.sem_identidade > 0 then 'media'
      when current_date < v_fim_periodo + 30 then 'provisoria'
      else 'alta'
    end,
    'emusys_experimentais_raw+vw_aluno_identidade_unidade_canonica+alunos'::text,
    'health-score-professor-v3-conversao-periodo-1'::text,
    case
      when coalesce(e.experimentais, 0) = 0 then 'nenhuma experimental confirmada no periodo'
      when e.experimentais < 3 then 'base minima de 3 experimentais nao atingida'
      when e.sem_identidade > 0 then 'ha experimentais sem pessoa canonica resolvida'
      when current_date < v_fim_periodo + 30 then 'janela D+30 ainda em maturacao'
      else null
    end,
    jsonb_build_object(
      'periodicidade', p_periodicidade,
      'periodo_inicio', v_inicio,
      'periodo_fim', v_fim_periodo,
      'fim_recorte', v_fim_recorte,
      'ciclo_codigo', v_codigo,
      'experimentais_confirmadas', coalesce(e.experimentais, 0),
      'matriculas_creditadas', least(coalesce(c.matriculas, 0), coalesce(e.experimentais, 0)),
      'experimentais_sem_identidade', coalesce(e.sem_identidade, 0),
      'regra_credito', 'uma matricula por experimental; ultima experimental anterior em ate 30 dias',
      'apta_oficial', p_periodicidade = 'ciclo'
        and current_date >= v_fim_periodo + 30
        and coalesce(e.experimentais, 0) >= 3
        and coalesce(e.sem_identidade, 0) = 0
    )
  from alvo a
  join public.professores pr on pr.id = a.professor_id
  left join estatisticas e
    on e.professor_id = a.professor_id
   and e.unidade_saida is not distinct from a.unidade_saida
  left join conversoes c
    on c.professor_id = a.professor_id
   and c.unidade_saida is not distinct from a.unidade_saida;

  -- MEDIA/TURMA E NUMERO DE ALUNOS: metas exatas por segmento.
  -- A nota ja vem da soma dos componentes; valor_bruto continua separado.
  if coalesce(current_setting(
    'app.health_score_v3_segmentos_precarregados',
    true
  ), 'off') <> 'on' then
    return query
    select
      a.metrica,
      a.professor_id,
      a.professor_nome,
      a.unidade_id,
      a.competencia,
      a.valor_bruto,
      a.numerador,
      a.denominador,
      a.amostra,
      a.estado_base,
      a.publicavel,
      a.confianca,
      a.fonte,
      a.regra_versao,
      a.motivo_sem_base,
      a.detalhes
    from public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
      p_competencia,
      v_config_id,
      p_unidade_id,
      p_periodicidade
    ) a;
  end if;

  -- RETENCAO ATRIBUIVEL. Motivos exatos; sem similaridade ou inferencia fuzzy.
  -- Desistencia, Desanimo, Insatisfacao e aliases historicos aprovados:
  -- Abandono de Curso -> Desistencia; Perdeu o Interesse -> Desanimo.
  return query
  with unidades_permitidas as (
    select up.unidade_id
    from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
  ), periodos as (
    select pe.*
    from public.vw_professor_periodos_efetivos_v3_sombra pe
    join unidades_permitidas up on up.unidade_id = pe.unidade_id
    where pe.professor_id is not null
      and pe.status_periodo <> 'invalidado'
      and (pe.data_inicio at time zone 'America/Sao_Paulo')::date <= v_fim_recorte
      and (
        pe.data_fim is null
        or (pe.data_fim at time zone 'America/Sao_Paulo')::date >= v_inicio
      )
  ), expostos as (
    select pe.professor_id,
      case when p_unidade_id is null then null::uuid else pe.unidade_id end
        as unidade_saida,
      count(distinct pe.periodo_chave) filter (where pe.publicavel)::integer
        as vinculos_expostos,
      count(distinct pe.periodo_chave) filter (where not pe.publicavel)::integer
        as vinculos_revisao
    from periodos pe
    group by pe.professor_id,
      case when p_unidade_id is null then null::uuid else pe.unidade_id end
  ), saidas as (
    select m.professor_id,
      case when p_unidade_id is null then null::uuid else m.unidade_id end
        as unidade_saida,
      count(distinct m.id)::integer as encerramentos_atribuiveis,
      jsonb_agg(distinct jsonb_build_object(
        'movimentacao_id', m.id,
        'motivo_saida_id', m.motivo_saida_id,
        'motivo', coalesce(ms.nome, m.motivo)
      )) as movimentos
    from public.movimentacoes_admin m
    join unidades_permitidas up on up.unidade_id = m.unidade_id
    left join public.motivos_saida ms on ms.id = m.motivo_saida_id
    where lower(m.tipo) in ('evasao', 'nao_renovacao')
      and coalesce(m.mes_saida, m.data, m.competencia_referencia)
        between v_inicio and v_fim_recorte
      and m.professor_id is not null
      and (
        (m.motivo_saida_id in (5, 13, 14) and ms.conta_score_professor is true)
        or upper(btrim(coalesce(m.motivo, ''))) in (
          'DESISTENCIA', 'DESISTÃŠNCIA',
          'DESANIMO', 'DESÃ‚NIMO',
          'INSATISFACAO', 'INSATISFAÃ‡ÃƒO',
          'ABANDONO DE CURSO',
          'PERDEU O INTERESSE'
        )
      )
    group by m.professor_id,
      case when p_unidade_id is null then null::uuid else m.unidade_id end
  ), alvo as (
    select distinct p.professor_id,
      case when p_unidade_id is null then null::uuid else p.unidade_id end
        as unidade_saida
    from periodos p
  )
  select
    'retencao'::text,
    a.professor_id,
    pr.nome::text,
    a.unidade_saida,
    v_competencia,
    case when coalesce(e.vinculos_expostos, 0) > 0 then round(
      greatest(0::numeric, 100 * (
        1 - least(
          coalesce(s.encerramentos_atribuiveis, 0),
          e.vinculos_expostos
        )::numeric / e.vinculos_expostos::numeric
      )), 2
    ) else null end,
    greatest(
      coalesce(e.vinculos_expostos, 0) - least(
        coalesce(s.encerramentos_atribuiveis, 0),
        coalesce(e.vinculos_expostos, 0)
      ), 0
    )::numeric,
    coalesce(e.vinculos_expostos, 0)::numeric,
    coalesce(e.vinculos_expostos, 0),
    case
      when coalesce(e.vinculos_expostos, 0) = 0 then 'sem_base'
      when e.vinculos_expostos < 10 then 'sem_base_amostra'
      when e.vinculos_revisao > 0 then 'revisar'
      else 'ok'
    end,
    coalesce(e.vinculos_expostos, 0) >= 10,
    case
      when coalesce(e.vinculos_expostos, 0) = 0 then 'sem_base'
      when e.vinculos_expostos < 10 then 'baixa_amostra'
      when e.vinculos_revisao > 0 then 'media'
      else 'alta'
    end,
    'vw_professor_periodos_efetivos_v3_sombra+movimentacoes_admin+motivos_saida'::text,
    'health-score-professor-v3-retencao-periodo-1'::text,
    case
      when coalesce(e.vinculos_expostos, 0) = 0 then 'nenhum vinculo exposto no periodo'
      when e.vinculos_expostos < 10 then 'base minima de 10 vinculos expostos nao atingida'
      when e.vinculos_revisao > 0 then 'ha vinculos historicos em revisao, transparentes no diagnostico'
      else null
    end,
    jsonb_build_object(
      'periodicidade', p_periodicidade,
      'periodo_inicio', v_inicio,
      'periodo_fim', v_fim_periodo,
      'fim_recorte', v_fim_recorte,
      'ciclo_codigo', v_codigo,
      'vinculos_expostos', coalesce(e.vinculos_expostos, 0),
      'vinculos_em_revisao', coalesce(e.vinculos_revisao, 0),
      'encerramentos_atribuiveis', coalesce(s.encerramentos_atribuiveis, 0),
      'movimentos_atribuiveis', coalesce(s.movimentos, '[]'::jsonb),
      'motivos_exatos', jsonb_build_array(
        'Desistencia', 'Desanimo', 'Insatisfacao',
        'Abandono de Curso', 'Perdeu o Interesse'
      ),
      'apta_oficial', p_periodicidade = 'ciclo'
        and v_fim_periodo <= current_date
        and coalesce(e.vinculos_expostos, 0) >= 10
        and coalesce(e.vinculos_revisao, 0) = 0
    )
  from alvo a
  join public.professores pr on pr.id = a.professor_id
  left join expostos e
    on e.professor_id = a.professor_id
   and e.unidade_saida is not distinct from a.unidade_saida
  left join saidas s
    on s.professor_id = a.professor_id
   and s.unidade_saida is not distinct from a.unidade_saida;

  -- PERMANENCIA COM O PROFESSOR: historico acumulado, somente vinculos encerrados.
  return query
  with unidades_permitidas as (
    select up.unidade_id
    from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
  ), periodos as (
    select pe.*
    from public.vw_professor_periodos_efetivos_v3_sombra pe
    join unidades_permitidas up on up.unidade_id = pe.unidade_id
    where pe.professor_id is not null
      and (pe.data_inicio at time zone 'America/Sao_Paulo')::date <= v_fim_recorte
      and pe.status_periodo <> 'invalidado'
  ), elegiveis as (
    select p.*
    from periodos p
    where p.status_periodo = 'encerrado'
      and p.elegivel_permanencia
      and p.publicavel
      and p.confianca in ('alta', 'revisado_aprovado')
      and (p.data_fim at time zone 'America/Sao_Paulo')::date <= v_fim_recorte
  ), stats as (
    select e.professor_id,
      case when p_unidade_id is null then null::uuid else e.unidade_id end
        as unidade_saida,
      sum(e.duracao_meses) as soma_meses,
      avg(e.duracao_meses) as media_meses,
      percentile_cont(0.5) within group (order by e.duracao_meses) as mediana_meses,
      count(*)::integer as vinculos
    from elegiveis e
    group by e.professor_id,
      case when p_unidade_id is null then null::uuid else e.unidade_id end
  ), diagnostico as (
    select p.professor_id,
      case when p_unidade_id is null then null::uuid else p.unidade_id end
        as unidade_saida,
      count(*) filter (
        where p.status_periodo = 'encerrado' and not p.elegivel_permanencia
      )::integer as abaixo_quatro_meses,
      count(*) filter (
        where p.status_periodo = 'encerrado'
          and p.elegivel_permanencia
          and (not p.publicavel or p.confianca not in ('alta', 'revisado_aprovado'))
      )::integer as em_revisao,
      bool_or(p.inicio_incompleto) as historico_incompleto,
      count(*) filter (where p.status_periodo = 'ativo')::integer as ativos
    from periodos p
    group by p.professor_id,
      case when p_unidade_id is null then null::uuid else p.unidade_id end
  ), alvo as (
    select distinct p.professor_id,
      case when p_unidade_id is null then null::uuid else p.unidade_id end
        as unidade_saida
    from periodos p
  )
  select
    'permanencia'::text,
    a.professor_id,
    pr.nome::text,
    a.unidade_saida,
    v_competencia,
    case when coalesce(s.vinculos, 0) > 0 then round(s.media_meses, 2) else null end,
    coalesce(s.soma_meses, 0)::numeric,
    coalesce(s.vinculos, 0)::numeric,
    coalesce(s.vinculos, 0),
    case
      when coalesce(s.vinculos, 0) = 0 then 'sem_base'
      when s.vinculos < 3 then 'sem_base_amostra'
      when coalesce(d.em_revisao, 0) > 0 or coalesce(d.historico_incompleto, false)
        then 'parcial_auditavel'
      else 'ok'
    end,
    coalesce(s.vinculos, 0) >= 3,
    case
      when coalesce(s.vinculos, 0) = 0 then 'sem_base'
      when s.vinculos < 3 then 'baixa_amostra'
      when coalesce(d.em_revisao, 0) > 0 or coalesce(d.historico_incompleto, false)
        then 'media'
      else 'alta'
    end,
    'vw_professor_periodos_efetivos_v3_sombra'::text,
    'health-score-professor-v3-permanencia-periodo-1'::text,
    case
      when coalesce(s.vinculos, 0) = 0 then 'nenhum vinculo encerrado elegivel no historico'
      when s.vinculos < 3 then 'pontuacao exige ao menos 3 vinculos encerrados elegiveis'
      when coalesce(d.em_revisao, 0) > 0 or coalesce(d.historico_incompleto, false)
        then 'valor parcial auditavel; exclusoes historicas permanecem visiveis'
      else null
    end,
    jsonb_build_object(
      'periodicidade', p_periodicidade,
      'escopo_temporal', 'historico_acumulado_ate_competencia',
      'fim_recorte', v_fim_recorte,
      'ciclo_codigo', v_codigo,
      'media_meses', case when coalesce(s.vinculos, 0) > 0 then round(s.media_meses, 2) end,
      'mediana_auxiliar_meses', case when coalesce(s.vinculos, 0) > 0
        then round(s.mediana_meses::numeric, 2) end,
      'vinculos_encerrados_elegiveis', coalesce(s.vinculos, 0),
      'excluidos_abaixo_quatro_meses', coalesce(d.abaixo_quatro_meses, 0),
      'vinculos_em_revisao', coalesce(d.em_revisao, 0),
      'historico_incompleto', coalesce(d.historico_incompleto, false),
      'vinculos_ativos_fora_da_media', coalesce(d.ativos, 0),
      'transparencia_exclusao', 'vinculos menores que 4 meses permanecem no historico, fora da media',
      'apta_oficial', coalesce(s.vinculos, 0) >= 3
        and coalesce(d.em_revisao, 0) = 0
        and not coalesce(d.historico_incompleto, false)
    )
  from alvo a
  join public.professores pr on pr.id = a.professor_id
  left join stats s
    on s.professor_id = a.professor_id
   and s.unidade_saida is not distinct from a.unidade_saida
  left join diagnostico d
    on d.professor_id = a.professor_id
   and d.unidade_saida is not distinct from a.unidade_saida;

  -- PRESENCA DOS ALUNOS. A politica decide se o evento e pontuavel.
  return query
  with unidades_permitidas as (
    select up.unidade_id
    from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
  ), identidade_local as (
    select i.unidade_id, i.pessoa_chave, unnest(i.aluno_ids_locais) as aluno_id
    from public.vw_aluno_identidade_unidade_canonica i
    join unidades_permitidas up on up.unidade_id = i.unidade_id
  ), roster as (
    select distinct
      ae.professor_id,
      ae.unidade_id,
      ae.id as aula_id,
      ae.data_aula,
      coalesce(
        ie.pessoa_chave,
        il.pessoa_chave,
        case when aa.aluno_emusys_id is not null
          then 'emusys:' || aa.aluno_emusys_id::text end,
        case when aa.aluno_id is not null then 'local:' || aa.aluno_id::text end
      ) as pessoa_chave,
      coalesce(pol.exige_revisao_operacional, true) as exige_revisao
    from public.aulas_emusys ae
    join unidades_permitidas up on up.unidade_id = ae.unidade_id
    join public.aula_alunos_emusys aa on aa.aula_emusys_id = ae.id
    left join public.vw_aluno_identidade_unidade_canonica ie
      on ie.unidade_id = ae.unidade_id
     and ie.emusys_aluno_id = aa.aluno_emusys_id
    left join identidade_local il
      on il.unidade_id = ae.unidade_id and il.aluno_id = aa.aluno_id
    left join lateral (
      select p.exige_revisao_operacional
      from public.presenca_politicas_confiabilidade p
      where p.unidade_id = ae.unidade_id
        and p.ativa
        and ae.data_aula between p.data_inicio and p.data_fim
      order by p.data_inicio desc, p.created_at desc
      limit 1
    ) pol on true
    where ae.data_aula between v_inicio and v_fim_recorte
      and ae.professor_id is not null
      and ae.cancelada = false
      and lower(coalesce(ae.categoria, 'normal')) = 'normal'
      and coalesce(ae.sem_acompanhamento, false) = false
  ), semantica as (
    select
      s.professor_id,
      s.unidade_id,
      s.aula_emusys_id,
      s.data_aula,
      coalesce(il.pessoa_chave, 'local:' || s.aluno_id::text) as pessoa_chave,
      bool_or(s.resultado_pedagogico = 'presente') as presente,
      bool_or(s.resultado_pedagogico = 'falta_confirmada') as falta_confirmada
    from public.vw_aluno_presenca_semantica_v1 s
    join unidades_permitidas up on up.unidade_id = s.unidade_id
    left join identidade_local il
      on il.unidade_id = s.unidade_id and il.aluno_id = s.aluno_id
    where s.data_aula between v_inicio and v_fim_recorte
      and s.professor_id is not null
      and s.resultado_pedagogico in ('presente', 'falta_confirmada')
      and s.considera_frequencia_denominador
    group by s.professor_id, s.unidade_id, s.aula_emusys_id, s.data_aula,
      coalesce(il.pessoa_chave, 'local:' || s.aluno_id::text)
  ), eventos as (
    select
      r.professor_id,
      r.unidade_id,
      r.aula_id,
      r.pessoa_chave,
      r.exige_revisao,
      s.presente,
      s.falta_confirmada
    from roster r
    left join semantica s
      on s.professor_id = r.professor_id
     and s.unidade_id = r.unidade_id
     and s.aula_emusys_id = r.aula_id
     and s.pessoa_chave = r.pessoa_chave
    where r.pessoa_chave is not null
  ), stats as (
    select e.professor_id,
      case when p_unidade_id is null then null::uuid else e.unidade_id end
        as unidade_saida,
      count(*) filter (where not e.exige_revisao)::integer as esperados_confiaveis,
      count(*) filter (
        where not e.exige_revisao and (e.presente or e.falta_confirmada)
      )::integer as classificados_confiaveis,
      count(*) filter (where not e.exige_revisao and e.presente)::integer as presentes,
      count(*) filter (
        where not e.exige_revisao and e.falta_confirmada and not coalesce(e.presente, false)
      )::integer as faltas,
      count(*) filter (where e.exige_revisao)::integer as esperados_auditoria,
      count(*) filter (
        where e.exige_revisao and (e.presente or e.falta_confirmada)
      )::integer as classificados_auditoria,
      count(*) filter (where e.exige_revisao and e.presente)::integer as presentes_auditoria,
      count(*) filter (
        where e.exige_revisao and e.falta_confirmada and not coalesce(e.presente, false)
      )::integer as faltas_auditoria
    from eventos e
    group by e.professor_id,
      case when p_unidade_id is null then null::uuid else e.unidade_id end
  ), alvo as (
    select distinct pu.professor_id,
      case when p_unidade_id is null then null::uuid else pu.unidade_id end
        as unidade_saida
    from public.professores_unidades pu
    join unidades_permitidas up on up.unidade_id = pu.unidade_id
    where coalesce(pu.emusys_ativo, true)
      and coalesce(pu.validacao_status, 'validado') not in ('ignorado', 'rejeitado')
    union
    select distinct e.professor_id,
      case when p_unidade_id is null then null::uuid else e.unidade_id end
    from eventos e
  )
  select
    'presenca'::text,
    a.professor_id,
    pr.nome::text,
    a.unidade_saida,
    v_competencia,
    case when coalesce(s.classificados_confiaveis, 0) > 0 then round(
      s.presentes::numeric / s.classificados_confiaveis::numeric * 100, 2
    ) else null end,
    coalesce(s.presentes, 0)::numeric,
    coalesce(s.classificados_confiaveis, 0)::numeric,
    coalesce(s.classificados_confiaveis, 0),
    case
      when coalesce(s.esperados_confiaveis, 0) = 0
        and coalesce(s.esperados_auditoria, 0) > 0 then 'em_auditoria'
      when coalesce(s.esperados_confiaveis, 0) = 0 then 'sem_base'
      when s.classificados_confiaveis < 10 then 'sem_base_amostra'
      when s.classificados_confiaveis::numeric / s.esperados_confiaveis < 0.95
        then 'sem_base_cobertura'
      else 'ok'
    end,
    coalesce(s.classificados_confiaveis, 0) >= 10
      and s.esperados_confiaveis > 0
      and s.classificados_confiaveis::numeric / s.esperados_confiaveis >= 0.95,
    case
      when coalesce(s.esperados_confiaveis, 0) = 0
        and coalesce(s.esperados_auditoria, 0) > 0 then 'auditoria'
      when coalesce(s.esperados_confiaveis, 0) = 0 then 'sem_base'
      when s.classificados_confiaveis < 10
        or s.classificados_confiaveis::numeric / s.esperados_confiaveis < 0.95
        then 'baixa'
      else 'alta'
    end,
    'vw_aluno_presenca_semantica_v1+aula_alunos_emusys+presenca_politicas_confiabilidade'::text,
    'health-score-professor-v3-presenca-periodo-1'::text,
    case
      when coalesce(s.esperados_confiaveis, 0) = 0
        and coalesce(s.esperados_auditoria, 0) > 0
        then 'Campo Grande permanece em auditoria e fora do Health Score'
      when coalesce(s.esperados_confiaveis, 0) = 0 then 'nenhum evento confiavel no periodo'
      when s.classificados_confiaveis < 10 then 'base minima de 10 eventos nao atingida'
      when s.classificados_confiaveis::numeric / s.esperados_confiaveis < 0.95
        then 'cobertura semantica inferior a 95% do roster esperado'
      else null
    end,
    jsonb_build_object(
      'periodicidade', p_periodicidade,
      'periodo_inicio', v_inicio,
      'periodo_fim', v_fim_periodo,
      'fim_recorte', v_fim_recorte,
      'ciclo_codigo', v_codigo,
      'eventos_esperados_confiaveis', coalesce(s.esperados_confiaveis, 0),
      'eventos_classificados_confiaveis', coalesce(s.classificados_confiaveis, 0),
      'presentes', coalesce(s.presentes, 0),
      'faltas_confirmadas', coalesce(s.faltas, 0),
      'cobertura', case when coalesce(s.esperados_confiaveis, 0) > 0
        then round(s.classificados_confiaveis::numeric / s.esperados_confiaveis * 100, 2) end,
      'eventos_esperados_auditoria', coalesce(s.esperados_auditoria, 0),
      'eventos_classificados_auditoria', coalesce(s.classificados_auditoria, 0),
      'presentes_auditoria', coalesce(s.presentes_auditoria, 0),
      'faltas_auditoria', coalesce(s.faltas_auditoria, 0),
      'unidades_pontuaveis', jsonb_build_array('Barra', 'Recreio'),
      'unidade_excluida', 'Campo Grande',
      'exige_revisao_operacional', coalesce(s.esperados_auditoria, 0) > 0,
      'apta_oficial', p_periodicidade = 'ciclo'
        and v_fim_periodo <= current_date
        and coalesce(s.classificados_confiaveis, 0) >= 10
        and s.esperados_confiaveis > 0
        and s.classificados_confiaveis::numeric / s.esperados_confiaveis >= 0.95
    )
  from alvo a
  join public.professores pr on pr.id = a.professor_id
  left join stats s
    on s.professor_id = a.professor_id
   and s.unidade_saida is not distinct from a.unidade_saida;
end;
$$;

comment on function public.get_health_score_professor_v3_metricas_periodo(date, uuid, text) is
  'Seis metricas V3 no recorte mensal ou ciclo fixo; Media/turma e Carteira por curso usam metas segmentadas exatas.';

revoke all on function public.get_health_score_professor_v3_metricas_periodo(date, uuid, text)
  from public, anon;
grant execute on function public.get_health_score_professor_v3_metricas_periodo(date, uuid, text)
  to authenticated, service_role;

-- Materializador periodico: valores reais ficam preservados. Os dois pilares
-- segmentados usam seus componentes; os demais mantem a meta versionada global.
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
  v_config public.health_score_professor_v3_config_versoes%rowtype;
  v_periodo record;
  v_scope record;
  v_alvo record;
  v_snapshot_id uuid;
  v_revisao integer;
  v_cobertura numeric;
  v_score numeric;
  v_tem_fidelizacao boolean;
  v_base_suficiente boolean;
  v_classificacao text;
  v_count integer := 0;
  v_ids jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user <> 'postgres' then
    raise exception 'HEALTH_SCORE_V3_ACESSO_NEGADO: materializacao interna'
      using errcode = '42501';
  end if;
  if p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'HEALTH_SCORE_V3_PERIODO_INVALIDO: use mensal ou ciclo';
  end if;

  select * into v_periodo
  from public.fn_health_score_v3_periodo(p_competencia, p_periodicidade);

  select * into v_config
  from public.health_score_professor_v3_config_versoes c
  where c.status = 'ativa'
    and date_trunc('month', p_competencia)::date >= c.vigencia_inicio
    and (c.vigencia_fim is null or date_trunc('month', p_competencia)::date <= c.vigencia_fim)
  order by c.versao desc
  limit 1;
  if not found then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: nenhuma configuracao ativa no periodo';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'health_score_v3_periodo:' || date_trunc('month', p_competencia)::date::text
      || ':' || p_periodicidade || ':' || coalesce(p_unidade_id::text, 'todos'), 0
  ));

  create temporary table if not exists health_score_v3_metricas_periodo_execucao (
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
  ) on commit drop;

  create temporary table if not exists
    health_score_v3_segmentos_periodo_execucao (
      metrica text,
      professor_id integer,
      professor_nome text,
      unidade_id uuid,
      competencia date,
      curso_id integer,
      curso_nome text,
      modalidade text,
      config_meta_segmento_id uuid,
      atribuicao_id uuid,
      atribuicao_formal boolean,
      atribuicao_pontuavel boolean,
      pessoas_unicas integer,
      pessoas_unicas_total integer,
      vinculos_ativos integer,
      turmas_elegiveis integer,
      ocupacoes_unicas integer,
      valor_observado numeric,
      capacidade_maxima numeric,
      meta_aplicada numeric,
      numerador numeric,
      denominador numeric,
      nota_segmento numeric,
      estado_base text,
      publicavel boolean,
      capacidade_excedida boolean,
      alertas_capacidade jsonb,
      fonte text,
      regra_versao text,
      linha_diagnostico boolean,
      dados_sem_resolucao integer,
      estados_resolucao jsonb,
      divergencias jsonb,
      detalhes jsonb
    ) on commit drop;

  create temporary table if not exists
    health_score_v3_metricas_segmentadas_agregadas_execucao (
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
      detalhes jsonb,
      nota_segmentada_estruturada numeric
    ) on commit drop;

  truncate health_score_v3_segmentos_periodo_execucao;
  insert into health_score_v3_segmentos_periodo_execucao
  select d.*
  from public.get_health_score_professor_v3_metricas_segmentadas_v1(
    p_competencia,
    v_config.id,
    p_unidade_id,
    p_periodicidade
  ) d
  where p_professor_id is null or d.professor_id = p_professor_id;

  for v_scope in
    select u.id as unidade_id
    from public.unidades u
    where u.ativo and p_unidade_id is null
    union all
    select null::uuid where p_unidade_id is null
    union all
    select p_unidade_id where p_unidade_id is not null
  loop
    truncate health_score_v3_metricas_periodo_execucao;
    truncate health_score_v3_metricas_segmentadas_agregadas_execucao;

    insert into health_score_v3_metricas_segmentadas_agregadas_execucao
    with detalhe as (
      select d.*
      from health_score_v3_segmentos_periodo_execucao d
      where v_scope.unidade_id is null
         or d.unidade_id = v_scope.unidade_id
    ), unidades as (
      select
        d.metrica,
        d.professor_id,
        max(d.professor_nome)::text as professor_nome,
        d.unidade_id,
        max(d.pessoas_unicas_total)::integer as pessoas_unicas_total,
        coalesce(sum(d.vinculos_ativos) filter (
          where d.curso_id is not null
        ), 0)::integer as vinculos_curso_modalidade,
        coalesce(sum(d.turmas_elegiveis) filter (
          where d.curso_id is not null
        ), 0)::integer as turmas_elegiveis,
        coalesce(sum(d.ocupacoes_unicas) filter (
          where d.curso_id is not null
        ), 0)::integer as ocupacoes_unicas,
        sum(d.numerador) filter (
          where d.numerador is not null
        ) as numerador,
        sum(d.denominador) filter (
          where d.denominador is not null
        ) as denominador,
        bool_or(d.estado_base = 'regra_ausente') as tem_regra_ausente,
        bool_or(d.estado_base = 'segmentacao_incompleta')
          as tem_segmentacao_incompleta,
        bool_or(d.estado_base = 'divergencia_nao_ofertada')
          as tem_divergencia_nao_ofertada,
        count(*) filter (
          where d.estado_base = 'sem_base_zero_carteira'
        )::integer as segmentos_zero_carteira,
        count(*) filter (
          where d.estado_base = 'sem_base_sem_turmas'
        )::integer as segmentos_sem_turmas,
        count(*) filter (
          where d.capacidade_excedida
        )::integer as segmentos_capacidade_excedida,
        coalesce(
          jsonb_agg(jsonb_build_object(
            'unidade_id', d.unidade_id,
            'curso_id', d.curso_id,
            'curso_nome', d.curso_nome,
            'modalidade', d.modalidade,
            'estado_base', d.estado_base,
            'pessoas_unicas', d.pessoas_unicas,
            'vinculos_ativos', d.vinculos_ativos,
            'turmas_elegiveis', d.turmas_elegiveis,
            'ocupacoes_unicas', d.ocupacoes_unicas,
            'meta_aplicada', d.meta_aplicada,
            'numerador', d.numerador,
            'denominador', d.denominador,
            'nota_segmento', d.nota_segmento,
            'config_meta_segmento_id', d.config_meta_segmento_id,
            'atribuicao_id', d.atribuicao_id
          ) order by d.curso_id, d.modalidade)
            filter (where d.curso_id is not null),
          '[]'::jsonb
        ) as segmentos_resumo,
        coalesce(
          jsonb_agg(d.divergencias)
            filter (where d.divergencias <> '{}'::jsonb),
          '[]'::jsonb
        ) as divergencias,
        coalesce(
          jsonb_agg(d.alertas_capacidade)
            filter (where d.capacidade_excedida),
          '[]'::jsonb
        ) as alertas_capacidade
      from detalhe d
      group by d.metrica, d.professor_id, d.unidade_id
    ), agregado as (
      select
        u.metrica,
        u.professor_id,
        max(u.professor_nome)::text as professor_nome,
        v_scope.unidade_id as unidade_saida,
        sum(u.pessoas_unicas_total)::integer as pessoas_unicas_total,
        sum(u.vinculos_curso_modalidade)::integer
          as vinculos_curso_modalidade,
        sum(u.turmas_elegiveis)::integer as turmas_elegiveis,
        sum(u.ocupacoes_unicas)::integer as ocupacoes_unicas,
        sum(u.numerador) filter (where u.numerador is not null) as numerador,
        sum(u.denominador) filter (where u.denominador is not null) as denominador,
        bool_or(u.tem_regra_ausente) as tem_regra_ausente,
        bool_or(u.tem_segmentacao_incompleta) as tem_segmentacao_incompleta,
        bool_or(u.tem_divergencia_nao_ofertada)
          as tem_divergencia_nao_ofertada,
        sum(u.segmentos_zero_carteira)::integer as segmentos_zero_carteira,
        sum(u.segmentos_sem_turmas)::integer as segmentos_sem_turmas,
        sum(u.segmentos_capacidade_excedida)::integer
          as segmentos_capacidade_excedida,
        jsonb_agg(u.segmentos_resumo order by u.unidade_id)
          as segmentos_resumo,
        jsonb_agg(u.divergencias order by u.unidade_id) as divergencias,
        jsonb_agg(u.alertas_capacidade order by u.unidade_id)
          as alertas_capacidade
      from unidades u
      group by u.metrica, u.professor_id
    ), avaliadas as (
      select
        a.*,
        (
          a.tem_regra_ausente
          or a.tem_segmentacao_incompleta
          or a.tem_divergencia_nao_ofertada
        ) as tem_bloqueio,
        case
          when a.tem_regra_ausente then 'regra_ausente'
          when a.tem_segmentacao_incompleta then 'segmentacao_incompleta'
          when a.tem_divergencia_nao_ofertada
            then 'divergencia_nao_ofertada'
          when a.denominador is null and a.metrica = 'media_turma'
            then 'sem_base_sem_turmas'
          when a.denominador is null and a.metrica = 'numero_alunos'
            then 'sem_base_zero_carteira'
          else 'ok'
        end::text as estado_base_calculado
      from agregado a
    ), pontuadas as (
      select
        a.*,
        case
          when a.tem_bloqueio then null::numeric
          when a.denominador > 0 then round(least(
            100::numeric,
            100::numeric * a.numerador / nullif(a.denominador, 0)
          ), 2)
          else null::numeric
        end as nota_segmentada
      from avaliadas a
    )
    select
      a.metrica,
      a.professor_id,
      a.professor_nome,
      a.unidade_saida,
      date_trunc('month', p_competencia)::date,
      case
        when a.metrica = 'media_turma' and a.turmas_elegiveis > 0
          then round(
            a.ocupacoes_unicas::numeric
              / nullif(a.turmas_elegiveis, 0),
            4
          )
        when a.metrica = 'numero_alunos'
          then a.pessoas_unicas_total::numeric
        else null::numeric
      end,
      a.numerador,
      a.denominador,
      case
        when a.metrica = 'media_turma' then a.turmas_elegiveis
        else a.vinculos_curso_modalidade
      end::integer,
      a.estado_base_calculado,
      a.estado_base_calculado = 'ok'
        and a.nota_segmentada is not null,
      case
        when a.estado_base_calculado = 'ok' then 'alta'
        when a.tem_bloqueio then 'revisar'
        else 'sem_base'
      end::text,
      'get_health_score_professor_v3_metricas_segmentadas_v1'::text,
      'health-score-professor-v3-metricas-segmentadas-agregadas-1'::text,
      case
        when a.tem_regra_ausente
          then 'regra segmentada ausente; nenhuma meta de outro segmento foi usada'
        when a.tem_segmentacao_incompleta
          then 'curso, modalidade ou atribuicao formal pendente de resolucao'
        when a.tem_divergencia_nao_ofertada
          then 'segmento marcado como nao ofertado possui dados observados'
        when a.metrica = 'media_turma' and a.denominador is null
          then 'professor sem turma regular elegivel no periodo'
        when a.metrica = 'numero_alunos' and a.denominador is null
          then 'somente segmentos formais com carteira zero; peso indisponivel'
        else null::text
      end,
      jsonb_build_object(
        'nome_exibicao', case
          when a.metrica = 'numero_alunos' then 'Carteira por curso'
          else 'Media de alunos por turma'
        end,
        'periodicidade', p_periodicidade,
        'config_id', v_config.id,
        'pessoas_unicas_total', a.pessoas_unicas_total,
        'vinculos_curso_modalidade', a.vinculos_curso_modalidade,
        'vinculos_ativos_pontuaveis', case
          when a.metrica = 'numero_alunos' then a.numerador
        end,
        'turmas_elegiveis', a.turmas_elegiveis,
        'ocupacoes_unicas', a.ocupacoes_unicas,
        'media_observada', case
          when a.metrica = 'media_turma' and a.turmas_elegiveis > 0
            then round(
              a.ocupacoes_unicas::numeric
                / nullif(a.turmas_elegiveis, 0),
              4
            )
        end,
        'meta_assentos_pontuaveis', case
          when a.metrica = 'media_turma' then a.denominador
        end,
        'metas_carteira_pontuaveis', case
          when a.metrica = 'numero_alunos' then a.denominador
        end,
        'nota_segmentada', a.nota_segmentada,
        'segmentos_zero_carteira', a.segmentos_zero_carteira,
        'segmentos_sem_turmas', a.segmentos_sem_turmas,
        'segmentos_capacidade_excedida', a.segmentos_capacidade_excedida,
        'segmentos_resumo', a.segmentos_resumo,
        'divergencias', a.divergencias,
        'alertas_capacidade', a.alertas_capacidade,
        'valor_real_preservado', true,
        'evidencia_estruturada',
          'health_score_professor_v3_snapshot_metrica_segmentos',
        'apta_oficial', p_periodicidade = 'ciclo'
          and a.estado_base_calculado = 'ok'
          and a.nota_segmentada is not null
      ),
      a.nota_segmentada
    from pontuadas a;

    perform set_config(
      'app.health_score_v3_segmentos_precarregados',
      'on',
      true
    );
    insert into health_score_v3_metricas_periodo_execucao
    select *
    from public.get_health_score_professor_v3_metricas_periodo(
      p_competencia, v_scope.unidade_id, p_periodicidade
    ) m
    where (p_professor_id is null or m.professor_id = p_professor_id)
      and m.metrica not in ('media_turma', 'numero_alunos');
    perform set_config(
      'app.health_score_v3_segmentos_precarregados',
      'off',
      true
    );

    insert into health_score_v3_metricas_periodo_execucao (
      metrica,
      professor_id,
      professor_nome,
      unidade_id,
      competencia,
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
      detalhes
    )
    select
      a.metrica,
      a.professor_id,
      a.professor_nome,
      a.unidade_id,
      a.competencia,
      a.valor_bruto,
      a.numerador,
      a.denominador,
      a.amostra,
      a.estado_base,
      a.publicavel,
      a.confianca,
      a.fonte,
      a.regra_versao,
      a.motivo_sem_base,
      a.detalhes
    from health_score_v3_metricas_segmentadas_agregadas_execucao a;

    for v_alvo in
      select m.professor_id, max(m.professor_nome) as professor_nome,
             m.unidade_id
      from health_score_v3_metricas_periodo_execucao m
      group by m.professor_id, m.unidade_id
    loop
      select coalesce(max(s.revisao), 0) + 1 into v_revisao
      from public.health_score_professor_v3_snapshots s
      where s.professor_id = v_alvo.professor_id
        and s.unidade_id is not distinct from v_alvo.unidade_id
        and s.competencia = date_trunc('month', p_competencia)::date
        and s.periodicidade = p_periodicidade;

      insert into public.health_score_professor_v3_snapshots (
        professor_id, escopo, unidade_id, competencia, trimestre_inicio,
        revisao, estado, config_id, config_versao, periodicidade,
        periodo_inicio, periodo_fim, ciclo_codigo, estado_publicacao,
        score_exibivel, ranking_habilitado, regra_versao
      ) values (
        v_alvo.professor_id,
        case when v_alvo.unidade_id is null then 'consolidado' else 'unidade' end,
        v_alvo.unidade_id,
        date_trunc('month', p_competencia)::date,
        v_periodo.periodo_inicio,
        v_revisao,
        'provisorio',
        v_config.id,
        v_config.versao,
        p_periodicidade,
        v_periodo.periodo_inicio,
        v_periodo.periodo_fim,
        v_periodo.ciclo_codigo,
        'sem_base',
        false,
        false,
        'health-score-professor-v3-motor-periodo-1'
      ) returning id into v_snapshot_id;

      insert into public.health_score_professor_v3_snapshot_metricas (
        snapshot_id, metrica, valor_bruto, numerador, denominador, amostra,
        estado_base, publicavel, confianca, fonte, regra_versao,
        motivo_sem_base, detalhes, nota, peso, peso_disponivel,
        contribuicao, meta_aplicada
      )
      select
        v_snapshot_id,
        cm.metrica,
        r.valor_bruto,
        r.numerador,
        r.denominador,
        r.amostra,
        coalesce(r.estado_base, 'sem_base'),
        coalesce(r.publicavel, false) and calc.nota_calculada is not null,
        coalesce(r.confianca, 'sem_base'),
        coalesce(r.fonte, 'health-score-v3-periodo-sem-linha'),
        coalesce(r.regra_versao, 'health-score-professor-v3-motor-periodo-1'),
        case
          when r.professor_id is null then 'metrica sem linha para professor e escopo'
          when cm.metrica in ('media_turma', 'numero_alunos')
            and calc.nota_calculada is null
            then coalesce(r.motivo_sem_base, 'metrica segmentada sem base pontuavel')
          when cm.metrica not in ('media_turma', 'numero_alunos')
            and cm.meta is null then 'meta versionada ausente'
          else r.motivo_sem_base
        end,
        case
          when cm.metrica in ('media_turma', 'numero_alunos') then
            coalesce(r.detalhes, '{}'::jsonb) || jsonb_build_object(
              'meta_versionada', null::numeric,
              'normalizacao', 'segmentada_unidade_curso_modalidade',
              'valor_real_preservado', true
            )
          else coalesce(r.detalhes, '{}'::jsonb) || jsonb_build_object(
            'meta_versionada', cm.meta,
            'normalizacao', 'meta_versionada',
            'valor_real_preservado', true
          )
        end,
        calc.nota_calculada,
        cm.peso,
        calc.nota_calculada is not null,
        case
          when calc.nota_calculada is not null
            then round(calc.nota_calculada * cm.peso / 100, 4)
          else null::numeric
        end,
        calc.meta_calculada
      from public.health_score_professor_v3_config_metricas cm
      left join health_score_v3_metricas_periodo_execucao r
        on r.metrica = cm.metrica
       and r.professor_id = v_alvo.professor_id
       and r.unidade_id is not distinct from v_alvo.unidade_id
      left join health_score_v3_metricas_segmentadas_agregadas_execucao sa
        on sa.metrica = cm.metrica
       and sa.professor_id = v_alvo.professor_id
       and sa.unidade_id is not distinct from v_alvo.unidade_id
      cross join lateral (
        select
          case
            when cm.metrica in ('media_turma', 'numero_alunos')
              and r.publicavel
              then sa.nota_segmentada_estruturada
            when cm.metrica not in ('media_turma', 'numero_alunos')
              and r.publicavel
              and r.valor_bruto is not null
              and cm.meta > 0
              then round(least(100::numeric, greatest(
                0::numeric, r.valor_bruto / cm.meta * 100
              )), 2)
            else null::numeric
          end as nota_calculada,
          case
            when cm.metrica in ('media_turma', 'numero_alunos')
              then null::numeric
            else cm.meta
          end as meta_calculada
      ) calc
      where cm.config_id = v_config.id;

      insert into public.health_score_professor_v3_snapshot_metrica_segmentos (
        snapshot_metrica_id,
        config_meta_segmento_id,
        atribuicao_id,
        unidade_id,
        curso_id,
        modalidade,
        atribuicao_formal,
        atribuicao_pontuavel,
        pessoas_unicas,
        pessoas_unicas_total,
        vinculos_ativos,
        turmas_elegiveis,
        ocupacoes_unicas,
        capacidade_maxima,
        meta_aplicada,
        numerador,
        denominador,
        nota,
        estado_base,
        capacidade_excedida,
        alertas_capacidade,
        divergencias,
        fonte,
        regra_versao,
        detalhes
      )
      select
        sm.id,
        d.config_meta_segmento_id,
        d.atribuicao_id,
        d.unidade_id,
        d.curso_id,
        d.modalidade,
        d.atribuicao_formal,
        d.atribuicao_pontuavel,
        d.pessoas_unicas,
        d.pessoas_unicas_total,
        d.vinculos_ativos,
        d.turmas_elegiveis,
        d.ocupacoes_unicas,
        d.capacidade_maxima,
        d.meta_aplicada,
        d.numerador,
        d.denominador,
        d.nota_segmento,
        d.estado_base,
        d.capacidade_excedida,
        d.alertas_capacidade,
        d.divergencias,
        d.fonte,
        d.regra_versao,
        coalesce(d.detalhes, '{}'::jsonb)
      from public.health_score_professor_v3_snapshot_metricas sm
      join health_score_v3_segmentos_periodo_execucao d
        on d.metrica = sm.metrica
       and d.professor_id = v_alvo.professor_id
      where sm.snapshot_id = v_snapshot_id
        and sm.metrica in ('media_turma', 'numero_alunos')
        and not d.linha_diagnostico
        and d.curso_id is not null
        and d.modalidade in ('individual', 'turma')
        and (
          v_alvo.unidade_id is null
          or d.unidade_id = v_alvo.unidade_id
        );

      insert into public.health_score_professor_v3_snapshot_metrica_diagnosticos (
        snapshot_metrica_id,
        unidade_id,
        pessoas_unicas_total,
        dados_sem_resolucao,
        estados_resolucao,
        estado_base,
        fonte,
        regra_versao,
        divergencias,
        detalhes
      )
      select
        sm.id,
        d.unidade_id,
        d.pessoas_unicas_total,
        d.dados_sem_resolucao,
        d.estados_resolucao,
        d.estado_base,
        d.fonte,
        d.regra_versao,
        d.divergencias,
        coalesce(d.detalhes, '{}'::jsonb)
      from public.health_score_professor_v3_snapshot_metricas sm
      join health_score_v3_segmentos_periodo_execucao d
        on d.metrica = sm.metrica
       and d.professor_id = v_alvo.professor_id
      where sm.snapshot_id = v_snapshot_id
        and sm.metrica in ('media_turma', 'numero_alunos')
        and d.linha_diagnostico
        and (
          v_alvo.unidade_id is null
          or d.unidade_id = v_alvo.unidade_id
        );

      select
        coalesce(sum(m.peso) filter (where m.nota is not null), 0),
        case when coalesce(sum(m.peso) filter (where m.nota is not null), 0) > 0
          then round(
            sum(m.nota * m.peso) filter (where m.nota is not null)
            / sum(m.peso) filter (where m.nota is not null), 2
          ) else null end,
        coalesce(bool_or(
          m.metrica in ('retencao', 'permanencia') and m.nota is not null
        ), false)
      into v_cobertura, v_score, v_tem_fidelizacao
      from public.health_score_professor_v3_snapshot_metricas m
      where m.snapshot_id = v_snapshot_id;

      v_base_suficiente := v_cobertura >= v_config.cobertura_minima
        and (not v_config.exige_pilar_fidelizacao or v_tem_fidelizacao);
      if not v_base_suficiente then v_score := null; end if;
      v_classificacao := case
        when v_score is null then 'sem_base'
        when v_score >= v_config.faixa_saudavel_min then 'saudavel'
        when v_score >= v_config.faixa_atencao_min then 'atencao'
        else 'critico'
      end;

      update public.health_score_professor_v3_snapshots
      set score = v_score,
          cobertura = v_cobertura,
          classificacao = v_classificacao,
          estado = case when exists (
            select 1 from public.health_score_professor_v3_snapshot_metricas m
            where m.snapshot_id = v_snapshot_id and m.estado_base = 'em_maturacao'
          ) then 'em_maturacao' else 'provisorio' end,
          publicavel = false,
          publicado = false,
          estado_publicacao = case when v_score is null then 'sem_base' else 'parcial' end,
          score_exibivel = v_score is not null,
          ranking_habilitado = false,
          motivo_bloqueio = case
            when v_score is null then 'cobertura ou pilar de fidelizacao insuficiente'
            else 'Health Score parcial; ranking e premiacao dependem do fechamento oficial do ciclo'
          end
      where id = v_snapshot_id;

      v_count := v_count + 1;
      v_ids := v_ids || jsonb_build_array(v_snapshot_id);
    end loop;
  end loop;

  return jsonb_build_object(
    'snapshots_criados', v_count,
    'snapshot_ids', v_ids,
    'competencia', date_trunc('month', p_competencia)::date,
    'periodicidade', p_periodicidade,
    'periodo_inicio', v_periodo.periodo_inicio,
    'periodo_fim', v_periodo.periodo_fim,
    'ciclo_codigo', v_periodo.ciclo_codigo,
    'estado_publicacao', 'parcial',
    'ranking_habilitado', false,
    'config_versao', v_config.versao
  );
end;
$$;

revoke all on function public.materializar_health_score_professor_v3_periodo_impl(date, text, uuid, integer)
  from public, anon, authenticated, service_role;

comment on function public.materializar_health_score_professor_v3_periodo_impl(date, text, uuid, integer) is
  'Implementacao privada do materializador V3 com evidencias segmentadas estruturadas.';
-- O nome publicado continua sendo apenas o wrapper interno autorizado.
create or replace function public.materializar_health_score_professor_v3_periodo(
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
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user <> 'postgres' then
    raise exception 'HEALTH_SCORE_V3_ACESSO_NEGADO: materializacao interna'
      using errcode = '42501';
  end if;

  perform set_config(
    'app.health_score_v3_mutacao_controlada',
    'on',
    true
  );
  return public.materializar_health_score_professor_v3_periodo_impl(
    p_competencia,
    p_periodicidade,
    p_unidade_id,
    p_professor_id
  );
end;
$$;

revoke all on function public.materializar_health_score_professor_v3_periodo(
  date,
  text,
  uuid,
  integer
) from public, anon, authenticated, service_role;
grant execute on function public.materializar_health_score_professor_v3_periodo(
  date,
  text,
  uuid,
  integer
) to service_role;

comment on function public.materializar_health_score_professor_v3_periodo(
  date,
  text,
  uuid,
  integer
) is
  'Wrapper interno V3: materializa pais e filhos segmentados; EXECUTE restrito ao service_role.';

create or replace view public.vw_health_score_professor_v3_parcial_observado
with (security_invoker = true)
as
with metricas_base as (
  select
    s.id as snapshot_id,
    s.professor_id,
    s.unidade_id,
    s.escopo,
    s.competencia,
    s.trimestre_inicio,
    s.periodicidade,
    s.periodo_inicio,
    s.periodo_fim,
    s.ciclo_codigo,
    s.estado_publicacao,
    s.score_exibivel as score_exibivel_oficial,
    s.ranking_habilitado as ranking_habilitado_oficial,
    s.config_versao,
    s.revisao,
    s.score as score_oficial,
    s.cobertura as cobertura_oficial,
    s.classificacao as classificacao_oficial,
    s.estado,
    s.publicavel as snapshot_publicavel,
    s.publicado,
    s.motivo_bloqueio as motivo_bloqueio_oficial,
    s.regra_versao as regra_versao_snapshot_oficial,
    c.faixa_atencao_min,
    c.faixa_saudavel_min,
    m.metrica,
    m.valor_bruto,
    m.numerador,
    m.denominador,
    m.nota as nota_oficial,
    m.peso,
    m.peso_disponivel as peso_disponivel_oficial,
    m.contribuicao as contribuicao_oficial,
    m.meta_aplicada,
    m.amostra,
    m.estado_base,
    m.publicavel as metrica_publicavel_oficial,
    m.confianca,
    m.fonte,
    m.regra_versao as regra_versao_metrica_oficial,
    m.motivo_sem_base,
    coalesce(m.detalhes, '{}'::jsonb) as detalhes_oficiais,
    case
      when s.estado_publicacao = 'oficial' then m.nota
      when m.metrica in ('media_turma', 'numero_alunos') then m.nota
      when m.valor_bruto is not null
       and m.meta_aplicada > 0
       and not (
         m.metrica = 'presenca'
         and coalesce(m.detalhes->>'observacao_publicacao', '') = 'em_auditoria'
       )
      then round(least(
        100::numeric,
        greatest(0::numeric, m.valor_bruto / m.meta_aplicada * 100)
      ), 2)
      else null::numeric
    end as nota_parcial_observada
  from public.health_score_professor_v3_snapshots s
  join public.health_score_professor_v3_config_versoes c
    on c.id = s.config_id
  join public.health_score_professor_v3_snapshot_metricas m
    on m.snapshot_id = s.id
), metricas_calculadas as (
  select
    b.*,
    case
      when b.estado_publicacao = 'oficial' then b.peso_disponivel_oficial
      else b.nota_parcial_observada is not null
    end as peso_disponivel_parcial_observado,
    case
      when b.estado_publicacao = 'oficial' then b.contribuicao_oficial
      when b.nota_parcial_observada is not null
        then round(b.nota_parcial_observada * b.peso / 100, 4)
      else null::numeric
    end as contribuicao_parcial_observada
  from metricas_base b
), snapshots_calculados as (
  select
    m.snapshot_id,
    case
      when max(m.estado_publicacao) = 'oficial' then max(m.score_oficial)
      when sum(m.peso) filter (where m.peso_disponivel_parcial_observado) > 0
        then round(
          sum(m.contribuicao_parcial_observada)
            filter (where m.peso_disponivel_parcial_observado)
          * 100
          / sum(m.peso) filter (where m.peso_disponivel_parcial_observado),
          2
        )
      else null::numeric
    end as score_parcial_observado,
    case
      when max(m.estado_publicacao) = 'oficial' then max(m.cobertura_oficial)
      else coalesce(
        sum(m.peso) filter (where m.peso_disponivel_parcial_observado),
        0::numeric
      )
    end as cobertura_parcial_observada,
    max(m.faixa_atencao_min) as faixa_atencao_min,
    max(m.faixa_saudavel_min) as faixa_saudavel_min
  from metricas_calculadas m
  group by m.snapshot_id
)
select
  m.snapshot_id,
  m.professor_id,
  m.unidade_id,
  m.escopo,
  m.competencia,
  m.trimestre_inicio,
  m.periodicidade,
  m.periodo_inicio,
  m.periodo_fim,
  m.ciclo_codigo,
  case
    when m.estado_publicacao = 'oficial' then 'oficial'
    when a.score_parcial_observado is not null then 'parcial'
    else 'sem_base'
  end as estado_publicacao_parcial_observado,
  a.score_parcial_observado is not null as score_exibivel_parcial_observado,
  case
    when m.estado_publicacao = 'oficial' then m.ranking_habilitado_oficial
    else false
  end as ranking_habilitado,
  m.config_versao,
  m.revisao,
  a.score_parcial_observado,
  a.cobertura_parcial_observada,
  case
    when m.estado_publicacao = 'oficial' then m.classificacao_oficial
    when a.score_parcial_observado is null then null::text
    when a.score_parcial_observado >= a.faixa_saudavel_min then 'saudavel'
    when a.score_parcial_observado >= a.faixa_atencao_min then 'atencao'
    else 'critico'
  end as classificacao_parcial_observada,
  m.estado,
  m.snapshot_publicavel,
  m.publicado,
  case
    when m.estado_publicacao = 'oficial' then m.motivo_bloqueio_oficial
    when a.score_parcial_observado is not null
      then 'score parcial observado; ranking e premiacao dependem do fechamento oficial'
    else m.motivo_bloqueio_oficial
  end as motivo_bloqueio,
  case
    when m.estado_publicacao = 'oficial' then m.regra_versao_snapshot_oficial
    else 'health-score-professor-v3-parcial-observado-1'
  end as regra_versao_snapshot,
  m.metrica,
  m.valor_bruto,
  m.numerador,
  m.denominador,
  m.nota_parcial_observada,
  m.peso,
  m.peso_disponivel_parcial_observado,
  m.contribuicao_parcial_observada,
  m.meta_aplicada,
  m.amostra,
  m.estado_base,
  m.metrica_publicavel_oficial,
  m.confianca,
  m.fonte,
  m.regra_versao_metrica_oficial,
  m.motivo_sem_base,
  m.detalhes_oficiais || jsonb_build_object(
    'leitura_parcial_observada', m.estado_publicacao <> 'oficial',
    'nota_oficial', m.nota_oficial,
    'peso_disponivel_oficial', m.peso_disponivel_oficial,
    'contribuicao_oficial', m.contribuicao_oficial,
    'metrica_publicavel_oficial', m.metrica_publicavel_oficial
  ) as detalhes
from metricas_calculadas m
join snapshots_calculados a on a.snapshot_id = m.snapshot_id;

revoke all on public.vw_health_score_professor_v3_parcial_observado
  from public, anon, authenticated;
grant select on public.vw_health_score_professor_v3_parcial_observado
  to service_role;
