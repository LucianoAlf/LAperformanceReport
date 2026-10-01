-- supabase/migrations/20261001170000_fechamento_dia1_madrugada.sql
--
-- Fechamento mensal automatico (cron 189) passa de 09:15 BRT para 04:20 BRT do dia 1o
-- (pedido do Hugo, 01/10/2026): antes de a equipe comecar o dia, para nenhum movimento
-- feito no dia 1o (status mudado, lancamento com data retroativa) entrar no mes fechado.
-- O que entra no mes continua decidido por DATA (corte no ultimo dia, ver
-- 20261001150000); a hora so reduz o que pode mudar de estado entre o fim do mes e a captura.
--
-- 07:20 UTC = 04:20 BRT: depois do bloco de materializacoes de health score (ultimo 04:05,
-- ~8 s) e da atualizacao horaria da fonte financeira do mes anterior (04:07). Fechamento
-- medido em ~13 s. A guarda de "dia 1o" usa data BRT, entao 04:20 BRT ainda e dia 1o.
-- O vigia verifica-fechamento-mensal.py (la-hq, 11h BRT) continua depois e nao muda.

do $$
declare
  v_nome text;
begin
  select jobname into v_nome from cron.job where jobid = 189;
  if v_nome is distinct from 'fechamento-mensal-dia1' then
    raise exception 'jobid 189 nao e fechamento-mensal-dia1 (achei %)', v_nome;
  end if;
  perform cron.alter_job(189, schedule => '20 7 1 * *');
end $$;
