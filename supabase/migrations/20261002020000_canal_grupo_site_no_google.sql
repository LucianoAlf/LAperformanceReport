-- Google + Site = um canal só ("Google") na LEITURA do funil/relatórios — decisão do Alf em 02/10.
-- A regra de negócio já era declarada pelo Luciano em 03/09 dentro de radar_trafego_canal_v1
-- ("Site é a landing page que roda no Google — mesma verba"); aqui ela vira agrupamento
-- canônico para TODAS as saídas do funil comercial.
--
-- 1) canais_origem.canal_grupo: rótulo de grupo por canal. NULL/vazio = o próprio nome.
--    Site -> 'Google'. Os canais originais ficam intactos (linha segue ativa, leads antigos
--    continuam apontando para ela) — auditoria completa.
-- 2) kpis_comercial_v2_sem_cache_20260923: o CTE origem_canal passa a agrupar por
--    canal_grupo e devolve 'canais_originais' (os rótulos que entraram no grupo) para
--    auditoria dentro do payload. Propaga sozinho para get_kpis_comercial_canonicos_v2,
--    get_kpis_comercial_competencia_v1 (canais_do_mes), mila_numeros_do_mes_v1,
--    mike_funil_v1 e mike_funil_v2 — todos leem origem_canal dela.
-- 3) upsert_lead: o 'SITE' puro (que caía no ELSE e ia para o canal Site) passa a mapear
--    para 'Google', como 'SITE DA ESCOLA'/'INTERNET'/'E-MAIL MARKETING' já faziam.
--    O rótulo bruto fica em detalhes.canal_bruto do leads_automacao_log quando difere.
-- 4) mike_funil_v2: texto como_ler atualizado para a leitura já agrupada.
--
-- Meses FECHADOS continuam com snapshot congelado (o fechamento não é reescrito); o
-- canais_do_mes é complemento vivo por desenho da competencia_v1, então set/2026 (mês
-- aberto) já mostra o grupo. Radar/tráfego de mídia já agrupavam Site no Google por
-- conta própria e continuam iguais.
--
-- Números medidos em produção (set/2026, sem_cache): Google 95 + Site 10 = Google 105,
-- total de leads inalterado (777 consolidado; REC 17+10=27 de 200).
-- Rollback: supabase/rollbacks/20261002020000_canal_grupo_site_no_google_ROLLBACK.sql

alter table public.canais_origem
  add column if not exists canal_grupo varchar;

comment on column public.canais_origem.canal_grupo is
  'Rótulo de grupo para leitura agregada do funil (decisão Alf 02/10: Site sai dentro de Google). NULL ou vazio = o próprio nome do canal. O nome original segue em leads.canal_origem_id -> nome para auditoria.';

update public.canais_origem set canal_grupo = nome where canal_grupo is null;
update public.canais_origem set canal_grupo = 'Google' where nome = 'Site';

CREATE OR REPLACE FUNCTION public.kpis_comercial_v2_sem_cache_20260923(p_unidade_id uuid, p_ano integer, p_mes integer, p_periodo text DEFAULT 'mensal'::text, p_data date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
WITH periodo AS (
  SELECT
    CASE WHEN lower(coalesce(p_periodo, 'mensal')) = 'diario' THEN 'diario' ELSE 'mensal' END AS tipo,
    p_ano AS ano,
    p_mes AS mes,
    CASE
      WHEN lower(coalesce(p_periodo, 'mensal')) = 'diario'
      THEN coalesce(p_data, make_date(p_ano, p_mes, 1))
      ELSE make_date(p_ano, p_mes, 1)
    END AS inicio,
    CASE
      WHEN lower(coalesce(p_periodo, 'mensal')) = 'diario'
      THEN coalesce(p_data, make_date(p_ano, p_mes, 1)) + interval '1 day'
      ELSE make_date(p_ano, p_mes, 1) + interval '1 month'
    END AS fim_exclusivo,
    p_data AS data_referencia
),
unidades_alvo AS (
  SELECT u.id AS unidade_id, u.nome AS unidade_nome
  FROM public.unidades u
  WHERE u.ativo = true
    AND (p_unidade_id IS NULL OR u.id = p_unidade_id)
),
leads_base AS (
  SELECT
    l.unidade_id,
    sum(coalesce(l.quantidade, 1))::int AS leads_entrantes,
    count(*)::int AS linhas_leads
  FROM public.leads l
  CROSS JOIN periodo p
  WHERE l.data_contato >= p.inicio::date
    AND l.data_contato < p.fim_exclusivo::date
    AND (p_unidade_id IS NULL OR l.unidade_id = p_unidade_id)
  GROUP BY l.unidade_id
),
exp_eventos AS (
  SELECT
    le.*,
    l.aluno_id AS lead_aluno_id,
    coalesce(le.aluno_id, l.aluno_id) AS aluno_id_resolvido,
    EXISTS (
      SELECT 1
      FROM public.aluno_presenca ap
      JOIN public.aulas_emusys ae ON ae.id = ap.aula_emusys_id
      WHERE ap.status = 'presente'
        AND ap.aluno_id = coalesce(le.aluno_id, l.aluno_id)
        AND ap.unidade_id = le.unidade_id
        AND ap.data_aula = le.data_experimental
        AND ae.categoria = 'experimental'
        AND coalesce(ae.cancelada, false) = false
    ) AS presenca_individual_confirmada
  FROM public.lead_experimentais le
  LEFT JOIN public.leads l ON l.id = le.lead_id
  WHERE (p_unidade_id IS NULL OR le.unidade_id = p_unidade_id)
),
exp_agendadas AS (
  SELECT
    ee.unidade_id,
    count(*)::int AS experimentais_agendadas_periodo
  FROM exp_eventos ee
  CROSS JOIN periodo p
  WHERE ee.created_at >= p.inicio
    AND ee.created_at < p.fim_exclusivo
    AND coalesce(ee.status, '') NOT IN ('cancelada', 'cancelado', 'experimental_cancelada')
  GROUP BY ee.unidade_id
),
exp_realizadas AS (
  SELECT
    ee.unidade_id,
    count(*) FILTER (WHERE ee.presenca_individual_confirmada)::int AS experimentais_realizadas_presenca_confirmada,
    count(*) FILTER (WHERE ee.status IN ('experimental_realizada', 'convertido'))::int AS experimentais_realizadas_status_operacional,
    count(*) FILTER (
      WHERE ee.status IN ('experimental_realizada', 'convertido')
        AND NOT ee.presenca_individual_confirmada
    )::int AS experimentais_realizadas_status_operacional_sem_presenca,
    count(*) FILTER (WHERE ee.status IN ('experimental_faltou', 'faltou'))::int AS experimentais_no_show,
    count(*) FILTER (WHERE ee.status IN ('cancelada', 'cancelado', 'experimental_cancelada'))::int AS experimentais_canceladas
  FROM exp_eventos ee
  CROSS JOIN periodo p
  WHERE ee.data_experimental >= p.inicio::date
    AND ee.data_experimental < p.fim_exclusivo::date
  GROUP BY ee.unidade_id
),
visitas_base AS (
  -- As duas formas de visitar. `agendada` = tem linha em `visitas` (promessa, precisa
  -- de confirmacao de presenca); o outro ramo e quem chegou sem hora marcada, que ja
  -- esteve aqui -- o comparecimento dele e a razao de o lead existir.
  SELECT
    x.unidade_id,
    -- COMPARECIMENTO: agendada confirmada + quem chegou sem agendar.
    (count(*) FILTER (WHERE x.agendada AND x.status = 'realizada')
     + count(*) FILTER (WHERE NOT x.agendada))::int AS visitas,
    count(*)::int AS visitas_total,
    count(*) FILTER (WHERE x.agendada)::int AS visitas_agendadas,
    count(*) FILTER (WHERE x.agendada AND x.status = 'realizada')::int AS visitas_confirmadas,
    -- `aguardando` e "ninguem confirmou", NUNCA "faltou": traduzir ausencia de marcacao
    -- para falta afirmaria um fato que ninguem mediu.
    count(*) FILTER (WHERE x.agendada
                       AND coalesce(x.status, '') NOT IN ('realizada', 'nao_compareceu'))::int AS visitas_aguardando,
    count(*) FILTER (WHERE NOT x.agendada)::int AS visitas_sem_hora_marcada
  FROM (
    SELECT v.unidade_id, true AS agendada, v.status
    FROM public.visitas v
    CROSS JOIN periodo p
    WHERE v.data >= p.inicio::date
      AND v.data < p.fim_exclusivo::date
      AND coalesce(v.status, '') NOT IN ('cancelada', 'cancelado')
      AND (p_unidade_id IS NULL OR v.unidade_id = p_unidade_id)
    UNION ALL
    -- ⚠️ Exclui quem JA tem visita agendada no periodo: hoje sao 0 casos (medido em
    -- 23/09 nos 233 leads do canal contra as 139 visitas), mas sem isso a pessoa que
    -- chegou na porta e depois marcou uma visita contaria duas vezes.
    SELECT l.unidade_id, false, NULL::text
    FROM public.leads l
    CROSS JOIN periodo p
    WHERE l.canal_origem_id = 6
      AND l.data_contato >= p.inicio::date
      AND l.data_contato < p.fim_exclusivo::date
      AND (p_unidade_id IS NULL OR l.unidade_id = p_unidade_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.visitas v2
        WHERE v2.lead_id = l.id
          AND v2.data >= p.inicio::date
          AND v2.data < p.fim_exclusivo::date
          AND coalesce(v2.status, '') NOT IN ('cancelada', 'cancelado')
      )
  ) x
  GROUP BY x.unidade_id
),
matriculas_base AS (
  SELECT
    a.unidade_id,
    a.id AS aluno_id,
    coalesce(a.valor_passaporte, 0) AS valor_passaporte,
    (
      coalesce(a.is_segundo_curso, false) = false
      AND coalesce(a.valor_passaporte, 0) > 0
      AND coalesce(a.tipo_aluno, 'pagante') NOT IN ('bolsista_integral', 'bolsista_parcial', 'nao_pagante')
      AND coalesce(c.is_projeto_banda, false) = false
      AND lower(coalesce(c.nome, '')) NOT LIKE '%banda%'
      AND lower(coalesce(c.nome, '')) NOT LIKE '%projeto%'
      AND lower(coalesce(c.nome, '')) NOT LIKE '%coral%'
      AND coalesce(tm.codigo, '') NOT IN ('SEGUNDO_CURSO', 'BANDA', 'BOLSISTA_INT', 'BOLSISTA_PARC')
      AND coalesce(tm.conta_como_pagante, true) = true
    ) AS is_matricula_comercial_principal,
    EXISTS (
      SELECT 1
      FROM public.leads l
      -- 🔴 lead fabricado pelo gatilho `sync_aluno_to_leads` NAO conta como
      -- lead vinculado: ele nasce DA matricula. Sem esta linha o indicador
      -- `matriculas_sem_lead_vinculado` fica 0 por construcao nas 3 unidades.
      WHERE coalesce(l.origem_registro, 'funil') <> 'sync_aluno'
        AND (l.aluno_id = a.id
         OR l.id = a.lead_origem_id)
    ) AS tem_lead_vinculado
  FROM public.alunos a
  CROSS JOIN periodo p
  LEFT JOIN public.cursos c ON c.id = a.curso_id
  LEFT JOIN public.tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.data_matricula >= p.inicio::date
    AND a.data_matricula < p.fim_exclusivo::date
    AND a.arquivado_em IS NULL
    AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
),
matriculas_agg AS (
  SELECT
    unidade_id,
    count(*)::int AS matriculas_academicas,
    count(*) FILTER (WHERE is_matricula_comercial_principal)::int AS matriculas_comerciais_principais,
    count(*) FILTER (WHERE is_matricula_comercial_principal AND tem_lead_vinculado)::int AS conversoes_de_lead,
    count(*) FILTER (WHERE is_matricula_comercial_principal AND NOT tem_lead_vinculado)::int AS matriculas_sem_lead_vinculado,
    coalesce(sum(valor_passaporte) FILTER (WHERE is_matricula_comercial_principal), 0)::numeric AS passaportes_total
  FROM matriculas_base
  GROUP BY unidade_id
),
base AS (
  SELECT
    ua.unidade_id,
    ua.unidade_nome,
    coalesce(lb.leads_entrantes, 0)::int AS leads_entrantes,
    coalesce(lb.linhas_leads, 0)::int AS linhas_leads,
    coalesce(ea.experimentais_agendadas_periodo, 0)::int AS experimentais_agendadas_periodo,
    coalesce(er.experimentais_realizadas_presenca_confirmada, 0)::int AS experimentais_realizadas_presenca_confirmada,
    coalesce(er.experimentais_realizadas_status_operacional, 0)::int AS experimentais_realizadas_status_operacional,
    coalesce(er.experimentais_realizadas_status_operacional_sem_presenca, 0)::int AS experimentais_realizadas_status_operacional_sem_presenca,
    coalesce(er.experimentais_no_show, 0)::int AS experimentais_no_show,
    coalesce(er.experimentais_canceladas, 0)::int AS experimentais_canceladas,
    coalesce(vb.visitas, 0)::int AS visitas,
    coalesce(vb.visitas_total, 0)::int AS visitas_total,
    coalesce(vb.visitas_agendadas, 0)::int AS visitas_agendadas,
    coalesce(vb.visitas_confirmadas, 0)::int AS visitas_confirmadas,
    coalesce(vb.visitas_aguardando, 0)::int AS visitas_aguardando,
    coalesce(vb.visitas_sem_hora_marcada, 0)::int AS visitas_sem_hora_marcada,
    coalesce(ma.matriculas_academicas, 0)::int AS matriculas_academicas,
    coalesce(ma.matriculas_comerciais_principais, 0)::int AS matriculas_comerciais_principais,
    coalesce(ma.conversoes_de_lead, 0)::int AS conversoes_de_lead,
    coalesce(ma.matriculas_sem_lead_vinculado, 0)::int AS matriculas_sem_lead_vinculado,
    coalesce(ma.passaportes_total, 0)::numeric AS passaportes_total
  FROM unidades_alvo ua
  LEFT JOIN leads_base lb ON lb.unidade_id = ua.unidade_id
  LEFT JOIN exp_agendadas ea ON ea.unidade_id = ua.unidade_id
  LEFT JOIN exp_realizadas er ON er.unidade_id = ua.unidade_id
  LEFT JOIN visitas_base vb ON vb.unidade_id = ua.unidade_id
  LEFT JOIN matriculas_agg ma ON ma.unidade_id = ua.unidade_id
),
consolidado AS (
  SELECT
    NULL::uuid AS unidade_id,
    'Consolidado'::text AS unidade_nome,
    sum(leads_entrantes)::int AS leads_entrantes,
    sum(linhas_leads)::int AS linhas_leads,
    sum(experimentais_agendadas_periodo)::int AS experimentais_agendadas_periodo,
    sum(experimentais_realizadas_presenca_confirmada)::int AS experimentais_realizadas_presenca_confirmada,
    sum(experimentais_realizadas_status_operacional)::int AS experimentais_realizadas_status_operacional,
    sum(experimentais_realizadas_status_operacional_sem_presenca)::int AS experimentais_realizadas_status_operacional_sem_presenca,
    sum(experimentais_no_show)::int AS experimentais_no_show,
    sum(experimentais_canceladas)::int AS experimentais_canceladas,
    sum(visitas)::int AS visitas,
    sum(visitas_total)::int AS visitas_total,
    sum(visitas_agendadas)::int AS visitas_agendadas,
    sum(visitas_confirmadas)::int AS visitas_confirmadas,
    sum(visitas_aguardando)::int AS visitas_aguardando,
    sum(visitas_sem_hora_marcada)::int AS visitas_sem_hora_marcada,
    sum(matriculas_academicas)::int AS matriculas_academicas,
    sum(matriculas_comerciais_principais)::int AS matriculas_comerciais_principais,
    sum(conversoes_de_lead)::int AS conversoes_de_lead,
    sum(matriculas_sem_lead_vinculado)::int AS matriculas_sem_lead_vinculado,
    sum(passaportes_total)::numeric AS passaportes_total
  FROM base
),
resumo AS (
  SELECT * FROM base WHERE p_unidade_id IS NOT NULL
  UNION ALL
  SELECT * FROM consolidado WHERE p_unidade_id IS NULL
),
origem_canal AS (
  SELECT jsonb_agg(
           jsonb_build_object(
             'canal', canal,
             'leads', leads,
             'matriculas_comerciais_principais', matriculas_comerciais_principais,
             'leads_convertidos_operacional', leads_convertidos_operacional,
             'canais_originais', canais_originais
           )
           ORDER BY leads DESC, matriculas_comerciais_principais DESC, canal
         ) AS payload
  FROM (
    SELECT
      coalesce(nullif(btrim(co.canal_grupo), ''), co.nome, 'Sem canal') AS canal,
      sum(coalesce(l.quantidade, 1))::int AS leads,
      count(*) FILTER (WHERE l.converteu = true OR l.status IN ('convertido', 'matriculado') OR l.aluno_id IS NOT NULL)::int AS leads_convertidos_operacional,
      0::int AS matriculas_comerciais_principais,
      array_agg(DISTINCT coalesce(co.nome, 'Sem canal') ORDER BY coalesce(co.nome, 'Sem canal')) AS canais_originais
    FROM public.leads l
    CROSS JOIN periodo p
    LEFT JOIN public.canais_origem co ON co.id = l.canal_origem_id
    WHERE l.data_contato >= p.inicio::date
      AND l.data_contato < p.fim_exclusivo::date
      AND (p_unidade_id IS NULL OR l.unidade_id = p_unidade_id)
    GROUP BY coalesce(nullif(btrim(co.canal_grupo), ''), co.nome, 'Sem canal')
    ORDER BY 2 DESC, 1
    LIMIT 15
  ) x
),
cursos_mais_procurados AS (
  SELECT jsonb_agg(
           jsonb_build_object('curso', curso, 'leads', leads, 'matriculas_comerciais_principais', matriculas_comerciais_principais)
           ORDER BY leads DESC, matriculas_comerciais_principais DESC, curso
         ) AS payload
  FROM (
    SELECT coalesce(c.nome, 'Sem curso') AS curso,
           sum(coalesce(l.quantidade, 1))::int AS leads,
           0::int AS matriculas_comerciais_principais
    FROM public.leads l
    CROSS JOIN periodo p
    LEFT JOIN public.cursos c ON c.id = l.curso_interesse_id
    WHERE l.data_contato >= p.inicio::date
      AND l.data_contato < p.fim_exclusivo::date
      AND (p_unidade_id IS NULL OR l.unidade_id = p_unidade_id)
    GROUP BY coalesce(c.nome, 'Sem curso')
    ORDER BY 2 DESC, 1
    LIMIT 15
  ) x
)
SELECT jsonb_build_object(
  'fonte', 'comercial_v2_transacional',
  'versao', 'p02e1-producao-final',
  'ambiente_esperado', 'producao',
  'legado_apenas_diagnostico', true,
  'periodo', jsonb_build_object(
    'tipo', (SELECT tipo FROM periodo),
    'ano', p_ano,
    'mes', p_mes,
    'data_referencia', (SELECT data_referencia FROM periodo),
    'inicio', (SELECT inicio FROM periodo),
    'fim_exclusivo', (SELECT fim_exclusivo FROM periodo)
  ),
  'escopo', jsonb_build_object(
    'unidade_id', (SELECT unidade_id FROM resumo LIMIT 1),
    'unidade_nome', (SELECT unidade_nome FROM resumo LIMIT 1),
    'consolidado', p_unidade_id IS NULL
  ),
  'kpis', (
    SELECT jsonb_build_object(
      'leads_entrantes', leads_entrantes,
      'linhas_leads', linhas_leads,
      'experimentais_agendadas_periodo', experimentais_agendadas_periodo,
      'experimentais_realizadas_presenca_confirmada', experimentais_realizadas_presenca_confirmada,
      'experimentais_realizadas_status_operacional', experimentais_realizadas_status_operacional,
      'experimentais_realizadas_status_operacional_sem_presenca', experimentais_realizadas_status_operacional_sem_presenca,
      'experimentais_no_show', experimentais_no_show,
      'experimentais_canceladas', experimentais_canceladas,
      'visitas', visitas,
      'visitas_total', visitas_total,
      'visitas_agendadas', visitas_agendadas,
      'visitas_confirmadas', visitas_confirmadas,
      'visitas_aguardando', visitas_aguardando,
      'visitas_sem_hora_marcada', visitas_sem_hora_marcada,
      'matriculas_academicas', matriculas_academicas,
      'matriculas_comerciais_principais', matriculas_comerciais_principais,
      'conversoes_de_lead', conversoes_de_lead,
      'matriculas_sem_lead_vinculado', matriculas_sem_lead_vinculado,
      'passaportes_total', passaportes_total,
      'ticket_medio_passaporte', CASE WHEN matriculas_comerciais_principais > 0 THEN round(passaportes_total / matriculas_comerciais_principais, 2) ELSE 0 END,
      'taxa_lead_matricula', CASE WHEN leads_entrantes > 0 THEN round(conversoes_de_lead::numeric / leads_entrantes * 100, 2) ELSE 0 END,
      'taxa_exp_para_matricula_presenca_confirmada_diagnostica', CASE WHEN experimentais_realizadas_presenca_confirmada > 0 THEN round(conversoes_de_lead::numeric / experimentais_realizadas_presenca_confirmada * 100, 2) ELSE NULL END
    )
    FROM resumo
    LIMIT 1
  ),
  'origem_canal', coalesce((SELECT payload FROM origem_canal), '[]'::jsonb),
  'cursos_mais_procurados', coalesce((SELECT payload FROM cursos_mais_procurados), '[]'::jsonb),
  'gaps', (
    SELECT jsonb_build_object(
      'experimental_status_realizada_sem_presenca', experimentais_realizadas_status_operacional_sem_presenca,
      'matriculas_sem_lead_vinculado', matriculas_sem_lead_vinculado,
      'alertas', CASE
        WHEN experimentais_realizadas_status_operacional_sem_presenca > 0 THEN jsonb_build_array('Ha experimentais com status realizada/convertido sem presenca individual confirmada.')
        ELSE '[]'::jsonb
      END
    )
    FROM resumo
    LIMIT 1
  ),
  'por_unidade', CASE
    WHEN p_unidade_id IS NULL THEN (
      SELECT jsonb_agg(
        jsonb_build_object(
          'unidade_id', unidade_id,
          'unidade_nome', unidade_nome,
          'leads_entrantes', leads_entrantes,
          'experimentais_realizadas_presenca_confirmada', experimentais_realizadas_presenca_confirmada,
          'experimentais_realizadas_status_operacional', experimentais_realizadas_status_operacional,
          'matriculas_comerciais_principais', matriculas_comerciais_principais,
          'conversoes_de_lead', conversoes_de_lead,
          'experimentais_realizadas_status_operacional_sem_presenca', experimentais_realizadas_status_operacional_sem_presenca,
          'visitas', visitas,
          'visitas_total', visitas_total,
          'visitas_confirmadas', visitas_confirmadas,
          'visitas_aguardando', visitas_aguardando,
          'visitas_sem_hora_marcada', visitas_sem_hora_marcada
        )
        ORDER BY unidade_nome
      )
      FROM base
    )
    ELSE NULL
  END
)
FROM periodo;
$function$;
CREATE OR REPLACE FUNCTION public.upsert_lead(p_nome text, p_telefone text, p_email text, p_unidade_id uuid, p_curso text, p_canal text, p_source_id integer, p_source_type text DEFAULT 'emusys'::text, p_arquivar boolean DEFAULT false, p_data_contato date DEFAULT NULL::date, p_data_nascimento date DEFAULT NULL::date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_lead_id       integer;
  v_curso_id      integer;
  v_canal_id      integer;
  v_telefone_safe text;
  v_action        text;
  v_detalhes      jsonb;
  v_canal_bruto   text;
  v_log_nome      text;
begin
  if upper(trim(coalesce(p_nome, ''))) = 'NÃO INFORMADO' then
    p_nome := null;
  end if;

  v_log_nome := coalesce(nullif(trim(p_nome), ''), '(sem nome)');

  v_curso_id := case upper(trim(unaccent(coalesce(p_curso, ''))))
    when 'TECLADO' then 16 when 'PIANO' then 18
    when 'VIOLAO' then 10 when 'GUITARRA' then 14
    when 'CANTO' then 6  when 'BATERIA' then 27
    when 'MUSICALIZACAO' then 4 when 'UKULELE' then 8
    when 'VIOLINO' then 12 when 'FLAUTA DOCE' then 20
    when 'CONTRABAIXO' then 21 when 'SAX' then 31
    when 'CAVAQUINHO' then 35 when 'FLAUTA TRANSVERSA' then 37
    when 'VOZ' then 6
    when 'MUSICA' then 4
    when 'MUSICALIZACAO INFANTIL' then 4
    when 'MUSICALIZACAO BEBES' then 2
    when 'MUSICALIZACAO PARA BEBES' then 2
    when 'MUSICALIZACAO PREPARATORIA' then 40
    when 'SAXOFONE' then 31
    when 'FLAUTA TRANSVERSAL' then 37
    else null
  end;

  -- Regra declarada pelo Luciano em 03/09 e decisao do Alf de 02/10:
  -- "Site" (landing que roda no Google) e Google sao a mesma verba.
  v_canal_bruto := p_canal;
  p_canal := case upper(trim(p_canal))
    when 'WHATSAPP' then 'Facebook'
    when 'SITE DA ESCOLA' then 'Google'
    when 'SITE' then 'Google'
    when 'INTERNET' then 'Google'
    when 'E-MAIL MARKETING' then 'Google'
    when 'EX ALUNO' then 'Ex-aluno'
    when 'PLACA DA FACHADA' then 'Visita/Placa'
    when 'AMIGO' then 'Indicação'
    when 'VISITA' then 'Visita/Placa'
    when 'PROFESSOR' then 'Indicação'
    when 'ALUNO DA ESCOLA' then 'Indicação'
    when 'DIGITAL INFLUENCER' then 'Instagram'
    when 'TELEFONE' then 'Ligação'
    when 'SMS' then 'Convênios'
    when 'PANFLETOS' then 'Convênios'
    when 'PESQUISA DE RUA' then 'Convênios'
    when 'SHOPPING' then 'Convênios'
    when 'COMERCIOS' then 'Convênios'
    when 'LOJA DE MÚSICA' then 'Convênios'
    when 'IGREJA' then 'Convênios'
    when 'RECITAL' then 'Convênios'
    when 'JORNAL' then 'Convênios'
    when 'RÁDIO' then 'Convênios'
    when 'REVISTA' then 'Convênios'
    when 'TWITTER' then 'Convênios'
    when 'POLO UNIVERSITARIO' then 'Convênios'
    when 'PATROCINADORES' then 'Convênios'
    when 'FAMILY' then 'Indicação'
    when 'INSTAGRAM' then 'Instagram'
    else p_canal
  end;

  select id into v_canal_id from canais_origem where lower(nome) = lower(trim(p_canal)) limit 1;

  if p_source_type = 'emusys' then
    select id into v_lead_id from leads
      where emusys_lead_id = p_source_id and unidade_id = p_unidade_id and p_source_id is not null
      limit 1;
    if v_lead_id is null and p_telefone is not null then
      select id into v_lead_id from leads
        where telefone = p_telefone and unidade_id = p_unidade_id and arquivado = false
        limit 1;
    end if;
  elsif p_source_type = 'nocodb' then
    select id into v_lead_id from leads
      where nocodb_lead_id = p_source_id and unidade_id = p_unidade_id and p_source_id is not null
      limit 1;
    if v_lead_id is null and p_telefone is not null then
      select id into v_lead_id from leads
        where telefone = p_telefone and unidade_id = p_unidade_id and arquivado = false
        limit 1;
    end if;
  elsif p_source_type = 'campanha' then
    if p_telefone is not null then
      select id into v_lead_id from leads
        where telefone = p_telefone and unidade_id = p_unidade_id and arquivado = false
        limit 1;
    end if;
  end if;

  v_detalhes := json_build_object(
    'source_id', p_source_id, 'telefone', p_telefone, 'canal', p_canal, 'canal_bruto', nullif(v_canal_bruto, p_canal), 'curso', p_curso,
    'data_nascimento', p_data_nascimento,
    'sem_nome', (p_nome is null or trim(p_nome) = ''), 'sem_telefone', (p_telefone is null or trim(p_telefone) = '')
  )::jsonb;

  if p_arquivar and v_lead_id is not null then
    update leads set arquivado = true, status = 'arquivado', updated_at = now() where id = v_lead_id;
    v_action := 'archived';
    insert into leads_automacao_log (lead_nome, lead_id, unidade_nome, evento, acao, detalhes, created_at)
    values (v_log_nome, v_lead_id, p_unidade_id::text, p_source_type, v_action, v_detalhes, now());
    return json_build_object('action', v_action, 'lead_id', v_lead_id);
  end if;

  if v_lead_id is not null then
    v_telefone_safe := null;
    if p_telefone is not null then
      if not exists (select 1 from leads where telefone = p_telefone and unidade_id = p_unidade_id and id != v_lead_id and arquivado = false) then
        v_telefone_safe := p_telefone;
      end if;
    end if;

    if p_source_type = 'emusys' then
      update leads set
        emusys_lead_id = coalesce(p_source_id, emusys_lead_id),
        nome = coalesce(nullif(p_nome, ''), nome),
        telefone = coalesce(v_telefone_safe, telefone),
        email = coalesce(nullif(p_email, ''), email),
        curso_interesse_id = coalesce(v_curso_id, curso_interesse_id),
        canal_origem_id = case
          when gclid is not null and canal_origem_id = 3 then canal_origem_id
          when meta_ctwa_clid is not null and canal_origem_id in (1, 2) then canal_origem_id
          else coalesce(v_canal_id, canal_origem_id)
        end,
        data_nascimento = coalesce(p_data_nascimento, data_nascimento),
        data_contato = coalesce(p_data_contato, data_contato),
        updated_at = now(), data_ultimo_contato = now()
      where id = v_lead_id;
    elsif p_source_type = 'nocodb' then
      update leads set
        nocodb_lead_id = coalesce(p_source_id, nocodb_lead_id),
        nome = coalesce(nullif(p_nome, ''), nome),
        telefone = coalesce(v_telefone_safe, telefone),
        email = coalesce(nullif(p_email, ''), email),
        curso_interesse_id = coalesce(v_curso_id, curso_interesse_id),
        canal_origem_id = case
          when gclid is not null and canal_origem_id = 3 then canal_origem_id
          when meta_ctwa_clid is not null and canal_origem_id in (1, 2) then canal_origem_id
          else coalesce(v_canal_id, canal_origem_id)
        end,
        data_nascimento = coalesce(p_data_nascimento, data_nascimento),
        data_contato = coalesce(p_data_contato, data_contato),
        updated_at = now(), data_ultimo_contato = now()
      where id = v_lead_id;
    elsif p_source_type = 'campanha' then
      update leads set updated_at = now(), data_ultimo_contato = now() where id = v_lead_id;
    end if;

    v_action := 'updated';
    insert into leads_automacao_log (lead_nome, lead_id, unidade_nome, evento, acao, detalhes, created_at)
    values (v_log_nome, v_lead_id, p_unidade_id::text, p_source_type, v_action, v_detalhes, now());
    return json_build_object('action', v_action, 'lead_id', v_lead_id);
  end if;

  if p_source_type = 'emusys' then
    insert into leads (nome, telefone, email, unidade_id, emusys_lead_id, curso_interesse_id, canal_origem_id, data_nascimento, etapa_pipeline_id, status, data_contato, created_at, updated_at)
    values (p_nome, p_telefone, p_email, p_unidade_id, p_source_id, v_curso_id, v_canal_id, p_data_nascimento, 1, 'novo', coalesce(p_data_contato, (now() at time zone 'America/Sao_Paulo')::date), now(), now())
    on conflict (telefone, unidade_id) where telefone is not null and arquivado = false
    do update set
      emusys_lead_id = coalesce(excluded.emusys_lead_id, leads.emusys_lead_id),
      nome = coalesce(nullif(excluded.nome, ''), leads.nome),
      email = coalesce(nullif(excluded.email, ''), leads.email),
      curso_interesse_id = coalesce(excluded.curso_interesse_id, leads.curso_interesse_id),
      canal_origem_id = case
        when leads.gclid is not null and leads.canal_origem_id = 3 then leads.canal_origem_id
        when leads.meta_ctwa_clid is not null and leads.canal_origem_id in (1, 2) then leads.canal_origem_id
        else coalesce(excluded.canal_origem_id, leads.canal_origem_id)
      end,
      data_nascimento = coalesce(excluded.data_nascimento, leads.data_nascimento),
      data_contato = coalesce(excluded.data_contato, leads.data_contato),
      updated_at = now(), data_ultimo_contato = now()
    returning id into v_lead_id;
  elsif p_source_type = 'nocodb' then
    insert into leads (nome, telefone, email, unidade_id, nocodb_lead_id, curso_interesse_id, canal_origem_id, data_nascimento, etapa_pipeline_id, status, data_contato, created_at, updated_at)
    values (p_nome, p_telefone, p_email, p_unidade_id, p_source_id, v_curso_id, v_canal_id, p_data_nascimento, 1, 'novo', coalesce(p_data_contato, (now() at time zone 'America/Sao_Paulo')::date), now(), now())
    on conflict (telefone, unidade_id) where telefone is not null and arquivado = false
    do update set
      nocodb_lead_id = coalesce(excluded.nocodb_lead_id, leads.nocodb_lead_id),
      nome = coalesce(nullif(excluded.nome, ''), leads.nome),
      email = coalesce(nullif(excluded.email, ''), leads.email),
      curso_interesse_id = coalesce(excluded.curso_interesse_id, leads.curso_interesse_id),
      canal_origem_id = case
        when leads.gclid is not null and leads.canal_origem_id = 3 then leads.canal_origem_id
        when leads.meta_ctwa_clid is not null and leads.canal_origem_id in (1, 2) then leads.canal_origem_id
        else coalesce(excluded.canal_origem_id, leads.canal_origem_id)
      end,
      data_nascimento = coalesce(excluded.data_nascimento, leads.data_nascimento),
      data_contato = coalesce(excluded.data_contato, leads.data_contato),
      updated_at = now(), data_ultimo_contato = now()
    returning id into v_lead_id;
  elsif p_source_type = 'campanha' then
    insert into leads (nome, telefone, email, unidade_id, curso_interesse_id, canal_origem_id, data_nascimento, etapa_pipeline_id, status, data_contato, created_at, updated_at)
    values (p_nome, p_telefone, p_email, p_unidade_id, v_curso_id, v_canal_id, p_data_nascimento, 1, 'novo', coalesce(p_data_contato, (now() at time zone 'America/Sao_Paulo')::date), now(), now())
    on conflict (telefone, unidade_id) where telefone is not null and arquivado = false
    do update set
      nome = coalesce(nullif(excluded.nome, ''), leads.nome),
      email = coalesce(nullif(excluded.email, ''), leads.email),
      curso_interesse_id = coalesce(excluded.curso_interesse_id, leads.curso_interesse_id),
      canal_origem_id = case
        when leads.gclid is not null and leads.canal_origem_id = 3 then leads.canal_origem_id
        when leads.meta_ctwa_clid is not null and leads.canal_origem_id in (1, 2) then leads.canal_origem_id
        else coalesce(excluded.canal_origem_id, leads.canal_origem_id)
      end,
      data_nascimento = coalesce(excluded.data_nascimento, leads.data_nascimento),
      data_contato = coalesce(excluded.data_contato, leads.data_contato),
      updated_at = now(), data_ultimo_contato = now()
    returning id into v_lead_id;
  end if;

  v_action := 'inserted';
  insert into leads_automacao_log (lead_nome, lead_id, unidade_nome, evento, acao, detalhes, created_at)
  values (v_log_nome, v_lead_id, p_unidade_id::text, p_source_type, v_action, v_detalhes, now());
  return json_build_object('action', v_action, 'lead_id', v_lead_id);
end;
$function$;
create or replace function public.mike_funil_v2(p_ano integer, p_mes integer, p_unidade text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_unidade uuid;
  v_nome text := 'Rede (CG + REC + BARRA)';
  c jsonb;
  v_metas jsonb := '{}'::jsonb;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_fechado boolean;
begin
  if p_ano is null or p_mes is null or p_mes not between 1 and 12 or p_ano not between 2020 and 2100 then
    return jsonb_build_object('ok', false, 'erro', 'periodo_invalido');
  end if;
  if make_date(p_ano, p_mes, 1) > v_hoje then
    return jsonb_build_object('ok', true, 'sem_dado', true, 'motivo', 'competencia_no_futuro');
  end if;
  if p_unidade is not null and btrim(p_unidade) <> '' then
    select u.id, u.nome into v_unidade, v_nome from public.unidades u where u.codigo = upper(btrim(p_unidade));
    if v_unidade is null then
      return jsonb_build_object('ok', false, 'erro', 'unidade_invalida', 'unidades_validas', jsonb_build_array('CG', 'REC', 'BARRA'));
    end if;
    select coalesce(jsonb_object_agg(tipo, valor), '{}'::jsonb) into v_metas
      from public.metas_kpi where unidade_id = v_unidade and ano = p_ano and mes = p_mes;
  end if;

  -- O gate da conciliação reconhece o login real mike_mcp (session_user); nada de marca de service_role.
  c := public.get_kpis_comercial_competencia_v1(v_unidade, p_ano, p_mes);
  if c is null or coalesce((c->>'ok')::boolean, true) = false then
    return jsonb_build_object('ok', false, 'erro', 'fonte_indisponivel');
  end if;
  v_fechado := coalesce((c->>'fechado')::boolean, false);

  return jsonb_build_object(
    'ok', true,
    'escopo', v_nome,
    'competencia', to_char(make_date(p_ano, p_mes, 1), 'MM/YYYY'),
    'fechado', v_fechado,
    'fonte', case
      when v_fechado then 'fechamento oficial do mês (o mesmo do relatório mensal) para leads, experimentais realizadas e confirmadas, matrículas, tickets e taxas; agendadas, canceladas, canais, cursos e ressalvas vêm ao vivo'
      when make_date(p_ano, p_mes, 1) = date_trunc('month', now() at time zone 'America/Sao_Paulo')::date
        then 'ao vivo: o mês ainda não fechou, o número ainda muda (mesma fonte do relatório diário)'
      else 'recalculado ao vivo: esta competência não tem fechamento oficial; não é o número do relatório'
    end,
    'kpis', c->'kpis',
    'metas', case when v_unidade is null then null else jsonb_build_object(
      'leads', v_metas->'leads', 'experimentais_agendadas', v_metas->'experimentais', 'matriculas', v_metas->'matriculas',
      'ticket_parcela', v_metas->'ticket_parcela', 'taxa_lead_exp', v_metas->'taxa_lead_exp',
      'taxa_exp_mat', v_metas->'taxa_exp_mat', 'taxa_lead_mat', v_metas->'taxa_conversao') end,
    'funil', c->'funil',
    'canais_do_mes', coalesce(c->'canais_do_mes', '[]'::jsonb),
    'cursos_do_mes', coalesce(c->'cursos_do_mes', '[]'::jsonb),
    'ressalvas', c->'ressalvas',
    'divergencias', c->'divergencias',
    'definicoes', c->'definicoes',
    'regra_ticket', c->>'regra_ticket',
    'como_ler', jsonb_build_array(
      'Experimentais confirmadas = presença registrada no Emusys (raw comercial, sem remanejamento interno): é o denominador oficial da taxa experimental→matrícula.',
      'A meta de experimentais é de AGENDADAS: não compare com realizadas nem com confirmadas.',
      '"Site" é a landing page que roda no Google e já sai somado dentro do canal "Google" (canal_grupo); o rótulo original segue em canais_originais.',
      'Matrícula por canal ainda não tem vínculo lead→aluno confiável: zero por canal não quer dizer que o canal não matricula.',
      '"Sem canal" é lead sem origem registrada: falha de cadastro, não canal.'
    )
  );
end;
$$;
