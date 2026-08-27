-- Bolsista e aluno de banda saem de TODOS os KPIs, não só das saídas.
--
-- REGRA (Alf, 27/08/2026, esclarecendo a migration de ontem):
--   "Bolsista e aluno de banda não conta em nada, em nada. [...] contam em número
--    de alunos ativos e matrículas, mas não conta na parte financeira e nem nessa
--    parte de taxa de renovação, nada disso. Porque senão isso infla o programa
--    deles."
--
-- Ontem (20260827120000) eu apliquei a exclusão só a `evasao`/`nao_renovacao`,
-- deixando a taxa de renovação de fora porque a §5.4 não a mencionava. Estava
-- errado, e o dado confirma o Alf — a renovação ESTAVA inflada:
--
--   | unidade | mês     | taxa antes | taxa depois |
--   | CG      | jul/26  |   81,8%    |   77,8%     |  <- cruzava a meta de 80%
--   | CG      | ago/26  |   88,1%    |   86,4%     |
--   | REC     | ago/26  |   89,3%    |   87,2%     |
--   | CG      | jun/26  |   92,7%    |   91,4%     |
--   | BARRA   | ago/26  |   93,3%    |   92,3%     |
--
-- Com a regra agora UNIFORME (mesma resposta para todo tipo de movimentação),
-- some a justificativa que me fez criar dois predicados ontem. Volta a ser um só:
--
--   movimentacao_conta_nos_kpis_v1(curso_id, tipo_matricula_id)  <- a regra
--     ├── is_movimentacao_admin_retencao_valida(movimentacao_id) <- por id
--     └── chamada direta com os valores, onde o join já existe
--
-- ⚠️ ISTO ALCANÇA OS 17 CONSUMIDORES de `is_movimentacao_admin_retencao_valida`
-- de uma vez — relatórios admin/gerencial/coordenação, KPIs de professor, score,
-- fideliza, retenção IA. É o objetivo: um único lugar decide, e nenhum consumidor
-- fica para trás por esquecimento. O preço é que a mudança é ampla; por isso o
-- impacto foi medido antes (tabela acima) e não é surpresa em lugar nenhum.
--
-- ⚠️ PESQUISA DE EVASÃO: ontem preservei o helper justamente para não parar de
-- pesquisar bolsista que sai. Medido agora: das 51 pesquisas de evasão já criadas,
-- **1** é de bolsista/banda. O risco que me travou é teórico, e o custo de manter
-- dois predicados divergindo com o tempo é maior. Se um dia a escola quiser
-- pesquisar bolsista, o caminho é um predicado próprio na pesquisa — não
-- reintroduzir a divergência no KPI.
--
-- ⚠️ NÃO MEXE em alunos ativos nem em matrículas — o Alf disse explicitamente que
-- ali eles CONTAM. Bolsista já entra em `alunos_ativos` e fica fora de
-- `alunos_pagantes`/ticket/MRR (`tipos_matricula.conta_como_pagante = false`);
-- banda entra em `matriculas_banda`/`matriculas_ativas` e fora de `alunos_ativos`
-- (§3.2). Nada disso é tocado aqui.
--
-- ⚠️ FAIL-OPEN mantido: sem `aluno_id` ou tipo desconhecido, a movimentação conta.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A regra, num lugar só.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.movimentacao_conta_nos_kpis_v1(
  p_curso_id integer,
  p_tipo_matricula_id integer
)
returns boolean
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select
    -- porta 1: o CURSO é atividade extra (banda/coral)?
    not public.is_atividade_extra_curso(p_curso_id)
    -- porta 2: o TIPO DE MATRÍCULA é bolsista/banda? Desconhecido CONTA.
    -- Sem esta porta, bolsista em curso REGULAR passa batido — que é a maioria.
    and coalesce(
      (
        select tm.codigo not in ('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA')
        from public.tipos_matricula tm
        where tm.id = p_tipo_matricula_id
      ),
      true
    );
$function$;

comment on function public.movimentacao_conta_nos_kpis_v1(integer, integer) is
  'Esta movimentacao entra em KPI (retencao, renovacao, churn, financeiro)? Vale '
  'para TODO tipo de movimentacao. Bolsista e banda contam apenas em alunos ativos '
  'e matriculas (Alf, 27/08/2026). Desconhecido conta (fail-open). '
  'Regra: REGRAS-DE-NEGOCIO 3.5/3.6/3.7.';

revoke all on function public.movimentacao_conta_nos_kpis_v1(integer, integer) from public, anon;
grant execute on function public.movimentacao_conta_nos_kpis_v1(integer, integer)
  to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. O helper por id passa a delegar — os 17 consumidores herdam a regra.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.is_movimentacao_admin_retencao_valida(p_movimentacao_id integer)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  SELECT COALESCE(
    public.movimentacao_conta_nos_kpis_v1(
      COALESCE(m.curso_id, a.curso_id),
      a.tipo_matricula_id
    ),
    true
  )
  FROM public.movimentacoes_admin m
  LEFT JOIN public.alunos a ON a.id = m.aluno_id
  WHERE m.id = p_movimentacao_id;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. As duas funções patchadas ontem passam para o nome definitivo.
--    replace() COM GUARDA: âncora que não bater exatamente uma vez aborta tudo.
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
      ('public.get_kpis_alunos_canonicos_base_p01q(uuid,integer,integer)', 'ma'),
      ('public.recalcular_dados_mensais_unguarded(integer,integer,uuid)',  'm')
    ) as t(assinatura, alias)
  loop
    v_def := pg_get_functiondef(v_alvo.assinatura::regprocedure);

    v_ancora := format(
      'public.movimentacao_conta_no_churn_v1(COALESCE(%s.curso_id, aluno_mov.curso_id), aluno_mov.tipo_matricula_id)',
      v_alvo.alias
    );

    v_ocorrencias := (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora);
    if v_ocorrencias <> 1 then
      raise exception
        'ANCORA em %: esperava 1 ocorrencia, achei %. Corpo mudou - revisar antes de aplicar.',
        v_alvo.assinatura, v_ocorrencias;
    end if;

    v_novo := replace(v_ancora, 'movimentacao_conta_no_churn_v1', 'movimentacao_conta_nos_kpis_v1');
    execute replace(v_def, v_ancora, v_novo);
  end loop;
end;
$$;

-- Um nome só para a regra: o de ontem some para não haver dois pontos de verdade.
drop function if exists public.movimentacao_conta_no_churn_v1(integer, integer);

-- ⚠️ Recriar função reabre EXECUTE para anon (ALTER DEFAULT PRIVILEGES do schema).
revoke execute on function public.get_kpis_alunos_canonicos_base_p01q(uuid,integer,integer) from anon;
revoke execute on function public.recalcular_dados_mensais_unguarded(integer,integer,uuid) from anon;
revoke execute on function public.is_movimentacao_admin_retencao_valida(integer) from anon;

commit;
