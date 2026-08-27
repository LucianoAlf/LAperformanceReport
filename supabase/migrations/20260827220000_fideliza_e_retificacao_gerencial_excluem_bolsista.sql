-- Fecha as duas funções que ficaram fora da correção de bolsista/banda.
--
-- A migration `20260827160000` fez `is_movimentacao_admin_retencao_valida` delegar
-- ao predicado canônico, o que corrigiu os 17 consumidores DELE de uma vez. Mas
-- três funções nunca usaram o helper — chamam `is_atividade_extra_curso` DIRETO,
-- e por isso continuavam contando bolsista:
--
--   1. get_programa_fideliza_dados                        <- corrigida aqui
--   2. aplicar_retificacao_relatorio_gerencial_retencao_v1 <- corrigida aqui
--   3. preencher_campos_retencao_movimentacoes_admin()     <- NÃO corrigida, ver abaixo
--
-- ⚠️ O Fideliza importa mais do que o tamanho do número sugere: o desempate do
-- programa é `criterio_desempate = 'menor_churn'`, então uma evasão a mais ou a
-- menos muda o RANKING das unidades. Impacto medido em T3/2026 (jul-set):
--   CG 59 -> 58 · REC 36 -> 35 · BARRA 17 -> 17
--
-- ⚠️ `preencher_campos_retencao_movimentacoes_admin()` fica como está DE PROPÓSITO:
-- é trigger de preenchimento (`valor_parcela_evasao`, `tempo_permanencia_meses`),
-- não contagem de KPI. Incluir bolsista ali pararia de gravar esses campos nas
-- linhas dele — mudança de DADO ARMAZENADO, não de leitura, e sem ganho: quem soma
-- esses campos já filtra bolsista antes. Mexer seria risco sem benefício.

begin;

do $$
declare
  v_alvo record;
  v_def text;
  v_novo text;
  v_ocorrencias integer;
begin
  for v_alvo in
    select *
    from (values
      -- (assinatura, âncora exata, substituição, nº de ocorrências ESPERADO)
      (
        'public.get_programa_fideliza_dados(integer,integer,uuid)',
        'NOT public.is_atividade_extra_curso(COALESCE(m.curso_id, aluno_mov.curso_id))',
        'public.movimentacao_conta_nos_kpis_v1(COALESCE(m.curso_id, aluno_mov.curso_id), aluno_mov.tipo_matricula_id)',
        1
      ),
      (
        -- ⚠️ DUAS ocorrências aqui, e as duas entram: a função repete a CTE
        -- `movimentacoes_retencao` — a 1ª conta renovação/não renovação, a 2ª conta
        -- evasão. A guarda pegou isso na 1ª tentativa (esperava 1, achou 2) e foi
        -- o que impediu de aplicar metade da correção sem ninguém notar.
        'public.aplicar_retificacao_relatorio_gerencial_retencao_v1(uuid,integer,integer,text,text,jsonb,boolean)',
        'not public.is_atividade_extra_curso(coalesce(m.curso_id, a.curso_id))',
        'public.movimentacao_conta_nos_kpis_v1(coalesce(m.curso_id, a.curso_id), a.tipo_matricula_id)',
        2
      )
    ) as t(assinatura, ancora, substituicao, esperado)
  loop
    v_def := pg_get_functiondef(v_alvo.assinatura::regprocedure);

    v_ocorrencias := (length(v_def) - length(replace(v_def, v_alvo.ancora, '')))
                     / length(v_alvo.ancora);
    if v_ocorrencias <> v_alvo.esperado then
      raise exception
        'ANCORA em %: esperava % ocorrencia(s), achei %. Corpo mudou - revisar antes de aplicar.',
        v_alvo.assinatura, v_alvo.esperado, v_ocorrencias;
    end if;

    v_novo := replace(v_def, v_alvo.ancora, v_alvo.substituicao);
    execute v_novo;
    raise notice 'bolsista/banda fora: % atualizada', v_alvo.assinatura;
  end loop;
end;
$$;

-- ⚠️ Recriar função reabre EXECUTE para anon (ALTER DEFAULT PRIVILEGES do schema).
revoke execute on function public.get_programa_fideliza_dados(integer,integer,uuid) from anon;
revoke execute on function
  public.aplicar_retificacao_relatorio_gerencial_retencao_v1(uuid,integer,integer,text,text,jsonb,boolean)
  from anon;

commit;
