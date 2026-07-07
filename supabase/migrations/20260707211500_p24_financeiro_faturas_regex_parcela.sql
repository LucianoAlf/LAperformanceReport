-- P24 - Corrige identificacao de parcelas no financeiro Emusys
--
-- O regex POSIX do Postgres nao trata \s como whitespace. Usamos uma regra
-- simples e auditavel para as descricoes da API: "Parcela ...".

create or replace function public.get_financeiro_faturas_emusys(
  p_unidade_id uuid default null::uuid,
  p_ano integer default (extract(year from (now() at time zone 'America/Sao_Paulo'::text)))::integer,
  p_mes integer default (extract(month from (now() at time zone 'America/Sao_Paulo'::text)))::integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_competencia date := make_date(p_ano, p_mes, 1);
  v_por_unidade jsonb := '[]'::jsonb;
  v_totais jsonb := '{}'::jsonb;
begin
  with aluno_por_matricula as (
    select distinct on ((a.emusys_matricula_id)::bigint)
      (a.emusys_matricula_id)::bigint as emusys_matricula_id,
      a.id as aluno_id,
      a.status as aluno_status,
      coalesce(a.is_segundo_curso, false) as is_segundo_curso,
      coalesce(tm.conta_como_pagante, false) as conta_como_pagante,
      coalesce(tm.entra_ticket_medio, false) as entra_ticket_medio,
      coalesce(c.is_projeto_banda, false) as is_projeto_banda
    from public.alunos a
    left join public.tipos_matricula tm on tm.id = a.tipo_matricula_id
    left join public.cursos c on c.id = a.curso_id
    where a.emusys_matricula_id ~ '^[0-9]+$'
    order by
      (a.emusys_matricula_id)::bigint,
      case
        when a.status in ('ativo', 'aviso_previo', 'trancado') then 0
        when a.status = 'evadido' then 1
        else 2
      end,
      case
        when coalesce(tm.conta_como_pagante, false)
          and coalesce(tm.entra_ticket_medio, false)
          and not coalesce(a.is_segundo_curso, false)
          and not coalesce(c.is_projeto_banda, false)
          then 0
        else 1
      end,
      a.data_saida desc nulls last,
      a.id desc
  ),
  base as (
    select
      f.*,
      u.nome as unidade_nome,
      apm.aluno_id as aluno_local_id,
      apm.conta_como_pagante,
      apm.entra_ticket_medio,
      apm.is_segundo_curso,
      apm.is_projeto_banda,
      (lower(trim(f.descricao)) like 'parcela %') as eh_parcela,
      case
        when f.status = 'paga' then coalesce(f.valor_pago, 0)
        else coalesce(f.valor_original, 0) + coalesce(f.juros_e_multa, 0) - coalesce(f.desconto_aplicado, 0)
      end as valor_competencia,
      case when f.status = 'paga' then coalesce(f.valor_pago, 0) else 0 end as valor_recebido
    from public.emusys_faturas f
    join public.unidades u on u.id = f.unidade_id
    left join aluno_por_matricula apm on apm.emusys_matricula_id = f.emusys_matricula_id
    where f.competencia = v_competencia
      and (p_unidade_id is null or f.unidade_id = p_unidade_id)
  ),
  agregada as (
    select
      unidade_id,
      max(unidade_nome) as unidade_nome,
      max(unidade_codigo) as unidade_codigo,
      count(*) filter (where eh_parcela) as faturas_parcela,
      count(*) filter (where eh_parcela and status = 'paga') as faturas_parcela_pagas,
      count(*) filter (where eh_parcela and status <> 'paga') as faturas_parcela_abertas,
      count(distinct emusys_student_id) filter (where eh_parcela) as alunos_emusys_com_parcela,
      count(distinct emusys_student_id) filter (where eh_parcela and status = 'paga') as alunos_emusys_com_parcela_paga,
      count(distinct aluno_local_id) filter (where eh_parcela) as alunos_locais_com_parcela,
      count(distinct aluno_local_id) filter (where eh_parcela and status = 'paga') as alunos_locais_com_parcela_paga,
      count(distinct emusys_matricula_id) filter (where eh_parcela and aluno_local_id is null) as matriculas_sem_match,
      sum(valor_recebido) filter (where eh_parcela) as total_recebido_parcelas,
      sum(valor_competencia) filter (where eh_parcela) as faturamento_previsto_parcelas,
      sum(valor_competencia) filter (where eh_parcela and status <> 'paga') as valor_aberto_parcelas,
      sum(coalesce(valor_pago, 0)) filter (where not eh_parcela and status = 'paga') as total_recebido_nao_parcelas
    from base
    group by unidade_id
  ),
  por_unidade as (
    select
      unidade_id,
      unidade_nome,
      unidade_codigo,
      faturas_parcela,
      faturas_parcela_pagas,
      faturas_parcela_abertas,
      alunos_emusys_com_parcela,
      alunos_emusys_com_parcela_paga,
      alunos_locais_com_parcela,
      alunos_locais_com_parcela_paga,
      matriculas_sem_match,
      coalesce(total_recebido_parcelas, 0)::numeric(12,2) as mrr_atual,
      coalesce(faturamento_previsto_parcelas, 0)::numeric(12,2) as faturamento_previsto,
      coalesce(valor_aberto_parcelas, 0)::numeric(12,2) as valor_aberto_parcelas,
      coalesce(total_recebido_nao_parcelas, 0)::numeric(12,2) as total_recebido_nao_parcelas,
      case
        when coalesce(alunos_locais_com_parcela_paga, 0) > 0
          then round(coalesce(total_recebido_parcelas, 0)::numeric / alunos_locais_com_parcela_paga, 2)
        when coalesce(alunos_emusys_com_parcela_paga, 0) > 0
          then round(coalesce(total_recebido_parcelas, 0)::numeric / alunos_emusys_com_parcela_paga, 2)
        else 0::numeric
      end as ticket_medio,
      case
        when coalesce(alunos_locais_com_parcela, 0) > 0
          then round(coalesce(faturamento_previsto_parcelas, 0)::numeric / alunos_locais_com_parcela, 2)
        when coalesce(alunos_emusys_com_parcela, 0) > 0
          then round(coalesce(faturamento_previsto_parcelas, 0)::numeric / alunos_emusys_com_parcela, 2)
        else 0::numeric
      end as ticket_medio_previsto
    from agregada
  )
  select
    coalesce(jsonb_agg(to_jsonb(pu) order by unidade_nome), '[]'::jsonb),
    coalesce(
      jsonb_build_object(
        'unidade_id', null,
        'unidade_nome', case when p_unidade_id is null then 'Consolidado' else max(unidade_nome) end,
        'faturas_parcela', coalesce(sum(faturas_parcela), 0),
        'faturas_parcela_pagas', coalesce(sum(faturas_parcela_pagas), 0),
        'faturas_parcela_abertas', coalesce(sum(faturas_parcela_abertas), 0),
        'alunos_emusys_com_parcela', coalesce(sum(alunos_emusys_com_parcela), 0),
        'alunos_emusys_com_parcela_paga', coalesce(sum(alunos_emusys_com_parcela_paga), 0),
        'alunos_locais_com_parcela', coalesce(sum(alunos_locais_com_parcela), 0),
        'alunos_locais_com_parcela_paga', coalesce(sum(alunos_locais_com_parcela_paga), 0),
        'matriculas_sem_match', coalesce(sum(matriculas_sem_match), 0),
        'mrr_atual', coalesce(sum(mrr_atual), 0)::numeric(12,2),
        'faturamento_previsto', coalesce(sum(faturamento_previsto), 0)::numeric(12,2),
        'valor_aberto_parcelas', coalesce(sum(valor_aberto_parcelas), 0)::numeric(12,2),
        'total_recebido_nao_parcelas', coalesce(sum(total_recebido_nao_parcelas), 0)::numeric(12,2),
        'ticket_medio', case
          when coalesce(sum(alunos_locais_com_parcela_paga), 0) > 0
            then round(coalesce(sum(mrr_atual), 0)::numeric / sum(alunos_locais_com_parcela_paga), 2)
          when coalesce(sum(alunos_emusys_com_parcela_paga), 0) > 0
            then round(coalesce(sum(mrr_atual), 0)::numeric / sum(alunos_emusys_com_parcela_paga), 2)
          else 0::numeric
        end,
        'ticket_medio_previsto', case
          when coalesce(sum(alunos_locais_com_parcela), 0) > 0
            then round(coalesce(sum(faturamento_previsto), 0)::numeric / sum(alunos_locais_com_parcela), 2)
          when coalesce(sum(alunos_emusys_com_parcela), 0) > 0
            then round(coalesce(sum(faturamento_previsto), 0)::numeric / sum(alunos_emusys_com_parcela), 2)
          else 0::numeric
        end
      ),
      '{}'::jsonb
    )
  into v_por_unidade, v_totais
  from por_unidade pu;

  return jsonb_build_object(
    'ano', p_ano,
    'mes', p_mes,
    'competencia', v_competencia,
    'tem_dados', jsonb_array_length(v_por_unidade) > 0,
    'fonte', 'emusys_faturas_v1',
    'regra', 'Somente descricoes Parcela; MRR atual usa valor_pago; faturamento previsto usa pagas + abertas por vencimento; ticket usa alunos locais vinculados as parcelas pagas.',
    'por_unidade', v_por_unidade,
    'totais', v_totais
  );
end;
$function$;
