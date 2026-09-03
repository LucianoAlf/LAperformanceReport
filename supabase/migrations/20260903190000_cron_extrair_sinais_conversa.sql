-- Mapa de Sinais / A5: agenda do extrator semantico de conversas.
--
-- 07:30 BRT (10:30 UTC), depois do detector SQL das 06h (jobid 192) e antes da
-- entrega as guardias as 09h — assim a lista do dia ja sai com o que veio das
-- conversas da noite anterior.
--
-- Manda `Authorization` ALEM do `x-radar-token`, mesmo com verify_jwt=false:
-- se um redeploy futuro virar verify_jwt para true (o deploy pelo MCP faz isso
-- por default, e ja derrubou sync-inadimplencia e sync-presenca neste projeto),
-- sem o header o cron morreria em 401 silencioso — o pg_cron marca `succeeded`
-- porque so avalia se o net.http_post foi ENFILEIRADO.
--
-- O token vem de `integracao_tokens`, nao do vault: rotacionar e um UPDATE.
--
-- ⚠️ CONFERIR PELO LOG, NUNCA PELO pg_cron. A prova de vida e
--    `select count(*) from automacao_log where acao='extrator_conversa_run'`.
--
-- limite=150 por rodada: a edge tem teto de tempo, e o estado estavel e de
-- ~20-30 conversas novas por dia. Backlog maior drena em alguns dias em vez de
-- estourar a execucao.

select cron.schedule(
  'radar-extrair-sinais-conversa-diario',
  '30 10 * * *',
  $$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/extrair-sinais-conversa?limite=150',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'supabase_anon_key' limit 1
      ),
      'x-radar-token', (
        select token from public.integracao_tokens where nome = 'radar_extrator' limit 1
      )
    ),
    timeout_milliseconds := 300000
  );
  $$
);
