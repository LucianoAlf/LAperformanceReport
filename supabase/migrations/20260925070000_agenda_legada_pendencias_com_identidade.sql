-- Devolve identidade as pendencias do envelope legado da Agenda.
--
-- Incidente (Barra, 23/09/2026): no modo de rollout 'sombra'/'legado' a porta
-- get_agenda_dia_v2 publica fn_agenda_dia_legado_envelope_v1, que montava
-- pendencias via fn_presenca_pendencias_do_dia (v1). A v1 e apenas a projecao
-- de display da _v2 (motivo, professor, curso, turma, hora, aluno, detalhe) e
-- descarta slot_key, aula_emusys_id, aluno_id e professor_id. O front
-- AlertaPendencias so torna o item clicavel quando esses campos casam com uma
-- AulaAgenda; sem eles o botao renderizava disabled, sem erro nem toast — a
-- secretaria clicava e nada acontecia (8 dos 15 pendencias da Barra ficaram
-- assim; os outros 7 foram marcados pela gaveta da aula, caminho normal).
--
-- A correcao le pendencias/conflitos direto da fn_presenca_pendencias_do_dia_v2.
-- Como a v1 e literalmente a projecao dos mesmos arrays, o conjunto exibido
-- (e o mesmo que a Sol envia no relatorio) nao muda em uma linha — apenas os
-- campos de identidade passam a acompanhar cada item. O restante do envelope
-- (ocorrencias, professores_ocorrencias, aulas) segue inalterado, e o modo de
-- rollout continua decidido pela porta, nao por este adapter.

create or replace function public.fn_agenda_dia_legado_envelope_v1(
  p_data date,
  p_unidade_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_aulas jsonb;
  v_ocorrencias jsonb;
  v_professores jsonb;
  v_pendencias jsonb;
  v_conflitos jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb)
    into v_aulas
  from public.get_agenda_dia(p_data, p_unidade_id) g;

  select coalesce(jsonb_agg(jsonb_build_object(
    'slot_key', coalesce(aula ->> 'chave', 'legado:' || (aluno ->> 'aula_emusys_id')),
    'aluno_id', (aluno ->> 'aluno_id')::integer,
    'ids_aulas_emusys', jsonb_build_array((aluno ->> 'aula_emusys_id')::integer),
    'resultado_canonico', case lower(coalesce(aluno ->> 'status_presenca', ''))
      when 'presente' then 'presente'
      when 'falta' then 'falta'
      when 'ausente' then 'indeterminado'
      when 'falta_justificada' then 'falta_justificada'
      when 'justificada' then 'falta_justificada'
      else 'indeterminado'
    end,
    'fonte_decisao', coalesce(nullif(aluno ->> 'respondido_por', ''), 'legado'),
    'decidido_em', null,
    'possui_conflito', false,
    'request_id', null,
    'recibo_status', null
  )), '[]'::jsonb)
  into v_ocorrencias
  from jsonb_array_elements(v_aulas) aula
  cross join lateral jsonb_array_elements(coalesce(aula -> 'alunos', '[]'::jsonb)) aluno
  where nullif(aluno ->> 'aluno_id', '') is not null
    and nullif(aluno ->> 'aula_emusys_id', '') is not null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'aula_emusys_id', aula_id.value::integer,
    'professor_id', (aula ->> 'professor_id')::integer,
    'estado', case lower(coalesce(aula ->> 'professor_presenca', ''))
      when 'presente' then 'presente'
      when 'ausente' then 'indeterminado'
      else 'indeterminado'
    end,
    'fonte', 'legado',
    'decidido_em', null,
    'request_id', null,
    'recibo_status', null
  )), '[]'::jsonb)
  into v_professores
  from jsonb_array_elements(v_aulas) aula
  cross join lateral jsonb_array_elements_text(coalesce(aula -> 'aula_ids', '[]'::jsonb)) aula_id
  where nullif(aula ->> 'professor_id', '') is not null;

  with unidades_do_escopo as (
    select p_unidade_id as unidade_id
    where p_unidade_id is not null

    union

    select distinct nullif(aula ->> 'unidade_id', '')::uuid
    from jsonb_array_elements(v_aulas) aula
    where p_unidade_id is null
      and nullif(aula ->> 'unidade_id', '') is not null
  ), envelopes as (
    select public.fn_presenca_pendencias_do_dia_v2(u.unidade_id, p_data) as env
    from unidades_do_escopo u
  ), pendencias_do_escopo as (
    select item, 'pendencia'::text as grupo
    from envelopes e
    cross join lateral jsonb_array_elements(coalesce(e.env -> 'pendencias', '[]'::jsonb)) item
    union all
    select item, 'conflito'::text
    from envelopes e
    cross join lateral jsonb_array_elements(coalesce(e.env -> 'conflitos', '[]'::jsonb)) item
  )
  select
    coalesce(jsonb_agg(item) filter (where grupo = 'pendencia'), '[]'::jsonb),
    coalesce(jsonb_agg(item) filter (where grupo = 'conflito'), '[]'::jsonb)
  into v_pendencias, v_conflitos
  from pendencias_do_escopo;

  return jsonb_build_object(
    'dados_status', 'atualizados',
    'sincronizado_em', null,
    'regra_versao', 'presenca-legado-v1',
    'fonte', 'agenda-legado',
    'pendencias', v_pendencias,
    'conflitos', v_conflitos,
    'revisoes_estruturais', '[]'::jsonb,
    'ocorrencias', v_ocorrencias,
    'professores_ocorrencias', v_professores,
    'aulas', v_aulas
  );
end;
$$;

revoke all on function public.fn_agenda_dia_legado_envelope_v1(date, uuid)
  from public, anon, authenticated, service_role;

comment on function public.fn_agenda_dia_legado_envelope_v1(date, uuid) is
  'Envelope legado da Agenda; pendencias vem da _v2 (mesma lista da Sol) com identidade para abrir a chamada.';
