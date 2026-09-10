-- Rollback executavel da guarda de estado terminal do preview V3.
-- Nao altera linhas do ledger: estados ja finalizados continuam como trilha
-- historica, mas a funcao nova deixa de existir e o validador volta ao corpo
-- imediatamente anterior, versionado no repositorio.

\set ON_ERROR_STOP on

drop function if exists public.sol_caixa_v3_finalizar_preview_v1(jsonb);
\ir ../migrations/20260821093045_sol_caixa_v3_validator_operacao_campos_grupo_ator.sql

do $conf$
begin
  if to_regprocedure('public.sol_caixa_v3_finalizar_preview_v1(jsonb)') is not null then
    raise exception 'ROLLBACK INCOMPLETO: finalizador V3 ainda existe';
  end if;
  if pg_get_functiondef('public.sol_caixa_v3_validar_approval_v1(jsonb,text)'::regprocedure)
       like '%preview_v3_nao_aberto%' then
    raise exception 'ROLLBACK INCOMPLETO: validador ainda tem guarda nova';
  end if;
  if has_function_privilege('anon',
       'public.sol_caixa_v3_validar_approval_v1(jsonb,text)','EXECUTE') then
    raise exception 'ROLLBACK INSEGURO: validador executavel por anon';
  end if;
  raise notice 'ROLLBACK OK — finalizador removido e validador anterior restaurado';
end;
$conf$;
