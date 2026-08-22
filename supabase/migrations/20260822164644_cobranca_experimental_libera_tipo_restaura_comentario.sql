-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- N2 (revisão da Task 3): a migration 20260822190000 fez `drop constraint`
-- + `add constraint` em fabio_notificacoes_tipo_check sem reinstalar o
-- COMMENT que a 20260815120000 tinha deixado (obj_description ficou NULL
-- em produção). Reaplica o CHECK (idêntico, com if exists desta vez) e
-- reinstala o comentário, já com mais uma volta de experiência.

alter table public.fabio_notificacoes
  drop constraint if exists fabio_notificacoes_tipo_check;

alter table public.fabio_notificacoes
  add constraint fabio_notificacoes_tipo_check
  check (tipo = any (array[
    'briefing_matinal',
    'pendencia_registro',
    'experimental_nova',
    'reagendamento',
    'outro',
    'devolutiva_pronta',
    'devolutiva_destinatario',
    'experimental_registrada',
    'experimental_falta',
    'feedback_lembrete',
    'feedback_reforco',
    'feedback_coordenacao',
    'registro_recibo',
    'registro_sem_roster',
    'pendencia_experimental'
  ]));

comment on constraint fabio_notificacoes_tipo_check on public.fabio_notificacoes is
  'Allowlist dos tipos de aviso. Tipo novo no worker exige migration aqui — e o dry-run NÃO cobre isto, porque para antes do claim. Quem inventar um tipo sem passar por aqui descobre em produção, com 23514. Já mordeu esta casa em 15/08 (registro_sem_roster) e em 22/08 (pendencia_experimental) — da segunda vez o próprio conserto deste CHECK apagou este comentário ao fazer drop+add sem `if exists` e sem reinstalar o COMMENT. Quem alterar este CHECK de novo: use `drop constraint if exists`, reinstale este COMMENT, e prove com um .test.sql que faz um CLAIM de verdade (não um --dry-run, que para antes do INSERT e nunca toca esta porta).';
