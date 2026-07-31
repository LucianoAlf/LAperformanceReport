begin;

create or replace function public.aplicar_snapshot_experimentais_emusys_admitido_v1(
  p_admissao_id uuid,
  p_execucao_id uuid,
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_itens jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_agora timestamptz;
  v_admissao public.emusys_experimentais_refresh_admissoes%rowtype;
begin
  select a.*
  into v_admissao
  from public.emusys_experimentais_refresh_admissoes a
  where a.id = p_admissao_id
    and a.snapshot_execucao_id = p_execucao_id
    and a.unidade_id = p_unidade_id
    and a.data_inicio = p_data_inicio
    and a.data_fim = p_data_fim
    and a.status = 'em_andamento'
  for update;

  if not found then
    raise exception 'SNAPSHOT_ADMISSAO_FENCING_INVALIDO'
      using errcode = '22023';
  end if;

  v_agora := clock_timestamp();
  if v_admissao.lease_ate <= v_agora then
    raise exception 'SNAPSHOT_ADMISSAO_LEASE_EXPIRADO'
      using errcode = '22023';
  end if;

  return public.aplicar_snapshot_experimentais_emusys_v1(
    p_execucao_id,
    p_unidade_id,
    p_data_inicio,
    p_data_fim,
    p_itens
  );
end;
$function$;

revoke all on function public.aplicar_snapshot_experimentais_emusys_admitido_v1(
  uuid,
  uuid,
  uuid,
  date,
  date,
  jsonb
) from public, anon, authenticated;
grant execute on function public.aplicar_snapshot_experimentais_emusys_admitido_v1(
  uuid,
  uuid,
  uuid,
  date,
  date,
  jsonb
) to service_role;

commit;
