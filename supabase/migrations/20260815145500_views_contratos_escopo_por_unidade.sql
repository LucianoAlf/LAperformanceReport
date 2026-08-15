-- Escopo por unidade nas 3 views da aba Contratos -- correcao de seguranca.
--
-- ATE AQUI O RECORTE POR UNIDADE SO EXISTIA NO FRONT. Medido em 15/08/2026 com JWT real:
-- usuaria de Campo Grande lia as **3 unidades** em `vw_contratos_vencendo` e em
-- `vw_alunos_sem_fatura_mes` chamando a view direto pelo PostgREST. O `.eq('unidade_id')`
-- do hook e conveniencia de UI, nao limite -- qualquer um com token de sessao podia pedir
-- a tabela inteira.
--
-- Por que o filtro vai na VIEW e nao em RLS: as tres tem `security_invoker = false` (rodam
-- com os direitos do dono, que e como alcancam `emusys_faturas` -- tabela com policy apenas
-- para service_role). Justamente por isso a RLS do usuario nao as alcanca; o unico lugar
-- onde o escopo pega e o predicado da propria view.
--
-- FORMA DO PREDICADO, ramo a ramo:
--   (select current_user) in ('service_role','postgres')
--       -> nao quebra leitura interna. ⚠️ A 1a versao usava `auth.role() = 'service_role'`
--          e devolvia **0 linhas** para service_role: auth.role() le o CLAIM do JWT, e uma
--          conexao que so faz SET ROLE (service_role direto, pg_cron como postgres) nao tem
--          claim nenhum. Testado antes de versionar.
--   (select public.is_admin())
--       -> admin ve tudo. Precisa vir ANTES do ramo de unidade porque os 9 admins tem
--          vinculo GLOBAL (`unidade_id NULL`) e `get_user_unidade_ids()` devolve VAZIO para
--          eles -- confiar so na lista deixaria admin sem nenhuma linha.
--   unidade_id in (select public.get_user_unidade_ids())
--       -> usuario de unidade, ja suportando multi-unidade pelo RBAC.
--
-- ⚠️ As chamadas vao dentro de `(select ...)` para virarem InitPlan (uma avaliacao por
--    query) em vez de uma por linha -- mesma licao que levou `get_agenda_dia` de 1175ms
--    para 95ms. Confirmado no EXPLAIN: "InitPlan 1/2/4" e "hashed SubPlan". O
--    `unidade_id IN (...)` NAO leva select em volta: e correlacionado com a linha.
--
-- VALIDADO com `set local role` + JWT real, nos 4 perfis:
--   usuario CG ...... 486 / 511 / 190 linhas, so "Campo Grande"
--   admin ........... 1183 / 1265 / 291, as 3 unidades
--   service_role .... 1183, as 3 unidades
--   sem vinculo ..... 0
-- Custo apos a mudanca: 96 ms / 2.093 buffers na janela de 30 dias.
--
-- ⚠️ Consumidores conferidos antes (repo + pg_proc): so os hooks `useContratosVencendo` e
--    `useCoberturaRenovacao`. Nenhuma RPC ou edge le estas views.
--
-- ⚠️ Este e o padrao das 213 RPCs `SECURITY DEFINER` que confiam no `p_unidade_id` recebido
--    do front. Esta migration corrige as 3 views da aba Contratos, NAO o padrao geral.

revoke all on public.vw_contratos_vencendo    from public, anon, authenticated;
revoke all on public.vw_renovacao_ciclos      from public, anon, authenticated;
create or replace view public.vw_contratos_vencendo as
SELECT j.unidade_id,
    j.unidade_nome,
    j.aluno_id,
    j.aluno_nome,
    j.emusys_matricula_id,
    j.emusys_matricula_disciplina_id,
    j.curso_nome,
    j.professor_nome,
    a.data_matricula,
    j.data_ultima_aula,
    (j.data_ultima_aula AT TIME ZONE 'America/Sao_Paulo'::text)::date - (now() AT TIME ZONE 'America/Sao_Paulo'::text)::date AS dias_ate_vencimento,
    j.nr_aulas_futuras,
        CASE
            WHEN jc.nr_faturas IS NULL OR jc.nr_faturas <= 0 THEN NULL::date
            WHEN jc.data_primeira_fatura IS NULL THEN NULL::date
            ELSE date_trunc('month'::text, jc.data_primeira_fatura + make_interval(months => jc.nr_faturas - 1))::date + (LEAST(COALESCE(jc.dia_vencimento_emusys, EXTRACT(day FROM jc.data_primeira_fatura)::integer), EXTRACT(day FROM date_trunc('month'::text, jc.data_primeira_fatura + make_interval(months => jc.nr_faturas - 1)) + '1 mon -1 days'::interval)::integer) - 1)
        END AS venc_ultima_fatura,
    a.valor_parcela,
    jc.inadimplente_emusys AS inadimplente,
    a.telefone,
    a.whatsapp,
    j.ultima_sincronizacao_emusys,
        CASE
            WHEN jc.nr_faturas IS NULL OR jc.nr_faturas <= 0 THEN NULL::integer
            WHEN jc.data_primeira_fatura IS NULL THEN NULL::integer
            ELSE date_trunc('month'::text, jc.data_primeira_fatura + make_interval(months => jc.nr_faturas - 1))::date + (LEAST(COALESCE(jc.dia_vencimento_emusys, EXTRACT(day FROM jc.data_primeira_fatura)::integer), EXTRACT(day FROM date_trunc('month'::text, jc.data_primeira_fatura + make_interval(months => jc.nr_faturas - 1)) + '1 mon -1 days'::interval)::integer) - 1) - (now() AT TIME ZONE 'America/Sao_Paulo'::text)::date
        END AS dias_ate_venc_fatura,
    COALESCE(fv.qtd, 0::bigint)::integer AS faturas_vencidas_abertas,
    jc.nr_faturas
   FROM vw_jornada_aluno_atual j
     JOIN aluno_jornada_matricula_disciplina jc ON jc.unidade_id = j.unidade_id AND jc.emusys_matricula_disciplina_id = j.emusys_matricula_disciplina_id
     LEFT JOIN alunos a ON a.id = j.aluno_id
     LEFT JOIN ( SELECT emusys_faturas.unidade_id,
            emusys_faturas.emusys_matricula_id,
            count(*) AS qtd
           FROM emusys_faturas
          WHERE emusys_faturas.status = 'aberta'::text AND emusys_faturas.data_vencimento < (now() AT TIME ZONE 'America/Sao_Paulo'::text)::date
          GROUP BY emusys_faturas.unidade_id, emusys_faturas.emusys_matricula_id) fv ON fv.unidade_id = j.unidade_id AND fv.emusys_matricula_id = j.emusys_matricula_id
  WHERE j.status_matricula = 'ativa'::text AND jc.sucedida_por IS NULL AND (((( SELECT CURRENT_USER AS "current_user")) = ANY (ARRAY['service_role'::name, 'postgres'::name])) OR ( SELECT is_admin() AS is_admin) OR (j.unidade_id IN ( SELECT get_user_unidade_ids() AS get_user_unidade_ids)));

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
    jc.sucedida_por,
    jc.sucedida_por IS NOT NULL AS renovou,
    is_atividade_extra_curso(j.curso_id) AS atividade_extra,
    date_trunc('month'::text, (j.data_ultima_aula AT TIME ZONE 'America/Sao_Paulo'::text))::date AS competencia_aula,
        CASE
            WHEN jc.nr_faturas IS NULL OR jc.nr_faturas <= 0 THEN NULL::date
            WHEN jc.data_primeira_fatura IS NULL THEN NULL::date
            ELSE date_trunc('month'::text, jc.data_primeira_fatura + make_interval(months => jc.nr_faturas - 1))::date + (LEAST(COALESCE(jc.dia_vencimento_emusys, EXTRACT(day FROM jc.data_primeira_fatura)::integer), EXTRACT(day FROM date_trunc('month'::text, jc.data_primeira_fatura + make_interval(months => jc.nr_faturas - 1)) + '1 mon -1 days'::interval)::integer) - 1)
        END AS venc_ultima_fatura,
        CASE
            WHEN jc.nr_faturas IS NULL OR jc.nr_faturas <= 0 THEN NULL::date
            WHEN jc.data_primeira_fatura IS NULL THEN NULL::date
            ELSE date_trunc('month'::text, date_trunc('month'::text, jc.data_primeira_fatura + make_interval(months => jc.nr_faturas - 1)))::date
        END AS competencia_fatura,
    COALESCE(fv.qtd, 0::bigint)::integer AS faturas_vencidas_abertas
   FROM vw_jornada_aluno_atual j
     JOIN aluno_jornada_matricula_disciplina jc ON jc.unidade_id = j.unidade_id AND jc.emusys_matricula_disciplina_id = j.emusys_matricula_disciplina_id
     LEFT JOIN alunos a ON a.id = j.aluno_id
     LEFT JOIN ( SELECT emusys_faturas.unidade_id,
            emusys_faturas.emusys_matricula_id,
            count(*) AS qtd
           FROM emusys_faturas
          WHERE emusys_faturas.status = 'aberta'::text AND emusys_faturas.data_vencimento < (now() AT TIME ZONE 'America/Sao_Paulo'::text)::date
          GROUP BY emusys_faturas.unidade_id, emusys_faturas.emusys_matricula_id) fv ON fv.unidade_id = j.unidade_id AND fv.emusys_matricula_id = j.emusys_matricula_id
  WHERE j.status_matricula = 'ativa'::text AND (((( SELECT CURRENT_USER AS "current_user")) = ANY (ARRAY['service_role'::name, 'postgres'::name])) OR ( SELECT is_admin() AS is_admin) OR (j.unidade_id IN ( SELECT get_user_unidade_ids() AS get_user_unidade_ids)));

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
          WHERE jc.sucedida_por IS NULL AND COALESCE(jc.status_matricula, ''::text) <> 'trancada'::text AND jc.data_primeira_aula IS NOT NULL AND jc.data_ultima_aula IS NOT NULL AND NOT is_atividade_extra_curso(a.curso_id)
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

revoke all on public.vw_contratos_vencendo    from public, anon, authenticated;
revoke all on public.vw_renovacao_ciclos      from public, anon, authenticated;
revoke all on public.vw_alunos_sem_fatura_mes from public, anon, authenticated;
grant select on public.vw_contratos_vencendo    to authenticated, service_role;
grant select on public.vw_renovacao_ciclos      to authenticated, service_role;
grant select on public.vw_alunos_sem_fatura_mes to authenticated, service_role;
