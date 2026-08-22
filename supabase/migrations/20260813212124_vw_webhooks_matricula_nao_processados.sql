-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Webhook de matricula que o OBSERVADOR recebeu e que a edge de PROCESSAMENTO nunca viu.
--
-- POR QUE ISSO EXISTE
-- Ha DOIS cadastros de webhook por unidade no Emusys, com listas de eventos independentes:
--   Emusys --> debug-webhook-emusys-observador   (direto; so registra o payload)
--   Emusys --> webhook_matricula (n8n)  --> processar-matricula-emusys  (processa de verdade)
-- Quando um evento e marcado no primeiro e esquecido no segundo, o payload aparece no log e
-- **nada acontece no sistema**. Ja aconteceu DUAS vezes:
--   03/08/2026: `matricula_alterada` e `matricula_finalizacao` desmarcados em Barra e Recreio
--               (20 evasoes do Recreio perdidas).
--   13/08/2026: `matricula_aviso_previo_*` (v1.4.0) desmarcado na Barra — duas alunas
--               (Catarina Perim e Liv Ribeiro Oliveira) avisaram que sairiam em 01/10 e nao
--               ficou registro nenhum.
-- O padrao se repete a cada evento NOVO que o Emusys lanca, porque o cadastro e manual e por
-- unidade. Detectar e barato; lembrar de marcar, nao.
--
-- ⚠️ O n8n NAO filtra evento (`Webhook -> LAPerformanceReport` liga direto, conferido no
-- workflow ZzuR9slRx8UqXg9N em 13/08). Entao "chegou no observador e nao na edge" significa
-- que o Emusys nao entregou ao endpoint do n8n — o conserto e no PAINEL, nao no codigo.
--
-- CHAVE DE CASAMENTO: `payload_bruto->>'id'` e o id do EVENTO no Emusys (ex: 81268), unico e
-- estavel entre as duas entregas. Nao usar `matricula_id` — o mesmo contrato gera varios eventos.
--
-- ⚠️ Contar a edge SO por `acao='webhook_recebido'`: ela grava 2 linhas por evento
-- (recebido + processado) e o total dobra.
create or replace view public.vw_webhooks_matricula_nao_processados as
select
  o.id                                                as automacao_log_id,
  (o.created_at at time zone 'America/Sao_Paulo')     as recebido_brt,
  o.created_at,
  o.evento,
  o.payload_bruto->>'escola_nome'                     as escola_nome,
  o.payload_bruto->>'escola_id'                       as escola_id,
  (o.payload_bruto->>'id')                            as evento_emusys_id,
  o.payload_bruto->'matricula'->>'matricula_id'       as matricula_id,
  o.payload_bruto->'matricula'->>'nome_aluno'         as nome_aluno,
  -- so preenchido nos 3 eventos de aviso previo; deixa a linha auto-explicativa no alerta
  o.payload_bruto->'aviso_previo'->>'data_prevista_cancelamento' as prevista_cancelamento,
  o.payload_bruto->'aviso_previo'->>'motivo'          as motivo_aviso,
  o.payload_bruto                                     as payload_bruto
from automacao_log o
where o.workflow_id = 'debug-webhook-emusys-observador'
  and o.evento like 'matricula%'
  and o.payload_bruto->>'id' is not null
  and not exists (
    select 1 from automacao_log e
    where e.workflow_id = 'processar-matricula-emusys'
      and e.acao        = 'webhook_recebido'
      and e.evento      = o.evento
      and e.payload_bruto->>'id' = o.payload_bruto->>'id'
  );

-- ALTER DEFAULT PRIVILEGES no schema public da `authenticated=arwdDxtm` a toda relacao nova —
-- inclusive VIEW, e `grant select` depois NAO tira o resto. Revogar primeiro.
revoke all on public.vw_webhooks_matricula_nao_processados from public, anon, authenticated;
grant select on public.vw_webhooks_matricula_nao_processados to authenticated, service_role;

comment on view public.vw_webhooks_matricula_nao_processados is
  'Webhooks de matricula que o observador recebeu e a edge processar-matricula-emusys nunca viu — tipicamente evento marcado num cadastro de webhook do Emusys e esquecido no outro. Cada linha e um evento de negocio perdido, com payload_bruto para reprocessar. Zero linhas = as duas configs estao alinhadas.';
