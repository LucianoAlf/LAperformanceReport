-- Overloads de compatibilidade: consumidores antigos podem adotar request_id
-- antes de migrar para as duas RPCs explícitas de criar/aplicar.

create or replace function public.app_registrar_chamada_agenda(
  p_itens jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $function$
declare v_aula_id integer;
begin
  v_aula_id := nullif(p_itens->0->>'aula_emusys_id','')::integer;
  perform public.app_criar_comando_presenca_v1(
    p_request_id,'agenda_chamada',null,v_aula_id,p_itens
  );
  return public.app_aplicar_comando_presenca_v1(p_request_id);
end
$function$;

create or replace function public.app_registrar_presencas_aula(
  p_aula_emusys_id integer,
  p_alunos_ausentes integer[],
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $function$
begin
  perform public.app_criar_comando_chamada_professor_v1(
    p_request_id,p_aula_emusys_id,p_alunos_ausentes
  );
  return public.app_aplicar_comando_presenca_v1(p_request_id);
end
$function$;

create or replace function public.fabio_registrar_presencas_aula(
  p_professor_id integer,
  p_aula_emusys_id integer,
  p_alunos_ausentes integer[],
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $function$
begin
  perform public.fabio_criar_comando_chamada_v1(
    p_request_id,p_professor_id,p_aula_emusys_id,p_alunos_ausentes,'professor_whatsapp'
  );
  return public.app_aplicar_comando_presenca_v1(p_request_id);
end
$function$;

create or replace function public.app_marcar_presenca_professor_aula(
  p_aula_emusys_id integer,p_presente boolean,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $function$
declare v_aula public.aulas_emusys%rowtype;
begin
  select * into v_aula from public.aulas_emusys where id=p_aula_emusys_id;
  if not found then raise exception 'aula_nao_encontrada'; end if;
  perform public.app_criar_comando_presenca_v1(
    p_request_id,'professor_aula',v_aula.unidade_id,p_aula_emusys_id,
    jsonb_build_array(jsonb_build_object('aula_emusys_id',p_aula_emusys_id,
      'professor_id',v_aula.professor_id,'status',case when p_presente then 'presente' else 'ausente' end))
  );
  return public.app_aplicar_comando_presenca_v1(p_request_id);
end $function$;

create or replace function public.app_registrar_presenca_professor_dia(
  p_professor_id integer,p_data date,p_unidade_id uuid,
  p_hora_chegada time without time zone,p_hora_saida time without time zone,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $function$
begin
  perform public.app_criar_comando_presenca_v1(
    p_request_id,'professor_dia',p_unidade_id,null,
    jsonb_build_array(jsonb_build_object('professor_id',p_professor_id,'data',p_data,'status','presente'))
  );
  return public.app_aplicar_comando_presenca_v1(p_request_id);
end $function$;

create or replace function public.app_remover_presenca_professor_dia(
  p_professor_id integer,p_data date,p_unidade_id uuid,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $function$
begin
  perform public.app_criar_comando_presenca_v1(
    p_request_id,'professor_dia_remover',p_unidade_id,null,
    jsonb_build_array(jsonb_build_object('professor_id',p_professor_id,'data',p_data,'status','ausente'))
  );
  return public.app_aplicar_comando_presenca_v1(p_request_id);
end $function$;

revoke all on function public.app_registrar_chamada_agenda(jsonb,uuid) from public,anon;
grant execute on function public.app_registrar_chamada_agenda(jsonb,uuid) to authenticated;
revoke all on function public.app_registrar_presencas_aula(integer,integer[],uuid) from public,anon;
grant execute on function public.app_registrar_presencas_aula(integer,integer[],uuid) to authenticated;
revoke all on function public.fabio_registrar_presencas_aula(integer,integer,integer[],uuid) from public,anon,authenticated;
grant execute on function public.fabio_registrar_presencas_aula(integer,integer,integer[],uuid) to service_role;
revoke all on function public.app_marcar_presenca_professor_aula(integer,boolean,uuid) from public,anon;
grant execute on function public.app_marcar_presenca_professor_aula(integer,boolean,uuid) to authenticated;
revoke all on function public.app_registrar_presenca_professor_dia(integer,date,uuid,time without time zone,time without time zone,uuid) from public,anon;
grant execute on function public.app_registrar_presenca_professor_dia(integer,date,uuid,time without time zone,time without time zone,uuid) to authenticated;
revoke all on function public.app_remover_presenca_professor_dia(integer,date,uuid,uuid) from public,anon;
grant execute on function public.app_remover_presenca_professor_dia(integer,date,uuid,uuid) to authenticated;

-- Fechamento do bypass: apenas os overloads com request_id permanecem públicos.
revoke all on function public.app_registrar_chamada_agenda(jsonb) from public,anon,authenticated;
revoke all on function public.app_registrar_presencas_aula(integer,integer[]) from public,anon,authenticated;
revoke all on function public.app_marcar_presenca_professor_aula(integer,boolean) from public,anon,authenticated;
revoke all on function public.app_registrar_presenca_professor_dia(integer,date,uuid,time without time zone,time without time zone) from public,anon,authenticated;
revoke all on function public.app_remover_presenca_professor_dia(integer,date,uuid) from public,anon,authenticated;
