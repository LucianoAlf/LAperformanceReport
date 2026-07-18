-- Health Score Professor V3 - conclusao do Gate 5.
-- Homologa a meta trimestral de conversao e ativa a configuracao V1
-- exclusivamente para execucao em sombra. Nenhum consumidor V2 e alterado.

do $$
declare
  v_config_id uuid;
  v_linhas integer;
begin
  select c.id
    into v_config_id
  from public.health_score_professor_v3_config_versoes c
  where c.versao = 1
    and c.status = 'rascunho'
  for update;

  if v_config_id is null then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: versao 1 rascunho nao encontrada';
  end if;

  update public.health_score_professor_v3_config_metricas
  set meta = 70,
      parametros = (
        coalesce(parametros, '{}'::jsonb)
        - 'meta_status'
        - 'meta_justificativa'
        - 'meta_autoridade'
        - 'meta_aprovada_em'
        - 'meta_evidencia'
        - 'meta_distribuicao_referencia'
      ) || jsonb_build_object(
        'meta_status', 'aprovada',
        'meta_justificativa', 'Meta inicial de sombra arredondada a partir do P90 trimestral da coorte canonica de experimentais confirmadas por professor.',
        'meta_autoridade', 'Alf',
        'meta_aprovada_em', '2026-07-18',
        'meta_evidencia', 'docs/auditorias/2026-07-18-health-score-professor-v3-conversao-trimestral.md',
        'meta_distribuicao_referencia', jsonb_build_object(
          'recorte', '2026-Q2',
          'eventos_confirmados', 78,
          'matriculas_creditadas', 34,
          'taxa_rede', 43.59,
          'professores_com_eventos', 34,
          'professores_com_amostra_minima', 10,
          'p50', 41.43,
          'p75', 62.5025,
          'p90', 66.67,
          'meta_arredondada', 70
        )
      ),
      atualizado_em = now()
  where config_id = v_config_id
    and metrica = 'conversao';

  get diagnostics v_linhas = row_count;
  if v_linhas <> 1 then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: esperada 1 metrica de conversao, encontradas %', v_linhas;
  end if;

  perform public.ativar_health_score_professor_v3_config(
    v_config_id,
    'Gate 5 homologado por Alf em 2026-07-18. V1 ativa somente para sombra: pesos e metas versionados; retencao aguarda dados reais e presenca inicia em 2026-08-03. Nenhum consumidor V2 foi migrado.'
  );
end;
$$;
