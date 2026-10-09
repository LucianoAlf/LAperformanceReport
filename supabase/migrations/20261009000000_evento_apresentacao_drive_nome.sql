-- 09/10/2026 -- nome com que o playback está hoje no Drive.
--
-- Reunião do recital (08/10): numerar os playbacks no Drive na ordem do bloco
-- ("B1-03 — Aluno — Curso.mp3"). A ordem muda quando a coordenação arrasta cartões
-- na grade DEPOIS do envio, então `recital-drive-sync` precisa saber com que nome o
-- arquivo ficou para renomear só quando a posição mudar. NULL = enviado antes desta
-- coluna existir (o próximo sync renomeia para o padrão numerado).
alter table public.evento_apresentacao add column if not exists drive_nome text;
comment on column public.evento_apresentacao.drive_nome is
  'Nome atual do playback no Drive, gravado por recital-drive-sync. Muda quando a posição do número no bloco muda (renomeia no Drive).';
