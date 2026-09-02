-- Aviso previo: veredito apurado ao vivo (02/09/2026)
-- Contexto completo: fiscal-mila/daily-notes/2026-09-02.md e a secao
-- "Sol - Lembrete de aviso previo" do CLAUDE.md daquele repo.

-- Dedup de aviso previo precisa de DESEMPATE.
--
-- `distinct on (aluno) order by aluno, fim desc` nao e deterministico
-- quando o mesmo aluno tem dois avisos com o MESMO fim -- e isso e comum:
-- Vivian Dangelo (ids 187 e 84), Alexandre Ferreira (181 e 60), Victor
-- Henrique (2602 e 2601) todos com fim 28/02.
--
-- Sem desempate, `aviso_previo_pendencias` escolhia um id e
-- `aviso_previo_vencidos` escolhia outro: o veredito ficava gravado numa
-- linha que a tela nao consulta, e a aba mostrava 14 avisos como
-- "nao_verificado" que o cron ja tinha avaliado. Pior, o lembrete podia
-- trocar de id entre execucoes, espalhando vereditos orfaos.
--
-- `m.id desc` como criterio final: o registro mais recente entre os
-- empatados, estavel entre chamadas e entre as duas funcoes.
--
-- (O corpo de aviso_previo_pendencias e o de 20260901010435 com o
-- `m.id desc` acrescentado ao order by da CTE `base`; o de
-- aviso_previo_vencidos foi substituido em seguida por 20260902144053.)

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
  select distinct on (coalesce(m.aluno_id::text, unaccent(lower(trim(m.aluno_nome)))))
    m.id, m.aluno_id, m.aluno_nome,
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
           coalesce(m.data_prevista_saida, m.mes_saida - 1) desc,
           m.id desc
),
sel as (
  select b.*, h.d as ref,
         case when b.fim >= h.d - 2 then 'janela' else 'vencido' end as grupo
  from base b, hoje h
  where b.fim <= h.d + 1
),
enriq as (
  select s.*,
    (select c.nome from public.alunos a
       left join public.cursos c on c.id = a.curso_id
      where a.id = s.aluno_id) as curso,
    (select a.status from public.alunos a where a.id = s.aluno_id) as status_lareport,
    (select min(em.emusys_aluno_id) from public.emusys_matriculas_estado_atual em
      where em.aluno_id = s.aluno_id) as emusys_aluno_id
  from sel s
)
select jsonb_build_object(
  'unidade_id', p_unidade_id,
  'unidade',    (select nome from public.unidades where id = p_unidade_id),
  'hoje',       (select d from hoje),
  'janela', coalesce((
    select jsonb_agg(jsonb_build_object(
             'movimentacao_id', e.id, 'aluno_id', e.aluno_id, 'nome', e.aluno_nome,
             'curso', e.curso, 'pedido', e.pedido, 'fim', e.fim,
             'estimada', e.estimada, 'status_lareport', e.status_lareport,
             'emusys_aluno_id', e.emusys_aluno_id)
           order by e.fim, e.aluno_nome)
      from enriq e where e.grupo = 'janela'
  ), '[]'::jsonb),
  'vencidos', coalesce((
    select jsonb_agg(jsonb_build_object(
             'movimentacao_id', e.id, 'aluno_id', e.aluno_id, 'nome', e.aluno_nome,
             'curso', e.curso, 'pedido', e.pedido, 'fim', e.fim,
             'estimada', e.estimada, 'status_lareport', e.status_lareport,
             'emusys_aluno_id', e.emusys_aluno_id)
           order by e.fim, e.aluno_nome)
      from enriq e where e.grupo = 'vencido'
  ), '[]'::jsonb)
);
$$;

comment on function public.aviso_previo_pendencias(uuid, date) is
  'Avisos previos de uma unidade para o lembrete diario da Sol. Devolve `janela` (encerrou ontem / hoje / amanha) e `vencidos` (venceu antes disso e nunca foi confirmado). p_ref e so para teste. Nao decide se foi concluido no Emusys: quem confirma e o script, ao vivo. Dedup por aluno com desempate por id -- sem ele, esta funcao e a aviso_previo_vencidos escolhiam linhas diferentes do mesmo aluno.';

revoke all on function public.aviso_previo_pendencias(uuid, date) from public;
revoke all on function public.aviso_previo_pendencias(uuid, date) from anon;
revoke all on function public.aviso_previo_pendencias(uuid, date) from authenticated;
grant execute on function public.aviso_previo_pendencias(uuid, date) to service_role;
