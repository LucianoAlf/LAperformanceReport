-- Confiabilidade integral dos relatórios da Coordenação.
--
-- 1. A presença usa cada ocorrência já classificada pela regra vigente. Uma
--    pendência de qualidade não bloqueia todos os demais eventos do professor
--    ou da unidade; ela permanece contabilizada separadamente.
-- 2. O fechamento de ciclo é atômico para todos os professores comparáveis:
--    publica todos ou não publica ninguém.
-- 3. O documento informa os universos, a qualidade dos valores e o estado real
--    da publicação, sem substituir ausência por zero.

begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- `publicado` registra que esta revisão já foi publicada e é imutável.
-- A restrição anterior exigia que toda revisão já publicada permanecesse
-- fechada para sempre, impedindo a transição de retificação aceita pelo trigger.
-- Revisão invalidada preserva esse histórico, mas nunca volta ao ranking.
alter table public.health_score_professor_v3_snapshots
  drop constraint health_score_professor_v3_snapshot_publicacao_chk,
  add constraint health_score_professor_v3_snapshot_publicacao_chk check (
    case when estado = 'invalidado' then
      invalidado_em is not null and not publicavel and not ranking_habilitado
    else
      (not publicado or (estado = 'fechado' and publicavel and estado_publicacao = 'oficial'))
      and (not ranking_habilitado or (estado_publicacao = 'oficial' and publicavel and publicado))
    end
  );

do $regularizar_retificacao$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.retificar_health_score_professor_v3(uuid,integer,text)'::regprocedure);
  if position('set estado = ''invalidado'',' in v_def) = 0 then
    raise exception 'CONTRATO_RETIFICACAO_INESPERADO';
  end if;
  execute replace(v_def, 'set estado = ''invalidado'',',
    'set estado = ''invalidado'', ranking_habilitado = false,');
end;
$regularizar_retificacao$;

create or replace function public.get_health_score_professor_v3_presenca_periodo_v2(
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
set search_path = pg_catalog, public
as $function$
#variable_conflict use_column
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_inicio date;
  v_fim_periodo date;
  v_fim_recorte date;
  v_codigo text;
begin
  if p_competencia is null or p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'HEALTH_SCORE_V3_PRESENCA_PERIODO_INVALIDO'
      using errcode = '22023';
  end if;

  select p.periodo_inicio, p.periodo_fim, p.ciclo_codigo
    into v_inicio, v_fim_periodo, v_codigo
  from public.fn_health_score_v3_periodo(p_competencia, p_periodicidade) p;

  v_fim_recorte := least(v_fim_periodo, current_date);

  return query
  with unidades_permitidas as materialized (
    select up.unidade_id
    from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
  ), observada as materialized (
    select
      o.professor_id,
      o.unidade_id,
      count(*)::integer as ocorrencias_observadas,
      count(*) filter (
        where o.considera_frequencia_denominador
      )::integer as denominador_observado,
      count(*) filter (where o.considera_presenca)::integer
        as presentes_observados,
      count(*) filter (where o.considera_falta)::integer
        as faltas_observadas,
      count(*) filter (where o.considera_falta_justificada)::integer
        as faltas_justificadas_observadas,
      count(*) filter (
        where not o.considera_frequencia_denominador
      )::integer as ocorrencias_fora_calculo,
      count(*) filter (where o.ocorrencia_incompleta)::integer
        as ocorrencias_incompletas,
      count(*) filter (where o.possui_conflito)::integer
        as ocorrencias_com_conflito
    from unidades_permitidas up
    cross join lateral public.fn_presenca_ocorrencias_escopo_interno_v2(
      up.unidade_id,
      v_inicio,
      v_fim_recorte,
      null,
      null
    ) o
    group by o.professor_id, o.unidade_id
  ), alvo_unidade as (
    select distinct pu.professor_id, pu.unidade_id
    from public.professores_unidades pu
    join unidades_permitidas up on up.unidade_id = pu.unidade_id
    join public.professores pr on pr.id = pu.professor_id and pr.ativo = true
    where coalesce(pu.emusys_ativo, true)
      and coalesce(pu.validacao_status, 'validado')
        not in ('ignorado', 'rejeitado')
      and to_jsonb(pr) ->> 'mesclado_em_professor_id' is null
    union
    select distinct o.professor_id, o.unidade_id
    from observada o
    where o.professor_id is not null
  ), por_professor as (
    select
      a.professor_id,
      case when p_unidade_id is null then null::uuid else a.unidade_id end
        as unidade_saida,
      sum(coalesce(o.ocorrencias_observadas, 0))::integer
        as ocorrencias_observadas,
      sum(coalesce(o.denominador_observado, 0))::integer
        as denominador_observado,
      sum(coalesce(o.presentes_observados, 0))::integer
        as presentes_observados,
      sum(coalesce(o.faltas_observadas, 0))::integer
        as faltas_observadas,
      sum(coalesce(o.faltas_justificadas_observadas, 0))::integer
        as faltas_justificadas_observadas,
      sum(coalesce(o.ocorrencias_fora_calculo, 0))::integer
        as ocorrencias_fora_calculo,
      sum(coalesce(o.ocorrencias_incompletas, 0))::integer
        as ocorrencias_incompletas,
      sum(coalesce(o.ocorrencias_com_conflito, 0))::integer
        as ocorrencias_com_conflito
    from alvo_unidade a
    left join observada o
      on o.professor_id = a.professor_id
     and o.unidade_id = a.unidade_id
    group by a.professor_id,
      case when p_unidade_id is null then null::uuid else a.unidade_id end
  ), classificada as (
    select
      p.*,
      case
        when p.denominador_observado = 0 then 'sem_base'
        when p.denominador_observado < 10 then 'sem_base_amostra'
        else 'ok'
      end as estado_base_calculado,
      p.denominador_observado >= 10 as publicavel_calculado
    from por_professor p
  )
  select
    'presenca'::text,
    c.professor_id,
    pr.nome::text,
    c.unidade_saida,
    v_competencia,
    case when c.publicavel_calculado then round(
      c.presentes_observados::numeric / c.denominador_observado * 100,
      2
    ) else null end,
    case when c.publicavel_calculado
      then c.presentes_observados::numeric else null end,
    case when c.publicavel_calculado
      then c.denominador_observado::numeric else null end,
    case when c.publicavel_calculado
      then c.denominador_observado else null end,
    c.estado_base_calculado,
    c.publicavel_calculado,
    case
      when c.publicavel_calculado then 'alta'
      when c.estado_base_calculado = 'sem_base_amostra' then 'baixa'
      else 'sem_base'
    end,
    'fn_presenca_ocorrencias_escopo_interno_v2'::text,
    'health-score-professor-v3-presenca-v2.3'::text,
    case c.estado_base_calculado
      when 'sem_base' then 'nenhuma ocorrencia elegivel no periodo'
      when 'sem_base_amostra' then 'base minima de 10 eventos nao atingida'
      else null
    end,
    jsonb_build_object(
      'periodicidade', p_periodicidade,
      'periodo_inicio', v_inicio,
      'periodo_fim', v_fim_periodo,
      'fim_recorte', v_fim_recorte,
      'ciclo_codigo', v_codigo,
      'ocorrencias_observadas', c.ocorrencias_observadas,
      'denominador_observado', c.denominador_observado,
      'presentes_observados', c.presentes_observados,
      'faltas_observadas', c.faltas_observadas,
      'faltas_justificadas_observadas',
        c.faltas_justificadas_observadas,
      'faltas_total_observado',
        c.faltas_observadas + c.faltas_justificadas_observadas,
      'ocorrencias_fora_calculo', c.ocorrencias_fora_calculo,
      'ocorrencias_incompletas', c.ocorrencias_incompletas,
      'ocorrencias_com_conflito', c.ocorrencias_com_conflito,
      'estado_publicacao', c.estado_base_calculado,
      'fonte_veredito', 'fn_presenca_ocorrencias_escopo_interno_v2',
      'apta_oficial', c.publicavel_calculado
        and p_periodicidade = 'ciclo'
        and v_fim_periodo <= current_date
    )
  from classificada c
  join public.professores pr on pr.id = c.professor_id;
end;
$function$;

revoke all on function public.get_health_score_professor_v3_presenca_periodo_v2(
  date, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.get_health_score_professor_v3_presenca_periodo_v2(
  date, uuid, text
) to authenticated, service_role;

create or replace function public.fechar_health_score_professor_v3_ciclo(
  p_ciclo_codigo text,
  p_justificativa text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_usuario_id integer;
  v_ciclo public.health_score_professor_v3_ciclos%rowtype;
  v_lock record;
  v_origem record;
  v_novo_id uuid;
  v_revisao integer;
  v_snapshots_esperados integer := 0;
  v_comparaveis_esperados integer := 0;
  v_snapshots_fechados integer := 0;
  v_ausentes integer := 0;
  v_excedentes integer := 0;
  v_recorte_incompleto integer := 0;
  v_ids jsonb := '[]'::jsonb;
  v_elegiveis uuid[];
begin
  v_usuario_id := public.fn_health_score_professor_v3_ator_gerenciador();
  if nullif(btrim(p_justificativa), '') is null then
    raise exception 'HEALTH_SCORE_V3_FECHAMENTO_INVALIDO: justificativa obrigatoria';
  end if;

  select * into v_ciclo
  from public.health_score_professor_v3_ciclos c
  where c.codigo = p_ciclo_codigo
  for update;
  if not found then
    raise exception 'HEALTH_SCORE_V3_FECHAMENTO_INVALIDO: ciclo inexistente';
  end if;
  if current_date < v_ciclo.data_fim then
    raise exception 'HEALTH_SCORE_V3_FECHAMENTO_BLOQUEADO: ciclo ainda aberto';
  end if;
  if v_ciclo.publicacao_oficial then
    raise exception 'HEALTH_SCORE_V3_FECHAMENTO_BLOQUEADO: ciclo ja oficial';
  end if;

  for v_lock in
    with competencias as (
      select gs::date as competencia
      from generate_series(
        date_trunc('month', v_ciclo.data_inicio)::timestamp,
        date_trunc('month', v_ciclo.data_fim)::timestamp,
        interval '1 month'
      ) gs
    ), unidades_ativas as (
      select u.id as unidade_id
      from public.unidades u
      where u.ativo = true
    ), chaves as (
      select c.competencia, 0 as ordem_familia, null::uuid as unidade_id,
        'health_score_v3_periodo:' || c.competencia::text || ':ciclo' as chave
      from competencias c
      union all
      select c.competencia, 1, null::uuid,
        'health_score_professor_v3:' || c.competencia::text || ':consolidado:rede'
      from competencias c
      union all
      select c.competencia, 2, u.unidade_id,
        'health_score_professor_v3:' || c.competencia::text || ':unidade:' || u.unidade_id::text
      from competencias c
      cross join unidades_ativas u
    )
    select competencia, ordem_familia, unidade_id, chave
    from chaves
    order by competencia, ordem_familia, unidade_id nulls first
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_lock.chave, 0));
  end loop;

  select array_agg(distinct p.retrato_execucao_id) into v_elegiveis
  from (select id from public.unidades where ativo union all select null::uuid) u
  cross join lateral public.get_health_score_professor_v3_performance_snapshot_v3(
    date_trunc('month', v_ciclo.data_fim)::date, u.id, 'ciclo'
  ) p
  where p.comparabilidade_estado = 'comparavel'
    and p.score_comparavel is not null and p.score_exibivel;

  with roster_unidade as (
    select distinct pu.unidade_id, p.id as professor_id
    from public.professores_unidades pu
    join public.unidades u on u.id = pu.unidade_id and u.ativo = true
    join public.professores p on p.id = pu.professor_id and p.ativo = true
    where pu.emusys_ativo = true
      and pu.validacao_status is distinct from 'ignorado'
      and to_jsonb(p) ->> 'mesclado_em_professor_id' is null
  ), roster_esperado as (
    select r.unidade_id, r.professor_id from roster_unidade r
    union
    select null::uuid, r.professor_id from roster_unidade r
  ), candidatos as (
    select s.*,
      row_number() over (
        partition by s.professor_id, s.unidade_id
        order by s.competencia desc, s.revisao desc, s.criado_em desc
      ) as rn
    from public.health_score_professor_v3_snapshots s
    where s.periodicidade = 'ciclo'
      and s.ciclo_codigo = p_ciclo_codigo
      and s.invalidado_em is null
      and s.estado_publicacao in ('parcial', 'sem_base')
  ), retrato as (
    select c.* from candidatos c where c.rn = 1
  ), ausentes as (
    select * from roster_esperado
    except
    select r.unidade_id, r.professor_id from retrato r
  ), excedentes as (
    select r.unidade_id, r.professor_id
    from retrato r
    where r.estado_publicacao = 'parcial'
    except
    select * from roster_esperado
  ), recorte_incompleto as (
    select r.id
    from retrato r
    join roster_esperado e
      on e.professor_id = r.professor_id
     and e.unidade_id is not distinct from r.unidade_id
    where r.periodo_inicio <> v_ciclo.data_inicio
       or r.periodo_fim <> v_ciclo.data_fim
       or r.criado_em::date < v_ciclo.data_fim
       or exists (
         select 1
         from public.health_score_professor_v3_snapshot_metricas m
         where m.snapshot_id = r.id
           and m.detalhes ? 'fim_recorte'
           and nullif(m.detalhes ->> 'fim_recorte', '')::date <> v_ciclo.data_fim
       )
  )
  select
    (select count(*) from roster_esperado)::integer,
    (select count(*) from ausentes)::integer,
    (select count(*) from excedentes)::integer,
    (select count(*) from recorte_incompleto)::integer,
    (
      select count(*)
      from retrato r
      join roster_esperado e
        on e.professor_id = r.professor_id
       and e.unidade_id is not distinct from r.unidade_id
      where r.estado_publicacao = 'parcial'
        and r.id = any(v_elegiveis)
        and r.score_exibivel
        and r.score is not null
    )::integer
  into v_snapshots_esperados, v_ausentes, v_excedentes,
       v_recorte_incompleto, v_comparaveis_esperados;

  if v_ausentes > 0 or v_excedentes > 0 then
    raise exception
      'HEALTH_SCORE_V3_FECHAMENTO_BLOQUEADO: roster divergente (ausentes %, excedentes %)',
      v_ausentes, v_excedentes;
  end if;
  if v_recorte_incompleto > 0 then
    raise exception
      'HEALTH_SCORE_V3_FECHAMENTO_RECORTE_INCOMPLETO: % snapshots nao cobrem o periodo completo',
      v_recorte_incompleto;
  end if;
  if v_comparaveis_esperados = 0 then
    raise exception 'HEALTH_SCORE_V3_FECHAMENTO_BLOQUEADO: nenhum professor comparavel';
  end if;

  perform set_config('app.health_score_v3_mutacao_controlada', 'on', true);

  for v_origem in
    with roster_unidade as (
      select distinct pu.unidade_id, p.id as professor_id
      from public.professores_unidades pu
      join public.unidades u on u.id = pu.unidade_id and u.ativo = true
      join public.professores p on p.id = pu.professor_id and p.ativo = true
      where pu.emusys_ativo = true
        and pu.validacao_status is distinct from 'ignorado'
        and to_jsonb(p) ->> 'mesclado_em_professor_id' is null
    ), roster_esperado as (
      select r.unidade_id, r.professor_id from roster_unidade r
      union
      select null::uuid, r.professor_id from roster_unidade r
    ), candidatos as (
      select s.*,
        row_number() over (
          partition by s.professor_id, s.unidade_id
          order by s.competencia desc, s.revisao desc, s.criado_em desc
        ) as rn
      from public.health_score_professor_v3_snapshots s
      where s.periodicidade = 'ciclo'
        and s.ciclo_codigo = p_ciclo_codigo
        and s.invalidado_em is null
        and s.estado_publicacao in ('parcial', 'sem_base')
    )
    select c.*
    from candidatos c
    join roster_esperado e
      on e.professor_id = c.professor_id
     and e.unidade_id is not distinct from c.unidade_id
    where c.rn = 1
      and c.estado_publicacao = 'parcial'
      and c.id = any(v_elegiveis)
      and c.score_exibivel
      and c.score is not null
    order by c.unidade_id nulls first, c.professor_id
  loop
    select coalesce(max(s.revisao), 0) + 1 into v_revisao
    from public.health_score_professor_v3_snapshots s
    where s.professor_id = v_origem.professor_id
      and s.unidade_id is not distinct from v_origem.unidade_id
      and s.competencia = v_origem.competencia
      and s.periodicidade = 'ciclo';

    insert into public.health_score_professor_v3_snapshots (
      professor_id, escopo, unidade_id, competencia, trimestre_inicio,
      revisao, estado, config_id, config_versao, score, cobertura,
      classificacao, publicavel, publicado, motivo_bloqueio, regra_versao,
      snapshot_anterior_id, justificativa_retificacao, criado_por, fechado_em,
      periodicidade, periodo_inicio, periodo_fim, ciclo_codigo,
      estado_publicacao, score_exibivel, ranking_habilitado
    ) values (
      v_origem.professor_id, v_origem.escopo, v_origem.unidade_id,
      v_origem.competencia, v_origem.trimestre_inicio, v_revisao, 'fechado',
      v_origem.config_id, v_origem.config_versao, v_origem.score,
      v_origem.cobertura, v_origem.classificacao, true, true, null,
      'health-score-professor-v3-fechamento-ciclo-2', v_origem.id,
      btrim(p_justificativa), v_usuario_id, now(), 'ciclo',
      v_origem.periodo_inicio, v_origem.periodo_fim, v_origem.ciclo_codigo,
      'oficial', true, true
    ) returning id into v_novo_id;

    insert into public.health_score_professor_v3_snapshot_metricas (
      snapshot_id, metrica, valor_bruto, numerador, denominador, amostra,
      estado_base, publicavel, confianca, fonte, regra_versao,
      motivo_sem_base, detalhes, nota, peso, peso_disponivel,
      contribuicao, meta_aplicada, peso_efetivo, codigo_evidencia, papel
    )
    select v_novo_id, m.metrica, m.valor_bruto, m.numerador, m.denominador,
      m.amostra, m.estado_base, m.publicavel, m.confianca, m.fonte,
      m.regra_versao, m.motivo_sem_base,
      m.detalhes || jsonb_build_object('fechado_oficialmente_em', now()),
      m.nota, m.peso, m.peso_disponivel, m.contribuicao, m.meta_aplicada,
      m.peso_efetivo, m.codigo_evidencia, m.papel
    from public.health_score_professor_v3_snapshot_metricas m
    where m.snapshot_id = v_origem.id;

    v_snapshots_fechados := v_snapshots_fechados + 1;
    v_ids := v_ids || jsonb_build_array(v_novo_id);
  end loop;

  if v_snapshots_fechados <> v_comparaveis_esperados then
    raise exception
      'HEALTH_SCORE_V3_FECHAMENTO_ATOMICO_FALHOU: esperados %, fechados %',
      v_comparaveis_esperados, v_snapshots_fechados;
  end if;

  update public.health_score_professor_v3_ciclos
  set estado = 'fechado', publicacao_oficial = true,
      ranking_habilitado = true, fechado_em = now(),
      fechado_por = v_usuario_id,
      justificativa_fechamento = btrim(p_justificativa)
  where id = v_ciclo.id;

  return jsonb_build_object(
    'ciclo_codigo', p_ciclo_codigo,
    'estado_publicacao', 'oficial',
    'ranking_habilitado', true,
    'snapshots_esperados', v_snapshots_esperados,
    'comparaveis_esperados', v_comparaveis_esperados,
    'snapshots_fechados', v_snapshots_fechados,
    'snapshot_ids', v_ids
  );
end;
$function$;

revoke all on function public.fechar_health_score_professor_v3_ciclo(
  text, text
) from public, anon, authenticated, service_role;
grant execute on function public.fechar_health_score_professor_v3_ciclo(
  text, text
) to authenticated, service_role;

alter function public.montar_relatorio_coordenacao_conteudo_v4(
  uuid, integer, integer, text
) rename to montar_rel_coord_before_confiabilidade_20260909;

revoke all on function public.montar_rel_coord_before_confiabilidade_20260909(
  uuid, integer, integer, text
) from public, anon, authenticated;
grant execute on function public.montar_rel_coord_before_confiabilidade_20260909(
  uuid, integer, integer, text
) to service_role;

create or replace function public.montar_relatorio_coordenacao_conteudo_v4(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodicidade text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_conteudo jsonb;
  v_total_professores integer := 0;
  v_comparaveis integer := 0;
  v_oficiais integer := 0;
  v_parciais integer := 0;
  v_ranking integer := 0;
  v_conversao_pontuando integer := 0;
  v_turmas_media_individual integer := 0;
  v_professores_presenca integer := 0;
  v_professores_sem_eventos integer := 0;
  v_eventos_presenca integer := 0;
  v_presentes integer := 0;
  v_ocorrencias_total integer := 0;
  v_ocorrencias_fora integer := 0;
  v_ocorrencias_incompletas integer := 0;
  v_ocorrencias_conflito integer := 0;
  v_presenca_media numeric;
  v_ciclo_oficial_completo boolean := false;
  v_estado_publicacao text;
  v_presenca_detalhada boolean;
begin
  if p_ano is null or p_ano not between 2020 and 2100
     or p_mes is null or p_mes not between 1 and 12
     or p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'RELATORIO_COORDENACAO_V4_PERIODO_INVALIDO'
      using errcode = '22023';
  end if;

  v_conteudo := public.montar_rel_coord_before_confiabilidade_20260909(
    p_unidade_id, p_ano, p_mes, p_periodicidade
  );
  if v_conteudo is null
     or jsonb_typeof(v_conteudo -> 'professores') <> 'array' then
    raise exception 'RELATORIO_COORDENACAO_V4_CONTEUDO_INVALIDO'
      using errcode = '22023';
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where professor.value ->> 'comparabilidade_estado' = 'comparavel'
        and professor.value -> 'score_comparavel' <> 'null'::jsonb
    )::integer,
    count(*) filter (
      where professor.value ->> 'comparabilidade_estado' = 'comparavel'
        and professor.value ->> 'estado_publicacao' = 'oficial'
        and coalesce((professor.value ->> 'ranking_habilitado')::boolean, false)
    )::integer,
    count(*) filter (
      where professor.value ->> 'comparabilidade_estado' = 'comparavel'
        and professor.value ->> 'estado_publicacao' <> 'oficial'
    )::integer,
    count(*) filter (
      where coalesce(
        nullif(professor.value #>> '{metricas,conversao,peso_efetivo}', '')::numeric,
        0
      ) > 0
    )::integer,
    coalesce(sum(
      case
        when coalesce(
          nullif(professor.value #>> '{metricas,media_turma,amostra}', '')::numeric,
          0
        ) > 0
        then (professor.value #>> '{metricas,media_turma,amostra}')::numeric
        else 0
      end
    ), 0)::integer,
    count(*) filter (
      where coalesce(
        nullif(professor.value #>> '{metricas,presenca,detalhes,denominador_observado}', '')::numeric,
        nullif(professor.value #>> '{metricas,presenca,denominador}', '')::numeric,
        0
      ) > 0
    )::integer,
    count(*) filter (
      where coalesce(
        nullif(professor.value #>> '{metricas,presenca,detalhes,denominador_observado}', '')::numeric,
        0
      ) = 0
    )::integer,
    coalesce(sum(coalesce(
      nullif(professor.value #>> '{metricas,presenca,detalhes,denominador_observado}', '')::numeric,
      0
    )), 0)::integer,
    coalesce(sum(coalesce(
      nullif(professor.value #>> '{metricas,presenca,detalhes,presentes_observados}', '')::numeric,
      0
    )), 0)::integer,
    coalesce(sum(coalesce(
      nullif(professor.value #>> '{metricas,presenca,detalhes,ocorrencias_observadas}', '')::numeric,
      0
    )), 0)::integer,
    coalesce(sum(coalesce(
      nullif(professor.value #>> '{metricas,presenca,detalhes,ocorrencias_fora_calculo}', '')::numeric,
      0
    )), 0)::integer,
    coalesce(sum(coalesce(
      nullif(professor.value #>> '{metricas,presenca,detalhes,ocorrencias_incompletas}', '')::numeric,
      0
    )), 0)::integer,
    coalesce(sum(coalesce(
      nullif(professor.value #>> '{metricas,presenca,detalhes,ocorrencias_com_conflito}', '')::numeric,
      0
    )), 0)::integer
  into v_total_professores, v_comparaveis, v_oficiais, v_parciais,
       v_conversao_pontuando, v_turmas_media_individual,
       v_professores_presenca, v_professores_sem_eventos,
       v_eventos_presenca, v_presentes, v_ocorrencias_total,
       v_ocorrencias_fora, v_ocorrencias_incompletas,
       v_ocorrencias_conflito
  from jsonb_array_elements(v_conteudo -> 'professores') professor(value);

  select coalesce(bool_and(
    coalesce((p.value #> '{metricas,presenca,detalhes}') ? 'ocorrencias_fora_calculo', false)
  ), false) into v_presenca_detalhada
  from jsonb_array_elements(v_conteudo -> 'professores') p(value);

  v_ranking := case
    when jsonb_typeof(v_conteudo -> 'ranking_oficial') = 'array'
      then jsonb_array_length(v_conteudo -> 'ranking_oficial')
    else 0
  end;
  v_presenca_media := case when v_eventos_presenca > 0
    then round(v_presentes::numeric / v_eventos_presenca * 100, 1)
    else null
  end;
  v_ciclo_oficial_completo := p_periodicidade = 'ciclo'
    and coalesce((v_conteudo #>> '{periodo,publicacao_oficial}')::boolean, false)
    and coalesce((v_conteudo #>> '{periodo,ranking_habilitado}')::boolean, false)
    and v_conteudo #>> '{periodo,ciclo_estado}' = 'fechado'
    and v_comparaveis > 0
    and v_comparaveis = v_oficiais
    and v_comparaveis = v_ranking
    and not exists (
      select 1 from jsonb_array_elements(v_conteudo -> 'professores') p
      where p ->> 'comparabilidade_estado' = 'comparavel'
        and not exists (
          select 1 from jsonb_array_elements(v_conteudo -> 'ranking_oficial') r
          where r ->> 'professor_id' = p ->> 'professor_id'
            and (r ->> 'score')::numeric = (p ->> 'score_comparavel')::numeric
        )
    );
  v_estado_publicacao := case
    when v_ciclo_oficial_completo then 'oficial'
    when p_periodicidade = 'ciclo' then 'ciclo_em_acompanhamento'
    else 'mensal'
  end;

  v_conteudo := jsonb_set(
    v_conteudo,
    '{resumo_equipe}',
    coalesce(v_conteudo -> 'resumo_equipe', '{}'::jsonb) || jsonb_build_object(
      'total_professores', v_total_professores,
      'comparaveis', v_comparaveis,
      'oficiais', v_oficiais,
      'parciais', v_parciais
    ),
    true
  );
  v_conteudo := jsonb_set(
    v_conteudo,
    '{periodo}',
    coalesce(v_conteudo -> 'periodo', '{}'::jsonb) || jsonb_build_object(
      'estado_publicacao', v_estado_publicacao
    ),
    true
  );
  v_conteudo := jsonb_set(
    v_conteudo,
    '{experimentais}',
    coalesce(v_conteudo -> 'experimentais', '{}'::jsonb) || jsonb_build_object(
      'professores_conversao_pontuando', v_conversao_pontuando
    ),
    true
  );
  v_conteudo := jsonb_set(
    v_conteudo,
    '{carteira_carga}',
    coalesce(v_conteudo -> 'carteira_carga', '{}'::jsonb) || jsonb_build_object(
      'turmas_usadas_na_media_individual', v_turmas_media_individual
    ),
    true
  );
  if v_presenca_detalhada then
  v_conteudo := jsonb_set(
    v_conteudo,
    '{presenca}',
    (coalesce(v_conteudo -> 'presenca', '{}'::jsonb) - 'pendencias')
      || jsonb_build_object(
        'total_professores', v_total_professores,
        'professores_com_evidencia', v_professores_presenca,
        'professores_sem_eventos', v_professores_sem_eventos,
        'presenca_media', v_presenca_media,
        'eventos_elegiveis', v_eventos_presenca,
        'presencas_confirmadas', v_presentes,
        'ocorrencias_observadas', v_ocorrencias_total,
        'ocorrencias_fora_calculo', v_ocorrencias_fora,
        'ocorrencias_incompletas', v_ocorrencias_incompletas,
        'ocorrencias_com_conflito', v_ocorrencias_conflito,
        'regra_agregacao',
          'soma_das_presencas_dividida_pelas_ocorrencias_elegiveis'
      ),
    true
  );

  else
    -- Períodos ainda não retificados mantêm os totais que foram capturados.
    -- Não inferir contagens novas como zero a partir de metadados ausentes.
    v_conteudo := jsonb_set(v_conteudo, '{presenca}',
      coalesce(v_conteudo -> 'presenca', '{}'::jsonb)
      || jsonb_build_object('total_professores', v_total_professores), true);
  end if;

  return (v_conteudo - 'motor_documento') || jsonb_build_object(
    'motor_documento', jsonb_build_object(
      'versao', 'coordenacao-v4-confiabilidade-total-20260909',
      'periodicidade', p_periodicidade
    )
  );
end;
$function$;

revoke all on function public.montar_relatorio_coordenacao_conteudo_v4(
  uuid, integer, integer, text
) from public, anon, authenticated;
grant execute on function public.montar_relatorio_coordenacao_conteudo_v4(
  uuid, integer, integer, text
) to service_role;

-- Retificação append-only do ciclo Jun-Ago. O materializador devolve os IDs
-- exatos desta execução; somente eles podem originar a nova revisão oficial.
-- Revisões são locais à competência: outubro deve superar setembro mesmo
-- que setembro tenha acumulado mais revisões diárias.
do $corrigir_ordem_competencia$
declare
  v_def text;
begin
  v_def := pg_get_functiondef(
    'public.get_health_score_professor_v3_performance_snapshot_v1(date,uuid,text)'::regprocedure
  );
  if position('order by s.revisao desc, s.criado_em desc, s.id desc' in v_def) = 0 then
    raise exception 'CONTRATO_SNAPSHOT_ORDEM_INESPERADO';
  end if;
  execute replace(v_def,
    'order by s.revisao desc, s.criado_em desc, s.id desc',
    'order by s.competencia desc, s.revisao desc, s.criado_em desc, s.id desc');
end;
$corrigir_ordem_competencia$;

-- Mesma deduplicação e janela D+30 da conversão vigente, isoladas das
-- consultas de outros indicadores. O antigo filtro SQL executava todo o
-- corpo PL/pgSQL legado, inclusive uma presença descartada e muito onerosa.
CREATE OR REPLACE FUNCTION public.get_health_score_professor_v3_conversao_base_v2(p_competencia date, p_unidade_id uuid DEFAULT NULL::uuid, p_periodicidade text DEFAULT 'mensal'::text)
 RETURNS TABLE(metrica text, professor_id integer, professor_nome text, unidade_id uuid, competencia date, valor_bruto numeric, numerador numeric, denominador numeric, amostra integer, estado_base text, publicavel boolean, confianca text, fonte text, regra_versao text, motivo_sem_base text, detalhes jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
            nullif((case when r.emusys_lead_id_zero then '0' else r.emusys_lead_id::text end), '') ~ '^[0-9]+$'
            and le.emusys_lead_id = ((case when r.emusys_lead_id_zero then '0' else r.emusys_lead_id::text end))::bigint
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

end;
$function$;

revoke all on function public.get_health_score_professor_v3_conversao_base_v2(date,uuid,text) from public,anon,authenticated;
grant execute on function public.get_health_score_professor_v3_conversao_base_v2(date,uuid,text) to service_role;

CREATE OR REPLACE FUNCTION public.get_health_score_professor_v3_conversao_mensal(p_competencia date, p_unidade_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(metrica text, professor_id integer, professor_nome text, unidade_id uuid, competencia date, valor_bruto numeric, numerador numeric, denominador numeric, amostra integer, estado_base text, publicavel boolean, confianca text, fonte text, regra_versao text, motivo_sem_base text, detalhes jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    b.metrica, b.professor_id, b.professor_nome, b.unidade_id,
    date_trunc('month', p_competencia)::date, b.valor_bruto,
    b.numerador, b.denominador, b.amostra,
    case
      when coalesce(b.denominador, 0) = 0 then 'sem_base'
      when coalesce(b.amostra, 0) < 3 then 'sem_base_amostra'
      else b.estado_base
    end,
    b.publicavel, b.confianca, b.fonte,
    'health-score-professor-v3-conversao-mensal-1'::text,
    case
      when coalesce(b.denominador, 0) = 0 then 'nenhuma experimental confirmada no mes'
      when coalesce(b.amostra, 0) < 3 then 'amostra minima de 3 experimentais nao atingida'
      else b.motivo_sem_base
    end,
    coalesce(b.detalhes, '{}'::jsonb) || jsonb_build_object(
      'periodicidade', 'mensal',
      'codigo_evidencia', case
        when coalesce(b.denominador, 0) = 0 then 'sem_experimental_mes'
        when coalesce(b.amostra, 0) < 3 then 'amostra_experimental_insuficiente'
        else 'evidencia_mensal_disponivel'
      end,
      'fora_do_score', false
    )
  from public.get_health_score_professor_v3_conversao_base_v2(
    date_trunc('month', p_competencia)::date,
    p_unidade_id,
    'mensal'
  ) b
  where b.metrica = 'conversao';
$function$;


create or replace function public.retificar_coordenacao_jun_ago_2026()
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $retificar_ciclo_jun_ago$
declare
  v_ciclo public.health_score_professor_v3_ciclos%rowtype;
  v_materializacao jsonb;
  v_snapshot_ids jsonb;
  v_origem record;
  v_novo_id uuid;
  v_revisao integer;
  v_snapshots_esperados integer;
  v_comparaveis_esperados integer;
  v_fechados integer := 0;
  v_anteriores jsonb;
  v_elegiveis uuid[];
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user <> 'postgres' then
    raise exception 'RETIFICACAO_COORDENACAO_ACESSO_NEGADO' using errcode='42501';
  end if;
  select * into strict v_ciclo
  from public.health_score_professor_v3_ciclos
  where codigo = '2026-JUN-AGO'
  for update;

  if current_date < v_ciclo.data_fim then
    raise exception 'RETIFICACAO_JUN_AGO_ANTES_DO_FIM';
  end if;

  v_materializacao := public.materializar_health_score_professor_v3_periodo(
    date '2026-08-01', 'ciclo', null, null
  );
  v_snapshot_ids := coalesce(v_materializacao -> 'snapshot_ids', '[]'::jsonb);

  with roster_unidade as (
    select distinct pu.unidade_id, p.id as professor_id
    from public.professores_unidades pu
    join public.unidades u on u.id = pu.unidade_id and u.ativo = true
    join public.professores p on p.id = pu.professor_id and p.ativo = true
    where pu.emusys_ativo = true
      and pu.validacao_status is distinct from 'ignorado'
      and to_jsonb(p) ->> 'mesclado_em_professor_id' is null
  ), roster_esperado as (
    select unidade_id, professor_id from roster_unidade
    union
    select null::uuid, professor_id from roster_unidade
  )
  select count(*)::integer into v_snapshots_esperados
  from roster_esperado;

  if exists (
    with ids as (
      select item.id::uuid id
      from jsonb_array_elements_text(v_snapshot_ids) item(id)
    ), roster_unidade as (
      select distinct pu.unidade_id, p.id as professor_id
      from public.professores_unidades pu
      join public.unidades u on u.id = pu.unidade_id and u.ativo = true
      join public.professores p on p.id = pu.professor_id and p.ativo = true
      where pu.emusys_ativo = true
        and pu.validacao_status is distinct from 'ignorado'
        and to_jsonb(p) ->> 'mesclado_em_professor_id' is null
    ), roster_esperado as (
      select unidade_id, professor_id from roster_unidade
      union
      select null::uuid, professor_id from roster_unidade
    )
    select 1
    from roster_esperado e
    where not exists (
      select 1
      from ids
      join public.health_score_professor_v3_snapshots s using (id)
      where s.professor_id = e.professor_id
        and s.unidade_id is not distinct from e.unidade_id
    )
  ) then
    raise exception
      'RETIFICACAO_JUN_AGO_SNAPSHOTS_INCOMPLETOS: roster esperado %',
      v_snapshots_esperados;
  end if;

  if exists (
    with ids as (
      select item.id::uuid id
      from jsonb_array_elements_text(v_snapshot_ids) item(id)
    ), roster_unidade as (
      select distinct pu.unidade_id, p.id as professor_id
      from public.professores_unidades pu
      join public.unidades u on u.id = pu.unidade_id and u.ativo = true
      join public.professores p on p.id = pu.professor_id and p.ativo = true
      where pu.emusys_ativo = true
        and pu.validacao_status is distinct from 'ignorado'
        and to_jsonb(p) ->> 'mesclado_em_professor_id' is null
    ), roster_esperado as (
      select unidade_id, professor_id from roster_unidade
      union
      select null::uuid, professor_id from roster_unidade
    )
    select 1
    from ids
    join public.health_score_professor_v3_snapshots s using (id)
    where not exists (
      select 1 from roster_esperado e
      where e.professor_id = s.professor_id
        and e.unidade_id is not distinct from s.unidade_id
    )
      and (
        s.estado_publicacao <> 'sem_base'
        or s.score is not null
        or s.score_exibivel
        or s.ranking_habilitado
      )
  ) then
    raise exception 'RETIFICACAO_JUN_AGO_EXCEDENTE_COM_EVIDENCIA';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(v_snapshot_ids) item(id)
    left join public.health_score_professor_v3_snapshots s
      on s.id = item.id::uuid
    where s.id is null
       or s.ciclo_codigo <> '2026-JUN-AGO'
       or s.periodicidade <> 'ciclo'
       or s.periodo_inicio <> v_ciclo.data_inicio
       or s.periodo_fim <> v_ciclo.data_fim
       or s.criado_em::date < v_ciclo.data_fim
       or exists (
         select 1
         from public.health_score_professor_v3_snapshot_metricas m
         where m.snapshot_id = s.id
           and m.detalhes ? 'fim_recorte'
           and nullif(m.detalhes ->> 'fim_recorte', '')::date <> v_ciclo.data_fim
       )
  ) then
    raise exception 'RETIFICACAO_JUN_AGO_RECORTE_INCOMPLETO';
  end if;

  select array_agg(distinct p.retrato_execucao_id) into v_elegiveis
  from (select id from public.unidades where ativo union all select null::uuid) u
  cross join lateral public.get_health_score_professor_v3_performance_snapshot_v3(
    date '2026-08-01', u.id, 'ciclo'
  ) p
  where p.comparabilidade_estado = 'comparavel'
    and p.score_comparavel is not null and p.score_exibivel;

  select count(*)::integer into v_comparaveis_esperados
  from jsonb_array_elements_text(v_snapshot_ids) item(id)
  join public.health_score_professor_v3_snapshots s on s.id = item.id::uuid
  where s.estado_publicacao = 'parcial'
    and s.id = any(v_elegiveis)
    and s.score_exibivel
    and s.score is not null;

  if v_comparaveis_esperados = 0 then
    raise exception 'RETIFICACAO_JUN_AGO_SEM_COMPARAVEIS';
  end if;

  perform set_config('app.health_score_v3_mutacao_controlada', 'on', true);

  select coalesce(jsonb_object_agg(
    concat(s.professor_id, ':', coalesce(s.unidade_id::text, 'rede')), s.id
  ), '{}'::jsonb) into v_anteriores
  from public.health_score_professor_v3_snapshots s
  where s.ciclo_codigo = v_ciclo.codigo and s.periodicidade = 'ciclo'
    and s.estado = 'fechado';

  -- Transição formal permitida pelo trigger de imutabilidade. Nenhum valor,
  -- configuração, identidade ou evidência histórica é alterado/apagado.
  update public.health_score_professor_v3_snapshots s
  set estado = 'invalidado', publicavel = false, ranking_habilitado = false,
      invalidado_em = now(),
      motivo_bloqueio = 'substituido por retificacao integral Jun-Ago/2026'
  where s.ciclo_codigo = v_ciclo.codigo and s.periodicidade = 'ciclo'
    and s.estado = 'fechado';

  for v_origem in
    select s.*
    from jsonb_array_elements_text(v_snapshot_ids) item(id)
    join public.health_score_professor_v3_snapshots s on s.id = item.id::uuid
    where s.estado_publicacao = 'parcial'
      and s.id = any(v_elegiveis)
      and s.score_exibivel
      and s.score is not null
    order by s.unidade_id nulls first, s.professor_id
  loop
    select coalesce(max(s.revisao), 0) + 1 into v_revisao
    from public.health_score_professor_v3_snapshots s
    where s.professor_id = v_origem.professor_id
      and s.unidade_id is not distinct from v_origem.unidade_id
      and s.competencia = v_origem.competencia
      and s.periodicidade = 'ciclo';

    insert into public.health_score_professor_v3_snapshots (
      professor_id, escopo, unidade_id, competencia, trimestre_inicio,
      revisao, estado, config_id, config_versao, score, cobertura,
      classificacao, publicavel, publicado, motivo_bloqueio, regra_versao,
      snapshot_anterior_id, justificativa_retificacao, criado_por, fechado_em,
      periodicidade, periodo_inicio, periodo_fim, ciclo_codigo,
      estado_publicacao, score_exibivel, ranking_habilitado
    ) values (
      v_origem.professor_id, v_origem.escopo, v_origem.unidade_id,
      v_origem.competencia, v_origem.trimestre_inicio, v_revisao, 'fechado',
      v_origem.config_id, v_origem.config_versao, v_origem.score,
      v_origem.cobertura, v_origem.classificacao, true, true, null,
      'health-score-professor-v3-retificacao-ciclo-2', coalesce(
        (v_anteriores ->> concat(v_origem.professor_id, ':',
          coalesce(v_origem.unidade_id::text, 'rede')))::uuid,
        v_origem.id
      ),
      'Retificacao integral do periodo e publicacao atomica da equipe comparavel.',
      null, now(), 'ciclo', v_origem.periodo_inicio, v_origem.periodo_fim,
      v_origem.ciclo_codigo, 'oficial', true, true
    ) returning id into v_novo_id;

    insert into public.health_score_professor_v3_snapshot_metricas (
      snapshot_id, metrica, valor_bruto, numerador, denominador, amostra,
      estado_base, publicavel, confianca, fonte, regra_versao,
      motivo_sem_base, detalhes, nota, peso, peso_disponivel,
      contribuicao, meta_aplicada, peso_efetivo, codigo_evidencia, papel
    )
    select v_novo_id, m.metrica, m.valor_bruto, m.numerador, m.denominador,
      m.amostra, m.estado_base, m.publicavel, m.confianca, m.fonte,
      m.regra_versao, m.motivo_sem_base,
      m.detalhes || jsonb_build_object(
        'retificado_oficialmente_em', now(),
        'snapshot_evidencia_origem_id', v_origem.id,
        'retificacao', 'periodo_integral_e_publicacao_atomica'
      ),
      m.nota, m.peso, m.peso_disponivel, m.contribuicao, m.meta_aplicada,
      m.peso_efetivo, m.codigo_evidencia, m.papel
    from public.health_score_professor_v3_snapshot_metricas m
    where m.snapshot_id = v_origem.id;

    v_fechados := v_fechados + 1;
  end loop;

  if v_fechados <> v_comparaveis_esperados then
    raise exception
      'RETIFICACAO_JUN_AGO_ATOMICA_FALHOU: esperados %, fechados %',
      v_comparaveis_esperados, v_fechados;
  end if;

  update public.health_score_professor_v3_ciclos
  set estado = 'fechado',
      publicacao_oficial = true,
      ranking_habilitado = true,
      fechado_em = now(),
      justificativa_fechamento =
        'Retificacao integral do periodo e publicacao atomica da equipe comparavel.'
  where id = v_ciclo.id;
  return jsonb_build_object('ciclo_codigo', v_ciclo.codigo,
    'comparaveis_esperados', v_comparaveis_esperados, 'snapshots_fechados', v_fechados);
end;
$retificar_ciclo_jun_ago$;
revoke all on function public.retificar_coordenacao_jun_ago_2026() from public,anon,authenticated;
grant execute on function public.retificar_coordenacao_jun_ago_2026() to service_role;


-- A carga é executada por recorte após esta transação curta, e validada
-- pelo gate de liberação. Nenhum backfill longo mantém o lock da restrição.

comment on function public.get_health_score_professor_v3_presenca_periodo_v2(
  date, uuid, text
) is 'Presenca V3 calculada por ocorrencias classificadas; qualidade residual e informada separadamente sem bloqueio global.';

comment on function public.fechar_health_score_professor_v3_ciclo(
  text, text
) is 'Fecha ciclo somente com recorte integral e publica atomicamente todos os professores comparaveis.';

comment on function public.montar_relatorio_coordenacao_conteudo_v4(
  uuid, integer, integer, text
) is 'Documento V4 com publicação completa, universos explícitos e qualidade numérica sem zeros artificiais.';

commit;
