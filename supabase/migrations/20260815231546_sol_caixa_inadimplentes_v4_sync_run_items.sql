
-- v4: FONTE CORRETA = sync_run_items (ultimo run completo por competencia),
-- nao mais o espelho legado emusys_faturas. Em atraso = status='aberta' + vencido
-- + NOT source_missing. Valor = valor_original (sem desconto) + multa + mora (contrato).
create or replace function public.sol_caixa_inadimplentes(
  p_unidade_id uuid,
  p_carencia_dias int default 2,
  p_multa_pct numeric default 0.02,
  p_mora_pct_mes numeric default 0.01,
  p_grave_dias int default 30,
  p_critico_dias int default 40
) returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with runs as (
    select distinct on (competencia) id, competencia
    from sync_runs
    where run_type='live' and status='succeeded'
      and snapshot_complete=true and unidades_concluidas=3
    order by competencia, completed_at desc
  ),
  cob as (
    select i.emusys_student_id,
           count(*) parcelas,
           count(distinct to_char(i.competencia,'MM/YYYY')) meses,
           min(i.data_vencimento) mais_antiga,
           max(current_date - i.data_vencimento) dias,
           sum(i.valor_original) valor_original,
           sum(i.valor_original * (1 + p_multa_pct
                 + p_mora_pct_mes * ((current_date - i.data_vencimento)::numeric / 30.0))) valor_atualizado
    from runs r
    join sync_run_items i on i.run_id = r.id
    where i.unidade_id = p_unidade_id
      and i.status = 'aberta'
      and coalesce(i.source_missing, false) = false
      and (current_date - i.data_vencimento) >= p_carencia_dias
    group by i.emusys_student_id
  ),
  j as (
    select a.nome,
           coalesce(c2.nome, '') curso,
           a.contato,
           cob.parcelas,
           cob.meses,
           cob.dias,
           round(cob.valor_original, 2) valor_original,
           round(cob.valor_atualizado, 2) valor_atualizado,
           case when cob.dias > p_critico_dias then 'critico'
                when cob.dias > p_grave_dias then 'atencao'
                else 'normal' end faixa
    from cob
    join lateral (
      select al.nome, al.curso_id, coalesce(al.whatsapp, al.telefone) contato
      from alunos al
      where al.emusys_student_id = cob.emusys_student_id::text
        and al.unidade_id = p_unidade_id
        and al.status ilike 'ativo%'
      order by al.updated_at desc nulls last, al.id desc
      limit 1
    ) a on true
    left join cursos c2 on a.curso_id = c2.id
  )
  select jsonb_build_object(
    'unidade_id', p_unidade_id,
    'fonte', 'sync_run_items',
    'gerado_em', to_char((now() at time zone 'America/Sao_Paulo'), 'DD/MM/YYYY HH24:MI'),
    'carencia_dias', p_carencia_dias,
    'grave_dias', p_grave_dias,
    'critico_dias', p_critico_dias,
    'juros', jsonb_build_object('multa_pct', p_multa_pct, 'mora_pct_mes', p_mora_pct_mes, 'provisorio', true),
    'total_alunos', (select count(*) from j),
    'total_original', coalesce((select sum(valor_original) from j), 0),
    'total_atualizado', coalesce((select round(sum(valor_atualizado),2) from j), 0),
    'faixas', jsonb_build_object(
        'critico', (select count(*) from j where faixa='critico'),
        'atencao', (select count(*) from j where faixa='atencao'),
        'normal',  (select count(*) from j where faixa='normal')),
    'alunos', coalesce((
      select jsonb_agg(x order by x.dias desc, x.valor_atualizado desc)
      from (select nome, curso, contato, parcelas, meses, dias, valor_original, valor_atualizado, faixa from j) x
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.sol_caixa_inadimplentes(uuid,int,numeric,numeric,int,int) from public, anon, authenticated;
grant execute on function public.sol_caixa_inadimplentes(uuid,int,numeric,numeric,int,int) to service_role;
