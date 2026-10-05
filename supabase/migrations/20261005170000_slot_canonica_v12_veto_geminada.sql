-- ============================================================================
-- Slot canônica v1.2: veto de aula irmã (geminada Emusys) não apaga decisão real
-- ============================================================================
-- Achado (Fábio, 05/10): em Campo Grande, alunos de cursos de turma geram uma
-- aula "individual" espelhada por aluno no Emusys (roster=1), marcada
-- justificada/cancelada em nível de AULA (aulas_emusys.justificada=true,
-- propagada via aluno_presenca_administrativo fonte='emusys', sem motivo).
-- A regra slot_cancelado/slot_justificado = bool_or() deixava o veto da aula
-- fantasma apagar a falta REAL lançada pela secretaria na aula turma — que
-- aconteceu (demais alunos do roster receberam presença/falta humanas).
-- Medido: 487 slots geminados em CG com veto só na individual e decisão só na
-- turma; a direção inversa (turma vetada + decisão só na individual) é ~3 slots
-- nas 3 unidades.
--
-- Correção: (1) linhas vetadas passam a ordenar por último na escolha do slot;
-- (2) resultado_do_slot volta a ser o resultado da própria linha escolhida —
-- veto só vale quando é da aula que carrega a decisão (ou quando toda linha do
-- slot é vetada, pois a escolhida também é).
-- ============================================================================

create or replace view vw_presenca_slot_canonica_v1 as
 WITH linhas AS (
         SELECT v.aluno_presenca_id,
            v.aluno_id,
            v.professor_id,
            v.unidade_id,
            v.aula_emusys_id,
            v.aula_emusys_evento_id,
            v.data_aula,
            v.horario_aula,
            v.data_hora_inicio,
            v.curso_nome,
            v.turma_nome,
            v.aula_categoria,
            v.aula_tipo,
            v.estado_origem,
            v.respondido_por,
            v.respondido_em,
            v.proveniencia,
            v.situacao_chamada,
            v.resultado_pedagogico,
            v.confianca,
            v.considera_frequencia_denominador,
            v.considera_presenca,
            v.considera_falta,
            v.exclui_por_evento,
            v.respondido_em_confiavel,
            v.possui_conflito,
            v.regra_versao,
            v.estado_emusys_bruto,
            v.sincronizado_emusys_em,
            v.professor_presenca_emusys,
            v.evidencia_registrada_em,
            v.politica_confiabilidade_id,
            v.fundamento_confianca,
            v.revisao_operacional_exigida,
            v.revisao_operacional_status,
            v.status_presenca,
            v.emusys_registro_presenca,
            ae.data_hora_fim,
            count(*) OVER w AS qtd_linhas_no_slot,
            min(
                CASE
                    WHEN fn_presenca_e_forte((v.respondido_por)::text) THEN v.status_presenca
                    ELSE NULL::text
                END) OVER w AS decisao_forte_min,
            max(
                CASE
                    WHEN fn_presenca_e_forte((v.respondido_por)::text) THEN v.status_presenca
                    ELSE NULL::text
                END) OVER w AS decisao_forte_max,
            bool_or(v.possui_conflito) OVER w AS conflito_em_alguma_linha,
            row_number() OVER (PARTITION BY v.aluno_id, v.unidade_id, v.professor_id, v.data_hora_inicio, ae.data_hora_fim, v.curso_nome ORDER BY (CASE WHEN (v.resultado_pedagogico = ANY (ARRAY['aula_cancelada'::text, 'aula_justificada'::text])) THEN 1 ELSE 0 END), (fn_presenca_fecha_chamada(v.status_presenca, (v.respondido_por)::text, v.emusys_registro_presenca)) DESC, (fn_presenca_e_forte((v.respondido_por)::text)) DESC, v.respondido_em DESC NULLS LAST,
                CASE
                    WHEN ((v.aula_tipo)::text = 'turma'::text) THEN 0
                    ELSE 1
                END, v.aluno_presenca_id) AS posicao_no_slot
           FROM (vw_aluno_presenca_semantica_v1 v
             LEFT JOIN aulas_emusys ae ON ((ae.id = v.aula_emusys_id)))
          WINDOW w AS (PARTITION BY v.aluno_id, v.unidade_id, v.professor_id, v.data_hora_inicio, ae.data_hora_fim, v.curso_nome)
        ), resolvido AS (
         SELECT l.aluno_presenca_id,
            l.aluno_id,
            l.professor_id,
            l.unidade_id,
            l.aula_emusys_id,
            l.aula_emusys_evento_id,
            l.data_aula,
            l.horario_aula,
            l.data_hora_inicio,
            l.curso_nome,
            l.turma_nome,
            l.aula_categoria,
            l.aula_tipo,
            l.estado_origem,
            l.respondido_por,
            l.respondido_em,
            l.proveniencia,
            l.situacao_chamada,
            l.resultado_pedagogico,
            l.confianca,
            l.considera_frequencia_denominador,
            l.considera_presenca,
            l.considera_falta,
            l.exclui_por_evento,
            l.respondido_em_confiavel,
            l.possui_conflito,
            l.regra_versao,
            l.estado_emusys_bruto,
            l.sincronizado_emusys_em,
            l.professor_presenca_emusys,
            l.evidencia_registrada_em,
            l.politica_confiabilidade_id,
            l.fundamento_confianca,
            l.revisao_operacional_exigida,
            l.revisao_operacional_status,
            l.status_presenca,
            l.emusys_registro_presenca,
            l.data_hora_fim,
            l.qtd_linhas_no_slot,
            l.decisao_forte_min,
            l.decisao_forte_max,
            l.conflito_em_alguma_linha,
            l.posicao_no_slot,
            l.resultado_pedagogico AS resultado_do_slot
           FROM linhas l
          WHERE (l.posicao_no_slot = 1)
        )
 SELECT aluno_presenca_id,
    aluno_id,
    professor_id,
    unidade_id,
    aula_emusys_id,
    aula_emusys_evento_id,
    data_aula,
    data_hora_inicio,
    data_hora_fim,
    horario_aula,
    curso_nome,
    turma_nome,
    aula_categoria,
    aula_tipo,
    estado_origem,
    status_presenca,
    respondido_por,
    respondido_em,
    proveniencia,
        CASE
            WHEN (resultado_do_slot = ANY (ARRAY['aula_cancelada'::text, 'aula_justificada'::text])) THEN 'nao_aplicavel'::text
            ELSE situacao_chamada
        END AS situacao_chamada,
    resultado_do_slot AS resultado_pedagogico,
        CASE
            WHEN (resultado_do_slot = ANY (ARRAY['presente'::text, 'aula_cancelada'::text, 'aula_justificada'::text, 'falta_confirmada'::text])) THEN 'confirmada'::text
            WHEN (resultado_do_slot = 'falta_provavel'::text) THEN 'provavel'::text
            ELSE 'desconhecida'::text
        END AS confianca,
    (resultado_do_slot = ANY (ARRAY['presente'::text, 'falta_confirmada'::text])) AS considera_frequencia_denominador,
    (resultado_do_slot = 'presente'::text) AS considera_presenca,
    (resultado_do_slot = 'falta_confirmada'::text) AS considera_falta,
    (resultado_do_slot = ANY (ARRAY['aula_cancelada'::text, 'aula_justificada'::text])) AS exclui_por_evento,
    estado_emusys_bruto,
    professor_presenca_emusys,
    evidencia_registrada_em,
    fundamento_confianca,
    revisao_operacional_exigida,
    revisao_operacional_status,
    qtd_linhas_no_slot,
    (qtd_linhas_no_slot > 1) AS slot_geminado_no_emusys,
    (decisao_forte_min IS DISTINCT FROM decisao_forte_max) AS tem_divergencia,
        CASE
            WHEN (resultado_do_slot = ANY (ARRAY['aula_cancelada'::text, 'aula_justificada'::text])) THEN NULL::text
            WHEN fn_presenca_fecha_chamada(status_presenca, (respondido_por)::text, emusys_registro_presenca) THEN status_presenca
            ELSE NULL::text
        END AS presenca_afirmada,
    ((resultado_do_slot <> ALL (ARRAY['aula_cancelada'::text, 'aula_justificada'::text])) AND fn_presenca_fecha_chamada(status_presenca, (respondido_por)::text, emusys_registro_presenca)) AS chamada_fechada,
    'presenca-slot-canonica-v1.2'::text AS regra_versao,
    COALESCE(conflito_em_alguma_linha, false) AS possui_conflito
   FROM resolvido r;
;
