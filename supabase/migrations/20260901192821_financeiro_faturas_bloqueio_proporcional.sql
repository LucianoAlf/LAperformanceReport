-- LAPE-13: o financeiro do gerencial estava bloqueado por sinais que NAO sao defeito.
--
-- Antes: source_missing > 0 OR validation_issue > 0 OR duplicate > 0 OR unknown_status > 0
--        => status 'incomplete', tem_dados = false, totais = {}.
--
-- Medido em 01/09/2026 (julho e agosto, 3 unidades):
--   * TODOS os validation_issues sao `invalid_optional_identifier` com matricula_id/contrato_id = "0"
--     (Barra 22, CG 114, Recreio 14). Comportamento NORMAL e documentado do Emusys: cobranca que nao
--     pertence a matricula (passaporte avulso, ingresso, locacao, produto) vem com matricula_id: 0,
--     e o identifier() de _shared/faturasSync.ts converte para NULL de proposito.
--   * Os source_missing (32 em agosto) sao faturas REAIS removidas/substituidas na origem -
--     verificado na API: parcela reagendada (Heitor 43503 -> 43504, venc. 05/08 -> 05/09),
--     cobranca cancelada (Maria Eduarda), matricula excluida no Emusys (Barra 835/838).
--     Sinal legitimo, mas ja EXCLUIDO do calculo pelo `where i.source_missing is false`.
--
-- Contradicao corrigida: os dois sinais ja eram descartados da conta e mesmo assim impediam a conta
-- de ser feita, zerando o financeiro das 3 unidades. Efeito pratico: ninguem tinha financeiro nenhum.
--
-- Depois: bloqueiam apenas stale, duplicata, status desconhecido e validation_issue que NAO seja o
-- identificador opcional ausente. source_missing vira AVISO em `integrity`, com recorte ativo/saiu
-- (evadido/trancado/arquivado e ruido esperado; aluno ativo merece olhar).
--
-- Nenhum VALOR muda: os agregados ja usam `filter (where eh_parcela)` e a base ja filtra
-- `source_missing is false`. A funcao apenas volta a entregar o que ja calculava.
--
-- Aprovado por Luciano em 01/09/2026.

do $$
declare
  v_def text;
  v_ocorr integer;

  c_decl_de constant text :=
'  v_source_missing_count integer := 0;
  v_validation_issue_count integer := 0;';

  c_decl_para constant text :=
'  v_source_missing_count integer := 0;
  v_source_missing_ativo integer := 0;
  v_source_missing_saiu integer := 0;
  v_validation_issue_count integer := 0;
  v_validation_issue_bloqueante integer := 0;';

  c_calc_de constant text :=
'  select
    (count(*) filter (where i.source_missing is true))::integer,
    coalesce(sum(
      case
        when i.payload #> ''{_la_report,validation_issues}'' is null then 0
        when jsonb_typeof(i.payload #> ''{_la_report,validation_issues}'') = ''array''
          then jsonb_array_length(i.payload #> ''{_la_report,validation_issues}'')
        else 1
      end
    ), 0)::integer,
    (select count(*)::integer from duplicatas),
    (count(*) filter (where i.status not in (''aberta'', ''paga'', ''cancelada'')))::integer
  into
    v_source_missing_count,
    v_validation_issue_count,
    v_duplicate_fatura_count,
    v_unknown_status_count
  from itens_escopo i;';

  c_calc_para constant text :=
'  select
    (count(*) filter (where i.source_missing is true))::integer,
    (count(*) filter (
      where i.source_missing is true
        and exists (
          select 1
          from public.alunos a
          where a.unidade_id = i.unidade_id
            and btrim(a.emusys_matricula_id) = i.emusys_matricula_id::text
            and a.status = ''ativo''
        )
    ))::integer,
    (count(*) filter (
      where i.source_missing is true
        and not exists (
          select 1
          from public.alunos a
          where a.unidade_id = i.unidade_id
            and btrim(a.emusys_matricula_id) = i.emusys_matricula_id::text
            and a.status = ''ativo''
        )
    ))::integer,
    coalesce(sum(
      case
        when i.payload #> ''{_la_report,validation_issues}'' is null then 0
        when jsonb_typeof(i.payload #> ''{_la_report,validation_issues}'') = ''array''
          then jsonb_array_length(i.payload #> ''{_la_report,validation_issues}'')
        else 1
      end
    ), 0)::integer,
    coalesce(sum(
      case
        when i.payload #> ''{_la_report,validation_issues}'' is null then 0
        when jsonb_typeof(i.payload #> ''{_la_report,validation_issues}'') = ''array'' then (
          select count(*)
          from jsonb_array_elements(i.payload #> ''{_la_report,validation_issues}'') vi
          where not (
            vi->>''code'' = ''invalid_optional_identifier''
            and vi->>''field'' in (''matricula_id'', ''contrato_id'')
            and coalesce(vi->>''raw_value'', '''') in (''0'', '''')
          )
        )
        else 1
      end
    ), 0)::integer,
    (select count(*)::integer from duplicatas),
    (count(*) filter (where i.status not in (''aberta'', ''paga'', ''cancelada'')))::integer
  into
    v_source_missing_count,
    v_source_missing_ativo,
    v_source_missing_saiu,
    v_validation_issue_count,
    v_validation_issue_bloqueante,
    v_duplicate_fatura_count,
    v_unknown_status_count
  from itens_escopo i;';

  c_if_de constant text :=
'  if not v_is_fresh
     or v_source_missing_count > 0
     or v_validation_issue_count > 0
     or v_duplicate_fatura_count > 0
     or v_unknown_status_count > 0 then';

  c_if_para constant text :=
'  if not v_is_fresh
     or v_validation_issue_bloqueante > 0
     or v_duplicate_fatura_count > 0
     or v_unknown_status_count > 0 then';

  c_integ_bloq_de constant text :=
'      ''integrity'', jsonb_build_object(
        ''source_missing_count'', v_source_missing_count,
        ''validation_issue_count'', v_validation_issue_count,
        ''duplicate_fatura_count'', v_duplicate_fatura_count,
        ''unknown_status_count'', v_unknown_status_count
      ),';

  c_integ_bloq_para constant text :=
'      ''integrity'', jsonb_build_object(
        ''source_missing_count'', v_source_missing_count,
        ''source_missing_aluno_ativo'', v_source_missing_ativo,
        ''source_missing_aluno_saiu'', v_source_missing_saiu,
        ''validation_issue_count'', v_validation_issue_count,
        ''validation_issue_bloqueante'', v_validation_issue_bloqueante,
        ''duplicate_fatura_count'', v_duplicate_fatura_count,
        ''unknown_status_count'', v_unknown_status_count
      ),';

  c_integ_ok_de constant text :=
'    ''integrity'', jsonb_build_object(
      ''source_missing_count'', 0,
      ''validation_issue_count'', 0,
      ''duplicate_fatura_count'', 0,
      ''unknown_status_count'', 0
    ),';

  c_integ_ok_para constant text :=
'    ''integrity'', jsonb_build_object(
      ''source_missing_count'', v_source_missing_count,
      ''source_missing_aluno_ativo'', v_source_missing_ativo,
      ''source_missing_aluno_saiu'', v_source_missing_saiu,
      ''validation_issue_count'', v_validation_issue_count,
      ''validation_issue_bloqueante'', v_validation_issue_bloqueante,
      ''duplicate_fatura_count'', v_duplicate_fatura_count,
      ''unknown_status_count'', v_unknown_status_count
    ),';
begin
  select regexp_replace(pg_get_functiondef(p.oid), E'\r', '', 'g')
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_financeiro_faturas_emusys';

  if v_def is null then
    raise exception 'ANCORA_AUSENTE: get_financeiro_faturas_emusys nao encontrada';
  end if;

  -- Guardas: cada ancora tem de aparecer EXATAMENTE uma vez.
  -- (regra do CLAUDE.md: declarar o numero esperado, nunca assumir 1 sem checar)
  v_ocorr := (length(v_def) - length(replace(v_def, c_decl_de, ''))) / length(c_decl_de);
  if v_ocorr <> 1 then raise exception 'ANCORA_DECL: esperado 1, achou %', v_ocorr; end if;

  v_ocorr := (length(v_def) - length(replace(v_def, c_calc_de, ''))) / length(c_calc_de);
  if v_ocorr <> 1 then raise exception 'ANCORA_CALC: esperado 1, achou %', v_ocorr; end if;

  v_ocorr := (length(v_def) - length(replace(v_def, c_if_de, ''))) / length(c_if_de);
  if v_ocorr <> 1 then raise exception 'ANCORA_IF: esperado 1, achou %', v_ocorr; end if;

  v_ocorr := (length(v_def) - length(replace(v_def, c_integ_bloq_de, ''))) / length(c_integ_bloq_de);
  if v_ocorr <> 1 then raise exception 'ANCORA_INTEG_BLOQ: esperado 1, achou %', v_ocorr; end if;

  v_ocorr := (length(v_def) - length(replace(v_def, c_integ_ok_de, ''))) / length(c_integ_ok_de);
  if v_ocorr <> 1 then raise exception 'ANCORA_INTEG_OK: esperado 1, achou %', v_ocorr; end if;

  v_def := replace(v_def, c_decl_de, c_decl_para);
  v_def := replace(v_def, c_calc_de, c_calc_para);
  v_def := replace(v_def, c_if_de, c_if_para);
  v_def := replace(v_def, c_integ_bloq_de, c_integ_bloq_para);
  v_def := replace(v_def, c_integ_ok_de, c_integ_ok_para);

  v_def := replace(
    v_def,
    'source_missing nunca e pagamento;',
    'source_missing nunca e pagamento e nao bloqueia (vira aviso em integrity); identificador opcional ausente (matricula_id/contrato_id = 0) e cobranca avulsa legitima e nao bloqueia;'
  );

  execute v_def;
end $$;
