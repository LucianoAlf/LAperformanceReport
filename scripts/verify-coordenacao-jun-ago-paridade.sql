-- Auditoria pontual dos documentos informados em 2026-09-09. NAO e migration.
-- Executar o arquivo inteiro: uma fotografia READ ONLY, sem DDL/DML, batches,
-- materializadores, chamadas de IA, tabelas temporarias ou saida nominal.
-- O leitor do painel roda UMA vez por escopo (CTE MATERIALIZED). Nao reexecuta
-- os seis produtores operacionais: prova fonte do painel -> documento exato.
-- Saidas/MRR: uma leitura dos movimentos validos. Comercial: nove documentos
-- fechados referenciados, autoria congelada, sem consultar professor atual.
-- Resultado: ok=false ou falhas nao vazias bloqueiam a alegacao de paridade.
-- Este teste NAO autoriza publicacao/premiacao e NAO decide a politica D+30.
-- Baseline dos oito dominios = captura inicial DESTA auditoria, nao pre-fix.
-- Alvos retificados pela regularizacao D+30 commit 2026-09-09 17:38:40 UTC.
-- Preserva os 80 checks originais e acrescenta checks de linhagem/governanca.
-- Evidencia RO 2026-09-09 17:42:54 UTC: 119/119 (80 baseline + 39 D30),
-- falhas=[], 117 clones/702 metricas identicas, 720 metricas painel/documento,
-- comparaveis Cons/CG/Barra/Rec=43/31/19/24, ranking=0, oito dominios preservados.

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '45s';
SET LOCAL lock_timeout = '2s';

WITH alvos(escopo, doc_id, unidade, versao_esperada, professores_esperados,
           conversao_esperada, hash_esperado, comparaveis_esperados,
           anterior_id_esperado, anterior_versao_esperada, anterior_hash_esperado) AS (VALUES
  ('Consolidado', 'a264b7be-82cb-4fe8-a282-f821fdb4e5b4'::uuid, NULL::uuid,
   13,44,28,'26a4e12e5f07bef97f9bf142a2081a53e4bc8afc6dbfa13a41d71f961a1d1478',43,
   '8d7c1ae8-8596-4fce-9012-86714c617070'::uuid,12,
   'fe85fc8292ddc6e7858d2a89728c467df5e6a0a5bf8c440a18815421b884e29a'),
  ('Campo Grande','8df93698-7632-42bb-b430-71cf8eae7a41'::uuid,
   '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid,
   13,32,15,'d2bdc1cef444afacd12b775dbfb615e544ed3eab8d270d95d59b8aeafdde3b84',31,
   'e9e740d2-3ace-4fc8-ae1c-0210f8d3d0f5'::uuid,12,
   'ab02a94d2030c07d0f74d6adc99585ccd688a1ba38080c8f623284b3fdcf13b4'),
  ('Barra','7d731242-3176-4ff4-a00c-7da0e40fda5a'::uuid,
   '368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid,
   11,20,10,'bb90ef4695c8494712477c31ef49d7ab2efe640027b70f6d60f8c94904541224',19,
   '655d8f97-eb9b-4c10-bb8c-c7f2414554a3'::uuid,10,
   'b5bd0081f390287bb59bd697e1b84031bf5eb5d0d429f4e99932b0f851a2363a'),
  ('Recreio','91e2a644-75d3-47ca-8d7a-beda36103cac'::uuid,
   '95553e96-971b-4590-a6eb-0201d013c14d'::uuid,
   11,24,16,'c7ba0b8d76f5f477daedbe1acb74c021a414a378cc72577f6c1f346165418beb',24,
   'c2e67faa-951d-40c5-bbd1-7e42f31327c8'::uuid,10,
   '108d507a5a5466c2cde83f7a4843244045c3cae80da422c8bdf525236087f3c1')
), docs AS MATERIALIZED (
  SELECT a.*, s.id AS encontrado, s.versao, s.status, s.payload, s.payload_hash,
    s.unidade_id, s.ano, s.mes, s.dominio,
    anterior.id AS anterior_id, anterior.versao AS anterior_versao,
    anterior.payload AS anterior_payload, anterior.payload_hash AS anterior_hash
  FROM alvos a LEFT JOIN public.fechamento_mensal_snapshots s ON s.id=a.doc_id
  LEFT JOIN public.fechamento_mensal_snapshots anterior
    ON anterior.id = (s.payload#>>'{documento,supersede_id}')::uuid
), painel AS MATERIALIZED (
  SELECT d.doc_id, p.* FROM docs d
  CROSS JOIN LATERAL public.get_health_score_professor_v3_performance_snapshot_v3(
    DATE '2026-08-01', d.unidade, 'ciclo') p
  WHERE d.encontrado IS NOT NULL
), professores_doc AS MATERIALIZED (
  SELECT d.doc_id, (p->>'professor_id')::integer AS professor_id, p
  FROM docs d CROSS JOIN LATERAL jsonb_array_elements(d.payload->'professores') p
), metricas_doc AS MATERIALIZED (
  SELECT d.doc_id,d.professor_id,m.key AS metrica,m.value AS m
  FROM professores_doc d CROSS JOIN LATERAL jsonb_each(d.p->'metricas') m
), metricas_fonte AS MATERIALIZED (
  SELECT p.doc_id,p.professor_id,p.metrica,
    jsonb_build_object(
      'valor',p.valor_bruto,'valor_bruto',p.valor_bruto,
      'numerador',p.numerador,'denominador',p.denominador,'nota',p.nota,
      'amostra',p.amostra,'meta',p.meta,'peso_original',p.peso,
      'peso_efetivo',p.peso_efetivo,'papel',p.papel,
      'codigo_evidencia',p.codigo_evidencia,'estado_base',p.estado_base,
      'confianca',p.confianca,'fonte',p.fonte,
      'regra_versao',p.regra_versao_metrica,'motivo',p.motivo_sem_base,
      'detalhes',p.detalhes
    ) || CASE WHEN p.metrica='numero_alunos' THEN jsonb_build_object(
      'peso',p.peso,'peso_disponivel',p.peso_disponivel,
      'publicavel',p.metrica_publicavel,'contribuicao',p.contribuicao,
      'motivo_sem_base',p.motivo_sem_base) ELSE '{}'::jsonb END AS m
  FROM painel p
), pares_metricas AS MATERIALIZED (
  SELECT coalesce(f.doc_id,d.doc_id) AS doc_id,
    coalesce(f.professor_id,d.professor_id) AS professor_id,
    coalesce(f.metrica,d.metrica) AS metrica, f.m AS fonte,d.m AS documento
  FROM metricas_fonte f FULL JOIN metricas_doc d USING(doc_id,professor_id,metrica)
), campos_divergentes AS MATERIALIZED (
  SELECT p.doc_id,p.metrica,c.key AS campo,count(*) AS divergencias
  FROM pares_metricas p CROSS JOIN LATERAL jsonb_each(p.fonte) c
  WHERE c.value IS DISTINCT FROM p.documento->c.key
  GROUP BY p.doc_id,p.metrica,c.key
), professores_fonte AS MATERIALIZED (
  SELECT DISTINCT p.doc_id,p.professor_id,p.score_comparavel,
    p.comparabilidade_estado,p.estado_publicacao,p.ranking_habilitado,
    jsonb_build_object(
      'score',p.score_observado,'score_observado',p.score_observado,
      'score_comparavel',p.score_comparavel,'cobertura',p.cobertura_normalizada,
      'classificacao',p.classificacao,'estado_publicacao',p.estado_publicacao,
      'score_exibivel',p.score_exibivel,'ranking_habilitado',p.ranking_habilitado,
      'pilares_validos',p.pilares_validos,'pilares_esperados',p.pilares_esperados,
      'comparabilidade_estado',p.comparabilidade_estado,
      'comparabilidade_motivo',coalesce(p.comparabilidade_motivo,'fonte_canonica_indisponivel'),
      'estado_evidencia',p.comparabilidade_estado,
      'competencia_referencia',p.competencia_referencia,
      'score_referencia',p.score_referencia,'classificacao_referencia',p.classificacao_referencia,
      'auditoria_health_score',jsonb_build_object(
        'data_corte',p.data_corte,'config_id',p.config_id,
        'regra_fingerprint',p.regra_fingerprint,
        'peso_pontuavel_total',p.peso_pontuavel_total,
        'peso_disponivel_total',p.peso_disponivel_total,
        'cobertura_normalizada',p.cobertura_normalizada,
        'cobertura_minima_aplicada',p.cobertura_minima_aplicada,
        'comparabilidade_motivos',p.comparabilidade_motivos)) AS p
  FROM painel p
), ranking_doc AS MATERIALIZED (
  SELECT d.doc_id,(r->>'professor_id')::integer AS professor_id,
    (r->>'score')::numeric AS score
  FROM docs d CROSS JOIN LATERAL jsonb_array_elements(d.payload->'ranking_oficial') r
), ranking_fonte AS (
  SELECT doc_id,professor_id,score_comparavel AS score FROM professores_fonte
  WHERE comparabilidade_estado='comparavel' AND score_comparavel IS NOT NULL
    AND estado_publicacao='oficial' AND ranking_habilitado
), ranking_diff AS (
  SELECT coalesce(f.doc_id,d.doc_id) AS doc_id
  FROM ranking_fonte f FULL JOIN ranking_doc d USING(doc_id,professor_id)
  WHERE f.professor_id IS NULL OR d.professor_id IS NULL OR f.score IS DISTINCT FROM d.score
), refs AS MATERIALIZED (
  SELECT d.doc_id,r FROM docs d
  CROSS JOIN LATERAL jsonb_array_elements(d.payload#>'{origens,matriculas}') r
), comerciais AS MATERIALIZED (
  SELECT DISTINCT s.id,s.unidade_id,s.ano,s.mes,s.versao,s.payload,s.payload_hash
  FROM refs r JOIN public.fechamento_mensal_snapshots s
    ON s.id=(r.r->>'documento_id')::uuid
), matriculas AS MATERIALIZED (
  SELECT c.id AS origem_id,c.unidade_id,
    (m->>'professor_experimental_id_fechado')::integer AS professor_id,
    m ? 'professor_experimental_id_fechado' AS autoria_congelada
  FROM comerciais c CROSS JOIN LATERAL jsonb_array_elements(c.payload->'matriculas') m
), comercial_prof AS MATERIALIZED (
  SELECT d.doc_id,m.professor_id,count(*) AS total
  FROM docs d JOIN matriculas m ON d.unidade IS NULL OR d.unidade=m.unidade_id
  GROUP BY d.doc_id,m.professor_id
), movimentos AS MATERIALIZED (
  SELECT m.unidade_id,m.tipo,
    coalesce(m.valor_parcela_evasao,m.valor_parcela_anterior)::numeric AS valor_mrr,
    coalesce(ms.conta_score_professor,false) AS atribuivel
  FROM public.movimentacoes_admin m
  LEFT JOIN public.alunos a ON a.id=m.aluno_id
  LEFT JOIN LATERAL (
    SELECT motivo.conta_score_professor FROM public.motivos_saida motivo
    WHERE motivo.ativo IS TRUE AND (motivo.id=m.motivo_saida_id OR
      (m.motivo_saida_id IS NULL AND m.motivo IS NOT NULL
       AND lower(btrim(motivo.nome))=lower(btrim(m.motivo))))
    ORDER BY CASE WHEN motivo.id=m.motivo_saida_id THEN 0 ELSE 1 END,motivo.id LIMIT 1
  ) ms ON true
  WHERE m.tipo IN ('evasao','nao_renovacao')
    AND m.data BETWEEN DATE '2026-06-01' AND DATE '2026-08-31'
    AND public.is_movimentacao_admin_retencao_valida(m.id)
    AND coalesce(m.anulado,false)=false AND coalesce(a.is_segundo_curso,false)=false
), financeiro AS MATERIALIZED (
  SELECT d.doc_id,jsonb_build_object(
    'evasoes_validas',count(*) FILTER(WHERE m.tipo='evasao'),
    'nao_renovacoes_validas',count(*) FILTER(WHERE m.tipo='nao_renovacao'),
    'saidas_validas_total',count(*),
    'saidas_atribuiveis_professor',count(*) FILTER(WHERE m.atribuivel),
    'mrr_perdido_total',CASE WHEN count(*)=0 THEN 0 ELSE sum(m.valor_mrr) END,
    'mrr_perdido_atribuivel',CASE WHEN count(*) FILTER(WHERE m.atribuivel)=0
      THEN 0 ELSE sum(m.valor_mrr) FILTER(WHERE m.atribuivel) END,
    'valores_mrr_pendentes',count(*) FILTER(WHERE m.valor_mrr IS NULL),
    'valores_mrr_atribuiveis_pendentes',count(*) FILTER(WHERE m.atribuivel AND m.valor_mrr IS NULL)
  ) AS totais
  FROM docs d JOIN movimentos m ON d.unidade IS NULL OR d.unidade=m.unidade_id
  GROUP BY d.doc_id
), dominios_baseline(dominio,quantidade,digest) AS (VALUES
  ('alunos_admin',13,'d4a086c608df721cf7e477fec905989f'),
  ('alunos_executivo',24,'49d9c28451a493d49a9f721ea7d2753e'),
  ('comercial',13,'a78cca71a0d486d8523302365572378a'),
  ('programa_fideliza',11,'4b2d6875f044ae6815ee5c70fbeb4c42'),
  ('programa_matriculador',9,'3d90484173b390c4fa0fa2f5b88d3eb9'),
  ('relatorio_admin_mensal',19,'e344236e5c8f2bd3424305f9983087f5'),
  ('relatorio_comercial_mensal',18,'5af0202b70d70776a5b54b93ed43f14a'),
  ('relatorio_gerencial',22,'0e7d65ce036db6cca0d6e4debfe59b2f')
), dominios AS MATERIALIZED (
  SELECT b.dominio,b.quantidade,b.digest,count(s.id) AS quantidade_atual,
    md5(string_agg(s.id::text||s.payload_hash,',' ORDER BY s.id)) AS digest_atual,
    count(*) FILTER(WHERE s.payload_hash IS DISTINCT FROM public.hash_jsonb_canonico(s.payload))
      AS hashes_invalidos
  FROM dominios_baseline b LEFT JOIN public.fechamento_mensal_snapshots s
    ON s.dominio=b.dominio AND s.ano=2026 AND s.mes BETWEEN 6 AND 8
  GROUP BY b.dominio,b.quantidade,b.digest
), checks_baseline AS MATERIALIZED (
  SELECT d.escopo,c.teste,coalesce(c.ok,false) AS ok FROM docs d
  CROSS JOIN LATERAL (VALUES
    ('documento_exato_hash_versao', d.encontrado IS NOT NULL
      AND d.versao=d.versao_esperada AND d.status='retificado'
      AND d.payload_hash=d.hash_esperado
      AND d.payload_hash=public.hash_jsonb_canonico(d.payload-'documento')
      AND d.payload#>>'{documento,hash}'=d.payload_hash
      AND d.payload#>>'{documento,id}'=d.doc_id::text
      AND (d.payload#>>'{documento,versao}')::integer=d.versao),
    ('escopo_periodo',d.unidade_id IS NOT DISTINCT FROM d.unidade
      AND d.ano=2026 AND d.mes=6 AND d.dominio='relatorio_coordenacao_ciclo'
      AND d.payload#>>'{periodo,inicio}'='2026-06-01'
      AND d.payload#>>'{periodo,fim}'='2026-08-31'
      AND d.payload#>>'{periodo,data_corte}'='2026-08-31'),
    ('versao_ainda_mais_recente',NOT EXISTS (
      SELECT 1 FROM public.fechamento_mensal_snapshots s
      WHERE s.ano=2026 AND s.mes=6 AND s.dominio=d.dominio
        AND s.unidade_id IS NOT DISTINCT FROM d.unidade AND s.versao>d.versao)),
    ('anterior_integro_presente',d.anterior_id IS NOT NULL AND d.anterior_versao<d.versao
      AND d.anterior_hash=public.hash_jsonb_canonico(d.anterior_payload-'documento')),
    ('financeiro_comercial_iguais_versao_anterior',
      d.payload->'saidas_retencao' IS NOT DISTINCT FROM d.anterior_payload->'saidas_retencao'
      AND d.payload->'matriculas_comerciais' IS NOT DISTINCT FROM d.anterior_payload->'matriculas_comerciais'
      AND d.payload#>'{origens,matriculas}' IS NOT DISTINCT FROM d.anterior_payload#>'{origens,matriculas}'),
    ('roster_contagem_sem_duplicados',
      (SELECT count(*)=d.professores_esperados AND count(DISTINCT professor_id)=d.professores_esperados
       FROM professores_doc p WHERE p.doc_id=d.doc_id)
      AND (SELECT count(*)=d.professores_esperados AND count(DISTINCT professor_id)=d.professores_esperados
       FROM professores_fonte p WHERE p.doc_id=d.doc_id)),
    ('ids_professores_exatos',NOT EXISTS (
      SELECT 1 FROM (SELECT professor_id FROM professores_doc WHERE doc_id=d.doc_id) x
      FULL JOIN (SELECT professor_id FROM professores_fonte WHERE doc_id=d.doc_id) y USING(professor_id)
      WHERE x.professor_id IS NULL OR y.professor_id IS NULL)),
    ('score_estado_cobertura_config',NOT EXISTS (
      SELECT 1 FROM professores_fonte f JOIN professores_doc p USING(doc_id,professor_id)
      CROSS JOIN LATERAL jsonb_each(f.p) campo
      WHERE f.doc_id=d.doc_id AND campo.value IS DISTINCT FROM p.p->campo.key)),
    ('seis_metricas_por_professor_sem_duplicados',
      (SELECT count(*)=d.professores_esperados*6
        AND count(DISTINCT (professor_id,metrica))=d.professores_esperados*6
        AND bool_and(metrica=ANY(ARRAY['presenca','conversao','numero_alunos','media_turma','retencao','permanencia']))
       FROM metricas_doc WHERE doc_id=d.doc_id)
      AND (SELECT count(*)=d.professores_esperados*6
        AND count(DISTINCT (professor_id,metrica))=d.professores_esperados*6
       FROM metricas_fonte WHERE doc_id=d.doc_id)),
    ('ids_metricas_exatos',NOT EXISTS (SELECT 1 FROM pares_metricas p
      WHERE p.doc_id=d.doc_id AND (p.fonte IS NULL OR p.documento IS NULL))),
    ('valores_amostras_pesos_detalhes_exatos',NOT EXISTS (
      SELECT 1 FROM campos_divergentes c WHERE c.doc_id=d.doc_id)),
    ('ranking_ids_scores_exatos_sem_duplicados',
      NOT EXISTS (SELECT 1 FROM ranking_diff r WHERE r.doc_id=d.doc_id)
      AND (SELECT count(*)=count(DISTINCT professor_id) FROM ranking_doc WHERE doc_id=d.doc_id)),
    ('counter_conversao_peso_positivo',
      (d.payload#>>'{experimentais,professores_conversao_pontuando}')::integer=d.conversao_esperada
      AND (SELECT count(*)=d.conversao_esperada FROM painel p
        WHERE p.doc_id=d.doc_id AND p.metrica='conversao' AND p.peso_efetivo>0)),
    ('conversao_totais_observados',
      (SELECT sum(numerador)=(d.payload#>>'{experimentais,matriculas_pos_experimental}')::numeric
        AND sum(denominador)=(d.payload#>>'{experimentais,experimentais_confirmadas}')::numeric
       FROM painel p WHERE p.doc_id=d.doc_id AND p.metrica='conversao')),
    ('fontes_comerciais_completas',
      (SELECT count(*)=CASE WHEN d.unidade IS NULL THEN 9 ELSE 3 END
       AND count(DISTINCT r->>'documento_id')=count(*) FROM refs WHERE doc_id=d.doc_id)
      AND NOT EXISTS (SELECT 1 FROM refs r LEFT JOIN comerciais c ON c.id=(r.r->>'documento_id')::uuid
        WHERE r.doc_id=d.doc_id AND (c.id IS NULL OR c.payload_hash IS DISTINCT FROM r.r->>'hash'
          OR c.versao IS DISTINCT FROM (r.r->>'versao')::integer
          OR c.payload_hash IS DISTINCT FROM public.hash_jsonb_canonico(c.payload)
          OR c.unidade_id IS DISTINCT FROM (r.r->>'unidade_id')::uuid
          OR make_date(c.ano,c.mes,1) IS DISTINCT FROM (r.r->>'competencia')::date
          OR jsonb_array_length(c.payload->'matriculas') IS DISTINCT FROM (r.r->>'matriculas')::integer
          OR EXISTS (SELECT 1 FROM public.fechamento_mensal_snapshots n
            WHERE n.ano=c.ano AND n.mes=c.mes AND n.unidade_id=c.unidade_id
              AND n.dominio='relatorio_comercial_mensal' AND n.versao>c.versao
              AND n.status IN ('preview','aprovado','fechado','retificado'))))),
    ('comercial_totais_autoria_fechada',
      (SELECT count(*)=(d.payload#>>'{matriculas_comerciais,matriculas_total}')::integer
        AND count(professor_id)=(d.payload#>>'{matriculas_comerciais,matriculas_atribuidas_professor}')::integer
        AND count(*) FILTER(WHERE professor_id IS NULL)=(d.payload#>>'{matriculas_comerciais,matriculas_sem_professor}')::integer
        AND bool_and(autoria_congelada) FROM matriculas m
       WHERE d.unidade IS NULL OR d.unidade=m.unidade_id)),
    ('comercial_por_professor_exato',NOT EXISTS (
      SELECT 1 FROM professores_doc p LEFT JOIN comercial_prof c USING(doc_id,professor_id)
      WHERE p.doc_id=d.doc_id AND (p.p#>>'{operacional,matriculas_comerciais}')::integer
        IS DISTINCT FROM coalesce(c.total,0))),
    ('financeiro_saidas_mrr_pendencias_exatos',EXISTS (
      SELECT 1 FROM financeiro f WHERE f.doc_id=d.doc_id)
      AND NOT EXISTS (SELECT 1 FROM financeiro f CROSS JOIN LATERAL jsonb_each(f.totais) c
        WHERE f.doc_id=d.doc_id AND c.value IS DISTINCT FROM d.payload->'saidas_retencao'->c.key))
  ) c(teste,ok)
  UNION ALL
  SELECT 'Outros dominios',dominio||':baseline_desta_auditoria',
    quantidade=quantidade_atual AND digest=digest_atual AND hashes_invalidos=0 FROM dominios
), mapa_clones AS MATERIALIZED (
  SELECT d.doc_id,(j->>'professor_id')::integer professor_id,
    (j->>'id')::uuid novo_id,(j->>'anterior_id')::uuid antigo_id
  FROM docs d CROSS JOIN LATERAL jsonb_array_elements(d.payload#>'{governanca_d30,snapshots}') j
), clones AS MATERIALIZED (
  SELECT m.*,n.id AS novo_encontrado,o.id AS antigo_encontrado,
    to_jsonb(n) AS novo,to_jsonb(o) AS antigo,
    n.unidade_id,n.professor_id AS professor_novo,o.professor_id AS professor_antigo,
    n.snapshot_anterior_id
  FROM mapa_clones m
  LEFT JOIN public.health_score_professor_v3_snapshots n ON n.id=m.novo_id
  LEFT JOIN public.health_score_professor_v3_snapshots o ON o.id=m.antigo_id
), metricas_novas AS MATERIALIZED (
  SELECT c.doc_id,c.novo_id,m.metrica,to_jsonb(m)-ARRAY['id','snapshot_id'] AS nova
  FROM clones c JOIN public.health_score_professor_v3_snapshot_metricas m ON m.snapshot_id=c.novo_id
), metricas_antigas AS MATERIALIZED (
  SELECT c.doc_id,c.novo_id,m.metrica,to_jsonb(m)-ARRAY['id','snapshot_id'] AS antiga
  FROM clones c JOIN public.health_score_professor_v3_snapshot_metricas m ON m.snapshot_id=c.antigo_id
), metricas_clones AS MATERIALIZED (
  SELECT coalesce(n.doc_id,o.doc_id) AS doc_id,coalesce(n.novo_id,o.novo_id) AS novo_id,
    coalesce(n.metrica,o.metrica) AS metrica,n.nova,o.antiga
  FROM metricas_novas n FULL JOIN metricas_antigas o USING(doc_id,novo_id,metrica)
), checks_d30 AS MATERIALIZED (
  SELECT d.escopo,c.teste,coalesce(c.ok,false) AS ok FROM docs d
  CROSS JOIN LATERAL (VALUES
    ('anterior_exato_congelado',d.anterior_id=d.anterior_id_esperado
      AND d.anterior_versao=d.anterior_versao_esperada AND d.anterior_hash=d.anterior_hash_esperado
      AND d.anterior_hash=public.hash_jsonb_canonico(d.anterior_payload-'documento')
      AND d.anterior_payload#>>'{documento,hash}'=d.anterior_hash
      AND d.anterior_payload#>>'{documento,id}'=d.anterior_id::text
      AND d.anterior_payload#>>'{documento,status}'='retificado'),
    ('conteudo_anterior_preservado_exceto_governanca',
      (d.payload-ARRAY['documento','periodo','professores','resumo_equipe','ranking_oficial','governanca_d30'])
        IS NOT DISTINCT FROM
      (d.anterior_payload-ARRAY['documento','periodo','professores','resumo_equipe','ranking_oficial','governanca_d30'])
      AND d.payload->'periodo' IS NOT DISTINCT FROM ((d.anterior_payload->'periodo') ||
        '{"publicacao_oficial":false,"ranking_habilitado":false,"ciclo_estado":"em_fechamento","estado_publicacao":"ciclo_em_acompanhamento"}'::jsonb)
      AND d.payload->'resumo_equipe' IS NOT DISTINCT FROM ((d.anterior_payload->'resumo_equipe') ||
        jsonb_build_object('oficiais',0,'parciais',d.comparaveis_esperados))
      AND d.payload->'professores' IS NOT DISTINCT FROM (SELECT jsonb_agg(
        CASE WHEN p->>'estado_publicacao'='oficial'
        THEN p || '{"estado_publicacao":"parcial","ranking_habilitado":false}'::jsonb
        ELSE p || '{"ranking_habilitado":false}'::jsonb END ORDER BY ord)
        FROM jsonb_array_elements(d.anterior_payload->'professores') WITH ORDINALITY a(p,ord))),
    ('clones_ids_escopo_exatos',
      (SELECT count(*)=d.comparaveis_esperados AND count(DISTINCT novo_id)=d.comparaveis_esperados
        AND count(DISTINCT antigo_id)=d.comparaveis_esperados
        AND count(DISTINCT professor_id)=d.comparaveis_esperados
        AND bool_and(novo_encontrado IS NOT NULL AND antigo_encontrado IS NOT NULL
          AND snapshot_anterior_id=antigo_id AND professor_novo=professor_id AND professor_antigo=professor_id
          AND unidade_id IS NOT DISTINCT FROM d.unidade
          AND (antigo->>'unidade_id')::uuid IS NOT DISTINCT FROM d.unidade)
       FROM clones c WHERE c.doc_id=d.doc_id)
      AND NOT EXISTS (SELECT 1 FROM painel p LEFT JOIN clones c
        ON c.doc_id=p.doc_id AND c.novo_id=p.retrato_execucao_id AND c.professor_id=p.professor_id
        WHERE p.doc_id=d.doc_id AND p.comparabilidade_estado='comparavel' AND c.novo_id IS NULL)),
    ('117_historicos_invalidacao_formal',NOT EXISTS (
      SELECT 1 FROM clones c WHERE c.doc_id=d.doc_id AND NOT coalesce(
        c.antigo @> '{"estado":"invalidado","publicado":true,"publicavel":false,"ranking_habilitado":false,"estado_publicacao":"oficial"}'::jsonb
        AND c.antigo->>'invalidado_em' IS NOT NULL,false))),
    ('117_clones_parciais_sem_recalculo',NOT EXISTS (
      SELECT 1 FROM clones c WHERE c.doc_id=d.doc_id AND (
        NOT coalesce(c.novo @> '{"estado":"em_maturacao","estado_publicacao":"parcial","publicado":false,"publicavel":false,"ranking_habilitado":false,"score_exibivel":true}'::jsonb,false)
        OR c.novo->>'invalidado_em' IS NOT NULL
        OR (c.novo-ARRAY['id','revisao','estado','publicado','publicavel','ranking_habilitado','estado_publicacao',
             'snapshot_anterior_id','justificativa_retificacao','motivo_bloqueio','criado_em','criado_por','fechado_em','invalidado_em'])
          IS DISTINCT FROM
           (c.antigo-ARRAY['id','revisao','estado','publicado','publicavel','ranking_habilitado','estado_publicacao',
             'snapshot_anterior_id','justificativa_retificacao','motivo_bloqueio','criado_em','criado_por','fechado_em','invalidado_em'])
        OR (c.novo->>'revisao')::integer <= (c.antigo->>'revisao')::integer))),
    ('702_metricas_clone_identicas_inclusive_criado_em',
      (SELECT count(*)=d.comparaveis_esperados*6
        AND count(DISTINCT (novo_id,metrica))=d.comparaveis_esperados*6
        AND bool_and(nova IS NOT NULL AND antiga IS NOT NULL AND nova=antiga)
       FROM metricas_clones WHERE doc_id=d.doc_id)),
    ('comparaveis_diagnostico_43_31_19_24',
      (SELECT count(*)=d.comparaveis_esperados FROM professores_fonte p
        WHERE p.doc_id=d.doc_id AND p.comparabilidade_estado='comparavel' AND p.score_comparavel IS NOT NULL)
      AND (SELECT count(*)=d.comparaveis_esperados FROM professores_doc p
        WHERE p.doc_id=d.doc_id AND p.p->>'comparabilidade_estado'='comparavel'
          AND p.p->>'estado_publicacao'='parcial' AND p.p->>'score_exibivel'='true')
      AND (d.payload#>>'{resumo_equipe,comparaveis}')::integer=d.comparaveis_esperados),
    ('documento_painel_sem_oficial_sem_ranking',
      d.payload#>'{periodo,publicacao_oficial}'='false'::jsonb
      AND d.payload#>'{periodo,ranking_habilitado}'='false'::jsonb
      AND d.payload->'ranking_oficial'='[]'::jsonb
      AND (d.payload#>>'{resumo_equipe,oficiais}')::integer=0
      AND NOT EXISTS(SELECT 1 FROM painel p WHERE p.doc_id=d.doc_id
        AND (p.publicado OR p.snapshot_publicavel OR p.ranking_habilitado OR p.estado_publicacao='oficial'))
      AND NOT EXISTS(SELECT 1 FROM professores_doc p WHERE p.doc_id=d.doc_id
        AND (p.p->>'estado_publicacao'='oficial' OR p.p->>'ranking_habilitado' IS DISTINCT FROM 'false'))),
    ('trilha_d30_hashes_anteriores',
      d.payload#>>'{governanca_d30,contrato}'='coordenacao-jun-ago-2026-d30-v1'
      AND d.payload#>>'{governanca_d30,documento_anterior_id}'=d.anterior_id_esperado::text
      AND d.payload#>>'{governanca_d30,documento_anterior_hash}'=d.anterior_hash_esperado
      AND d.payload#>>'{governanca_d30,oficial_a_partir_de}'='2026-09-30'
      AND d.payload#>'{governanca_d30,metricas_recalculadas}'='false'::jsonb)
  ) c(teste,ok)
  UNION ALL
  SELECT 'D30 global','totais_117_702_4',
    (SELECT count(*)=117 AND count(DISTINCT novo_id)=117 AND count(DISTINCT antigo_id)=117 FROM clones)
    AND (SELECT count(*)=702 FROM metricas_clones)
    AND (SELECT count(*)=4 FROM docs WHERE encontrado IS NOT NULL)
  UNION ALL
  SELECT 'D30 global','ciclo_sem_oficial_antes_d30',
    (SELECT count(*)=1 AND bool_and(estado='em_fechamento' AND NOT publicacao_oficial AND NOT ranking_habilitado
       AND data_fim+30=DATE '2026-09-30')
     FROM public.health_score_professor_v3_ciclos WHERE codigo='2026-JUN-AGO')
    AND NOT EXISTS (SELECT 1 FROM public.health_score_professor_v3_snapshots s
      WHERE s.periodicidade='ciclo' AND s.ciclo_codigo='2026-JUN-AGO' AND s.invalidado_em IS NULL
        AND (s.publicado OR s.ranking_habilitado OR s.estado_publicacao='oficial'))
  UNION ALL
  SELECT 'D30 global','dois_gates_d30_timezone_local_e_frescor_closer',
    (SELECT count(*)=2 AND bool_and(position('if current_date < v_ciclo.data_fim + 30 then' in p.prosrc)>0
      AND EXISTS(SELECT 1 FROM unnest(p.proconfig) cfg WHERE lower(cfg)='timezone=america/sao_paulo')
      AND (p.proname<>'fechar_health_score_professor_v3_ciclo'
        OR position('HEALTH_SCORE_V3_D30_FONTE_DESATUALIZADA' in p.prosrc)>0))
     FROM pg_proc p WHERE p.oid IN (
       'public.fechar_health_score_professor_v3_ciclo(text,text)'::regprocedure,
       'public.retificar_coordenacao_jun_ago_2026()'::regprocedure))
), checks AS MATERIALIZED (
  SELECT * FROM checks_baseline UNION ALL SELECT * FROM checks_d30
), resumo AS (
  SELECT d.escopo,d.doc_id,d.versao,d.payload_hash,
    (SELECT count(*) FROM professores_doc p WHERE p.doc_id=d.doc_id) AS professores,
    (SELECT count(*) FROM metricas_doc p WHERE p.doc_id=d.doc_id) AS metricas,
    (SELECT count(*) FROM ranking_doc p WHERE p.doc_id=d.doc_id) AS ranking,
    (SELECT count(*) FROM professores_fonte p WHERE p.doc_id=d.doc_id AND p.comparabilidade_estado='comparavel') AS comparaveis,
    (SELECT count(*) FROM clones c WHERE c.doc_id=d.doc_id) AS clones,
    (SELECT count(*) FROM metricas_clones c WHERE c.doc_id=d.doc_id AND c.nova=c.antiga) AS metricas_clone_identicas,
    d.anterior_id,d.anterior_versao,d.anterior_hash,
    (SELECT md5(string_agg(professor_id::text,',' ORDER BY professor_id))
      FROM professores_doc p WHERE p.doc_id=d.doc_id) AS ids_doc_digest,
    (SELECT md5(string_agg(professor_id::text,',' ORDER BY professor_id))
      FROM professores_fonte p WHERE p.doc_id=d.doc_id) AS ids_fonte_digest,
    d.payload#>'{experimentais,professores_conversao_pontuando}' AS conversao_pontuando,
    d.payload->'matriculas_comerciais' AS comercial,
    f.totais AS financeiro_fonte,
    (SELECT count(*) FROM campos_divergentes c WHERE c.doc_id=d.doc_id) AS campos_metricas_divergentes
  FROM docs d LEFT JOIN financeiro f USING(doc_id)
)
SELECT jsonb_build_object(
  'capturado_em',transaction_timestamp(),
  'somente_leitura',current_setting('transaction_read_only'),
  'ok',(SELECT bool_and(ok) FROM checks),
  'verificacoes',(SELECT count(*) FROM checks),
  'verificacoes_baseline',(SELECT count(*) FROM checks_baseline),
  'baseline_aprovadas',(SELECT count(*) FROM checks_baseline WHERE ok),
  'verificacoes_d30',(SELECT count(*) FROM checks_d30),
  'd30_aprovadas',(SELECT count(*) FROM checks_d30 WHERE ok),
  'falhas',coalesce((SELECT jsonb_agg(jsonb_build_object('escopo',escopo,'teste',teste))
                    FROM checks WHERE NOT ok),'[]'::jsonb),
  'escopos',(SELECT jsonb_agg(to_jsonb(r) ORDER BY escopo) FROM resumo r),
  'divergencias_metricas_sem_pii',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'escopo',d.escopo,'metrica',c.metrica,'campo',c.campo,'quantidade',c.divergencias))
      FROM campos_divergentes c JOIN docs d USING(doc_id)),'[]'::jsonb),
  'outros_dominios_baseline_desta_auditoria',(SELECT jsonb_agg(to_jsonb(d)) FROM dominios d),
  'limites','Paridade com leitor do painel; sem recomputar seis fontes operacionais; baseline dos oito dominios capturada nesta auditoria, nao antes das retificacoes; nao decide D+30 ou autoriza publicacao'
) AS verificacao;

ROLLBACK;
