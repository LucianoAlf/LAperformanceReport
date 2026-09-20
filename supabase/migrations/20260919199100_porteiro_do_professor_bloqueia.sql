-- 19/09/2026: o porteiro do professor (20260919199000) passa de 'observar' para
-- 'bloquear'. Por que não ficou observando mais tempo: o registro do modo
-- observar é um INSERT dentro da transação da requisição, e o PostgREST abre
-- GET e RPC stable/immutable como READ ONLY — ali o INSERT falha (engolido de
-- propósito) e a recusa não fica registrada. Observar só enxergaria parte.
-- A lista veio do código inteiro do app (64 RPCs + fabio_chat_mensagens) e foi
-- conferida no app real (preview como professor) sem nenhum 403.
-- No modo bloquear o registro é o RAISE LOG (log do Postgres).
-- Voltar atrás, se precisar: update public.porteiro_config set modo = 'observar';
update public.porteiro_config set modo = 'bloquear' where id;
