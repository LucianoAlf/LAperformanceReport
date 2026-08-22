-- Destrava as 3 funções do caixa da Sol que morriam com 42501 ("papel nao autorizado").
-- Decisão do Alf, 2026-08-22, após auditoria completa do módulo sol_caixa_*.
--
-- O PROBLEMA: `sol_caixa_parcela_canonica`, `sol_caixa_resolver_multi_aluno_v1` e
-- `sol_caixa_inadimplentes` chamam as RPCs canônicas financeiras DIRETO
-- (`get_faturas_alunos_financeiro_v1` / `get_inadimplencia_canonica`), e as canônicas têm
-- guard de papel que lê o claim do JWT — a conexão da Sol não tem claim, então 100% das
-- chamadas falham. Medido ao vivo em 2026-08-21: as 3 devolvem
-- "papel nao autorizado para consultar faturas/inadimplencia".
--
-- CONSEQUÊNCIA OPERACIONAL (vista nos grupos do financeiro em 21/08): o lançamento de
-- 2 alunos no mesmo comprovante não funciona — `sol_caixa_lancar_recebimento_lote_v1`
-- chama o resolver POR DENTRO, então o 42501 quebra leitura E escrita do multi-aluno.
-- Caso real: passaportes de João Victor + Pedro Victor (R$ 360 + R$ 360 = R$ 720, CG)
-- saíram como UM lançamento no Pedro, e a equipe teve que apontar ("Sol, são dois alunos").
--
-- A CORREÇÃO: trocar a chamada interna pelos wrappers que JÁ resolvem o claim
-- (`sol_faturas_alunos_v1` / `sol_inadimplencia_v1` — set_config service_role com restore,
-- assinatura idêntica, envelope idêntico). DRY: o padrão de JWT fica num lugar só.
-- Como as sol_caixa_* são SECURITY DEFINER, a chamada interna roda como owner — nenhum
-- grant novo é necessário.
--
-- ⚠️ As funções perdem o marcador STABLE: o wrapper faz set_config (volatile), e manter
-- STABLE numa função que muda estado de sessão é mentira pro planner. Sem efeito para a
-- Sol, que as chama em SELECT simples.

do $mig$
declare
  v_nome text;
  v_def text;
  v_new text;
begin
  foreach v_nome in array array[
    'sol_caixa_parcela_canonica',
    'sol_caixa_resolver_multi_aluno_v1',
    'sol_caixa_inadimplentes'
  ] loop
    select pg_get_functiondef(p.oid) into strict v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_nome;

    if position('sol_faturas_alunos_v1' in v_def) > 0
       or position('sol_inadimplencia_v1' in v_def) > 0 then
      raise notice '% ja usa wrapper — pulando', v_nome;
      continue;
    end if;

    v_new := replace(v_def,
      'public.get_faturas_alunos_financeiro_v1(',
      'public.sol_faturas_alunos_v1(');
    v_new := replace(v_new,
      'public.get_inadimplencia_canonica(',
      'public.sol_inadimplencia_v1(');
    v_new := replace(v_new,
      ' STABLE SECURITY DEFINER',
      ' SECURITY DEFINER');

    if v_new = v_def then
      raise exception 'nenhum replace surtiu efeito em % — abortando', v_nome;
    end if;

    execute v_new;
    raise notice '% destravada', v_nome;
  end loop;
end $mig$;
