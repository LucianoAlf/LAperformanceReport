-- RASCUNHO · NÃO APLICADA · aplicar é GATE HUMANO (Alf).
--
-- Caixa: o mesmo cheque (unidade + banco + número) não entra duas vezes
-- (auditoria de cheques 29/09/2026, defeito D1).
--
-- 🔴 Por quê. Reenviar o mesmo malote abria um segundo card e dois "pode" lançavam
--    tudo em dobro. O runtime da Sol agora barra em duas camadas (card e "pode",
--    PR fix/sol-cheques-malote), mas as duas são leitura-antes-de-escrever: dois
--    "pode" no mesmo segundo, ou uma escrita por outro caminho, ainda passam. Esta é
--    a trava que não depende do runtime.
--
-- ⚠️ Por que TRIGGER e não índice único parcial. O estorno da Sol NÃO apaga o
--    original: cria a movimentação inversa ("ESTORNO de <id> …", sem as colunas
--    cheque_*). Um índice único em (unidade_id, cheque_banco, cheque_numero) barraria
--    para sempre o relançamento legítimo de um cheque estornado. O trigger olha se o
--    original tem estorno.
-- ⚠️ Concorrência: pg_advisory_xact_lock na chave do cheque serializa dois inserts
--    do mesmo cheque; o segundo espera o primeiro commitar e então enxerga a linha.
-- ⚠️ Efeito no runtime: a RPC do lote é atômica; o erro aborta o lote INTEIRO
--    (nada parcial). A Sol responde "não consegui concluir a operação atômica".
--    A mensagem clara ("este cheque já está no caixa") continua sendo a do runtime,
--    que confere ANTES de chamar a RPC.
-- ⚠️ Escopo: só linhas com cheque_numero E cheque_banco preenchidos, tipo 'entrada'.
--    Lançamento manual pela tela (sem colunas cheque_*) não é afetado.
--
-- Pré-checagem (SELECT, 29/09/2026 via MCP somente leitura): 0 movimentações com
-- cheque_numero; 0 duplicatas. Refazer antes de aplicar:
--   select unidade_id, cheque_banco, cheque_numero, count(*)
--     from public.caixa_movimentacoes
--    where cheque_numero is not null and tipo = 'entrada'
--    group by 1,2,3 having count(*) > 1;          -- tem de voltar vazio
--
-- Rollback: 20260930090000_caixa_trava_cheque_duplicado_ROLLBACK.sql (mesma pasta).

begin;

create or replace function public.caixa_trava_cheque_duplicado_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_dono uuid;
begin
  if new.tipo is distinct from 'entrada'
     or nullif(trim(coalesce(new.cheque_numero, '')), '') is null
     or nullif(trim(coalesce(new.cheque_banco, '')), '') is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('caixa_cheque|' || new.unidade_id::text || '|' || lpad(trim(new.cheque_banco), 3, '0')
                     || '|' || trim(new.cheque_numero), 0));

  select m.id into v_dono
    from public.caixa_movimentacoes m
   where m.unidade_id = new.unidade_id
     and m.tipo = 'entrada'
     and lpad(trim(m.cheque_banco), 3, '0') = lpad(trim(new.cheque_banco), 3, '0')
     and trim(m.cheque_numero) = trim(new.cheque_numero)
     and m.id is distinct from new.id
     and not exists (
       select 1 from public.caixa_movimentacoes e
        where e.unidade_id = m.unidade_id
          and e.categoria = 'estorno'
          and e.descricao like 'ESTORNO de ' || m.id::text || '%')
   limit 1;

  if v_dono is not null then
    raise exception 'cheque_ja_no_caixa: banco % nº % já lançado (movimentação %)',
      new.cheque_banco, new.cheque_numero, v_dono
      using errcode = '23505';
  end if;
  return new;
end;
$function$;

revoke all on function public.caixa_trava_cheque_duplicado_v1() from public, anon, authenticated;

drop trigger if exists trg_caixa_trava_cheque_duplicado on public.caixa_movimentacoes;
create trigger trg_caixa_trava_cheque_duplicado
  before insert or update of cheque_numero, cheque_banco, unidade_id, tipo
  on public.caixa_movimentacoes
  for each row execute function public.caixa_trava_cheque_duplicado_v1();

-- Índice de apoio (a busca do trigger não varre a tabela).
create index if not exists idx_caixa_mov_cheque_unidade
  on public.caixa_movimentacoes (unidade_id, cheque_numero)
  where cheque_numero is not null;

-- Prova (dentro da transação): o trigger existe.
do $prova$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_caixa_trava_cheque_duplicado' and not tgisinternal) then
    raise exception 'PROVA: trigger ausente';
  end if;
end $prova$;

commit;

-- Teste manual sugerido (transação desfeita, com caixa aberto de teste):
--   begin;
--     insert into caixa_movimentacoes (..., tipo, cheque_numero, cheque_banco, ...) values (..., 'entrada', '000123', '237', ...);
--     insert into caixa_movimentacoes (..., tipo, cheque_numero, cheque_banco, ...) values (..., 'entrada', '000123', '237', ...);
--     -- espera: ERROR cheque_ja_no_caixa
--   rollback;
