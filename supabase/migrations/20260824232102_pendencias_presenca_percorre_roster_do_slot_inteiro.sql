-- O relatório de pendências perdia alunos em turma com 2+ alunos.
--
-- CASO (Levi Barbosa Rodrigues, Piano T, Barra 18/08/2026 18h): as duas linhas de presença
-- dele estavam sem decisão nenhuma, e mesmo assim ele NÃO aparecia na lista da Sol.
--
-- POR QUÊ: o Emusys emite um par turma+individual **por ALUNO**, não por aula. A turma
-- P_Ter_18 daquele horário tem dois alunos, logo QUATRO registros de aula para o mesmo
-- slot real (452959/452960 criados em 14/07 e 29785049/29785050 em 11/08). O filtro
-- `ae.id = fn_aula_operacional_id(ae.id)` elege UM vencedor para o slot inteiro — e a
-- função passava a examinar só o roster dele. O aluno do outro par sumia em silêncio.
--
-- Medido em 01-23/08: **54 pares aluno-aula (1,6%) invisíveis** — CG 22, Recreio 22,
-- Barra 10. É falso-negativo: a Sol anuncia "✅ Tudo fechado" com pendência real de pé.
--
-- CORREÇÃO: a âncora deixa de ser filtro de LINHA e vira desempate de dedup. O `distinct on`
-- percorre o roster de todas as aulas do slot e devolve uma linha por (slot, aluno), em vez
-- de descartar tudo que não é a âncora.
--
-- ⚠️ A elegibilidade continua no WHERE, ANTES do `distinct on`: `matricula_disciplina_id`
-- difere entre as gêmeas (0 numa, 933 na outra) e a régua depende dele — filtrar depois
-- deixaria passar linha inelegível só por ela ter ganhado o desempate.
-- ⚠️ O desempate prefere `matricula_disciplina_id` real a 0, e turma a individual: o 0
-- aparece na linha de turma e é ele que não identifica a disciplina do aluno.
do $mig$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_presenca_pendencias_do_dia';

  if position('distinct on' in v_def) > 0 then
    raise notice 'pendencias ja percorre o slot inteiro'; return;
  end if;

  v_new := replace(v_def,
$a$    select distinct
           ae.unidade_id,$a$,
$a$    select distinct on (ae.unidade_id, ae.professor_id, ae.data_hora_inicio,
                        ae.curso_nome, r.aluno_id)
           ae.unidade_id,$a$);
  if v_new = v_def then raise exception 'ancora do distinct nao encontrada'; end if;
  v_def := v_new;

  v_new := replace(v_def,
$b$       and ae.id = public.fn_aula_operacional_id(ae.id)
       and public.fn_presenca_pendencia_elegivel($b$,
$b$       and public.fn_presenca_pendencia_elegivel($b$);
  if v_new = v_def then raise exception 'ancora do filtro de ancora nao encontrada'; end if;
  v_def := v_new;

  v_new := replace(v_def,
$c$         ae.curso_nome
       )
  ),
  sem_resposta as ($c$,
$c$         ae.curso_nome
       )
     order by ae.unidade_id, ae.professor_id, ae.data_hora_inicio,
              ae.curso_nome, r.aluno_id,
              nullif(ae.matricula_disciplina_id, 0) nulls last,
              case when ae.tipo = 'turma' then 0 else 1 end,
              ae.id
  ),
  sem_resposta as ($c$);
  if v_new = v_def then raise exception 'ancora do order by do distinct on nao encontrada'; end if;

  execute v_new;
end $mig$;

revoke all on function public.fn_presenca_pendencias_do_dia(uuid, date) from public, anon;
grant execute on function public.fn_presenca_pendencias_do_dia(uuid, date) to authenticated, service_role;;
