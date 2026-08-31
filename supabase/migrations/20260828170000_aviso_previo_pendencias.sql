-- =====================================================================
-- aviso_previo_pendencias(unidade) — apoio ao lembrete diario da Sol
--
-- Devolve o que o BANCO sabe sobre aviso previo de uma unidade, em 3 listas.
-- O veredito de "ja foi concluido no Emusys?" NAO sai daqui de proposito:
-- o espelho `emusys_matriculas_estado_atual` so re-consulta matricula ATIVA
-- (escopo "operacional", diario) — a varredura completa rodou 3x na vida, a
-- ultima em 12/08/2026. Medido em 28/08: das 7 "pendencias" que o espelho
-- apontava, 2 ja estavam concluidas e 2 eram alunos que renovaram. Quem da o
-- veredito e o script, consultando GET /matriculas ao vivo.
--
-- `candidatos_vencidos` sai daqui com `emusys_aluno_id` justamente para o
-- script poder perguntar ao Emusys.
--
-- Fim do aviso = coalesce(data_prevista_saida, mes_saida - 1 dia).
--   `data_prevista_saida` so existe nos avisos vindos do webhook Emusys
--   (v1.4.0, 03/08/2026). Nos lancados pela tela do LA Report o campo nao
--   existe no formulario, entao o fim e ESTIMADO — sinalizado em `estimada`.
--
-- Dedup por aluno: a mesma pessoa tem varios avisos lancados (Victor Henrique
-- tinha 3). Fica o de fim mais recente.
-- =====================================================================

create or replace function public.aviso_previo_pendencias(p_unidade_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
with hoje as (
  select (now() at time zone 'America/Sao_Paulo')::date as d
),
base as (
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
enriq as (
  select
    b.*,
    (select c.nome
       from public.alunos a
       left join public.cursos c on c.id = a.curso_id
      where a.id = b.aluno_id) as curso,
    (select min(em.emusys_aluno_id)
       from public.emusys_matriculas_estado_atual em
      where em.aluno_id = b.aluno_id) as emusys_aluno_id,
    exists (
      select 1 from public.movimentacoes_admin e
       where e.aluno_id = b.aluno_id
         and e.tipo in ('evasao', 'nao_renovacao')
         and e.data >= b.pedido
    ) as saida_no_lareport
  from base b
)
select jsonb_build_object(
  'unidade_id', p_unidade_id,
  'unidade',    (select nome from public.unidades where id = p_unidade_id),
  'hoje',       (select d from hoje),

  -- 1) encerra hoje
  'encerra_hoje', coalesce((
    select jsonb_agg(jsonb_build_object(
             'movimentacao_id', e.id, 'aluno_id', e.aluno_id, 'nome', e.aluno_nome,
             'curso', e.curso, 'pedido', e.pedido, 'fim', e.fim, 'estimada', e.estimada,
             'no_emusys', e.emusys_aviso_previo_id is not null)
           order by e.aluno_nome)
      from enriq e, hoje h
     where e.fim = h.d
  ), '[]'::jsonb),

  -- 2) ainda vai encerrar, mas o aviso nao existe no Emusys
  'sem_registro_emusys', coalesce((
    select jsonb_agg(jsonb_build_object(
             'movimentacao_id', e.id, 'aluno_id', e.aluno_id, 'nome', e.aluno_nome,
             'curso', e.curso, 'fim', e.fim, 'estimada', e.estimada)
           order by e.fim, e.aluno_nome)
      from enriq e, hoje h
     where e.fim > h.d
       and e.emusys_aviso_previo_id is null
  ), '[]'::jsonb),

  -- 3) venceu e nao ha saida registrada no LA Report -> o script pergunta ao Emusys
  'candidatos_vencidos', coalesce((
    select jsonb_agg(jsonb_build_object(
             'movimentacao_id', e.id, 'aluno_id', e.aluno_id, 'nome', e.aluno_nome,
             'curso', e.curso, 'pedido', e.pedido, 'fim', e.fim, 'estimada', e.estimada,
             'emusys_aluno_id', e.emusys_aluno_id)
           order by e.fim, e.aluno_nome)
      from enriq e, hoje h
     where e.fim < h.d
       and not e.saida_no_lareport
  ), '[]'::jsonb)
);
$$;

comment on function public.aviso_previo_pendencias(uuid) is
  'Listas de aviso previo por unidade para o lembrete diario da Sol. Nao decide se foi concluido no Emusys — quem confirma e o script, ao vivo na API.';

-- ⚠️ O schema public deste projeto tem ALTER DEFAULT PRIVILEGES concedendo
-- EXECUTE a anon/authenticated/service_role em toda funcao nova. `revoke ...
-- from public` NAO cobre isso. Revogar dos 3 explicitamente e devolver so a
-- service_role, que e quem o script da Sol usa.
revoke all on function public.aviso_previo_pendencias(uuid) from public;
revoke all on function public.aviso_previo_pendencias(uuid) from anon;
revoke all on function public.aviso_previo_pendencias(uuid) from authenticated;
grant execute on function public.aviso_previo_pendencias(uuid) to service_role;
