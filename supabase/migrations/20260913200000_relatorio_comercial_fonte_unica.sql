-- FONTE ÚNICA DO COMERCIAL (13/09/2026)
--
-- POR QUE: o mesmo rótulo saía com três definições e duas fórmulas.
--   "Experimentais realizadas" — diário lia o snapshot do Emusys (22 em Recreio/set),
--   o mensal lia o DENOMINADOR da taxa exp→mat (presença confirmada: 51 em ago),
--   a Mila e a v2 canônica liam o status operacional do CRM (27 / 61).
--   "Ticket médio das parcelas" — o diário e o front seguem REGRAS-DE-NEGOCIO §6.6
--   (soma das parcelas positivas / pessoas; o 2º curso soma no numerador), mas a
--   Mila e o builder mensal tiravam a média por linha `conta` — o 2º curso do
--   Henrique (R$ 400, Recreio/set) ficava fora: 407,14 contra 464,29 no diário.
--   O comparativo do front contava `experimental_agendada` (66) como "experimentais".
--
-- O QUE MUDA (uma fonte para todos os leitores):
--   1. `matriculas_comerciais_lista_v1` / `get_matriculas_comerciais_resumo_v1`:
--      a lista agrupada por pessoa+dia e os tickets §6.6 — lift literal do builder
--      mensal, com o 2º curso do mesmo dia entrando nas `parcelas`.
--   2. `get_kpis_comercial_competencia_v1`: os números de uma competência —
--      fechamento oficial (snapshots) quando existe, senão ao vivo (v2 canônica +
--      conciliação v2 + resumo acima). Diário, mensal, matrículas, comparativo,
--      front e Mila leem daqui.
--   3. Builder mensal passa a publicar `experimentais` = status operacional e
--      `experimentais_confirmadas` = denominador da taxa; lista/tickets pela função 1.
--   4. Retificação append-only de AGOSTO/2026 (3 unidades) só na definição de experimentais
--      (lista e tickets ficam como a foto de 01/09 — ver bloco 5).
--   5. `mila_numeros_do_mes_v1` lê a função 2 (ticket §6.6, funil da conciliação).
--   6. Geradores de texto dos relatórios de MATRÍCULAS e COMPARATIVO (front e Mila).
--   7. Laço 1/2/3 das cutucadas por DM (`radar_entregas` deixa de ficar vazia).
--   8. Link oficial do LA Report para colaborador autorizado.
--
-- ⚠️ Paridade medida antes de escrever: v2 viva x `matriculas_comerciais_v1` viva =
--    12/12 células iguais (jun–set × 3 unidades). As diferenças contra o snapshot
--    de Barra/jun-jul são deriva de dados desde o fechamento, não predicado.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. helpers
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.fmt_brl_v1(p_valor numeric)
returns text
language sql
immutable
as $$
  -- ',' e '.' no padrão do to_char são literais (independem de lc_numeric);
  -- o translate troca os dois de uma vez: 1234.5 -> 1.234,50
  select translate(to_char(coalesce(p_valor, 0), 'FM999,999,999,990.00'), ',.', '.,')
$$;

create or replace function public.relatorio_variacao_texto_v1(p_atual numeric, p_anterior numeric)
returns text
language sql
immutable
as $$
  -- Mesma régua do front (ComercialPage): anterior 0 => 0,0%; 1 casa decimal; seta.
  select 'Variação: *'
      || case when v > 0 then '+' else '' end || round(v, 1)::text || '%* '
      || case when v > 0 then '📈' when v < 0 then '📉' else '➡️' end
    from (select case when coalesce(p_anterior, 0) > 0
                      then (coalesce(p_atual, 0) - p_anterior) / p_anterior * 100
                      else 0 end as v) x
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. lista canônica de matrículas comerciais (agrupada por pessoa + dia)
-- ─────────────────────────────────────────────────────────────────────────────
-- Lift do bloco `base`+`agrupadas` de montar_relatorio_comercial_mensal_payload_sem_adicionais_v1,
-- com UMA diferença deliberada: o 2º curso do mesmo dia ENTRA no grupo (só não conta como
-- matrícula). É o que o relatório diário e o front já faziam e o que §6.6 manda.
-- `p_criado_ate` é o corte do fechamento (created_at <= capturado_em), para o mensal
-- reproduzir a foto do mês; null = ao vivo.
create or replace function public.matriculas_comerciais_lista_v1(
  p_unidade_id uuid,
  p_de date,
  p_ate_exclusivo date,
  p_criado_ate timestamptz default null
)
returns table (
  unidade_id uuid,
  id integer,
  nome text,
  idade integer,
  segmento text,
  data_matricula date,
  cursos text,
  professores text,
  professores_experimentais text,
  formas_pagamento text,
  canal text,
  hunter text,
  valor_passaporte numeric,
  valor_parcela numeric,
  parcelas jsonb,
  qtd_cursos integer
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      a.id,
      a.unidade_id,
      a.nome::text as nome,
      a.idade_atual,
      a.data_matricula,
      coalesce(a.valor_passaporte, 0)::numeric as valor_passaporte,
      coalesce(a.valor_parcela, 0)::numeric as valor_parcela,
      coalesce(a.is_segundo_curso, false) as is_segundo_curso,
      c.nome::text as curso_nome,
      pf.nome::text as professor_nome,
      coalesce(pe.nome, pel.nome)::text as professor_experimental_nome,
      fp.nome::text as forma_pagamento,
      coalesce(coa.nome, col.nome, 'Nao informado')::text as canal_nome,
      u.hunter_nome::text as hunter_nome,
      coalesce(
        nullif(a.emusys_student_id, ''),
        'nome:' || lower(regexp_replace(trim(coalesce(a.nome, '')), '\s+', ' ', 'g'))
          || '|tel:' || regexp_replace(coalesce(nullif(a.telefone, ''), a.responsavel_telefone, ''), '\D', '', 'g')
      ) as pessoa_key,
      (
        coalesce(a.is_segundo_curso, false) = false
        and coalesce(c.is_projeto_banda, false) = false
        and lower(coalesce(c.nome, '')) not like '%banda%'
        and lower(coalesce(c.nome, '')) not like '%canto coral%'
        and upper(coalesce(tm.codigo, '')) not in ('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA', 'SEGUNDO_CURSO', 'TRANSFERENCIA')
        and (coalesce(tm.conta_como_pagante, false) = true or coalesce(tm.entra_ticket_medio, false) = true)
        and coalesce(a.valor_parcela, 0) > 0
      ) as principal
    from public.alunos a
    join public.unidades u on u.id = a.unidade_id
    left join public.cursos c on c.id = a.curso_id
    left join public.tipos_matricula tm on tm.id = a.tipo_matricula_id
    left join public.professores pf on pf.id = a.professor_atual_id
    left join public.professores pe on pe.id = a.professor_experimental_id
    left join public.formas_pagamento fp on fp.id = a.forma_pagamento_id
    left join public.canais_origem coa on coa.id = a.canal_origem_id
    left join lateral (
      select l.canal_origem_id, l.professor_experimental_id
      from public.leads l
      where l.unidade_id = a.unidade_id
        and (p_criado_ate is null or l.created_at <= p_criado_ate)
        and (
          l.aluno_id = a.id
          or (nullif(a.emusys_lead_id, '') ~ '^[0-9]+$' and l.emusys_lead_id = a.emusys_lead_id::integer)
        )
      order by (l.aluno_id = a.id) desc, l.created_at desc, l.id desc
      limit 1
    ) lead on true
    left join public.canais_origem col on col.id = lead.canal_origem_id
    left join public.professores pel on pel.id = lead.professor_experimental_id
    where (p_unidade_id is null or a.unidade_id = p_unidade_id)
      and (p_unidade_id is not null or u.ativo = true)
      and a.data_matricula >= p_de
      and a.data_matricula < p_ate_exclusivo
      and (p_criado_ate is null or a.created_at <= p_criado_ate)
      and a.arquivado_em is null
      and lower(coalesce(a.status, '')) not in ('excluido', 'excluida', 'cancelado', 'cancelada')
  ),
  grupos as (
    select
      b.unidade_id,
      b.data_matricula,
      b.pessoa_key,
      bool_or(b.principal) as tem_principal,
      (array_agg(b.id order by b.is_segundo_curso, b.id) filter (where b.principal))[1] as id,
      (array_agg(b.nome order by b.is_segundo_curso, b.id) filter (where b.principal))[1] as nome,
      max(b.idade_atual) as idade,
      string_agg(distinct b.curso_nome, ' e ' order by b.curso_nome) as cursos,
      string_agg(distinct b.professor_nome, ' e ' order by b.professor_nome) as professores,
      string_agg(distinct b.professor_experimental_nome, ' e ' order by b.professor_experimental_nome) as professores_experimentais,
      string_agg(distinct b.forma_pagamento, ' e ' order by b.forma_pagamento) as formas_pagamento,
      (array_agg(b.canal_nome order by b.is_segundo_curso, b.id) filter (where b.principal))[1] as canal,
      max(b.hunter_nome) as hunter,
      -- passaporte é da matrícula PRINCIPAL (o 2º curso não vende outro passaporte)
      (array_agg(b.valor_passaporte order by b.is_segundo_curso, b.id) filter (where b.principal))[1] as valor_passaporte,
      -- parcelas: TODAS as positivas do grupo, 2º curso incluído (§6.6)
      sum(b.valor_parcela) filter (where b.valor_parcela > 0) as valor_parcela,
      coalesce(jsonb_agg(b.valor_parcela order by b.is_segundo_curso, b.id) filter (where b.valor_parcela > 0), '[]'::jsonb) as parcelas,
      count(*)::integer as qtd_cursos
    from base b
    group by b.unidade_id, b.data_matricula, b.pessoa_key
  )
  select
    g.unidade_id,
    g.id,
    g.nome,
    g.idade,
    case when g.idade is null then null when g.idade <= 11 then 'LAMK' else 'EMLA' end as segmento,
    g.data_matricula,
    g.cursos,
    g.professores,
    g.professores_experimentais,
    g.formas_pagamento,
    g.canal,
    g.hunter,
    coalesce(g.valor_passaporte, 0) as valor_passaporte,
    coalesce(g.valor_parcela, 0) as valor_parcela,
    g.parcelas,
    g.qtd_cursos
  from grupos g
  where g.tem_principal
  order by g.data_matricula, g.nome, g.id
$$;

comment on function public.matriculas_comerciais_lista_v1(uuid, date, date, timestamptz) is
  'FONTE ÚNICA da lista de matrículas comerciais (uma linha por pessoa+dia; 2º curso do mesmo dia entra nas parcelas, não conta como matrícula). p_criado_ate = corte do fechamento (null = ao vivo). Consumida por get_matriculas_comerciais_resumo_v1.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. resumo: contagens + tickets §6.6 + distribuições + lista
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_matriculas_comerciais_resumo_v1(
  p_unidade_id uuid,
  p_de date,
  p_ate_exclusivo date,
  p_criado_ate timestamptz default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with g as (
    select * from public.matriculas_comerciais_lista_v1(p_unidade_id, p_de, p_ate_exclusivo, p_criado_ate)
  ),
  tot as (
    select count(*)::int as n,
           count(*) filter (where segmento = 'LAMK')::int as lamk,
           count(*) filter (where segmento = 'EMLA')::int as emla,
           coalesce(sum(valor_passaporte) filter (where valor_passaporte > 0), 0) as tp,
           count(*) filter (where valor_passaporte > 0)::int as qp,
           coalesce(sum(valor_parcela) filter (where valor_parcela > 0), 0) as tpar,
           count(*) filter (where valor_parcela > 0)::int as qpar
    from g
  ),
  canal as (
    select canal as nome, count(*)::int as quantidade from g group by canal
  ),
  curso as (
    select curso as nome, count(*)::int as quantidade
    from g cross join lateral regexp_split_to_table(coalesce(g.cursos, 'Nao informado'), '\s+e\s+') curso
    group by curso
  )
  select jsonb_build_object(
    'regra', 'REGRAS-DE-NEGOCIO §6.6: ticket = soma das parcelas positivas / pessoas com parcela positiva; o 2º curso soma no numerador e não cria denominador',
    'periodo', jsonb_build_object('de', p_de, 'ate_exclusivo', p_ate_exclusivo, 'criado_ate', p_criado_ate),
    'matriculas', tot.n,
    'lamk', tot.lamk,
    'emla', tot.emla,
    'total_passaportes', round(tot.tp, 2),
    'qtd_passaportes', tot.qp,
    'ticket_medio_passaporte', case when tot.qp > 0 then round(tot.tp / tot.qp, 2) else 0 end,
    'total_parcelas', round(tot.tpar, 2),
    'qtd_parcelas', tot.qpar,
    'ticket_medio_parcela', case when tot.qpar > 0 then round(tot.tpar / tot.qpar, 2) else 0 end,
    'por_canal', (select coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'quantidade', quantidade) order by quantidade desc, nome), '[]'::jsonb) from canal),
    'por_curso', (select coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'quantidade', quantidade) order by quantidade desc, nome), '[]'::jsonb) from curso),
    'lista', (select coalesce(jsonb_agg(to_jsonb(g) order by g.data_matricula, g.nome, g.id), '[]'::jsonb) from g)
  )
  from tot
$$;

comment on function public.get_matriculas_comerciais_resumo_v1(uuid, date, date, timestamptz) is
  'FONTE ÚNICA de contagem, tickets (§6.6) e lista das matrículas comerciais de um período. Lida pelo relatório diário (edge), pelo builder mensal, pelo relatório de matrículas, pelo comparativo e pela Mila.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. os números de UMA competência: fechamento oficial quando existe, senão ao vivo
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_kpis_comercial_competencia_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_papel text := coalesce(auth.role(), 'postgres');
  v_de date;
  v_ate date;
  v_com public.fechamento_mensal_snapshots%rowtype;
  v_men public.fechamento_mensal_snapshots%rowtype;
  v_un public.unidades%rowtype;
  v_k jsonb; v_res jsonb; v_lista jsonb := '[]'::jsonb; v_v2 jsonb := '{}'::jsonb; v_c jsonb; v_r jsonb;
  v_leads int := 0; v_exp int := 0; v_conf int := 0; v_faltas int := 0; v_visitas int := 0;
  v_mat int := 0; v_mat_lista int := 0; v_conv int := 0; v_pend int := 0;
  v_tp numeric := 0; v_qp int := 0; v_tpar numeric := 0; v_qpar int := 0;
  v_taxa_exp_mat numeric; v_origem text := 'vivo'; v_fontes jsonb := '{}'::jsonb;
  v_partes jsonb := '[]'::jsonb; v_todas boolean; u record;
begin
  if p_ano is null or p_mes is null or p_mes not between 1 and 12 then
    raise exception 'COMPETENCIA_INVALIDA';
  end if;
  -- Guarda de escopo para o front. `current_user` dentro de SECURITY DEFINER é o dono,
  -- então a régua é o papel do JWT: anon nunca; authenticated só admin (consolidado)
  -- ou unidade própria; service_role/postgres (Mila, edge, cron) passam.
  if v_papel = 'anon' then
    raise exception 'NAO_AUTORIZADO';
  end if;
  if v_papel = 'authenticated' then
    if p_unidade_id is null then
      if not public.is_admin() then raise exception 'NAO_AUTORIZADO_CONSOLIDADO'; end if;
    elsif not (public.is_admin() or p_unidade_id in (select public.get_user_unidade_ids())) then
      raise exception 'NAO_AUTORIZADO_UNIDADE';
    end if;
  end if;

  v_de := make_date(p_ano, p_mes, 1);
  v_ate := (v_de + interval '1 month')::date;

  -- REDE: soma dos fechamentos quando TODAS as unidades ativas fecharam; senão ao vivo.
  if p_unidade_id is null then
    for u in select id from public.unidades where ativo order by nome loop
      v_partes := v_partes || jsonb_build_array(public.get_kpis_comercial_competencia_v1(u.id, p_ano, p_mes));
    end loop;
    select bool_and(coalesce((x->>'fechado')::boolean, false)) into v_todas from jsonb_array_elements(v_partes) x;
    if coalesce(v_todas, false) then
      v_origem := 'fechamento';
      select sum((x#>>'{kpis,leads}')::int), sum((x#>>'{kpis,experimentais_realizadas}')::int),
             sum((x#>>'{kpis,experimentais_confirmadas}')::int), sum((x#>>'{kpis,faltas}')::int),
             sum((x#>>'{kpis,visitas}')::int), sum((x#>>'{kpis,matriculas}')::int),
             sum((x#>>'{kpis,conversoes_exp_mat}')::int), sum((x#>>'{kpis,pendencias_conciliacao}')::int),
             sum((x#>>'{kpis,total_passaportes}')::numeric), sum((x#>>'{matriculas,qtd_passaportes}')::int),
             sum((x#>>'{kpis,total_parcelas}')::numeric), sum((x#>>'{matriculas,qtd_parcelas}')::int),
             sum((x#>>'{matriculas,lista_total}')::int)
        into v_leads, v_exp, v_conf, v_faltas, v_visitas, v_mat, v_conv, v_pend, v_tp, v_qp, v_tpar, v_qpar, v_mat_lista
        from jsonb_array_elements(v_partes) x;
      v_lista := (select coalesce(jsonb_agg(i), '[]'::jsonb)
                    from jsonb_array_elements(v_partes) x, jsonb_array_elements(x#>'{matriculas,lista}') i);
      v_fontes := jsonb_build_object('consolidado_de', (select jsonb_agg(x->'fontes') from jsonb_array_elements(v_partes) x));
    end if;
  else
    select * into v_un from public.unidades where id = p_unidade_id;
    if not found then raise exception 'UNIDADE_INVALIDA'; end if;

    select * into v_com
      from public.fechamento_mensal_snapshots s
     where s.ano = p_ano and s.mes = p_mes and s.escopo = 'unidade' and s.unidade_id = p_unidade_id
       and s.dominio = 'comercial' and s.status in ('aprovado', 'fechado', 'retificado')
     order by s.versao desc limit 1;
    select * into v_men
      from public.fechamento_mensal_snapshots s
     where s.ano = p_ano and s.mes = p_mes and s.escopo = 'unidade' and s.unidade_id = p_unidade_id
       and s.dominio = 'relatorio_comercial_mensal' and s.status in ('aprovado', 'fechado', 'retificado')
     order by s.versao desc limit 1;

    if v_com.id is not null and v_men.id is not null then
      v_origem := 'fechamento';
      v_k := coalesce(v_com.payload->'kpis', v_com.payload, '{}'::jsonb);
      v_res := coalesce(v_men.payload->'resumo', '{}'::jsonb);
      v_lista := coalesce(v_men.payload->'matriculas', '[]'::jsonb);
      v_leads := coalesce((v_res->>'leads')::int, (v_k->>'leads_entrantes')::int, 0);
      -- status operacional vem da v2 CONGELADA (chave inequívoca); em payloads antigos
      -- `resumo.experimentais` era o denominador (presença confirmada).
      v_exp := coalesce((v_k->>'experimentais_realizadas_status_operacional')::int, (v_res->>'experimentais')::int, 0);
      v_conf := coalesce((v_res->>'experimentais_confirmadas')::int, (v_res->>'experimentais')::int, 0);
      v_faltas := coalesce((v_res->>'faltas')::int, 0);
      v_visitas := coalesce((v_res->>'visitas')::int, 0);
      v_mat := coalesce((v_res->>'matriculas')::int, (v_k->>'matriculas_comerciais_principais')::int, 0);
      v_conv := coalesce((v_res->>'conversoes_exp_mat')::int, 0);
      v_pend := coalesce((v_res->>'pendencias_conciliacao')::int, 0);
      v_tp := coalesce((v_res->>'total_passaportes')::numeric, 0);
      v_tpar := coalesce((v_res->>'total_parcelas')::numeric, 0);
      select count(*) filter (where coalesce((i->>'valor_passaporte')::numeric, 0) > 0),
             count(*) filter (where coalesce((i->>'valor_parcela')::numeric, 0) > 0),
             count(*)
        into v_qp, v_qpar, v_mat_lista
        from jsonb_array_elements(v_lista) i;
      v_fontes := jsonb_build_object(
        'comercial', jsonb_build_object('snapshot_id', v_com.id, 'versao', v_com.versao),
        'relatorio_comercial_mensal', jsonb_build_object('snapshot_id', v_men.id, 'versao', v_men.versao));
    end if;
  end if;

  if v_origem = 'vivo' then
    v_v2 := public.get_kpis_comercial_canonicos_v2(p_unidade_id, p_ano, p_mes);
    v_k := coalesce(v_v2->'kpis', '{}'::jsonb);
    v_c := coalesce(public.get_conciliacao_experimentais_v2(p_unidade_id, p_ano, p_mes, 'mensal', null)->'resumo', '{}'::jsonb);
    v_r := public.get_matriculas_comerciais_resumo_v1(p_unidade_id, v_de, v_ate, null);
    v_leads := coalesce((v_k->>'leads_entrantes')::int, 0);
    v_exp := coalesce((v_k->>'experimentais_realizadas_status_operacional')::int, 0);
    v_conf := coalesce((v_c->>'denominador_taxa_exp_mat')::int, (v_k->>'experimentais_realizadas_presenca_confirmada')::int, 0);
    v_faltas := coalesce((v_k->>'experimentais_no_show')::int, 0);
    v_visitas := coalesce((v_k->>'visitas')::int, 0);
    v_mat := coalesce((v_k->>'matriculas_comerciais_principais')::int, 0);
    v_conv := coalesce((v_c->>'conversoes_exp_mat_canonicas')::int, 0);
    v_pend := coalesce((v_c->>'pendencias_taxa_exp_mat')::int, 0);
    v_tp := coalesce((v_r->>'total_passaportes')::numeric, 0);
    v_qp := coalesce((v_r->>'qtd_passaportes')::int, 0);
    v_tpar := coalesce((v_r->>'total_parcelas')::numeric, 0);
    v_qpar := coalesce((v_r->>'qtd_parcelas')::int, 0);
    v_mat_lista := coalesce((v_r->>'matriculas')::int, 0);
    v_lista := coalesce(v_r->'lista', '[]'::jsonb);
    v_taxa_exp_mat := (v_c->>'taxa_exp_mat_canonica')::numeric;
    v_fontes := jsonb_build_object(
      'kpis', 'get_kpis_comercial_canonicos_v2',
      'funil', 'get_conciliacao_experimentais_v2',
      'matriculas', 'get_matriculas_comerciais_resumo_v1');
  else
    v_taxa_exp_mat := case when v_conf > 0 then round(v_conv::numeric * 100 / v_conf, 1) end;
    -- complementos que o fechamento não congela (agendadas, canceladas, canais, cursos)
    v_v2 := public.get_kpis_comercial_canonicos_v2(p_unidade_id, p_ano, p_mes);
  end if;

  return jsonb_build_object(
    'ok', true,
    'origem', v_origem,
    'fechado', v_origem = 'fechamento',
    'competencia', to_char(v_de, 'MM/YYYY'),
    'ano', p_ano,
    'mes', p_mes,
    'unidade_id', p_unidade_id,
    'unidade', coalesce(v_un.nome, 'Consolidado'),
    'hunter', v_un.hunter_nome,
    'kpis', jsonb_build_object(
      'leads', v_leads,
      'experimentais_realizadas', v_exp,
      'experimentais_confirmadas', v_conf,
      'experimentais_agendadas', v_v2#>'{kpis,experimentais_agendadas_periodo}',
      'canceladas', v_v2#>'{kpis,experimentais_canceladas}',
      'faltas', v_faltas,
      'visitas', v_visitas,
      'matriculas', v_mat,
      'matriculas_na_lista', v_mat_lista,
      'conversoes_exp_mat', v_conv,
      'pendencias_conciliacao', v_pend,
      'total_passaportes', round(v_tp, 2),
      'ticket_medio_passaporte', case when v_qp > 0 then round(v_tp / v_qp, 2) else 0 end,
      'total_parcelas', round(v_tpar, 2),
      'ticket_medio_parcela', case when v_qpar > 0 then round(v_tpar / v_qpar, 2) else 0 end),
    'funil', jsonb_build_object(
      'lead_para_experimental', case when v_leads > 0 then round(v_exp::numeric * 100 / v_leads, 1) end,
      'experimental_para_matricula', v_taxa_exp_mat,
      'experimental_para_matricula_base', jsonb_build_object('conversoes', v_conv, 'denominador', v_conf, 'pendencias', v_pend),
      'lead_para_matricula', case when v_leads > 0 then round(v_mat::numeric * 100 / v_leads, 1) end),
    'matriculas', jsonb_build_object(
      'lista', v_lista,
      'lista_total', v_mat_lista,
      'qtd_parcelas', v_qpar,
      'qtd_passaportes', v_qp,
      'lamk', (select count(*) from jsonb_array_elements(v_lista) i where (i->>'idade') is not null and (i->>'idade')::int <= 11),
      'emla', (select count(*) from jsonb_array_elements(v_lista) i where (i->>'idade') is not null and (i->>'idade')::int > 11),
      'por_canal', (select coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'quantidade', quantidade) order by quantidade desc, nome), '[]'::jsonb)
                      from (select coalesce(i->>'canal', 'Nao informado') as nome, count(*)::int as quantidade
                              from jsonb_array_elements(v_lista) i group by 1) q),
      'por_curso', (select coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'quantidade', quantidade) order by quantidade desc, nome), '[]'::jsonb)
                      from (select curso as nome, count(*)::int as quantidade
                              from jsonb_array_elements(v_lista) i
                              cross join lateral regexp_split_to_table(coalesce(i->>'cursos', 'Nao informado'), '\s+e\s+') curso
                             group by curso) q)),
    'canais_do_mes', v_v2->'origem_canal',
    'cursos_do_mes', v_v2->'cursos_mais_procurados',
    'ressalvas', v_v2->'gaps',
    'divergencias', case when v_mat <> v_mat_lista
                         then jsonb_build_array(format('contagem canônica de matrículas %s ≠ lista %s', v_mat, v_mat_lista))
                         else '[]'::jsonb end,
    'fontes', v_fontes,
    'regra_ticket', 'REGRAS-DE-NEGOCIO §6.6: soma das parcelas positivas / pessoas com parcela positiva; 2º curso soma no numerador',
    'definicoes', jsonb_build_object(
      'experimentais_realizadas', 'status operacional do CRM (experimental_realizada ou convertido) — a mesma chave da v2 canônica',
      'experimentais_confirmadas', 'presença individual confirmada + vínculo (denominador da taxa experimental→matrícula, conciliação v2)')
  );
end;
$$;

comment on function public.get_kpis_comercial_competencia_v1(uuid, integer, integer) is
  'FONTE ÚNICA dos números comerciais de uma competência: fechamento oficial (snapshots comercial + relatorio_comercial_mensal) quando existe, senão ao vivo (v2 canônica + conciliação v2 + resumo de matrículas §6.6). unidade null = rede (soma dos fechamentos ou vivo consolidado).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. builder mensal: experimentais = status operacional; lista/tickets pela fonte única
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_def text;
  v_ini int;
  v_fim int;
  v_bloco text;
  v_n int;
  v_a text;
  v_anchor_ini text := E'  with base as (\n';
  v_anchor_fim text := E'  from agrupadas;\n';
  v_novo_bloco text;
begin
  select pg_get_functiondef('public.montar_relatorio_comercial_mensal_payload_sem_adicionais_v1'::regproc) into v_def;

  -- (a) lista + tickets: o bloco base/agrupadas (≈130 linhas) vira uma chamada
  v_n := (length(v_def) - length(replace(v_def, v_anchor_ini, ''))) / length(v_anchor_ini);
  if v_n <> 1 then raise exception 'BUILDER_ANCORA_INI: esperado 1, achado %', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, v_anchor_fim, ''))) / length(v_anchor_fim);
  if v_n <> 1 then raise exception 'BUILDER_ANCORA_FIM: esperado 1, achado %', v_n; end if;
  v_ini := strpos(v_def, v_anchor_ini);
  v_fim := strpos(v_def, v_anchor_fim);
  if v_fim <= v_ini then raise exception 'BUILDER_ANCORAS_INVERTIDAS'; end if;
  v_bloco := substr(v_def, v_ini, v_fim + length(v_anchor_fim) - v_ini);
  if strpos(v_bloco, 'pessoa_key') = 0 or strpos(v_bloco, 'v_qtd_parcela') = 0 or strpos(v_bloco, 'SNAPSHOT_COMERCIAL') > 0 then
    raise exception 'BUILDER_BLOCO_INESPERADO';
  end if;
  v_novo_bloco :=
       E'  -- FONTE ÚNICA (13/09/2026): lista e tickets vêm de get_matriculas_comerciais_resumo_v1,\n'
    || E'  -- a MESMA função que o relatório diário, o de matrículas, o comparativo e a Mila leem.\n'
    || E'  -- O corte created_at <= capturado_em continua sendo o do fechamento comercial.\n'
    || E'  v_resumo_matriculas := public.get_matriculas_comerciais_resumo_v1(\n'
    || E'    p_unidade_id, v_inicio, v_fim_exclusivo, v_comercial.capturado_em);\n'
    || E'  v_matriculas := coalesce(v_resumo_matriculas->''lista'', ''[]''::jsonb);\n'
    || E'  v_matriculas_total := coalesce((v_resumo_matriculas->>''matriculas'')::integer, 0);\n'
    || E'  v_total_passaporte := coalesce((v_resumo_matriculas->>''total_passaportes'')::numeric, 0);\n'
    || E'  v_qtd_passaporte := coalesce((v_resumo_matriculas->>''qtd_passaportes'')::integer, 0);\n'
    || E'  v_total_parcela := coalesce((v_resumo_matriculas->>''total_parcelas'')::numeric, 0);\n'
    || E'  v_qtd_parcela := coalesce((v_resumo_matriculas->>''qtd_parcelas'')::integer, 0);\n';
  v_def := left(v_def, v_ini - 1) || v_novo_bloco || substr(v_def, v_fim + length(v_anchor_fim));

  -- (b) declarações novas
  v_a := E'  v_qtd_parcela integer := 0;\n';
  v_n := (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a);
  if v_n <> 1 then raise exception 'BUILDER_DECL: esperado 1, achado %', v_n; end if;
  v_def := replace(v_def, v_a, v_a || E'  v_experimentais_confirmadas integer := 0;\n  v_resumo_matriculas jsonb := ''{}''::jsonb;\n');

  -- (c) "experimentais" = status operacional; o denominador da taxa vira campo próprio
  v_a := E'  v_experimentais := coalesce(\n'
      || E'    (v_kpis_gerencial->>''denominador_taxa_exp_mat'')::integer,\n'
      || E'    (v_kpis->>''experimentais_realizadas_presenca_confirmada'')::integer,\n'
      || E'    0\n'
      || E'  );\n';
  v_n := (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a);
  if v_n <> 1 then raise exception 'BUILDER_EXPERIMENTAIS: esperado 1, achado %', v_n; end if;
  v_def := replace(v_def, v_a,
       E'  -- "Experimentais realizadas" = status operacional do CRM (a MESMA chave da v2 canônica,\n'
    || E'  -- do relatório diário e da Mila). O denominador da taxa exp→mat segue sendo a presença\n'
    || E'  -- confirmada + vínculo (conciliação), publicado como experimentais_confirmadas.\n'
    || E'  v_experimentais := coalesce((v_kpis->>''experimentais_realizadas_status_operacional'')::integer, 0);\n'
    || E'  v_experimentais_confirmadas := coalesce(\n'
    || E'    (v_kpis_gerencial->>''denominador_taxa_exp_mat'')::integer,\n'
    || E'    (v_kpis->>''experimentais_realizadas_presenca_confirmada'')::integer,\n'
    || E'    0\n'
    || E'  );\n');

  -- (d) taxa exp→mat sobre o denominador confirmado; chaves novas no resumo
  v_a := E'      ''taxa_exp_mat'', case when v_experimentais > 0 then round(v_conversoes::numeric / v_experimentais * 100, 1) else null end,\n';
  v_n := (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a);
  if v_n <> 1 then raise exception 'BUILDER_TAXA: esperado 1, achado %', v_n; end if;
  v_def := replace(v_def, v_a,
    E'      ''taxa_exp_mat'', case when v_experimentais_confirmadas > 0 then round(v_conversoes::numeric / v_experimentais_confirmadas * 100, 1) else null end,\n');

  v_a := E'      ''experimentais'', v_experimentais,\n';
  v_n := (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a);
  if v_n <> 1 then raise exception 'BUILDER_RESUMO_EXP: esperado 1, achado %', v_n; end if;
  v_def := replace(v_def, v_a, v_a || E'      ''experimentais_confirmadas'', v_experimentais_confirmadas,\n');

  v_a := E'      ''ticket_medio_parcela'', case when v_qtd_parcela > 0 then round(v_total_parcela / v_qtd_parcela, 2) else 0 end\n';
  v_n := (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a);
  if v_n <> 1 then raise exception 'BUILDER_RESUMO_TICKET: esperado 1, achado %', v_n; end if;
  v_def := replace(v_def, v_a,
       E'      ''ticket_medio_parcela'', case when v_qtd_parcela > 0 then round(v_total_parcela / v_qtd_parcela, 2) else 0 end,\n'
    || E'      ''qtd_parcelas'', v_qtd_parcela,\n'
    || E'      ''qtd_passaportes'', v_qtd_passaporte\n');

  execute v_def;
  raise notice 'builder mensal comercial reescrito sobre a fonte única';
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. retificação append-only de AGOSTO/2026 (todas as unidades com fechamento comercial)
-- ─────────────────────────────────────────────────────────────────────────────
-- O QUE MUDA: resumo.experimentais (denominador -> status operacional), resumo.taxa_lead_exp e
-- resumo.experimentais_confirmadas (novo). taxa_exp_mat NÃO muda (mesmo numerador e denominador).
-- ⚠️ Lista e tickets NÃO são recalculados, de propósito: uma retificação corrige a definição,
--    não re-fotografa o cadastro. Ensaiado antes de escrever: recalcular ao vivo com o corte
--    do fechamento mudava DOIS valores de parcela editados depois de 01/09 (Barra 497->460,
--    CG 417->367) e nenhum grupo ganhava parcela de 2º curso — ou seja, a regra §6.6 não
--    altera agosto, e a deriva de cadastro não é assunto desta retificação.
-- Guardas: hash do snapshot, status operacional presente na v2 congelada, e escopo (fora das
-- três chaves declaradas, o payload sai byte a byte igual).
do $$
declare
  u record;
  v_snap public.fechamento_mensal_snapshots%rowtype;
  v_com public.fechamento_mensal_snapshots%rowtype;
  v_k jsonb; v_novo jsonb; v_novo_id uuid;
  v_exp_status int; v_conf_antes int; v_leads int;
  v_antes jsonb; v_depois jsonb;
  v_chaves_resumo text[] := array['experimentais', 'experimentais_confirmadas', 'taxa_lead_exp'];
begin
  if to_regclass('public.fechamento_mensal_snapshots') is null then
    raise notice 'sem fechamento_mensal_snapshots neste banco — retificação pulada';
    return;
  end if;

  for u in
    select distinct s.unidade_id
      from public.fechamento_mensal_snapshots s
     where s.ano = 2026 and s.mes = 8 and s.escopo = 'unidade' and s.dominio = 'relatorio_comercial_mensal'
  loop
    select * into v_snap
      from public.fechamento_mensal_snapshots s
     where s.ano = 2026 and s.mes = 8 and s.escopo = 'unidade' and s.unidade_id = u.unidade_id
       and s.dominio = 'relatorio_comercial_mensal'
     order by s.versao desc limit 1;
    if v_snap.payload ? 'retificacao_experimentais_e_ticket_2026_09' then
      raise notice 'unidade % já retificada (v%)', u.unidade_id, v_snap.versao;
      continue;
    end if;
    if v_snap.payload_hash is null or public.hash_jsonb_canonico(v_snap.payload) <> v_snap.payload_hash then
      raise exception 'RETIFICACAO_COMERCIAL_HASH_DIVERGENTE unidade %', u.unidade_id;
    end if;

    select * into v_com
      from public.fechamento_mensal_snapshots s
     where s.ano = 2026 and s.mes = 8 and s.escopo = 'unidade' and s.unidade_id = u.unidade_id
       and s.dominio = 'comercial' and s.status in ('aprovado', 'fechado')
     order by s.versao desc limit 1;
    if v_com.id is null then
      raise exception 'RETIFICACAO_COMERCIAL_SEM_SNAPSHOT_COMERCIAL unidade %', u.unidade_id;
    end if;
    v_k := coalesce(v_com.payload->'kpis', v_com.payload);
    v_exp_status := (v_k->>'experimentais_realizadas_status_operacional')::int;
    if v_exp_status is null then
      raise exception 'RETIFICACAO_COMERCIAL_SEM_STATUS_OPERACIONAL unidade %', u.unidade_id;
    end if;

    v_conf_antes := (v_snap.payload#>>'{resumo,experimentais}')::int;
    v_leads := coalesce((v_snap.payload#>>'{resumo,leads}')::int, 0);

    v_antes := jsonb_build_object(
      'experimentais', v_snap.payload#>'{resumo,experimentais}',
      'taxa_lead_exp', v_snap.payload#>'{resumo,taxa_lead_exp}');

    v_novo := v_snap.payload;
    v_novo := jsonb_set(v_novo, '{resumo,experimentais}', to_jsonb(v_exp_status));
    v_novo := jsonb_set(v_novo, '{resumo,experimentais_confirmadas}', to_jsonb(coalesce(v_conf_antes, 0)));
    v_novo := jsonb_set(v_novo, '{resumo,taxa_lead_exp}',
                to_jsonb(case when v_leads > 0 then round(v_exp_status::numeric / v_leads * 100, 1) else 0 end));

    v_depois := jsonb_build_object(
      'experimentais', v_novo#>'{resumo,experimentais}',
      'experimentais_confirmadas', v_novo#>'{resumo,experimentais_confirmadas}',
      'taxa_lead_exp', v_novo#>'{resumo,taxa_lead_exp}');

    v_novo := jsonb_set(v_novo, '{retificacao_experimentais_e_ticket_2026_09}', jsonb_build_object(
      'aplicado_em', now(),
      'snapshot_anterior', v_snap.id,
      'antes', v_antes,
      'depois', v_depois,
      'motivo', '"Experimentais realizadas" passa a ser o status operacional do CRM (a mesma chave da v2 canônica, '
             || 'do relatório diário e da Mila); o denominador da taxa exp->mat fica em experimentais_confirmadas. '
             || 'Lista e tickets preservados como a foto do fechamento.'));

    -- guarda de escopo: fora de resumo e do bloco de retificação, o payload sai byte a byte igual
    if (v_novo - 'resumo' - 'retificacao_experimentais_e_ticket_2026_09')
       is distinct from
       (v_snap.payload - 'resumo' - 'retificacao_experimentais_e_ticket_2026_09')
    then
      raise exception 'RETIFICACAO_COMERCIAL_ESCOPO_EXCEDIDO unidade %', u.unidade_id;
    end if;
    -- ⚠️ parênteses obrigatórios: `-` precede `->`, e `'resumo' - text[]` viraria cast de json
    if ((v_novo->'resumo') - v_chaves_resumo) is distinct from ((v_snap.payload->'resumo') - v_chaves_resumo) then
      raise exception 'RETIFICACAO_COMERCIAL_RESUMO_ESCOPO_EXCEDIDO unidade %', u.unidade_id;
    end if;

    insert into public.fechamento_mensal_snapshots (
      ano, mes, escopo, unidade_id, dominio, versao, status,
      fonte, payload, payload_hash, financeiro_realizado_disponivel,
      observacao, capturado_em, capturado_por,
      aprovado_em, aprovado_por, fechado_em, fechado_por
    ) values (
      2026, 8, 'unidade', u.unidade_id, 'relatorio_comercial_mensal', v_snap.versao + 1, 'fechado',
      'retificacao_experimentais_e_ticket_2026_09_v1', v_novo,
      public.hash_jsonb_canonico(v_novo), v_snap.financeiro_realizado_disponivel,
      format('retificacao append-only; snapshot anterior: %s', v_snap.id),
      v_snap.capturado_em, v_snap.capturado_por,
      now(), auth.uid(), now(), auth.uid()
    ) returning id into v_novo_id;

    insert into public.fechamento_mensal_auditoria (
      snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
    ) values (
      v_novo_id, 2026, 8, 'unidade', u.unidade_id, 'snapshot_gravado',
      jsonb_build_object(
        'dominio', 'relatorio_comercial_mensal',
        'snapshot_anterior_id', v_snap.id,
        'payload_anterior_hash', v_snap.payload_hash,
        'antes', v_antes,
        'depois', v_depois
      ), auth.uid()
    );

    raise notice 'retificado unidade %: v% -> v% | experimentais % -> % (confirmadas %)',
      u.unidade_id, v_snap.versao, v_snap.versao + 1, v_conf_antes, v_exp_status, v_conf_antes;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Mila: números do mês pela fonte única (ticket §6.6, funil da conciliação)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.mila_numeros_do_mes_v1(
  p_solicitante_telefone text,
  p_ano integer default (extract(year from (now() at time zone 'America/Sao_Paulo')))::integer,
  p_mes integer default (extract(month from (now() at time zone 'America/Sao_Paulo')))::integer,
  p_unidade_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'governanca'
as $function$
declare
  q record; v_un uuid; v_un_nome text; v_comp jsonb; v_dia jsonb; v_metas jsonb; v_k jsonb; v_f jsonb;
begin
  select * into q from governanca.quem_eh(p_solicitante_telefone) limit 1;
  if q.nome is null then return jsonb_build_object('ok', false, 'motivo', 'nao_autorizado'); end if;
  -- quem lidera a REDE nao tem unidade: nao e falta de dado, e escopo.
  if q.unidade_id is not null then
    v_un := q.unidade_id;   -- p_unidade_id IGNORADO de proposito: trava de escopo
  elsif p_unidade_id is not null then
    v_un := p_unidade_id;   -- rede pedindo uma unidade especifica
  else
    return (
      with porun as (
        select u.nome un, public.mila_numeros_do_mes_v1(p_solicitante_telefone, p_ano, p_mes, u.id) j
          from unidades u where u.ativo
      ), consol as (
        select public.get_kpis_comercial_competencia_v1(null, p_ano, p_mes) c
      )
      select jsonb_build_object(
        'ok', true, 'solicitante', q.nome,
        'escopo', 'a REDE - as 3 unidades juntas',
        'competencia', to_char(make_date(p_ano, p_mes, 1), 'MM/YYYY'),
        'fechado', (select coalesce((c->>'fechado')::boolean, false) from consol),
        'rede', (select jsonb_build_object(
          'leads', c#>'{kpis,leads}',
          'experimentais_realizadas', c#>'{kpis,experimentais_realizadas}',
          'experimentais_confirmadas', c#>'{kpis,experimentais_confirmadas}',
          'experimentais_agendadas', c#>'{kpis,experimentais_agendadas}',
          'faltas', c#>'{kpis,faltas}',
          'canceladas', c#>'{kpis,canceladas}',
          'visitas', c#>'{kpis,visitas}',
          'matriculas', c#>'{kpis,matriculas}',
          'passaportes_total', c#>'{kpis,total_passaportes}',
          'ticket_medio_passaporte', c#>'{kpis,ticket_medio_passaporte}',
          'ticket_medio_parcela', c#>'{kpis,ticket_medio_parcela}',
          'parcelas_contratadas', c#>'{kpis,total_parcelas}',
          'funil', c->'funil') from consol),
        'por_unidade', (select jsonb_object_agg(un, j) from porun),
        'regra_ticket', (select c->>'regra_ticket' from consol),
        'fonte', 'rede: get_kpis_comercial_competencia_v1 (fechamento oficial quando as 3 fecharam, senao ao vivo — a MESMA fonte dos relatorios); por_unidade: a mesma leitura que cada consultora recebe'
      ));
  end if;
  select nome into v_un_nome from unidades where id = v_un;

  -- 🔴 ZERO nao e "nao tenho o dado". O funil comercial tem um horizonte;
  --    antes dele o banco nao tem leads, e devolver 0 seria apresentar
  --    ausencia de medicao como medicao. Caso real: "0 matriculas em
  --    janeiro de 2019" com o funil comecando em 02/02/2026.
  -- ⚠️ Horizonte MEDIDO, nunca chumbado: data fixa envelhece e volta a mentir.
  declare
    v_horizonte date;
    v_fim_comp  date := (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date;
    v_hoje      date := (now() at time zone 'America/Sao_Paulo')::date;
  begin
    select min((created_at at time zone 'America/Sao_Paulo')::date) into v_horizonte from leads;
    if v_horizonte is not null and v_fim_comp < v_horizonte then
      return jsonb_build_object(
        'ok', true, 'sem_dado', true, 'solicitante', q.nome, 'unidade', v_un_nome,
        'competencia', to_char(make_date(p_ano, p_mes, 1), 'MM/YYYY'),
        'motivo', 'competencia_anterior_ao_historico',
        'historico_comeca_em', to_char(v_horizonte, 'DD/MM/YYYY'),
        'fonte', 'nao temos dado comercial dessa competencia — o funil no sistema comeca em '
                   || to_char(v_horizonte, 'DD/MM/YYYY') ||
                   '. Zero aqui seria ausencia de dado apresentada como medicao: diga que NAO TEM, nunca "foi zero".');
    end if;
    if make_date(p_ano, p_mes, 1) > v_hoje then
      return jsonb_build_object(
        'ok', true, 'sem_dado', true, 'solicitante', q.nome, 'unidade', v_un_nome,
        'competencia', to_char(make_date(p_ano, p_mes, 1), 'MM/YYYY'),
        'motivo', 'competencia_no_futuro',
        'fonte', 'essa competencia ainda nao comecou — nao ha o que medir.');
    end if;
  end;

  -- FONTE UNICA (13/09/2026): fechamento oficial quando existe, senao ao vivo —
  -- a mesma funcao que o relatorio diario, o mensal, o de matriculas e o comparativo leem.
  v_comp := public.get_kpis_comercial_competencia_v1(v_un, p_ano, p_mes);
  v_k := coalesce(v_comp->'kpis', '{}'::jsonb);
  v_f := coalesce(v_comp->'funil', '{}'::jsonb);
  v_dia := get_kpis_comercial_canonicos_v2(v_un, p_ano, p_mes, 'diario',
             (now() at time zone 'America/Sao_Paulo')::date);
  select jsonb_object_agg(tipo, valor) into v_metas
    from metas_kpi where unidade_id = v_un and ano = p_ano and mes = p_mes;
  v_metas := coalesce(v_metas, '{}'::jsonb);

  return jsonb_build_object(
    'ok', true, 'solicitante', q.nome, 'unidade', v_un_nome,
    'fechado', coalesce((v_comp->>'fechado')::boolean, false),
    'competencia', to_char(make_date(p_ano, p_mes, 1), 'MM/YYYY'),
    'mes', jsonb_build_object(
      'leads', v_k->'leads', 'meta_leads', v_metas->'leads',
      'experimentais_realizadas', v_k->'experimentais_realizadas', 'meta_experimentais', v_metas->'experimentais',
      'experimentais_confirmadas', v_k->'experimentais_confirmadas',
      'experimentais_agendadas', v_k->'experimentais_agendadas',
      'faltas', v_k->'faltas',
      'canceladas', v_k->'canceladas',
      'visitas', v_k->'visitas',
      'matriculas', v_k->'matriculas', 'meta_matriculas', v_metas->'matriculas',
      'ticket_medio_parcela', v_k->'ticket_medio_parcela', 'meta_ticket', v_metas->'ticket_parcela',
      'passaportes_total', v_k->'total_passaportes',
      'ticket_medio_passaporte', v_k->'ticket_medio_passaporte',
      'parcelas_contratadas', v_k->'total_parcelas'),
    'funil', jsonb_build_object(
      'lead_para_experimental', v_f->'lead_para_experimental',
      'meta_lead_para_experimental', v_metas->'taxa_lead_exp',
      'experimental_para_matricula', v_f->'experimental_para_matricula',
      'meta_experimental_para_matricula', v_metas->'taxa_exp_mat',
      'experimental_para_matricula_base', v_f->'experimental_para_matricula_base',
      'lead_para_matricula', v_f->'lead_para_matricula',
      'meta_lead_para_matricula', v_metas->'taxa_conversao'),
    'hoje', jsonb_build_object(
      'leads', v_dia #> '{kpis,leads_entrantes}',
      'experimentais_realizadas', v_dia #> '{kpis,experimentais_realizadas_status_operacional}',
      'faltas', v_dia #> '{kpis,experimentais_no_show}',
      'canceladas', v_dia #> '{kpis,experimentais_canceladas}',
      'matriculas', v_dia #> '{kpis,matriculas_comerciais_principais}',
      'passaportes_total', v_dia #> '{kpis,passaportes_total}'),
    'canais_do_mes', v_comp->'canais_do_mes', 'cursos_do_mes', v_comp->'cursos_do_mes',
    'ressalvas', v_comp->'ressalvas',
    'divergencias', v_comp->'divergencias',
    'regra_ticket', v_comp->>'regra_ticket',
    'definicoes', v_comp->'definicoes',
    'fonte', case
        when coalesce((v_comp->>'fechado')::boolean, false)
          then 'fechamento oficial do mes (o MESMO numero do relatorio mensal que a equipe recebeu)'
        when make_date(p_ano, p_mes, 1) =
             date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date
          then 'ao vivo — o mes corrente ainda nao fechou, entao o numero ainda muda (a MESMA fonte do relatorio diario)'
        -- ⚠️ passado SEM snapshot: nao e "ainda nao fechou", e "nunca fechou".
        --    Dizer que o numero "ainda muda" sobre um mes vencido e falso.
        else 'recalculado ao vivo: essa competencia NAO tem fechamento oficial no sistema, '
             'entao nao e o numero do relatorio — diga isso ao citar'
      end
  );
end $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. geradores de texto: RELATÓRIO DE MATRÍCULAS e COMPARATIVO (front e Mila leem daqui)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.relatorio_matriculas_texto_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_gerado_por text default null,
  p_solicitante_telefone text default null
)
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'governanca'
as $$
declare
  q record;
  v_un uuid := p_unidade_id;
  v_d jsonb; v_k jsonb; v_m jsonb; i jsonb;
  v_un_nome text; v_hunter text; v_t text := '';
  v_sep constant text := '━━━━━━━━━━━━━━━━━━━━━━';
  v_meses constant text[] := array['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
  v_agora timestamp := now() at time zone 'America/Sao_Paulo';
  n int := 0; v_parc text; v_pass text;
begin
  if p_solicitante_telefone is not null then
    select * into q from governanca.quem_eh(p_solicitante_telefone) limit 1;
    if q.nome is null then raise exception 'NAO_AUTORIZADO'; end if;
    if q.unidade_id is not null then v_un := q.unidade_id; end if;  -- trava de escopo
  end if;
  v_d := public.get_kpis_comercial_competencia_v1(v_un, p_ano, p_mes);
  v_k := v_d->'kpis';
  v_m := v_d->'matriculas';
  if v_un is null then
    v_un_nome := 'Consolidado'; v_hunter := 'Todos';
  else
    select u.nome, coalesce(u.hunter_nome, p_gerado_por, 'Comercial') into v_un_nome, v_hunter
      from public.unidades u where u.id = v_un;
  end if;

  v_t := v_sep || E'\n'
      || E'📋 *RELATÓRIO DE MATRÍCULAS*\n'
      || '🏢 *' || upper(v_un_nome) || E'*\n'
      || '📅 *' || v_meses[p_mes] || '/' || p_ano || E'*\n'
      || '👤 ' || v_hunter || E'\n'
      || v_sep || E'\n'
      || case when (v_d->>'fechado')::boolean then E'_Fonte: fechamento oficial do mês_\n\n'
              else E'_Fonte: ao vivo — mês em andamento_\n\n' end;

  v_t := v_t || E'📊 *RESUMO EXECUTIVO*\n' || v_sep || E'\n'
      || '✅ Total de Matrículas: *' || (v_k->>'matriculas') || E'*\n'
      || '🎨 LAMK (Kids): *' || (v_m->>'lamk') || E'*\n'
      || '🎸 EMLA (Adulto): *' || (v_m->>'emla') || E'*\n\n';

  v_t := v_t || E'💰 *VALORES FINANCEIROS*\n' || v_sep || E'\n'
      || 'Total Passaportes: *R$ ' || public.fmt_brl_v1((v_k->>'total_passaportes')::numeric) || E'*\n'
      || 'Total Parcelas: *R$ ' || public.fmt_brl_v1((v_k->>'total_parcelas')::numeric) || E'*\n'
      || 'Ticket Médio Pass.: *R$ ' || public.fmt_brl_v1((v_k->>'ticket_medio_passaporte')::numeric) || E'*\n'
      || 'Ticket Médio Parc.: *R$ ' || public.fmt_brl_v1((v_k->>'ticket_medio_parcela')::numeric) || E'*\n\n';

  v_t := v_t || E'📊 *ESTATÍSTICAS*\n' || v_sep || E'\n' || E'🔥 Por Canal:\n';
  if jsonb_array_length(coalesce(v_m->'por_canal', '[]'::jsonb)) = 0 then
    v_t := v_t || E'• Nenhuma matrícula\n';
  else
    for i in select x from jsonb_array_elements(v_m->'por_canal') x loop
      v_t := v_t || '• ' || (i->>'nome') || ': ' || (i->>'quantidade') || E'\n';
    end loop;
  end if;
  v_t := v_t || E'\n🎸 Por Curso:\n';
  if jsonb_array_length(coalesce(v_m->'por_curso', '[]'::jsonb)) = 0 then
    v_t := v_t || E'• Nenhuma matrícula\n';
  else
    for i in select x from jsonb_array_elements(v_m->'por_curso') x loop
      v_t := v_t || '• ' || (i->>'nome') || ': ' || (i->>'quantidade') || E'\n';
    end loop;
  end if;

  v_t := v_t || E'\n' || v_sep || E'\n📝 *LISTA DETALHADA*\n' || v_sep || E'\n\n';
  if jsonb_array_length(coalesce(v_m->'lista', '[]'::jsonb)) = 0 then
    v_t := v_t || E'Nenhuma matrícula comercial no período.\n\n';
  end if;
  for i in select x from jsonb_array_elements(coalesce(v_m->'lista', '[]'::jsonb)) x loop
    n := n + 1;
    select coalesce(string_agg('R$ ' || public.fmt_brl_v1(p::numeric), ' + '), 'R$ ' || public.fmt_brl_v1((i->>'valor_parcela')::numeric))
      into v_parc
      from jsonb_array_elements_text(coalesce(i->'parcelas', '[]'::jsonb)) p
     where p::numeric > 0;
    v_pass := 'R$ ' || public.fmt_brl_v1((i->>'valor_passaporte')::numeric);
    v_t := v_t
      || 'MAT. ' || lpad(n::text, 2, '0') || E'\n'
      || '📅 Data: ' || to_char((i->>'data_matricula')::date, 'DD/MM') || E'\n'
      || '👤 Aluno: ' || coalesce(i->>'nome', 'Não informado')
         || case when (i->>'idade') is not null and (i->>'idade')::int > 0 then ' (' || (i->>'idade') || ' anos)' else '' end || E'\n'
      || '🎵 Curso: ' || coalesce(nullif(i->>'cursos', ''), 'Não informado') || E'\n'
      || '👨‍🏫 Professor: ' || coalesce(nullif(i->>'professores', ''), 'Não informado') || E'\n'
      || '🎸 Prof. Experimental: ' || coalesce(nullif(i->>'professores_experimentais', ''), 'Não teve') || E'\n'
      || '📱 Canal: ' || coalesce(nullif(i->>'canal', ''), 'Não informado') || E'\n'
      || '👤 Hunter: ' || coalesce(nullif(i->>'hunter', ''), v_hunter) || E'\n'
      || '💵 Pass: ' || v_pass || E'\n'
      || '💵 Parc: ' || v_parc
         || case when nullif(i->>'formas_pagamento', '') is not null then ' (' || (i->>'formas_pagamento') || ')' else '' end
      || E'\n\n';
  end loop;

  v_t := v_t || v_sep || E'\n'
      || '📅 Gerado em: ' || to_char(v_agora, 'DD/MM/YYYY') || ' às ' || to_char(v_agora, 'FMHH24:MI') || E'\n'
      || v_sep;
  return v_t;
end;
$$;

create or replace function public.relatorio_comparativo_texto_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_ano_base integer,
  p_mes_base integer,
  p_gerado_por text default null,
  p_solicitante_telefone text default null
)
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'governanca'
as $$
declare
  q record;
  v_un uuid := p_unidade_id;
  v_a jsonb; v_b jsonb; ka jsonb; kb jsonb;
  v_un_nome text; v_hunter text; v_t text := '';
  v_sep constant text := '━━━━━━━━━━━━━━━━━━━━━━';
  v_meses constant text[] := array['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
  v_agora timestamp := now() at time zone 'America/Sao_Paulo';
  v_titulo text; v_ma text; v_mb text; v_horizonte date; v_base_sem_dado boolean := false;
begin
  if p_solicitante_telefone is not null then
    select * into q from governanca.quem_eh(p_solicitante_telefone) limit 1;
    if q.nome is null then raise exception 'NAO_AUTORIZADO'; end if;
    if q.unidade_id is not null then v_un := q.unidade_id; end if;
  end if;
  -- competência anterior ao horizonte do funil não tem dado — nunca "foi zero"
  select min((created_at at time zone 'America/Sao_Paulo')::date) into v_horizonte from public.leads;
  if v_horizonte is not null and (make_date(p_ano_base, p_mes_base, 1) + interval '1 month - 1 day')::date < v_horizonte then
    v_base_sem_dado := true;
  end if;

  v_a := public.get_kpis_comercial_competencia_v1(v_un, p_ano, p_mes);
  ka := v_a->'kpis';
  if not v_base_sem_dado then
    v_b := public.get_kpis_comercial_competencia_v1(v_un, p_ano_base, p_mes_base);
    kb := v_b->'kpis';
  else
    kb := '{}'::jsonb;
  end if;
  if v_un is null then
    v_un_nome := 'Consolidado'; v_hunter := 'Todos';
  else
    select u.nome, coalesce(u.hunter_nome, p_gerado_por, 'Comercial') into v_un_nome, v_hunter
      from public.unidades u where u.id = v_un;
  end if;
  v_titulo := case when p_ano_base = p_ano - 1 and p_mes_base = p_mes
                   then 'RELATÓRIO COMPARATIVO ANUAL' else 'RELATÓRIO COMPARATIVO MENSAL' end;
  v_ma := v_meses[p_mes]; v_mb := v_meses[p_mes_base];

  v_t := v_sep || E'\n'
      || '📊 *' || v_titulo || E'*\n'
      || '🏢 *' || upper(v_un_nome) || E'*\n'
      || '👤 ' || v_hunter || E'\n'
      || v_sep || E'\n\n'
      || '📅 *' || v_ma || '/' || p_ano || '* vs *' || v_mb || '/' || p_ano_base || E'*\n'
      || '_' || v_ma || ': ' || case when (v_a->>'fechado')::boolean then 'fechamento oficial' else 'ao vivo (parcial)' end
      || ' · ' || v_mb || ': ' || case when v_base_sem_dado then 'sem dado (o funil no sistema começa em ' || to_char(v_horizonte, 'DD/MM/YYYY') || ')'
                                      when (v_b->>'fechado')::boolean then 'fechamento oficial' else 'ao vivo (sem fechamento oficial)' end
      || E'_\n\n';

  if v_base_sem_dado then
    v_t := v_t || E'🎯 *LEADS*\n' || v_ma || ': *' || (ka->>'leads') || E'* | ' || v_mb || E': sem dado\n\n'
        || E'🎸 *EXPERIMENTAIS REALIZADAS*\n' || v_ma || ': *' || (ka->>'experimentais_realizadas') || E'* | ' || v_mb || E': sem dado\n\n'
        || E'🏫 *VISITAS*\n' || v_ma || ': *' || (ka->>'visitas') || E'* | ' || v_mb || E': sem dado\n\n'
        || E'✅ *MATRÍCULAS*\n' || v_ma || ': *' || (ka->>'matriculas') || E'* | ' || v_mb || E': sem dado\n\n'
        || E'💵 *TICKET MÉDIO DAS PARCELAS*\n' || v_ma || ': *R$ ' || public.fmt_brl_v1((ka->>'ticket_medio_parcela')::numeric) || E'* | ' || v_mb || E': sem dado\n\n';
  else
    v_t := v_t
      || E'🎯 *LEADS*\n'
      || v_ma || ': *' || (ka->>'leads') || '* | ' || v_mb || ': *' || (kb->>'leads') || E'*\n'
      || public.relatorio_variacao_texto_v1((ka->>'leads')::numeric, (kb->>'leads')::numeric) || E'\n\n'
      || E'🎸 *EXPERIMENTAIS REALIZADAS*\n'
      || v_ma || ': *' || (ka->>'experimentais_realizadas') || '* | ' || v_mb || ': *' || (kb->>'experimentais_realizadas') || E'*\n'
      || public.relatorio_variacao_texto_v1((ka->>'experimentais_realizadas')::numeric, (kb->>'experimentais_realizadas')::numeric) || E'\n\n'
      || E'🏫 *VISITAS*\n'
      || v_ma || ': *' || (ka->>'visitas') || '* | ' || v_mb || ': *' || (kb->>'visitas') || E'*\n'
      || public.relatorio_variacao_texto_v1((ka->>'visitas')::numeric, (kb->>'visitas')::numeric) || E'\n\n'
      || E'✅ *MATRÍCULAS*\n'
      || v_ma || ': *' || (ka->>'matriculas') || '* | ' || v_mb || ': *' || (kb->>'matriculas') || E'*\n'
      || public.relatorio_variacao_texto_v1((ka->>'matriculas')::numeric, (kb->>'matriculas')::numeric) || E'\n\n'
      || E'💵 *TICKET MÉDIO DAS PARCELAS*\n'
      || v_ma || ': *R$ ' || public.fmt_brl_v1((ka->>'ticket_medio_parcela')::numeric) || '* | ' || v_mb || ': *R$ ' || public.fmt_brl_v1((kb->>'ticket_medio_parcela')::numeric) || E'*\n'
      || public.relatorio_variacao_texto_v1((ka->>'ticket_medio_parcela')::numeric, (kb->>'ticket_medio_parcela')::numeric) || E'\n\n';
  end if;

  v_t := v_t || v_sep || E'\n'
      || '📅 Gerado em: ' || to_char(v_agora, 'DD/MM/YYYY') || E'\n'
      || v_sep;
  return v_t;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Mila por DM: registrar o que foi entregue e fechar o laço com 1 / 2 / 3
-- ─────────────────────────────────────────────────────────────────────────────
-- `radar_entregas` estava VAZIA (0 linhas com 945 sinais): não existia registro canônico
-- do que a consultora recebeu, então "ela respondeu 1" não tinha a que se referir.
create or replace function public.mila_registrar_entrega_dm_v1(
  p_solicitante_telefone text,
  p_origem text,
  p_itens jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'governanca'
as $$
declare
  q record; v_dest uuid; v_tel text; i jsonb; s record; v_n int := 0; v_rc int; v_dia text;
begin
  select * into q from governanca.quem_eh(p_solicitante_telefone) limit 1;
  if q.nome is null then return jsonb_build_object('ok', false, 'motivo', 'nao_autorizado'); end if;
  v_tel := regexp_replace(coalesce(p_solicitante_telefone, ''), '\D', '', 'g');
  select d.id into v_dest
    from public.radar_destinatarios d
   where d.agente = 'mila' and d.canal = 'dm'
     and regexp_replace(coalesce(d.destino, ''), '\D', '', 'g') = v_tel
   order by d.ativo desc, d.criado_em
   limit 1;
  if v_dest is null then
    return jsonb_build_object('ok', false, 'motivo', 'sem_destinatario', 'recado', 'sem linha em radar_destinatarios para este telefone');
  end if;
  v_dia := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  for i in select x from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) x loop
    if (i->>'sinal_id') is null then continue; end if;
    select v.* into s from public.vw_radar_sinal_vigencia_v1 v where v.id = (i->>'sinal_id')::uuid;
    if not found then continue; end if;
    insert into public.radar_entregas (destinatario_id, sinal_id, agente, canal, chave_idem, alvo_chave, status, mensagem, enviado_em)
    values (
      v_dest, s.id, 'mila', 'dm',
      'mila_dm|' || coalesce(p_origem, 'dm') || '|' || v_tel || '|' || v_dia || '|' || s.id,
      s.regra_codigo || '|' || coalesce(s.unidade_id::text, '') || '|' || coalesce(s.entidade_id::text, '') || '|' || coalesce(s.situacao, ''),
      'enviado', left(coalesce(i->>'quem', s.contexto), 160), now())
    on conflict (chave_idem) do nothing;
    get diagnostics v_rc = row_count;
    v_n := v_n + v_rc;
  end loop;
  return jsonb_build_object('ok', true, 'registradas', v_n, 'destinatario_id', v_dest);
end;
$$;

create or replace function public.mila_responder_cutucada_v1(
  p_solicitante_telefone text,
  p_opcao integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'governanca'
as $$
declare
  q record; v_dest uuid; v_tel text; v_ultimo timestamptz; r record; v_res jsonb;
  v_itens jsonb := '[]'::jsonb; v_nomes text[] := '{}'; v_ack text; v_apelido text;
begin
  select * into q from governanca.quem_eh(p_solicitante_telefone) limit 1;
  if q.nome is null then return jsonb_build_object('ok', false, 'motivo', 'nao_autorizado'); end if;
  if p_opcao not in (1, 2, 3) then return jsonb_build_object('ok', false, 'motivo', 'opcao_invalida'); end if;
  v_tel := regexp_replace(coalesce(p_solicitante_telefone, ''), '\D', '', 'g');
  select d.id into v_dest from public.radar_destinatarios d
   where d.agente = 'mila' and d.canal = 'dm' and regexp_replace(coalesce(d.destino, ''), '\D', '', 'g') = v_tel
   order by d.ativo desc, d.criado_em limit 1;
  if v_dest is null then return jsonb_build_object('ok', true, 'nada_pendente', true); end if;

  -- o ÚLTIMO lote entregue nas últimas 24h cujos sinais ainda estão abertos
  select max(e.enviado_em) into v_ultimo
    from public.radar_entregas e join public.radar_sinais s on s.id = e.sinal_id
   where e.destinatario_id = v_dest and e.agente = 'mila' and e.canal = 'dm' and e.status = 'enviado'
     and e.enviado_em >= now() - interval '24 hours'
     and s.status in ('aberto', 'triado', 'em_acao');
  if v_ultimo is null then return jsonb_build_object('ok', true, 'nada_pendente', true); end if;

  v_apelido := public.mila_apelido_v1(q.nome);
  for r in
    select s.id as sinal_id, s.regra_codigo, s.contexto, s.status,
           coalesce(l.nome, e.mensagem, split_part(s.contexto, ' ', 1)) as quem
      from public.radar_entregas e
      join public.radar_sinais s on s.id = e.sinal_id
      left join public.leads l on s.entidade_tipo = 'lead' and l.id::text = s.entidade_id::text
     where e.destinatario_id = v_dest and e.agente = 'mila' and e.canal = 'dm' and e.status = 'enviado'
       and e.enviado_em >= v_ultimo - interval '5 seconds' and e.enviado_em <= v_ultimo
       and s.status in ('aberto', 'triado', 'em_acao')
     order by e.enviado_em, s.regra_codigo
  loop
    if p_opcao = 1 then
      v_res := public.mila_fechar_sinal_v1(p_solicitante_telefone, r.sinal_id, 'reteve',
                 'consultora respondeu 1 (ja resolvi) a cutucada da Mila');
    elsif p_opcao = 2 then
      update public.radar_sinais
         set status = 'em_acao', triado_por = q.nome, triado_em = coalesce(triado_em, now()), atualizado_em = now()
       where id = r.sinal_id and status in ('aberto', 'triado');
      v_res := jsonb_build_object('ok', true, 'desfecho', 'em_acao');
    else
      v_res := public.mila_fechar_sinal_v1(p_solicitante_telefone, r.sinal_id, 'nao_aplicavel',
                 'consultora respondeu 3 (nao e comigo / nao procede) a cutucada da Mila');
    end if;
    v_itens := v_itens || jsonb_build_object('sinal_id', r.sinal_id, 'quem', r.quem, 'regra', r.regra_codigo, 'resultado', v_res);
    if coalesce((v_res->>'ok')::boolean, false) then
      v_nomes := v_nomes || ('*' || split_part(r.quem, ' ', 1) || '*');
    end if;
  end loop;

  if coalesce(array_length(v_nomes, 1), 0) = 0 then
    return jsonb_build_object('ok', true, 'nada_pendente', true, 'itens', v_itens);
  end if;
  v_ack := case p_opcao
    when 1 then '✅ Anotado, ' || v_apelido || ' — fechei como resolvido: ' || array_to_string(v_nomes, ', ') || '. Não volto a te cobrar por isso.'
    when 2 then '⏳ Combinado, ' || v_apelido || ' — ' || array_to_string(v_nomes, ', ') || ' segue na sua pauta até você me dizer que resolveu (responda *1* quando fechar).'
    else        '🚫 Ok, ' || v_apelido || ' — tirei da sua pauta: ' || array_to_string(v_nomes, ', ') || '. Se eu errei o alvo, me diz.'
  end;
  return jsonb_build_object('ok', true, 'opcao', p_opcao, 'aplicado_em', array_length(v_nomes, 1), 'itens', v_itens, 'ack_texto', v_ack);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. link oficial do LA Report para colaborador autorizado (pedido da Vitória, 13/09)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.mila_acesso_la_report_v1(p_solicitante_telefone text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'governanca'
as $$
declare
  q record; v_tel text; r record; v_qtd int;
begin
  select * into q from governanca.quem_eh(p_solicitante_telefone) limit 1;
  if q.nome is null then return jsonb_build_object('ok', false, 'motivo', 'nao_autorizado'); end if;
  v_tel := regexp_replace(coalesce(p_solicitante_telefone, ''), '\D', '', 'g');
  -- casa pelo próprio telefone da pessoa (últimos 8 dígitos absorvem 55/DDD/9 extra)
  select count(*) into v_qtd from public.usuarios u
   where right(regexp_replace(coalesce(u.telefone, ''), '\D', '', 'g'), 8) = right(v_tel, 8)
     and length(v_tel) >= 8;
  select u.email, u.ativo, u.nome into r from public.usuarios u
   where right(regexp_replace(coalesce(u.telefone, ''), '\D', '', 'g'), 8) = right(v_tel, 8)
     and length(v_tel) >= 8
   order by (regexp_replace(coalesce(u.telefone, ''), '\D', '', 'g') = v_tel) desc, u.ativo desc, u.updated_at desc
   limit 1;
  return jsonb_build_object(
    'ok', true,
    'solicitante', q.nome,
    'url', 'https://la-performance-report.vercel.app',
    'tem_usuario', found,
    'usuario_ativo', case when found then r.ativo end,
    'email_cadastrado', case when found then r.email end,
    'usuarios_encontrados', v_qtd,
    'orientacao', case
      when found and coalesce(r.ativo, false) then 'Entra com o e-mail cadastrado. Se não lembrar a senha, pede ao Luciano para redefinir.'
      when found then 'O usuário existe mas está inativo — pede ao Luciano para reativar.'
      else 'Ainda não tem usuário no LA Report com esse telefone — pede ao Luciano para criar (Configurações → Usuários).' end);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. ACL — o ALTER DEFAULT PRIVILEGES do schema dá EXECUTE a anon/authenticated em
--     toda função nova; revogar nominalmente e conceder só a quem lê.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  f text;
  v_lidas text[] := array[
    'public.fmt_brl_v1(numeric)',
    'public.relatorio_variacao_texto_v1(numeric, numeric)',
    'public.matriculas_comerciais_lista_v1(uuid, date, date, timestamptz)',
    'public.get_matriculas_comerciais_resumo_v1(uuid, date, date, timestamptz)',
    'public.get_kpis_comercial_competencia_v1(uuid, integer, integer)',
    'public.relatorio_matriculas_texto_v1(uuid, integer, integer, text, text)',
    'public.relatorio_comparativo_texto_v1(uuid, integer, integer, integer, integer, text, text)'
  ];
  v_mila text[] := array[
    'public.mila_registrar_entrega_dm_v1(text, text, jsonb)',
    'public.mila_responder_cutucada_v1(text, integer)',
    'public.mila_acesso_la_report_v1(text)'
  ];
begin
  foreach f in array v_lidas loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
    if exists (select 1 from pg_roles where rolname = 'mila_acesso_restrito') then
      execute format('grant execute on function %s to mila_acesso_restrito', f);
    end if;
  end loop;
  foreach f in array v_mila loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
    if exists (select 1 from pg_roles where rolname = 'mila_acesso_restrito') then
      execute format('grant execute on function %s to mila_acesso_restrito', f);
    end if;
  end loop;
end $$;
