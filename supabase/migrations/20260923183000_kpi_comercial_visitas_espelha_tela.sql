-- LAPE-44 — o KPI de visita passa a contar COMPARECIMENTO (2026-09-23).
--
--     visita = agendada que COMPARECEU  +  quem apareceu sem agendar horario
--
-- Ate aqui `get_kpis_comercial_canonicos_v2` contava a tabela `visitas` inteira, ou
-- seja o que foi AGENDADO. Duas coisas erradas nisso:
--
-- 1. Visita agendada que ninguem confirmou e promessa, nao visita. Em 23/09 as 139
--    linhas da tabela estavam 100% em `agendada` -- ninguem nunca marcou presenca.
-- 2. Quem chega sem hora marcada (lead de canal `Visita/Placa`) nao entrava em lugar
--    nenhum, e e a UNICA forma de visita que Barra e Recreio registram. O relatorio do
--    WhatsApp publicava "Visitas: 0" para unidades que recebem 11 pessoas por mes na
--    porta.
--
-- Base da decisao (medido em 180 dias): o canal Visita/Placa converte 28,5% em
-- matricula, contra 3,6% do Google e 2,5% do Instagram, ao lado de Ex-aluno (52%) e
-- Indicacao (40%). Isso e comportamento de presenca fisica, nao de quem viu uma placa
-- e ligou. `docs/PRD.md`: "Visita/Placa — Passou na frente da escola".
--
-- Efeito em set/2026: CG 26 -> 7 (0 de 26 agendadas confirmadas + 7 sem hora marcada),
-- Recreio 0 -> 11, Barra 0 -> 11. As duas unidades sem agente passam a mostrar MAIS
-- visita real que Campo Grande -- que e o que a operacao vinha dizendo e o numero negava.
--
-- Consumidores: `relatorio-admin-whatsapp` (diario e mensal) e
-- `gemini-relatorio-gerencial` leem `kpis.visitas`. Os outros 7 chamadores da RPC nao
-- tocam nesse campo, e acrescentar chave em jsonb e aditivo.
--
-- ⚠️ NAO tocar em `mila_briefing_manha_v1`, `mila_fechamento_dia_v1` nem
-- `mila_check_disponibilidade_visita`: as tres leem `visitas` para montar AGENDA com
-- hora (hoje, amanha, disponibilidade). Walk-in nao tem hora e nao se agenda -- entrar
-- ali produziria uma agenda com pessoas que ja foram embora.
--
-- ⚠️ `get_estrelas_matriculador_v1` (estrela SHOW-UP) fica FORA: mexer nela recalcula
-- estrela de mes fechado, que e decisao com dono (mesmo cuidado da troca de regua da
-- comunidade em 14/09, quando agosto do Recreio passou a ganhar depois de comunicado).
--
-- Forma: `replace` sobre `pg_get_functiondef`, com ancora que ABORTA se o trecho nao
-- bater e que declara quantas ocorrencias espera -- nunca transcrever a funcao a mao.
-- As strings usam dollar quoting ($q$) para nao depender de escape de aspas.

do $$
declare
  v_def text;
  v_antigo text;
  v_novo text;
  v_ocorrencias int;
begin
  select pg_get_functiondef(oid) into v_def
  from pg_proc where proname = 'get_kpis_comercial_canonicos_v2';

  if v_def is null then
    raise exception 'get_kpis_comercial_canonicos_v2 nao existe';
  end if;

  -- ── 1. O CTE de visitas ───────────────────────────────────────────────────
  v_antigo := $q$visitas_base AS (
  SELECT
    v.unidade_id,
    count(*)::int AS visitas
  FROM public.visitas v
  CROSS JOIN periodo p
  WHERE v.data >= p.inicio::date
    AND v.data < p.fim_exclusivo::date
    AND coalesce(v.status, '') NOT IN ('cancelada', 'cancelado')
    AND (p_unidade_id IS NULL OR v.unidade_id = p_unidade_id)
  GROUP BY v.unidade_id
)$q$;

  v_ocorrencias := (length(v_def) - length(replace(v_def, v_antigo, ''))) / nullif(length(v_antigo), 0);
  if coalesce(v_ocorrencias, 0) <> 1 then
    raise exception 'ancora visitas_base esperava 1 ocorrencia, achou %', coalesce(v_ocorrencias, 0);
  end if;

  v_novo := $q$visitas_base AS (
  -- As duas formas de visitar. `agendada` = tem linha em `visitas` (promessa, precisa
  -- de confirmacao de presenca); o outro ramo e quem chegou sem hora marcada, que ja
  -- esteve aqui -- o comparecimento dele e a razao de o lead existir.
  SELECT
    x.unidade_id,
    -- COMPARECIMENTO: agendada confirmada + quem chegou sem agendar.
    (count(*) FILTER (WHERE x.agendada AND x.status = 'realizada')
     + count(*) FILTER (WHERE NOT x.agendada))::int AS visitas,
    count(*)::int AS visitas_total,
    count(*) FILTER (WHERE x.agendada)::int AS visitas_agendadas,
    count(*) FILTER (WHERE x.agendada AND x.status = 'realizada')::int AS visitas_confirmadas,
    -- `aguardando` e "ninguem confirmou", NUNCA "faltou": traduzir ausencia de marcacao
    -- para falta afirmaria um fato que ninguem mediu.
    count(*) FILTER (WHERE x.agendada
                       AND coalesce(x.status, '') NOT IN ('realizada', 'nao_compareceu'))::int AS visitas_aguardando,
    count(*) FILTER (WHERE NOT x.agendada)::int AS visitas_sem_hora_marcada
  FROM (
    SELECT v.unidade_id, true AS agendada, v.status
    FROM public.visitas v
    CROSS JOIN periodo p
    WHERE v.data >= p.inicio::date
      AND v.data < p.fim_exclusivo::date
      AND coalesce(v.status, '') NOT IN ('cancelada', 'cancelado')
      AND (p_unidade_id IS NULL OR v.unidade_id = p_unidade_id)
    UNION ALL
    -- ⚠️ Exclui quem JA tem visita agendada no periodo: hoje sao 0 casos (medido em
    -- 23/09 nos 233 leads do canal contra as 139 visitas), mas sem isso a pessoa que
    -- chegou na porta e depois marcou uma visita contaria duas vezes.
    SELECT l.unidade_id, false, NULL::text
    FROM public.leads l
    CROSS JOIN periodo p
    WHERE l.canal_origem_id = 6
      AND l.data_contato >= p.inicio::date
      AND l.data_contato < p.fim_exclusivo::date
      AND (p_unidade_id IS NULL OR l.unidade_id = p_unidade_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.visitas v2
        WHERE v2.lead_id = l.id
          AND v2.data >= p.inicio::date
          AND v2.data < p.fim_exclusivo::date
          AND coalesce(v2.status, '') NOT IN ('cancelada', 'cancelado')
      )
  ) x
  GROUP BY x.unidade_id
)$q$;

  v_def := replace(v_def, v_antigo, v_novo);

  -- ── 2. Campos novos no CTE `base` ─────────────────────────────────────────
  v_antigo := $q$coalesce(vb.visitas, 0)::int AS visitas,$q$;
  if position(v_antigo in v_def) = 0 then
    raise exception 'ancora base.visitas nao encontrada';
  end if;
  v_def := replace(v_def, v_antigo, $q$coalesce(vb.visitas, 0)::int AS visitas,
    coalesce(vb.visitas_total, 0)::int AS visitas_total,
    coalesce(vb.visitas_agendadas, 0)::int AS visitas_agendadas,
    coalesce(vb.visitas_confirmadas, 0)::int AS visitas_confirmadas,
    coalesce(vb.visitas_aguardando, 0)::int AS visitas_aguardando,
    coalesce(vb.visitas_sem_hora_marcada, 0)::int AS visitas_sem_hora_marcada,$q$);

  -- ── 3. Campos novos no consolidado ────────────────────────────────────────
  v_antigo := $q$sum(visitas)::int AS visitas,$q$;
  if position(v_antigo in v_def) = 0 then
    raise exception 'ancora consolidado.visitas nao encontrada';
  end if;
  v_def := replace(v_def, v_antigo, $q$sum(visitas)::int AS visitas,
    sum(visitas_total)::int AS visitas_total,
    sum(visitas_agendadas)::int AS visitas_agendadas,
    sum(visitas_confirmadas)::int AS visitas_confirmadas,
    sum(visitas_aguardando)::int AS visitas_aguardando,
    sum(visitas_sem_hora_marcada)::int AS visitas_sem_hora_marcada,$q$);

  -- ── 4. Campos novos na saida `kpis` ───────────────────────────────────────
  v_antigo := $q$'visitas', visitas,$q$;
  if position(v_antigo in v_def) = 0 then
    raise exception 'ancora kpis.visitas nao encontrada';
  end if;
  v_def := replace(v_def, v_antigo, $q$'visitas', visitas,
      'visitas_total', visitas_total,
      'visitas_agendadas', visitas_agendadas,
      'visitas_confirmadas', visitas_confirmadas,
      'visitas_aguardando', visitas_aguardando,
      'visitas_sem_hora_marcada', visitas_sem_hora_marcada,$q$);

  -- ── 5. Campos novos no recorte por unidade ────────────────────────────────
  -- ⚠️ A ancora TEM de incluir o fecha-parenteses. Sem ele, `'visitas', visitas` casa
  -- tambem dentro do bloco que o passo 4 acabou de inserir (que comeca exatamente
  -- assim, so que seguido de virgula) -- o ensaio acusou 2 ocorrencias e abortou.
  v_antigo := $q$'visitas', visitas
        )$q$;
  v_ocorrencias := (length(v_def) - length(replace(v_def, v_antigo, ''))) / nullif(length(v_antigo), 0);
  if coalesce(v_ocorrencias, 0) <> 1 then
    raise exception 'ancora por_unidade.visitas esperava 1 ocorrencia restante, achou %', coalesce(v_ocorrencias, 0);
  end if;
  v_def := replace(v_def, v_antigo, $q$'visitas', visitas,
          'visitas_total', visitas_total,
          'visitas_confirmadas', visitas_confirmadas,
          'visitas_aguardando', visitas_aguardando,
          'visitas_sem_hora_marcada', visitas_sem_hora_marcada
        )$q$);

  execute v_def;
end $$;

-- Prova da definicao, nas 3 unidades:
--   visitas       = confirmadas + sem hora marcada     (o COMPARECIMENTO)
--   visitas_total = agendadas   + sem hora marcada     (tudo que existe)
--   comparecimento nunca maior que o total
-- Se qualquer uma nao fechar, a transacao inteira volta atras.
do $$
declare r record;
begin
  for r in
    select u.nome,
           (public.get_kpis_comercial_canonicos_v2(u.id, 2026, 9, 'mensal')->'kpis') as k
    from public.unidades u where u.ativo and u.nome in ('Campo Grande','Recreio','Barra')
  loop
    if (r.k->>'visitas')::int
       <> (r.k->>'visitas_confirmadas')::int + (r.k->>'visitas_sem_hora_marcada')::int then
      raise exception '% : comparecimento % nao fecha com confirmadas % + sem hora %',
        r.nome, r.k->>'visitas', r.k->>'visitas_confirmadas', r.k->>'visitas_sem_hora_marcada';
    end if;
    if (r.k->>'visitas_total')::int
       <> (r.k->>'visitas_agendadas')::int + (r.k->>'visitas_sem_hora_marcada')::int then
      raise exception '% : total % nao fecha com agendadas % + sem hora %',
        r.nome, r.k->>'visitas_total', r.k->>'visitas_agendadas', r.k->>'visitas_sem_hora_marcada';
    end if;
    if (r.k->>'visitas')::int > (r.k->>'visitas_total')::int then
      raise exception '% : comparecimento % maior que o total %',
        r.nome, r.k->>'visitas', r.k->>'visitas_total';
    end if;
  end loop;
end $$;
