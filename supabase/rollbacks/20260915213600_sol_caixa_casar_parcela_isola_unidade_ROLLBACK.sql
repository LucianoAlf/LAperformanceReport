-- Rollback estrutural do escopo por unidade. Use somente se a migration
-- 20260915213600 precisar ser revertida; restaura exatamente as tres leituras
-- antigas, inclusive o risco cross-unit que motivou a correcao.

begin;

do $rollback$
declare
  v_def text := replace(pg_get_functiondef(
    'public.sol_caixa_casar_parcela(uuid,text,numeric,text)'::regprocedure), chr(13), '');
  v_unscoped text := 'where f\.emusys_student_id = v_alu\.emusys_student_id::bigint';
  v_scoped text := 'where f\.unidade_id = p_unidade_id[[:space:]]+and f\.emusys_student_id = v_alu\.emusys_student_id::bigint';
  v_n_unscoped integer;
  v_n_scoped integer;
  v_new text;
begin
  v_n_unscoped := regexp_count(v_def, v_unscoped);
  v_n_scoped := regexp_count(v_def, v_scoped);

  if v_n_unscoped = 3 and v_n_scoped = 0 then
    raise notice 'rollback casar_parcela/unidade ja aplicado';
    return;
  end if;
  if v_n_scoped <> 3 or v_n_unscoped <> 0 then
    raise exception 'ANCORA rollback casar_parcela/unidade: esperava 3 com escopo e 0 sem escopo; achei % e %',
      v_n_scoped, v_n_unscoped;
  end if;

  v_new := regexp_replace(
    v_def,
    v_scoped,
    'where f.emusys_student_id = v_alu.emusys_student_id::bigint',
    'g'
  );

  if regexp_count(v_new, v_scoped) <> 0
     or regexp_count(v_new, v_unscoped) <> 3 then
    raise exception 'GUARDA rollback casar_parcela/unidade: transformacao incompleta; abortado';
  end if;

  execute v_new;
end
$rollback$;

revoke execute on function public.sol_caixa_casar_parcela(uuid,text,numeric,text)
  from public, anon, authenticated;
grant execute on function public.sol_caixa_casar_parcela(uuid,text,numeric,text)
  to service_role, sol_acesso_restrito;

commit;
