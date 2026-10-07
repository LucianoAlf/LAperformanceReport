-- 2026-10-05 — Decisao do Alf (05/10): "ausente" AUTOMATICO do Emusys
-- (registro_presenca 'pendente'/null = ninguem marcou) NAO conta — nem falta,
-- nem denominador. Vale: lancamento humano no LA Report + falta LANÇADA no
-- Emusys (ausente + registro='registrado', item 3). Periodos congelados
-- (jun/jul, decisao Alf 18/08 "congelados como estao") NAO sao tocados.
--
-- Mecanica: nova versao da politica por unidade cobrindo 01/08->2099 com
-- ausencia_emusys_resultado='indeterminado'; a semantica ganha ramo proprio
-- para registro='registrado' (falta lancada continua falta_confirmada,
-- independente da politica — e um lancamento humano feito DENTRO do Emusys).

-- 1) encerra a regua corrente (18/08) e instala a nova, por unidade
update public.presenca_politicas_confiabilidade
   set ativa = false
 where ativa = true
   and regra_versao = 'presenca-politica-emusys-manda-20260818-v1'
   and data_inicio = '2026-08-01'::date;

insert into public.presenca_politicas_confiabilidade
  (unidade_id, data_inicio, data_fim, ausencia_emusys_resultado,
   exige_revisao_operacional, decidido_em, decidido_por, evidencia,
   regra_versao, ativa)
select u.id, '2026-08-01'::date, '2099-12-31'::date, 'indeterminado',
       false, '2026-10-05'::timestamptz, 'Alf',
       'Decisao Alf 2026-10-05: ausente automatico do Emusys (registro_presenca pendente/null) nao e falta nem denominador — so vale lancamento humano. Com registro_presenca (v1.8.2) da para separar; ausente+registrado segue falta_confirmada.',
       'presenca-politica-registro-emusys-20261005-v1', true
  from public.unidades u
 where u.id in ('368d47f5-2d88-4475-bc14-ba084a9a348e',
                '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
                '95553e96-971b-4590-a6eb-0201d013c14d');

-- 2) semantica: ramo registrado antes da politica (falta lancada = falta),
--    fundamento proprio para o caso, coluna registro ja exposta
create or replace view public.vw_aluno_presenca_semantica_v1 as
 WITH evidencia AS NOT MATERIALIZED (
         SELECT ap.id,
            ap.aluno_id,
            ap.professor_id,
            ap.unidade_id,
            ap.data_aula,
            ap.horario_aula,
            ap.status,
            ap.respondido_por,
            ap.respondido_em,
            ap.mensagem_uazapi_id,
            ap.token,
            ap.created_at,
            ap.aula_emusys_id,
            ap.curso_nome,
            ap.turma_nome,
            ap.sala_nome,
            ap.status_presenca,
            ap.emusys_presenca_bruta,
            ap.emusys_registro_presenca,
            ap.sincronizado_emusys_em,
            COALESCE(NULLIF(lower(ap.emusys_presenca_bruta), ''::text), lower((ap.status)::text)) AS estado_emusys_bruto,
            ae.emusys_id AS aula_emusys_evento_id,
            ae.cancelada AS aula_cancelada,
            ae.justificada AS aula_justificada,
            ae.categoria AS aula_categoria,
            ae.tipo AS aula_tipo,
            ae.data_hora_inicio,
            lower(NULLIF(ae.professor_presenca, ''::text)) AS professor_presenca_emusys,
                CASE
                    WHEN (ap.aula_emusys_id IS NOT NULL) THEN bool_or(((ap.status)::text = 'presente'::text)) OVER (PARTITION BY ap.aula_emusys_id)
                    ELSE ((ap.status)::text = 'presente'::text)
                END AS evento_tem_aluno_presente,
            politica.id AS politica_confiabilidade_id,
            politica.ausencia_emusys_resultado,
            politica.exige_revisao_operacional,
            politica.evidencia AS politica_evidencia,
            revisao.status AS revisao_status
           FROM (((aluno_presenca ap
             LEFT JOIN aulas_emusys ae ON ((ae.id = ap.aula_emusys_id)))
             LEFT JOIN LATERAL ( SELECT p.id,
                    p.unidade_id,
                    p.data_inicio,
                    p.data_fim,
                    p.ausencia_emusys_resultado,
                    p.exige_revisao_operacional,
                    p.decidido_em,
                    p.decidido_por,
                    p.evidencia,
                    p.regra_versao,
                    p.ativa,
                    p.created_at
                   FROM presenca_politicas_confiabilidade p
                  WHERE ((p.unidade_id = ap.unidade_id) AND p.ativa AND (ap.data_aula >= p.data_inicio) AND (ap.data_aula <= p.data_fim))
                  ORDER BY p.data_inicio DESC, p.created_at DESC, p.id
                 LIMIT 1) politica ON (true))
             LEFT JOIN aluno_presenca_revisoes_operacionais revisao ON ((revisao.aluno_presenca_id = ap.id)))
        ), classificada AS (
         SELECT e.id,
            e.aluno_id,
            e.professor_id,
            e.unidade_id,
            e.data_aula,
            e.horario_aula,
            e.status,
            e.respondido_por,
            e.respondido_em,
            e.mensagem_uazapi_id,
            e.token,
            e.created_at,
            e.aula_emusys_id,
            e.curso_nome,
            e.turma_nome,
            e.sala_nome,
            e.status_presenca,
            e.emusys_presenca_bruta,
            e.emusys_registro_presenca,
            e.sincronizado_emusys_em,
            e.estado_emusys_bruto,
            e.aula_emusys_evento_id,
            e.aula_cancelada,
            e.aula_justificada,
            e.aula_categoria,
            e.aula_tipo,
            e.data_hora_inicio,
            e.professor_presenca_emusys,
            e.evento_tem_aluno_presente,
            e.politica_confiabilidade_id,
            e.ausencia_emusys_resultado,
            e.exige_revisao_operacional,
            e.politica_evidencia,
            e.revisao_status,
            lower((COALESCE(e.status, 'desconhecido'::character varying))::text) AS estado_origem,
                CASE
                    WHEN ((e.respondido_por)::text = 'professor_la_teacher'::text) THEN 'la_teacher'::text
                    WHEN ((e.respondido_por)::text = 'fabio_audio'::text) THEN 'fabio_audio'::text
                    WHEN ((e.respondido_por)::text = 'professor_whatsapp'::text) THEN 'professor_whatsapp'::text
                    WHEN ((e.respondido_por)::text = 'agenda_secretaria'::text) THEN 'agenda_secretaria'::text
                    WHEN ((e.respondido_por)::text = 'manual'::text) THEN 'manual'::text
                    WHEN ((e.respondido_por)::text = ANY (ARRAY['emusys'::text, 'sistema'::text])) THEN 'emusys'::text
                    ELSE 'desconhecida'::text
                END AS proveniencia,
                CASE
                    WHEN ((e.status)::text = 'presente'::text) THEN 'registrada'::text
                    WHEN (COALESCE(e.aula_cancelada, false) OR COALESCE(e.aula_justificada, false)) THEN 'nao_aplicavel'::text
                    WHEN (fn_presenca_e_forte((e.respondido_por)::text) AND ((e.status)::text = 'ausente'::text)) THEN 'registrada'::text
                    WHEN (((e.respondido_por)::text = ANY (ARRAY['emusys'::text, 'sistema'::text])) AND (e.estado_emusys_bruto = 'ausente'::text) AND (e.emusys_registro_presenca = 'registrado'::text)) THEN 'registrada'::text
                    WHEN (((e.respondido_por)::text = ANY (ARRAY['emusys'::text, 'sistema'::text])) AND (e.estado_emusys_bruto = 'ausente'::text) AND (e.ausencia_emusys_resultado = 'falta_confirmada'::text)) THEN 'registrada_atestada'::text
                    WHEN (((e.respondido_por)::text = ANY (ARRAY['emusys'::text, 'sistema'::text])) AND (e.estado_emusys_bruto = 'ausente'::text) AND (e.evento_tem_aluno_presente OR (e.professor_presenca_emusys = 'presente'::text))) THEN 'registrada_inferida'::text
                    ELSE 'indeterminada'::text
                END AS situacao_chamada,
                CASE
                    WHEN ((e.status)::text = 'presente'::text) THEN 'presente'::text
                    WHEN COALESCE(e.aula_cancelada, false) THEN 'aula_cancelada'::text
                    WHEN COALESCE(e.aula_justificada, false) THEN 'aula_justificada'::text
                    WHEN (fn_presenca_e_forte((e.respondido_por)::text) AND ((e.status)::text = 'ausente'::text)) THEN 'falta_confirmada'::text
                    WHEN (((e.respondido_por)::text = ANY (ARRAY['emusys'::text, 'sistema'::text])) AND (e.estado_emusys_bruto = 'ausente'::text) AND (e.emusys_registro_presenca = 'registrado'::text)) THEN 'falta_confirmada'::text
                    WHEN (((e.respondido_por)::text = ANY (ARRAY['emusys'::text, 'sistema'::text])) AND (e.estado_emusys_bruto = 'ausente'::text) AND (e.ausencia_emusys_resultado = 'falta_confirmada'::text)) THEN 'falta_confirmada'::text
                    WHEN (((e.respondido_por)::text = ANY (ARRAY['emusys'::text, 'sistema'::text])) AND (e.estado_emusys_bruto = 'ausente'::text) AND (e.evento_tem_aluno_presente OR (e.professor_presenca_emusys = 'presente'::text))) THEN 'falta_provavel'::text
                    ELSE 'indeterminado'::text
                END AS resultado_pedagogico
           FROM evidencia e
        )
 SELECT id AS aluno_presenca_id,
    aluno_id,
    professor_id,
    unidade_id,
    aula_emusys_id,
    aula_emusys_evento_id,
    data_aula,
    horario_aula,
    data_hora_inicio,
    curso_nome,
    turma_nome,
    aula_categoria,
    aula_tipo,
    estado_origem,
    respondido_por,
    respondido_em,
    proveniencia,
    situacao_chamada,
    resultado_pedagogico,
        CASE
            WHEN (resultado_pedagogico = ANY (ARRAY['presente'::text, 'aula_cancelada'::text, 'aula_justificada'::text, 'falta_confirmada'::text])) THEN 'confirmada'::text
            WHEN (resultado_pedagogico = 'falta_provavel'::text) THEN 'provavel'::text
            ELSE 'desconhecida'::text
        END AS confianca,
    (resultado_pedagogico = ANY (ARRAY['presente'::text, 'falta_confirmada'::text])) AS considera_frequencia_denominador,
    (resultado_pedagogico = 'presente'::text) AS considera_presenca,
    (resultado_pedagogico = 'falta_confirmada'::text) AS considera_falta,
    (resultado_pedagogico = ANY (ARRAY['aula_cancelada'::text, 'aula_justificada'::text])) AS exclui_por_evento,
    (fn_presenca_e_forte((respondido_por)::text) AND (respondido_em IS NOT NULL)) AS respondido_em_confiavel,
    (((status)::text = 'presente'::text) AND (COALESCE(aula_cancelada, false) OR COALESCE(aula_justificada, false))) AS possui_conflito,
    'presenca-semantica-v1.4'::text AS regra_versao,
    estado_emusys_bruto,
    sincronizado_emusys_em,
    professor_presenca_emusys,
        CASE
            WHEN fn_presenca_e_forte((respondido_por)::text) THEN respondido_em
            ELSE sincronizado_emusys_em
        END AS evidencia_registrada_em,
    politica_confiabilidade_id,
        CASE
            WHEN fn_presenca_e_forte((respondido_por)::text) THEN 'resposta_humana_explicita'::text
            WHEN (((respondido_por)::text = ANY (ARRAY['emusys'::text, 'sistema'::text])) AND (estado_emusys_bruto = 'ausente'::text) AND (emusys_registro_presenca = 'registrado'::text)) THEN 'falta_lancada_no_emusys'::text
            WHEN ((estado_emusys_bruto = 'ausente'::text) AND (politica_confiabilidade_id IS NOT NULL)) THEN politica_evidencia
            WHEN (resultado_pedagogico = 'falta_provavel'::text) THEN 'evidencia_de_que_a_aula_ocorreu'::text
            ELSE 'regra_conservadora_sem_atestado'::text
        END AS fundamento_confianca,
    (COALESCE(exige_revisao_operacional, false) AND (NOT fn_presenca_e_forte((respondido_por)::text)) AND ((respondido_por)::text = ANY (ARRAY['emusys'::text, 'sistema'::text])) AND (estado_emusys_bruto = 'ausente'::text) AND (NOT COALESCE(aula_cancelada, false)) AND (NOT COALESCE(aula_justificada, false))) AS revisao_operacional_exigida,
        CASE
            WHEN (COALESCE(exige_revisao_operacional, false) AND (NOT fn_presenca_e_forte((respondido_por)::text)) AND ((respondido_por)::text = ANY (ARRAY['emusys'::text, 'sistema'::text])) AND (estado_emusys_bruto = 'ausente'::text) AND (NOT COALESCE(aula_cancelada, false)) AND (NOT COALESCE(aula_justificada, false))) THEN COALESCE(revisao_status, 'pendente'::text)
            ELSE 'nao_exigida'::text
        END AS revisao_operacional_status,
    status_presenca,
    emusys_registro_presenca
   FROM classificada c;
