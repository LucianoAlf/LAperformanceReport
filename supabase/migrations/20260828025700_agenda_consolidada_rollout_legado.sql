-- Mantem a Agenda consolidada funcional durante sombra/rollback.
--
-- A porta get_agenda_dia_v2 aceita p_unidade_id nulo, mas o envelope legado
-- chamava fn_presenca_pendencias_do_dia uma unica vez com NULL. Essa funcao e
-- intencionalmente fail-closed e exige unidade, portanto o filtro Consolidado
-- recebia UNIDADE_E_DATA_OBRIGATORIAS e zerava a tela.
-- A redefinicao preserva ainda a regra ja publicada: ausencia bruta nunca vira
-- falta nem ausencia terminal; somente decisoes humanas/canonicas fecham estado.
--
-- O escopo abaixo vem das proprias aulas que a porta legada ja devolvera. Assim
-- nao consultamos um catalogo mais amplo nem acrescentamos unidades ao universo
-- da resposta. A porta publica tambem reestabelece explicitamente a autorizacao
-- que existia na implementacao canonica antes de o adapter de rollout assumir.

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
  ), pendencias_do_escopo as (
    select p.*
    from unidades_do_escopo u
    cross join lateral public.fn_presenca_pendencias_do_dia(u.unidade_id, p_data) p
  )
  select
    coalesce(jsonb_agg(to_jsonb(p)) filter (where p.motivo = 'sem_resposta'), '[]'::jsonb),
    coalesce(jsonb_agg(to_jsonb(p)) filter (where p.motivo = 'divergencia'), '[]'::jsonb)
  into v_pendencias, v_conflitos
  from pendencias_do_escopo p;

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

create or replace function public.get_agenda_dia_v2(
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
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_modo text;
  v_resultado jsonb;
begin
  if p_data is null then
    raise exception 'DATA_OBRIGATORIA' using errcode = '22023';
  end if;

  if v_role <> 'service_role'
     and session_user::text not in ('postgres', 'service_role') then
    if p_unidade_id is null then
      if v_role <> 'authenticated' or not (select public.is_admin()) then
        raise insufficient_privilege using message = 'CONSOLIDADO_REQUER_ADMIN';
      end if;
    elsif v_role <> 'authenticated'
       or not (
         (select public.is_admin())
         or p_unidade_id in (select public.get_user_unidade_ids())
       ) then
      raise insufficient_privilege using message = 'UNIDADE_NAO_AUTORIZADA';
    end if;
  end if;

  v_modo := public.fn_presenca_rollout_modo_escopo_interno_v1(
    p_unidade_id,
    'agenda'
  );

  if v_modo = 'canonico_v2' then
    return public.get_agenda_dia_canonica_v2(p_data, p_unidade_id)
      || jsonb_build_object('rollout_modo', v_modo);
  end if;

  if v_modo = 'sombra' then
    begin
      perform public.get_agenda_dia_canonica_v2(p_data, p_unidade_id);
    exception when others then
      null;
    end;
  end if;

  v_resultado := public.fn_agenda_dia_legado_envelope_v1(p_data, p_unidade_id);
  return v_resultado || jsonb_build_object('rollout_modo', v_modo);
end;
$$;

revoke all on function public.get_agenda_dia_v2(date, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_agenda_dia_v2(date, uuid)
  to authenticated, service_role;

comment on function public.fn_agenda_dia_legado_envelope_v1(date, uuid) is
  'Envelope legado da Agenda; no consolidado consulta pendencias por unidade ja visivel no proprio universo de aulas.';

comment on function public.get_agenda_dia_v2(date, uuid) is
  'Porta governada da Agenda: aplica ACL explicita e publica legado, sombra ou canonico v2 por unidade.';
