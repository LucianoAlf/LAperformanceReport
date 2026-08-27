-- Fábio/LA Teacher: IDs estáveis do registro e da ação passam pelo mesmo ledger.

create or replace function public.fabio_registrar_presencas_aula(
  p_professor_id integer,
  p_aula_emusys_id integer,
  p_alunos_ausentes integer[] default '{}'::integer[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  raise exception 'request_id_obrigatorio_use_overload_4_argumentos' using errcode='22023';
end
$function$;

create or replace function public.fabio_confirmar_chamada_acao(
  p_acao_id uuid,
  p_professor_id integer,
  p_wa_message_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_acao public.fabio_acoes_pendentes%rowtype;
  v_existente jsonb;
  v_resultado jsonb;
  v_escrita jsonb;
  v_aula_id integer;
  v_ausentes integer[];
begin
  select resultado into v_existente from public.fabio_acao_eventos where wa_message_id=p_wa_message_id;
  if v_existente is not null then
    return jsonb_build_object('ok',true,'codigo','evento_existente','resultado',v_existente);
  end if;
  select * into v_acao from public.fabio_acoes_pendentes where id=p_acao_id for update;
  if not found then return jsonb_build_object('ok',false,'codigo','acao_nao_encontrada'); end if;
  if v_acao.professor_id is distinct from p_professor_id then
    return jsonb_build_object('ok',false,'codigo','acao_nao_pertence_ao_professor');
  end if;
  if v_acao.tipo<>'confirmar_chamada' or v_acao.estado<>'aberta' then
    return jsonb_build_object('ok',false,'codigo','acao_nao_confirmavel');
  end if;
  if v_acao.expira_em is not null and v_acao.expira_em<now() then
    update public.fabio_acoes_pendentes set estado='expirada',atualizado_em=now(),encerrado_em=now() where id=v_acao.id;
    return jsonb_build_object('ok',false,'codigo','acao_expirada');
  end if;
  v_aula_id := v_acao.aula_id;
  if v_aula_id is null or not(v_aula_id=any(v_acao.candidatas))
     or not public.fabio_shortlist_valida(p_professor_id,'chamada',array[v_aula_id],now()) then
    return jsonb_build_object('ok',false,'codigo','aula_fora_da_shortlist');
  end if;
  select coalesce(array_agg(value::integer),'{}'::integer[]) into v_ausentes
    from jsonb_array_elements_text(coalesce(v_acao.payload->'alunos_ausentes','[]'::jsonb));

  perform public.fabio_criar_comando_chamada_v1(
    p_acao_id,p_professor_id,v_aula_id,v_ausentes,'professor_whatsapp'
  );
  v_escrita := public.app_aplicar_comando_presenca_v1(p_acao_id);
  if v_escrita->>'status' <> 'concluido' then
    return jsonb_build_object('ok',false,'codigo','presenca_nao_aplicada','recibo',v_escrita);
  end if;

  update public.fabio_acoes_pendentes set estado='resolvida',ultima_resposta_wa_id=p_wa_message_id,
    atualizado_em=now(),encerrado_em=now() where id=v_acao.id;
  v_resultado := jsonb_build_object('ok',true,'codigo','chamada_confirmada',
    'acao',public.fabio_acao_json(v_acao.id),'escrita',v_escrita);
  insert into public.fabio_acao_eventos(acao_id,wa_message_id,evento,resultado)
  values(v_acao.id,p_wa_message_id,'confirmado',v_resultado);
  return v_resultado;
end
$function$;

create or replace function public.fabio_emitir_presenca_por_registro(p_registro_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_reg public.fabio_registros_aula%rowtype;
  v_aula_reg public.aulas_emusys%rowtype;
  v_ausentes integer[];
  v_ancora integer;
  v_roster_ind integer;
  v_tem_sinal boolean;
  v_res jsonb;
  v_fonte text;
  v_request_id uuid := md5('fabio-registro:'||p_registro_id::text)::uuid;
begin
  select * into v_reg from public.fabio_registros_aula where id=p_registro_id and parent_id is null;
  if not found then return jsonb_build_object('aplicado',false,'motivo','registro_nao_encontrado'); end if;
  v_fonte := case when v_reg.modo_entrada='manual' then 'professor_la_teacher' else 'fabio_audio' end;
  select * into v_aula_reg from public.aulas_emusys where id=v_reg.aula_id;
  if not found then
    update public.fabio_registros_aula set campos=coalesce(campos,'{}'::jsonb)||jsonb_build_object(
      'presenca_emitida',true,'presenca_emitida_em',now(),'presenca_aplicado',false,
      'presenca_erro','aula_do_registro_nao_encontrada','presenca_fonte',v_fonte,'presenca_request_id',v_request_id)
    where id=p_registro_id;
    return jsonb_build_object('aula_id',v_reg.aula_id,'aplicado',false,'motivo','aula_do_registro_nao_encontrada','request_id',v_request_id);
  end if;
  if v_reg.aluno_id is not null then
    v_ancora := v_reg.aula_id;
    select count(*) into v_roster_ind from public.aula_alunos_emusys
     where aula_emusys_id=v_ancora and aluno_id is not null and ativo_operacional;
    if coalesce(v_roster_ind,0)>1 then
      update public.fabio_registros_aula set campos=coalesce(campos,'{}'::jsonb)||jsonb_build_object(
        'presenca_emitida',true,'presenca_emitida_em',now(),'presenca_aplicado',false,
        'presenca_erro','registro_individual_em_aula_de_turma','presenca_fonte',v_fonte,
        'presenca_request_id',v_request_id)
      where id=p_registro_id;
      return jsonb_build_object('aula_id',v_ancora,'aplicado',false,'motivo','registro_individual_em_aula_de_turma');
    end if;
    v_tem_sinal := (v_reg.campos->>'presenca') is not null;
    v_ausentes := case when coalesce(v_reg.campos->>'presenca','presente')='ausente'
      then array[v_reg.aluno_id] else '{}'::integer[] end;
  else
    if coalesce(v_aula_reg.tipo,'')='turma' then v_ancora:=v_reg.aula_id;
    else
      select coalesce((select t.id from public.aulas_emusys t where t.tipo='turma'
        and t.unidade_id=v_aula_reg.unidade_id and t.data_hora_inicio=v_aula_reg.data_hora_inicio
        and t.professor_id is not distinct from v_reg.professor_id and coalesce(t.cancelada,false)=false limit 1),v_reg.aula_id)
      into v_ancora;
    end if;
    select coalesce(array_agg(f.aluno_id) filter(where coalesce(f.campos->>'presenca','presente')='ausente' and f.aluno_id is not null),'{}'::integer[])
      into v_ausentes from public.fabio_registros_aula f where f.parent_id=p_registro_id;
    v_tem_sinal := exists(select 1 from public.fabio_registros_aula f where f.parent_id=p_registro_id and (f.campos->>'presenca') is not null);
  end if;
  if not coalesce(v_tem_sinal,false) then
    return jsonb_build_object('aula_id',v_ancora,'aplicado',false,'motivo','sem_sinal_de_presenca_no_registro');
  end if;

  begin
    perform public.fabio_criar_comando_chamada_v1(v_request_id,v_reg.professor_id,v_ancora,v_ausentes,v_fonte);
    v_res := public.app_aplicar_comando_presenca_v1(v_request_id);
  exception when others then
    v_res := jsonb_build_object('request_id',v_request_id,'status','falhou','aplicados',0,'rejeitados',0,
      'erros',jsonb_build_array(jsonb_build_object('codigo',upper(left(regexp_replace(sqlerrm,'[^a-zA-Z0-9_]+','_','g'),80)))));
  end;
  update public.fabio_registros_aula set campos=coalesce(campos,'{}'::jsonb)||jsonb_build_object(
    'presenca_emitida',true,'presenca_emitida_em',now(),
    'presenca_aplicado',v_res->>'status'='concluido',
    'presenca_erro',case when v_res->>'status'='concluido' then null else v_res->>'status' end,
    'presenca_fonte',v_fonte,'presenca_request_id',v_request_id)
  where id=p_registro_id;
  return v_res||jsonb_build_object('ausentes',to_jsonb(coalesce(v_ausentes,'{}'::integer[])),'fonte',v_fonte);
end
$function$;

revoke all on function public.fabio_registrar_presencas_aula(integer,integer,integer[]) from public,anon,authenticated;
grant execute on function public.fabio_registrar_presencas_aula(integer,integer,integer[]) to service_role;
revoke all on function public.fabio_confirmar_chamada_acao(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.fabio_confirmar_chamada_acao(uuid,integer,text) to service_role;
revoke all on function public.fabio_emitir_presenca_por_registro(uuid) from public,anon,authenticated;
grant execute on function public.fabio_emitir_presenca_por_registro(uuid) to service_role;
