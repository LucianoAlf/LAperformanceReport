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

  select
    coalesce(jsonb_agg(to_jsonb(p)) filter (where p.motivo = 'sem_resposta'), '[]'::jsonb),
    coalesce(jsonb_agg(to_jsonb(p)) filter (where p.motivo = 'divergencia'), '[]'::jsonb)
  into v_pendencias, v_conflitos
  from public.fn_presenca_pendencias_do_dia(p_unidade_id, p_data) p;

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
  'Envelope de rollback fail-closed: ausência bruta não vira decisão terminal; política temporal vive somente na projeção canônica.';
