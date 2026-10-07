-- email_google: a conta Google do professor, usada pela recital-sheets-sync para
-- compartilhar a planilha dele (leitor) na pasta do Drive. O campo vive em
-- `professores` (nao em usuarios) porque a maioria dos professores nao tem conta
-- de usuario — e os que tem usam login sintetico @la.internal, que o Drive nao
-- aceita como destino de compartilhamento.
alter table public.professores
  add column if not exists email_google text;

comment on column public.professores.email_google is
  'Conta Google (Gmail/Workspace) do professor — destino do compartilhamento da planilha do recital. Preenchido pela coordenacao.';
