-- Health Score Professor V3 - cobre a FK composta dos segmentos de snapshot.

create index if not exists
  idx_health_score_professor_v3_snapshot_segmentos_config_meta_escopo
  on public.health_score_professor_v3_snapshot_metrica_segmentos (
    config_meta_segmento_id,
    unidade_id,
    curso_id,
    modalidade
  )
  where config_meta_segmento_id is not null;

