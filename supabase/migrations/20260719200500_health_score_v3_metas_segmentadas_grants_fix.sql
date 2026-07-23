-- Health Score Professor V3 - corrige grants implicitos do ambiente remoto.
-- A migration base ja revoga public/anon/authenticated; este complemento
-- remove SELECT concedido por privilegios padrao aos agentes restritos.

do $segmented_grants$
declare
  role_name text;
begin
  foreach role_name in array array[
    'fabio_agent',
    'lia_acesso_restrito',
    'mila_acesso_restrito',
    'sol_acesso_restrito'
  ]
  loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format(
        'revoke all on table public.health_score_professor_v3_config_metas_curso_modalidade from %I',
        role_name
      );
      execute format(
        'revoke all on table public.health_score_professor_v3_snapshot_metrica_segmentos from %I',
        role_name
      );
    end if;
  end loop;
end;
$segmented_grants$;

