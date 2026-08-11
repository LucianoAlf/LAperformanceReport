-- Marca, na jornada, qual linha e o ciclo VIGENTE de uma matricula-disciplina.
--
-- O Emusys, a cada renovacao, CRIA uma matricula_disciplina nova para o novo ciclo
-- e mantem a mesma matricula. A antiga deixa de vir em GET /matriculas (o endpoint
-- so devolve `contrato_atual`), e o nosso sync -- que so faz upsert do que a API
-- mandou -- nunca a encerra. Resultado: as duas linhas ficam status_matricula='ativa'
-- e nada distingue qual vale.
--
-- Medido em 2026-08-10: 59 pares na rede (Recreio 39, Barra 8, CG 8). 59/59 do mesmo
-- `emusys_disciplina_id`, 59/59 com a nova terminando depois, 56/59 com a antiga de
-- sync congelado. 57 das 59 antigas vencem em <= 60 dias, ou seja, caem direto na aba
-- Administrativo -> Contratos, que passou a listar contrato JA RENOVADO como se
-- estivesse vencendo (Barra mostrava 16 onde o Emusys mostra 11).
--
-- Coluna ADITIVA de proposito: nenhum consumidor le, entao nada muda de comportamento
-- ate que uma view/consulta escolha filtrar por ela. Ha 20+ consumidores da jornada
-- (vw_jornada_aluno_atual, carteira do professor, agenda, health score...); trocar
-- `status_matricula` mudaria todos de uma vez.
--
-- ⚠️ O filtro deve ser aplicado em vw_contratos_vencendo, NAO em vw_jornada_aluno_atual.
-- A segunda e lida por todo o resto do sistema.

alter table public.aluno_jornada_matricula_disciplina
  add column if not exists sucedida_por bigint,
  add column if not exists sucedida_em  timestamptz;

comment on column public.aluno_jornada_matricula_disciplina.sucedida_por is
  'emusys_matricula_disciplina_id do ciclo que substituiu esta linha (renovacao). '
  'NULL = ciclo vigente. Preenchido pelo trigger trg_jornada_ciclo_sucedido. '
  'A linha NAO e apagada: ela e o historico do ciclo anterior, igual ao seletor de '
  'contratos da tela do Emusys.';

comment on column public.aluno_jornada_matricula_disciplina.sucedida_em is
  'Quando a sucessao foi anotada por aqui (nao e a data da renovacao no Emusys).';

-- Serve a busca do trigger: dado (unidade, matricula, disciplina), achar as linhas
-- anteriores ainda nao marcadas. Parcial para ficar pequeno -- a esmagadora maioria
-- das linhas nunca sera sucedida.
create index if not exists idx_jornada_ciclo_vigente
  on public.aluno_jornada_matricula_disciplina
     (unidade_id, emusys_matricula_id, emusys_disciplina_id, emusys_matricula_disciplina_id)
  where sucedida_por is null;
