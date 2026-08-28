-- A publicação do sync de faturas processa ~1.117 itens em jsonb numa chamada só.
-- Via PostgREST ela herda o statement_timeout=8s do papel authenticator (o
-- service_role NÃO tem timeout próprio, então vale o da sessão do authenticator).
-- Em condições normais ela roda em 2-5s; com o banco sob carga (28/08: benchmarks
-- pesados de presença rodando em produção em horário comercial), passou de 8s e o
-- sync inteiro falhou 8 vezes seguidas (16:03-17:41 BRT) — fonte de faturas stale
-- por ~2h e a Sol em fail-closed nos grupos ("não consegui confirmar a fatura na
-- fonte oficial agora — não vou lançar com pode").
--
-- Prova (postgres_logs, cancel de 20:41:36 UTC — o instante exato da falha do
-- run): o statement cancelado era o publish_financeiro_sync_run via
-- PostgREST/authenticator. 3 segundos antes, o benchmark de presença rodava CTEs
-- materializadas sobre o mês inteiro — o sync foi vítima colateral da saturação.
--
-- SET por FUNÇÃO, não no papel service_role: escopo mínimo. Só esta função — que
-- é serial (1 chamada por run, cron de 15 min) — ganha folga; todo o resto do
-- projeto continua com o guard-rail de 8s. NÃO mexer no timeout de authenticated
-- (8s) por causa de tela lenta: lá o timeout curto é proteção, não defeito.
alter function public.publish_financeiro_sync_run(uuid, jsonb, jsonb, text)
  set statement_timeout = '60s';
