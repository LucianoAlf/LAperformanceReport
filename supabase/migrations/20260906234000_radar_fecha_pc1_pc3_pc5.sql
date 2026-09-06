-- RADAR DE PADROES — fecha PC1, PC3 e PC5 (06/09/2026).
--
-- Contexto: PC2 e PC4 ja foram remedidos por prova em 06/09. Os outros tres
-- ficaram de fora porque eu nao havia reproduzido a semantica das taxas. A
-- definicao dos tres ESTAVA ESCRITA o tempo todo — no campo `aprendizado`, que
-- eu vinha lendo truncado. Cada um teve um desfecho diferente:
--
--   PC1 -> automatiza. `taxa_evento`/`taxa_base` nao sao evento-contra-base:
--          sao o PISO e o TETO da conversao pos-aula entre canais ("40,8% a
--          50,5%"). Por isso o lift 0,81 — e a razao entre os extremos, e o
--          ponto do padrao e que eles sao PROXIMOS. Reproduzido em estrutura:
--          a ordem dos canais bate exatamente (Visita > Indicacao > Google >
--          Instagram), com valores ~5 pontos abaixo dos de 03/09.
--
--   PC3 -> REBAIXADO. O `amostra_n=28` gravado e a prova documental de que o
--          padrao foi medido SEM excluir lead sintetico: o canal Ex-aluno tem
--          exatamente 28 leads na janela, dos quais 9 sao sinteticos (criados
--          retroativamente quando o ex-aluno rematricula — convertem por
--          construcao). Sem eles: 19 leads, 9 fizeram aula, 3 converteram =
--          33,3%, nao 68,2%. Com eles: 50,0%. Nenhum dos dois e 68,2%, e o
--          problema de fundo nao e o numero — e n=9, onde cada pessoa vale 11
--          pontos percentuais.
--
--   PC5 -> ESPERA DADO. A definicao existe e esta certa; falta historico:
--          `meta_ads_metricas_diarias` comeca em 04/08/2026 e a janela do
--          padrao vai de D-180 a D-14. O gasto por anuncio cobre so os ultimos
--          ~17 dias dela. Nao da para remedir o passado porque o dado nao
--          existe — a captura e forward-only.
--
-- ⚠️ A funcao antiga `radar_remedir_pc2_pc4_v1` e SUBSTITUIDA por
--    `radar_remedir_padroes_v1` (nome que nao mente sobre o escopo) e dropada
--    no mesmo commit, com o cron repontado. Deixar a orfa viva e o padrao que
--    quebrou o `upsert_lead`.

create or replace function public.radar_remedir_padroes_v1()
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ini  date := (now() at time zone 'America/Sao_Paulo')::date - 180;
  v_fim  date := (now() at time zone 'America/Sao_Paulo')::date - 14;
  r record; p1 record; v_out jsonb := '[]'::jsonb;
begin
  -- base comum: leads da janela, SEM o sintetico.
  -- O lead sintetico nasce do trigger quando um aluno (re)matricula, entao ele
  -- converte por definicao. Manter esse lead infla qualquer taxa cujo
  -- numerador seja matricula — foi o que aconteceu com o PC3.
  create temp table _b on commit drop as
  select j.canal_origem,
         (j.experimentais_agendadas > 0 or j.experimentais_realizadas > 0
          or j.experimental_agendada_para is not null) agendou,
         (j.experimentais_realizadas > 0) realizou,
         coalesce(j.converteu,false) conv
  from vw_jornada_lead_v1 j join leads l on l.id = j.lead_id
  where j.entrou_em::date between v_ini and v_fim
    and coalesce(l.origem_registro,'funil') <> 'sync_aluno';

  -- PC2 / PC4: chegar a aula, por canal (inalterado desde 06/09).
  select round(avg(case when canal_origem='Instagram' and agendou then 1.0
                        when canal_origem='Instagram' then 0.0 end)::numeric,4) ig,
         round(avg(case when canal_origem='Indicação' and agendou then 1.0
                        when canal_origem='Indicação' then 0.0 end)::numeric,4) ind,
         round(avg(case when canal_origem in ('Site','Google') and agendou then 1.0
                        when canal_origem in ('Site','Google') then 0.0 end)::numeric,4) sg,
         count(*) filter (where canal_origem='Instagram') n_ig,
         count(*) filter (where canal_origem in ('Site','Google')) n_sg
    into r from _b;

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

  -- PC1: a FAIXA da conversao pos-aula entre canais.
  -- ⚠️ O denominador aqui e "quem FEZ a aula", nao "quem entrou" — por isso o
  --    piso de 25 vale sobre as aulas realizadas, e nao sobre os leads. E por
  --    isso `amostra_n` muda de sentido em relacao a medicao manual de 03/09
  --    (que gravou 4.247 = leads na janela): passa a ser o total de leads que
  --    fizeram a aula nos canais qualificados.
  select min(taxa) piso, max(taxa) teto, sum(n)::int n_total, count(*)::int canais,
         (array_agg(canal_origem order by taxa))[1] canal_piso,
         (array_agg(canal_origem order by taxa desc))[1] canal_teto
    into p1
  from (select canal_origem, count(*) n,
               round(avg(case when conv then 1.0 else 0.0 end)::numeric,4) taxa
          from _b where realizou and canal_origem is not null
         group by 1 having count(*) >= 25) q;

  -- Guarda: com menos de 3 canais qualificados nao existe "faixa entre canais"
  -- — o padrao deixaria de ser o que ele afirma. Melhor nao escrever.
  if p1.canais is null or p1.canais < 3 or p1.teto is null or p1.teto <= 0 then
    insert into automacao_log (evento, acao, status, aluno_nome, detalhes)
    values ('radar','remedir_pc1','warn','radar de padroes',
            jsonb_build_object('motivo','canais_qualificados_insuficientes','canais',p1.canais));
  else
    update radar_padroes set amostra_n=p1.n_total, taxa_evento=p1.piso, taxa_base=p1.teto,
           lift=round(p1.piso/p1.teto,2), medido_em=v_hoje,
           periodo_medido=v_ini::text||' a '||v_fim::text
     where codigo='PC1';
    v_out := v_out || jsonb_build_object('codigo','PC1','n',p1.n_total,
               'piso',p1.piso,'canal_piso',p1.canal_piso,
               'teto',p1.teto,'canal_teto',p1.canal_teto,'canais',p1.canais);
  end if;

  v_out := v_out
    || jsonb_build_object('codigo','PC2','n',r.n_ig,'instagram',r.ig,'indicacao',r.ind)
    || jsonb_build_object('codigo','PC4','n',r.n_sg,'site_google',r.sg,'indicacao',r.ind);

  insert into automacao_log (evento, acao, status, aluno_nome, detalhes)
  values ('radar','remedir_padroes','ok','radar de padroes',
          jsonb_build_object('janela', v_ini::text||' a '||v_fim::text, 'padroes', v_out));

  return jsonb_build_object('ok', true, 'medido_em', v_hoje, 'padroes', v_out,
    'fora_desta_medicao', 'PC3 rebaixado (n=9 real, inflado por lead sintetico) · '
      || 'PC5 espera dado (meta_ads_metricas_diarias so existe desde 04/08/2026)');
end; $function$;

revoke all on function public.radar_remedir_padroes_v1() from public, anon;
grant execute on function public.radar_remedir_padroes_v1() to service_role;

-- PC1: a definicao vai para o `metodo`, para ninguem re-derivar.
update radar_padroes set
  metodo = 'vw_jornada_lead_v1 x leads, entrada entre D-180 e D-14 (carencia para o desfecho '
    || 'maturar), EXCLUINDO lead sintetico (origem_registro=sync_aluno). Universo: quem '
    || 'REALIZOU experimental (experimentais_realizadas>0). Por canal: conversao = '
    || 'convertidos/realizaram, so canais com >=25 aulas realizadas. ⚠️ taxa_evento = o '
    || 'MENOR canal (piso) e taxa_base = o MAIOR (teto) — nao e evento contra base, e a '
    || 'FAIXA; o lift e a razao entre os extremos e o ponto do padrao e que ela e estreita. '
    || 'amostra_n = total de aulas realizadas nos canais qualificados. Automatizado em '
    || '06/09/2026 por radar_remedir_padroes_v1 (definicao recuperada do campo aprendizado).'
where codigo='PC1';

-- PC3: rebaixado, com o motivo por extenso.
-- ⚠️ O texto original do `aprendizado` e PRESERVADO abaixo da correcao: ele e
--    o registro do que se acreditou, e apagar isso apaga a licao.
update radar_padroes set
  ativo = false,
  confianca = 'baixa',
  aprendizado = '⚠️ REBAIXADO EM 06/09/2026 — NAO USAR. O n=28 gravado e o total de leads do '
    || 'canal Ex-aluno COM lead sintetico incluido (9 dos 28 sao sinteticos: o trigger os cria '
    || 'retroativamente quando o ex-aluno rematricula, entao convertem por construcao). Medido '
    || 'sem eles: 19 leads, 9 fizeram a aula, 3 converteram = 33,3%. Com eles: 50,0%. Nenhum dos '
    || 'dois reproduz os 68,2%. E o problema de fundo nao e o numero: com 9 aulas, cada pessoa '
    || 'vale 11 pontos percentuais. "Ex-aluno e o melhor lead" pode ser verdade, mas nao esta '
    || 'medido. Volta a valer quando o canal tiver >=25 aulas realizadas.'
    || E'\n\n--- texto original (03/09/2026) ---\n' || aprendizado,
  metodo = 'REBAIXADO 06/09/2026. ' || metodo
    || ' | Refutacao: amostra_n=28 = leads do canal COM sintetico; sem sintetico n=19, '
    || 'aulas=9, conversoes=3.'
where codigo='PC3';

-- PC5: a definicao esta certa, o dado e que nao existe.
update radar_padroes set
  metodo = metodo || ' | ⚠️ 06/09/2026: NAO remedivel sobre a janela do radar. '
    || 'meta_ads_metricas_diarias comeca em 04/08/2026 (34 dias, sem buraco, R$ 5.318 de gasto) '
    || 'e a janela vai de D-180 a D-14 — o gasto por anuncio cobre so os ~17 dias finais dela. '
    || 'A captura e forward-only: nao ha como reconstruir o passado. Remedir a partir de '
    || 'novembro/2026, quando houver ~90 dias de midia, com janela propria.'
where codigo='PC5';

-- cron repontado e a funcao antiga dropada no mesmo commit.
do $cron$
declare v_id bigint;
begin
  select jobid into v_id from cron.job where command like '%radar_remedir_pc2_pc4_v1%'
   order by jobid limit 1;
  if v_id is null then
    raise exception 'cron do radar nao encontrado — nao vou criar um segundo as cegas';
  end if;
  perform cron.alter_job(v_id, command => 'select radar_remedir_padroes_v1();');
  raise notice 'cron % repontado para radar_remedir_padroes_v1', v_id;
end $cron$;

drop function if exists public.radar_remedir_pc2_pc4_v1();

-- prova
do $prova$
declare v jsonb; v_pc1 record; v_pc3 record;
begin
  v := radar_remedir_padroes_v1();
  if not (v->>'ok')::bool then
    raise exception 'a remedicao nao rodou: %', v;
  end if;

  select taxa_evento, taxa_base, lift, amostra_n into v_pc1 from radar_padroes where codigo='PC1';
  if v_pc1.taxa_evento is null or v_pc1.taxa_evento >= v_pc1.taxa_base then
    raise exception 'PC1: o piso (%) deveria ser menor que o teto (%)', v_pc1.taxa_evento, v_pc1.taxa_base;
  end if;

  select ativo, confianca into v_pc3 from radar_padroes where codigo='PC3';
  if v_pc3.ativo or v_pc3.confianca <> 'baixa' then
    raise exception 'PC3 continua ativo apos o rebaixamento';
  end if;

  raise notice 'PC1 remedido: piso % teto % (n=%) · PC3 rebaixado · PC5 documentado',
    v_pc1.taxa_evento, v_pc1.taxa_base, v_pc1.amostra_n;
end $prova$;
