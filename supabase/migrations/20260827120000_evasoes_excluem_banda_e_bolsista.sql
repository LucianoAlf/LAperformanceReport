-- Evasões/churn deixam de contar banda e bolsista.
--
-- REGRA (docs/REGRAS-DE-NEGOCIO.md §3.5, §3.6 e §3.7 — já estabelecida, não é nova):
--   - §3.6, tabela de tipos_matricula: BOLSISTA_INT, BOLSISTA_PARC e BANDA têm
--     "Churn: ✘".
--   - §3.7: "Bolsista integral ... não entra em ticket/MRR/LTV/churn".
--   - §3.5: atividade extra é "excluída de ... LTV, churn" e "movimentações
--     (evasão, renovação, não renovação) de atividade extra não entram na retenção".
--
-- O QUE ESTAVA ERRADO: as duas funções que contam evasão filtravam SÓ por curso
-- (`is_atividade_extra_curso`), que responde "este curso é banda/coral?". Bolsista
-- em curso REGULAR passava batido — e o churn ficava aritmeticamente incoerente,
-- porque o denominador é `alunos_pagantes`, de onde bolsista já sai por definição
-- (`tipos_matricula.conta_como_pagante = false`). Numerador e denominador falavam
-- de universos diferentes.
--
-- ⚠️ POR QUE UMA FUNÇÃO NOVA E NÃO ESTENDER `is_movimentacao_admin_retencao_valida`:
-- aquela tem 17 consumidores, e entre eles estão `criar_pesquisa_evasao`,
-- `pode_enviar_pesquisa_evasao` e `listar_evadidos_para_pesquisa`. Ela responde
-- "esta saída é um evento real de retenção?" — e a resposta para bolsista que sai
-- continua sendo SIM: queremos pesquisar o motivo. A pergunta desta migration é
-- outra: "esta saída entra no KPI de evasão/churn?". São perguntas distintas e
-- passar bolsista para dentro daquela função pararia de enviar pesquisa de evasão
-- para bolsista, sem ninguém pedir. Também não mexo em `is_atividade_extra_curso`:
-- bolsista em curso regular NÃO é atividade extra, e sobrecarregar aquele nome com
-- outra regra é como a semântica se perde.
--
-- ⚠️ FAIL-OPEN DE PROPÓSITO: movimentação sem `aluno_id` (40 linhas em 2026, o
-- lançamento manual antigo não vinculava) ou com tipo desconhecido CONTINUA
-- contando. Fechar aqui sumiria com evasão real em silêncio, que é pior do que o
-- defeito que esta migration corrige.
--
-- IMPACTO MEDIDO (2026-05 a 2026-08, evasao + nao_renovacao, chave deduplicada):
--   | unidade | mês     | antes | depois |
--   | CG      | ago/26  |  31   |  30    |
--   | REC     | jul/26  |   7   |   6    |
--   | BARRA   | jun/26  |   4   |   3    |
--   (demais recortes do período: sem alteração)
-- Matrícula com tipo BANDA que o filtro por curso ainda não pegasse: 0 casos em
-- 2026 — o `BANDA` entra aqui como rede, não porque falte cobertura hoje.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. O predicado canônico do KPI de evasão/churn.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.movimentacao_conta_no_churn_v1(
  p_curso_id integer,
  p_tipo_matricula_id integer
)
returns boolean
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select
    -- banda/coral: o curso decide (regra que já existia)
    not public.is_atividade_extra_curso(p_curso_id)
    -- bolsista/banda: o tipo de matrícula decide. Desconhecido CONTA (fail-open).
    and coalesce(
      (
        select tm.codigo not in ('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA')
        from public.tipos_matricula tm
        where tm.id = p_tipo_matricula_id
      ),
      true
    );
$function$;

comment on function public.movimentacao_conta_no_churn_v1(integer, integer) is
  'Esta saída entra no KPI de evasão/churn? Banda/coral por curso + bolsista/banda '
  'por tipo_matricula. NÃO confundir com is_movimentacao_admin_retencao_valida, que '
  'responde "é evento real de retenção?" e é quem decide pesquisa de evasão e score '
  'do professor. Desconhecido conta (fail-open). Regra: REGRAS-DE-NEGOCIO §3.5/3.6/3.7.';

revoke all on function public.movimentacao_conta_no_churn_v1(integer, integer) from public, anon;
grant execute on function public.movimentacao_conta_no_churn_v1(integer, integer)
  to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Aplicar nas DUAS funções que contam evasão — a viva e a de snapshot.
--    Corpo lido de pg_get_functiondef e alterado por replace COM GUARDA:
--    se a âncora não bater exatamente uma vez, a migration aborta em vez de
--    aplicar um corpo que não é o que eu revisei.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_alvo record;
  v_def text;
  v_ancora text;
  v_novo text;
  v_ocorrencias integer;
begin
  for v_alvo in
    select *
    from (values
      -- (assinatura, alias da movimentação dentro da função)
      ('public.get_kpis_alunos_canonicos_base_p01q(uuid,integer,integer)', 'ma'),
      ('public.recalcular_dados_mensais_unguarded(integer,integer,uuid)',  'm')
    ) as t(assinatura, alias)
  loop
    v_def := pg_get_functiondef(v_alvo.assinatura::regprocedure);

    v_ancora := format(
      'NOT public.is_atividade_extra_curso(COALESCE(%s.curso_id, aluno_mov.curso_id))',
      v_alvo.alias
    );

    v_ocorrencias := (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora);
    if v_ocorrencias <> 1 then
      raise exception
        'ANCORA em %: esperava 1 ocorrencia de "%", achei %. Corpo mudou — revisar antes de aplicar.',
        v_alvo.assinatura, v_ancora, v_ocorrencias;
    end if;

    v_novo := format(
      'public.movimentacao_conta_no_churn_v1(COALESCE(%s.curso_id, aluno_mov.curso_id), aluno_mov.tipo_matricula_id)',
      v_alvo.alias
    );

    execute replace(v_def, v_ancora, v_novo);
    raise notice 'evasao/churn: % atualizada', v_alvo.assinatura;
  end loop;
end;
$$;

-- ⚠️ Recriar função reabre EXECUTE para anon (ALTER DEFAULT PRIVILEGES do schema
-- public). As duas acima foram recriadas pelo bloco — revogar nominalmente.
revoke execute on function public.get_kpis_alunos_canonicos_base_p01q(uuid,integer,integer) from anon;
revoke execute on function public.recalcular_dados_mensais_unguarded(integer,integer,uuid) from anon;

commit;
