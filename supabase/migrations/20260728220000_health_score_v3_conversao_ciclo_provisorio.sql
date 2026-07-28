-- Health Score Professor V3 - conversao por ciclo, visivel e fora do score.
--
-- Decisao de 28/07/2026:
--   * o denominador identifica a experimental pelo evento/lead;
--   * somente o numerador exige pessoa canonica e matricula em D+30;
--   * o ciclo 2026-JUN-AGO fica como provisorio_ciclo, sem peso no score;
--   * conciliacao automatica exige telefone unico e nome coerente na unidade.

create table if not exists public.health_score_v3_experimental_lead_conciliacoes (
  raw_id bigint primary key
    references public.emusys_experimentais_raw(id) on delete cascade,
  unidade_id uuid not null references public.unidades(id),
  evento_chave text not null,
  lead_id integer not null references public.leads(id),
  metodo text not null
    check (metodo in ('telefone_nome_coerente', 'nome_exato_unico', 'revisao_humana')),
  confianca text not null default 'alta'
    check (confianca in ('alta', 'revisado_aprovado')),
  regra_versao text not null default 'health-score-v3-conciliacao-experimental-1',
  evidencia jsonb not null default '{}'::jsonb,
  conciliado_em timestamptz not null default now(),
  unique (unidade_id, evento_chave)
);

comment on table public.health_score_v3_experimental_lead_conciliacoes is
  'Camada aditiva e auditavel que liga a experimental bruta a um lead. Nao altera o payload raw nem fabrica aluno canonico.';

alter table public.health_score_v3_experimental_lead_conciliacoes enable row level security;

revoke all on table public.health_score_v3_experimental_lead_conciliacoes
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.health_score_v3_experimental_lead_conciliacoes
  to service_role;

create index if not exists idx_hs_v3_exp_lead_conciliacoes_lead
  on public.health_score_v3_experimental_lead_conciliacoes(unidade_id, lead_id);

-- Concilia somente o conjunto seguro auditado em junho/julho:
-- telefone unico na unidade e nome do lead igual ao aluno ou responsavel.
with raw_mais_recente as (
  select distinct on (
    r.unidade_id,
    coalesce(
      r.emusys_aula_id::text,
      r.aula_emusys_id::text,
      'raw:' || r.id::text
    )
  )
    r.*,
    coalesce(
      r.emusys_aula_id::text,
      r.aula_emusys_id::text,
      'raw:' || r.id::text
    ) as evento_chave,
    public.normalize_telefone(
      coalesce(
        nullif(r.aluno_telefone, ''),
        nullif(r.responsavel_telefone, '')
      )
    ) as telefone_normalizado,
    lower(regexp_replace(
      unaccent(trim(coalesce(r.aluno_nome, ''))),
      '[^a-z0-9]+',
      ' ',
      'g'
    )) as aluno_nome_normalizado_conciliacao,
    lower(regexp_replace(
      unaccent(trim(coalesce(r.responsavel_nome, ''))),
      '[^a-z0-9]+',
      ' ',
      'g'
    )) as responsavel_nome_normalizado_conciliacao
  from public.emusys_experimentais_raw r
  where r.data_aula between date '2026-06-01' and date '2026-07-31'
    and r.situacao_operacional in ('presente', 'matriculado')
    and r.professor_id is not null
  order by
    r.unidade_id,
    coalesce(
      r.emusys_aula_id::text,
      r.aula_emusys_id::text,
      'raw:' || r.id::text
    ),
    r.id desc
),
resolucao_existente as (
  select
    r.*,
    coalesce(r.aluno_id, vinculo.aluno_id) as aluno_id_resolvido
  from raw_mais_recente r
  left join lateral (
    select coalesce(le.aluno_id, l.aluno_id, a_origem.id) as aluno_id
    from public.lead_experimentais le
    left join public.leads l on l.id = le.lead_id
    left join public.alunos a_origem
      on a_origem.lead_origem_id = le.lead_id
     and a_origem.unidade_id = le.unidade_id
    where le.unidade_id = r.unidade_id
      and le.data_experimental = r.data_aula
      and (
        le.id = r.lead_experimental_id
        or (r.lead_id is not null and le.lead_id = r.lead_id)
        or (
          nullif(r.payload #>> '{aluno,id_lead}', '') ~ '^[0-9]+$'
          and le.emusys_lead_id =
            (r.payload #>> '{aluno,id_lead}')::bigint
        )
      )
    order by
      (le.id = r.lead_experimental_id) desc,
      (le.professor_experimental_id = r.professor_id) desc,
      le.id desc
    limit 1
  ) vinculo on true
),
leads_por_telefone as (
  select
    l.unidade_id,
    public.normalize_telefone(
      coalesce(nullif(l.telefone, ''), nullif(l.whatsapp, ''))
    ) as telefone_normalizado,
    min(l.id) as lead_id,
    count(distinct l.id) as qtd_leads_telefone,
    min(lower(regexp_replace(
      unaccent(trim(coalesce(l.nome, ''))),
      '[^a-z0-9]+',
      ' ',
      'g'
    ))) as nome_lead_normalizado
  from public.leads l
  where public.normalize_telefone(
    coalesce(nullif(l.telefone, ''), nullif(l.whatsapp, ''))
  ) is not null
  group by
    l.unidade_id,
    public.normalize_telefone(
      coalesce(nullif(l.telefone, ''), nullif(l.whatsapp, ''))
    )
),
candidatos as (
  select
    r.id as raw_id,
    r.unidade_id,
    r.evento_chave,
    l.lead_id,
    l.qtd_leads_telefone,
    l.nome_lead_normalizado,
    r.aluno_nome_normalizado_conciliacao,
    r.responsavel_nome_normalizado_conciliacao,
    r.telefone_normalizado,
    'telefone_nome_coerente'::text as metodo
  from resolucao_existente r
  join leads_por_telefone l
    on l.unidade_id = r.unidade_id
   and l.telefone_normalizado = r.telefone_normalizado
  where r.aluno_id_resolvido is null
),
seguros as (
  select c.*
  from candidatos c
  where c.qtd_leads_telefone = 1
    and c.nome_lead_normalizado in (
      c.aluno_nome_normalizado_conciliacao,
      c.responsavel_nome_normalizado_conciliacao
    )
    and c.metodo = 'telefone_nome_coerente'
)
insert into public.health_score_v3_experimental_lead_conciliacoes (
  raw_id,
  unidade_id,
  evento_chave,
  lead_id,
  metodo,
  evidencia
)
select
  s.raw_id,
  s.unidade_id,
  s.evento_chave,
  s.lead_id,
  s.metodo,
  jsonb_build_object(
    'telefone_normalizado', s.telefone_normalizado,
    'nome_lead_normalizado', s.nome_lead_normalizado,
    'nome_aluno_normalizado', s.aluno_nome_normalizado_conciliacao,
    'nome_responsavel_normalizado', s.responsavel_nome_normalizado_conciliacao,
    'qtd_leads_telefone', s.qtd_leads_telefone,
    'janela_auditada', '2026-06-01/2026-07-31'
  )
from seguros s
on conflict (raw_id) do nothing;

-- A funcao vigente permanece preservada integralmente como base.
alter function public.get_health_score_professor_v3_metricas_periodo(
  date,
  uuid,
  text
) rename to get_health_score_prof_v3_metricas_base_20260728;

create or replace function public.get_health_score_professor_v3_conversao_ciclo(
  p_competencia date,
  p_unidade_id uuid default null
)
returns table (
  metrica text,
  professor_id integer,
  professor_nome text,
  unidade_id uuid,
  competencia date,
  valor_bruto numeric,
  numerador numeric,
  denominador numeric,
  amostra integer,
  estado_base text,
  publicavel boolean,
  confianca text,
  fonte text,
  regra_versao text,
  motivo_sem_base text,
  detalhes jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_competencia date := make_date(
    extract(year from p_competencia)::integer,
    extract(month from p_competencia)::integer,
    1
  );
  v_inicio date;
  v_fim_periodo date;
  v_fim_recorte date;
  v_codigo text;
  v_label text;
begin
  select
    p.periodo_inicio,
    p.periodo_fim,
    p.ciclo_codigo,
    p.periodo_label
  into
    v_inicio,
    v_fim_periodo,
    v_codigo,
    v_label
  from public.fn_health_score_v3_periodo(p_competencia, 'ciclo') p;

  v_fim_recorte := least(v_fim_periodo, current_date);

  return query
  with unidades_permitidas as (
    select up.unidade_id
    from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
  ),
  raw_mais_recente as (
    select distinct on (
      r.unidade_id,
      coalesce(
        r.emusys_aula_id::text,
        r.aula_emusys_id::text,
        'raw:' || r.id::text
      )
    )
      r.*,
      coalesce(
        r.emusys_aula_id::text,
        r.aula_emusys_id::text,
        'raw:' || r.id::text
      ) as evento_chave
    from public.emusys_experimentais_raw r
    join unidades_permitidas up on up.unidade_id = r.unidade_id
    where r.data_aula between v_inicio and v_fim_recorte
      and r.professor_id is not null
      and r.situacao_operacional in ('presente', 'matriculado')
    order by
      r.unidade_id,
      coalesce(
        r.emusys_aula_id::text,
        r.aula_emusys_id::text,
        'raw:' || r.id::text
      ),
      r.id desc
  ),
  raw_resolvido as (
    select
      r.*,
      coalesce(
        r.lead_id,
        vinculo.lead_id,
        conciliacao.lead_id,
        lead_payload.id
      ) as lead_id_resolvido,
      coalesce(
        r.aluno_id,
        vinculo.aluno_id,
        lead_resolvido.aluno_id,
        aluno_origem.id
      ) as aluno_id_resolvido
    from raw_mais_recente r
    left join public.health_score_v3_experimental_lead_conciliacoes conciliacao
      on conciliacao.raw_id = r.id
    left join lateral (
      select
        le.lead_id,
        coalesce(le.aluno_id, l.aluno_id, a_origem.id) as aluno_id
      from public.lead_experimentais le
      left join public.leads l on l.id = le.lead_id
      left join public.alunos a_origem
        on a_origem.lead_origem_id = le.lead_id
       and a_origem.unidade_id = le.unidade_id
      where le.unidade_id = r.unidade_id
        and le.data_experimental = r.data_aula
        and (
          le.id = r.lead_experimental_id
          or (r.lead_id is not null and le.lead_id = r.lead_id)
          or (
            nullif(r.payload #>> '{aluno,id_lead}', '') ~ '^[0-9]+$'
            and le.emusys_lead_id =
              (r.payload #>> '{aluno,id_lead}')::bigint
          )
        )
      order by
        (le.id = r.lead_experimental_id) desc,
        (le.professor_experimental_id = r.professor_id) desc,
        le.id desc
      limit 1
    ) vinculo on true
    left join public.leads lead_payload
      on nullif(r.payload #>> '{aluno,id_lead}', '') ~ '^[0-9]+$'
     and lead_payload.emusys_lead_id =
       (r.payload #>> '{aluno,id_lead}')::integer
     and lead_payload.unidade_id = r.unidade_id
    left join public.leads lead_resolvido
      on lead_resolvido.id = coalesce(
        r.lead_id,
        vinculo.lead_id,
        conciliacao.lead_id,
        lead_payload.id
      )
     and lead_resolvido.unidade_id = r.unidade_id
    left join public.alunos aluno_origem
      on aluno_origem.lead_origem_id = lead_resolvido.id
     and aluno_origem.unidade_id = r.unidade_id
  ),
  experimentais as (
    select
      r.unidade_id,
      r.professor_id,
      r.evento_chave,
      coalesce(
        'lead:' || r.lead_id_resolvido::text,
        'evento:' || r.evento_chave
      ) as lead_chave,
      r.lead_id_resolvido,
      r.data_aula,
      identidade.pessoa_chave
    from raw_resolvido r
    left join public.vw_aluno_identidade_unidade_canonica identidade
      on identidade.unidade_id = r.unidade_id
     and r.aluno_id_resolvido = any(identidade.aluno_ids_locais)
  ),
  matriculas as (
    select distinct
      a.unidade_id,
      coalesce(
        nullif(a.emusys_matricula_id, ''),
        'local:' || a.id::text
      ) as matricula_chave,
      identidade.pessoa_chave,
      a.data_matricula
    from public.alunos a
    join unidades_permitidas up on up.unidade_id = a.unidade_id
    join public.vw_aluno_identidade_unidade_canonica identidade
      on identidade.unidade_id = a.unidade_id
     and a.id = any(identidade.aluno_ids_locais)
    where a.data_matricula between v_inicio
      and least(v_fim_periodo + 30, current_date)
      and lower(coalesce(a.status, '')) <> 'excluido'
  ),
  candidatos as (
    select
      m.unidade_id,
      m.matricula_chave,
      m.data_matricula,
      e.professor_id,
      e.evento_chave,
      e.data_aula,
      row_number() over (
        partition by m.unidade_id, m.matricula_chave
        order by e.data_aula desc, e.evento_chave desc
      ) as ordem_matricula
    from matriculas m
    join experimentais e
      on e.unidade_id = m.unidade_id
     and m.pessoa_chave = e.pessoa_chave
     and m.data_matricula between e.data_aula and e.data_aula + 30
  ),
  candidatos_unicos as (
    select
      c.*,
      row_number() over (
        partition by c.unidade_id, c.evento_chave
        order by c.data_matricula, c.matricula_chave
      ) as ordem_experimental
    from candidatos c
    where c.ordem_matricula = 1
  ),
  creditos as (
    select c.*
    from candidatos_unicos c
    where c.ordem_experimental = 1
  ),
  alvo as (
    select distinct
      pu.professor_id,
      case when p_unidade_id is null then null::uuid else pu.unidade_id end
        as unidade_saida
    from public.professores_unidades pu
    join unidades_permitidas up on up.unidade_id = pu.unidade_id
    where coalesce(pu.emusys_ativo, true)
      and coalesce(pu.validacao_status, 'validado')
        not in ('ignorado', 'rejeitado')
    union
    select distinct
      e.professor_id,
      case when p_unidade_id is null then null::uuid else e.unidade_id end
    from experimentais e
  ),
  estatisticas as (
    select
      e.professor_id,
      case when p_unidade_id is null then null::uuid else e.unidade_id end
        as unidade_saida,
      count(distinct e.evento_chave)::integer as experimentais,
      count(distinct e.evento_chave)
        filter (where e.lead_id_resolvido is null)::integer
        as somente_evento,
      count(distinct e.evento_chave)
        filter (where e.pessoa_chave is null)::integer
        as sem_pessoa_canonica,
      count(distinct e.evento_chave)
        filter (
          where e.lead_id_resolvido is not null
            and e.pessoa_chave is null
            and exists (
              select 1
              from public.leads l
              where l.id = e.lead_id_resolvido
                and (
                  coalesce(l.converteu, false)
                  or l.data_conversao is not null
                )
            )
        )::integer as conversoes_declaradas_sem_matricula_canonica
    from experimentais e
    group by
      e.professor_id,
      case when p_unidade_id is null then null::uuid else e.unidade_id end
  ),
  conversoes as (
    select
      c.professor_id,
      case when p_unidade_id is null then null::uuid else c.unidade_id end
        as unidade_saida,
      count(distinct c.matricula_chave)::integer as matriculas
    from creditos c
    group by
      c.professor_id,
      case when p_unidade_id is null then null::uuid else c.unidade_id end
  )
  select
    'conversao'::text as metrica,
    a.professor_id,
    pr.nome::text as professor_nome,
    a.unidade_saida as unidade_id,
    v_competencia as competencia,
    case
      when coalesce(e.experimentais, 0) > 0 then round(
        least(
          coalesce(c.matriculas, 0),
          e.experimentais
        )::numeric / e.experimentais::numeric * 100,
        2
      )
      else null::numeric
    end as valor_bruto,
    least(
      coalesce(c.matriculas, 0),
      coalesce(e.experimentais, 0)
    )::numeric as numerador,
    coalesce(e.experimentais, 0)::numeric as denominador,
    coalesce(e.experimentais, 0) as amostra,
    case
      when coalesce(e.experimentais, 0) = 0 then 'sem_base'
      when e.experimentais < 3 then 'sem_base_amostra'
      when v_codigo = '2026-JUN-AGO' then 'provisorio_ciclo'
      when current_date < v_fim_periodo + 30 then 'em_maturacao'
      else 'ok'
    end::text as estado_base,
    false as publicavel,
    case
      when coalesce(e.experimentais, 0) = 0 then 'sem_base'
      when e.experimentais < 3 then 'baixa'
      when current_date < v_fim_periodo + 30 then 'provisoria'
      else 'alta'
    end::text as confianca,
    (
      'emusys_experimentais_raw'
      || '+health_score_v3_experimental_lead_conciliacoes'
      || '+vw_aluno_identidade_unidade_canonica+alunos'
    )::text as fonte,
    'health-score-professor-v3-conversao-ciclo-provisorio-1'::text
      as regra_versao,
    case
      when coalesce(e.experimentais, 0) = 0
        then 'nenhuma experimental confirmada no ciclo'
      when e.experimentais < 3
        then 'base minima de 3 experimentais no ciclo nao atingida'
      when v_codigo = '2026-JUN-AGO'
        then 'ciclo visivel para diagnostico; conversao fora do score'
      when current_date < v_fim_periodo + 30
        then 'janela D+30 ainda em maturacao'
      else 'aguardando calibracao das escalas antes de pontuar'
    end::text as motivo_sem_base,
    jsonb_build_object(
      'periodicidade', 'ciclo',
      'periodo_inicio', v_inicio,
      'periodo_fim', v_fim_periodo,
      'fim_recorte', v_fim_recorte,
      'ciclo_codigo', v_codigo,
      'ciclo_label', v_label,
      'experimentais_confirmadas', coalesce(e.experimentais, 0),
      'matriculas_creditadas', least(
        coalesce(c.matriculas, 0),
        coalesce(e.experimentais, 0)
      ),
      'experimentais_somente_evento', coalesce(e.somente_evento, 0),
      'experimentais_sem_pessoa_canonica',
        coalesce(e.sem_pessoa_canonica, 0),
      'conversoes_declaradas_sem_matricula_canonica',
        coalesce(e.conversoes_declaradas_sem_matricula_canonica, 0),
      'identidade_denominador', 'evento_chave/lead_chave',
      'identidade_numerador', 'pessoa_canonica+matricula_canonica_D+30',
      'regra_credito',
        'uma matricula por experimental; ultima experimental anterior em ate 30 dias',
      'fora_do_score', true,
      'provisorio_ciclo', v_codigo = '2026-JUN-AGO'
    ) as detalhes
  from alvo a
  join public.professores pr on pr.id = a.professor_id
  left join estatisticas e
    on e.professor_id = a.professor_id
   and e.unidade_saida is not distinct from a.unidade_saida
  left join conversoes c
    on c.professor_id = a.professor_id
   and c.unidade_saida is not distinct from a.unidade_saida;
end;
$$;

create or replace function public.get_health_score_professor_v3_metricas_periodo(
  p_competencia date,
  p_unidade_id uuid default null,
  p_periodicidade text default 'mensal'
)
returns table (
  metrica text,
  professor_id integer,
  professor_nome text,
  unidade_id uuid,
  competencia date,
  valor_bruto numeric,
  numerador numeric,
  denominador numeric,
  amostra integer,
  estado_base text,
  publicavel boolean,
  confianca text,
  fonte text,
  regra_versao text,
  motivo_sem_base text,
  detalhes jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select b.*
  from public.get_health_score_prof_v3_metricas_base_20260728(
    p_competencia,
    p_unidade_id,
    p_periodicidade
  ) b
  where b.metrica <> 'conversao'

  union all

  select c.*
  from public.get_health_score_professor_v3_conversao_ciclo(
    p_competencia,
    p_unidade_id
  ) c;
$$;

comment on function public.get_health_score_professor_v3_conversao_ciclo(
  date,
  uuid
) is
  'Conversao por ciclo de tres meses. No ciclo 2026-JUN-AGO e visivel como provisorio_ciclo e nao compoe o score.';

comment on function public.get_health_score_professor_v3_metricas_periodo(
  date,
  uuid,
  text
) is
  'Wrapper V3: preserva as metricas vigentes e substitui somente conversao pela leitura trimestral provisoria.';

-- Checklist obrigatorio antes de REVOKE: funcoes estruturais usadas por CHECK,
-- trigger ou default precisam continuar executaveis pelo papel que grava.
do $$
declare
  v_alvo oid;
  v_dependencia text;
begin
  foreach v_alvo in array array[
    'public.get_health_score_prof_v3_metricas_base_20260728(date,uuid,text)'::regprocedure::oid,
    'public.get_health_score_professor_v3_conversao_ciclo(date,uuid)'::regprocedure::oid
  ]
  loop
    select dependencia
      into v_dependencia
    from (
      select 'pg_constraint'::text as dependencia
      from pg_depend d
      join pg_constraint c on c.oid = d.objid
      where d.refobjid = v_alvo
      union all
      select 'pg_trigger'::text
      from pg_depend d
      join pg_trigger t on t.oid = d.objid
      where d.refobjid = v_alvo
        and not t.tgisinternal
      union all
      select 'pg_attrdef'::text
      from pg_depend d
      join pg_attrdef a on a.oid = d.objid
      where d.refobjid = v_alvo
    ) dependencias
    limit 1;

    if v_dependencia is not null then
      raise exception
        'REVOKE bloqueado: funcao % possui dependencia estrutural em %',
        v_alvo::regprocedure,
        v_dependencia;
    end if;
  end loop;
end;
$$;

revoke all on function
  public.get_health_score_prof_v3_metricas_base_20260728(
    date,
    uuid,
    text
  )
  from public, anon, authenticated;
revoke all on function
  public.get_health_score_professor_v3_conversao_ciclo(date, uuid)
  from public, anon, authenticated;
revoke all on function
  public.get_health_score_professor_v3_metricas_periodo(date, uuid, text)
  from public, anon;

grant execute on function
  public.get_health_score_prof_v3_metricas_base_20260728(
    date,
    uuid,
    text
  )
  to service_role;
grant execute on function
  public.get_health_score_professor_v3_conversao_ciclo(date, uuid)
  to service_role;
grant execute on function public.get_health_score_professor_v3_metricas_periodo(
  date,
  uuid,
  text
) to authenticated, service_role;
