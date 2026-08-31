-- =====================================================================
-- aviso_previo_pendencias: de relatorio para LEMBRETE (28/08/2026)
--
-- Substitui a versao de 5 listas por uma janela de 3 dias — quem encerrou
-- ontem, encerra hoje, encerra amanha. O lembrete existe para UMA coisa: a
-- recepcao esquece de FINALIZAR a matricula no Emusys quando o aviso acaba
-- e ninguem renova. Vencidos antigos, renovados e nao-confirmados sairam da
-- mensagem — viravam parede de texto e afogavam a acao do dia.
--
-- Custo medido dessa decisao: dos 88 avisos vencidos desde janeiro/2026, 85
-- ja estavam resolvidos no Emusys (saiu ou renovou). O backlog que deixa de
-- aparecer sao 3 casos, resolviveis a mao uma vez.
--
-- A janela do SQL vai de -2 a +1 dia: o cron nao roda domingo, e sem os 2
-- dias para tras quem encerra no domingo sumiria em silencio na segunda.
-- Quem decide o rotulo (ontem / fim de semana) e o script.
--
-- `p_ref` e so para TESTE (ver a mensagem de um dia que ainda nao chegou).
-- Default = hoje BRT, entao a chamada de producao nao muda.
--
-- O veredito "ja foi concluido?" continua NAO saindo daqui: o espelho
-- `emusys_matriculas_estado_atual` so re-consulta matricula ATIVA (escopo
-- "operacional"); a varredura completa rodou 3x na vida, a ultima em
-- 12/08/2026. Quem confirma e o script, ao vivo em GET /matriculas.
-- =====================================================================

drop function if exists public.aviso_previo_pendencias(uuid);

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
    -- `data_prevista_saida` so existe nos avisos vindos do webhook Emusys
    -- (v1.4.0, 03/08/2026). Nos lancados pela tela do LA Report o campo nao
    -- existe no formulario, entao o fim e ESTIMADO — sinalizado em `estimada`.
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
janela as (
  select b.*, h.d as ref
  from base b, hoje h
  where b.fim between h.d - 2 and h.d + 1
),
enriq as (
  select
    j.*,
    (select c.nome
       from public.alunos a
       left join public.cursos c on c.id = a.curso_id
      where a.id = j.aluno_id) as curso,
    (select a.status from public.alunos a where a.id = j.aluno_id) as status_lareport,
    (select min(em.emusys_aluno_id)
       from public.emusys_matriculas_estado_atual em
      where em.aluno_id = j.aluno_id) as emusys_aluno_id
  from janela j
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
      from enriq e
  ), '[]'::jsonb)
);
$$;

comment on function public.aviso_previo_pendencias(uuid, date) is
  'Avisos previos de uma unidade que encerram na janela ontem/hoje/amanha, para o lembrete diario da Sol. p_ref e so para teste. Nao decide se foi concluido no Emusys — quem confirma e o script, ao vivo na API.';

-- ⚠️ O schema public deste projeto tem ALTER DEFAULT PRIVILEGES concedendo
-- EXECUTE a anon/authenticated/service_role em toda funcao nova. `revoke ...
-- from public` NAO cobre isso. Revogar dos 3 explicitamente e devolver so a
-- service_role, que e quem o script da Sol usa.
revoke all on function public.aviso_previo_pendencias(uuid, date) from public;
revoke all on function public.aviso_previo_pendencias(uuid, date) from anon;
revoke all on function public.aviso_previo_pendencias(uuid, date) from authenticated;
grant execute on function public.aviso_previo_pendencias(uuid, date) to service_role;
