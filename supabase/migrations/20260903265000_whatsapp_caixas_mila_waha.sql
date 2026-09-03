-- Mila como REMETENTE do relatorio comercial (pedido do Luciano, 03/09):
-- "isso ai tem que ser a Mila". Hoje sai pela Sol porque o script comercial lia
-- os destinatarios SEM caixa_id (corrigido no VPS, patch
-- vps/la-hq/sol/scripts/_patch-comercial-caixa-id-03set.py).
--
-- A unica caixa "Mila" existente (id 1, UAZAPI 5521966583325) esta MORTA:
-- HTTP 401 "Invalid token" em 03/09 — desativada aqui. A Mila real fala pelas
-- sessoes WAHA do Chatwoot, todas WORKING no servidor multi-tenant
-- waha.agenticflowio.com.br (mesmo servidor e chave da caixa 2 / Sol):
--   Barra    5_147_552139550932   | Recreio 5_148_552139552420
--   CG       5_155_5521982956809
-- O CHECK de departamento so aceitava administrativo|sucesso_aluno — ampliado
-- (aditivo) com 'comercial'. uazapi_url/uazapi_token sao NOT NULL na tabela; a
-- caixa 2 (provedor waha) carrega placeholders, copiados pela mesma convencao.
-- Quem roteia e `provedor` (_send_via_waha no lareport_whatsapp_single.py).
--
-- ⚠️ NASCEM DESLIGADAS. Medido em 03/09: NENHUM desses numeros esta em NENHUM
-- dos 3 grupos "RELATORIOS DIARIOS". Enviar para grupo do qual a sessao nao e
-- membro falha — e falhar e o certo (nao cair na Sol). Ligar so depois de o
-- Luciano adicionar cada numero ao grupo da sua unidade e apontar
-- whatsapp_destinatarios_relatorio.caixa_id (7/8/9) nos 3 destinatarios
-- relatorio_comercial.
-- ⚠️ O WAHA esta atras de Cloudflare e recusa User-Agent nao-browser (Error
-- 1010) — o remetente manda UA de navegador.

alter table public.whatsapp_caixas drop constraint if exists whatsapp_caixas_departamento_check;
alter table public.whatsapp_caixas add constraint whatsapp_caixas_departamento_check
  check (departamento = any (array['administrativo','sucesso_aluno','comercial']));

insert into public.whatsapp_caixas
  (nome, numero, funcao, provedor, departamento, unidade_id, ativo,
   uazapi_url, uazapi_token, waha_url, waha_api_key, waha_session)
select v.nome, v.numero, 'agente', 'waha', 'comercial', v.unidade_id, false,
       s.uazapi_url, s.uazapi_token, s.waha_url, s.waha_api_key, v.sessao
from (values
  ('Mila — Barra',        '552139550932',  '368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid, '5_147_552139550932'),
  ('Mila — Recreio',      '552139552420',  '95553e96-971b-4590-a6eb-0201d013c14d'::uuid, '5_148_552139552420'),
  ('Mila — Campo Grande', '5521982956809', '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid, '5_155_5521982956809')
) as v(nome, numero, unidade_id, sessao)
cross join (select uazapi_url, uazapi_token, waha_url, waha_api_key from public.whatsapp_caixas where id = 2) s
where not exists (select 1 from public.whatsapp_caixas c where c.waha_session = v.sessao);

update public.whatsapp_caixas set ativo = false where id = 1;
