begin;

-- Task 3 - promove apenas periodos ativos sustentados por uma jornada atual
-- inequivoca. O baseline continua imutavel; a promocao vive na trilha append-only.

alter table public.professor_periodos_revisoes_v1
  add column if not exists origem_revisao text not null
  default 'revisao_humana';

do $constraints$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.professor_periodos_revisoes_v1'::regclass
      and conname = 'professor_periodos_revisoes_origem_chk'
  ) then
    alter table public.professor_periodos_revisoes_v1
      add constraint professor_periodos_revisoes_origem_chk
      check (origem_revisao in ('revisao_humana', 'promocao_automatica'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.professor_periodos_revisoes_v1'::regclass
      and conname = 'professor_periodos_revisoes_automatica_decisao_chk'
  ) then
    alter table public.professor_periodos_revisoes_v1
      add constraint professor_periodos_revisoes_automatica_decisao_chk
      check (
        origem_revisao <> 'promocao_automatica'
        or decisao = 'aprovado'
      );
  end if;
end;
$constraints$;

comment on column public.professor_periodos_revisoes_v1.origem_revisao is
  'Distingue decisao humana de promocao automatica baseada em evidencia exata.';

comment on table public.professor_periodos_revisoes_v1 is
  'Trilha append-only de revisoes humanas e promocoes automaticas estruturadas sobre periodos reconstruidos.';

create unique index if not exists
  uq_professor_periodos_revisoes_promocao_automatica
  on public.professor_periodos_revisoes_v1 (periodo_id)
  where origem_revisao = 'promocao_automatica';

lock table public.professor_periodos_revisoes_v1
  in share row exclusive mode;
lock table public.health_score_professor_v3_config_versoes
  in share mode;

create temporary table task3_periodos_ativos_exatos
on commit drop
as
with jornadas_ativas_agrupadas as (
  select
    j.unidade_id,
    j.emusys_matricula_disciplina_id,
    count(*)::integer as cardinalidade_jornada_ativa,
    min(j.professor_id) as professor_id,
    min(j.emusys_professor_id) as emusys_professor_id,
    min(j.emusys_disciplina_id) as emusys_disciplina_id
  from public.aluno_jornada_matricula_disciplina j
  where j.status_matricula = 'ativa'
    and j.emusys_matricula_disciplina_id is not null
  group by
    j.unidade_id,
    j.emusys_matricula_disciplina_id
), jornada_atual_exata as (
  select ja.*
  from jornadas_ativas_agrupadas ja
  where ja.cardinalidade_jornada_ativa = 1
)
select
  b.*,
  ja.cardinalidade_jornada_ativa,
  u.nome as unidade_nome
from public.vw_professor_periodos_baseline_v3_sombra b
join jornada_atual_exata ja
  on ja.unidade_id = b.unidade_id
 and ja.emusys_matricula_disciplina_id
   = b.emusys_matricula_disciplina_id
 and ja.professor_id = b.professor_id
join public.unidades u
  on u.id = b.unidade_id
where b.status_periodo = 'ativo'
  and b.confianca = 'media'
  and b.professor_id is not null
  and b.emusys_matricula_disciplina_id is not null
  and b.emusys_disciplina_id is not null
  and ja.professor_id is not null
  and ja.emusys_disciplina_id is not null;

do $promocao$
declare
  v_total_exato bigint;
  v_total_barra bigint;
  v_total_campo_grande bigint;
  v_total_recreio bigint;
  v_total_conflitos bigint;
  v_total_inicio_incompleto bigint;
  v_revisado_por integer;
  v_inseridos bigint;
begin
  select
    count(*),
    count(*) filter (where unidade_nome = 'Barra'),
    count(*) filter (where unidade_nome = 'Campo Grande'),
    count(*) filter (where unidade_nome = 'Recreio'),
    count(*) filter (
      where jsonb_typeof(conflitos) <> 'array'
         or jsonb_array_length(conflitos) > 0
    ),
    count(*) filter (where inicio_incompleto is distinct from false)
  into
    v_total_exato,
    v_total_barra,
    v_total_campo_grande,
    v_total_recreio,
    v_total_conflitos,
    v_total_inicio_incompleto
  from pg_temp.task3_periodos_ativos_exatos;

  if v_total_exato <> 207
     or v_total_barra <> 75
     or v_total_campo_grande <> 71
     or v_total_recreio <> 61
     or v_total_conflitos <> 0
     or v_total_inicio_incompleto <> 0 then
    raise exception
      'HEALTH_SCORE_V3_PROMOCAO_DRIFT: esperado total=207 barra=75 campo_grande=71 recreio=61 conflitos=0 inicio_incompleto=0; obtido total=% barra=% campo_grande=% recreio=% conflitos=% inicio_incompleto=%',
      v_total_exato,
      v_total_barra,
      v_total_campo_grande,
      v_total_recreio,
      v_total_conflitos,
      v_total_inicio_incompleto;
  end if;

  select c.ativado_por
  into v_revisado_por
  from public.health_score_professor_v3_config_versoes c
  join public.usuarios u
    on u.id = c.ativado_por
  where c.status = 'ativa'
    and c.ativado_por is not null
    and u.ativo = true
    and public.usuario_tem_permissao(
      c.ativado_por,
      'professores.editar',
      null
    )
  order by c.versao desc, c.vigencia_inicio desc, c.id desc
  limit 1;

  if v_revisado_por is null then
    raise exception
      'HEALTH_SCORE_V3_CONFIGURACAO_ATIVA_SEM_ATOR_VALIDO: exige ativado_por ativo com professores.editar';
  end if;

  insert into public.professor_periodos_revisoes_v1 (
    periodo_id,
    reconstrucao_id,
    decisao,
    motivo,
    snapshot_anterior,
    snapshot_posterior,
    revisado_por,
    origem_revisao
  )
  select
    c.periodo_origem_id,
    c.reconstrucao_id,
    'aprovado',
    'Promocao automatica: periodo ativo sustentado por jornada atual exata.',
    jsonb_build_object(
      'periodo_id', c.periodo_origem_id,
      'reconstrucao_id', c.reconstrucao_id,
      'unidade_id', c.unidade_id,
      'emusys_matricula_disciplina_id',
        c.emusys_matricula_disciplina_id,
      'professor_id', c.professor_id,
      'status_periodo', c.status_periodo,
      'confianca', c.confianca,
      'inicio_incompleto', c.inicio_incompleto,
      'conflitos', c.conflitos,
      'publicavel', c.publicavel,
      'fonte', c.fonte
    ),
    jsonb_build_object(
      'periodo_id', c.periodo_origem_id,
      'reconstrucao_id', c.reconstrucao_id,
      'unidade_id', c.unidade_id,
      'emusys_matricula_disciplina_id',
        c.emusys_matricula_disciplina_id,
      'professor_id', c.professor_id,
      'status_periodo', c.status_periodo,
      'confianca', 'alta',
      'conflitos', c.conflitos,
      'publicavel', true,
      'fonte', c.fonte || '+promocao_automatica_v1',
      'evidencias', jsonb_build_object(
        'promocao_confianca', jsonb_build_object(
          'regra', 'jornada_atual_exata',
          'confianca_anterior', 'media',
          'confianca_atual', 'alta'
        )
      )
    ),
    v_revisado_por,
    'promocao_automatica'
  from pg_temp.task3_periodos_ativos_exatos c
  where not exists (
    select 1
    from public.professor_periodos_revisoes_v1 existente
    where existente.periodo_id = c.periodo_origem_id
  )
  on conflict do nothing;

  get diagnostics v_inseridos = row_count;
  raise notice
    'HEALTH_SCORE_V3_PROMOCAO_ATIVOS_EXATOS: universo=%, inseridos=%',
    v_total_exato,
    v_inseridos;
end;
$promocao$;

create or replace view public.vw_professor_periodos_efetivos_v3_sombra
with (security_invoker = true)
as
with revisoes_ultimas as (
  select distinct on (rv.periodo_id)
    rv.*
  from public.professor_periodos_revisoes_v1 rv
  order by rv.periodo_id, rv.created_at desc, rv.id desc
), periodos_revisados as (
  select
    b.*,
    rv.id as revisao_id,
    rv.origem_revisao,
    rv.decisao,
    rv.professor_corrigido_id,
    rv.emusys_professor_corrigido_id,
    rv.data_inicio_corrigida,
    rv.data_fim_corrigida,
    rv.motivo_saida_id as motivo_saida_corrigido_id,
    rv.conta_retencao_professor as conta_retencao_corrigida,
    rv.snapshot_posterior,
    coalesce(rv.professor_corrigido_id, b.professor_id) as professor_efetivo_id,
    coalesce(rv.emusys_professor_corrigido_id, b.emusys_professor_id)
      as emusys_professor_efetivo_id,
    coalesce(rv.data_inicio_corrigida, b.data_inicio) as data_inicio_efetiva,
    coalesce(rv.data_fim_corrigida, b.data_fim) as data_fim_efetiva,
    case
      when rv.decisao = 'rejeitado' then 'invalidado'
      when rv.decisao in ('aprovado', 'corrigido')
       and rv.snapshot_posterior->>'status_periodo'
         in ('ativo', 'encerrado', 'invalidado')
        then rv.snapshot_posterior->>'status_periodo'
      else b.status_periodo
    end as status_efetivo,
    case
      when rv.decisao in ('aprovado', 'corrigido')
       and rv.snapshot_posterior ? 'inicio_incompleto'
        then (rv.snapshot_posterior->>'inicio_incompleto')::boolean
      else b.inicio_incompleto
    end as inicio_incompleto_efetivo,
    case
      when rv.decisao in ('aprovado', 'corrigido')
       and rv.snapshot_posterior ? 'substituicao_candidata'
        then (rv.snapshot_posterior->>'substituicao_candidata')::boolean
      else b.substituicao_candidata
    end as substituicao_candidata_efetiva,
    case
      when rv.decisao in ('aprovado', 'corrigido')
       and jsonb_typeof(rv.snapshot_posterior->'conflitos') = 'array'
        then rv.snapshot_posterior->'conflitos'
      else b.conflitos
    end as conflitos_efetivos
  from public.vw_professor_periodos_baseline_v3_sombra b
  left join revisoes_ultimas rv
    on b.periodo_chave = 'baseline:' || rv.periodo_id::text
)
select
  pr.periodo_chave,
  pr.periodo_origem_id,
  pr.reconstrucao_id,
  pr.transicao_fim_id,
  pr.unidade_id,
  pr.pessoa_chave,
  pr.aluno_id,
  pr.emusys_aluno_id,
  pr.emusys_matricula_id,
  pr.emusys_matricula_disciplina_id,
  pr.emusys_disciplina_id,
  pr.curso_id,
  pr.professor_efetivo_id as professor_id,
  pr.emusys_professor_efetivo_id as emusys_professor_id,
  pr.data_inicio_efetiva as data_inicio,
  pr.data_fim_efetiva as data_fim,
  pr.status_efetivo as status_periodo,
  case
    when pr.decisao in ('aprovado', 'corrigido')
     and nullif(pr.snapshot_posterior->>'tipo_inicio', '') is not null
      then pr.snapshot_posterior->>'tipo_inicio'
    else pr.tipo_inicio
  end as tipo_inicio,
  case
    when pr.decisao in ('aprovado', 'corrigido')
     and nullif(pr.snapshot_posterior->>'tipo_fim', '') is not null
      then pr.snapshot_posterior->>'tipo_fim'
    else pr.tipo_fim
  end as tipo_fim,
  case
    when pr.data_fim_efetiva is null then null
    else extract(epoch from (pr.data_fim_efetiva - pr.data_inicio_efetiva))
      / 86400::numeric
  end as duracao_dias,
  case
    when pr.data_fim_efetiva is null then null
    else extract(epoch from (pr.data_fim_efetiva - pr.data_inicio_efetiva))
      / 86400::numeric / 30.44::numeric
  end as duracao_meses,
  (
    pr.status_efetivo = 'encerrado'
    and pr.data_fim_efetiva is not null
    and extract(epoch from (pr.data_fim_efetiva - pr.data_inicio_efetiva))
      / 86400::numeric / 30.44::numeric >= 4
  ) as elegivel_permanencia,
  coalesce(pr.motivo_saida_corrigido_id, pr.motivo_saida_id) as motivo_saida_id,
  case
    when pr.motivo_saida_corrigido_id is not null
      or pr.conta_retencao_corrigida is not null then true
    else pr.atribuicao_confirmada
  end as atribuicao_confirmada,
  coalesce(pr.conta_retencao_corrigida, pr.conta_retencao_professor)
    as conta_retencao_professor,
  case
    when pr.origem_revisao = 'promocao_automatica'
     and pr.decisao = 'aprovado' then 'alta'
    when pr.origem_revisao = 'revisao_humana'
     and pr.decisao in ('aprovado', 'corrigido') then 'revisado_aprovado'
    when pr.origem_revisao = 'revisao_humana'
     and pr.decisao in ('rejeitado', 'manter_revisao') then 'revisar'
    else pr.confianca
  end as confianca,
  pr.inicio_incompleto_efetivo as inicio_incompleto,
  pr.substituicao_candidata_efetiva as substituicao_candidata,
  pr.conflitos_efetivos as conflitos,
  case
    when pr.origem_revisao = 'promocao_automatica'
     and pr.decisao = 'aprovado' then
      pr.professor_efetivo_id is not null
      and pr.emusys_professor_efetivo_id is not null
      and pr.emusys_matricula_disciplina_id is not null
      and pr.emusys_disciplina_id is not null
      and pr.status_efetivo = 'ativo'
      and pr.data_fim_efetiva is null
      and pr.inicio_incompleto_efetivo is false
      and jsonb_typeof(pr.conflitos_efetivos) = 'array'
      and jsonb_array_length(pr.conflitos_efetivos) = 0
    when pr.origem_revisao = 'revisao_humana'
     and pr.decisao in ('rejeitado', 'manter_revisao') then false
    when pr.origem_revisao = 'revisao_humana'
     and pr.decisao in ('aprovado', 'corrigido') then
      pr.professor_efetivo_id is not null
      and pr.emusys_professor_efetivo_id is not null
      and pr.emusys_matricula_disciplina_id is not null
      and pr.data_inicio_efetiva is not null
      and (
        pr.data_fim_efetiva is null
        or pr.data_fim_efetiva >= pr.data_inicio_efetiva
      )
      and pr.status_efetivo <> 'invalidado'
    else pr.publicavel
  end as publicavel,
  case
    when pr.revisao_id is null then pr.fonte
    when pr.origem_revisao = 'promocao_automatica'
      then pr.fonte || '+promocao_automatica_v1'
    else pr.fonte || '+revisao_humana_v1'
  end as fonte
from periodos_revisados pr;

comment on view public.vw_professor_periodos_efetivos_v3_sombra is
  'Baseline e transicoes com overlay append-only; promocoes automaticas preservam confianca alta e revisoes humanas usam revisado_aprovado.';

revoke all on table public.vw_professor_periodos_efetivos_v3_sombra
  from public, anon, authenticated;
revoke all on table public.vw_professor_periodos_efetivos_v3_sombra
  from service_role;
grant select on table public.vw_professor_periodos_efetivos_v3_sombra
  to service_role;

commit;
