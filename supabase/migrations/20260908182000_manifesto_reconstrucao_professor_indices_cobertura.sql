-- O plano do manifesto lia centenas de milhares de linhas largas do staging e
-- depois fazia milhares de buscas no heap de aulas. Estes indices carregam
-- somente as colunas exigidas pelo preparo particionado e permitem leitura
-- index-only depois do VACUUM rotineiro.

create index if not exists idx_aula_alunos_historico_manifesto_cover
  on public.emusys_aula_alunos_historico_staging_v1 (
    unidade_id,
    aula_staging_id
  )
  include (id, emusys_aluno_id, aluno_id);

create index if not exists idx_aulas_historico_manifesto_cover
  on public.emusys_aulas_historico_staging_v1 (
    unidade_id,
    id
  )
  include (data_hora_inicio);

analyze public.emusys_aula_alunos_historico_staging_v1;
analyze public.emusys_aulas_historico_staging_v1;
