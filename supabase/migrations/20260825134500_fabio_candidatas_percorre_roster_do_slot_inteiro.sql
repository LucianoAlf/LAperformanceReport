-- O Fábio perdia aluno em turma com 2+ alunos — mesmo defeito da lista de pendências.
--
-- CASO (Levi Barbosa Rodrigues, Piano T, Barra 18/08 18h, prof. Leonardo Castro): as duas
-- linhas de presença dele estão sem decisão nenhuma. A lista de pendências (corrigida em
-- 24/08) mostra `sem_resposta`. `fabio_aulas_candidatas(19,'chamada',...)` devolvia
-- **0 candidatas** — o professor nunca era lembrado de fazer aquela chamada.
--
-- POR QUÊ: o Emusys emite um par turma+individual **por ALUNO**, então uma turma de dois
-- alunos vira QUATRO registros no mesmo slot. `ae.id = fn_aula_operacional_id(ae.id)`
-- elege UM vencedor para o slot inteiro e o roster passava a ser só o dele.
--
-- Medido em 18-25/08: **26 pares aluno-aula invisíveis** para o Fábio (CG 13, Recreio 8,
-- Barra 5).
--
-- CORREÇÃO: a âncora deixa de ser filtro de LINHA e vira (a) o `aula_id` de saída — para
-- o Fábio continuar gravando no registro operacional do slot — e (b) desempate do
-- `distinct on`, que agora percorre o roster de todas as gêmeas.
--
-- ⚠️ Sem o `distinct on` o mesmo aluno entraria duas vezes sob a mesma âncora e o
-- `count(*) filter (...)` contaria em dobro.
-- ⚠️ O `not exists` de `sem_presenca_fechada` já estava CERTO: casa por `data_hora_inicio`
-- e atravessa as gêmeas. E o `case 'ausente' then 'falta'` dele é argumento de
-- `fn_presenca_fecha_chamada`, que recusa ('falta','emusys') — é comparador, não exibição,
-- então NÃO é o fantasma que mentiu na tela do Valdo. Não mexi.
do $mig$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fabio_aulas_candidatas';

  if position('distinct on' in v_def) > 0 then
    raise notice 'fabio ja percorre o slot inteiro'; return;
  end if;

  v_new := replace(v_def,
$a$    with roster as (
      select
        ae.id as aula_id,$a$,
$a$    with roster as (
      select distinct on (ae.unidade_id, ae.data_hora_inicio, ae.professor_id, r.aluno_id)
        public.fn_aula_operacional_id(ae.id) as aula_id,$a$);
  if v_new = v_def then raise exception 'ancora do roster nao encontrada'; end if;
  v_def := v_new;

  v_new := replace(v_def,
$b$      where ae.professor_id = p_professor_id
        and ae.id = public.fn_aula_operacional_id(ae.id)
        and coalesce(ae.cancelada, false) = false
        and ae.data_hora_inicio <= p_referencia + interval '15 minutes'
        and coalesce(ae.data_hora_fim, ae.data_hora_inicio) >= p_referencia - (public.fn_janela_registro_dias() || ' days')::interval
    ), por_aula as ($b$,
$b$      where ae.professor_id = p_professor_id
        and coalesce(ae.cancelada, false) = false
        and ae.data_hora_inicio <= p_referencia + interval '15 minutes'
        and coalesce(ae.data_hora_fim, ae.data_hora_inicio) >= p_referencia - (public.fn_janela_registro_dias() || ' days')::interval
      order by ae.unidade_id, ae.data_hora_inicio, ae.professor_id, r.aluno_id,
               case when ae.tipo = 'turma' then 0 else 1 end, ae.id
    ), por_aula as ($b$);
  if v_new = v_def then raise exception 'ancora do where do roster nao encontrada'; end if;

  execute v_new;
end $mig$;;
