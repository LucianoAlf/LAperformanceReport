-- Decisao de Alf em 31/07/2026:
-- recuperar, de forma controlada, o contato atual das saidas de julho/2026
-- que ficaram sem telefone_snapshot. O valor recuperado nao representa o
-- telefone observado no momento da saida; sua origem fica marcada de forma
-- explicita para auditoria. Nenhum snapshot existente pode ser sobrescrito.

alter table public.movimentacoes_admin
  add column if not exists telefone_snapshot_origem text;

comment on column public.movimentacoes_admin.telefone_snapshot_origem is
  'Origem excepcional do telefone_snapshot. cadastro_atual_backfill_2026_07 indica contato atual do cadastro, recuperado no backfill controlado de julho/2026; NULL nao foi preenchido por esse backfill.';

do $backfill_telefone_julho_2026$
declare
  v_ids_aprovados integer[] := array[
    3233, 3295, 3296, 3297, 3298, 3299, 3300, 3301, 3302, 3304,
    3305, 3306, 3308, 3311, 3320, 3334, 3362, 3365, 3366, 3367,
    3369, 3370, 3371
  ];
  v_ids_candidatos integer[];
  v_ids_marcados integer[];
  v_candidatas integer;
  v_atualizadas integer;
begin
  select
    count(*)::integer,
    array_agg(m.id order by m.id)
  into v_candidatas, v_ids_candidatos
  from public.movimentacoes_admin as m
  join public.alunos as a on a.id = m.aluno_id
  where m.tipo in ('evasao', 'nao_renovacao')
    and m.data >= date '2026-07-01'
    and m.data < date '2026-08-01'
    and nullif(btrim(m.telefone_snapshot), '') is null
    and coalesce(
      nullif(btrim(a.whatsapp), ''),
      nullif(btrim(a.telefone), '')
    ) is not null
    and public.is_movimentacao_admin_retencao_valida(m.id) is true;

  select array_agg(m.id order by m.id)
  into v_ids_marcados
  from public.movimentacoes_admin as m
  where m.telefone_snapshot_origem = 'cadastro_atual_backfill_2026_07';

  if v_candidatas = 0 and v_ids_marcados = v_ids_aprovados then
    raise notice 'backfill de telefone de julho/2026 ja aplicado nas 23 movimentacoes aprovadas';
    return;
  end if;

  if v_candidatas <> 23 then
    raise exception
      'backfill de telefone de julho/2026 abortado: esperadas 23 candidatas, encontradas %',
      v_candidatas;
  end if;

  if v_ids_candidatos is distinct from v_ids_aprovados then
    raise exception
      'backfill de telefone de julho/2026 abortado: conjunto de IDs divergiu do preflight aprovado';
  end if;

  update public.movimentacoes_admin as m
  set
    telefone_snapshot = coalesce(
      nullif(btrim(a.whatsapp), ''),
      nullif(btrim(a.telefone), '')
    ),
    telefone_snapshot_origem = 'cadastro_atual_backfill_2026_07'
  from public.alunos as a
  where a.id = m.aluno_id
    and m.id = any(v_ids_aprovados)
    and m.tipo in ('evasao', 'nao_renovacao')
    and m.data >= date '2026-07-01'
    and m.data < date '2026-08-01'
    and nullif(btrim(m.telefone_snapshot), '') is null
    and coalesce(
      nullif(btrim(a.whatsapp), ''),
      nullif(btrim(a.telefone), '')
    ) is not null
    and public.is_movimentacao_admin_retencao_valida(m.id) is true;

  get diagnostics v_atualizadas = row_count;

  if v_atualizadas <> 23 then
    raise exception
      'backfill de telefone de julho/2026 abortado: esperadas 23 atualizacoes, executadas %',
      v_atualizadas;
  end if;

  select array_agg(m.id order by m.id)
  into v_ids_marcados
  from public.movimentacoes_admin as m
  where m.telefone_snapshot_origem = 'cadastro_atual_backfill_2026_07'
    and nullif(btrim(m.telefone_snapshot), '') is not null;

  if v_ids_marcados is distinct from v_ids_aprovados then
    raise exception
      'backfill de telefone de julho/2026 abortado: marcacao final de proveniencia divergiu dos 23 IDs aprovados';
  end if;

  raise notice 'backfill de telefone de julho/2026 concluido: 23 movimentacoes atualizadas';
end;
$backfill_telefone_julho_2026$;
