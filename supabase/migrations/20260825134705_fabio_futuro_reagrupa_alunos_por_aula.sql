-- Fecha um buraco que EU abri na migration anterior.
--
-- Ao trocar o `jsonb_agg ... group by ae.id` por `distinct on (slot, aluno)`, cada ALUNO
-- do CTE `futuro` passou a virar uma candidata própria — a mesma aula apareceria N vezes,
-- uma por aluno, em vez de uma vez com N alunos dentro.
--
-- ⚠️ O teste de fumaça deu "0 aulas repetidas" e NÃO provava nada: a janela do `futuro` é
-- de 15 minutos e não pegou nenhuma turma com 2+ alunos naquele instante. Medida que só
-- confirma quando o caso não está presente não é medida — por isso a correção vem agora,
-- e não quando alguém reclamar.
--
-- Forma correta: dois níveis. `distinct on` resolve o slot por aluno; um group by por cima
-- devolve a candidata no formato que o consumidor espera (uma aula, lista de alunos).
do $mig$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fabio_aulas_candidatas';

  if position('futuro_por_aluno' in v_def) > 0 then
    raise notice 'futuro ja reagrupa'; return;
  end if;

  v_new := replace(v_def, '), futuro as (', '), futuro_por_aluno as (');
  if v_new = v_def then raise exception 'ancora de abertura do futuro nao encontrada'; end if;
  v_def := v_new;

  v_new := replace(v_def,
$a$        )) as alunos
      from public.aulas_emusys ae$a$,
$a$        )) as alunos_item
      from public.aulas_emusys ae$a$);
  if v_new = v_def then raise exception 'ancora do alias alunos nao encontrada'; end if;
  v_def := v_new;

  v_new := replace(v_def,
$b$               case when ae.tipo = 'turma' then 0 else 1 end, ae.id
    )
    select coalesce(jsonb_agg(jsonb_build_object($b$,
$b$               case when ae.tipo = 'turma' then 0 else 1 end, ae.id
    ), futuro as (
      select aula_id,
             max(data_aula) as data_aula,
             max(data_hora_inicio) as data_hora_inicio,
             max(curso) as curso,
             max(turma) as turma,
             max(tipo) as tipo,
             0 as dias_em_atraso,
             jsonb_agg(alunos_item->0 order by alunos_item->0->>'nome') as alunos
      from futuro_por_aluno
      group by aula_id
    )
    select coalesce(jsonb_agg(jsonb_build_object($b$);
  if v_new = v_def then raise exception 'ancora do fechamento do futuro nao encontrada'; end if;

  execute v_new;
end $mig$;;
