-- O reconciliador linear ainda executava DML por aula e o wrapper v2 gravava
-- cada run duas vezes (UUID interno e, depois, UUID do sync). Em Campo Grande,
-- sob carga real, isso encostava no timeout do PostgREST. Este patch preserva
-- contrato, locks, soft-inativacao e dry-run, mas materializa a fotografia em
-- operacoes set-based e grava diretamente o run canonico recebido pelo v2.

create or replace function public.reconciliar_grade_snapshot_emusys_core_v3(
  p_run_id uuid,
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_snapshot jsonb,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_snapshot_emusys_ids integer[];
  v_snapshot_aula_ids integer[];
  v_cancelamento_aula_ids integer[] := array[]::integer[];
  v_reativados integer := 0;
  v_inativados integer := 0;
  v_aulas_canceladas integer := 0;
  v_estados_gravados integer := 0;
  v_detalhe jsonb;
begin
  if p_run_id is null or p_unidade_id is null or p_data_inicio is null
     or p_data_fim is null or p_data_fim < p_data_inicio or p_dry_run is null then
    return jsonb_build_object(
      'status', 'abortado',
      'motivo', 'janela_ou_unidade_invalida',
      'alteracoes_aplicadas', 0
    );
  end if;
  if p_data_inicio < v_hoje - 120 or p_data_fim > v_hoje + 60 then
    return jsonb_build_object(
      'status', 'abortado',
      'motivo', 'janela_fora_do_limite_operacional',
      'alteracoes_aplicadas', 0
    );
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'array'
     or jsonb_array_length(p_snapshot) = 0 then
    return jsonb_build_object(
      'status', 'abortado',
      'motivo', 'fotografia_vazia_ou_invalida',
      'alteracoes_aplicadas', 0
    );
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_snapshot) item(valor)
     where jsonb_typeof(item.valor) <> 'object'
        or coalesce(item.valor ->> 'emusys_id', '') !~ '^[1-9][0-9]*$'
        or coalesce(item.valor ->> 'estado', '') not in (
          'completo', 'vazio_confirmado', 'incompleto', 'ambiguo'
        )
        or coalesce(item.valor ->> 'qtd_esperada', '') !~ '^[0-9]+$'
        or coalesce(item.valor ->> 'qtd_recebida', '') !~ '^[0-9]+$'
        or jsonb_typeof(item.valor -> 'aluno_chaves') <> 'array'
        or exists (
          select 1
            from jsonb_array_elements(item.valor -> 'aluno_chaves') chave(valor)
           where jsonb_typeof(chave.valor) <> 'string'
              or btrim(chave.valor #>> '{}') = ''
        )
  ) or exists (
    select 1
      from jsonb_array_elements(p_snapshot) item(valor)
     group by (item.valor ->> 'emusys_id')
    having count(*) > 1
  ) then
    return jsonb_build_object(
      'status', 'abortado',
      'motivo', 'fotografia_com_estrutura_invalida',
      'alteracoes_aplicadas', 0
    );
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_snapshot) item(valor)
     where (
       item.valor ->> 'estado' = 'completo'
       and (
         (item.valor ->> 'qtd_esperada')::integer <= 0
         or (item.valor ->> 'qtd_esperada')::integer
            <> (item.valor ->> 'qtd_recebida')::integer
         or jsonb_array_length(item.valor -> 'aluno_chaves')
            <> (item.valor ->> 'qtd_recebida')::integer
         or exists (
           select 1
             from jsonb_array_elements_text(item.valor -> 'aluno_chaves') chave(valor)
            where chave.valor !~ '^emusys:[1-9][0-9]*$'
         )
       )
     ) or (
       item.valor ->> 'estado' = 'vazio_confirmado'
       and (
         (item.valor ->> 'qtd_esperada')::integer <> 0
         or (item.valor ->> 'qtd_recebida')::integer <> 0
         or jsonb_array_length(item.valor -> 'aluno_chaves') <> 0
       )
     )
  ) then
    return jsonb_build_object(
      'status', 'abortado',
      'motivo', 'fotografia_estado_incoerente',
      'alteracoes_aplicadas', 0
    );
  end if;

  select array_agg((item.valor ->> 'emusys_id')::integer order by item.ord)
    into v_snapshot_emusys_ids
    from jsonb_array_elements(p_snapshot) with ordinality item(valor, ord);

  -- Captura a identidade local antes de esperar por qualquer row lock. Uma
  -- aula inserida enquanto esperamos nao pode mudar retroativamente o retrato.
  select array_agg(a.id order by item.ord)
    into v_snapshot_aula_ids
    from jsonb_array_elements(p_snapshot) with ordinality item(valor, ord)
    left join public.aulas_emusys a
      on a.unidade_id = p_unidade_id
     and a.emusys_id = (item.valor ->> 'emusys_id')::integer
     and a.data_aula between p_data_inicio and p_data_fim;

  -- Congela tambem o universo negativo. Uma aula criada depois desta captura
  -- nao fazia parte da comparacao com o Emusys e nao pode ser cancelada.
  if p_data_inicio >= v_hoje then
    select coalesce(array_agg(a.id order by a.id), array[]::integer[])
      into v_cancelamento_aula_ids
      from public.aulas_emusys a
     where a.unidade_id = p_unidade_id
       and a.categoria = 'normal'
       and not coalesce(a.cancelada, false)
       and a.data_aula between p_data_inicio and p_data_fim
       and not (a.emusys_id = any(v_snapshot_emusys_ids));
  end if;

  -- Ordem deterministica para todos os registros que existiam no retrato,
  -- inclusive candidatos negativos que talvez sejam cancelados.
  perform a.id
    from public.aulas_emusys a
   where a.id = any(
     coalesce(v_snapshot_aula_ids, array[]::integer[])
     || coalesce(v_cancelamento_aula_ids, array[]::integer[])
   )
   order by a.id
   for update;

  -- Se um registro capturado desapareceu ou mudou de escopo antes do lock,
  -- ele deixa de ser elegivel. IDs que eram nulos continuam nulos.
  select array_agg(
    case
      when a.id is not null
       and a.unidade_id = p_unidade_id
       and a.emusys_id = (item.valor ->> 'emusys_id')::integer
       and a.data_aula between p_data_inicio and p_data_fim
      then capturada.aula_id
      else null
    end
    order by item.ord
  )
    into v_snapshot_aula_ids
    from jsonb_array_elements(p_snapshot) with ordinality item(valor, ord)
    cross join lateral (
      values (v_snapshot_aula_ids[item.ord::integer])
    ) capturada(aula_id)
    left join public.aulas_emusys a on a.id = capturada.aula_id;

  if not p_dry_run then
    with snapshot_itens as materialized (
      select
        item.ord::integer as indice,
        item.valor,
        v_snapshot_aula_ids[item.ord::integer] as aula_id,
        item.valor ->> 'estado' as estado,
        (item.valor ->> 'qtd_esperada')::integer as qtd_esperada,
        (item.valor ->> 'qtd_recebida')::integer as qtd_recebida
      from jsonb_array_elements(p_snapshot) with ordinality item(valor, ord)
    )
    insert into public.aula_roster_sync_estado(
      aula_id, unidade_id, run_id, estado, qtd_esperada, qtd_recebida,
      snapshot_hash, sincronizado_em, atualizado_em
    )
    select
      s.aula_id, p_unidade_id, p_run_id, s.estado,
      s.qtd_esperada, s.qtd_recebida, md5(s.valor::text),
      clock_timestamp(), clock_timestamp()
    from snapshot_itens s
    where s.aula_id is not null
    on conflict (aula_id) do update set
      unidade_id = excluded.unidade_id,
      run_id = excluded.run_id,
      estado = excluded.estado,
      qtd_esperada = excluded.qtd_esperada,
      qtd_recebida = excluded.qtd_recebida,
      snapshot_hash = excluded.snapshot_hash,
      sincronizado_em = excluded.sincronizado_em,
      atualizado_em = excluded.atualizado_em;
    get diagnostics v_estados_gravados = row_count;
  else
    select count(*)::integer
      into v_estados_gravados
      from unnest(v_snapshot_aula_ids) aula_id
     where aula_id is not null;
  end if;

  with snapshot_itens as materialized (
    select
      v_snapshot_aula_ids[item.ord::integer] as aula_id,
      item.valor ->> 'estado' as estado,
      item.valor -> 'aluno_chaves' as aluno_chaves
    from jsonb_array_elements(p_snapshot) with ordinality item(valor, ord)
  )
  select count(*)::integer
    into v_reativados
    from snapshot_itens s
    join public.aula_alunos_emusys aa on aa.aula_emusys_id = s.aula_id
   where s.estado = 'completo'
     and not aa.ativo_operacional
     and exists (
       select 1
         from jsonb_array_elements_text(s.aluno_chaves) chave(valor)
        where chave.valor = aa.aluno_chave
     );

  if p_dry_run then
    with snapshot_itens as materialized (
      select
        v_snapshot_aula_ids[item.ord::integer] as aula_id,
        item.valor ->> 'estado' as estado,
        item.valor -> 'aluno_chaves' as aluno_chaves
      from jsonb_array_elements(p_snapshot) with ordinality item(valor, ord)
    )
    select count(*)::integer
      into v_inativados
      from snapshot_itens s
      join public.aula_alunos_emusys aa on aa.aula_emusys_id = s.aula_id
     where aa.ativo_operacional
       and (
         s.estado = 'vazio_confirmado'
         or (
           s.estado = 'completo'
           and not exists (
             select 1
               from jsonb_array_elements_text(s.aluno_chaves) chave(valor)
              where chave.valor = aa.aluno_chave
           )
         )
       );
  else
    -- Um unico UPDATE marca os presentes no snapshot e reativa quem voltou.
    with snapshot_itens as materialized (
      select
        v_snapshot_aula_ids[item.ord::integer] as aula_id,
        item.valor ->> 'estado' as estado,
        item.valor -> 'aluno_chaves' as aluno_chaves
      from jsonb_array_elements(p_snapshot) with ordinality item(valor, ord)
    )
    update public.aula_alunos_emusys aa set
      ativo_operacional = true,
      ultimo_run_visto = p_run_id,
      inativado_em = case when aa.ativo_operacional then aa.inativado_em else null end,
      inativado_motivo = case
        when aa.ativo_operacional then aa.inativado_motivo else null
      end,
      updated_at = case
        when aa.ativo_operacional then aa.updated_at else clock_timestamp()
      end
    from snapshot_itens s
    where aa.aula_emusys_id = s.aula_id
      and s.estado = 'completo'
      and exists (
        select 1
          from jsonb_array_elements_text(s.aluno_chaves) chave(valor)
         where chave.valor = aa.aluno_chave
      );

    with snapshot_itens as materialized (
      select
        v_snapshot_aula_ids[item.ord::integer] as aula_id,
        item.valor ->> 'estado' as estado,
        item.valor -> 'aluno_chaves' as aluno_chaves
      from jsonb_array_elements(p_snapshot) with ordinality item(valor, ord)
    )
    update public.aula_alunos_emusys aa set
      ativo_operacional = false,
      inativado_em = clock_timestamp(),
      inativado_motivo = case
        when s.estado = 'vazio_confirmado' then 'roster_vazio_confirmado'
        else 'ausente_snapshot_completo'
      end,
      updated_at = clock_timestamp()
    from snapshot_itens s
    where aa.aula_emusys_id = s.aula_id
      and aa.ativo_operacional
      and (
        s.estado = 'vazio_confirmado'
        or (
          s.estado = 'completo'
          and not exists (
            select 1
              from jsonb_array_elements_text(s.aluno_chaves) chave(valor)
             where chave.valor = aa.aluno_chave
          )
        )
      );
    get diagnostics v_inativados = row_count;
  end if;

  if p_data_inicio >= v_hoje then
    if p_dry_run then
      select count(*)::integer
        into v_aulas_canceladas
        from public.aulas_emusys a
       where a.unidade_id = p_unidade_id
         and a.categoria = 'normal'
         and not coalesce(a.cancelada, false)
         and a.data_aula between p_data_inicio and p_data_fim
         and a.id = any(v_cancelamento_aula_ids)
         and not (a.emusys_id = any(v_snapshot_emusys_ids));
    else
      update public.aulas_emusys a set
        cancelada = true,
        cancelada_origem = 'sync_ausente_emusys',
        cancelada_motivo = 'Aula ausente no Emusys; presenca humana preservada',
        cancelada_em = clock_timestamp()
      where a.unidade_id = p_unidade_id
        and a.categoria = 'normal'
        and not coalesce(a.cancelada, false)
        and a.data_aula between p_data_inicio and p_data_fim
        and a.id = any(v_cancelamento_aula_ids)
        and not (a.emusys_id = any(v_snapshot_emusys_ids));
      get diagnostics v_aulas_canceladas = row_count;
    end if;
  end if;

  select coalesce(jsonb_agg(
    case
      when capturada.aula_id is null then jsonb_build_object(
        'emusys_aula_id', (item.valor ->> 'emusys_id')::integer,
        'estado', item.valor ->> 'estado',
        'acao', 'aula_local_ausente'
      )
      else jsonb_build_object(
        'aula_local_id', capturada.aula_id,
        'emusys_aula_id', (item.valor ->> 'emusys_id')::integer,
        'estado', item.valor ->> 'estado',
        'acao', case
          when item.valor ->> 'estado' in ('incompleto', 'ambiguo')
            then 'revisao_estrutural'
          when item.valor ->> 'estado' = 'vazio_confirmado'
            then 'inativar_roster_vazio'
          else 'conciliar_roster_completo'
        end
      )
    end order by item.ord
  ), '[]'::jsonb)
    into v_detalhe
    from jsonb_array_elements(p_snapshot) with ordinality item(valor, ord)
    cross join lateral (
      values (v_snapshot_aula_ids[item.ord::integer])
    ) capturada(aula_id);

  return jsonb_build_object(
    'status', 'ok',
    'dry_run', p_dry_run,
    'run_id', p_run_id,
    'unidade_id', p_unidade_id,
    'estados_gravados', v_estados_gravados,
    'vinculos_reativados', v_reativados,
    'vinculos_inativados', v_inativados,
    'vinculos_removidos', 0,
    'vinculos_removidos_aplicados', 0,
    'aulas_canceladas', v_aulas_canceladas,
    'aulas_canceladas_aplicadas', case
      when p_dry_run then 0 else v_aulas_canceladas
    end,
    'alteracoes_aplicadas', case
      when p_dry_run then 0
      else v_reativados + v_inativados + v_aulas_canceladas
    end,
    'detalhe', v_detalhe
  );
end;
$$;

revoke all on function public.reconciliar_grade_snapshot_emusys_core_v3(
  uuid, uuid, date, date, jsonb, boolean
) from public, anon, authenticated, service_role;
comment on function public.reconciliar_grade_snapshot_emusys_core_v3(
  uuid, uuid, date, date, jsonb, boolean
) is
  '[interna] Nucleo set-based do roster; wrappers v1/v2 preservam autorizacao e contrato.';

create or replace function public.reconciliar_grade_snapshot_emusys_v1(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_snapshot jsonb,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return public.reconciliar_grade_snapshot_emusys_core_v3(
    gen_random_uuid(), p_unidade_id, p_data_inicio, p_data_fim,
    p_snapshot, p_dry_run
  );
end;
$$;

revoke all on function public.reconciliar_grade_snapshot_emusys_v1(
  uuid, date, date, jsonb, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.reconciliar_grade_snapshot_emusys_v1(
  uuid, date, date, jsonb, boolean
) to service_role;

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
security definer
set search_path = pg_catalog, public
as $$
declare
  v_exec public.presenca_sync_execucoes%rowtype;
  v_cobertura public.presenca_sync_cobertura%rowtype;
  v_resultado jsonb;
  v_estados_esperados integer;
  v_estados_encontrados integer;
  v_vinculos_esperados integer;
  v_vinculos_encontrados integer;
  v_contagem_inconsistente boolean;
  v_lock_key bigint;
begin
  if p_sync_run_id is null or p_unidade_id is null
     or p_data_inicio is null or p_data_fim is null
     or p_data_fim < p_data_inicio or p_dry_run is null then
    raise exception using errcode = '22023', message = 'sync_run_incompativel';
  end if;

  if not p_dry_run then
    for v_lock_key in
      select distinct locks.lock_key
        from (
          select public.fn_presenca_roster_lock_key_v2(a.id) as lock_key
            from public.aulas_emusys a
           where a.unidade_id = p_unidade_id
             and a.data_aula between p_data_inicio and p_data_fim
          union all
          select public.fn_presenca_slot_lock_key_v2(
            a.unidade_id, a.professor_id, a.data_hora_inicio,
            a.data_hora_fim, a.curso_nome
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
    raise exception using errcode = '22023', message = 'sync_run_incompativel';
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
    raise exception using errcode = '40001', message = 'sync_run_substituida';
  end if;

  v_resultado := public.reconciliar_grade_snapshot_emusys_core_v3(
    p_sync_run_id, p_unidade_id, p_data_inicio, p_data_fim,
    p_snapshot, p_dry_run
  );

  if coalesce(v_resultado ->> 'status', '') <> 'ok' then
    return v_resultado || jsonb_build_object(
      'run_id', p_sync_run_id,
      'contrato', 'roster_v2'
    );
  end if;
  if p_dry_run then
    return v_resultado || jsonb_build_object(
      'run_id', p_sync_run_id,
      'contrato', 'roster_v2'
    );
  end if;

  v_estados_esperados := coalesce(
    (v_resultado ->> 'estados_gravados')::integer, 0
  );

  with estados as materialized (
    select e.aula_id, e.unidade_id, e.estado, e.qtd_recebida
      from public.aula_roster_sync_estado e
      join public.aulas_emusys a on a.id = e.aula_id
     where e.run_id = p_sync_run_id
       and e.unidade_id = p_unidade_id
       and a.unidade_id = p_unidade_id
       and a.data_aula between p_data_inicio and p_data_fim
  ), vinculos as materialized (
    select aa.aula_emusys_id, aa.unidade_id, count(*)::integer as quantidade
      from public.aula_alunos_emusys aa
     where aa.ativo_operacional
       and aa.ultimo_run_visto = p_sync_run_id
     group by aa.aula_emusys_id, aa.unidade_id
  )
  select
    count(*)::integer,
    coalesce(sum(e.qtd_recebida) filter (where e.estado = 'completo'), 0)::integer,
    coalesce(sum(v.quantidade) filter (where e.estado = 'completo'), 0)::integer,
    coalesce(bool_or(
      e.estado = 'completo'
      and coalesce(v.quantidade, 0) <> e.qtd_recebida
    ), false)
    into v_estados_encontrados, v_vinculos_esperados,
         v_vinculos_encontrados, v_contagem_inconsistente
    from estados e
    left join vinculos v
      on v.aula_emusys_id = e.aula_id
     and v.unidade_id = e.unidade_id;

  if v_estados_encontrados <> v_estados_esperados
     or v_vinculos_encontrados <> v_vinculos_esperados
     or v_contagem_inconsistente then
    raise exception using errcode = '40001', message = 'roster_contagem_concorrente';
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

comment on function public.reconciliar_grade_snapshot_emusys_v1(
  uuid, date, date, jsonb, boolean
) is
  'Compatibilidade v1 sobre nucleo set-based; preserva soft-inativacao e aluno_presenca.';
comment on function public.reconciliar_grade_snapshot_emusys_v2(
  uuid, uuid, date, date, jsonb, boolean
) is
  'Roster v2 governado, set-based e sem remapeamento duplo do UUID de sync.';
