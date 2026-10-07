-- Transferência ENTRE unidades não é evasão (07/10/2026, REGRAS-DE-NEGOCIO §5.1).
--
-- Até aqui a transferência entre unidades marcava só o DESTINO (matrícula TRANSFERENCIA,
-- fora de "matrícula nova"); a evasão da ORIGEM continuava contando, porque a regra só
-- reconhecia o texto "transfer" e o Emusys manda o motivo "Troca de Unidade". Medido em
-- 07/10: as 4 saídas com esse motivo (Arthur/REC mai, Ana Beatriz/REC jul, Erica/CG ago,
-- Isadora/BAR out) são de pessoas ativas em outra unidade, e as transferências registradas
-- pelo botão (Erica, Isadora) têm exatamente essas evasões na origem.
--
-- 1. movimentacao_saida_e_transferencia_v1 reconhece "Troca de Unidade".
-- 2. classificar_saidas_churn_v1 (relatório mensal) passa a usar a regra única, em vez
--    da própria comparação textual.
-- 3. O gatilho de marcação passa a cobrir também a transferência entre unidades: evasão
--    na origem com o mesmo nome do aluno transferido, ±60 dias, ganha
--    tipo_evasao='transferencia'. Sonoramente segue por pessoa (pessoa_chave).
-- 4. RPC marcar_evasao_origem_transferencia_v1(transferencia_id): o botão chama depois de
--    registrar, para marcar a evasão que já existe.
--
-- Efeito no passado: as 4 saídas acima deixam de contar nos cálculos AO VIVO. Fechamento
-- gravado (dados_mensais de mês fechado, snapshots) não é reescrito.
-- Custo/dia: desprezível (texto IMMUTABLE; EXISTS em tabela de poucas linhas só em
-- INSERT/UPDATE de evasão).

begin;

-- 1. Regra única ----------------------------------------------------------------------
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
      or coalesce(p_motivo, '') ilike '%transfer%'
      or coalesce(p_motivo, '') ilike '%troca de unidade%';
$$;

comment on function public.movimentacao_saida_e_transferencia_v1(text, text) is
  'Fonte única: saída (evasão/não renovação) que é transferência não conta como evasão '
  'nem churn. Transferência = tipo_evasao ou motivo com "transfer", ou motivo '
  '"Troca de Unidade" (Emusys). Espelho no front: isSaidaTransferencia '
  '(src/lib/administrativoTransferencias.ts).';

-- 2. Relatório mensal usa a regra única -----------------------------------------------
do $$
declare
  v_def text;
  v_ancora text := E'when lower(unaccent(coalesce(m.tipo_evasao, \'\'))) like \'%transfer%\'\n          or lower(unaccent(coalesce(m.motivo, \'\'))) like \'%transfer%\' then \'transferencia\'';
  v_n int;
begin
  v_def := pg_get_functiondef('public.classificar_saidas_churn_v1(uuid,integer,integer)'::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora);
  if v_n <> 1 then
    raise exception 'classificar_saidas_churn_v1: ancora esperava 1 ocorrencia, achou %', v_n;
  end if;
  execute replace(v_def, v_ancora,
    'when public.movimentacao_saida_e_transferencia_v1(m.tipo_evasao, m.motivo) then ''transferencia''');
end;
$$;

-- 3. Gatilho cobre Sonoramente e transferência entre unidades -------------------------
create or replace function public.fn_marcar_evasao_como_transferencia()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.tipo not in ('evasao', 'nao_renovacao')
     or coalesce(new.tipo_evasao, '') = 'transferencia' then
    return new;
  end if;

  -- Sonoramente: mesma pessoa (unidade + pessoa_chave) da transferência registrada.
  if new.aluno_id is not null and exists (
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
    return new;
  end if;

  -- Entre unidades: a transferência aponta para a matrícula do DESTINO, cuja pessoa_chave
  -- é de outra base do Emusys (emusys_student_id é numerado por unidade). O elo com a
  -- origem é o nome, numa janela curta e com origem declarada por quem registrou.
  if exists (
    select 1
    from public.aluno_transferencias t
    join public.alunos ad on ad.id = t.aluno_id
    where t.unidade_destino_id is not null
      and t.unidade_origem_id = new.unidade_id
      and lower(btrim(ad.nome)) = lower(btrim(coalesce(new.aluno_nome, '')))
      and abs(new.data - t.data_transferencia) <= 60
  ) then
    new.tipo_evasao := 'transferencia';
  end if;

  return new;
end;
$$;

revoke all on function public.fn_marcar_evasao_como_transferencia() from public, anon, authenticated;

drop trigger if exists trg_marcar_evasao_transferida_sonoramente on public.movimentacoes_admin;
drop function if exists public.fn_marcar_evasao_transferida_sonoramente();

drop trigger if exists trg_marcar_evasao_como_transferencia on public.movimentacoes_admin;
create trigger trg_marcar_evasao_como_transferencia
  before insert or update of tipo, aluno_id, aluno_nome, data, unidade_id
  on public.movimentacoes_admin
  for each row execute function public.fn_marcar_evasao_como_transferencia();

-- 4. RPC do botão (transferência entre unidades) -------------------------------------
create or replace function public.marcar_evasao_origem_transferencia_v1(p_transferencia_id bigint)
returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_t record;
  v_ids integer[];
begin
  select t.id, t.unidade_origem_id, t.unidade_destino_id, t.data_transferencia, a.nome
    into v_t
  from public.aluno_transferencias t
  join public.alunos a on a.id = t.aluno_id
  where t.id = p_transferencia_id;

  if not found then
    raise exception 'transferencia % nao encontrada ou fora do seu escopo', p_transferencia_id using errcode = 'P0002';
  end if;
  if v_t.unidade_origem_id is null or v_t.unidade_destino_id is null then
    return jsonb_build_object('transferencia_id', p_transferencia_id, 'evasoes_marcadas', 0,
      'motivo', 'sem_origem_ou_destino_externo');
  end if;

  with upd as (
    update public.movimentacoes_admin m
       set tipo_evasao = 'transferencia'
     where m.unidade_id = v_t.unidade_origem_id
       and m.tipo in ('evasao', 'nao_renovacao')
       and lower(btrim(coalesce(m.aluno_nome, ''))) = lower(btrim(v_t.nome))
       and abs(m.data - v_t.data_transferencia) <= 60
       and coalesce(m.tipo_evasao, '') <> 'transferencia'
    returning m.id
  )
  select coalesce(array_agg(id order by id), '{}') into v_ids from upd;

  return jsonb_build_object(
    'transferencia_id', p_transferencia_id,
    'evasoes_marcadas', coalesce(array_length(v_ids, 1), 0),
    'movimentacao_ids', to_jsonb(v_ids)
  );
end;
$$;

revoke all on function public.marcar_evasao_origem_transferencia_v1(bigint) from public, anon;
grant execute on function public.marcar_evasao_origem_transferencia_v1(bigint) to authenticated, service_role;

comment on function public.marcar_evasao_origem_transferencia_v1(bigint) is
  'Botão "Transferência" entre unidades: marca a evasão da ORIGEM (mesmo nome do aluno '
  'transferido, ±60 dias) com tipo_evasao=transferencia, para não contar como evasão. '
  'Evasão que chegar depois é marcada por trg_marcar_evasao_como_transferencia.';

commit;
