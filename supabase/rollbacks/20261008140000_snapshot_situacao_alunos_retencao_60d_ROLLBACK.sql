-- ROLLBACK: definicao viva antes da migration (capturada 2026-10-08T10:56:43.761Z)
CREATE OR REPLACE FUNCTION public.refresh_situacao_alunos_snapshot(p_unidade_id uuid, p_referencia date DEFAULT CURRENT_DATE)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_count integer;
begin
  if current_user not in ('service_role', 'postgres')
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'papel nao autorizado para refresh de snapshot' using errcode = '42501';
  end if;

  delete from public.situacao_alunos_snapshot
  where unidade_id = p_unidade_id and referencia = p_referencia;

  insert into public.situacao_alunos_snapshot (
    unidade_id, referencia, pessoa_chave, aluno_id_canonico, aluno_ids_locais,
    nome, classificacao, status_operacional, matriculas_ativas, cursos,
    entrou_em, matricula_recente_em, responsavel_nome, professores, aulas_resumo,
    anamnese_preenchida, anamnese_em, anamnese_tipo, anamnese_flag_sem_registro,
    anamnese_orfa_candidata_id, anamnese_orfa_match, tem_instagram, instagram_nao_possui,
    tem_telefone, tem_responsavel, tem_foto, tem_data_contrato, contrato_vencido,
    cadastro_completo, cadastro_faltando, presenca_confirmadas, faltas_confirmadas,
    faltas_provaveis, chamadas_indeterminadas, presenca_taxa_geral, presenca_confianca,
    presenca_regra_versao, ultima_aula_em, dias_desde_ultima_aula, inadimplente,
    faturas_vencidas_abertas, em_aviso_previo, aviso_previo_mes_saida, proxima_renovacao_em,
    vence_em_30d, na_comunidade_wa, comunidade_status, comunidade_capturado_em,
    pendencias, fonte, regra_versao, contrato_assinatura_status, contratos_assinados_todos,
    contratos_relevantes, contratos_assinados, contratos_nao_assinados, contratos_sem_contrato,
    contratos_nao_verificados, contrato_status_observado_em, contrato_reconciliado_em,
    contrato_dado_fresco, atualizado_em
  )
  select p_unidade_id, p_referencia, c.pessoa_chave, c.aluno_id_canonico, c.aluno_ids_locais,
    c.nome, c.classificacao, c.status_operacional, c.matriculas_ativas, c.cursos,
    c.entrou_em, c.matricula_recente_em, c.responsavel_nome, c.professores, c.aulas_resumo,
    c.anamnese_preenchida, c.anamnese_em, c.anamnese_tipo, c.anamnese_flag_sem_registro,
    c.anamnese_orfa_candidata_id, c.anamnese_orfa_match, c.tem_instagram, c.instagram_nao_possui,
    c.tem_telefone, c.tem_responsavel, c.tem_foto, c.tem_data_contrato, c.contrato_vencido,
    c.cadastro_completo, c.cadastro_faltando, c.presenca_confirmadas, c.faltas_confirmadas,
    c.faltas_provaveis, c.chamadas_indeterminadas, c.presenca_taxa_geral, c.presenca_confianca,
    c.presenca_regra_versao, c.ultima_aula_em, c.dias_desde_ultima_aula, c.inadimplente,
    c.faturas_vencidas_abertas, c.em_aviso_previo, c.aviso_previo_mes_saida, c.proxima_renovacao_em,
    c.vence_em_30d, c.na_comunidade_wa, c.comunidade_status, c.comunidade_capturado_em,
    c.pendencias, c.fonte, c.regra_versao, c.contrato_assinatura_status, c.contratos_assinados_todos,
    c.contratos_relevantes, c.contratos_assinados, c.contratos_nao_assinados, c.contratos_sem_contrato,
    c.contratos_nao_verificados, c.contrato_status_observado_em, c.contrato_reconciliado_em,
    c.contrato_dado_fresco, now()
  from public._compute_situacao_alunos_v1(p_unidade_id, p_referencia, false) c;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$
;
