-- A tool de trafego nao sabia responder "AGOSTO" (08/09/2026).
--
-- 🔴 O CASO — e e o que o Alf de fato perguntou, por audio, as 14:48:
--    *"quero que voce me traga um relatorio completo do trafego pago,
--    comparando Google e Instagram, do mes de AGOSTO INTEIRO."*
--
--    A Mila respondeu com os ULTIMOS 30 DIAS e escreveu, com todas as letras:
--    *"melhor proxy pro agosto inteiro, ja que a tool traz janela movel"*.
--    Ele respondeu "ta errado".
--
--    Ela estava certa sobre a limitacao e errada em entregar assim mesmo. Em
--    08/09 a janela movel pega 09/08 a 08/09 — ou seja, 8 dias de SETEMBRO
--    dentro de um relatorio de agosto, e faltando os 8 primeiros dias do mes
--    pedido. A funcao so aceitava `p_dias`/`p_maturidade_dias`, janela ROLANTE
--    a partir de hoje. A irma dela, `radar_trafego_criativo_v1`, ja aceitava
--    `p_de`/`p_ate` desde que nasceu; esta ficou para tras.
--
-- 🔴 O QUE MUDA NO NUMERO (agosto fechado x janela movel):
--
--                            ela disse        agosto de verdade
--      Instagram leads           465                524
--      Instagram matriculas        4 (0,9%)           7 (1,3%)
--      Instagram custo/matr.  R$ 1.185            R$ 639
--      Google leads              129                157
--      Google matriculas           3 (2,3%)           6 (3,8%)
--      Google custo/matr.     R$ 1.051            R$ 508
--
--    O custo por matricula era quase o DOBRO do real. A direcao da conclusao
--    nao muda; o tamanho sim — e e com o tamanho que se decide verba.
--
-- ⚠️ PROXY NAO E RESPOSTA. Quem pede uma competencia recebe a competencia. Se a
--    ferramenta nao sabe, o certo e dizer que nao sabe — nunca entregar outro
--    periodo com uma ressalva entre parenteses.
--
-- ⚠️ `leads_imaturos` continua medido contra HOJE, nao contra o fim da janela, e
--    e isso que faz sentido num periodo fechado: um lead de 31/08 teve 8 dias
--    ate hoje, exatamente a mediana de conversao. Por isso agosto sai com
--    `leads_imaturos = 0` — ele JA amadureceu, e o custo por matricula dele nao
--    e teto, diferente da janela movel (109 de 467 sem chance de converter).
--
-- ⚠️ O que continua incompleto em agosto e o GASTO DO META: a captura nasceu em
--    04/08, entao sao 28 dos 31 dias (faltam 01, 02 e 03); o Google tem 30.
--    Isso empurra o custo por matricula do Meta para CIMA quando fechar — e um
--    PISO, nao um teto. As duas ressalvas apontam para lados opostos e nao
--    podem ser ditas juntas (a Mila juntou na 1a resposta; corrigido na
--    descricao da tool, `_patch-trafego-piso-x-teto-08set.js`).
--
-- ⚠️ COMPATIBILIDADE: sem `p_de`/`p_ate` o comportamento e IDENTICO ao anterior
--    (janela rolante por `p_dias`/`p_maturidade_dias`), e a prova abaixo trava
--    isso. Periodo pela metade e RECUSADO, nunca adivinhado.
--
-- ⚠️ DROP+CREATE muda `returns table` e REABRE EXECUTE para `anon` (ALTER
--    DEFAULT PRIVILEGES do schema) — o revoke nominal nao e opcional.
--
-- ⚠️ Aplicada em producao via MCP no mesmo dia; este arquivo e o espelho
--    versionado. Corpo vigente conferido: md5 0dbaf4d26952189d23d0a810f24de2d5,
--    assinatura (p_dias integer, p_maturidade_dias integer, p_de date, p_ate date).

drop function if exists public.radar_trafego_canal_v1(integer, integer);
drop function if exists public.radar_trafego_canal_v1(integer, integer, date, date);

create function public.radar_trafego_canal_v1(
  p_dias int default 180,
  p_maturidade_dias int default 35,
  p_de date default null,
  p_ate date default null
) returns table (
  canal text, leads bigint, agendou bigint, realizou_exp bigint,
  matriculas bigint, conv_pct numeric,
  gasto numeric, gasto_dias_cobertos int, janela_dias int,
  periodo_de date, periodo_ate date,
  leads_imaturos bigint, dias_p50_ate_converter int,
  custo_lead numeric, custo_matricula numeric,
  ltv_estimado numeric, retorno_x numeric
) language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.radar_trafego_gate_ok() then
    raise exception 'acesso_restrito_custo_de_midia' using errcode = '42501';
  end if;

  if (p_de is null) <> (p_ate is null) then
    raise exception 'periodo_incompleto: informe p_de E p_ate, ou nenhum dos dois';
  end if;
  if p_de is not null and p_de > p_ate then
    raise exception 'periodo_invertido: p_de (%) e depois de p_ate (%)', p_de, p_ate;
  end if;

  return query
  with janela as (
    -- periodo FECHADO quando pedido; senao a janela rolante de sempre
    select coalesce(p_de, (current_date - p_dias)::date) de,
           coalesce(p_ate, (current_date - p_maturidade_dias)::date) ate
  ),
  atraso as (
    -- quanto tempo o lead pago leva para virar matricula. MEDIDO, nao chutado
    select coalesce(
      percentile_cont(0.5) within group (
        order by (l.data_conversao - (l.created_at at time zone 'America/Sao_Paulo')::date))::int,
      8) p50
      from public.leads l
     where l.converteu and l.data_conversao is not null
       and l.canal_origem_id in (1, 2, 3)
       and l.created_at >= current_date - 365
       and (l.data_conversao - (l.created_at at time zone 'America/Sao_Paulo')::date) >= 0
  ),
  base as (
    select (case
              when coalesce(c.nome,'SEM ORIGEM') = 'Site' then 'Google'
              when coalesce(c.nome,'SEM ORIGEM') in ('Instagram','Facebook')
                then 'Instagram/Facebook'
              else coalesce(c.nome,'SEM ORIGEM') end)::text canal,
           l.id, l.converteu, l.experimental_agendada,
           -- imaturidade e contra HOJE, nunca contra o fim da janela: o que
           -- importa e se o lead ja teve tempo, e tempo passa depois do periodo
           ((l.created_at at time zone 'America/Sao_Paulo')::date
              > current_date - (select p50 from atraso)) imaturo,
           exists (select 1 from public.lead_experimentais x
                    where x.lead_id = l.id
                      and x.status in ('experimental_realizada','convertido')) fez_exp
      from public.leads l
      left join public.canais_origem c on c.id = l.canal_origem_id, janela j
     where (l.created_at at time zone 'America/Sao_Paulo')::date between j.de and j.ate
  ),
  gasto as (
    select v.plataforma, round(sum(v.gasto),2) total, count(distinct v.dia)::int dias
      from public.vw_ads_gasto_diario_v1 v, janela j
     where v.dia between j.de and j.ate
     group by v.plataforma
  ),
  ltv as (
    select (percentile_cont(0.5) within group (order by nullif(a.valor_parcela,0))
            * 12.2)::numeric(10,2) v
      from public.alunos a where a.status = 'ativo'
  ),
  agg as (
    select b.canal, count(*)::bigint leads,
           count(*) filter (where b.experimental_agendada)::bigint agendou,
           count(*) filter (where b.fez_exp)::bigint realizou_exp,
           count(*) filter (where b.converteu)::bigint matriculas,
           count(*) filter (where b.imaturo)::bigint imaturos
      from base b group by b.canal
  ),
  liga as (
    -- UM canal por plataforma, sempre. Dois cobrando da mesma duplicam o gasto.
    select a.*, (case when a.canal = 'Instagram/Facebook' then 'meta'
                      when a.canal = 'Google' then 'google' end)::text plataforma
      from agg a
  )
  select l.canal, l.leads, l.agendou, l.realizou_exp, l.matriculas,
         round(100.0 * l.matriculas / nullif(l.leads,0), 1),
         g.total, coalesce(g.dias, 0),
         ((j.ate - j.de) + 1)::int,
         j.de, j.ate,
         l.imaturos, (select p50 from atraso),
         round(g.total / nullif(l.leads,0), 2),
         round(g.total / nullif(l.matriculas,0), 2),
         (l.matriculas * ltv.v)::numeric(12,2),
         case when g.total > 0 then round((l.matriculas * ltv.v) / g.total, 1) end
    from liga l
    left join gasto g on g.plataforma = l.plataforma
    cross join ltv
    cross join janela j
   order by l.matriculas desc;
end;
$fn$;

comment on function public.radar_trafego_canal_v1(int, int, date, date) is
  'Custo de midia por canal. Aceita PERIODO FECHADO (p_de/p_ate) ou janela rolante (p_dias/p_maturidade_dias). Quem pede uma competencia ("agosto") tem de receber p_de/p_ate — janela rolante NAO e proxy de mes (em 08/09 os "ultimos 30 dias" traziam 8 dias de setembro). GASTO vem de vw_ads_gasto_diario_v1 (fonte unica). Canal e agrupado por VERBA: Instagram+Facebook = uma linha (mesma conta do Meta, gasto indivisivel na fonte) e Site entra no Google (regra do Alf, 03/09) — dois canais cobrando da mesma plataforma DUPLICAM o gasto. custo_matricula e TETO quando leads_imaturos e parte relevante de leads (imaturidade medida contra HOJE, nao contra o fim da janela). gasto_dias_cobertos < janela_dias = foto de gasto incompleta: a captura do Meta so nasceu em 04/08/2026, entao agosto tem 28 dos 31 dias.';

revoke all on function public.radar_trafego_canal_v1(int, int, date, date) from public, anon;
grant execute on function public.radar_trafego_canal_v1(int, int, date, date)
  to authenticated, service_role;

-- ── prova ──────────────────────────────────────────────────────────────────
do $prova$
declare
  v_de date; v_ate date; v_janela int; v_cob int; v_g numeric; v_fonte numeric;
  v_rolante_de date; v_n int;
begin
  -- 1. periodo fechado devolve EXATAMENTE o periodo pedido
  select periodo_de, periodo_ate, janela_dias, gasto_dias_cobertos, gasto
    into v_de, v_ate, v_janela, v_cob, v_g
    from public.radar_trafego_canal_v1(null, null, date '2026-08-01', date '2026-08-31')
   where canal = 'Instagram/Facebook';
  if v_de <> date '2026-08-01' or v_ate <> date '2026-08-31' then
    raise exception 'periodo devolvido (% a %) nao e o pedido', v_de, v_ate;
  end if;
  if v_janela <> 31 then raise exception 'agosto tem 31 dias, funcao disse %', v_janela; end if;

  -- 2. a foto INCOMPLETA do Meta em agosto tem de aparecer, nao ser mascarada
  if v_cob >= v_janela then
    raise exception 'gasto_dias_cobertos=% em agosto — a captura do Meta so nasceu em 04/08, deveria faltar dia', v_cob;
  end if;

  -- 3. o gasto continua fechando com a fonte unica
  select round(sum(v.gasto),2) into v_fonte from public.vw_ads_gasto_diario_v1 v
   where v.plataforma = 'meta' and v.dia between date '2026-08-01' and date '2026-08-31';
  if abs(coalesce(v_g,0) - coalesce(v_fonte,0)) > 0.05 then
    raise exception 'gasto de agosto nao fecha: funcao=% fonte=%', v_g, v_fonte;
  end if;

  -- 4. sem p_de/p_ate o comportamento antigo continua IGUAL
  select periodo_de into v_rolante_de
    from public.radar_trafego_canal_v1(30, 0) where canal = 'Instagram/Facebook';
  if v_rolante_de <> (current_date - 30) then
    raise exception 'janela rolante mudou de comportamento: de=%', v_rolante_de;
  end if;

  -- 5. periodo pela metade e RECUSADO, nao adivinhado
  begin
    select count(*) into v_n from public.radar_trafego_canal_v1(30, 0, date '2026-08-01', null);
    raise exception 'aceitou p_de sem p_ate — deveria recusar';
  exception when others then
    if sqlerrm not like '%periodo_incompleto%' then raise; end if;
  end;

  raise notice 'prova ok: agosto % a % (% dias, % cobertos), gasto meta % = fonte %',
    v_de, v_ate, v_janela, v_cob, v_g, v_fonte;
end $prova$;
