-- Aviso previo: identificar a matricula exata no veredito ao vivo.
--
-- GET /matriculas?aluno_id= pode devolver varios cursos. O aviso pertence a
-- uma matricula, e uma renovacao/segundo curso nao pode resolver outra.

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
    m.emusys_matricula_id,
    m.emusys_aviso_previo_id,
    coalesce(m.data_prevista_saida, m.mes_saida - 1)   as fim,
    (m.data_prevista_saida is null)                    as estimada,
    a.status                                           as status_lareport
  from public.movimentacoes_admin m
  join public.alunos a on a.id = m.aluno_id
  where m.tipo = 'aviso_previo'
    and not m.anulado
    and m.unidade_id = p_unidade_id
    and a.unidade_id = p_unidade_id
    and a.status in ('ativo', 'aviso_previo')
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
    (select c.nome from public.alunos aa
       left join public.cursos c on c.id = aa.curso_id
      where aa.id = s.aluno_id) as curso,
    (select min(em.emusys_aluno_id) from public.emusys_matriculas_estado_atual em
      where em.aluno_id = s.aluno_id and em.unidade_id = p_unidade_id) as emusys_aluno_id
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
             'emusys_matricula_id', e.emusys_matricula_id,
             'emusys_aviso_previo_id', e.emusys_aviso_previo_id,
             'emusys_aluno_id', e.emusys_aluno_id)
           order by e.fim, e.aluno_nome)
      from enriq e where e.grupo = 'janela'
  ), '[]'::jsonb),
  'vencidos', coalesce((
    select jsonb_agg(jsonb_build_object(
             'movimentacao_id', e.id, 'aluno_id', e.aluno_id, 'nome', e.aluno_nome,
             'curso', e.curso, 'pedido', e.pedido, 'fim', e.fim,
             'estimada', e.estimada, 'status_lareport', e.status_lareport,
             'emusys_matricula_id', e.emusys_matricula_id,
             'emusys_aviso_previo_id', e.emusys_aviso_previo_id,
             'emusys_aluno_id', e.emusys_aluno_id)
           order by e.fim, e.aluno_nome)
      from enriq e where e.grupo = 'vencido'
  ), '[]'::jsonb)
);
$$;

comment on function public.aviso_previo_pendencias(uuid, date) is
  'Candidatos ativos para o lembrete da Sol. Inclui os IDs Emusys do aluno, da matricula e do aviso para o consumidor validar exatamente a matricula do aviso, sem misturar segundo curso.';

revoke all on function public.aviso_previo_pendencias(uuid, date) from public;
revoke all on function public.aviso_previo_pendencias(uuid, date) from anon;
revoke all on function public.aviso_previo_pendencias(uuid, date) from authenticated;
grant execute on function public.aviso_previo_pendencias(uuid, date) to service_role;
