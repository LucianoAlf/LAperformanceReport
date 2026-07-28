begin;

create or replace function public.ativar_health_score_professor_v3_config_revisao_ciclo_aberto(
  p_config_id uuid,
  p_justificativa text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $function$
declare
  v_ator integer;
  v_config public.health_score_professor_v3_config_versoes%rowtype;
  v_config_conflitante public.health_score_professor_v3_config_versoes%rowtype;
  v_config_futura public.health_score_professor_v3_config_versoes%rowtype;
  v_substituicao public.health_score_professor_v3_config_substituicoes%rowtype;
  v_total_metricas integer;
  v_metricas_distintas integer;
  v_peso_total numeric;
  v_segmentos_faltantes jsonb;
  v_fingerprint text;
  v_resultado_simulacao jsonb;
  v_competencia_simulacao date;
  v_arquivadas integer;
  v_selecao_jul uuid;
  v_selecao_set uuid;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('health_score_professor_v3_config', 0)
  );
  v_ator := public.fn_health_score_professor_v3_ator_gerenciador();

  if nullif(btrim(p_justificativa), '') is null then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: justificativa obrigatoria';
  end if;

  select c.* into v_config
  from public.health_score_professor_v3_config_versoes c
  where c.id = p_config_id
  for update;

  if not found then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: configuracao inexistente';
  end if;

  if v_config.status = 'ativa' then
    if v_config.chave_criacao_governada is null
       or v_config.vigencia_inicio is distinct from date '2026-06-01'
       or v_config.vigencia_fim is distinct from date '2026-08-31'
       or v_config.ativado_por is null
       or v_config.ativado_em is null then
      raise exception
        'HEALTH_SCORE_V3_CONFIG_INVALIDA: retry de ativacao encontrou configuracao incoerente';
    end if;
    if v_config.justificativa is distinct from btrim(p_justificativa) then
      raise exception
        'HEALTH_SCORE_V3_CONFIG_INVALIDA: retry de ativacao exige a mesma justificativa';
    end if;

    select s.* into v_substituicao
    from public.health_score_professor_v3_config_substituicoes s
    where s.config_nova_id = p_config_id
    for share;

    if not found then
      raise exception
        'HEALTH_SCORE_V3_CONFIG_INVALIDA: retry de ativacao sem substituicao';
    end if;
    if v_substituicao.justificativa is distinct from btrim(p_justificativa) then
      raise exception
        'HEALTH_SCORE_V3_CONFIG_INVALIDA: retry de ativacao exige a mesma justificativa';
    end if;
    if v_substituicao.vigencia_inicio is distinct from date '2026-06-01'
       or v_substituicao.vigencia_fim is distinct from date '2026-08-31'
       or v_substituicao.substituido_por is distinct from v_config.ativado_por
       or not exists (
         select 1
         from public.health_score_professor_v3_config_versoes anterior
         where anterior.id = v_substituicao.config_anterior_id
           and anterior.status = 'arquivada'
           and anterior.vigencia_inicio = date '2026-06-01'
           and anterior.vigencia_fim = date '2026-08-31'
       ) then
      raise exception
        'HEALTH_SCORE_V3_CONFIG_INVALIDA: retry de ativacao encontrou substituicao incoerente';
    end if;

    select c.* into v_config_futura
    from public.health_score_professor_v3_config_versoes c
    where c.id <> p_config_id
      and c.status = 'ativa'
      and c.vigencia_inicio = date '2026-09-01'
    order by c.versao desc, c.id
    limit 1
    for share;

    if not found then
      raise exception
        'HEALTH_SCORE_V3_CONFIG_INVALIDA: configuracao ativa de 2026-09-01 deve existir';
    end if;

    select c.id into v_selecao_jul
    from public.health_score_professor_v3_config_versoes c
    where c.status = 'ativa'
      and date '2026-07-01' >= c.vigencia_inicio
      and (
        c.vigencia_fim is null
        or date '2026-07-01' <= c.vigencia_fim
      );

    select c.id into v_selecao_set
    from public.health_score_professor_v3_config_versoes c
    where c.status = 'ativa'
      and date '2026-09-01' >= c.vigencia_inicio
      and (
        c.vigencia_fim is null
        or date '2026-09-01' <= c.vigencia_fim
      );

    if v_selecao_jul is distinct from p_config_id
       or v_selecao_set is distinct from v_config_futura.id then
      raise exception
        'HEALTH_SCORE_V3_CONFIG_INVALIDA: retry de ativacao encontrou selecao temporal incoerente';
    end if;

    v_fingerprint :=
      public.fn_health_score_professor_v3_config_fingerprint(p_config_id);

    return public.fn_health_score_professor_v3_config_json(p_config_id)
      || jsonb_build_object(
        'config_substituida_id', v_substituicao.config_anterior_id,
        'config_futura_preservada_id', v_config_futura.id,
        'config_fingerprint', v_fingerprint,
        'ja_ativa', true
      );
  end if;

  if v_config.status <> 'rascunho' then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: somente rascunho pode ser ativado';
  end if;
  if v_config.vigencia_inicio is distinct from date '2026-06-01'
     or v_config.vigencia_fim is distinct from date '2026-08-31' then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: revisao deve cobrir exatamente Jun-Ago';
  end if;
  if btrim(p_justificativa) is distinct from v_config.justificativa then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: salve e simule a justificativa antes da ativacao';
  end if;

  select count(*), count(distinct m.metrica), sum(m.peso)
    into v_total_metricas, v_metricas_distintas, v_peso_total
  from public.health_score_professor_v3_config_metricas m
  where m.config_id = p_config_id
    and m.metrica in (
      'conversao',
      'media_turma',
      'numero_alunos',
      'permanencia',
      'presenca',
      'retencao'
    );

  if v_total_metricas <> 6
     or v_metricas_distintas <> 6
     or v_peso_total <> 100
     or exists (
       select 1
       from public.health_score_professor_v3_config_metricas m
       where m.config_id = p_config_id
         and m.metrica not in (
           'conversao',
           'media_turma',
           'numero_alunos',
           'permanencia',
           'presenca',
           'retencao'
         )
     ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: exige seis metricas canonicas e peso total 100';
  end if;

  if exists (
    select 1
    from public.health_score_professor_v3_config_metricas m
    where m.config_id = p_config_id
      and m.metrica in ('media_turma', 'numero_alunos')
      and (
        m.meta is not null
        or m.parametros->>'normalizacao'
          is distinct from 'segmentada_unidade_curso_modalidade'
      )
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: media e carteira exigem normalizacao segmentada';
  end if;

  if exists (
    select 1
    from public.health_score_professor_v3_config_metricas m
    where m.config_id = p_config_id
      and m.metrica in ('conversao', 'permanencia')
      and (
        m.meta is null
        or m.parametros->>'meta_status' is distinct from 'aprovada'
      )
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: conversao e permanencia ainda nao homologadas';
  end if;

  if exists (
    select 1
    from public.health_score_professor_v3_config_metas_curso_modalidade m
    join public.cursos c
      on c.id = m.curso_id
    where m.config_id = p_config_id
      and c.natureza_operacional = 'comercial'
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: matriz da revisao contem curso comercial';
  end if;

  if exists (
    select 1
    from public.health_score_professor_v3_config_metas_curso_modalidade m
    where m.config_id = p_config_id
      and m.estado = 'configurada'
      and m.meta_media_turma > m.capacidade_maxima
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: meta de media acima da capacidade';
  end if;

  v_segmentos_faltantes :=
    public.fn_health_score_professor_v3_segmentos_faltantes_v1(p_config_id);
  if jsonb_array_length(coalesce(v_segmentos_faltantes, '[]'::jsonb)) > 0 then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INCOMPLETA: segmentos oficiais sem regra final: %',
      v_segmentos_faltantes::text;
  end if;

  if exists (
    select 1
    from public.professor_unidade_curso_modalidade a
    join public.cursos c
      on c.id = a.curso_id
     and c.natureza_operacional = 'pedagogica'
    left join public.health_score_professor_v3_config_metas_curso_modalidade m
      on m.config_id = p_config_id
     and m.unidade_id = a.unidade_id
     and m.curso_id = a.curso_id
     and m.modalidade = a.modalidade
     and m.estado = 'configurada'
    where a.status = 'ativo'
      and a.vigencia_fim is null
      and a.confianca in ('alta', 'revisada')
      and m.id is null
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: atribuicao pedagogica pontuavel sem meta segmentada';
  end if;

  v_fingerprint :=
    public.fn_health_score_professor_v3_config_fingerprint(p_config_id);

  select s.resultado, s.competencia
    into v_resultado_simulacao, v_competencia_simulacao
  from public.health_score_professor_v3_config_simulacoes s
  where s.config_id = p_config_id
    and s.config_fingerprint = v_fingerprint
    and s.competencia between date '2026-06-01' and date '2026-08-31'
    and s.criado_em > v_config.atualizado_em
    and s.criado_em >= clock_timestamp() - interval '24 hours'
    and coalesce((s.resultado->>'total')::integer, 0) > 0
  order by s.criado_em desc, s.id desc
  limit 1;

  if not found then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: simulacao atual obrigatoria antes da ativacao';
  end if;

  if exists (
    select 1
    from public.get_health_score_professor_v3_metricas_segmentadas_v1(
      v_competencia_simulacao,
      p_config_id,
      null,
      'mensal'
    ) d
    where d.metrica = 'numero_alunos'
      and (
        (
          d.atribuicao_pontuavel
          and (
            d.estado_base in (
              'regra_ausente',
              'divergencia_nao_ofertada',
              'segmentacao_incompleta'
            )
            or d.config_meta_segmento_id is null
          )
        )
        or d.divergencias->>'nao_ofertada_com_dados' = 'true'
      )
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: diagnosticos segmentados atuais bloqueiam a ativacao';
  end if;

  if jsonb_array_length(
       coalesce(
         v_resultado_simulacao->'nao_ofertada_observada',
         '[]'::jsonb
       )
     ) > 0
     or jsonb_array_length(
       coalesce(
         v_resultado_simulacao->'atribuicoes_pontuaveis_sem_meta',
         '[]'::jsonb
       )
     ) > 0 then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: excecoes atuais bloqueiam a ativacao';
  end if;

  if exists (
    select 1
    from public.health_score_professor_v3_snapshots s
    where s.estado = 'fechado'
      and s.competencia between date '2026-06-01' and date '2026-08-31'
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: snapshot fechado em Jun-Ago impede substituicao';
  end if;

  select c.* into v_config_futura
  from public.health_score_professor_v3_config_versoes c
  where c.id <> p_config_id
    and c.status = 'ativa'
    and c.vigencia_inicio = date '2026-09-01'
  order by c.versao desc, c.id
  limit 1
  for share;

  if not found then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: configuracao ativa de 2026-09-01 deve existir';
  end if;

  select c.* into v_config_conflitante
  from public.health_score_professor_v3_config_versoes c
  where c.id <> p_config_id
    and c.status = 'ativa'
    and c.vigencia_inicio <= date '2026-08-31'
    and (
      c.vigencia_fim is null
      or c.vigencia_fim >= date '2026-06-01'
    )
  order by c.versao desc, c.id
  limit 1
  for update;

  if not found then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: conflito ativo Jun-Ago inexistente';
  end if;
  if v_config_conflitante.vigencia_inicio is distinct from date '2026-06-01'
     or v_config_conflitante.vigencia_fim is distinct from date '2026-08-31' then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: conflito ativo deve cobrir exatamente Jun-Ago';
  end if;

  perform set_config(
    'app.health_score_v3_config_ciclo_aberto_arquivar_id',
    v_config_conflitante.id::text,
    true
  );
  update public.health_score_professor_v3_config_versoes c
  set status = 'arquivada',
      atualizado_em = now()
  where c.id = v_config_conflitante.id
    and c.status = 'ativa'
    and c.vigencia_inicio = date '2026-06-01'
    and c.vigencia_fim = date '2026-08-31';
  get diagnostics v_arquivadas = row_count;
  perform set_config(
    'app.health_score_v3_config_ciclo_aberto_arquivar_id',
    '',
    true
  );

  if v_arquivadas <> 1 then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: arquivamento exato Jun-Ago nao realizado';
  end if;

  insert into public.health_score_professor_v3_config_substituicoes (
    config_anterior_id,
    config_nova_id,
    vigencia_inicio,
    vigencia_fim,
    justificativa,
    substituido_por
  ) values (
    v_config_conflitante.id,
    p_config_id,
    date '2026-06-01',
    date '2026-08-31',
    btrim(p_justificativa),
    v_ator
  );

  update public.health_score_professor_v3_config_versoes
  set status = 'ativa',
      justificativa = btrim(p_justificativa),
      ativado_por = v_ator,
      ativado_em = now(),
      atualizado_em = now()
  where id = p_config_id;

  select c.id into v_selecao_jul
  from public.health_score_professor_v3_config_versoes c
  where c.status = 'ativa'
    and date '2026-07-01' >= c.vigencia_inicio
    and (
      c.vigencia_fim is null
      or date '2026-07-01' <= c.vigencia_fim
    );

  select c.id into v_selecao_set
  from public.health_score_professor_v3_config_versoes c
  where c.status = 'ativa'
    and date '2026-09-01' >= c.vigencia_inicio
    and (
      c.vigencia_fim is null
      or date '2026-09-01' <= c.vigencia_fim
    );

  if v_selecao_jul is distinct from p_config_id
     or v_selecao_set is distinct from v_config_futura.id then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: selecao temporal Jun-Ago/Setembro divergente';
  end if;

  return public.fn_health_score_professor_v3_config_json(p_config_id)
    || jsonb_build_object(
      'config_substituida_id', v_config_conflitante.id,
      'config_futura_preservada_id', v_config_futura.id,
      'config_fingerprint', v_fingerprint,
      'ja_ativa', false
    );
end;
$function$;

revoke all on function
  public.ativar_health_score_professor_v3_config_revisao_ciclo_aberto(uuid, text)
  from public, anon;
grant execute on function
  public.ativar_health_score_professor_v3_config_revisao_ciclo_aberto(uuid, text)
  to authenticated;
grant execute on function
  public.ativar_health_score_professor_v3_config_revisao_ciclo_aberto(uuid, text)
  to service_role;

comment on function
  public.ativar_health_score_professor_v3_config_revisao_ciclo_aberto(uuid, text) is
  'Ativa a revisao Jun-Ago somente quando excecoes segmentadas pontuaveis bloqueiam; diagnosticos historicos nao pontuaveis permanecem visiveis.';

commit;

