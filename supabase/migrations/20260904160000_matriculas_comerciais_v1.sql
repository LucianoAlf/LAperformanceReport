-- MATRÍCULA DO COMERCIAL: fonte única (regra confirmada pelo Luciano em 04/09/2026)
--
-- A Mila disse à Vitória que Campo Grande fez 30 matrículas em agosto. A Vitória
-- fez 24 — e ela mesma acertou o diagnóstico: "deve ter contado com 2º curso e
-- alunos bolsistas". Medido, a cadeia fecha exata:
--   37 linhas de matrícula em ago/CG
--   - 7  segundo curso            = 30  (o que a RPC das estrelas dizia)
--   - 5  bolsista e banda/extra   = 25
--   - 1  sem passaporte pago      = 24  OK
--
-- As 4 regras, todas do Luciano:
--   (a) 2o curso NAO e matricula (e 2o curso; tem comissao propria);
--   (b) bolsista nao paga passaporte, nao conta;
--   (c) banda/coral/atividade extra nao conta;
--   (d) so conta quem PAGOU O PASSAPORTE (taxa de matricula) — foi o que separou
--       a professora da casa (Ana Beatriz Paz de Almeida) das 24 reais.
--
-- (a)-(c) ja existem no predicado canonico movimentacao_conta_nos_kpis_v1; esta
-- funcao acrescenta (d) e devolve o MOTIVO de cada exclusao, para a Mila poder
-- explicar o numero em vez de so cuspi-lo.
--
-- FAIL-SAFE do passaporte: emusys_faturas so cobre jun/2026 em diante. Se a
-- unidade nao tiver NENHUMA fatura de taxa/passaporte no periodo, o filtro (d)
-- e DESLIGADO — sem isso, um mes nao sincronizado zeraria o comercial inteiro e
-- a Mila anunciaria "0 matriculas".
create or replace function public.matriculas_comerciais_v1(
  p_unidade_id uuid, p_de date, p_ate date
) returns table(
  aluno_id integer, nome text, curso text, tipo_matricula text,
  valor_parcela numeric, data_matricula date,
  conta boolean, motivo_fora text, passaporte_pago boolean
)
language sql stable security definer set search_path = public as $$
  with fat as (
    select distinct f.emusys_matricula_id
    from emusys_faturas f
    where f.unidade_id = p_unidade_id
      and (f.descricao ~* 'taxa de matr' or f.descricao ~* 'passaporte')
      and f.data_pagamento is not null
  ),
  ha_dado as (select exists (select 1 from fat) v),
  b as (
    select a.id, a.nome::text nm, c.nome::text cur, tm.nome::text tmn,
           a.valor_parcela, a.data_matricula,
           coalesce(a.is_segundo_curso, false) seg,
           movimentacao_conta_nos_kpis_v1(a.curso_id, a.tipo_matricula_id) kpi,
           (a.emusys_matricula_id is not null
            and exists (select 1 from fat f where f.emusys_matricula_id::text = a.emusys_matricula_id::text)) pass
    from alunos a
    left join cursos c on c.id = a.curso_id
    left join tipos_matricula tm on tm.id = a.tipo_matricula_id
    where a.unidade_id = p_unidade_id
      and a.data_matricula >= p_de and a.data_matricula < p_ate
  )
  select b.id, b.nm, b.cur, b.tmn, b.valor_parcela, b.data_matricula,
         (not b.seg and b.kpi and (b.pass or not (select v from ha_dado))),
         case when b.seg then 'segundo_curso'
              when not b.kpi then 'bolsista_ou_atividade_extra'
              when not b.pass and (select v from ha_dado) then 'sem_passaporte_pago'
         end,
         b.pass
  from b
  order by b.data_matricula, b.nm
$$;

comment on function public.matriculas_comerciais_v1(uuid, date, date) is
'Matriculas que contam para o COMERCIAL num periodo: exclui 2o curso, bolsista, banda/atividade extra e quem nao pagou passaporte (taxa de matricula). Devolve todas as linhas com o motivo de exclusao. Regra do Luciano, 04/09/2026 — validada contra as 24 da Vitoria em ago/CG.';

revoke all on function public.matriculas_comerciais_v1(uuid, date, date) from public, anon, authenticated;
grant execute on function public.matriculas_comerciais_v1(uuid, date, date) to service_role, mila_acesso_restrito;
