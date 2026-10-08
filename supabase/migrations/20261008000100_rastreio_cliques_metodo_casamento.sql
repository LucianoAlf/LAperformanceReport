-- Reserva por janela do rastreador de WhatsApp (07/10/2026).
--
-- O codigo invisivel vai dentro do texto pre-preenchido; se o lead apaga ou troca o texto, o codigo
-- se perde (medido em teste real). Sem codigo, `rastreador-casar` casa por UNIDADE + PROXIMIDADE DE
-- HORARIO e marca aqui o metodo, para o relatorio nunca misturar o casamento certo com o provavel.
--
--   codigo  = achou o codigo invisivel na mensagem (certo)
--   janela  = lead trocou/apagou o texto; casado por unidade + horario (provavel)

alter table public.rastreio_cliques add column if not exists metodo_casamento text;
alter table public.rastreio_cliques drop constraint if exists rastreio_cliques_metodo_chk;
alter table public.rastreio_cliques add constraint rastreio_cliques_metodo_chk
  check (metodo_casamento is null or metodo_casamento in ('codigo', 'janela'));
update public.rastreio_cliques set metodo_casamento = 'codigo' where situacao = 'casado' and metodo_casamento is null;

comment on column public.rastreio_cliques.metodo_casamento is
  'codigo = achou o codigo invisivel na mensagem (certo). janela = lead trocou/apagou o texto; casado por unidade + proximidade de horario (provavel).';
