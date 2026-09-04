-- T2: ingere o estado das conversas e roda o detector da R18, de hora em hora.
--
-- ⚠️ De hora em hora, nao 1×/dia: "preso no bot" e sinal OPERACIONAL — vale
--    enquanto a pessoa ainda esta esperando. Avisar amanha de manha que alguem
--    ficou 15h sem resposta ontem nao e acionavel, virou relatorio.
--
-- ⚠️ O minuto :05 esta livre (25=meta-ads, 35=google-ads, 40=varredura-meta).
--
-- ⚠️ A edge faz ingestao E detector na mesma invocacao, de proposito: dois crons
--    independentes deixariam o detector ler foto velha e a ordem viraria sorte.
--
-- 🔴 Prova de vida pelo DADO, nunca pelo pg_cron (que marca `succeeded` so por
--    ter enfileirado o net.http_post):
--    select max(atualizado_em), count(*) from atendimento_conversa_estado;
select cron.unschedule('calor-atendimento-horario')
 where exists (select 1 from cron.job where jobname = 'calor-atendimento-horario');

select cron.schedule('calor-atendimento-horario', '5 * * * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/ingerir-calor-atendimento',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-radar-token', (select token from public.integracao_tokens where nome = 'radar_extrator')
    ),
    body := '{}'::jsonb
  );
$cron$);
