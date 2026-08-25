-- `vw_radar_aluno_sinais` já deduplicava as gêmeas — mas por acidente, e ordenava errado.
--
-- Ela agrupava por `(aluno_id, data_aula, horario_aula)`, e `aluno_presenca.horario_aula`
-- está NULL em 1.551 dos 4.462 grupos de agosto. As gêmeas colapsavam porque NULL agrupa
-- com NULL, não porque a regra diz "mesmo horário".
--
-- DOIS efeitos medidos:
--   1. 4 grupos (0,09%) colapsavam aulas REALMENTE diferentes do mesmo aluno no mesmo dia.
--   2. A janela das "últimas 10 aulas" ordena por `horario_aula DESC NULLS LAST` — com o
--      campo nulo, a ordem DENTRO do dia era arbitrária. Isso afeta `faltas_consecutivas`,
--      que depende de qual aula é a mais recente.
--
-- `data_hora_inicio` vem de `aulas_emusys` e é o slot de verdade. Fica explícito, para de
-- depender de campo vazio, e a ordenação passa a ser real.
--
-- ⚠️ NÃO troquei a fonte para `vw_presenca_slot_canonica_v1`: o agrupamento já resolve o
-- slot, e a canônica acrescentaria uma window function a uma view do radar de alerta.
-- Só troco fonte onde a fonte é o problema.
do $mig$
declare v_def text; v_new text;
begin
  select pg_get_viewdef('public.vw_radar_aluno_sinais'::regclass, true) into strict v_def;

  if position('GROUP BY v.aluno_id, v.data_aula, v.data_hora_inicio' in v_def) > 0 then
    raise notice 'radar ja agrupa pelo slot explicito'; return;
  end if;

  v_new := replace(v_def,
$a$            v.horario_aula,
            bool_or(v.considera_presenca) AS veio
           FROM vw_aluno_presenca_semantica_v1 v
          WHERE v.considera_frequencia_denominador AND v.data_aula >= '2026-08-01'::date
          GROUP BY v.aluno_id, v.data_aula, v.horario_aula$a$,
$a$            v.data_hora_inicio,
            bool_or(v.considera_presenca) AS veio
           FROM vw_aluno_presenca_semantica_v1 v
          WHERE v.considera_frequencia_denominador AND v.data_aula >= '2026-08-01'::date
          GROUP BY v.aluno_id, v.data_aula, v.data_hora_inicio$a$);
  if v_new = v_def then raise exception 'ancora do agrupamento nao encontrada'; end if;
  v_def := v_new;

  -- a mesma coluna e' usada para ordenar a janela das ultimas 10 aulas
  v_new := replace(v_def,
$b$ORDER BY aula.data_aula DESC, aula.horario_aula DESC NULLS LAST$b$,
$b$ORDER BY aula.data_aula DESC, aula.data_hora_inicio DESC NULLS LAST$b$);
  if v_new = v_def then raise exception 'ancora da ordenacao da janela nao encontrada'; end if;

  execute 'create or replace view public.vw_radar_aluno_sinais as ' || v_new;
end $mig$;

revoke all on public.vw_radar_aluno_sinais from public, anon;
grant select on public.vw_radar_aluno_sinais to authenticated, service_role;;
