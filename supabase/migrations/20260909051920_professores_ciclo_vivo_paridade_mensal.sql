begin;

-- O seletor usa o primeiro mes como chave estavel do ciclo. Para um ciclo que
-- ainda esta acontecendo, a competencia de calculo avanca ate o mes corrente;
-- ciclos historicos continuam usando a competencia solicitada.
create or replace function public.fn_health_score_professor_v3_competencia_ciclo_vivo(
  p_competencia date,
  p_data_corte date default current_date
)
returns date
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_corte date := coalesce(p_data_corte, current_date);
  v_periodo record;
begin
  if p_competencia is null then
    raise exception 'HEALTH_SCORE_V3_COMPETENCIA_CICLO_INVALIDA'
      using errcode = '22023';
  end if;

  select p.* into v_periodo
  from public.fn_health_score_v3_periodo(v_competencia, 'ciclo') p;

  if v_corte between v_periodo.periodo_inicio and v_periodo.periodo_fim then
    return date_trunc('month', v_corte)::date;
  end if;

  return v_competencia;
end;
$function$;

revoke all on function public.fn_health_score_professor_v3_competencia_ciclo_vivo(date, date)
  from public, anon, authenticated;
grant execute on function public.fn_health_score_professor_v3_competencia_ciclo_vivo(date, date)
  to service_role;

-- A implementacao vigente continua sendo a responsavel pelo acumulado de dois
-- e tres meses. O adaptador acrescenta somente dois invariantes:
--   1. no primeiro mes, Ciclo e Mensal sao a mesma fotografia de fatos/regras;
--   2. depois, a competencia passada ao acumulador acompanha o mes corrente.
alter function public.get_health_score_professor_v3_projecao_viva(date, uuid, text)
  rename to get_hs_prof_v3_projecao_viva_before_ciclo_parity_20260909;

revoke all on function public.get_hs_prof_v3_projecao_viva_before_ciclo_parity_20260909(
  date, uuid, text
) from public, anon, authenticated;

create or replace function public.get_health_score_professor_v3_projecao_viva(
  p_competencia date,
  p_unidade_id uuid default null,
  p_periodicidade text default 'mensal'
)
returns table (
  professor_id integer, unidade_id uuid, escopo text, competencia date,
  trimestre_inicio date, periodicidade text, periodo_inicio date, periodo_fim date,
  ciclo_codigo text, estado_publicacao text, score_exibivel boolean,
  ranking_habilitado boolean, config_versao integer, revisao integer, score numeric,
  cobertura numeric, classificacao text, estado text, snapshot_publicavel boolean,
  publicado boolean, motivo_bloqueio text, regra_versao_snapshot text,
  metrica text, valor_bruto numeric, numerador numeric, denominador numeric,
  nota numeric, peso numeric, peso_disponivel boolean, peso_efetivo numeric,
  contribuicao numeric, meta numeric, amostra integer, estado_base text,
  metrica_publicavel boolean, confianca text, fonte text,
  regra_versao_metrica text, motivo_sem_base text, codigo_evidencia text,
  papel text, detalhes jsonb
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_competencia_efetiva date;
  v_periodo_inicio date;
  v_periodo_fim date;
  v_ciclo_codigo text;
begin
  if p_competencia is null or p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'HEALTH_SCORE_V3_PERIODICIDADE_INVALIDA: use mensal ou ciclo'
      using errcode = '22023';
  end if;

  if p_periodicidade = 'mensal' then
    return query
    select b.*
    from public.get_hs_prof_v3_projecao_viva_before_ciclo_parity_20260909(
      v_competencia,
      p_unidade_id,
      'mensal'
    ) b;
    return;
  end if;

  select p.periodo_inicio, p.periodo_fim, p.ciclo_codigo
    into v_periodo_inicio, v_periodo_fim, v_ciclo_codigo
  from public.fn_health_score_v3_periodo(v_competencia, 'ciclo') p;

  v_competencia_efetiva :=
    public.fn_health_score_professor_v3_competencia_ciclo_vivo(
      v_competencia,
      current_date
    );

  if current_date between v_periodo_inicio and v_periodo_fim
     and v_competencia_efetiva = v_periodo_inicio then
    return query
    select
      b.professor_id,
      b.unidade_id,
      b.escopo,
      v_competencia_efetiva,
      v_periodo_inicio,
      'ciclo'::text,
      v_periodo_inicio,
      v_periodo_fim,
      v_ciclo_codigo,
      'ciclo_em_acompanhamento'::text,
      b.score_exibivel,
      false,
      b.config_versao,
      0,
      b.score,
      b.cobertura,
      b.classificacao,
      b.estado,
      false,
      false,
      'ciclo_em_acompanhamento'::text,
      'health-score-professor-v3-ciclo-primeiro-mes-paridade-1'::text,
      b.metrica,
      b.valor_bruto,
      b.numerador,
      b.denominador,
      b.nota,
      b.peso,
      b.peso_disponivel,
      b.peso_efetivo,
      b.contribuicao,
      b.meta,
      b.amostra,
      b.estado_base,
      b.metrica_publicavel,
      b.confianca,
      b.fonte,
      b.regra_versao_metrica,
      b.motivo_sem_base,
      b.codigo_evidencia,
      b.papel,
      coalesce(b.detalhes, '{}'::jsonb) || jsonb_build_object(
        'periodicidade', 'ciclo',
        'periodo_inicio', v_periodo_inicio,
        'periodo_fim', v_periodo_fim,
        'data_corte', current_date,
        'competencia_fonte', v_competencia_efetiva,
        'primeiro_mes_igual_ao_mensal', true
      )
    from public.get_hs_prof_v3_projecao_viva_before_ciclo_parity_20260909(
      v_competencia_efetiva,
      p_unidade_id,
      'mensal'
    ) b;
    return;
  end if;

  return query
  select b.*
  from public.get_hs_prof_v3_projecao_viva_before_ciclo_parity_20260909(
    v_competencia_efetiva,
    p_unidade_id,
    'ciclo'
  ) b;
end;
$function$;

revoke all on function public.get_health_score_professor_v3_projecao_viva(date, uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_health_score_professor_v3_projecao_viva(date, uuid, text)
  to service_role;

comment on function public.get_health_score_professor_v3_projecao_viva(date, uuid, text) is
  'Projecao viva: primeiro mes do ciclo espelha o mensal; meses seguintes acumulam ate a competencia corrente do mesmo ciclo.';

-- O documento usa o primeiro mes como chave de armazenamento. A composicao
-- factual vigente continua intacta e recebe somente a competencia efetiva do
-- ciclo aberto. Ao final, ano/mes voltam para a chave selecionada no painel.
alter function public.montar_relatorio_coordenacao_conteudo_v4(
  uuid, integer, integer, text
) rename to montar_rel_coord_conteudo_before_ciclo_vivo_20260909;

revoke all on function public.montar_rel_coord_conteudo_before_ciclo_vivo_20260909(
  uuid, integer, integer, text
) from public, anon, authenticated;

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
  v_competencia_fonte date := make_date(p_ano, p_mes, 1);
  v_ano_fonte integer := p_ano;
  v_mes_fonte integer := p_mes;
  v_conteudo jsonb;
begin
  if p_ano is null or p_ano not between 2020 and 2100
     or p_mes is null or p_mes not between 1 and 12
     or p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'RELATORIO_COORDENACAO_V4_PERIODO_INVALIDO'
      using errcode = '22023';
  end if;

  if p_periodicidade = 'ciclo' then
    v_competencia_fonte := public.fn_health_score_professor_v3_competencia_ciclo_vivo(
      make_date(p_ano, p_mes, 1),
      current_date
    );
    v_ano_fonte := extract(year from v_competencia_fonte)::integer;
    v_mes_fonte := extract(month from v_competencia_fonte)::integer;
  end if;

  v_conteudo := public.montar_rel_coord_conteudo_before_ciclo_vivo_20260909(
    p_unidade_id,
    v_ano_fonte,
    v_mes_fonte,
    p_periodicidade
  );

  if v_conteudo is null
     or jsonb_typeof(v_conteudo -> 'professores') <> 'array'
     or jsonb_typeof(v_conteudo -> 'periodo') <> 'object' then
    raise exception 'RELATORIO_COORDENACAO_V4_CONTEUDO_INVALIDO'
      using errcode = '22023';
  end if;

  return jsonb_set(
    jsonb_set(
      v_conteudo,
      '{periodo,ano}',
      to_jsonb(p_ano),
      true
    ),
    '{periodo,mes}',
    to_jsonb(p_mes),
    true
  );
end;
$function$;

revoke all on function public.montar_relatorio_coordenacao_conteudo_v4(
  uuid, integer, integer, text
) from public, anon, authenticated;
grant execute on function public.montar_relatorio_coordenacao_conteudo_v4(
  uuid, integer, integer, text
) to service_role;

comment on function public.montar_rel_coord_conteudo_before_ciclo_vivo_20260909(
  uuid, integer, integer, text
) is 'Composicao factual V4 anterior ao adaptador de competencia do ciclo vivo.';

comment on function public.montar_relatorio_coordenacao_conteudo_v4(
  uuid, integer, integer, text
) is 'Documento V4: chave estavel no primeiro mes e fatos acumulados ate a competencia corrente do ciclo aberto.';

commit;
