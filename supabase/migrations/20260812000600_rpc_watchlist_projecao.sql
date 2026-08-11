-- 2026-08-12 — RPC: get_watchlist_projecao
--
-- A lista de alunos que precisam de olhar. Calculada a partir da projeção
-- materializada, não mockada.

create or replace function public.get_watchlist_projecao(
  p_unidade_id uuid default null,
  p_dias_futuros integer default 30
)
returns table(
  aluno_id integer,
  aluno_nome text,
  matricula_disciplina_id bigint,
  dia_semana text,
  aulas_restantes integer,
  ultima_aula_projetada date,
  ultima_aula_emusys date,
  delta_dias integer,
  status_alerta text,
  folga_banco integer
)
language sql
stable
set search_path to 'public'
as $function$
with ultimas_projecoes as (
  select
    pa.aluno_id,
    pa.matricula_disciplina_id,
    pa.unidade_id,
    max(pa.data_projetada) as ultima_projetada,
    count(*) filter (where pa.status = 'projetada') as aulas_restantes,
    max(pa.dia_semana) as dia_semana
  from projecao_aulas pa
  where pa.status = 'projetada'
  group by pa.aluno_id, pa.matricula_disciplina_id, pa.unidade_id
),
jornadas as (
  select
    j.aluno_id,
    j.emusys_matricula_disciplina_id,
    j.data_ultima_aula::date as ultima_emusys,
    j.nr_aulas_contratadas
  from aluno_jornada_matricula_disciplina j
  where j.status_matricula = 'ativa'
),
banco_por_dia as (
  -- Calcula o banco de segurança por dia da semana para o ano corrente
  select
    lower(to_char(d.data, 'Day')) as dia_semana_en,
    count(*) as total_dias,
    count(*) filter (where not exists (
      select 1 from feriados f where f.data = d.data and f.ativo
    )) as dias_com_aula
  from generate_series(current_date, current_date + interval '12 months', interval '1 day') as d(data)
  where extract(isodow from d.data) between 1 and 6 -- seg-sab
  group by lower(to_char(d.data, 'Day'))
)
select
  up.aluno_id,
  a.nome as aluno_nome,
  up.matricula_disciplina_id,
  up.dia_semana,
  up.aulas_restantes::integer,
  up.ultima_projetada,
  j.ultima_emusys,
  (up.ultima_projetada - j.ultima_emusys)::integer as delta_dias,
  case
    when (up.ultima_projetada - j.ultima_emusys) > 35 then 'estourando'
    when (up.ultima_projetada - j.ultima_emusys) > 21 then 'sem_margem'
    when up.aulas_restantes <= 5 then 'janela_renovacao'
    else 'ok'
  end as status_alerta,
  coalesce(b.dias_com_aula - j.nr_aulas_contratadas, 0)::integer as folga_banco
from ultimas_projecoes up
join jornadas j on j.aluno_id = up.aluno_id and j.emusys_matricula_disciplina_id = up.matricula_disciplina_id
join alunos a on a.id = up.aluno_id
left join banco_por_dia b on b.dia_semana_en = lower(to_char(up.ultima_projetada, 'Day'))
where (p_unidade_id is null or up.unidade_id = p_unidade_id)
  and (
    (up.ultima_projetada - j.ultima_emusys) > 21 -- estourando ou sem margem
    or up.aulas_restantes <= 5 -- janela de renovação
  )
order by
  case
    when (up.ultima_projetada - j.ultima_emusys) > 35 then 1
    when (up.ultima_projetada - j.ultima_emusys) > 21 then 2
    when up.aulas_restantes <= 5 then 3
    else 4
  end,
  up.ultima_projetada;
$function$;

revoke all on function public.get_watchlist_projecao(uuid, integer) from public;
revoke all on function public.get_watchlist_projecao(uuid, integer) from anon;
grant execute on function public.get_watchlist_projecao(uuid, integer) to authenticated;
grant execute on function public.get_watchlist_projecao(uuid, integer) to service_role;
