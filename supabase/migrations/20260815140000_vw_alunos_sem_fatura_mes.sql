-- "Alunos com aula mas sem fatura por mes" -- replica a tela homonima do Emusys.
--
-- CRITERIO, DESTRINCHADO CONTRA A TELA REAL (Barra, ago/2026: 13 de 13 conferidos).
-- Cada regra abaixo saiu de uma divergencia medida, nao de suposicao:
--
--   grao = MATRICULA/CURSO, nao aluno .... Julia Silva Vilardo aparece 2x na tela
--                                          (Canto e Violao). Casar por aluno faz quem
--                                          tem fatura de um curso sumir com o outro:
--                                          testado, devolveu 1 linha em vez de 13.
--   conta so MENSALIDADE ................. os 4 Isolani/Estanho pagaram TAXA DE MATRICULA
--                                          em agosto e a tela os lista assim mesmo. Por
--                                          isso o `descricao ~* '^parcela MM/AAAA'`.
--   INCLUI quem ja saiu ................... Pedro Cindra Feijo esta `evadido` /
--                                          `finalizada`, teve aula em 03/08 e a tela o
--                                          mostra. Faz sentido: evadir devendo e o caso
--                                          que mais interessa cobrar.
--   EXCLUI trancada ...................... 3 trancadas nossas que a tela nao lista
--                                          (aluno pausado nao tem aula nem paga).
--   EXCLUI atividade extra ............... Minha Banda / Power Kids nao aparecem la.
--   "tem aula no mes" = contrato COBRE o mes .. bate com as colunas Data Primeira Aula /
--                                          Data Ultima Aula da propria tela.
--
-- ⚠️ UMA DIVERGENCIA CONHECIDA E ACEITA: Rafael Mello dos Santos entra na nossa lista e
--    nao na do Emusys. Matricula que comeca 17/08 com `nr_faturas = 0`; a fatura dele
--    provavelmente foi gerada hoje, depois do sync das 21h30 de ontem. E defasagem de
--    sync, nao criterio -- some sozinho no proximo ciclo.
--
-- TRES COMPETENCIAS (anterior / atual / seguinte), como as abas JUL|AGO|SET da tela.
-- Materializadas por cross join em vez de parametro porque view nao aceita argumento --
-- assim o front filtra com `.eq('competencia', ...)` e nao precisa de RPC. Custo: ~3x
-- as linhas de contrato, o que e barato nesta escala (~1.267 contratos).
-- A competencia SEGUINTE so tem base porque o cron
-- `sync-faturas-competencia-seguinte` foi criado junto (20260815135000).
--
-- ⚠️ Le `emusys_faturas`, que tem RLS apenas para service_role. Funciona porque view
--    sem `security_invoker` executa com os direitos do DONO. Por isso a ACL abaixo tem
--    de ser exatamente `authenticated=r`: sendo uma view com join/CTE ela nao e
--    auto-atualizavel, mas o ALTER DEFAULT PRIVILEGES do schema concede tudo por padrao
--    e `grant select` sozinho nao tira o resto.

create or replace view public.vw_alunos_sem_fatura_mes as
with competencias as (
  select (date_trunc('month', (now() at time zone 'America/Sao_Paulo')) + make_interval(months => g.off))::date as competencia
  from generate_series(-1, 1) as g(off)
),
contratos as (
  select distinct
    jc.unidade_id,
    jc.emusys_matricula_id,
    jc.emusys_matricula_disciplina_id,
    jc.status_matricula,
    jc.nr_faturas,
    jc.updated_at as ultima_sincronizacao_emusys,
    (jc.data_primeira_aula at time zone 'America/Sao_Paulo')::date as data_primeira_aula,
    (jc.data_ultima_aula   at time zone 'America/Sao_Paulo')::date as data_ultima_aula,
    a.id   as aluno_id,
    a.nome as aluno_nome,
    a.curso_id,
    a.valor_parcela,
    a.telefone,
    a.whatsapp
  from aluno_jornada_matricula_disciplina jc
  join alunos a
    on a.unidade_id = jc.unidade_id
   and a.emusys_matricula_id = jc.emusys_matricula_id::text
  where jc.sucedida_por is null
    and coalesce(jc.status_matricula, '') <> 'trancada'
    and jc.data_primeira_aula is not null
    and jc.data_ultima_aula is not null
    and not is_atividade_extra_curso(a.curso_id)
)
select
  ct.unidade_id,
  u.nome as unidade_nome,
  ct.aluno_id,
  ct.aluno_nome,
  cur.nome as curso_nome,
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
from contratos ct
cross join competencias comp
join unidades u on u.id = ct.unidade_id
left join cursos cur on cur.id = ct.curso_id
where ct.data_primeira_aula <= (comp.competencia + interval '1 month - 1 day')::date
  and ct.data_ultima_aula   >= comp.competencia
  and not exists (
    select 1
    from emusys_faturas f
    where f.unidade_id = ct.unidade_id
      and f.competencia = comp.competencia
      and f.emusys_matricula_id = ct.emusys_matricula_id
      and f.descricao ~* '^parcela \d{2}/\d{4}'
  );

comment on view public.vw_alunos_sem_fatura_mes is
  'Replica a tela "Alunos com aula mas sem fatura por mes" do Emusys: contrato que cobre a '
  'competencia e nao tem MENSALIDADE emitida nela. Tres competencias (anterior/atual/seguinte), '
  'como as abas da tela. Criterio validado contra a tela em 15/08/2026 (Barra, ago): 13 de 13.';

revoke all on public.vw_alunos_sem_fatura_mes from public, anon, authenticated;
grant select on public.vw_alunos_sem_fatura_mes to authenticated, service_role;
