-- Os tres RPCs abaixo sao a excecao publica por token. A migration anterior
-- preservou papeis internos por ordem de operacao; aqui a ACL fica minima e
-- explicita: anon, authenticated e service_role.
do $$
declare
  v_fn regprocedure;
  v_role text;
  v_roles text[] := array[
    'fabio_agent',
    'fabio_motor_v2_snapshot_ro',
    'la_os_leitor',
    'la_os_triador',
    'lia_acesso_restrito',
    'maria_lareport_rpc',
    'mila_acesso_restrito',
    'ml_jobs',
    'monitor_coletor',
    'sol_acesso_restrito',
    'sol_atendimento_externo',
    'sol_caixa_readonly',
    'sol_estrategico',
    'sol_operacional',
    'sol_tatico'
  ];
begin
  foreach v_fn in array array[
    'public.get_anamnese_publica(text)'::regprocedure,
    'public.get_convite_anamnese(text)'::regprocedure,
    'public.salvar_anamnese_online(text,jsonb,jsonb)'::regprocedure
  ] loop
    execute format('revoke execute on function %s from public', v_fn);
    foreach v_role in array v_roles loop
      if exists (select 1 from pg_roles where rolname = v_role) then
        execute format('revoke execute on function %s from %I', v_fn, v_role);
      end if;
    end loop;
    execute format('grant execute on function %s to anon, authenticated, service_role', v_fn);
  end loop;
end
$$;

notify pgrst, 'reload schema';
