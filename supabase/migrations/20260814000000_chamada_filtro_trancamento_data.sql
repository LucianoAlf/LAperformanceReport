-- 2026-08-14 — Filtro de trancados na Chamada considera a data de início do trancamento
--
-- Problema: a migration 20260813233000 esconde trancados apenas em aulas futuras.
-- Mas alunos trancados em aulas de HOJE (dentro do período de trancamento) também
-- não devem aparecer na chamada. Ex.: Isis Petrucio (Barra) trancada desde 01/07/2026
-- aparecia na chamada de 14/08/2026.
--
-- Regra nova:
-- - EVADIDOS: esconder sempre da grade (evasão é permanente)
-- - TRANCADOS: esconder da grade se data_aula >= trancamento_data_inicial
-- - Aulas passadas antes do trancamento começar: mostrar (chamada histórica válida)
--
-- Implementação: JOIN com aluno_jornada_matricula_disciplina para pegar a data de
-- início do trancamento quando o status é 'trancado'.

do $$
declare
  v_def text;
  v_alvo_antigo constant text := 'and al_filter.status in (''evadido'', ''trancado'')'
    || e'\n' || '    and b.data_aula > (now() at time zone ''America/Sao_Paulo'')::date';
  v_substituicao constant text :=
    'and (' || e'\n' ||
    '      al_filter.status = ''evadido''' || e'\n' ||
    '      or (al_filter.status = ''trancado''' || e'\n' ||
    '          and exists (' || e'\n' ||
    '              select 1 from aluno_jornada_matricula_disciplina j_tranc' || e'\n' ||
    '              where j_tranc.aluno_id = al_filter.id' || e'\n' ||
    '                and j_tranc.trancamento_data_inicial is not null' || e'\n' ||
    '                and j_tranc.trancamento_data_inicial <= b.data_aula' || e'\n' ||
    '                and j_tranc.status_matricula = ''trancada''' || e'\n' ||
    '          ))' || e'\n' ||
    '    )';
begin
  v_def := pg_get_functiondef('public.get_agenda_dia(date, uuid)'::regprocedure);

  if position(v_alvo_antigo in v_def) = 0 then
    raise exception 'guarda: filtro anterior (data_aula > hoje) nao encontrado';
  end if;

  execute replace(v_def, v_alvo_antigo, v_substituicao);
end $$;

revoke all on function public.get_agenda_dia(date, uuid) from public;
revoke all on function public.get_agenda_dia(date, uuid) from anon;
grant execute on function public.get_agenda_dia(date, uuid) to authenticated;
grant execute on function public.get_agenda_dia(date, uuid) to service_role;
