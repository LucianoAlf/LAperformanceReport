-- A ficha do aluno mostrava cada aula DUAS vezes para o professor.
--
-- `app_aluno_ficha` monta `presenca_recente` com LIMIT 10 sobre a view semântica, que tem
-- uma linha por REGISTRO do Emusys. Como ele emite cada aula como par turma+individual,
-- "as últimas 10 aulas" eram na prática 5 aulas repetidas.
--
-- Medido em agosto: **7.149 linhas exibidas para 3.689 aulas reais em 1.324 fichas —
-- 48,4% do que o professor lia era repetição.**
--
-- ⚠️ Pior que o volume: quando uma gêmea tem decisão humana e a outra é a órfã do sync,
-- a ficha mostrava DUAS linhas do mesmo dia com status diferente. O professor não tinha
-- como saber qual valia — é a mesma confusão que a Mayra e o Jhon relataram, na tela dele.
--
-- ⚠️ A ordenação também trocou `horario_aula` por `data_hora_inicio`: o primeiro está NULL
-- na maioria das linhas (mesmo defeito achado no radar hoje), então a ordem DENTRO do dia
-- era arbitrária — e num LIMIT 10 a ordem decide o que aparece e o que é cortado.
do $mig$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'app_aluno_ficha';

  if position('vw_presenca_slot_canonica_v1' in v_def) > 0 then
    raise notice 'ficha ja le a canonica'; return;
  end if;

  v_new := replace(v_def,
$a$        FROM public.vw_aluno_presenca_semantica_v1 ps
        WHERE ps.aluno_id = p_aluno_id
          AND ps.professor_id = v_prof
        ORDER BY ps.data_aula DESC, ps.horario_aula DESC
        LIMIT 10$a$,
$a$        FROM public.vw_presenca_slot_canonica_v1 ps
        WHERE ps.aluno_id = p_aluno_id
          AND ps.professor_id = v_prof
        ORDER BY ps.data_aula DESC, ps.data_hora_inicio DESC NULLS LAST
        LIMIT 10$a$);
  if v_new = v_def then raise exception 'ancora do presenca_recente nao encontrada'; end if;

  execute v_new;
end $mig$;;
