begin;

-- O ciclo aberto continua sendo uma visão acumulada e não ganha nota/ranking.
-- Quando o produtor canônico ainda bloqueia a presença do ciclo inteiro, porém a
-- competência atual já possui uma referência mensal exibível, carregamos apenas
-- essa referência para a leitura. Assim não inventamos outubro/novembro em
-- setembro e também não descartamos a evidência que o painel mensal já mostra.
create or replace function public.get_health_score_professor_v3_presenca_ciclo_acompanhamento_v1(
  p_competencia date,
  p_unidade_id uuid
)
returns table (
  professor_id integer,
  valor_bruto numeric,
  numerador numeric,
  denominador numeric,
  amostra integer,
  estado_base text,
  confianca text,
  fonte text,
  regra_versao text,
  motivo_sem_base text,
  codigo_evidencia text,
  detalhes jsonb
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $func$
  with competencia as (
    select date_trunc('month', p_competencia)::date as competencia
  ), candidatos as (
    select
      s.professor_id,
      m.valor_bruto,
      m.numerador,
      m.denominador,
      m.amostra,
      m.estado_base,
      m.confianca,
      m.fonte,
      m.regra_versao,
      m.motivo_sem_base,
      m.codigo_evidencia,
      m.detalhes,
      row_number() over (
        partition by s.professor_id
        order by s.revisao desc, s.criado_em desc, s.id desc
      ) as ordem
    from public.health_score_professor_v3_snapshots s
    join public.health_score_professor_v3_snapshot_metricas m
      on m.snapshot_id = s.id
     and m.metrica = 'presenca'
    join competencia c on c.competencia = s.competencia
    where s.periodicidade = 'mensal'
      and s.escopo = case when p_unidade_id is null then 'consolidado' else 'unidade' end
      and s.unidade_id is not distinct from p_unidade_id
      and s.invalidado_em is null
      and s.estado in ('provisorio', 'em_maturacao', 'fechado')
      and m.valor_bruto is not null
  )
  select
    professor_id,
    valor_bruto,
    numerador,
    denominador,
    amostra,
    estado_base,
    confianca,
    fonte,
    regra_versao,
    motivo_sem_base,
    codigo_evidencia,
    detalhes
  from candidatos
  where ordem = 1;
$func$;

revoke all on function public.get_health_score_professor_v3_presenca_ciclo_acompanhamento_v1(date, uuid)
  from public, anon, authenticated;
grant execute on function public.get_health_score_professor_v3_presenca_ciclo_acompanhamento_v1(date, uuid)
  to service_role;

-- O executor prepara a fonte temporária antes de chamar o materializador. A
-- chamada direta do materializador prepara a mesma fonte por conta própria.
-- Por isso o mesmo enxerto precisa existir nos dois pontos, sempre antes da
-- checagem de completude e da gravação do snapshot.
do $patch_materializador$
declare
  v_definicao text;
  v_ancora text := 'create temporary table health_score_v3_diario_incompletos (';
  v_injecao text := $injecao$
if p_periodicidade = 'ciclo' then
  update health_score_v3_diario_fonte as ciclo
     set valor_bruto = mensal.valor_bruto,
         numerador = mensal.numerador,
         denominador = mensal.denominador,
         amostra = mensal.amostra,
         nota = null,
         peso_disponivel = false,
         peso_efetivo = 0::numeric,
         contribuicao = null,
         metrica_publicavel = false,
         estado_base = mensal.estado_base,
         confianca = mensal.confianca,
         fonte = mensal.fonte,
         regra_versao_metrica = mensal.regra_versao,
         motivo_sem_base = coalesce(
           mensal.motivo_sem_base,
           'Presença do ciclo em acompanhamento; não compõe a nota do ciclo.'
         ),
         codigo_evidencia = coalesce(
           mensal.codigo_evidencia,
           'referencia_ciclo_em_acompanhamento'
         ),
         detalhes = jsonb_strip_nulls(
           coalesce(mensal.detalhes, '{}'::jsonb)
           || coalesce(ciclo.detalhes, '{}'::jsonb)
           || jsonb_build_object(
             'periodicidade', 'ciclo',
             'periodo_inicio', coalesce(
               nullif(ciclo.detalhes ->> 'periodo_inicio', ''),
               v_competencia::text
             ),
             'periodo_fim', coalesce(
               nullif(ciclo.detalhes ->> 'periodo_fim', ''),
               (date_trunc('month', v_competencia) + interval '3 months - 1 day')::date::text
             ),
             'data_corte', least(
               current_date,
               coalesce(
                 nullif(ciclo.detalhes ->> 'periodo_fim', '')::date,
                 current_date
               )
             )::text,
             'referencia_temporaria', true,
             'competencia_referencia', coalesce(
               nullif(mensal.detalhes ->> 'competencia_referencia', ''),
               v_competencia::text
             ),
             'competencia_mensal_reutilizada', v_competencia::text,
             'presenca_ciclo_em_acompanhamento', true,
             'estado_base_ciclo_origem', ciclo.estado_base
           )
         )
    from public.get_health_score_professor_v3_presenca_ciclo_acompanhamento_v1(
      v_competencia,
      v_unidade_id
    ) as mensal
   where ciclo.metrica = 'presenca'
     and ciclo.valor_bruto is null
     and ciclo.estado_base in ('bloqueado_roster', 'bloqueado_frescor', 'em_auditoria')
     and ciclo.professor_id = mensal.professor_id;
end if;

$injecao$;
begin
  select pg_get_functiondef(
    'public.materializar_health_score_professor_v3_escopo_diario(date,text,text,uuid)'::regprocedure
  ) into v_definicao;

  if v_definicao is null
     or position('get_health_score_professor_v3_performance' in v_definicao) = 0 then
    raise exception 'HEALTH_SCORE_V3_MATERIALIZADOR_PRESENCA_CICLO_INESPERADO';
  end if;

  if position('presenca_ciclo_em_acompanhamento' in v_definicao) = 0 then
    if position(v_ancora in v_definicao) = 0 then
      raise exception 'HEALTH_SCORE_V3_MATERIALIZADOR_ANCORA_PRESENCA_CICLO_NAO_ENCONTRADA';
    end if;
    v_definicao := replace(v_definicao, v_ancora, v_injecao || v_ancora);
    execute v_definicao;
  end if;
end;
$patch_materializador$;

do $patch_executor$
declare
  v_definicao text;
  v_ancora text := 'create temporary table health_score_v3_diario_incompletos (';
  v_injecao text := $injecao$
if p_periodicidade = 'ciclo' then
  update health_score_v3_diario_fonte as ciclo
     set valor_bruto = mensal.valor_bruto,
         numerador = mensal.numerador,
         denominador = mensal.denominador,
         amostra = mensal.amostra,
         nota = null,
         peso_disponivel = false,
         peso_efetivo = 0::numeric,
         contribuicao = null,
         metrica_publicavel = false,
         estado_base = mensal.estado_base,
         confianca = mensal.confianca,
         fonte = mensal.fonte,
         regra_versao_metrica = mensal.regra_versao,
         motivo_sem_base = coalesce(
           mensal.motivo_sem_base,
           'Presença do ciclo em acompanhamento; não compõe a nota do ciclo.'
         ),
         codigo_evidencia = coalesce(
           mensal.codigo_evidencia,
           'referencia_ciclo_em_acompanhamento'
         ),
         detalhes = jsonb_strip_nulls(
           coalesce(mensal.detalhes, '{}'::jsonb)
           || coalesce(ciclo.detalhes, '{}'::jsonb)
           || jsonb_build_object(
             'periodicidade', 'ciclo',
             'periodo_inicio', coalesce(
               nullif(ciclo.detalhes ->> 'periodo_inicio', ''),
               v_competencia::text
             ),
             'periodo_fim', coalesce(
               nullif(ciclo.detalhes ->> 'periodo_fim', ''),
               (date_trunc('month', v_competencia) + interval '3 months - 1 day')::date::text
             ),
             'data_corte', least(
               current_date,
               coalesce(
                 nullif(ciclo.detalhes ->> 'periodo_fim', '')::date,
                 current_date
               )
             )::text,
             'referencia_temporaria', true,
             'competencia_referencia', coalesce(
               nullif(mensal.detalhes ->> 'competencia_referencia', ''),
               v_competencia::text
             ),
             'competencia_mensal_reutilizada', v_competencia::text,
             'presenca_ciclo_em_acompanhamento', true,
             'estado_base_ciclo_origem', ciclo.estado_base
           )
         )
    from public.get_health_score_professor_v3_presenca_ciclo_acompanhamento_v1(
      v_competencia,
      p_unidade_id
    ) as mensal
   where ciclo.metrica = 'presenca'
     and ciclo.valor_bruto is null
     and ciclo.estado_base in ('bloqueado_roster', 'bloqueado_frescor', 'em_auditoria')
     and ciclo.professor_id = mensal.professor_id;
end if;

$injecao$;
begin
  select pg_get_functiondef(
    'public.executar_health_score_professor_v3_escopo_diario(date,text,text,uuid)'::regprocedure
  ) into v_definicao;

  if v_definicao is null
     or position('get_health_score_professor_v3_performance' in v_definicao) = 0
     or position('materializar_health_score_professor_v3_escopo_diario' in v_definicao) = 0 then
    raise exception 'HEALTH_SCORE_V3_EXECUTOR_PRESENCA_CICLO_INESPERADO';
  end if;

  if position('presenca_ciclo_em_acompanhamento' in v_definicao) = 0 then
    if position(v_ancora in v_definicao) = 0 then
      raise exception 'HEALTH_SCORE_V3_EXECUTOR_ANCORA_PRESENCA_CICLO_NAO_ENCONTRADA';
    end if;
    v_definicao := replace(v_definicao, v_ancora, v_injecao || v_ancora);
    execute v_definicao;
  end if;
end;
$patch_executor$;

-- A leitora comercial é intencionalmente unitária. No consolidado, chamar a
-- função com NULL não lê todas as unidades; precisamos iterar a mesma lista de
-- unidades permitidas que sustenta o relatório antes de somar por professor.
do $patch_matriculador_consolidado$
declare
  v_definicao text;
  v_trecho_antigo text := $antigo$
  with matriculas_comerciais_por_professor as (
    select
      a.professor_experimental_id as professor_id,
      count(*)::integer as matriculas_comerciais
    from public.matriculas_comerciais_v1(
      p_unidade_id,
      v_periodo_inicio,
      v_periodo_fim + 1
    ) m
    join public.alunos a on a.id = m.aluno_id
    where m.conta is true
      and a.professor_experimental_id is not null
    group by a.professor_experimental_id
  ), professores_ordenados as (
$antigo$;
  v_trecho_novo text := $novo$
  with unidades_comerciais as (
    select p_unidade_id as unidade_id
    where p_unidade_id is not null
    union all
    select u.unidade_id
    from public.fn_health_score_v3_unidades_permitidas_sombra(null) u
    where p_unidade_id is null
  ), matriculas_comerciais_por_professor as (
    select
      a.professor_experimental_id as professor_id,
      count(*)::integer as matriculas_comerciais
    from unidades_comerciais uc
    cross join lateral public.matriculas_comerciais_v1(
      uc.unidade_id,
      v_periodo_inicio,
      v_periodo_fim + 1
    ) m
    join public.alunos a on a.id = m.aluno_id
    where m.conta is true
      and a.professor_experimental_id is not null
    group by a.professor_experimental_id
  ), professores_ordenados as (
$novo$;
begin
  select pg_get_functiondef(
    'public.get_relatorio_coordenacao_canonico_v3(uuid,integer,integer,text)'::regprocedure
  ) into v_definicao;

  if v_definicao is null
     or position('matriculas_comerciais_v1' in v_definicao) = 0 then
    raise exception 'RELATORIO_COORDENACAO_MATRICULADOR_CONSOLIDADO_INESPERADO';
  end if;

  if position('unidades_comerciais as' in v_definicao) = 0 then
    if position(v_trecho_antigo in v_definicao) = 0 then
      raise exception 'RELATORIO_COORDENACAO_MATRICULADOR_CONSOLIDADO_ANCORA_NAO_ENCONTRADA';
    end if;
    v_definicao := replace(v_definicao, v_trecho_antigo, v_trecho_novo);
    execute v_definicao;
  end if;
end;
$patch_matriculador_consolidado$;

commit;
