-- ============================================================================
-- DRAFT ONLY - NAO APLICAR SEM APPROVE EXPLICITO DO ALF
-- ============================================================================
-- Projeto: LA Music Report / Sol
-- Fase: P0.1C - flatten dos wrappers publicos sem chamada a *_legacy_p01g
-- Data: 2026-06-11
--
-- Este arquivo e uma proposta versionada para revisao humana.
-- Ele NAO foi aplicado no banco.
-- Ele NAO deve ser executado automaticamente por pipeline de migration.
--
-- Objetivo:
-- - Reescrever somente os wrappers publicos:
--   - public.get_dados_relatorio_gerencial(uuid, integer, integer)
--   - public.get_dados_retencao_ia(uuid, integer, integer)
-- - Remover a chamada runtime a:
--   - public.get_dados_relatorio_gerencial_legacy_p01g
--   - public.get_dados_retencao_ia_legacy_p01g
-- - Preservar nome, parametros e shape JSON esperado pelo frontend,
--   relatorios e Gemini/IA.
--
-- Nao faz:
-- - DROP
-- - ALTER estrutural
-- - UPDATE/DELETE/INSERT
-- - backfill
-- - alteracao em dados_mensais
-- - alteracao de frontend
-- - remocao/deprecacao final das funcoes *_legacy_p01g
--
-- Observacao importante:
-- Esta fase remove a dependencia runtime dos wrappers publicos nas funcoes
-- legadas P0.1G.
-- Ela NAO remove todas as dependencias de views antigas. Campos de retencao
-- ainda usam vw_kpis_retencao_mensal como LEGADO_TEMPORARIO ate a fonte
-- canonica de retencao ser consolidada.
-- ============================================================================

create or replace function public.get_dados_relatorio_gerencial(
  p_unidade_id uuid default null::uuid,
  p_ano integer default (extract(year from (now() at time zone 'America/Sao_Paulo'::text)))::integer,
  p_mes integer default (extract(month from (now() at time zone 'America/Sao_Paulo'::text)))::integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
  v_kpis jsonb;
  v_totais jsonb;
  v_mes_anterior integer;
  v_ano_mes_anterior integer;
  v_unidade_nome text;
  v_gerente_nome text;
  v_hunter_nome text;
  v_farmers_nomes text[];
  v_start_date date;
  v_end_date date;
begin
  if p_mes = 1 then
    v_mes_anterior := 12;
    v_ano_mes_anterior := p_ano - 1;
  else
    v_mes_anterior := p_mes - 1;
    v_ano_mes_anterior := p_ano;
  end if;

  v_start_date := make_date(p_ano, p_mes, 1);
  v_end_date := (v_start_date + interval '1 month' - interval '1 day')::date;

  if p_unidade_id is not null then
    select nome, gerente_nome, hunter_nome, farmers_nomes
      into v_unidade_nome, v_gerente_nome, v_hunter_nome, v_farmers_nomes
    from public.unidades
    where id = p_unidade_id;
  else
    v_unidade_nome := 'Consolidado';
    v_gerente_nome := 'Diretoria';
    v_hunter_nome := 'Equipe Comercial';
    v_farmers_nomes := array['Equipe Administrativa'];
  end if;

  v_kpis := public.get_kpis_alunos_canonicos(p_unidade_id, p_ano, p_mes);
  v_totais := coalesce(v_kpis->'totais', '{}'::jsonb);

  v_result := jsonb_build_object(
    'periodo', jsonb_build_object(
      'ano', p_ano,
      'mes', p_mes,
      'mes_nome', to_char(to_date(p_mes::text, 'MM'), 'TMMonth'),
      'unidade_id', p_unidade_id,
      'unidade_nome', v_unidade_nome
    ),
    'gerente_nome', coalesce(v_gerente_nome, 'N/D'),
    'hunter_nome', coalesce(v_hunter_nome, 'N/D'),
    'farmers_nomes', coalesce(v_farmers_nomes, array['N/D']),
    'kpis_gestao', coalesce(v_kpis->'por_unidade', '[]'::jsonb),
    'kpis_alunos_canonicos', v_kpis,
    'dados_mes_atual', coalesce(v_kpis->'por_unidade', '[]'::jsonb),
    'matriculas_ativas', coalesce(v_totais->'matriculas_ativas', '0'::jsonb),
    'matriculas_banda', coalesce(v_totais->'matriculas_banda', '0'::jsonb),
    'matriculas_2_curso', coalesce(v_totais->'matriculas_2_curso', '0'::jsonb),
    'total_bolsistas', to_jsonb(
      coalesce((v_totais->>'bolsistas_integrais')::integer, 0)
      + coalesce((v_totais->>'bolsistas_parciais')::integer, 0)
    )
  );

  -- LEGADO_TEMPORARIO_RETENCAO:
  -- Mantem shape atual de kpis_retencao usando a view de retencao atual.
  -- Fonte ainda bloqueada ate consolidar contrato canonico de retencao.
  v_result := v_result || jsonb_build_object('kpis_retencao', (
    select coalesce(jsonb_agg(row_to_json(kr)::jsonb), '[]'::jsonb)
    from public.vw_kpis_retencao_mensal kr
    where (p_unidade_id is null or kr.unidade_id = p_unidade_id)
      and kr.ano = p_ano
      and kr.mes = p_mes
  ));

  -- Comercial/Leads permanece operacional e fora do P0.1 alunos.
  v_result := v_result || jsonb_build_object('kpis_comercial', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'ano', p_ano,
      'mes', p_mes,
      'unidade_id', sub.unidade_id,
      'total_leads', sub.total_leads,
      'experimentais_agendadas', sub.exp_agendadas,
      'experimentais_realizadas', sub.exp_realizadas,
      'novas_matriculas', sub.matriculas,
      'faltaram', sub.faltaram,
      'taxa_showup', case when sub.exp_agendadas > 0 then round(sub.exp_realizadas::numeric / sub.exp_agendadas * 100, 1) else 0 end,
      'taxa_conversao_lead_exp', case when sub.total_leads > 0 then round(sub.exp_realizadas::numeric / sub.total_leads * 100, 1) else 0 end,
      'taxa_conversao_exp_mat', case when sub.exp_realizadas > 0 then round(sub.matriculas::numeric / sub.exp_realizadas * 100, 1) else 0 end,
      'taxa_conversao_geral', case when sub.total_leads > 0 then round(sub.matriculas::numeric / sub.total_leads * 100, 1) else 0 end,
      'faturamento_novos', 0,
      'ticket_medio_novos', 0
    )), '[]'::jsonb)
    from (
      select
        coalesce(l.unidade_id, p_unidade_id) as unidade_id,
        count(*) as total_leads,
        count(*) filter (where l.status in ('experimental_agendada', 'experimental_realizada', 'matriculado', 'convertido')) as exp_agendadas,
        count(*) filter (where l.status in ('experimental_realizada', 'matriculado', 'convertido')) as exp_realizadas,
        count(*) filter (where l.status in ('matriculado', 'convertido')) as matriculas,
        count(*) filter (where l.status = 'experimental_faltou') as faltaram
      from public.leads l
      where l.data_contato >= v_start_date
        and l.data_contato <= v_end_date
        and (p_unidade_id is null or l.unidade_id = p_unidade_id)
      group by l.unidade_id
    ) sub
  ));

  v_result := v_result || jsonb_build_object('metas_kpi', (
    select coalesce(jsonb_object_agg(mk.tipo, mk.valor), '{}'::jsonb)
    from public.metas_kpi mk
    where mk.ano = p_ano
      and mk.mes = p_mes
      and (p_unidade_id is null or mk.unidade_id = p_unidade_id)
  ));

  v_result := v_result || jsonb_build_object('mes_anterior', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'alunos_pagantes', dm.alunos_pagantes,
      'churn_rate', dm.churn_rate,
      'ticket_medio', dm.ticket_medio,
      'taxa_renovacao', dm.taxa_renovacao,
      'inadimplencia', dm.inadimplencia,
      'tempo_permanencia', dm.tempo_permanencia,
      'reajuste_parcelas', dm.reajuste_parcelas,
      'novas_matriculas', dm.novas_matriculas,
      'evasoes', dm.evasoes,
      'faturamento_estimado', dm.faturamento_estimado
    )), '[]'::jsonb)
    from public.dados_mensais dm
    where dm.ano = v_ano_mes_anterior
      and dm.mes = v_mes_anterior
      and (p_unidade_id is null or dm.unidade_id = p_unidade_id)
  ));

  v_result := v_result || jsonb_build_object('mesmo_mes_ano_passado', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'alunos_pagantes', dm.alunos_pagantes,
      'churn_rate', dm.churn_rate,
      'ticket_medio', dm.ticket_medio,
      'taxa_renovacao', dm.taxa_renovacao,
      'inadimplencia', dm.inadimplencia,
      'tempo_permanencia', dm.tempo_permanencia,
      'reajuste_parcelas', dm.reajuste_parcelas,
      'novas_matriculas', dm.novas_matriculas,
      'evasoes', dm.evasoes,
      'faturamento_estimado', dm.faturamento_estimado,
      'saldo_liquido', dm.saldo_liquido
    )), '[]'::jsonb)
    from public.dados_mensais dm
    where dm.ano = p_ano - 1
      and dm.mes = p_mes
      and (p_unidade_id is null or dm.unidade_id = p_unidade_id)
  ));

  v_result := v_result || jsonb_build_object('sazonalidade', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'ano', sub.ano,
      'novas_matriculas', sub.novas_matriculas,
      'evasoes', sub.evasoes,
      'churn_rate', sub.churn_rate,
      'saldo_liquido', sub.saldo_liquido
    )), '[]'::jsonb)
    from (
      select s.ano, s.novas_matriculas, s.evasoes, s.churn_rate, s.saldo_liquido
      from public.vw_sazonalidade s
      where s.mes = p_mes
        and s.ano >= p_ano - 3
        and s.ano < p_ano
        and (p_unidade_id is null or s.unidade = v_unidade_nome)
      order by s.ano desc
    ) sub
  ));

  v_result := v_result || jsonb_build_object('motivos_evasao', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'motivo', sub.motivo_categoria,
      'quantidade', sub.quantidade,
      'percentual', sub.percentual
    )), '[]'::jsonb)
    from (
      select em.motivo_categoria, em.quantidade, em.percentual
      from public.vw_evasoes_motivos em
      where (p_unidade_id is null or em.unidade = v_unidade_nome)
      order by em.quantidade desc
      limit 5
    ) sub
  ));

  v_result := v_result || jsonb_build_object('top_professores_retencao', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'professor', sub.professor,
      'tempo_medio_permanencia', sub.tempo_medio_permanencia,
      'presenca_media', sub.presenca_media,
      'total_alunos', sub.total_alunos
    )), '[]'::jsonb)
    from (
      select pr.professor, pr.tempo_medio_permanencia, pr.presenca_media, pr.total_alunos
      from public.vw_ranking_professores_retencao pr
      where (p_unidade_id is null or pr.unidade = v_unidade_nome)
      order by pr.tempo_medio_permanencia::numeric desc
      limit 3
    ) sub
  ));

  v_result := v_result || jsonb_build_object('top_professores_matriculadores', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'professor_nome', sub.professor_nome,
      'matriculas', sub.matriculas,
      'experimentais', sub.experimentais,
      'taxa_conversao', sub.taxa_conversao
    )), '[]'::jsonb)
    from (
      select pm.professor_nome, pm.matriculas, pm.experimentais, pm.taxa_conversao
      from public.vw_kpis_professor_mensal pm
      where pm.ano = p_ano
        and pm.mes = p_mes
        and (p_unidade_id is null or pm.unidade_id = p_unidade_id)
        and pm.matriculas > 0
      order by pm.matriculas desc nulls last
      limit 3
    ) sub
  ));

  v_result := v_result || jsonb_build_object('top_professores_presenca', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'professor', sub.professor,
      'presenca_media', sub.presenca_media,
      'total_alunos', sub.total_alunos
    )), '[]'::jsonb)
    from (
      select pr.professor, pr.presenca_media, pr.total_alunos
      from public.vw_ranking_professores_retencao pr
      where (p_unidade_id is null or pr.unidade = v_unidade_nome)
        and pr.total_alunos >= 5
      order by pr.presenca_media::numeric desc
      limit 3
    ) sub
  ));

  v_result := v_result || jsonb_build_object('top_professores_media_turma', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'professor', sub.professor,
      'media_alunos_turma', sub.media_alunos_turma,
      'total_turmas', sub.total_turmas,
      'total_alunos', sub.total_alunos
    )), '[]'::jsonb)
    from (
      with tp as (
        select p.id as pid, p.nome as professor, a.dia_aula, a.horario_aula, count(*) as cnt
        from public.professores p
        inner join public.alunos a on a.professor_atual_id = p.id
        where a.status = 'ativo'
          and (p_unidade_id is null or a.unidade_id = p_unidade_id)
          and a.dia_aula is not null
          and a.horario_aula is not null
        group by p.id, p.nome, a.dia_aula, a.horario_aula
      )
      select professor, round(avg(cnt), 1) as media_alunos_turma, count(*) as total_turmas, sum(cnt) as total_alunos
      from tp
      group by pid, professor
      order by media_alunos_turma desc
      limit 3
    ) sub
  ));

  v_result := v_result || jsonb_build_object('cursos_mais_procurados', (
    select coalesce(jsonb_agg(jsonb_build_object('curso', sub.curso, 'total_alunos', sub.total_alunos)), '[]'::jsonb)
    from (
      select c.nome as curso, count(*) as total_alunos
      from public.alunos a
      join public.cursos c on a.curso_id = c.id
      where a.status = 'ativo'
        and (p_unidade_id is null or a.unidade_id = p_unidade_id)
      group by c.nome
      order by count(*) desc
      limit 5
    ) sub
  ));

  v_result := v_result || jsonb_build_object('canais_maior_conversao', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'canal', sub.canal,
      'total_leads', sub.total_leads,
      'matriculas', sub.matriculas,
      'taxa_conversao', sub.taxa_conversao
    )), '[]'::jsonb)
    from (
      select co.nome as canal,
        count(*) as total_leads,
        sum(case when l.converteu = true then 1 else 0 end) as matriculas,
        round(sum(case when l.converteu = true then 1 else 0 end)::numeric / nullif(count(*), 0) * 100, 1) as taxa_conversao
      from public.leads l
      join public.canais_origem co on l.canal_origem_id = co.id
      where l.data_contato >= (current_date - interval '12 months')
        and (p_unidade_id is null or l.unidade_id = p_unidade_id)
      group by co.nome
      having count(*) >= 5
      order by taxa_conversao desc nulls last
      limit 3
    ) sub
  ));

  v_result := v_result || jsonb_build_object(
    'total_indicacoes', (
      select count(*)
      from public.leads l
      join public.canais_origem co on l.canal_origem_id = co.id
      where co.nome in ('Indicação', 'Indicacao')
        and l.converteu = true
        and extract(year from l.data_conversao) = p_ano
        and extract(month from l.data_conversao) = p_mes
        and (p_unidade_id is null or l.unidade_id = p_unidade_id)
    ),
    'total_family_pacotes', (
      select count(*)
      from public.alunos a
      where a.status = 'ativo'
        and a.is_segundo_curso = true
        and a.data_matricula >= v_start_date
        and a.data_matricula < v_start_date + interval '1 month'
        and (p_unidade_id is null or a.unidade_id = p_unidade_id)
    )
  );

  v_result := v_result || jsonb_build_object('permanencia_por_faixa', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'faixa', sub.faixa,
      'quantidade', sub.quantidade,
      'percentual', sub.percentual
    ) order by sub.ordem), '[]'::jsonb)
    from (
      select
        case
          when a.tempo_permanencia_meses < 6 then '0-6 meses'
          when a.tempo_permanencia_meses < 12 then '6-12 meses'
          when a.tempo_permanencia_meses < 24 then '1-2 anos'
          when a.tempo_permanencia_meses < 36 then '2-3 anos'
          else '3+ anos'
        end as faixa,
        case
          when a.tempo_permanencia_meses < 6 then 1
          when a.tempo_permanencia_meses < 12 then 2
          when a.tempo_permanencia_meses < 24 then 3
          when a.tempo_permanencia_meses < 36 then 4
          else 5
        end as ordem,
        count(*)::integer as quantidade,
        round(count(*) * 100.0 / nullif(sum(count(*)) over(), 0), 1)::numeric as percentual
      from public.alunos a
      where a.status = 'ativo'
        and a.classificacao = 'pagante'
        and (p_unidade_id is null or a.unidade_id = p_unidade_id)
      group by faixa, ordem
    ) sub
  ));

  return v_result;
end;
$function$;

comment on function public.get_dados_relatorio_gerencial(uuid, integer, integer)
is 'P0.1C flatten draft: wrapper publico sem chamada a get_dados_relatorio_gerencial_legacy_p01g. KPIs de alunos via get_kpis_alunos_canonicos; retencao ainda usa vw_kpis_retencao_mensal como legado temporario.';

create or replace function public.get_dados_retencao_ia(
  p_unidade_id uuid default null::uuid,
  p_ano integer default (extract(year from (now() at time zone 'America/Sao_Paulo'::text)))::integer,
  p_mes integer default (extract(month from (now() at time zone 'America/Sao_Paulo'::text)))::integer
)
returns json
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  resultado jsonb;
  v_kpis jsonb;
  mes_anterior integer;
  ano_anterior integer;
  ano_passado integer;
begin
  if p_mes = 1 then
    mes_anterior := 12;
    ano_anterior := p_ano - 1;
  else
    mes_anterior := p_mes - 1;
    ano_anterior := p_ano;
  end if;

  ano_passado := p_ano - 1;
  v_kpis := public.get_kpis_alunos_canonicos(p_unidade_id, p_ano, p_mes);

  select jsonb_build_object(
    'periodo', jsonb_build_object(
      'ano', p_ano,
      'mes', p_mes,
      'mes_nome', trim(to_char(to_date(p_mes::text, 'MM'), 'Month'))
    ),
    'kpis_gestao', coalesce(v_kpis->'por_unidade', '[]'::jsonb),
    'kpis_alunos_canonicos', v_kpis,
    'kpis_retencao', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'unidade_id', kr.unidade_id,
        'unidade_nome', kr.unidade_nome,
        'total_evasoes', kr.total_evasoes,
        'avisos_previos', kr.avisos_previos,
        'renovacoes_previstas', kr.renovacoes_previstas,
        'renovacoes_realizadas', kr.renovacoes_realizadas,
        'nao_renovacoes', kr.nao_renovacoes,
        'renovacoes_pendentes', kr.renovacoes_pendentes,
        'taxa_renovacao', kr.taxa_renovacao,
        'taxa_nao_renovacao', kr.taxa_nao_renovacao,
        'mrr_perdido', kr.mrr_perdido
      )), '[]'::jsonb)
      from public.vw_kpis_retencao_mensal kr
      where (p_unidade_id is null or kr.unidade_id = p_unidade_id)
        and kr.ano = p_ano
        and kr.mes = p_mes
    ),
    'renovacoes_proximas', (
      select coalesce(jsonb_agg(row_to_json(rp)::jsonb), '[]'::jsonb)
      from public.get_resumo_renovacoes_proximas(p_unidade_id) rp
    ),
    'alunos_renovacao_urgente', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'aluno_nome', sub.aluno_nome,
        'professor_nome', sub.professor_nome,
        'curso_nome', sub.curso_nome,
        'valor_parcela', sub.valor_parcela,
        'dias_ate_vencimento', sub.dias_ate_vencimento,
        'tempo_permanencia_meses', sub.tempo_permanencia_meses,
        'telefone', sub.telefone
      ) order by sub.dias_ate_vencimento), '[]'::jsonb)
      from (
        select rp.aluno_nome,
               rp.professor_nome,
               rp.curso_nome,
               rp.valor_parcela,
               rp.dias_ate_vencimento,
               rp.tempo_permanencia_meses,
               rp.telefone
        from public.vw_renovacoes_proximas rp
        where (p_unidade_id is null or rp.unidade_id = p_unidade_id)
          and rp.status_renovacao in ('vencido', 'urgente_7_dias')
        order by rp.dias_ate_vencimento
        limit 20
      ) sub
    ),
    'mes_anterior', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'alunos_pagantes', dm.alunos_pagantes,
        'churn_rate', dm.churn_rate,
        'ticket_medio', dm.ticket_medio,
        'taxa_renovacao', dm.taxa_renovacao,
        'inadimplencia', dm.inadimplencia,
        'tempo_permanencia', dm.tempo_permanencia,
        'reajuste_parcelas', dm.reajuste_parcelas
      )), '[]'::jsonb)
      from public.dados_mensais dm
      where (p_unidade_id is null or dm.unidade_id = p_unidade_id)
        and dm.ano = ano_anterior
        and dm.mes = mes_anterior
    ),
    'mesmo_mes_ano_passado', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'alunos_pagantes', dm.alunos_pagantes,
        'churn_rate', dm.churn_rate,
        'ticket_medio', dm.ticket_medio,
        'taxa_renovacao', dm.taxa_renovacao,
        'inadimplencia', dm.inadimplencia,
        'tempo_permanencia', dm.tempo_permanencia,
        'reajuste_parcelas', dm.reajuste_parcelas
      )), '[]'::jsonb)
      from public.dados_mensais dm
      where (p_unidade_id is null or dm.unidade_id = p_unidade_id)
        and dm.ano = ano_passado
        and dm.mes = p_mes
    ),
    'metas', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'unidade_id', mt.unidade_id,
        'meta_leads', mt.meta_leads,
        'meta_experimentais', mt.meta_experimentais,
        'meta_matriculas', mt.meta_matriculas,
        'meta_taxa_conversao_experimental', mt.meta_taxa_conversao_experimental,
        'meta_taxa_conversao_lead', mt.meta_taxa_conversao_lead,
        'meta_faturamento_passaportes', mt.meta_faturamento_passaportes,
        'meta_alunos_pagantes', mt.meta_alunos_pagantes,
        'meta_alunos_ativos', mt.meta_alunos_ativos,
        'meta_ticket_medio', mt.meta_ticket_medio,
        'meta_churn_maximo', mt.meta_churn_maximo,
        'meta_evasoes_maximo', mt.meta_evasoes_maximo,
        'meta_renovacoes', mt.meta_renovacoes,
        'meta_taxa_renovacao', mt.meta_taxa_renovacao,
        'meta_inadimplencia_maxima', mt.meta_inadimplencia_maxima,
        'meta_ltv_meses', mt.meta_ltv_meses,
        'meta_faturamento_parcelas', mt.meta_faturamento_parcelas
      )), '[]'::jsonb)
      from public.metas mt
      where (p_unidade_id is null or mt.unidade_id = p_unidade_id or mt.unidade_id is null)
        and mt.ano = p_ano
        and (mt.mes = p_mes or mt.mes is null)
        and mt.ativo = true
    ),
    'evasoes_recentes', (
      -- Bloco operacional para IA/retencao. Inclui aviso_previo para contexto,
      -- portanto nao e fonte canonica de churn/evasao.
      select coalesce(jsonb_agg(jsonb_build_object(
        'aluno_nome', sub.aluno_nome,
        'professor_nome', sub.professor_nome,
        'motivo', sub.motivo,
        'tipo_saida', sub.tipo_saida,
        'valor_parcela', sub.valor_parcela,
        'tempo_permanencia', sub.tempo_permanencia,
        'data_saida', sub.data_saida
      ) order by sub.data_saida desc), '[]'::jsonb)
      from (
        select a.nome as aluno_nome,
               pr.nome as professor_nome,
               ms.nome as motivo,
               m.tipo as tipo_saida,
               coalesce(m.valor_parcela_evasao, m.valor_parcela_anterior) as valor_parcela,
               a.tempo_permanencia_meses as tempo_permanencia,
               m.data as data_saida
        from public.movimentacoes_admin m
        left join public.alunos a on m.aluno_id = a.id
        left join public.professores pr on m.professor_id = pr.id
        left join public.motivos_saida ms on m.motivo_saida_id = ms.id
        where m.tipo in ('evasao', 'nao_renovacao', 'aviso_previo')
          and (p_unidade_id is null or m.unidade_id = p_unidade_id)
          and m.data >= (current_date - interval '30 days')
        order by m.data desc
        limit 15
      ) sub
    ),
    'permanencia_por_faixa', (
      -- Bloco operacional preservado para shape. Ainda nao e contrato canonico
      -- de permanencia P0.1.
      select coalesce(jsonb_agg(jsonb_build_object(
        'faixa', faixa,
        'quantidade', quantidade,
        'percentual', round((quantidade::numeric / nullif(total, 0) * 100), 1)
      ) order by ordem), '[]'::jsonb)
      from (
        select
          case
            when tempo_permanencia_meses < 6 then '0-6 meses'
            when tempo_permanencia_meses < 12 then '6-12 meses'
            when tempo_permanencia_meses < 24 then '1-2 anos'
            when tempo_permanencia_meses < 36 then '2-3 anos'
            else '3+ anos'
          end as faixa,
          case
            when tempo_permanencia_meses < 6 then 1
            when tempo_permanencia_meses < 12 then 2
            when tempo_permanencia_meses < 24 then 3
            when tempo_permanencia_meses < 36 then 4
            else 5
          end as ordem,
          count(*) as quantidade,
          sum(count(*)) over () as total
        from public.alunos
        where status = 'ativo'
          and (p_unidade_id is null or unidade_id = p_unidade_id)
        group by faixa, ordem
      ) sub
    ),
    'dados_mes_atual', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'alunos_pagantes', dm.alunos_pagantes,
        'novas_matriculas', dm.novas_matriculas,
        'evasoes', dm.evasoes,
        'churn_rate', dm.churn_rate,
        'ticket_medio', dm.ticket_medio,
        'taxa_renovacao', dm.taxa_renovacao,
        'tempo_permanencia', dm.tempo_permanencia,
        'inadimplencia', dm.inadimplencia,
        'reajuste_parcelas', dm.reajuste_parcelas,
        'faturamento_estimado', dm.faturamento_estimado,
        'saldo_liquido', dm.saldo_liquido
      )), '[]'::jsonb)
      from public.dados_mensais dm
      where (p_unidade_id is null or dm.unidade_id = p_unidade_id)
        and dm.ano = p_ano
        and dm.mes = p_mes
    )
  )
  into resultado;

  return resultado::json;
end;
$function$;

comment on function public.get_dados_retencao_ia(uuid, integer, integer)
is 'P0.1C flatten draft: wrapper publico sem chamada a get_dados_retencao_ia_legacy_p01g. kpis_gestao via get_kpis_alunos_canonicos; kpis_retencao ainda usa vw_kpis_retencao_mensal como legado temporario.';

-- ============================================================================
-- SELECT-ONLY CHECKLIST ANTES/DEPOIS
-- ============================================================================
-- 0) Capturar definicao atual dos wrappers antes de qualquer aplicacao:
--
-- select p.oid::regprocedure::text as signature,
--        pg_get_functiondef(p.oid) as functiondef
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname in ('get_dados_relatorio_gerencial','get_dados_retencao_ia')
-- order by 1;
--
-- 1) Confirmar que wrappers publicos nao fazem chamada runtime as funcoes
--    legadas P0.1G apos aplicar em ambiente controlado.
--    Nao usar ILIKE amplo contra "legacy_p01g", pois comentarios podem gerar
--    falso positivo.
--    em ambiente controlado:
--
-- select p.oid::regprocedure::text as signature,
--        pg_get_functiondef(p.oid) ~
--          'get_dados_(relatorio_gerencial|retencao_ia)_legacy_p01g\s*\('
--          as calls_legacy_runtime
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname in ('get_dados_relatorio_gerencial','get_dados_retencao_ia')
-- order by 1;
--
-- 2) Paridade de shape por unidade/mes:
-- with casos as (
--   select '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid unidade_id, 'Campo Grande' unidade, 2026 ano, 5 mes union all
--   select '368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid, 'Barra', 2026, 5 union all
--   select '95553e96-971b-4590-a6eb-0201d013c14d'::uuid, 'Recreio', 2026, 5 union all
--   select '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid, 'Campo Grande', 2026, 6 union all
--   select '368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid, 'Barra', 2026, 6 union all
--   select '95553e96-971b-4590-a6eb-0201d013c14d'::uuid, 'Recreio', 2026, 6 union all
--   select null::uuid, 'Consolidado', 2026, 6
-- )
-- select unidade, ano, mes,
--        public.get_dados_relatorio_gerencial(unidade_id, ano, mes) ? 'kpis_alunos_canonicos' as rel_tem_canonico,
--        public.get_dados_retencao_ia(unidade_id, ano, mes)::jsonb ? 'kpis_alunos_canonicos' as ret_tem_canonico,
--        jsonb_array_length(public.get_dados_relatorio_gerencial(unidade_id, ano, mes)->'kpis_gestao') as rel_kpis_gestao_len,
--        jsonb_array_length((public.get_dados_retencao_ia(unidade_id, ano, mes)::jsonb)->'kpis_gestao') as ret_kpis_gestao_len
-- from casos
-- order by mes, unidade;
--
-- 3) Comparar top-level keys dos payloads publicos:
-- with casos as (
--   select '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid unidade_id, 'Campo Grande' unidade, 2026 ano, 5 mes union all
--   select '368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid, 'Barra', 2026, 5 union all
--   select '95553e96-971b-4590-a6eb-0201d013c14d'::uuid, 'Recreio', 2026, 5 union all
--   select '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid, 'Campo Grande', 2026, 6 union all
--   select '368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid, 'Barra', 2026, 6 union all
--   select '95553e96-971b-4590-a6eb-0201d013c14d'::uuid, 'Recreio', 2026, 6 union all
--   select null::uuid, 'Consolidado', 2026, 6
-- ),
-- payloads as (
--   select unidade, ano, mes,
--          public.get_dados_relatorio_gerencial(unidade_id, ano, mes) as relatorio,
--          public.get_dados_retencao_ia(unidade_id, ano, mes)::jsonb as retencao
--   from casos
-- )
-- select unidade, ano, mes,
--        (select array_agg(key order by key) from jsonb_object_keys(relatorio) key) as relatorio_keys,
--        (select array_agg(key order by key) from jsonb_object_keys(retencao) key) as retencao_keys
-- from payloads
-- order by mes, unidade;
--
-- 4) Comparar tamanhos dos arrays principais:
-- with casos as (
--   select '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid unidade_id, 'Campo Grande' unidade, 2026 ano, 5 mes union all
--   select '368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid, 'Barra', 2026, 5 union all
--   select '95553e96-971b-4590-a6eb-0201d013c14d'::uuid, 'Recreio', 2026, 5 union all
--   select '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid, 'Campo Grande', 2026, 6 union all
--   select '368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid, 'Barra', 2026, 6 union all
--   select '95553e96-971b-4590-a6eb-0201d013c14d'::uuid, 'Recreio', 2026, 6 union all
--   select null::uuid, 'Consolidado', 2026, 6
-- ),
-- payloads as (
--   select unidade, ano, mes,
--          public.get_dados_relatorio_gerencial(unidade_id, ano, mes) as relatorio,
--          public.get_dados_retencao_ia(unidade_id, ano, mes)::jsonb as retencao
--   from casos
-- )
-- select unidade, ano, mes,
--        jsonb_array_length(coalesce(relatorio->'kpis_gestao', '[]'::jsonb)) as rel_kpis_gestao_len,
--        jsonb_array_length(coalesce(relatorio->'kpis_retencao', '[]'::jsonb)) as rel_kpis_retencao_len,
--        jsonb_array_length(coalesce(retencao->'kpis_gestao', '[]'::jsonb)) as ret_kpis_gestao_len,
--        jsonb_array_length(coalesce(retencao->'kpis_retencao', '[]'::jsonb)) as ret_kpis_retencao_len,
--        jsonb_array_length(coalesce(retencao->'alunos_renovacao_urgente', '[]'::jsonb)) as ret_urgentes_len,
--        jsonb_array_length(coalesce(retencao->'evasoes_recentes', '[]'::jsonb)) as ret_evasoes_recentes_len
-- from payloads
-- order by mes, unidade;
--
-- ============================================================================
-- ROLLBACK FASE 1C
-- ============================================================================
-- Recriar os wrappers P0.1G atuais, que chamam *_legacy_p01g e fazem apenas
-- a sobrescrita canonica de kpis_gestao. Nao dropar as funcoes legacy.
--
-- create or replace function public.get_dados_relatorio_gerencial(...)
-- returns jsonb as:
--   v_result := public.get_dados_relatorio_gerencial_legacy_p01g(...);
--   v_kpis := public.get_kpis_alunos_canonicos(...);
--   jsonb_set em kpis_gestao, kpis_alunos_canonicos, dados_mes_atual,
--   matriculas_ativas, matriculas_banda, matriculas_2_curso, total_bolsistas.
--
-- create or replace function public.get_dados_retencao_ia(...)
-- returns json as:
--   v_result := public.get_dados_retencao_ia_legacy_p01g(...)::jsonb;
--   v_kpis := public.get_kpis_alunos_canonicos(...);
--   jsonb_set em kpis_gestao e kpis_alunos_canonicos.
-- ============================================================================
