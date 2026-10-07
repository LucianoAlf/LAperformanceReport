-- FISC-78 (fiscal-mila): desde 25/09 get_kpis_comercial_canonicos_v2 grava cache
-- (kpis_comercial_v2_cache). Chamada de dentro de uma funcao STABLE, o PostgREST
-- abre transacao read-only e a tool numeros_do_mes da Mila falhava com 25006
-- ("cannot execute INSERT in a read-only transaction") desde 26/09.
-- Aplicado via MCP em 29/09/2026.
alter function public.mila_numeros_do_mes_v1(text, integer, integer, uuid) volatile;
