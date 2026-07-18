-- Health Score Professor V3 - meta de permanencia aprovada em sombra.
-- A decisao registra > 12 meses como regra operacional, sem ativar a V3
-- e sem alterar consumidores produtivos.

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
  set meta = 12,
      parametros = (
        coalesce(parametros, '{}'::jsonb)
        - 'meta_status'
        - 'meta_justificativa'
        - 'meta_autoridade'
        - 'meta_aprovada_em'
        - 'meta_comparador_operacional'
        - 'meta_regra_exibicao'
        - 'meta_evidencia'
        - 'meta_distribuicao_referencia'
      ) || jsonb_build_object(
        'meta_status', 'aprovada',
        'meta_justificativa', 'Historico Emusys 2018-2026 auditado no grao professor-unidade-matricula-disciplina; Peterson e amostra ampliada de 12 professores validaram a reconstrucao; P75 da rede publicavel = 12,01 meses.',
        'meta_autoridade', 'Alf',
        'meta_aprovada_em', '2026-07-18',
        'meta_comparador_operacional', '>',
        'meta_regra_exibicao', '> 12 meses',
        'meta_evidencia', 'docs/auditorias/2026-07-18-permanencia-amostra-12-professores.md',
        'meta_distribuicao_referencia', jsonb_build_object(
          'linhas_publicaveis', 55,
          'p50_meses', 10.36,
          'p75_meses', 12.01,
          'p90_meses', 14.576
        )
      ),
      atualizado_em = now()
  where config_id = v_config_id
    and metrica = 'permanencia';

  get diagnostics v_linhas = row_count;
  if v_linhas <> 1 then
    raise exception 'HEALTH_SCORE_V3_CONFIG_INVALIDA: esperada 1 metrica de permanencia, encontradas %', v_linhas;
  end if;
end;
$$;
