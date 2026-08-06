begin;

-- Materializa apenas o escopo pedido a partir do read model V3 vigente.
-- Nao reimplementa nem ajusta o calculo: score e seis pilares sao copiados
-- exatamente de get_health_score_professor_v3_performance para o retrato.
create or replace function public.materializar_health_score_professor_v3_escopo(
  p_competencia date,
  p_periodicidade text default 'mensal',
  p_escopo text default 'unidade',
  p_unidade_id uuid default null,
  p_professor_id integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_escopo text := lower(trim(coalesce(p_escopo, '')));
  v_unidade_id uuid;
  v_linha record;
  v_config record;
  v_snapshot_id uuid;
  v_snapshot_ids jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_classificacao text;
  v_estado_snapshot text;
  v_estado_publicacao text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user <> 'postgres' then
    raise exception 'HEALTH_SCORE_V3_ACESSO_NEGADO: materializacao por escopo interna'
      using errcode = '42501';
  end if;

  if v_escopo not in ('unidade', 'consolidado') then
    raise exception 'HEALTH_SCORE_V3_ESCOPO_INVALIDO: use unidade ou consolidado'
      using errcode = '22023';
  end if;

  if v_escopo = 'unidade' and p_unidade_id is null then
    raise exception 'HEALTH_SCORE_V3_UNIDADE_OBRIGATORIA: escopo unidade exige unidade_id'
      using errcode = '22023';
  end if;

  if v_escopo = 'consolidado' and p_unidade_id is not null then
    raise exception 'HEALTH_SCORE_V3_UNIDADE_INCOMPATIVEL: escopo consolidado exige unidade_id nulo'
      using errcode = '22023';
  end if;

  -- Competencia passada e historico fechado nao sao recalculados por esta
  -- rotina. O fechamento mensal e uma etapa governada distinta.
  if v_competencia <> date_trunc('month', current_date)::date then
    raise exception 'HEALTH_SCORE_V3_COMPETENCIA_NAO_ABERTA: materializacao por escopo aceita apenas a competencia corrente'
      using errcode = '22023';
  end if;

  v_unidade_id := case when v_escopo = 'unidade' then p_unidade_id else null::uuid end;

  -- O advisory lock e por competencia e escopo. Impede duas operacoes iguais
  -- sem serializar a materializacao das outras unidades.
  perform pg_advisory_xact_lock(
    hashtextextended(
      format('health_score_professor_v3:%s:%s:%s', v_competencia, v_escopo, coalesce(v_unidade_id::text, 'rede')),
      0
    )
  );

  if exists (
    select 1
    from public.health_score_professor_v3_snapshots s
    where s.competencia = v_competencia
      and s.periodicidade = p_periodicidade
      and s.escopo = v_escopo
      and s.unidade_id is not distinct from v_unidade_id
      and (p_professor_id is null or s.professor_id = p_professor_id)
  ) then
    raise exception 'HEALTH_SCORE_V3_RETRATO_JA_EXISTE: escopo ja possui snapshot; inspecione antes de repetir'
      using errcode = '23505';
  end if;

  -- A unidade usa o materializador canônico já vigente. Ele conhece as
  -- métricas que podem não vir no read model e preserva a semântica V3
  -- existente; o escopo explícito impede que uma chamada da unidade dispare
  -- Barra, as demais unidades ou o Consolidado.
  if v_escopo = 'unidade' then
    return public.materializar_health_score_professor_v3_periodo(
      v_competencia,
      p_periodicidade,
      p_unidade_id,
      p_professor_id
    ) || jsonb_build_object(
      'escopo', v_escopo,
      'unidade_id', p_unidade_id,
      'origem', 'materializar_health_score_professor_v3_periodo',
      'formula_alterada', false
    );
  end if;

  create temporary table health_score_v3_escopo_fonte on commit drop as
  select p.*
  from public.get_health_score_professor_v3_performance(
    v_competencia,
    v_unidade_id,
    p_periodicidade
  ) p
  where p_professor_id is null or p.professor_id = p_professor_id;

  if not exists (select 1 from health_score_v3_escopo_fonte) then
    raise exception 'HEALTH_SCORE_V3_SEM_FONTE: nenhum professor retornado pelo read model vigente'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from health_score_v3_escopo_fonte f
    where f.escopo is distinct from v_escopo
      or f.unidade_id is distinct from v_unidade_id
  ) then
    raise exception 'HEALTH_SCORE_V3_ESCOPO_DIVERGENTE: read model devolveu escopo diferente do solicitado'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from health_score_v3_escopo_fonte f
    group by f.professor_id
    having count(distinct f.metrica) <> 6
  ) then
    raise exception 'HEALTH_SCORE_V3_PILARES_INCOMPLETOS: o retrato exige exatamente seis metricas por professor'
      using errcode = 'P0001';
  end if;

  create temporary table health_score_v3_escopo_snapshots (
    professor_id integer primary key,
    snapshot_id uuid not null
  ) on commit drop;

  for v_linha in
    select distinct on (f.professor_id) f.*
    from health_score_v3_escopo_fonte f
    order by f.professor_id, f.metrica
  loop
    -- O produtor vivo usa "em_andamento" e pode omitir a classificacao
    -- enquanto a comparabilidade esta em formacao. A tabela de retratos,
    -- entretanto, guarda o estado materializado e exige classificacao. Esta
    -- normalizacao e a mesma semantica persistida pelo materializador V3
    -- vigente: nao altera score nem os seis pilares recebidos do produtor.
    select
      c.faixa_saudavel_min,
      c.faixa_atencao_min
    into v_config
    from public.health_score_professor_v3_config_versoes c
    where c.id = v_linha.config_id;

    if not found then
      raise exception 'HEALTH_SCORE_V3_CONFIG_AUSENTE: config do read model nao encontrada'
        using errcode = 'P0001';
    end if;

    v_classificacao := coalesce(
      v_linha.classificacao,
      case
        when v_linha.score is null then 'sem_base'
        when v_linha.score >= v_config.faixa_saudavel_min then 'saudavel'
        when v_linha.score >= v_config.faixa_atencao_min then 'atencao'
        else 'critico'
      end
    );
    v_estado_snapshot := case when exists (
      select 1
      from health_score_v3_escopo_fonte f
      where f.professor_id = v_linha.professor_id
        and f.estado_base = 'em_maturacao'
    ) then 'em_maturacao' else 'provisorio' end;
    v_estado_publicacao := case
      when v_linha.score is null then 'sem_base'
      else 'parcial'
    end;

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
      score,
      cobertura,
      classificacao,
      publicavel,
      publicado,
      motivo_bloqueio,
      regra_versao,
      criado_por,
      periodicidade,
      periodo_inicio,
      periodo_fim,
      ciclo_codigo,
      estado_publicacao,
      score_exibivel,
      ranking_habilitado
    )
    values (
      v_linha.professor_id,
      v_escopo,
      v_unidade_id,
      v_linha.competencia,
      v_linha.trimestre_inicio,
      coalesce((
        select max(s.revisao) + 1
        from public.health_score_professor_v3_snapshots s
        where s.professor_id = v_linha.professor_id
          and s.escopo = v_escopo
          and s.unidade_id is not distinct from v_unidade_id
          and s.competencia = v_competencia
          and s.periodicidade = p_periodicidade
      ), 1),
      v_estado_snapshot,
      v_linha.config_id,
      v_linha.config_versao,
      v_linha.score,
      v_linha.cobertura,
      v_classificacao,
      false,
      false,
      v_linha.motivo_bloqueio,
      v_linha.regra_versao_snapshot,
      null,
      v_linha.periodicidade,
      v_linha.periodo_inicio,
      v_linha.periodo_fim,
      v_linha.ciclo_codigo,
      v_estado_publicacao,
      v_linha.score is not null,
      false
    )
    returning id into v_snapshot_id;

    insert into health_score_v3_escopo_snapshots (professor_id, snapshot_id)
    values (v_linha.professor_id, v_snapshot_id);

    v_snapshot_ids := v_snapshot_ids || jsonb_build_array(v_snapshot_id);
    v_count := v_count + 1;
  end loop;

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
    meta_aplicada,
    peso_efetivo,
    codigo_evidencia,
    papel
  )
  select
    ids.snapshot_id,
    f.metrica,
    f.valor_bruto,
    f.numerador,
    f.denominador,
    f.amostra,
    f.estado_base,
    f.metrica_publicavel,
    f.confianca,
    f.fonte,
    f.regra_versao_metrica,
    f.motivo_sem_base,
    coalesce(f.detalhes, '{}'::jsonb),
    f.nota,
    f.peso,
    f.peso_disponivel,
    f.contribuicao,
    f.meta,
    f.peso_efetivo,
    f.codigo_evidencia,
    f.papel
  from health_score_v3_escopo_fonte f
  join health_score_v3_escopo_snapshots ids
    on ids.professor_id = f.professor_id;

  return jsonb_build_object(
    'competencia', v_competencia,
    'periodicidade', p_periodicidade,
    'escopo', v_escopo,
    'unidade_id', v_unidade_id,
    'snapshots_criados', v_count,
    'snapshot_ids', v_snapshot_ids,
    'origem', 'get_health_score_professor_v3_performance',
    'formula_alterada', false
  );
end;
$function$;

revoke all on function public.materializar_health_score_professor_v3_escopo(
  date, text, text, uuid, integer
) from public, anon, authenticated;
grant execute on function public.materializar_health_score_professor_v3_escopo(
  date, text, text, uuid, integer
) to service_role;

comment on function public.materializar_health_score_professor_v3_escopo(
  date, text, text, uuid, integer
) is 'Materializa a unidade pelo produtor V3 canônico ou o Consolidado real pelo read model vigente, sempre no escopo explícito e sem chamar o orquestrador de rede append-only.';

commit;
