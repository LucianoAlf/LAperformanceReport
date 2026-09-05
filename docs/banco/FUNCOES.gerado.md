<!-- GERADO POR scripts/gerar-mapa-banco.mjs — NÃO EDITE À MÃO.
     Banco: ouqwbbermlzqqvtqwlul · Gerado em: 2026-09-05 -->

<!-- fim do cabecalho gerado -->
# Funções

1291 funções. `ORFA` é **sinal, não veredito**: n8n, scripts da VPS e
chamadas diretas ao PostgREST não são visíveis para o gerador.

## aluno

| Função | Estado | Segurança | Consumidores |
|---|---|---|---|
| `app_aluno_ficha(p_aluno_id integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_radar_config()` | ORFA | DEFINER | sem consumidor conhecido |
| `app_radar_config_salvar(p_chave text, p_valor numeric)` | ORFA | DEFINER | sem consumidor conhecido |
| `arquivar_movimentacao_admin(p_id integer, p_motivo text)` | ATIVA | DEFINER | front:src/components/App/Administrativo/AdministrativoPage.tsx, front:src/components/App/Administrativo/TabelaAvisosVencidos.tsx, front:src/components/App/Retencao/PlanilhaRetencao.tsx, funcao:fn_bloqueia_delete_movimentacao_admin |
| `aviso_previo_pendencias(p_unidade_id uuid, p_ref date)` | ORFA | INVOKER | sem consumidor conhecido |
| `aviso_previo_vencidos(p_unidade_id uuid)` | ATIVA | DEFINER | front:src/components/App/Administrativo/TabelaAvisosVencidos.tsx |
| `backfill_jornada_curso_grade_atual_v1(p_limite integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `banda_aluno_ativo(p_status text, p_ex boolean)` | SO-INTERNA | INVOKER | funcao:banda_alunos_sem_banda, funcao:bandas_para_garimpar |
| `banda_alunos_da_unidade(p_unidade_id uuid, p_busca text)` | ATIVA | DEFINER | front:src/components/App/Bandas/AutocompleteAlunoBanda.tsx, front:src/hooks/useBandas.ts |
| `banda_alunos_sem_banda(p_unidade_id uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `banda_atualizar_avulsa(p_banda_id bigint, p_nome text, p_produtor_professor_id integer, p_genero text, p_descricao text, p_dia_semana text, p_horario time without time zone, p_horario_fim time without time zone, p_frequencia text, p_sala_id integer, p_modelo_financeiro text, p_valor_mensal_aluno numeric, p_valor_repasse numeric)` | ATIVA | DEFINER | front:src/hooks/useBandas.ts |
| `banda_atualizar_identidade(p_banda_id bigint, p_nome text, p_genero text, p_descricao text, p_logo_url text)` | ATIVA | DEFINER | front:src/hooks/useBandas.ts |
| `banda_chave_turma(p_unidade uuid, p_curso integer, p_dia text, p_horario time without time zone, p_prof integer)` | SO-INTERNA | INVOKER | funcao:banda_alunos_sem_banda, funcao:bandas_para_garimpar |
| `banda_conciliacao_roster(p_unidade_id uuid)` | ATIVA | DEFINER | front:src/hooks/useBandas.ts |
| `banda_confirmar(p_banda_id bigint, p_nome text)` | ATIVA | DEFINER | front:src/hooks/useBandas.ts |
| `banda_criar(p_unidade_id uuid, p_nome text, p_produtor_professor_id integer, p_genero text, p_descricao text, p_dia_semana text, p_horario time without time zone, p_horario_fim time without time zone, p_frequencia text, p_sala_id integer, p_modelo_financeiro text, p_valor_mensal_aluno numeric, p_valor_repasse numeric)` | ATIVA | DEFINER | front:src/hooks/useBandas.ts |
| `banda_definir_status(p_banda_id bigint, p_status text)` | ATIVA | DEFINER | front:src/hooks/useBandas.ts |
| `banda_descartar(p_banda_id bigint)` | ATIVA | DEFINER | front:src/hooks/useBandas.ts |
| `banda_detalhe(p_banda_id bigint)` | ATIVA | DEFINER | front:src/hooks/useBandas.ts |
| `banda_evento_atualizar(p_evento_id bigint, p_titulo text, p_tipo text, p_data_inicio timestamp with time zone, p_data_fim timestamp with time zone, p_local text, p_sala_id integer, p_orcamento numeric, p_status text, p_observacoes text)` | ATIVA | DEFINER | front:src/hooks/useBandas.ts |
| `banda_evento_cancelar(p_evento_id bigint)` | ATIVA | DEFINER | front:src/hooks/useBandas.ts |
| `banda_evento_criar(p_unidade_id uuid, p_tipo text, p_titulo text, p_data_inicio timestamp with time zone, p_data_fim timestamp with time zone, p_local text, p_sala_id integer, p_orcamento numeric, p_observacoes text, p_bandas bigint[])` | ATIVA | DEFINER | front:src/hooks/useBandas.ts |
| `banda_evento_definir_bandas(p_evento_id bigint, p_bandas bigint[])` | ATIVA | DEFINER | front:src/hooks/useBandas.ts |
| `banda_evento_participantes(p_evento_id bigint)` | ATIVA | DEFINER | front:src/hooks/useBandas.ts |
| `banda_evento_remover(p_evento_id bigint)` | ATIVA | DEFINER | front:src/hooks/useBandas.ts |
| `banda_eventos_listar(p_unidade_id uuid, p_desde timestamp with time zone)` | ATIVA | DEFINER | front:src/components/App/Bandas/CalendarioEventosBandas.tsx, front:src/hooks/useBandas.ts |
| `banda_integrante_desativar(p_banda_id bigint, p_aluno_id integer, p_data_saida date)` | ATIVA | DEFINER | front:src/hooks/useBandas.ts |
| `banda_integrante_remover(p_banda_id bigint, p_aluno_id integer)` | ATIVA | DEFINER | front:src/hooks/useBandas.ts |
| `banda_integrante_upsert(p_banda_id bigint, p_aluno_id integer, p_instrumento text, p_funcao text, p_data_entrada date, p_observacoes text)` | ATIVA | DEFINER | front:src/components/App/Bandas/ModalIntegranteBanda.tsx, front:src/hooks/useBandas.ts |
| `banda_integrantes(p_banda_id bigint)` | ATIVA | DEFINER | front:src/hooks/useBandas.ts |
| `banda_norm(t text)` | ORFA | INVOKER | sem consumidor conhecido |
| `banda_permanencia_meses(p_aluno_id integer)` | ATIVA | DEFINER | front:src/hooks/useBandas.ts, funcao:banda_integrantes, funcao:bandas_kpis |
| `banda_professores_da_unidade(p_unidade_id uuid)` | ATIVA | DEFINER | front:src/components/App/Bandas/ModalBandaAvulsa.tsx, front:src/hooks/useBandas.ts |
| `banda_reconciliar_turmas()` | ORFA | DEFINER | sem consumidor conhecido |
| `banda_remover(p_banda_id bigint)` | ATIVA | DEFINER | front:src/hooks/useBandas.ts |
| `banda_repertorio_adicionar(p_banda_id bigint, p_titulo text, p_artista text, p_tom text, p_bpm integer, p_status text, p_letra text, p_cifra text, p_cifraclub_url text, p_duracao_min integer)` | ATIVA | DEFINER | front:src/hooks/useBandas.ts |
| `banda_repertorio_atualizar(p_id bigint, p_titulo text, p_artista text, p_tom text, p_bpm integer, p_status text, p_duracao_min integer, p_cifraclub_url text)` | ATIVA | DEFINER | front:src/hooks/useBandas.ts |
| `banda_repertorio_listar(p_banda_id bigint)` | ATIVA | DEFINER | front:src/hooks/useBandas.ts |
| `banda_repertorio_remover(p_id bigint)` | ATIVA | DEFINER | front:src/hooks/useBandas.ts |
| `banda_roster_turma(p_unidade_id uuid, p_turma_nome text)` | ATIVA | DEFINER | front:src/hooks/useBandas.ts, funcao:banda_conciliacao_roster, funcao:banda_detalhe, funcao:banda_integrantes, funcao:banda_turmas_a_confirmar, funcao:bandas_kpis, +1 outros |
| `banda_turmas_a_confirmar(p_unidade_id uuid)` | ATIVA | DEFINER | front:src/hooks/useBandas.ts |
| `bandas_kpis(p_unidade_id uuid, p_min_integrantes integer)` | ATIVA | DEFINER | front:src/hooks/useBandas.ts |
| `bandas_listar(p_unidade_id uuid, p_status text)` | ATIVA | DEFINER | front:src/hooks/useBandas.ts |
| `bandas_para_garimpar(p_unidade_id uuid, p_min_integrantes integer)` | ATIVA | DEFINER | front:src/hooks/useBandas.ts |
| `buscar_alunos_ativos_atuais_canonicos(p_termo text, p_unidade_id uuid, p_limite integer)` | ATIVA | DEFINER | front:src/components/ui/AutocompleteAluno.tsx |
| `buscar_anamnese_pendente(p_nome text, p_unidade_id uuid)` | ATIVA | DEFINER | front:src/components/App/Alunos/ModalNovoAluno.tsx, front:src/components/App/Comercial/ComercialPage.tsx |
| `buscar_anamneses_pendentes(p_aluno_id integer)` | ATIVA | DEFINER | front:src/components/App/Alunos/ModalFichaAluno.tsx |
| `buscar_anamneses_pendentes_todas(p_unidade_id uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `calcular_reajuste_renovacao()` | ATIVA | INVOKER · 🔓 anon | trigger:renovacoes_legado.trigger_calcular_reajuste |
| `cancelar_repescagem_evasao(p_pesquisa_id uuid, p_motivo text)` | ATIVA | DEFINER | front:src/components/App/SucessoCliente/hooks/useRepescagemEvasao.ts |
| `capturar_telefone_snapshot_movimentacao_retencao()` | ATIVA | DEFINER | trigger:movimentacoes_admin.trg_capturar_telefone_snapshot_movimentacao_retencao |
| `claim_pesquisa_evasao_preview(p_preview_id uuid, p_auth_user_id uuid)` | SO-INTERNA | DEFINER | funcao:claim_pesquisa_evasao_preview_editavel |
| `claim_pesquisa_evasao_preview_editavel(p_preview_id uuid, p_auth_user_id uuid, p_mensagem_final text, p_payload_hash_final text)` | ATIVA | DEFINER | edge:supabase/functions/enviar-pesquisa-evasao/index.ts |
| `claim_pesquisas_evasao_processamento(p_worker_id uuid, p_limite integer)` | ATIVA | DEFINER | edge:supabase/functions/processar-conversa-evasao/index.ts |
| `claim_repescagem_evasao_job(p_worker_id uuid, p_lease_seconds integer)` | ATIVA | DEFINER | edge:supabase/functions/processar-fila-repescagem-evasao/index.ts |
| `classificar_resposta_evasao(p_pesquisa_id uuid, p_categoria text)` | ORFA | DEFINER | sem consumidor conhecido |
| `concluir_acao_pesquisa_evasao_v1(p_acao_id uuid, p_estado text, p_observacao text)` | ATIVA | DEFINER | front:src/components/App/SucessoCliente/hooks/useClassificacaoEvasao.ts |
| `concluir_repescagem_evasao_job(p_id uuid, p_worker_id uuid, p_provider_message_id text)` | ATIVA | DEFINER | edge:supabase/functions/processar-fila-repescagem-evasao/index.ts |
| `concluir_revisao_pesquisa_evasao(p_analise_id uuid, p_texto_consolidado text)` | ATIVA | DEFINER | front:src/components/App/SucessoCliente/ConversaPesquisaEvasao.tsx |
| `confirmar_resultado_pesquisa_evasao_envio(p_pesquisa_id uuid, p_preview_id uuid, p_idempotency_key uuid, p_auth_user_id uuid, p_provider_message_id text)` | ATIVA | DEFINER | edge:supabase/functions/enviar-pesquisa-evasao/index.ts |
| `contar_followups_pesquisa_evasao_grupos_v1(p_unidade_id uuid, p_ano integer, p_mes integer, p_busca text)` | ATIVA | DEFINER | front:src/components/App/SucessoCliente/hooks/useFollowupsEvasao.ts |
| `contar_followups_pesquisa_evasao_v1(p_unidade_id uuid, p_ano integer, p_mes integer)` | ATIVA | DEFINER | front:src/components/App/SucessoCliente/hooks/useFollowupsEvasao.ts |
| `converter_renovacao_pendente_em_nao_renovacao(p_movimentacao_id integer, p_emusys_matricula_id text, p_data date, p_motivo_saida_id integer, p_motivo text, p_observacoes text, p_agente_comercial text, p_tempo_permanencia_meses integer, p_valor_parcela numeric, p_origem text)` | ATIVA | DEFINER | front:src/components/App/Administrativo/AdministrativoPage.tsx, edge:supabase/functions/sync-matriculas-emusys/index.ts |
| `coord_prontuario_aluno(p_aluno_id integer, p_limite integer)` | SO-INTERNA | DEFINER | funcao:fabio_prontuario_aluno_admin |
| `criar_checklist_from_template(p_template_id uuid, p_colaborador_id integer, p_unidade_id uuid, p_titulo character varying, p_data_prazo date)` | ATIVA | DEFINER | front:src/components/App/Administrativo/PainelFarmer/hooks/useChecklists.ts |
| `criar_ficha_pessoa(p_nome text, p_whatsapp text, p_unidade_id uuid, p_departamento text, p_situacao text, p_cargo_contexto text)` | ATIVA | DEFINER · 🔓 anon | front:src/components/App/Time/ModalAdicionarPessoa.tsx |
| `criar_pesquisa_evasao(p_evasao_id integer, p_criado_por text)` | ORFA | DEFINER | sem consumidor conhecido |
| `enfileirar_repescagem_evasao(p_pesquisa_ids uuid[])` | ATIVA | DEFINER | front:src/components/App/SucessoCliente/hooks/useRepescagemEvasao.ts, front:src/components/App/SucessoCliente/pesquisaEvasao.types.ts |
| `falhar_repescagem_evasao_job(p_id uuid, p_worker_id uuid, p_erro text, p_terminal boolean)` | ATIVA | DEFINER | edge:supabase/functions/processar-fila-repescagem-evasao/index.ts |
| `features_churn_alunos_ativos()` | ATIVA | DEFINER | edge:supabase/functions/calcular-risco-evasao/index.ts |
| `features_churn_alunos_ativos_v2_sombra()` | ORFA | DEFINER | sem consumidor conhecido |
| `ficha_concluir_tecnica(p_token text, p_cargo_contexto text, p_versao_questionario integer, p_temperamento_primario text, p_temperamento_secundario text, p_temperamento_codinome text, p_temperamento_contagem jsonb, p_valorizacao_primaria text, p_valorizacao_secundaria text, p_valorizacao_contagem jsonb, p_valores_primario text, p_valores_secundario text, p_valores_sacrificado text, p_valores_contagem jsonb, p_respostas jsonb, p_fixos_count integer, p_desempates_count integer, p_bloco_b_count integer, p_bloco_d_count integer)` | ATIVA | DEFINER | edge:supabase/functions/ficha-tecnica/index.ts |
| `ficha_criar_pessoa(p_nome text, p_unidade_id uuid, p_whatsapp text, p_departamento text, p_cargo_contexto text, p_situacao text, p_origem_sistema text, p_origem_ref text)` | ATIVA | DEFINER | edge:supabase/functions/ficha-criar-pessoa/index.ts, funcao:criar_ficha_pessoa |
| `ficha_emitir_token(p_colaborador_id integer, p_criado_por integer)` | ATIVA | DEFINER | edge:supabase/functions/ficha-emitir-token/index.ts |
| `filtrar_renovacoes_admin_retencao_validas_v1(p_itens jsonb)` | SO-INTERNA | DEFINER | funcao:get_relatorio_admin_mensal_rico_base_v3, funcao:montar_relatorio_admin_mensal_payload_base_v2, funcao:montar_relatorio_admin_mensal_payload_v1 |
| `fn_absenteismo_aluno_rollout_v1()` | ATIVA | DEFINER | view:vw_absenteismo_aluno |
| `fn_agendar_processamento_pesquisa_evasao()` | ATIVA | DEFINER · 🔓 anon | trigger:pesquisa_evasao_mensagens.trg_agendar_processamento_pesquisa_evasao |
| `fn_aluno_ativo_sem_data_saida()` | ATIVA | INVOKER · 🔓 anon | trigger:alunos.trg_aluno_ativo_sem_data_saida |
| `fn_aluno_com_matricula_viva(p_aluno_id integer)` | SO-INTERNA | DEFINER · 🔓 anon | funcao:app_historico_turma, funcao:app_minha_agenda_sessao_base_v1, funcao:app_minha_carteira, funcao:app_professor_feedback_mesa, funcao:fn_feedback_cobranca_do_dia |
| `fn_aluno_entra_base_ativa_v131(p_aluno_id integer, p_unidade_id uuid)` | ATIVA | DEFINER | view:vw_aluno_sucesso_lista, funcao:get_carteira_professores |
| `fn_aluno_faltou_confirmado(p_aula_id bigint, p_aluno_id integer)` | SO-INTERNA | DEFINER | funcao:fn_confirmar_registro_core, funcao:fn_fabio_det_ficha_descartada |
| `fn_aluno_presenca_veredito(p_aula_id bigint, p_aluno_id integer)` | SO-INTERNA | DEFINER | funcao:fn_aluno_faltou_confirmado, funcao:fn_fabio_det_ficha_descartada, funcao:fn_fabio_falta_sem_medicao |
| `fn_alunos_reentrada_historico()` | ATIVA | INVOKER · 🔓 anon | trigger:alunos.trg_alunos_reentrada_historico |
| `fn_alunos_valor_parcela_comercial_emusys()` | ATIVA | INVOKER · 🔓 anon | trigger:alunos.trg_alunos_valor_parcela_comercial_emusys |
| `fn_alunos_vinculo_emusys_anamnese()` | ATIVA | DEFINER · 🔓 anon | trigger:alunos.trg_alunos_vinculo_emusys_anamnese |
| `fn_anamnese_define_pessoa_chave()` | ATIVA | INVOKER · 🔓 anon | trigger:anamneses.trg_anamnese_pessoa_chave |
| `fn_aplicar_jornada_curso_grade_atual_v1()` | ATIVA | DEFINER | trigger:aluno_jornada_matricula_disciplina.trg_resolver_jornada_curso_grade_atual_v1 |
| `fn_aplicar_opt_out_pesquisa_evasao()` | ATIVA | DEFINER · 🔓 anon | trigger:pesquisa_evasao_mensagens.trg_aplicar_opt_out_pesquisa_evasao |
| `fn_atribuir_rodada_pesquisa_evasao()` | ATIVA | DEFINER · 🔓 anon | trigger:pesquisa_evasao_mensagens.trg_atribuir_rodada_pesquisa_evasao |
| `fn_atualizar_aluno_anamnese()` | ATIVA | DEFINER · 🔓 anon | trigger:anamneses.trg_anamnese_atualiza_aluno |
| `fn_bloqueia_delete_movimentacao_admin()` | ATIVA | INVOKER · 🔓 anon | trigger:movimentacoes_admin.trg_bloqueia_delete_movimentacao_admin |
| `fn_compor_texto_prontuario(p_tronco jsonb, p_fatia jsonb)` | SO-INTERNA | INVOKER | funcao:app_salvar_rascunho_manual, funcao:fabio_corrigir_registro_confirmado, funcao:fabio_criar_registro, funcao:fn_atualizar_fatia_core, funcao:fn_confirmar_registro_core |
| `fn_jornada_marca_ciclo_sucedido()` | ATIVA | INVOKER | trigger:aluno_jornada_matricula_disciplina.trg_jornada_ciclo_sucedido |
| `fn_pesquisa_evasao_c_append_only()` | ATIVA | INVOKER | trigger:pesquisa_evasao_classificacao_categorias.trg_pesquisa_evasao_classificacao_categorias_append_only, trigger:pesquisa_evasao_classificacoes.trg_pesquisa_evasao_classificacoes_append_only, trigger:pesquisa_evasao_desfechos.trg_pesquisa_evasao_desfechos_append_only |
| `fn_pesquisa_evasao_c_classificacao_vigente(p_pesquisa_id uuid, p_classificacao_id uuid)` | SO-INTERNA | DEFINER | funcao:listar_respostas_evasao_analytics_v1, funcao:obter_dados_classificacao_pesquisa_evasao_v1, funcao:registrar_acao_pesquisa_evasao_v1, funcao:registrar_desfecho_pesquisa_evasao_v1 |
| `fn_pesquisa_evasao_envios_fila_touch()` | ATIVA | INVOKER | trigger:pesquisa_evasao_envios_fila.trg_pesquisa_evasao_envios_fila_touch |
| `fn_pesquisa_evasao_followup_casa_busca(p_aluno_nome text, p_unidade_nome text, p_operador_nome text, p_busca text)` | SO-INTERNA | INVOKER | funcao:contar_followups_pesquisa_evasao_grupos_v1, funcao:listar_followups_pesquisa_evasao_v1 |
| `fn_pesquisa_evasao_followup_encerrada(p_estado_visivel text)` | ATIVA | INVOKER | front:src/components/App/SucessoCliente/FilaFollowupEvasao.tsx, front:src/components/App/SucessoCliente/pesquisaEvasao.types.ts, funcao:contar_followups_pesquisa_evasao_grupos_v1, funcao:listar_followups_pesquisa_evasao_v1 |
| `fn_pesquisa_evasao_followup_estado(p_agora timestamp with time zone)` | ATIVA | DEFINER | front:src/components/App/SucessoCliente/FilaFollowupEvasao.tsx, funcao:contar_followups_pesquisa_evasao_grupos_v1, funcao:contar_followups_pesquisa_evasao_v1, funcao:listar_followups_pesquisa_evasao_v1, funcao:produzir_lia_resumos_followup_72h |
| `fn_pesquisa_evasao_mensagem_append_only()` | ATIVA | INVOKER · 🔓 anon | trigger:pesquisa_evasao_mensagens.trg_pesquisa_evasao_mensagem_append_only |
| `fn_pesquisa_evasao_preview_original_insert()` | ATIVA | INVOKER | trigger:pesquisa_evasao_previews.trg_pesquisa_evasao_preview_original_insert |
| `fn_pesquisa_evasao_usuario_interno_ativo()` | SO-INTERNA | DEFINER | funcao:cancelar_repescagem_evasao, funcao:classificar_resposta_evasao, funcao:concluir_acao_pesquisa_evasao_v1, funcao:contar_followups_pesquisa_evasao_grupos_v1, funcao:contar_followups_pesquisa_evasao_v1, funcao:enfileirar_repescagem_evasao, +16 outros |
| `fn_pessoa_chave_aluno(p_aluno_id integer)` | SO-INTERNA | DEFINER | funcao:fn_anamnese_define_pessoa_chave |
| `fn_pode_ler_aluno_pedagogico(p_aluno_id integer)` | SO-INTERNA | DEFINER | funcao:get_historico_pedagogico_aluno, funcao:get_relatorio_pedagogico_aluno |
| `fn_prontuario_aluno_interno(p_aluno_id integer, p_professor_id integer, p_limite integer)` | SO-INTERNA | DEFINER | funcao:coord_prontuario_aluno, funcao:fabio_prontuario_aluno |
| `fn_proteger_opt_out_pesquisa_evasao()` | ATIVA | INVOKER · 🔓 anon | trigger:pesquisa_evasao.trg_proteger_opt_out_pesquisa_evasao |
| `fn_radar_aluno_sinais_rollout_v1()` | ATIVA | DEFINER | view:vw_radar_aluno_sinais |
| `fn_radar_nota(p_sinais jsonb, p_config jsonb)` | SO-INTERNA | INVOKER · 🔓 anon | funcao:app_coordenacao_radar |
| `fn_reagendar_transcricao_pesquisa_evasao()` | ATIVA | DEFINER · 🔓 anon | trigger:pesquisa_evasao_transcricoes.trg_reagendar_transcricao_pesquisa_evasao |
| `fn_registrar_limites_rodada_pesquisa_evasao()` | ATIVA | DEFINER · 🔓 anon | trigger:pesquisa_evasao_mensagens.trg_00_registrar_rodada_pesquisa_evasao |
| `fn_resolver_jornada_curso_grade_atual_v1(p_unidade_id uuid, p_matricula_disciplina_id bigint)` | SO-INTERNA | DEFINER | funcao:backfill_jornada_curso_grade_atual_v1, funcao:fn_aplicar_jornada_curso_grade_atual_v1 |
| `fn_resolver_motivo_saida_movimentacao_admin()` | ATIVA | DEFINER · 🔓 anon | trigger:movimentacoes_admin.trg_resolver_motivo_saida_movimentacao_admin |
| `fn_sincronizar_anamnese_preenchida_pessoa(p_unidade_id uuid, p_pessoa_chave text)` | SO-INTERNA | DEFINER | funcao:fn_alunos_vinculo_emusys_anamnese, funcao:fn_atualizar_aluno_anamnese, funcao:fn_vincular_anamnese_pendente, funcao:vincular_anamnese_aluno |
| `fn_vincular_anamnese_pendente()` | ATIVA | DEFINER · 🔓 anon | trigger:alunos.trg_vincular_anamnese_na_matricula |
| `gerar_convite_anamnese(p_tipo_formulario character varying, p_unidade_id uuid, p_nome_aluno text, p_aluno_id integer, p_telefone_aluno text, p_data_nascimento date)` | ORFA | DEFINER | sem consumidor conhecido |
| `get_alunos_ativos_atuais_canonicos(p_unidade_id uuid)` | ATIVA | DEFINER | front:src/lib/estadoOperacionalAlunos.ts, edge:supabase/functions/marcos-jornada/index.ts, edge:supabase/functions/sync-presenca-emusys/index.ts |
| `get_anamnese_aluno(p_aluno_id integer)` | ATIVA | DEFINER | front:src/components/App/Alunos/ModalFichaAluno.tsx |
| `get_anamnese_by_token(p_token character varying)` | ORFA | DEFINER | sem consumidor conhecido |
| `get_anamnese_publica(p_token text)` | ORFA | DEFINER · 🔓 anon | sem consumidor conhecido |
| `get_candidatos_pesquisa_primeira_aula(p_unidade_id uuid, p_janela_dias integer, p_apenas_ontem boolean, p_incluir_enviados boolean)` | ATIVA | INVOKER · 🔓 anon | front:src/components/App/SucessoCliente/hooks/usePesquisaPrimeiraAula.ts, edge:supabase/functions/disparar-pesquisa-1a-aula-auto/index.ts, edge:supabase/functions/notificar-primeira-aula-fabi/index.ts |
| `get_checklist_detail(p_checklist_id uuid)` | ATIVA | DEFINER | front:src/components/App/Administrativo/PainelFarmer/hooks/useChecklistDetail.ts |
| `get_checklists_farmer(p_colaborador_id integer, p_unidade_id uuid, p_status text)` | ATIVA | INVOKER · 🔓 anon | front:src/components/App/Administrativo/PainelFarmer/hooks/useChecklists.ts, front:src/components/App/Administrativo/PainelFarmer/hooks/useDashboardStats.ts |
| `get_convite_anamnese(p_token text)` | ORFA | DEFINER · 🔓 anon | sem consumidor conhecido |
| `get_dados_retencao_ia(p_unidade_id uuid, p_ano integer, p_mes integer)` | ATIVA | INVOKER | front:src/components/App/Administrativo/PlanoAcaoRetencao.tsx |
| `get_dados_retencao_ia_legacy_p01g(p_unidade_id uuid, p_ano integer, p_mes integer)` | ORFA | INVOKER | sem consumidor conhecido |
| `get_historico_ltv(p_unidade_id uuid)` | ATIVA | DEFINER | front:src/components/GestaoMensal/ModalPermanenciaDetalhe.tsx, front:src/hooks/useHistoricoLTV.ts, funcao:get_tempo_permanencia |
| `get_historico_pedagogico_aluno(p_aluno_id integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `get_historico_pedagogico_aluno_interno_20260712(p_aluno_id integer)` | SO-INTERNA | DEFINER | funcao:get_historico_pedagogico_aluno |
| `get_historico_rotinas(p_colaborador_id integer, p_dias integer)` | ATIVA | DEFINER | front:src/components/App/Administrativo/PainelFarmer/HistoricoTab.tsx |
| `get_jornada_aluno(p_aluno_id integer)` | ATIVA | INVOKER | front:src/hooks/useJornadaAluno.ts |
| `get_jornada_professor(p_professor_id integer)` | ATIVA | DEFINER | front:src/hooks/useJornadaProfessor.ts, front:src/lib/carteiraProfessorDetalheCanonica.ts |
| `get_jornada_professor_trancados(p_professor_id integer)` | ATIVA | DEFINER | front:src/lib/carteiraProfessorDetalheCanonica.ts |
| `get_kpis_alunos_admin_operacional(p_unidade_id uuid, p_ano integer, p_mes integer)` | ATIVA | DEFINER | front:src/components/App/Administrativo/AdministrativoPage.tsx, front:src/components/App/Administrativo/ModalRelatorio.tsx, front:src/components/App/Alunos/AlunosPage.tsx, front:src/lib/estadoOperacionalAlunos.ts, edge:supabase/functions/bi-agent-lamusic/tools.ts, edge:supabase/functions/relatorio-admin-whatsapp/index.ts, +6 outros |
| `get_kpis_alunos_admin_operacional_impl_v2(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:get_kpis_alunos_admin_operacional |
| `get_kpis_alunos_canonicos(p_unidade_id uuid, p_ano integer, p_mes integer)` | ATIVA | DEFINER | front:src/lib/kpisAlunosVivosCanonicos.ts, funcao:get_dados_relatorio_gerencial_legacy_p02r_20260620, funcao:get_dados_retencao_ia, funcao:gravar_snapshot_fechamento_mensal, funcao:preview_fechamento_mensal |
| `get_kpis_alunos_canonicos_base_p01q(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:get_kpis_alunos_canonicos_base_p01t |
| `get_kpis_alunos_canonicos_base_p01t(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:get_kpis_alunos_canonicos_base_v131 |
| `get_kpis_alunos_canonicos_base_ticket_denominador_v1(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:get_kpis_alunos_canonicos |
| `get_kpis_alunos_canonicos_base_v131(p_unidade_id uuid, p_ano integer, p_mes integer, p_admin jsonb)` | SO-INTERNA | DEFINER | funcao:get_kpis_alunos_canonicos_base_ticket_denominador_v1 |
| `get_kpis_alunos_vinculos_vivo_canonico(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:get_kpis_alunos_canonicos_base_v131 |
| `get_kpis_retencao(p_ano integer, p_unidade character varying)` | ORFA | INVOKER · 🔓 anon | sem consumidor conhecido |
| `get_progresso_rotinas_hoje(p_colaborador_id integer)` | ATIVA | DEFINER | front:src/components/App/Administrativo/PainelFarmer/hooks/useRotinas.ts |
| `get_radar_renovacoes(p_unidade_id uuid)` | ORFA | INVOKER · 🔓 anon | sem consumidor conhecido |
| `get_respostas_evasao(p_unidade_id uuid, p_ano integer, p_mes integer)` | ORFA | INVOKER | sem consumidor conhecido |
| `get_respostas_pesquisa(p_unidade_id uuid, p_data_inicio date, p_data_fim date)` | ATIVA | INVOKER · 🔓 anon | front:src/components/App/SucessoCliente/hooks/useAnalisePesquisas.ts |
| `get_resumo_renovacoes_proximas(p_unidade_id uuid)` | ATIVA | DEFINER | front:src/components/App/Administrativo/AlertasRetencao.tsx, funcao:get_dados_retencao_ia, funcao:get_dados_retencao_ia_legacy_p01g |
| `get_rotinas_do_dia(p_colaborador_id integer, p_data date)` | ATIVA | DEFINER | front:src/components/App/Administrativo/PainelFarmer/hooks/useRotinas.ts |
| `get_situacao_alunos_resumo_v1(p_unidade_id uuid, p_referencia date)` | ORFA | DEFINER | sem consumidor conhecido |
| `get_situacao_alunos_v1(p_unidade_id uuid, p_referencia date, p_apenas_pendentes boolean)` | ATIVA | DEFINER | edge:supabase/functions/sincronizar-comunidade-whatsapp/index.ts, funcao:get_contrato_assinatura_aluno_v1, funcao:get_situacao_alunos_resumo_v1 |
| `get_tempo_permanencia(p_unidade_id uuid, p_ano integer, p_mes integer)` | ATIVA | DEFINER | front:src/components/App/Alunos/AlunosPage.tsx, funcao:get_kpis_alunos_canonicos_base_v131 |
| `get_timeline_pesquisas_aluno(p_aluno_id integer)` | ATIVA | DEFINER | front:src/components/App/SucessoCliente/TimelinePesquisasAluno.tsx |
| `get_trancamentos_admin_operacionais_v1(p_unidade_id uuid, p_data_referencia date)` | ATIVA | DEFINER | edge:supabase/functions/relatorio-admin-whatsapp/index.ts, funcao:montar_relatorio_admin_mensal_payload_base_v1 |
| `get_trancamentos_atuais_canonicos(p_unidade_id uuid)` | ATIVA | DEFINER | front:src/lib/estadoOperacionalAlunos.ts |
| `get_trancamentos_periodo_canonicos(p_unidade_id uuid, p_data_inicial date, p_data_final date)` | ATIVA | DEFINER | front:src/lib/estadoOperacionalAlunos.ts |
| `iniciar_revisao_pesquisa_evasao(p_analise_id uuid)` | ATIVA | DEFINER | front:src/components/App/SucessoCliente/ConversaPesquisaEvasao.tsx |
| `is_movimentacao_admin_retencao_valida(p_movimentacao_id integer)` | ATIVA | DEFINER | edge:supabase/functions/enviar-pesquisa-evasao/index.ts, view:vw_alertas_inteligentes, view:vw_dashboard_unidade, view:vw_evasoes_motivos, view:vw_evasoes_professores, view:vw_evasoes_resumo, +22 outros |
| `listar_evadidos_para_pesquisa(p_unidade_id uuid, p_limite integer, p_offset integer, p_status character varying)` | LEGADO | DEFINER | existe versao maior: listar_evadidos_para_pesquisa_v4 — sem consumidor conhecido |
| `listar_evadidos_para_pesquisa(p_unidade_id uuid, p_limite integer, p_offset integer, p_status character varying, p_ano integer, p_mes integer)` | LEGADO | DEFINER | existe versao maior: listar_evadidos_para_pesquisa_v4 — sem consumidor conhecido |
| `listar_evadidos_para_pesquisa_v2(p_unidade_id uuid, p_limite integer, p_offset integer, p_status character varying, p_ano integer, p_mes integer, p_busca text)` | SO-INTERNA | DEFINER | funcao:listar_evadidos_para_pesquisa_v3 |
| `listar_evadidos_para_pesquisa_v3(p_unidade_id uuid, p_limite integer, p_offset integer, p_status character varying, p_ano integer, p_mes integer, p_busca text)` | ATIVA | DEFINER | front:src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx, funcao:listar_evadidos_para_pesquisa_v4 |
| `listar_evadidos_para_pesquisa_v4(p_unidade_id uuid, p_limite integer, p_offset integer, p_status character varying, p_ano integer, p_mes integer, p_busca text)` | ORFA | DEFINER | sem consumidor conhecido |
| `listar_followups_pesquisa_evasao_v1(p_unidade_id uuid, p_limite integer, p_offset integer, p_estado text, p_ano integer, p_mes integer, p_busca text)` | ATIVA | DEFINER | front:src/components/App/SucessoCliente/hooks/useFollowupsEvasao.ts, front:src/components/App/SucessoCliente/hooks/useRepescagemEvasao.ts |
| `listar_pesquisas_evasao_revisao(p_unidade_id uuid, p_limite integer, p_offset integer)` | ATIVA | DEFINER | front:src/components/App/SucessoCliente/FilaRevisaoEvasao.tsx |
| `listar_pesquisas_evasao_teste_v1(p_evasao_id integer)` | ATIVA | DEFINER | front:src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx |
| `listar_respostas_evasao_analytics_v1(p_unidade_id uuid, p_ano integer, p_mes integer)` | ATIVA | DEFINER | front:src/components/App/SucessoCliente/hooks/useRespostasEvasao.ts |
| `marcar_aluno_sem_instagram_conciliacao(p_divergencia_id bigint, p_decidido_por text)` | ATIVA | DEFINER | front:src/components/App/Alunos/ConciliacaoMatriculas.tsx |
| `marcar_checklist_item(p_item_id uuid, p_concluida boolean, p_colaborador_id integer)` | ATIVA | DEFINER | front:src/components/App/Administrativo/PainelFarmer/hooks/useChecklistDetail.ts |
| `marcar_rotina_concluida(p_rotina_id uuid, p_colaborador_id integer, p_concluida boolean, p_data date)` | ATIVA | DEFINER | front:src/components/App/Administrativo/PainelFarmer/hooks/useRotinas.ts |
| `maria_lareport_buscar_alunos(p_busca text, p_unidade_id uuid, p_limit integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `maria_lareport_evasoes_mes_detalhe(p_unidade_id uuid, p_ano integer, p_mes integer, p_limit integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `movimentacao_conta_nos_kpis_v1(p_curso_id integer, p_tipo_matricula_id integer)` | SO-INTERNA | INVOKER | funcao:aplicar_retificacao_relatorio_gerencial_retencao_v1, funcao:get_kpis_alunos_canonicos_base_p01q, funcao:get_programa_fideliza_dados, funcao:is_movimentacao_admin_retencao_valida, funcao:radar_aluno_elegivel_v1, funcao:radar_guarda_elegibilidade, +1 outros |
| `normalizar_motivo_saida_alias(p_valor text)` | SO-INTERNA | INVOKER | funcao:resolver_motivo_saida_evasao_v1 |
| `obter_dados_classificacao_pesquisa_evasao_v1(p_pesquisa_id uuid)` | ATIVA | DEFINER | front:src/components/App/SucessoCliente/hooks/useClassificacaoEvasao.ts |
| `pesquisa_evasao_claim_snapshot(p_pesquisa_id uuid, p_deve_despachar boolean, p_preview_id uuid)` | SO-INTERNA | DEFINER | funcao:claim_pesquisa_evasao_preview |
| `pesquisa_evasao_elegivel_a_partir_v1(p_data_evasao date)` | SO-INTERNA | INVOKER | funcao:listar_evadidos_para_pesquisa_v3, funcao:pode_enviar_pesquisa_evasao |
| `pode_enviar_pesquisa_evasao(p_evasao_id integer)` | ATIVA | DEFINER | edge:supabase/functions/enviar-pesquisa-evasao/index.ts |
| `preparar_nova_analise_pesquisa_evasao(p_pesquisa_id uuid)` | ATIVA | DEFINER | edge:supabase/functions/webhook-whatsapp-inbox/evasao.ts |
| `promover_trocas_confirmadas_pela_jornada_v1(p_dry_run boolean)` | ATIVA | DEFINER | cron:promover-periodos-professor-ativos-exatos |
| `proximo_horario_envio_repescagem(p_base timestamp with time zone)` | SO-INTERNA | INVOKER | funcao:enfileirar_repescagem_evasao, funcao:falhar_repescagem_evasao_job |
| `radar_aluno_elegivel_v1(p_aluno_id bigint)` | ORFA | INVOKER | sem consumidor conhecido |
| `radar_bloco_comercial_grupo_v1(p_unidade_id uuid, p_limite integer, p_janela_dias integer)` | ATIVA | DEFINER | edge:supabase/functions/_shared/relatorio-comercial.ts, edge:supabase/functions/relatorio-admin-whatsapp/index.ts |
| `radar_detectar_aviso_previo_v1(p_data date)` | ATIVA | DEFINER | cron:radar-detectar-sinais-diario |
| `radar_detectar_calor_atendimento_v1(p_horas_minimas integer)` | ATIVA | DEFINER | edge:supabase/functions/ingerir-calor-atendimento/index.ts |
| `radar_detectar_sinais_comercial_v1()` | ATIVA | DEFINER | cron:radar-detectar-sinais-comercial-diario |
| `radar_detectar_sinais_sql_v1(p_data date)` | ATIVA | DEFINER | cron:radar-detectar-sinais-diario |
| `radar_dominio_do_sinal(p_regra_codigo text, p_entidade_tipo text, p_entidade_id bigint)` | SO-INTERNA | DEFINER | funcao:radar_guarda_elegibilidade |
| `radar_ficha_v1(p_unidade_id uuid, p_severidade_min text, p_limite integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `radar_guarda_elegibilidade()` | ATIVA | INVOKER · 🔓 anon | edge:supabase/functions/extrair-sinais-conversa/index.ts, trigger:radar_sinais.trg_radar_guarda_elegibilidade |
| `radar_mensagem_guardias_v1()` | ORFA | DEFINER | sem consumidor conhecido |
| `radar_pauta_v1(p_agente text, p_registrar boolean)` | ORFA | DEFINER | sem consumidor conhecido |
| `radar_pendencias_comerciais_v1(p_solicitante_telefone text, p_amostra integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `radar_publico_reativacao_v1(p_unidade_id uuid)` | SO-INTERNA | DEFINER | funcao:mila_estrategias_v1 |
| `radar_resolver_entidade_por_telefone(p_telefone text)` | ATIVA | DEFINER | edge:supabase/functions/extrair-sinais-conversa/index.ts, view:vw_instagram_sessoes_resolvidas, funcao:radar_detectar_calor_atendimento_v1 |
| `radar_trafego_canal_v1(p_dias integer, p_maturidade_dias integer)` | ATIVA | DEFINER | edge:supabase/functions/capturar-google-ads-diario/index.ts |
| `radar_trafego_criativo_v1(p_de date, p_ate date)` | ORFA | DEFINER | sem consumidor conhecido |
| `radar_trafego_gate_ok()` | SO-INTERNA | DEFINER | funcao:radar_trafego_canal_v1, funcao:radar_trafego_criativo_v1 |
| `reconciliar_saida_automatica_cancelada_v1(p_unidade_id uuid, p_emusys_matricula_id text, p_status_emusys text, p_observado_em timestamp with time zone)` | ATIVA | DEFINER | edge:supabase/functions/processar-matricula-emusys/index.ts, edge:supabase/functions/sync-matriculas-emusys/index.ts |
| `registrar_acao_pesquisa_evasao_v1(p_pesquisa_id uuid, p_classificacao_id uuid, p_tipo text, p_descricao text, p_prazo_em timestamp with time zone, p_professor_id integer)` | ATIVA | DEFINER | front:src/components/App/SucessoCliente/hooks/useClassificacaoEvasao.ts |
| `registrar_desfecho_pesquisa_evasao_v1(p_pesquisa_id uuid, p_classificacao_id uuid, p_desfecho text, p_observacao text)` | ATIVA | DEFINER | front:src/components/App/SucessoCliente/hooks/useClassificacaoEvasao.ts |
| `registrar_followup_pesquisa_evasao_v1(p_pesquisa_id uuid, p_acao text, p_canal text, p_observacao text)` | ATIVA | DEFINER | front:src/components/App/SucessoCliente/hooks/useFollowupsEvasao.ts |
| `registrar_movimentacao(p_aluno_id integer, p_unidade_id uuid, p_tipo character varying, p_curso_id integer, p_professor_id integer, p_motivo_saida_id integer, p_tipo_saida_id integer, p_canal_origem_id integer, p_valor_mensalidade numeric, p_observacoes text, p_created_by character varying)` | ORFA | INVOKER · 🔓 anon | sem consumidor conhecido |
| `registrar_resposta_pesquisa_manual(p_aluno_id integer, p_data date, p_tipo text, p_nota integer, p_comentario text, p_nao_respondeu boolean)` | ATIVA | DEFINER | front:src/components/App/SucessoCliente/ModalLancarRespostaManual.tsx |
| `registrar_resultado_pesquisa_evasao_envio(p_pesquisa_id uuid, p_preview_id uuid, p_idempotency_key uuid, p_auth_user_id uuid, p_resultado text, p_provider_message_id text, p_erro_sanitizado text)` | ATIVA | DEFINER | edge:supabase/functions/enviar-pesquisa-evasao/index.ts |
| `resolver_motivo_saida_evasao_v1(p_evasao_id integer)` | SO-INTERNA | DEFINER | funcao:listar_evadidos_para_pesquisa_v4, funcao:pode_enviar_pesquisa_evasao |
| `salvar_anamnese_online(p_token text, p_respostas jsonb, p_perfil jsonb)` | ORFA | DEFINER · 🔓 anon | sem consumidor conhecido |
| `sol_kpis_alunos_v1(p_unidade_id uuid, p_ano integer, p_mes integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_nome_mesma_pessoa_v1(p_a text, p_b text)` | SO-INTERNA | INVOKER | funcao:sol_caixa_aluno_por_responsavel, funcao:sol_caixa_casar_parcela, funcao:sol_caixa_derivar_valores_multi_aluno_v1, funcao:sol_caixa_identificar_aluno_novo_v1, funcao:sol_caixa_parcela_canonica, funcao:sol_caixa_resolver_composto_aluno_v1, +3 outros |
| `stats_pesquisa_evasao(p_unidade_id uuid, p_ano integer, p_mes integer)` | ATIVA | DEFINER | front:src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx |
| `vincular_alunos_checklist(p_checklist_id uuid, p_farmer_id integer, p_tipo_vinculo text, p_filtro_ids integer[])` | ATIVA | DEFINER | front:src/components/App/Administrativo/PainelFarmer/ChecklistsTab.tsx |
| `vincular_anamnese_aluno(p_anamnese_id integer, p_aluno_id integer)` | ATIVA | DEFINER | front:src/components/App/Alunos/ModalFichaAluno.tsx |

## comercial

| Função | Estado | Segurança | Consumidores |
|---|---|---|---|
| `admitir_refresh_snapshot_experimentais_v1(p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_origem text, p_agora timestamp with time zone)` | ATIVA | DEFINER | edge:supabase/functions/relatorio-admin-whatsapp/index.ts |
| `app_atualizar_lead_campos(p_experimental_id integer, p_telefone text, p_canal_origem_id integer, p_curso_interesse_id integer, p_faixa_etaria text, p_professor_experimental_id integer)` | ATIVA | DEFINER | front:src/components/App/Agenda/Chamada/ChamadaLeadDrawer.tsx |
| `app_confirmar_registro_experimental(p_registro_id uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_confirmar_registro_experimental(p_registro_id uuid, p_confirmado_por integer)` | ORFA | INVOKER | sem consumidor conhecido |
| `app_declarar_falta_experimental(p_vinculo_id bigint)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_experimental_do_professor(p_vinculo_id bigint)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_registrar_experimental(p_vinculo_id bigint, p_anotacao_pedagogica text, p_devolutiva_familia text, p_proximos_passos text, p_leitura_de_conversao text, p_origem text)` | SO-INTERNA | DEFINER | funcao:app_confirmar_registro_experimental |
| `atualizar_conversa_on_mensagem()` | ATIVA | INVOKER · 🔓 anon | trigger:crm_mensagens.tr_atualizar_conversa_on_mensagem |
| `atualizar_lead_experimental(p_telefone text, p_nome text, p_unidade_id uuid, p_status text, p_etapa integer, p_data_experimental date, p_horario_experimental time without time zone, p_professor_id integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `calcular_tempo_medio_resposta_crm(p_inicio text, p_fim text)` | ATIVA | DEFINER | front:src/components/App/PreAtendimento/tabs/DashboardTab.tsx |
| `consolidar_origem_leads_mes(p_ano integer, p_mes integer)` | ORFA | INVOKER · 🔓 anon | sem consumidor conhecido |
| `creditar_lalita_matricula()` | ORFA | INVOKER · 🔓 anon | sem consumidor conhecido |
| `criar_conversa_lead(p_lead_id integer, p_atribuido_a character varying)` | ORFA | DEFINER | sem consumidor conhecido |
| `exec_normalizar_telefone_atendimento()` | ATIVA | DEFINER | edge:supabase/functions/ingerir-calor-atendimento/index.ts |
| `existe_telefone_compartilhado_respondido(p_pesquisa_id uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `experimental_tem_par_na_grade(p_unidade_id uuid, p_nome_aluno text, p_data date, p_horario time without time zone)` | ATIVA | INVOKER | edge:supabase/functions/debug-webhook-emusys-observador/index.ts |
| `finalizar_refresh_snapshot_experimentais_v1(p_admissao_id uuid, p_execucao_id uuid, p_sucesso boolean, p_erro_codigo text)` | ATIVA | DEFINER | edge:supabase/functions/relatorio-admin-whatsapp/index.ts |
| `fn_celular_canonico(p_tel text)` | SO-INTERNA | INVOKER | funcao:app_confirmar_meu_whatsapp, funcao:app_meu_acesso, funcao:app_meu_onboarding, funcao:fabio_identidade_whatsapp, funcao:fn_professor_por_whatsapp |
| `fn_experimentais_a_extrair(p_dias integer, p_limite integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_experimental_contexto_seguro(p_contexto jsonb)` | ATIVA | INVOKER | view:vw_fabio_contexto_experimental, view:vw_fabio_experimental_agendada, funcao:app_experimental_do_professor |
| `fn_experimental_escalonadas()` | SO-INTERNA | DEFINER | funcao:fn_experimental_pendencia_do_professor |
| `fn_experimental_lembrete_alvos(p_minutos integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_experimental_pendencia_do_professor(p_professor_id integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_experimental_recebe_id_da_aula()` | ATIVA | INVOKER · 🔓 anon | trigger:aula_alunos_emusys.trg_experimental_recebe_id_da_aula |
| `fn_experimental_tem_registro(p_aula_local_id bigint)` | SO-INTERNA | DEFINER · 🔓 anon | funcao:app_minha_agenda_sessao_canonica_v2 |
| `fn_normalizar_telefone_br_key(p_telefone text)` | ATIVA | INVOKER · 🔓 anon | edge:supabase/functions/sincronizar-comunidade-whatsapp/index.ts, view:vw_jornada_lead_v1, funcao:exec_normalizar_telefone_atendimento, funcao:get_estrelas_matriculador_v1, funcao:get_situacao_alunos_sem_contrato_assinado_core_v1, funcao:get_situacao_lead_v1, +1 outros |
| `fn_propagar_professor_experimental()` | ATIVA | DEFINER | trigger:lead_experimentais.trg_propagar_professor_experimental |
| `fn_reconciliar_experimental_aulas(p_dias integer, p_limite integer)` | SO-INTERNA | DEFINER | funcao:fn_reconciliar_experimental_tick |
| `fn_reconciliar_experimental_por_lead(p_dias_atras integer, p_dias_frente integer, p_limite integer)` | SO-INTERNA | DEFINER | funcao:fn_reconciliar_experimental_tick |
| `fn_reconciliar_experimental_tick(p_dias integer, p_limite integer)` | ATIVA | DEFINER | cron:reconciliar-experimental-aulas |
| `fn_registrar_experimental_interno(p_vinculo_id bigint, p_anotacao_pedagogica text, p_devolutiva_familia text, p_proximos_passos text, p_leitura_de_conversao text, p_origem text)` | SO-INTERNA | DEFINER | funcao:app_confirmar_registro_experimental, funcao:app_registrar_experimental, funcao:fabio_gravar_registro_experimental_de_audio, funcao:fn_fila_audio_experimental_retomar |
| `fn_variantes_telefone_br(p_numero text)` | SO-INTERNA | INVOKER · 🔓 anon | funcao:fn_pedir_codigo_de_acesso |
| `get_conversa_pesquisa_evasao(p_pesquisa_id uuid)` | ATIVA | DEFINER | front:src/components/App/SucessoCliente/ConversaPesquisaEvasao.tsx |
| `get_conversas_campanha_lista(p_limit integer, p_busca text)` | ATIVA | INVOKER | front:src/components/App/Campanhas/hooks/useConversasCampanha.ts |
| `get_dados_comercial_ia(p_unidade_id uuid, p_ano integer, p_mes integer)` | ORFA | INVOKER · 🔓 anon | sem consumidor conhecido |
| `get_experimentais_comercial_diagnostico_v2(p_unidade_id uuid, p_ano integer, p_mes integer, p_periodo text, p_data date)` | ORFA | INVOKER | sem consumidor conhecido |
| `get_experimentais_emusys_operacional_v1(p_unidade_id uuid, p_ano integer, p_mes integer, p_periodo text, p_data date)` | ATIVA | DEFINER | front:src/components/App/Comercial/ComercialConciliacaoExperimentais.tsx, edge:supabase/functions/relatorio-admin-whatsapp/index.ts |
| `get_experimentais_professor_canonicos_v1(p_unidade_id uuid, p_ano integer, p_mes_inicio integer, p_mes_fim integer)` | SO-INTERNA | INVOKER | funcao:get_kpis_professor_periodo_canonico |
| `get_kpis_experimentais_professor(p_ano integer, p_mes integer, p_unidade_id uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `get_situacao_lead_v1(p_solicitante_telefone text, p_telefone_lead text, p_nome_lead text, p_lead_id integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `incrementar_respondidos_campanha(p_campanha_id uuid)` | ATIVA | DEFINER · 🔓 anon | edge:supabase/functions/meta-webhook-campanhas/index.ts |
| `limpar_mila_buffer_antigo()` | ORFA | DEFINER | sem consumidor conhecido |
| `marcar_conversa_lida(p_conversa_id uuid)` | ATIVA | DEFINER | front:src/components/App/PreAtendimento/hooks/useConversas.ts |
| `maria_lareport_consultor_matriculas_mes(p_unidade_id uuid, p_ano integer, p_mes integer, p_limit integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `maria_lareport_matriculas_mes_detalhe(p_unidade_id uuid, p_ano integer, p_mes integer, p_limit integer)` | SO-INTERNA | DEFINER | funcao:maria_lareport_consultor_matriculas_mes |
| `matriculas_comerciais_v1(p_unidade_id uuid, p_de date, p_ate date)` | SO-INTERNA | DEFINER | funcao:get_estrelas_matriculador_v1, funcao:mila_fechamento_dia_v1, funcao:mila_numeros_do_mes_v1 |
| `mila_anotar_lead_v1(p_solicitante_telefone text, p_lead_id integer, p_texto text)` | ORFA | DEFINER | sem consumidor conhecido |
| `mila_apelido_v1(p_nome text)` | SO-INTERNA | INVOKER | funcao:mila_briefing_manha_v1, funcao:mila_consultoras_ativas_v1, funcao:mila_cutucada_v1, funcao:mila_fechamento_dia_v1 |
| `mila_aprovar_recado_v1(p_solicitante_telefone text, p_recado_id uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `mila_atendimento_serie_v1(p_solicitante_telefone text, p_dias integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `mila_autoriza_lead(p_solicitante_telefone text, p_lead_id integer)` | SO-INTERNA | DEFINER | funcao:mila_anotar_lead_v1, funcao:mila_registrar_canal_origem_v1, funcao:mila_registrar_consultor_v1, funcao:mila_registrar_curso_interesse_v1, funcao:mila_registrar_motivo_perda_v1 |
| `mila_briefing_manha_v1(p_solicitante_telefone text, p_data date)` | ORFA | DEFINER | sem consumidor conhecido |
| `mila_check_disponibilidade_visita(p_unidade_id uuid, p_data date, p_horario time without time zone, p_telefone text)` | ORFA | DEFINER | sem consumidor conhecido |
| `mila_confirmar_recado_v1(p_recado_id uuid, p_conversation_id bigint, p_message_id bigint, p_erro text)` | ORFA | DEFINER | sem consumidor conhecido |
| `mila_confirmar_retorno_recado_v1(p_recado_id uuid, p_conversation_id bigint, p_erro text)` | ORFA | DEFINER | sem consumidor conhecido |
| `mila_consultoras_ativas_v1()` | ORFA | DEFINER | sem consumidor conhecido |
| `mila_cutucada_v1(p_solicitante_telefone text, p_limite integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `mila_desfecho_retomada_v1(p_solicitante_telefone text, p_retomada_id uuid, p_desfecho text, p_nota text)` | ORFA | DEFINER | sem consumidor conhecido |
| `mila_estrategias_v1(p_solicitante_telefone text)` | ORFA | DEFINER | sem consumidor conhecido |
| `mila_estrela_mais_perto_v1(u jsonb)` | SO-INTERNA | INVOKER | funcao:mila_briefing_manha_v1, funcao:mila_fechamento_dia_v1 |
| `mila_fechamento_dia_v1(p_solicitante_telefone text, p_data date)` | ORFA | DEFINER | sem consumidor conhecido |
| `mila_fechar_sinal_v1(p_solicitante_telefone text, p_sinal_id uuid, p_desfecho text, p_nota text)` | ORFA | DEFINER | sem consumidor conhecido |
| `mila_numeros_do_mes_v1(p_solicitante_telefone text, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:mila_fechamento_dia_v1 |
| `mila_padroes_v1(p_solicitante_telefone text, p_codigo text)` | ORFA | DEFINER | sem consumidor conhecido |
| `mila_propor_recado_v1(p_solicitante_telefone text, p_destino_tipo text, p_destino_ref text, p_texto text, p_assunto text)` | ORFA | DEFINER | sem consumidor conhecido |
| `mila_quem_sou_v1(p_telefone text)` | ORFA | DEFINER | sem consumidor conhecido |
| `mila_recado_para_mim_v1(p_telefone text)` | ORFA | DEFINER | sem consumidor conhecido |
| `mila_recado_pendente_v1(p_solicitante_telefone text)` | ORFA | DEFINER | sem consumidor conhecido |
| `mila_registrar_canal_origem_v1(p_solicitante_telefone text, p_lead_id integer, p_canal text, p_sobrescrever boolean)` | ORFA | DEFINER | sem consumidor conhecido |
| `mila_registrar_consultor_v1(p_solicitante_telefone text, p_lead_id integer, p_consultor text)` | ORFA | DEFINER | sem consumidor conhecido |
| `mila_registrar_curso_interesse_v1(p_solicitante_telefone text, p_lead_id integer, p_curso text)` | ORFA | DEFINER | sem consumidor conhecido |
| `mila_registrar_motivo_perda_v1(p_solicitante_telefone text, p_lead_id integer, p_motivo text, p_nota text)` | ORFA | DEFINER | sem consumidor conhecido |
| `mila_registrar_retomada_v1(p_solicitante_telefone text, p_lead_id bigint, p_frase text, p_prazo_texto text, p_motivo text)` | ORFA | DEFINER | sem consumidor conhecido |
| `mila_responder_recado_v1(p_telefone text, p_recado_id uuid, p_resposta text)` | ORFA | DEFINER | sem consumidor conhecido |
| `mila_retomadas_do_dia_v1(p_solicitante_telefone text, p_data date)` | SO-INTERNA | DEFINER | funcao:mila_briefing_manha_v1 |
| `mila_retorno_pendente_v1(p_telefone text, p_recado_id uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `mila_revisar_recado_v1(p_solicitante_telefone text, p_recado_id uuid, p_novo_texto text, p_motivo text)` | ORFA | DEFINER | sem consumidor conhecido |
| `mila_trilha(p_lead_id integer, p_lead_nome text, p_acao text, p_por text, p_detalhes jsonb)` | SO-INTERNA | DEFINER | funcao:mila_anotar_lead_v1, funcao:mila_fechar_sinal_v1, funcao:mila_registrar_canal_origem_v1, funcao:mila_registrar_consultor_v1, funcao:mila_registrar_curso_interesse_v1, funcao:mila_registrar_motivo_perda_v1 |
| `normalizar_payload_emusys_experimental_minimo()` | ATIVA | INVOKER | trigger:emusys_experimentais_raw.trg_normalizar_payload_emusys_experimental_minimo |
| `normalize_phone(tel text)` | ORFA | INVOKER · 🔓 anon | sem consumidor conhecido |
| `normalize_telefone(tel text)` | SO-INTERNA | INVOKER · 🔓 anon | funcao:get_candidatos_pesquisa_primeira_aula, funcao:trigger_normalize_telefone |
| `propagar_professor_experimental(p_emusys_lead_id integer)` | SO-INTERNA | DEFINER | funcao:fn_propagar_professor_experimental |
| `proteger_leitura_snapshot_experimentais_v1(p_admissao_id uuid, p_execucao_id uuid)` | ATIVA | DEFINER | edge:supabase/functions/relatorio-admin-whatsapp/index.ts |
| `registrar_experimental(p_telefone text, p_nome_aluno text, p_unidade_id uuid, p_status text, p_etapa integer, p_data_experimental date, p_horario_experimental time without time zone, p_professor_id integer, p_emusys_lead_id integer, p_created_at timestamp with time zone, p_curso text, p_emusys_aula_id integer)` | ATIVA | DEFINER | edge:supabase/functions/debug-webhook-emusys-observador/index.ts |
| `registrar_retomada_de_conversa_v1(p_lead_id bigint, p_frase text, p_prazo_texto text, p_conversation_id bigint, p_motivo text)` | ATIVA | DEFINER | edge:supabase/functions/extrair-sinais-conversa/index.ts |
| `resetar_teste_mila(p_lead_id integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_tel_chave(p_tel text)` | SO-INTERNA | INVOKER | funcao:sol_caixa_ator_operacao_ok, funcao:sol_caixa_autorizar_payload_v1, funcao:sol_caixa_quem_e |
| `texto_indica_sem_instagram(p_text text)` | ORFA | INVOKER · 🔓 anon | sem consumidor conhecido |
| `toggle_mila_conversa(p_conversa_id uuid, p_pausar boolean, p_operador character varying)` | ATIVA | DEFINER | front:src/components/App/PreAtendimento/components/chat/ChatPanel.tsx |
| `trg_experimental_preenche_curso_do_lead()` | ATIVA | DEFINER · 🔓 anon | trigger:lead_experimentais.trg_experimental_preenche_curso |
| `trg_lead_herda_consultor_da_unidade()` | ATIVA | INVOKER · 🔓 anon | trigger:leads.trg_lead_herda_consultor |
| `trigger_normalize_telefone()` | ATIVA | INVOKER · 🔓 anon | trigger:leads.tr_normalize_telefone_leads |
| `update_mila_config_updated_at()` | ATIVA | INVOKER · 🔓 anon | trigger:mila_config.trigger_mila_config_updated_at |
| `upsert_lead(p_nome text, p_telefone text, p_email text, p_unidade_id uuid, p_curso text, p_canal text, p_source_id integer, p_source_type text, p_arquivar boolean, p_data_contato date, p_data_nascimento date)` | ATIVA | DEFINER | edge:supabase/functions/agente-webhook/index.ts, edge:supabase/functions/debug-webhook-emusys-observador/index.ts, edge:supabase/functions/varrer-atribuicao-meta-ads/index.ts |

## financeiro

| Função | Estado | Segurança | Consumidores |
|---|---|---|---|
| `aplicar_denominador_ticket_kpis_v1(p_base jsonb, p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:get_kpis_alunos_canonicos |
| `aplicar_financeiro_ticket_contratual_v1(p_base jsonb, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:aplicar_financeiro_ticket_contratual_v2, funcao:aplicar_financeiro_ticket_contratual_v3 |
| `aplicar_financeiro_ticket_contratual_v2(p_base jsonb, p_unidade_id uuid, p_ano integer, p_mes integer)` | LEGADO | DEFINER | existe versao maior: aplicar_financeiro_ticket_contratual_v4 — sem consumidor conhecido |
| `aplicar_financeiro_ticket_contratual_v3(p_base jsonb, p_unidade_id uuid, p_ano integer, p_mes integer)` | LEGADO | DEFINER | existe versao maior: aplicar_financeiro_ticket_contratual_v4 — sem consumidor conhecido |
| `aplicar_financeiro_ticket_contratual_v4(p_base jsonb, p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:get_financeiro_faturas_emusys |
| `aplicar_valor_parcela_comercial_canonico()` | ATIVA | INVOKER · 🔓 anon | trigger:alunos.trg_alunos_valor_parcela_comercial_canonico |
| `calcular_valores_fatura_financeiro_v1(p_valor_original numeric, p_desconto_fixo numeric, p_desconto_condicional numeric, p_data_vencimento date, p_status text, p_as_of_date date)` | SO-INTERNA | INVOKER | funcao:get_faturas_alunos_financeiro_v1_base, funcao:get_faturas_alunos_financeiro_v1_canonica_20260817, funcao:get_faturas_alunos_financeiro_v1_reconciliacao_base, funcao:get_inadimplencia_canonica_v4_base |
| `claim_financeiro_sync_job(p_worker_id uuid, p_lease_seconds integer)` | ATIVA | DEFINER | edge:supabase/functions/sync-faturas-emusys/index.ts |
| `complete_financeiro_sync_job(p_job_id uuid, p_worker_id uuid, p_sync_run_id uuid)` | ATIVA | DEFINER | edge:supabase/functions/sync-faturas-emusys/index.ts |
| `diagnosticar_captura_fechamento_mensal_v1(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:get_relatorio_gerencial_canonico_v1 |
| `enqueue_financeiro_sync_backlog(p_trigger_source text, p_requested_by text)` | ATIVA | DEFINER | edge:supabase/functions/sync-faturas-emusys/index.ts |
| `fail_financeiro_sync_job(p_job_id uuid, p_worker_id uuid, p_sync_run_id uuid, p_error_code text, p_error_detail text)` | ATIVA | DEFINER | edge:supabase/functions/sync-faturas-emusys/index.ts |
| `fail_financeiro_sync_run(p_run_id uuid, p_erro_detalhe text)` | ATIVA | DEFINER | edge:supabase/functions/sync-faturas-emusys/index.ts |
| `financeiro_classificar_tipo_fatura_v1(p_numero_parcela integer, p_descricao text)` | SO-INTERNA | INVOKER | funcao:financeiro_enriquecer_tipo_fatura_v1, funcao:financeiro_enriquecer_tipos_fatura_v1 |
| `financeiro_enriquecer_fatura_item(p_item jsonb)` | SO-INTERNA | DEFINER · 🔓 anon | funcao:get_faturas_alunos_financeiro_v1_contrato_tipo_20260817 |
| `financeiro_enriquecer_tipo_fatura_v1(p_item jsonb)` | SO-INTERNA | DEFINER | funcao:get_faturas_alunos_financeiro_v1_contrato_tipo_lento_20260817 |
| `financeiro_enriquecer_tipos_fatura_v1(p_items jsonb)` | SO-INTERNA | DEFINER | funcao:get_faturas_alunos_financeiro_v1 |
| `financeiro_fatura_reconciliacao_decisao_immutavel()` | ATIVA | INVOKER · 🔓 anon | trigger:financeiro_fatura_reconciliacao_decisoes.financeiro_fatura_reconciliacao_decisao_immutavel |
| `fn_contrato_assinatura_pode_ler_v1(p_unidade_id uuid)` | SO-INTERNA | DEFINER | funcao:get_contrato_assinatura_aluno_v1, funcao:get_situacao_alunos_sem_contrato_assinado_v1 |
| `fn_financeiro_snapshot_append_only()` | ATIVA | INVOKER · 🔓 anon | trigger:emusys_fatura_source_events.trg_emusys_fatura_source_events_append_only, trigger:sync_run_items.trg_sync_run_items_append_only, trigger:sync_run_overrides.trg_sync_run_overrides_append_only |
| `fn_financeiro_sync_run_guard()` | ATIVA | INVOKER · 🔓 anon | trigger:sync_runs.trg_sync_runs_guard |
| `forma_pagamento_ultima_fatura_por_pessoa(p_unidade_id uuid)` | ATIVA | DEFINER | edge:supabase/functions/sync-matriculas-emusys/index.ts |
| `garantir_bloco_financeiro_gerencial_v1(p_ano integer, p_mes integer, p_unidade_id uuid)` | SO-INTERNA | DEFINER | funcao:fechar_competencia_mensal_dia1_v1 |
| `get_contrato_assinatura_aluno_v1(p_aluno_id integer)` | ATIVA | DEFINER | front:src/hooks/useContratoAssinaturaAluno.ts |
| `get_faturas_alunos_financeiro_v1(p_unidade_id uuid, p_ano integer, p_mes integer, p_modo_periodo text, p_status text, p_as_of_date date)` | ATIVA | DEFINER | front:src/lib/faturasAlunosFinanceiras.ts, funcao:sol_faturas_alunos_v1 |
| `get_faturas_alunos_financeiro_v1_base(p_unidade_id uuid, p_ano integer, p_mes integer, p_modo_periodo text, p_status text, p_as_of_date date)` | ORFA | DEFINER | sem consumidor conhecido |
| `get_faturas_alunos_financeiro_v1_canonica_20260817(p_unidade_id uuid, p_ano integer, p_mes integer, p_modo_periodo text, p_status text, p_as_of_date date)` | ATIVA | DEFINER | front:src/lib/faturasAlunosFinanceiras.ts, funcao:get_faturas_alunos_financeiro_v1_contrato_20260817 |
| `get_faturas_alunos_financeiro_v1_contrato_20260817(p_unidade_id uuid, p_ano integer, p_mes integer, p_modo_periodo text, p_status text, p_as_of_date date)` | SO-INTERNA | DEFINER | funcao:get_faturas_alunos_financeiro_v1_contrato_tipo_20260817 |
| `get_faturas_alunos_financeiro_v1_contrato_tipo_20260817(p_unidade_id uuid, p_ano integer, p_mes integer, p_modo_periodo text, p_status text, p_as_of_date date)` | SO-INTERNA | DEFINER | funcao:get_faturas_alunos_financeiro_v1, funcao:get_faturas_alunos_financeiro_v1_contrato_tipo_lento_20260817 |
| `get_faturas_alunos_financeiro_v1_contrato_tipo_lento_20260817(p_unidade_id uuid, p_ano integer, p_mes integer, p_modo_periodo text, p_status text, p_as_of_date date)` | ORFA | DEFINER | sem consumidor conhecido |
| `get_faturas_alunos_financeiro_v1_reconciliacao_base(p_unidade_id uuid, p_ano integer, p_mes integer, p_modo_periodo text, p_status text, p_as_of_date date)` | ORFA | DEFINER | sem consumidor conhecido |
| `get_financeiro_faturas_emusys(p_unidade_id uuid, p_ano integer, p_mes integer)` | ATIVA | DEFINER | front:src/components/App/Administrativo/ModalRelatorio.tsx, front:src/lib/financeiroFaturasEmusys.ts, funcao:aplicar_retificacao_relatorio_gerencial_financeiro_v1, funcao:fechar_competencia_mensal_canonica_v2, funcao:fechar_competencia_mensal_dia1_v1, funcao:garantir_bloco_financeiro_gerencial_v1, +1 outros |
| `get_financeiro_faturas_emusys_base_ticket_contratual_v1(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:get_financeiro_faturas_emusys |
| `get_inadimplencia_canonica(p_unidade_id uuid, p_as_of_date date)` | ATIVA | DEFINER | front:src/components/App/Administrativo/PainelFarmer/hooks/useAlertas.ts, front:src/components/App/Alunos/AlunosPage.tsx, front:src/lib/faturasAlunosCanonicas.ts, edge:supabase/functions/atualizar-inadimplencia-emusys/index.ts, edge:supabase/functions/export-contas-receber/index.ts, funcao:get_faturas_alunos_financeiro_v1_base, +5 outros |
| `get_inadimplencia_canonica_v3_base(p_unidade_id uuid, p_as_of_date date)` | SO-INTERNA | DEFINER | funcao:get_inadimplencia_canonica_v4_base |
| `get_inadimplencia_canonica_v4_base(p_unidade_id uuid, p_as_of_date date)` | SO-INTERNA | DEFINER | funcao:get_inadimplencia_canonica |
| `get_kpis_alunos_financeiro_vivo_canonico(p_unidade_id uuid, p_ano integer, p_mes integer)` | ATIVA | DEFINER | edge:supabase/functions/bi-agent-lamusic/tools.ts, funcao:aplicar_denominador_ticket_kpis_v1, funcao:aplicar_financeiro_ticket_contratual_v4, funcao:get_kpis_alunos_canonicos_base_p01t |
| `get_situacao_alunos_sem_contrato_assinado_core_v1(p_unidade_id uuid, p_referencia date, p_apenas_pendentes boolean)` | SO-INTERNA | DEFINER | funcao:get_situacao_alunos_sem_contrato_assinado_v1 |
| `get_situacao_alunos_sem_contrato_assinado_v1(p_unidade_id uuid, p_referencia date, p_apenas_pendentes boolean)` | SO-INTERNA | DEFINER | funcao:get_situacao_alunos_v1 |
| `gravar_snapshot_fechamento_mensal(p_ano integer, p_mes integer, p_unidade_id uuid, p_observacao text, p_confirmar_alertas boolean)` | SO-INTERNA | DEFINER | funcao:fechar_competencia_mensal_automatico |
| `marcar_inadimplentes_apos_vencimento()` | ORFA | DEFINER | sem consumidor conhecido |
| `preview_fechamento_mensal(p_ano integer, p_mes integer, p_unidade_id uuid, p_incluir_payloads boolean)` | SO-INTERNA | DEFINER | funcao:gravar_snapshot_fechamento_mensal |
| `proteger_fechamento_mensal_snapshot_imutavel_v1()` | ATIVA | DEFINER | trigger:fechamento_mensal_snapshots.trg_fechamento_mensal_snapshot_imutavel |
| `publish_financeiro_sync_run(p_run_id uuid, p_items jsonb, p_units_summary jsonb, p_override_reason text)` | ATIVA | DEFINER | edge:supabase/functions/sync-faturas-emusys/index.ts |
| `reabrir_caixa_diario(p_caixa_diario_id uuid, p_motivo text, p_reaberto_por text)` | ATIVA | DEFINER | front:src/hooks/useCaixaDiario.ts |
| `registrar_contrato_assinatura_lote_v1(p_execucao_id uuid, p_unidade_id uuid, p_observado_em timestamp with time zone, p_linhas jsonb)` | ATIVA | DEFINER | edge:supabase/functions/sync-contratos-assinatura-emusys/index.ts |
| `resolver_reconciliacao_fatura(p_unidade_id uuid, p_emusys_fatura_id bigint, p_tipo_decisao text, p_observacao text, p_canonical_fatura_id uuid, p_emusys_matricula_id bigint, p_emusys_student_id bigint, p_forma_pagamento_id integer, p_decidido_por text)` | ATIVA | DEFINER | front:src/components/App/FaturasAlunos/FaturasAlunosFinanceirasPage.tsx |
| `retry_financeiro_sync_job(p_job_id uuid, p_worker_id uuid, p_sync_run_id uuid, p_error_code text, p_error_detail text, p_http_status integer, p_retry_after_seconds integer)` | ATIVA | DEFINER | edge:supabase/functions/sync-faturas-emusys/index.ts |
| `rpc_marcar_inadimplentes()` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_abrir(p_payload jsonb)` | LEGADO | DEFINER | existe versao maior: sol_caixa_abrir_v3 — sem consumidor conhecido |
| `sol_caixa_abrir_v3(p_payload jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_aluno_da_fatura_v1(p_unidade_id uuid, p_fatura_id uuid)` | SO-INTERNA | DEFINER | funcao:sol_caixa_casar_parcela, funcao:sol_caixa_parcela_canonica |
| `sol_caixa_aluno_por_responsavel(p_unidade_id uuid, p_nome text)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_ator_ok(p_unidade uuid, p_num text)` | SO-INTERNA | DEFINER | funcao:sol_caixa_abrir, funcao:sol_caixa_fechar, funcao:sol_caixa_lancar_saida |
| `sol_caixa_ator_operacao_ok(p_unidade uuid, p_num text, p_operacao text)` | SO-INTERNA | DEFINER | funcao:sol_caixa_autorizar_payload_v1 |
| `sol_caixa_autorizar_payload_v1(p_unidade uuid, p_payload jsonb, p_operacao text)` | SO-INTERNA | DEFINER | funcao:sol_caixa_buscar_movimentos_v1, funcao:sol_caixa_corrigir_movimento_v1, funcao:sol_caixa_estornar_movimento_v1, funcao:sol_caixa_reabrir_caixa_v1, funcao:sol_caixa_v3_validar_approval_v1, funcao:sol_caixa_validar_abertura_fechamento_v1 |
| `sol_caixa_buscar_lancamento_para_correcao(p_payload jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_buscar_movimentos_v1(p_payload jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_casar_parcela(p_unidade_id uuid, p_aluno text, p_valor numeric, p_competencia text)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_corrigir_forma_recebimento(p_payload jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_corrigir_movimento_v1(p_payload jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_dados_abertura(p_unidade_id uuid, p_data date)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_dados_fechamento(p_caixa_diario_id uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_derivar_valores_multi_aluno_v1(p_unidade_id uuid, p_itens jsonb, p_valor_total numeric, p_as_of date)` | SO-INTERNA | DEFINER | funcao:sol_caixa_resolver_multi_aluno_v1 |
| `sol_caixa_estornar_movimento_v1(p_payload jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_executar_abertura_fechamento_v3(p_payload jsonb, p_operacao text)` | SO-INTERNA | DEFINER · 🔓 anon | funcao:sol_caixa_abrir_v3, funcao:sol_caixa_fechar_v3 |
| `sol_caixa_fechar(p_payload jsonb)` | LEGADO | DEFINER | existe versao maior: sol_caixa_fechar_v3 — sem consumidor conhecido |
| `sol_caixa_fechar_v3(p_payload jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_grupo_operacao_ok(p_unidade uuid, p_grupo_jid text, p_operacao text)` | SO-INTERNA | DEFINER | funcao:sol_caixa_autorizar_payload_v1, funcao:sol_caixa_v3_validar_approval_v1 |
| `sol_caixa_identificar_aluno_novo_v1(p_unidade_id uuid, p_nome text)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_identificar_por_pagador(p_unidade_id uuid, p_nome text)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_inadimplentes(p_unidade_id uuid, p_carencia_dias integer, p_multa_pct numeric, p_mora_pct_mes numeric, p_grave_dias integer, p_critico_dias integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_ingestao_registrar(p_payload jsonb)` | SO-INTERNA | DEFINER | funcao:sol_caixa_readonly_preflight_v2, funcao:sol_caixa_readonly_preflight_v3 |
| `sol_caixa_ja_lancado_hoje(p_unidade_id uuid, p_valor numeric, p_aluno text, p_data date)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_lancar_recebimento(p_payload jsonb)` | SO-INTERNA | DEFINER | funcao:sol_caixa_lancar_recebimento_lote_v1, funcao:sol_caixa_readonly_preflight_v2, funcao:sol_caixa_readonly_preflight_v3 |
| `sol_caixa_lancar_recebimento_lote_v1(p_payload jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_lancar_saida(p_payload jsonb)` | SO-INTERNA | DEFINER | funcao:sol_caixa_readonly_preflight_v2, funcao:sol_caixa_readonly_preflight_v3 |
| `sol_caixa_normalizar_competencia_v1(p_competencia text)` | SO-INTERNA | INVOKER | funcao:sol_caixa_resolver_composto_aluno_v1, funcao:sol_caixa_resolver_multi_aluno_v1 |
| `sol_caixa_parcela_canonica(p_unidade_id uuid, p_aluno text, p_valor numeric, p_as_of date)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_pendencia_aguardando(p_chat_id text)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_pendencia_criar(p_payload jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_pendencia_resolver(p_id uuid, p_status text, p_por text)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_quem_e(p_telefone text, p_unidade_id uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_reabrir_caixa_v1(p_payload jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_readonly_preflight_v1()` | LEGADO | DEFINER | existe versao maior: sol_caixa_readonly_preflight_v3 — sem consumidor conhecido |
| `sol_caixa_readonly_preflight_v2()` | LEGADO | DEFINER | existe versao maior: sol_caixa_readonly_preflight_v3 — sem consumidor conhecido |
| `sol_caixa_readonly_preflight_v3()` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_recalcular_cofre(p_caixa_diario_id uuid)` | SO-INTERNA | DEFINER | funcao:sol_caixa_corrigir_movimento_v1, funcao:sol_caixa_estornar_movimento_v1 |
| `sol_caixa_resolver_abertura_v3(p_payload jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_resolver_composto_aluno_v1(p_payload jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_resolver_fechamento_v3(p_payload jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_resolver_multi_aluno_v1(p_unidade_id uuid, p_itens jsonb, p_valor_total numeric, p_as_of date)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_responsavel_aluno(p_unidade_id uuid, p_aluno text)` | SO-INTERNA | DEFINER | funcao:sol_caixa_resolver_composto_aluno_v1 |
| `sol_caixa_resumo_do_dia(p_unidade_id uuid, p_data date)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_shadow_registrar(p_payload jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_shadow_registrar_approval(payload jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_snapshot_abertura_fechamento_v3(p_unidade_id uuid, p_data_caixa date, p_operacao text)` | SO-INTERNA | DEFINER · 🔓 anon | funcao:sol_caixa_executar_abertura_fechamento_v3, funcao:sol_caixa_resolver_abertura_v3, funcao:sol_caixa_resolver_fechamento_v3 |
| `sol_caixa_v3_cancelar_preview_v1(p_payload jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_caixa_v3_validar_approval_v1(p_payload jsonb, p_operacao text)` | SO-INTERNA | DEFINER | funcao:sol_caixa_corrigir_movimento_v1, funcao:sol_caixa_estornar_movimento_v1, funcao:sol_caixa_lancar_recebimento, funcao:sol_caixa_lancar_recebimento_lote_v1, funcao:sol_caixa_lancar_saida |
| `sol_caixa_validar_abertura_fechamento_v1(p_payload jsonb, p_operacao text)` | SO-INTERNA | DEFINER | funcao:sol_caixa_executar_abertura_fechamento_v3 |
| `sol_caixa_validar_multi_aluno_snapshot_v1(p_unidade_id uuid, p_itens jsonb, p_valor_total numeric, p_as_of date)` | SO-INTERNA | DEFINER | funcao:sol_caixa_lancar_recebimento_lote_v1 |
| `sol_custo_seguranca_v1(p_unidade_id uuid, p_desde date)` | ORFA | DEFINER | sem consumidor conhecido |
| `sol_faturas_alunos_v1(p_unidade_id uuid, p_ano integer, p_mes integer, p_modo_periodo text, p_status text, p_as_of_date date)` | SO-INTERNA | DEFINER | funcao:sol_caixa_derivar_valores_multi_aluno_v1, funcao:sol_caixa_parcela_canonica, funcao:sol_caixa_resolver_composto_aluno_v1, funcao:sol_caixa_resolver_multi_aluno_v1, funcao:sol_caixa_validar_multi_aluno_snapshot_v1 |
| `sol_inadimplencia_v1(p_unidade_id uuid, p_as_of_date date)` | SO-INTERNA | DEFINER | funcao:sol_caixa_inadimplentes |
| `start_financeiro_sync_run(p_competencia date, p_trigger_source text, p_requested_by text, p_stale_timeout_seconds integer)` | ATIVA | DEFINER | edge:supabase/functions/sync-faturas-emusys/index.ts |
| `trg_marcar_contratos_para_recalculo()` | ATIVA | DEFINER · 🔓 anon | trigger:calendario_escolar.trg_marcar_contratos_para_recalculo |

## gestao

| Função | Estado | Segurança | Consumidores |
|---|---|---|---|
| `aplicar_retificacao_relatorio_admin_mensal_renovacoes_v1(p_unidade_id uuid, p_ano integer, p_mes integer, p_payload_hash_esperado text, p_motivo text, p_evidencias jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `aplicar_retificacao_relatorio_comercial_matricula_tardia_v1(p_unidade_id uuid, p_ano integer, p_mes integer, p_payload_hash_esperado text, p_aluno_id bigint, p_emusys_matricula_id text, p_data_matricula date, p_motivo text, p_evidencias jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `aplicar_retificacao_relatorio_comercial_mensal_v1(p_unidade_id uuid, p_ano integer, p_mes integer, p_payload_hash_esperado text, p_motivo text, p_evidencias jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `aplicar_retificacao_relatorio_gerencial_financeiro_v1(p_unidade_id uuid, p_ano integer, p_mes integer, p_payload_hash_esperado text, p_motivo text, p_evidencias jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `aplicar_retificacao_relatorio_gerencial_retencao_v1(p_unidade_id uuid, p_ano integer, p_mes integer, p_payload_hash_esperado text, p_motivo text, p_evidencias jsonb, p_confirma_divergencia_alheia boolean)` | ORFA | DEFINER | sem consumidor conhecido |
| `aplicar_snapshot_experimentais_emusys_admitido_v1(p_admissao_id uuid, p_execucao_id uuid, p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_itens jsonb)` | ATIVA | DEFINER | edge:supabase/functions/sync-presenca-emusys/index.ts |
| `aplicar_snapshot_experimentais_emusys_metadados_v1(p_execucao_id uuid, p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_itens jsonb)` | ATIVA | DEFINER | edge:supabase/functions/sync-presenca-emusys/index.ts |
| `aplicar_snapshot_experimentais_emusys_v1(p_execucao_id uuid, p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_itens jsonb)` | SO-INTERNA | DEFINER | funcao:aplicar_snapshot_experimentais_emusys_admitido_v1, funcao:aplicar_snapshot_experimentais_emusys_metadados_v1, funcao:proteger_leitura_snapshot_experimentais_v1 |
| `assert_competencia_aberta(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:fechar_dados_mensais, funcao:recalcular_dados_mensais, funcao:upsert_dados_mensais |
| `atualizar_dados_mensais_por_snapshot(p_ano integer, p_mes integer, p_unidade_id uuid, p_dry_run boolean)` | SO-INTERNA | DEFINER | funcao:fechar_competencia_mensal_automatico |
| `capturar_relatorios_mensais_canonicos_v1(p_ano integer, p_mes integer, p_unidade_id uuid)` | SO-INTERNA | DEFINER | funcao:diagnosticar_captura_fechamento_mensal_v1, funcao:fechar_competencia_mensal_dia1_v1 |
| `cleanup_bi_conversations()` | ATIVA | DEFINER | cron:cleanup-bi-conversations |
| `concluir_lia_alerta_privado(p_alerta_id uuid, p_claim_token uuid, p_provider_message_id text)` | ATIVA | DEFINER | edge:supabase/functions/processar-alertas-lia/index.ts |
| `consolidar_dados_comerciais_mes(p_ano integer, p_mes integer)` | ORFA | INVOKER · 🔓 anon | sem consumidor conhecido |
| `enqueue_financeiro_sync_competencias(p_competencias date[], p_trigger_source text, p_requested_by text, p_priority integer)` | ATIVA | DEFINER | edge:supabase/functions/sync-faturas-emusys/index.ts, funcao:enqueue_financeiro_sync_backlog |
| `expurgar_lia_alertas_privados()` | ATIVA | DEFINER | cron:lia-alertas-privados-expurgo-diario |
| `falhar_lia_alerta_privado(p_alerta_id uuid, p_claim_token uuid, p_erro_codigo text, p_resultado_ambiguo boolean)` | ATIVA | DEFINER | edge:supabase/functions/processar-alertas-lia/index.ts |
| `fechar_competencia(p_unidade_id uuid, p_ano integer, p_mes integer, p_fechado_por text, p_motivo text, p_lote_id uuid)` | SO-INTERNA | DEFINER | funcao:fechar_competencia_mensal_canonica_v1, funcao:fechar_competencia_mensal_canonica_v2, funcao:fechar_relatorio_mensal_canonico_unidade_v1 |
| `fechar_competencia_mensal_automatico()` | ATIVA | DEFINER | cron:fechamento-mensal-automatico (inativo), funcao:fechar_competencia_mensal_dia1_v1 |
| `fechar_competencia_mensal_canonica_v1(p_ano integer, p_mes integer, p_motivo text)` | LEGADO | DEFINER | existe versao maior: fechar_competencia_mensal_canonica_v2 — sem consumidor conhecido |
| `fechar_competencia_mensal_canonica_v2(p_ano integer, p_mes integer, p_motivo text, p_unidade_id uuid, p_lote_id uuid)` | SO-INTERNA | DEFINER | funcao:fechar_competencia_mensal_dia1_v1 |
| `fechar_competencia_mensal_dia1_v1()` | ATIVA | DEFINER | cron:fechamento-mensal-dia1 |
| `fechar_dados_mensais(p_ano integer, p_mes integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fechar_dados_mensais_unguarded(p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:fechar_dados_mensais |
| `fechar_relatorio_mensal_canonico_unidade_v1(p_unidade_id uuid, p_ano integer, p_mes integer, p_motivo text)` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_bi_conversation_autofill()` | ATIVA | DEFINER | trigger:bi_conversations_lamusic.trg_bi_conversation_autofill |
| `fn_competencia_feedback(p_dia date)` | ATIVA | INVOKER | view:vw_radar_aluno_sinais_canonica_v2, view:vw_radar_aluno_sinais_legado_v1, funcao:app_coordenacao_feedback_mes, funcao:app_professor_feedback_mesa, funcao:app_professor_feedback_progresso, funcao:app_professor_feedback_salvar, +1 outros |
| `fn_completar_origem_retificacao_presenca()` | ATIVA | DEFINER | trigger:aluno_presenca_retificacoes.completar_origem_retificacao_presenca |
| `fn_enfileirar_relatorio_presenca(p_data date, p_dry_run boolean)` | SO-INTERNA | DEFINER | funcao:fn_enfileirar_relatorio_presenca_se_coberto_v1 |
| `fn_enfileirar_relatorio_presenca_se_coberto_v1(p_data date)` | ATIVA | DEFINER | cron:relatorio-presenca-pendencias-9h |
| `fn_proteger_analise_evasao_revisada()` | ATIVA | INVOKER · 🔓 anon | trigger:pesquisa_evasao_analises.trg_proteger_analise_evasao_revisada |
| `fn_texto_relatorio_presenca(p_unidade_id uuid, p_data date)` | ATIVA | DEFINER | edge:supabase/functions/relatorio-admin-whatsapp/index.ts, funcao:fn_enfileirar_relatorio_presenca |
| `fn_texto_relatorio_presenca_canonica_v2(p_unidade_id uuid, p_data date)` | SO-INTERNA | DEFINER | funcao:fn_texto_relatorio_presenca, funcao:fn_texto_relatorio_presenca_consolidado_canonico_v2 |
| `fn_texto_relatorio_presenca_consolidado(p_data date)` | SO-INTERNA | DEFINER | funcao:fn_enfileirar_relatorio_presenca |
| `fn_texto_relatorio_presenca_consolidado_canonico_v2(p_data date)` | SO-INTERNA | DEFINER | funcao:fn_texto_relatorio_presenca_consolidado |
| `fn_texto_relatorio_presenca_consolidado_legado_v1(p_data date)` | SO-INTERNA | DEFINER | funcao:fn_texto_relatorio_presenca_consolidado |
| `fn_texto_relatorio_presenca_legado_v1(p_unidade_id uuid, p_data date)` | SO-INTERNA | DEFINER | funcao:fn_presenca_fila_proveniencia_rollout_v1, funcao:fn_texto_relatorio_presenca, funcao:fn_texto_relatorio_presenca_consolidado_legado_v1 |
| `get_analise_pesquisas(p_unidade_id uuid, p_data_inicio date, p_data_fim date)` | ATIVA | INVOKER · 🔓 anon | front:src/components/App/SucessoCliente/hooks/useAnalisePesquisas.ts |
| `get_comparativo_anos(p_ano_atual integer, p_ano_anterior integer)` | ATIVA | INVOKER · 🔓 anon | front:src/hooks/useSupabase.ts |
| `get_comparativo_fechamento_mensal_v1(p_unidade_id uuid, p_atual_ano integer, p_atual_mes integer, p_anterior_ano integer, p_anterior_mes integer)` | SO-INTERNA | DEFINER | funcao:get_relatorio_gerencial_canonico_comparativos_final_base_v1, funcao:get_relatorio_gerencial_canonico_metas_kpi_diagnostico_base_v1 |
| `get_dados_relatorio_gerencial(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:gravar_snapshot_fechamento_mensal, funcao:preview_fechamento_mensal |
| `get_dados_relatorio_gerencial_legacy_p01g(p_unidade_id uuid, p_ano integer, p_mes integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `get_dados_relatorio_gerencial_legacy_p02r_20260620(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:get_dados_relatorio_gerencial_legacy_p16_20260706 |
| `get_dados_relatorio_gerencial_legacy_p16_20260706(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:get_dados_relatorio_gerencial_legacy_p17_20260707 |
| `get_dados_relatorio_gerencial_legacy_p17_20260707(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:get_dados_relatorio_gerencial_legacy_p18_20260707 |
| `get_dados_relatorio_gerencial_legacy_p18_20260707(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:get_dados_relatorio_gerencial_legacy_p19_20260707 |
| `get_dados_relatorio_gerencial_legacy_p19_20260707(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:get_dados_relatorio_gerencial_legacy_p20_20260707 |
| `get_dados_relatorio_gerencial_legacy_p20_20260707(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:get_dados_relatorio_gerencial_legacy_p21_20260707 |
| `get_dados_relatorio_gerencial_legacy_p21_20260707(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:get_dados_relatorio_gerencial_legacy_p22_20260707 |
| `get_dados_relatorio_gerencial_legacy_p22_20260707(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:get_dados_relatorio_gerencial_legacy_p23_20260707 |
| `get_dados_relatorio_gerencial_legacy_p23_20260707(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:get_dados_relatorio_gerencial_legacy_rankings_p24_20260719 |
| `get_dados_relatorio_gerencial_legacy_rankings_p24_20260719(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:get_dados_relatorio_gerencial |
| `get_historico_mensal_matriculador(p_ano integer, p_unidade_id uuid)` | ORFA | INVOKER · 🔓 anon | sem consumidor conhecido |
| `get_kpis_comercial_canonicos_v2(p_unidade_id uuid, p_ano integer, p_mes integer, p_periodo text, p_data date)` | ATIVA | DEFINER | front:src/hooks/useComercialOperacionalResumoV2.ts, front:src/hooks/useComercialResumoV2.ts, front:src/hooks/useComercialSeriesMensaisV2.ts, front:src/hooks/useCursosData.ts, front:src/hooks/useMatriculadorPrograma.ts, front:src/hooks/useOrigemData.ts, +8 outros |
| `get_kpis_consolidados(p_ano integer)` | ATIVA | DEFINER | front:src/hooks/useSupabase.ts |
| `get_kpis_evolucao_mensal(p_unidade_id text, p_meses integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `get_metas_vs_realizado(p_ano integer)` | ORFA | INVOKER · 🔓 anon | sem consumidor conhecido |
| `get_relatorio_admin_mensal_rico_base_v1(p_unidade_id uuid, p_ano integer, p_mes integer)` | ATIVA | DEFINER | edge:supabase/functions/relatorio-admin-whatsapp/index.ts, funcao:get_relatorio_admin_mensal_rico_base_v2 |
| `get_relatorio_admin_mensal_rico_base_v2(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:get_relatorio_admin_mensal_rico_base_v3 |
| `get_relatorio_admin_mensal_rico_base_v3(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:get_relatorio_admin_mensal_rico_v1 |
| `get_relatorio_admin_mensal_rico_v1(p_unidade_id uuid, p_ano integer, p_mes integer)` | ATIVA | DEFINER | edge:supabase/functions/relatorio-admin-whatsapp/index.ts, funcao:get_relatorio_gerencial_canonico_base_v1 |
| `get_relatorio_coordenacao_canonico_v1(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:montar_relatorio_coordenacao_payload_v2 |
| `get_relatorio_coordenacao_canonico_v1_base_20260802(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:get_relatorio_coordenacao_canonico_v1 |
| `get_relatorio_coordenacao_canonico_v2(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:montar_relatorio_coordenacao_payload_v3 |
| `get_relatorio_coordenacao_canonico_v3(p_unidade_id uuid, p_ano integer, p_mes integer, p_periodicidade text)` | ATIVA | DEFINER | front:src/components/App/Professores/ModalRelatorioCoordenacao.tsx, edge:supabase/functions/gemini-relatorio-coordenacao/index.ts |
| `get_relatorio_gerencial_canonico_base_v1(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:get_relatorio_gerencial_canonico_comparativos_base_v1 |
| `get_relatorio_gerencial_canonico_comparativos_base_v1(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:get_relatorio_gerencial_canonico_comparativos_final_base_v1 |
| `get_relatorio_gerencial_canonico_comparativos_final_base_v1(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:get_relatorio_gerencial_canonico_metas_kpi_diagnostico_base_v1 |
| `get_relatorio_gerencial_canonico_metas_kpi_diagnostico_base_v1(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:get_relatorio_gerencial_canonico_v1 |
| `get_relatorio_gerencial_canonico_v1(p_unidade_id uuid, p_ano integer, p_mes integer)` | ATIVA | DEFINER | edge:supabase/functions/gemini-relatorio-gerencial/index.ts |
| `get_relatorio_gerencial_destaques_parciais_v1(p_unidade_id uuid, p_ano integer, p_mes integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `get_relatorio_gerencial_ranking_mensal_base_20260811034046(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:get_relatorio_gerencial_ranking_mensal_v2 |
| `get_relatorio_gerencial_ranking_mensal_canonico_v2(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:get_relatorio_gerencial_ranking_mensal_v1 |
| `get_relatorio_gerencial_ranking_mensal_media_turma_canonico_v1(p_unidade_id uuid, p_ano integer, p_mes integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `get_relatorio_gerencial_ranking_mensal_v1(p_unidade_id uuid, p_ano integer, p_mes integer)` | LEGADO | DEFINER | existe versao maior: get_relatorio_gerencial_ranking_mensal_v2 — sem consumidor conhecido |
| `get_relatorio_gerencial_ranking_mensal_v2(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:get_relatorio_gerencial_ranking_mensal_media_turma_canonico_v1 |
| `get_relatorio_mensal_canonico_v1(p_tipo text, p_unidade_id uuid, p_ano integer, p_mes integer)` | ATIVA | DEFINER | edge:supabase/functions/relatorio-admin-whatsapp/index.ts, funcao:aplicar_retificacao_relatorio_comercial_matricula_tardia_v1, funcao:get_relatorio_gerencial_canonico_base_v1 |
| `get_relatorio_mensal_snapshot_base_v1(p_tipo text, p_unidade_id uuid, p_ano integer, p_mes integer)` | ATIVA | DEFINER | edge:supabase/functions/relatorio-admin-whatsapp/index.ts, funcao:get_relatorio_mensal_canonico_v1 |
| `get_relatorio_pedagogico_aluno(p_aluno_id integer, p_data_inicio date, p_data_fim date)` | ATIVA | DEFINER | front:src/components/App/Alunos/ModalFichaAluno.tsx, edge:supabase/functions/gerar-relatorio-pedagogico/index.ts |
| `get_relatorio_pedagogico_aluno_interno_20260712(p_aluno_id integer, p_data_inicio date, p_data_fim date)` | SO-INTERNA | DEFINER | funcao:get_relatorio_pedagogico_aluno |
| `get_watchlist_projecao(p_unidade_id uuid, p_dias_futuros integer)` | ATIVA | INVOKER · 🔓 anon | front:src/components/App/Agenda/CalendarioEscolar.tsx |
| `listar_meta_source_ids_pendentes()` | ATIVA | DEFINER · 🔓 anon | edge:supabase/functions/enriquecer-meta-ads/index.ts |
| `materializar_projecao_contrato(p_aluno_id integer, p_matricula_disciplina_id bigint)` | SO-INTERNA | DEFINER · 🔓 anon | funcao:trg_materializar_projecao_jornada |
| `montar_relatorio_admin_mensal_payload_base_v1(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:montar_relatorio_admin_mensal_payload_base_v2_legacy_20260811 |
| `montar_relatorio_admin_mensal_payload_base_v2(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:montar_relatorio_admin_mensal_payload_base_v3 |
| `montar_relatorio_admin_mensal_payload_base_v2_legacy_20260811(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:montar_relatorio_admin_mensal_payload_base_v2 |
| `montar_relatorio_admin_mensal_payload_base_v3(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:montar_relatorio_admin_mensal_payload_base_v4 |
| `montar_relatorio_admin_mensal_payload_base_v4(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:montar_relatorio_admin_mensal_payload_v1 |
| `montar_relatorio_admin_mensal_payload_v1(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:capturar_relatorios_mensais_canonicos_v1, funcao:diagnosticar_captura_fechamento_mensal_v1 |
| `montar_relatorio_comercial_mensal_payload_sem_adicionais_v1(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:montar_relatorio_comercial_mensal_payload_sem_pagantes_v1 |
| `montar_relatorio_comercial_mensal_payload_sem_pagantes_v1(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:montar_relatorio_comercial_mensal_payload_v1 |
| `montar_relatorio_comercial_mensal_payload_v1(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:aplicar_retificacao_relatorio_comercial_mensal_v1, funcao:capturar_relatorios_mensais_canonicos_v1, funcao:diagnosticar_captura_fechamento_mensal_v1 |
| `pode_gerar_relatorio_admin_v1(p_unidade_id uuid)` | ATIVA | DEFINER | edge:supabase/functions/relatorio-admin-whatsapp/index.ts, funcao:exigir_acesso_kpis_admin_v1, funcao:get_relatorio_admin_mensal_rico_base_v1, funcao:get_relatorio_gerencial_canonico_base_v1, funcao:get_relatorio_mensal_snapshot_base_v1, funcao:get_trancamentos_admin_operacionais_v1 |
| `pode_gerar_relatorio_comercial_v1(p_unidade_id uuid)` | ATIVA | DEFINER | edge:supabase/functions/relatorio-admin-whatsapp/index.ts, funcao:get_experimentais_emusys_operacional_v1, funcao:get_relatorio_mensal_snapshot_base_v1 |
| `prever_projecao_contrato(p_unidade_id uuid, p_dia_semana text, p_data_inicio date, p_qtd_aulas integer)` | ATIVA | DEFINER · 🔓 anon | front:src/components/App/Alunos/ModalNovoAluno.tsx |
| `recalcular_dados_mensais(p_ano integer, p_mes integer, p_unidade_id uuid)` | ATIVA | DEFINER | front:src/components/App/Alunos/AlunosPage.tsx, front:src/components/GestaoMensal/TabGestao.tsx |
| `recalcular_dados_mensais_unguarded(p_ano integer, p_mes integer, p_unidade_id uuid)` | SO-INTERNA | DEFINER | funcao:recalcular_dados_mensais |
| `recalcular_projecao(p_aluno_id integer, p_matricula_disciplina_id bigint, p_trigger text, p_detalhes jsonb)` | ORFA | DEFINER · 🔓 anon | sem consumidor conhecido |
| `rpc_analise_turmas(p_unidade_id uuid, p_ano integer, p_mes integer)` | ATIVA | DEFINER | front:src/hooks/useAnaliseTurmas.ts |
| `snapshot_atendimento_consultor_v1(p_dia date)` | ATIVA | DEFINER | cron:snapshot-atendimento-comercial-diario |
| `snapshot_dados_mensais(p_ano integer, p_mes integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `snapshot_dados_mensais_unguarded(p_ano integer, p_mes integer)` | SO-INTERNA | INVOKER | funcao:snapshot_dados_mensais |
| `toggle_relatorio_comercial_cron(p_unidade_id uuid, p_ativo boolean)` | ATIVA | DEFINER · 🔓 anon | front:src/components/App/Comercial/ComercialPage.tsx |
| `toggle_relatorio_cron(p_unidade_id uuid, p_ativo boolean)` | ATIVA | DEFINER | front:src/components/App/Administrativo/ModalRelatorio.tsx |
| `trg_atualiza_projecao_por_presenca()` | ATIVA | DEFINER | trigger:aluno_presenca.trg_atualiza_projecao_por_presenca |
| `trg_materializar_projecao_jornada()` | ATIVA | DEFINER · 🔓 anon | trigger:aluno_jornada_matricula_disciplina.trg_materializar_projecao_jornada |
| `update_insights_salvos_timestamp()` | ATIVA | INVOKER · 🔓 anon | trigger:insights_salvos.trigger_update_insights_salvos_timestamp |
| `upsert_dados_mensais(p_unidade_codigo character varying, p_ano integer, p_mes integer, p_alunos_pagantes integer, p_novas_matriculas integer, p_evasoes integer, p_churn_rate numeric, p_ticket_medio numeric, p_taxa_renovacao numeric, p_tempo_permanencia integer, p_inadimplencia numeric, p_reajuste_parcelas numeric)` | ATIVA | DEFINER | front:src/hooks/useSupabaseMutations.ts |
| `upsert_dados_mensais_unguarded(p_unidade_codigo character varying, p_ano integer, p_mes integer, p_alunos_pagantes integer, p_novas_matriculas integer, p_evasoes integer, p_churn_rate numeric, p_ticket_medio numeric, p_taxa_renovacao numeric, p_tempo_permanencia integer, p_inadimplencia numeric, p_reajuste_parcelas numeric)` | SO-INTERNA | INVOKER | funcao:upsert_dados_mensais |
| `upsert_metas(p_unidade_codigo character varying, p_ano integer, p_meta_alunos integer, p_meta_matriculas_mes integer, p_meta_evasoes_max integer, p_meta_churn numeric, p_meta_renovacao numeric, p_meta_ticket numeric, p_meta_permanencia integer, p_meta_inadimplencia numeric, p_meta_faturamento numeric)` | ORFA | INVOKER · 🔓 anon | sem consumidor conhecido |

## integracao

| Função | Estado | Segurança | Consumidores |
|---|---|---|---|
| `_normalizar_forma_pagamento_conciliacao(p_text text)` | SO-INTERNA | INVOKER · 🔓 anon | funcao:aplicar_conciliacao_aluno_atributo |
| `aplicar_cadastro_emusys_canonico(p_unidade_id uuid, p_aluno_id integer, p_emusys_matricula_id text, p_patch jsonb)` | ATIVA | INVOKER | edge:supabase/functions/sync-matriculas-emusys/index.ts |
| `aplicar_cadastro_emusys_canonico(p_unidade_id uuid, p_aluno_id integer, p_patch jsonb)` | ATIVA | INVOKER | edge:supabase/functions/sync-matriculas-emusys/index.ts |
| `aplicar_conciliacao_aluno_atributo(p_divergencia_id bigint, p_decisao text, p_decidido_por text)` | ATIVA | DEFINER | front:src/components/App/Alunos/ConciliacaoMatriculas.tsx, funcao:ignorar_conciliacao_aluno_atributo |
| `aplicar_conciliacao_decisao(p_divergencia_id bigint, p_aluno_id integer, p_decisao text, p_patch jsonb, p_emusys_matricula_id text, p_decidido_por text)` | ATIVA | DEFINER | front:src/components/App/Alunos/ConciliacaoMatriculas.tsx |
| `app_confirmar_meu_whatsapp(p_telefone text)` | ORFA | DEFINER | sem consumidor conhecido |
| `check_automacao_professor_vinculado()` | ATIVA | INVOKER · 🔓 anon | trigger:automacao_log.trg_automacao_check_professor |
| `claim_lia_alerta_privado(p_worker_id uuid, p_alerta_id uuid)` | ATIVA | DEFINER | edge:supabase/functions/processar-alertas-lia/index.ts |
| `decidir_professor_divergencia_emusys(p_id bigint, p_decisao text, p_observacao text)` | ATIVA | DEFINER | front:src/hooks/useProfessoresDivergencias.ts |
| `definir_forma_pagamento_conciliacao_aluno(p_divergencia_id bigint, p_forma_pagamento_id integer, p_decidido_por text)` | ATIVA | DEFINER | front:src/components/App/Alunos/ConciliacaoMatriculas.tsx |
| `enfileirar_lia_alerta_piloto(p_pesquisa_id uuid, p_tipo text)` | ORFA | DEFINER | sem consumidor conhecido |
| `enfileirar_lia_followup_piloto(p_pesquisa_id uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `enqueue_sync_student_studio()` | ATIVA | DEFINER | trigger:alunos.trg_enqueue_sync_student_studio |
| `excluir_whatsapp_caixa_admin(p_caixa_id integer)` | ATIVA | DEFINER | front:src/components/App/PreAtendimento/components/chat/CaixasManager.tsx |
| `fn_fila_audio_experimental_retomar(p_limite integer)` | ATIVA | DEFINER | cron:fabio-retomar-audio-experimental |
| `fn_fila_audio_retomar_por_roster(p_limite integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_lia_claim_alerta_privado_em(p_worker_id uuid, p_alerta_id uuid, p_agora timestamp with time zone)` | SO-INTERNA | DEFINER | funcao:claim_lia_alerta_privado |
| `fn_lia_criar_evento_alerta(p_tipo text, p_ambiente text, p_pesquisa_id uuid, p_analise_versao integer, p_operador_usuario_id integer, p_aluno_nome text, p_unidade_id uuid, p_unidade_nome text, p_ocorrido_em timestamp with time zone, p_idempotency_key text)` | SO-INTERNA | DEFINER | funcao:enfileirar_lia_alerta_piloto, funcao:fn_lia_evento_pesquisa_evasao |
| `fn_lia_evento_pesquisa_evasao()` | ATIVA | DEFINER | trigger:pesquisa_evasao_mensagens.trg_lia_evento_pesquisa_evasao |
| `fn_lia_janela_envio_permitida(p_agora timestamp with time zone)` | SO-INTERNA | DEFINER | funcao:fn_lia_claim_alerta_privado_em |
| `fn_lia_renderizar_alerta_pesquisa(p_tipo text, p_aluno_nome text, p_unidade_nome text)` | SO-INTERNA | DEFINER | funcao:fn_lia_criar_evento_alerta |
| `fn_lia_renderizar_resumo_followup(p_resumo_id uuid)` | SO-INTERNA | DEFINER | funcao:enfileirar_lia_followup_piloto, funcao:fn_lia_claim_alerta_privado_em, funcao:produzir_lia_resumos_followup_72h |
| `fn_orquestracao_destravar_v1(p_chave text)` | ATIVA | DEFINER | edge:supabase/functions/orquestrar-historico-professor/index.ts |
| `fn_orquestracao_tentar_travar_v1(p_chave text, p_ttl_segundos integer, p_dono text)` | ATIVA | DEFINER | edge:supabase/functions/orquestrar-historico-professor/index.ts |
| `fn_pode_operar_fila_divergencias_professor()` | SO-INTERNA | DEFINER | funcao:decidir_professor_divergencia_emusys, funcao:get_professores_divergencias_emusys |
| `get_base_conhecimento(p_unidade_id uuid, p_publico text)` | ATIVA | DEFINER | front:src/components/App/PreAtendimento/hooks/useBaseConhecimento.ts, edge:supabase/functions/base-conhecimento/index.ts |
| `get_conciliacao_experimentais_snapshot_p21_v1(p_unidade_id uuid, p_ano integer, p_mes integer, p_periodo text, p_data date)` | SO-INTERNA | INVOKER | funcao:get_conciliacao_experimentais_v2 |
| `get_conciliacao_experimentais_snapshot_v1(p_unidade_id uuid, p_ano integer, p_mes integer, p_periodo text, p_data date)` | SO-INTERNA | INVOKER | funcao:get_conciliacao_experimentais_snapshot_p21_v1 |
| `get_conciliacao_experimentais_v2(p_unidade_id uuid, p_ano integer, p_mes integer, p_periodo text, p_data date)` | ATIVA | DEFINER | front:src/components/App/Comercial/ComercialConciliacaoExperimentais.tsx, front:src/components/App/Comercial/ComercialPage.tsx, front:src/components/App/Dashboard/DashboardPage.tsx, front:src/hooks/useComercialOperacionalResumoV2.ts, front:src/hooks/useMatriculadorPrograma.ts, edge:supabase/functions/relatorio-admin-whatsapp/index.ts, +2 outros |
| `get_conciliacao_experimentais_v2_legacy_p21_20260707(p_unidade_id uuid, p_ano integer, p_mes integer, p_periodo text, p_data date)` | SO-INTERNA | INVOKER | funcao:get_conciliacao_experimentais_v2_legacy_p22_20260707 |
| `get_conciliacao_experimentais_v2_legacy_p22_20260707(p_unidade_id uuid, p_ano integer, p_mes integer, p_periodo text, p_data date)` | ORFA | INVOKER | sem consumidor conhecido |
| `get_conciliacao_leads_qualidade_v1(p_unidade_id uuid, p_ano integer, p_mes integer, p_tipo text)` | ATIVA | DEFINER · 🔓 anon | front:src/components/App/Comercial/ComercialConciliacaoLeads.tsx |
| `get_conciliacao_matriculas(p_unidade_id uuid)` | ATIVA | DEFINER | front:src/components/App/Alunos/ConciliacaoMatriculas.tsx |
| `get_conciliacao_presencas(p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_status text, p_busca text, p_limite integer, p_offset integer)` | ATIVA | DEFINER | front:src/components/App/Alunos/ConciliacaoPresencas.tsx |
| `get_conciliacao_professores_emusys(p_unidade_id uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `get_conciliacao_roster_operacional_v1(p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_estado text, p_limite integer, p_offset integer)` | ATIVA | DEFINER | front:src/components/App/Alunos/ConciliacaoPresencas.tsx |
| `get_divergencias_alunos()` | ATIVA | DEFINER | front:src/hooks/useDivergencias.ts |
| `get_prof_curso_modalidade_excecoes_v2_pre_nome_emusys(p_unidade_id uuid, p_professor_id integer, p_incluir_auditoria boolean)` | SO-INTERNA | DEFINER | funcao:get_professor_curso_modalidade_excecoes_v2 |
| `hermes_patch_status_reportar(p_agente text, p_patch text, p_patched boolean, p_detalhe text)` | ORFA | DEFINER · 🔓 anon | sem consumidor conhecido |
| `ignorar_conciliacao_aluno_atributo(p_divergencia_id bigint, p_decidido_por text)` | ORFA | DEFINER | sem consumidor conhecido |
| `liberar_sync_matriculas_travado(p_unidade_id uuid, p_limite interval)` | ATIVA | DEFINER | edge:supabase/functions/sync-matriculas-emusys/index.ts |
| `listar_lia_alertas_pendencias_administrativas(p_limite integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `listar_whatsapp_caixas_administracao()` | ATIVA | DEFINER | front:src/components/App/PreAtendimento/components/chat/CaixasManager.tsx |
| `listar_whatsapp_caixas_seguras(p_unidade_id uuid, p_incluir_globais boolean)` | ATIVA | DEFINER | front:src/components/App/Administrativo/CaixaEntrada/NovaConversaModal.tsx, front:src/components/App/PreAtendimento/hooks/useWhatsAppCaixas.ts, front:src/hooks/useCaixasWhatsAppLookup.ts |
| `normalizar_whatsapp_message_id()` | ATIVA | INVOKER · 🔓 anon | trigger:admin_mensagens.trg_normalizar_wa_msg_id, trigger:crm_mensagens.trg_normalizar_wa_msg_id |
| `produzir_lia_resumos_followup_72h(p_agora timestamp with time zone)` | ATIVA | DEFINER | edge:supabase/functions/processar-alertas-lia/index.ts |
| `registrar_saida_automatica_emusys_v1(p_unidade_id uuid, p_aluno_id integer, p_aluno_nome text, p_professor_id integer, p_curso_id integer, p_tipo text, p_data date, p_motivo text, p_motivo_saida_id integer, p_competencia_referencia date, p_emusys_matricula_id text, p_valor_parcela_evasao numeric)` | ATIVA | DEFINER | edge:supabase/functions/processar-matricula-emusys/index.ts |
| `resolver_conciliacao_lead_qualidade(p_lead_id integer, p_campo text, p_valor_id integer, p_decidido_por text, p_motivo text)` | ATIVA | DEFINER | front:src/components/App/Comercial/ComercialConciliacaoLeads.tsx |
| `salvar_whatsapp_caixa_admin(p_id integer, p_nome text, p_numero text, p_uazapi_url text, p_uazapi_token text, p_unidade_id uuid, p_webhook_url text, p_ativo boolean, p_funcao text, p_departamento text, p_provedor text, p_waha_url text, p_waha_session text, p_waha_api_key text)` | ATIVA | DEFINER | front:src/components/App/PreAtendimento/components/chat/CaixasManager.tsx |
| `sol_hermes_caixa_enqueue(p_caixa_diario_id uuid, p_texto text)` | ATIVA | DEFINER | front:src/components/App/Administrativo/CaixaFinanceiro/CaixaWhatsAppPreview.tsx |
| `sol_hermes_caixa_validate(p_caixa_diario_id uuid)` | ATIVA | DEFINER | front:src/components/App/Administrativo/CaixaFinanceiro/CaixaWhatsAppPreview.tsx |
| `sol_hermes_report_enqueue(p_texto text, p_tipo_relatorio text, p_unidade text, p_competencia text, p_tipo_destino text)` | ATIVA | DEFINER | front:src/components/App/Administrativo/ModalRelatorio.tsx, front:src/components/App/Comercial/ComercialPage.tsx |
| `sol_hermes_report_error_retryavel(p_erro text)` | SO-INTERNA | INVOKER | funcao:sol_hermes_report_watchdog |
| `sol_hermes_report_watchdog(p_max_tentativas integer, p_stuck_minutes integer, p_retry_window_minutes integer, p_max_backoff_minutes integer)` | ATIVA | DEFINER | cron:sol-hermes-report-watchdog-5min |
| `sol_registrar_divergencia(p_aluno_id integer, p_unidade_id uuid, p_emusys_matricula_id text, p_tipo_divergencia text, p_analise text, p_campo text, p_valor_api jsonb, p_sugestao jsonb, p_severidade text)` | ORFA | DEFINER | sem consumidor conhecido |
| `sync_aluno_contatos_from_legacy()` | ATIVA | INVOKER · 🔓 anon | trigger:alunos.trg_sync_aluno_contatos |
| `sync_aluno_to_leads()` | ATIVA | INVOKER · 🔓 anon | trigger:alunos.trigger_sync_aluno_to_leads, funcao:get_kpis_comercial_canonicos_v2 |
| `sync_caixa_envio_from_fila_sol_hermes()` | ATIVA | DEFINER · 🔓 anon | trigger:fila_relatorios_sol_hermes.tr_sync_caixa_envio_from_fila_sol_hermes |
| `sync_evasao_to_dados_mensais()` | ATIVA | DEFINER | trigger:movimentacoes_admin.trg_sync_evasao_dados_mensais |
| `sync_experimentais_professor()` | ATIVA | INVOKER · 🔓 anon | trigger:leads.tr_sync_experimentais_professor |
| `sync_experimentais_unidade()` | ATIVA | INVOKER · 🔓 anon | trigger:leads.tr_sync_experimentais_unidade |
| `sync_lead_etapa_status_on_insert()` | ATIVA | INVOKER · 🔓 anon | trigger:leads.tr_sync_etapa_status_on_insert |
| `sync_lead_etapa_to_status()` | ATIVA | INVOKER · 🔓 anon | trigger:leads.tr_sync_etapa_to_status |
| `sync_leads_to_dados_comerciais()` | ORFA | DEFINER | sem consumidor conhecido |
| `sync_leads_to_origem_leads()` | ORFA | DEFINER | sem consumidor conhecido |
| `upsert_emusys_matriculas_estado_atual(p_unidade_id uuid, p_linhas jsonb)` | ATIVA | DEFINER | edge:supabase/functions/processar-matricula-emusys/index.ts, edge:supabase/functions/sync-matriculas-emusys/index.ts |

## operacao

| Função | Estado | Segurança | Consumidores |
|---|---|---|---|
| `ajustar_estoque_manual(p_produto_id integer, p_unidade_id uuid, p_delta integer, p_motivo text, p_via_audit text, p_variacao_id integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `buscar_produto_fuzzy(p_termo text, p_unidade_id uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `calcular_comissao_venda()` | ATIVA | INVOKER · 🔓 anon | trigger:loja_vendas.trigger_calcular_comissao_venda |
| `estoque_disponivel(p_produto_id integer, p_unidade_id uuid, p_variacao_id integer)` | SO-INTERNA | DEFINER | funcao:buscar_produto_fuzzy |
| `estornar_venda(p_venda_id integer, p_motivo text, p_via_audit text)` | ORFA | DEFINER | sem consumidor conhecido |
| `finalizar_sync_professor_disciplinas_emusys_v1(p_execucao_id uuid)` | ATIVA | DEFINER | edge:supabase/functions/sync-professor-disciplinas-emusys/index.ts |
| `fn_curso_base(p_curso text)` | ATIVA | INVOKER | view:vw_registro_pendencia, funcao:app_aluno_ficha, funcao:fabio_briefing_matinal, funcao:fn_prontuario_aluno_interno |
| `fn_curso_chave(p_nome text)` | SO-INTERNA | INVOKER · 🔓 anon | funcao:app_coordenacao_em_aberto, funcao:app_coordenacao_professor_detalhe |
| `fn_reservar_cobranca_feedback(p_professor_id integer, p_tipo text, p_corpo text, p_dia date)` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_reservar_cobranca_feedback_coordenacao(p_corpo text, p_whatsapp text, p_dia date)` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_reservar_recado_coordenacao(p_professor_id integer, p_corpo text, p_solicitado_por uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `get_calendario_provisorio(p_unidade_id uuid, p_ano integer)` | SO-INTERNA | INVOKER · 🔓 anon | funcao:materializar_projecao_contrato |
| `get_prof_curso_modalidade_excecoes_v2_raw(p_unidade_id uuid, p_professor_id integer, p_incluir_auditoria boolean)` | SO-INTERNA | DEFINER | funcao:get_prof_curso_modalidade_excecoes_v2_pre_nome_emusys |
| `iniciar_sync_professor_disciplinas_emusys_v1(p_unidade_id uuid, p_origem text, p_solicitado_por integer, p_modo text)` | ATIVA | DEFINER | edge:supabase/functions/sync-professor-disciplinas-emusys/index.ts |
| `is_atividade_extra_curso(p_curso_id integer)` | ATIVA | INVOKER · 🔓 anon | view:vw_alunos_sem_fatura_mes, view:vw_kpis_retencao_mensal, view:vw_renovacao_ciclos, funcao:get_relatorio_admin_mensal_rico_base_v1, funcao:montar_relatorio_admin_mensal_payload_base_v4, funcao:movimentacao_conta_nos_kpis_v1, +1 outros |
| `pode_sincronizar_professor_disciplinas_emusys_v1(p_unidade_id uuid)` | ATIVA | DEFINER | edge:supabase/functions/sync-professor-disciplinas-emusys/index.ts |
| `registrar_entrada_estoque(p_produto_id integer, p_unidade_id uuid, p_quantidade integer, p_via_audit text, p_variacao_id integer, p_observacoes text)` | LEGADO | DEFINER | existe versao maior: registrar_entrada_estoque_v2 — sem consumidor conhecido |
| `registrar_entrada_estoque_v2(p_unidade_id uuid, p_itens jsonb, p_via_audit text, p_nf text, p_fornecedor text, p_observacoes text)` | ORFA | DEFINER | sem consumidor conhecido |
| `registrar_venda_legacy(p_produto_id integer, p_unidade_id uuid, p_quantidade integer, p_forma_pagamento character varying, p_via_audit text, p_variacao_id integer, p_tipo_cliente character varying, p_cliente_nome character varying, p_aluno_id integer, p_professor_indicador_id integer, p_desconto numeric, p_parcelas integer, p_observacoes text)` | ORFA | DEFINER | sem consumidor conhecido |
| `registrar_venda_v2(p_unidade_id uuid, p_itens jsonb, p_forma_pagamento character varying, p_via_audit text, p_tipo_cliente character varying, p_cliente_nome character varying, p_aluno_id integer, p_colaborador_cliente_id integer, p_professor_indicador_id integer, p_desconto numeric, p_desconto_tipo character varying, p_parcelas integer, p_observacoes text)` | ORFA | DEFINER | sem consumidor conhecido |
| `reservar_envio_pesquisa_whatsapp(p_aluno_id integer, p_unidade_id uuid, p_tipo text, p_data_matricula date, p_janela_minutos integer)` | ATIVA | DEFINER | edge:supabase/functions/enviar-pesquisa-pos-primeira-aula/index.ts |
| `simular_emenda(p_unidade_id uuid, p_data date, p_ano integer)` | ORFA | DEFINER · 🔓 anon | sem consumidor conhecido |
| `transferir_estoque(p_produto_id integer, p_variacao_id integer, p_unidade_origem uuid, p_unidade_destino uuid, p_quantidade integer, p_motivo text, p_via_audit text)` | ORFA | INVOKER · 🔓 anon | sem consumidor conhecido |
| `transferir_estoque(p_produto_id uuid, p_variacao_id uuid, p_unidade_origem uuid, p_unidade_destino uuid, p_quantidade integer, p_motivo text, p_via_audit text)` | ORFA | INVOKER · 🔓 anon | sem consumidor conhecido |
| `update_inventario_updated_at()` | ATIVA | INVOKER · 🔓 anon | trigger:inventario.trigger_inventario_updated_at |
| `update_planos_acao_updated_at()` | ATIVA | INVOKER · 🔓 anon | trigger:planos_acao.trigger_planos_acao_updated_at |
| `update_projeto_fases_updated_at()` | ATIVA | INVOKER · 🔓 anon | trigger:projeto_fases.trigger_projeto_fases_updated_at |
| `update_projeto_tarefas_updated_at()` | ATIVA | INVOKER · 🔓 anon | trigger:projeto_tarefas.trigger_projeto_tarefas_updated_at |
| `update_projeto_tipos_updated_at()` | ATIVA | INVOKER · 🔓 anon | trigger:projeto_tipos.trigger_projeto_tipos_updated_at |
| `update_projetos_updated_at()` | ATIVA | INVOKER · 🔓 anon | trigger:projetos.trigger_projetos_updated_at |
| `visitas_set_updated_at()` | ATIVA | INVOKER · 🔓 anon | trigger:feriados.feriados_updated_at, trigger:visitas_config.visitas_config_updated_at, trigger:visitas.visitas_updated_at |

## outros

| Função | Estado | Segurança | Consumidores |
|---|---|---|---|
| `amostra_pareada_atendimento_v1(p_pares integer, p_meses integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `convertidos_do_periodo_v1(p_meses integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_resolver_prazo_retomada(p_texto text, p_base date)` | ATIVA | INVOKER | edge:supabase/functions/extrair-sinais-conversa/contract.ts, funcao:fn_upsert_retomada |
| `fn_upsert_retomada(p_lead_id bigint, p_frase text, p_prazo_texto text, p_motivo text, p_origem text, p_criado_por text, p_conversation_id bigint)` | SO-INTERNA | DEFINER | funcao:mila_registrar_retomada_v1, funcao:registrar_retomada_de_conversa_v1 |

## plataforma

| Função | Estado | Segurança | Consumidores |
|---|---|---|---|
| `admin_alterar_presenca_rollout_v1(p_unidade_id uuid, p_superficie text, p_modo text, p_motivo text, p_request_id uuid, p_evidencia jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `admin_confirmar_presencas_aula(p_aula_emusys_id integer, p_motivo text)` | ATIVA | DEFINER | front:src/components/App/Alunos/ConciliacaoPresencas.tsx |
| `admin_conversa_nova_mensagem(p_conversa_id uuid, p_preview text, p_whatsapp_jid text)` | ATIVA | DEFINER | edge:supabase/functions/webhook-whatsapp-inbox/index.ts |
| `admin_corrigir_presenca(p_aluno_presenca_id uuid, p_status_presenca text, p_motivo text)` | SO-INTERNA | DEFINER | funcao:admin_revisar_presenca_conciliacao |
| `admin_decidir_proposta_disponibilidade(p_proposta_id uuid, p_decisao text, p_motivo text)` | ATIVA | DEFINER | front:src/components/App/Professores/GradeDisponibilidadeProfessores.tsx |
| `admin_efetivar_proposta_disponibilidade(p_proposta_id uuid, p_confirmacao_emusys boolean)` | ATIVA | DEFINER | front:src/components/App/Professores/GradeDisponibilidadeProfessores.tsx |
| `admin_provisionar_professor(p_professor_id integer, p_email text, p_senha text, p_telefone_whatsapp text)` | SO-INTERNA | DEFINER | funcao:admin_resetar_senha_professor |
| `admin_resetar_senha_professor(p_professor_id integer, p_nova_senha text)` | ORFA | DEFINER | sem consumidor conhecido |
| `admin_revisar_presenca_conciliacao(p_aluno_presenca_id uuid, p_decisao text, p_motivo text)` | ATIVA | DEFINER | front:src/components/App/Alunos/ConciliacaoPresencas.tsx |
| `admin_update_user_password(target_user_id uuid, new_password text)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_atualizar_fatia(p_id uuid, p_texto text, p_campos jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_atualizar_perfil(p_nome_preferido text, p_bio text)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_concluir_onboarding()` | ORFA | DEFINER | sem consumidor conhecido |
| `app_meu_acesso()` | ORFA | DEFINER | sem consumidor conhecido |
| `app_meu_onboarding()` | ORFA | DEFINER | sem consumidor conhecido |
| `app_meu_perfil()` | ORFA | DEFINER | sem consumidor conhecido |
| `app_meu_perfil_coordenacao()` | ORFA | DEFINER | sem consumidor conhecido |
| `app_meu_ponto(p_data_inicio date, p_data_fim date)` | SO-INTERNA | DEFINER | funcao:app_minha_home |
| `app_meus_registros(p_status text)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_minha_agenda_mes(p_inicio date, p_fim date)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_minha_agenda_semana_v1(p_data_inicio date, p_data_fim date)` | SO-INTERNA | DEFINER | funcao:app_minha_home |
| `app_minha_agenda_sessao(p_data date)` | SO-INTERNA | DEFINER | funcao:fn_diag_porta_do_professor |
| `app_minha_agenda_sessao_base_v1(p_data date)` | SO-INTERNA | DEFINER | funcao:app_minha_agenda_sessao_publicacao_legado_v1 |
| `app_minha_agenda_sessao_base_v1_referencia_lenta(p_data date)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_minha_agenda_sessao_canonica_v2(p_data date)` | SO-INTERNA | DEFINER | funcao:app_minha_agenda_sessao, funcao:app_minha_agenda_sessao_publicacao_legado_v1 |
| `app_minha_agenda_sessao_canonica_v2_referencia_lenta(p_data date)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_minha_agenda_sessao_publicacao_legado_v1(p_data date)` | SO-INTERNA | DEFINER | funcao:app_minha_agenda_sessao |
| `app_minha_carteira()` | ORFA | DEFINER | sem consumidor conhecido |
| `app_minha_disponibilidade()` | ORFA | DEFINER | sem consumidor conhecido |
| `app_minha_home(p_ontem date, p_hoje date)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_minhas_pendencias(p_incluir_passivo boolean)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_minhas_preferencias_fabio()` | ORFA | DEFINER | sem consumidor conhecido |
| `atualizar_updated_at_conversas()` | ATIVA | INVOKER · 🔓 anon | trigger:crm_conversas.tr_updated_at_conversas |
| `audit_dados_mensais()` | ATIVA | INVOKER · 🔓 anon | trigger:dados_mensais.tr_audit_dados_mensais |
| `audit_metas()` | ATIVA | INVOKER · 🔓 anon | trigger:metas_legado.tr_audit_metas |
| `auditar_saude_conversas()` | ORFA | DEFINER | sem consumidor conhecido |
| `bloquear_mutacao_retificacao_mensal_v1()` | ATIVA | INVOKER · 🔓 anon | trigger:fechamento_mensal_retificacoes.fechamento_mensal_retificacoes_append_only |
| `calc_classificacao(idade integer)` | ORFA | INVOKER · 🔓 anon | sem consumidor conhecido |
| `calc_idade(data_nasc date)` | ORFA | INVOKER · 🔓 anon | sem consumidor conhecido |
| `calcular_campos_aluno()` | ATIVA | INVOKER · 🔓 anon | front:src/components/App/Comercial/ComercialPage.tsx, trigger:alunos.trg_alunos_calcular_campos |
| `calcular_faixa_etaria(p_data_nascimento date)` | SO-INTERNA | INVOKER · 🔓 anon | funcao:trg_calcular_faixa_etaria_lead |
| `calcular_variacao(valor_atual numeric, valor_anterior numeric)` | SO-INTERNA | INVOKER · 🔓 anon | funcao:get_comparativo_anos |
| `campo_fixado(p_aluno_id integer, p_campo text)` | SO-INTERNA | DEFINER | funcao:aplicar_valor_parcela_comercial_canonico, funcao:definir_forma_pagamento_conciliacao_aluno, funcao:fn_alunos_valor_parcela_comercial_emusys |
| `consultor_responsavel_da_unidade(p_unidade_id uuid)` | SO-INTERNA | DEFINER | funcao:trg_lead_herda_consultor_da_unidade |
| `exec_readonly_sql(query text)` | ORFA | DEFINER | sem consumidor conhecido |
| `executar_query_auditoria(p_sql text)` | ATIVA | DEFINER | edge:supabase/functions/auditor-divergencias-emusys/index.ts |
| `executar_query_readonly(query_sql text)` | ORFA | DEFINER | sem consumidor conhecido |
| `execute_bi_query_lamusic(query_text text, p_unidade_id uuid, max_rows integer)` | ATIVA | DEFINER | front:src/components/App/Alunos/Auditoria/BiAgentMetrics.tsx, edge:supabase/functions/bi-agent-lamusic/index.ts, edge:supabase/functions/bi-agent-lamusic/tools.ts |
| `exigir_acesso_kpis_admin_v1(p_unidade_id uuid)` | SO-INTERNA | DEFINER | funcao:get_kpis_alunos_admin_operacional |
| `fn_atualizar_fatia_core(p_professor_id integer, p_id uuid, p_texto text, p_campos jsonb)` | SO-INTERNA | DEFINER | funcao:app_atualizar_fatia, funcao:fabio_atualizar_fatia, funcao:fn_fabio_canario_correcao_de_ficha |
| `fn_audit_log()` | ATIVA | DEFINER | trigger:alunos.trg_audit, trigger:caixa_movimentacoes.trg_audit_caixa_movimentacoes, trigger:config_health_score_professor.trg_audit, trigger:crm_pipeline_etapas.trg_audit, trigger:cursos.trg_audit, trigger:dados_mensais.trg_audit, +17 outros |
| `fn_bloco_tem_conteudo(p_bloco jsonb)` | SO-INTERNA | INVOKER | funcao:fabio_gravar_contexto_experimental |
| `fn_bloquear_mutacao_professor_periodos_revisoes_v1()` | ATIVA | INVOKER | trigger:professor_periodos_revisoes_v1.trg_professor_periodos_revisoes_append_only |
| `fn_campos_registro_manual_validos(p_campos jsonb, p_tronco boolean)` | SO-INTERNA | DEFINER | funcao:app_salvar_rascunho_manual |
| `fn_costura_vincular_conversa_numero()` | ATIVA | INVOKER · 🔓 anon | trigger:alunos.trg_costura_vincular_conversa |
| `fn_data_corte_cobranca()` | ATIVA | INVOKER · 🔓 anon | view:vw_aderencia_registro_professor, view:vw_registro_pendencia, funcao:fabio_contexto_professor |
| `fn_data_corte_experimental()` | ATIVA | INVOKER · 🔓 anon | view:vw_experimental_pendencia |
| `fn_data_inicio_medicao()` | ATIVA | INVOKER · 🔓 anon | view:vw_aderencia_registro_professor |
| `fn_diag_audio_preso_no_aparelho(p_horas integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_diag_porta_do_professor(p_professor_id integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_diag_saude_experimental(p_dias_ficha integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_dias_de_reagendamento(p_aula_id integer)` | ORFA | INVOKER | sem consumidor conhecido |
| `fn_hoje_brt()` | SO-INTERNA | INVOKER | funcao:app_coordenacao_feedback_mes, funcao:app_professor_feedback_mesa, funcao:app_professor_feedback_progresso, funcao:fn_competencia_feedback, funcao:fn_feedback_cobranca_do_dia, funcao:fn_janela_feedback_aberta, +2 outros |
| `fn_janela_experimental_dias()` | SO-INTERNA | INVOKER · 🔓 anon | funcao:fn_experimental_escalonadas, funcao:fn_experimental_pendencia_do_professor |
| `fn_janela_feedback_aberta(p_dia date)` | SO-INTERNA | INVOKER | funcao:app_coordenacao_feedback_mes, funcao:app_professor_feedback_mesa, funcao:app_professor_feedback_progresso |
| `fn_janela_registro_dias()` | SO-INTERNA | INVOKER · 🔓 anon | funcao:app_abrir_rascunho_manual, funcao:app_enfileirar_audio_experimental, funcao:fabio_aulas_candidatas, funcao:fn_aplicar_comando_presenca_core_v2, funcao:fn_enfileirar_audio_core, funcao:fn_pendencias_escalonadas, +1 outros |
| `fn_liberar_acesso_professor(p_professor_id integer, p_auth_user_id uuid, p_email text)` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_log_ocorrencia_criada()` | ATIVA | DEFINER | trigger:professor_360_ocorrencias.trg_log_ocorrencia_criada |
| `fn_pedir_codigo_de_acesso(p_telefone text, p_ip_hint text, p_user_agent text)` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_registrar_codigo_enviado(p_professor_id integer, p_telefone text, p_email text, p_enviou boolean, p_ip_hint text, p_user_agent text)` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_remover_campos_comuns_da_fatia(p_tronco jsonb, p_fatia jsonb)` | SO-INTERNA | DEFINER | funcao:fabio_corrigir_registro_confirmado, funcao:fabio_criar_registro, funcao:fn_atualizar_fatia_core |
| `fn_set_atualizado_em()` | ATIVA | INVOKER · 🔓 anon | trigger:fabio_fila_audios.trg_fabio_audios_upd, trigger:fabio_registros_aula.trg_fabio_reg_upd |
| `fn_texto_para_bigint(p_texto text)` | SO-INTERNA | INVOKER | funcao:fabio_gravar_contexto_experimental, funcao:fn_experimentais_a_extrair |
| `fn_texto_para_data(p_texto text)` | SO-INTERNA | INVOKER | funcao:fn_experimental_contexto_seguro |
| `fn_touch_updated_at()` | ATIVA | INVOKER · 🔓 anon | trigger:fabio_professor_preferences.trg_fabio_professor_preferences_touch |
| `fn_usuario_atual_tem_permissao(p_codigo_permissao character varying, p_unidade_id uuid)` | SO-INTERNA | DEFINER | funcao:buscar_alunos_ativos_atuais_canonicos, funcao:fn_aluno_entra_base_ativa_v131, funcao:fn_contrato_assinatura_pode_ler_v1, funcao:fn_health_score_professor_v3_ator_gerenciador, funcao:fn_pode_ler_aluno_pedagogico, funcao:get_alunos_ativos_atuais_canonicos, +6 outros |
| `fn_usuarios_sincroniza_rbac()` | ATIVA | DEFINER | trigger:usuarios.trg_usuarios_sincroniza_rbac |
| `get_cron_health()` | ATIVA | DEFINER · 🔓 anon | front:src/hooks/useSaudeCrons.ts |
| `get_kpis_unidade(p_unidade_codigo character varying, p_ano integer)` | ATIVA | DEFINER | front:src/hooks/useSupabase.ts |
| `get_saude_cobertura_presenca_v1(p_data date)` | ATIVA | DEFINER | front:src/hooks/useSaudeCrons.ts |
| `get_saude_syncs_emusys()` | ATIVA | DEFINER | front:src/hooks/useSaudeCrons.ts |
| `get_unidade_usuario()` | ORFA | DEFINER · 🔓 anon | sem consumidor conhecido |
| `get_user_unidade_id()` | ATIVA | DEFINER · 🔓 anon | front:src/components/App/Agenda/Chamada/ChamadaDrawer.tsx |
| `get_user_unidade_ids()` | ATIVA | DEFINER · 🔓 anon | view:vw_absenteismo_aluno_canonica_v2, view:vw_alunos_sem_fatura_mes, view:vw_contratos_vencendo, view:vw_radar_aluno_sinais_canonica_v2, view:vw_renovacao_ciclos, funcao:decidir_professor_divergencia_emusys, +18 outros |
| `get_vault_secret(secret_name text)` | ATIVA | DEFINER | edge:supabase/functions/ficha-criar-pessoa/index.ts, edge:supabase/functions/ficha-export/index.ts |
| `hash_jsonb_canonico(p_payload jsonb)` | SO-INTERNA | INVOKER | funcao:aplicar_retificacao_relatorio_admin_mensal_renovacoes_v1, funcao:aplicar_retificacao_relatorio_comercial_matricula_tardia_v1, funcao:aplicar_retificacao_relatorio_comercial_mensal_v1, funcao:aplicar_retificacao_relatorio_gerencial_financeiro_v1, funcao:aplicar_retificacao_relatorio_gerencial_retencao_v1, funcao:capturar_relatorio_coordenacao_canonico_v2, +12 outros |
| `introspect_schema_lamusic(table_names text[])` | ATIVA | DEFINER | edge:supabase/functions/bi-agent-lamusic/index.ts, edge:supabase/functions/bi-agent-lamusic/tools.ts |
| `is_admin()` | ATIVA | DEFINER · 🔓 anon | front:src/components/App/Agenda/Chamada/ChamadaDrawer.tsx, view:vw_absenteismo_aluno_canonica_v2, view:vw_alunos_sem_fatura_mes, view:vw_contratos_vencendo, view:vw_disponibilidade_professores, view:vw_radar_aluno_sinais_canonica_v2, +24 outros |
| `is_admin_usuario()` | ORFA | DEFINER · 🔓 anon | sem consumidor conhecido |
| `la_os_cota_atual()` | ORFA | DEFINER | sem consumidor conhecido |
| `la_os_cota_registrar(p_leituras jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `la_os_cota_serie(p_horas integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `la_os_crons(p_dono text)` | ORFA | DEFINER | sem consumidor conhecido |
| `la_os_desde_quando(p_agente text)` | ORFA | DEFINER | sem consumidor conhecido |
| `la_os_estado_atual()` | ORFA | DEFINER | sem consumidor conhecido |
| `la_os_eventos(p_desde timestamp with time zone, p_limite integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `la_os_gap_fundir(p_origem uuid, p_destino uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `la_os_gap_triar(p_grupo_id uuid, p_triagem text, p_nota text, p_quem text)` | ORFA | DEFINER | sem consumidor conhecido |
| `la_os_gaps_grupos(p_agente text, p_triagem text)` | ORFA | DEFINER | sem consumidor conhecido |
| `la_os_gaps_investigacoes(p_grupo_id uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `la_os_gaps_ocorrencias(p_grupo_id uuid, p_limite integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `la_os_gaps_saude()` | ORFA | DEFINER | sem consumidor conhecido |
| `la_os_historico(p_agente text, p_desde timestamp with time zone)` | ORFA | DEFINER | sem consumidor conhecido |
| `la_os_hosts()` | ORFA | DEFINER | sem consumidor conhecido |
| `la_os_investigacao_verificar(p_id uuid, p_veredito text, p_quem text)` | ORFA | DEFINER | sem consumidor conhecido |
| `la_os_mudancas(p_limite integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `la_os_registrar_crons(p_host text, p_usuario text, p_crons jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `la_os_registrar_gap(p_payload jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `la_os_registrar_gap_ciclo(p_ciclo jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `la_os_registrar_host(p_ciclo uuid, p_host jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `la_os_registrar_investigacao(p_payload jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `la_os_registrar_mudanca(p_email text, p_agente text, p_perfil text, p_campo text, p_de text, p_para text)` | ORFA | DEFINER | sem consumidor conhecido |
| `la_os_registrar_saude(p_ciclo uuid, p_host text, p_agentes jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `la_os_serie(p_dias integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `la_os_ultimo_contato()` | ORFA | DEFINER | sem consumidor conhecido |
| `log_competencia_bloqueio(p_unidade_id uuid, p_ano integer, p_mes integer, p_origem text, p_operacao text, p_motivo text, p_payload jsonb)` | SO-INTERNA | DEFINER | funcao:snapshot_dados_mensais, funcao:sync_evasao_to_dados_mensais |
| `log_projeto_alteracao()` | ATIVA | INVOKER · 🔓 anon | trigger:projetos.trigger_log_projeto_delete, trigger:projetos.trigger_log_projeto_insert_update |
| `log_tarefa_alteracao()` | ATIVA | INVOKER · 🔓 anon | trigger:projeto_tarefas.trigger_log_tarefa_delete, trigger:projeto_tarefas.trigger_log_tarefa_insert_update |
| `maria_lareport_unidades()` | ORFA | DEFINER | sem consumidor conhecido |
| `preencher_campos_retencao_movimentacoes_admin()` | ATIVA | DEFINER | trigger:movimentacoes_admin.trg_preencher_campos_retencao_movimentacoes_admin |
| `preencher_unidade_conversa()` | ATIVA | INVOKER · 🔓 anon | trigger:crm_conversas.tr_preencher_unidade_conversa |
| `registrar_classificacao_pesquisa_evasao_v1(p_pesquisa_id uuid, p_analise_id uuid, p_categorias text[], p_relacao_motivo text, p_justificativa text)` | ATIVA | DEFINER | front:src/components/App/SucessoCliente/hooks/useClassificacaoEvasao.ts |
| `registrar_log_ocorrencia(p_ocorrencia_id integer, p_acao character varying, p_usuario_id uuid, p_usuario_nome character varying, p_justificativa text, p_dados_anteriores jsonb, p_dados_novos jsonb)` | ATIVA | DEFINER | front:src/hooks/useProfessor360.ts, funcao:editar_ocorrencia, funcao:restaurar_ocorrencia, funcao:reverter_ocorrencia |
| `set_updated_at()` | ATIVA | INVOKER · 🔓 anon | trigger:agente_conversas.set_updated_at_agente_conversas, trigger:agentes.set_updated_at_agentes, trigger:alunos_emusys_atributos_divergencias.set_updated_at_alunos_emusys_atributos_divergencias, trigger:bi_ai_query_playbooks.trg_bi_ai_query_playbooks_updated_at, trigger:bi_conversations_lamusic.trg_bi_conversations_updated_at, trigger:bi_messages_lamusic.trg_bi_messages_updated_at, +9 outros |
| `set_updated_at_caixa()` | ATIVA | DEFINER | trigger:caixa_categorias.tr_caixa_categorias_updated_at, trigger:caixa_financeiro_grupos_whatsapp.tr_caixa_financeiro_grupos_updated_at, trigger:caixa_movimentacoes.tr_caixa_movimentacoes_updated_at, trigger:caixas_diarios.tr_caixas_diarios_updated_at |
| `touch_emusys_faturas_updated_at()` | ATIVA | INVOKER · 🔓 anon | trigger:emusys_faturas.trg_emusys_faturas_updated_at |
| `trg_calcular_faixa_etaria_lead()` | ATIVA | INVOKER · 🔓 anon | edge:supabase/functions/debug-webhook-emusys-observador/index.ts, trigger:leads.trg_calcular_faixa_etaria_lead |
| `unaccent_imutavel(t text)` | SO-INTERNA | INVOKER · 🔓 anon | funcao:ficha_criar_pessoa, funcao:ficha_emitir_token, funcao:fn_fabio_e_flexao, funcao:fn_fabio_grafia_divergente, funcao:fn_fabio_sonda_julgar, funcao:fn_fabio_texto_afirma_ausencia, +1 outros |
| `update_onboarding_updated_at()` | ATIVA | INVOKER · 🔓 anon | trigger:usuario_onboarding.update_usuario_onboarding_updated_at |
| `update_updated_at()` | ATIVA | INVOKER · 🔓 anon | trigger:anotacoes.tr_anotacoes_updated_at, trigger:dados_mensais.tr_dados_mensais_updated_at, trigger:dashboard_config.tr_dashboard_config_updated_at, trigger:metas_legado.tr_metas_updated_at, trigger:unidades.tr_unidades_updated_at |
| `update_updated_at_column()` | ATIVA | INVOKER · 🔓 anon | trigger:aluno_jornada_matricula_disciplina.trg_aluno_jornada_matricula_disciplina_updated_at, trigger:alunos_historico.update_alunos_historico_updated_at, trigger:base_conhecimento_blocos.trg_base_conhecimento_blocos_updated_at, trigger:colaboradores.update_colaboradores_updated_at, trigger:conversa_estado_whatsapp.tr_updated_at_conversa_estado, trigger:cursos.trg_cursos_updated_at, +20 outros |
| `usuario_perfis_lista(p_usuario_id integer)` | ATIVA | DEFINER | front:src/components/App/Admin/PainelPermissoes/TabUsuariosPerfil.tsx, front:src/contexts/AuthContext.tsx |
| `usuario_permissoes(p_usuario_id integer)` | ATIVA | DEFINER | front:src/contexts/AuthContext.tsx |
| `usuario_tem_permissao(p_usuario_id integer, p_codigo_permissao character varying, p_unidade_id uuid)` | ATIVA | DEFINER | view:vw_disponibilidade_professores, funcao:admin_confirmar_presencas_aula, funcao:admin_corrigir_presenca, funcao:admin_decidir_proposta_disponibilidade, funcao:admin_efetivar_proposta_disponibilidade, funcao:admin_revisar_presenca_conciliacao, +28 outros |

## professor

| Função | Estado | Segurança | Consumidores |
|---|---|---|---|
| `app_abrir_rascunho_manual(p_aula_id integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_aplicar_comando_presenca_v1(p_request_id uuid)` | SO-INTERNA | DEFINER | funcao:app_marcar_presenca_professor_aula, funcao:app_registrar_chamada_agenda, funcao:app_registrar_presenca_professor_dia, funcao:app_registrar_presencas_aula_publicacao_legado_v1, funcao:app_remover_presenca_professor_dia, funcao:fabio_confirmar_chamada_acao_publicacao_legado_v1, +2 outros |
| `app_aplicar_comando_presenca_v2(p_request_id uuid)` | SO-INTERNA | DEFINER | funcao:app_registrar_presencas_aula_canonica_v2_interno, funcao:fabio_registrar_presencas_aula_canonica_v2_interno |
| `app_atualizar_devolutiva_rascunho(p_devolutiva_id uuid, p_texto_normal text, p_texto_apoio_casa text, p_motivo text, p_acao_id text)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_atualizar_preferencia_fabio(p_canal_preferido text, p_horario_silencio_inicio time without time zone, p_horario_silencio_fim time without time zone, p_dias_silencio smallint[], p_pausa_ate date, p_limpar_pausa boolean, p_aceita_cobranca_pendencia boolean, p_tom_preferido text, p_recebe_domingo boolean)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_cancelar_aula(p_aula_emusys_id integer, p_motivo text, p_evidencia_path text, p_escopo text)` | ATIVA | DEFINER | front:src/components/App/Agenda/Chamada/useChamadaAcoes.ts, front:src/hooks/useAgendaDia.ts, edge:supabase/functions/sync-presenca-emusys/index.ts |
| `app_confirmar_registro(p_registro_id uuid, p_modo text)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_coordenacao_em_aberto(p_dias integer, p_unidade_id uuid, p_curso text)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_coordenacao_feedback_mes(p_competencia date, p_unidade_id uuid, p_limite integer, p_coracao text, p_professor_id integer)` | ORFA | DEFINER · 🔓 anon | sem consumidor conhecido |
| `app_coordenacao_professor_detalhe(p_professor_id integer, p_dias integer, p_unidade_id uuid, p_curso text)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_coordenacao_radar(p_unidade_id uuid, p_professor_id integer, p_status text, p_limite integer)` | ORFA | DEFINER · 🔓 anon | sem consumidor conhecido |
| `app_criar_comando_chamada_professor_v1(p_request_id uuid, p_aula_emusys_id integer, p_alunos_ausentes integer[])` | SO-INTERNA | DEFINER | funcao:app_registrar_presencas_aula_publicacao_legado_v1 |
| `app_criar_comando_chamada_professor_v2(p_request_id uuid, p_aula_emusys_id integer, p_alunos_ausentes integer[])` | SO-INTERNA | DEFINER | funcao:app_registrar_presencas_aula_canonica_v2_interno |
| `app_criar_comando_presenca_v1(p_request_id uuid, p_tipo text, p_unidade_id uuid, p_aula_id integer, p_itens jsonb)` | SO-INTERNA | DEFINER | funcao:app_criar_comando_chamada_professor_v1, funcao:app_marcar_presenca_professor_aula, funcao:app_registrar_chamada_agenda, funcao:app_registrar_presenca_professor_dia, funcao:app_remover_presenca_professor_dia, funcao:fabio_criar_comando_chamada_v1 |
| `app_devolutiva_definir_destinatario(p_id uuid, p_destinatario text)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_devolutiva_marcar(p_id uuid, p_acao text)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_devolutiva_salvar_texto(p_id uuid, p_texto text)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_devolutivas_aguardando()` | ORFA | DEFINER | sem consumidor conhecido |
| `app_devolutivas_pendentes()` | SO-INTERNA | DEFINER | funcao:app_minha_home |
| `app_enfileirar_audio(p_aula_id integer, p_storage_path text, p_duracao_segundos integer, p_registro_id uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_enfileirar_audio_experimental(p_vinculo_id bigint, p_storage_path text, p_duracao_segundos integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_falta_professor_cancelar_aulas(p_professor_id integer, p_data date, p_unidade_id uuid, p_motivo text)` | ORFA | DEFINER · 🔓 anon | sem consumidor conhecido |
| `app_historico_turma(p_turma_nome text, p_limite integer)` | SO-INTERNA | DEFINER | funcao:fabio_corrigir_registro_confirmado |
| `app_justificar_falta(p_aluno_presenca_id uuid, p_motivo text, p_evidencia_path text)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_marcar_presenca_professor_aula(p_aula_emusys_id integer, p_presente boolean)` | ATIVA | DEFINER | front:src/components/App/Agenda/Chamada/ProfessorPresencaToggle.tsx, funcao:app_aplicar_comando_presenca_v1 |
| `app_marcar_presenca_professor_aula(p_aula_emusys_id integer, p_presente boolean, p_request_id uuid)` | ATIVA | DEFINER | front:src/components/App/Agenda/Chamada/ProfessorPresencaToggle.tsx, funcao:app_aplicar_comando_presenca_v1 |
| `app_preparar_rascunho_manual(p_registro_id uuid, p_versao integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_professor_carteira_contagem(p_professor_id integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_professor_feedback_mesa(p_competencia date)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_professor_feedback_progresso(p_competencia date)` | SO-INTERNA | DEFINER | funcao:app_minha_home, funcao:app_professor_feedback_salvar |
| `app_professor_feedback_salvar(p_aluno_id integer, p_feedback text, p_pratica_em_casa text, p_evolucao text, p_animo text, p_observacao text, p_competencia date)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_professores_para_liberar()` | ORFA | DEFINER | sem consumidor conhecido |
| `app_propor_disponibilidade(p_unidade_id uuid, p_disponibilidade jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_registrar_chamada_agenda(p_itens jsonb)` | ATIVA | DEFINER | front:src/components/App/Agenda/Chamada/useChamadaAcoes.ts, funcao:app_aplicar_comando_presenca_v1, funcao:app_justificar_falta |
| `app_registrar_chamada_agenda(p_itens jsonb, p_request_id uuid)` | ATIVA | DEFINER | front:src/components/App/Agenda/Chamada/useChamadaAcoes.ts, funcao:app_aplicar_comando_presenca_v1, funcao:app_justificar_falta |
| `app_registrar_presenca_experimental(p_experimental_id integer, p_status text)` | ATIVA | DEFINER | front:src/components/App/Agenda/Chamada/useChamadaAcoes.ts |
| `app_registrar_presenca_professor_dia(p_professor_id integer, p_data date, p_unidade_id uuid, p_hora_chegada time without time zone, p_hora_saida time without time zone)` | ATIVA | DEFINER | front:src/components/App/Agenda/Chamada/ChamadaDia.tsx, front:src/components/App/Agenda/Chamada/ProfessorPresencaToggle.tsx, funcao:app_aplicar_comando_presenca_v1 |
| `app_registrar_presenca_professor_dia(p_professor_id integer, p_data date, p_unidade_id uuid, p_hora_chegada time without time zone, p_hora_saida time without time zone, p_request_id uuid)` | ATIVA | DEFINER | front:src/components/App/Agenda/Chamada/ChamadaDia.tsx, front:src/components/App/Agenda/Chamada/ProfessorPresencaToggle.tsx, funcao:app_aplicar_comando_presenca_v1 |
| `app_registrar_presencas_aula(p_aula_emusys_id integer, p_alunos_ausentes integer[])` | ORFA | DEFINER | sem consumidor conhecido |
| `app_registrar_presencas_aula(p_aula_emusys_id integer, p_alunos_ausentes integer[], p_request_id uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_registrar_presencas_aula_canonica_v2_interno(p_request_id uuid, p_aula_emusys_id integer, p_alunos_ausentes integer[])` | SO-INTERNA | DEFINER | funcao:app_registrar_presencas_aula |
| `app_registrar_presencas_aula_publicacao_legado_v1(p_aula_emusys_id integer, p_alunos_ausentes integer[], p_request_id uuid)` | SO-INTERNA | DEFINER | funcao:app_registrar_presencas_aula |
| `app_registro_completo(p_registro_id uuid)` | SO-INTERNA | DEFINER | funcao:app_abrir_rascunho_manual, funcao:app_preparar_rascunho_manual, funcao:app_salvar_rascunho_manual |
| `app_registros_pendentes()` | SO-INTERNA | DEFINER | funcao:app_minha_home |
| `app_remover_presenca_professor_dia(p_professor_id integer, p_data date, p_unidade_id uuid)` | ATIVA | DEFINER | front:src/components/App/Agenda/Chamada/ChamadaDia.tsx, front:src/components/App/Agenda/Chamada/ProfessorPresencaToggle.tsx, funcao:app_aplicar_comando_presenca_v1 |
| `app_remover_presenca_professor_dia(p_professor_id integer, p_data date, p_unidade_id uuid, p_request_id uuid)` | ATIVA | DEFINER | front:src/components/App/Agenda/Chamada/ChamadaDia.tsx, front:src/components/App/Agenda/Chamada/ProfessorPresencaToggle.tsx, funcao:app_aplicar_comando_presenca_v1 |
| `app_reportar_audio_preso(p_presos integer, p_terminais integer, p_mais_antigo timestamp with time zone)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_responder_confirmacao_ponto(p_aula_emusys_id integer, p_estava_presente boolean)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_responder_presenca(p_registro_alvo_id uuid, p_presenca text)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_salvar_rascunho_manual(p_registro_id uuid, p_versao integer, p_tronco_campos jsonb, p_fatias jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_status_audio_fila(p_audio_id uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `app_status_comando_presenca_v1(p_request_id uuid)` | ATIVA | DEFINER | front:src/components/App/Agenda/Chamada/ChamadaDia.tsx, front:src/components/App/Agenda/Chamada/ProfessorPresencaToggle.tsx, front:src/components/App/Agenda/Chamada/useChamadaAcoes.ts, funcao:app_aplicar_comando_presenca_v1, funcao:app_aplicar_comando_presenca_v2, funcao:app_criar_comando_chamada_professor_v2, +6 outros |
| `ativar_health_score_professor_v3_config(p_config_id uuid, p_justificativa text)` | ATIVA | DEFINER | front:src/hooks/useHealthScoreProfessorV3Config.ts |
| `ativar_health_score_professor_v3_config_pre_catalogo_v1(p_config_id uuid, p_justificativa text)` | SO-INTERNA | DEFINER | funcao:ativar_health_score_professor_v3_config |
| `ativar_health_score_professor_v3_config_revisao_ciclo_aberto(p_config_id uuid, p_justificativa text)` | ATIVA | DEFINER | front:src/hooks/useHealthScoreProfessorV3Config.ts |
| `atualizar_config_fideliza(p_ano integer, p_campo character varying, p_valor text)` | ATIVA | DEFINER | front:src/hooks/useFidelizaPrograma.ts |
| `atualizar_config_matriculador(p_ano integer, p_config jsonb)` | ATIVA | DEFINER | front:src/hooks/useMatriculadorPrograma.ts |
| `atualizar_health_score(p_aluno_id integer, p_professor_id integer, p_health_score character varying, p_observacao text)` | ORFA | DEFINER | sem consumidor conhecido |
| `atualizar_percentual_presenca(p_unidade_id uuid)` | ATIVA | DEFINER | edge:supabase/functions/sync-presenca-emusys/index.ts |
| `avaliar_health_score_professor_v3_comparabilidade(p_score_observado numeric, p_cobertura numeric, p_pilares_validos integer, p_tem_fidelizacao boolean, p_cobertura_minima numeric, p_fonte_canonica_disponivel boolean)` | SO-INTERNA | INVOKER | funcao:get_health_score_professor_v3_performance_snapshot_v1, funcao:get_hs_prof_v3_performance_before_scope_fix_20260804, funcao:get_hs_prof_v3_performance_comp_legacy_20260803, funcao:get_hs_prof_v3_performance_payload_base_20260803 |
| `avaliar_health_score_professor_v3_comparabilidade(p_score_observado numeric, p_cobertura numeric, p_pilares_validos integer, p_tem_fidelizacao boolean, p_cobertura_minima numeric, p_pilares_minimos integer, p_exige_pilar_fidelizacao boolean, p_fonte_canonica_disponivel boolean)` | SO-INTERNA | INVOKER | funcao:get_health_score_professor_v3_performance_snapshot_v1, funcao:get_hs_prof_v3_performance_before_scope_fix_20260804, funcao:get_hs_prof_v3_performance_comp_legacy_20260803, funcao:get_hs_prof_v3_performance_payload_base_20260803 |
| `avaliar_health_score_professor_v3_comparabilidade(p_score_observado numeric, p_cobertura numeric, p_pilares_validos integer, p_tem_fidelizacao boolean, p_cobertura_minima numeric, p_pilares_minimos integer, p_fonte_canonica_disponivel boolean)` | SO-INTERNA | INVOKER | funcao:get_health_score_professor_v3_performance_snapshot_v1, funcao:get_hs_prof_v3_performance_before_scope_fix_20260804, funcao:get_hs_prof_v3_performance_comp_legacy_20260803, funcao:get_hs_prof_v3_performance_payload_base_20260803 |
| `buscar_video_professor(p_nome_professor text, p_nome_curso text, p_tipo text)` | ATIVA | DEFINER | edge:supabase/functions/enviar-boas-vindas-matricula/index.ts |
| `calcular_health_score_aluno(p_aluno_id integer)` | SO-INTERNA | DEFINER | funcao:calcular_health_score_aluno_v2_sombra, funcao:calcular_health_score_alunos_batch |
| `calcular_health_score_aluno_v2_sombra(p_aluno_id integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `calcular_health_score_alunos_batch(p_unidade_id uuid)` | ATIVA | DEFINER | front:src/components/App/SucessoCliente/TabSucessoAluno.tsx, cron:recalcular-health-score-alunos-diario |
| `calcular_health_score_professor_v3_cobertura_normalizada(p_peso_disponivel_total numeric, p_peso_pontuavel_total numeric)` | SO-INTERNA | INVOKER | funcao:get_hs_prof_v3_performance_payload_base_20260803 |
| `calcular_health_score_professor_v3_cobertura_pilares(p_pilares_validos integer, p_pilares_esperados integer)` | SO-INTERNA | INVOKER | funcao:get_health_score_professor_v3_performance_snapshot_v1, funcao:get_hs_prof_v3_performance_before_scope_fix_20260804, funcao:reclassificar_health_score_professor_v3_config_aberta |
| `calcular_health_score_professor_v3_nota_diagnostica(p_metricas jsonb, p_cobertura_minima numeric, p_exige_pilar_fidelizacao boolean)` | SO-INTERNA | INVOKER | funcao:get_health_score_professor_v3_projecao_viva_coerente, funcao:get_hs_prof_v3_projecao_viva_base_20260803, funcao:materializar_hs_v3_periodo_impl_pre_guard_20260802 |
| `calcular_pontos_perdidos_com_tolerancia(p_professor_id integer, p_unidade_id uuid, p_criterio_id integer, p_competencia character varying)` | ORFA | INVOKER · 🔓 anon | sem consumidor conhecido |
| `capturar_carteira_professores_competencia_anterior()` | ORFA | DEFINER | sem consumidor conhecido |
| `capturar_carteira_professores_mensal(p_competencia date, p_fonte text)` | SO-INTERNA | DEFINER | funcao:capturar_carteira_professores_competencia_anterior, funcao:fechar_competencia_mensal_automatico |
| `capturar_relatorio_coordenacao_canonico_v2(p_ano integer, p_mes integer, p_unidade_id uuid, p_motivo text)` | ATIVA | DEFINER | cron:capturar-relatorio-coordenacao-v2-mensal |
| `casar_reposicoes()` | ATIVA | DEFINER | edge:supabase/functions/sync-presenca-emusys/index.ts |
| `configurar_health_score_professor_v3_cron_escopos()` | SO-INTERNA | DEFINER | funcao:executar_health_score_professor_v3_job_escopo |
| `criar_health_score_professor_v3_config_rascunho(p_vigencia_inicio date, p_justificativa text)` | SO-INTERNA | DEFINER | funcao:criar_health_score_professor_v3_config_rascunho_v2 |
| `criar_health_score_professor_v3_config_rascunho(p_vigencia_inicio date, p_justificativa text, p_config_origem_id uuid)` | SO-INTERNA | DEFINER | funcao:criar_health_score_professor_v3_config_rascunho_v2 |
| `criar_health_score_professor_v3_config_rascunho_v2(p_vigencia_inicio date, p_justificativa text, p_config_origem_id uuid)` | ATIVA | DEFINER | front:src/hooks/useHealthScoreProfessorV3Config.ts |
| `criar_health_score_professor_v3_config_revisao_ciclo_aberto(p_config_origem_id uuid, p_vigencia_inicio date, p_vigencia_fim date, p_justificativa text)` | SO-INTERNA | DEFINER | funcao:criar_health_score_professor_v3_config_revisao_ciclo_aberto_v2 |
| `criar_health_score_professor_v3_config_revisao_ciclo_aberto_v2(p_config_origem_id uuid, p_vigencia_inicio date, p_vigencia_fim date, p_justificativa text)` | ATIVA | DEFINER | front:src/hooks/useHealthScoreProfessorV3Config.ts |
| `deletar_penalidade_fideliza(p_id integer)` | ATIVA | DEFINER | front:src/hooks/useFidelizaPrograma.ts |
| `deletar_penalidade_matriculador(p_id integer)` | ATIVA | DEFINER | front:src/hooks/useMatriculadorPrograma.ts |
| `dispensar_passagem_bastao(p_id uuid, p_motivo text)` | ORFA | DEFINER · 🔓 anon | sem consumidor conhecido |
| `editar_ocorrencia(p_ocorrencia_id integer, p_usuario_id uuid, p_usuario_nome character varying, p_justificativa text, p_data_ocorrencia date, p_descricao text, p_minutos_atraso integer)` | ATIVA | DEFINER | front:src/hooks/useProfessor360.ts |
| `enriquecer_relatorio_coordenacao_v2_comparabilidade(p_payload jsonb, p_unidade_id uuid, p_competencia date)` | SO-INTERNA | DEFINER | funcao:get_relatorio_coordenacao_canonico_v2 |
| `executar_health_score_professor_v3_cron_diario()` | ORFA | DEFINER | sem consumidor conhecido |
| `executar_health_score_professor_v3_escopo_diario(p_competencia date, p_periodicidade text, p_escopo text, p_unidade_id uuid)` | SO-INTERNA | DEFINER | funcao:executar_health_score_professor_v3_cron_diario, funcao:executar_health_score_professor_v3_job_escopo |
| `executar_health_score_professor_v3_job_escopo(text, uuid)` | ATIVA | DEFINER | cron:materializar-health-score-professor-v3-diario-consolidado, cron:materializar-health-score-professor-v3-diario-unidade-2ec861f6-023f-4d7b-9927-3960ad8c2a92, cron:materializar-health-score-professor-v3-diario-unidade-368d47f5-2d88-4475-bc14-ba084a9a348e, cron:materializar-health-score-professor-v3-diario-unidade-95553e96-971b-4590-a6eb-0201d013c14d, funcao:configurar_health_score_professor_v3_cron_escopos |
| `fabio_acao_ativa(p_professor_id integer)` | SO-INTERNA | DEFINER | funcao:fabio_iniciar_acao |
| `fabio_acao_confirmacao_segura(p_professor_id integer, p_acao_id uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_acao_json(p_acao_id uuid)` | SO-INTERNA | DEFINER | funcao:fabio_acao_ativa, funcao:fabio_aplicar_evento_acao, funcao:fabio_claim_acoes_processando, funcao:fabio_concluir_limpeza, funcao:fabio_concluir_reconciliacao, funcao:fabio_confirmar_chamada_acao_canonica_v2_interno, +2 outros |
| `fabio_aplicar_evento_acao(p_acao_id uuid, p_professor_id integer, p_wa_message_id text, p_evento text, p_dados jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_arquivar_limpeza_bloqueada(p_acao_id uuid, p_lease_token uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_atualizar_devolutiva_rascunho(p_professor_id integer, p_devolutiva_id uuid, p_texto_normal text, p_texto_apoio_casa text, p_motivo text, p_canal text, p_acao_id text)` | SO-INTERNA | DEFINER | funcao:app_atualizar_devolutiva_rascunho |
| `fabio_atualizar_fatia(p_professor_id integer, p_id uuid, p_texto text, p_campos jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_audio_parqueado_consumir(p_id uuid, p_acao_id uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_audio_parqueado_descartar(p_id uuid, p_motivo text)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_audio_parqueado_proximo(p_professor_id integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_aulas_candidatas(p_professor_id integer, p_fluxo text, p_referencia timestamp with time zone)` | SO-INTERNA | DEFINER | funcao:fabio_shortlist_valida |
| `fabio_aviso_comercial_para_envio(p_notificacao_id uuid, p_lease_token uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_avisos_comerciais_pendentes(p_lote integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_briefing_matinal(p_professor_id integer, p_data date)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_claim_acoes_limpeza(p_limite integer, p_lease_segundos integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_claim_acoes_processando(p_limite integer, p_lease_segundos integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_claim_audio_experimental(p_max integer)` | SO-INTERNA | DEFINER | funcao:fn_fila_audio_experimental_retomar |
| `fabio_claim_aviso_comercial(p_registro_id uuid, p_lease_minutos integer)` | SO-INTERNA | DEFINER | funcao:app_confirmar_registro_experimental |
| `fabio_claim_aviso_falta_experimental(p_vinculo_id bigint, p_lease_minutos integer)` | SO-INTERNA | DEFINER | funcao:app_declarar_falta_experimental |
| `fabio_claim_notificacao(p_professor_id integer, p_tipo text, p_categoria text, p_canal text, p_corpo text, p_titulo text, p_com_token boolean)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_claim_notificacao_por_referencia(p_professor_id integer, p_tipo text, p_categoria text, p_canal text, p_corpo text, p_referencia_tipo text, p_referencia_id text, p_titulo text, p_lease_minutos integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_claim_registro_recibo(p_limite integer, p_professor_id integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_concluir_limpeza(p_acao_id uuid, p_lease_token uuid, p_resultado jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_concluir_reconciliacao(p_acao_id uuid, p_lease_token uuid, p_evento text, p_dados jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_concluir_registro_recibo(p_notificacao_id uuid, p_lease_token uuid, p_envio_recibo text, p_corpo text)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_confirmar_chamada_acao(p_acao_id uuid, p_professor_id integer, p_wa_message_id text)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_confirmar_chamada_acao_canonica_v2_interno(p_acao_id uuid, p_professor_id integer, p_wa_message_id text)` | SO-INTERNA | DEFINER | funcao:fabio_confirmar_chamada_acao |
| `fabio_confirmar_chamada_acao_publicacao_legado_v1(p_acao_id uuid, p_professor_id integer, p_wa_message_id text)` | SO-INTERNA | DEFINER | funcao:fabio_confirmar_chamada_acao |
| `fabio_confirmar_registro(p_professor_id integer, p_registro_id uuid, p_modo text)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_contexto_admin(p_usuario_id integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_contexto_professor(p_professor_id integer, p_data date)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_corrigir_registro_confirmado(p_professor_id integer, p_registro_id uuid, p_campos jsonb, p_motivo text, p_canal text, p_acao_id text, p_autor_usuario_id integer)` | ORFA | DEFINER · 🔓 anon | sem consumidor conhecido |
| `fabio_criar_comando_chamada_v1(p_request_id uuid, p_professor_id integer, p_aula_emusys_id integer, p_alunos_ausentes integer[], p_fonte text)` | SO-INTERNA | DEFINER | funcao:fabio_confirmar_chamada_acao_publicacao_legado_v1, funcao:fabio_emitir_presenca_por_registro_publicacao_legado_v1, funcao:fabio_registrar_presencas_aula |
| `fabio_criar_comando_chamada_v2(p_request_id uuid, p_professor_id integer, p_aula_emusys_id integer, p_alunos_ausentes integer[], p_fonte text)` | SO-INTERNA | DEFINER | funcao:fabio_registrar_presencas_aula_canonica_v2_interno |
| `fabio_criar_registro(p_payload jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_devolutiva_aguardar_destinatario(p_id uuid, p_lease_token uuid, p_motivo text)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_devolutiva_ceifar_travadas(p_teto integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_devolutiva_claim(p_worker text, p_lote integer, p_lease_minutos integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_devolutiva_contexto(p_devolutiva_id uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_devolutiva_devolver(p_id uuid, p_lease_token uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_devolutiva_expirar_aguardando(p_dias integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_devolutiva_falhou(p_id uuid, p_lease_token uuid, p_erro text, p_backoff_segundos integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_devolutiva_gerada(p_id uuid, p_lease_token uuid, p_texto_normal text, p_texto_apoio_casa text, p_destinatario text, p_destinatario_nome text, p_idade integer, p_skill_id uuid, p_skill_versao integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_devolutiva_marcar_entrega_incerta(p_dias integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_devolutiva_oferecida(p_id uuid, p_notificacao_id uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_devolutivas_a_oferecer(p_limite integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_emitir_presenca_por_registro(p_registro_id uuid)` | SO-INTERNA | DEFINER | funcao:fabio_emitir_presenca_por_registro_e_devolutiva |
| `fabio_emitir_presenca_por_registro_e_devolutiva(p_registro_id uuid)` | SO-INTERNA | DEFINER | funcao:fn_confirmar_registro_core |
| `fabio_emitir_presenca_por_registro_publicacao_legado_v1(p_registro_id uuid)` | SO-INTERNA | DEFINER | funcao:fabio_emitir_presenca_por_registro |
| `fabio_emitir_presenca_registro_canonica_v2_interno(p_registro_id uuid)` | SO-INTERNA | DEFINER | funcao:fabio_emitir_presenca_por_registro |
| `fabio_enfileirar_audio(p_professor_id integer, p_aula_id integer, p_storage_path text, p_duracao_segundos integer, p_registro_id uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_enfileirar_devolutivas(p_registro_id uuid)` | SO-INTERNA | DEFINER | funcao:fabio_emitir_presenca_por_registro_e_devolutiva |
| `fabio_experimentais_do_dia(p_professor_id integer, p_data date)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_experimentais_do_professor(p_professor_id integer, p_dias integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_falhar_registro_recibo(p_notificacao_id uuid, p_lease_token uuid, p_erro text)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_falhou_audio_experimental(p_audio_id uuid, p_erro text)` | SO-INTERNA | DEFINER | funcao:get_saude_syncs_emusys |
| `fabio_fila_recusas_a_avisar(p_limite integer, p_grace_minutos integer, p_dias integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_fila_sem_roster_a_avisar(p_limite integer, p_grace_minutos integer, p_dias integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_gravar_contexto_experimental(p_lead_experimental_id integer, p_contexto jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_gravar_registro_experimental_de_audio(p_audio_id uuid, p_transcricao text, p_campos jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_identidade_whatsapp(p_telefone text)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_iniciar_acao(p_professor_id integer, p_wa_message_id text, p_tipo text, p_storage_path text, p_payload jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_marcar_audio_erro_terminal(p_audio_id uuid, p_codigo text, p_detalhe text)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_marcar_audio_erro_terminal(p_audio_id uuid, p_codigo text, p_detalhe text, p_transcricao text)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_marcar_notificacao_enviada(p_notificacao_id uuid, p_lease_token uuid, p_recibo text)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_marcar_notificacao_falhou(p_notificacao_id uuid, p_erro text, p_lease_token uuid, p_backoff_segundos integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_parquear_audio(p_professor_id integer, p_wa_message_id text, p_storage_path text, p_transcricao text, p_duracao_segundos integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_participacao_confirmar(p_ocorrencia_id uuid, p_professor_id integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_participacao_descartar(p_ocorrencia_id uuid, p_motivo text, p_por_tipo text, p_por_id text)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_participacao_registrar_candidata(p_aula_id integer, p_professor_id integer, p_aluno_matriculado_id integer, p_participante_real_id integer, p_participante_nome text, p_participante_telefone text, p_confianca text, p_metodo_extracao text, p_origem_message_id text, p_origem_transcricao text)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_participacao_validar(p_ocorrencia_id uuid, p_validado_por uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_pendencias_professor(p_professor_id integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_pente_fino_unidade(p_usuario_id integer, p_unidade_nome text, p_janela_dias integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_preferencias_professor(p_professor_id integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_presencas_pendentes_professor(p_professor_id integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_professor_presencas_periodo(p_professor_id integer, p_inicio date, p_fim date)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_professor_presencas_periodo_canonico_v2(p_professor_id integer, p_inicio date, p_fim date)` | SO-INTERNA | DEFINER | funcao:fabio_professor_presencas_periodo |
| `fabio_professor_presencas_periodo_legado_v1(p_professor_id integer, p_inicio date, p_fim date)` | SO-INTERNA | DEFINER | funcao:fabio_professor_presencas_periodo |
| `fabio_professor_resumo_aulas(p_professor_id integer, p_inicio date, p_fim date, p_unidade text)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_prontuario_aluno(p_aluno_id integer, p_professor_id integer, p_limite integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_prontuario_aluno_admin(p_usuario_id integer, p_aluno_id integer, p_limite integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_provar_limpeza(p_acao_id uuid, p_storage_path text)` | SO-INTERNA | DEFINER | funcao:fabio_arquivar_limpeza_bloqueada, funcao:fabio_concluir_limpeza |
| `fabio_registrar_presencas_aula(p_professor_id integer, p_aula_emusys_id integer, p_alunos_ausentes integer[])` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_registrar_presencas_aula(p_professor_id integer, p_aula_emusys_id integer, p_alunos_ausentes integer[], p_request_id uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_registrar_presencas_aula_canonica_v2_interno(p_request_id uuid, p_professor_id integer, p_aula_emusys_id integer, p_alunos_ausentes integer[], p_fonte text)` | SO-INTERNA | DEFINER | funcao:fabio_confirmar_chamada_acao_canonica_v2_interno, funcao:fabio_emitir_presenca_registro_canonica_v2_interno |
| `fabio_registro_completo(p_professor_id integer, p_registro_id uuid)` | SO-INTERNA | DEFINER | funcao:fabio_registro_recibo_dados |
| `fabio_registro_recibo_dados(p_professor_id integer, p_registro_id uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_resolver_participante(p_professor_id integer, p_unidade_id uuid, p_nome text)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_responder_presenca(p_professor_id integer, p_registro_alvo_id uuid, p_presenca text)` | ORFA | DEFINER | sem consumidor conhecido |
| `fabio_shortlist_valida(p_professor_id integer, p_fluxo text, p_candidatas integer[], p_referencia timestamp with time zone)` | SO-INTERNA | DEFINER | funcao:fabio_aplicar_evento_acao, funcao:fabio_confirmar_chamada_acao_canonica_v2_interno, funcao:fabio_confirmar_chamada_acao_publicacao_legado_v1 |
| `fabio_status_audio_fila(p_professor_id integer, p_audio_id uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `fechar_health_score_professor_v3_ciclo(p_ciclo_codigo text, p_justificativa text)` | ORFA | DEFINER | sem consumidor conhecido |
| `finalizar_reconstrucao_particionada_professor_v1(p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_versao_reconstrucao text, p_execucao_backfill_id uuid, p_total_particoes integer, p_inicio_completo boolean)` | ATIVA | DEFINER | edge:supabase/functions/reconstruir-periodos-professor/index.ts |
| `fingerprint_health_score_professor_v3_escopo(p_competencia date, p_periodicidade text, p_escopo text, p_unidade_id uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_agenda_dia_legado_envelope_v1(p_data date, p_unidade_id uuid)` | SO-INTERNA | DEFINER | funcao:get_agenda_dia_v2 |
| `fn_amarrar_email_do_professor(p_professor_id integer, p_email text)` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_aplicar_comando_presenca_core_v2(p_request_id uuid)` | SO-INTERNA | DEFINER | funcao:app_aplicar_comando_presenca_v2 |
| `fn_aula_alunos_emusys_casar_aluno()` | ATIVA | DEFINER | trigger:aula_alunos_emusys.trg_aula_alunos_emusys_casar_aluno |
| `fn_aula_alunos_emusys_reconcilia_chave()` | ATIVA | INVOKER · 🔓 anon | trigger:aula_alunos_emusys.trg_aula_alunos_emusys_reconcilia_chave |
| `fn_aula_individual_do_aluno(p_aula_id integer, p_aluno_id integer)` | SO-INTERNA | DEFINER | funcao:app_abrir_rascunho_manual, funcao:app_registro_completo, funcao:fabio_criar_registro, funcao:fabio_registro_completo, funcao:fn_aula_ja_registrada, funcao:fn_confirmar_registro_core, +1 outros |
| `fn_aula_ja_registrada(p_aula_id integer)` | SO-INTERNA | DEFINER | funcao:app_registro_completo, funcao:fabio_registro_completo |
| `fn_aula_operacional_id(p_aula_id integer)` | ATIVA | DEFINER | view:vw_experimental_pendencia, view:vw_fila_audio_sem_roster, view:vw_presenca_pendencia, view:vw_registro_pendencia, funcao:app_minha_agenda_semana_v1, funcao:app_minha_agenda_sessao_base_v1, +8 outros |
| `fn_briefing_txt(p_txt text)` | SO-INTERNA | INVOKER · 🔓 anon | funcao:fabio_briefing_matinal |
| `fn_carteira_fatiada(p_professor_id integer)` | SO-INTERNA | DEFINER | funcao:app_professor_carteira_contagem, funcao:fabio_contexto_professor |
| `fn_chave_natural_periodo_professor_v1(p_unidade_id uuid, p_pessoa_chave text, p_emusys_matricula_disciplina_id bigint, p_emusys_professor_id bigint, p_evidencias jsonb)` | ATIVA | INVOKER | view:vw_professor_periodos_baseline_v3_sombra, view:vw_professor_periodos_efetivos_v3_sombra, funcao:promover_periodos_professor_ativos_exatos_v2, funcao:promover_troca_de_curso_mesmo_professor_v1, funcao:promover_trocas_confirmadas_pela_jornada_v1 |
| `fn_concluir_recado_coordenacao(p_notificacao_id uuid, p_lease_token uuid, p_ok boolean, p_recibo text, p_erro text)` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_confirmar_registro_core(p_professor_id integer, p_confirmado_por uuid, p_registro_id uuid, p_modo text)` | SO-INTERNA | DEFINER | funcao:app_confirmar_registro, funcao:fabio_confirmar_registro |
| `fn_criar_comando_presenca_core_v2(p_request_id uuid, p_tipo text, p_unidade_id uuid, p_aula_id integer, p_itens jsonb)` | SO-INTERNA | DEFINER | funcao:app_criar_comando_chamada_professor_v2, funcao:fabio_criar_comando_chamada_v2 |
| `fn_desfaz_faltou_sem_afirmacao(p_limite integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_devolutiva_fonte(p_tronco jsonb, p_fatia jsonb)` | SO-INTERNA | INVOKER | funcao:fabio_devolutiva_contexto |
| `fn_disponibilidade_professor_canonica_valida(p_disponibilidade jsonb)` | ORFA | INVOKER | sem consumidor conhecido |
| `fn_disponibilidade_professor_valida(p_disponibilidade jsonb)` | SO-INTERNA | INVOKER | funcao:app_propor_disponibilidade, funcao:fn_disponibilidade_professor_canonica_valida |
| `fn_e_coordenacao_la_teacher()` | SO-INTERNA | DEFINER | funcao:app_coordenacao_em_aberto, funcao:app_coordenacao_feedback_mes, funcao:app_coordenacao_professor_detalhe, funcao:app_coordenacao_radar, funcao:app_meu_acesso, funcao:app_meu_perfil_coordenacao, +3 outros |
| `fn_enfileirar_audio_core(p_aula_id integer, p_storage_path text, p_duracao_segundos integer, p_registro_id uuid, p_origem text)` | SO-INTERNA | DEFINER | funcao:app_enfileirar_audio, funcao:fabio_enfileirar_audio |
| `fn_enfileirar_audio_core(p_aula_id integer, p_storage_path text, p_duracao_segundos integer, p_registro_id uuid, p_origem text, p_professor_id integer)` | SO-INTERNA | DEFINER | funcao:app_enfileirar_audio, funcao:fabio_enfileirar_audio |
| `fn_enfileirar_registro_recibo(p_registro_id uuid, p_professor_id integer)` | SO-INTERNA | DEFINER | funcao:fn_confirmar_registro_core |
| `fn_fabio_audio_do_registro(p_registro_id uuid)` | SO-INTERNA | DEFINER | funcao:fn_fabio_diario_coletar |
| `fn_fabio_audio_recusa_causa(p_audio_id uuid)` | SO-INTERNA | DEFINER | funcao:fn_fabio_ocorrencia_classe |
| `fn_fabio_canario_correcao_de_ficha()` | ATIVA | DEFINER | cron:fabio-canario-escrita |
| `fn_fabio_chama_edge(p_audio_id uuid)` | SO-INTERNA | DEFINER | funcao:fn_fabio_retry_fila, funcao:fn_fila_audio_retomar_por_roster, funcao:trg_fabio_fila_dispara |
| `fn_fabio_citacao_confere(p_citacao text, p_texto text)` | ORFA | INVOKER · 🔓 anon | sem consumidor conhecido |
| `fn_fabio_contraponto_pendente(p_limite integer)` | SO-INTERNA | DEFINER | funcao:fn_fabio_contraponto_saude |
| `fn_fabio_contraponto_registrar(p_audio_id uuid, p_motor text, p_texto text, p_erro text)` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_fabio_contraponto_saude()` | SO-INTERNA | DEFINER | funcao:fn_fabio_diario_coletar |
| `fn_fabio_correcao_direcao(p_antes jsonb, p_depois jsonb, p_transcricao text, p_audio_id uuid)` | SO-INTERNA | DEFINER · 🔓 anon | funcao:fn_fabio_diario_coletar, funcao:fn_fabio_identidade_apurar |
| `fn_fabio_det_aluno_invisivel(p_aula_do_aluno integer, p_aluno_id integer)` | SO-INTERNA | DEFINER | funcao:fn_fabio_diario_fechar |
| `fn_fabio_det_audio_recusado(p_audio_id uuid)` | SO-INTERNA | DEFINER | funcao:fn_fabio_diario_fechar |
| `fn_fabio_det_canario_parado()` | SO-INTERNA | DEFINER | funcao:fn_fabio_diario_fechar |
| `fn_fabio_det_ficha_descartada(p_registro_id uuid)` | SO-INTERNA | DEFINER | funcao:fn_fabio_diario_coletar, funcao:fn_fabio_diario_fechar |
| `fn_fabio_det_rascunho_parado(p_registro_id uuid)` | SO-INTERNA | DEFINER | funcao:fn_fabio_diario_fechar |
| `fn_fabio_diario_coletar(p_dia date)` | ATIVA | DEFINER | cron:fabio-diario-coletar |
| `fn_fabio_diario_fechar()` | ATIVA | DEFINER | cron:fabio-diario-fechar |
| `fn_fabio_e_flexao(p_a text, p_b text)` | SO-INTERNA | INVOKER · 🔓 anon | funcao:fn_fabio_grafia_divergente |
| `fn_fabio_falas_do_professor(p_professor_id integer)` | SO-INTERNA | DEFINER | funcao:fn_fabio_vocabulario_grafia_suspeita |
| `fn_fabio_falta_sem_medicao()` | SO-INTERNA | DEFINER | funcao:fn_fabio_laudo |
| `fn_fabio_grafia_divergente(p_termo text, p_transcricao text)` | SO-INTERNA | INVOKER · 🔓 anon | funcao:fn_fabio_vocabulario_grafia_suspeita |
| `fn_fabio_historico_para_prompt(p_aula_id bigint, p_limite integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_fabio_identidade_apurar(p_professor_id integer)` | SO-INTERNA | DEFINER | funcao:fn_fabio_identidade_apurar_pendentes, funcao:fn_fabio_identidade_apurar_todos |
| `fn_fabio_identidade_apurar_pendentes()` | ATIVA | DEFINER | cron:fabio-identidade-pendentes |
| `fn_fabio_identidade_apurar_todos()` | ATIVA | DEFINER | cron:fabio-identidade-apurar |
| `fn_fabio_janelas_por_minerar(p_limite integer)` | SO-INTERNA | DEFINER | funcao:fn_fabio_laudo, funcao:fn_fabio_laudo_gravar |
| `fn_fabio_known_issue_ativo(p_assinatura text)` | ORFA | DEFINER · 🔓 anon | sem consumidor conhecido |
| `fn_fabio_laudo(p_dia date)` | SO-INTERNA | DEFINER | funcao:fn_fabio_laudo_gravar |
| `fn_fabio_laudo_gravar(p_dia date)` | ATIVA | DEFINER | cron:fabio-laudo |
| `fn_fabio_licao_gravar(p_nome text, p_texto text, p_por text, p_porque text)` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_fabio_normalizar_termo(p_bruto text)` | SO-INTERNA | INVOKER · 🔓 anon | funcao:fn_fabio_identidade_apurar, funcao:fn_fabio_vocabulario_stt |
| `fn_fabio_ocorrencia_classe(p_id uuid)` | SO-INTERNA | DEFINER | funcao:fn_fabio_laudo |
| `fn_fabio_ocorrencia_detalhe(p_id uuid)` | SO-INTERNA | DEFINER | funcao:fn_fabio_laudo |
| `fn_fabio_pode_notificar(p_professor_id integer, p_categoria text, p_agora timestamp with time zone)` | SO-INTERNA | DEFINER | funcao:fn_reservar_cobranca_feedback, funcao:fn_reservar_recado_coordenacao |
| `fn_fabio_recusa_sem_prova()` | SO-INTERNA | DEFINER | funcao:fn_fabio_laudo |
| `fn_fabio_relatar_confirmacao_falsa(p_registro_id uuid, p_veredicto text)` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_fabio_relato_autor(p_proposta_id uuid)` | SO-INTERNA | DEFINER | funcao:fn_fabio_ocorrencia_detalhe |
| `fn_fabio_relato_promover()` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_fabio_resolver_por_conserto(p_ids uuid[], p_porque text, p_referencia text, p_por text)` | SO-INTERNA | DEFINER | funcao:fn_fabio_resolver_por_conserto_relatos |
| `fn_fabio_resolver_por_conserto_relatos(p_tipo_de_atrito_regex text, p_porque text, p_referencia text, p_por text)` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_fabio_retry_fila()` | ATIVA | DEFINER | front:src/hooks/useSaudeCrons.ts, cron:fabio-retry-fila, funcao:fabio_provar_limpeza, funcao:get_saude_syncs_emusys |
| `fn_fabio_slots_com_aluno_invisivel(p_dias integer)` | SO-INTERNA | DEFINER | funcao:fn_fabio_det_aluno_invisivel, funcao:fn_fabio_diario_coletar |
| `fn_fabio_sonda_controle(p_nome text)` | SO-INTERNA | DEFINER | funcao:fn_fabio_sonda_registrar |
| `fn_fabio_sonda_julgar(p_resposta text, p_controle jsonb)` | SO-INTERNA | INVOKER · 🔓 anon | funcao:fn_fabio_sonda_registrar |
| `fn_fabio_sonda_registrar(p_nome text, p_k integer, p_resposta text, p_duracao_ms integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_fabio_texto_afirma_ausencia(p_texto text)` | SO-INTERNA | INVOKER · 🔓 anon | funcao:fabio_marcar_audio_erro_terminal, funcao:fn_fabio_audio_recusa_causa |
| `fn_fabio_texto_da_janela(p_origem text, p_professor_id integer, p_dia date)` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_fabio_tipo_acao(p_tipo text)` | ORFA | INVOKER · 🔓 anon | sem consumidor conhecido |
| `fn_fabio_tipo_como_resolver(p_tipo text)` | SO-INTERNA | INVOKER · 🔓 anon | funcao:fn_fabio_laudo |
| `fn_fabio_tipo_em_portugues(p_tipo text)` | SO-INTERNA | INVOKER · 🔓 anon | funcao:fn_fabio_laudo |
| `fn_fabio_transcricao_do_registro(p_registro_id uuid)` | SO-INTERNA | DEFINER | funcao:fn_fabio_diario_coletar, funcao:fn_fabio_identidade_apurar |
| `fn_fabio_trecho_na_transcricao(p_trecho text, p_transcricao text)` | SO-INTERNA | INVOKER · 🔓 anon | funcao:fn_fabio_correcao_direcao |
| `fn_fabio_veredito(p_ids uuid[], p_veredito text, p_por text, p_nota text)` | SO-INTERNA | DEFINER | funcao:fn_fabio_veredito_por_classe |
| `fn_fabio_veredito_por_classe(p_assinatura text, p_veredito text, p_por text, p_nota text, p_ate_dia date)` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_fabio_vocabulario_grafia_suspeita()` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_fabio_vocabulario_qualidade()` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_fabio_vocabulario_stt(p_professor_id integer, p_aula_id bigint)` | SO-INTERNA | DEFINER | funcao:fn_fabio_identidade_apurar |
| `fn_feedback_cobranca_do_dia(p_dia date)` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_health_score_professor_v3_ator_gerenciador()` | SO-INTERNA | DEFINER | funcao:ativar_health_score_professor_v3_config, funcao:ativar_health_score_professor_v3_config_pre_catalogo_v1, funcao:ativar_health_score_professor_v3_config_revisao_ciclo_aberto, funcao:criar_health_score_professor_v3_config_rascunho, funcao:criar_health_score_professor_v3_config_revisao_ciclo_aberto, funcao:fechar_health_score_professor_v3_ciclo, +9 outros |
| `fn_health_score_professor_v3_ator_leitura(p_unidade_id uuid)` | SO-INTERNA | DEFINER | funcao:get_health_score_professor_v3_capacidade_diagnostico, funcao:get_health_score_professor_v3_performance, funcao:get_health_score_professor_v3_sinais, funcao:get_health_score_professor_v3_snapshot_modal, funcao:get_hs_prof_v3_performance_base_comp_legacy_20260803, funcao:get_hs_prof_v3_performance_comp_legacy_20260803, +5 outros |
| `fn_health_score_professor_v3_bloquear_config_meta_segmentada()` | ATIVA | DEFINER | trigger:health_score_professor_v3_config_metas_curso_modalidade.trg_health_score_professor_v3_config_meta_segmentada_imutavel |
| `fn_health_score_professor_v3_bloquear_config_metrica()` | ATIVA | INVOKER | trigger:health_score_professor_v3_config_metricas.trg_health_score_professor_v3_config_metrica_imutavel |
| `fn_health_score_professor_v3_bloquear_config_versao()` | ATIVA | INVOKER | trigger:health_score_professor_v3_config_versoes.trg_health_score_professor_v3_config_versao_imutavel |
| `fn_health_score_professor_v3_bloquear_metrica_fechada()` | ATIVA | INVOKER | trigger:health_score_professor_v3_snapshot_metricas.trg_health_score_professor_v3_snapshot_metrica_imutavel |
| `fn_health_score_professor_v3_bloquear_snapshot_fechado()` | ATIVA | INVOKER | trigger:health_score_professor_v3_snapshots.trg_health_score_professor_v3_snapshot_imutavel |
| `fn_health_score_professor_v3_bloquear_snapshot_segmento_fechado()` | ATIVA | DEFINER | trigger:health_score_professor_v3_snapshot_metrica_diagnosticos.trg_health_score_v3_snapshot_segmento_diagnostico_imutavel, trigger:health_score_professor_v3_snapshot_metrica_segmentos.trg_health_score_professor_v3_snapshot_segmento_imutavel |
| `fn_health_score_professor_v3_catalogo_segmentos_v1()` | SO-INTERNA | DEFINER | funcao:fn_health_score_professor_v3_segmentos_faltantes_v1, funcao:get_hs_prof_v3_config_ui_base_20260803, funcao:salvar_health_score_v3_config_pre_cursos_pedagogicos_v1 |
| `fn_health_score_professor_v3_catalogo_segmentos_v1(p_config_id uuid)` | SO-INTERNA | DEFINER | funcao:fn_health_score_professor_v3_segmentos_faltantes_v1, funcao:get_hs_prof_v3_config_ui_base_20260803, funcao:salvar_health_score_v3_config_pre_cursos_pedagogicos_v1 |
| `fn_health_score_professor_v3_codigo_evidencia(p_metrica text, p_estado_base text, p_publicavel boolean, p_nota numeric, p_amostra integer, p_amostra_minima integer, p_detalhes jsonb)` | SO-INTERNA | INVOKER | funcao:get_hs_prof_v3_projecao_viva_base_20260803, funcao:materializar_hs_v3_periodo_impl_pre_guard_20260802 |
| `fn_health_score_professor_v3_config_fingerprint(p_config_id uuid)` | SO-INTERNA | DEFINER | funcao:ativar_health_score_professor_v3_config_pre_catalogo_v1, funcao:ativar_health_score_professor_v3_config_revisao_ciclo_aberto, funcao:fn_health_score_professor_v3_config_fingerprint_comparabilidade, funcao:fn_health_score_professor_v3_exigir_simulacao_atual, funcao:simular_health_score_professor_v3_config_pre_catalogo_v1 |
| `fn_health_score_professor_v3_config_fingerprint_comparabilidade(p_config_id uuid)` | SO-INTERNA | DEFINER | funcao:get_health_score_professor_v3_performance, funcao:get_health_score_professor_v3_performance_snapshot_v1, funcao:get_hs_prof_v3_performance_before_scope_fix_20260804, funcao:get_hs_prof_v3_performance_payload_base_20260803 |
| `fn_health_score_professor_v3_config_json(p_config_id uuid)` | SO-INTERNA | DEFINER | funcao:ativar_health_score_professor_v3_config_pre_catalogo_v1, funcao:ativar_health_score_professor_v3_config_revisao_ciclo_aberto, funcao:criar_health_score_professor_v3_config_rascunho, funcao:criar_health_score_professor_v3_config_revisao_ciclo_aberto, funcao:fn_health_score_professor_v3_config_json_comparabilidade, funcao:fn_health_score_professor_v3_config_ui_competencia, +2 outros |
| `fn_health_score_professor_v3_config_json_comparabilidade(p_config_id uuid)` | SO-INTERNA | DEFINER | funcao:criar_health_score_professor_v3_config_rascunho_v2, funcao:criar_health_score_professor_v3_config_revisao_ciclo_aberto_v2, funcao:get_health_score_professor_v3_config_ui, funcao:salvar_health_score_professor_v3_config_rascunho_v2 |
| `fn_health_score_professor_v3_config_ui_competencia(p_competencia date)` | SO-INTERNA | DEFINER | funcao:get_hs_prof_v3_config_ui_base_20260803 |
| `fn_health_score_professor_v3_exigir_simulacao_atual()` | ATIVA | DEFINER | trigger:health_score_professor_v3_config_versoes.trg_health_score_professor_v3_exigir_simulacao_atual |
| `fn_health_score_professor_v3_segmentos_faltantes_v1(p_config_id uuid)` | SO-INTERNA | DEFINER | funcao:ativar_health_score_professor_v3_config, funcao:ativar_health_score_professor_v3_config_revisao_ciclo_aberto, funcao:simular_health_score_professor_v3_config |
| `fn_health_score_professor_v3_validar_snapshot_segmento_config()` | ATIVA | DEFINER | trigger:health_score_professor_v3_snapshot_metrica_segmentos.trg_health_score_v3_snapshot_segmento_config_consistente |
| `fn_health_score_v3_bloquear_config_substituicao()` | ATIVA | DEFINER | trigger:health_score_professor_v3_config_substituicoes.trg_health_score_professor_v3_config_substituicoes_append_only |
| `fn_health_score_v3_bloquear_sem_disponibilidade()` | ATIVA | INVOKER | trigger:health_score_professor_v3_snapshots.trg_health_score_v3_bloquear_sem_disponibilidade |
| `fn_health_score_v3_disponibilidade_resumo(p_disponibilidade jsonb)` | SO-INTERNA | INVOKER | funcao:get_health_score_professor_v3_numero_alunos_disponibilidade_raw |
| `fn_health_score_v3_periodo(p_competencia date, p_periodicidade text)` | SO-INTERNA | INVOKER | funcao:get_health_score_prof_v3_metricas_base_20260728_c95, funcao:get_health_score_professor_v3_carteira_periodo, funcao:get_health_score_professor_v3_conversao_ciclo, funcao:get_health_score_professor_v3_metricas_periodo_base_20260719, funcao:get_health_score_professor_v3_metricas_segmentadas_agregadas_v1, funcao:get_health_score_professor_v3_numero_alunos_disponibilidade_raw, +10 outros |
| `fn_health_score_v3_professores_fora_da_pontuacao(p_competencia date)` | SO-INTERNA | INVOKER | funcao:get_health_score_professor_v3_performance, funcao:materializar_health_score_professor_v3_periodo_impl_base_202607 |
| `fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id uuid)` | SO-INTERNA | DEFINER | funcao:get_health_score_prof_v3_metricas_base_20260728_c95, funcao:get_health_score_professor_v3_carteira_periodo, funcao:get_health_score_professor_v3_metricas_periodo_base_20260719, funcao:get_health_score_professor_v3_permanencia_periodo_v2, funcao:get_health_score_professor_v3_presenca_periodo_v2, funcao:get_health_score_professor_v3_totais_carteira_canonica_v1, +10 outros |
| `fn_materializar_health_score_professor_v3(p_competencia date, p_config_id uuid, p_modo text, p_professor_id integer, p_unidade_id uuid, p_escopo_unico boolean, p_snapshot_anterior_id uuid, p_justificativa_retificacao text)` | SO-INTERNA | DEFINER | funcao:materializar_health_score_professor_v3, funcao:retificar_health_score_professor_v3 |
| `fn_materializar_presenca_padrao(p_registro_id uuid, p_professor_id integer)` | SO-INTERNA | DEFINER | funcao:fn_confirmar_registro_core |
| `fn_participacao_append_only()` | ATIVA | INVOKER · 🔓 anon | trigger:fabio_participacao_ocorrencia_eventos.trg_participacao_eventos_append_only, trigger:fabio_participacao_ocorrencias.trg_participacao_ocorrencias_append_only |
| `fn_participacao_nome_casa(p_nome_a text, p_nome_b text)` | SO-INTERNA | INVOKER | funcao:fabio_resolver_participante |
| `fn_participacao_nome_tokens(p_nome text)` | SO-INTERNA | INVOKER | funcao:fn_participacao_nome_casa |
| `fn_participacao_supersede_coerente()` | ATIVA | INVOKER · 🔓 anon | trigger:fabio_participacao_ocorrencias.trg_participacao_supersede_coerente |
| `fn_pendencia_presenca(p_registro_alvo_id uuid, p_tipo_alvo text, p_aluno_id integer)` | ORFA | INVOKER | sem consumidor conhecido |
| `fn_pendencias_do_professor(p_professor_id integer, p_incluir_passivo boolean)` | SO-INTERNA | DEFINER | funcao:app_minhas_pendencias, funcao:fabio_contexto_professor, funcao:fabio_pendencias_professor |
| `fn_pendencias_escalonadas(p_dias integer, p_professor_id integer, p_max_aulas integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `fn_ponto_professor_diario(p_professor_id integer, p_data_inicio date, p_data_fim date)` | SO-INTERNA | DEFINER | funcao:app_meu_ponto |
| `fn_presenca_bloquear_slot_rosters_v2(p_aula_id integer)` | SO-INTERNA | DEFINER | funcao:app_criar_comando_chamada_professor_v2, funcao:fabio_criar_comando_chamada_v2, funcao:fn_validar_comando_roster_reservado_v2 |
| `fn_presenca_comando_arbitrar_insert()` | ATIVA | DEFINER | trigger:presenca_comandos.trg_presenca_comando_arbitrar_insert |
| `fn_presenca_comando_eventos_append_only()` | ATIVA | DEFINER | trigger:presenca_acao_eventos.trg_presenca_acao_eventos_append_only |
| `fn_presenca_dados_frescos_interno_v1(p_unidade_id uuid, p_data_alvo date)` | SO-INTERNA | DEFINER | funcao:app_minha_agenda_sessao_canonica_v2, funcao:app_minha_agenda_sessao_canonica_v2_referencia_lenta, funcao:fabio_professor_presencas_periodo_canonico_v2, funcao:fn_presenca_dados_frescos_v1, funcao:fn_presenca_estado_publicacao_periodo_v2, funcao:fn_presenca_pendencias_do_dia_v2, +1 outros |
| `fn_presenca_dados_frescos_v1(p_unidade_id uuid, p_data_alvo date)` | SO-INTERNA | DEFINER | funcao:fn_presenca_estado_publicacao_periodo_v2, funcao:fn_presenca_pendencias_do_dia_v2, funcao:get_presenca_metricas_canonicas_v2 |
| `fn_presenca_declarada(p_campos jsonb)` | SO-INTERNA | INVOKER | funcao:fabio_claim_registro_recibo, funcao:fabio_enfileirar_devolutivas, funcao:fn_fabio_det_ficha_descartada, funcao:fn_fabio_falta_sem_medicao, funcao:fn_materializar_presenca_padrao |
| `fn_presenca_diagnostico_v1(p_res jsonb)` | SO-INTERNA | INVOKER · 🔓 anon | funcao:fabio_emitir_presenca_por_registro_publicacao_legado_v1, funcao:fabio_emitir_presenca_registro_canonica_v2_interno |
| `fn_presenca_e_forte(p_respondido_por text)` | ATIVA | INVOKER · 🔓 anon | view:vw_aluno_presenca_semantica_v1, view:vw_experimental_faltou_sem_afirmacao, view:vw_experimental_registro_comercial, view:vw_fabio_aulas_contexto, view:vw_presenca_slot_canonica_v1, funcao:app_confirmar_registro_experimental, +12 outros |
| `fn_presenca_estado_publicacao_periodo_v2(p_unidade_id uuid, p_data_inicio date, p_data_fim date)` | ATIVA | DEFINER | view:vw_absenteismo_aluno_canonica_v2, view:vw_aluno_frequencia_canonica_v1, view:vw_radar_aluno_sinais_canonica_v2, funcao:get_health_score_professor_v3_presenca_periodo_v2, funcao:get_presenca_ocorrencias_periodo_canonico_v2 |
| `fn_presenca_estado_roster_lock_trigger_v2()` | ATIVA | DEFINER | trigger:aula_roster_sync_estado.trg_presenca_estado_roster_lock_v2 |
| `fn_presenca_fecha_chamada(p_status_presenca text, p_respondido_por text)` | ATIVA | INVOKER | edge:supabase/functions/_shared/previsualizacao-reconciliacao-grade.ts, view:vw_presenca_pendencia, view:vw_presenca_slot_canonica_v1, funcao:app_registro_completo, funcao:fabio_aulas_candidatas, funcao:fn_sincronizar_gemeos_presenca, +3 outros |
| `fn_presenca_fila_proveniencia_rollout_v1()` | ATIVA | DEFINER | trigger:fila_relatorios_sol_hermes.trg_presenca_fila_proveniencia_rollout |
| `fn_presenca_fonte_legivel(p_respondido_por text)` | ORFA | INVOKER · 🔓 anon | sem consumidor conhecido |
| `fn_presenca_ocorrencia_canonica_escopada_v2(p_unidade_id uuid, p_data_inicio date, p_data_fim date)` | SO-INTERNA | INVOKER | funcao:fn_presenca_ocorrencias_escopo_interno_v2 |
| `fn_presenca_ocorrencias_escopo_interno_v2(p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_professor_id integer, p_aluno_id integer)` | SO-INTERNA | DEFINER | funcao:fn_presenca_estado_publicacao_periodo_v2, funcao:get_health_score_professor_v3_presenca_periodo_v2, funcao:get_presenca_metricas_canonicas_v2, funcao:get_presenca_ocorrencias_periodo_canonico_v2 |
| `fn_presenca_pendencia_elegivel(p_unidade_id uuid, p_aluno_id integer, p_data_aula date, p_matricula_disciplina_id bigint, p_curso_nome text)` | ATIVA | DEFINER | view:vw_presenca_pendencia, funcao:fn_presenca_estado_publicacao_periodo_v2, funcao:fn_presenca_pendencias_do_dia_v2, funcao:get_presenca_metricas_canonicas_v2 |
| `fn_presenca_pendencias_do_dia(p_unidade_id uuid, p_data date)` | SO-INTERNA | DEFINER | funcao:fn_agenda_dia_legado_envelope_v1, funcao:fn_texto_relatorio_presenca_legado_v1 |
| `fn_presenca_pendencias_do_dia_v2(p_unidade_id uuid, p_data date)` | SO-INTERNA | DEFINER | funcao:fn_enfileirar_relatorio_presenca, funcao:fn_presenca_pendencias_do_dia, funcao:get_agenda_dia_canonica_v2, funcao:get_presenca_contexto_agente_canonico_v1 |
| `fn_presenca_politica_impedir_sobreposicao()` | ATIVA | INVOKER | trigger:presenca_politicas_confiabilidade.trg_presenca_politica_impedir_sobreposicao |
| `fn_presenca_rollout_modo_escopo_interno_v1(p_unidade_id uuid, p_superficie text)` | SO-INTERNA | DEFINER | funcao:fn_presenca_fila_proveniencia_rollout_v1, funcao:fn_texto_relatorio_presenca_consolidado, funcao:get_agenda_dia_v2 |
| `fn_presenca_rollout_modo_interno_v1(p_unidade_id uuid, p_superficie text)` | SO-INTERNA | DEFINER | funcao:app_registrar_presencas_aula, funcao:fabio_confirmar_chamada_acao, funcao:fabio_emitir_presenca_por_registro, funcao:fabio_professor_presencas_periodo, funcao:fn_absenteismo_aluno_rollout_v1, funcao:fn_presenca_rollout_modo_escopo_interno_v1, +6 outros |
| `fn_presenca_roster_lock_key_v2(p_aula_emusys_id integer)` | SO-INTERNA | INVOKER | funcao:fn_presenca_bloquear_slot_rosters_v2, funcao:fn_presenca_estado_roster_lock_trigger_v2, funcao:fn_presenca_roster_lock_trigger_v2, funcao:fn_presenca_slot_lock_trigger_v2, funcao:reconciliar_grade_snapshot_emusys_v2 |
| `fn_presenca_roster_lock_trigger_v2()` | ATIVA | DEFINER | trigger:aula_alunos_emusys.trg_presenca_roster_lock_v2 |
| `fn_presenca_slot_key_v2(p_aluno_id integer, p_unidade_id uuid, p_professor_id integer, p_data_hora_inicio timestamp with time zone, p_data_hora_fim timestamp with time zone, p_curso_nome text)` | ATIVA | INVOKER | view:vw_presenca_ocorrencia_canonica_v2, funcao:fn_presenca_estado_publicacao_periodo_v2, funcao:fn_presenca_ocorrencia_canonica_escopada_v2, funcao:fn_presenca_pendencias_do_dia_v2, funcao:get_presenca_metricas_canonicas_v2, funcao:get_presenca_shadow_comparacao_v2 |
| `fn_presenca_slot_lock_key_v2(p_unidade_id uuid, p_professor_id integer, p_data_hora_inicio timestamp with time zone, p_data_hora_fim timestamp with time zone, p_curso_nome text)` | SO-INTERNA | INVOKER | funcao:app_criar_comando_chamada_professor_v2, funcao:fabio_criar_comando_chamada_v2, funcao:fn_presenca_bloquear_slot_rosters_v2, funcao:fn_presenca_estado_roster_lock_trigger_v2, funcao:fn_presenca_roster_lock_trigger_v2, funcao:fn_presenca_slot_lock_trigger_v2, +2 outros |
| `fn_presenca_slot_lock_trigger_v2()` | ATIVA | DEFINER | trigger:aulas_emusys.trg_presenca_slot_lock_v2 |
| `fn_presenca_status_efetivo(p_status_presenca text, p_status text)` | ORFA | INVOKER · 🔓 anon | sem consumidor conhecido |
| `fn_professor_curso_modalidade_ator_v1()` | SO-INTERNA | DEFINER | funcao:get_prof_curso_modalidade_excecoes_v2_pre_nome_emusys, funcao:get_prof_curso_modalidade_excecoes_v2_raw, funcao:get_professor_curso_modalidade_reconciliacao_v1, funcao:salvar_professor_curso_modalidade_atribuicoes_v1 |
| `fn_professor_curso_modalidade_data_local_la_v1()` | SO-INTERNA | DEFINER | funcao:fn_professor_curso_modalidade_impedir_sobreposicao_v1, funcao:get_prof_curso_modalidade_excecoes_v2_raw, funcao:get_professor_curso_modalidade_reconciliacao_v1, funcao:reconciliar_professor_curso_modalidade_v1, funcao:salvar_professor_curso_modalidade_atribuicoes_v1 |
| `fn_professor_curso_modalidade_evidencias_v1(p_data_referencia date, p_unidade_id uuid, p_professor_id integer)` | SO-INTERNA | DEFINER | funcao:get_professor_curso_modalidade_reconciliacao_v1, funcao:reconciliar_professor_curso_modalidade_v1 |
| `fn_professor_curso_modalidade_evidencias_v2(p_data_referencia date, p_unidade_id uuid, p_professor_id integer)` | SO-INTERNA | DEFINER | funcao:get_prof_curso_modalidade_excecoes_v2_raw, funcao:reconciliar_professor_curso_modalidade_v2 |
| `fn_professor_curso_modalidade_impedir_sobreposicao_v1()` | ATIVA | DEFINER | trigger:professor_unidade_curso_modalidade.trg_professor_curso_modalidade_impedir_sobreposicao |
| `fn_professor_curso_modalidade_proteger_historico_v1()` | ATIVA | DEFINER | trigger:professor_unidade_curso_modalidade.trg_professor_curso_modalidade_proteger_historico |
| `fn_professor_do_usuario()` | ATIVA | DEFINER | view:vw_disponibilidade_professores, funcao:app_abrir_rascunho_manual, funcao:app_aluno_ficha, funcao:app_atualizar_fatia, funcao:app_atualizar_perfil, funcao:app_atualizar_preferencia_fabio, +54 outros |
| `fn_professor_ponto_canonicalizar_ocorrencia()` | ATIVA | DEFINER | trigger:professor_ponto_confirmacoes.trg_professor_ponto_canonicalizar_ocorrencia |
| `fn_professor_por_whatsapp(p_telefone text)` | SO-INTERNA | DEFINER | funcao:fabio_identidade_whatsapp |
| `fn_professor_usa_app(p_professor_id integer)` | ATIVA | INVOKER · 🔓 anon | view:vw_experimental_pendencia, view:vw_registro_pendencia |
| `fn_proteger_anotacoes_fabio()` | ATIVA | DEFINER | trigger:aulas_emusys.trg_proteger_anotacoes_fabio |
| `fn_proteger_decisao_humana_aula()` | ATIVA | DEFINER | trigger:aulas_emusys.trg_proteger_decisao_humana_aula |
| `fn_reagendamento_limpa_chamada_alunos()` | ATIVA | DEFINER | trigger:aulas_emusys.trg_reagendamento_limpa_chamada_alunos |
| `fn_registrar_conflito_presenca(p_aluno_presenca_id uuid, p_aluno_presenca_gemea_id uuid, p_chave text, p_tipo text, p_status_decisao text, p_origem_decisao text, p_status_contraparte text, p_origem_contraparte text, p_evidencia jsonb)` | SO-INTERNA | DEFINER | funcao:app_registrar_chamada_agenda, funcao:fn_sincronizar_gemeos_presenca, funcao:upsert_presenca_emusys_bruta |
| `fn_registrar_presenca_experimental(p_vinculo_id bigint, p_status text, p_respondido_por text, p_bruta_emusys text)` | SO-INTERNA | DEFINER | funcao:app_confirmar_registro_experimental, funcao:app_declarar_falta_experimental, funcao:fn_registrar_experimental_interno |
| `fn_registrar_presencas_core(p_aula_ancora_id integer, p_professor_id integer, p_alunos_ausentes integer[], p_respondido_por text, p_estrito boolean)` | SO-INTERNA | DEFINER | funcao:app_aplicar_comando_presenca_v1, funcao:app_registrar_presencas_aula |
| `fn_resolver_aula_da_experimental(p_unidade_id uuid, p_data date, p_nome_aluno text)` | ORFA | INVOKER | sem consumidor conhecido |
| `fn_responder_presenca_core(p_professor_id integer, p_registro_alvo_id uuid, p_presenca text)` | SO-INTERNA | DEFINER | funcao:app_responder_presenca, funcao:fabio_responder_presenca, funcao:fn_confirmar_registro_core |
| `fn_sincronizar_gemeos_presenca(p_aula_ancora_id integer)` | ATIVA | DEFINER | cron:reconciliar-gemeas-presenca-diario, funcao:fn_registrar_presencas_core, funcao:trg_sincronizar_gemeos_presenca |
| `fn_validar_comando_roster_reservado_v2(p_request_id uuid)` | SO-INTERNA | DEFINER | funcao:fn_aplicar_comando_presenca_core_v2 |
| `get_agenda_dia(p_data date, p_unidade_id uuid)` | ATIVA | INVOKER | front:src/components/App/Agenda/Chamada/ChamadaDia.tsx, funcao:fn_agenda_dia_legado_envelope_v1, funcao:get_agenda_dia_canonica_v2 |
| `get_agenda_dia_canonica_v2(p_data date, p_unidade_id uuid)` | SO-INTERNA | DEFINER | funcao:get_agenda_dia_v2 |
| `get_agenda_dia_v2(p_data date, p_unidade_id uuid)` | ATIVA | DEFINER | front:src/hooks/useAgendaDia.ts, funcao:get_agenda_semana_v2 |
| `get_agenda_semana(p_data_inicio date, p_unidade_id uuid)` | LEGADO | INVOKER | existe versao maior: get_agenda_semana_v2 — sem consumidor conhecido |
| `get_agenda_semana_v2(p_data_inicio date, p_unidade_id uuid)` | ATIVA | DEFINER | front:src/hooks/useAgendaSemana.ts |
| `get_carteira_professor_periodo_canonica(p_ano integer, p_mes integer, p_unidade_id uuid, p_data_inicio date, p_data_fim date)` | SO-INTERNA | INVOKER | funcao:get_health_score_professor_v3_carteira_periodo, funcao:get_health_score_professor_v3_totais_carteira_canonica_v1, funcao:get_hs_prof_v3_segmentadas_agregadas_base_20260803, funcao:get_hs_prof_v3_segmentadas_agregadas_before_snapshot_20260804, funcao:get_kpis_professor_periodo_canonico_base_20260711, funcao:get_kpis_turmas_canonicos_v1, +2 outros |
| `get_carteira_professor_periodo_detalhe_canonico_v1(p_ano integer, p_mes integer, p_unidade_id uuid, p_data_inicio date, p_data_fim date)` | SO-INTERNA | INVOKER | funcao:get_carteira_professor_periodo_canonica, funcao:get_health_score_professor_v3_capacidade_diagnostico, funcao:get_kpis_turmas_canonicos_v2, funcao:hs_v3_segmentos_detalhe_base_canonica |
| `get_carteira_professores(p_unidade_id uuid)` | ATIVA | INVOKER | front:src/components/App/Professores/TabCarteiraProfessores.tsx |
| `get_contagem_trancados_professores(p_unidade_id uuid)` | ATIVA | INVOKER | front:src/components/App/Professores/TabCarteiraProfessores.tsx |
| `get_dados_relatorio_coordenacao(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | INVOKER · 🔓 anon | funcao:gravar_snapshot_fechamento_mensal, funcao:preview_fechamento_mensal |
| `get_dados_relatorio_coordenacao_legado_20260711(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:get_dados_relatorio_coordenacao_pre_totais_20260711 |
| `get_dados_relatorio_coordenacao_pre_totais_20260711(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | INVOKER · 🔓 anon | funcao:get_dados_relatorio_coordenacao |
| `get_estrelas_matriculador_v1(p_solicitante_telefone text, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:mila_briefing_manha_v1, funcao:mila_fechamento_dia_v1 |
| `get_fabio_aulas_do_professor(p_unidade_id uuid, p_emusys_professor_id integer, p_data_aula date)` | ORFA | DEFINER | sem consumidor conhecido |
| `get_faltas_periodo(p_unidade_id uuid, p_data_inicio date, p_data_fim date)` | SO-INTERNA | DEFINER | funcao:maria_lareport_faltas_periodo |
| `get_faltas_periodo_canonico_v2(p_unidade_id uuid, p_data_inicio date, p_data_fim date)` | SO-INTERNA | DEFINER | funcao:get_faltas_periodo_v2 |
| `get_faltas_periodo_legado_v1(p_unidade_id uuid, p_data_inicio date, p_data_fim date)` | SO-INTERNA | DEFINER | funcao:get_faltas_periodo_v2 |
| `get_faltas_periodo_v2(p_unidade_id uuid, p_data_inicio date, p_data_fim date)` | ATIVA | DEFINER | front:src/components/App/SucessoCliente/hooks/useFaltasPeriodo.ts, front:src/lib/presencaPublicacao.test.ts, front:src/lib/presencaPublicacao.ts, funcao:get_faltas_periodo |
| `get_fator_demanda_professor_periodo_canonico_v1(p_ano integer, p_mes integer, p_unidade_id uuid, p_data_inicio date, p_data_fim date)` | SO-INTERNA | INVOKER | funcao:get_kpis_professor_periodo_canonico_v3 |
| `get_frequencia_aluno_canonica_v1(p_aluno_id integer)` | SO-INTERNA | DEFINER | funcao:calcular_health_score_aluno_v2_sombra |
| `get_frequencia_professor_periodo_canonica_v1(p_ano integer, p_mes integer, p_unidade_id uuid, p_data_inicio date, p_data_fim date)` | ATIVA | DEFINER | view:vw_health_score_professor_v3_parcial_operacional, funcao:get_frequencia_professor_periodo_publicavel_v1 |
| `get_frequencia_professor_periodo_publicavel_v1(p_ano integer, p_mes integer, p_unidade_id uuid, p_data_inicio date, p_data_fim date)` | SO-INTERNA | DEFINER | funcao:fabio_pente_fino_unidade, funcao:get_kpis_professor_periodo_canonico_v2 |
| `get_frequencia_unidade_canonica_batch_v1(p_unidade_id uuid)` | SO-INTERNA | DEFINER | funcao:get_situacao_alunos_sem_contrato_assinado_core_v1 |
| `get_health_score_prof_v3_metricas_base_20260728(p_competencia date, p_unidade_id uuid, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:get_health_score_professor_v3_conversao_mensal, funcao:get_hs_prof_v3_metricas_periodo_base_20260803 |
| `get_health_score_prof_v3_metricas_base_20260728_c95(p_competencia date, p_unidade_id uuid, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:get_health_score_prof_v3_metricas_base_20260728, funcao:get_hs_prof_v3_metricas_periodo_before_individual_fix_20260803 |
| `get_health_score_professor_v3_capacidade_diagnostico(p_competencia date, p_unidade_id uuid)` | SO-INTERNA | DEFINER | funcao:get_health_score_professor_v3_sinais |
| `get_health_score_professor_v3_carteira_periodo(p_competencia date, p_unidade_id uuid, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:get_health_score_professor_v3_numero_alunos_disponibilidade_raw |
| `get_health_score_professor_v3_comparacao_sombra(p_competencia date, p_unidade_id uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `get_health_score_professor_v3_config_ui()` | ATIVA | DEFINER | front:src/hooks/useHealthScoreProfessorV3Config.ts |
| `get_health_score_professor_v3_config_ui(p_competencia date)` | ATIVA | DEFINER | front:src/hooks/useHealthScoreProfessorV3Config.ts |
| `get_health_score_professor_v3_config_ui_pre_catalogo_v1()` | ORFA | DEFINER | sem consumidor conhecido |
| `get_health_score_professor_v3_consumidor_pedagogico(p_competencia date, p_unidade_id uuid, p_professor_id integer, p_periodicidade text)` | ORFA | DEFINER | sem consumidor conhecido |
| `get_health_score_professor_v3_conversao_ciclo(p_competencia date, p_unidade_id uuid)` | SO-INTERNA | DEFINER | funcao:get_health_score_professor_v3_metricas_periodo, funcao:get_hs_prof_v3_metricas_periodo_base_20260803, funcao:get_hs_prof_v3_metricas_periodo_before_individual_fix_20260803 |
| `get_health_score_professor_v3_conversao_mensal(p_competencia date, p_unidade_id uuid)` | SO-INTERNA | DEFINER | funcao:get_health_score_professor_v3_metricas_periodo, funcao:get_hs_prof_v3_metricas_periodo_before_individual_fix_20260803 |
| `get_health_score_professor_v3_metricas_periodo(p_competencia date, p_unidade_id uuid, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:get_hs_prof_v3_projecao_viva_base_20260803, funcao:get_hs_prof_v3_projecao_viva_before_presence_cycle_fix_20260803, funcao:materializar_health_score_professor_v3_periodo_impl_base_202607 |
| `get_health_score_professor_v3_metricas_periodo_base_20260719(p_competencia date, p_unidade_id uuid, p_periodicidade text)` | ORFA | DEFINER | sem consumidor conhecido |
| `get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(p_competencia date, p_config_id uuid, p_unidade_id uuid, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:get_health_score_prof_v3_metricas_base_20260728_c95, funcao:get_health_score_professor_v3_metricas_periodo, funcao:get_hs_prof_v3_projecao_viva_base_20260803, funcao:simular_health_score_professor_v3_config_pre_catalogo_v1 |
| `get_health_score_professor_v3_metricas_segmentadas_v1(p_competencia date, p_config_id uuid, p_unidade_id uuid, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:ativar_health_score_professor_v3_config_revisao_ciclo_aberto, funcao:fn_health_score_professor_v3_config_ui_competencia, funcao:get_health_score_professor_v3_config_ui_pre_catalogo_v1, funcao:hs_v3_segmentos_agregado_base_canonica, funcao:materializar_health_score_professor_v3_periodo_impl_base_202607, funcao:simular_health_score_professor_v3_config_pre_catalogo_v1 |
| `get_health_score_professor_v3_numero_alunos_disponibilidade(p_competencia date, p_unidade_id uuid, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:materializar_health_score_professor_v3_periodo_impl_pre_nota_di |
| `get_health_score_professor_v3_numero_alunos_disponibilidade_raw(p_competencia date, p_unidade_id uuid, p_periodicidade text)` | ORFA | DEFINER | sem consumidor conhecido |
| `get_health_score_professor_v3_performance(p_competencia date, p_unidade_id uuid)` | ATIVA | DEFINER | front:src/components/App/Dashboard/DashboardPage.tsx, funcao:enriquecer_relatorio_coordenacao_v2_comparabilidade, funcao:executar_health_score_professor_v3_escopo_diario, funcao:fingerprint_health_score_professor_v3_escopo, funcao:get_dados_relatorio_gerencial, funcao:get_health_score_professor_v3_sinais, +10 outros |
| `get_health_score_professor_v3_performance(p_competencia date, p_unidade_id uuid, p_periodicidade text)` | ATIVA | DEFINER | front:src/components/App/Dashboard/DashboardPage.tsx, funcao:enriquecer_relatorio_coordenacao_v2_comparabilidade, funcao:executar_health_score_professor_v3_escopo_diario, funcao:fingerprint_health_score_professor_v3_escopo, funcao:get_dados_relatorio_gerencial, funcao:get_health_score_professor_v3_sinais, +10 outros |
| `get_health_score_professor_v3_performance_base_comparabilidade(p_competencia date, p_unidade_id uuid, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:get_hs_prof_v3_performance_comp_legacy_20260803 |
| `get_health_score_professor_v3_performance_snapshot_v1(p_competencia date, p_unidade_id uuid, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:get_health_score_professor_v3_performance_snapshot_v2, funcao:get_health_score_professor_v3_performance_snapshot_v3 |
| `get_health_score_professor_v3_performance_snapshot_v2(p_competencia date, p_unidade_id uuid, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:get_health_score_professor_v3_snapshot_modal |
| `get_health_score_professor_v3_performance_snapshot_v3(p_competencia date, p_unidade_id uuid, p_periodicidade text)` | ATIVA | DEFINER | front:src/hooks/useHealthScoreProfessorV3Performance.ts |
| `get_health_score_professor_v3_permanencia_periodo_v2(p_competencia date, p_unidade_id uuid, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:get_health_score_professor_v3_metricas_periodo, funcao:get_relatorio_gerencial_ranking_mensal_canonico_v2 |
| `get_health_score_professor_v3_presenca_periodo_v2(p_competencia date, p_unidade_id uuid, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:get_health_score_professor_v3_metricas_periodo, funcao:get_hs_prof_v3_metricas_periodo_before_open_perf_opt_20260804 |
| `get_health_score_professor_v3_projecao_viva(p_competencia date, p_unidade_id uuid, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:get_health_score_professor_v3_projecao_viva_coerente |
| `get_health_score_professor_v3_projecao_viva_coerente(p_competencia date, p_unidade_id uuid, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:get_health_score_professor_v3_performance_base_comparabilidade, funcao:get_hs_prof_v3_performance_base_comp_legacy_20260803 |
| `get_health_score_professor_v3_sinais(p_competencia date, p_unidade_id uuid)` | SO-INTERNA | DEFINER | funcao:get_relatorio_coordenacao_canonico_v1_base_20260802 |
| `get_health_score_professor_v3_snapshot_modal(p_competencia date, p_unidade_id uuid, p_professor_id integer)` | ATIVA | DEFINER | front:src/hooks/useHealthScoreProfessorV3.ts, funcao:get_health_score_professor_v3_consumidor_pedagogico |
| `get_health_score_professor_v3_snapshot_modal(p_competencia date, p_unidade_id uuid, p_professor_id integer, p_periodicidade text)` | ATIVA | DEFINER | front:src/hooks/useHealthScoreProfessorV3.ts, funcao:get_health_score_professor_v3_consumidor_pedagogico |
| `get_health_score_professor_v3_snapshot_ui(p_competencia date, p_unidade_id uuid, p_professor_id integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `get_health_score_professor_v3_totais_carteira_canonica_v1(p_competencia date, p_unidade_id uuid, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:get_hs_prof_v3_segmentadas_agregadas_base_20260803, funcao:hs_v3_metricas_segmentadas_pre_cursos_pedagogicos_v1 |
| `get_heatmap_data(p_ano integer, p_metrica character varying)` | ATIVA | INVOKER · 🔓 anon | front:src/hooks/useSupabase.ts |
| `get_heatmap_totais(p_ano integer, p_metrica character varying)` | ATIVA | INVOKER · 🔓 anon | front:src/hooks/useSupabase.ts |
| `get_historico_aulas_aluno(p_aluno_id integer)` | ATIVA | INVOKER | front:src/components/App/Alunos/ModalFichaAluno.tsx |
| `get_hs_prof_v3_config_ui_base_20260803(p_competencia date)` | SO-INTERNA | DEFINER | funcao:get_health_score_professor_v3_config_ui |
| `get_hs_prof_v3_conversao_ciclo_base_20260803(p_competencia date, p_unidade_id uuid)` | SO-INTERNA | DEFINER | funcao:get_health_score_professor_v3_conversao_ciclo |
| `get_hs_prof_v3_metricas_periodo_base_20260803(p_competencia date, p_unidade_id uuid, p_periodicidade text)` | ORFA | DEFINER | sem consumidor conhecido |
| `get_hs_prof_v3_metricas_periodo_before_individual_fix_20260803(p_competencia date, p_unidade_id uuid, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:get_hs_prof_v3_metricas_periodo_before_temporal_fix_20260804 |
| `get_hs_prof_v3_metricas_periodo_before_open_perf_opt_20260804(p_competencia date, p_unidade_id uuid, p_periodicidade text)` | ORFA | DEFINER | sem consumidor conhecido |
| `get_hs_prof_v3_metricas_periodo_before_temporal_fix_20260804(p_competencia date, p_unidade_id uuid, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:get_hs_prof_v3_metricas_periodo_before_open_perf_opt_20260804 |
| `get_hs_prof_v3_performance_base_comp_legacy_20260803(p_competencia date, p_unidade_id uuid, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:get_health_score_professor_v3_performance_base_comparabilidade |
| `get_hs_prof_v3_performance_before_pillar_coverage_20260803(p_competencia date, p_unidade_id uuid, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:get_hs_prof_v3_performance_before_scope_fix_20260804 |
| `get_hs_prof_v3_performance_before_scope_fix_20260804(p_competencia date, p_unidade_id uuid, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:get_health_score_professor_v3_performance |
| `get_hs_prof_v3_performance_comp_legacy_20260803(p_competencia date, p_unidade_id uuid, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:get_hs_prof_v3_performance_payload_base_20260803 |
| `get_hs_prof_v3_performance_payload_base_20260803(p_competencia date, p_unidade_id uuid, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:get_hs_prof_v3_performance_before_pillar_coverage_20260803 |
| `get_hs_prof_v3_projecao_viva_base_20260803(p_competencia date, p_unidade_id uuid, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:get_hs_prof_v3_projecao_viva_before_presence_cycle_fix_20260803 |
| `get_hs_prof_v3_projecao_viva_before_presence_cycle_fix_20260803(p_competencia date, p_unidade_id uuid, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:get_health_score_professor_v3_projecao_viva |
| `get_hs_prof_v3_segmentadas_agregadas_base_20260803(p_competencia date, p_config_id uuid, p_unidade_id uuid, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:get_hs_prof_v3_segmentadas_agregadas_before_snapshot_20260804 |
| `get_hs_prof_v3_segmentadas_agregadas_before_snapshot_20260804(p_competencia date, p_config_id uuid, p_unidade_id uuid, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:get_health_score_professor_v3_metricas_segmentadas_agregadas_v1 |
| `get_hs_prof_v3_snapshot_modal_base_comparabilidade(p_competencia date, p_unidade_id uuid, p_professor_id integer, p_periodicidade text)` | ORFA | DEFINER | sem consumidor conhecido |
| `get_hs_prof_v3_snapshot_modal_legacy_20260803(p_competencia date, p_unidade_id uuid, p_professor_id integer, p_periodicidade text)` | ORFA | DEFINER | sem consumidor conhecido |
| `get_kpis_professor_periodo(p_ano integer, p_mes integer, p_unidade_id uuid, p_data_inicio date, p_data_fim date)` | ORFA | INVOKER | sem consumidor conhecido |
| `get_kpis_professor_periodo_base_legado_20260713(p_ano integer, p_mes integer, p_unidade_id uuid, p_data_inicio date, p_data_fim date)` | SO-INTERNA | INVOKER | funcao:get_kpis_professor_periodo_canonico_base_20260711 |
| `get_kpis_professor_periodo_canonico(p_ano integer, p_mes integer, p_unidade_id uuid, p_data_inicio date, p_data_fim date)` | SO-INTERNA | DEFINER | funcao:get_dados_relatorio_coordenacao, funcao:get_dados_relatorio_coordenacao_pre_totais_20260711, funcao:get_kpis_professor_periodo_canonico_v2 |
| `get_kpis_professor_periodo_canonico_base_20260711(p_ano integer, p_mes integer, p_unidade_id uuid, p_data_inicio date, p_data_fim date)` | SO-INTERNA | INVOKER | funcao:get_kpis_professor_periodo_canonico |
| `get_kpis_professor_periodo_canonico_v2(p_ano integer, p_mes integer, p_unidade_id uuid, p_data_inicio date, p_data_fim date)` | SO-INTERNA | DEFINER | funcao:get_health_score_professor_v3_comparacao_sombra, funcao:get_kpis_professor_periodo, funcao:get_kpis_professor_periodo_canonico_v3 |
| `get_kpis_professor_periodo_canonico_v3(p_ano integer, p_mes integer, p_unidade_id uuid, p_data_inicio date, p_data_fim date)` | ATIVA | DEFINER | front:src/lib/professoresKpisCanonicos.ts, funcao:get_dados_relatorio_gerencial, funcao:get_relatorio_gerencial_ranking_mensal_base_20260811034046, funcao:get_relatorio_gerencial_ranking_mensal_canonico_v2, funcao:get_relatorio_gerencial_ranking_mensal_v2, funcao:montar_relatorio_coordenacao_payload_v2, +1 outros |
| `get_kpis_turmas_canonicos_v1(p_ano integer, p_mes integer, p_unidade_id uuid, p_data_inicio date, p_data_fim date)` | LEGADO | DEFINER | existe versao maior: get_kpis_turmas_canonicos_v2 — sem consumidor conhecido |
| `get_kpis_turmas_canonicos_v2(p_ano integer, p_mes integer, p_unidade_id uuid, p_data_inicio date, p_data_fim date)` | ATIVA | DEFINER | front:src/lib/turmasKpisCanonicos.ts, funcao:get_relatorio_gerencial_ranking_mensal_media_turma_canonico_v1 |
| `get_ocorrencias_mes(p_professor_id integer, p_unidade_id uuid, p_criterio_id integer, p_competencia character varying)` | ORFA | INVOKER · 🔓 anon | sem consumidor conhecido |
| `get_passagem_bastao_aluno(p_aluno_id integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `get_passagens_bastao_pendentes(p_professor_id integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `get_presenca_contexto_agente_canonico_v1(p_unidade_id uuid, p_data date, p_escopo text, p_professor_id integer)` | SO-INTERNA | DEFINER | funcao:fn_texto_relatorio_presenca_canonica_v2, funcao:get_presenca_contexto_agente_v1 |
| `get_presenca_contexto_agente_v1(p_unidade_id uuid, p_data date, p_escopo text, p_professor_id integer)` | ATIVA | DEFINER | edge:supabase/functions/bi-agent-lamusic/schema.ts, edge:supabase/functions/bi-agent-lamusic/tools.ts, edge:supabase/functions/gerar-plano-aluno/index.ts, edge:supabase/functions/gerar-relatorio-aluno/index.ts, edge:supabase/functions/processar-alertas-lia/index.ts, edge:supabase/functions/relatorio-admin-whatsapp/index.ts |
| `get_presenca_experimental_aluno_periodo_v1(p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_aluno_id integer)` | ATIVA | DEFINER | front:src/components/App/SucessoCliente/PresencaTab.tsx |
| `get_presenca_metricas_canonicas_v2(p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_professor_id integer, p_aluno_id integer)` | SO-INTERNA | DEFINER | funcao:get_faltas_periodo_canonico_v2, funcao:get_frequencia_professor_periodo_canonica_v1 |
| `get_presenca_ocorrencias_periodo_canonico_v2(p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_professor_id integer, p_aluno_id integer)` | SO-INTERNA | DEFINER | funcao:get_presenca_ocorrencias_periodo_v2 |
| `get_presenca_ocorrencias_periodo_legado_v1(p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_professor_id integer, p_aluno_id integer)` | SO-INTERNA | DEFINER | funcao:get_presenca_ocorrencias_periodo_v2 |
| `get_presenca_ocorrencias_periodo_v2(p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_professor_id integer, p_aluno_id integer)` | ATIVA | DEFINER | front:src/components/App/Professores/ModalDetalhesPresenca.tsx, front:src/components/App/SucessoCliente/ModalDetalhesSucessoAluno.tsx, front:src/components/App/SucessoCliente/PresencaTab.tsx |
| `get_presenca_previa_reparo_v2(p_unidade_id uuid, p_data_inicio date, p_data_fim date)` | ORFA | DEFINER | sem consumidor conhecido |
| `get_presenca_rollout_modo_v1(p_unidade_id uuid, p_superficie text)` | ORFA | DEFINER | sem consumidor conhecido |
| `get_presenca_shadow_comparacao_v2(p_unidade_id uuid, p_data_inicio date, p_data_fim date)` | ORFA | DEFINER | sem consumidor conhecido |
| `get_professor_carteira_ativa_tempo_v3_sombra(p_competencia date, p_unidade_id uuid)` | ORFA | DEFINER | sem consumidor conhecido |
| `get_professor_conversao_v3_sombra(p_competencia date, p_unidade_id uuid)` | SO-INTERNA | DEFINER | funcao:fn_materializar_health_score_professor_v3 |
| `get_professor_curso_modalidade_excecoes_v2(p_unidade_id uuid, p_professor_id integer, p_incluir_auditoria boolean)` | SO-INTERNA | DEFINER | funcao:ativar_health_score_professor_v3_config_pre_catalogo_v1, funcao:get_professor_curso_modalidade_excecoes_v3 |
| `get_professor_curso_modalidade_excecoes_v3(p_unidade_id uuid, p_professor_id integer, p_incluir_auditoria boolean)` | ATIVA | DEFINER | front:src/hooks/useProfessorCursoModalidadeReconciliacao.ts |
| `get_professor_curso_modalidade_reconciliacao_v1(p_unidade_id uuid, p_professor_id integer)` | SO-INTERNA | DEFINER | funcao:fn_health_score_professor_v3_config_ui_competencia, funcao:get_health_score_professor_v3_config_ui_pre_catalogo_v1 |
| `get_professor_media_turma_v3_sombra(p_competencia date, p_unidade_id uuid)` | SO-INTERNA | DEFINER | funcao:fn_materializar_health_score_professor_v3 |
| `get_professor_numero_alunos_v3_sombra(p_competencia date, p_unidade_id uuid)` | SO-INTERNA | DEFINER | funcao:fn_materializar_health_score_professor_v3 |
| `get_professor_permanencia_v3_sombra(p_competencia date, p_unidade_id uuid)` | SO-INTERNA | DEFINER | funcao:fn_materializar_health_score_professor_v3 |
| `get_professor_presenca_v3_sombra(p_competencia date, p_unidade_id uuid)` | SO-INTERNA | DEFINER | funcao:fn_materializar_health_score_professor_v3 |
| `get_professor_retencao_v3_governada(p_competencia date, p_unidade_id uuid, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:get_health_score_prof_v3_metricas_base_20260728_c95, funcao:get_health_score_professor_v3_metricas_periodo |
| `get_professor_retencao_v3_sombra(p_competencia date, p_unidade_id uuid)` | SO-INTERNA | DEFINER | funcao:fn_materializar_health_score_professor_v3 |
| `get_professores_divergencias_emusys(p_incluir_resolvidas boolean, p_unidade_id uuid)` | ATIVA | DEFINER | front:src/hooks/useProfessoresDivergencias.ts |
| `get_programa_fideliza_dados(p_ano integer, p_trimestre integer, p_unidade_id uuid)` | ATIVA | DEFINER | front:src/hooks/useFidelizaPrograma.ts, funcao:gravar_snapshot_fechamento_mensal, funcao:preview_fechamento_mensal |
| `get_programa_matriculador_dados(p_ano integer, p_unidade_id uuid)` | ATIVA | INVOKER · 🔓 anon | front:src/hooks/useMatriculadorPrograma.ts, funcao:gravar_snapshot_fechamento_mensal, funcao:preview_fechamento_mensal |
| `get_saidas_professor_periodo_agregadas_v1(p_ano integer, p_mes integer, p_unidade_id uuid, p_data_inicio date, p_data_fim date)` | SO-INTERNA | INVOKER | funcao:get_kpis_professor_periodo_canonico_v3 |
| `get_saidas_professor_periodo_canonicas_v1(p_ano integer, p_mes integer, p_unidade_id uuid, p_data_inicio date, p_data_fim date)` | ORFA | INVOKER | sem consumidor conhecido |
| `get_saidas_professor_periodo_detalhes_v1(p_professor_id integer, p_ano integer, p_mes integer, p_unidade_id uuid, p_data_inicio date, p_data_fim date)` | ATIVA | DEFINER | front:src/components/App/Professores/ModalDetalhesEvasoes.tsx, front:src/components/App/Professores/ModalDetalhesProfessorPerformance.tsx, front:src/components/App/Professores/ModalDetalhesRetencao.tsx |
| `grade_norm_curso(p text)` | SO-INTERNA | INVOKER · 🔓 anon | funcao:sincronizar_grade_horaria_alunos |
| `grade_norm_nome(p text)` | SO-INTERNA | INVOKER · 🔓 anon | funcao:sincronizar_grade_horaria_alunos |
| `hs_v3_metricas_segmentadas_pre_cursos_pedagogicos_v1(p_competencia date, p_config_id uuid, p_unidade_id uuid, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:get_health_score_professor_v3_metricas_segmentadas_v1 |
| `hs_v3_segmentos_agregado_base_canonica(p_competencia date, p_config_id uuid, p_unidade_id uuid, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:get_hs_prof_v3_segmentadas_agregadas_base_20260803, funcao:get_hs_prof_v3_segmentadas_agregadas_before_snapshot_20260804 |
| `hs_v3_segmentos_detalhe_base_canonica(p_competencia date, p_config_id uuid, p_unidade_id uuid, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:get_health_score_professor_v3_metricas_segmentadas_v1, funcao:hs_v3_metricas_segmentadas_pre_cursos_pedagogicos_v1 |
| `limpar_manifesto_periodos_obsoletos_v1()` | ATIVA | DEFINER | cron:cleanup-reconstrucao-professor-obsoleta |
| `limpar_professores_emusys_divergencias_obsoletas()` | ATIVA | DEFINER | edge:supabase/functions/sync-professores-emusys/index.ts |
| `listar_eventos_staging_particao_professor_v1(p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_versao_reconstrucao text, p_execucao_backfill_id uuid, p_total_particoes integer, p_particao_indice integer)` | ATIVA | DEFINER | edge:supabase/functions/reconstruir-periodos-professor/index.ts |
| `maria_lareport_faltas_periodo(p_unidade_id uuid, p_data_inicio date, p_data_fim date)` | ORFA | DEFINER | sem consumidor conhecido |
| `maria_lareport_professor_carteira(p_unidade_id uuid, p_professor_busca text, p_limit integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `maria_lareport_roi_professores_base(p_ano integer, p_mes integer)` | LEGADO | DEFINER | existe versao maior: maria_lareport_roi_professores_base_v2 — sem consumidor conhecido |
| `maria_lareport_roi_professores_base_v2(p_ano integer, p_mes integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `materializar_health_score_professor_v3(p_competencia date, p_config_versao integer, p_modo text)` | ORFA | DEFINER | sem consumidor conhecido |
| `materializar_health_score_professor_v3_escopo(p_competencia date, p_periodicidade text, p_escopo text, p_unidade_id uuid, p_professor_id integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `materializar_health_score_professor_v3_escopo_diario(p_competencia date, p_periodicidade text, p_escopo text, p_unidade_id uuid)` | SO-INTERNA | DEFINER | funcao:executar_health_score_professor_v3_escopo_diario |
| `materializar_health_score_professor_v3_periodo(p_competencia date, p_periodicidade text, p_unidade_id uuid, p_professor_id integer)` | SO-INTERNA | DEFINER | funcao:materializar_health_score_professor_v3_rede, funcao:materializar_hs_prof_v3_escopo_before_lock_order_20260813, funcao:reprocessar_health_score_professor_v3_competencia_aberta |
| `materializar_health_score_professor_v3_periodo_impl(p_competencia date, p_periodicidade text, p_unidade_id uuid, p_professor_id integer)` | SO-INTERNA | DEFINER | funcao:materializar_health_score_professor_v3_periodo |
| `materializar_health_score_professor_v3_periodo_impl_base_202607(p_competencia date, p_periodicidade text, p_unidade_id uuid, p_professor_id integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `materializar_health_score_professor_v3_periodo_impl_pre_nota_di(p_competencia date, p_periodicidade text, p_unidade_id uuid, p_professor_id integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `materializar_health_score_professor_v3_rede(p_competencia date, p_periodicidade text, p_professor_id integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `materializar_hs_prof_v3_escopo_before_lock_order_20260813(p_competencia date, p_periodicidade text, p_escopo text, p_unidade_id uuid, p_professor_id integer)` | SO-INTERNA | DEFINER | funcao:materializar_health_score_professor_v3_escopo |
| `materializar_hs_v3_periodo_impl_pre_guard_20260802(p_competencia date, p_periodicidade text, p_unidade_id uuid, p_professor_id integer)` | SO-INTERNA | DEFINER | funcao:materializar_health_score_professor_v3_periodo_impl |
| `materializar_periodos_professor_v1(p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_versao_reconstrucao text, p_entrada_hash text, p_periodos jsonb, p_diagnosticos jsonb, p_execucao_backfill_id uuid, p_total_eventos integer, p_parametros jsonb)` | ATIVA | DEFINER | edge:supabase/functions/reconstruir-periodos-professor/index.ts, funcao:finalizar_reconstrucao_particionada_professor_v1 |
| `montar_relatorio_coordenacao_payload_v2(p_unidade_id uuid, p_ano integer, p_mes integer)` | SO-INTERNA | DEFINER | funcao:capturar_relatorio_coordenacao_canonico_v2, funcao:get_relatorio_coordenacao_canonico_v2 |
| `montar_relatorio_coordenacao_payload_v3(p_unidade_id uuid, p_ano integer, p_mes integer, p_periodicidade text)` | SO-INTERNA | DEFINER | funcao:get_relatorio_coordenacao_canonico_v3 |
| `normalizar_health_score_professor_v3_meta_viva(p_metrica text, p_valor_bruto numeric, p_meta numeric, p_nota_segmentada numeric)` | SO-INTERNA | INVOKER | funcao:get_health_score_professor_v3_projecao_viva_coerente |
| `passagem_bastao_is_admin()` | SO-INTERNA | DEFINER | funcao:dispensar_passagem_bastao, funcao:get_passagem_bastao_aluno, funcao:get_passagens_bastao_pendentes, funcao:responder_passagem_bastao |
| `passagem_bastao_is_professor(p_professor_id integer)` | SO-INTERNA | DEFINER | funcao:dispensar_passagem_bastao, funcao:get_passagem_bastao_aluno, funcao:get_passagens_bastao_pendentes, funcao:responder_passagem_bastao |
| `pode_sincronizar_presenca_emusys_v1(p_unidade_id uuid, p_acao text)` | ATIVA | DEFINER | edge:supabase/functions/_shared/sync-presenca-authorization.ts |
| `preparar_manifesto_reconstrucao_professor_v1(p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_versao_reconstrucao text, p_execucao_backfill_id uuid, p_total_particoes integer)` | ATIVA | DEFINER | edge:supabase/functions/reconstruir-periodos-professor/index.ts |
| `presenca_sync_backlog_janela_v1(p_data_base date)` | ATIVA | INVOKER | cron:sync-presenca-backlog-barra, cron:sync-presenca-backlog-campo-grande, cron:sync-presenca-backlog-recreio |
| `presenca_sync_finalizar_v1(p_run_id uuid, p_status text, p_snapshot_hash text, p_contagens jsonb, p_erro_codigo text)` | ATIVA | DEFINER | edge:supabase/functions/_shared/presenca-sync-run.ts |
| `presenca_sync_heartbeat_v1(p_run_id uuid, p_contagens jsonb)` | ATIVA | DEFINER | edge:supabase/functions/_shared/presenca-sync-run.ts |
| `presenca_sync_iniciar_v1(p_unidade_id uuid, p_modo text, p_data_alvo date, p_request_id uuid, p_lease_segundos integer)` | ATIVA | DEFINER | edge:supabase/functions/_shared/presenca-sync-run.ts |
| `promover_periodos_professor_ativos_exatos_v2(p_dry_run boolean)` | ATIVA | DEFINER | cron:promover-periodos-professor-ativos-exatos |
| `promover_troca_de_curso_mesmo_professor_v1(p_dry_run boolean)` | ATIVA | DEFINER | cron:promover-periodos-professor-ativos-exatos |
| `reclassificar_health_score_professor_v3_config_aberta(p_competencia date, p_periodicidade text, p_escopo text, p_unidade_id uuid, p_justificativa text)` | ORFA | DEFINER | sem consumidor conhecido |
| `reconciliar_grade_aluno_v2(p_aluno_emusys_id bigint, p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_ids_vivos integer[], p_dry_run boolean)` | ATIVA | DEFINER | edge:supabase/functions/reconciliar-grade-aluno/index.ts |
| `reconciliar_grade_snapshot_emusys_core_v3(p_run_id uuid, p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_snapshot jsonb, p_dry_run boolean)` | SO-INTERNA | DEFINER | funcao:reconciliar_grade_snapshot_emusys_core_v4 |
| `reconciliar_grade_snapshot_emusys_core_v4(p_run_id uuid, p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_snapshot jsonb, p_dry_run boolean)` | SO-INTERNA | DEFINER | funcao:reconciliar_grade_snapshot_emusys_v1, funcao:reconciliar_grade_snapshot_emusys_v2 |
| `reconciliar_grade_snapshot_emusys_v1(p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_snapshot jsonb, p_dry_run boolean)` | ATIVA | DEFINER | edge:supabase/functions/_shared/reconciliacao-grade-snapshot.test.ts, edge:supabase/functions/_shared/reconciliacao-grade-snapshot.ts |
| `reconciliar_grade_snapshot_emusys_v1_base(p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_snapshot jsonb, p_dry_run boolean)` | ORFA | DEFINER | sem consumidor conhecido |
| `reconciliar_grade_snapshot_emusys_v2(p_sync_run_id uuid, p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_snapshot jsonb, p_dry_run boolean)` | ATIVA | DEFINER | edge:supabase/functions/_shared/reconciliacao-grade-snapshot.test.ts, edge:supabase/functions/_shared/reconciliacao-grade-snapshot.ts |
| `reconciliar_health_score_professor_v3_alertas()` | ATIVA | DEFINER | cron:reconciliar-health-score-professor-v3-alertas, funcao:configurar_health_score_professor_v3_cron_escopos, funcao:executar_health_score_professor_v3_job_escopo |
| `reconciliar_professor_curso_modalidade_v1(p_data_referencia date)` | LEGADO | DEFINER | existe versao maior: reconciliar_professor_curso_modalidade_v2 — sem consumidor conhecido |
| `reconciliar_professor_curso_modalidade_v2(p_execucao_id uuid)` | SO-INTERNA | DEFINER | funcao:finalizar_sync_professor_disciplinas_emusys_v1 |
| `registrar_aula_fabio(p_aula_id integer, p_texto text, p_origem text, p_professor_id integer, p_modo text)` | SO-INTERNA | DEFINER | funcao:fabio_corrigir_registro_confirmado, funcao:fn_confirmar_registro_core |
| `registrar_pagina_backfill_historico_professor_v1(p_execucao_id uuid, p_janela_inicio date, p_janela_fim date, p_cursor_esperado text, p_aulas jsonb, p_proximo_cursor text, p_tem_mais boolean, p_proxima_janela_inicio date, p_proxima_janela_fim date, p_requisicoes_realizadas integer)` | ATIVA | DEFINER | edge:supabase/functions/backfill-historico-professor-emusys/index.ts |
| `registrar_particao_periodos_professor_v1(p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_versao_reconstrucao text, p_execucao_backfill_id uuid, p_total_particoes integer, p_particao_indice integer, p_entrada_hash text, p_periodos jsonb, p_diagnosticos jsonb, p_total_eventos integer, p_total_particoes_logicas integer, p_parametros jsonb)` | ATIVA | DEFINER | edge:supabase/functions/reconstruir-periodos-professor/index.ts |
| `registrar_penalidade_fideliza(p_ano integer, p_trimestre integer, p_unidade_id uuid, p_tipo character varying, p_descricao text, p_pontos integer, p_data_ocorrencia date, p_registrado_por character varying)` | ATIVA | DEFINER | front:src/hooks/useFidelizaPrograma.ts |
| `registrar_penalidade_matriculador(p_ano integer, p_unidade_id uuid, p_tipo character varying, p_descricao text, p_pontos integer, p_data_ocorrencia date, p_registrado_por character varying)` | ATIVA | DEFINER | front:src/hooks/useMatriculadorPrograma.ts |
| `registrar_transicao_professor_v3(p_contexto jsonb)` | ATIVA | DEFINER | edge:supabase/functions/processar-matricula-emusys/index.ts |
| `reprocessar_health_score_professor_v3_competencia_aberta(p_competencia date, p_periodicidade text, p_escopo text, p_unidade_id uuid, p_professor_id integer)` | ORFA | DEFINER | sem consumidor conhecido |
| `resolver_health_score_professor_v3_capacidade(p_capacidade_turma integer, p_capacidade_sala integer, p_capacidade_curso integer, p_capacidade_segmento numeric)` | SO-INTERNA | INVOKER | funcao:get_health_score_professor_v3_capacidade_diagnostico |
| `resolver_health_score_v3_media_turma_individual(p_detalhes jsonb, p_numerador_configurado numeric, p_denominador_configurado numeric)` | SO-INTERNA | INVOKER | funcao:get_health_score_professor_v3_metricas_periodo, funcao:get_hs_prof_v3_metricas_periodo_before_temporal_fix_20260804 |
| `resolver_pendencias_conciliacao_fora_escopo_operacional(p_unidade_id uuid)` | ATIVA | DEFINER | edge:supabase/functions/sync-matriculas-emusys/index.ts |
| `responder_passagem_bastao(p_id uuid, p_texto text, p_audio_url text)` | ORFA | DEFINER · 🔓 anon | sem consumidor conhecido |
| `restaurar_ocorrencia(p_ocorrencia_id integer, p_usuario_id uuid, p_usuario_nome character varying, p_justificativa text)` | ATIVA | DEFINER | front:src/hooks/useProfessor360.ts |
| `retificar_health_score_professor_v3(p_snapshot_id uuid, p_config_versao integer, p_justificativa text)` | ORFA | DEFINER | sem consumidor conhecido |
| `retirar_do_roster_health_score_v3_ciclo(p_ciclo_codigo text, p_professor_id integer, p_unidade_id uuid, p_motivo text)` | ORFA | DEFINER · 🔓 anon | sem consumidor conhecido |
| `reverter_ocorrencia(p_ocorrencia_id integer, p_usuario_id uuid, p_usuario_nome character varying, p_justificativa text)` | ATIVA | DEFINER | front:src/hooks/useProfessor360.ts |
| `salvar_health_score_professor_v3_config_rascunho(p_config_id uuid, p_vigencia_inicio date, p_justificativa text, p_metricas jsonb)` | SO-INTERNA | DEFINER | funcao:salvar_health_score_professor_v3_config_rascunho_v2 |
| `salvar_health_score_professor_v3_config_rascunho(p_config_id uuid, p_vigencia_inicio date, p_justificativa text, p_metricas jsonb, p_metas_segmentadas jsonb)` | SO-INTERNA | DEFINER | funcao:salvar_health_score_professor_v3_config_rascunho_v2 |
| `salvar_health_score_professor_v3_config_rascunho_pre_oferta_for(p_config_id uuid, p_vigencia_inicio date, p_justificativa text, p_metricas jsonb, p_metas_segmentadas jsonb)` | ORFA | DEFINER | sem consumidor conhecido |
| `salvar_health_score_professor_v3_config_rascunho_v2(p_config_id uuid, p_vigencia_inicio date, p_justificativa text, p_metricas jsonb, p_metas_segmentadas jsonb, p_cobertura_minima numeric, p_pilares_minimos integer, p_exige_pilar_fidelizacao boolean)` | ATIVA | DEFINER | front:src/hooks/useHealthScoreProfessorV3Config.ts |
| `salvar_health_score_v3_config_pre_cursos_pedagogicos_v1(p_config_id uuid, p_vigencia_inicio date, p_justificativa text, p_metricas jsonb, p_metas_segmentadas jsonb)` | SO-INTERNA | DEFINER | funcao:salvar_health_score_professor_v3_config_rascunho |
| `salvar_historico_trimestral_fideliza(p_ano integer, p_trimestre integer)` | ATIVA | DEFINER | front:src/hooks/useFidelizaPrograma.ts |
| `salvar_professor_curso_modalidade_atribuicoes_v1(p_professor_id integer, p_atribuicoes jsonb, p_justificativa text)` | ORFA | DEFINER | sem consumidor conhecido |
| `simular_health_score_professor_v3_config(p_config_id uuid, p_competencia date)` | ATIVA | DEFINER | front:src/hooks/useHealthScoreProfessorV3Config.ts |
| `simular_health_score_professor_v3_config_pre_catalogo_v1(p_config_id uuid, p_competencia date)` | SO-INTERNA | DEFINER | funcao:simular_health_score_professor_v3_config |
| `sincronizar_grade_horaria_alunos()` | ATIVA | DEFINER | edge:supabase/functions/sync-presenca-emusys/index.ts, cron:sincronizar-grade-horaria |
| `trg_atualiza_projecao_por_reposicao()` | ATIVA | DEFINER · 🔓 anon | trigger:aluno_reposicoes.trg_atualiza_projecao_por_reposicao |
| `trg_fabio_fila_dispara()` | ATIVA | DEFINER | trigger:fabio_fila_audios.trg_fabio_fila_novo, funcao:fn_fabio_retry_fila |
| `trg_professor_presente_quando_aluno_presente()` | ATIVA | INVOKER · 🔓 anon | trigger:aluno_presenca.trg_professor_presente_quando_aluno_presente |
| `trg_sincronizar_gemeos_presenca()` | ATIVA | DEFINER | trigger:aluno_presenca.trg_sincronizar_gemeos_presenca |
| `update_config_health_score_professor_updated_at()` | ATIVA | INVOKER · 🔓 anon | trigger:config_health_score_professor.trigger_update_config_health_score_professor |
| `update_pendencias_updated_at()` | ATIVA | INVOKER · 🔓 anon | trigger:inventario_pendencias.trg_pendencias_updated_at |
| `upsert_presenca_emusys_bruta(p_aluno_id integer, p_aula_emusys_id integer, p_professor_id integer, p_unidade_id uuid, p_data_aula date, p_horario_aula time without time zone, p_status_origem text, p_curso_nome text, p_turma_nome text, p_sala_nome text, p_sincronizado_em timestamp with time zone)` | ATIVA | DEFINER | edge:supabase/functions/sync-presenca-emusys/index.ts |
| `validar_token_sync_grade_interno_v1(p_token text)` | ATIVA | DEFINER | edge:supabase/functions/sync-grade-futura-emusys/index.ts |
| `validar_token_sync_presenca_interno_v1(p_token text)` | ATIVA | DEFINER | edge:supabase/functions/classificar-resposta-evasao/index.ts, edge:supabase/functions/enviar-agradecimento-evasao/index.ts, edge:supabase/functions/processar-fila-repescagem-evasao/index.ts, edge:supabase/functions/sync-presenca-emusys/index.ts |

