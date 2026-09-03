-- T3 (2/2) — captura continua + o furo do detector comercial + PC5.
--
-- CADENCIA em dois ritmos, porque a Meta REVISA numero por 24-72h:
--   horaria (janela 3 dias) = o "real time" que interessa: hoje fresco + revisao
--     recente, ~30 linhas por execucao
--   diaria 09:20 UTC (janela 45 dias) = revisao tardia e cura de buraco se a
--     horaria falhar em silencio
-- Idempotente por PK (dia, ad_id): reescrever e o comportamento CORRETO.
--
-- ⚠️ FURO CORRIGIDO AQUI: `radar_detectar_sinais_comercial_v1` foi criada em
-- 03/09 e ficou SEM CRON. Os 363 sinais comerciais vieram de execucao manual e
-- nenhum sinal novo nasceria sozinho. Agendada as 09:10 UTC (10 min depois do
-- detector do aluno, para os dois nao escreverem em radar_sinais no mesmo
-- minuto). SQL direto, sem edge: cron chamando edge ja morreu em 401 silencioso
-- neste projeto.
--
-- 🔴 Prova de vida (pelo DADO, nunca pelo pg_cron, que marca succeeded so por
-- enfileirar):  select max(capturado_em), count(*) from meta_ads_metricas_diarias;

select cron.schedule(
  'meta-ads-captura-horaria',
  '25 * * * *',
  $$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/capturar-meta-ads-diario?dias=3',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'supabase_anon_key' limit 1
      ),
      'x-radar-token', (
        select token from public.integracao_tokens where nome = 'meta_ads_captura' limit 1
      )
    ),
    timeout_milliseconds := 120000
  );
  $$
);

select cron.schedule(
  'meta-ads-captura-recalculo-diario',
  '20 9 * * *',
  $$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/capturar-meta-ads-diario?dias=45',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'supabase_anon_key' limit 1
      ),
      'x-radar-token', (
        select token from public.integracao_tokens where nome = 'meta_ads_captura' limit 1
      )
    ),
    timeout_milliseconds := 300000
  );
  $$
);

select cron.schedule(
  'radar-detectar-sinais-comercial-diario',
  '10 9 * * *',
  $$ select public.radar_detectar_sinais_comercial_v1(); $$
);

insert into public.radar_padroes
  (codigo, titulo, pergunta, aprendizado, amostra_n, taxa_evento, taxa_base, lift,
   janela_dias, periodo_medido, confianca, metodo, ativo, versao)
select 'PC5', t.titulo, t.pergunta, t.aprendizado, t.amostra_n, t.taxa_evento, t.taxa_base,
       t.lift, t.janela_dias, t.periodo_medido, t.confianca, t.metodo, t.ativo, t.versao
from (select * from public.radar_padroes where codigo='PC5') t
on conflict (codigo) do nothing;
