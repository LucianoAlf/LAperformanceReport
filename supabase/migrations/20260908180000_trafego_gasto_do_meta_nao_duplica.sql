-- O gasto do Meta aparecia INTEIRO em duas linhas, e o custo por matricula era
-- lido como fato quando metade do denominador nao tinha tido tempo de converter.
-- (08/09/2026, a partir do relatorio que a Mila mandou ao Luciano as 14:49.)
--
-- 🔴 DEFEITO 1 — GASTO DO META CONTADO DUAS VEZES. `liga` mapeia Instagram e
--    Facebook para a MESMA plataforma ('meta') e o `left join gasto g on
--    g.plataforma = l.plataforma` cola o total inteiro em CADA uma. Medido na
--    janela de 30 dias:
--
--      Instagram  466 leads   gasto R$ 4.741,97
--      Facebook     1 lead    gasto R$ 4.741,97   ← o MESMO dinheiro
--
--    Somar as linhas dava R$ 9.483,94 — o dobro do que a casa gastou. E o custo
--    por lead do Facebook saia como R$ 4.741,97 (um lead).
--
--    ⚠️ A view `vw_ads_gasto_diario_v1` avisa no proprio COMMENT: *"FONTE UNICA
--       do custo — nao somar as tabelas cruas em consumidor novo"*. Ela cumpriu
--       o combinado; quem duplicou foi o consumidor, ao deixar dois canais
--       cobrarem da mesma plataforma.
--
--    CONSERTO: Instagram e Facebook viram UMA linha. Nao e escolha estetica —
--    e a MESMA regra que o Luciano ja declarou em 03/09 para o Site: *"Site e
--    Google e a mesma coisa... por isso site tem que puxar para dentro do
--    Google"*, porque **e a mesma verba**. Meta e uma verba so; o Gerenciador
--    nao separa Instagram de Facebook neste recorte (a tabela tem campanha, nao
--    posicionamento), entao ratear seria inventar numero. Em 30 dias o Facebook
--    trouxe **1 lead** contra 466 — a linha separada nao informava nada e
--    duplicava a verba.
--
-- 🔴 DEFEITO 2 — O DENOMINADOR AINDA NAO CONVERTEU, E NADA DIZIA ISSO. Medido
--    nos leads pagos de 365 dias, o tempo entre criar o lead e a matricula e:
--    **mediana 8 dias, p75 20, p90 46**. Na janela de 30 dias que a Mila leu:
--
--      Instagram  109 de 466 leads (23,4%) tinham menos de 8 dias
--                 237 de 466 (50,9%) tinham menos de 20 dias
--      Google      21 de 106 (19,8%) e 59 de 106 (55,7%)
--
--    Ou seja: **metade do denominador ainda nao tinha tido tempo de virar
--    matricula**, e o `custo_matricula` de R$ 1.185 foi lido como o custo real.
--    Ele e um TETO. O parametro `p_maturidade_dias` existe exatamente para isso
--    e o MCP da Mila o anula passando `?? 0`.
--
--    CONSERTO AQUI: a funcao passa a devolver `leads_imaturos` e
--    `dias_p50_ate_converter`, medidos, para que a resposta possa dizer de que
--    tamanho e a ressalva. ⚠️ **Nao mudo o default do MCP para 35**: isso
--    deslocaria a janela 35 dias para tras sem o usuario pedir, e quem pergunta
--    "os ultimos 30 dias" quer os ultimos 30 dias. O conserto e a resposta
--    dizer a verdade sobre o numero, nao trocar a pergunta.
--
-- 🔴 DEFEITO 3 — `janela_dias` dizia 30 e `gasto_dias_cobertos` dizia 31, na
--    mesma linha. `between de and ate` e inclusivo nas duas pontas: sao 31 dias.
--    Dois numeros para a mesma janela, discordando. Agora e o span real.
--
-- ⚠️ O QUE **NAO** MUDEI, DE PROPOSITO:
--    · `Site` → `Google` continua: e regra declarada pelo Luciano em 03/09.
--    · Lead SINTETICO (`origem_registro = 'sync_aluno'`) continua contando. Ha
--      decisao pendente do Luciano sobre tira-lo do denominador do funil, e
--      **nos canais pagos ele nem aparece**: medido nesta janela, Instagram,
--      Google e Facebook tem ZERO matricula sintetica. O peso esta todo em
--      'SEM ORIGEM' (12 das 21 matriculas) — que e leitura de atribuicao, nao
--      de midia. Mexer aqui sem a decisao seria antecipa-la num lugar que nao
--      e o dela.
--    · O LTV `mediana(parcela) * 12,2` fica: conferi contra `alunos_historico`
--      e a permanencia real e **mediana 12,0 meses** (media 15,2, n=176). A
--      constante tem base.
--
-- ⚠️ DROP+CREATE porque `returns table` muda de forma. Isso REABRE EXECUTE para
--    `anon` (ALTER DEFAULT PRIVILEGES do schema) — o revoke nominal abaixo nao
--    e opcional. ACL correta: {postgres=X, authenticated=X, service_role=X}.

drop function if exists public.radar_trafego_canal_v1(integer, integer);

create function public.radar_trafego_canal_v1(
  p_dias int default 180,
  p_maturidade_dias int default 35
) returns table (
  canal text, leads bigint, agendou bigint, realizou_exp bigint,
  matriculas bigint, conv_pct numeric,
  gasto numeric, gasto_dias_cobertos int, janela_dias int,
  leads_imaturos bigint, dias_p50_ate_converter int,
  custo_lead numeric, custo_matricula numeric,
  ltv_estimado numeric, retorno_x numeric
) language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.radar_trafego_gate_ok() then
    raise exception 'acesso_restrito_custo_de_midia' using errcode = '42501';
  end if;

  return query
  with janela as (
    select (current_date - p_dias)::date de,
           (current_date - p_maturidade_dias)::date ate
  ),
  -- ⚠️ Quanto tempo um lead pago leva para virar matricula. MEDIDO, nao chutado:
  --    e o que diz de que tamanho e a ressalva do denominador.
  atraso as (
    select coalesce(
      percentile_cont(0.5) within group (
        order by (l.data_conversao - (l.created_at at time zone 'America/Sao_Paulo')::date))::int,
      8) p50
      from public.leads l
     where l.converteu and l.data_conversao is not null
       and l.canal_origem_id in (1, 2, 3)          -- Instagram, Facebook, Google
       and l.created_at >= current_date - 365
       and (l.data_conversao - (l.created_at at time zone 'America/Sao_Paulo')::date) >= 0
  ),
  base as (
    -- 🔴 Canal AGRUPADO POR VERBA, nao por rede social. Instagram e Facebook sao
    --    a mesma conta do Meta e o gasto e indivisivel na fonte; mante-los
    --    separados fazia os dois cobrarem o total inteiro. Mesma regra do Site
    --    dentro do Google, declarada pelo Luciano em 03/09.
    select (case
              when coalesce(c.nome,'SEM ORIGEM') = 'Site' then 'Google'
              when coalesce(c.nome,'SEM ORIGEM') in ('Instagram','Facebook')
                then 'Instagram/Facebook'
              else coalesce(c.nome,'SEM ORIGEM') end)::text canal,
           l.id, l.converteu, l.experimental_agendada,
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
    -- 12,2 meses: conferido contra alunos_historico em 08/09 — permanencia real
    -- mediana 12,0 meses (media 15,2, n=176). A constante tem base medida.
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
    -- ⚠️ Cada plataforma tem AGORA um unico canal cobrando dela. Se um dia
    --    voltar a haver dois, o gasto volta a duplicar — a regra e: um canal
    --    por plataforma, sempre.
    select a.*, (case when a.canal = 'Instagram/Facebook' then 'meta'
                      when a.canal = 'Google' then 'google' end)::text plataforma
      from agg a
  )
  select l.canal, l.leads, l.agendou, l.realizou_exp, l.matriculas,
         round(100.0 * l.matriculas / nullif(l.leads,0), 1),
         g.total, coalesce(g.dias, 0),
         -- 🔴 span REAL da janela (inclusivo nas duas pontas), para nao discordar
         --    de `gasto_dias_cobertos` na mesma linha
         ((j.ate - j.de) + 1)::int,
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

comment on function public.radar_trafego_canal_v1(int, int) is
  'Custo de midia por canal na janela. GASTO vem de vw_ads_gasto_diario_v1 (fonte unica). ⚠️ Canal e agrupado por VERBA, nao por rede: Instagram+Facebook = uma linha (mesma conta do Meta, gasto indivisivel na fonte) e Site entra no Google (regra do Luciano, 03/09). Dois canais cobrando da mesma plataforma DUPLICAM o gasto — foi o bug de 03-08/09. ⚠️ `custo_matricula` e TETO quando `leads_imaturos` e parte relevante de `leads`: o lead pago leva `dias_p50_ate_converter` (mediana) para virar matricula, e quem entrou depois disso ainda nao teve chance. ⚠️ `gasto_dias_cobertos` = 0 significa "nao sei", nao "nao gastamos".';

revoke all on function public.radar_trafego_canal_v1(int, int) from public, anon;
grant execute on function public.radar_trafego_canal_v1(int, int)
  to authenticated, service_role;

-- ── prova ──────────────────────────────────────────────────────────────────
do $prova$
declare
  v_meta numeric; v_soma numeric; v_linhas int; v_im bigint; v_p50 int;
  v_janela int; v_cobertos int;
begin
  -- 1. o gasto do Meta aparece UMA vez so
  select count(*), sum(gasto) into v_linhas, v_soma
    from public.radar_trafego_canal_v1(30, 0) where gasto is not null;

  select round(sum(v.gasto), 2) into v_meta
    from public.vw_ads_gasto_diario_v1 v
   where v.dia between current_date - 30 and current_date;

  if abs(coalesce(v_soma,0) - coalesce(v_meta,0)) > 0.05 then
    raise exception 'gasto ainda nao fecha com a fonte unica: funcao=% fonte=%',
      v_soma, v_meta;
  end if;

  -- 2. nenhuma plataforma pode ter dois canais cobrando dela
  if exists (
    select 1 from public.radar_trafego_canal_v1(30, 0) r
     where r.gasto is not null
     group by r.gasto having count(*) > 1) then
    raise exception 'ha duas linhas com o mesmo gasto — a duplicacao voltou';
  end if;

  -- 3. a imaturidade e reportada e nao e vazia (a janela termina hoje)
  select leads_imaturos, dias_p50_ate_converter, janela_dias, gasto_dias_cobertos
    into v_im, v_p50, v_janela, v_cobertos
    from public.radar_trafego_canal_v1(30, 0)
   where canal = 'Instagram/Facebook';

  if v_im is null or v_im = 0 then
    raise exception 'leads_imaturos veio %, mas a janela termina hoje — a prova estaria vazia', v_im;
  end if;
  if v_p50 is null or v_p50 <= 0 then
    raise exception 'dias_p50_ate_converter invalido: %', v_p50;
  end if;

  -- 4. janela_dias e gasto_dias_cobertos nao podem discordar por construcao
  if v_cobertos > v_janela then
    raise exception 'gasto cobre % dias numa janela de % — os dois numeros discordam',
      v_cobertos, v_janela;
  end if;

  raise notice 'prova: gasto=% (fonte %), % linhas com gasto, imaturos=%, p50=%d, janela=% dias, cobertos=%',
    v_soma, v_meta, v_linhas, v_im, v_p50, v_janela, v_cobertos;
end $prova$;
