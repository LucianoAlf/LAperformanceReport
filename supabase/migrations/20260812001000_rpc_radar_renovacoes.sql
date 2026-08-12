-- 2026-08-12 — RPC: get_radar_renovacoes
--
-- Agrega as últimas aulas projetadas por mês — previsão de receita futura
-- distribuída ao longo do ano. Mostra quantos contratos terminam em cada mês.

create or replace function public.get_radar_renovacoes(
  p_unidade_id uuid default null
)
returns table(
  mes date,
  total_contratos integer,
  receita_projetada numeric
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
    max(pa.data_projetada) as ultima_projetada
  from projecao_aulas pa
  where pa.status = 'projetada'
  group by pa.aluno_id, pa.matricula_disciplina_id, pa.unidade_id
),
contratos_com_valor as (
  select
    up.*,
    j.nr_aulas_contratadas,
    -- Valor da parcela: busca da última movimentação de renovação ou matrícula
    coalesce(
      (select m.valor
       from movimentacoes_admin m
       where m.aluno_id = up.aluno_id
         and m.tipo in ('matricula', 'renovacao')
         and m.anulado = false
       order by m.data_movimento desc
       limit 1),
      0
    ) as valor_parcela
  from ultimas_projecoes up
  join aluno_jornada_matricula_disciplina j
    on j.aluno_id = up.aluno_id and j.emusys_matricula_disciplina_id = up.matricula_disciplina_id
  where j.status_matricula = 'ativa'
)
select
  date_trunc('month', ultima_projetada)::date as mes,
  count(*)::integer as total_contratos,
  sum(valor_parcela) as receita_projetada
from contratos_com_valor
where (p_unidade_id is null or unidade_id = p_unidade_id)
  and ultima_projetada >= current_date
group by date_trunc('month', ultima_projetada)
order by mes;
$function$;

revoke all on function public.get_radar_renovacoes(uuid) from public;
revoke all on function public.get_radar_renovacoes(uuid) from anon;
grant execute on function public.get_radar_renovacoes(uuid) to authenticated;
grant execute on function public.get_radar_renovacoes(uuid) to service_role;
