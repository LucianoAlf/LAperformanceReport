-- 2026-08-13 — Filtro de evadidos/trancados na Chamada passa a valer só para
-- aulas FUTURAS.
--
-- A migration 20260811170000 escondia alunos evadidos/trancados da grade em
-- QUALQUER data. Para dias PASSADOS isso quebra a chamada retroativa: a
-- secretaria precisa marcar presença de quem estava na aula, mesmo que o
-- aluno tenha sido trancado/evadido depois (ou estivesse em trancamento
-- temporário na data). Caso real: Paulo Gabriel (CG, trancamento 29/06 a
-- 31/08) segue no roster do Emusys da aula 08/08 11:00 (MpB_Sá_11, prof.
-- Adriana); o card ficava com `alunos: []` e a equipe não conseguia dar
-- presença.
--
-- Regra nova: o filtro continua para a grade FUTURA (o problema original da
-- 20260811170000 — evadido aparecendo na chamada de amanhã como "sem
-- destino"), mas não esconde ninguém no dia corrente nem no passado.
--
-- Implementação: replace cirúrgico com guarda sobre pg_get_functiondef, para
-- não transcrever o corpo inteiro da função (padrão do projeto p/ funções
-- grandes). Depois reaplica a ACL (recriar função reabre EXECUTE p/ anon via
-- ALTER DEFAULT PRIVILEGES).

do $$
declare
  v_def text;
  v_alvo constant text := 'and al_filter.status in (''evadido'', ''trancado'')';
  v_substituicao constant text := 'and al_filter.status in (''evadido'', ''trancado'')'
    || e'\n' || '    and b.data_aula > (now() at time zone ''America/Sao_Paulo'')::date';
begin
  v_def := pg_get_functiondef('public.get_agenda_dia(date, uuid)'::regprocedure);

  if position(v_alvo in v_def) = 0 then
    raise exception 'guarda: trecho do filtro evadido/trancado nao encontrado em get_agenda_dia';
  end if;

  if position('b.data_aula > (now() at time zone ''America/Sao_Paulo'')::date' in v_def) > 0 then
    raise exception 'guarda: filtro ja restrito a aulas futuras';
  end if;

  execute replace(v_def, v_alvo, v_substituicao);
end $$;

revoke all on function public.get_agenda_dia(date, uuid) from public;
revoke all on function public.get_agenda_dia(date, uuid) from anon;
grant execute on function public.get_agenda_dia(date, uuid) to authenticated;
grant execute on function public.get_agenda_dia(date, uuid) to service_role;
