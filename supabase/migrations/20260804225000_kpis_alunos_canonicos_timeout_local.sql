-- Mantém a leitura canônica intacta e dá margem apenas a esta RPC crítica.
-- O limite é local à função: não altera o statement_timeout global do banco.
ALTER FUNCTION public.get_kpis_alunos_canonicos(uuid, integer, integer)
  SET statement_timeout = '15s';
