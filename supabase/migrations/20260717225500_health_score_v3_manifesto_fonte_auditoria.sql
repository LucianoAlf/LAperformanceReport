-- Health Score Professor V3 - preserva a origem do manifesto reutilizado.
-- A versao do resultado continua independente da versao do input congelado.

create or replace function public.finalizar_reconstrucao_particionada_professor_v1(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_versao_reconstrucao text,
  p_execucao_backfill_id uuid,
  p_total_particoes integer,
  p_inicio_completo boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_particoes_concluidas integer := 0;
  v_total_eventos integer := 0;
  v_total_diagnosticos integer := 0;
  v_entrada_hash text;
  v_periodos jsonb := '[]'::jsonb;
  v_diagnosticos_resumo jsonb := '[]'::jsonb;
  v_resultado jsonb;
  v_reconstrucao_id uuid;
  v_manifesto_versao_fonte text;
  v_manifestos_distintos integer := 0;
  v_evidencia_inicio_completo text;
begin
  if p_total_particoes < 2 or p_total_particoes > 128 then
    raise exception 'PARTICAO_TOTAL_INVALIDO' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(
      p_unidade_id::text || ':' || p_data_inicio::text || ':' || p_data_fim::text || ':' ||
      p_versao_reconstrucao || ':' || p_execucao_backfill_id::text || ':' || p_total_particoes::text
    )
  );

  select
    count(distinct particao_indice)::integer,
    coalesce(sum(total_eventos), 0)::integer,
    coalesce(sum(total_diagnosticos), 0)::integer
  into v_particoes_concluidas, v_total_eventos, v_total_diagnosticos
  from public.professor_periodos_reconstrucao_particoes_v1
  where unidade_id = p_unidade_id
    and data_inicio = p_data_inicio
    and data_fim = p_data_fim
    and versao_reconstrucao = p_versao_reconstrucao
    and execucao_backfill_id = p_execucao_backfill_id
    and total_particoes = p_total_particoes
    and status = 'concluido';

  if v_particoes_concluidas < p_total_particoes then
    return jsonb_build_object(
      'status', 'aguardando_particoes',
      'particoes_concluidas', v_particoes_concluidas,
      'total_particoes', p_total_particoes
    );
  end if;

  select
    count(distinct coalesce(
      nullif(parametros->>'manifesto_versao_fonte', ''),
      p_versao_reconstrucao
    ))::integer,
    min(coalesce(
      nullif(parametros->>'manifesto_versao_fonte', ''),
      p_versao_reconstrucao
    )),
    min(nullif(parametros->>'evidencia_inicio_completo', ''))
  into
    v_manifestos_distintos,
    v_manifesto_versao_fonte,
    v_evidencia_inicio_completo
  from public.professor_periodos_reconstrucao_particoes_v1
  where unidade_id = p_unidade_id
    and data_inicio = p_data_inicio
    and data_fim = p_data_fim
    and versao_reconstrucao = p_versao_reconstrucao
    and execucao_backfill_id = p_execucao_backfill_id
    and total_particoes = p_total_particoes
    and status = 'concluido';

  if v_manifestos_distintos <> 1 then
    raise exception 'MANIFESTO_VERSAO_FONTE_DIVERGENTE' using errcode = '22023';
  end if;

  select encode(
    extensions.digest(
      convert_to(string_agg(entrada_hash, '' order by particao_indice), 'UTF8'),
      'sha256'::text
    ),
    'hex'
  )
  into v_entrada_hash
  from public.professor_periodos_reconstrucao_particoes_v1
  where unidade_id = p_unidade_id
    and data_inicio = p_data_inicio
    and data_fim = p_data_fim
    and versao_reconstrucao = p_versao_reconstrucao
    and execucao_backfill_id = p_execucao_backfill_id
    and total_particoes = p_total_particoes;

  select coalesce(
    jsonb_agg(
      (elemento.value - 'entrada_hash') || jsonb_build_object('entrada_hash', v_entrada_hash)
      order by particao.particao_indice, elemento.ordinalidade
    ),
    '[]'::jsonb
  )
  into v_periodos
  from public.professor_periodos_reconstrucao_particoes_v1 particao
  cross join lateral jsonb_array_elements(particao.periodos)
    with ordinality as elemento(value, ordinalidade)
  where particao.unidade_id = p_unidade_id
    and particao.data_inicio = p_data_inicio
    and particao.data_fim = p_data_fim
    and particao.versao_reconstrucao = p_versao_reconstrucao
    and particao.execucao_backfill_id = p_execucao_backfill_id
    and particao.total_particoes = p_total_particoes;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'particao_indice', particao_indice,
        'entrada_hash', entrada_hash,
        'total_eventos', total_eventos,
        'total_periodos', total_periodos,
        'total_diagnosticos', total_diagnosticos
      ) order by particao_indice
    ),
    '[]'::jsonb
  )
  into v_diagnosticos_resumo
  from public.professor_periodos_reconstrucao_particoes_v1
  where unidade_id = p_unidade_id
    and data_inicio = p_data_inicio
    and data_fim = p_data_fim
    and versao_reconstrucao = p_versao_reconstrucao
    and execucao_backfill_id = p_execucao_backfill_id
    and total_particoes = p_total_particoes;

  v_resultado := public.materializar_periodos_professor_v1(
    p_unidade_id,
    p_data_inicio,
    p_data_fim,
    p_versao_reconstrucao,
    v_entrada_hash,
    v_periodos,
    v_diagnosticos_resumo,
    p_execucao_backfill_id,
    v_total_eventos,
    jsonb_build_object(
      'inicio_completo', coalesce(p_inicio_completo, false),
      'evidencia_inicio_completo', v_evidencia_inicio_completo,
      'manifesto_versao_fonte', v_manifesto_versao_fonte,
      'processamento_particionado', true,
      'total_particoes_execucao', p_total_particoes,
      'diagnosticos_detalhados_em', 'professor_periodos_reconstrucao_particoes_v1',
      'identidade_particao', 'pessoa_chave_canonica',
      'identidade_professor', 'professores_unidades.emusys_id+unidade_id',
      'identidade_aluno', 'vw_aluno_identidade_unidade_canonica'
    )
  );

  v_reconstrucao_id := nullif(v_resultado->>'reconstrucao_id', '')::uuid;
  if v_reconstrucao_id is not null then
    update public.professor_periodos_reconstrucoes_v1 r
       set total_diagnosticos = v_total_diagnosticos,
           parametros = r.parametros || jsonb_build_object(
             'evidencia_inicio_completo', v_evidencia_inicio_completo,
             'manifesto_versao_fonte', v_manifesto_versao_fonte
           ),
           updated_at = now()
     where r.id = v_reconstrucao_id;
  end if;

  return v_resultado || jsonb_build_object(
    'processamento_particionado', true,
    'particoes_concluidas', v_particoes_concluidas,
    'total_particoes_execucao', p_total_particoes,
    'total_eventos', v_total_eventos,
    'total_diagnosticos_detalhados', v_total_diagnosticos,
    'entrada_hash_agregada', v_entrada_hash,
    'manifesto_versao_fonte', v_manifesto_versao_fonte
  );
end;
$$;

comment on function public.finalizar_reconstrucao_particionada_professor_v1(
  uuid, date, date, text, uuid, integer, boolean
) is 'Materializa a reconstrucao V3 completa e preserva a versao do manifesto congelado usado como fonte.';

revoke all on function public.finalizar_reconstrucao_particionada_professor_v1(
  uuid, date, date, text, uuid, integer, boolean
) from public, anon, authenticated;

grant execute on function public.finalizar_reconstrucao_particionada_professor_v1(
  uuid, date, date, text, uuid, integer, boolean
) to service_role;
