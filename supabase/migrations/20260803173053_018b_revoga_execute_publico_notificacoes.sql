-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- 018b — fecha um buraco que a PRÓPRIA 018 abriu.
--
-- As funções originais tinham EXECUTE só para {postgres, service_role,
-- fabio_agent}: PUBLIC já havia sido revogado em algum momento. Ao recriá-las,
-- elas nasceram de novo com o grant padrão do Postgres para PUBLIC e com os
-- default privileges do Supabase para anon/authenticated.
--
-- Todas são SECURITY DEFINER. Do jeito que ficou, um chamador ANÔNIMO poderia
-- reivindicar e concluir notificação de qualquer professor. O DROP não levou só
-- os grants que eu precisava devolver — levou também a REVOGAÇÃO que existia.
--
-- Lição pro resto desta série: depois de recriar função, conferir a ACL inteira,
-- não só se quem eu quero está lá.

revoke all on function
  public.fabio_claim_notificacao(integer, text, text, text, text, text, boolean),
  public.fabio_claim_notificacao_por_referencia(integer, text, text, text, text, text, text, text, integer),
  public.fabio_marcar_notificacao_enviada(uuid, uuid, text),
  public.fabio_marcar_notificacao_falhou(uuid, text, uuid, integer)
from public, anon, authenticated;

grant execute on function
  public.fabio_claim_notificacao(integer, text, text, text, text, text, boolean),
  public.fabio_claim_notificacao_por_referencia(integer, text, text, text, text, text, text, text, integer),
  public.fabio_marcar_notificacao_enviada(uuid, uuid, text),
  public.fabio_marcar_notificacao_falhou(uuid, text, uuid, integer)
to service_role, fabio_agent;
