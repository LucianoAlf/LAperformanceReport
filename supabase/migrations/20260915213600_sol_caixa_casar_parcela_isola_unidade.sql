-- Bernardo/Barra, 15/09/2026: o aluno e a fatura da Barra foram encontrados,
-- mas `sol_caixa_casar_parcela` contou tambem as faturas de outra unidade cujo
-- `emusys_student_id` coincidia. IDs do Emusys sao locais ao token/escola; sem
-- `unidade_id`, a RPC inventava "mais de uma parcela aberta" e podia ate
-- selecionar a fatura de Campo Grande quando a da Barra mudava para paga.
--
-- O patch e deliberadamente estreito: adiciona o escopo da unidade nas tres
-- leituras de `emusys_faturas` da funcao viva. Nenhuma regra de valor, status,
-- fuzzy, competencia ou permissao e reimplementada aqui.

begin;

do $mig$
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

  if v_n_unscoped = 0 and v_n_scoped = 3 then
    raise notice 'sol_caixa_casar_parcela ja esta isolada por unidade';
    return;
  end if;
  if v_n_unscoped <> 3 or v_n_scoped <> 0 then
    raise exception 'ANCORA casar_parcela/unidade: esperava 3 sem escopo e 0 com escopo; achei % e %',
      v_n_unscoped, v_n_scoped;
  end if;

  v_new := regexp_replace(
    v_def,
    v_unscoped,
    'where f.unidade_id = p_unidade_id' || chr(10)
      || '    and f.emusys_student_id = v_alu.emusys_student_id::bigint',
    'g'
  );

  if regexp_count(v_new, v_unscoped) <> 0
     or regexp_count(v_new, v_scoped) <> 3 then
    raise exception 'GUARDA casar_parcela/unidade: transformacao incompleta; abortado antes de executar';
  end if;

  execute v_new;
end
$mig$;

-- CREATE OR REPLACE preserva ACL, mas estas revogacoes mantem o contrato
-- fail-closed mesmo se o default privilege do schema mudar no futuro.
revoke execute on function public.sol_caixa_casar_parcela(uuid,text,numeric,text)
  from public, anon, authenticated;
grant execute on function public.sol_caixa_casar_parcela(uuid,text,numeric,text)
  to service_role, sol_acesso_restrito;

comment on function public.sol_caixa_casar_parcela(uuid,text,numeric,text) is
  'Casa aluno/fatura por unidade. emusys_student_id e namespaced por escola; todas as leituras de emusys_faturas exigem unidade_id.';

commit;
