-- Rollback de 20260929160000: remove o bloco "Janela do preview" do revalidador do lote.
do $rb$
declare
  v_def text := pg_get_functiondef('public.sol_caixa_validar_multi_aluno_snapshot_v1(uuid,jsonb,numeric,date)'::regprocedure);
  v_ini int := position(E'\n  -- Janela do preview (29/09/2026)' in v_def);
  v_fim int;
begin
  if v_ini = 0 then raise notice 'nada a reverter'; return; end if;
  v_fim := position(E'\n  end;\n' in substring(v_def from v_ini)) + v_ini - 1 + length(E'\n  end;\n');
  v_def := substring(v_def from 1 for v_ini - 1) || substring(v_def from v_fim);
  execute v_def;
end
$rb$;
