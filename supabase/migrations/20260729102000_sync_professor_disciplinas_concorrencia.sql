begin;

create unique index if not exists uq_emusys_professor_disciplinas_sync_unidade_em_andamento
  on public.emusys_professor_disciplinas_sync_execucoes (unidade_id)
  where status = 'em_andamento';

create or replace function public.iniciar_sync_professor_disciplinas_emusys_v1(
  p_unidade_id uuid,
  p_origem text,
  p_solicitado_por integer default null,
  p_modo text default 'diagnostico'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_execucao_id uuid;
  v_execucao_em_andamento uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user <> 'postgres' then
    raise exception 'acesso_negado'
      using errcode = '42501';
  end if;

  if p_origem not in ('manual', 'cron') then
    raise exception 'origem_invalida'
      using errcode = '22023';
  end if;

  if p_modo <> 'diagnostico' then
    raise exception 'modo_invalido'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'sync_professor_disciplinas_emusys:' || p_unidade_id::text,
      0
    )
  );

  update public.emusys_professor_disciplinas_sync_execucoes execucao
     set status = 'falhou',
         finalizado_em = now(),
         falhas = coalesce(execucao.falhas, '[]'::jsonb)
           || jsonb_build_array(jsonb_build_object(
             'codigo', 'EXECUCAO_ABANDONADA',
             'etapa', 'concorrencia'
           )),
         estatisticas = coalesce(execucao.estatisticas, '{}'::jsonb)
           || jsonb_build_object('liberada_por_timeout_em', now()),
         updated_at = now()
   where execucao.unidade_id = p_unidade_id
     and execucao.status = 'em_andamento'
     and execucao.iniciado_em < now() - interval '15 minutes';

  select execucao.id
    into v_execucao_em_andamento
  from public.emusys_professor_disciplinas_sync_execucoes execucao
  where execucao.unidade_id = p_unidade_id
    and execucao.status = 'em_andamento'
  limit 1;

  if v_execucao_em_andamento is not null then
    raise exception 'sync_ja_em_andamento'
      using
        errcode = '55000',
        detail = v_execucao_em_andamento::text;
  end if;

  insert into public.emusys_professor_disciplinas_sync_execucoes (
    unidade_id,
    origem,
    status,
    solicitado_por,
    estatisticas
  )
  values (
    p_unidade_id,
    p_origem,
    'em_andamento',
    p_solicitado_por,
    jsonb_build_object('modo', p_modo)
  )
  returning id into v_execucao_id;

  return v_execucao_id;
end;
$function$;

revoke all on function public.iniciar_sync_professor_disciplinas_emusys_v1(
  uuid,
  text,
  integer,
  text
) from public, anon, authenticated;

grant execute on function public.iniciar_sync_professor_disciplinas_emusys_v1(
  uuid,
  text,
  integer,
  text
) to service_role;

comment on function public.iniciar_sync_professor_disciplinas_emusys_v1(
  uuid,
  text,
  integer,
  text
) is
  'Reivindica atomicamente uma unidade para o sync do catalogo Emusys; rejeita concorrencia e libera execucoes abandonadas apos 15 minutos.';

commit;
