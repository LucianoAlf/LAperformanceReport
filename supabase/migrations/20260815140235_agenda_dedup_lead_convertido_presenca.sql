-- 2026-08-15 — Não duplicar lead experimental convertido como pendência
--
-- Um lead convertido pode continuar em lead_experimentais com status
-- experimental_agendada, inclusive depois de um reagendamento. Quando a mesma
-- identidade já está no roster ou em aluno_presenca da aula, a chamada deve ser
-- cobrada pelo registro do aluno. O lead comercial não pode abrir uma segunda
-- pendência para a mesma pessoa.
--
-- A migration só substitui as definições das duas RPCs. Não altera histórico,
-- presença, lead, decisão humana ou qualquer linha operacional.

do $migration$
declare
  v_signature text;
  v_def text;
  v_inicio integer;
  v_fim integer;
  v_bloco text := $sql$
participantes as (
  select distinct b.chave, aa.aluno_id
  from base b
  join aula_alunos_emusys aa on aa.aula_emusys_id = b.id
  where aa.aluno_id is not null
  union
  select distinct b.chave, ap.aluno_id
  from base b
  join aluno_presenca ap on ap.aula_emusys_id = b.id
  where ap.aluno_id is not null
),
experimentais as (
  select b.chave,
         jsonb_agg(distinct jsonb_build_object(
           'experimental_id', le.id,
           'lead_id', le.lead_id,
           'aluno_id', coalesce(le.aluno_id, l.aluno_id),
           'nome', le.nome_aluno,
           'curso', c.nome,
           'curso_interesse_id', le.curso_interesse_id,
           'telefone', l.telefone,
           'canal', co.nome,
           'canal_origem_id', l.canal_origem_id,
           'faixa_etaria', l.faixa_etaria,
           'professor_experimental_id', le.professor_experimental_id,
           'professor_nome', prof.nome,
           'status', le.status::text,
           'observacoes', nullif(btrim(le.observacoes), '')
         )) as leads
  from base b
  join lead_experimentais le
    on le.unidade_id = b.unidade_id
   and le.data_experimental = b.data_aula
   and le.horario_experimental = (b.data_hora_inicio at time zone 'America/Sao_Paulo')::time
  left join cursos c on c.id = le.curso_interesse_id
  left join leads l on l.id = le.lead_id
  left join canais_origem co on co.id = l.canal_origem_id
  left join professores prof on prof.id = le.professor_experimental_id
  where b.categoria = 'experimental'
    and le.status::text <> 'cancelada'
    and (
      coalesce(le.aluno_id, l.aluno_id) is null
      or not exists (
        select 1
        from participantes p
        where p.chave = b.chave
          and p.aluno_id = coalesce(le.aluno_id, l.aluno_id)
      )
    )
  group by b.chave
),
$sql$;
begin
  foreach v_signature in array array[
    'public.get_agenda_dia(date, uuid)',
    'public.get_agenda_semana(date, uuid)'
  ] loop
    v_def := pg_get_functiondef(v_signature::regprocedure);
    v_inicio := position('experimentais as (' in v_def);
    v_fim := position('vinculos_cru as (' in v_def);

    if v_inicio = 0 or v_fim = 0 or v_fim <= v_inicio then
      raise exception 'guarda: bloco experimentais/vinculos_cru nao encontrado em %', v_signature;
    end if;

    execute left(v_def, v_inicio - 1) || v_bloco || substr(v_def, v_fim);
  end loop;
end
$migration$;

revoke all on function public.get_agenda_dia(date, uuid) from public;
revoke all on function public.get_agenda_dia(date, uuid) from anon;
grant execute on function public.get_agenda_dia(date, uuid) to authenticated;
grant execute on function public.get_agenda_dia(date, uuid) to service_role;

revoke all on function public.get_agenda_semana(date, uuid) from public;
revoke all on function public.get_agenda_semana(date, uuid) from anon;
grant execute on function public.get_agenda_semana(date, uuid) to authenticated;
grant execute on function public.get_agenda_semana(date, uuid) to service_role;
