-- LAPE-62: rotina diaria do envio de experimental e matricula ao pixel do Meta (06/10/2026).
-- Todo dia as 11:00 UTC (08:00 BRT): manda o que entrou desde a ultima rodada. Cada lead vai UMA vez
-- (meta_conversoes tem unicidade por lead+tipo), entao rodar duas vezes no mesmo dia nao duplica.
-- O comando e copiado do job da varredura do Meta (mesmo molde: Authorization + x-sync-token do vault),
-- trocando so o endereco e o corpo. Idempotente: recria o job se ja existir.
-- Conferir a ultima rodada: select * from public.meta_conversoes_execucao order by id desc limit 5;
-- Desligar: select cron.unschedule('enviar-conversoes-meta-diario');

do $$
declare
  v_modelo text;
begin
  select command into v_modelo from cron.job where jobname = 'varrer-atribuicao-meta-ads-diario';
  if v_modelo is null then
    raise exception 'job varrer-atribuicao-meta-ads-diario nao encontrado: nao ha molde para copiar o comando';
  end if;

  perform cron.unschedule(jobid) from cron.job where jobname = 'enviar-conversoes-meta-diario';

  perform cron.schedule(
    'enviar-conversoes-meta-diario',
    '0 11 * * *',
    replace(
      replace(v_modelo, '/functions/v1/varrer-atribuicao-meta-ads', '/functions/v1/enviar-conversoes-meta'),
      '{"dias": 3}', '{"enviar": true}')
  );
end
$$;
