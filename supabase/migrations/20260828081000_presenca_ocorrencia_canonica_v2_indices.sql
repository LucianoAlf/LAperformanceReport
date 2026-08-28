-- Indices aditivos para limitar a leitura canonica por aula, unidade e data.
-- Nenhum consumidor, dado ou flag de rollout e alterado nesta etapa.

create index if not exists idx_aluno_presenca_aula_emusys_unidade_v2
  on public.aluno_presenca (aula_emusys_id, unidade_id)
  where aula_emusys_id is not null;

create index if not exists idx_aluno_presenca_unidade_data_v2
  on public.aluno_presenca (unidade_id, data_aula);

create index if not exists idx_aulas_emusys_slot_data_divergente_v2
  on public.aulas_emusys (unidade_id, id)
  where data_aula is distinct from
    ((data_hora_inicio at time zone 'America/Sao_Paulo')::date);

comment on index public.idx_aluno_presenca_aula_emusys_unidade_v2 is
  'Lookup bounded da evidencia ligada ao snapshot Emusys por aula e unidade.';
comment on index public.idx_aluno_presenca_unidade_data_v2 is
  'Lookup bounded da evidencia manual/orfa por unidade e data operacional.';
comment on index public.idx_aulas_emusys_slot_data_divergente_v2 is
  'Guarda indexada dos raros slots cuja data redundante diverge do inicio real.';
