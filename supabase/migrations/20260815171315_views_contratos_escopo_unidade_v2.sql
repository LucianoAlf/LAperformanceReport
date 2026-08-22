-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- v2 do escopo: troca `auth.role()` por `current_user`.
-- auth.role() le o CLAIM do JWT; conexao que so faz SET ROLE (service_role direto,
-- pg_cron como postgres) nao tem claim e caia no filtro, devolvendo 0 linhas.

create or replace view public.vw_contratos_vencendo as
 SELECT j.unidade_id, j.unidade_nome, j.aluno_id, j.aluno_nome,
    j.emusys_matricula_id, j.emusys_matricula_disciplina_id,
    j.curso_nome, j.professor_nome, a.data_matricula, j.data_ultima_aula,
    (j.data_ultima_aula AT TIME ZONE 'America/Sao_Paulo')::date
      - (now() AT TIME ZONE 'America/Sao_Paulo')::date AS dias_ate_vencimento,
    j.nr_aulas_futuras,
        CASE
            WHEN jc.nr_faturas IS NULL OR jc.nr_faturas <= 0 THEN NULL::date
            WHEN jc.data_primeira_fatura IS NULL THEN NULL::date
            ELSE date_trunc('month'::text, jc.data_primeira_fatura + make_interval(months => jc.nr_faturas - 1))::date + (LEAST(COALESCE(jc.dia_vencimento_emusys, EXTRACT(day FROM jc.data_primeira_fatura)::integer), EXTRACT(day FROM date_trunc('month'::text, jc.data_primeira_fatura + make_interval(months => jc.nr_faturas - 1)) + '1 mon -1 days'::interval)::integer) - 1)
        END AS venc_ultima_fatura,
    a.valor_parcela, jc.inadimplente_emusys AS inadimplente, a.telefone, a.whatsapp,
    j.ultima_sincronizacao_emusys,
        CASE
            WHEN jc.nr_faturas IS NULL OR jc.nr_faturas <= 0 THEN NULL::integer
            WHEN jc.data_primeira_fatura IS NULL THEN NULL::integer
            ELSE (date_trunc('month'::text, jc.data_primeira_fatura + make_interval(months => jc.nr_faturas - 1))::date + (LEAST(COALESCE(jc.dia_vencimento_emusys, EXTRACT(day FROM jc.data_primeira_fatura)::integer), EXTRACT(day FROM date_trunc('month'::text, jc.data_primeira_fatura + make_interval(months => jc.nr_faturas - 1)) + '1 mon -1 days'::interval)::integer) - 1)) - (now() AT TIME ZONE 'America/Sao_Paulo')::date
        END AS dias_ate_venc_fatura,
    COALESCE(fv.qtd, 0)::integer AS faturas_vencidas_abertas,
    jc.nr_faturas
   FROM vw_jornada_aluno_atual j
     JOIN aluno_jornada_matricula_disciplina jc ON jc.unidade_id = j.unidade_id AND jc.emusys_matricula_disciplina_id = j.emusys_matricula_disciplina_id
     LEFT JOIN alunos a ON a.id = j.aluno_id
     LEFT JOIN (
       SELECT unidade_id, emusys_matricula_id, count(*) AS qtd
         FROM emusys_faturas
        WHERE status = 'aberta' AND data_vencimento < (now() AT TIME ZONE 'America/Sao_Paulo')::date
        GROUP BY unidade_id, emusys_matricula_id
     ) fv ON fv.unidade_id = j.unidade_id AND fv.emusys_matricula_id = j.emusys_matricula_id
  WHERE j.status_matricula = 'ativa'::text
    AND jc.sucedida_por IS NULL
    AND (
      (select current_user) in ('service_role', 'postgres')
      OR (select public.is_admin())
      OR j.unidade_id IN (select public.get_user_unidade_ids())
    );

create or replace view public.vw_renovacao_ciclos as
 SELECT j.unidade_id, j.unidade_nome, j.aluno_id, j.aluno_nome,
    j.emusys_matricula_id, j.emusys_matricula_disciplina_id,
    j.curso_id, j.curso_nome, j.professor_nome, a.data_matricula,
    j.data_ultima_aula, j.nr_aulas_futuras, a.valor_parcela,
    jc.inadimplente_emusys AS inadimplente, a.telefone, a.whatsapp,
    j.ultima_sincronizacao_emusys, jc.sucedida_por,
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
    COALESCE(fv.qtd, 0)::integer AS faturas_vencidas_abertas
   FROM vw_jornada_aluno_atual j
     JOIN aluno_jornada_matricula_disciplina jc ON jc.unidade_id = j.unidade_id AND jc.emusys_matricula_disciplina_id = j.emusys_matricula_disciplina_id
     LEFT JOIN alunos a ON a.id = j.aluno_id
     LEFT JOIN (
       SELECT unidade_id, emusys_matricula_id, count(*) AS qtd
         FROM emusys_faturas
        WHERE status = 'aberta' AND data_vencimento < (now() AT TIME ZONE 'America/Sao_Paulo')::date
        GROUP BY unidade_id, emusys_matricula_id
     ) fv ON fv.unidade_id = j.unidade_id AND fv.emusys_matricula_id = j.emusys_matricula_id
  WHERE j.status_matricula = 'ativa'::text
    AND (
      (select current_user) in ('service_role', 'postgres')
      OR (select public.is_admin())
      OR j.unidade_id IN (select public.get_user_unidade_ids())
    );

create or replace view public.vw_alunos_sem_fatura_mes as
with competencias as (
  select (date_trunc('month', (now() at time zone 'America/Sao_Paulo')) + make_interval(months => g.off))::date as competencia
  from generate_series(-1, 1) as g(off)
),
contratos as (
  select distinct
    jc.unidade_id, jc.emusys_matricula_id, jc.emusys_matricula_disciplina_id,
    jc.status_matricula, jc.nr_faturas, jc.updated_at as ultima_sincronizacao_emusys,
    (jc.data_primeira_aula at time zone 'America/Sao_Paulo')::date as data_primeira_aula,
    (jc.data_ultima_aula   at time zone 'America/Sao_Paulo')::date as data_ultima_aula,
    a.id as aluno_id, a.nome as aluno_nome, a.curso_id,
    a.valor_parcela, a.telefone, a.whatsapp
  from aluno_jornada_matricula_disciplina jc
  join alunos a on a.unidade_id = jc.unidade_id and a.emusys_matricula_id = jc.emusys_matricula_id::text
  where jc.sucedida_por is null
    and coalesce(jc.status_matricula, '') <> 'trancada'
    and jc.data_primeira_aula is not null
    and jc.data_ultima_aula is not null
    and not is_atividade_extra_curso(a.curso_id)
)
select ct.unidade_id, u.nome as unidade_nome, ct.aluno_id, ct.aluno_nome,
  cur.nome as curso_nome, ct.emusys_matricula_id, ct.emusys_matricula_disciplina_id,
  comp.competencia, ct.data_primeira_aula, ct.data_ultima_aula, ct.status_matricula,
  ct.nr_faturas, ct.valor_parcela, ct.telefone, ct.whatsapp, ct.ultima_sincronizacao_emusys
from contratos ct
cross join competencias comp
join unidades u on u.id = ct.unidade_id
left join cursos cur on cur.id = ct.curso_id
where ct.data_primeira_aula <= (comp.competencia + interval '1 month - 1 day')::date
  and ct.data_ultima_aula   >= comp.competencia
  and (
    (select current_user) in ('service_role', 'postgres')
    OR (select public.is_admin())
    OR ct.unidade_id IN (select public.get_user_unidade_ids())
  )
  and not exists (
    select 1 from emusys_faturas f
    where f.unidade_id = ct.unidade_id
      and f.competencia = comp.competencia
      and f.emusys_matricula_id = ct.emusys_matricula_id
      and f.descricao ~* '^parcela \d{2}/\d{4}'
  );

revoke all on public.vw_contratos_vencendo   from public, anon, authenticated;
revoke all on public.vw_renovacao_ciclos     from public, anon, authenticated;
revoke all on public.vw_alunos_sem_fatura_mes from public, anon, authenticated;
grant select on public.vw_contratos_vencendo    to authenticated, service_role;
grant select on public.vw_renovacao_ciclos      to authenticated, service_role;
grant select on public.vw_alunos_sem_fatura_mes to authenticated, service_role;
