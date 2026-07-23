-- Alinha a evidencia diagnostica aos estados que o motor segmentado ja emite.
-- Nao materializa, fecha ou publica snapshots.

alter table public.health_score_professor_v3_snapshot_metrica_diagnosticos
  drop constraint if exists
    health_score_professor_v3_snapshot_metrica_di_estado_base_check;

alter table public.health_score_professor_v3_snapshot_metrica_diagnosticos
  add constraint
    health_score_professor_v3_snapshot_metrica_di_estado_base_check
  check (
    estado_base in (
      'segmentacao_incompleta',
      'regra_ausente',
      'divergencia_nao_ofertada',
      'sem_base_sem_turmas',
      'sem_base_zero_carteira',
      'projeto_sem_segmento_pontuavel'
    )
  ) not valid;

alter table public.health_score_professor_v3_snapshot_metrica_diagnosticos
  validate constraint
    health_score_professor_v3_snapshot_metrica_di_estado_base_check;

comment on constraint
  health_score_professor_v3_snapshot_metrica_di_estado_base_check
  on public.health_score_professor_v3_snapshot_metrica_diagnosticos is
  'Estados diagnosticos emitidos pelo motor V3; nunca converte ausencia de base em zero.';
