-- Impede que um experimental seja exibido em todas as aulas do mesmo
-- horario quando ha mais de um professor na unidade.
--
-- A agenda tem a aula e o lead como entidades diferentes. O professor da
-- experimental e o vinculo canonico; data, horario e unidade sao apenas o
-- contexto de localizacao. O fallback sem professor continua permitido
-- somente quando existe uma unica aula experimental possivel no slot.

do $migration$
declare
  v_item record;
  v_def text;
  v_alvo text :=
    'le.horario_experimental = (b.data_hora_inicio at time zone ''America/Sao_Paulo'')::time';
  v_substituicao text :=
    v_alvo || E'\n'
    || '   and (' || E'\n'
    || '     le.professor_experimental_id = b.professor_id' || E'\n'
    || '     or (' || E'\n'
    || '       le.professor_experimental_id is null' || E'\n'
    || '       and (' || E'\n'
    || '         select count(distinct b_outra.chave)' || E'\n'
    || '         from base b_outra' || E'\n'
    || '         where b_outra.chave is not null' || E'\n'
    || '           and b_outra.unidade_id = b.unidade_id' || E'\n'
    || '           and b_outra.data_aula = b.data_aula' || E'\n'
    || '           and (b_outra.data_hora_inicio at time zone ''America/Sao_Paulo'')::time' || E'\n'
    || '             = (b.data_hora_inicio at time zone ''America/Sao_Paulo'')::time' || E'\n'
    || '           and b_outra.categoria = ''experimental''' || E'\n'
    || '           and b_outra.cancelada is not true' || E'\n'
    || '       ) = 1' || E'\n'
    || '     )' || E'\n'
    || '   )';
begin
  for v_item in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.oid in (
        'public.get_agenda_dia(date,uuid)'::regprocedure,
        'public.get_agenda_semana(date,uuid)'::regprocedure
      )
  loop
    v_def := pg_get_functiondef(v_item.oid);

    if position(v_alvo in v_def) = 0 then
      raise exception
        'agenda experimental: trecho de horario nao encontrado em %',
        v_item.proname;
    end if;

    execute replace(v_def, v_alvo, v_substituicao);
  end loop;
end
$migration$;

comment on function public.get_agenda_dia(date, uuid) is
  'Agenda operacional: experimental respeita professor atribuido e nao duplica em slots ambiguos.';

comment on function public.get_agenda_semana(date, uuid) is
  'Agenda semanal legada: experimental respeita professor atribuido e nao duplica em slots ambiguos.';
