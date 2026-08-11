-- Corrige o produtor gerencial para o schema vigente do Matriculador+.
-- A migration anterior ja pode ter sido aplicada; por isso a funcao e
-- republicada integralmente, sem alterar os documentos mensais fechados.

-- Produtor unico do relatorio gerencial mensal.
-- Le exclusivamente os dois documentos mensais fechados, preserva suas
-- retificacoes auditadas e agrega rankings/configuracoes sem recompor KPIs.

create or replace function public.get_relatorio_gerencial_canonico_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_inicio date;
  v_fim date;
  v_admin_doc jsonb;
  v_comercial_doc jsonb;
  v_admin jsonb;
  v_comercial jsonb;
  v_unidade public.unidades%rowtype;
  v_rankings jsonb := '{}'::jsonb;
  v_metas_matriculador jsonb;
  v_metas_fideliza jsonb;
  v_metas_operacionais jsonb := '{}'::jsonb;
  v_cobertura_curso jsonb := '{}'::jsonb;
  v_rankings_oficiais jsonb := '{}'::jsonb;
  v_total_leads integer := 0;
  v_leads_sem_curso integer := 0;
  v_leads_indisponiveis integer := 0;
  v_leads_detalhados integer := 0;
  v_leads_informados integer := 0;
begin
  if p_unidade_id is null
     or p_ano is null
     or p_mes is null
     or p_ano not between 2020 and 2100
     or p_mes not between 1 and 12 then
    raise exception 'RELATORIO_GERENCIAL_PARAMETROS_INVALIDOS';
  end if;

  if auth.role() <> 'service_role'
     and not coalesce(public.pode_gerar_relatorio_admin_v1(p_unidade_id), false) then
    raise exception 'RELATORIO_GERENCIAL_ACESSO_NEGADO';
  end if;

  select * into v_unidade
  from public.unidades u
  where u.id = p_unidade_id
    and u.ativo = true;

  if not found then
    raise exception 'RELATORIO_GERENCIAL_UNIDADE_INVALIDA';
  end if;

  v_inicio := make_date(p_ano, p_mes, 1);
  v_fim := (v_inicio + interval '1 month - 1 day')::date;

  v_admin_doc := public.get_relatorio_admin_mensal_rico_v1(
    p_unidade_id,
    p_ano,
    p_mes
  );
  v_comercial_doc := public.get_relatorio_mensal_canonico_v1(
    'comercial',
    p_unidade_id,
    p_ano,
    p_mes
  );

  if coalesce(v_admin_doc->>'status', '') <> 'fechado'
     or jsonb_typeof(v_admin_doc->'payload') <> 'object' then
    raise exception 'RELATORIO_GERENCIAL_ADMIN_NAO_FECHADO';
  end if;

  if coalesce(v_comercial_doc->>'status', '') <> 'fechado'
     or jsonb_typeof(v_comercial_doc->'payload') <> 'object' then
    raise exception 'RELATORIO_GERENCIAL_COMERCIAL_NAO_FECHADO';
  end if;

  v_admin := v_admin_doc->'payload';
  v_comercial := v_comercial_doc->'payload';

  if coalesce((v_admin#>>'{competencia,ano}')::integer, -1) <> p_ano
     or coalesce((v_admin#>>'{competencia,mes}')::integer, -1) <> p_mes
     or coalesce((v_comercial#>>'{competencia,ano}')::integer, -1) <> p_ano
     or coalesce((v_comercial#>>'{competencia,mes}')::integer, -1) <> p_mes then
    raise exception 'RELATORIO_GERENCIAL_COMPETENCIA_DIVERGENTE';
  end if;

  if coalesce(v_admin#>>'{unidade,id}', '') <> p_unidade_id::text
     or coalesce(v_comercial#>>'{unidade,id}', '') <> p_unidade_id::text then
    raise exception 'RELATORIO_GERENCIAL_UNIDADE_DIVERGENTE';
  end if;

  v_metas_operacionais := coalesce(v_admin->'metas_kpi', '{}'::jsonb);
  if jsonb_typeof(v_metas_operacionais) <> 'object' then
    v_metas_operacionais := '{}'::jsonb;
  end if;

  if jsonb_typeof(v_comercial->'cobertura_curso_interesse') = 'object' then
    v_cobertura_curso := v_comercial->'cobertura_curso_interesse';
  else
    v_total_leads := coalesce((v_comercial#>>'{resumo,leads}')::integer, 0);

    select coalesce(sum(coalesce((item->>'quantidade')::integer, 0)), 0)::integer
    into v_leads_sem_curso
    from jsonb_array_elements(coalesce(v_comercial->'leads_por_curso', '[]'::jsonb)) item
    where lower(btrim(coalesce(item->>'nome', ''))) in ('sem curso', 'não informado', 'nao informado');

    select coalesce(max(
      coalesce((regexp_match(alerta, '([0-9]+)[[:space:]]+lead.*detalhamento[[:space:]]+historico'))[1]::integer, 0)
    ), 0)::integer
    into v_leads_indisponiveis
    from jsonb_array_elements_text(coalesce(v_comercial->'alertas', '[]'::jsonb)) alerta;

    v_leads_indisponiveis := least(greatest(v_leads_indisponiveis, 0), v_total_leads);
    v_leads_detalhados := greatest(v_total_leads - v_leads_indisponiveis, 0);
    v_leads_sem_curso := least(greatest(v_leads_sem_curso, 0), v_total_leads);
    v_leads_informados := greatest(v_leads_detalhados - greatest(v_leads_sem_curso - v_leads_indisponiveis, 0), 0);

    v_cobertura_curso := jsonb_build_object(
      'total_leads', v_total_leads,
      'detalhamento_disponivel', v_leads_detalhados,
      'detalhamento_indisponivel', v_leads_indisponiveis,
      'curso_declarado_informado', v_leads_informados,
      'curso_declarado_ausente', greatest(v_leads_sem_curso - v_leads_indisponiveis, 0),
      'percentual_detalhamento_disponivel', round(v_leads_detalhados * 100.0 / nullif(v_total_leads, 0), 2),
      'percentual_curso_declarado_ausente', round(greatest(v_leads_sem_curso - v_leads_indisponiveis, 0) * 100.0 / nullif(v_total_leads, 0), 2),
      'fonte', 'leads_por_curso + alertas do snapshot',
      'versao_regra', 'curso-interesse-v2'
    );
  end if;

  with health_oficial as materialized (
    select
      h.professor_id,
      p.nome::text as professor_nome,
      h.metrica,
      h.valor_bruto,
      h.numerador,
      h.denominador,
      h.amostra,
      h.estado_base,
      h.confianca
    from public.get_health_score_professor_v3_performance(
      v_inicio,
      p_unidade_id,
      'mensal'
    ) h
    join public.professores p on p.id = h.professor_id
    where h.estado_publicacao = 'oficial'
      and coalesce(h.ranking_habilitado, false) = true
      and coalesce(h.snapshot_publicavel, false) = true
      and h.score is not null
      and coalesce(h.metrica_publicavel, false) = true
      and h.valor_bruto is not null
  )
  select jsonb_build_object(
    'media_turma', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'professor', x.professor_nome,
          'media_alunos_turma', x.media_alunos_turma,
          'ocupacoes', x.alunos_via_turmas,
          'turmas_elegiveis', x.turmas_elegiveis_media
        ) order by x.media_alunos_turma desc, x.professor_nome
      ), '[]'::jsonb)
      from (
        select
          h.professor_nome,
          round(h.valor_bruto, 2) as media_alunos_turma,
          h.numerador as alunos_via_turmas,
          h.denominador as turmas_elegiveis_media
        from health_oficial h
        where h.metrica = 'media_turma'
        order by h.valor_bruto desc, h.professor_nome
        limit 3
      ) x
    ),
    'presenca', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'professor', x.professor_nome,
          'presenca_media', x.media_presenca,
          'cobertura', x.presenca_cobertura,
          'confianca', x.presenca_confianca
        ) order by x.media_presenca desc, x.professor_nome
      ), '[]'::jsonb)
      from (
        select
          h.professor_nome,
          round(h.valor_bruto, 1) as media_presenca,
          case when coalesce(h.denominador, 0) > 0
            then round(h.numerador / h.denominador, 4)
            else null
          end as presenca_cobertura,
          h.confianca as presenca_confianca
        from health_oficial h
        where h.metrica = 'presenca'
        order by h.valor_bruto desc, h.professor_nome
        limit 3
      ) x
    ),
    'matriculadores', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'professor', x.professor_nome,
          'matriculas', x.matriculas,
          'experimentais', x.experimentais,
          'taxa_conversao', x.taxa_conversao
        ) order by x.matriculas desc, x.taxa_conversao desc, x.professor_nome
      ), '[]'::jsonb)
      from (
        select
          h.professor_nome,
          coalesce(h.numerador, 0) as matriculas,
          coalesce(h.denominador, 0) as experimentais,
          h.valor_bruto as taxa_conversao
        from health_oficial h
        where h.metrica = 'conversao'
          and coalesce(h.numerador, 0) > 0
        order by
          coalesce(h.numerador, 0) desc,
          h.valor_bruto desc nulls last,
          h.professor_nome
        limit 3
      ) x
    ),
    'retencao', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'professor', x.professor_nome,
          'tempo_medio_permanencia', x.tempo_medio_permanencia,
          'amostra', x.amostra,
          'estado_base', x.estado_base,
          'confianca', x.confianca
        ) order by x.tempo_medio_permanencia desc, x.professor_nome
      ), '[]'::jsonb)
      from (
        select
          h.professor_nome,
          round(h.valor_bruto, 1) as tempo_medio_permanencia,
          h.amostra,
          h.estado_base,
          h.confianca
        from health_oficial h
        where h.metrica = 'permanencia'
        order by h.valor_bruto desc, h.professor_nome
        limit 3
      ) x
    )
  ) into v_rankings;

  v_rankings_oficiais := jsonb_build_object(
    'status', case when
      coalesce(jsonb_array_length(v_rankings->'retencao'), 0) > 0
      and coalesce(jsonb_array_length(v_rankings->'matriculadores'), 0) > 0
      and coalesce(jsonb_array_length(v_rankings->'presenca'), 0) > 0
      and coalesce(jsonb_array_length(v_rankings->'media_turma'), 0) > 0
      then 'oficial' else 'indisponivel' end,
    'ciclo', 'mensal',
    'retencao', coalesce(v_rankings->'retencao', '[]'::jsonb),
    'matriculadores', coalesce(v_rankings->'matriculadores', '[]'::jsonb),
    'presenca', coalesce(v_rankings->'presenca', '[]'::jsonb),
    'media_turma', coalesce(v_rankings->'media_turma', '[]'::jsonb)
  );

  v_rankings := jsonb_build_object(
    'oficiais', v_rankings_oficiais,
    'destaques_mensais_parciais', jsonb_build_object(
      'status', 'indisponivel',
      'motivo', 'ciclo_fechado_sem_base_parcial'
    ),
    -- Compatibilidade de leitura durante a transicao: os arrays legados
    -- apontam para o mesmo conjunto oficial, sem criar um ranking paralelo.
    'retencao', v_rankings_oficiais->'retencao',
    'matriculadores', v_rankings_oficiais->'matriculadores',
    'presenca', v_rankings_oficiais->'presenca',
    'media_turma', v_rankings_oficiais->'media_turma'
  );

  select jsonb_strip_nulls(jsonb_build_object(
    'meta_taxa_lead_exp', c.meta_taxa_showup_experimental,
    'meta_taxa_exp_mat', c.meta_taxa_experimental_matricula,
    'meta_taxa_lead_mat', c.meta_taxa_lead_matricula,
    'meta_volume', case upper(btrim(v_unidade.nome))
      when 'CAMPO GRANDE' then c.meta_volume_campo_grande
      when 'RECREIO' then c.meta_volume_recreio
      when 'BARRA' then c.meta_volume_barra
      else null
    end,
    'meta_ticket', case upper(btrim(v_unidade.nome))
      when 'CAMPO GRANDE' then c.meta_ticket_campo_grande
      when 'RECREIO' then c.meta_ticket_recreio
      when 'BARRA' then c.meta_ticket_barra
      else null
    end,
    'mes_inicio', c.mes_inicio,
    'mes_fim', c.mes_fim
  )) into v_metas_matriculador
  from public.programa_matriculador_config c
  where c.ano = p_ano
    and p_mes between c.mes_inicio and c.mes_fim;

  select jsonb_strip_nulls(jsonb_build_object(
    'meta_churn_maximo', c.meta_churn_maximo,
    'meta_inadimplencia_maxima', c.meta_inadimplencia_maxima,
    'meta_renovacao_minima', c.meta_renovacao_minima,
    'meta_reajuste_minimo', c.meta_reajuste_minimo,
    'meta_lojinha', nullif(c.metas_lojinha->>p_unidade_id::text, '')::numeric,
    'valor_lojinha', null
  )) into v_metas_fideliza
  from public.programa_fideliza_config c
  where c.ano = p_ano;

  -- Mantem as distribuicoes comerciais do snapshot explicitas no contrato,
  -- inclusive quando uma fonte antiga nao trouxe uma das listas.
  v_comercial := jsonb_set(
    v_comercial,
    '{cobertura_curso_interesse}',
    coalesce(v_cobertura_curso, '{}'::jsonb),
    true
  );
  v_comercial := jsonb_set(
    v_comercial,
    '{leads_por_canal}',
    case when jsonb_typeof(v_comercial->'leads_por_canal') = 'array'
      then v_comercial->'leads_por_canal' else '[]'::jsonb end,
    true
  );
  v_comercial := jsonb_set(
    v_comercial,
    '{matriculas_por_curso}',
    case when jsonb_typeof(v_comercial->'matriculas_por_curso') = 'array'
      then v_comercial->'matriculas_por_curso' else '[]'::jsonb end,
    true
  );

  return jsonb_build_object(
    'schema_version', 1,
    'status', 'fechado',
    'unidade', jsonb_build_object(
      'id', v_unidade.id,
      'nome', v_unidade.nome,
      'codigo', v_unidade.codigo,
      'gerente', coalesce(nullif(v_unidade.gerente_nome, ''), v_admin#>>'{unidade,gerente}'),
      'hunter', coalesce(v_comercial#>>'{unidade,hunter}', v_unidade.hunter_nome),
      'administrativo', coalesce(v_admin#>'{unidade,farmers}', '[]'::jsonb)
    ),
    'competencia', jsonb_build_object(
      'ano', p_ano,
      'mes', p_mes,
      'inicio', v_inicio,
      'fim', v_fim,
      'fuso', 'America/Sao_Paulo'
    ),
    'administrativo', v_admin,
    'comercial', v_comercial,
    'rankings', coalesce(v_rankings, '{}'::jsonb),
    'metas', jsonb_build_object(
      'operacionais', coalesce(v_metas_operacionais, '{}'::jsonb),
      'mensais', coalesce(v_metas_operacionais, '{}'::jsonb),
      'fideliza', coalesce(v_metas_fideliza, '{}'::jsonb),
      'matriculador', coalesce(v_metas_matriculador, '{}'::jsonb)
    ),
    'comparativos', jsonb_build_object(
      'disponibilidade', 'indisponivel',
      'status', 'indisponivel',
      'motivo', 'fechamento_anterior_incompativel',
      'politica', jsonb_build_object(
        'versao', 'fechamento-equivalente-v1',
        'dominio', 'gerencial',
        'grao', 'competencia-mensal',
        'status_exigido', 'fechado'
      ),
      'atual', jsonb_build_object(
        'status_administrativo', v_admin_doc->>'status',
        'status_comercial', v_comercial_doc->>'status',
        'snapshot_administrativo', v_admin_doc->'snapshot_id',
        'snapshot_comercial', v_comercial_doc->'snapshot_id',
        'payload_hash_administrativo', v_admin_doc->'payload_hash',
        'payload_hash_comercial', v_comercial_doc->'payload_hash'
      ),
      'anterior', jsonb_build_object(
        'status', 'nao_carregado',
        'motivo', 'fechamento_anterior_incompativel'
      ),
      'fingerprint_atual', md5(jsonb_build_object(
        'unidade_id', p_unidade_id,
        'dominio', 'gerencial',
        'grao', 'competencia-mensal',
        'regra', 'fechamento-equivalente-v1',
        'administrativo_payload_hash', v_admin_doc->'payload_hash',
        'comercial_payload_hash', v_comercial_doc->'payload_hash'
      )::text),
      'fingerprint_anterior', null
    ),
    'auditoria', jsonb_build_object(
      'administrativo', jsonb_strip_nulls(jsonb_build_object(
        'snapshot_id', v_admin_doc->'snapshot_id',
        'payload_hash', v_admin_doc->'payload_hash',
        'versao', v_admin_doc->'versao',
        'status', v_admin_doc->'status'
      )),
      'comercial', jsonb_strip_nulls(jsonb_build_object(
        'snapshot_id', v_comercial_doc->'snapshot_id',
        'payload_hash', v_comercial_doc->'payload_hash',
        'snapshot_payload_hash', v_comercial_doc->'snapshot_payload_hash',
        'retificado', v_comercial_doc->'retificado',
        'versao', v_comercial_doc->'versao',
        'status', v_comercial_doc->'status'
      )),
      'rankings', jsonb_build_object(
        'versao', 'professores_v3',
        'competencia', v_inicio
      )
    )
  );
end;
$function$;

revoke all on function public.get_relatorio_gerencial_canonico_v1(uuid, integer, integer)
  from public, anon;
grant execute on function public.get_relatorio_gerencial_canonico_v1(uuid, integer, integer)
  to authenticated, service_role;

comment on function public.get_relatorio_gerencial_canonico_v1(uuid, integer, integer) is
  'Compoe o relatorio gerencial a partir dos documentos mensais fechados Administrativo e Comercial, rankings V3 e configuracoes vigentes, sem recompor ou alterar o fechamento.';
