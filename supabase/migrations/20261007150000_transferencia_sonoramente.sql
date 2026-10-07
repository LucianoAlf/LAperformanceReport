-- Transferência para o Sonoramente (núcleo de inclusão, 07/10/2026).
--
-- O Sonoramente NÃO está no Emusys. O aluno que migra chega aqui como evasão comum
-- (webhook de finalização) e não existe matrícula de destino para marcar, então a
-- transferência entre unidades (que marca o DESTINO como TRANSFERENCIA) não se aplica.
-- Aqui a transferência marca a ORIGEM:
--   1. aluno_transferencias aceita destino externo ('sonoramente') no lugar de unidade;
--   2. registrar_transferencia_sonoramente_v1 grava a transferência e marca as evasões
--      da pessoa na unidade (±60 dias) com tipo_evasao = 'transferencia';
--   3. gatilho em movimentacoes_admin marca a evasão que chegar DEPOIS do registro;
--   4. "transferência não é evasão" passa a valer nos KPIs ao vivo, no fechamento
--      (dados_mensais) e no helper por id (pesquisa de evasão, score do professor,
--      relatório de coordenação, trigger de dados_mensais). Antes só o relatório mensal
--      (classificar_saidas_churn_v1) excluía. Vale também para transferência entre unidades.
--
-- Custo/dia: desprezível. O predicado é IMMUTABLE e só compara texto; o gatilho faz um
-- EXISTS indexado (aluno_transferencias tem poucas linhas) apenas em INSERT/UPDATE de
-- evasão. Mês fechado não é tocado (sync_evasao_to_dados_mensais respeita competência).

begin;

-- 1. Destino externo ---------------------------------------------------------------
alter table public.aluno_transferencias
  alter column unidade_destino_id drop not null;

alter table public.aluno_transferencias
  add column if not exists destino_externo text;

alter table public.aluno_transferencias
  drop constraint if exists aluno_transferencias_destino_externo_valido;
alter table public.aluno_transferencias
  add constraint aluno_transferencias_destino_externo_valido
  check (destino_externo is null or destino_externo in ('sonoramente'));

alter table public.aluno_transferencias
  drop constraint if exists aluno_transferencias_um_destino;
alter table public.aluno_transferencias
  add constraint aluno_transferencias_um_destino
  check ((unidade_destino_id is null) <> (destino_externo is null));

create unique index if not exists aluno_transferencias_unica_externa
  on public.aluno_transferencias (aluno_id, destino_externo, data_transferencia)
  where destino_externo is not null;

create index if not exists idx_aluno_transferencias_externo
  on public.aluno_transferencias (destino_externo, unidade_origem_id)
  where destino_externo is not null;

comment on column public.aluno_transferencias.destino_externo is
  'Destino fora do Emusys (hoje só ''sonoramente''). Exclusivo com unidade_destino_id. '
  'Nesse caso quem carrega a transferência é a EVASÃO da origem (tipo_evasao=transferencia), '
  'não uma matrícula de destino.';

-- 2. Predicado único "esta saída é transferência?" --------------------------------
create or replace function public.movimentacao_saida_e_transferencia_v1(
  p_tipo_evasao text,
  p_motivo text
)
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(p_tipo_evasao, '') ilike '%transfer%'
      or coalesce(p_motivo, '') ilike '%transfer%';
$$;

comment on function public.movimentacao_saida_e_transferencia_v1(text, text) is
  'Fonte única: saída (evasão/não renovação) que é transferência não conta como evasão '
  'nem churn. Mesma régua textual de classificar_saidas_churn_v1.';

revoke all on function public.movimentacao_saida_e_transferencia_v1(text, text) from public, anon;
grant execute on function public.movimentacao_saida_e_transferencia_v1(text, text)
  to authenticated, service_role;

-- 3. Helper por id: pesquisa de evasão, score do professor, coordenação, dados_mensais
create or replace function public.is_movimentacao_admin_retencao_valida(p_movimentacao_id integer)
returns boolean
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  SELECT COALESCE(
    public.movimentacao_conta_nos_kpis_v1(
      COALESCE(m.curso_id, a.curso_id),
      a.tipo_matricula_id
    ),
    true
  )
  AND NOT (
    m.tipo IN ('evasao', 'nao_renovacao')
    AND public.movimentacao_saida_e_transferencia_v1(m.tipo_evasao, m.motivo)
  )
  FROM public.movimentacoes_admin m
  LEFT JOIN public.alunos a ON a.id = m.aluno_id
  WHERE m.id = p_movimentacao_id;
$function$;

-- 4. KPIs ao vivo e fechamento: replace com guarda (âncora única, medida antes) -------
do $$
declare
  v_def text;
  v_ancora text;
  v_novo text;
  v_n int;
begin
  -- get_kpis_alunos_canonicos_base_p01q (evasoes_live)
  v_def := pg_get_functiondef('public.get_kpis_alunos_canonicos_base_p01q(uuid,integer,integer)'::regprocedure);
  v_ancora := 'AND public.movimentacao_conta_nos_kpis_v1(COALESCE(ma.curso_id, aluno_mov.curso_id), aluno_mov.tipo_matricula_id)';
  v_n := (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora);
  if v_n <> 1 then
    raise exception 'p01q: ancora esperava 1 ocorrencia, achou %', v_n;
  end if;
  v_novo := replace(v_def, v_ancora,
    v_ancora || E'\n          AND NOT public.movimentacao_saida_e_transferencia_v1(ma.tipo_evasao, ma.motivo)');
  execute v_novo;

  -- recalcular_dados_mensais_unguarded (v_evasoes)
  v_def := pg_get_functiondef('public.recalcular_dados_mensais_unguarded(integer,integer,uuid)'::regprocedure);
  v_ancora := 'AND public.movimentacao_conta_nos_kpis_v1(COALESCE(m.curso_id, aluno_mov.curso_id), aluno_mov.tipo_matricula_id)';
  v_n := (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora);
  if v_n <> 1 then
    raise exception 'recalcular_dados_mensais: ancora esperava 1 ocorrencia, achou %', v_n;
  end if;
  v_novo := replace(v_def, v_ancora,
    v_ancora || E'\n      AND NOT public.movimentacao_saida_e_transferencia_v1(m.tipo_evasao, m.motivo)');
  execute v_novo;
end;
$$;

-- 5. Evasão que chega DEPOIS do registro da transferência --------------------------
create or replace function public.fn_marcar_evasao_transferida_sonoramente()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.tipo not in ('evasao', 'nao_renovacao')
     or new.aluno_id is null
     or coalesce(new.tipo_evasao, '') = 'transferencia' then
    return new;
  end if;

  if exists (
    select 1
    from public.aluno_transferencias t
    join public.vw_aluno_pessoa_chave vt on vt.aluno_id = t.aluno_id
    join public.vw_aluno_pessoa_chave vm on vm.aluno_id = new.aluno_id
    where t.destino_externo = 'sonoramente'
      and t.unidade_origem_id = new.unidade_id
      and vt.unidade_id = vm.unidade_id
      and vt.pessoa_chave = vm.pessoa_chave
      and abs(new.data - t.data_transferencia) <= 60
  ) then
    new.tipo_evasao := 'transferencia';
  end if;

  return new;
end;
$$;

revoke all on function public.fn_marcar_evasao_transferida_sonoramente() from public, anon, authenticated;

drop trigger if exists trg_marcar_evasao_transferida_sonoramente on public.movimentacoes_admin;
create trigger trg_marcar_evasao_transferida_sonoramente
  before insert or update of tipo, aluno_id, data, unidade_id
  on public.movimentacoes_admin
  for each row execute function public.fn_marcar_evasao_transferida_sonoramente();

-- 6. RPC do botão --------------------------------------------------------------------
create or replace function public.registrar_transferencia_sonoramente_v1(
  p_aluno_id bigint,
  p_data date,
  p_observacao text default null
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_aluno record;
  v_pessoa text;
  v_transf_id bigint;
  v_ids integer[];
begin
  if p_aluno_id is null or p_data is null then
    raise exception 'aluno e data sao obrigatorios' using errcode = '22023';
  end if;

  -- RLS de alunos vale aqui (security invoker): quem não enxerga o aluno não transfere.
  select a.id, a.unidade_id, a.nome into v_aluno
  from public.alunos a where a.id = p_aluno_id;
  if not found then
    raise exception 'aluno % nao encontrado ou fora do seu escopo', p_aluno_id using errcode = 'P0002';
  end if;

  select v.pessoa_chave into v_pessoa
  from public.vw_aluno_pessoa_chave v where v.aluno_id = p_aluno_id;

  insert into public.aluno_transferencias
    (aluno_id, unidade_origem_id, unidade_destino_id, destino_externo, data_transferencia, observacao, created_by)
  values
    (p_aluno_id, v_aluno.unidade_id, null, 'sonoramente', p_data, nullif(btrim(p_observacao), ''), auth.uid())
  on conflict (aluno_id, destino_externo, data_transferencia) where destino_externo is not null
  do update set observacao = coalesce(excluded.observacao, aluno_transferencias.observacao),
                updated_at = now()
  returning id into v_transf_id;

  -- Evasões já lançadas da mesma pessoa na unidade (todos os cursos dela).
  with alvo as (
    select m.id
    from public.movimentacoes_admin m
    left join public.vw_aluno_pessoa_chave vm on vm.aluno_id = m.aluno_id
    where m.unidade_id = v_aluno.unidade_id
      and m.tipo in ('evasao', 'nao_renovacao')
      and abs(m.data - p_data) <= 60
      and coalesce(m.tipo_evasao, '') <> 'transferencia'
      and (
        m.aluno_id = p_aluno_id
        or (v_pessoa is not null and vm.pessoa_chave = v_pessoa)
      )
  ), upd as (
    update public.movimentacoes_admin m
       set tipo_evasao = 'transferencia'
      from alvo
     where m.id = alvo.id
    returning m.id
  )
  select coalesce(array_agg(id order by id), '{}') into v_ids from upd;

  return jsonb_build_object(
    'transferencia_id', v_transf_id,
    'aluno_id', p_aluno_id,
    'unidade_origem_id', v_aluno.unidade_id,
    'evasoes_marcadas', coalesce(array_length(v_ids, 1), 0),
    'movimentacao_ids', to_jsonb(v_ids)
  );
end;
$$;

revoke all on function public.registrar_transferencia_sonoramente_v1(bigint, date, text) from public, anon;
grant execute on function public.registrar_transferencia_sonoramente_v1(bigint, date, text)
  to authenticated, service_role;

comment on function public.registrar_transferencia_sonoramente_v1(bigint, date, text) is
  'Botão "Transferência → Sonoramente" (Administrativo). Grava aluno_transferencias com '
  'destino_externo=sonoramente e marca as evasões da pessoa na unidade (±60 dias) como '
  'tipo_evasao=transferencia. Evasão que chegar depois é marcada pelo gatilho '
  'trg_marcar_evasao_transferida_sonoramente.';

commit;
