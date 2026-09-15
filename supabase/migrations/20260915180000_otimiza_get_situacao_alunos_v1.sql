-- Otimização de get_situacao_alunos_v1 e get_frequencia_unidade_canonica_batch_v1
--
-- Causa raiz dos timeouts (canceling statement due to statement timeout):
--   1. get_frequencia_unidade_canonica_batch_v1 faz 57.675 buffer hits no join
--      com aulas_emusys (nested loop: 19.571 lookups na pkey) — 72% do custo.
--      O planner subestima rows (381 vs 19.571 real) e escolhe nested loop
--      em vez de hash join.
--   2. Temp spill de 353 blocos (work_mem 3.5MB insuficiente para o GROUP BY).
--   3. aluno_presenca scan sem índice que filtre unidade_id + aluno_id juntos.
--   4. Lateral join em aluno_contratos_emusys sem índice cobrindo os 3
--      tiebreakers do ORDER BY.
--
-- Correção:
--   1. Merge aula_tem_presente + aulas_emusys em aula_info (hash join único
--      vs 19.571 nested loop lookups).
--   2. SET work_mem = '24MB' elimina o temp spill.
--   3. Índice composto em aluno_presenca (unidade_id, aluno_id, data_aula DESC).
--   4. Índice cobrindo em aluno_contratos_emusys com os 3 tiebreakers.
--
-- Contrato de saída: inalterado (mesmas colunas, ordem, status, assinados_todos).

-- ============================================================
-- 1. Índices
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_aluno_presenca_unidade_aluno_data
  ON public.aluno_presenca (unidade_id, aluno_id, data_aula DESC);

CREATE INDEX IF NOT EXISTS idx_aluno_contratos_emusys_matricula_obs_full
  ON public.aluno_contratos_emusys (unidade_id, emusys_matricula_id,
    contrato_status_observado_em DESC, updated_at DESC, id DESC);

-- ============================================================
-- 2. Rewrite get_frequencia_unidade_canonica_batch_v1
--    Merge aula_tem_presente + aulas_emusys join em aula_info
--    (elimina 57K nested loop buffer hits)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_frequencia_unidade_canonica_batch_v1(p_unidade_id uuid)
RETURNS TABLE(
  unidade_id uuid,
  pessoa_chave text,
  aluno_id_canonico integer,
  aluno_ids_locais integer[],
  identidade_confianca text,
  total_eventos_evidencia integer,
  eventos_resultado_confirmado integer,
  presencas_confirmadas integer,
  faltas_confirmadas integer,
  faltas_provaveis integer,
  chamadas_indeterminadas integer,
  eventos_excluidos integer,
  conflitos integer,
  taxa_presenca_geral numeric,
  cobertura_resultado_confirmado numeric,
  confianca_presenca text,
  regra_versao text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
SET work_mem TO '24MB'
AS $function$
WITH identidade AS MATERIALIZED (
  SELECT
    i.unidade_id,
    i.pessoa_chave,
    i.aluno_id_canonico,
    i.aluno_ids_locais,
    i.identidade_confianca
  FROM public.vw_aluno_identidade_unidade_canonica i
  WHERE i.unidade_id = p_unidade_id
),
aula_info AS MATERIALIZED (
  SELECT
    ap2.aula_emusys_id,
    BOOL_OR(ap2.status = 'presente') AS tem_presente,
    bool_or(ae.cancelada) AS aula_cancelada,
    bool_or(ae.justificada) AS aula_justificada,
    lower(nullif(max(ae.professor_presenca), '')) AS professor_presenca_emusys
  FROM public.aluno_presenca ap2
  LEFT JOIN public.aulas_emusys ae ON ae.id = ap2.aula_emusys_id
  WHERE ap2.unidade_id = p_unidade_id
    AND ap2.aula_emusys_id IS NOT NULL
  GROUP BY ap2.aula_emusys_id
),
linhas AS MATERIALIZED (
  SELECT
    i.unidade_id,
    i.pessoa_chave,
    i.aluno_id_canonico,
    i.aluno_ids_locais,
    i.identidade_confianca,
    CASE
      WHEN ap.aula_emusys_id IS NOT NULL THEN 'aula:' || ap.aula_emusys_id::text
      ELSE concat_ws(
        ':',
        'fallback',
        ap.data_aula::text,
        ap.horario_aula::text,
        COALESCE(ap.professor_id::text, 'sem-professor'),
        COALESCE(lower(btrim(ap.curso_nome)), 'sem-curso')
      )
    END AS evento_chave,
    ap.status,
    ap.respondido_por,
    COALESCE(NULLIF(lower(ap.emusys_presenca_bruta), ''), lower(ap.status))
      AS estado_emusys_bruto,
    COALESCE(ai.aula_cancelada, false) AS aula_cancelada,
    COALESCE(ai.aula_justificada, false) AS aula_justificada,
    ai.professor_presenca_emusys AS professor_presenca_emusys,
    CASE
      WHEN ap.aula_emusys_id IS NULL THEN ap.status = 'presente'
      ELSE COALESCE(ai.tem_presente, false)
    END AS evento_tem_aluno_presente
  FROM identidade i
  JOIN public.aluno_presenca ap
    ON ap.unidade_id = i.unidade_id
   AND ap.aluno_id = ANY(i.aluno_ids_locais)
  LEFT JOIN aula_info ai ON ai.aula_emusys_id = ap.aula_emusys_id
  WHERE ap.data_aula <= CURRENT_DATE
),
eventos AS (
  SELECT
    l.unidade_id,
    l.pessoa_chave,
    l.aluno_id_canonico,
    l.aluno_ids_locais,
    l.identidade_confianca,
    l.evento_chave,
    BOOL_OR(l.aula_cancelada) AS tem_cancelamento,
    BOOL_OR(l.aula_justificada) AS tem_justificativa,
    BOOL_OR(l.status = 'presente') AS tem_presenca,
    BOOL_OR(
      l.status = 'ausente'
      AND l.respondido_por IN ('professor_la_teacher', 'manual')
    ) AS tem_falta_confirmada,
    BOOL_OR(
      l.estado_emusys_bruto = 'ausente'
      AND l.respondido_por IN ('emusys', 'sistema')
      AND (
        l.evento_tem_aluno_presente
        OR l.professor_presenca_emusys = 'presente'
      )
    ) AS tem_falta_provavel,
    BOOL_OR(
      l.estado_emusys_bruto = 'ausente'
      AND l.respondido_por IN ('emusys', 'sistema')
    ) AS tem_ausencia_automatica
  FROM linhas l
  GROUP BY
    l.unidade_id,
    l.pessoa_chave,
    l.aluno_id_canonico,
    l.aluno_ids_locais,
    l.identidade_confianca,
    l.evento_chave
),
classificados AS (
  SELECT
    e.*,
    CASE
      WHEN e.tem_cancelamento THEN 'aula_cancelada'
      WHEN e.tem_justificativa THEN 'aula_justificada'
      WHEN e.tem_presenca THEN 'presente'
      WHEN e.tem_falta_confirmada THEN 'falta_confirmada'
      WHEN e.tem_falta_provavel THEN 'falta_provavel'
      WHEN e.tem_ausencia_automatica THEN 'indeterminado'
      ELSE 'indeterminado'
    END AS resultado_evento,
    (
      e.tem_presenca
      AND (
        e.tem_falta_confirmada
        OR e.tem_falta_provavel
        OR e.tem_cancelamento
        OR e.tem_justificativa
      )
    ) AS possui_conflito
  FROM eventos e
),
agregado AS (
  SELECT
    c.unidade_id,
    c.pessoa_chave,
    c.aluno_id_canonico,
    c.aluno_ids_locais,
    c.identidade_confianca,
    COUNT(*)::integer AS total_eventos_evidencia,
    COUNT(*) FILTER (
      WHERE c.resultado_evento IN ('presente', 'falta_confirmada')
    )::integer AS eventos_resultado_confirmado,
    COUNT(*) FILTER (WHERE c.resultado_evento = 'presente')::integer
      AS presencas_confirmadas,
    COUNT(*) FILTER (WHERE c.resultado_evento = 'falta_confirmada')::integer
      AS faltas_confirmadas,
    COUNT(*) FILTER (WHERE c.resultado_evento = 'falta_provavel')::integer
      AS faltas_provaveis,
    COUNT(*) FILTER (WHERE c.resultado_evento = 'indeterminado')::integer
      AS chamadas_indeterminadas,
    COUNT(*) FILTER (
      WHERE c.resultado_evento IN ('aula_cancelada', 'aula_justificada')
    )::integer AS eventos_excluidos,
    COUNT(*) FILTER (WHERE c.possui_conflito)::integer AS conflitos
  FROM classificados c
  GROUP BY
    c.unidade_id,
    c.pessoa_chave,
    c.aluno_id_canonico,
    c.aluno_ids_locais,
    c.identidade_confianca
)
SELECT
  a.unidade_id,
  a.pessoa_chave,
  a.aluno_id_canonico,
  a.aluno_ids_locais,
  a.identidade_confianca,
  a.total_eventos_evidencia,
  a.eventos_resultado_confirmado,
  a.presencas_confirmadas,
  a.faltas_confirmadas,
  a.faltas_provaveis,
  a.chamadas_indeterminadas,
  a.eventos_excluidos,
  a.conflitos,
  CASE
    WHEN a.eventos_resultado_confirmado > 0 THEN ROUND(
      a.presencas_confirmadas::numeric / a.eventos_resultado_confirmado,
      6
    )
    ELSE NULL::numeric
  END AS taxa_presenca_geral,
  CASE
    WHEN (
      a.eventos_resultado_confirmado
      + a.faltas_provaveis
      + a.chamadas_indeterminadas
    ) > 0 THEN ROUND(
      a.eventos_resultado_confirmado::numeric
      / (
        a.eventos_resultado_confirmado
        + a.faltas_provaveis
        + a.chamadas_indeterminadas
      ),
      6
    )
    ELSE 0::numeric
  END AS cobertura_resultado_confirmado,
  CASE
    WHEN a.identidade_confianca = 'baixa' OR a.conflitos > 0 THEN 'baixa'
    WHEN a.eventos_resultado_confirmado = 0 THEN 'sem_base'
    WHEN a.faltas_provaveis + a.chamadas_indeterminadas = 0
      AND a.eventos_resultado_confirmado >= 4 THEN 'alta'
    WHEN a.eventos_resultado_confirmado >= 4
      AND a.eventos_resultado_confirmado::numeric
        / NULLIF(
          a.eventos_resultado_confirmado
          + a.faltas_provaveis
          + a.chamadas_indeterminadas,
          0
        ) >= 0.8 THEN 'media'
    ELSE 'baixa'
  END AS confianca_presenca,
  'frequencia-aluno-canonica-v1'::text AS regra_versao
FROM agregado a;
$function$;

-- ============================================================
-- 3. work_mem em get_situacao_alunos_v1
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_situacao_alunos_v1(
  p_unidade_id uuid,
  p_referencia date DEFAULT CURRENT_DATE,
  p_apenas_pendentes boolean DEFAULT false
)
RETURNS TABLE(
  pessoa_chave text,
  aluno_id_canonico integer,
  aluno_ids_locais integer[],
  nome text,
  unidade_id uuid,
  classificacao text,
  status_operacional text,
  matriculas_ativas integer,
  cursos text[],
  entrou_em date,
  matricula_recente_em date,
  responsavel_nome text,
  professores text[],
  aulas_resumo text[],
  anamnese_preenchida boolean,
  anamnese_em date,
  anamnese_tipo text,
  anamnese_flag_sem_registro boolean,
  anamnese_orfa_candidata_id integer,
  anamnese_orfa_match text,
  tem_instagram boolean,
  instagram_nao_possui boolean,
  tem_telefone boolean,
  tem_responsavel boolean,
  tem_foto boolean,
  tem_data_contrato boolean,
  contrato_vencido boolean,
  cadastro_completo boolean,
  cadastro_faltando text[],
  presenca_confirmadas integer,
  faltas_confirmadas integer,
  faltas_provaveis integer,
  chamadas_indeterminadas integer,
  presenca_taxa_geral numeric,
  presenca_confianca text,
  presenca_regra_versao text,
  ultima_aula_em date,
  dias_desde_ultima_aula integer,
  inadimplente boolean,
  faturas_vencidas_abertas integer,
  em_aviso_previo boolean,
  aviso_previo_mes_saida date,
  proxima_renovacao_em date,
  vence_em_30d boolean,
  na_comunidade_wa boolean,
  comunidade_status text,
  comunidade_capturado_em timestamp with time zone,
  pendencias text[],
  fonte text,
  regra_versao text,
  contrato_assinatura_status text,
  contratos_assinados_todos boolean,
  contratos_relevantes integer,
  contratos_assinados integer,
  contratos_nao_assinados integer,
  contratos_sem_contrato integer,
  contratos_nao_verificados integer,
  contrato_status_observado_em timestamp with time zone,
  contrato_reconciliado_em timestamp with time zone,
  contrato_dado_fresco boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
SET work_mem TO '24MB'
AS $function$
  with antigos as materialized (
    select *
    from public.get_situacao_alunos_sem_contrato_assinado_v1(
      p_unidade_id, p_referencia, p_apenas_pendentes
    )
  ),
  sync_fresco as (
    select max(e.completed_at) as reconciliado_em
    from public.contrato_assinatura_sync_execucoes e
    where e.unidade_id = p_unidade_id
      and e.status = 'succeeded'
      and (e.completed_at at time zone 'America/Sao_Paulo')::date = p_referencia
  ),
  matriculas_locais_relevantes as materialized (
    select o.pessoa_chave,
           a.id as aluno_id,
           nullif(btrim(a.emusys_matricula_id::text), '') as emusys_matricula_id
    from antigos o
    cross join lateral unnest(o.aluno_ids_locais) aid(aluno_id)
    join public.alunos a on a.id = aid.aluno_id and a.arquivado_em is null
    join public.vw_alunos_estado_operacional_v131 eo
      on eo.aluno_id = a.id and eo.entra_base_ativa = true
    left join public.cursos c on c.id = a.curso_id
    where not coalesce(c.is_projeto_banda, false)
  ),
  matriculas_jornada_relevantes as materialized (
    select o.pessoa_chave,
           min(j.aluno_id)::integer as aluno_id,
           j.emusys_matricula_id::text as emusys_matricula_id
    from antigos o
    join public.aluno_jornada_matricula_disciplina j
      on j.unidade_id = p_unidade_id
     and j.aluno_id = any(o.aluno_ids_locais)
    left join public.cursos c on c.id = j.curso_id
    where j.emusys_matricula_id is not null
      and coalesce(nullif(btrim(j.status_emusys), ''), j.status_matricula) = 'ativa'
    group by o.pessoa_chave, j.emusys_matricula_id
    having bool_or(not coalesce(c.is_projeto_banda, false))
  ),
  cobertura_identidade as (
    select o.pessoa_chave,
           count(distinct ml.aluno_id)::integer as matriculas_locais,
           count(distinct mj.emusys_matricula_id)::integer as matriculas_jornada
    from antigos o
    left join matriculas_locais_relevantes ml
      on ml.pessoa_chave = o.pessoa_chave
    left join matriculas_jornada_relevantes mj
      on mj.pessoa_chave = o.pessoa_chave
    group by o.pessoa_chave
  ),
  matriculas_escolhidas as (
    -- Sem cobertura integral da jornada, conserva o comportamento anterior.
    select ml.pessoa_chave, ml.aluno_id, ml.emusys_matricula_id
    from matriculas_locais_relevantes ml
    join cobertura_identidade ci on ci.pessoa_chave = ml.pessoa_chave
    where ci.matriculas_locais <> ci.matriculas_jornada
       or ci.matriculas_locais = 0

    union all

    -- A igualdade de cardinalidade prova que nenhuma matricula local relevante
    -- foi ocultada antes de usarmos as identidades exatas da jornada.
    select mj.pessoa_chave, mj.aluno_id, mj.emusys_matricula_id
    from matriculas_jornada_relevantes mj
    join cobertura_identidade ci on ci.pessoa_chave = mj.pessoa_chave
    where ci.matriculas_locais = ci.matriculas_jornada
      and ci.matriculas_locais > 0
  ),
  matriculas_relevantes as (
    select me.pessoa_chave,
           me.aluno_id,
           me.emusys_matricula_id,
           obs.id as observacao_id,
           obs.contrato_emusys_id,
           obs.contrato_assinado,
           obs.contrato_status_observado_em
    from matriculas_escolhidas me
    left join lateral (
      select ace.id, ace.contrato_emusys_id, ace.contrato_assinado,
             ace.contrato_status_observado_em
      from public.aluno_contratos_emusys ace
      where ace.unidade_id = p_unidade_id
        and ace.emusys_matricula_id = me.emusys_matricula_id
      order by ace.contrato_status_observado_em desc, ace.updated_at desc, ace.id desc
      limit 1
    ) obs on me.emusys_matricula_id is not null
  ),
  stats as (
    select o.pessoa_chave,
           count(m.aluno_id)::integer as contratos_relevantes,
           count(*) filter (where m.contrato_assinado is true)::integer as contratos_assinados,
           bool_and(m.contrato_assinado is true)
             filter (where m.aluno_id is not null) as todas_assinadas,
           count(*) filter (where m.contrato_assinado is false)::integer as contratos_nao_assinados,
           count(*) filter (
             where m.observacao_id is not null and m.contrato_emusys_id is null
           )::integer as contratos_sem_contrato,
           count(*) filter (
             where m.aluno_id is not null and (
               m.emusys_matricula_id is null or m.observacao_id is null
             )
           )::integer as contratos_nao_verificados,
           min(m.contrato_status_observado_em) as observado_em,
           sf.reconciliado_em
    from antigos o
    left join matriculas_relevantes m on m.pessoa_chave = o.pessoa_chave
    cross join sync_fresco sf
    group by o.pessoa_chave, sf.reconciliado_em
  ),
  classificados as (
    select s.*,
      case
        when s.contratos_relevantes = 0 then 'dispensado'
        when s.reconciliado_em is null or s.contratos_nao_verificados > 0 then 'nao_verificado'
        when s.contratos_sem_contrato > 0 then 'sem_contrato'
        when s.contratos_nao_assinados > 0 then 'nao_assinado'
        when s.contratos_assinados = s.contratos_relevantes then 'assinado'
        else 'nao_verificado'
      end as status,
      case
        when s.contratos_relevantes = 0 then null
        when s.reconciliado_em is null or s.contratos_nao_verificados > 0 then null
        else coalesce(s.todas_assinadas, false)
             and s.contratos_assinados = s.contratos_relevantes
      end as assinados_todos
    from stats s
  )
  select o.*,
         c.status,
         c.assinados_todos,
         c.contratos_relevantes,
         c.contratos_assinados,
         c.contratos_nao_assinados,
         c.contratos_sem_contrato,
         c.contratos_nao_verificados,
         c.observado_em,
         c.reconciliado_em,
         (c.reconciliado_em is not null and c.contratos_nao_verificados = 0)
  from antigos o
  join classificados c on c.pessoa_chave = o.pessoa_chave
  order by o.nome;
$function$;
