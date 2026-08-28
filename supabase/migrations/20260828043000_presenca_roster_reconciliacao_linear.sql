-- O reconciliador v1 acumulava `detalhe` por concatenacao a cada aula e
-- reabria o JSON inteiro para cada candidata a cancelamento. Os dois caminhos
-- eram quadraticos e ultrapassavam o statement_timeout do PostgREST nas
-- unidades maiores. Mantem o mesmo contrato e a mesma ordem de locks/DML, mas
-- materializa ids e detalhe uma unica vez.

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
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_run_id uuid := gen_random_uuid();
  v_item jsonb;
  v_aula record;
  v_estado text;
  v_qtd_esperada integer;
  v_qtd_recebida integer;
  v_chaves text[];
  v_snapshot_emusys_ids integer[];
  v_snapshot_aula_ids integer[];
  v_indice integer;
  v_linhas integer;
  v_inativados integer := 0;
  v_reativados integer := 0;
  v_aulas_canceladas integer := 0;
  v_estados_gravados integer := 0;
  v_detalhe jsonb;
begin
  if p_unidade_id is null or p_data_inicio is null or p_data_fim is null
     or p_data_fim < p_data_inicio then
    return jsonb_build_object('status', 'abortado', 'motivo', 'janela_ou_unidade_invalida', 'alteracoes_aplicadas', 0);
  end if;
  if p_data_inicio < v_hoje - 120 or p_data_fim > v_hoje + 60 then
    return jsonb_build_object('status', 'abortado', 'motivo', 'janela_fora_do_limite_operacional', 'alteracoes_aplicadas', 0);
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'array'
     or jsonb_array_length(p_snapshot) = 0 then
    return jsonb_build_object('status', 'abortado', 'motivo', 'fotografia_vazia_ou_invalida', 'alteracoes_aplicadas', 0);
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_snapshot) item(valor)
     where jsonb_typeof(item.valor) <> 'object'
        or coalesce(item.valor ->> 'emusys_id', '') !~ '^[1-9][0-9]*$'
        or coalesce(item.valor ->> 'estado', '') not in ('completo', 'vazio_confirmado', 'incompleto', 'ambiguo')
        or coalesce(item.valor ->> 'qtd_esperada', '') !~ '^[0-9]+$'
        or coalesce(item.valor ->> 'qtd_recebida', '') !~ '^[0-9]+$'
        or jsonb_typeof(item.valor -> 'aluno_chaves') <> 'array'
        or exists (
          select 1 from jsonb_array_elements(item.valor -> 'aluno_chaves') chave(valor)
           where jsonb_typeof(chave.valor) <> 'string' or btrim(chave.valor #>> '{}') = ''
        )
  ) or exists (
    select 1 from jsonb_array_elements(p_snapshot) item(valor)
    group by (item.valor ->> 'emusys_id')
    having count(*) > 1
  ) then
    return jsonb_build_object('status', 'abortado', 'motivo', 'fotografia_com_estrutura_invalida', 'alteracoes_aplicadas', 0);
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_snapshot) item(valor)
     where (
       item.valor ->> 'estado' = 'completo'
       and (
         (item.valor ->> 'qtd_esperada')::integer <= 0
         or (item.valor ->> 'qtd_esperada')::integer <> (item.valor ->> 'qtd_recebida')::integer
         or jsonb_array_length(item.valor -> 'aluno_chaves') <> (item.valor ->> 'qtd_recebida')::integer
         or exists (
           select 1 from jsonb_array_elements_text(item.valor -> 'aluno_chaves') chave(valor)
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
    return jsonb_build_object('status', 'abortado', 'motivo', 'fotografia_estado_incoerente', 'alteracoes_aplicadas', 0);
  end if;

  select array_agg((item.valor ->> 'emusys_id')::integer order by item.ord)
    into v_snapshot_emusys_ids
    from jsonb_array_elements(p_snapshot) with ordinality item(valor, ord);

  v_snapshot_aula_ids := array_fill(
    null::integer,
    array[jsonb_array_length(p_snapshot)]
  );

  for v_indice in 1..jsonb_array_length(p_snapshot)
  loop
    v_item := p_snapshot -> (v_indice - 1);
    v_estado := v_item ->> 'estado';
    v_qtd_esperada := (v_item ->> 'qtd_esperada')::integer;
    v_qtd_recebida := (v_item ->> 'qtd_recebida')::integer;
    select coalesce(array_agg(chave order by chave), array[]::text[])
      into v_chaves
      from jsonb_array_elements_text(v_item -> 'aluno_chaves') chave;

    select a.* into v_aula
      from public.aulas_emusys a
     where a.unidade_id = p_unidade_id
       and a.emusys_id = (v_item ->> 'emusys_id')::integer
       and a.data_aula between p_data_inicio and p_data_fim
     for update;

    if not found then
      continue;
    end if;
    v_snapshot_aula_ids[v_indice] := v_aula.id;

    if not p_dry_run then
      insert into public.aula_roster_sync_estado(
        aula_id, unidade_id, run_id, estado, qtd_esperada, qtd_recebida,
        snapshot_hash, sincronizado_em, atualizado_em
      ) values (
        v_aula.id, p_unidade_id, v_run_id, v_estado, v_qtd_esperada, v_qtd_recebida,
        md5(v_item::text), clock_timestamp(), clock_timestamp()
      ) on conflict (aula_id) do update set
        unidade_id = excluded.unidade_id,
        run_id = excluded.run_id,
        estado = excluded.estado,
        qtd_esperada = excluded.qtd_esperada,
        qtd_recebida = excluded.qtd_recebida,
        snapshot_hash = excluded.snapshot_hash,
        sincronizado_em = excluded.sincronizado_em,
        atualizado_em = excluded.atualizado_em;
      v_estados_gravados := v_estados_gravados + 1;
    end if;

    if v_estado = 'completo' then
      if p_dry_run then
        select count(*) into v_linhas
          from public.aula_alunos_emusys aa
         where aa.aula_emusys_id = v_aula.id and not aa.ativo_operacional
           and aa.aluno_chave = any(v_chaves);
        v_reativados := v_reativados + v_linhas;
        select count(*) into v_linhas
          from public.aula_alunos_emusys aa
         where aa.aula_emusys_id = v_aula.id and aa.ativo_operacional
           and not (aa.aluno_chave = any(v_chaves));
        v_inativados := v_inativados + v_linhas;
      else
        update public.aula_alunos_emusys aa set
          ativo_operacional = true,
          ultimo_run_visto = v_run_id,
          inativado_em = null,
          inativado_motivo = null,
          updated_at = clock_timestamp()
        where aa.aula_emusys_id = v_aula.id
          and not aa.ativo_operacional
          and aa.aluno_chave = any(v_chaves);
        get diagnostics v_linhas = row_count;
        v_reativados := v_reativados + v_linhas;

        update public.aula_alunos_emusys aa set ultimo_run_visto = v_run_id
        where aa.aula_emusys_id = v_aula.id
          and aa.ativo_operacional
          and aa.aluno_chave = any(v_chaves);

        update public.aula_alunos_emusys aa set
          ativo_operacional = false,
          inativado_em = clock_timestamp(),
          inativado_motivo = 'ausente_snapshot_completo',
          updated_at = clock_timestamp()
        where aa.aula_emusys_id = v_aula.id
          and aa.ativo_operacional
          and not (aa.aluno_chave = any(v_chaves));
        get diagnostics v_linhas = row_count;
        v_inativados := v_inativados + v_linhas;
      end if;
    elsif v_estado = 'vazio_confirmado' then
      if p_dry_run then
        select count(*) into v_linhas from public.aula_alunos_emusys aa
         where aa.aula_emusys_id = v_aula.id and aa.ativo_operacional;
        v_inativados := v_inativados + v_linhas;
      else
        update public.aula_alunos_emusys aa set
          ativo_operacional = false,
          inativado_em = clock_timestamp(),
          inativado_motivo = 'roster_vazio_confirmado',
          updated_at = clock_timestamp()
        where aa.aula_emusys_id = v_aula.id and aa.ativo_operacional;
        get diagnostics v_linhas = row_count;
        v_inativados := v_inativados + v_linhas;
      end if;
    end if;
  end loop;

  if p_data_inicio >= v_hoje then
    if p_dry_run then
      select count(*) into v_aulas_canceladas
        from public.aulas_emusys a
       where a.unidade_id = p_unidade_id
         and a.categoria = 'normal'
         and not coalesce(a.cancelada, false)
         and a.data_aula between p_data_inicio and p_data_fim
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
          when item.valor ->> 'estado' in ('incompleto', 'ambiguo') then 'revisao_estrutural'
          when item.valor ->> 'estado' = 'vazio_confirmado' then 'inativar_roster_vazio'
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
    'run_id', v_run_id,
    'unidade_id', p_unidade_id,
    'estados_gravados', v_estados_gravados,
    'vinculos_reativados', v_reativados,
    'vinculos_inativados', v_inativados,
    'vinculos_removidos', 0,
    'vinculos_removidos_aplicados', 0,
    'aulas_canceladas', v_aulas_canceladas,
    'aulas_canceladas_aplicadas', case when p_dry_run then 0 else v_aulas_canceladas end,
    'alteracoes_aplicadas', case when p_dry_run then 0 else v_reativados + v_inativados + v_aulas_canceladas end,
    'detalhe', v_detalhe
  );
end;
$$;

revoke all on function public.reconciliar_grade_snapshot_emusys_v1(
  uuid, date, date, jsonb, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.reconciliar_grade_snapshot_emusys_v1(
  uuid, date, date, jsonb, boolean
) to service_role;

comment on function public.reconciliar_grade_snapshot_emusys_v1(
  uuid, date, date, jsonb, boolean
) is
  'Concilia roster por snapshot em tempo linear, com soft-inativacao e preservacao integral de aluno_presenca.';
