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

  select jsonb_strip_nulls(jsonb_build_object(
    'meta_taxa_lead_exp', c.taxa_showup_experimental,
    'meta_taxa_exp_mat', c.taxa_experimental_matricula,
    'meta_taxa_lead_mat', c.taxa_lead_matricula,
    'meta_volume', nullif(c.metas_volume->>p_unidade_id::text, '')::numeric,
    'meta_ticket', nullif(c.metas_ticket->>p_unidade_id::text, '')::numeric,
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
      'mensais', coalesce(v_admin->'metas_fideliza', '{}'::jsonb),
      'fideliza', coalesce(v_metas_fideliza, '{}'::jsonb),
      'matriculador', coalesce(v_metas_matriculador, '{}'::jsonb)
    ),
    'comparativos', jsonb_build_object(
      'status', 'indisponivel',
      'motivo', 'Nao ha competencia anterior fechada com a mesma definicao de todos os indicadores.'
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
