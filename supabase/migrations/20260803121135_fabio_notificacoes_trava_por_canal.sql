-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- A trava de duplicata do briefing era por (professor, tipo, dia) e IGNORAVA o
-- canal. Quem reivindicasse primeiro, em qualquer canal, calava o outro — então
-- professor com preferencia 'ambos' so podia receber em UM canal por dia, por
-- construcao. Foi o que segurou o briefing do Matheus no WhatsApp em 03/08/2026:
-- uma reivindicacao no canal 'app' as 07:30 fez os dois disparos das 8h
-- (crontab e timer) responderem 'already_claimed_or_sent'.
--
-- Com o canal na chave, cada canal tem sua propria entrega e sua propria trava.
-- A idempotencia continua valendo onde importa: nao sai briefing repetido no
-- MESMO canal no mesmo dia.
drop index if exists public.uq_fabio_notif_recorrente_diario;

create unique index uq_fabio_notif_recorrente_diario
  on public.fabio_notificacoes (professor_id, tipo, dia_referencia, canal)
  where tipo = any (array['briefing_matinal', 'pendencia_registro']);

comment on index public.uq_fabio_notif_recorrente_diario is
  'Uma notificacao recorrente por professor/tipo/dia POR CANAL. O canal faz parte da chave de proposito: quem escolhe "ambos" precisa receber nos dois.';
