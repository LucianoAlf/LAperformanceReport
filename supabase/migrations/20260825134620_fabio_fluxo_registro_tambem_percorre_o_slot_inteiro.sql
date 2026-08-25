-- Completa a correção anterior: o fluxo `registro` do Fábio tinha o MESMO filtro de âncora
-- que o fluxo `chamada`, no CTE `futuro` (as aulas que começam nos próximos 15 min).
--
-- Mesma consequência: em turma com 2+ alunos, o professor recebia a lista com só o aluno
-- do par que ganhou a eleição de âncora, e gravava o registro sem os outros.
--
-- ⚠️ `aula_id` passa a ser a ÂNCORA (não `ae.id`): é nela que o Fábio grava
-- `anotacoes_fabio`, e o filtro `anotacoes_fabio is null` logo abaixo precisa olhar a
-- mesma linha em que a escrita acontece — senão a aula reaparece como candidata depois
-- de já ter registro.
do $mig$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fabio_aulas_candidatas';

  if position('), futuro as (
      select distinct on' in v_def) > 0 then
    raise notice 'fluxo registro ja corrigido'; return;
  end if;

  v_new := replace(v_def,
$a$    ), futuro as (
      select
        ae.id as aula_id,$a$,
$a$    ), futuro as (
      select distinct on (ae.unidade_id, ae.data_hora_inicio, ae.professor_id, r.aluno_id)
        public.fn_aula_operacional_id(ae.id) as aula_id,$a$);
  if v_new = v_def then raise exception 'ancora do CTE futuro nao encontrada'; end if;
  v_def := v_new;

  v_new := replace(v_def,
$b$      where ae.professor_id = p_professor_id
        and ae.id = public.fn_aula_operacional_id(ae.id)
        and coalesce(ae.cancelada, false) = false
        and ae.data_hora_inicio > p_referencia
        and ae.data_hora_inicio <= p_referencia + interval '15 minutes'
        and nullif(btrim(coalesce(ae.anotacoes_fabio, '')), '') is null
      group by ae.id, ae.data_aula, ae.data_hora_inicio, ae.curso_nome, ae.turma_nome, ae.tipo$b$,
$b$      where ae.professor_id = p_professor_id
        and coalesce(ae.cancelada, false) = false
        and ae.data_hora_inicio > p_referencia
        and ae.data_hora_inicio <= p_referencia + interval '15 minutes'
        and nullif(btrim(coalesce(
              (select alvo.anotacoes_fabio from public.aulas_emusys alvo
                where alvo.id = public.fn_aula_operacional_id(ae.id)), '')), '') is null
      order by ae.unidade_id, ae.data_hora_inicio, ae.professor_id, r.aluno_id,
               case when ae.tipo = 'turma' then 0 else 1 end, ae.id$b$);
  if v_new = v_def then raise exception 'ancora do where do CTE futuro nao encontrada'; end if;

  -- o `futuro` agregava com jsonb_agg + group by; com distinct on o agrupamento sai.
  v_new := replace(v_new,
$c$        0 as dias_em_atraso,
        jsonb_agg(jsonb_build_object(
          'aluno_id', r.aluno_id,
          'nome', al.nome,
          'aula_alvo_id', ae.id
        ) order by al.nome) as alunos$c$,
$c$        0 as dias_em_atraso,
        jsonb_build_array(jsonb_build_object(
          'aluno_id', r.aluno_id,
          'nome', al.nome,
          'aula_alvo_id', public.fn_aula_operacional_id(ae.id)
        )) as alunos$c$);
  if v_new = v_def then raise exception 'ancora do jsonb_agg do futuro nao encontrada'; end if;

  execute v_new;
end $mig$;;
