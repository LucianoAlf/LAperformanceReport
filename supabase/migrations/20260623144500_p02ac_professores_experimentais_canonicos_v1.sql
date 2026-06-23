create or replace function public.get_experimentais_professor_canonicos_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes_inicio integer,
  p_mes_fim integer default null
)
returns table (
  professor_id integer,
  professor_nome text,
  unidade_id uuid,
  unidade_nome text,
  realizadas_emusys integer,
  faltas_emusys integer,
  canceladas_emusys integer,
  matriculas_pos_exp integer,
  taxa_exp_mat numeric
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
with periodo as (
  select
    make_date(p_ano, p_mes_inicio, 1) as inicio,
    (make_date(
      p_ano,
      coalesce(nullif(p_mes_fim, 0), p_mes_inicio),
      1
    ) + interval '1 month') as fim_exclusivo
),
unidades_alvo as (
  select u.id as unidade_id, u.nome as unidade_nome
  from public.unidades u
  where u.ativo = true
    and (p_unidade_id is null or u.id = p_unidade_id)
),
raw_eventos as (
  select
    r.id,
    r.professor_id,
    coalesce(max(p.nome), max(nullif(r.professor_nome, '')), 'Sem professor') as professor_nome,
    r.unidade_id,
    ua.unidade_nome,
    r.situacao_operacional,
    r.data_aula,
    a.id as aluno_matriculado_id,
    row_number() over (
      partition by r.unidade_id, a.id
      order by r.data_aula desc nulls last, r.id desc
    ) as ordem_conversao_aluno
  from public.emusys_experimentais_raw r
  join periodo pr on true
  join unidades_alvo ua on ua.unidade_id = r.unidade_id
  left join public.professores p on p.id = r.professor_id
  left join public.alunos a
    on a.id = r.aluno_id
   and a.unidade_id = r.unidade_id
   and r.situacao_operacional in ('presente', 'matriculado')
   and lower(coalesce(a.status, '')) <> 'excluido'
   and a.data_matricula >= pr.inicio::date
   and a.data_matricula < pr.fim_exclusivo::date
   and coalesce(a.valor_passaporte, 0) > 0
  where r.data_aula >= pr.inicio::date
    and r.data_aula < pr.fim_exclusivo::date
    and r.professor_id is not null
  group by r.id, r.professor_id, r.unidade_id, ua.unidade_nome, r.situacao_operacional, r.data_aula, a.id
),
raw_por_professor as (
  select
    r.professor_id,
    coalesce(max(r.professor_nome), 'Sem professor') as professor_nome,
    r.unidade_id,
    r.unidade_nome,
    count(*) filter (where r.situacao_operacional in ('presente', 'matriculado'))::integer as realizadas_emusys,
    count(*) filter (where r.situacao_operacional = 'faltou')::integer as faltas_emusys,
    count(*) filter (where r.situacao_operacional = 'cancelada')::integer as canceladas_emusys,
    count(*) filter (
      where r.aluno_matriculado_id is not null
        and r.ordem_conversao_aluno = 1
    )::integer as raw_matriculas_pos_exp
  from raw_eventos r
  group by r.professor_id, r.unidade_id, r.unidade_nome
),
eventos as (
  select
    le.id,
    le.unidade_id,
    ua.unidade_nome,
    coalesce(raw_emusys.professor_id, le.professor_experimental_id) as professor_id,
    coalesce(raw_emusys.professor_nome, p.nome, 'Sem professor') as professor_nome,
    lower(coalesce(le.status, '')) as status_norm,
    le.aluno_id,
    le.lead_id,
    l.aluno_id as lead_aluno_id,
    l.converteu as lead_converteu,
    l.data_conversao,
    l.status as lead_status,
    dh.decisao as decisao_humana,
    dh.incluir_denominador_exp_mat,
    dh.contar_conversao_exp_mat,
    dh.aluno_id_decidido,
    coalesce(dh.aluno_id_decidido, le.aluno_id, l.aluno_id, al_origem.id) as aluno_taxa_id,
    al_taxa.status as aluno_taxa_status,
    al_taxa.data_matricula as aluno_taxa_data_matricula,
    coalesce(raw_emusys.presenca_raw_confirmada, false) as presenca_raw_confirmada,
    coalesce(raw_emusys.falta_raw_confirmada, false) as falta_raw_confirmada,
    (
      l.aluno_id is not null
      or al_origem.id is not null
      or coalesce(l.converteu, false) = true
      or l.data_conversao is not null
      or lower(coalesce(l.status, '')) in ('convertido', 'matriculado')
    ) as sinal_conversao
  from public.lead_experimentais le
  join periodo pr on true
  join unidades_alvo ua on ua.unidade_id = le.unidade_id
  left join public.leads l on l.id = le.lead_id
  left join public.alunos al_origem on al_origem.lead_origem_id = le.lead_id
  left join public.lead_experimentais_decisoes_humanas dh on dh.lead_experimental_id = le.id
  left join public.alunos al_taxa on al_taxa.id = coalesce(dh.aluno_id_decidido, le.aluno_id, l.aluno_id, al_origem.id)
  left join lateral (
    select
      max(r.professor_id) filter (where r.professor_id is not null) as professor_id,
      max(r.professor_nome) filter (where r.professor_nome is not null and r.professor_nome <> '') as professor_nome,
      bool_or(
        lower(coalesce(r.presenca_emusys, '')) = 'presente'
        or r.situacao_operacional in ('presente', 'matriculado')
      ) as presenca_raw_confirmada,
      bool_or(
        lower(coalesce(r.presenca_emusys, '')) in ('ausente', 'faltou')
        or r.situacao_operacional = 'faltou'
      ) as falta_raw_confirmada
    from public.emusys_experimentais_raw r
    where r.unidade_id = le.unidade_id
      and r.data_aula = le.data_experimental
      and (
        r.lead_experimental_id = le.id
        or (le.lead_id is not null and r.lead_id = le.lead_id)
        or (
          le.emusys_lead_id is not null
          and (
            case
              when nullif(r.payload #>> '{aluno,id_lead}', '') ~ '^[0-9]+$'
              then (r.payload #>> '{aluno,id_lead}')::bigint
              else null
            end
          ) = le.emusys_lead_id
          and (
            r.horario_aula = le.horario_experimental
            or r.horario_aula is null
            or le.horario_experimental is null
          )
        )
      )
  ) raw_emusys on true
  left join public.professores p on p.id = le.professor_experimental_id
  where le.data_experimental >= pr.inicio::date
    and le.data_experimental < pr.fim_exclusivo::date
),
classificados as (
  select
    e.*,
    case
      when e.decisao_humana in ('realizada_sem_matricula_confirmada', 'realizada_com_matricula_confirmada') then true
      when e.presenca_raw_confirmada then true
      when e.status_norm in ('experimental_realizada','convertido','matriculado')
        and e.aluno_taxa_id is not null
        and e.presenca_raw_confirmada
      then true
      else false
    end as incluir_taxa_exp_mat,
    case
      when e.contar_conversao_exp_mat = true then true
      when e.presenca_raw_confirmada
        and e.aluno_taxa_id is not null
        and e.aluno_taxa_data_matricula is not null
        and lower(coalesce(e.aluno_taxa_status, '')) <> 'excluido'
      then true
      else false
    end as contar_taxa_exp_mat
  from eventos e
),
classificados_por_professor as (
  select
    c.professor_id,
    coalesce(max(nullif(c.professor_nome, '')), 'Sem professor') as professor_nome,
    c.unidade_id,
    c.unidade_nome,
    count(*) filter (
      where c.incluir_taxa_exp_mat
        and c.contar_taxa_exp_mat
    )::integer as conciliacao_matriculas_pos_exp
  from classificados c
  where c.professor_id is not null
  group by c.professor_id, c.unidade_id, c.unidade_nome
),
totais_unidade as (
  select
    ua.unidade_id,
    coalesce(sum((
      public.get_conciliacao_experimentais_v2(
        ua.unidade_id,
        p_ano,
        mes_ref,
        'mensal',
        null
      )->'resumo'->>'conversoes_exp_mat_canonicas'
    )::integer), 0)::integer as conversoes_oficiais
  from unidades_alvo ua
  cross join generate_series(
    p_mes_inicio,
    coalesce(nullif(p_mes_fim, 0), p_mes_inicio)
  ) as mes_ref
  group by ua.unidade_id
),
raw_totais_unidade as (
  select
    r.unidade_id,
    coalesce(sum(r.raw_matriculas_pos_exp), 0)::integer as raw_matriculas_pos_exp
  from raw_por_professor r
  group by r.unidade_id
),
base_pre as (
  select
    coalesce(r.professor_id, c.professor_id) as professor_id,
    coalesce(r.professor_nome, c.professor_nome, 'Sem professor') as professor_nome,
    coalesce(r.unidade_id, c.unidade_id) as unidade_id,
    coalesce(r.unidade_nome, c.unidade_nome) as unidade_nome,
    coalesce(r.realizadas_emusys, 0)::integer as realizadas_emusys,
    coalesce(r.faltas_emusys, 0)::integer as faltas_emusys,
    coalesce(r.canceladas_emusys, 0)::integer as canceladas_emusys,
    coalesce(r.raw_matriculas_pos_exp, 0)::integer as raw_matriculas_pos_exp,
    coalesce(c.conciliacao_matriculas_pos_exp, 0)::integer as conciliacao_matriculas_pos_exp
  from raw_por_professor r
  full join classificados_por_professor c
    on c.professor_id = r.professor_id
   and c.unidade_id = r.unidade_id
),
base_com_delta as (
  select
    b.*,
    greatest(
      coalesce(tu.conversoes_oficiais, 0) - coalesce(rtu.raw_matriculas_pos_exp, 0),
      0
    )::integer as delta_unidade,
    greatest(
      b.conciliacao_matriculas_pos_exp - b.raw_matriculas_pos_exp,
      0
    )::integer as candidato_extra
  from base_pre b
  left join totais_unidade tu on tu.unidade_id = b.unidade_id
  left join raw_totais_unidade rtu on rtu.unidade_id = b.unidade_id
),
base_com_janela as (
  select
    b.*,
    coalesce(
      sum(b.candidato_extra) over (
        partition by b.unidade_id
        order by b.candidato_extra desc, b.professor_nome, b.professor_id
        rows between unbounded preceding and 1 preceding
      ),
      0
    )::integer as extras_anteriores
  from base_com_delta b
),
base as (
  select
    b.professor_id,
    b.professor_nome,
    b.unidade_id,
    b.unidade_nome,
    b.realizadas_emusys,
    b.faltas_emusys,
    b.canceladas_emusys,
    (
      b.raw_matriculas_pos_exp +
      least(
        b.candidato_extra,
        greatest(b.delta_unidade - b.extras_anteriores, 0)
      )
    )::integer as matriculas_pos_exp
  from base_com_janela b
)
select
  b.professor_id,
  b.professor_nome,
  b.unidade_id,
  b.unidade_nome,
  b.realizadas_emusys,
  b.faltas_emusys,
  b.canceladas_emusys,
  b.matriculas_pos_exp,
  case
    when b.realizadas_emusys > 0 then round(b.matriculas_pos_exp::numeric / b.realizadas_emusys::numeric * 100, 1)
    else 0
  end as taxa_exp_mat
from base b
where b.professor_id is not null
order by realizadas_emusys desc, matriculas_pos_exp desc, professor_nome;
$function$;

revoke all on function public.get_experimentais_professor_canonicos_v1(uuid, integer, integer, integer) from public, anon;
grant execute on function public.get_experimentais_professor_canonicos_v1(uuid, integer, integer, integer) to authenticated, service_role;

comment on function public.get_experimentais_professor_canonicos_v1(uuid, integer, integer, integer) is
  'P02AC: metricas de experimentais por professor usando emusys_experimentais_raw como fonte canonica operacional. Nao altera dados.';
