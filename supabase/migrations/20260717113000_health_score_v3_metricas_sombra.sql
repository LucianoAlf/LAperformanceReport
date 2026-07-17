-- Health Score Professor V3 - Gate 4.
-- Read models auditaveis dos seis pilares. Nenhum consumidor produtivo e alterado.

create or replace function public.fn_health_score_v3_unidades_permitidas_sombra(
  p_unidade_id uuid default null
)
returns table (unidade_id uuid)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_usuario_id integer;
  v_perfil text;
  v_unidade_usuario uuid;
begin
  if coalesce(auth.role(), '') = 'service_role' or session_user = 'postgres' then
    return query
    select u.id
    from public.unidades u
    where u.ativo = true
      and (p_unidade_id is null or u.id = p_unidade_id);
    return;
  end if;

  select u.id, u.perfil, u.unidade_id
    into v_usuario_id, v_perfil, v_unidade_usuario
  from public.usuarios u
  where u.auth_user_id = auth.uid()
    and u.ativo = true
  limit 1;

  if v_usuario_id is null then
    raise exception 'HEALTH_SCORE_V3_ACESSO_NEGADO: usuario sem cadastro ativo'
      using errcode = '42501';
  end if;

  if v_perfil = 'admin' then
    return query
    select u.id
    from public.unidades u
    where u.ativo = true
      and (p_unidade_id is null or u.id = p_unidade_id)
      and public.usuario_tem_permissao(
        v_usuario_id,
        'professores.ver',
        u.id
      );
  else
    if v_unidade_usuario is null
       or (p_unidade_id is not null and p_unidade_id <> v_unidade_usuario)
       or not public.usuario_tem_permissao(
         v_usuario_id,
         'professores.ver',
         v_unidade_usuario
       ) then
      raise exception 'HEALTH_SCORE_V3_ACESSO_NEGADO: unidade fora do escopo'
        using errcode = '42501';
    end if;

    return query
    select u.id
    from public.unidades u
    where u.id = v_unidade_usuario
      and u.ativo = true;
  end if;

  if not found then
    raise exception 'HEALTH_SCORE_V3_ACESSO_NEGADO: nenhuma unidade permitida'
      using errcode = '42501';
  end if;
end;
$$;

comment on function public.fn_health_score_v3_unidades_permitidas_sombra(uuid) is
  'Guard interno do Gate 4. Retorna somente unidades em que o chamador pode ver professores.';

revoke all on function public.fn_health_score_v3_unidades_permitidas_sombra(uuid)
  from public, anon, authenticated;
grant execute on function public.fn_health_score_v3_unidades_permitidas_sombra(uuid)
  to service_role;

create or replace view public.vw_professor_periodos_efetivos_v3_sombra
with (security_invoker = true)
as
with reconstrucoes_ordenadas as (
  select
    r.*,
    row_number() over (
      partition by r.unidade_id
      order by
        r.data_fim desc,
        r.data_inicio asc,
        r.concluido_em desc nulls last,
        r.created_at desc
    ) as ordem_reconstrucao
  from public.professor_periodos_reconstrucoes_v1 r
  where r.status = 'concluido'
), reconstrucoes_base as (
  select r.*
  from reconstrucoes_ordenadas r
  where r.ordem_reconstrucao = 1
), periodos_base as (
  select
    'baseline:' || p.id::text as periodo_chave,
    p.id as periodo_origem_id,
    p.reconstrucao_id,
    t_fim.id as transicao_fim_id,
    p.unidade_id,
    p.pessoa_chave,
    p.aluno_id,
    p.emusys_aluno_id,
    p.emusys_matricula_id,
    p.emusys_matricula_disciplina_id,
    p.emusys_disciplina_id,
    p.curso_id,
    p.professor_id,
    p.emusys_professor_id,
    p.data_inicio,
    case
      when p.status_periodo = 'ativo' and t_fim.id is not null
        then t_fim.data_transicao
      else p.data_fim
    end as data_fim,
    case
      when p.status_periodo = 'ativo' and t_fim.id is not null
        then 'encerrado'
      else p.status_periodo
    end as status_periodo,
    p.tipo_inicio,
    case
      when p.status_periodo = 'ativo' and t_fim.id is not null
        then 'troca_confirmada_transicao'
      else p.tipo_fim
    end as tipo_fim,
    case
      when coalesce(t_fim.data_transicao, p.data_fim) is null then null
      else extract(epoch from (coalesce(t_fim.data_transicao, p.data_fim) - p.data_inicio))
        / 86400::numeric
    end as duracao_dias,
    case
      when coalesce(t_fim.data_transicao, p.data_fim) is null then null
      else extract(epoch from (coalesce(t_fim.data_transicao, p.data_fim) - p.data_inicio))
        / 86400::numeric / 30.44::numeric
    end as duracao_meses,
    (
      coalesce(t_fim.data_transicao, p.data_fim) is not null
      and extract(epoch from (coalesce(t_fim.data_transicao, p.data_fim) - p.data_inicio))
        / 86400::numeric / 30.44::numeric >= 4
    ) as elegivel_permanencia,
    coalesce(t_fim.motivo_saida_id, p.motivo_saida_id) as motivo_saida_id,
    case
      when t_fim.id is not null then t_fim.atribuicao_confirmada
      when p.motivo_saida_id is not null and p.conta_retencao_professor is not null
        then true
      else false
    end as atribuicao_confirmada,
    coalesce(t_fim.conta_retencao_professor, p.conta_retencao_professor)
      as conta_retencao_professor,
    p.confianca,
    p.inicio_incompleto,
    p.substituicao_candidata,
    p.conflitos,
    p.publicavel,
    'professor_matricula_disciplina_periodos_v1+transicoes_gate3'::text as fonte
  from reconstrucoes_base r
  join public.professor_matricula_disciplina_periodos_v1 p
    on p.reconstrucao_id = r.id
  left join lateral (
    select t.*
    from public.aluno_professor_transicoes t
    where p.status_periodo = 'ativo'
      and t.unidade_id = p.unidade_id
      and t.periodo_origem_id = p.id
      and t.data_transicao::date > r.data_fim
    order by t.data_transicao, t.created_at, t.id
    limit 1
  ) t_fim on true
), transicoes_ordenadas as (
  select
    t.*,
    r.id as reconstrucao_base_id,
    r.data_fim as data_fim_reconstrucao,
    lead(t.id) over (
      partition by t.unidade_id, t.emusys_matricula_disciplina_id
      order by t.data_transicao, t.created_at, t.id
    ) as proxima_transicao_id,
    lead(t.data_transicao) over (
      partition by t.unidade_id, t.emusys_matricula_disciplina_id
      order by t.data_transicao, t.created_at, t.id
    ) as proxima_data_transicao
  from public.aluno_professor_transicoes t
  join reconstrucoes_base r on r.unidade_id = t.unidade_id
  where t.data_transicao::date > r.data_fim
), periodos_transicoes as (
  select
    'transicao:' || t.id::text as periodo_chave,
    t.periodo_origem_id,
    t.reconstrucao_base_id as reconstrucao_id,
    t.proxima_transicao_id as transicao_fim_id,
    t.unidade_id,
    coalesce(
      p_origem.pessoa_chave,
      case
        when nullif(t.payload_snapshot->>'emusys_aluno_id', '') ~ '^[0-9]+$'
          then 'emusys:' || (t.payload_snapshot->>'emusys_aluno_id')
        when t.aluno_id is not null then 'local:' || t.aluno_id::text
        else 'transicao:' || t.id::text
      end
    ) as pessoa_chave,
    coalesce(t.aluno_id, p_origem.aluno_id) as aluno_id,
    coalesce(
      case
        when nullif(t.payload_snapshot->>'emusys_aluno_id', '') ~ '^[0-9]+$'
          then (t.payload_snapshot->>'emusys_aluno_id')::bigint
        else null
      end,
      p_origem.emusys_aluno_id
    ) as emusys_aluno_id,
    coalesce(t.emusys_matricula_id, p_origem.emusys_matricula_id)
      as emusys_matricula_id,
    t.emusys_matricula_disciplina_id,
    coalesce(
      case
        when nullif(t.payload_snapshot->>'emusys_disciplina_id', '') ~ '^[0-9]+$'
          then (t.payload_snapshot->>'emusys_disciplina_id')::bigint
        else null
      end,
      p_origem.emusys_disciplina_id
    ) as emusys_disciplina_id,
    coalesce(t.curso_id, p_origem.curso_id) as curso_id,
    t.professor_novo_id as professor_id,
    t.emusys_professor_novo_id as emusys_professor_id,
    t.data_transicao as data_inicio,
    t.proxima_data_transicao as data_fim,
    case when t.proxima_data_transicao is null then 'ativo' else 'encerrado' end
      as status_periodo,
    'troca_confirmada_transicao'::text as tipo_inicio,
    case
      when t.proxima_data_transicao is null then null
      else 'troca_confirmada_transicao'
    end as tipo_fim,
    case
      when t.proxima_data_transicao is null then null
      else extract(epoch from (t.proxima_data_transicao - t.data_transicao))
        / 86400::numeric
    end as duracao_dias,
    case
      when t.proxima_data_transicao is null then null
      else extract(epoch from (t.proxima_data_transicao - t.data_transicao))
        / 86400::numeric / 30.44::numeric
    end as duracao_meses,
    (
      t.proxima_data_transicao is not null
      and extract(epoch from (t.proxima_data_transicao - t.data_transicao))
        / 86400::numeric / 30.44::numeric >= 4
    ) as elegivel_permanencia,
    t_fim.motivo_saida_id,
    coalesce(t_fim.atribuicao_confirmada, false) as atribuicao_confirmada,
    t_fim.conta_retencao_professor,
    case
      when t.professor_novo_id is not null
       and t.emusys_professor_novo_id is not null
       and t.emusys_matricula_disciplina_id is not null
       and (
         p_origem.pessoa_chave is not null
         or nullif(t.payload_snapshot->>'emusys_aluno_id', '') ~ '^[0-9]+$'
       ) then 'alta'
      else 'revisar'
    end as confianca,
    false as inicio_incompleto,
    false as substituicao_candidata,
    '[]'::jsonb as conflitos,
    (
      t.professor_novo_id is not null
      and t.emusys_professor_novo_id is not null
      and t.emusys_matricula_disciplina_id is not null
      and (
        p_origem.pessoa_chave is not null
        or nullif(t.payload_snapshot->>'emusys_aluno_id', '') ~ '^[0-9]+$'
      )
    ) as publicavel,
    'aluno_professor_transicoes_gate3'::text as fonte
  from transicoes_ordenadas t
  left join public.professor_matricula_disciplina_periodos_v1 p_origem
    on p_origem.id = t.periodo_origem_id
  left join public.aluno_professor_transicoes t_fim
    on t_fim.id = t.proxima_transicao_id
)
select * from periodos_base
union all
select * from periodos_transicoes;

comment on view public.vw_professor_periodos_efetivos_v3_sombra is
  'Gate 4: baseline historico completo mais transicoes futuras. Nao altera reconstrucoes concluidas.';

revoke all on table public.vw_professor_periodos_efetivos_v3_sombra
  from public, anon, authenticated;
grant select on table public.vw_professor_periodos_efetivos_v3_sombra
  to service_role;

create or replace function public.get_professor_conversao_v3_sombra(
  p_competencia date,
  p_unidade_id uuid default null
)
returns table (
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
with params as (
  select
    date_trunc('month', p_competencia)::date as competencia,
    date_trunc('quarter', p_competencia)::date as inicio_trimestre,
    (date_trunc('quarter', p_competencia) + interval '3 months - 1 day')::date
      as fim_trimestre
  where p_competencia is not null
), unidades_permitidas as (
  select up.unidade_id
  from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
), raw_vinculado as (
  select
    r.*,
    coalesce(r.aluno_id, vinculo.aluno_id) as aluno_id_resolvido,
    coalesce(
      r.emusys_aula_id::text,
      r.aula_emusys_id::text,
      'raw:' || r.id::text
    ) as evento_chave
  from public.emusys_experimentais_raw r
  join unidades_permitidas up on up.unidade_id = r.unidade_id
  join params p
    on r.data_aula between p.inicio_trimestre and p.fim_trimestre
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
          and le.emusys_lead_id = (r.payload #>> '{aluno,id_lead}')::bigint
        )
      )
    order by
      (le.id = r.lead_experimental_id) desc,
      (le.professor_experimental_id = r.professor_id) desc,
      le.id desc
    limit 1
  ) vinculo on true
  where r.professor_id is not null
    and r.situacao_operacional in ('presente', 'matriculado')
), experimentais_confirmadas as (
  select distinct on (r.unidade_id, r.evento_chave)
    r.unidade_id,
    r.professor_id,
    r.evento_chave,
    r.data_aula,
    i.pessoa_chave,
    r.aluno_id_resolvido
  from raw_vinculado r
  left join public.vw_aluno_identidade_unidade_canonica i
    on i.unidade_id = r.unidade_id
   and r.aluno_id_resolvido = any(i.aluno_ids_locais)
  order by r.unidade_id, r.evento_chave, r.id desc
), matriculas as (
  select distinct
    a.unidade_id,
    coalesce(
      nullif(a.emusys_matricula_id, ''),
      'local:' || a.id::text
    ) as matricula_chave,
    i.pessoa_chave,
    a.data_matricula
  from public.alunos a
  join unidades_permitidas up on up.unidade_id = a.unidade_id
  join params p
    on a.data_matricula between p.inicio_trimestre and p.fim_trimestre + 30
  left join public.vw_aluno_identidade_unidade_canonica i
    on i.unidade_id = a.unidade_id
   and a.id = any(i.aluno_ids_locais)
  where a.data_matricula is not null
    and lower(coalesce(a.status, '')) <> 'excluido'
), candidatos_credito as (
  select
    m.unidade_id,
    m.matricula_chave,
    m.pessoa_chave,
    m.data_matricula,
    e.professor_id,
    e.evento_chave,
    e.data_aula,
    row_number() over (
      partition by m.unidade_id, m.matricula_chave
      order by e.data_aula desc, e.evento_chave desc
    ) as ordem_credito
  from matriculas m
  join experimentais_confirmadas e
    on e.unidade_id = m.unidade_id
   and e.pessoa_chave = m.pessoa_chave
   and m.data_matricula >= e.data_aula
   and m.data_matricula <= e.data_aula + interval '30 days'
  where m.pessoa_chave is not null
), creditos as (
  select c.*
  from candidatos_credito c
  where c.ordem_credito = 1
), professores_unidade as (
  select distinct pu.professor_id, pu.unidade_id
  from public.professores_unidades pu
  join unidades_permitidas up on up.unidade_id = pu.unidade_id
  where coalesce(pu.emusys_ativo, true)
    and coalesce(pu.validacao_status, 'validado') not in ('ignorado', 'rejeitado')
  union
  select distinct e.professor_id, e.unidade_id
  from experimentais_confirmadas e
), professores_alvo as (
  select distinct
    pu.professor_id,
    case when p_unidade_id is null then null::uuid else pu.unidade_id end as unidade_saida
  from professores_unidade pu
), estatisticas as (
  select
    e.professor_id,
    case when p_unidade_id is null then null::uuid else e.unidade_id end as unidade_saida,
    count(distinct e.evento_chave)::integer as amostra,
    count(distinct e.evento_chave) filter (
      where e.pessoa_chave is null
    )::integer as experimentais_sem_identidade
  from experimentais_confirmadas e
  group by
    e.professor_id,
    case when p_unidade_id is null then null::uuid else e.unidade_id end
), conversoes as (
  select
    c.professor_id,
    case when p_unidade_id is null then null::uuid else c.unidade_id end as unidade_saida,
    count(distinct c.matricula_chave)::integer as matriculas_creditadas
  from creditos c
  group by
    c.professor_id,
    case when p_unidade_id is null then null::uuid else c.unidade_id end
)
select
  pa.professor_id,
  pr.nome as professor_nome,
  pa.unidade_saida as unidade_id,
  p.competencia,
  case
    when coalesce(e.amostra, 0) > 0 then
      round(
        coalesce(c.matriculas_creditadas, 0)::numeric
        / e.amostra::numeric * 100,
        2
      )
    else null
  end as valor_bruto,
  coalesce(c.matriculas_creditadas, 0)::numeric as numerador,
  coalesce(e.amostra, 0)::numeric as denominador,
  coalesce(e.amostra, 0) as amostra,
  case
    when coalesce(e.amostra, 0) = 0 then 'sem_base'
    when e.amostra < 3 then 'sem_base_amostra'
    when current_date < p.fim_trimestre + 30 then 'em_maturacao'
    when e.experimentais_sem_identidade > 0 then 'revisar'
    else 'ok'
  end as estado_base,
  (
    coalesce(e.amostra, 0) >= 3
    and current_date >= p.fim_trimestre + 30
    and e.experimentais_sem_identidade = 0
  ) as publicavel,
  case
    when coalesce(e.amostra, 0) = 0 then 'sem_base'
    when e.experimentais_sem_identidade > 0 then 'media'
    when current_date < p.fim_trimestre + 30 then 'provisoria'
    else 'alta'
  end as confianca,
  'emusys_experimentais_raw+vw_aluno_identidade_unidade_canonica+alunos'::text
    as fonte,
  'health-score-professor-v3-conversao-1'::text as regra_versao,
  case
    when coalesce(e.amostra, 0) = 0 then 'nenhuma experimental confirmada no trimestre'
    when e.amostra < 3 then 'base minima de 3 experimentais nao atingida'
    when current_date < p.fim_trimestre + 30 then 'janela D+30 ainda em maturacao'
    when e.experimentais_sem_identidade > 0 then 'ha experimentais sem pessoa canonica resolvida'
    else null
  end as motivo_sem_base,
  jsonb_build_object(
    'inicio_trimestre', p.inicio_trimestre,
    'fim_trimestre', p.fim_trimestre,
    'experimentais_confirmadas', coalesce(e.amostra, 0),
    'matriculas_creditadas', coalesce(c.matriculas_creditadas, 0),
    'experimentais_sem_identidade', coalesce(e.experimentais_sem_identidade, 0),
    'regra_credito', 'ultima experimental confirmada anterior em ate 30 dias',
    'matricula_direta', 'fora do numerador'
  ) as detalhes
from professores_alvo pa
join public.professores pr on pr.id = pa.professor_id
cross join params p
left join estatisticas e
  on e.professor_id = pa.professor_id
 and e.unidade_saida is not distinct from pa.unidade_saida
left join conversoes c
  on c.professor_id = pa.professor_id
 and c.unidade_saida is not distinct from pa.unidade_saida
order by pr.nome, pa.unidade_saida;
$$;

create or replace function public.get_professor_media_turma_v3_sombra(
  p_competencia date,
  p_unidade_id uuid default null
)
returns table (
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
with params as (
  select
    date_trunc('month', p_competencia)::date as competencia,
    date_trunc('quarter', p_competencia)::date as inicio_trimestre,
    (date_trunc('quarter', p_competencia) + interval '3 months - 1 day')::date
      as fim_trimestre,
    least(
      (date_trunc('quarter', p_competencia) + interval '3 months - 1 day')::date,
      (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date
    ) as fim_recorte
  where p_competencia is not null
), unidades_permitidas as (
  select up.unidade_id
  from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
), eventos_identificados as (
  select distinct
    ae.professor_id,
    ae.unidade_id,
    date_trunc('month', ae.data_aula)::date as mes_referencia,
    coalesce(
      i.pessoa_chave,
      case when aa.aluno_emusys_id is not null
        then 'emusys:' || aa.aluno_emusys_id::text end,
      case when aa.aluno_id is not null
        then 'local:' || aa.aluno_id::text end
    ) as pessoa_chave,
    case
      when nullif(btrim(ae.turma_nome), '') is not null then
        ae.unidade_id::text || ':turma:'
        || coalesce(ae.curso_emusys_id::text, lower(btrim(ae.curso_nome)))
        || ':' || lower(btrim(ae.turma_nome))
      when ae.matricula_disciplina_id is not null
       and ae.matricula_disciplina_id > 0 then
        ae.unidade_id::text || ':individual:' || ae.matricula_disciplina_id::text
      else null
    end as turma_chave,
    c.id is not null as curso_mapeado,
    coalesce(c.is_projeto_banda, false) as is_projeto_banda
  from public.aulas_emusys ae
  join unidades_permitidas up on up.unidade_id = ae.unidade_id
  join params p on ae.data_aula between p.inicio_trimestre and p.fim_recorte
  join public.aula_alunos_emusys aa on aa.aula_emusys_id = ae.id
  left join public.vw_aluno_identidade_unidade_canonica i
    on i.unidade_id = ae.unidade_id
   and (
     (aa.aluno_emusys_id is not null and i.emusys_aluno_id = aa.aluno_emusys_id)
     or (aa.aluno_id is not null and aa.aluno_id = any(i.aluno_ids_locais))
   )
  left join public.curso_emusys_depara d
    on d.unidade_id = ae.unidade_id
   and d.emusys_disciplina_id = ae.curso_emusys_id
  left join public.cursos c on c.id = d.curso_id
  where ae.professor_id is not null
    and ae.cancelada = false
    and lower(coalesce(ae.categoria, 'normal')) = 'normal'
    and coalesce(ae.sem_acompanhamento, false) = false
), eventos_elegiveis as (
  select e.*
  from eventos_identificados e
  where e.pessoa_chave is not null
    and e.turma_chave is not null
    and e.is_projeto_banda = false
), mensais as (
  select
    e.professor_id,
    case when p_unidade_id is null then null::uuid else e.unidade_id end as unidade_saida,
    e.mes_referencia,
    count(distinct (e.pessoa_chave, e.turma_chave))::integer as ocupacoes,
    count(distinct e.turma_chave)::integer as turmas
  from eventos_elegiveis e
  group by
    e.professor_id,
    case when p_unidade_id is null then null::uuid else e.unidade_id end,
    e.mes_referencia
), problemas as (
  select
    e.professor_id,
    case when p_unidade_id is null then null::uuid else e.unidade_id end as unidade_saida,
    count(*) filter (where e.pessoa_chave is null)::integer as sem_identidade,
    count(*) filter (where e.turma_chave is null)::integer as sem_turma_estavel,
    count(*) filter (where not e.curso_mapeado)::integer as curso_sem_depara
  from eventos_identificados e
  where e.is_projeto_banda = false
  group by
    e.professor_id,
    case when p_unidade_id is null then null::uuid else e.unidade_id end
), estatisticas as (
  select
    m.professor_id,
    m.unidade_saida,
    sum(m.ocupacoes)::integer as ocupacoes_total,
    sum(m.turmas)::integer as turmas_total,
    count(distinct m.mes_referencia)::integer as meses_com_base
  from mensais m
  group by m.professor_id, m.unidade_saida
), professores_unidade as (
  select distinct pu.professor_id, pu.unidade_id
  from public.professores_unidades pu
  join unidades_permitidas up on up.unidade_id = pu.unidade_id
  where coalesce(pu.emusys_ativo, true)
    and coalesce(pu.validacao_status, 'validado') not in ('ignorado', 'rejeitado')
  union
  select distinct e.professor_id, e.unidade_id
  from eventos_identificados e
), professores_alvo as (
  select distinct
    pu.professor_id,
    case when p_unidade_id is null then null::uuid else pu.unidade_id end as unidade_saida
  from professores_unidade pu
)
select
  pa.professor_id,
  pr.nome as professor_nome,
  pa.unidade_saida as unidade_id,
  p.competencia,
  case
    when coalesce(e.turmas_total, 0) > 0 then
      round(e.ocupacoes_total::numeric / e.turmas_total::numeric, 2)
    else null
  end as valor_bruto,
  coalesce(e.ocupacoes_total, 0)::numeric as numerador,
  coalesce(e.turmas_total, 0)::numeric as denominador,
  coalesce(e.ocupacoes_total, 0) as amostra,
  case
    when coalesce(e.turmas_total, 0) = 0 then 'sem_base'
    when e.meses_com_base < 3 then 'provisorio'
    when coalesce(pb.sem_identidade, 0)
       + coalesce(pb.sem_turma_estavel, 0)
       + coalesce(pb.curso_sem_depara, 0) > 0 then 'revisar'
    else 'ok'
  end as estado_base,
  (
    coalesce(e.turmas_total, 0) > 0
    and e.meses_com_base = 3
    and coalesce(pb.sem_identidade, 0)
      + coalesce(pb.sem_turma_estavel, 0)
      + coalesce(pb.curso_sem_depara, 0) = 0
  ) as publicavel,
  case
    when coalesce(e.turmas_total, 0) = 0 then 'sem_base'
    when coalesce(pb.sem_identidade, 0)
       + coalesce(pb.sem_turma_estavel, 0)
       + coalesce(pb.curso_sem_depara, 0) > 0 then 'media'
    when e.meses_com_base < 3 then 'provisoria'
    else 'alta'
  end as confianca,
  'aulas_emusys+aula_alunos_emusys+vw_aluno_identidade_unidade_canonica'::text
    as fonte,
  'health-score-professor-v3-media-turma-1'::text as regra_versao,
  case
    when coalesce(e.turmas_total, 0) = 0 then 'nenhuma turma regular com identidade estavel'
    when e.meses_com_base < 3 then 'trimestre ainda nao possui tres fechamentos mensais'
    when coalesce(pb.sem_identidade, 0)
       + coalesce(pb.sem_turma_estavel, 0)
       + coalesce(pb.curso_sem_depara, 0) > 0 then 'ha eventos sem identidade, turma ou de-para canonico'
    else null
  end as motivo_sem_base,
  jsonb_build_object(
    'inicio_trimestre', p.inicio_trimestre,
    'fim_recorte', p.fim_recorte,
    'ocupacoes_unicas', coalesce(e.ocupacoes_total, 0),
    'turmas_regulares', coalesce(e.turmas_total, 0),
    'meses_com_base', coalesce(e.meses_com_base, 0),
    'sem_identidade', coalesce(pb.sem_identidade, 0),
    'sem_turma_estavel', coalesce(pb.sem_turma_estavel, 0),
    'curso_sem_depara', coalesce(pb.curso_sem_depara, 0),
    'exclusao', 'cursos is_projeto_banda=true'
  ) as detalhes
from professores_alvo pa
join public.professores pr on pr.id = pa.professor_id
cross join params p
left join estatisticas e
  on e.professor_id = pa.professor_id
 and e.unidade_saida is not distinct from pa.unidade_saida
left join problemas pb
  on pb.professor_id = pa.professor_id
 and pb.unidade_saida is not distinct from pa.unidade_saida
order by pr.nome, pa.unidade_saida;
$$;

create or replace function public.get_professor_numero_alunos_v3_sombra(
  p_competencia date,
  p_unidade_id uuid default null
)
returns table (
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
with params as (
  select
    date_trunc('month', p_competencia)::date as competencia,
    date_trunc('quarter', p_competencia)::date as inicio_trimestre,
    (date_trunc('quarter', p_competencia) + interval '3 months - 1 day')::date
      as fim_trimestre,
    date_trunc('month', p_competencia)::date as ultimo_mes_disponivel
  where p_competencia is not null
), unidades_permitidas as (
  select up.unidade_id
  from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
), meses as (
  select
    gs::date as mes_inicio,
    (gs + interval '1 month - 1 day')::date as mes_fim
  from params p
  cross join lateral generate_series(
    p.inicio_trimestre::timestamp,
    least(
      date_trunc('month', p.fim_trimestre)::timestamp,
      p.ultimo_mes_disponivel::timestamp
    ),
    interval '1 month'
  ) gs
), periodos as (
  select pe.*
  from public.vw_professor_periodos_efetivos_v3_sombra pe
  join unidades_permitidas up on up.unidade_id = pe.unidade_id
  where pe.professor_id is not null
    and pe.status_periodo <> 'invalidado'
), professores_unidade as (
  select distinct pu.professor_id, pu.unidade_id
  from public.professores_unidades pu
  join unidades_permitidas up on up.unidade_id = pu.unidade_id
  where coalesce(pu.emusys_ativo, true)
    and coalesce(pu.validacao_status, 'validado') not in ('ignorado', 'rejeitado')
  union
  select distinct p.professor_id, p.unidade_id
  from periodos p
  cross join params pr
  where p.data_inicio::date <= pr.fim_trimestre
    and (p.data_fim is null or p.data_fim::date >= pr.inicio_trimestre)
), professores_alvo as (
  select distinct
    pu.professor_id,
    case when p_unidade_id is null then null::uuid else pu.unidade_id end as unidade_saida
  from professores_unidade pu
), professor_meses as (
  select
    pa.professor_id,
    pa.unidade_saida,
    m.mes_inicio,
    m.mes_fim
  from professores_alvo pa
  cross join meses m
), fechamentos as (
  select
    pm.professor_id,
    pm.unidade_saida,
    pm.mes_inicio,
    pm.mes_fim,
    count(distinct (
      p.unidade_id::text || ':' || p.pessoa_chave
    ))::integer as alunos_fechamento,
    count(distinct p.periodo_chave) filter (
      where p.publicavel = false
    )::integer as periodos_nao_publicaveis
  from professor_meses pm
  left join periodos p
    on p.professor_id = pm.professor_id
   and (pm.unidade_saida is null or p.unidade_id = pm.unidade_saida)
   and (p.data_inicio at time zone 'America/Sao_Paulo')::date <= pm.mes_fim
   and (
     p.data_fim is null
     or (p.data_fim at time zone 'America/Sao_Paulo')::date > pm.mes_fim
   )
  group by pm.professor_id, pm.unidade_saida, pm.mes_inicio, pm.mes_fim
), estatisticas as (
  select
    f.professor_id,
    f.unidade_saida,
    avg(f.alunos_fechamento::numeric) as media_alunos,
    sum(f.alunos_fechamento)::integer as soma_alunos,
    count(*)::integer as meses_com_base,
    sum(f.periodos_nao_publicaveis)::integer as periodos_nao_publicaveis,
    jsonb_agg(
      jsonb_build_object(
        'mes', f.mes_inicio,
        'alunos_fechamento', f.alunos_fechamento,
        'periodos_nao_publicaveis', f.periodos_nao_publicaveis
      ) order by f.mes_inicio
    ) as fechamentos_mensais
  from fechamentos f
  group by f.professor_id, f.unidade_saida
)
select
  pa.professor_id,
  pr.nome as professor_nome,
  pa.unidade_saida as unidade_id,
  p.competencia,
  case when e.meses_com_base = 3 then round(e.media_alunos, 2) else null end
    as valor_bruto,
  coalesce(e.soma_alunos, 0)::numeric as numerador,
  coalesce(e.meses_com_base, 0)::numeric as denominador,
  coalesce(e.meses_com_base, 0) as amostra,
  case
    when coalesce(e.meses_com_base, 0) < 3 then 'provisorio'
    when e.periodos_nao_publicaveis > 0 then 'revisar'
    else 'ok'
  end as estado_base,
  (
    e.meses_com_base = 3
    and e.periodos_nao_publicaveis = 0
  ) as publicavel,
  case
    when coalesce(e.meses_com_base, 0) < 3 then 'provisoria'
    when e.periodos_nao_publicaveis > 0 then 'media'
    else 'alta'
  end as confianca,
  'vw_professor_periodos_efetivos_v3_sombra'::text as fonte,
  'health-score-professor-v3-numero-alunos-1'::text as regra_versao,
  case
    when coalesce(e.meses_com_base, 0) < 3 then 'trimestre ainda nao possui tres fechamentos mensais'
    when e.periodos_nao_publicaveis > 0 then 'ha vinculos historicos nao publicaveis no fechamento'
    else null
  end as motivo_sem_base,
  jsonb_build_object(
    'inicio_trimestre', p.inicio_trimestre,
    'fim_trimestre', p.fim_trimestre,
    'meses_com_base', coalesce(e.meses_com_base, 0),
    'periodos_nao_publicaveis', coalesce(e.periodos_nao_publicaveis, 0),
    'fechamentos', coalesce(e.fechamentos_mensais, '[]'::jsonb),
    'identidade_consolidada', 'unidade_id+pessoa_chave'
  ) as detalhes
from professores_alvo pa
join public.professores pr on pr.id = pa.professor_id
cross join params p
left join estatisticas e
  on e.professor_id = pa.professor_id
 and e.unidade_saida is not distinct from pa.unidade_saida
order by pr.nome, pa.unidade_saida;
$$;

create or replace function public.get_professor_retencao_v3_sombra(
  p_competencia date,
  p_unidade_id uuid default null
)
returns table (
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
with params as (
  select
    date_trunc('month', p_competencia)::date as competencia,
    date_trunc('quarter', p_competencia)::date as inicio_trimestre,
    (date_trunc('quarter', p_competencia) + interval '3 months - 1 day')::date
      as fim_trimestre
  where p_competencia is not null
), unidades_permitidas as (
  select up.unidade_id
  from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
), periodos as (
  select pe.*
  from public.vw_professor_periodos_efetivos_v3_sombra pe
  join unidades_permitidas up on up.unidade_id = pe.unidade_id
  cross join params p
  where pe.professor_id is not null
    and pe.status_periodo <> 'invalidado'
    and (pe.data_inicio at time zone 'America/Sao_Paulo')::date <= p.fim_trimestre
    and (
      pe.data_fim is null
      or (pe.data_fim at time zone 'America/Sao_Paulo')::date >= p.inicio_trimestre
    )
), professores_alvo as (
  select distinct
    pe.professor_id,
    case when p_unidade_id is null then null::uuid else pe.unidade_id end as unidade_saida
  from periodos pe
), estatisticas as (
  select
    pe.professor_id,
    case when p_unidade_id is null then null::uuid else pe.unidade_id end as unidade_saida,
    count(distinct pe.periodo_chave) filter (
      where pe.publicavel = true
    )::integer as vinculos_expostos,
    count(distinct pe.periodo_chave) filter (
      where pe.publicavel = false
    )::integer as vinculos_nao_publicaveis,
    count(distinct pe.periodo_chave) filter (
      where pe.publicavel = true
        and pe.status_periodo = 'encerrado'
        and (pe.data_fim at time zone 'America/Sao_Paulo')::date
          between p.inicio_trimestre and p.fim_trimestre
        and pe.atribuicao_confirmada is true
        and pe.conta_retencao_professor is true
        and ms.conta_score_professor is true
    )::integer as encerramentos_atribuiveis,
    count(distinct pe.periodo_chave) filter (
      where pe.publicavel = true
        and pe.status_periodo = 'encerrado'
        and (pe.data_fim at time zone 'America/Sao_Paulo')::date
          between p.inicio_trimestre and p.fim_trimestre
        and (
          pe.atribuicao_confirmada is not true
          or pe.conta_retencao_professor is null
          or pe.motivo_saida_id is null
        )
    )::integer as encerramentos_desconhecidos
  from periodos pe
  cross join params p
  left join public.motivos_saida ms on ms.id = pe.motivo_saida_id
  group by
    pe.professor_id,
    case when p_unidade_id is null then null::uuid else pe.unidade_id end
)
select
  pa.professor_id,
  pr.nome as professor_nome,
  pa.unidade_saida as unidade_id,
  p.competencia,
  case
    when e.vinculos_expostos > 0 then
      round(
        100 * (
          1 - e.encerramentos_atribuiveis::numeric / e.vinculos_expostos::numeric
        ),
        2
      )
    else null
  end as valor_bruto,
  greatest(
    coalesce(e.vinculos_expostos, 0) - coalesce(e.encerramentos_atribuiveis, 0),
    0
  )::numeric as numerador,
  coalesce(e.vinculos_expostos, 0)::numeric as denominador,
  coalesce(e.vinculos_expostos, 0) as amostra,
  case
    when coalesce(e.vinculos_expostos, 0) = 0 then 'sem_base'
    when e.vinculos_expostos < 10 then 'sem_base_amostra'
    when e.encerramentos_desconhecidos > 0
      or e.vinculos_nao_publicaveis > 0 then 'revisar'
    else 'ok'
  end as estado_base,
  (
    e.vinculos_expostos >= 10
    and e.encerramentos_desconhecidos = 0
    and e.vinculos_nao_publicaveis = 0
  ) as publicavel,
  case
    when coalesce(e.vinculos_expostos, 0) = 0 then 'sem_base'
    when e.encerramentos_desconhecidos > 0
      or e.vinculos_nao_publicaveis > 0 then 'media'
    when e.vinculos_expostos < 10 then 'baixa_amostra'
    else 'alta'
  end as confianca,
  'vw_professor_periodos_efetivos_v3_sombra+motivos_saida'::text as fonte,
  'health-score-professor-v3-retencao-1'::text as regra_versao,
  case
    when coalesce(e.vinculos_expostos, 0) = 0 then 'nenhum vinculo publicavel exposto no trimestre'
    when e.vinculos_expostos < 10 then 'base minima de 10 vinculos expostos nao atingida'
    when e.encerramentos_desconhecidos > 0 then 'ha encerramentos sem atribuicao humana confirmada'
    when e.vinculos_nao_publicaveis > 0 then 'ha vinculos historicos em revisao'
    else null
  end as motivo_sem_base,
  jsonb_build_object(
    'inicio_trimestre', p.inicio_trimestre,
    'fim_trimestre', p.fim_trimestre,
    'vinculos_expostos', coalesce(e.vinculos_expostos, 0),
    'encerramentos_atribuiveis', coalesce(e.encerramentos_atribuiveis, 0),
    'encerramentos_desconhecidos', coalesce(e.encerramentos_desconhecidos, 0),
    'vinculos_nao_publicaveis', coalesce(e.vinculos_nao_publicaveis, 0),
    'regra_atribuicao', 'atribuicao_confirmada=true e motivos_saida.conta_score_professor=true'
  ) as detalhes
from professores_alvo pa
join public.professores pr on pr.id = pa.professor_id
cross join params p
left join estatisticas e
  on e.professor_id = pa.professor_id
 and e.unidade_saida is not distinct from pa.unidade_saida
order by pr.nome, pa.unidade_saida;
$$;

create or replace function public.get_professor_permanencia_v3_sombra(
  p_competencia date,
  p_unidade_id uuid default null
)
returns table (
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
with params as (
  select
    date_trunc('month', p_competencia)::date as competencia,
    date_trunc('quarter', p_competencia)::date as inicio_trimestre,
    (date_trunc('quarter', p_competencia) + interval '3 months - 1 day')::date
      as fim_trimestre
  where p_competencia is not null
), unidades_permitidas as (
  select up.unidade_id
  from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
), periodos_unidade as (
  select pe.*
  from public.vw_professor_periodos_efetivos_v3_sombra pe
  join unidades_permitidas up on up.unidade_id = pe.unidade_id
  where pe.professor_id is not null
    and pe.status_periodo <> 'invalidado'
), professores_alvo as (
  select distinct
    pe.professor_id,
    case when p_unidade_id is null then null::uuid else pe.unidade_id end as unidade_saida
  from periodos_unidade pe
  cross join params p
  where pe.data_inicio::date <= p.fim_trimestre
    and (pe.data_fim is null or pe.data_fim::date >= p.inicio_trimestre)
), periodos_elegiveis as (
  select pe.*
  from periodos_unidade pe
  cross join params p
  where pe.status_periodo = 'encerrado'
    and pe.elegivel_permanencia = true
    and pe.publicavel = true
    and pe.confianca in ('alta', 'revisado_aprovado')
    and (pe.data_fim at time zone 'America/Sao_Paulo')::date
      between p.inicio_trimestre and p.fim_trimestre
), estatisticas as (
  select
    pe.professor_id,
    case when p_unidade_id is null then null::uuid else pe.unidade_id end as unidade_saida,
    sum(pe.duracao_meses) as soma_meses,
    avg(pe.duracao_meses) as media_meses,
    percentile_cont(0.5) within group (order by pe.duracao_meses)
      as mediana_meses,
    count(*)::integer as amostra
  from periodos_elegiveis pe
  group by
    pe.professor_id,
    case when p_unidade_id is null then null::uuid else pe.unidade_id end
)
select
  pa.professor_id,
  pr.nome as professor_nome,
  pa.unidade_saida as unidade_id,
  p.competencia,
  case when coalesce(e.amostra, 0) > 0 then round(e.media_meses, 2) else null end
    as valor_bruto,
  coalesce(e.soma_meses, 0)::numeric as numerador,
  coalesce(e.amostra, 0)::numeric as denominador,
  coalesce(e.amostra, 0) as amostra,
  case
    when coalesce(e.amostra, 0) = 0 then 'sem_base'
    when e.amostra < 3 then 'sem_base_amostra'
    else 'ok'
  end as estado_base,
  (e.amostra >= 3) as publicavel,
  case
    when coalesce(e.amostra, 0) = 0 then 'sem_base'
    when e.amostra < 3 then 'baixa_amostra'
    else 'alta'
  end as confianca,
  'vw_professor_periodos_efetivos_v3_sombra'::text as fonte,
  'health-score-professor-v3-permanencia-1'::text as regra_versao,
  case
    when coalesce(e.amostra, 0) = 0 then 'nenhum vinculo encerrado elegivel e publicavel no trimestre'
    when e.amostra < 3 then 'pontuacao exige ao menos 3 vinculos encerrados elegiveis'
    else null
  end as motivo_sem_base,
  jsonb_build_object(
    'inicio_trimestre', p.inicio_trimestre,
    'fim_trimestre', p.fim_trimestre,
    'media_meses', case when coalesce(e.amostra, 0) > 0 then round(e.media_meses, 2) else null end,
    'mediana_meses', case when coalesce(e.amostra, 0) > 0 then round(e.mediana_meses::numeric, 2) else null end,
    'amostra_encerrada', coalesce(e.amostra, 0),
    'corte_minimo_meses', 4,
    'transparencia_exclusao', 'vinculos menores que 4 meses permanecem no historico, fora da media'
  ) as detalhes
from professores_alvo pa
join public.professores pr on pr.id = pa.professor_id
cross join params p
left join estatisticas e
  on e.professor_id = pa.professor_id
 and e.unidade_saida is not distinct from pa.unidade_saida
order by pr.nome, pa.unidade_saida;
$$;

create or replace function public.get_professor_presenca_v3_sombra(
  p_competencia date,
  p_unidade_id uuid default null
)
returns table (
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
with params as (
  select
    date_trunc('month', p_competencia)::date as competencia,
    greatest(
      date_trunc('quarter', p_competencia)::date,
      date '2026-08-03'
    ) as inicio_recorte,
    least(
      (date_trunc('quarter', p_competencia) + interval '3 months - 1 day')::date,
      (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date,
      current_date
    ) as fim_recorte
  where p_competencia is not null
), unidades_permitidas as (
  select up.unidade_id
  from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
), roster_esperado as (
  select distinct
    ae.professor_id,
    ae.unidade_id,
    ae.id as aula_emusys_id,
    coalesce(
      i.pessoa_chave,
      case when aa.aluno_emusys_id is not null
        then 'emusys:' || aa.aluno_emusys_id::text end,
      case when aa.aluno_id is not null
        then 'local:' || aa.aluno_id::text end
    ) as pessoa_chave
  from public.aulas_emusys ae
  join unidades_permitidas up on up.unidade_id = ae.unidade_id
  join params p on p.fim_recorte >= p.inicio_recorte
    and ae.data_aula between p.inicio_recorte and p.fim_recorte
  join public.aula_alunos_emusys aa on aa.aula_emusys_id = ae.id
  left join public.vw_aluno_identidade_unidade_canonica i
    on i.unidade_id = ae.unidade_id
   and (
     (aa.aluno_emusys_id is not null and i.emusys_aluno_id = aa.aluno_emusys_id)
     or (aa.aluno_id is not null and aa.aluno_id = any(i.aluno_ids_locais))
   )
  where ae.professor_id is not null
    and ae.cancelada = false
    and lower(coalesce(ae.categoria, 'normal')) = 'normal'
    and coalesce(ae.sem_acompanhamento, false) = false
), eventos_esperados as (
  select r.*
  from roster_esperado r
  where r.pessoa_chave is not null
), semantica_deduplicada as (
  select
    s.professor_id,
    s.unidade_id,
    s.aula_emusys_id,
    coalesce(i.pessoa_chave, 'local:' || s.aluno_id::text) as pessoa_chave,
    bool_or(s.resultado_pedagogico = 'presente') as presente,
    bool_or(s.resultado_pedagogico = 'falta_confirmada') as falta_confirmada
  from public.vw_aluno_presenca_semantica_v1 s
  join unidades_permitidas up on up.unidade_id = s.unidade_id
  join params p on p.fim_recorte >= p.inicio_recorte
    and s.data_aula between p.inicio_recorte and p.fim_recorte
  left join public.vw_aluno_identidade_unidade_canonica i
    on i.unidade_id = s.unidade_id
   and s.aluno_id = any(i.aluno_ids_locais)
  where s.professor_id is not null
    and s.data_aula >= date '2026-08-03'
    and s.resultado_pedagogico in ('presente', 'falta_confirmada')
    and s.considera_frequencia_denominador = true
  group by
    s.professor_id,
    s.unidade_id,
    s.aula_emusys_id,
    coalesce(i.pessoa_chave, 'local:' || s.aluno_id::text)
), eventos_classificados as (
  select
    e.professor_id,
    e.unidade_id,
    e.aula_emusys_id,
    e.pessoa_chave,
    s.presente,
    s.falta_confirmada
  from eventos_esperados e
  join semantica_deduplicada s
    on s.professor_id = e.professor_id
   and s.unidade_id = e.unidade_id
   and s.aula_emusys_id = e.aula_emusys_id
   and s.pessoa_chave = e.pessoa_chave
), professores_unidade as (
  select distinct pu.professor_id, pu.unidade_id
  from public.professores_unidades pu
  join unidades_permitidas up on up.unidade_id = pu.unidade_id
  where coalesce(pu.emusys_ativo, true)
    and coalesce(pu.validacao_status, 'validado') not in ('ignorado', 'rejeitado')
  union
  select distinct e.professor_id, e.unidade_id
  from eventos_esperados e
), professores_alvo as (
  select distinct
    pu.professor_id,
    case when p_unidade_id is null then null::uuid else pu.unidade_id end as unidade_saida
  from professores_unidade pu
), esperados_stats as (
  select
    e.professor_id,
    case when p_unidade_id is null then null::uuid else e.unidade_id end as unidade_saida,
    count(*)::integer as eventos_esperados
  from eventos_esperados e
  group by
    e.professor_id,
    case when p_unidade_id is null then null::uuid else e.unidade_id end
), classificados_stats as (
  select
    e.professor_id,
    case when p_unidade_id is null then null::uuid else e.unidade_id end as unidade_saida,
    count(*)::integer as eventos_elegiveis,
    count(*) filter (where e.presente)::integer as presentes,
    count(*) filter (where e.falta_confirmada and not e.presente)::integer
      as faltas_confirmadas
  from eventos_classificados e
  group by
    e.professor_id,
    case when p_unidade_id is null then null::uuid else e.unidade_id end
), metricas as (
  select
    pa.professor_id,
    pa.unidade_saida,
    coalesce(es.eventos_esperados, 0)::integer as eventos_esperados,
    coalesce(cs.eventos_elegiveis, 0)::integer as eventos_elegiveis,
    coalesce(cs.presentes, 0)::integer as presentes,
    coalesce(cs.faltas_confirmadas, 0)::integer as faltas_confirmadas,
    case
      when coalesce(es.eventos_esperados, 0) > 0 then
        coalesce(cs.eventos_elegiveis, 0)::numeric / es.eventos_esperados::numeric
      else null
    end as cobertura
  from professores_alvo pa
  left join esperados_stats es
    on es.professor_id = pa.professor_id
   and es.unidade_saida is not distinct from pa.unidade_saida
  left join classificados_stats cs
    on cs.professor_id = pa.professor_id
   and cs.unidade_saida is not distinct from pa.unidade_saida
)
select
  m.professor_id,
  pr.nome as professor_nome,
  m.unidade_saida as unidade_id,
  p.competencia,
  case
    when m.eventos_elegiveis > 0 then
      round(m.presentes::numeric / m.eventos_elegiveis::numeric * 100, 2)
    else null
  end as valor_bruto,
  m.presentes::numeric as numerador,
  m.eventos_elegiveis::numeric as denominador,
  m.eventos_elegiveis as amostra,
  case
    when m.eventos_esperados = 0 then 'sem_base'
    when m.eventos_elegiveis < 10 then 'sem_base_amostra'
    when m.cobertura < 0.95 then 'sem_base_cobertura'
    else 'ok'
  end as estado_base,
  (
    m.eventos_elegiveis >= 10
    and m.cobertura >= 0.95
  ) as publicavel,
  case
    when m.eventos_esperados = 0 then 'sem_base'
    when m.eventos_elegiveis < 10 or m.cobertura < 0.95 then 'baixa'
    else 'alta'
  end as confianca,
  'vw_aluno_presenca_semantica_v1+aula_alunos_emusys'::text as fonte,
  'health-score-professor-v3-presenca-1'::text as regra_versao,
  case
    when m.eventos_esperados = 0 then 'nenhum evento de roster no recorte pontuavel'
    when m.eventos_elegiveis < 10 then 'base minima de 10 eventos aluno-aula nao atingida'
    when m.cobertura < 0.95 then 'cobertura semantica inferior a 95% do roster esperado'
    else null
  end as motivo_sem_base,
  jsonb_build_object(
    'inicio_recorte', p.inicio_recorte,
    'fim_recorte', p.fim_recorte,
    'eventos_esperados', m.eventos_esperados,
    'eventos_elegiveis', m.eventos_elegiveis,
    'presentes', m.presentes,
    'faltas_confirmadas', m.faltas_confirmadas,
    'cobertura', case when m.cobertura is null then null else round(m.cobertura * 100, 2) end,
    'vigencia_pontuavel', '2026-08-03'
  ) as detalhes
from metricas m
join public.professores pr on pr.id = m.professor_id
cross join params p
order by pr.nome, m.unidade_saida;
$$;

comment on function public.get_professor_conversao_v3_sombra(date, uuid) is
  'Gate 4: conversao por credito unico D+30, sem teto cosmetico e sem matricula direta.';
comment on function public.get_professor_media_turma_v3_sombra(date, uuid) is
  'Gate 4: ocupacoes pessoa+turma regular; turma sem chave estavel permanece em revisao.';
comment on function public.get_professor_numero_alunos_v3_sombra(date, uuid) is
  'Gate 4: media dos tres fechamentos mensais por pessoa canonica e periodo efetivo.';
comment on function public.get_professor_retencao_v3_sombra(date, uuid) is
  'Gate 4: retencao somente com encerramento e atribuicao humana confirmada.';
comment on function public.get_professor_permanencia_v3_sombra(date, uuid) is
  'Gate 4: permanencia por vinculos encerrados, elegiveis, publicaveis e com corte transparente de 4 meses.';
comment on function public.get_professor_presenca_v3_sombra(date, uuid) is
  'Gate 4: presenca semantica pontuavel somente desde 03/08/2026 e com cobertura minima de 95%.';

revoke all on function public.get_professor_conversao_v3_sombra(date, uuid)
  from public, anon, authenticated;
grant execute on function public.get_professor_conversao_v3_sombra(date, uuid)
  to authenticated, service_role;

revoke all on function public.get_professor_media_turma_v3_sombra(date, uuid)
  from public, anon, authenticated;
grant execute on function public.get_professor_media_turma_v3_sombra(date, uuid)
  to authenticated, service_role;

revoke all on function public.get_professor_numero_alunos_v3_sombra(date, uuid)
  from public, anon, authenticated;
grant execute on function public.get_professor_numero_alunos_v3_sombra(date, uuid)
  to authenticated, service_role;

revoke all on function public.get_professor_retencao_v3_sombra(date, uuid)
  from public, anon, authenticated;
grant execute on function public.get_professor_retencao_v3_sombra(date, uuid)
  to authenticated, service_role;

revoke all on function public.get_professor_permanencia_v3_sombra(date, uuid)
  from public, anon, authenticated;
grant execute on function public.get_professor_permanencia_v3_sombra(date, uuid)
  to authenticated, service_role;

revoke all on function public.get_professor_presenca_v3_sombra(date, uuid)
  from public, anon, authenticated;
grant execute on function public.get_professor_presenca_v3_sombra(date, uuid)
  to authenticated, service_role;
