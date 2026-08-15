-- vw_alunos_sem_fatura_mes: exclui ISENTO -- fecha a paridade em 13 de 13.
--
-- SINTOMA: Rafael Mello dos Santos aparecia na aba com Parcelas 0 e Valor R$ 0,00,
-- e nao aparece na tela do Emusys. Eu havia atribuido essa sobra a defasagem de sync
-- ("a fatura dele deve ter saido hoje"). ERRADO -- ele e bolsista integral:
--   valor_parcela = 0,00
--   nr_faturas = 0 nos DOIS ciclos (o antigo, ja sucedido, e o novo)
--   ZERO faturas em emusys_faturas, em nenhuma das 4 competencias sincronizadas
-- Quem nao emite fatura por definicao nao pertence a uma lista de "sem fatura".
--
-- ⚠️ O CRITERIO SAO AS DUAS CONDICOES JUNTAS (valor 0 E sem parcelas), nunca so o valor.
--    Lucas Souza dos Santos (CG, Bateria) tem valor_parcela = 0 e contrato com **5
--    parcelas**: ali quem esta desatualizado e o NOSSO cadastro, e ele e caso real de
--    mensalidade nao emitida. Filtrar so por `valor_parcela > 0` o eliminaria junto.
--
-- Efeito medido em ago/2026: 96 -> 68 linhas antes do escopo por unidade; na Barra,
-- 14 -> **13**, batendo nome a nome com a tela do Emusys (era o unico extra que restava).
-- Totais depois: jul 18/49/12 · ago 13/41/15 · set 13/44/10 (Barra/CG/Recreio).
--
-- Demais regras do criterio e as hipoteses descartadas: ver 20260815140000.
-- Escopo por unidade no predicado: ver 20260815145500.

create or replace view public.vw_alunos_sem_fatura_mes as
WITH competencias AS (
         SELECT (date_trunc('month'::text, (now() AT TIME ZONE 'America/Sao_Paulo'::text)) + make_interval(months => g.off))::date AS competencia
           FROM generate_series('-1'::integer, 1) g(off)
        ), contratos AS (
         SELECT DISTINCT jc.unidade_id,
            jc.emusys_matricula_id,
            jc.emusys_matricula_disciplina_id,
            jc.status_matricula,
            jc.nr_faturas,
            jc.updated_at AS ultima_sincronizacao_emusys,
            (jc.data_primeira_aula AT TIME ZONE 'America/Sao_Paulo'::text)::date AS data_primeira_aula,
            (jc.data_ultima_aula AT TIME ZONE 'America/Sao_Paulo'::text)::date AS data_ultima_aula,
            a.id AS aluno_id,
            a.nome AS aluno_nome,
            a.curso_id,
            a.valor_parcela,
            a.telefone,
            a.whatsapp
           FROM aluno_jornada_matricula_disciplina jc
             JOIN alunos a ON a.unidade_id = jc.unidade_id AND a.emusys_matricula_id = jc.emusys_matricula_id::text
          WHERE jc.sucedida_por IS NULL AND COALESCE(jc.status_matricula, ''::text) <> 'trancada'::text AND jc.data_primeira_aula IS NOT NULL AND jc.data_ultima_aula IS NOT NULL AND NOT is_atividade_extra_curso(a.curso_id) AND NOT (COALESCE(a.valor_parcela, 0::numeric) = 0::numeric AND COALESCE(jc.nr_faturas, 0) = 0)
        )
 SELECT ct.unidade_id,
    u.nome AS unidade_nome,
    ct.aluno_id,
    ct.aluno_nome,
    cur.nome AS curso_nome,
    ct.emusys_matricula_id,
    ct.emusys_matricula_disciplina_id,
    comp.competencia,
    ct.data_primeira_aula,
    ct.data_ultima_aula,
    ct.status_matricula,
    ct.nr_faturas,
    ct.valor_parcela,
    ct.telefone,
    ct.whatsapp,
    ct.ultima_sincronizacao_emusys
   FROM contratos ct
     CROSS JOIN competencias comp
     JOIN unidades u ON u.id = ct.unidade_id
     LEFT JOIN cursos cur ON cur.id = ct.curso_id
  WHERE ct.data_primeira_aula <= (comp.competencia + '1 mon -1 days'::interval)::date AND ct.data_ultima_aula >= comp.competencia AND (((( SELECT CURRENT_USER AS "current_user")) = ANY (ARRAY['service_role'::name, 'postgres'::name])) OR ( SELECT is_admin() AS is_admin) OR (ct.unidade_id IN ( SELECT get_user_unidade_ids() AS get_user_unidade_ids))) AND NOT (EXISTS ( SELECT 1
           FROM emusys_faturas f
          WHERE f.unidade_id = ct.unidade_id AND f.competencia = comp.competencia AND f.emusys_matricula_id = ct.emusys_matricula_id AND f.descricao ~* '^parcela \d{2}/\d{4}'::text));
comment on view public.vw_alunos_sem_fatura_mes is
  'Replica a tela "Alunos com aula mas sem fatura por mes" do Emusys: contrato que cobre a '
  'competencia e nao tem MENSALIDADE emitida nela. Tres competencias (anterior/atual/seguinte). '
  'Exclui isento (valor 0 E sem parcelas), trancado e atividade extra; inclui quem ja saiu. '
  'Paridade conferida contra a tela em 15/08/2026 (Barra, ago): 13 de 13, sem sobra.';

revoke all on public.vw_alunos_sem_fatura_mes from public, anon, authenticated;
grant select on public.vw_alunos_sem_fatura_mes to authenticated, service_role;
