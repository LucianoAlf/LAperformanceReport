-- Expande o contrato de roster sem redefinir a RPC ou a view v1.
-- A reconciliacao continua delegada ao corpo v1, mas a publicacao v2 fica
-- vinculada ao run externo que governa lease, cobertura, hash e contagens.

create or replace function public.fn_presenca_roster_lock_key_v2(
  p_aula_emusys_id integer
)
returns bigint
language sql
immutable
parallel safe
set search_path = pg_catalog, public
as $function$
  select hashtextextended(
    'presenca_roster_aula:' || coalesce(p_aula_emusys_id::text, '<null>'),
    20260828005709
  )
$function$;

create or replace function public.fn_presenca_slot_lock_key_v2(
  p_unidade_id uuid,
  p_professor_id integer,
  p_data_hora_inicio timestamptz,
  p_data_hora_fim timestamptz,
  p_curso_nome text
)
returns bigint
language sql
immutable
parallel safe
set search_path = pg_catalog, public
as $function$
  select hashtextextended(
    'presenca_slot:'
      || coalesce(p_unidade_id::text, '<null>') || '|'
      || coalesce(p_professor_id::text, '<null>') || '|'
      || coalesce(extract(epoch from p_data_hora_inicio)::text, '<null>') || '|'
      || coalesce(extract(epoch from p_data_hora_fim)::text, '<null>') || '|'
      || lower(btrim(coalesce(p_curso_nome, ''))),
    20260828005709
  )
$function$;

revoke all on function public.fn_presenca_roster_lock_key_v2(integer)
  from public, anon, authenticated, service_role;
revoke all on function public.fn_presenca_slot_lock_key_v2(
  uuid, integer, timestamptz, timestamptz, text
) from public, anon, authenticated, service_role;

create or replace function public.reconciliar_grade_snapshot_emusys_v2(
  p_sync_run_id uuid,
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_snapshot jsonb,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_exec public.presenca_sync_execucoes%rowtype;
  v_cobertura public.presenca_sync_cobertura%rowtype;
  v_resultado jsonb;
  v_run_interno uuid;
  v_estados_esperados integer;
  v_estados_encontrados integer;
  v_estados_trocados integer;
  v_vinculos_esperados integer;
  v_vinculos_encontrados integer;
  v_vinculos_trocados integer;
  v_lock_key bigint;
begin
  if p_sync_run_id is null
     or p_unidade_id is null
     or p_data_inicio is null
     or p_data_fim is null
     or p_data_fim < p_data_inicio
     or p_dry_run is null then
    raise exception using
      errcode = '22023',
      message = 'sync_run_incompativel';
  end if;

  if not p_dry_run then
    for v_lock_key in
      select distinct locks.lock_key
        from (
          select hashtextextended(
            'presenca_roster_aula:' || coalesce(a.id::text, '<null>'),
            20260828005709
          ) as lock_key
            from public.aulas_emusys a
           where a.unidade_id = p_unidade_id
             and a.data_aula between p_data_inicio and p_data_fim
          union all
          select hashtextextended(
            'presenca_slot:'
              || coalesce(a.unidade_id::text, '<null>') || '|'
              || coalesce(a.professor_id::text, '<null>') || '|'
              || coalesce(extract(epoch from a.data_hora_inicio)::text, '<null>') || '|'
              || coalesce(extract(epoch from a.data_hora_fim)::text, '<null>') || '|'
              || lower(btrim(coalesce(a.curso_nome, ''))),
            20260828005709
          ) as lock_key
            from public.aulas_emusys a
           where a.unidade_id = p_unidade_id
             and a.data_aula between p_data_inicio and p_data_fim
        ) locks
       order by locks.lock_key
    loop
      perform pg_advisory_xact_lock(v_lock_key);
    end loop;
  end if;

  select x.*
    into v_exec
    from public.presenca_sync_execucoes x
   where x.id = p_sync_run_id
   for update;

  if not found
     or v_exec.unidade_id is distinct from p_unidade_id
     or v_exec.modo not in ('presenca', 'metadados', 'agenda')
     or v_exec.data_alvo not between p_data_inicio and p_data_fim
     or v_exec.status <> 'iniciada'
     or v_exec.snapshot_hash is not null then
    raise exception using
      errcode = '22023',
      message = 'sync_run_incompativel';
  end if;

  select c.*
    into v_cobertura
    from public.presenca_sync_cobertura c
   where c.unidade_id = v_exec.unidade_id
     and c.modo = v_exec.modo
     and c.data_alvo = v_exec.data_alvo
   for update;

  if not found
     or v_cobertura.run_id is distinct from p_sync_run_id
     or v_cobertura.status <> 'iniciada'
     or v_cobertura.snapshot_hash is not null
     or v_cobertura.lease_ate is null
     or v_cobertura.lease_ate <= clock_timestamp()
     or v_cobertura.paginas_lidas <> v_exec.paginas_lidas
     or v_cobertura.aulas_lidas <> v_exec.aulas_lidas
     or v_cobertura.presencas_lidas <> v_exec.presencas_lidas then
    raise exception using
      errcode = '40001',
      message = 'sync_run_substituida';
  end if;

  v_resultado := public.reconciliar_grade_snapshot_emusys_v1(
    p_unidade_id,
    p_data_inicio,
    p_data_fim,
    p_snapshot,
    p_dry_run
  );

  if coalesce(v_resultado ->> 'status', '') <> 'ok' then
    return v_resultado || jsonb_build_object(
      'run_id', p_sync_run_id,
      'contrato', 'roster_v2'
    );
  end if;

  v_run_interno := nullif(v_resultado ->> 'run_id', '')::uuid;
  if v_run_interno is null then
    raise exception using
      errcode = '40001',
      message = 'roster_run_interno_ausente';
  end if;

  if p_dry_run then
    return v_resultado || jsonb_build_object(
      'run_id', p_sync_run_id,
      'contrato', 'roster_v2'
    );
  end if;

  v_estados_esperados := coalesce((v_resultado ->> 'estados_gravados')::integer, 0);

  select
    count(*)::integer,
    coalesce(sum(e.qtd_recebida) filter (where e.estado = 'completo'), 0)::integer
    into v_estados_encontrados, v_vinculos_esperados
    from public.aula_roster_sync_estado e
    join public.aulas_emusys a on a.id = e.aula_id
   where e.run_id = v_run_interno
     and e.unidade_id = p_unidade_id
     and a.unidade_id = p_unidade_id
     and a.data_aula between p_data_inicio and p_data_fim;

  if v_estados_encontrados <> v_estados_esperados
     or exists (
       select 1
         from public.aula_roster_sync_estado e
        where e.run_id = v_run_interno
          and e.unidade_id = p_unidade_id
          and e.estado = 'completo'
          and (
            select count(*)
              from public.aula_alunos_emusys aa
             where aa.aula_emusys_id = e.aula_id
               and aa.unidade_id = e.unidade_id
               and aa.ativo_operacional
               and aa.ultimo_run_visto = v_run_interno
          ) <> e.qtd_recebida
     ) then
    raise exception using
      errcode = '40001',
      message = 'roster_contagem_concorrente';
  end if;

  select count(*)::integer
    into v_vinculos_encontrados
    from public.aula_alunos_emusys aa
    join public.aula_roster_sync_estado e
      on e.aula_id = aa.aula_emusys_id
     and e.unidade_id = aa.unidade_id
   where e.run_id = v_run_interno
     and e.estado = 'completo'
     and aa.ativo_operacional
     and aa.ultimo_run_visto = v_run_interno;

  if v_vinculos_encontrados <> v_vinculos_esperados then
    raise exception using
      errcode = '40001',
      message = 'roster_contagem_concorrente';
  end if;

  update public.aula_roster_sync_estado e
     set run_id = p_sync_run_id,
         atualizado_em = clock_timestamp()
   where e.run_id = v_run_interno
     and e.unidade_id = p_unidade_id
     and exists (
       select 1
         from public.aulas_emusys a
        where a.id = e.aula_id
          and a.unidade_id = p_unidade_id
          and a.data_aula between p_data_inicio and p_data_fim
     );
  get diagnostics v_estados_trocados = row_count;

  if v_estados_trocados <> v_estados_esperados then
    raise exception using
      errcode = '40001',
      message = 'roster_contagem_concorrente';
  end if;

  update public.aula_alunos_emusys aa
     set ultimo_run_visto = p_sync_run_id
   where aa.ultimo_run_visto = v_run_interno
     and aa.ativo_operacional
     and exists (
       select 1
         from public.aula_roster_sync_estado e
        where e.aula_id = aa.aula_emusys_id
          and e.unidade_id = aa.unidade_id
          and e.run_id = p_sync_run_id
          and e.estado = 'completo'
     );
  get diagnostics v_vinculos_trocados = row_count;

  if v_vinculos_trocados <> v_vinculos_esperados
     or exists (
       select 1
         from public.aula_roster_sync_estado e
        where e.run_id = p_sync_run_id
          and e.unidade_id = p_unidade_id
          and e.estado = 'completo'
          and (
            select count(*)
              from public.aula_alunos_emusys aa
             where aa.aula_emusys_id = e.aula_id
               and aa.unidade_id = e.unidade_id
               and aa.ativo_operacional
               and aa.ultimo_run_visto = p_sync_run_id
          ) <> e.qtd_recebida
     ) then
    raise exception using
      errcode = '40001',
      message = 'roster_contagem_concorrente';
  end if;

  return v_resultado || jsonb_build_object(
    'run_id', p_sync_run_id,
    'contrato', 'roster_v2'
  );
end;
$$;

revoke all on function public.reconciliar_grade_snapshot_emusys_v2(
  uuid, uuid, date, date, jsonb, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.reconciliar_grade_snapshot_emusys_v2(
  uuid, uuid, date, date, jsonb, boolean
) to service_role;

create or replace view public.vw_aula_roster_operacional_v2
with (security_invoker = true)
as
select
  aa.id as vinculo_id,
  aa.aula_emusys_id,
  aa.unidade_id,
  aa.aluno_id,
  aa.aluno_emusys_id,
  aa.aluno_chave,
  aa.aluno_nome,
  aa.sincronizado_em as vinculo_sincronizado_em,
  e.run_id,
  e.estado as roster_estado,
  e.qtd_esperada,
  e.qtd_recebida,
  e.snapshot_hash,
  e.sincronizado_em as roster_sincronizado_em
from public.aula_alunos_emusys aa
join public.aula_roster_sync_estado e
  on e.aula_id = aa.aula_emusys_id
 and e.unidade_id = aa.unidade_id
join public.aulas_emusys a
  on a.id = e.aula_id
 and a.unidade_id = e.unidade_id
join public.presenca_sync_execucoes x
  on x.id = e.run_id
 and x.unidade_id = e.unidade_id
join public.presenca_sync_cobertura c
  on c.run_id = x.id
 and c.unidade_id = x.unidade_id
 and c.modo = x.modo
 and c.data_alvo = x.data_alvo
where aa.ativo_operacional
  and aa.ultimo_run_visto = e.run_id
  and aa.aluno_id is not null
  and aa.aluno_emusys_id is not null
  and aa.aluno_emusys_id > 0
  and aa.aluno_chave = 'emusys:' || aa.aluno_emusys_id::text
  and e.estado = 'completo'
  and e.qtd_esperada = e.qtd_recebida
  and e.qtd_recebida > 0
  and x.status = 'concluida'
  and x.snapshot_hash is not null
  and c.status = 'concluida'
  and c.snapshot_hash = x.snapshot_hash
  and c.paginas_lidas = x.paginas_lidas
  and c.aulas_lidas = x.aulas_lidas
  and c.presencas_lidas = x.presencas_lidas
  and (
    select count(*)
      from public.aula_alunos_emusys total
     where total.aula_emusys_id = e.aula_id
       and total.unidade_id = e.unidade_id
       and total.ativo_operacional
  ) = e.qtd_recebida
  and not exists (
    select 1
      from public.aula_alunos_emusys incompleto
     where incompleto.aula_emusys_id = e.aula_id
       and incompleto.unidade_id = e.unidade_id
       and incompleto.ativo_operacional
       and (
         incompleto.ultimo_run_visto is distinct from e.run_id
         or incompleto.aluno_id is null
         or incompleto.aluno_emusys_id is null
         or incompleto.aluno_emusys_id <= 0
         or incompleto.aluno_chave is distinct from
           'emusys:' || incompleto.aluno_emusys_id::text
       )
  );

revoke all on table public.vw_aula_roster_operacional_v2
  from public, anon, authenticated, service_role;
grant select on table public.vw_aula_roster_operacional_v2 to service_role;

comment on function public.reconciliar_grade_snapshot_emusys_v2(
  uuid, uuid, date, date, jsonb, boolean
) is
  'Concilia pelo contrato v1 na mesma transacao e vincula o roster ao run externo ainda iniciado.';

comment on view public.vw_aula_roster_operacional_v2 is
  'Roster nominal fail-closed: run atual concluido com hash/contagens iguais, identidade local completa e uma unica proveniencia de publicacao.';
