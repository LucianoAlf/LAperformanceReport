-- 19/09/2026: funções VOLÁTEIS (escrevem ou podem escrever) que ainda tinham
-- EXECUTE para anon — ninguém anônimo precisa delas. Quem usa é a equipe logada
-- (LA Report: ModalAdicionarPessoa, ComercialPage, ModalNovoAluno, PainelFarmer,
-- useSupabase, useMatriculadorPrograma), o la-organizer com service_role, ou
-- ninguém (passagem de bastão, retirar_do_roster_health_score_v3_ciclo,
-- consolidar_*, upsert_metas, registrar_movimentacao).
-- pg_stat_statements desde 15/09: zero chamada por anon. Nenhuma policy de anon
-- usa estas funções.
-- Tira só anon (e PUBLIC); quem tinha via PUBLIC (authenticated, agentes)
-- recebe explícito antes — a equipe não perde nada; o professor já está fora
-- pelo porteiro de requisição (20260919199000).
-- Ficam com anon DE PROPÓSITO: get_anamnese_publica, get_convite_anamnese,
-- salvar_anamnese_online (formulário público, token de 128 bits),
-- fn_porteiro_requisicao (o PostgREST chama em toda requisição), funções de
-- extensão (unaccent_*, set_limit) e cálculos puros (calc_idade,
-- calc_classificacao, calcular_variacao, normalize_phone).
do $m$
declare
  v_fn text;
  v_papel text;
  v_papeis text[] := array['authenticated','fabio_agent','fabio_motor_v2_snapshot_ro','la_os_leitor','la_os_triador','lia_acesso_restrito','maria_lareport_rpc','mila_acesso_restrito','ml_jobs','monitor_coletor','sol_acesso_restrito','sol_atendimento_externo','sol_caixa_readonly','sol_estrategico','sol_operacional','sol_tatico']::text[];
begin
  foreach v_fn in array array['public.criar_ficha_pessoa(text,text,uuid,text,text,text)','public.dispensar_passagem_bastao(uuid,text)','public.responder_passagem_bastao(uuid,text,text)','public.retirar_do_roster_health_score_v3_ciclo(text,integer,uuid,text)','public.toggle_relatorio_comercial_cron(uuid,boolean)','public.prever_projecao_contrato(uuid,text,date,integer)','public.consolidar_dados_comerciais_mes(integer,integer)','public.consolidar_origem_leads_mes(integer,integer)','public.calcular_pontos_perdidos_com_tolerancia(integer,uuid,integer,character varying)','public.transferir_estoque(integer,integer,uuid,uuid,integer,text,text)','public.transferir_estoque(uuid,uuid,uuid,uuid,integer,text,text)','public.registrar_movimentacao(integer,uuid,character varying,integer,integer,integer,integer,integer,numeric,text,character varying)','public.upsert_metas(character varying,integer,integer,integer,integer,numeric,numeric,numeric,integer,numeric,numeric)','public.get_checklists_farmer(integer,uuid,text)','public.get_comparativo_anos(integer,integer)','public.get_dados_comercial_ia(uuid,integer,integer)','public.get_dados_relatorio_coordenacao_pre_totais_20260711(uuid,integer,integer)','public.get_dados_relatorio_coordenacao(uuid,integer,integer)','public.get_heatmap_data(integer,character varying)','public.get_heatmap_totais(integer,character varying)','public.get_historico_mensal_matriculador(integer,uuid)','public.get_kpis_retencao(integer,character varying)','public.get_metas_vs_realizado(integer)','public.get_ocorrencias_mes(integer,uuid,integer,character varying)','public.get_programa_matriculador_dados(integer,uuid)']::text[] loop
    foreach v_papel in array v_papeis loop
      if exists (select 1 from pg_roles where rolname = v_papel)
         and has_function_privilege(v_papel, v_fn::regprocedure, 'execute') then
        execute format('grant execute on function %s to %I', v_fn::regprocedure, v_papel);
      end if;
    end loop;
    execute format('revoke execute on function %s from public, anon', v_fn::regprocedure);
    execute format('grant execute on function %s to service_role', v_fn::regprocedure);
  end loop;
end
$m$;
