-- Emusys v1.3.1: contrato canonico do estado operacional atual.
--
-- Regras:
-- - ativa entra nas bases vivas;
-- - trancada permanece visivel, mas fora de carteira, financeiro, presenca,
--   Health Score e churn atual;
-- - inativa/interrompida e inativa/concluida permanecem separadas;
-- - estado bruto desconhecido nunca recebe fallback para ativo;
-- - snapshots e fechamentos historicos nao sao reescritos.

create or replace view public.vw_alunos_estado_operacional_v131
with (security_invoker = true) as
with estado_por_aluno as (
  select
    a.id as aluno_id,
    a.unidade_id,
    a.emusys_matricula_id,
    a.status as status_local_legado,
    e.unidade_id is not null as raw_encontrado,
    e.status_emusys,
    e.status_local_resolvido,
    e.motivo_inativa,
    e.motivo_inativa_bruto,
    e.tipo_movimento_resolvido,
    e.motivo_auditoria,
    e.trancamento_id,
    e.trancamento_motivo,
    e.trancamento_data_inicial,
    e.trancamento_data_final,
    e.sincronizado_em,
    case
      when e.unidade_id is not null
        then coalesce(e.status_local_resolvido, 'desconhecido')
      when a.status = 'ativo' then 'ativo'
      when a.status = 'trancado' then 'trancado'
      when a.status = 'evadido' then 'evadido'
      when a.status = 'inativo' then 'inativo'
      else 'desconhecido'
    end as status_operacional
  from public.alunos a
  left join lateral (
    select estado.*
    from public.emusys_matriculas_estado_atual estado
    where estado.unidade_id = a.unidade_id
      and (
        (
          nullif(btrim(a.emusys_matricula_id), '') is not null
          and estado.emusys_matricula_id::text = btrim(a.emusys_matricula_id)
        )
        or estado.aluno_id = a.id
      )
    order by
      (
        nullif(btrim(a.emusys_matricula_id), '') is not null
        and estado.emusys_matricula_id::text = btrim(a.emusys_matricula_id)
      ) desc,
      estado.sincronizado_em desc
    limit 1
  ) e on true
)
select
  x.aluno_id,
  x.unidade_id,
  x.emusys_matricula_id,
  x.raw_encontrado,
  x.status_emusys,
  x.status_local_resolvido,
  x.status_local_legado,
  x.status_operacional,
  x.motivo_inativa,
  x.motivo_inativa_bruto,
  x.tipo_movimento_resolvido,
  x.motivo_auditoria,
  (x.status_operacional = 'ativo') as entra_base_ativa,
  (x.status_operacional = 'ativo') as entra_carteira_professor,
  (x.status_operacional = 'ativo') as entra_financeiro_ativo,
  (x.status_operacional = 'ativo') as entra_denominador_presenca,
  (x.status_operacional = 'ativo') as entra_health_score,
  (x.status_operacional = 'ativo') as entra_churn_atual,
  (
    case
      when x.raw_encontrado then x.status_emusys = 'trancada'
      else x.status_operacional = 'trancado'
    end
  ) as eh_trancamento_atual,
  (
    x.raw_encontrado
    and x.status_emusys = 'inativa'
    and x.motivo_inativa = 'interrompida'
  ) as eh_interrupcao_definitiva,
  (
    x.raw_encontrado
    and x.status_emusys = 'inativa'
    and x.motivo_inativa = 'concluida'
  ) as eh_contrato_concluido,
  x.trancamento_id,
  x.trancamento_motivo,
  x.trancamento_data_inicial,
  x.trancamento_data_final,
  case when x.raw_encontrado then 'emusys_v131' else 'alunos_compat' end as fonte_estado,
  x.sincronizado_em
from estado_por_aluno x;

comment on view public.vw_alunos_estado_operacional_v131 is
  'Projecao viva por linha operacional do aluno. Fallback legado somente sem estado bruto; estado bruto ambiguo permanece desconhecido.';

revoke all on table public.vw_alunos_estado_operacional_v131
  from public, anon, authenticated;
grant select on table public.vw_alunos_estado_operacional_v131
  to service_role;

create or replace function public.get_kpis_alunos_admin_operacional(
  p_unidade_id uuid default null::uuid,
  p_ano integer default (
    extract(year from (now() at time zone 'America/Sao_Paulo'))
  )::integer,
  p_mes integer default (
    extract(month from (now() at time zone 'America/Sao_Paulo'))
  )::integer
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $function$
with params as (
  select
    make_date(p_ano, p_mes, 1)::date as inicio_mes,
    least(
      (now() at time zone 'America/Sao_Paulo')::date,
      (make_date(p_ano, p_mes, 1) + interval '1 month' - interval '1 day')::date
    ) as data_corte
),
unidades_base as (
  select u.id as unidade_id, u.nome as unidade_nome
  from public.unidades u
  where u.ativo = true
    and (p_unidade_id is null or u.id = p_unidade_id)
),
alunos_base as (
  select
    a.id,
    a.unidade_id,
    a.nome,
    a.idade_atual,
    eo.status_operacional,
    eo.entra_base_ativa,
    eo.eh_trancamento_atual,
    a.data_matricula,
    a.data_saida,
    coalesce(a.valor_parcela, 0)::numeric as valor_parcela,
    coalesce(a.is_segundo_curso, false) as is_segundo_curso,
    case
      when btrim(coalesce(a.nome, '')) <> ''
        then lower(btrim(a.nome)) || '|' || a.unidade_id::text
      else a.id::text || '|' || a.unidade_id::text
    end as pessoa_key,
    coalesce(c.is_projeto_banda, false) as curso_banda,
    lower(coalesce(c.nome, '')) like '%coral%' as is_coral,
    coalesce(tm.codigo, '') as tipo_codigo,
    coalesce(tm.conta_como_pagante, false) as conta_como_pagante,
    coalesce(tm.entra_ticket_medio, false) as entra_ticket_medio
  from public.alunos a
  join unidades_base ub on ub.unidade_id = a.unidade_id
  join public.vw_alunos_estado_operacional_v131 eo on eo.aluno_id = a.id
  left join public.cursos c on c.id = a.curso_id
  left join public.tipos_matricula tm on tm.id = a.tipo_matricula_id
  where a.arquivado_em is null
),
alunos_classificados as (
  select
    ab.*,
    (ab.curso_banda = true or ab.tipo_codigo = 'BANDA') as is_banda_operacional,
    (ab.is_segundo_curso = true and ab.tipo_codigo <> 'REGULAR') as is_segundo_operacional,
    ab.entra_base_ativa as entra_carteira_operacional
  from alunos_base ab
),
pessoas_ativas as (
  select
    ac.unidade_id,
    ac.pessoa_key,
    max(ac.idade_atual) as idade_atual,
    sum(
      case
        when ac.entra_ticket_medio = true
          and ac.valor_parcela > 0
          and ac.tipo_codigo not in ('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA')
        then ac.valor_parcela
        else 0
      end
    ) as mrr,
    bool_or(
      ac.tipo_codigo = 'BOLSISTA_INT'
      and ac.is_banda_operacional = false
      and ac.is_segundo_operacional = false
    ) as bolsista_integral_regular,
    bool_or(
      ac.tipo_codigo = 'BOLSISTA_INT'
      and ac.is_banda_operacional = false
      and ac.is_segundo_operacional = true
    ) as bolsista_integral_segundo,
    bool_or(
      ac.tipo_codigo = 'BOLSISTA_PARC'
      and ac.is_banda_operacional = false
    ) as bolsista_parcial,
    count(*) filter (
      where ac.is_segundo_operacional = true
        and ac.is_banda_operacional = false
        and ac.is_coral = false
    )::integer as segundos_cursos
  from alunos_classificados ac
  where ac.entra_base_ativa = true
  group by ac.unidade_id, ac.pessoa_key
),
matriculas_ativas as (
  select
    ub.unidade_id,
    count(ac.id) filter (
      where ac.entra_base_ativa = true
        and ac.is_banda_operacional = true
    )::integer as matriculas_banda,
    count(ac.id) filter (
      where ac.entra_base_ativa = true
        and ac.is_segundo_operacional = true
        and ac.is_banda_operacional = false
        and ac.is_coral = false
    )::integer as matriculas_2_curso,
    count(distinct ac.pessoa_key) filter (
      where ac.entra_base_ativa = true
        and ac.is_segundo_operacional = true
        and ac.is_banda_operacional = false
        and ac.is_coral = false
    )::integer as alunos_com_2_curso,
    count(ac.id) filter (
      where ac.entra_base_ativa = true
        and ac.is_coral = true
    )::integer as matriculas_coral
  from unidades_base ub
  left join alunos_classificados ac on ac.unidade_id = ub.unidade_id
  group by ub.unidade_id
),
trancados as (
  select
    ub.unidade_id,
    count(distinct ac.pessoa_key) filter (
      where ac.eh_trancamento_atual = true
        and ac.is_banda_operacional = false
        and ac.is_coral = false
    )::integer as alunos_trancados
  from unidades_base ub
  left join alunos_classificados ac on ac.unidade_id = ub.unidade_id
  group by ub.unidade_id
),
novas as (
  select
    ub.unidade_id,
    count(distinct ac.pessoa_key) filter (
      where ac.entra_base_ativa = true
        and ac.data_matricula >= p.inicio_mes
        and ac.data_matricula <= p.data_corte
        and ac.is_banda_operacional = false
        and ac.is_segundo_operacional = false
        and ac.is_coral = false
        and ac.tipo_codigo not in (
          'BOLSISTA_INT',
          'BOLSISTA_PARC',
          'BANDA',
          'SEGUNDO_CURSO',
          'TRANSFERENCIA'
        )
        and (ac.conta_como_pagante = true or ac.entra_ticket_medio = true)
        and ac.valor_parcela > 0
    )::integer as novas_matriculas
  from unidades_base ub
  cross join params p
  left join alunos_classificados ac on ac.unidade_id = ub.unidade_id
  group by ub.unidade_id
),
por_unidade as (
  select
    ub.unidade_id,
    ub.unidade_nome,
    p_ano as ano,
    p_mes as mes,
    count(pa.pessoa_key)::integer as alunos_ativos,
    count(pa.pessoa_key)::integer as total_alunos_ativos,
    count(pa.pessoa_key) filter (where pa.mrr > 0)::integer as alunos_pagantes,
    count(pa.pessoa_key) filter (
      where pa.mrr > 0
    )::integer as total_alunos_pagantes,
    greatest(
      count(pa.pessoa_key)::integer
        - count(pa.pessoa_key) filter (where pa.mrr > 0)::integer,
      0
    )::integer as alunos_nao_pagantes,
    count(pa.pessoa_key) filter (
      where pa.bolsista_integral_regular = true
    )::integer as bolsistas_integrais,
    count(pa.pessoa_key) filter (
      where pa.bolsista_integral_regular = true
    )::integer as total_bolsistas_integrais,
    count(pa.pessoa_key) filter (
      where pa.bolsista_integral_regular = true
    )::integer as bolsistas_integrais_regulares,
    count(pa.pessoa_key) filter (
      where pa.bolsista_integral_segundo = true
        and pa.bolsista_integral_regular = false
    )::integer as bolsistas_integrais_segundo_curso,
    count(pa.pessoa_key) filter (
      where pa.bolsista_parcial = true
    )::integer as bolsistas_parciais,
    count(pa.pessoa_key) filter (
      where pa.bolsista_parcial = true
    )::integer as total_bolsistas_parciais,
    coalesce(t.alunos_trancados, 0)::integer as alunos_trancados,
    coalesce(n.novas_matriculas, 0)::integer as novas_matriculas,
    count(pa.pessoa_key) filter (
      where pa.idade_atual is not null and pa.idade_atual <= 11
    )::integer as alunos_kids,
    count(pa.pessoa_key) filter (
      where pa.idade_atual is not null and pa.idade_atual >= 12
    )::integer as alunos_school,
    count(pa.pessoa_key) filter (
      where pa.idade_atual is null
    )::integer as alunos_sem_classificacao,
    count(pa.pessoa_key)::integer as matriculas_base_alunos_ativos,
    coalesce(ma.matriculas_banda, 0)::integer as matriculas_banda,
    coalesce(ma.matriculas_2_curso, 0)::integer as matriculas_2_curso,
    coalesce(ma.alunos_com_2_curso, 0)::integer as alunos_com_2_curso,
    greatest(
      coalesce(ma.matriculas_2_curso, 0)
        - coalesce(ma.alunos_com_2_curso, 0),
      0
    )::integer as matriculas_2_curso_extras,
    coalesce(ma.matriculas_coral, 0)::integer as matriculas_coral,
    (
      count(pa.pessoa_key)::integer
      + coalesce(ma.matriculas_banda, 0)
      + coalesce(ma.matriculas_2_curso, 0)
      + coalesce(ma.matriculas_coral, 0)
    )::integer as matriculas_ativas
  from unidades_base ub
  left join pessoas_ativas pa on pa.unidade_id = ub.unidade_id
  left join matriculas_ativas ma on ma.unidade_id = ub.unidade_id
  left join trancados t on t.unidade_id = ub.unidade_id
  left join novas n on n.unidade_id = ub.unidade_id
  group by
    ub.unidade_id,
    ub.unidade_nome,
    ma.matriculas_banda,
    ma.matriculas_2_curso,
    ma.alunos_com_2_curso,
    ma.matriculas_coral,
    t.alunos_trancados,
    n.novas_matriculas
),
totais as (
  select
    sum(alunos_ativos)::integer as alunos_ativos,
    sum(total_alunos_ativos)::integer as total_alunos_ativos,
    sum(alunos_pagantes)::integer as alunos_pagantes,
    sum(total_alunos_pagantes)::integer as total_alunos_pagantes,
    sum(alunos_nao_pagantes)::integer as alunos_nao_pagantes,
    sum(bolsistas_integrais)::integer as bolsistas_integrais,
    sum(total_bolsistas_integrais)::integer as total_bolsistas_integrais,
    sum(bolsistas_integrais_regulares)::integer as bolsistas_integrais_regulares,
    sum(bolsistas_integrais_segundo_curso)::integer
      as bolsistas_integrais_segundo_curso,
    sum(bolsistas_parciais)::integer as bolsistas_parciais,
    sum(total_bolsistas_parciais)::integer as total_bolsistas_parciais,
    sum(alunos_trancados)::integer as alunos_trancados,
    sum(novas_matriculas)::integer as novas_matriculas,
    sum(alunos_kids)::integer as alunos_kids,
    sum(alunos_school)::integer as alunos_school,
    sum(alunos_sem_classificacao)::integer as alunos_sem_classificacao,
    sum(matriculas_base_alunos_ativos)::integer as matriculas_base_alunos_ativos,
    sum(matriculas_banda)::integer as matriculas_banda,
    sum(matriculas_2_curso)::integer as matriculas_2_curso,
    sum(alunos_com_2_curso)::integer as alunos_com_2_curso,
    sum(matriculas_2_curso_extras)::integer as matriculas_2_curso_extras,
    sum(matriculas_coral)::integer as matriculas_coral,
    sum(matriculas_ativas)::integer as matriculas_ativas
  from por_unidade
)
select jsonb_build_object(
  'fonte', 'admin_operacional_v131',
  'periodo', jsonb_build_object(
    'ano', p_ano,
    'mes', p_mes,
    'unidade_id', p_unidade_id
  ),
  'totais', to_jsonb(totais.*),
  'por_unidade', coalesce(
    (
      select jsonb_agg(to_jsonb(por_unidade.*) order by unidade_nome)
      from por_unidade
    ),
    '[]'::jsonb
  ),
  'alertas_fonte', jsonb_build_array(
    'Base viva: somente matriculas ativas. Trancamentos atuais aparecem em indicador separado.'
  )
)
from totais;
$function$;

comment on function public.get_kpis_alunos_admin_operacional(
  uuid,
  integer,
  integer
) is
  'KPIs administrativos vivos v1.3.1: ativo conta; trancado atual fica separado e fora da base ativa.';

revoke all on function public.get_kpis_alunos_admin_operacional(
  uuid,
  integer,
  integer
) from public, anon;
grant execute on function public.get_kpis_alunos_admin_operacional(
  uuid,
  integer,
  integer
) to authenticated, service_role;

create or replace function public.get_kpis_alunos_financeiro_vivo_canonico(
  p_unidade_id uuid default null::uuid,
  p_ano integer default (
    extract(year from (now() at time zone 'America/Sao_Paulo'))
  )::integer,
  p_mes integer default (
    extract(month from (now() at time zone 'America/Sao_Paulo'))
  )::integer
)
returns table (
  unidade_id uuid,
  mrr numeric,
  alunos_pagantes integer,
  inadimplentes integer,
  inadimplencia_valor numeric,
  inadimplencia_pct numeric,
  faturamento_realizado numeric,
  reajustes_validos integer,
  reajuste_pct numeric
)
language sql
security definer
set search_path = public, pg_temp
as $function$
with params as (
  select
    (now() at time zone 'America/Sao_Paulo')::date as hoje,
    make_date(p_ano, p_mes, 1) as inicio_mes,
    least(
      (now() at time zone 'America/Sao_Paulo')::date,
      (make_date(p_ano, p_mes, 1) + interval '1 month' - interval '1 day')::date
    ) as data_corte
),
unidades_base as (
  select u.id as unidade_id
  from public.unidades u
  where u.ativo = true
    and (p_unidade_id is null or u.id = p_unidade_id)
),
alunos_base as (
  select
    a.id,
    a.nome,
    a.unidade_id,
    coalesce(a.valor_parcela, 0)::numeric as valor_parcela,
    coalesce(a.status_pagamento, '') as status_pagamento,
    coalesce(tm.entra_ticket_medio, false) as entra_ticket_medio,
    case
      when btrim(coalesce(a.nome, '')) <> ''
        then lower(btrim(a.nome)) || '|' || a.unidade_id::text
      else null
    end as pessoa_key
  from public.alunos a
  join unidades_base ub on ub.unidade_id = a.unidade_id
  join public.vw_alunos_estado_operacional_v131 eo on eo.aluno_id = a.id
  cross join params p
  left join public.tipos_matricula tm on tm.id = a.tipo_matricula_id
  where a.arquivado_em is null
    and eo.entra_base_ativa = true
    and (a.data_matricula is null or a.data_matricula <= p.data_corte)
    and (a.data_saida is null or a.data_saida > p.data_corte)
),
pessoas as (
  select
    ab.unidade_id,
    ab.pessoa_key,
    coalesce(sum(
      case
        when ab.entra_ticket_medio = true and ab.valor_parcela > 0
          then ab.valor_parcela
        else 0
      end
    ), 0)::numeric as mrr_pessoa,
    bool_or(
      lower(ab.status_pagamento) = 'inadimplente'
      and ab.valor_parcela > 0
    ) as inadimplente,
    coalesce(sum(
      case
        when lower(ab.status_pagamento) = 'inadimplente'
          and ab.valor_parcela > 0
        then ab.valor_parcela
        else 0
      end
    ), 0)::numeric as inadimplencia_valor_pessoa
  from alunos_base ab
  where ab.pessoa_key is not null
  group by ab.unidade_id, ab.pessoa_key
),
financeiro as (
  select
    ub.unidade_id,
    coalesce(sum(p.mrr_pessoa), 0)::numeric as mrr,
    count(p.pessoa_key) filter (where p.mrr_pessoa > 0)::integer as alunos_pagantes,
    count(p.pessoa_key) filter (
      where p.inadimplente = true
    )::integer as inadimplentes,
    coalesce(sum(p.inadimplencia_valor_pessoa), 0)::numeric
      as inadimplencia_valor
  from unidades_base ub
  left join pessoas p on p.unidade_id = ub.unidade_id
  group by ub.unidade_id
),
reajustes_base as (
  select
    ma.unidade_id,
    (
      (
        coalesce(ma.valor_parcela_novo, 0)::numeric
          - coalesce(ma.valor_parcela_anterior, 0)::numeric
      )
      / nullif(coalesce(ma.valor_parcela_anterior, 0)::numeric, 0)
    ) * 100 as percentual_reajuste
  from public.movimentacoes_admin ma
  join unidades_base ub on ub.unidade_id = ma.unidade_id
  cross join params p
  left join public.alunos a on a.id = ma.aluno_id
  left join public.cursos curso_mov on curso_mov.id = ma.curso_id
  left join public.cursos curso_aluno on curso_aluno.id = a.curso_id
  left join public.tipos_matricula tm on tm.id = a.tipo_matricula_id
  where ma.tipo = 'renovacao'
    and ma.data >= p.inicio_mes
    and ma.data <= p.data_corte
    and btrim(coalesce(ma.agente_comercial, '')) <> ''
    and coalesce(ma.valor_parcela_anterior, 0)::numeric > 0
    and coalesce(ma.valor_parcela_novo, 0)::numeric
      > coalesce(ma.valor_parcela_anterior, 0)::numeric
    and not coalesce(
      curso_mov.is_projeto_banda,
      curso_aluno.is_projeto_banda,
      false
    )
    and lower(coalesce(curso_mov.nome, curso_aluno.nome, '')) not like '%banda%'
    and lower(coalesce(curso_mov.nome, curso_aluno.nome, '')) not like '%garage%'
    and lower(coalesce(curso_mov.nome, curso_aluno.nome, '')) not like '%projeto%'
    and lower(coalesce(curso_mov.nome, curso_aluno.nome, '')) not like '%coral%'
    and coalesce(tm.codigo, '') not in (
      'BOLSISTA_INT',
      'BOLSISTA_PARC',
      'BANDA'
    )
    and coalesce(a.tipo_matricula_id, 0) not in (3, 4, 5)
    and lower(coalesce(a.classificacao, '')) not like '%bols%'
),
reajustes as (
  select
    ub.unidade_id,
    count(rb.percentual_reajuste)::integer as reajustes_validos,
    coalesce(avg(rb.percentual_reajuste), 0)::numeric as reajuste_pct
  from unidades_base ub
  left join reajustes_base rb on rb.unidade_id = ub.unidade_id
  group by ub.unidade_id
)
select
  f.unidade_id,
  f.mrr,
  f.alunos_pagantes,
  f.inadimplentes,
  f.inadimplencia_valor,
  case
    when f.alunos_pagantes > 0
      then round(f.inadimplentes::numeric / f.alunos_pagantes * 100, 2)
    else 0
  end as inadimplencia_pct,
  greatest(f.mrr - f.inadimplencia_valor, 0) as faturamento_realizado,
  coalesce(r.reajustes_validos, 0) as reajustes_validos,
  coalesce(round(r.reajuste_pct, 2), 0) as reajuste_pct
from financeiro f
left join reajustes r on r.unidade_id = f.unidade_id;
$function$;

comment on function public.get_kpis_alunos_financeiro_vivo_canonico(
  uuid,
  integer,
  integer
) is
  'Financeiro vivo v1.3.1: somente matriculas operacionais ativas entram em MRR, ticket e inadimplencia.';

revoke all on function public.get_kpis_alunos_financeiro_vivo_canonico(
  uuid,
  integer,
  integer
) from public, anon;
grant execute on function public.get_kpis_alunos_financeiro_vivo_canonico(
  uuid,
  integer,
  integer
) to authenticated, service_role;

create or replace function public.get_kpis_alunos_vinculos_vivo_canonico(
  p_unidade_id uuid default null::uuid,
  p_ano integer default (
    extract(year from (now() at time zone 'America/Sao_Paulo'))
  )::integer,
  p_mes integer default (
    extract(month from (now() at time zone 'America/Sao_Paulo'))
  )::integer
)
returns table (
  unidade_id uuid,
  matriculas_base_alunos_ativos integer,
  alunos_com_2_curso integer,
  matriculas_2_curso_extras integer,
  bolsistas_integrais_regulares integer,
  bolsistas_integrais_segundo_curso integer
)
language sql
security definer
set search_path = public, pg_temp
as $function$
with params as (
  select least(
    (now() at time zone 'America/Sao_Paulo')::date,
    (make_date(p_ano, p_mes, 1) + interval '1 month' - interval '1 day')::date
  ) as data_corte
),
unidades_base as (
  select u.id as unidade_id
  from public.unidades u
  where u.ativo = true
    and (p_unidade_id is null or u.id = p_unidade_id)
),
alunos_base as (
  select
    a.id,
    a.unidade_id,
    case
      when btrim(coalesce(a.nome, '')) <> ''
        then lower(btrim(a.nome)) || '|' || a.unidade_id::text
      else null
    end as pessoa_key,
    coalesce(a.is_segundo_curso, false) as is_segundo_curso,
    coalesce(c.is_projeto_banda, false) as is_banda,
    lower(coalesce(c.nome, '')) like '%coral%' as is_coral,
    coalesce(tm.codigo, '') as tipo_codigo
  from public.alunos a
  join unidades_base ub on ub.unidade_id = a.unidade_id
  join public.vw_alunos_estado_operacional_v131 eo on eo.aluno_id = a.id
  cross join params p
  left join public.cursos c on c.id = a.curso_id
  left join public.tipos_matricula tm on tm.id = a.tipo_matricula_id
  where a.arquivado_em is null
    and eo.entra_base_ativa = true
    and (a.data_matricula is null or a.data_matricula <= p.data_corte)
    and (a.data_saida is null or a.data_saida > p.data_corte)
),
pessoas as (
  select
    ab.unidade_id,
    ab.pessoa_key,
    count(*) filter (
      where ab.is_segundo_curso = true
        and ab.is_banda = false
        and ab.is_coral = false
    )::integer as segundos_cursos,
    bool_or(
      ab.tipo_codigo = 'BOLSISTA_INT'
      and ab.is_banda = false
      and ab.is_segundo_curso = false
    ) as bolsista_integral_regular,
    bool_or(
      ab.tipo_codigo = 'BOLSISTA_INT'
      and ab.is_banda = false
      and ab.is_segundo_curso = true
    ) as bolsista_integral_segundo_curso
  from alunos_base ab
  where ab.pessoa_key is not null
  group by ab.unidade_id, ab.pessoa_key
),
matriculas as (
  select
    ub.unidade_id,
    count(ab.id) filter (
      where ab.is_segundo_curso = true
        and ab.is_banda = false
        and ab.is_coral = false
    )::integer as matriculas_2_curso
  from unidades_base ub
  left join alunos_base ab on ab.unidade_id = ub.unidade_id
  group by ub.unidade_id
)
select
  ub.unidade_id,
  count(p.pessoa_key)::integer as matriculas_base_alunos_ativos,
  count(p.pessoa_key) filter (
    where p.segundos_cursos > 0
  )::integer as alunos_com_2_curso,
  greatest(
    coalesce(m.matriculas_2_curso, 0)
      - count(p.pessoa_key) filter (where p.segundos_cursos > 0),
    0
  )::integer as matriculas_2_curso_extras,
  count(p.pessoa_key) filter (
    where p.bolsista_integral_regular = true
  )::integer as bolsistas_integrais_regulares,
  count(p.pessoa_key) filter (
    where p.bolsista_integral_segundo_curso = true
      and p.bolsista_integral_regular = false
  )::integer as bolsistas_integrais_segundo_curso
from unidades_base ub
left join pessoas p on p.unidade_id = ub.unidade_id
left join matriculas m on m.unidade_id = ub.unidade_id
group by ub.unidade_id, m.matriculas_2_curso;
$function$;

comment on function public.get_kpis_alunos_vinculos_vivo_canonico(
  uuid,
  integer,
  integer
) is
  'Breakdown vivo v1.3.1: somente matriculas operacionais ativas entram na base de pessoas e vinculos.';

revoke all on function public.get_kpis_alunos_vinculos_vivo_canonico(
  uuid,
  integer,
  integer
) from public, anon;
grant execute on function public.get_kpis_alunos_vinculos_vivo_canonico(
  uuid,
  integer,
  integer
) to authenticated, service_role;

-- Helper necessario para a view security_invoker de Sucesso do Aluno.
-- Por participar de uma leitura autenticada, EXECUTE de authenticated e
-- intencional e nao deve ser removido por hardening generico.
create or replace function public.fn_aluno_entra_base_ativa_v131(
  p_aluno_id integer,
  p_unidade_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select
    case
      when coalesce(auth.role(), '') = 'service_role'
        or session_user = 'postgres'
        or public.fn_usuario_atual_tem_permissao('alunos.ver', p_unidade_id)
      then coalesce(
        (
          select eo.entra_base_ativa
          from public.vw_alunos_estado_operacional_v131 eo
          where eo.aluno_id = p_aluno_id
            and eo.unidade_id = p_unidade_id
          limit 1
        ),
        false
      )
      else false
    end;
$function$;

revoke all on function public.fn_aluno_entra_base_ativa_v131(integer, uuid)
  from public, anon;
grant execute on function public.fn_aluno_entra_base_ativa_v131(integer, uuid)
  to authenticated, service_role;

create or replace view public.vw_aluno_sucesso_lista
with (security_invoker = true) as
select
  a.id,
  a.nome,
  a.unidade_id,
  u.codigo as unidade_codigo,
  u.nome as unidade_nome,
  a.professor_atual_id,
  p.nome as professor_nome,
  a.curso_id,
  c.nome as curso_nome,
  a.tempo_permanencia_meses,
  a.status_pagamento,
  a.valor_parcela,
  case
    when ap.total_aulas > 0
      then round(
        100.0 * (ap.total_aulas - ap.faltas)::numeric / ap.total_aulas::numeric
      )::integer
    else null::integer
  end as percentual_presenca,
  a.data_matricula,
  a.dia_aula,
  a.horario_aula,
  a.modalidade,
  a.status,
  case
    when a.tempo_permanencia_meses is null then 'onboarding'::text
    when a.tempo_permanencia_meses < 3 then 'onboarding'::text
    when a.tempo_permanencia_meses < 6 then 'consolidacao'::text
    when a.tempo_permanencia_meses < 9 then 'encantamento'::text
    else 'renovacao'::text
  end as fase_jornada,
  a.health_score_numerico,
  a.health_score as health_status,
  a.health_score_updated_at,
  fb.feedback as ultimo_feedback,
  fb.observacao as ultimo_feedback_obs,
  fb.respondido_em as ultimo_feedback_data,
  fb.professor_id as ultimo_feedback_professor_id,
  coalesce(ac.total_acoes, 0) as total_acoes,
  coalesce(mt.metas_ativas, 0) as metas_ativas,
  a.responsavel_nome,
  a.responsavel_telefone,
  a.whatsapp,
  a.foto_url,
  ap.dias_sem_presenca
from public.alunos a
left join public.unidades u on a.unidade_id = u.id
left join public.professores p on a.professor_atual_id = p.id
left join public.cursos c on a.curso_id = c.id
left join public.vw_absenteismo_aluno ap on ap.aluno_id = a.id
left join lateral (
  select
    afp.feedback,
    afp.observacao,
    afp.respondido_em,
    afp.professor_id
  from public.aluno_feedback_professor afp
  where afp.aluno_id = a.id
  order by afp.competencia desc, afp.respondido_em desc
  limit 1
) fb on true
left join lateral (
  select count(*)::integer as total_acoes
  from public.aluno_acoes aa
  where aa.aluno_id = a.id
) ac on true
left join lateral (
  select count(*)::integer as metas_ativas
  from public.aluno_metas am
  where am.aluno_id = a.id
    and am.status::text = 'ativa'
) mt on true
where public.fn_aluno_entra_base_ativa_v131(a.id, a.unidade_id) = true
  and (a.is_segundo_curso is null or a.is_segundo_curso = false);

comment on view public.vw_aluno_sucesso_lista is
  'Lista viva do Sucesso do Aluno: somente estado operacional ativo da camada canonica v1.3.1.';

do $fideliza_v131$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(
    'public.get_programa_fideliza_dados(integer,integer,uuid)'::regprocedure
  )
  into v_def;

  v_new := regexp_replace(
    v_def,
    '\(SELECT COUNT\(\*\) FROM alunos a WHERE a\.unidade_id = u\.id AND a\.status IN \(''ativo'', ''trancado''\)\)',
    '(SELECT COUNT(*) FROM public.alunos a JOIN public.vw_alunos_estado_operacional_v131 eo ON eo.aluno_id = a.id WHERE a.unidade_id = u.id AND eo.entra_base_ativa = true)'
  );

  if v_new = v_def then
    raise exception
      'Fallback vivo de get_programa_fideliza_dados nao localizado; nada aplicado';
  end if;

  execute v_new;
end;
$fideliza_v131$;

comment on function public.get_programa_fideliza_dados(integer, integer, uuid) is
  'Programa Fideliza: movimentacoes_admin no historico e estado operacional v1.3.1 no fallback vivo.';

create or replace function public.features_churn_alunos_ativos()
returns table (
  aluno_id integer,
  unidade_id uuid,
  idade_atual numeric,
  tempo_permanencia_meses numeric,
  valor_parcela numeric,
  pct_desconto numeric,
  numero_renovacoes numeric,
  dias_desde_renovacao numeric,
  nunca_renovou numeric,
  taxa_presenca_geral numeric,
  taxa_presenca_60d numeric,
  taxa_presenca_30d numeric,
  dias_desde_ultima_aula numeric,
  dia_vencimento numeric,
  classificacao text,
  modalidade text,
  tipo_aluno text,
  status_pagamento text,
  tipo_matricula_nome text,
  canal_origem_nome text,
  forma_pagamento_nome text,
  is_segundo_curso text,
  is_aluno_retorno text,
  anamnese_preenchida text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
with presenca as (
  select
    p.aluno_id,
    count(*) as total_aulas,
    count(*) filter (where p.status = 'presente') as presencas,
    count(*) filter (where p.data_aula >= current_date - 60) as aulas_60d,
    count(*) filter (
      where p.status = 'presente'
        and p.data_aula >= current_date - 60
    ) as presencas_60d,
    count(*) filter (where p.data_aula >= current_date - 30) as aulas_30d,
    count(*) filter (
      where p.status = 'presente'
        and p.data_aula >= current_date - 30
    ) as presencas_30d,
    max(p.data_aula) as data_ultima_aula
  from public.aluno_presenca p
  group by p.aluno_id
)
select
  a.id as aluno_id,
  a.unidade_id,
  a.idade_atual::numeric,
  a.tempo_permanencia_meses::numeric,
  a.valor_parcela::numeric,
  case
    when a.valor_cheio > 0
      then (
        coalesce(a.desconto_fixo, 0)
          + coalesce(a.desconto_condicional, 0)
      ) / a.valor_cheio
    else 0
  end as pct_desconto,
  a.numero_renovacoes::numeric,
  case
    when a.data_ultima_renovacao is not null
      and (current_date - a.data_ultima_renovacao) >= 0
      then (current_date - a.data_ultima_renovacao)::numeric
    else null
  end as dias_desde_renovacao,
  case
    when a.data_ultima_renovacao is null
      or (current_date - a.data_ultima_renovacao) < 0
      then 1
    else 0
  end as nunca_renovou,
  case
    when coalesce(pr.total_aulas, 0) > 0
      then pr.presencas::numeric / pr.total_aulas
    else 0
  end as taxa_presenca_geral,
  case
    when coalesce(pr.aulas_60d, 0) > 0
      then pr.presencas_60d::numeric / pr.aulas_60d
    else 0
  end as taxa_presenca_60d,
  case
    when coalesce(pr.aulas_30d, 0) > 0
      then pr.presencas_30d::numeric / pr.aulas_30d
    else 0
  end as taxa_presenca_30d,
  (current_date - pr.data_ultima_aula)::numeric as dias_desde_ultima_aula,
  a.dia_vencimento::numeric,
  a.classificacao::text,
  a.modalidade::text,
  a.tipo_aluno::text,
  a.status_pagamento::text,
  tm.nome::text as tipo_matricula_nome,
  co.nome::text as canal_origem_nome,
  fp.nome::text as forma_pagamento_nome,
  case
    when a.is_segundo_curso is null then null
    when a.is_segundo_curso then 'True'
    else 'False'
  end as is_segundo_curso,
  case when a.is_aluno_retorno then 'True' else 'False' end as is_aluno_retorno,
  case when a.anamnese_preenchida then 'True' else 'False' end
    as anamnese_preenchida
from public.alunos a
join public.vw_alunos_estado_operacional_v131 eo on eo.aluno_id = a.id
left join presenca pr on pr.aluno_id = a.id
left join public.tipos_matricula tm on tm.id = a.tipo_matricula_id
left join public.canais_origem co on co.id = a.canal_origem_id
left join public.formas_pagamento fp on fp.id = a.forma_pagamento_id
where eo.entra_base_ativa = true
  and eo.entra_churn_atual = true
  and a.arquivado_em is null;
$function$;

comment on function public.features_churn_alunos_ativos() is
  'Features do churn apenas para a populacao operacional ativa v1.3.1. Modelo permanece em auditoria.';

revoke all on function public.features_churn_alunos_ativos()
  from public, anon, authenticated;
grant execute on function public.features_churn_alunos_ativos()
  to service_role;

create or replace function public.get_alunos_ativos_atuais_canonicos(
  p_unidade_id uuid default null::uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if p_unidade_id is not null
    and coalesce(auth.role(), '') <> 'service_role'
    and session_user <> 'postgres'
    and not public.fn_usuario_atual_tem_permissao('alunos.ver', p_unidade_id)
  then
    raise exception 'sem_permissao_unidade'
      using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'nome', a.nome,
        'unidade_id', a.unidade_id,
        'unidade_nome', u.nome,
        'status_operacional', eo.status_operacional,
        'fonte_estado', eo.fonte_estado,
        'emusys_matricula_id', a.emusys_matricula_id,
        'emusys_student_id', a.emusys_student_id,
        'data_nascimento', a.data_nascimento,
        'telefone', a.telefone,
        'whatsapp', a.whatsapp,
        'responsavel_telefone', a.responsavel_telefone,
        'data_matricula', a.data_matricula,
        'data_saida', a.data_saida,
        'valor_parcela', a.valor_parcela,
        'status_pagamento', a.status_pagamento,
        'idade_atual', a.idade_atual,
        'classificacao', a.classificacao,
        'is_segundo_curso', coalesce(a.is_segundo_curso, false),
        'curso_id', a.curso_id,
        'curso_nome', c.nome,
        'curso_is_projeto_banda', coalesce(c.is_projeto_banda, false),
        'tipo_matricula_id', a.tipo_matricula_id,
        'tipo_matricula_codigo', tm.codigo,
        'tipo_conta_como_pagante', coalesce(tm.conta_como_pagante, false),
        'tipo_entra_ticket_medio', coalesce(tm.entra_ticket_medio, false),
        'professor_atual_id', a.professor_atual_id,
        'professor_nome', p.nome,
        'dia_aula', a.dia_aula,
        'horario_aula', a.horario_aula
      )
      order by u.nome, a.nome, c.nome
    ),
    '[]'::jsonb
  )
  into v_result
  from public.vw_alunos_estado_operacional_v131 eo
  join public.alunos a on a.id = eo.aluno_id
  join public.unidades u on u.id = a.unidade_id
  left join public.cursos c on c.id = a.curso_id
  left join public.tipos_matricula tm on tm.id = a.tipo_matricula_id
  left join public.professores p on p.id = a.professor_atual_id
  where eo.entra_base_ativa = true
    and a.arquivado_em is null
    and (p_unidade_id is null or a.unidade_id = p_unidade_id)
    and (
      coalesce(auth.role(), '') = 'service_role'
      or session_user = 'postgres'
      or public.fn_usuario_atual_tem_permissao('alunos.ver', a.unidade_id)
    );

  return v_result;
end;
$function$;

comment on function public.get_alunos_ativos_atuais_canonicos(uuid) is
  'Detalhe vivo canonico: somente matriculas operacionais ativas. Trancamentos usam RPC dedicada.';

revoke all on function public.get_alunos_ativos_atuais_canonicos(uuid)
  from public, anon;
grant execute on function public.get_alunos_ativos_atuais_canonicos(uuid)
  to authenticated, service_role;

create or replace function public.get_trancamentos_atuais_canonicos(
  p_unidade_id uuid default null::uuid
)
returns table (
  aluno_id integer,
  aluno_nome text,
  unidade_id uuid,
  unidade_nome text,
  emusys_matricula_id text,
  professor_id integer,
  professor_nome text,
  curso_id integer,
  curso_nome text,
  trancamento_id bigint,
  trancamento_motivo text,
  trancamento_data_inicial date,
  trancamento_data_final date,
  fonte_estado text,
  sincronizado_em timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if p_unidade_id is not null
    and not public.fn_usuario_atual_tem_permissao('alunos.ver', p_unidade_id)
  then
    raise exception 'sem_permissao_unidade'
      using errcode = '42501';
  end if;

  return query
  select
    a.id,
    a.nome::text,
    a.unidade_id,
    u.nome::text,
    a.emusys_matricula_id,
    a.professor_atual_id,
    p.nome::text,
    a.curso_id,
    c.nome::text,
    eo.trancamento_id,
    eo.trancamento_motivo,
    eo.trancamento_data_inicial,
    eo.trancamento_data_final,
    eo.fonte_estado,
    eo.sincronizado_em
  from public.vw_alunos_estado_operacional_v131 eo
  join public.alunos a on a.id = eo.aluno_id
  join public.unidades u on u.id = a.unidade_id
  left join public.professores p on p.id = a.professor_atual_id
  left join public.cursos c on c.id = a.curso_id
  where eo.eh_trancamento_atual = true
    and a.arquivado_em is null
    and (p_unidade_id is null or a.unidade_id = p_unidade_id)
    and public.fn_usuario_atual_tem_permissao('alunos.ver', a.unidade_id)
  order by u.nome, a.nome, c.nome;
end;
$function$;

comment on function public.get_trancamentos_atuais_canonicos(uuid) is
  'Foto atual dos trancamentos. Nao substitui o historico de movimentacoes_admin.';

revoke all on function public.get_trancamentos_atuais_canonicos(uuid)
  from public, anon;
grant execute on function public.get_trancamentos_atuais_canonicos(uuid)
  to authenticated, service_role;

create or replace function public.get_trancamentos_periodo_canonicos(
  p_unidade_id uuid default null::uuid,
  p_data_inicial date default (current_date - 90),
  p_data_final date default current_date
)
returns table (
  movimentacao_id integer,
  aluno_id integer,
  aluno_nome text,
  unidade_id uuid,
  unidade_nome text,
  emusys_matricula_id text,
  data_movimento date,
  motivo text,
  observacoes text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if p_data_inicial is null
    or p_data_final is null
    or p_data_inicial > p_data_final
  then
    raise exception 'periodo_invalido';
  end if;

  if p_unidade_id is not null
    and not public.fn_usuario_atual_tem_permissao('alunos.ver', p_unidade_id)
  then
    raise exception 'sem_permissao_unidade'
      using errcode = '42501';
  end if;

  return query
  select
    m.id,
    m.aluno_id,
    a.nome::text,
    m.unidade_id,
    u.nome::text,
    coalesce(m.emusys_matricula_id, a.emusys_matricula_id),
    m.data,
    m.motivo,
    m.observacoes
  from public.movimentacoes_admin m
  join public.unidades u on u.id = m.unidade_id
  left join public.alunos a on a.id = m.aluno_id
  where m.tipo = 'trancamento'
    and m.data between p_data_inicial and p_data_final
    and (p_unidade_id is null or m.unidade_id = p_unidade_id)
    and public.fn_usuario_atual_tem_permissao('alunos.ver', m.unidade_id)
  order by m.data desc, u.nome, a.nome;
end;
$function$;

comment on function public.get_trancamentos_periodo_canonicos(
  uuid,
  date,
  date
) is
  'Historico de trancamentos no periodo a partir de movimentacoes_admin.';

revoke all on function public.get_trancamentos_periodo_canonicos(
  uuid,
  date,
  date
) from public, anon;
grant execute on function public.get_trancamentos_periodo_canonicos(
  uuid,
  date,
  date
) to authenticated, service_role;

do $kpis_alunos_v131$
begin
  if to_regprocedure(
    'public.get_kpis_alunos_canonicos_base_v131(uuid,integer,integer)'
  ) is null then
    if to_regprocedure(
      'public.get_kpis_alunos_canonicos(uuid,integer,integer)'
    ) is null then
      raise exception 'get_kpis_alunos_canonicos ausente';
    end if;

    alter function public.get_kpis_alunos_canonicos(
      uuid,
      integer,
      integer
    ) rename to get_kpis_alunos_canonicos_base_v131;
  end if;
end;
$kpis_alunos_v131$;

create or replace function public.get_kpis_alunos_canonicos(
  p_unidade_id uuid default null::uuid,
  p_ano integer default (
    extract(year from (now() at time zone 'America/Sao_Paulo'))
  )::integer,
  p_mes integer default (
    extract(month from (now() at time zone 'America/Sao_Paulo'))
  )::integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
  v_admin jsonb;
  v_por_unidade jsonb := '[]'::jsonb;
  v_obj jsonb;
  v_admin_obj jsonb;
  v_total_alunos_ativos integer := 0;
  v_total_alunos_pagantes integer := 0;
  v_total_alunos_nao_pagantes integer := 0;
  v_total_alunos_trancados integer := 0;
  v_total_novas_matriculas integer := 0;
  v_total_matriculas_ativas integer := 0;
  v_total_matriculas_base integer := 0;
  v_total_matriculas_banda integer := 0;
  v_total_matriculas_2_curso integer := 0;
  v_total_alunos_com_2_curso integer := 0;
  v_total_matriculas_2_curso_extras integer := 0;
  v_total_matriculas_coral integer := 0;
  v_total_bolsistas_integrais integer := 0;
  v_total_bolsistas_parciais integer := 0;
  v_total_bolsistas_integrais_regulares integer := 0;
  v_total_bolsistas_integrais_segundo integer := 0;
  v_total_kids integer := 0;
  v_total_school integer := 0;
  v_total_sem_classificacao integer := 0;
begin
  v_result := public.get_kpis_alunos_canonicos_base_v131(
    p_unidade_id,
    p_ano,
    p_mes
  );
  v_admin := public.get_kpis_alunos_admin_operacional(
    p_unidade_id,
    p_ano,
    p_mes
  );

  for v_obj in
    select value
    from jsonb_array_elements(
      coalesce(v_result->'por_unidade', '[]'::jsonb)
    )
  loop
    if v_obj->>'fonte' = 'vivo' then
      select value
      into v_admin_obj
      from jsonb_array_elements(
        coalesce(v_admin->'por_unidade', '[]'::jsonb)
      )
      where value->>'unidade_id' = v_obj->>'unidade_id'
      limit 1;

      if v_admin_obj is not null then
        v_obj := v_obj || v_admin_obj;
        v_obj := jsonb_set(
          v_obj,
          '{fonte}',
          '"vivo"'::jsonb,
          true
        );
      end if;
    end if;

    v_por_unidade := v_por_unidade || jsonb_build_array(v_obj);
    v_total_alunos_ativos := v_total_alunos_ativos
      + coalesce((v_obj->>'alunos_ativos')::integer, 0);
    v_total_alunos_pagantes := v_total_alunos_pagantes
      + coalesce((v_obj->>'alunos_pagantes')::integer, 0);
    v_total_alunos_nao_pagantes := v_total_alunos_nao_pagantes
      + coalesce((v_obj->>'alunos_nao_pagantes')::integer, 0);
    v_total_alunos_trancados := v_total_alunos_trancados
      + coalesce((v_obj->>'alunos_trancados')::integer, 0);
    v_total_novas_matriculas := v_total_novas_matriculas
      + coalesce((v_obj->>'novas_matriculas')::integer, 0);
    v_total_matriculas_ativas := v_total_matriculas_ativas
      + coalesce((v_obj->>'matriculas_ativas')::integer, 0);
    v_total_matriculas_base := v_total_matriculas_base
      + coalesce((v_obj->>'matriculas_base_alunos_ativos')::integer, 0);
    v_total_matriculas_banda := v_total_matriculas_banda
      + coalesce((v_obj->>'matriculas_banda')::integer, 0);
    v_total_matriculas_2_curso := v_total_matriculas_2_curso
      + coalesce((v_obj->>'matriculas_2_curso')::integer, 0);
    v_total_alunos_com_2_curso := v_total_alunos_com_2_curso
      + coalesce((v_obj->>'alunos_com_2_curso')::integer, 0);
    v_total_matriculas_2_curso_extras :=
      v_total_matriculas_2_curso_extras
      + coalesce((v_obj->>'matriculas_2_curso_extras')::integer, 0);
    v_total_matriculas_coral := v_total_matriculas_coral
      + coalesce((v_obj->>'matriculas_coral')::integer, 0);
    v_total_bolsistas_integrais := v_total_bolsistas_integrais
      + coalesce((v_obj->>'bolsistas_integrais')::integer, 0);
    v_total_bolsistas_parciais := v_total_bolsistas_parciais
      + coalesce((v_obj->>'bolsistas_parciais')::integer, 0);
    v_total_bolsistas_integrais_regulares :=
      v_total_bolsistas_integrais_regulares
      + coalesce(
        (v_obj->>'bolsistas_integrais_regulares')::integer,
        0
      );
    v_total_bolsistas_integrais_segundo :=
      v_total_bolsistas_integrais_segundo
      + coalesce(
        (v_obj->>'bolsistas_integrais_segundo_curso')::integer,
        0
      );
    v_total_kids := v_total_kids
      + coalesce((v_obj->>'alunos_kids')::integer, 0);
    v_total_school := v_total_school
      + coalesce((v_obj->>'alunos_school')::integer, 0);
    v_total_sem_classificacao := v_total_sem_classificacao
      + coalesce((v_obj->>'alunos_sem_classificacao')::integer, 0);
  end loop;

  v_result := jsonb_set(v_result, '{por_unidade}', v_por_unidade, true);
  v_result := jsonb_set(
    v_result,
    '{totais}',
    coalesce(v_result->'totais', '{}'::jsonb)
      || jsonb_build_object(
        'alunos_ativos', v_total_alunos_ativos,
        'total_alunos_ativos', v_total_alunos_ativos,
        'alunos_pagantes', v_total_alunos_pagantes,
        'total_alunos_pagantes', v_total_alunos_pagantes,
        'alunos_nao_pagantes', v_total_alunos_nao_pagantes,
        'alunos_trancados', v_total_alunos_trancados,
        'novas_matriculas', v_total_novas_matriculas,
        'matriculas_ativas', v_total_matriculas_ativas,
        'matriculas_base_alunos_ativos', v_total_matriculas_base,
        'matriculas_banda', v_total_matriculas_banda,
        'matriculas_2_curso', v_total_matriculas_2_curso,
        'alunos_com_2_curso', v_total_alunos_com_2_curso,
        'matriculas_2_curso_extras', v_total_matriculas_2_curso_extras,
        'matriculas_coral', v_total_matriculas_coral,
        'bolsistas_integrais', v_total_bolsistas_integrais,
        'total_bolsistas_integrais', v_total_bolsistas_integrais,
        'bolsistas_parciais', v_total_bolsistas_parciais,
        'total_bolsistas_parciais', v_total_bolsistas_parciais,
        'bolsistas_integrais_regulares',
          v_total_bolsistas_integrais_regulares,
        'bolsistas_integrais_segundo_curso',
          v_total_bolsistas_integrais_segundo,
        'alunos_kids', v_total_kids,
        'alunos_school', v_total_school,
        'alunos_sem_classificacao', v_total_sem_classificacao
      ),
    true
  );
  v_result := jsonb_set(
    v_result,
    '{alertas_fonte}',
    coalesce(v_result->'alertas_fonte', '[]'::jsonb)
      || jsonb_build_array(
        'Estado atual v1.3.1: ativo conta; trancado atual aparece separado.'
      ),
    true
  );

  return v_result;
end;
$function$;

comment on function public.get_kpis_alunos_canonicos(
  uuid,
  integer,
  integer
) is
  'Wrapper v1.3.1: preserva snapshots fechados e substitui apenas a populacao viva pelo estado operacional canonico.';

revoke all on function public.get_kpis_alunos_canonicos(
  uuid,
  integer,
  integer
) from public, anon;
grant execute on function public.get_kpis_alunos_canonicos(
  uuid,
  integer,
  integer
) to authenticated, service_role;

revoke all on function public.get_kpis_alunos_canonicos_base_v131(
  uuid,
  integer,
  integer
) from public, anon;
grant execute on function public.get_kpis_alunos_canonicos_base_v131(
  uuid,
  integer,
  integer
) to authenticated, service_role;


create or replace function public.buscar_alunos_ativos_atuais_canonicos(
  p_termo text,
  p_unidade_id uuid default null::uuid,
  p_limite integer default 10
)
returns table (
  id integer,
  nome text,
  nome_normalizado text,
  unidade_id uuid,
  classificacao text,
  status text,
  valor_parcela numeric,
  data_matricula date,
  curso_id integer,
  professor_atual_id integer,
  unidade_codigo text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if length(btrim(coalesce(p_termo, ''))) < 2 then
    return;
  end if;

  if p_unidade_id is not null
    and not public.fn_usuario_atual_tem_permissao('alunos.ver', p_unidade_id)
  then
    raise exception 'sem_permissao_unidade' using errcode = '42501';
  end if;

  return query
  select
    a.id,
    a.nome::text,
    a.nome_normalizado::text,
    a.unidade_id,
    a.classificacao::text,
    eo.status_operacional::text,
    a.valor_parcela,
    a.data_matricula,
    a.curso_id,
    a.professor_atual_id,
    u.codigo::text
  from public.vw_alunos_estado_operacional_v131 eo
  join public.alunos a on a.id = eo.aluno_id
  join public.unidades u on u.id = a.unidade_id
  where eo.entra_base_ativa = true
    and a.arquivado_em is null
    and (p_unidade_id is null or a.unidade_id = p_unidade_id)
    and public.fn_usuario_atual_tem_permissao('alunos.ver', a.unidade_id)
    and coalesce(a.nome_normalizado, upper(a.nome)) ilike
      ('%' || upper(btrim(p_termo)) || '%')
  order by
    (coalesce(a.nome_normalizado, upper(a.nome)) like upper(btrim(p_termo)) || '%') desc,
    a.nome
  limit least(greatest(coalesce(p_limite, 10), 1), 50);
end;
$function$;

comment on function public.buscar_alunos_ativos_atuais_canonicos(text, uuid, integer) is
  'Busca operacional canônica para seletores: somente matrículas ativas v1.3.1.';

revoke all on function public.buscar_alunos_ativos_atuais_canonicos(text, uuid, integer)
  from public, anon;
grant execute on function public.buscar_alunos_ativos_atuais_canonicos(text, uuid, integer)
  to authenticated, service_role;
