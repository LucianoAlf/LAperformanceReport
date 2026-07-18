-- Health Score Professor V3 - permanencia sem meta enquanto a origem historica for parcial.
-- A API de aulas de Campo Grande nao devolveu eventos anteriores a 2018; portanto,
-- calibracao e publicacao ficam bloqueadas ate existir fonte historica complementar.

update public.health_score_professor_v3_config_metricas
set parametros = jsonb_set(
      jsonb_set(
        coalesce(parametros, '{}'::jsonb),
        '{meta_status}',
        '"bloqueada_historico_incompleto"'::jsonb,
        true
      ),
      '{meta_justificativa}',
      to_jsonb(
        'A origem nao cobre o inicio integral da historia de todos os professores; permanencia parcial nao pode calibrar meta nem virar KPI oficial.'::text
      ),
      true
    ),
    atualizado_em = now()
where metrica = 'permanencia'
  and meta is null;
