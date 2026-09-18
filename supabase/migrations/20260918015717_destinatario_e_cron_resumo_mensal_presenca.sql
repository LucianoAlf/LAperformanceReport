-- Destinatario do resumo mensal: mesma pessoa, mesmo jid e mesma caixa (3 = Lia)
-- do consolidado diario que ela ja recebe. O diario dela segue ATIVO ate 01/10,
-- quando o cron faz a troca (enfileira o mensal e so entao desativa o diario).
insert into public.whatsapp_destinatarios_relatorio (tipo, nome, jid, unidade_id, ativo, caixa_id)
select 'presenca_resumo_mensal', d.nome, d.jid, null, true, d.caixa_id
from public.whatsapp_destinatarios_relatorio d
where d.tipo = 'presenca_pendencias_consolidado' and d.ativo
  and not exists (
    select 1 from public.whatsapp_destinatarios_relatorio x
    where x.tipo = 'presenca_resumo_mensal' and x.jid = d.jid
  );

-- Cron do dia 1, 09:30 BRT (12:30 UTC) - 30 min depois do diario das 9h,
-- para nao disputar a mesma janela do worker na la-hq.
-- p_desativar_diario = true: a troca acontece no primeiro envio bem-sucedido.
select cron.schedule(
  'relatorio-presenca-resumo-mensal-dia1',
  '30 12 1 * *',
  $$select public.fn_enfileirar_resumo_mensal_presenca_v1(null, null, false, true);$$
);;
