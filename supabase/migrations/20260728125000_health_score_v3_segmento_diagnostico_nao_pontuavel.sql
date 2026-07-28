begin;

alter table public.health_score_professor_v3_snapshot_metrica_segmentos
  drop constraint
    health_score_professor_v3_snapshot_metrica_se_estado_base_check;

alter table public.health_score_professor_v3_snapshot_metrica_segmentos
  add constraint
    health_score_professor_v3_snapshot_metrica_se_estado_base_check
  check (
    estado_base = any (
      array[
        'ok'::text,
        'sem_base_zero_carteira'::text,
        'sem_base_sem_meta'::text,
        'sem_base_sem_turmas'::text,
        'regra_ausente'::text,
        'segmentacao_incompleta'::text,
        'nao_ofertada'::text,
        'divergencia_nao_ofertada'::text,
        'diagnostico_nao_pontuavel'::text
      ]
    )
  )
  not valid;

alter table public.health_score_professor_v3_snapshot_metrica_segmentos
  validate constraint
    health_score_professor_v3_snapshot_metrica_se_estado_base_check;

comment on constraint
  health_score_professor_v3_snapshot_metrica_se_estado_base_check
  on public.health_score_professor_v3_snapshot_metrica_segmentos is
  'Estados auditaveis do segmento; diagnostico_nao_pontuavel permanece visivel sem bloquear ou pontuar.';

commit;
