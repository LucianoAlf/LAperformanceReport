-- Evita um nested loop caro na projecao operacional.
-- A regra nao muda: matricula exata vence; aluno_id e apenas fallback.

create index if not exists idx_emusys_matriculas_estado_atual_aluno_sync
  on public.emusys_matriculas_estado_atual (aluno_id, sincronizado_em desc)
  where aluno_id is not null;

create or replace view public.vw_alunos_estado_operacional_v131
with (security_invoker = true) as
with alunos_com_chave as (
  select
    a.id as aluno_id,
    a.unidade_id,
    a.emusys_matricula_id,
    a.status as status_local_legado,
    case
      when btrim(coalesce(a.emusys_matricula_id, '')) ~ '^[0-9]+$'
        then btrim(a.emusys_matricula_id)::bigint
      else null
    end as emusys_matricula_id_numero
  from public.alunos a
),
estado_por_aluno as (
  select
    a.aluno_id,
    a.unidade_id,
    a.emusys_matricula_id,
    a.status_local_legado,
    coalesce(exato.unidade_id, fallback.unidade_id) is not null as raw_encontrado,
    coalesce(exato.status_emusys, fallback.status_emusys) as status_emusys,
    coalesce(
      exato.status_local_resolvido,
      fallback.status_local_resolvido
    ) as status_local_resolvido,
    coalesce(exato.motivo_inativa, fallback.motivo_inativa) as motivo_inativa,
    coalesce(
      exato.motivo_inativa_bruto,
      fallback.motivo_inativa_bruto
    ) as motivo_inativa_bruto,
    coalesce(
      exato.tipo_movimento_resolvido,
      fallback.tipo_movimento_resolvido
    ) as tipo_movimento_resolvido,
    coalesce(exato.motivo_auditoria, fallback.motivo_auditoria) as motivo_auditoria,
    coalesce(exato.trancamento_id, fallback.trancamento_id) as trancamento_id,
    coalesce(
      exato.trancamento_motivo,
      fallback.trancamento_motivo
    ) as trancamento_motivo,
    coalesce(
      exato.trancamento_data_inicial,
      fallback.trancamento_data_inicial
    ) as trancamento_data_inicial,
    coalesce(
      exato.trancamento_data_final,
      fallback.trancamento_data_final
    ) as trancamento_data_final,
    coalesce(exato.sincronizado_em, fallback.sincronizado_em) as sincronizado_em,
    case
      when coalesce(exato.unidade_id, fallback.unidade_id) is not null
        then coalesce(
          exato.status_local_resolvido,
          fallback.status_local_resolvido,
          'desconhecido'
        )
      when a.status_local_legado = 'ativo' then 'ativo'
      when a.status_local_legado = 'trancado' then 'trancado'
      when a.status_local_legado = 'evadido' then 'evadido'
      when a.status_local_legado = 'inativo' then 'inativo'
      else 'desconhecido'
    end as status_operacional
  from alunos_com_chave a
  left join public.emusys_matriculas_estado_atual exato
    on exato.unidade_id = a.unidade_id
   and exato.emusys_matricula_id = a.emusys_matricula_id_numero
  left join lateral (
    select estado.*
    from public.emusys_matriculas_estado_atual estado
    where exato.unidade_id is null
      and estado.aluno_id = a.aluno_id
    order by estado.sincronizado_em desc
    limit 1
  ) fallback on true
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
  'Projecao viva v1.3.1 otimizada: matricula exata por indice e aluno_id apenas como fallback.';

revoke all on table public.vw_alunos_estado_operacional_v131
  from public, anon, authenticated;
grant select on table public.vw_alunos_estado_operacional_v131
  to service_role;
