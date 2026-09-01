-- =====================================================================
-- aviso_previo_pendencias: cobrar ATE FINALIZAR (31/08/2026)
--
-- Pedido do Luciano, em audio de 31/08: "se o pessoal nao finalizar, vai
-- cobrando ate ele finalizar, correto?". Nao era — a janela de 3 dias
-- (28/08) fazia o caso SUMIR no 2o dia depois de vencer, em silencio.
--
-- Agora a funcao devolve DUAS listas:
--   `janela`   — encerrou ontem / encerra hoje / encerra amanha (inalterado)
--   `vencidos` — tudo que venceu ANTES da janela e nunca foi confirmado
--
-- ⚠️ POR QUE ISSO NAO REPETE A PAREDE DE TEXTO DA v1: a v1 listava o backlog
-- cru. Hoje o script confirma cada aluno AO VIVO em GET /matriculas antes de
-- imprimir. Medido em 31/08 com o proprio `veredito()` de producao:
--
--     Barra 37 vencidos -> 1 reai   |  CG 24 -> 1  |  Recreio 27 -> 1
--     88 vencidos no total  ->  3 realmente pendentes
--
-- Ou seja: +1 linha por unidade. O filtro ao vivo e o que faltava na v1.
--
-- ⚠️ CUSTO: o script passa a rodar `veredito()` (1 GET /matriculas por aluno)
-- tambem nos vencidos — ~30 chamadas a mais por unidade, por execucao. Longe
-- do limite do Emusys (120/min), mas CRESCE com o tempo: cada aviso que
-- vence e nunca e concluido fica sendo re-consultado todo dia para sempre.
-- Se passar de ~150 por unidade, cachear o veredito 'resolvido'.
--
-- SUBSTITUI 20260828190000_aviso_previo_janela_3_dias.sql
-- =====================================================================

create or replace function public.aviso_previo_pendencias(
  p_unidade_id uuid,
  p_ref        date default null
)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
with hoje as (
  select coalesce(p_ref, (now() at time zone 'America/Sao_Paulo')::date) as d
),
base as (
  -- Dedup por aluno: a mesma pessoa tem varios avisos lancados (Victor
  -- Henrique tinha 3). Fica o de fim mais recente.
  select distinct on (coalesce(m.aluno_id::text, unaccent(lower(trim(m.aluno_nome)))))
    m.id,
    m.aluno_id,
    m.aluno_nome,
    m.data                                             as pedido,
    m.emusys_aviso_previo_id,
    coalesce(m.data_prevista_saida, m.mes_saida - 1)   as fim,
    (m.data_prevista_saida is null)                    as estimada
  from public.movimentacoes_admin m
  where m.tipo = 'aviso_previo'
    and not m.anulado
    and m.unidade_id = p_unidade_id
    and coalesce(m.data_prevista_saida, m.mes_saida - 1) is not null
  order by coalesce(m.aluno_id::text, unaccent(lower(trim(m.aluno_nome)))),
           coalesce(m.data_prevista_saida, m.mes_saida - 1) desc
),
sel as (
  -- O teto continua sendo +1 dia: quem encerra depois de amanha ainda tem
  -- aula, cobrar seria errado. O piso deixou de existir — e essa e a mudanca.
  select b.*, h.d as ref,
         case when b.fim >= h.d - 2 then 'janela' else 'vencido' end as grupo
  from base b, hoje h
  where b.fim <= h.d + 1
),
enriq as (
  select
    s.*,
    (select c.nome
       from public.alunos a
       left join public.cursos c on c.id = a.curso_id
      where a.id = s.aluno_id) as curso,
    (select a.status from public.alunos a where a.id = s.aluno_id) as status_lareport,
    (select min(em.emusys_aluno_id)
       from public.emusys_matriculas_estado_atual em
      where em.aluno_id = s.aluno_id) as emusys_aluno_id
  from sel s
)
select jsonb_build_object(
  'unidade_id', p_unidade_id,
  'unidade',    (select nome from public.unidades where id = p_unidade_id),
  'hoje',       (select d from hoje),
  'janela', coalesce((
    select jsonb_agg(jsonb_build_object(
             'movimentacao_id', e.id,
             'aluno_id',        e.aluno_id,
             'nome',            e.aluno_nome,
             'curso',           e.curso,
             'pedido',          e.pedido,
             'fim',             e.fim,
             'estimada',        e.estimada,
             'status_lareport', e.status_lareport,
             'emusys_aluno_id', e.emusys_aluno_id)
           order by e.fim, e.aluno_nome)
      from enriq e where e.grupo = 'janela'
  ), '[]'::jsonb),
  'vencidos', coalesce((
    select jsonb_agg(jsonb_build_object(
             'movimentacao_id', e.id,
             'aluno_id',        e.aluno_id,
             'nome',            e.aluno_nome,
             'curso',           e.curso,
             'pedido',          e.pedido,
             'fim',             e.fim,
             'estimada',        e.estimada,
             'status_lareport', e.status_lareport,
             'emusys_aluno_id', e.emusys_aluno_id)
           order by e.fim, e.aluno_nome)
      from enriq e where e.grupo = 'vencido'
  ), '[]'::jsonb)
);
$$;

comment on function public.aviso_previo_pendencias(uuid, date) is
  'Avisos previos de uma unidade para o lembrete diario da Sol. Devolve `janela` (encerrou ontem / hoje / amanha) e `vencidos` (venceu antes disso e nunca foi confirmado — cobra ate finalizar, pedido do Luciano 31/08/2026). p_ref e so para teste. Nao decide se foi concluido no Emusys: quem confirma e o script, ao vivo em GET /matriculas.';

-- ⚠️ O schema public deste projeto tem ALTER DEFAULT PRIVILEGES concedendo
-- EXECUTE a anon/authenticated/service_role em toda funcao nova. `revoke ...
-- from public` NAO cobre isso.
revoke all on function public.aviso_previo_pendencias(uuid, date) from public;
revoke all on function public.aviso_previo_pendencias(uuid, date) from anon;
revoke all on function public.aviso_previo_pendencias(uuid, date) from authenticated;
grant execute on function public.aviso_previo_pendencias(uuid, date) to service_role;
