-- 19/09/2026: varredura da mesma classe do furo da get_professor_presenca_v3_sombra
-- (20260919194000). Regra do Alf: professor NUNCA lê dado de outro professor.
-- Professores do LA Teacher e a equipe do LA Report logam como `authenticated`
-- no MESMO projeto — então toda função SECURITY DEFINER sem porteiro (sem
-- auth.uid()/papel) com EXECUTE para authenticated/anon é uma porta aberta pelo
-- PostgREST, e toda view sem security_invoker (roda como dono, ignora RLS) ou
-- tabela sem RLS com SELECT para eles, idem.
--
-- Aqui só entra o que NÃO tem consumidor como authenticated/anon (classe A do
-- relatório .superpowers/relatorio-seguranca-professor.md), provado por:
--   · grep do nome exato em src/ e supabase/functions/ dos dois repositórios,
--     vps/ daqui, vps/ e supabase-sol/ do LA Report, anamnese-la-music,
--     anamnese-pwa, la-journey (o tipo gerado não conta);
--   · consumidor de edge function conferido: cliente service_role;
--   · pg_stat_statements desde 15/09: zero chamada por authenticated/anon ou
--     papel de agente;
--   · nenhuma função SECURITY INVOKER, trigger, policy ou view que dependa dela
--     rodando como authenticated (esses ficaram de fora e estão no relatório).
-- Quem usa de verdade — rotinas (cron como postgres), cadeias SECURITY DEFINER,
-- edge functions e agentes da VPS com a chave service_role — continua igual.
--
-- ⚠️ Banco compartilhado: os papéis dos agentes (sol_*, mila_*, lia_*,
-- maria_lareport_rpc, fabio_agent...) em parte recebiam EXECUTE via PUBLIC.
-- Tirar de PUBLIC tiraria deles também — então quem tinha ANTES recebe explícito. Não
-- muda nada para eles. (fabio_leitura_professor fica de fora de propósito: é o
-- papel do professor, criado para ter só as RPCs pedagógicas.)
-- Espelhar no repositório do LA Report (prompt entregue ao agente de lá).

do $m$
declare
  v_fn text;
  v_rel text;
  v_papel text;
  v_papeis text[] := array['fabio_agent','fabio_motor_v2_snapshot_ro','la_os_leitor','la_os_triador','lia_acesso_restrito','maria_lareport_rpc','mila_acesso_restrito','ml_jobs','monitor_coletor','sol_acesso_restrito','sol_atendimento_externo','sol_caixa_readonly','sol_estrategico','sol_operacional','sol_tatico']::text[];
begin
  foreach v_fn in array array[
    'public.agente_pode_falar_v1(text,text,text,date)',
    'public.agente_registrar_mensagem_v1(text,text,text,text)',
    'public.aluno_comunidade_estado_v1(integer)',
    'public.atualizar_health_score(integer,integer,character varying,text)',
    'public.atualizar_lead_experimental(text,text,uuid,text,integer,date,time without time zone,integer)',
    'public.atualizar_percentual_presenca(uuid)',
    'public.auditar_saude_conversas()',
    'public.banda_alunos_sem_banda(uuid)',
    'public.banda_reconciliar_turmas()',
    'public.buscar_video_professor(text,text,text)',
    'public.calcular_health_score_aluno(integer)',
    'public.criar_conversa_lead(integer,character varying)',
    'public.criar_health_score_professor_v3_config_rascunho(date,text)',
    'public.escola_agenda_v1(date,date,uuid)',
    'public.exec_normalizar_telefone_atendimento()',
    'public.financeiro_enriquecer_fatura_item(jsonb)',
    'public.fn_aluno_com_matricula_viva(integer)',
    'public.fn_aluno_faltou_confirmado(bigint,integer)',
    'public.fn_aula_ja_registrada(integer)',
    'public.fn_dever_de_casa_sinal_do_aluno(integer,integer,date)',
    'public.fn_experimental_tem_registro(bigint)',
    'public.fn_fabio_herdar_triagem_da_janela(text,interval)',
    'public.fn_fabio_mensagem_e_de_teste(integer,text,text,timestamp with time zone)',
    'public.fn_fabio_texto_ja_era_do_professor(integer,jsonb,timestamp with time zone)',
    'public.fn_fabio_texto_ja_era_do_professor(uuid)',
    'public.fn_lead_estado_pauta_v1(bigint)',
    'public.fn_pesquisa_evasao_c_classificacao_vigente(uuid,uuid)',
    'public.fn_presenca_candidatos_periodo_v1(uuid,date,date)',
    'public.fn_presenca_resumo_mensal_v1(integer,integer,uuid)',
    'public.fn_registro_editavel(uuid)',
    'public.fn_texto_relatorio_presenca(uuid,date)',
    'public.fn_texto_resumo_mensal_presenca_v1(integer,integer)',
    'public.get_conciliacao_professores_emusys(uuid)',
    'public.get_dados_relatorio_gerencial_legacy_p01g(uuid,integer,integer)',
    'public.get_dados_relatorio_gerencial_legacy_p02r_20260620(uuid,integer,integer)',
    'public.get_frequencia_unidade_canonica_batch_v1(uuid)',
    'public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(date,uuid,uuid,text)',
    'public.get_health_score_professor_v3_performance_snapshot_v1(date,uuid,text)',
    'public.get_health_score_professor_v3_performance_snapshot_v2(date,uuid,text)',
    'public.get_hs_prof_v3_config_ui_base_20260803(date)',
    'public.get_hs_prof_v3_performance_before_scope_fix_20260804(date,uuid,text)',
    'public.get_hs_prof_v3_performance_payload_base_20260803(date,uuid,text)',
    'public.get_kpis_alunos_canonicos_base_p01q(uuid,integer,integer)',
    'public.get_kpis_alunos_canonicos_base_p01t(uuid,integer,integer)',
    'public.get_kpis_alunos_financeiro_vivo_canonico(uuid,integer,integer)',
    'public.get_kpis_alunos_vinculos_vivo_canonico(uuid,integer,integer)',
    'public.get_kpis_evolucao_mensal(text,integer)',
    'public.get_kpis_experimentais_professor(integer,integer,uuid)',
    'public.get_relatorio_admin_mensal_rico_v1(uuid,integer,integer)',
    'public.get_relatorio_gerencial_canonico_metas_kpi_diagnostico_base_v1(uuid,integer,integer)',
    'public.ignorar_conciliacao_aluno_atributo(bigint,text)',
    'public.liberar_sync_matriculas_travado(uuid,interval)',
    'public.limpar_professores_emusys_divergencias_obsoletas()',
    'public.listar_meta_source_ids_pendentes()',
    'public.marcar_inadimplentes_apos_vencimento()',
    'public.maria_lareport_buscar_alunos(text,uuid,integer)',
    'public.maria_lareport_consultor_matriculas_mes(uuid,integer,integer,integer)',
    'public.maria_lareport_evasoes_mes_detalhe(uuid,integer,integer,integer)',
    'public.maria_lareport_matriculas_mes_detalhe(uuid,integer,integer,integer)',
    'public.maria_lareport_professor_carteira(uuid,text,integer)',
    'public.materializar_projecao_contrato(integer,bigint)',
    'public.matriculas_comerciais_lista_v1(uuid,date,date,timestamp with time zone)',
    'public.mila_base_comercial_v1(text,text,integer,text)',
    'public.mila_briefing_lideranca_v1(text,date,text)',
    'public.mila_check_disponibilidade_visita(uuid,date,time without time zone,text)',
    'public.mila_conversa_do_lead_v1(text,bigint)',
    'public.mila_lideranca_ativa_v1()',
    'public.mila_registrar_eficacia_v1(text,text,text,text,text)',
    'public.mila_registrar_lacuna_base_v1(text,text,text)',
    'public.radar_bloco_comercial_grupo_v1(uuid,integer,integer)',
    'public.radar_detectar_aviso_previo_v1(date)',
    'public.radar_detectar_calor_atendimento_v1(integer)',
    'public.radar_detectar_matricula_sem_anamnese_v1()',
    'public.radar_detectar_sinais_comercial_v1()',
    'public.radar_detectar_sinais_sql_v1(date)',
    'public.radar_enfileirar_pauta_v1(boolean,date)',
    'public.radar_marcar_foto_conversas_v1(integer[],boolean,integer)',
    'public.radar_mensagem_guardias_v1()',
    'public.radar_pauta_v1(text,boolean)',
    'public.radar_publico_reativacao_v1(uuid)',
    'public.radar_remedir_padroes_v1()',
    'public.radar_rodada_diaria_v1()',
    'public.radar_sincronizar_detectores_v1()',
    'public.radar_texto_operacional_v1(jsonb,integer)',
    'public.recalcular_projecao(integer,bigint,text,jsonb)',
    'public.reconciliar_grade_aluno_v2(bigint,uuid,date,date,integer[],boolean)',
    'public.registrar_experimental(text,text,uuid,text,integer,date,time without time zone,integer,integer,timestamp with time zone,text,integer)',
    'public.registrar_venda_legacy(integer,uuid,integer,character varying,text,integer,character varying,character varying,integer,integer,numeric,integer,text)',
    'public.resetar_teste_mila(integer)',
    'public.resolver_motivo_saida_evasao_v1(integer)',
    'public.rpc_marcar_inadimplentes()',
    'public.salvar_health_score_professor_v3_config_rascunho(uuid,date,text,jsonb,jsonb)',
    'public.simular_emenda(uuid,date,integer)',
    'public.sincronizar_grade_horaria_alunos()',
    'public.sol_caixa_ator_ok(uuid,text)',
    'public.sol_caixa_executar_abertura_fechamento_v3(jsonb,text)',
    'public.sol_caixa_snapshot_abertura_fechamento_v3(uuid,date,text)',
    'public.sol_cracha_emitir_v1(text,text,timestamp with time zone)',
    'public.sol_cracha_verificar_v1(text,text)',
    'public.sol_porta_agenda_do_dia_v1(text,text,date)',
    'public.sol_porta_alunos_sem_fatura_v1(text,text,date)',
    'public.sol_porta_aviso_previo_v1(text,text)',
    'public.sol_porta_caixa_do_dia_v1(text,text,date)',
    'public.sol_porta_contratos_vencendo_v1(text,text,integer)',
    'public.sol_porta_pauta_do_dia_v1(text,text,integer)',
    'public.sol_porta_pendencias_cadastro_v1(text,integer)',
    'public.sol_porta_registrar_desfecho_v1(text,text,text,text)',
    'public.sol_porta_renovacoes_v1(text,text)',
    'public.sol_resolver_escopo_v1(text,text)',
    'public.upsert_lead(text,text,text,uuid,text,text,integer,text,boolean,date,date)'
  ]::text[]
  loop
    foreach v_papel in array v_papeis loop
      if exists (select 1 from pg_roles where rolname = v_papel)
         and has_function_privilege(v_papel, v_fn::regprocedure, 'execute') then
        execute format('grant execute on function %s to %I', v_fn::regprocedure, v_papel);
      end if;
    end loop;
    execute format('revoke execute on function %s from public, anon, authenticated', v_fn::regprocedure);
    execute format('grant execute on function %s to service_role', v_fn::regprocedure);
  end loop;

  foreach v_rel in array array[
    'public.vw_aderencia_registro_professor',
    'public.vw_registro_pendencia',
    'public.vw_fabio_carteira_professor',
    'public.vw_fabio_licao_vigente',
    'public.vw_instagram_sessoes_resolvidas',
    'public.vw_jornada_lead_v1',
    'public.vw_observador_leads_orfaos',
    'public.vw_radar_sinal_vigencia_v1',
    'public.vw_saude_jornada_ciclos',
    'public.vw_ads_gasto_diario_v1',
    'public.lead_experimentais_arquivadas',
    'public.lead_experimental_aulas_arquivadas',
    'public.programa_matriculador_estrelas_config',
    'public.projecao_recaculo_log',
    'public.sol_grants_revogados_fatia0',
    'public.hermes_patch_status'
  ]::text[]
  loop
    execute format('revoke all on table %s from public, anon, authenticated', v_rel::regclass);
    execute format('grant select on table %s to service_role', v_rel::regclass);
  end loop;
end
$m$;
