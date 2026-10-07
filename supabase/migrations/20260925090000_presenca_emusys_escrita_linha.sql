-- Ajuste fino do livro de bordo apos a primeira varredura sombra:
-- aula_emusys_id segue a convencao de aluno_presenca (id INTERNO de
-- aulas_emusys, o que o gatilho carrega). O alvo real do PATCH no Emusys
-- (linha individual do aluno, ou a aula da ficha do professor) mora em
-- linha_emusys_id — e a chave do "marca nossa" em ultimaEscritaNossa.

alter table public.presenca_emusys_escrita
  add column if not exists linha_emusys_id integer;

comment on column public.presenca_emusys_escrita.aula_emusys_id is
  'Id INTERNO de aulas_emusys que o gatilho referencia (mesma convencao de aluno_presenca.aula_emusys_id).';

comment on column public.presenca_emusys_escrita.linha_emusys_id is
  'Id da aula no Emusys alvo do PATCH: alunos[].aula_id da linha individual para aluno; aula da ficha para professor. Nulo em pulos pre-GET.';

create index if not exists presenca_emusys_escrita_linha_aluno_ix
  on public.presenca_emusys_escrita (linha_emusys_id, aluno_id)
  where linha_emusys_id is not null;

create index if not exists presenca_emusys_escrita_linha_professor_ix
  on public.presenca_emusys_escrita (linha_emusys_id, professor_id)
  where linha_emusys_id is not null and professor_id is not null;
