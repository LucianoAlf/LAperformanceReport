-- "Se ta no Emusys trocado, troca aqui tambem" -- Alf, 10/08/2026. PARTE 1 de 2: a view.
--
-- Sobravam encerramentos em que a jornada do Emusys mostra o aluno ATIVO com OUTRO
-- professor. Isso e troca, nao saida: o aluno nao deixou a escola. Pela regra que o Hugo e o
-- Alf fecharam no CP8, troca nao penaliza -- mas esses vinculos estavam `publicavel=false`,
-- entao nao entravam nem no denominador. O professor perdia o aluno da conta inteira em vez
-- de manter o vinculo sem penalidade.
--
-- O ramo `promocao_automatica` de `publicavel` exigia `status_efetivo='ativo' AND
-- data_fim_efetiva IS NULL` -- desenhado so para vinculo vivo. Passa a aceitar tambem
-- encerramento cujo snapshot declare `tipo_fim` da familia `troca%`, com datas coerentes.
--
-- ⚠️ Nao penaliza ninguem: `encerramentos_penalizadores` e `encerramentos_pos_corte_pendentes`
-- filtram `coalesce(tipo_fim,'') not like 'troca%'` desde o CP8. Estes entram no denominador
-- E no numerador, subindo a retencao. Confirmado apos rodar a parte 2: penalizadores ficaram
-- em 114 (ciclo), 72 (set/25), 72 (fev/26) e 58 (jun/26) -- sem se mexer em nenhum periodo.
--
-- ⚠️ Esta migration sozinha NAO muda numero nenhum -- nenhuma troca foi promovida ainda. A
-- guarda no fim prova isso comparando a contagem de publicaveis antes e depois. Quem promove
-- e a PARTE 2 (`20260810222000_promove_troca_confirmada_pela_jornada.sql`).
--
-- ⚠️ O `pg_get_viewdef` normaliza e REMOVE o alias `pr.` do SELECT final. A primeira tentativa
-- desta migration abortou na guarda de unicidade por causa disso -- que e exatamente o
-- trabalho da guarda. Ancora abaixo copiada literal da saida do banco.
do $mig$
declare
  v_def text;
  v_novo text;
  v_de constant text :=
      'WHEN origem_revisao = ''promocao_automatica''::text AND decisao = ''aprovado''::text THEN professor_efetivo_id IS NOT NULL AND emusys_professor_efetivo_id IS NOT NULL AND emusys_matricula_disciplina_id IS NOT NULL AND emusys_disciplina_id IS NOT NULL AND status_efetivo = ''ativo''::text AND data_fim_efetiva IS NULL AND inicio_incompleto_efetivo IS FALSE AND jsonb_typeof(conflitos_efetivos) = ''array''::text AND jsonb_array_length(conflitos_efetivos) = 0';
  v_para constant text :=
      'WHEN origem_revisao = ''promocao_automatica''::text AND decisao = ''aprovado''::text THEN professor_efetivo_id IS NOT NULL AND emusys_professor_efetivo_id IS NOT NULL AND emusys_matricula_disciplina_id IS NOT NULL AND emusys_disciplina_id IS NOT NULL AND inicio_incompleto_efetivo IS FALSE AND jsonb_typeof(conflitos_efetivos) = ''array''::text AND jsonb_array_length(conflitos_efetivos) = 0 AND (status_efetivo = ''ativo''::text AND data_fim_efetiva IS NULL OR status_efetivo = ''encerrado''::text AND data_fim_efetiva IS NOT NULL AND data_fim_efetiva >= data_inicio_efetiva AND COALESCE(snapshot_posterior ->> ''tipo_fim''::text, ''''::text) ~~ ''troca%''::text)';
  v_antes int;
  v_depois int;
begin
  select count(*) filter (where publicavel) into v_antes
    from public.vw_professor_periodos_efetivos_v3_sombra;

  v_def := pg_get_viewdef('public.vw_professor_periodos_efetivos_v3_sombra'::regclass, true);

  if (length(v_def) - length(replace(v_def, v_de, ''))) / length(v_de) <> 1 then
    raise exception 'ABORTADO: ancora do ramo promocao_automatica nao bateu exatamente 1x';
  end if;

  v_novo := replace(v_def, v_de, v_para);
  execute 'create or replace view public.vw_professor_periodos_efetivos_v3_sombra as ' || v_novo;

  select count(*) filter (where publicavel) into v_depois
    from public.vw_professor_periodos_efetivos_v3_sombra;

  if v_depois <> v_antes then
    raise exception 'ABORTADO: publicaveis mudaram de % para % sem nenhuma promocao de troca',
      v_antes, v_depois;
  end if;

  raise notice 'view aceita troca confirmada; publicaveis seguem em %', v_antes;
end
$mig$;
