-- Sincroniza com o banco: migration aplicada remotamente em 2026-07-31 16:33:53
-- via MCP (sem arquivo local ate agora). Corrige a contagem de "2o curso" no
-- relatorio administrativo: pessoa passa a ser deduplicada por identidade Emusys
-- (nao mais por nome) e o total de cursos ativos por pessoa passa a ser contado
-- de fato (destrava casos com 3+ cursos, ex.: aluno com 3 matriculas academicas
-- ativas deixava de ser distinguido de quem tem so 2).

create or replace function public.get_kpis_alunos_admin_operacional_impl_v2(
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
set search_path to 'public', 'pg_temp'
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
alunos_com_chave as (
  select
    a.*,
    case
      when btrim(coalesce(a.emusys_matricula_id, '')) ~ '^[0-9]+$'
        then btrim(a.emusys_matricula_id)::bigint
      else null
    end as emusys_matricula_id_numero
  from public.alunos a
  join unidades_base ub on ub.unidade_id = a.unidade_id
  where a.arquivado_em is null
),
alunos_base as (
  select
    a.id,
    a.unidade_id,
    a.nome,
    a.idade_atual,
    a.data_matricula,
    a.data_saida,
    a.emusys_matricula_id,
    coalesce(a.valor_parcela, 0)::numeric as valor_parcela,
    coalesce(a.is_segundo_curso, false) as is_segundo_curso,
    (coalesce(a.is_segundo_curso, false) = true) as is_segundo_operacional,
    eo.entra_base_ativa,
    eo.eh_trancamento_atual,
    eo.trancamento_data_inicial,
    eo.trancamento_data_final,
    coalesce(
      nullif(btrim(a.emusys_student_id), ''),
      ea.emusys_aluno_id::text,
      j.emusys_aluno_id::text
    ) as emusys_aluno_id_estavel,
    case
      when coalesce(
        nullif(btrim(a.emusys_student_id), ''),
        ea.emusys_aluno_id::text,
        j.emusys_aluno_id::text
      ) is not null
        then 'emusys:' || coalesce(
          nullif(btrim(a.emusys_student_id), ''),
          ea.emusys_aluno_id::text,
          j.emusys_aluno_id::text
        )
      else 'local:' || a.id::text
    end as pessoa_key,
    coalesce(c.is_projeto_banda, false)
      or coalesce(tm.codigo, '') = 'BANDA' as is_banda_operacional,
    lower(coalesce(c.nome, '')) like '%coral%' as is_coral,
    coalesce(tm.codigo, '') as tipo_codigo,
    coalesce(tm.conta_como_pagante, false) as conta_como_pagante,
    coalesce(tm.entra_ticket_medio, false) as entra_ticket_medio
  from alunos_com_chave a
  join public.vw_alunos_estado_operacional_v131 eo
    on eo.aluno_id = a.id
   and eo.unidade_id = a.unidade_id
  left join public.cursos c on c.id = a.curso_id
  left join public.tipos_matricula tm on tm.id = a.tipo_matricula_id
  left join lateral (
    select estado.emusys_aluno_id
    from public.emusys_matriculas_estado_atual estado
    where estado.unidade_id = a.unidade_id
      and estado.emusys_aluno_id is not null
      and (
        estado.emusys_matricula_id = a.emusys_matricula_id_numero
        or estado.aluno_id = a.id
      )
    order by
      (estado.emusys_matricula_id = a.emusys_matricula_id_numero) desc,
      estado.sincronizado_em desc
    limit 1
  ) ea on true
  left join lateral (
    select jornada.emusys_aluno_id
    from public.aluno_jornada_matricula_disciplina jornada
    where jornada.unidade_id = a.unidade_id
      and jornada.emusys_aluno_id is not null
      and (
        jornada.emusys_matricula_id = a.emusys_matricula_id_numero
        or jornada.aluno_id = a.id
      )
    order by
      (jornada.emusys_matricula_id = a.emusys_matricula_id_numero) desc,
      jornada.ultima_sincronizacao_emusys desc
    limit 1
  ) j on true
),
alunos_classificados as (
  select
    ab.*,
    (
      ab.is_banda_operacional = false
      and ab.is_coral = false
    ) as is_matricula_academica
  from alunos_base ab
),
pessoas as (
  select
    ac.unidade_id,
    ac.pessoa_key,
    max(ac.idade_atual) as idade_atual,
    bool_or(
      ac.entra_base_ativa = true
      and ac.is_matricula_academica = true
    ) as pessoa_ativa,
    bool_or(
      ac.entra_base_ativa = true
      and ac.is_matricula_academica = true
      and ac.entra_ticket_medio = true
      and ac.valor_parcela > 0
      and ac.tipo_codigo not in ('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA')
    ) as pessoa_pagante,
    bool_or(
      ac.entra_base_ativa = true
      and ac.is_matricula_academica = true
      and ac.tipo_codigo = 'BOLSISTA_INT'
      and ac.is_segundo_curso = false
    ) as bolsista_integral_regular,
    bool_or(
      ac.entra_base_ativa = true
      and ac.is_matricula_academica = true
      and ac.tipo_codigo = 'BOLSISTA_INT'
      and ac.is_segundo_curso = true
    ) as bolsista_integral_adicional,
    bool_or(
      ac.entra_base_ativa = true
      and ac.is_matricula_academica = true
      and ac.tipo_codigo = 'BOLSISTA_PARC'
    ) as bolsista_parcial,
    bool_or(
      ac.eh_trancamento_atual = true
      and ac.is_matricula_academica = true
    ) as pessoa_com_trancamento,
    count(*) filter (
      where ac.entra_base_ativa = true
        and ac.is_matricula_academica = true
    )::integer as cursos_ativos,
    count(*) filter (
      where ac.entra_base_ativa = true
        and ac.is_matricula_academica = true
        and ac.is_segundo_operacional = true
    )::integer as adicionais_sinalizadas
  from alunos_classificados ac
  group by ac.unidade_id, ac.pessoa_key
),
resumo_pessoas as (
  select
    ub.unidade_id,
    count(p.pessoa_key) filter (where p.pessoa_ativa = true)::integer as alunos_ativos,
    count(p.pessoa_key) filter (
      where p.pessoa_ativa = true and p.pessoa_pagante = true
    )::integer as alunos_pagantes,
    count(p.pessoa_key) filter (
      where p.pessoa_ativa = true and p.bolsista_integral_regular = true
    )::integer as bolsistas_integrais,
    count(p.pessoa_key) filter (
      where p.pessoa_ativa = true
        and p.bolsista_integral_adicional = true
        and p.bolsista_integral_regular = false
    )::integer as bolsistas_integrais_segundo_curso,
    count(p.pessoa_key) filter (
      where p.pessoa_ativa = true and p.bolsista_parcial = true
    )::integer as bolsistas_parciais,
    count(p.pessoa_key) filter (where p.pessoa_com_trancamento = true)::integer
      as alunos_trancados,
    count(p.pessoa_key) filter (
      where p.pessoa_ativa = true and p.cursos_ativos = 2
    )::integer as alunos_com_exatamente_2_cursos,
    count(p.pessoa_key) filter (
      where p.pessoa_ativa = true and p.cursos_ativos = 3
    )::integer as alunos_com_exatamente_3_cursos,
    count(p.pessoa_key) filter (
      where p.pessoa_ativa = true and p.cursos_ativos >= 4
    )::integer as alunos_com_4_ou_mais_cursos,
    count(p.pessoa_key) filter (
      where p.pessoa_ativa = true and p.cursos_ativos >= 2
    )::integer as alunos_com_2_curso,
    coalesce(sum(greatest(p.cursos_ativos - 1, 0)) filter (
      where p.pessoa_ativa = true
    ), 0)::integer as matriculas_adicionais,
    coalesce(sum(greatest(p.cursos_ativos - 2, 0)) filter (
      where p.pessoa_ativa = true
    ), 0)::integer as matriculas_adicionais_extras,
    coalesce(sum(p.cursos_ativos) filter (
      where p.pessoa_ativa = true
    ), 0)::integer as matriculas_academicas_ativas,
    count(p.pessoa_key) filter (
      where p.pessoa_ativa = true and p.idade_atual is not null and p.idade_atual <= 11
    )::integer as alunos_kids,
    count(p.pessoa_key) filter (
      where p.pessoa_ativa = true and p.idade_atual is not null and p.idade_atual >= 12
    )::integer as alunos_school,
    count(p.pessoa_key) filter (
      where p.pessoa_ativa = true and p.idade_atual is null
    )::integer as alunos_sem_classificacao
  from unidades_base ub
  left join pessoas p on p.unidade_id = ub.unidade_id
  group by ub.unidade_id
),
resumo_vinculos as (
  select
    ub.unidade_id,
    count(ac.id) filter (
      where ac.entra_base_ativa = true and ac.is_banda_operacional = true
    )::integer as matriculas_banda,
    count(ac.id) filter (
      where ac.entra_base_ativa = true and ac.is_coral = true
    )::integer as matriculas_coral,
    count(ac.id) filter (
      where ac.eh_trancamento_atual = true
        and ac.is_matricula_academica = true
    )::integer as matriculas_trancadas,
    count(ac.id)::integer as linhas_identidade_total,
    count(ac.id) filter (
      where ac.emusys_aluno_id_estavel is null
    )::integer as linhas_identidade_pendente
  from unidades_base ub
  left join alunos_classificados ac on ac.unidade_id = ub.unidade_id
  group by ub.unidade_id
),
novas as (
  select
    ub.unidade_id,
    count(distinct ac.pessoa_key) filter (
      where ac.entra_base_ativa = true
        and ac.is_matricula_academica = true
        and ac.data_matricula >= p.inicio_mes
        and ac.data_matricula <= p.data_corte
        and ac.is_segundo_curso = false
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
    coalesce(rp.alunos_ativos, 0)::integer as alunos_ativos,
    coalesce(rp.alunos_ativos, 0)::integer as total_alunos_ativos,
    coalesce(rp.alunos_pagantes, 0)::integer as alunos_pagantes,
    coalesce(rp.alunos_pagantes, 0)::integer as total_alunos_pagantes,
    greatest(
      coalesce(rp.alunos_ativos, 0) - coalesce(rp.alunos_pagantes, 0),
      0
    )::integer as alunos_nao_pagantes,
    coalesce(rp.bolsistas_integrais, 0)::integer as bolsistas_integrais,
    coalesce(rp.bolsistas_integrais, 0)::integer as total_bolsistas_integrais,
    coalesce(rp.bolsistas_integrais, 0)::integer as bolsistas_integrais_regulares,
    coalesce(rp.bolsistas_integrais_segundo_curso, 0)::integer
      as bolsistas_integrais_segundo_curso,
    coalesce(rp.bolsistas_parciais, 0)::integer as bolsistas_parciais,
    coalesce(rp.bolsistas_parciais, 0)::integer as total_bolsistas_parciais,
    coalesce(rp.alunos_trancados, 0)::integer as alunos_trancados,
    coalesce(rv.matriculas_trancadas, 0)::integer as matriculas_trancadas,
    coalesce(n.novas_matriculas, 0)::integer as novas_matriculas,
    coalesce(rp.alunos_kids, 0)::integer as alunos_kids,
    coalesce(rp.alunos_school, 0)::integer as alunos_school,
    coalesce(rp.alunos_sem_classificacao, 0)::integer as alunos_sem_classificacao,
    coalesce(rp.alunos_ativos, 0)::integer as matriculas_base_alunos_ativos,
    coalesce(rv.matriculas_banda, 0)::integer as matriculas_banda,
    coalesce(rp.matriculas_adicionais, 0)::integer as matriculas_2_curso,
    coalesce(rp.alunos_com_2_curso, 0)::integer as alunos_com_2_curso,
    coalesce(rp.matriculas_adicionais_extras, 0)::integer
      as matriculas_2_curso_extras,
    coalesce(rp.alunos_com_exatamente_2_cursos, 0)::integer
      as alunos_com_exatamente_2_cursos,
    coalesce(rp.alunos_com_exatamente_3_cursos, 0)::integer
      as alunos_com_exatamente_3_cursos,
    coalesce(rp.alunos_com_4_ou_mais_cursos, 0)::integer
      as alunos_com_4_ou_mais_cursos,
    coalesce(rv.matriculas_coral, 0)::integer as matriculas_coral,
    (
      coalesce(rp.matriculas_academicas_ativas, 0)
      + coalesce(rv.matriculas_banda, 0)
      + coalesce(rv.matriculas_coral, 0)
    )::integer as matriculas_ativas,
    coalesce(rv.linhas_identidade_total, 0)::integer as linhas_identidade_total,
    coalesce(rv.linhas_identidade_pendente, 0)::integer as linhas_identidade_pendente,
    case
      when coalesce(rv.linhas_identidade_total, 0) = 0 then 100::numeric
      else round(
        100::numeric * (
          rv.linhas_identidade_total - rv.linhas_identidade_pendente
        )::numeric / rv.linhas_identidade_total,
        2
      )
    end as identidade_emusys_cobertura_pct
  from unidades_base ub
  left join resumo_pessoas rp on rp.unidade_id = ub.unidade_id
  left join resumo_vinculos rv on rv.unidade_id = ub.unidade_id
  left join novas n on n.unidade_id = ub.unidade_id
),
totais as (
  select
    coalesce(sum(alunos_ativos), 0)::integer as alunos_ativos,
    coalesce(sum(total_alunos_ativos), 0)::integer as total_alunos_ativos,
    coalesce(sum(alunos_pagantes), 0)::integer as alunos_pagantes,
    coalesce(sum(total_alunos_pagantes), 0)::integer as total_alunos_pagantes,
    coalesce(sum(alunos_nao_pagantes), 0)::integer as alunos_nao_pagantes,
    coalesce(sum(bolsistas_integrais), 0)::integer as bolsistas_integrais,
    coalesce(sum(total_bolsistas_integrais), 0)::integer as total_bolsistas_integrais,
    coalesce(sum(bolsistas_integrais_regulares), 0)::integer as bolsistas_integrais_regulares,
    coalesce(sum(bolsistas_integrais_segundo_curso), 0)::integer
      as bolsistas_integrais_segundo_curso,
    coalesce(sum(bolsistas_parciais), 0)::integer as bolsistas_parciais,
    coalesce(sum(total_bolsistas_parciais), 0)::integer as total_bolsistas_parciais,
    coalesce(sum(alunos_trancados), 0)::integer as alunos_trancados,
    coalesce(sum(matriculas_trancadas), 0)::integer as matriculas_trancadas,
    coalesce(sum(novas_matriculas), 0)::integer as novas_matriculas,
    coalesce(sum(alunos_kids), 0)::integer as alunos_kids,
    coalesce(sum(alunos_school), 0)::integer as alunos_school,
    coalesce(sum(alunos_sem_classificacao), 0)::integer as alunos_sem_classificacao,
    coalesce(sum(matriculas_base_alunos_ativos), 0)::integer as matriculas_base_alunos_ativos,
    coalesce(sum(matriculas_banda), 0)::integer as matriculas_banda,
    coalesce(sum(matriculas_2_curso), 0)::integer as matriculas_2_curso,
    coalesce(sum(alunos_com_2_curso), 0)::integer as alunos_com_2_curso,
    coalesce(sum(matriculas_2_curso_extras), 0)::integer as matriculas_2_curso_extras,
    coalesce(sum(alunos_com_exatamente_2_cursos), 0)::integer
      as alunos_com_exatamente_2_cursos,
    coalesce(sum(alunos_com_exatamente_3_cursos), 0)::integer
      as alunos_com_exatamente_3_cursos,
    coalesce(sum(alunos_com_4_ou_mais_cursos), 0)::integer
      as alunos_com_4_ou_mais_cursos,
    coalesce(sum(matriculas_coral), 0)::integer as matriculas_coral,
    coalesce(sum(matriculas_ativas), 0)::integer as matriculas_ativas,
    coalesce(sum(linhas_identidade_total), 0)::integer as linhas_identidade_total,
    coalesce(sum(linhas_identidade_pendente), 0)::integer as linhas_identidade_pendente,
    case
      when coalesce(sum(linhas_identidade_total), 0) = 0 then 100::numeric
      else round(
        100::numeric * (
          sum(linhas_identidade_total) - sum(linhas_identidade_pendente)
        )::numeric / sum(linhas_identidade_total),
        2
      )
    end as identidade_emusys_cobertura_pct
  from por_unidade
)
select jsonb_build_object(
  'fonte', 'admin_operacional_v2_identidade_emusys',
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
    'Pessoa e deduplicada por identidade Emusys; matricula ativa e contada por vinculo operacional.',
    'Trancamento atual sai apenas da matricula ativa; a pessoa permanece ativa e pagante se possuir outro curso ativo pago.',
    case
      when totais.linhas_identidade_pendente > 0
        then format(
          '%s linha(s) sem identidade Emusys estavel; mantidas separadas por ID local.',
          totais.linhas_identidade_pendente
        )
      else 'Cobertura de identidade Emusys completa para as linhas operacionais atuais.'
    end
  )
)
from totais;
$function$;

revoke all on function public.get_kpis_alunos_admin_operacional_impl_v2(
  uuid,
  integer,
  integer
) from public, anon, authenticated, service_role;

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
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  return public.get_kpis_alunos_admin_operacional_impl_v2(
    p_unidade_id,
    p_ano,
    p_mes
  );
end;
$function$;

comment on function public.get_kpis_alunos_admin_operacional(
  uuid,
  integer,
  integer
) is
  'KPIs administrativos vivos: pessoa deduplicada por identidade Emusys; distingue 2, 3 e 4+ cursos ativos por pessoa.';
