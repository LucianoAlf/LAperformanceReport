-- Preserva a nao renovacao humana quando ela ja foi registrada depois da
-- captura da renovacao pendente. A pendencia antiga e removida, sem duplicar
-- a saida do aluno nem apagar motivo/observacao preenchidos pela equipe.

create or replace function public.converter_renovacao_pendente_em_nao_renovacao(
  p_movimentacao_id integer,
  p_emusys_matricula_id text default null,
  p_data date default current_date,
  p_motivo_saida_id integer default null,
  p_motivo text default null,
  p_observacoes text default null,
  p_agente_comercial text default null,
  p_tempo_permanencia_meses integer default null,
  p_valor_parcela numeric default null,
  p_origem text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mov public.movimentacoes_admin%rowtype;
  v_aluno public.alunos%rowtype;
  v_nao_renovacao_existente public.movimentacoes_admin%rowtype;
  v_motivo text;
  v_agora timestamptz := now();
begin
  select *
  into v_mov
  from public.movimentacoes_admin m
  where m.id = p_movimentacao_id
  for update;

  if not found then
    raise exception 'Movimentacao nao encontrada: %', p_movimentacao_id
      using errcode = 'P0002';
  end if;

  if not (
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.usuarios u
      where u.auth_user_id = auth.uid()
        and coalesce(u.ativo, true)
        and (u.perfil = 'admin' or u.unidade_id = v_mov.unidade_id)
    )
  ) then
    raise exception 'Acesso negado para a unidade da movimentacao %', p_movimentacao_id
      using errcode = '42501';
  end if;

  if v_mov.tipo = 'nao_renovacao' then
    return jsonb_build_object(
      'ok', true,
      'convertida', false,
      'idempotente', true,
      'movimentacao_id', v_mov.id,
      'aluno_id', v_mov.aluno_id
    );
  end if;

  if v_mov.tipo <> 'renovacao'
     or coalesce(v_mov.renovacao_status, '') not in ('pendente_validacao', 'antecipada_pendente') then
    raise exception 'Movimentacao % nao e uma renovacao pendente', p_movimentacao_id
      using errcode = '22023';
  end if;

  if v_mov.aluno_id is null then
    raise exception 'Renovacao pendente % sem aluno_id; requer conciliacao manual', p_movimentacao_id
      using errcode = '22023';
  end if;

  select *
  into v_aluno
  from public.alunos a
  where a.id = v_mov.aluno_id
    and a.unidade_id = v_mov.unidade_id
  for update;

  if not found then
    raise exception 'Aluno da renovacao pendente nao encontrado: %', v_mov.aluno_id
      using errcode = 'P0002';
  end if;

  if auth.role() = 'service_role' then
    if nullif(trim(p_emusys_matricula_id), '') is null then
      raise exception 'Conversao automatica exige emusys_matricula_id'
        using errcode = '22023';
    end if;

    if nullif(trim(v_mov.emusys_matricula_id), '') is not null
       and v_mov.emusys_matricula_id <> p_emusys_matricula_id then
      raise exception 'Matricula Emusys divergente na renovacao pendente %', p_movimentacao_id
        using errcode = '22023';
    end if;

    if nullif(trim(v_aluno.emusys_matricula_id), '') is not null
       and v_aluno.emusys_matricula_id <> p_emusys_matricula_id then
      raise exception 'Matricula Emusys divergente no aluno %', v_aluno.id
        using errcode = '22023';
    end if;
  end if;

  select n.*
  into v_nao_renovacao_existente
  from public.movimentacoes_admin n
  where n.id <> v_mov.id
    and n.unidade_id = v_mov.unidade_id
    and n.aluno_id = v_mov.aluno_id
    and n.tipo = 'nao_renovacao'
    and (
      n.competencia_referencia is not distinct from v_mov.competencia_referencia
      or (
        nullif(trim(p_emusys_matricula_id), '') is not null
        and n.emusys_matricula_id = p_emusys_matricula_id
      )
    )
  order by n.updated_at desc nulls last, n.id desc
  limit 1
  for update;

  if found then
    update public.movimentacoes_admin n
    set
      emusys_matricula_id = coalesce(n.emusys_matricula_id, nullif(trim(p_emusys_matricula_id), '')),
      tempo_permanencia_meses = coalesce(n.tempo_permanencia_meses, p_tempo_permanencia_meses, v_mov.tempo_permanencia_meses, v_aluno.tempo_permanencia_meses),
      valor_parcela_evasao = coalesce(n.valor_parcela_evasao, p_valor_parcela, v_mov.valor_parcela_anterior, v_aluno.valor_parcela),
      updated_at = v_agora
    where n.id = v_nao_renovacao_existente.id;

    delete from public.movimentacoes_admin m
    where m.id = v_mov.id;

    update public.alunos a
    set
      status = 'inativo',
      data_saida = coalesce(v_nao_renovacao_existente.data, p_data, current_date),
      motivo_saida_id = coalesce(v_nao_renovacao_existente.motivo_saida_id, a.motivo_saida_id),
      aguardando_renovacao = false,
      emusys_matricula_id = coalesce(nullif(trim(p_emusys_matricula_id), ''), a.emusys_matricula_id),
      updated_at = v_agora,
      updated_by = coalesce(nullif(trim(p_origem), ''), 'nao-renovacao-canonica')
    where a.id = v_aluno.id;

    update public.matriculas_divergencias d
    set
      resolvido = true,
      updated_at = v_agora,
      analise_sol = concat_ws(
        E'\n',
        nullif(d.analise_sol, ''),
        'Resolvida pela regra canonica: registro manual de nao renovacao preservado.'
      )
    where d.aluno_id = v_aluno.id
      and d.tipo_divergencia = 'status_divergente'
      and not d.resolvido;

    return jsonb_build_object(
      'ok', true,
      'convertida', false,
      'idempotente', true,
      'registro_manual_preservado', true,
      'movimentacao_id', v_nao_renovacao_existente.id,
      'pendencia_removida_id', v_mov.id,
      'aluno_id', v_aluno.id,
      'origem', p_origem
    );
  end if;

  select ms.nome
  into v_motivo
  from public.motivos_saida ms
  where ms.id = p_motivo_saida_id;

  v_motivo := coalesce(nullif(trim(p_motivo), ''), v_motivo, v_mov.motivo, 'Nao informou renovacao');

  update public.movimentacoes_admin m
  set
    tipo = 'nao_renovacao',
    data = coalesce(p_data, current_date),
    renovacao_status = null,
    renovacao_antecipada = false,
    renovacao_primeira_aula_novo_ciclo = null,
    emusys_matricula_id = coalesce(nullif(trim(p_emusys_matricula_id), ''), m.emusys_matricula_id),
    motivo_saida_id = coalesce(p_motivo_saida_id, m.motivo_saida_id),
    motivo = v_motivo,
    observacoes = coalesce(
      nullif(trim(p_observacoes), ''),
      m.observacoes,
      case when p_origem = 'sync-matriculas-emusys'
        then 'Nao renovacao identificada automaticamente: renovacao pendente e mesma matricula finalizada no Emusys.'
      end
    ),
    agente_comercial = coalesce(nullif(trim(p_agente_comercial), ''), m.agente_comercial),
    tempo_permanencia_meses = coalesce(p_tempo_permanencia_meses, m.tempo_permanencia_meses, v_aluno.tempo_permanencia_meses),
    valor_parcela_evasao = coalesce(p_valor_parcela, m.valor_parcela_evasao, m.valor_parcela_anterior, v_aluno.valor_parcela),
    updated_at = v_agora
  where m.id = v_mov.id;

  update public.alunos a
  set
    status = 'inativo',
    data_saida = coalesce(p_data, current_date),
    motivo_saida_id = coalesce(p_motivo_saida_id, a.motivo_saida_id),
    aguardando_renovacao = false,
    emusys_matricula_id = coalesce(nullif(trim(p_emusys_matricula_id), ''), a.emusys_matricula_id),
    updated_at = v_agora,
    updated_by = coalesce(nullif(trim(p_origem), ''), 'nao-renovacao-canonica')
  where a.id = v_aluno.id;

  update public.matriculas_divergencias d
  set
    resolvido = true,
    updated_at = v_agora,
    analise_sol = concat_ws(
      E'\n',
      nullif(d.analise_sol, ''),
      'Resolvida pela regra canonica: renovacao pendente + mesma matricula finalizada no Emusys.'
    )
  where d.aluno_id = v_aluno.id
    and d.tipo_divergencia = 'status_divergente'
    and not d.resolvido;

  return jsonb_build_object(
    'ok', true,
    'convertida', true,
    'idempotente', false,
    'movimentacao_id', v_mov.id,
    'aluno_id', v_aluno.id,
    'emusys_matricula_id', coalesce(nullif(trim(p_emusys_matricula_id), ''), v_mov.emusys_matricula_id),
    'origem', p_origem
  );
end;
$$;

comment on function public.converter_renovacao_pendente_em_nao_renovacao(
  integer, text, date, integer, text, text, text, integer, numeric, text
) is 'Converte renovacao pendente sem duplicar uma nao renovacao ja registrada pela equipe.';
