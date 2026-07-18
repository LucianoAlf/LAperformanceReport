-- Health Score Professor V3 - isolamento do Gate 6.
-- A camada ainda esta em sombra. Agentes nao devem ler tabelas internas
-- diretamente, especialmente roles com BYPASSRLS. Consumo futuro sera por RPC
-- explicitamente homologada e escopada.

do $$
declare
  v_role text;
  v_table text;
begin
  foreach v_role in array array[
    'fabio_agent',
    'lia_acesso_restrito',
    'mila_acesso_restrito',
    'sol_acesso_restrito'
  ]
  loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      foreach v_table in array array[
        'health_score_professor_v3_config_versoes',
        'health_score_professor_v3_config_metricas',
        'health_score_professor_v3_snapshots',
        'health_score_professor_v3_snapshot_metricas'
      ]
      loop
        execute format(
          'revoke all privileges on table public.%I from %I',
          v_table,
          v_role
        );
      end loop;
    end if;
  end loop;
end;
$$;
