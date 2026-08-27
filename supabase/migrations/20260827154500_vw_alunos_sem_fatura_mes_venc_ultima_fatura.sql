-- "Alunos com aula mas sem fatura por mes" ganha as datas de cobranca do contrato.
--
-- Pedido do Arthur (27/08/2026): a tabela de contratos vencendo ja mostra
-- "Venc. ultima fatura"; o recorte "Sem fatura" nao mostrava nenhuma data de
-- cobranca, so datas de AULA. Sem isso nao da pra priorizar quem esta ha mais
-- tempo tendo aula sem ser cobrado -- que e exatamente o que a lista existe pra
-- responder. Medido em ago/2026: os casos da lista tem a ultima fatura vencida
-- ha 83, 114, 175, 188 dias.
--
-- Nada de API nova: `data_primeira_fatura`, `nr_faturas` e `dia_vencimento_emusys`
-- ja estao em `aluno_jornada_matricula_disciplina`, a mesma fonte que a view ja
-- le (83/83 preenchidos na competencia atual).
--
-- A formula de `venc_ultima_fatura` e COPIA LITERAL da usada em
-- `vw_contratos_vencendo` / `vw_renovacao_ciclos` -- de proposito: o mesmo rotulo
-- em duas telas precisa dar o mesmo numero. Ela deriva dos campos do CONTRATO
-- (nao le `emusys_faturas`), que e o que garante paridade com a tela do Emusys.
--
-- Cardinalidade: as colunas novas entram no `select distinct` do CTE. Verificado
-- que nenhum par (unidade_id, emusys_matricula_disciplina_id) tem valor divergente
-- de `data_primeira_fatura`/`dia_vencimento_emusys` (0 casos), entao o DISTINCT
-- continua colapsando as mesmas linhas. Baseline antes: jul 78 / ago 83 / set 48.
--
-- Ficam NULL os contratos com `nr_faturas <= 0` (3 de 83 em ago/2026) -- nao ha o
-- que derivar, o front mostra "sem parcelas".
--
-- NAO adicionada aqui: "ultima fatura paga". Ela depende de `emusys_faturas`, cujo
-- espelho so cobre jun-set/2026 (o sync puxa competencia anterior/atual/seguinte);
-- hoje ela ficaria vazia em 47 das 83 linhas, justamente nos contratos antigos, que
-- sao os casos graves. Fica para depois do backfill de competencias.

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
    jc.data_primeira_fatura, jc.dia_vencimento_emusys,
    a.id as aluno_id, a.nome as aluno_nome, a.curso_id,
    a.valor_parcela, a.telefone, a.whatsapp
  from aluno_jornada_matricula_disciplina jc
  join alunos a on a.unidade_id = jc.unidade_id and a.emusys_matricula_id = jc.emusys_matricula_id::text
  where jc.sucedida_por is null
    and coalesce(jc.status_matricula, '') <> 'trancada'
    and jc.data_primeira_aula is not null
    and jc.data_ultima_aula is not null
    and not is_atividade_extra_curso(a.curso_id)
    -- Isento: nao emite fatura por definicao, nao pertence a uma lista de "sem fatura".
    -- Sao as DUAS condicoes juntas -- filtrar so por valor derrubaria bolsista com parcelas.
    and not (coalesce(a.valor_parcela, 0) = 0 and coalesce(jc.nr_faturas, 0) = 0)
)
select ct.unidade_id, u.nome as unidade_nome, ct.aluno_id, ct.aluno_nome,
  cur.nome as curso_nome, ct.emusys_matricula_id, ct.emusys_matricula_disciplina_id,
  comp.competencia, ct.data_primeira_aula, ct.data_ultima_aula, ct.status_matricula,
  ct.nr_faturas, ct.valor_parcela, ct.telefone, ct.whatsapp, ct.ultima_sincronizacao_emusys,
  ct.data_primeira_fatura,
  case
    when ct.nr_faturas is null or ct.nr_faturas <= 0 then null::date
    when ct.data_primeira_fatura is null then null::date
    else date_trunc('month', ct.data_primeira_fatura + make_interval(months => ct.nr_faturas - 1))::date
       + (least(
            coalesce(ct.dia_vencimento_emusys, extract(day from ct.data_primeira_fatura)::int),
            extract(day from date_trunc('month', ct.data_primeira_fatura + make_interval(months => ct.nr_faturas - 1)) + '1 mon -1 days'::interval)::int
          ) - 1)
  end as venc_ultima_fatura,
  -- Relativo a HOJE, nao a competencia da aba: a pergunta e "ha quanto tempo esse
  -- contrato esta sem cobranca", e ela nao muda quando se olha julho ou setembro.
  case
    when ct.nr_faturas is null or ct.nr_faturas <= 0 then null::int
    when ct.data_primeira_fatura is null then null::int
    else (date_trunc('month', ct.data_primeira_fatura + make_interval(months => ct.nr_faturas - 1))::date
       + (least(
            coalesce(ct.dia_vencimento_emusys, extract(day from ct.data_primeira_fatura)::int),
            extract(day from date_trunc('month', ct.data_primeira_fatura + make_interval(months => ct.nr_faturas - 1)) + '1 mon -1 days'::interval)::int
          ) - 1)) - (now() at time zone 'America/Sao_Paulo')::date
  end as dias_ate_venc_fatura
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

-- `create or replace view` preserva a ACL, mas conferir e barato e ja fomos
-- mordidos pelo ALTER DEFAULT PRIVILEGES neste schema (view nasce com todos os
-- privilegios para authenticated).
revoke all on public.vw_alunos_sem_fatura_mes from public, anon;
grant select on public.vw_alunos_sem_fatura_mes to authenticated, service_role;
