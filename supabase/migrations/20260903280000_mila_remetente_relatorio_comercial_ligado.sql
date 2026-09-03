-- Mila passa a ser a REMETENTE do Relatorio Diario Comercial nos 3 grupos.
--
-- Luciano adicionou os numeros da Mila aos grupos em 03/09. Verificado pela API
-- do WAHA (apos POST /api/{sessao}/groups/refresh — sem o refresh, Barra e CG
-- nao apareciam: e cache) que cada sessao enxerga o grupo da sua unidade com o
-- JID exato ja cadastrado em whatsapp_destinatarios_relatorio:
--   5_147 Barra   -> 5521965832009-1625319907@g.us  RELATORIOS DIARIOS BR
--   5_148 Recreio -> 5521992426581-1581033423@g.us  RELATORIOS DIARIOS RC
--   5_155 CG      -> 5521965832009-1600979279@g.us  RELATORIOS DIARIOS CG
--
-- Smoke test real em 03/09 ~17h: send_single_report(jid, texto, caixa_id=7|8|9)
-- entregou nos 3 grupos (transport waha_caixa_7/8/9, message_id do grupo).
-- O primeiro Relatorio Diario Comercial pela Mila sai HOJE as 20:05 BRT, com a
-- secao "SINAIS DO DIA — ACAO".
--
-- Sem fallback cruzado: se a sessao WAHA cair, a linha vira erro na fila
-- (fila_relatorios_whatsapp) em vez de sair pela Sol — mesma regra da caixa 3.
-- Prova de vida: select status, transport from fila_relatorios_whatsapp
--   where tipo_relatorio='relatorio_comercial' and data_dia=current_date.

update public.whatsapp_caixas set ativo = true, updated_at = now() where id in (7, 8, 9);

update public.whatsapp_destinatarios_relatorio d
   set caixa_id = c.id
  from public.whatsapp_caixas c
 where d.tipo = 'relatorio_comercial'
   and d.ativo
   and c.id in (7, 8, 9)
   and c.unidade_id = d.unidade_id;
