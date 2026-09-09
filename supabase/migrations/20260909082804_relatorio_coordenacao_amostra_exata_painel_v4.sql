-- O documento da Coordenacao ja espelha todos os fatos e estados do painel.
-- Este ultimo adaptador elimina a unica normalizacao residual: ausencia de
-- amostra era serializada como 0, enquanto o painel preserva null.

begin;

alter function public.montar_relatorio_coordenacao_conteudo_v4(
  uuid, integer, integer, text
) rename to montar_rel_coord_conteudo_before_amostra_exata_20260909;

revoke all on function public.montar_rel_coord_conteudo_before_amostra_exata_20260909(
  uuid, integer, integer, text
) from public, anon, authenticated;
grant execute on function public.montar_rel_coord_conteudo_before_amostra_exata_20260909(
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
  v_competencia_seletor date;
  v_competencia_painel date;
  v_conteudo jsonb;
  v_amostras jsonb;
  v_professores jsonb;
  v_metricas_documento integer;
  v_metricas_painel integer;
begin
  if p_ano is null or p_ano not between 2020 and 2100
     or p_mes is null or p_mes not between 1 and 12
     or p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'RELATORIO_COORDENACAO_V4_PERIODO_INVALIDO'
      using errcode = '22023';
  end if;

  v_competencia_seletor := make_date(p_ano, p_mes, 1);
  v_competencia_painel := case
    when p_periodicidade = 'ciclo' then
      public.fn_health_score_professor_v3_competencia_ciclo_vivo(
        v_competencia_seletor,
        current_date
      )
    else v_competencia_seletor
  end;

  v_conteudo := public.montar_rel_coord_conteudo_before_amostra_exata_20260909(
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

  select
    coalesce(
      jsonb_object_agg(
        concat_ws(':', p.professor_id::text, p.metrica),
        coalesce(to_jsonb(p.amostra), 'null'::jsonb)
      ),
      '{}'::jsonb
    ),
    count(*)::integer
    into v_amostras, v_metricas_painel
  from public.get_health_score_professor_v3_performance_snapshot_v3(
    v_competencia_painel,
    p_unidade_id,
    p_periodicidade
  ) p;

  select count(*)::integer
    into v_metricas_documento
  from jsonb_array_elements(v_conteudo -> 'professores') professor(value)
  cross join lateral jsonb_each(professor.value -> 'metricas') metrica;

  if v_metricas_documento <> v_metricas_painel
     or exists (
       select 1
       from jsonb_array_elements(v_conteudo -> 'professores') professor(value)
       cross join lateral jsonb_each(professor.value -> 'metricas') metrica
       where not v_amostras ? concat_ws(
         ':',
         professor.value ->> 'professor_id',
         metrica.key
       )
     ) then
    raise exception 'RELATORIO_COORDENACAO_V4_AMOSTRAS_DIVERGENTES: documento %, painel %',
      v_metricas_documento,
      v_metricas_painel
      using errcode = '22000';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_set(
        professor.value,
        '{metricas}',
        (
          select jsonb_object_agg(
            metrica.key,
            jsonb_set(
              metrica.value,
              '{amostra}',
              v_amostras -> concat_ws(
                ':',
                professor.value ->> 'professor_id',
                metrica.key
              ),
              true
            )
          )
          from jsonb_each(professor.value -> 'metricas') metrica
        ),
        true
      )
      order by professor.ord
    ),
    '[]'::jsonb
  ) into v_professores
  from jsonb_array_elements(v_conteudo -> 'professores')
    with ordinality professor(value, ord);

  return jsonb_set(
    (v_conteudo - 'motor_documento'),
    '{professores}',
    v_professores,
    true
  ) || jsonb_build_object(
    'motor_documento',
    jsonb_build_object(
      'versao', 'coordenacao-v4-amostra-exata-20260909',
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

do $release_gate$
declare
  v_escopo record;
  v_periodo record;
  v_resultado jsonb;
  v_snapshot public.fechamento_mensal_snapshots%rowtype;
  v_competencia_painel date;
  v_documentos integer := 0;
  v_esperados integer;
begin
  for v_escopo in
    select u.id as unidade_id
    from public.unidades u
    where u.ativo = true
    union all
    select null::uuid as unidade_id
  loop
    for v_periodo in
      select *
      from (values
        (2026, 6, 'mensal'::text, 'retificado'::text),
        (2026, 7, 'mensal'::text, 'retificado'::text),
        (2026, 8, 'mensal'::text, 'retificado'::text),
        (2026, 6, 'ciclo'::text,  'retificado'::text),
        (2026, 9, 'mensal'::text, 'preview'::text),
        (2026, 9, 'ciclo'::text,  'preview'::text)
      ) p(ano, mes, periodicidade, status)
    loop
      v_resultado := public.materializar_relatorio_coordenacao_documento_v4(
        v_escopo.unidade_id,
        v_periodo.ano,
        v_periodo.mes,
        v_periodo.periodicidade,
        v_periodo.status,
        'Amostras espelhadas exatamente do mesmo retrato da pagina.'
      );

      if coalesce((v_resultado ->> 'ok')::boolean, false) is not true
         or nullif(v_resultado ->> 'id', '') is null then
        raise exception 'RELEASE_AMOSTRA_MATERIALIZACAO_FALHOU: %/% % %',
          v_periodo.ano,
          v_periodo.mes,
          v_periodo.periodicidade,
          coalesce(v_escopo.unidade_id::text, 'consolidado');
      end if;

      select s.* into v_snapshot
      from public.fechamento_mensal_snapshots s
      where s.id = (v_resultado ->> 'id')::uuid;

      if v_snapshot.id is null
         or v_snapshot.payload #>> '{motor_documento,versao}'
              <> 'coordenacao-v4-amostra-exata-20260909'
         or v_snapshot.payload_hash is distinct from
              public.hash_jsonb_canonico(v_snapshot.payload - 'documento') then
        raise exception 'RELEASE_AMOSTRA_DOCUMENTO_INVALIDO: %', v_snapshot.id;
      end if;

      v_competencia_painel := case
        when v_periodo.periodicidade = 'ciclo' then
          public.fn_health_score_professor_v3_competencia_ciclo_vivo(
            make_date(v_periodo.ano, v_periodo.mes, 1),
            current_date
          )
        else make_date(v_periodo.ano, v_periodo.mes, 1)
      end;

      if exists (
        with documento as (
          select
            nullif(professor.value ->> 'professor_id', '')::integer professor_id,
            metrica.key metrica,
            metrica.value -> 'amostra' amostra
          from jsonb_array_elements(v_snapshot.payload -> 'professores') professor(value)
          cross join lateral jsonb_each(professor.value -> 'metricas') metrica
        ), painel as (
          select p.professor_id, p.metrica,
                 coalesce(to_jsonb(p.amostra), 'null'::jsonb) amostra
          from public.get_health_score_professor_v3_performance_snapshot_v3(
            v_competencia_painel,
            v_escopo.unidade_id,
            v_periodo.periodicidade
          ) p
        )
        select 1
        from documento d
        full join painel p using (professor_id, metrica)
        where d.professor_id is null
           or p.professor_id is null
           or d.amostra is distinct from p.amostra
      ) then
        raise exception 'RELEASE_AMOSTRA_PARIDADE_FALHOU: %', v_snapshot.id;
      end if;

      v_documentos := v_documentos + 1;
    end loop;
  end loop;

  select (count(*) + 1) * 6 into v_esperados
  from public.unidades u
  where u.ativo = true;

  if v_documentos <> v_esperados then
    raise exception 'RELEASE_AMOSTRA_DOCUMENTOS_INCOMPLETOS: esperado %, obtido %',
      v_esperados,
      v_documentos;
  end if;
end;
$release_gate$;

comment on function public.montar_relatorio_coordenacao_conteudo_v4(
  uuid, integer, integer, text
) is 'Documento V4 com amostra, inclusive null, espelhada exatamente do retrato exibido na pagina.';

commit;
