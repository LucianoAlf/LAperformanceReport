-- Reapuração AS-OF de jan–mai/2026 (versão 2): a v1 congelou a régua correta,
-- mas os indicadores de POSIÇÃO (ativos, pagantes, trancados, bolsistas,
-- matrículas vivas, permanência) recomputaram "vivo" sobre a base de hoje —
-- saíram idênticos nos 5 meses e iguais a out/2026. Reportado pela Super Folha.
--
-- Causa raiz: a RPC canônica mede posição sobre o estado ATUAL das tabelas
-- (estado operacional Emusys, status da matrícula), não reconstrói a base como
-- estava no fim de cada mês. novos_alunos/evasões/ticket são métricas de fluxo
-- (datadas) e estavam certas.
--
-- O que esta migration faz: reconstrói a base "como estava no fim do mês"
-- (as-of) usando as fontes temporais declaradas —
--   * movimentacoes_admin_vigentes (evasao/nao_renovacao/trancamento datadas);
--   * alunos.data_saida; alunos_historico (consolidações);
--   * alunos.updated_at como bound de saída para linhas evadido/inativo sem
--     rastro datado (69 das 92 foram atualizadas em jun+, depois da janela);
--   * trancamento cobre o fim do mês quando data <= fim < previsao_retorno
--     (ou próxima movimentação);
-- e aplica a MESMA régua de pessoa do admin (pessoa_key emusys via
-- estado_atual/jornada, is_matricula_academica = não-banda e não-coral,
-- trancada fora da base ativa, pagante = entra_ticket_medio & valor>0 &
-- tipo não-bolsista/banda).
--
-- Métricas de fluxo ficam como na v1 (corretas): evasoes, faturamento_previsto/
-- realizado, mrr (competência), inadimplencia, reajuste. Derivados recalculados
-- com o denominador corrigido: churn_rate = evasoes/pagantes_asof,
-- ticket_medio = mrr_competencia/pagantes_asof, ltv = ticket*permanencia_asof,
-- tempo_permanencia = média das passagens com data_saida <= fim
-- (get_historico_ltv filtrado; quando a amostra é vazia mantém o valor da v1).
--
-- Trilha: versão 2 dos snapshots alunos_admin + alunos_executivo (append-only;
-- a v1 permanece intacta), retificação por unidade ligando v2 à v1, auditoria,
-- dados_mensais atualizado com os valores as-of. Payloads ganham também as
-- chaves as-of usadas pelo export: novas_matriculas_linhas, pessoas_em_banda,
-- pagantes_em_banda, produtores_banda.
--
-- Resíduos conhecidos (documentados nas evidencias):
--   * matrícula evadida e reativada na MESMA linha sem movimentação de retorno:
--     conta como saída definitiva se a saída <= fim (~subcontagem pequena);
--   * linha trancada hoje sem movimentação de trancamento: não dá para datar,
--     entra como ativa em todos os meses (~10 linhas hoje);
--   * saídas registradas só por nome de pessoa casam por nome exato.
-- Referência de fidelidade: CG fev as-of = 489 ativos vs 485 da versão legada
-- guardada pela Super Folha (desvio 0,8%, régua diferente explica o resto).

create or replace function pg_temp._reapurar_asof_mes(p_ano integer, p_mes integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inicio date := make_date(p_ano, p_mes, 1);
  v_fim    date := (v_inicio + interval '1 month - 1 day')::date;
  r record;
  v_snap_a fechamento_mensal_snapshots%rowtype;
  v_snap_e fechamento_mensal_snapshots%rowtype;
  v_payload_a jsonb;
  v_payload_e jsonb;
  v_meta jsonb;
  v_extra_exec jsonb;
  v_id_a uuid;
  v_id_e uuid;
  v_versao_a integer;
  v_versao_e integer;
  v_dm dados_mensais%rowtype;
  v_evasoes integer;
  v_mrr numeric;
  v_pagantes integer;
  v_churn numeric;
  v_ticket numeric;
  v_perm numeric;
  v_ltv numeric;
  v_obs constant text := 'Reapuracao AS-OF jan-mai/2026 (v2): posicao reconstruida como estava no fim de cada mes, mesma regua de pessoa do admin (corrigida 08/08). v1 permanece na trilha; retificacao vinculada. Autorizado Alf 03/10/2026.';
begin
  v_meta := jsonb_build_object(
    'reapuracao_asof_jan_mai_2026', jsonb_build_object(
      'regua', 'v1.3.1_corrigida_2026-08-08 as-of fim do mes',
      'autorizacao', 'Alf 2026-10-03',
      'corrige', 'v1 recomputou posicao sobre a base atual; v2 reconstrui a base no fim do mes',
      'origem', 'migration 20261004120000_reapuracao_asof_kpis_jan_mai_2026'
    )
  );

  for r in
    with p as (select v_fim as fim, v_inicio as ini),
    saida_row as (
      select ma.aluno_id, min(ma.data) d
      from movimentacoes_admin_vigentes ma, p
      where ma.tipo in ('evasao','nao_renovacao') and ma.data <= p.fim
        and ma.aluno_id is not null
      group by 1
      union all
      select a.id, min(ma.data)
      from movimentacoes_admin_vigentes ma
      join alunos a on a.emusys_matricula_id = ma.emusys_matricula_id
      join p on true
      where ma.tipo in ('evasao','nao_renovacao') and ma.data <= p.fim
        and ma.aluno_id is null
        and ma.emusys_matricula_id is not null and ma.emusys_matricula_id <> ''
      group by a.id
      union all
      select a.id, min(ah.data_saida)
      from alunos_historico ah
      join alunos a on a.id = any(coalesce(ah.aluno_ids, array[ah.aluno_id]))
      join p on true
      where ah.anulado = false and ah.data_saida is not null and ah.data_saida <= p.fim
      group by a.id
    ),
    sp as (
      select ma.unidade_id, lower(btrim(ma.aluno_nome)) nome_key, min(ma.data) d
      from movimentacoes_admin_vigentes ma join p on true
      where ma.tipo in ('evasao','nao_renovacao') and ma.data <= p.fim
        and ma.aluno_id is null
        and (ma.emusys_matricula_id is null or ma.emusys_matricula_id = '')
      group by 1, 2
    ),
    tranc as (
      select ma.aluno_id, ma.data d_ini,
        coalesce(ma.previsao_retorno,
          (select min(m2.data) from movimentacoes_admin_vigentes m2
            where m2.aluno_id = ma.aluno_id and m2.data > ma.data),
          '9999-12-31'::date) d_fim
      from movimentacoes_admin_vigentes ma join p on true
      where ma.tipo = 'trancamento' and ma.data <= p.fim
    ),
    base as (
      select a.id, a.unidade_id, a.data_matricula, a.idade_atual,
        case when coalesce(nullif(btrim(a.emusys_student_id),''),
                    ea.emusys_aluno_id::text, j.emusys_aluno_id::text) is not null
          then 'emusys:' || coalesce(nullif(btrim(a.emusys_student_id),''),
                    ea.emusys_aluno_id::text, j.emusys_aluno_id::text)
          else 'local:' || a.id::text end as pessoa_key,
        coalesce(nullif(btrim(a.emusys_student_id),''),
          ea.emusys_aluno_id::text, j.emusys_aluno_id::text) is null as sem_identidade,
        coalesce(a.valor_parcela, 0)::numeric as valor_parcela,
        coalesce(a.is_segundo_curso, false) as is_segundo_curso,
        coalesce(tm.codigo, '') as tipo_codigo,
        coalesce(tm.conta_como_pagante, false) as conta_pagante,
        coalesce(tm.entra_ticket_medio, false) as entra_ticket_medio,
        exists (select 1 from tranc t
          where t.aluno_id = a.id and t.d_ini <= p.fim and t.d_fim > p.fim) as trancada,
        (coalesce(c.is_projeto_banda, false) or coalesce(tm.codigo,'') = 'BANDA') as is_banda_op,
        (lower(coalesce(c.nome,'')) like '%coral%') as is_coral,
        (not (coalesce(c.is_projeto_banda, false) or coalesce(tm.codigo,'') = 'BANDA')
          and not (lower(coalesce(c.nome,'')) like '%coral%')) as is_academica
      from alunos a
      join p on true
      left join cursos c on c.id = a.curso_id
      left join tipos_matricula tm on tm.id = a.tipo_matricula_id
      left join saida_row sr on sr.aluno_id = a.id
      left join sp on sp.unidade_id = a.unidade_id
        and sp.nome_key = lower(btrim(a.nome))
      left join lateral (
        select estado.emusys_aluno_id
        from emusys_matriculas_estado_atual estado
        where estado.unidade_id = a.unidade_id and estado.emusys_aluno_id is not null
          and (estado.emusys_matricula_id = case
                 when btrim(coalesce(a.emusys_matricula_id,'')) ~ '^[0-9]+$'
                   then btrim(a.emusys_matricula_id)::bigint end
               or estado.aluno_id = a.id)
        order by (estado.emusys_matricula_id = case
                 when btrim(coalesce(a.emusys_matricula_id,'')) ~ '^[0-9]+$'
                   then btrim(a.emusys_matricula_id)::bigint end) desc,
                 estado.sincronizado_em desc
        limit 1
      ) ea on true
      left join lateral (
        select jornada.emusys_aluno_id
        from aluno_jornada_matricula_disciplina jornada
        where jornada.unidade_id = a.unidade_id and jornada.emusys_aluno_id is not null
          and (jornada.emusys_matricula_id = case
                 when btrim(coalesce(a.emusys_matricula_id,'')) ~ '^[0-9]+$'
                   then btrim(a.emusys_matricula_id)::bigint end
               or jornada.aluno_id = a.id)
        order by (jornada.emusys_matricula_id = case
                 when btrim(coalesce(a.emusys_matricula_id,'')) ~ '^[0-9]+$'
                   then btrim(a.emusys_matricula_id)::bigint end) desc,
                 jornada.ultima_sincronizacao_emusys desc
        limit 1
      ) j on true
      where (a.data_matricula is null or a.data_matricula <= p.fim)
        and (a.arquivado_em is null or a.arquivado_em::date > p.fim)
        and (a.data_saida is null or a.data_saida > p.fim)
        and (sr.d is null or (a.data_matricula is not null and a.data_matricula > sr.d))
        and (sp.d is null or (a.data_matricula is not null and a.data_matricula > sp.d))
        and (a.status not in ('evadido','inativo') or a.updated_at::date > p.fim)
    ),
    pessoas as (
      select unidade_id, pessoa_key,
        max(idade_atual) filter (where idade_atual is not null) as idade,
        bool_or(is_academica and not trancada) as ativa,
        bool_or(is_academica and not trancada and entra_ticket_medio
          and valor_parcela > 0
          and tipo_codigo not in ('BOLSISTA_INT','BOLSISTA_PARC','BANDA')) as pagante,
        sum(case when is_academica and not trancada and entra_ticket_medio
              and valor_parcela > 0
              and tipo_codigo not in ('BOLSISTA_INT','BOLSISTA_PARC','BANDA')
            then valor_parcela else 0 end) as mrr_asof,
        bool_or(is_academica and not trancada and tipo_codigo = 'BOLSISTA_INT'
          and not is_segundo_curso) as bols_int,
        bool_or(is_academica and not trancada and tipo_codigo = 'BOLSISTA_INT'
          and is_segundo_curso) as bols_int_2,
        bool_or(is_academica and not trancada and tipo_codigo = 'BOLSISTA_PARC') as bols_parc,
        bool_or(is_academica and trancada) as com_tranc,
        bool_or(is_banda_op) as em_banda,
        count(*) filter (where is_academica and not trancada) as cursos_ativos
      from base
      group by 1, 2
    ),
    agg as (
      select unidade_id,
        count(*) filter (where ativa)::integer as ativos,
        count(*) filter (where ativa and pagante)::integer as pagantes,
        round(coalesce(sum(mrr_asof) filter (where ativa and pagante), 0), 2) as mrr_asof,
        count(*) filter (where com_tranc)::integer as trancados,
        count(*) filter (where ativa and bols_int)::integer as bols_int,
        count(*) filter (where ativa and bols_int_2 and not bols_int)::integer as bols_int_2c,
        count(*) filter (where ativa and bols_parc)::integer as bols_parc,
        count(*) filter (where ativa and cursos_ativos >= 2)::integer as com_2cursos,
        count(*) filter (where ativa and cursos_ativos = 2)::integer as exato_2,
        count(*) filter (where ativa and cursos_ativos = 3)::integer as exato_3,
        count(*) filter (where ativa and cursos_ativos >= 4)::integer as exato_4m,
        coalesce(sum(greatest(cursos_ativos - 1, 0)) filter (where ativa), 0)::integer as adic,
        coalesce(sum(greatest(cursos_ativos - 2, 0)) filter (where ativa), 0)::integer as adic_extras,
        coalesce(sum(cursos_ativos) filter (where ativa), 0)::integer as matriculas_academicas,
        count(*) filter (where ativa and idade <= 11)::integer as kids,
        count(*) filter (where ativa and idade >= 12)::integer as school,
        count(*) filter (where ativa and idade is null)::integer as sem_idade,
        count(*) filter (where em_banda)::integer as pessoas_banda,
        count(*) filter (where em_banda and pagante)::integer as pagantes_banda
      from pessoas
      group by 1
    ),
    novas as (
      select b.unidade_id,
        count(distinct b.pessoa_key)::integer as novos_pessoas,
        count(*)::integer as novas_linhas
      from base b cross join p
      where b.is_academica and not b.trancada
        and b.data_matricula >= p.ini and b.data_matricula <= p.fim
        and not b.is_segundo_curso
        and b.tipo_codigo not in ('BOLSISTA_INT','BOLSISTA_PARC','BANDA','SEGUNDO_CURSO','TRANSFERENCIA')
        and (b.conta_pagante or b.entra_ticket_medio) and b.valor_parcela > 0
      group by 1
    ),
    vinc as (
      select unidade_id,
        count(*) filter (where is_banda_op)::integer as banda,
        count(*) filter (where is_coral)::integer as coral,
        count(*) filter (where trancada and is_academica)::integer as trancadas,
        count(*)::integer as total_linhas,
        count(*) filter (where sem_identidade)::integer as pendente
      from base
      group by 1
    ),
    perm as (
      select h.unidade_id, round(avg(h.tempo_meses), 2) as perm
      from get_historico_ltv(null) h, p
      where h.data_saida <= p.fim
      group by 1
    ),
    prod as (
      select b.unidade_id, count(distinct b.produtor_professor_id)::integer as n
      from banda b, p
      where b.created_at::date <= p.fim
        and coalesce(b.descartada, false) = false
        and b.produtor_professor_id is not null
      group by 1
    )
    select u.id as unidade_id, u.nome as unidade_nome,
      coalesce(ag.ativos, 0) as ativos,
      coalesce(ag.pagantes, 0) as pagantes,
      coalesce(ag.mrr_asof, 0) as mrr_asof,
      coalesce(ag.trancados, 0) as trancados,
      coalesce(ag.bols_int, 0) as bols_int,
      coalesce(ag.bols_int_2c, 0) as bols_int_2c,
      coalesce(ag.bols_parc, 0) as bols_parc,
      coalesce(ag.com_2cursos, 0) as com_2cursos,
      coalesce(ag.exato_2, 0) as exato_2,
      coalesce(ag.exato_3, 0) as exato_3,
      coalesce(ag.exato_4m, 0) as exato_4m,
      coalesce(ag.adic, 0) as adic,
      coalesce(ag.adic_extras, 0) as adic_extras,
      coalesce(ag.matriculas_academicas, 0) as matriculas_academicas,
      coalesce(ag.kids, 0) as kids,
      coalesce(ag.school, 0) as school,
      coalesce(ag.sem_idade, 0) as sem_idade,
      coalesce(ag.pessoas_banda, 0) as pessoas_banda,
      coalesce(ag.pagantes_banda, 0) as pagantes_banda,
      coalesce(n.novos_pessoas, 0) as novos_pessoas,
      coalesce(n.novas_linhas, 0) as novas_linhas,
      coalesce(v.banda, 0) as banda,
      coalesce(v.coral, 0) as coral,
      coalesce(v.trancadas, 0) as trancadas,
      coalesce(v.total_linhas, 0) as total_linhas,
      coalesce(v.pendente, 0) as pendente,
      pm.perm,
      coalesce(pr.n, 0) as produtores
    from unidades u
    left join agg ag on ag.unidade_id = u.id
    left join novas n on n.unidade_id = u.id
    left join vinc v on v.unidade_id = u.id
    left join perm pm on pm.unidade_id = u.id
    left join prod pr on pr.unidade_id = u.id
    where u.ativo = true
    order by u.codigo
  loop
    -- v1 é a base: snapshot fechado de maior versão de cada domínio.
    select * into v_snap_a
    from fechamento_mensal_snapshots s
    where s.unidade_id = r.unidade_id and s.ano = p_ano and s.mes = p_mes
      and s.dominio = 'alunos_admin' and s.status = 'fechado'
    order by s.versao desc
    limit 1;

    select * into v_snap_e
    from fechamento_mensal_snapshots s
    where s.unidade_id = r.unidade_id and s.ano = p_ano and s.mes = p_mes
      and s.dominio = 'alunos_executivo' and s.status = 'fechado'
    order by s.versao desc
    limit 1;

    if v_snap_a.id is null or v_snap_e.id is null then
      raise exception 'reapuracao_asof %/%: snapshot v1 ausente para %',
        p_mes, p_ano, r.unidade_nome;
    end if;

    select * into v_dm
    from dados_mensais dm
    where dm.ano = p_ano and dm.mes = p_mes and dm.unidade_id = r.unidade_id;

    if not found then
      raise exception 'reapuracao_asof %/%: dados_mensais ausente para %',
        p_mes, p_ano, r.unidade_nome;
    end if;

    -- Derivados: fluxo (v1) × posição (as-of). Mesma fórmula do canônico:
    -- churn = evasoes/pagantes, ticket = mrr/pagantes, ltv = ticket*permanencia.
    v_evasoes := coalesce((v_snap_e.payload->>'evasoes')::integer,
                          (v_snap_e.payload->>'total_evasoes')::integer,
                          v_dm.evasoes, 0);
    v_mrr := coalesce((v_snap_e.payload->>'mrr')::numeric,
                      (v_snap_e.payload->>'faturamento_previsto')::numeric, 0);
    v_pagantes := r.pagantes;
    v_perm := coalesce(r.perm, (v_snap_e.payload->>'tempo_permanencia')::numeric, 0);
    v_churn := case when v_pagantes > 0
      then round(100.0 * v_evasoes / v_pagantes, 2) else 0 end;
    v_ticket := case when v_pagantes > 0
      then round(v_mrr / v_pagantes, 2) else 0 end;
    v_ltv := round(v_ticket * v_perm, 2);

    v_payload_a := v_snap_a.payload || jsonb_build_object(
      'alunos_ativos', r.ativos,
      'total_alunos_ativos', r.ativos,
      'alunos_pagantes', r.pagantes,
      'total_alunos_pagantes', r.pagantes,
      'alunos_nao_pagantes', greatest(r.ativos - r.pagantes, 0),
      'bolsistas_integrais', r.bols_int,
      'total_bolsistas_integrais', r.bols_int,
      'bolsistas_integrais_regulares', r.bols_int,
      'bolsistas_integrais_segundo_curso', r.bols_int_2c,
      'bolsistas_parciais', r.bols_parc,
      'total_bolsistas_parciais', r.bols_parc,
      'alunos_trancados', r.trancados,
      'matriculas_trancadas', r.trancadas,
      'novas_matriculas', r.novos_pessoas,
      'alunos_kids', r.kids,
      'alunos_school', r.school,
      'alunos_sem_classificacao', r.sem_idade,
      'matriculas_base_alunos_ativos', r.ativos,
      'matriculas_banda', r.banda,
      'matriculas_2_curso', r.adic,
      'alunos_com_2_curso', r.com_2cursos,
      'matriculas_2_curso_extras', r.adic_extras,
      'alunos_com_exatamente_2_cursos', r.exato_2,
      'alunos_com_exatamente_3_cursos', r.exato_3,
      'alunos_com_4_ou_mais_cursos', r.exato_4m,
      'matriculas_coral', r.coral,
      'matriculas_ativas', r.matriculas_academicas + r.banda + r.coral,
      'linhas_identidade_total', r.total_linhas,
      'linhas_identidade_pendente', r.pendente,
      'identidade_emusys_cobertura_pct', case when r.total_linhas = 0 then 100
        else round(100.0 * (r.total_linhas - r.pendente) / r.total_linhas, 2) end,
      'novas_matriculas_linhas', r.novas_linhas,
      'pessoas_em_banda', r.pessoas_banda,
      'pagantes_em_banda', r.pagantes_banda,
      'produtores_banda', r.produtores,
      'mrr_asof', r.mrr_asof,
      'fonte', 'asof_movimentacoes_v2'
    ) || v_meta;

    v_extra_exec := jsonb_build_object(
      'alunos_ativos', r.ativos,
      'total_alunos_ativos', r.ativos,
      'alunos_pagantes', r.pagantes,
      'total_alunos_pagantes', r.pagantes,
      'alunos_pagantes_administrativos', r.pagantes,
      'alunos_nao_pagantes', greatest(r.ativos - r.pagantes, 0),
      'bolsistas_integrais', r.bols_int,
      'total_bolsistas_integrais', r.bols_int,
      'bolsistas_integrais_regulares', r.bols_int,
      'bolsistas_integrais_segundo_curso', r.bols_int_2c,
      'bolsistas_parciais', r.bols_parc,
      'total_bolsistas_parciais', r.bols_parc,
      'alunos_trancados', r.trancados,
      'matriculas_trancadas', r.trancadas,
      'novas_matriculas', r.novos_pessoas,
      'alunos_kids', r.kids,
      'alunos_school', r.school,
      'alunos_sem_classificacao', r.sem_idade,
      'matriculas_base_alunos_ativos', r.ativos,
      'matriculas_banda', r.banda,
      'matriculas_2_curso', r.adic,
      'alunos_com_2_curso', r.com_2cursos,
      'matriculas_2_curso_extras', r.adic_extras,
      'alunos_com_exatamente_2_cursos', r.exato_2,
      'alunos_com_exatamente_3_cursos', r.exato_3,
      'alunos_com_4_ou_mais_cursos', r.exato_4m,
      'matriculas_coral', r.coral,
      'matriculas_ativas', r.matriculas_academicas + r.banda + r.coral,
      'linhas_identidade_total', r.total_linhas,
      'linhas_identidade_pendente', r.pendente,
      'identidade_emusys_cobertura_pct', case when r.total_linhas = 0 then 100
        else round(100.0 * (r.total_linhas - r.pendente) / r.total_linhas, 2) end,
      'novas_matriculas_linhas', r.novas_linhas,
      'pessoas_em_banda', r.pessoas_banda,
      'pagantes_em_banda', r.pagantes_banda,
      'produtores_banda', r.produtores,
      'churn_rate', v_churn,
      'ticket_medio', v_ticket,
      'ticket_medio_previsto', v_ticket,
      'ticket_denominador_pagantes', r.pagantes,
      'ltv_medio', v_ltv,
      'tempo_permanencia', v_perm,
      'tempo_permanencia_medio', v_perm,
      'saldo_liquido', r.novos_pessoas - v_evasoes,
      'fonte', 'asof_movimentacoes_v2'
    );
    v_payload_e := v_snap_e.payload || v_extra_exec || v_meta;

    v_versao_a := coalesce((select max(s.versao) from fechamento_mensal_snapshots s
      where s.unidade_id = r.unidade_id and s.ano = p_ano and s.mes = p_mes
        and s.dominio = 'alunos_admin' and s.status <> 'preview'), 0) + 1;
    v_versao_e := coalesce((select max(s.versao) from fechamento_mensal_snapshots s
      where s.unidade_id = r.unidade_id and s.ano = p_ano and s.mes = p_mes
        and s.dominio = 'alunos_executivo' and s.status <> 'preview'), 0) + 1;

    insert into fechamento_mensal_snapshots (
      ano, mes, escopo, unidade_id, dominio, versao, status, fonte,
      payload, payload_hash, financeiro_realizado_disponivel,
      observacao, aprovado_em
    ) values (
      p_ano, p_mes, 'unidade', r.unidade_id, 'alunos_admin', v_versao_a, 'aprovado',
      'retificacao_asof_jan_mai_2026_v2', v_payload_a,
      hash_jsonb_canonico(v_payload_a), false, v_obs, now()
    ) returning id into v_id_a;

    insert into fechamento_mensal_snapshots (
      ano, mes, escopo, unidade_id, dominio, versao, status, fonte,
      payload, payload_hash, financeiro_realizado_disponivel,
      observacao, aprovado_em
    ) values (
      p_ano, p_mes, 'unidade', r.unidade_id, 'alunos_executivo', v_versao_e, 'aprovado',
      'retificacao_asof_jan_mai_2026_v2', v_payload_e,
      hash_jsonb_canonico(v_payload_e), false, v_obs, now()
    ) returning id into v_id_e;

    update fechamento_mensal_snapshots
    set status = 'fechado', fechado_em = now()
    where id in (v_id_a, v_id_e);

    insert into fechamento_mensal_auditoria (
      snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
    ) values
      (v_id_a, p_ano, p_mes, 'unidade', r.unidade_id, 'snapshot_gravado',
       jsonb_build_object('dominio','alunos_admin','fonte','retificacao_asof_jan_mai_2026_v2',
         'versao',v_versao_a,'origem','reapuracao_asof_jan_mai_2026','motivo',v_obs), auth.uid()),
      (v_id_e, p_ano, p_mes, 'unidade', r.unidade_id, 'snapshot_gravado',
       jsonb_build_object('dominio','alunos_executivo','fonte','retificacao_asof_jan_mai_2026_v2',
         'versao',v_versao_e,'origem','reapuracao_asof_jan_mai_2026','motivo',v_obs), auth.uid());

    insert into fechamento_mensal_retificacoes (
      snapshot_id, base_payload_hash, payload_corrigido, payload_corrigido_hash,
      motivo, evidencias, created_by
    ) values (
      v_id_a,
      v_snap_a.payload_hash,
      v_payload_a,
      hash_jsonb_canonico(v_payload_a),
      'reapuracao_asof_jan_mai_2026_v2',
      jsonb_build_object(
        'snapshot_v1_id', v_snap_a.id,
        'snapshot_v1_versao', v_snap_a.versao,
        'payload_v1', v_snap_a.payload,
        'metodo', 'posicao reconstruida as-of via movimentacoes_admin_vigentes + data_saida + alunos_historico + updated_at-bound; fluxo mantido da v1; churn/ticket/ltv/permanencia derivados com denominador as-of',
        'residuos', 'reativacao na mesma linha sem movimentacao conta como saida; trancado sem movimentacao nao datav el; saidas por pessoa casam por nome exato',
        'autorizacao', 'Alf 2026-10-03'
      ),
      auth.uid()
    );

    update dados_mensais dm set
      alunos_ativos       = r.ativos,
      alunos_pagantes     = r.pagantes,
      novas_matriculas    = r.novos_pessoas,
      churn_rate          = v_churn,
      ticket_medio        = v_ticket,
      ticket_denominador_pagantes = r.pagantes,
      tempo_permanencia   = v_perm,
      matriculas_ativas   = r.matriculas_academicas + r.banda + r.coral,
      matriculas_banda    = r.banda,
      matriculas_2_curso  = r.adic,
      bolsistas_integrais = r.bols_int,
      bolsistas_parciais  = r.bols_parc,
      updated_at          = now()
    where dm.ano = p_ano and dm.mes = p_mes and dm.unidade_id = r.unidade_id;
  end loop;
end;
$$;

select pg_temp._reapurar_asof_mes(2026, 1);
select pg_temp._reapurar_asof_mes(2026, 2);
select pg_temp._reapurar_asof_mes(2026, 3);
select pg_temp._reapurar_asof_mes(2026, 4);
select pg_temp._reapurar_asof_mes(2026, 5);
