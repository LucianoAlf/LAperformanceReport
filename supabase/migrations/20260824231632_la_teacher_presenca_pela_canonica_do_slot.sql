-- LA Teacher parava de mostrar "Faltou" para aluno presente.
--
-- CASO (Valdo/CG, 21/08/2026): a tela do professor mostrou "Faltou" para Alice (18h) e
-- Eduardo (19h), que estiveram na aula. Na MESMA tela, Ryan (17h) e Jhonatan (20h)
-- apareciam com "✅ Chamada". A diferença não estava na aula — estava em duas réguas
-- diferentes dentro do mesmo SELECT.
--
-- DOIS defeitos, e os dois nesta função:
--
-- 1. A função já elege uma aula-âncora por slot (`fn_aula_operacional_id`), mas junta a
--    presença por `ap.aula_emusys_id = ae.id` — SÓ a âncora. O Emusys emite cada aula
--    duas vezes (turma + individual, 85-91% da grade); quando a equipe marca na gêmea que
--    não é a âncora, a junção encontra justamente a linha órfã criada pelo sync.
--
-- 2. O fallback `case ap.status when 'ausente' then 'falta'` traduz o `ausente` CRU do
--    Emusys como falta. Mas 'ausente' é o DEFAULT do sistema — vem assim em 100% das
--    aulas antes de alguém lançar. Era ele pintando "Faltou" na tela. O selo "✅ Chamada",
--    logo abaixo, usava `fn_presenca_fecha_chamada`, que trata isso certo: daí a tela
--    conseguir se contradizer sozinha.
--
-- Mesma régua que saiu do prompt do Fábio hoje (`20260824123537_presenca_fantasma_fora_do_prompt`):
-- não existe "ausente", existe presença e falta AFIRMADAS. Aqui a régua vem pronta da
-- `vw_presenca_slot_canonica_v1`, para as duas telas nunca mais divergirem.
--
-- ⚠️ A junção NÃO exige curso igual, só prefere: `aluno_presenca.curso_nome` e
-- `aulas_emusys.curso_nome` divergem em casos reais ("Violão IND" x "Violão T", Sirley/CG
-- 02/07). Exigir igualdade faria a presença sumir da tela nesses casos — pior que o bug
-- que estamos consertando.
do $mig$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'app_minha_agenda_sessao';

  if position('vw_presenca_slot_canonica_v1' in v_def) > 0 then
    raise notice 'la teacher ja le a canonica'; return;
  end if;

  -- (1) presenca resolvida por SLOT, nao pela aula-ancora
  v_new := replace(v_def,
$a$        left join public.aluno_presenca ap
          on ap.aula_emusys_id = ae.id and ap.aluno_id = r.aluno_id$a$,
$a$        left join lateral (
          select c.aluno_presenca_id as id, c.status_presenca, c.respondido_por,
                 c.presenca_afirmada, c.chamada_fechada
            from public.vw_presenca_slot_canonica_v1 c
           where c.aluno_id = r.aluno_id
             and c.professor_id = ae.professor_id
             and c.data_hora_inicio = ae.data_hora_inicio
             and c.data_hora_fim is not distinct from ae.data_hora_fim
           order by (c.curso_nome is not distinct from ae.curso_nome) desc,
                    c.chamada_fechada desc,
                    c.aluno_presenca_id
           limit 1
        ) ap on true$a$);
  if v_new = v_def then raise exception 'ancora do join de presenca nao encontrada'; end if;
  v_def := v_new;

  -- (2) contador do cabecalho
  v_new := replace(v_def,
$b$          count(distinct ap.aluno_id) filter (
            where public.fn_presenca_fecha_chamada(
              coalesce(ap.status_presenca,
                case ap.status when 'presente' then 'presente' when 'ausente' then 'falta' end),
              ap.respondido_por
            )
          ) as n_registradas,$b$,
$b$          count(distinct r.aluno_id) filter (
            where coalesce(ap.chamada_fechada, false)
          ) as n_registradas,$b$);
  if v_new = v_def then raise exception 'ancora do n_registradas nao encontrada'; end if;
  v_def := v_new;

  -- (3) o selo do aluno: so decisao AFIRMADA vira presenca/falta
  v_new := replace(v_def,
$c$            'presenca', coalesce(
              ap.status_presenca,
              case ap.status when 'presente' then 'presente' when 'ausente' then 'falta' end,
              'a_confirmar'
            ),$c$,
$c$            'presenca', coalesce(ap.presenca_afirmada, 'a_confirmar'),$c$);
  if v_new = v_def then raise exception 'ancora do campo presenca nao encontrada'; end if;
  v_def := v_new;

  v_new := replace(v_def,
$d$            'tem_presenca_registrada', ap.id is not null and public.fn_presenca_fecha_chamada(
              coalesce(ap.status_presenca,
                case ap.status when 'presente' then 'presente' when 'ausente' then 'falta' end),
              ap.respondido_por
            ),$d$,
$d$            'tem_presenca_registrada', coalesce(ap.chamada_fechada, false),$d$);
  if v_new = v_def then raise exception 'ancora do tem_presenca_registrada nao encontrada'; end if;

  execute v_new;
end $mig$;

revoke all on function public.app_minha_agenda_sessao(date) from public, anon;
grant execute on function public.app_minha_agenda_sessao(date) to authenticated;;
