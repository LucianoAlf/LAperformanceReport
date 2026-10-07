-- 19/09/2026: funções de ESCRITA SECURITY DEFINER sem porteiro que o professor
-- (authenticated) executava. A pior: registrar_aula_fabio — um professor
-- sobrescrevia o registro (anotacoes_fabio) da aula de OUTRO professor.
-- Nenhuma tem consumidor authenticated/anon (mesma régua da 20260919195000):
--   · registrar_aula_fabio: só cadeias DEFINER (fn_confirmar_registro_core,
--     fabio_corrigir_registro_confirmado, fn_gravar_fatias_que_a_presenca_liberou);
--     no src/ do app só aparece em comentário;
--   · admin_conversa_nova_mensagem: webhook-whatsapp-inbox (service_role);
--   · hermes_patch_status_reportar: hermes-patch-guard.sh (service_role);
--   · incrementar_respondidos_campanha: meta-webhook-campanhas (service_role);
--   · limpar_mila_buffer_antigo, cleanup_bi_conversations: cron (postgres).
-- pg_stat_statements desde 15/09: zero chamada fora de postgres/service_role.
-- As 16 banda_* / marcar_conversa_lida / marcar_checklist_item são usadas pelo
-- site do LA Report como authenticated: ficam, e o porteiro de requisição
-- (20260919199000) tira o professor delas.
do $m$
declare
  v_fn text;
  v_papel text;
  v_papeis text[] := array['fabio_agent','fabio_motor_v2_snapshot_ro','la_os_leitor','la_os_triador','lia_acesso_restrito','maria_lareport_rpc','mila_acesso_restrito','ml_jobs','monitor_coletor','sol_acesso_restrito','sol_atendimento_externo','sol_caixa_readonly','sol_estrategico','sol_operacional','sol_tatico']::text[];
begin
  foreach v_fn in array array['public.registrar_aula_fabio(integer,text,text,integer,text)','public.admin_conversa_nova_mensagem(uuid,text,text)','public.hermes_patch_status_reportar(text,text,boolean,text)','public.incrementar_respondidos_campanha(uuid)','public.limpar_mila_buffer_antigo()','public.cleanup_bi_conversations()']::text[] loop
    foreach v_papel in array v_papeis loop
      if exists (select 1 from pg_roles where rolname = v_papel)
         and has_function_privilege(v_papel, v_fn::regprocedure, 'execute') then
        execute format('grant execute on function %s to %I', v_fn::regprocedure, v_papel);
      end if;
    end loop;
    execute format('revoke execute on function %s from public, anon, authenticated', v_fn::regprocedure);
    execute format('grant execute on function %s to service_role', v_fn::regprocedure);
  end loop;
end
$m$;
