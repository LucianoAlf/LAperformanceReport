
-- Lista de inadimplentes de uma unidade (read-only, service_role).
-- Fonte: emusys_faturas (abertas + vencidas ha >= carencia dias). So alunos ATIVOS.
-- grave = atraso >= p_grave_dias (tratamento separado). NUNCA escreve nada.
create or replace function public.sol_caixa_inadimplentes(
  p_unidade_id uuid,
  p_carencia_dias int default 2,
  p_grave_dias int default 30
) returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with cob as (
    select f.emusys_student_id,
           count(*) parcelas,
           count(distinct to_char(f.competencia,'MM/YYYY')) meses,
           min(f.data_vencimento) mais_antiga,
           sum(f.valor_original) valor
    from emusys_faturas f
    where f.status = 'aberta'
      and f.unidade_id = p_unidade_id
      and (current_date - f.data_vencimento) >= p_carencia_dias
    group by f.emusys_student_id
  ),
  j as (
    select a.nome,
           coalesce(c2.nome, '') curso,
           coalesce(a.whatsapp, a.telefone) contato,
           cob.parcelas,
           cob.meses,
           (current_date - cob.mais_antiga) dias,
           round(cob.valor, 2) valor,
           ((current_date - cob.mais_antiga) >= p_grave_dias) grave
    from cob
    join alunos a on a.emusys_student_id = cob.emusys_student_id::text
                 and a.unidade_id = p_unidade_id
    left join cursos c2 on a.curso_id = c2.id
    where a.status ilike 'ativo%'
  )
  select jsonb_build_object(
    'unidade_id', p_unidade_id,
    'gerado_em', to_char((now() at time zone 'America/Sao_Paulo'), 'DD/MM/YYYY HH24:MI'),
    'carencia_dias', p_carencia_dias,
    'grave_dias', p_grave_dias,
    'total_alunos', (select count(*) from j),
    'total_devido', coalesce((select sum(valor) from j), 0),
    'graves', (select count(*) from j where grave),
    'alunos', coalesce((
      select jsonb_agg(x order by x.grave desc, x.dias desc, x.valor desc)
      from (select nome, curso, contato, parcelas, meses, dias, valor, grave from j) x
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.sol_caixa_inadimplentes(uuid,int,int) from public, anon, authenticated;
grant execute on function public.sol_caixa_inadimplentes(uuid,int,int) to service_role;
