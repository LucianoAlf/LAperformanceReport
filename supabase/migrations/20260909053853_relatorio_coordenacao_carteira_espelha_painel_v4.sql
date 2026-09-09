begin;

-- Extrai a mesma linha que a pagina de Performance renderiza. Esta funcao e
-- usada somente durante a materializacao; o clique continua lendo o documento.
create or replace function public.relatorio_coordenacao_carteira_painel_v4(
  p_unidade_id uuid,
  p_competencia date,
  p_periodicidade text
)
returns table (
  professor_id integer,
  metrica jsonb
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select
    p.professor_id,
    jsonb_build_object(
      'valor', p.valor_bruto,
      'valor_bruto', p.valor_bruto,
      'numerador', p.numerador,
      'denominador', p.denominador,
      'nota', p.nota,
      'peso', p.peso,
      'peso_disponivel', p.peso_disponivel,
      'peso_efetivo', p.peso_efetivo,
      'contribuicao', p.contribuicao,
      'meta', p.meta,
      'amostra', p.amostra,
      'estado_base', p.estado_base,
      'publicavel', p.metrica_publicavel,
      'confianca', p.confianca,
      'fonte', p.fonte,
      'regra_versao', p.regra_versao_metrica,
      'motivo', p.motivo_sem_base,
      'motivo_sem_base', p.motivo_sem_base,
      'codigo_evidencia', p.codigo_evidencia,
      'papel', p.papel,
      'detalhes', coalesce(p.detalhes, '{}'::jsonb)
    ) as metrica
  from public.get_health_score_professor_v3_performance_snapshot_v3(
    date_trunc('month', p_competencia)::date,
    p_unidade_id,
    p_periodicidade
  ) p
  where p.metrica = 'numero_alunos'
  order by p.professor_id;
$function$;

revoke all on function public.relatorio_coordenacao_carteira_painel_v4(
  uuid, date, text
) from public, anon, authenticated;
grant execute on function public.relatorio_coordenacao_carteira_painel_v4(
  uuid, date, text
) to service_role;

alter function public.montar_relatorio_coordenacao_conteudo_v4(
  uuid, integer, integer, text
) rename to montar_rel_coord_conteudo_before_carteira_painel_20260909;

revoke all on function public.montar_rel_coord_conteudo_before_carteira_painel_20260909(
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
  v_competencia date := make_date(p_ano, p_mes, 1);
  v_conteudo jsonb;
  v_carteiras jsonb;
  v_professores jsonb := '[]'::jsonb;
  v_item jsonb;
  v_metrica jsonb;
  v_operacional jsonb;
  v_professor_id integer;
  v_total numeric;
  v_quantidade integer;
  v_media numeric;
begin
  if p_ano is null or p_ano not between 2020 and 2100
     or p_mes is null or p_mes not between 1 and 12
     or p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'RELATORIO_COORDENACAO_V4_PERIODO_INVALIDO'
      using errcode = '22023';
  end if;

  if p_periodicidade = 'ciclo' then
    v_competencia := public.fn_health_score_professor_v3_competencia_ciclo_vivo(
      v_competencia,
      current_date
    );
  end if;

  v_conteudo := public.montar_rel_coord_conteudo_before_carteira_painel_20260909(
    p_unidade_id,
    p_ano,
    p_mes,
    p_periodicidade
  );

  if v_conteudo is null
     or jsonb_typeof(v_conteudo -> 'professores') <> 'array' then
    raise exception 'RELATORIO_COORDENACAO_V4_CONTEUDO_INVALIDO'
      using errcode = '22023';
  end if;

  select coalesce(
    jsonb_object_agg(c.professor_id::text, c.metrica),
    '{}'::jsonb
  ) into v_carteiras
  from public.relatorio_coordenacao_carteira_painel_v4(
    p_unidade_id,
    v_competencia,
    p_periodicidade
  ) c;

  for v_item in
    select value
    from jsonb_array_elements(v_conteudo -> 'professores') with ordinality
    order by ordinality
  loop
    v_professor_id := nullif(v_item ->> 'professor_id', '')::integer;
    v_metrica := v_carteiras -> v_professor_id::text;

    if v_metrica is not null then
      v_item := jsonb_set(
        v_item,
        '{metricas,numero_alunos}',
        coalesce(v_item #> '{metricas,numero_alunos}', '{}'::jsonb) || v_metrica,
        true
      );
      v_operacional := coalesce(v_item -> 'operacional', '{}'::jsonb)
        || jsonb_build_object(
          'carteira_alunos', nullif(v_metrica ->> 'valor', '')::numeric
        );
      v_item := jsonb_set(v_item, '{operacional}', v_operacional, true);
    end if;

    v_professores := v_professores || jsonb_build_array(v_item);
  end loop;

  select
    sum(nullif(p.item #>> '{metricas,numero_alunos,valor}', '')::numeric),
    count(nullif(p.item #>> '{metricas,numero_alunos,valor}', ''))::integer,
    round(avg(nullif(p.item #>> '{metricas,numero_alunos,valor}', '')::numeric), 1)
  into v_total, v_quantidade, v_media
  from jsonb_array_elements(v_professores) p(item);

  v_conteudo := jsonb_set(v_conteudo, '{professores}', v_professores, true);
  v_conteudo := jsonb_set(
    v_conteudo,
    '{carteira_carga,alunos_na_carteira}',
    coalesce(to_jsonb(v_total), 'null'::jsonb),
    true
  );
  v_conteudo := jsonb_set(
    v_conteudo,
    '{carteira_carga,professores_com_carteira_observada}',
    to_jsonb(v_quantidade),
    true
  );
  v_conteudo := jsonb_set(
    v_conteudo,
    '{carteira_carga,media_por_professor}',
    coalesce(to_jsonb(v_media), 'null'::jsonb),
    true
  );

  return v_conteudo;
end;
$function$;

revoke all on function public.montar_relatorio_coordenacao_conteudo_v4(
  uuid, integer, integer, text
) from public, anon, authenticated;
grant execute on function public.montar_relatorio_coordenacao_conteudo_v4(
  uuid, integer, integer, text
) to service_role;

comment on function public.montar_relatorio_coordenacao_conteudo_v4(
  uuid, integer, integer, text
) is 'Documento V4 cuja carteira individual e total reproduzem o mesmo leitor da pagina de Performance.';

commit;
