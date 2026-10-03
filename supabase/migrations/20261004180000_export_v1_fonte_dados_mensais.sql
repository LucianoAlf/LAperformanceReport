-- ============================================================================
-- export-kpis-mensais: campos de alunos passam a vir de dados_mensais — a
-- mesma fonte que a TELA de KPIs lê — sempre que a competência está na visão
-- da tela como 'dados_mensais' ou 'preliminar' (fechada ou com linha mensal).
--
-- Decisão do Alf (04/10/2026): "vale o numero da TELA. O export tem que
-- mandar exatamente o que a tela de KPIs mostra."
--
-- Contexto: a migration 20261004130000 fez o export ler o payload congelado
-- dos snapshots. O payload foi capturado pelo canonico vivo na hora do
-- fechamento com reguas sutilmente diferentes de evasao/inadimplencia, e
-- divergiu da tela em jun-ago (evasoes jun BARRA 3x4, CG 24x25, REC 14x17;
-- ago CG 31x32, churn 7,87x8,14; inadimplencia jun REC 0,31x2,68 — tela x
-- export). dados_mensais e a linha canonica do relatorio mensal: e o que o
-- fechamento escreve e o que a tela mostra.
--
-- Regra: quando get_kpis_alunos_canonicos reporta fonte='dados_mensais' ou
-- 'preliminar' para a unidade/mes, os campos de alunos sao emitidos DIRETO do
-- por_unidade do canonico — a mesma saida que a tela de KPIs renderiza
-- (dados_mensais + pos-processamento, ex.: aplicar_denominador_ticket_kpis_v1,
-- que e o que diferenciava o ticket de ago BARRA/CG de dados_mensais cru).
-- Fora isso, comportamento anterior: payload congelado (snapshot sem
-- dados_mensais) ou canonico vivo (mes vigente). Metadados do snapshot
-- (status_fechamento, versao, hash, retificado_em) NAO mudam.
--
-- Nada e alterado em dados_mensais, snapshots, retificacoes ou na tela:
-- so muda DE ONDE o export le.
-- ============================================================================

create or replace function public.kpis_mensais_export_v1(
  p_unidade_id uuid DEFAULT NULL::uuid,
  p_ano integer DEFAULT NULL::integer,
  p_mes integer DEFAULT NULL::integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ano integer := coalesce(p_ano, extract(year from (now() at time zone 'America/Sao_Paulo'))::integer);
  v_mes integer := coalesce(p_mes, extract(month from (now() at time zone 'America/Sao_Paulo'))::integer);
  v_inicio date;
  v_fim date;
  v_kpis jsonb;
  v_linhas jsonb;
  v_profs jsonb;
begin
  v_inicio := make_date(v_ano, v_mes, 1);
  v_fim := (v_inicio + interval '1 month - 1 day')::date;
  v_kpis := get_kpis_alunos_canonicos(p_unidade_id, v_ano, v_mes);

  with un as (
    select u.id, u.codigo, u.nome
    from unidades u
    where u.ativo = true and (p_unidade_id is null or u.id = p_unidade_id)
  ),
  snap as (
    select distinct on (s.unidade_id)
      s.unidade_id, s.versao, s.status, s.fonte, s.capturado_em, s.fechado_em,
      s.payload_hash, s.payload
    from fechamento_mensal_snapshots s
    join un on un.id = s.unidade_id
    where s.dominio = 'alunos_admin' and s.ano = v_ano and s.mes = v_mes
      and s.status <> 'preview'
    order by s.unidade_id, s.versao desc
  ),
  snap_e as (
    select distinct on (s.unidade_id) s.unidade_id, s.payload
    from fechamento_mensal_snapshots s
    join un on un.id = s.unidade_id
    where s.dominio = 'alunos_executivo' and s.ano = v_ano and s.mes = v_mes
      and s.status <> 'preview'
    order by s.unidade_id, s.versao desc
  ),
  retif as (
    select s.unidade_id, max(r.created_at) as retificado_em
    from fechamento_mensal_retificacoes r
    join fechamento_mensal_snapshots s on s.id = r.snapshot_id
    join un on un.id = s.unidade_id
    where s.dominio = 'alunos_admin' and s.ano = v_ano and s.mes = v_mes
    group by s.unidade_id
  ),
  dm as (
    select d.unidade_id
    from dados_mensais d
    join un on un.id = d.unidade_id
    where d.ano = v_ano and d.mes = v_mes
  ),
  dmv as (
    select d.*
    from dados_mensais d
    join un on un.id = d.unidade_id
    where d.ano = v_ano and d.mes = v_mes
  ),
  novas_linhas as (
    select a.unidade_id, count(*)::integer as n
    from alunos a
    join un on un.id = a.unidade_id
    join tipos_matricula tm on tm.id = a.tipo_matricula_id
    left join cursos c on c.id = a.curso_id
    where a.data_matricula >= v_inicio and a.data_matricula <= v_fim
      and a.status = 'ativo' and a.arquivado_em is null
      and coalesce(c.is_projeto_banda, false) = false
      and tm.codigo not in ('BOLSISTA_INT','BOLSISTA_PARC','BANDA','TRANSFERENCIA')
      and (tm.conta_como_pagante = true or tm.entra_ticket_medio = true)
      and coalesce(a.valor_parcela, 0) > 0
    group by a.unidade_id
  ),
  pessoas as (
    select pk.unidade_id, pk.pessoa_chave,
      bool_or(a.status = 'ativo' and a.arquivado_em is null
        and c.is_projeto_banda = true and c.nome not ilike '%coral%') as em_banda,
      bool_or(a.status = 'ativo' and a.arquivado_em is null
        and coalesce(c.is_projeto_banda, false) = false
        and tm.conta_como_pagante = true and coalesce(a.valor_parcela, 0) > 0) as pagante
    from vw_aluno_pessoa_chave pk
    join un on un.id = pk.unidade_id
    join alunos a on a.id = pk.aluno_id
    left join cursos c on c.id = a.curso_id
    left join tipos_matricula tm on tm.id = a.tipo_matricula_id
    group by pk.unidade_id, pk.pessoa_chave
  ),
  banda_pag as (
    select unidade_id,
      count(*) filter (where em_banda and pagante)::integer as n,
      count(*) filter (where em_banda)::integer as pessoas_banda
    from pessoas
    group by unidade_id
  ),
  un_agg as (
    select s.unidade_id,
      count(*) filter (where s.is_banda)::integer as sessoes_banda_mes,
      round(sum(s.duracao_minutos) filter (where s.is_banda) / 60.0, 1) as horas_banda_mes,
      round(sum(s.duracao_minutos) / 60.0, 1) as horas_aula_total_mes
    from public._kpis_mensais_export_sessoes(v_inicio, v_fim, p_unidade_id) s
    join un on un.id = s.unidade_id
    group by s.unidade_id
  ),
  produtores as (
    select b.unidade_id, count(distinct b.produtor_professor_id)::integer as n
    from banda b
    join un on un.id = b.unidade_id
    where b.status = 'ativa' and coalesce(b.descartada, false) = false
      and b.produtor_professor_id is not null
    group by b.unidade_id
  )
  select jsonb_agg(
    jsonb_build_object(
      'competencia', to_char(v_inicio, 'YYYY-MM-01'),
      'unidade_id', un.id,
      'unidade_codigo', un.codigo,
      'unidade_nome', un.nome,
      'status_fechamento', case
        when snap.unidade_id is not null then 'fechado'
        when dm.unidade_id is not null then 'legado'
        else 'aberto' end,
      'snapshot_status', snap.status,
      'versao', snap.versao,
      'fonte_snapshot', snap.fonte,
      'fonte_kpis', case
        when src.usa_dm then kpi.value ->> 'fonte'
        when snap.unidade_id is not null then 'snapshot_fechado'
        else kpi.value ->> 'fonte' end,
      'status_competencia', kpi.value ->> 'status_competencia',
      'capturado_em', snap.capturado_em,
      'fechado_em', snap.fechado_em,
      'retificado_em', coalesce(retif.retificado_em,
        case when snap.fonte ilike 'retificacao%' then snap.capturado_em end),
      'payload_hash', snap.payload_hash,
      'alunos_ativos', coalesce(case when src.usa_dm then kpi.value ->> 'alunos_ativos' end, src.v ->> 'alunos_ativos')::integer,
      'alunos_pagantes', coalesce(case when src.usa_dm then kpi.value ->> 'alunos_pagantes' end, src.v ->> 'alunos_pagantes')::integer,
      'novos_alunos', coalesce(case when src.usa_dm then kpi.value ->> 'novas_matriculas' end, src.v ->> 'novas_matriculas')::integer,
      'novas_matriculas', coalesce((src.v ->> 'novas_matriculas_linhas')::integer, nl.n, 0),
      'evasoes', coalesce(case when src.usa_dm then kpi.value ->> 'evasoes' end, src.v ->> 'evasoes')::integer,
      'churn_rate', coalesce(case when src.usa_dm then kpi.value ->> 'churn_rate' end, src.v ->> 'churn_rate')::numeric,
      'ticket_medio', coalesce(case when src.usa_dm then kpi.value ->> 'ticket_medio' end, src.v ->> 'ticket_medio')::numeric,
      'tempo_permanencia_meses', coalesce(case when src.usa_dm then kpi.value ->> 'tempo_permanencia' end, src.v ->> 'tempo_permanencia')::numeric,
      'inadimplencia_pct', coalesce(case when src.usa_dm then kpi.value ->> 'inadimplencia_pct' end,
        src.v ->> 'inadimplencia_pct',
        src.v ->> 'inadimplencia')::numeric,
      'ltv_medio', coalesce(case when src.usa_dm then kpi.value ->> 'ltv_medio' end,
        src.v ->> 'ltv_medio')::numeric,
      'mrr', coalesce(case when src.usa_dm then kpi.value ->> 'mrr' end, src.v ->> 'mrr')::numeric,
      'faturamento_previsto', coalesce(case when src.usa_dm then kpi.value ->> 'faturamento_previsto' end, src.v ->> 'faturamento_previsto')::numeric,
      'faturamento_realizado', coalesce(case when src.usa_dm then kpi.value ->> 'faturamento_realizado' end, src.v ->> 'faturamento_realizado')::numeric,
      'alunos_trancados', coalesce(case when src.usa_dm then kpi.value ->> 'alunos_trancados' end, src.v ->> 'alunos_trancados')::integer,
      'bolsistas_integrais', coalesce(case when src.usa_dm then kpi.value ->> 'bolsistas_integrais' end, src.v ->> 'bolsistas_integrais')::integer,
      'bolsistas_parciais', coalesce(case when src.usa_dm then kpi.value ->> 'bolsistas_parciais' end, src.v ->> 'bolsistas_parciais')::integer,
      'matriculas_2_curso', coalesce(case when src.usa_dm then kpi.value ->> 'matriculas_2_curso' end, src.v ->> 'matriculas_2_curso')::integer,
      'matriculas_banda', coalesce(case when src.usa_dm then kpi.value ->> 'matriculas_banda' end, src.v ->> 'matriculas_banda')::integer,
      'pessoas_em_banda', coalesce((src.v ->> 'pessoas_em_banda')::integer, bp.pessoas_banda, 0),
      'pagantes_em_banda', coalesce((src.v ->> 'pagantes_em_banda')::integer, bp.n, 0),
      'sessoes_banda_mes', coalesce(ua.sessoes_banda_mes, 0),
      'horas_banda_mes', coalesce(ua.horas_banda_mes, 0),
      'horas_aula_total_mes', coalesce(ua.horas_aula_total_mes, 0),
      'produtores_banda', coalesce((src.v ->> 'produtores_banda')::integer, pr.n, 0),
      'identidade_emusys_cobertura_pct', (src.v ->> 'identidade_emusys_cobertura_pct')::numeric
    )
    order by un.codigo
  ) into v_linhas
  from un
  left join lateral (
    select value
    from jsonb_array_elements(coalesce(v_kpis -> 'por_unidade', '[]'::jsonb)) t(value)
    where (t.value ->> 'unidade_id')::uuid = un.id
    limit 1
  ) kpi on true
  left join snap on snap.unidade_id = un.id
  left join snap_e on snap_e.unidade_id = un.id
  left join dmv on dmv.unidade_id = un.id
    and coalesce(kpi.value ->> 'fonte', '') in ('dados_mensais', 'preliminar')
  left join lateral (
    select
      case when snap.unidade_id is not null
        then coalesce(snap_e.payload, '{}'::jsonb) || coalesce(snap.payload, '{}'::jsonb)
        else coalesce(kpi.value, '{}'::jsonb) end as v,
      (dmv.unidade_id is not null) as usa_dm
  ) src on true
  left join retif on retif.unidade_id = un.id
  left join dm on dm.unidade_id = un.id
  left join novas_linhas nl on nl.unidade_id = un.id
  left join banda_pag bp on bp.unidade_id = un.id
  left join un_agg ua on ua.unidade_id = un.id
  left join produtores pr on pr.unidade_id = un.id;

  select jsonb_agg(
    jsonb_build_object(
      'competencia', to_char(v_inicio, 'YYYY-MM-01'),
      'unidade_id', sa.unidade_id,
      'professor_id', sa.professor_id,
      'emusys_professor_id', sa.emusys_professor_id,
      'fone_norm', regexp_replace(coalesce(pf.telefone_whatsapp, ''), '\\D', '', 'g'),
      'sessoes_banda', sa.sessoes_banda,
      'horas_banda', sa.horas_banda,
      'sessoes_total', sa.sessoes_total,
      'horas_aula_total', sa.horas_total,
      'e_produtor_banda', exists (
        select 1 from banda b
        where b.produtor_professor_id = sa.professor_id
          and b.status = 'ativa' and coalesce(b.descartada, false) = false
      )
    )
    order by sa.unidade_id, sa.horas_total desc
  ) into v_profs
  from (
    select s.unidade_id, s.professor_key, s.professor_id, s.emusys_professor_id,
      count(*) filter (where s.is_banda)::integer as sessoes_banda,
      round(sum(s.duracao_minutos) filter (where s.is_banda) / 60.0, 1) as horas_banda,
      count(*)::integer as sessoes_total,
      round(sum(s.duracao_minutos) / 60.0, 1) as horas_total
    from public._kpis_mensais_export_sessoes(v_inicio, v_fim, p_unidade_id) s
    group by 1, 2, 3, 4
  ) sa
  left join professores pf on pf.id = sa.professor_id;

  return jsonb_build_object(
    'competencia', to_char(v_inicio, 'YYYY-MM-01'),
    'gerado_em', now(),
    'linhas', coalesce(v_linhas, '[]'::jsonb),
    'professores', coalesce(v_profs, '[]'::jsonb)
  );
end;
$function$;
