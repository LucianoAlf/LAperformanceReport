-- Health Score Professor V3 - revisoes humanas efetivas no read model em sombra.
-- A evidencia reconstruida permanece imutavel; somente a leitura aplica a ultima revisao.

create or replace view public.vw_professor_periodos_baseline_v3_sombra
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

comment on view public.vw_professor_periodos_baseline_v3_sombra is
  'Baseline imutavel efetivo do Gate 4, antes da aplicacao de revisoes humanas.';

revoke all on table public.vw_professor_periodos_baseline_v3_sombra
  from public, anon, authenticated;
grant select on table public.vw_professor_periodos_baseline_v3_sombra
  to service_role;

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
       and rv.snapshot_posterior->>'status_periodo' in ('ativo', 'encerrado', 'invalidado')
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
    when pr.decisao in ('aprovado', 'corrigido') then 'revisado_aprovado'
    when pr.decisao in ('rejeitado', 'manter_revisao') then 'revisar'
    else pr.confianca
  end as confianca,
  pr.inicio_incompleto_efetivo as inicio_incompleto,
  pr.substituicao_candidata_efetiva as substituicao_candidata,
  pr.conflitos_efetivos as conflitos,
  case
    when pr.decisao in ('rejeitado', 'manter_revisao') then false
    when pr.decisao in ('aprovado', 'corrigido') then
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
    else pr.fonte || '+revisao_humana_v1'
  end as fonte
from periodos_revisados pr;

comment on view public.vw_professor_periodos_efetivos_v3_sombra is
  'Baseline historico e transicoes futuras com a ultima revisao humana aplicada somente na leitura V3 em sombra.';

revoke all on table public.vw_professor_periodos_efetivos_v3_sombra
  from public, anon, authenticated;
revoke all on table public.vw_professor_periodos_baseline_v3_sombra
  from service_role;
revoke all on table public.vw_professor_periodos_efetivos_v3_sombra
  from service_role;
grant select on table public.vw_professor_periodos_efetivos_v3_sombra
  to service_role;
grant select on table public.vw_professor_periodos_baseline_v3_sombra
  to service_role;

do $$
declare
  v_role text;
begin
  foreach v_role in array array[
    'fabio_agent',
    'lia_acesso_restrito',
    'mila_acesso_restrito',
    'sol_acesso_restrito'
  ] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format(
        'revoke all on table public.vw_professor_periodos_baseline_v3_sombra, public.vw_professor_periodos_efetivos_v3_sombra from %I',
        v_role
      );
    end if;
  end loop;
end;
$$;
