-- SECURITY DEFINER + anon + grava, sem conferir quem chama.
-- Qualquer pessoa com a anon key (publica, no bundle) disparava:
--   recalcular_projecao          — recálculo das projeções de contrato
--   hermes_patch_status_reportar — upsert de status falso no monitoramento
--
-- Logs internos (19/09):
--   recalcular_projecao: zero linhas em pg_stat_statements.
--     A migration original (20260812000500) ja revogava anon; o grant
--     voltou (PUBLIC + anon). Recoloca o contrato original:
--     authenticated + service_role.
--   hermes_patch_status_reportar: ~1909 chamadas PostgREST no
--     pg_stat_statements. O guard (hermes-patch-guard.sh) usa service_role
--     (comentario da 20260821221204). Revoga public/anon/authenticated;
--     deixa service_role.
--
-- Anamnese publica (get_anamnese_publica / get_convite_anamnese /
-- salvar_anamnese_online) NAO entra aqui: pedem p_token de 32 hex
-- (gen_random_bytes(16) / uuid sem hifen), 128 bits, nao adivinhavel.

revoke all on function public.recalcular_projecao(integer, bigint, text, jsonb)
  from public, anon;
grant execute on function public.recalcular_projecao(integer, bigint, text, jsonb)
  to authenticated, service_role;

revoke all on function public.hermes_patch_status_reportar(text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.hermes_patch_status_reportar(text, text, boolean, text)
  to service_role;

do $$
begin
  if has_function_privilege(
       'anon',
       'public.recalcular_projecao(integer, bigint, text, jsonb)',
       'execute'
     ) then
    raise exception 'ANON_AINDA_EXECUTA recalcular_projecao';
  end if;
  if has_function_privilege(
       'anon',
       'public.hermes_patch_status_reportar(text, text, boolean, text)',
       'execute'
     ) then
    raise exception 'ANON_AINDA_EXECUTA hermes_patch_status_reportar';
  end if;
  if not has_function_privilege(
       'service_role',
       'public.hermes_patch_status_reportar(text, text, boolean, text)',
       'execute'
     ) then
    raise exception 'SERVICE_ROLE_SEM_EXECUTE hermes_patch_status_reportar';
  end if;
end $$;
