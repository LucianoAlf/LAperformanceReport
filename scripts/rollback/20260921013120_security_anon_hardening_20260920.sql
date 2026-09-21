-- Roteiro de desfazer da migration 20260921013120_security_anon_hardening_20260920.
-- Execute somente como administrador do banco, apos decisao de rollback.
-- Restaura as ACLs anon/PUBLIC capturadas pela migration; nao imprime dados de linhas.

do $$
declare
  r record;
begin
  for r in
    select *
    from private.security_anon_hardening_20260920_acl_backup
    where object_kind = 'table'
    order by object_identity, grantee, privilege_type
  loop
    execute format(
      'grant %s on table %s to %s%s',
      r.privilege_type,
      r.object_identity,
      case when r.grantee = 'PUBLIC' then 'PUBLIC' else quote_ident(r.grantee) end,
      case when r.is_grantable then ' with grant option' else '' end
    );
  end loop;

  for r in
    select *
    from private.security_anon_hardening_20260920_acl_backup
    where object_kind = 'function'
      and privilege_type = 'EXECUTE'
    order by object_identity, grantee
  loop
    execute format(
      'grant execute on function %s to %s%s',
      r.object_identity,
      case when r.grantee = 'PUBLIC' then 'PUBLIC' else quote_ident(r.grantee) end,
      case when r.is_grantable then ' with grant option' else '' end
    );
  end loop;
end
$$;

drop policy if exists leads_campanhas_select_authenticated on public.leads_campanhas;
drop policy if exists leads_campanhas_insert_authenticated on public.leads_campanhas;
drop policy if exists leads_campanhas_update_authenticated on public.leads_campanhas;
drop policy if exists leads_campanhas_delete_authenticated on public.leads_campanhas;
create policy rls_leads_campanhas_roles_internos
on public.leads_campanhas
for all
to public
using (true)
with check (true);

drop policy if exists calendario_escolar_select_authenticated on public.calendario_escolar;
drop policy if exists calendario_escolar_insert_authenticated on public.calendario_escolar;
drop policy if exists calendario_escolar_update_authenticated on public.calendario_escolar;
drop policy if exists calendario_escolar_delete_authenticated on public.calendario_escolar;
drop policy if exists projecao_aulas_select_authenticated on public.projecao_aulas;

do $$
declare
  r record;
begin
  for r in
    select p.tablename, p.policyname
    from pg_policies p
    where p.schemaname = 'public'
      and p.policyname like 'p1_acl_%_select'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end
$$;

alter table public._auditoria_chave_natural_20260809 disable row level security;
alter table public._auditoria_reconstrucao_20260809 disable row level security;
alter table public.calendario_escolar disable row level security;
alter table public.emusys_experimentais_snapshot_execucoes disable row level security;
alter table public.fabio_memoria_janela disable row level security;
alter table public.fabio_memoria_proposta disable row level security;
alter table public.fabio_participacao_ocorrencia_eventos disable row level security;
alter table public.fabio_participacao_ocorrencias disable row level security;
alter table public.fabio_professor_memoria disable row level security;
alter table public.fechamento_snapshots_backup_20260808 disable row level security;
alter table public.health_score_professor_v3_materializacao_execucoes disable row level security;
alter table public.hermes_patch_status disable row level security;
alter table public.lead_experimentais_arquivadas disable row level security;
alter table public.lead_experimental_aulas_arquivadas disable row level security;
alter table public.migrations_audit_data_nascimento disable row level security;
alter table public.programa_matriculador_estrelas_config disable row level security;
alter table public.projecao_aulas disable row level security;
alter table public.projecao_recaculo_log disable row level security;
alter table public.sol_grants_revogados_fatia0 disable row level security;
alter table public.unidade_contato_comercial disable row level security;

alter default privileges for role postgres in schema public
  grant all on tables to anon;
alter default privileges for role supabase_admin in schema public
  grant all on tables to anon;
alter default privileges for role supabase_admin in schema public
  grant execute on functions to anon;

drop function if exists private.consumir_rate_limit_anamnese(text);
drop table if exists private.anamnese_publica_rate_limit;
notify pgrst, 'reload schema';
