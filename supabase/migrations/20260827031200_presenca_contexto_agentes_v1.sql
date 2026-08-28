-- Checkpoint 7: uma porta de presença por finalidade de agente.
-- Nenhum escopo recebe o espelho bruto; ausência Emusys continua indeterminada
-- até a ocorrência v2 ou uma decisão humana fecharem a chamada.

create or replace function public.get_presenca_contexto_agente_v1(
  p_unidade_id uuid,
  p_data date,
  p_escopo text,
  p_professor_id integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_escopo text := lower(btrim(coalesce(p_escopo, '')));
  v_claim_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_sessao text := session_user::text;
  v_envelope jsonb;
  v_ocorrencias jsonb := '[]'::jsonb;
  v_universo integer := 0;
  v_presentes integer := 0;
  v_faltas integer := 0;
  v_indeterminados integer := 0;
  v_conflitos integer := 0;
  v_publicacao text;
begin
  if p_unidade_id is null or p_data is null then
    raise exception 'UNIDADE_E_DATA_OBRIGATORIAS' using errcode = '22023';
  end if;
  if v_escopo not in ('sol', 'lia', 'mila', 'fabio', 'bi') then
    raise exception 'ESCOPO_PRESENCA_INVALIDO' using errcode = '22023';
  end if;

  -- Edge Functions usam service_role. Os papeis SQL restritos somente podem
  -- solicitar a finalidade que lhes pertence.
  if v_claim_role <> 'service_role' and v_sessao not in ('postgres', 'service_role') then
    if not (
      (v_sessao = 'sol_acesso_restrito' and v_escopo = 'sol')
      or (v_sessao = 'lia_acesso_restrito' and v_escopo = 'lia')
      or (v_sessao = 'mila_acesso_restrito' and v_escopo = 'mila')
      or (
        v_claim_role = 'authenticated'
        and v_escopo = 'sol'
        and (
          (select public.is_admin())
          or p_unidade_id in (select public.get_user_unidade_ids())
        )
      )
    ) then
      raise insufficient_privilege using message = 'ESCOPO_AGENTE_NAO_AUTORIZADO';
    end if;
  end if;

  if v_escopo = 'mila' then
    return jsonb_build_object(
      'dados_status', 'contrato_experimental',
      'sincronizado_em', null,
      'regra_versao', 'presenca-experimental-lead-v1',
      'periodo', jsonb_build_object('inicio', p_data, 'fim', p_data),
      'universo_eventos', 0,
      'presentes', 0,
      'faltas_confirmadas', 0,
      'indeterminados', 0,
      'conflitos', 0,
      'revisoes_estruturais', 0,
      'estado_publicacao', 'contrato_experimental',
      'fonte', 'vw_conciliacao_experimentais_v2',
      'experimentais', jsonb_build_object(
        'contrato', 'lead_ou_vinculo_experimental',
        'presenca_regular_como_atalho', false
      )
    );
  end if;

  v_envelope := public.fn_presenca_pendencias_do_dia_v2(p_unidade_id, p_data);

  select
    count(*) filter (where resultado_canonico not in ('aula_cancelada', 'aula_justificada'))::integer,
    count(*) filter (where resultado_canonico = 'presente' and not possui_conflito)::integer,
    count(*) filter (where resultado_canonico in ('falta', 'falta_justificada') and not possui_conflito)::integer,
    count(*) filter (where resultado_canonico = 'indeterminado' and not possui_conflito)::integer,
    count(*) filter (where possui_conflito)::integer
  into v_universo, v_presentes, v_faltas, v_indeterminados, v_conflitos
  from public.vw_presenca_ocorrencia_canonica_v2 o
  where o.unidade_id = p_unidade_id
    and o.data_aula = p_data
    and (v_escopo <> 'fabio' or (p_professor_id is not null and o.professor_id = p_professor_id));

  -- O read model contém decisões existentes; o roster canônico acrescenta as
  -- ocorrências ainda sem linha, que são indeterminadas (jamais faltas).
  if v_escopo <> 'fabio' then
    v_indeterminados := v_indeterminados
      + jsonb_array_length(coalesce(v_envelope -> 'pendencias', '[]'::jsonb));
  end if;
  v_universo := v_presentes + v_faltas + v_indeterminados + v_conflitos;

  if (v_envelope ->> 'dados_status') = 'atualizados' then
    v_publicacao := 'publicavel';
  else
    v_publicacao := 'em_auditoria';
    v_presentes := 0;
    v_faltas := 0;
    v_indeterminados := 0;
    v_conflitos := jsonb_array_length(coalesce(v_envelope -> 'conflitos', '[]'::jsonb));
  end if;

  if v_escopo = 'fabio' then
    if p_professor_id is null then
      raise exception 'PROFESSOR_OBRIGATORIO_PARA_FABIO' using errcode = '22023';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'slot_key', o.slot_key,
      'aluno_id', o.aluno_id,
      'professor_id', o.professor_id,
      'inicio', o.data_hora_inicio,
      'fim', o.data_hora_fim,
      'curso', o.curso_nome,
      'resultado_canonico', o.resultado_canonico,
      'fonte_decisao', o.fonte_decisao,
      'decidido_em', o.decidido_em,
      'possui_conflito', o.possui_conflito,
      'regra_versao', o.regra_versao
    ) order by o.data_hora_inicio, o.aluno_id), '[]'::jsonb)
    into v_ocorrencias
    from public.vw_presenca_ocorrencia_canonica_v2 o
    where o.unidade_id = p_unidade_id
      and o.data_aula = p_data
      and o.professor_id = p_professor_id;
  end if;

  return jsonb_build_object(
    'dados_status', v_envelope ->> 'dados_status',
    'sincronizado_em', v_envelope -> 'sincronizado_em',
    'regra_versao', 'presenca-agentes-v1+presenca-v2',
    'periodo', jsonb_build_object('inicio', p_data, 'fim', p_data),
    'universo_eventos', case when v_publicacao = 'publicavel' then v_universo else null end,
    'presentes', case when v_publicacao = 'publicavel' then v_presentes else null end,
    'faltas_confirmadas', case when v_publicacao = 'publicavel' then v_faltas else null end,
    'indeterminados', case when v_publicacao = 'publicavel' then v_indeterminados else null end,
    'conflitos', v_conflitos,
    'revisoes_estruturais', jsonb_array_length(coalesce(v_envelope -> 'revisoes_estruturais', '[]'::jsonb)),
    'estado_publicacao', v_publicacao,
    'fonte', 'vw_presenca_ocorrencia_canonica_v2',
    'pendencias', case when v_escopo = 'sol' then coalesce(v_envelope -> 'pendencias', '[]'::jsonb) else '[]'::jsonb end,
    'conflitos_detalhes', case when v_escopo = 'sol' then coalesce(v_envelope -> 'conflitos', '[]'::jsonb) else '[]'::jsonb end,
    'revisoes_estruturais_detalhes', case when v_escopo = 'sol' then coalesce(v_envelope -> 'revisoes_estruturais', '[]'::jsonb) else '[]'::jsonb end,
    'ocorrencias', case when v_escopo = 'fabio' then v_ocorrencias else '[]'::jsonb end
  );
end;
$$;

revoke all on function public.get_presenca_contexto_agente_v1(uuid, date, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_presenca_contexto_agente_v1(uuid, date, text, integer)
  to service_role;

do $grants$
begin
  if exists (select 1 from pg_roles where rolname = 'sol_acesso_restrito') then
    grant execute on function public.get_presenca_contexto_agente_v1(uuid, date, text, integer) to sol_acesso_restrito;
  end if;
  if exists (select 1 from pg_roles where rolname = 'lia_acesso_restrito') then
    grant execute on function public.get_presenca_contexto_agente_v1(uuid, date, text, integer) to lia_acesso_restrito;
    revoke select on table public.aluno_presenca from lia_acesso_restrito;
  end if;
  if exists (select 1 from pg_roles where rolname = 'mila_acesso_restrito') then
    grant execute on function public.get_presenca_contexto_agente_v1(uuid, date, text, integer) to mila_acesso_restrito;
  end if;
end;
$grants$;

comment on function public.get_presenca_contexto_agente_v1(uuid, date, text, integer) is
  'Envelope de presenca por finalidade. Sol recebe pendencias nominais; Lia e BI somente agregados; Mila recebe apenas o contrato experimental; Fabio exige professor_id.';

-- A Sol continua sendo entregue pela fila SQL, mas agora o texto nasce da porta
-- por finalidade. Isso impede a Edge de manter uma segunda regra de chamada.
create or replace function public.fn_texto_relatorio_presenca(
  p_unidade_id uuid,
  p_data date
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_unidade text;
  v_contexto jsonb;
  v_status text;
  v_txt text;
  v_item jsonb;
  v_qtd_pendencias integer;
  v_qtd_conflitos integer;
  v_sync timestamptz;
begin
  select nome into v_unidade from public.unidades where id = p_unidade_id;
  v_contexto := public.get_presenca_contexto_agente_v1(p_unidade_id, p_data, 'sol');
  v_status := v_contexto ->> 'dados_status';
  v_sync := nullif(v_contexto ->> 'sincronizado_em', '')::timestamptz;

  v_txt := 'PRESENCA - PENDENCIAS' || E'\n' || upper(coalesce(v_unidade, '?')) || E'\n'
    || to_char(p_data, 'DD/MM/YYYY') || E'\n';
  if v_status = 'dados_desatualizados' then
    return v_txt || E'\nDADOS DE PRESENCA AINDA NAO PUBLICAVEIS.\nA sincronizacao do Emusys nao concluiu para este dia.\nNenhuma pendencia nominal foi atribuida a equipe.\n';
  elsif v_status = 'roster_em_revisao' then
    return v_txt || E'\nROSTER EM REVISAO ESTRUTURAL.\nA fotografia de alunos esta incompleta ou ambigua.\nNenhuma pendencia nominal foi atribuida a equipe.\n';
  end if;

  v_txt := v_txt || 'Dados sincronizados às '
    || coalesce(to_char(v_sync at time zone 'America/Sao_Paulo', 'HH24:MI'), '--:--') || E'\n';
  v_qtd_pendencias := jsonb_array_length(v_contexto -> 'pendencias');
  v_qtd_conflitos := jsonb_array_length(v_contexto -> 'conflitos_detalhes');
  if v_qtd_pendencias = 0 and v_qtd_conflitos = 0 then
    return v_txt || E'\nTudo fechado. Nenhuma pendencia de presenca.\n';
  end if;
  if v_qtd_pendencias > 0 then
    v_txt := v_txt || E'\nSEM PRESENCA E SEM FALTA (' || v_qtd_pendencias || E')\nninguem fechou a chamada - nao e falta do aluno\n';
    for v_item in select value from jsonb_array_elements(v_contexto -> 'pendencias') loop
      v_txt := v_txt || '- ' || (v_item ->> 'hora') || ' - ' || (v_item ->> 'aluno_nome')
        || ' (' || (v_item ->> 'curso_nome') || ')' || E'\n';
    end loop;
  end if;
  if v_qtd_conflitos > 0 then
    v_txt := v_txt || E'\nRESPOSTAS QUE NAO BATEM (' || v_qtd_conflitos || E')\n';
    for v_item in select value from jsonb_array_elements(v_contexto -> 'conflitos_detalhes') loop
      v_txt := v_txt || '- ' || (v_item ->> 'hora') || ' - ' || (v_item ->> 'aluno_nome')
        || ' (' || (v_item ->> 'curso_nome') || ')' || E'\n';
    end loop;
  end if;
  return v_txt || E'\nCorrijam no app ou na agenda. O que ficar sem resposta continua aparecendo amanha.\n';
end;
$$;

revoke all on function public.fn_texto_relatorio_presenca(uuid, date)
  from public, anon, authenticated, service_role;
grant execute on function public.fn_texto_relatorio_presenca(uuid, date)
  to authenticated, service_role;
