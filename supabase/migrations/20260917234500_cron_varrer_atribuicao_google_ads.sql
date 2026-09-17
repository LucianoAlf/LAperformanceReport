-- Varredura dos cliques do Google que ainda nao acharam lead.
--
-- POR QUE A CADA 10 MINUTOS (e nao de hora em hora como a do Meta): a lacuna que ela fecha e
-- uma corrida de SEGUNDOS. Medido em 17/09/2026, o webhook da onpromedia chega 1,8 a 3,9s
-- ANTES do lead existir em `leads` -- em 5 de 7 conversas do dia. Na primeira tentativa o
-- clique fica 'pendente'; a varredura casa no ciclo seguinte. De hora em hora funcionaria
-- igual no fim, mas deixaria a atribuicao invisivel por ate 60 min sem necessidade.
--
-- A funcao e a MESMA do webhook, no modo varrer -- ver o comentario no topo do index.ts
-- sobre por que nao foi separada em duas edges.
--
-- ⚠️ pg_cron marca "succeeded" quando apenas ENFILEIRA o net.http_post. Conferir sempre pelo
-- efeito, nunca pelo status do job:
--   select situacao, count(*) from public.google_ads_cliques group by 1;

select cron.schedule(
  'varrer-atribuicao-google-ads',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/registrar-atribuicao-google-ads',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91cXdiYmVybWx6cXF2dHF3bHVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1Nzg5NTgsImV4cCI6MjA4MzE1NDk1OH0.KGEzs2T-NPBc1DaWjgIVbJkEsjAdluT4q5kHrFvIJus'
    ),
    body := jsonb_build_object('varrer', true),
    timeout_milliseconds := 60000
  );
  $$
);
