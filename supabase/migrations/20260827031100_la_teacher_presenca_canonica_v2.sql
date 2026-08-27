-- Checkpoint 6: o LA Teacher recebe a mesma ocorrencia canonica v2 da Agenda.
-- A funcao anterior e preservada como base de grade; este wrapper apenas
-- acrescenta frescor e decisao por aluno, sem manter uma segunda regra.

do $mig$
declare
  v_def text;
  v_base_def text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'app_minha_agenda_sessao'
    and pg_get_function_identity_arguments(p.oid) = 'p_data date';

  v_base_def := regexp_replace(
    v_def,
    'FUNCTION public\.app_minha_agenda_sessao\(',
    'FUNCTION public.app_minha_agenda_sessao_base_v1(',
    'i'
  );
  if v_base_def = v_def then
    raise exception 'assinatura app_minha_agenda_sessao nao encontrada';
  end if;
  execute v_base_def;
end
$mig$;

revoke all on function public.app_minha_agenda_sessao_base_v1(date)
  from public, anon, authenticated, service_role;

create or replace function public.app_minha_agenda_sessao(p_data date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_professor_id integer := public.fn_professor_do_usuario();
  v_base jsonb;
  v_status text := 'atualizados';
  v_sincronizado_em timestamptz;
  v_frescor jsonb;
  v_tem_revisao boolean;
  v_unidade record;
  v_sessao jsonb;
  v_aluno jsonb;
  v_alunos jsonb;
  v_saida jsonb := '[]'::jsonb;
  v_ocorrencia record;
  v_aula_alvo integer;
begin
  if v_professor_id is null then
    return jsonb_build_object('erro', 'sem_professor_vinculado');
  end if;
  if p_data is null then
    raise exception 'DATA_OBRIGATORIA' using errcode = '22023';
  end if;

  v_base := public.app_minha_agenda_sessao_base_v1(p_data);
  if jsonb_typeof(v_base) <> 'array' then
    return v_base;
  end if;

  for v_unidade in
    select distinct ae.unidade_id
    from public.aulas_emusys ae
    where ae.professor_id = v_professor_id
      and ae.data_aula = p_data
      and ae.data_hora_fim < now()
      and not coalesce(ae.cancelada, false)
  loop
    v_frescor := public.fn_presenca_dados_frescos_interno_v1(v_unidade.unidade_id, p_data);
    if coalesce((v_frescor ->> 'publicavel')::boolean, false) is not true then
      v_status := 'dados_desatualizados';
    end if;
    if nullif(v_frescor ->> 'finalizada_em', '') is not null then
      v_sincronizado_em := least(
        coalesce(v_sincronizado_em, (v_frescor ->> 'finalizada_em')::timestamptz),
        (v_frescor ->> 'finalizada_em')::timestamptz
      );
    end if;

    select exists (
      select 1
      from public.aulas_emusys ae
      left join public.aula_roster_sync_estado re on re.aula_id = ae.id
      where ae.professor_id = v_professor_id
        and ae.unidade_id = v_unidade.unidade_id
        and ae.data_aula = p_data
        and ae.data_hora_fim < now()
        and coalesce(ae.categoria, 'normal') = 'normal'
        and not coalesce(ae.cancelada, false)
        and (
          coalesce(re.estado, 'sem_fotografia') in ('incompleto', 'ambiguo', 'sem_fotografia')
          or re.sincronizado_em is null
          or re.sincronizado_em < p_data::timestamp at time zone 'America/Sao_Paulo'
          or (
            nullif(v_frescor ->> 'finalizada_em', '') is not null
            and re.sincronizado_em > (v_frescor ->> 'finalizada_em')::timestamptz
          )
        )
    ) into v_tem_revisao;
    if v_tem_revisao and v_status = 'atualizados' then
      v_status := 'roster_em_revisao';
    end if;
  end loop;

  for v_sessao in select value from jsonb_array_elements(v_base)
  loop
    v_alunos := '[]'::jsonb;
    for v_aluno in select value from jsonb_array_elements(coalesce(v_sessao -> 'alunos', '[]'::jsonb))
    loop
      v_aula_alvo := nullif(v_aluno ->> 'aula_id_alvo', '')::integer;
      v_ocorrencia := null;
      if v_status = 'atualizados' and nullif(v_aluno ->> 'aluno_id', '') is not null then
        select o.resultado_canonico, o.fonte_decisao, o.fecha_chamada,
               o.decidido_em, o.possui_conflito
          into v_ocorrencia
        from public.vw_presenca_ocorrencia_canonica_v2 o
        where o.aluno_id = (v_aluno ->> 'aluno_id')::integer
          and o.professor_id = v_professor_id
          and o.data_aula = p_data
          and v_aula_alvo = any(o.ids_aulas_emusys)
        order by o.fecha_chamada desc, o.decidido_em desc nulls last, o.slot_key
        limit 1;
      end if;

      if v_status <> 'atualizados' then
        v_aluno := v_aluno || jsonb_build_object(
          'presenca_estado_v2', v_status,
          'presenca_fonte', null,
          'presenca_travada', true,
          'presenca_decidida_em', null,
          'presenca_conflito', false,
          'presenca_regra_versao', 'presenca-v2'
        );
      elsif v_ocorrencia.resultado_canonico is not null then
        v_aluno := v_aluno || jsonb_build_object(
          'presenca_estado_v2', v_ocorrencia.resultado_canonico,
          'presenca_fonte', v_ocorrencia.fonte_decisao,
          'presenca_travada', v_ocorrencia.fecha_chamada,
          'presenca_decidida_em', v_ocorrencia.decidido_em,
          'presenca_conflito', v_ocorrencia.possui_conflito,
          'presenca_regra_versao', 'presenca-v2'
        );
      else
        v_aluno := v_aluno || jsonb_build_object(
          'presenca_estado_v2', 'indeterminado',
          'presenca_fonte', null,
          'presenca_travada', false,
          'presenca_decidida_em', null,
          'presenca_conflito', false,
          'presenca_regra_versao', 'presenca-v2'
        );
      end if;
      v_alunos := v_alunos || jsonb_build_array(v_aluno);
    end loop;
    v_saida := v_saida || jsonb_build_array(jsonb_set(v_sessao, '{alunos}', v_alunos, true));
  end loop;

  return jsonb_build_object(
    'dados_status', v_status,
    'sincronizado_em', v_sincronizado_em,
    'regra_versao', 'presenca-v2',
    'sessoes', v_saida
  );
end
$function$;

revoke all on function public.app_minha_agenda_sessao(date)
  from public, anon, authenticated, service_role;
grant execute on function public.app_minha_agenda_sessao(date)
  to authenticated;

comment on function public.app_minha_agenda_sessao(date) is
  'Agenda do professor enriquecida pela ocorrencia canonica v2; estado estrutural bloqueia nova decisao sem inventar falta.';
