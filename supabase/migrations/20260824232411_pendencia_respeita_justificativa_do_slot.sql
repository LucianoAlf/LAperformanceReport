-- Aula justificada (ou cancelada) em QUALQUER gêmea deixa de virar pendência.
--
-- CASO (Miguel Gomes Biancamano, Contrabaixo T, CG 20/08/2026 20h): das duas aulas do
-- slot, uma tem `justificada = true`. Alguém registrou a justificativa — logo não há
-- chamada a fazer, e a Sol continuava cobrando.
--
-- A função já excluía `cancelada`, mas só da aula que ela estava olhando, e nunca olhou
-- `justificada`. Com o roster do slot inteiro (migration anterior), a régua passa a ser
-- a mesma da `vw_presenca_slot_canonica_v1`: atributo de exclusão vale para o slot, não
-- para a linha — porque a justificativa é da AULA REAL, e o Emusys a grava em uma das
-- duas cópias que ele mesmo emitiu.
--
-- Depois disto as duas leituras batem em 18 de 18 dias/unidade medidos (17-22/08), tanto
-- em `sem_resposta` quanto em `divergencia`.
--
-- ⚠️ Sobra UMA diferença, e ela é de propósito: a lista da Sol parte da AULA e enxerga
-- aluno que não tem NENHUMA linha de presença (Layara Sales/Recreio 22/08); a canônica
-- parte de `aluno_presenca` e não pode enxergá-lo. As duas estão certas para o que
-- perguntam — quem cobra chamada precisa ver a linha que nunca nasceu.
do $mig$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_presenca_pendencias_do_dia';

  if position('g.justificada' in v_def) > 0 then
    raise notice 'pendencia ja respeita justificativa'; return;
  end if;

  v_new := replace(v_def,
$a$          and g.data_hora_inicio = p.data_hora_inicio
          and public.fn_presenca_fecha_chamada(ap.status_presenca, ap.respondido_por)
     )
  ),$a$,
$a$          and g.data_hora_inicio = p.data_hora_inicio
          and (
            public.fn_presenca_fecha_chamada(ap.status_presenca, ap.respondido_por)
            or coalesce(g.justificada, false)
            or coalesce(g.cancelada, false)
          )
     )
  ),$a$);
  if v_new = v_def then raise exception 'ancora do sem_resposta nao encontrada'; end if;

  execute v_new;
end $mig$;

revoke all on function public.fn_presenca_pendencias_do_dia(uuid, date) from public, anon;
grant execute on function public.fn_presenca_pendencias_do_dia(uuid, date) to authenticated, service_role;;
