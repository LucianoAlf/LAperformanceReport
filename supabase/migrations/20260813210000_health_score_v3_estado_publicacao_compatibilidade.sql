begin;

-- O read model V3 e o snapshot reader ja usam os estados de competencia viva
-- e de ciclo em acompanhamento. A restricao criada no contrato de julho,
-- porem, aceitava apenas estados publicados/finais e fazia a materializacao
-- falhar antes de gravar qualquer retrato.
alter table public.health_score_professor_v3_snapshots
  drop constraint if exists health_score_professor_v3_snapshot_estado_publicacao_chk;

alter table public.health_score_professor_v3_snapshots
  add constraint health_score_professor_v3_snapshot_estado_publicacao_chk
  check (estado_publicacao in (
    'parcial',
    'oficial',
    'sem_base',
    'em_andamento',
    'ciclo_em_acompanhamento'
  ));

comment on constraint health_score_professor_v3_snapshot_estado_publicacao_chk
  on public.health_score_professor_v3_snapshots is
  'Estados de publicacao: parcial, oficial, sem_base, em_andamento e ciclo_em_acompanhamento.';

commit;
