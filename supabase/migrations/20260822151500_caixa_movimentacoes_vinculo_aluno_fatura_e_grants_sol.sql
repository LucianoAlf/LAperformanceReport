-- Vínculo estruturado aluno/fatura no caixa + grants pendentes da auditoria de 22/08.
-- Decisão do Alf, 2026-08-22.
--
-- 1) `caixa_movimentacoes` ganha `aluno_id` e `fatura_id` (nullable, FK ON DELETE SET
--    NULL). Até aqui o vínculo existia SÓ como texto na descrição ("Parcela 5/12 - Laura
--    Sobreira…"), o que impedia reconciliar caixa × Emusys e responder "essa fatura foi
--    lançada no caixa?". SET NULL porque `alunos` sofre DELETE legítimo (arquivamento →
--    `alunos_arquivados`) e o Emusys apaga/recria fatura ao editar parcela.
--
-- 2) As DUAS funções de lançamento passam a gravar o vínculo, lendo do payload/resolver:
--    - `sol_caixa_lancar_recebimento`: lê `aluno_id`/`fatura_id` do payload (a Sol já os
--      tem — `casar_parcela` devolve os dois). Vínculo inválido vira NULL e NÃO derruba o
--      lançamento (é metadado, não gate) — validado contra a unidade para não gravar
--      vínculo de outra escola (ids do Emusys são por unidade).
--    - `sol_caixa_lancar_recebimento_lote_v1`: usa `aluno_id` + `canonical_fatura_id` que
--      o resolver devolve por item (`canonical_fatura_id` É `emusys_faturas.id` — provado
--      em 22/08 com a fatura d47eb2df do João Victor). O resolver ganha `aluno_id` no
--      retorno (tinha só o nome).
--    ⚠️ Nenhuma assinatura muda (as duas recebem `p_payload jsonb`) — zero risco do
--    overload órfão de `upsert_lead` (post-mortem 2026-08-12). Payload antigo sem os
--    campos novos segue funcionando igual (grava NULL).
--
-- 3) Grants que faltavam (auditoria 22/08):
--    - `sol_caixa_corrigir_forma_recebimento`: entrada EXTERNA da Sol (corrige a forma de
--      um lançamento dela na janela de 1 dia; valida ator por dentro) e não tinha grant
--      para papel nenhum da Sol — inutilizável. Ganha `sol_acesso_restrito`, o mesmo
--      papel das demais de escrita.
--    - `sol_caixa_autorizar_payload_v1`: já funciona por dentro das 4 chamadoras
--      (SECURITY DEFINER), ganha o grant por consistência com as irmãs de autorização
--      (`ator_ok`/`grupo_operacao_ok`) e para preview direto.
--    - `sol_caixa_recalcular_cofre` fica SEM grant DE PROPÓSITO: é utilitária interna de
--      escrita (chamada por corrigir/estornar movimento), ninguém externo chama — menor
--      privilégio. Não é bug.

-- ── 1. Colunas + FKs + índices ──────────────────────────────────────────────
alter table public.caixa_movimentacoes
  add column if not exists aluno_id integer references public.alunos(id) on delete set null,
  add column if not exists fatura_id uuid references public.emusys_faturas(id) on delete set null;

create index if not exists idx_caixa_movimentacoes_aluno
  on public.caixa_movimentacoes (aluno_id) where aluno_id is not null;
create index if not exists idx_caixa_movimentacoes_fatura
  on public.caixa_movimentacoes (fatura_id) where fatura_id is not null;

comment on column public.caixa_movimentacoes.aluno_id is
  'Vínculo estruturado com alunos.id, gravado pela Sol no lançamento (2026-08-22). NULL em lançamentos antigos e nos sem aluno (saída, cofre).';
comment on column public.caixa_movimentacoes.fatura_id is
  'Vínculo com emusys_faturas.id (= canonical_fatura_id do envelope canônico). ON DELETE SET NULL porque o Emusys apaga/recria fatura ao editar parcela.';

-- ── 2. Funções de lançamento gravam o vínculo ───────────────────────────────
do $mig$
declare
  v_def text;
  v_new text;
begin
  -- 2a. resolver ganha aluno_id no retorno por item
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'sol_caixa_resolver_multi_aluno_v1';

  if position($$'aluno_id', v_alu.id,$$ in v_def) = 0 then
    v_new := replace(v_def,
      $$'aluno_nome', v_alu.nome,
      'responsavel_financeiro', v_alu.responsavel_nome,$$,
      $$'aluno_nome', v_alu.nome,
      'aluno_id', v_alu.id,
      'responsavel_financeiro', v_alu.responsavel_nome,$$);
    if v_new = v_def then
      raise exception 'ancora do resolver nao encontrada — abortando';
    end if;
    execute v_new;
  end if;

  -- 2b. lançamento unitário: parse + validação por unidade + insert
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'sol_caixa_lancar_recebimento';

  if position('v_aluno_id' in v_def) = 0 then
    v_new := replace(v_def,
      $$v_respfin text := nullif(trim(coalesce(p_payload->>'responsavel_financeiro','')),'');$$,
      $$v_respfin text := nullif(trim(coalesce(p_payload->>'responsavel_financeiro','')),'');
  v_aluno_id integer := nullif(p_payload->>'aluno_id','')::integer;
  v_fatura_id uuid := nullif(p_payload->>'fatura_id','')::uuid;$$);

    -- vínculo inválido vira NULL (metadado, não gate); valida a UNIDADE do vínculo
    v_new := replace(v_new,
      $$insert into public.caixa_movimentacoes
    (caixa_diario_id, unidade_id, data_movimento, ambiente, tipo,$$,
      $$if v_aluno_id is not null and not exists (
    select 1 from public.alunos a where a.id = v_aluno_id and a.unidade_id = v_unidade
  ) then v_aluno_id := null; end if;
  if v_fatura_id is not null and not exists (
    select 1 from public.emusys_faturas f where f.id = v_fatura_id and f.unidade_id = v_unidade
  ) then v_fatura_id := null; end if;

  insert into public.caixa_movimentacoes
    (caixa_diario_id, unidade_id, data_movimento, ambiente, tipo,$$);

    v_new := replace(v_new,
      $$cartao_modalidade, cartao_parcelas)$$,
      $$cartao_modalidade, cartao_parcelas, aluno_id, fatura_id)$$);
    v_new := replace(v_new,
      $$v_resp, v_modal, v_parc)$$,
      $$v_resp, v_modal, v_parc, v_aluno_id, v_fatura_id)$$);

    if v_new = v_def or position('v_aluno_id' in v_new) = 0 then
      raise exception 'ancoras do lancar_recebimento nao encontradas — abortando';
    end if;
    execute v_new;
  end if;

  -- 2c. lote: usa aluno_id e canonical_fatura_id do item do resolver
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'sol_caixa_lancar_recebimento_lote_v1';

  if position('aluno_id,fatura_id' in v_def) = 0 then
    v_new := replace(v_def,
      $$cartao_modalidade,cartao_parcelas) values(v_caixa,$$,
      $$cartao_modalidade,cartao_parcelas,aluno_id,fatura_id) values(v_caixa,$$);
    v_new := replace(v_new,
      $$nullif(p_payload->>'cartao_parcelas','')::int) returning id into v_mov;$$,
      $$nullif(p_payload->>'cartao_parcelas','')::int,nullif(v_item->>'aluno_id','')::integer,nullif(v_item->>'canonical_fatura_id','')::uuid) returning id into v_mov;$$);

    if v_new = v_def or position('aluno_id,fatura_id' in v_new) = 0 then
      raise exception 'ancoras do lote nao encontradas — abortando';
    end if;
    execute v_new;
  end if;
end $mig$;

-- ── 3. Grants ───────────────────────────────────────────────────────────────
-- Revoke nominal primeiro: ALTER DEFAULT PRIVILEGES do projeto dá EXECUTE a anon em
-- função nova (regra do CLAUDE.md — pegou 3 vezes).
revoke all on function public.sol_caixa_corrigir_forma_recebimento(jsonb) from public, anon, authenticated;
revoke all on function public.sol_caixa_autorizar_payload_v1(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.sol_caixa_recalcular_cofre(uuid) from public, anon, authenticated;

grant execute on function public.sol_caixa_corrigir_forma_recebimento(jsonb) to sol_acesso_restrito;
grant execute on function public.sol_caixa_autorizar_payload_v1(uuid, jsonb, text) to sol_acesso_restrito;
-- sol_caixa_recalcular_cofre: sem grant, de propósito (interna).
