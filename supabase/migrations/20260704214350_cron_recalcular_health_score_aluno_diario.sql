SELECT cron.schedule(
  'recalcular-health-score-alunos-diario',
  '0 4 * * *', -- 04:00 UTC = 01:00 BRT, roda apos sync-presenca (~23:52 UTC) e sync-matriculas (~2:40 UTC)
  $$SELECT calcular_health_score_alunos_batch(NULL);$$
);
