# Fix RPC get_dados_relatorio_coordenacao — Consulta por Periodo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir a RPC `get_dados_relatorio_coordenacao` para retornar dados corretos para qualquer mes/ano, nao apenas o mes atual, e consolidar professores multi-unidade para corrigir bug de contagem duplicada.

**Architecture:** Substituir todas as referencias a `vw_kpis_professor_mensal` (que usa `CURRENT_DATE` hardcoded) por CTEs que consultam tabelas base (`alunos`, `aulas_emusys`, `aluno_presenca`, `leads`, `movimentacoes_admin`) filtrando pelo periodo `p_ano`/`p_mes`. Agrupar professores que atuam em multiplas unidades (consolidado) antes de retornar os dados. Os comparativos (mes anterior e ano anterior) tambem usam as mesmas CTEs recursivamente.

**Tech Stack:** PostgreSQL (Supabase), plpgsql

**Impacto:** Apenas a RPC `get_dados_relatorio_coordenacao`. Nenhuma outra tela ou view e afetada.

---

## File Structure

- **Modify:** `supabase/migrations/20260126_create_get_dados_relatorio_coordenacao.sql` (referencia local, a alteracao real e via `apply_migration` no Supabase)

---

### Task 1: Criar migration com a RPC corrigida

**Files:**
- Create: nova migration via Supabase MCP `apply_migration`

**O que muda vs RPC atual:**

1. **CTEs por periodo** em vez de `vw_kpis_professor_mensal`:
   - `carteira`: `alunos WHERE data_matricula <= fim_mes AND (data_saida IS NULL OR data_saida >= inicio_mes) AND status != 'lead'`
   - `presenca`: `aulas_emusys + aluno_presenca` filtrado por `data_aula` no mes
   - `turmas_calc`: `aulas_emusys + aluno_presenca` contando alunos distintos por turma no mes
   - `experimentais`: `leads WHERE data_contato` no mes
   - `renovacoes`: `movimentacoes_admin WHERE data` no mes e tipo IN ('renovacao','nao_renovacao')
   - `evasoes`: `movimentacoes_admin WHERE data` no mes e tipo IN ('evasao','nao_renovacao'), excluindo segundo_curso

2. **Consolidacao multi-unidade**: quando `p_unidade_id IS NULL` (consolidado), agrupa por professor_id somando carteira/experimentais/matriculas/renovacoes/evasoes e fazendo media ponderada de presenca/media_turma

3. **Comparativos** (mes_anterior, ano_anterior): usam as mesmas CTEs com datas do periodo correspondente

4. **Secoes que nao mudam**: agenda, catalogo_treinamentos, metas_professores (ja usam tabelas base com p_ano/p_mes)

5. **top_retencao**: ajustar filtro de `status = 'ativo'` para filtro por periodo (mesma logica da carteira)

- [ ] **Step 1: Aplicar a migration no Supabase**

Usar o MCP `apply_migration` com o SQL completo da nova RPC (CREATE OR REPLACE FUNCTION).

A funcao recebe os mesmos parametros `(p_unidade_id UUID, p_ano INTEGER, p_mes INTEGER)` e retorna o mesmo JSONB com as mesmas chaves, mantendo compatibilidade total com a edge function `gemini-relatorio-coordenacao`.

SQL completo:

```sql
CREATE OR REPLACE FUNCTION get_dados_relatorio_coordenacao(
  p_unidade_id UUID,
  p_ano INTEGER,
  p_mes INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB := '{}'::jsonb;
  v_unidade_nome TEXT;
  v_inicio DATE;
  v_fim DATE;
  v_inicio_ant DATE;
  v_fim_ant DATE;
  v_inicio_ano_ant DATE;
  v_fim_ano_ant DATE;
BEGIN
  -- Calcular range de datas do periodo
  v_inicio := make_date(p_ano, p_mes, 1);
  v_fim := (v_inicio + interval '1 month' - interval '1 day')::date;

  -- Mes anterior
  v_inicio_ant := (v_inicio - interval '1 month')::date;
  v_fim_ant := (v_inicio - interval '1 day')::date;

  -- Mesmo mes ano anterior
  v_inicio_ano_ant := make_date(p_ano - 1, p_mes, 1);
  v_fim_ano_ant := (v_inicio_ano_ant + interval '1 month' - interval '1 day')::date;

  -- Buscar nome da unidade
  IF p_unidade_id IS NOT NULL THEN
    SELECT nome INTO v_unidade_nome FROM unidades WHERE id = p_unidade_id;
  ELSE
    v_unidade_nome := 'Consolidado';
  END IF;

  -- Periodo
  v_result := v_result || jsonb_build_object('periodo', jsonb_build_object(
    'unidade_id', p_unidade_id,
    'unidade_nome', v_unidade_nome,
    'ano', p_ano,
    'mes', p_mes,
    'coordenadores', ARRAY['Quintela', 'Juliana']
  ));

  -- KPIs consolidados dos professores (agrupados por professor)
  v_result := v_result || jsonb_build_object('kpis_professores', (
    WITH
      carteira AS (
        SELECT a.professor_atual_id AS professor_id, a.unidade_id,
          COUNT(*) AS carteira_alunos,
          CASE WHEN COUNT(*) FILTER (WHERE a.valor_parcela > 0) > 0
            THEN ROUND(SUM(a.valor_parcela) / COUNT(*) FILTER (WHERE a.valor_parcela > 0), 2) ELSE 0 END AS ticket_medio,
          SUM(CASE WHEN a.valor_parcela > 0 THEN a.valor_parcela ELSE 0 END) AS mrr_carteira
        FROM alunos a
        WHERE a.professor_atual_id IS NOT NULL
          AND a.data_matricula <= v_fim
          AND (a.data_saida IS NULL OR a.data_saida >= v_inicio)
          AND a.status != 'lead'
          AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
        GROUP BY a.professor_atual_id, a.unidade_id
      ),
      presenca AS (
        SELECT ae.professor_id, ae.unidade_id,
          ROUND(COUNT(*) FILTER (WHERE ap.status = 'presente')::numeric / NULLIF(COUNT(*)::numeric, 0) * 100, 2) AS media_presenca
        FROM aulas_emusys ae
        JOIN aluno_presenca ap ON ap.aula_emusys_id = ae.id
        WHERE ae.data_aula BETWEEN v_inicio AND v_fim
          AND ae.cancelada = false
          AND (p_unidade_id IS NULL OR ae.unidade_id = p_unidade_id)
        GROUP BY ae.professor_id, ae.unidade_id
      ),
      turmas_calc AS (
        SELECT ae.professor_id, ae.unidade_id,
          COUNT(DISTINCT ae.turma_nome) AS total_turmas,
          ROUND(COUNT(DISTINCT ap.aluno_id)::numeric / NULLIF(COUNT(DISTINCT ae.turma_nome), 0), 2) AS media_alunos_turma
        FROM aulas_emusys ae
        JOIN aluno_presenca ap ON ap.aula_emusys_id = ae.id
        WHERE ae.data_aula BETWEEN v_inicio AND v_fim
          AND ae.cancelada = false
          AND (p_unidade_id IS NULL OR ae.unidade_id = p_unidade_id)
        GROUP BY ae.professor_id, ae.unidade_id
      ),
      experimentais AS (
        SELECT l.professor_experimental_id AS professor_id, l.unidade_id,
          SUM(CASE WHEN l.experimental_realizada THEN COALESCE(l.quantidade,1) ELSE 0 END) AS experimentais,
          SUM(CASE WHEN l.status IN ('matriculado','convertido') AND l.experimental_realizada THEN COALESCE(l.quantidade,1) ELSE 0 END) AS matriculas_pos_exp,
          SUM(CASE WHEN l.status IN ('matriculado','convertido') THEN COALESCE(l.quantidade,1) ELSE 0 END) AS matriculas
        FROM leads l
        WHERE l.professor_experimental_id IS NOT NULL
          AND l.data_contato BETWEEN v_inicio AND v_fim
          AND (p_unidade_id IS NULL OR l.unidade_id = p_unidade_id)
        GROUP BY l.professor_experimental_id, l.unidade_id
      ),
      renovacoes AS (
        SELECT COALESCE(m.professor_id, a.professor_atual_id) AS professor_id, m.unidade_id,
          COUNT(*) FILTER (WHERE m.tipo = 'renovacao') AS renovacoes,
          COUNT(*) FILTER (WHERE m.tipo = 'nao_renovacao') AS nao_renovacoes,
          COUNT(*) FILTER (WHERE m.tipo IN ('renovacao','nao_renovacao')) AS total_contratos
        FROM movimentacoes_admin m
        LEFT JOIN alunos a ON a.id = m.aluno_id
        WHERE COALESCE(m.professor_id, a.professor_atual_id) IS NOT NULL
          AND m.tipo IN ('renovacao','nao_renovacao')
          AND m.data BETWEEN v_inicio AND v_fim
          AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
        GROUP BY COALESCE(m.professor_id, a.professor_atual_id), m.unidade_id
      ),
      evasoes AS (
        SELECT m.professor_id, m.unidade_id,
          COUNT(*) AS evasoes,
          SUM(COALESCE(m.valor_parcela_evasao, m.valor_parcela_anterior, 0)) AS mrr_perdido
        FROM movimentacoes_admin m
        LEFT JOIN alunos a ON a.id = m.aluno_id
        WHERE m.professor_id IS NOT NULL
          AND m.tipo IN ('evasao','nao_renovacao')
          AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false OR a.id IS NULL)
          AND m.data BETWEEN v_inicio AND v_fim
          AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
        GROUP BY m.professor_id, m.unidade_id
      ),
      -- Juntar por professor+unidade
      kpis_por_unidade AS (
        SELECT
          p.id AS professor_id,
          p.nome AS professor_nome,
          COALESCE(c.unidade_id, pr.unidade_id, e.unidade_id, r.unidade_id, ev.unidade_id) AS unidade_id,
          COALESCE(c.carteira_alunos, 0)::integer AS carteira_alunos,
          COALESCE(pr.media_presenca, 0)::numeric(5,2) AS media_presenca,
          COALESCE(tc.media_alunos_turma, 0)::numeric(5,2) AS media_alunos_turma,
          COALESCE(p.nps_medio, 0)::numeric(5,2) AS nps_medio,
          COALESCE(e.experimentais, 0)::integer AS experimentais,
          COALESCE(e.matriculas, 0)::integer AS matriculas,
          COALESCE(e.matriculas_pos_exp, 0)::integer AS matriculas_pos_exp,
          CASE WHEN COALESCE(e.experimentais,0) > 0
            THEN ROUND(COALESCE(e.matriculas_pos_exp,0)::numeric / e.experimentais * 100, 2) ELSE 0 END AS taxa_conversao,
          COALESCE(r.renovacoes, 0)::integer AS renovacoes,
          COALESCE(r.nao_renovacoes, 0)::integer AS nao_renovacoes,
          CASE WHEN COALESCE(r.total_contratos,0) > 0
            THEN ROUND(r.renovacoes::numeric / r.total_contratos * 100, 2) ELSE 0 END AS taxa_renovacao,
          COALESCE(ev.evasoes, 0)::integer AS evasoes,
          COALESCE(c.mrr_carteira, 0)::numeric(12,2) AS mrr_carteira,
          COALESCE(ev.mrr_perdido, 0)::numeric(12,2) AS mrr_perdido,
          -- Taxa de retencao
          CASE WHEN COALESCE(c.carteira_alunos,0) > 0
            THEN ROUND((COALESCE(c.carteira_alunos,0) - COALESCE(ev.evasoes,0))::numeric / c.carteira_alunos * 100, 2) ELSE 100 END AS taxa_retencao,
          -- Taxa de crescimento (placeholder, sem historico no periodo)
          0::numeric AS taxa_crescimento
        FROM professores p
        LEFT JOIN carteira c ON c.professor_id = p.id
        LEFT JOIN presenca pr ON pr.professor_id = p.id AND pr.unidade_id = c.unidade_id
        LEFT JOIN turmas_calc tc ON tc.professor_id = p.id AND tc.unidade_id = c.unidade_id
        LEFT JOIN experimentais e ON e.professor_id = p.id AND e.unidade_id = c.unidade_id
        LEFT JOIN renovacoes r ON r.professor_id = p.id AND r.unidade_id = c.unidade_id
        LEFT JOIN evasoes ev ON ev.professor_id = p.id AND ev.unidade_id = c.unidade_id
        WHERE p.ativo = true
          AND (c.professor_id IS NOT NULL OR pr.professor_id IS NOT NULL
               OR e.professor_id IS NOT NULL OR r.professor_id IS NOT NULL OR ev.professor_id IS NOT NULL)
      ),
      -- Consolidar multi-unidade por professor
      kpis_consolidados AS (
        SELECT
          professor_id,
          professor_nome,
          SUM(carteira_alunos) AS carteira_alunos,
          -- Media ponderada por carteira
          CASE WHEN SUM(carteira_alunos) > 0
            THEN ROUND(SUM(media_presenca * carteira_alunos) / SUM(carteira_alunos), 2)
            ELSE 0 END AS media_presenca,
          CASE WHEN SUM(carteira_alunos) > 0
            THEN ROUND(SUM(media_alunos_turma * carteira_alunos) / SUM(carteira_alunos), 2)
            ELSE 0 END AS media_alunos_turma,
          MAX(nps_medio) AS nps_medio,
          SUM(experimentais) AS experimentais,
          SUM(matriculas) AS matriculas,
          SUM(matriculas_pos_exp) AS matriculas_pos_exp,
          CASE WHEN SUM(experimentais) > 0
            THEN ROUND(SUM(matriculas_pos_exp)::numeric / SUM(experimentais) * 100, 2) ELSE 0 END AS taxa_conversao,
          SUM(renovacoes) AS renovacoes,
          SUM(nao_renovacoes) AS nao_renovacoes,
          CASE WHEN SUM(renovacoes) + SUM(nao_renovacoes) > 0
            THEN ROUND(SUM(renovacoes)::numeric / (SUM(renovacoes) + SUM(nao_renovacoes)) * 100, 2) ELSE 0 END AS taxa_renovacao,
          SUM(evasoes) AS evasoes,
          SUM(mrr_carteira) AS mrr_carteira,
          SUM(mrr_perdido) AS mrr_perdido,
          CASE WHEN SUM(carteira_alunos) > 0
            THEN ROUND((SUM(carteira_alunos) - SUM(evasoes))::numeric / SUM(carteira_alunos) * 100, 2) ELSE 100 END AS taxa_retencao,
          0::numeric AS taxa_crescimento,
          -- Cursos do professor
          (SELECT COALESCE(array_agg(DISTINCT c.nome), ARRAY[]::text[])
           FROM professores_cursos pc
           JOIN cursos c ON c.id = pc.curso_id
           WHERE pc.professor_id = kpis_por_unidade.professor_id) AS cursos
        FROM kpis_por_unidade
        GROUP BY professor_id, professor_nome
      )
    SELECT COALESCE(jsonb_agg(row_to_json(k) ORDER BY k.carteira_alunos DESC), '[]'::jsonb)
    FROM kpis_consolidados k
  ));

  -- Totais consolidados (calculados do kpis_professores ja consolidado)
  v_result := v_result || jsonb_build_object('totais', (
    SELECT row_to_json(t)
    FROM (
      SELECT
        jsonb_array_length(v_result->'kpis_professores') AS total_professores,
        (SELECT SUM((p->>'carteira_alunos')::int) FROM jsonb_array_elements(v_result->'kpis_professores') p) AS total_alunos,
        (SELECT ROUND(AVG((p->>'carteira_alunos')::numeric), 1) FROM jsonb_array_elements(v_result->'kpis_professores') p) AS media_alunos_professor,
        (SELECT ROUND(AVG(NULLIF((p->>'media_alunos_turma')::numeric, 0)), 2) FROM jsonb_array_elements(v_result->'kpis_professores') p) AS media_alunos_turma,
        (SELECT ROUND(AVG((p->>'media_presenca')::numeric), 1) FROM jsonb_array_elements(v_result->'kpis_professores') p) AS media_presenca,
        (SELECT ROUND(AVG(NULLIF((p->>'nps_medio')::numeric, 0)), 1) FROM jsonb_array_elements(v_result->'kpis_professores') p) AS nps_medio,
        (SELECT ROUND(AVG((p->>'taxa_conversao')::numeric), 1) FROM jsonb_array_elements(v_result->'kpis_professores') p) AS taxa_conversao_media,
        (SELECT ROUND(AVG((p->>'taxa_renovacao')::numeric), 1) FROM jsonb_array_elements(v_result->'kpis_professores') p) AS taxa_renovacao_media,
        (SELECT SUM((p->>'evasoes')::int) FROM jsonb_array_elements(v_result->'kpis_professores') p) AS total_evasoes,
        (SELECT SUM((p->>'matriculas')::int) FROM jsonb_array_elements(v_result->'kpis_professores') p) AS total_matriculas,
        (SELECT SUM((p->>'mrr_carteira')::numeric) FROM jsonb_array_elements(v_result->'kpis_professores') p) AS mrr_total
    ) t
  ));

  -- Top 5 professores por carteira (do JSON ja consolidado)
  v_result := v_result || jsonb_build_object('top_carteira', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'professor', p->>'professor_nome',
      'alunos', (p->>'carteira_alunos')::int
    )), '[]'::jsonb)
    FROM (
      SELECT p FROM jsonb_array_elements(v_result->'kpis_professores') p
      ORDER BY (p->>'carteira_alunos')::int DESC LIMIT 5
    ) sub
  ));

  -- Top 5 professores por media de alunos/turma
  v_result := v_result || jsonb_build_object('top_media_turma', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'professor', p->>'professor_nome',
      'media', (p->>'media_alunos_turma')::numeric
    )), '[]'::jsonb)
    FROM (
      SELECT p FROM jsonb_array_elements(v_result->'kpis_professores') p
      WHERE (p->>'media_alunos_turma')::numeric > 0
      ORDER BY (p->>'media_alunos_turma')::numeric DESC LIMIT 5
    ) sub
  ));

  -- Top 5 professores por presenca
  v_result := v_result || jsonb_build_object('top_presenca', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'professor', p->>'professor_nome',
      'presenca', (p->>'media_presenca')::numeric
    )), '[]'::jsonb)
    FROM (
      SELECT p FROM jsonb_array_elements(v_result->'kpis_professores') p
      ORDER BY (p->>'media_presenca')::numeric DESC LIMIT 5
    ) sub
  ));

  -- Top 5 professores matriculadores
  v_result := v_result || jsonb_build_object('top_matriculadores', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'professor', p->>'professor_nome',
      'matriculas', (p->>'matriculas')::int
    )), '[]'::jsonb)
    FROM (
      SELECT p FROM jsonb_array_elements(v_result->'kpis_professores') p
      WHERE (p->>'matriculas')::int > 0
      ORDER BY (p->>'matriculas')::int DESC LIMIT 5
    ) sub
  ));

  -- Top 5 professores por retencao (tempo medio de permanencia)
  v_result := v_result || jsonb_build_object('top_retencao', (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT
        p.nome AS professor,
        ROUND(AVG(a.tempo_permanencia_meses), 1) AS tempo_medio
      FROM alunos a
      JOIN professores p ON a.professor_atual_id = p.id
      WHERE a.data_matricula <= v_fim
        AND (a.data_saida IS NULL OR a.data_saida >= v_inicio)
        AND a.status != 'lead'
        AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
      GROUP BY p.id, p.nome
      HAVING COUNT(*) >= 3
      ORDER BY AVG(a.tempo_permanencia_meses) DESC
      LIMIT 5
    ) t
  ));

  -- Professores em alerta (do JSON ja consolidado)
  v_result := v_result || jsonb_build_object('professores_alerta', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'professor_id', (p->>'professor_id')::int,
      'professor', p->>'professor_nome',
      'presenca', (p->>'media_presenca')::numeric,
      'evasoes', (p->>'evasoes')::int,
      'alunos', (p->>'carteira_alunos')::int,
      'status', CASE
        WHEN (p->>'media_presenca')::numeric < 70 OR (p->>'evasoes')::int > 2 THEN 'critico'
        WHEN (p->>'media_presenca')::numeric < 80 OR (p->>'evasoes')::int > 0 THEN 'atencao'
        ELSE 'ok'
      END
    )), '[]'::jsonb)
    FROM (
      SELECT p FROM jsonb_array_elements(v_result->'kpis_professores') p
      WHERE (p->>'media_presenca')::numeric < 80 OR (p->>'evasoes')::int > 0
      ORDER BY (p->>'media_presenca')::numeric ASC
    ) sub
  ));

  -- Agendamentos/Treinamentos do mes (sem mudanca - ja usa tabelas base)
  v_result := v_result || jsonb_build_object('agenda', (
    SELECT row_to_json(a)
    FROM (
      SELECT
        (SELECT COUNT(*) FROM professor_acoes pa
         WHERE pa.tipo = 'treinamento'
           AND (p_unidade_id IS NULL OR pa.unidade_id = p_unidade_id)
           AND EXTRACT(YEAR FROM pa.data_agendada) = p_ano
           AND EXTRACT(MONTH FROM pa.data_agendada) = p_mes) AS treinamentos_agendados,
        (SELECT COUNT(*) FROM professor_acoes pa
         WHERE pa.tipo = 'reuniao'
           AND (p_unidade_id IS NULL OR pa.unidade_id = p_unidade_id)
           AND EXTRACT(YEAR FROM pa.data_agendada) = p_ano
           AND EXTRACT(MONTH FROM pa.data_agendada) = p_mes) AS reunioes_agendadas,
        (SELECT COUNT(*) FROM professor_acoes pa
         WHERE pa.tipo = 'checkpoint'
           AND (p_unidade_id IS NULL OR pa.unidade_id = p_unidade_id)
           AND EXTRACT(YEAR FROM pa.data_agendada) = p_ano
           AND EXTRACT(MONTH FROM pa.data_agendada) = p_mes) AS checkpoints_agendados,
        (SELECT COUNT(*) FROM professor_acoes pa
         WHERE pa.status = 'concluido'
           AND (p_unidade_id IS NULL OR pa.unidade_id = p_unidade_id)
           AND EXTRACT(YEAR FROM pa.data_agendada) = p_ano
           AND EXTRACT(MONTH FROM pa.data_agendada) = p_mes) AS concluidos,
        (SELECT COUNT(*) FROM professor_acoes pa
         WHERE pa.status = 'pendente'
           AND pa.data_agendada < CURRENT_DATE
           AND (p_unidade_id IS NULL OR pa.unidade_id = p_unidade_id)) AS atrasados
    ) a
  ));

  -- Catalogo de treinamentos (sem mudanca)
  v_result := v_result || jsonb_build_object('catalogo_treinamentos', (
    SELECT COALESCE(jsonb_agg(row_to_json(ct)), '[]'::jsonb)
    FROM (
      SELECT id, nome, descricao
      FROM catalogo_treinamentos
      WHERE ativo = true
      ORDER BY nome
    ) ct
  ));

  -- Metas de professores (sem mudanca)
  v_result := v_result || jsonb_build_object('metas_professores', (
    SELECT COALESCE(jsonb_object_agg(mk.tipo, mk.valor), '{}'::jsonb)
    FROM metas_kpi mk
    WHERE mk.ano = p_ano AND mk.mes = p_mes
      AND (p_unidade_id IS NULL OR mk.unidade_id = p_unidade_id)
      AND mk.tipo IN ('media_alunos_turma', 'media_alunos_professor', 'taxa_renovacao_prof',
                      'nps_medio', 'presenca_media', 'taxa_conversao_exp', 'melhor_retencao')
  ));

  -- Comparativo com mes anterior (mesmas CTEs com datas do mes anterior)
  v_result := v_result || jsonb_build_object('mes_anterior', (
    WITH
      cart_ant AS (
        SELECT a.professor_atual_id AS professor_id,
          COUNT(*) AS carteira_alunos
        FROM alunos a
        WHERE a.professor_atual_id IS NOT NULL
          AND a.data_matricula <= v_fim_ant
          AND (a.data_saida IS NULL OR a.data_saida >= v_inicio_ant)
          AND a.status != 'lead'
          AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
        GROUP BY a.professor_atual_id
      ),
      pres_ant AS (
        SELECT ae.professor_id,
          ROUND(COUNT(*) FILTER (WHERE ap.status = 'presente')::numeric / NULLIF(COUNT(*)::numeric, 0) * 100, 2) AS media_presenca
        FROM aulas_emusys ae
        JOIN aluno_presenca ap ON ap.aula_emusys_id = ae.id
        WHERE ae.data_aula BETWEEN v_inicio_ant AND v_fim_ant
          AND ae.cancelada = false
          AND (p_unidade_id IS NULL OR ae.unidade_id = p_unidade_id)
        GROUP BY ae.professor_id
      ),
      exp_ant AS (
        SELECT l.professor_experimental_id AS professor_id,
          SUM(CASE WHEN l.status IN ('matriculado','convertido') THEN COALESCE(l.quantidade,1) ELSE 0 END) AS matriculas
        FROM leads l
        WHERE l.professor_experimental_id IS NOT NULL
          AND l.data_contato BETWEEN v_inicio_ant AND v_fim_ant
          AND (p_unidade_id IS NULL OR l.unidade_id = p_unidade_id)
        GROUP BY l.professor_experimental_id
      ),
      ev_ant AS (
        SELECT m.professor_id, COUNT(*) AS evasoes
        FROM movimentacoes_admin m
        LEFT JOIN alunos a ON a.id = m.aluno_id
        WHERE m.professor_id IS NOT NULL
          AND m.tipo IN ('evasao','nao_renovacao')
          AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false OR a.id IS NULL)
          AND m.data BETWEEN v_inicio_ant AND v_fim_ant
          AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
        GROUP BY m.professor_id
      ),
      profs_ant AS (
        SELECT DISTINCT COALESCE(c.professor_id, p.professor_id, e.professor_id, ev.professor_id) AS pid
        FROM cart_ant c
        FULL OUTER JOIN pres_ant p ON p.professor_id = c.professor_id
        FULL OUTER JOIN exp_ant e ON e.professor_id = c.professor_id
        FULL OUTER JOIN ev_ant ev ON ev.professor_id = c.professor_id
      )
    SELECT row_to_json(t)
    FROM (
      SELECT
        COUNT(*) AS total_professores,
        SUM(COALESCE(c.carteira_alunos, 0)) AS total_alunos,
        ROUND(AVG(COALESCE(p.media_presenca, 0)), 1) AS media_presenca,
        SUM(COALESCE(ev.evasoes, 0)) AS total_evasoes,
        SUM(COALESCE(e.matriculas, 0)) AS total_matriculas
      FROM profs_ant pa
      LEFT JOIN cart_ant c ON c.professor_id = pa.pid
      LEFT JOIN pres_ant p ON p.professor_id = pa.pid
      LEFT JOIN exp_ant e ON e.professor_id = pa.pid
      LEFT JOIN ev_ant ev ON ev.professor_id = pa.pid
    ) t
  ));

  -- Comparativo com mesmo mes ano anterior
  v_result := v_result || jsonb_build_object('ano_anterior', (
    WITH
      cart_aa AS (
        SELECT a.professor_atual_id AS professor_id,
          COUNT(*) AS carteira_alunos
        FROM alunos a
        WHERE a.professor_atual_id IS NOT NULL
          AND a.data_matricula <= v_fim_ano_ant
          AND (a.data_saida IS NULL OR a.data_saida >= v_inicio_ano_ant)
          AND a.status != 'lead'
          AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
        GROUP BY a.professor_atual_id
      ),
      pres_aa AS (
        SELECT ae.professor_id,
          ROUND(COUNT(*) FILTER (WHERE ap.status = 'presente')::numeric / NULLIF(COUNT(*)::numeric, 0) * 100, 2) AS media_presenca
        FROM aulas_emusys ae
        JOIN aluno_presenca ap ON ap.aula_emusys_id = ae.id
        WHERE ae.data_aula BETWEEN v_inicio_ano_ant AND v_fim_ano_ant
          AND ae.cancelada = false
          AND (p_unidade_id IS NULL OR ae.unidade_id = p_unidade_id)
        GROUP BY ae.professor_id
      ),
      exp_aa AS (
        SELECT l.professor_experimental_id AS professor_id,
          SUM(CASE WHEN l.status IN ('matriculado','convertido') THEN COALESCE(l.quantidade,1) ELSE 0 END) AS matriculas
        FROM leads l
        WHERE l.professor_experimental_id IS NOT NULL
          AND l.data_contato BETWEEN v_inicio_ano_ant AND v_fim_ano_ant
          AND (p_unidade_id IS NULL OR l.unidade_id = p_unidade_id)
        GROUP BY l.professor_experimental_id
      ),
      ev_aa AS (
        SELECT m.professor_id, COUNT(*) AS evasoes
        FROM movimentacoes_admin m
        LEFT JOIN alunos a ON a.id = m.aluno_id
        WHERE m.professor_id IS NOT NULL
          AND m.tipo IN ('evasao','nao_renovacao')
          AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false OR a.id IS NULL)
          AND m.data BETWEEN v_inicio_ano_ant AND v_fim_ano_ant
          AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
        GROUP BY m.professor_id
      ),
      profs_aa AS (
        SELECT DISTINCT COALESCE(c.professor_id, p.professor_id, e.professor_id, ev.professor_id) AS pid
        FROM cart_aa c
        FULL OUTER JOIN pres_aa p ON p.professor_id = c.professor_id
        FULL OUTER JOIN exp_aa e ON e.professor_id = c.professor_id
        FULL OUTER JOIN ev_aa ev ON ev.professor_id = c.professor_id
      )
    SELECT row_to_json(t)
    FROM (
      SELECT
        COUNT(*) AS total_professores,
        SUM(COALESCE(c.carteira_alunos, 0)) AS total_alunos,
        ROUND(AVG(COALESCE(p.media_presenca, 0)), 1) AS media_presenca,
        SUM(COALESCE(ev.evasoes, 0)) AS total_evasoes,
        SUM(COALESCE(e.matriculas, 0)) AS total_matriculas
      FROM profs_aa pa
      LEFT JOIN cart_aa c ON c.professor_id = pa.pid
      LEFT JOIN pres_aa p ON p.professor_id = pa.pid
      LEFT JOIN exp_aa e ON e.professor_id = pa.pid
      LEFT JOIN ev_aa ev ON ev.professor_id = pa.pid
    ) t
  ));

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION get_dados_relatorio_coordenacao IS 'Funcao para buscar dados do relatorio de coordenacao pedagogica com IA - Coordenadores: Quintela e Juliana. V2: consulta tabelas base por periodo em vez de vw_kpis_professor_mensal.';
```

- [ ] **Step 2: Verificar que a migration foi aplicada**

Run: `SELECT routine_name FROM information_schema.routines WHERE routine_name = 'get_dados_relatorio_coordenacao';`
Expected: 1 row

---

### Task 2: Validar resultados para abril/2026 (mes atual)

- [ ] **Step 1: Chamar a RPC para abril/2026 consolidado**

```sql
SELECT
  (r->'totais'->>'total_professores')::int AS total_profs,
  (r->'totais'->>'total_alunos')::int AS total_alunos,
  (r->'totais'->>'media_presenca')::numeric AS media_presenca,
  (r->'totais'->>'total_evasoes')::int AS total_evasoes,
  jsonb_array_length(r->'kpis_professores') AS kpis_count
FROM get_dados_relatorio_coordenacao(NULL, 2026, 4) r;
```

Expected: `total_profs = 42`, `kpis_count = 42` (professores consolidados, sem duplicatas)

- [ ] **Step 2: Verificar que professores nao estao duplicados**

```sql
SELECT
  (p->>'professor_id')::int AS pid,
  p->>'professor_nome' AS nome,
  COUNT(*) AS ocorrencias
FROM jsonb_array_elements(
  (SELECT get_dados_relatorio_coordenacao(NULL, 2026, 4))->'kpis_professores'
) p
GROUP BY (p->>'professor_id')::int, p->>'professor_nome'
HAVING COUNT(*) > 1;
```

Expected: 0 rows (nenhuma duplicata)

---

### Task 3: Validar resultados para marco/2026 (mes anterior — era zerado)

- [ ] **Step 1: Chamar a RPC para marco/2026 consolidado**

```sql
SELECT
  (r->'totais'->>'total_professores')::int AS total_profs,
  (r->'totais'->>'total_alunos')::int AS total_alunos,
  (r->'totais'->>'media_presenca')::numeric AS media_presenca,
  (r->'totais'->>'total_evasoes')::int AS total_evasoes
FROM get_dados_relatorio_coordenacao(NULL, 2026, 3) r;
```

Expected: `total_profs > 0`, `total_alunos > 0` (NAO deve ser zerado)

- [ ] **Step 2: Chamar a RPC para marco/2026 Campo Grande**

```sql
SELECT
  (r->'totais'->>'total_professores')::int AS total_profs,
  (r->'totais'->>'total_alunos')::int AS total_alunos
FROM get_dados_relatorio_coordenacao('2ec861f6-023f-4d7b-9927-3960ad8c2a92', 2026, 3) r;
```

Expected: `total_profs > 0`

- [ ] **Step 3: Verificar comparativo mes anterior preenchido**

```sql
SELECT
  r->'mes_anterior'->>'total_professores' AS profs_ant,
  r->'mes_anterior'->>'total_alunos' AS alunos_ant
FROM get_dados_relatorio_coordenacao(NULL, 2026, 3) r;
```

Expected: valores nao-nulos (dados de fevereiro/2026)

---

### Task 4: Atualizar migration local e commit

**Files:**
- Modify: `supabase/migrations/20260126_create_get_dados_relatorio_coordenacao.sql`

- [ ] **Step 1: Atualizar o arquivo de migration local**

Substituir o conteudo do arquivo `supabase/migrations/20260126_create_get_dados_relatorio_coordenacao.sql` pelo SQL completo da Task 1.

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260126_create_get_dados_relatorio_coordenacao.sql
git commit -m "fix: RPC relatorio coordenacao consulta tabelas base por periodo

- Substitui vw_kpis_professor_mensal (hardcoded CURRENT_DATE) por CTEs parametrizadas
- Carteira calculada por data_matricula/data_saida no periodo
- Presenca calculada de aulas_emusys do mes
- Media turma de alunos distintos por turma no mes
- Consolida professores multi-unidade (fix contagem duplicada)
- Comparativos (mes anterior, ano anterior) tambem por periodo"
```
