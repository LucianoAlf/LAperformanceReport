-- Estado atual bruto das matriculas no Emusys v1.3.1.
-- Grao: unidade_id + emusys_matricula_id.
-- Esta tabela preserva a fonte externa. Consumidores devem ler a projecao
-- semantica, nunca reinterpretar o payload por conta propria.

create table if not exists public.emusys_matriculas_estado_atual (
  unidade_id uuid not null references public.unidades(id) on delete cascade,
  emusys_matricula_id bigint not null,
  emusys_aluno_id bigint,
  aluno_id integer references public.alunos(id) on delete set null,
  emusys_contrato_id bigint,
  status_emusys text not null,
  status_emusys_bruto text,
  motivo_inativa text,
  motivo_inativa_bruto text,
  status_local_resolvido text,
  status_jornada_resolvido text not null default 'desconhecido',
  tipo_movimento_resolvido text,
  transicao_automatica boolean not null default false,
  motivo_auditoria text,
  trancamento_id bigint,
  trancamento_motivo text,
  trancamento_data_inicial date,
  trancamento_data_final date,
  payload_snapshot jsonb not null default '{}'::jsonb,
  payload_hash text not null,
  primeiro_sync_em timestamptz not null default now(),
  sincronizado_em timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (unidade_id, emusys_matricula_id),
  constraint emusys_matriculas_estado_atual_status_check
    check (status_emusys in ('ativa', 'trancada', 'inativa', 'finalizada', 'desconhecido')),
  constraint emusys_matriculas_estado_atual_motivo_check
    check (motivo_inativa is null or motivo_inativa in ('interrompida', 'concluida')),
  constraint emusys_matriculas_estado_atual_local_check
    check (
      status_local_resolvido is null
      or status_local_resolvido in ('ativo', 'trancado', 'evadido', 'inativo')
    ),
  constraint emusys_matriculas_estado_atual_jornada_check
    check (
      status_jornada_resolvido in (
        'ativa',
        'trancada',
        'finalizada',
        'desconhecido'
      )
    ),
  constraint emusys_matriculas_estado_atual_movimento_check
    check (
      tipo_movimento_resolvido is null
      or tipo_movimento_resolvido in ('evasao', 'nao_renovacao', 'trancamento')
    )
);

create index if not exists idx_emusys_matriculas_estado_atual_aluno
  on public.emusys_matriculas_estado_atual (unidade_id, emusys_aluno_id);

create index if not exists idx_emusys_matriculas_estado_atual_status
  on public.emusys_matriculas_estado_atual (unidade_id, status_emusys, motivo_inativa);

create index if not exists idx_emusys_matriculas_estado_atual_aluno_local
  on public.emusys_matriculas_estado_atual (aluno_id)
  where aluno_id is not null;

alter table public.emusys_matriculas_estado_atual enable row level security;

drop policy if exists service_role_all_emusys_matriculas_estado_atual
  on public.emusys_matriculas_estado_atual;

create policy service_role_all_emusys_matriculas_estado_atual
  on public.emusys_matriculas_estado_atual
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table public.emusys_matriculas_estado_atual
  from public, anon, authenticated;
grant select, insert, update on table public.emusys_matriculas_estado_atual
  to service_role;

create or replace function public.upsert_emusys_matriculas_estado_atual(
  p_unidade_id uuid,
  p_linhas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_recebidas integer := 0;
  v_validas integer := 0;
begin
  if p_unidade_id is null then
    raise exception 'unidade_id_obrigatoria';
  end if;

  if jsonb_typeof(p_linhas) is distinct from 'array' then
    raise exception 'linhas_devem_ser_array_json';
  end if;

  select jsonb_array_length(p_linhas) into v_recebidas;

  with linhas as (
    select item
    from jsonb_array_elements(p_linhas) as x(item)
  ),
  normalizadas as (
    select
      case
        when coalesce(item->>'emusys_matricula_id', item->>'id', '') ~ '^[0-9]+$'
          then coalesce(item->>'emusys_matricula_id', item->>'id')::bigint
        else null
      end as emusys_matricula_id,
      case
        when coalesce(item->>'emusys_aluno_id', item#>>'{aluno,id}', '') ~ '^[0-9]+$'
          then coalesce(item->>'emusys_aluno_id', item#>>'{aluno,id}')::bigint
        else null
      end as emusys_aluno_id,
      case
        when coalesce(item->>'aluno_id', '') ~ '^[0-9]+$'
          then (item->>'aluno_id')::integer
        else null
      end as aluno_id,
      case
        when coalesce(item->>'emusys_contrato_id', item->>'contrato_id', '') ~ '^[0-9]+$'
          then coalesce(item->>'emusys_contrato_id', item->>'contrato_id')::bigint
        else null
      end as emusys_contrato_id,
      case lower(coalesce(item->>'status_emusys', item->>'status', ''))
        when 'ativa' then 'ativa'
        when 'trancada' then 'trancada'
        when 'inativa' then 'inativa'
        when 'finalizada' then 'finalizada'
        else 'desconhecido'
      end as status_emusys,
      nullif(coalesce(item->>'status_emusys_bruto', item->>'status'), '') as status_emusys_bruto,
      case lower(coalesce(item->>'motivo_inativa', ''))
        when 'interrompida' then 'interrompida'
        when 'concluida' then 'concluida'
        when 'concluída' then 'concluida'
        else null
      end as motivo_inativa,
      nullif(coalesce(item->>'motivo_inativa_bruto', item->>'motivo_inativa'), '')
        as motivo_inativa_bruto,
      nullif(item->>'status_local_resolvido', '') as status_local_resolvido,
      coalesce(nullif(item->>'status_jornada_resolvido', ''), 'desconhecido')
        as status_jornada_resolvido,
      nullif(item->>'tipo_movimento_resolvido', '') as tipo_movimento_resolvido,
      coalesce((item->>'transicao_automatica')::boolean, false) as transicao_automatica,
      nullif(item->>'motivo_auditoria', '') as motivo_auditoria,
      case
        when coalesce(item->>'trancamento_id', item#>>'{trancamento_ativo,id}', '') ~ '^[0-9]+$'
          then coalesce(item->>'trancamento_id', item#>>'{trancamento_ativo,id}')::bigint
        else null
      end as trancamento_id,
      nullif(
        coalesce(item->>'trancamento_motivo', item#>>'{trancamento_ativo,motivo}'),
        ''
      ) as trancamento_motivo,
      case
        when coalesce(
          item->>'trancamento_data_inicial',
          item#>>'{trancamento_ativo,data_inicial}',
          ''
        ) ~ '^\d{4}-\d{2}-\d{2}$'
          then coalesce(
            item->>'trancamento_data_inicial',
            item#>>'{trancamento_ativo,data_inicial}'
          )::date
        else null
      end as trancamento_data_inicial,
      case
        when coalesce(
          item->>'trancamento_data_final',
          item#>>'{trancamento_ativo,data_final}',
          ''
        ) ~ '^\d{4}-\d{2}-\d{2}$'
          then coalesce(
            item->>'trancamento_data_final',
            item#>>'{trancamento_ativo,data_final}'
          )::date
        else null
      end as trancamento_data_final,
      coalesce(item->'payload_snapshot', item) as payload_snapshot
    from linhas
  ),
  gravadas as (
    insert into public.emusys_matriculas_estado_atual (
      unidade_id,
      emusys_matricula_id,
      emusys_aluno_id,
      aluno_id,
      emusys_contrato_id,
      status_emusys,
      status_emusys_bruto,
      motivo_inativa,
      motivo_inativa_bruto,
      status_local_resolvido,
      status_jornada_resolvido,
      tipo_movimento_resolvido,
      transicao_automatica,
      motivo_auditoria,
      trancamento_id,
      trancamento_motivo,
      trancamento_data_inicial,
      trancamento_data_final,
      payload_snapshot,
      payload_hash,
      sincronizado_em,
      updated_at
    )
    select
      p_unidade_id,
      n.emusys_matricula_id,
      n.emusys_aluno_id,
      n.aluno_id,
      n.emusys_contrato_id,
      n.status_emusys,
      n.status_emusys_bruto,
      n.motivo_inativa,
      n.motivo_inativa_bruto,
      n.status_local_resolvido,
      n.status_jornada_resolvido,
      n.tipo_movimento_resolvido,
      n.transicao_automatica,
      n.motivo_auditoria,
      n.trancamento_id,
      n.trancamento_motivo,
      n.trancamento_data_inicial,
      n.trancamento_data_final,
      n.payload_snapshot,
      md5(n.payload_snapshot::text),
      now(),
      now()
    from normalizadas n
    where n.emusys_matricula_id is not null
    on conflict (unidade_id, emusys_matricula_id) do update set
      emusys_aluno_id = excluded.emusys_aluno_id,
      aluno_id = coalesce(excluded.aluno_id, emusys_matriculas_estado_atual.aluno_id),
      emusys_contrato_id = excluded.emusys_contrato_id,
      status_emusys = excluded.status_emusys,
      status_emusys_bruto = excluded.status_emusys_bruto,
      motivo_inativa = excluded.motivo_inativa,
      motivo_inativa_bruto = excluded.motivo_inativa_bruto,
      status_local_resolvido = excluded.status_local_resolvido,
      status_jornada_resolvido = excluded.status_jornada_resolvido,
      tipo_movimento_resolvido = excluded.tipo_movimento_resolvido,
      transicao_automatica = excluded.transicao_automatica,
      motivo_auditoria = excluded.motivo_auditoria,
      trancamento_id = excluded.trancamento_id,
      trancamento_motivo = excluded.trancamento_motivo,
      trancamento_data_inicial = excluded.trancamento_data_inicial,
      trancamento_data_final = excluded.trancamento_data_final,
      payload_snapshot = excluded.payload_snapshot,
      payload_hash = excluded.payload_hash,
      sincronizado_em = excluded.sincronizado_em,
      updated_at = excluded.updated_at
    returning 1
  )
  select count(*) into v_validas from gravadas;

  return jsonb_build_object(
    'unidade_id', p_unidade_id,
    'recebidas', v_recebidas,
    'gravadas', v_validas,
    'rejeitadas', greatest(v_recebidas - v_validas, 0)
  );
end;
$$;

revoke all on function public.upsert_emusys_matriculas_estado_atual(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_emusys_matriculas_estado_atual(uuid, jsonb)
  to service_role;

create or replace view public.vw_aluno_estado_operacional_canonico
with (security_invoker = true) as
select
  e.unidade_id,
  e.emusys_matricula_id,
  e.emusys_aluno_id,
  coalesce(a.id, e.aluno_id) as aluno_id,
  a.nome as aluno_nome,
  e.emusys_contrato_id,
  e.status_emusys,
  e.status_emusys_bruto,
  e.motivo_inativa,
  e.motivo_inativa_bruto,
  e.status_local_resolvido,
  e.status_jornada_resolvido,
  e.tipo_movimento_resolvido,
  e.transicao_automatica,
  e.motivo_auditoria,
  e.trancamento_id,
  e.trancamento_motivo,
  e.trancamento_data_inicial,
  e.trancamento_data_final,
  (e.status_emusys = 'ativa') as entra_base_ativa,
  (e.status_emusys = 'ativa') as entra_carteira_professor,
  (e.status_emusys = 'ativa') as entra_financeiro_ativo,
  (e.status_emusys = 'ativa') as entra_denominador_presenca,
  (e.status_emusys = 'ativa') as entra_health_score,
  (e.status_emusys = 'ativa') as entra_churn_atual,
  (e.status_emusys = 'trancada') as eh_trancamento_atual,
  (
    e.status_emusys = 'inativa'
    and e.motivo_inativa = 'interrompida'
  ) as eh_interrupcao_definitiva,
  (
    e.status_emusys = 'inativa'
    and e.motivo_inativa = 'concluida'
  ) as eh_contrato_concluido,
  e.sincronizado_em,
  e.updated_at
from public.emusys_matriculas_estado_atual e
left join public.alunos a
  on a.unidade_id = e.unidade_id
 and (
   a.emusys_matricula_id = e.emusys_matricula_id::text
   or (
     a.emusys_matricula_id is null
     and e.aluno_id is not null
     and a.id = e.aluno_id
   )
 );

revoke all on table public.vw_aluno_estado_operacional_canonico
  from public, anon, authenticated;
grant select on table public.vw_aluno_estado_operacional_canonico
  to service_role;

comment on table public.emusys_matriculas_estado_atual is
  'Fonte bruta backend-only do estado atual de cada matricula Emusys, escopada por unidade.';

comment on view public.vw_aluno_estado_operacional_canonico is
  'Projecao semantica do ciclo de matricula. Somente ativa entra em bases operacionais vivas; trancada permanece separada.';
