-- Base canonica de COBERTURA DE RENOVACAO: um ciclo por linha, com os dois lados.
--
-- Por que nao reusar vw_contratos_vencendo: aquela filtra `sucedida_por is null`, ou
-- seja, mostra so quem AINDA NAO renovou. Para cobertura preciso dos dois lados --
-- quem renovou e o numerador, quem nao renovou e a lista de trabalho.
--
-- Regra que ela materializa (docs/REGRAS-DE-NEGOCIO.md §5.4):
--     taxa por professor = renovacoes / contratos_a_vencer
-- O denominador "contratos a vencer" JA e canonico nesse recorte; esta view leva a
-- mesma formula para o recorte de unidade/competencia. O 🚫 do §5.4 e contra dividir
-- pela BASE INTEIRA (`/ total_contratos`), nao contra a base elegivel do mes.
--
-- ⚠️ `atividade_extra` vem exposta, nao filtrada. §3.5 manda tirar banda/coral/Power
-- Kids/GarageBand da retencao, e quem consome DEVE filtrar -- mas esconder a linha aqui
-- faria a aba Contratos mudar de conteudo entre o modo "30 dias" e o modo "Este mes",
-- o que confunde mais do que ajuda. Impacto medido em ago/2026: Barra 0, CG 2, Recreio 2.
--
-- ⚠️ `renovou` = existe ciclo sucessor no Emusys (`sucedida_por`), e NAO
-- `renovacao_status='confirmada'` de movimentacoes_admin. Sao criterios diferentes de
-- proposito: o contrato novo existir no Emusys e evidencia mais forte que a confirmacao
-- manual, e nao depende de ninguem lancar nada -- que e justamente o furo do KPI atual
-- (medido: 196 renovacoes via webhook contra 16 nao-renovacoes, todas manuais).

create or replace view public.vw_renovacao_ciclos as
 SELECT j.unidade_id,
    j.unidade_nome,
    j.aluno_id,
    j.aluno_nome,
    j.emusys_matricula_id,
    j.emusys_matricula_disciplina_id,
    j.curso_id,
    j.curso_nome,
    j.professor_nome,
    a.data_matricula,
    j.data_ultima_aula,
    j.nr_aulas_futuras,
    a.valor_parcela,
    jc.inadimplente_emusys AS inadimplente,
    a.telefone,
    a.whatsapp,
    j.ultima_sincronizacao_emusys,

    -- ciclo substituido por uma renovacao? (NULL = ciclo vigente)
    jc.sucedida_por,
    (jc.sucedida_por IS NOT NULL) AS renovou,

    -- §3.5: banda, coral, Power Kids, GarageBand ficam fora da retencao
    is_atividade_extra_curso(j.curso_id) AS atividade_extra,

    -- competencia pelo fim das AULAS
    date_trunc('month', (j.data_ultima_aula AT TIME ZONE 'America/Sao_Paulo'))::date AS competencia_aula,

    -- ultima fatura do contrato (mesma derivacao ja validada em vw_contratos_vencendo:
    -- conferida contra GET /faturas, 7 de 7 no dia exato)
        CASE
            WHEN jc.nr_faturas IS NULL OR jc.nr_faturas <= 0 THEN NULL::date
            WHEN jc.data_primeira_fatura IS NULL THEN NULL::date
            ELSE date_trunc('month'::text, jc.data_primeira_fatura + make_interval(months => jc.nr_faturas - 1))::date + (LEAST(COALESCE(jc.dia_vencimento_emusys, EXTRACT(day FROM jc.data_primeira_fatura)::integer), EXTRACT(day FROM date_trunc('month'::text, jc.data_primeira_fatura + make_interval(months => jc.nr_faturas - 1)) + '1 mon -1 days'::interval)::integer) - 1)
        END AS venc_ultima_fatura,

    -- competencia pelo fim das PARCELAS
        CASE
            WHEN jc.nr_faturas IS NULL OR jc.nr_faturas <= 0 THEN NULL::date
            WHEN jc.data_primeira_fatura IS NULL THEN NULL::date
            ELSE date_trunc('month'::text, date_trunc('month'::text, jc.data_primeira_fatura + make_interval(months => jc.nr_faturas - 1)))::date
        END AS competencia_fatura

   FROM vw_jornada_aluno_atual j
     JOIN aluno_jornada_matricula_disciplina jc
       ON jc.unidade_id = j.unidade_id
      AND jc.emusys_matricula_disciplina_id = j.emusys_matricula_disciplina_id
     LEFT JOIN alunos a ON a.id = j.aluno_id
  WHERE j.status_matricula = 'ativa'::text;

comment on view public.vw_renovacao_ciclos is
  'Ciclos de matricula-disciplina com os dois lados da renovacao (renovou / nao renovou), '
  'para calcular cobertura por competencia. Consumidores DEVEM filtrar atividade_extra = false '
  '(regra §3.5). Nao confundir com vw_contratos_vencendo, que so mostra ciclo vigente.';

revoke all on public.vw_renovacao_ciclos from public, anon, authenticated;
grant select on public.vw_renovacao_ciclos to authenticated, service_role;
