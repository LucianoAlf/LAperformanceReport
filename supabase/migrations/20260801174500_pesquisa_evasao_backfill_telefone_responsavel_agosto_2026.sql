-- Backfill controlado das saídas de agosto/2026 criadas antes da correção
-- do trigger de telefone. A fonte é o contato atual do responsável, não um
-- snapshot capturado no momento da saída.

begin;

comment on column public.movimentacoes_admin.telefone_snapshot_origem is
  'Origem excepcional do telefone_snapshot. cadastro_atual_backfill_2026_07 indica whatsapp/telefone atual do aluno; cadastro_responsavel_backfill_2026_07 indica responsavel_telefone atual recuperado em julho; cadastro_responsavel_backfill_2026_08 indica responsavel_telefone atual recuperado para saídas de agosto criadas antes da correção do trigger; cadastro_responsavel_vinculo_manual_alf_2026_08 indica o vínculo manual confirmado por Alf da movimentação 3312 ao aluno 1532. NULL indica snapshot real capturado no momento da saída ou valor anterior aos backfills.';

do $preflight$
declare
  v_expected_ids integer[] := array[
    3473, 3475, 3476, 3477, 3480,
    3483, 3484, 3485, 3486, 3488
  ];
  v_current_ids integer[];
  v_total integer;
begin
  select
    count(*)::integer,
    coalesce(array_agg(m.id order by m.id), array[]::integer[])
  into v_total, v_current_ids
  from public.movimentacoes_admin as m
  join public.alunos as a on a.id = m.aluno_id
  where m.tipo in ('evasao', 'nao_renovacao')
    and m.data >= date '2026-08-01'
    and public.is_movimentacao_admin_retencao_valida(m.id)
    and nullif(btrim(m.telefone_snapshot), '') is null
    and a.data_nascimento is not null
    and extract(year from age(m.data, a.data_nascimento))::integer < 18
    and nullif(btrim(a.responsavel_telefone), '') is not null;

  if v_total <> 10 or v_current_ids is distinct from v_expected_ids then
    raise exception
      'backfill de agosto abortado: conjunto mudou (esperado=%, atual=%, total=%)',
      v_expected_ids, v_current_ids, v_total;
  end if;

  raise notice
    'backfill de agosto autorizado: 10 snapshots de responsável, ids=%',
    v_current_ids;
end;
$preflight$;

do $apply$
declare
  v_expected_ids integer[] := array[
    3473, 3475, 3476, 3477, 3480,
    3483, 3484, 3485, 3486, 3488
  ];
  v_atualizadas integer;
  v_restantes integer;
  v_marcadas integer;
begin
  update public.movimentacoes_admin as m
  set
    telefone_snapshot = nullif(btrim(a.responsavel_telefone), ''),
    telefone_snapshot_origem = 'cadastro_responsavel_backfill_2026_08'
  from public.alunos as a
  where a.id = m.aluno_id
    and m.id = any(v_expected_ids)
    and m.tipo in ('evasao', 'nao_renovacao')
    and m.data >= date '2026-08-01'
    and public.is_movimentacao_admin_retencao_valida(m.id)
    and nullif(btrim(m.telefone_snapshot), '') is null
    and a.data_nascimento is not null
    and extract(year from age(m.data, a.data_nascimento))::integer < 18
    and nullif(btrim(a.responsavel_telefone), '') is not null;

  get diagnostics v_atualizadas = row_count;

  if v_atualizadas <> 10 then
    raise exception
      'backfill de agosto abortado: esperado atualizar 10 linhas, atualizou %',
      v_atualizadas;
  end if;

  select count(*)::integer
  into v_marcadas
  from public.movimentacoes_admin as m
  where m.id = any(v_expected_ids)
    and m.telefone_snapshot_origem = 'cadastro_responsavel_backfill_2026_08'
    and nullif(btrim(m.telefone_snapshot), '') is not null;

  if v_marcadas <> 10 then
    raise exception
      'backfill de agosto abortado: proveniência gravada em % de 10 linhas',
      v_marcadas;
  end if;

  select count(*)::integer
  into v_restantes
  from public.movimentacoes_admin as m
  join public.alunos as a on a.id = m.aluno_id
  where m.tipo in ('evasao', 'nao_renovacao')
    and m.data >= date '2026-08-01'
    and public.is_movimentacao_admin_retencao_valida(m.id)
    and nullif(btrim(m.telefone_snapshot), '') is null
    and a.data_nascimento is not null
    and extract(year from age(m.data, a.data_nascimento))::integer < 18
    and nullif(btrim(a.responsavel_telefone), '') is not null;

  if v_restantes <> 0 then
    raise exception
      'backfill de agosto abortado: restaram % linhas recuperáveis',
      v_restantes;
  end if;

  raise notice
    'backfill de agosto concluído: 10 snapshots com origem cadastro_responsavel_backfill_2026_08';
end;
$apply$;

commit;
