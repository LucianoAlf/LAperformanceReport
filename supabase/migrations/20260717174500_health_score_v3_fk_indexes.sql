-- Gate 5: indices de apoio para as FKs da configuracao e dos snapshots.
-- Mantem a camada em sombra sem alterar consumidores produtivos.

create index if not exists idx_health_score_professor_v3_config_criado_por
  on public.health_score_professor_v3_config_versoes (criado_por);

create index if not exists idx_health_score_professor_v3_config_ativado_por
  on public.health_score_professor_v3_config_versoes (ativado_por);

create index if not exists idx_health_score_professor_v3_snapshots_config_id
  on public.health_score_professor_v3_snapshots (config_id);

create index if not exists idx_health_score_professor_v3_snapshots_unidade_id
  on public.health_score_professor_v3_snapshots (unidade_id);

create index if not exists idx_health_score_professor_v3_snapshots_anterior_id
  on public.health_score_professor_v3_snapshots (snapshot_anterior_id);

create index if not exists idx_health_score_professor_v3_snapshots_criado_por
  on public.health_score_professor_v3_snapshots (criado_por);
