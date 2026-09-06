-- PC2 E PC4 VOLTAM A SER MEDIDOS SOZINHOS (06/09/2026, aplicado)
--
-- 🔴 A DEFINICAO FOI RECUPERADA POR PROVA, nao por palpite. Na 1a tentativa eu
--    supus que a taxa era "% que REALIZOU experimental" e produzi METADE do
--    valor gravado — tive de reverter (ver commit anterior). Testando a
--    hipotese alternativa contra os numeros de 03/09:
--      Instagram    0,0905  vs  0,10 gravado
--      Indicacao    0,7545  vs  0,77
--      Site+Google  0,1126  vs  0,12
--    Os tres batem dentro do arredondamento. "Chegar ate a aula" e AGENDAR a
--    experimental, nao realiza-la. A definicao foi escrita no campo 
--    (campo `metodo`) para ninguem mais precisar redescobrir.
--
-- ⚠️ PC1, PC3 e PC5 FICAM DE FORA: eu nao consegui reproduzir os valores
--    gravados deles, e numero que eu nao sei reproduzir eu nao reescrevo.
--    Seguem manuais, com a data a vista e o aviso de `envelhecido` aos 45 dias.

update radar_padroes set metodo = 'vw_jornada_lead_v1, leads que ENTRARAM entre D-180 e D-14 (carencia para o desfecho maturar), excluindo lead sintetico (origem_registro=sync_aluno). NUMERADOR: leads do canal que AGENDARAM experimental (experimentais_agendadas>0 OR experimentais_realizadas>0 OR experimental_agendada_para nao nulo). DENOMINADOR: todos os leads do canal na janela. taxa_evento = Instagram; taxa_base = Indicacao (melhor canal). Definicao recuperada por prova em 06/09/2026 (reproduz 0,09/0,75 contra 0,10/0,77 de 03/09).' where codigo = 'PC2';
update radar_padroes set metodo = 'Igual ao PC2, com canal_origem in (Site, Google) unificados no numerador; taxa_base = Indicacao. Definicao recuperada por prova em 06/09/2026 (reproduz 0,11 contra 0,12 de 03/09).' where codigo = 'PC4';

CREATE OR REPLACE FUNCTION public.radar_remedir_pc2_pc4_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ini  date := (now() at time zone 'America/Sao_Paulo')::date - 180;
  v_fim  date := (now() at time zone 'America/Sao_Paulo')::date - 14;
  r record; v_out jsonb := '[]'::jsonb;
begin
  create temp table _b on commit drop as
  select j.canal_origem,
         (j.experimentais_agendadas > 0 or j.experimentais_realizadas > 0
          or j.experimental_agendada_para is not null) agendou
  from vw_jornada_lead_v1 j join leads l on l.id = j.lead_id
  where j.entrou_em::date between v_ini and v_fim
    and coalesce(l.origem_registro,'funil') <> 'sync_aluno';

  select round(avg(case when canal_origem='Instagram' and agendou then 1.0
                        when canal_origem='Instagram' then 0.0 end)::numeric,4) ig,
         round(avg(case when canal_origem='Indicação' and agendou then 1.0
                        when canal_origem='Indicação' then 0.0 end)::numeric,4) ind,
         round(avg(case when canal_origem in ('Site','Google') and agendou then 1.0
                        when canal_origem in ('Site','Google') then 0.0 end)::numeric,4) sg,
         count(*) filter (where canal_origem='Instagram') n_ig,
         count(*) filter (where canal_origem in ('Site','Google')) n_sg
    into r from _b;

  -- ⚠️ Guarda de sanidade: taxa fora de [0,1] ou denominador ridiculo significa
  --    que a fonte mudou de forma — melhor nao escrever do que escrever errado.
  if r.ind is null or r.ind <= 0 or r.n_ig < 100 then
    return jsonb_build_object('ok', false, 'motivo', 'amostra_ou_base_insuficiente',
                              'n_instagram', r.n_ig, 'taxa_indicacao', r.ind);
  end if;

  update radar_padroes set amostra_n=r.n_ig, taxa_evento=r.ig, taxa_base=r.ind,
         lift=round(r.ig/r.ind,2), medido_em=v_hoje,
         periodo_medido=v_ini::text||' a '||v_fim::text where codigo='PC2';
  update radar_padroes set amostra_n=r.n_sg, taxa_evento=r.sg, taxa_base=r.ind,
         lift=round(r.sg/r.ind,2), medido_em=v_hoje,
         periodo_medido=v_ini::text||' a '||v_fim::text where codigo='PC4';

  v_out := jsonb_build_array(
    jsonb_build_object('codigo','PC2','n',r.n_ig,'instagram',r.ig,'indicacao',r.ind),
    jsonb_build_object('codigo','PC4','n',r.n_sg,'site_google',r.sg,'indicacao',r.ind));

  insert into automacao_log (evento, acao, status, aluno_nome, detalhes)
  values ('radar','remedir_pc2_pc4','ok','radar de padroes',
          jsonb_build_object('janela', v_ini::text||' a '||v_fim::text, 'padroes', v_out));

  return jsonb_build_object('ok', true, 'medido_em', v_hoje, 'padroes', v_out,
    'fora_desta_medicao','PC1, PC3 e PC5 seguem manuais: a semantica das taxas deles nao foi reproduzida');
end; $function$
;

revoke all on function public.radar_remedir_pc2_pc4_v1() from public, anon;
grant execute on function public.radar_remedir_pc2_pc4_v1() to service_role;

-- ⚠️ SEMANAL, nao diario: a janela e de 180 dias, entao o numero mal se move
--    em 24h. Cron diario so gastaria e daria a impressao de que o retrato muda
--    todo dia — e nao muda.
select cron.schedule('radar-remedir-pc2-pc4-semanal', '30 8 * * 1',
  $$select public.radar_remedir_pc2_pc4_v1();$$);
