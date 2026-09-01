-- LAPE-13 (continuacao): o relatorio mensal administrativo de Campo Grande/agosto nao gerava.
--
-- Sintoma: a edge respondia HTTP 200 com {success:false, error:"Erro interno do servidor"},
-- e o `detalhe` (descartado pelo front) trazia RELATORIO_ADMIN_MENSAL_DIVERGENTE:churn_pagantes.
--
-- Causa-raiz: "banda nao conta" estava escrito em DOIS lugares, com regras diferentes.
--   * O gerencial (retencao_canonica_base) decide pelo CURSO: is_projeto_banda ou nome
--     casando com canto coral / power kids / minha banda / garageband / percussion kids.
--   * Esta funcao decidia so por `alunos.tipo_matricula_id = 5`.
-- Arthur Felipe de Mattos (CG, curso "Minha Banda Para Sempre", is_projeto_banda = true) tem
-- tipo_matricula_id = 1: o gerencial o excluiu (churn 7,85% = 30/382), esta funcao o rotulou
-- 'interrompido' e o formatador em TS o recontou como churn de pagante (8,12% = 31/382).
-- Diferenca > 0,01 -> a guarda do formatador derrubava a geracao inteira.
--
-- A guarda estava CERTA: `movimentacao_conta_nos_kpis_v1` (predicado canonico) tambem devolve
-- false para ele. O numero correto e 30; o defeito era o rotulo.
--
-- Correcao: usar o helper canonico `is_atividade_extra_curso` em vez de reimplementar a regra.
--
-- Alcance medido em TODO o historico (mar-ago/2026, evasoes em curso de atividade extra):
--   * 1 registro muda numero  -> Arthur sai do churn de CG (7,853% contra 7,85% do payload).
--   * 2 mudam so rotulo       -> Isis e Lis (Recreio, Power Kids): interrompido_bolsista ->
--                                interrompido_banda. Ja estavam fora do churn; Recreio nao
--                                muda nenhum numero, so o texto da composicao de saidas.
--   * 0 registros com motivo gravado a mao sao afetados: o ramo do `m.tipo_evasao` gravado
--     continua vindo antes, entao decisao humana segue vencendo.
--
-- Aprovado por Luciano em 01/09/2026.

do $mig$
declare
  v_def text;
  v_ocorr integer;

  c_de constant text :=
$a$                   when coalesce(a.tipo_matricula_id, 0) = 5 then 'interrompido_banda'$a$;

  c_para constant text :=
$b$                   when coalesce(a.tipo_matricula_id, 0) = 5
                     or public.is_atividade_extra_curso(coalesce(m.curso_id, a.curso_id))
                     then 'interrompido_banda'$b$;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_relatorio_admin_mensal_rico_base_v1';

  if v_def is null then
    raise exception 'ANCORA_AUSENTE: get_relatorio_admin_mensal_rico_base_v1 nao encontrada';
  end if;

  -- Guarda declarando o numero esperado (regra do CLAUDE.md: nunca assumir 1 sem checar).
  v_ocorr := (length(v_def) - length(replace(v_def, c_de, ''))) / length(c_de);
  if v_ocorr <> 1 then
    raise exception 'ANCORA_BANDA: esperado 1, achou %', v_ocorr;
  end if;

  v_def := replace(v_def, c_de, c_para);
  execute v_def;
end
$mig$;
