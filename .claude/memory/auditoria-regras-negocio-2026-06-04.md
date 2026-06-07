# Auditoria de Regras de Negocio — LA Report
> Data: 2026-06-04  
> Auditor: Devin (agente CLI)  
> Base: 25 regras canonicas + varredura completa frontend + banco + migrations

---

## Resumo Executivo

**Status geral:** O sistema tem 3 camadas de calculo (views SQL, functions/RPCs, frontend) que **nem sempre aplicam as mesmas regras**. A maior parte dos KPIs esta alinhada com as regras canonicas, mas existem **divergencias criticas** que podem gerar numeros diferentes entre dashboard, gestao mensal e relatorios.

**Principais divergencias:**
1. **Churn rate** usa base diferente entre view (`alunos_pagantes` do mes atual) e snapshot (`dados_mensais` pode usar base anterior se nao recalculado).
2. **Evasoes** sao deduplicadas no banco (DISTINCT ON nome/mes) mas NAO no frontend — frontend pode contar duplicatas.
3. **Renovacoes/reajuste** migraram de tabela `renovacoes` (desatualizada) para `movimentacoes_admin` (atual) na view, mas o frontend ainda busca de `renovacoes` em alguns lugares.
4. **LTV** nao e calculado na view nova (falta a CTE), mas o frontend calcula como `ticket * tempo_permanencia`.
5. **Reajuste medio** so considera aumentos positivos (`novo > anterior`) — reajuste 0% ou negativo NAO entra.

**Principais ambiguidades:**
1. **Kids/School**: a regra de classificacao no frontend (`idade <= 11` = Kids, `>= 12` = School) difere da classificacao por `tipo_aluno` no banco antigo.
2. **Ticket medio**: a view V5 nao o calcula (financeiro "fora de escopo"). O frontend usa `dados_mensais.ticket_medio` que pode estar desatualizado.
3. **MRR/Faturamento**: `vw_dashboard_unidade` mistura `alunos` (tempo real) com `dados_mensais` (snapshot) — risco de numeros inconsistentes no mes de transicao.

**Principais alinhamentos:**
- Base de pessoa vs matricula e consistente (DISTINCT nome para ativos/pagantes; COUNT(*) para matriculas).
- Exclusao de segundo curso em ativos/pagantes e universal.
- Evasao = cancelamento + nao renovacao e universal.
- Aviso previo NAO e evasao e universal.
- Experimentais contam quando realizadas, nao agendadas.

---

## Mapa por KPI

### KPI: Total Alunos Ativos

- **Onde aparece no frontend:** `TabGestao.tsx` (card), `DashboardPage.tsx` (card), `useKPIsGestao.ts`
- **Fonte tecnica:** `vw_kpis_gestao_mensal` (tempo real) ou `dados_mensais` (historico)
- **Regra aplicada hoje:**
  - Banco (view V5, MIGRACAO_REGLA_KPI_V5_ALUNOS.sql): `COUNT(DISTINCT nome) WHERE status IN ('ativo','trancado') AND data_matricula <= fim_mes AND (data_saida IS NULL OR data_saida > fim_mes)`
  - Banco (view 20260531): `COUNT(*) FILTER (WHERE is_segundo_curso IS NULL OR false)` — **REGRESSAO!** Conta linhas, nao pessoas.
  - Frontend fallback (DashboardPage.tsx:447): `alunosData.filter((a: any) => !a.is_segundo_curso).length` — linha-level, nao DISTINCT nome.
- **Regra canonica relacionada:** #1 (ativos incluem trancados), #2 (base exclui segundo curso), #21 (ativos = pessoas)
- **Status:** **DIVERGENTE** — view 20260531 conta linhas (`COUNT(*)`) em vez de pessoas (`COUNT(DISTINCT nome)`). Frontend fallback TabGestao usa DISTINCT nome, mas DashboardPage fallback usa linha-level.
- **Evidencia:**
  - `supabase/migrations/20260531_fix_renovacoes_reajuste_views.sql` linha 52: `count(*) FILTER (WHERE a.is_segundo_curso IS NULL OR a.is_segundo_curso = false) AS total_alunos`
  - `src/components/GestaoMensal/TabGestao.tsx` linha 426: `const nomesAtivos = new Set(alunosData.map((a: any) => a.nome)); const totalAtivos = nomesAtivos.size;`
  - `src/components/App/Dashboard/DashboardPage.tsx` linha 447-448: `const totalAtivos = alunosData.filter((a: any) => !a.is_segundo_curso).length;` (nao usa DISTINCT)
- **Risco:** Dashboard pode mostrar numero maior que Gestao Mensal se houver pessoas com 2 cursos (um principal + banda). Ex: pessoa com Canto + Banda = 2 linhas, dashboard conta 2, gestao conta 1.
- **Recomendacao:** Padronizar `COUNT(DISTINCT nome)` para ativos em TODAS as fontes (view, RPC, frontend).

---

### KPI: Alunos Pagantes

- **Onde aparece no frontend:** `TabGestao.tsx` (card com barra/meta), `DashboardPage.tsx` (card)
- **Fonte tecnica:** `vw_kpis_gestao_mensal` ou `dados_mensais` (fallback)
- **Regra aplicada hoje:**
  - View V5: `COUNT(DISTINCT sb.nome) FILTER (WHERE sb.conta_como_pagante = true)`
  - View 20260531: `count(*) FILTER (WHERE tm.conta_como_pagante = true AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false))` — **REGRESSAO!** Conta linhas, nao pessoas.
  - View 20260531 (ticket): `COUNT(DISTINCT chave_aluno)` onde chave = `nome + data_nasc + unidade_id` — pessoa-level para ticket, mas nao para pagantes.
  - Frontend fallback (TabGestao.tsx:432): `conta_como_pagante=true AND valor_parcela > 0`
- **Regra canonica relacionada:** #7 (exclui bolsista integral, parcial, nao pagante), #8 (bolsista parcial nao conta), #24 (valor_parcela > 0 nao basta sozinho)
- **Status:** **DIVERGENTE** — view 20260531 conta linhas pagantes em vez de pessoas pagantes. Se uma pessoa tem 2 cursos pagantes, conta 2x.
- **Evidencia:**
  - `supabase/migrations/20260531_fix_renovacoes_reajuste_views.sql` linha 53: `count(*) FILTER (WHERE tm.conta_como_pagante = true AND ...) AS alunos_pagantes`
  - `src/components/GestaoMensal/TabGestao.tsx` linha 432-435: `const pagantesRecords = alunosData.filter((a: any) => (a.tipos_matricula as any)?.conta_como_pagante && (a.valor_parcela || 0) > 0); const nomesPagantes = new Set(pagantesRecords.map((a: any) => a.nome)); const totalPagantes = nomesPagantes.size;`
- **Risco:** Card "Pagantes" pode mostrar numero inflacionado. Barra de meta (475/479) pode ficar "acima de 100%" sem que o usuario entenda por que.
- **Recomendacao:** Padronizar `COUNT(DISTINCT nome) FILTER (WHERE conta_como_pagante)` na view. O frontend TabGestao ja faz certo, mas a view nao.

---

### KPI: Matriculas Ativas

- **Onde aparece no frontend:** `TabGestao.tsx` (nao exibido como card, mas usado em tooltip/comparacao)
- **Fonte tecnica:** `vw_kpis_gestao_mensal` (view V5 adiciona `matriculas_ativas` ao final)
- **Regra aplicada hoje:** `COUNT(*)` (todas as linhas no snapshot)
- **Regra canonica relacionada:** #3 (matriculas ativas sao registros, podem ser > alunos), #4 (inclui 1o, 2o, banda, coral)
- **Status:** **ALINHADO**
- **Evidencia:** `docs/MIGRACAO_REGLA_KPI_V5_ALUNOS.sql` linha 101: `COUNT(*) AS matriculas_ativas`
- **Risco:** Baixo.
- **Recomendacao:** Nenhuma.

---

### KPI: Kids / School (Classificacao LAMK / EMLA)

- **Onde aparece no frontend:** `TabGestao.tsx` (cards LA Kids e LA Music School), `DashboardPage.tsx`
- **Fonte tecnica:** `alunos` direto (frontend calcula)
- **Regra aplicada hoje:**
  - Frontend (TabGestao.tsx:749-754): Pessoa com `temRegular OR temAtivo` -> classificada. `idade <= 11` = Kids, `idade >= 12` = School.
  - Banco antigo (fase3_views_kpis.sql): Usava `tipo_aluno = 'EMLA'` / `'LAMK'` — campo legado.
  - Banco (get_carteira_professores.sql): Usa `classificacao = 'LAMK'` / `'EMLA'`.
- **Regra canonica relacionada:** #5 (percentual sobre pessoas, nao matriculas brutas), #6 (mesma base do Total Alunos Ativos)
- **Status:** **AMBIGUO** — o frontend classifica por `idade_atual`, mas o banco (carteira do professor) usa `classificacao` (campo que pode estar desatualizado se nao recalculado).
- **Evidencia:**
  - `src/components/GestaoMensal/TabGestao.tsx` linha 752: `const totalLaKids = pessoasComClassificacao.filter(p => p.idade !== null && p.idade <= 11).length;`
  - `src/components/GestaoMensal/TabGestao.tsx` linha 751 comentario: `// is_segundo_curso e promovido automaticamente para classificacao`
  - `supabase/migrations/20260515_get_carteira_professores.sql` linha 49-50: `COUNT(*) FILTER (WHERE ab.classificacao = 'LAMK')` / `'EMLA'`
- **Risco:** Se `idade_atual` for diferente da `classificacao` (ex: aluno fez aniversario, classificacao nao atualizada), os numeros divergem.
- **Recomendacao:** Padronizar para `idade_atual` (fonte da verdade) e remover dependencia de `classificacao`.

---

### KPI: Banda / Projeto

- **Onde aparece no frontend:** `TabGestao.tsx` (card separado "Banda"), `ComercialPage.tsx`
- **Fonte tecnica:** `alunos` com JOIN `cursos`
- **Regra aplicada hoje:** `cursos.is_projeto_banda = true` OR `cursos.nome ILIKE '%banda%'` OR `cursos.nome ILIKE '%power kids%'`
- **Regra canonica relacionada:** #10 (segundo curso nao inclui banda), #22 (banda nao e segundo curso financeiro)
- **Status:** **ALINHADO**
- **Evidencia:**
  - `supabase/migrations/20260531_fix_renovacoes_reajuste_views.sql` linha 56: `count(*) FILTER (WHERE c.nome::text ~~* '%banda%'::text OR c.nome::text ~~* '%power kids%'::text) AS total_banda`
  - `src/components/GestaoMensal/TabGestao.tsx` linha 756: `a.cursos?.is_projeto_banda === true`
- **Risco:** Baixo. Ambas as fontes usam a mesma flag.

---

### KPI: Evasao / Total Evasoes

- **Onde aparece no frontend:** `TabGestao.tsx` (card, grafico), `DashboardPage.tsx`, `useKPIsGestao.ts`
- **Fonte tecnica:** `movimentacoes_admin` (frontend direto) ou `vw_kpis_retencao_mensal` (view antiga usa `evasoes_v2`!)
- **Regra aplicada hoje:**
  - Frontend (TabGestao.tsx:784): `.in('tipo', ['evasao', 'nao_renovacao'])` — SEM deduplicacao.
  - View V5: `DISTINCT ON (LOWER(TRIM(aluno_nome)), unidade_id, ano, mes)` — COM deduplicacao.
  - View 20260531 (retencao): Usa `evasoes_v2` — **TABELA DESATUALIZADA!**
  - View 20260531 (gestao): Usa `movimentacoes_admin` com DISTINCT ON — atual.
- **Regra canonica relacionada:** #11 (aviso previo nao e evasao), #12 (evasao = cancelamento + nao renovacao), #18 (data de lancamento nao e data real), #19 (separar data lancamento, real, tipo, competencia)
- **Status:** **DIVERGENTE** — view `vw_kpis_retencao_mensal` ainda le `evasoes_v2` (tabela desatualizada). Frontend TabGestao le `movimentacoes_admin` sem dedup. View V5 le `movimentacoes_admin` com dedup.
- **Evidencia:**
  - `supabase/migrations/fase3_views_kpis.sql` linha 231: `FROM evasoes_v2` (view antiga)
  - `supabase/migrations/20260531_fix_renovacoes_reajuste_views.sql` linha 88: `FROM movimentacoes_admin m WHERE m.tipo IN ('evasao', 'nao_renovacao')`
  - `src/components/GestaoMensal/TabGestao.tsx` linha 784: `.in('tipo', ['evasao', 'nao_renovacao'])` — sem DISTINCT ON.
- **Risco:** Numero de evasoes pode variar entre dashboard (view retencao = evasoes_v2), gestao (view gestao = movimentacoes_admin com dedup), e frontend direto (movimentacoes_admin sem dedup).
- **Recomendacao:**
  1. Dropar `evasoes_v2` ou sincroniza-la com `movimentacoes_admin`.
  2. Padronizar deduplicacao: usar DISTINCT ON (nome, unidade, ano, mes) em TODAS as fontes.
  3. Documentar que `data` em `movimentacoes_admin` e a data de lancamento, nao a data real de saida (regra #18).

---

### KPI: Taxa de Renovacao

- **Onde aparece no frontend:** `TabGestao.tsx` (card), `AdministrativoPage.tsx`
- **Fonte tecnica:** `renovacoes` (frontend) ou `movimentacoes_admin` (view 20260531)
- **Regra aplicada hoje:**
  - View 20260531: `renovacoes / (renovacoes + nao_renovacoes)` — exclui aviso previo.
  - View V5: Usa tabela `renovacoes` (status='renovado') — **TABELA DESATUALIZADA no V5!**
  - Frontend (TabGestao.tsx): `renovacoes_realizadas / (renovacoes_realizadas + nao_renovacoes)`
- **Regra canonica relacionada:** #13 (taxa = renovacoes / (renovacoes + nao_renovacoes)), #25 (reajuste so considera aumentos positivos)
- **Status:** **AMBIGUO** — a view 20260531 usa a regra correta com `movimentacoes_admin`, mas o frontend ainda busca de `renovacoes` (tabela legada).
- **Evidencia:**
  - `supabase/migrations/20260531_fix_renovacoes_reajuste_views.sql` linha 254: `CASE WHEN COALESCE(rm.renovacoes_previstas, 0) > 0 THEN (rm.renovacoes_realizadas::numeric / rm.renovacoes_previstas::numeric * 100) ELSE 0 END`
  - `src/components/GestaoMensal/TabGestao.tsx` linha 630: renovecoes realizadas vêm de `renovacoes` table (nao de `movimentacoes_admin`).
- **Risco:** Se `renovacoes` table nao for atualizada, o frontend mostra numero diferente da view.
- **Recomendacao:** Migrar frontend de `renovacoes` para `movimentacoes_admin` com `tipo='renovacao'`.

---

### KPI: Churn Rate

- **Onde aparece no frontend:** `TabGestao.tsx` (card), `DashboardPage.tsx`, `useKPIsGestao.ts`
- **Fonte tecnica:** `vw_kpis_gestao_mensal` ou `dados_mensais`
- **Regra aplicada hoje:**
  - View V5: `ROUND(evasoes / alunos_pagantes * 100, 2)` — base = pagantes do mes atual.
  - View 20260531: `ROUND(total_evasoes / alunos_pagantes * 100, 2)` — base = pagantes do mes atual.
  - Function `recalcular_dados_mensais`: Mesma formula.
  - Documentacao antiga (KPIs_LA_MUSIC_PERFORMANCE_REPORT.md): `evasoes / (alunos_inicio + novas_matriculas) * 100` — **FORMULA DIFERENTE!**
- **Regra canonica relacionada:** #13 (taxa renovacao formula), #25 (reajuste so aumentos)
- **Status:** **DIVERGENTE** entre a regra documentada (KPIs doc) e o codigo atual. O codigo atual usa `evasoes / alunos_pagantes` (base atual). O doc antigo usa `evasoes / (alunos_inicio + novas_matriculas)` (base com entradas).
- **Evidencia:**
  - `docs/KPIs_LA_MUSIC_PERFORMANCE_REPORT.md` linha 115: `churn_pct = (evasoes / total_alunos_ativos) * 100`
  - `supabase/migrations/20260531_fix_renovacoes_reajuste_views.sql` linha 155: `CASE WHEN COALESCE(am.alunos_pagantes, 0) > 0 THEN round(COALESCE(em.total_evasoes, 0)::numeric / am.alunos_pagantes::numeric * 100, 2) ELSE 0::numeric END`
  - `docs/METAS_RELACOES_MATEMATICAS.md` linha 16: `G3: Churn Rate = G2 / G1 * 100` (evasoes / alunos_ativos)
- **Risco:** Alto. O churn e um dos KPIs mais importantes. Se a formula mudou, a meta corporativa (ex: "churn maximo 5%") pode estar sendo avaliada com base errada.
- **Recomendacao:** Definir com o Alf qual e a formula canonica:
  - Opcao A: `evasoes / alunos_pagantes` (base atual, usada no codigo hoje)
  - Opcao B: `evasoes / (alunos_inicio + novas_matriculas)` (base com entradas, doc antigo)
  - Opcao C: `evasoes / alunos_ativos` (base mais ampla, METAS doc)

---

### KPI: Ticket Medio

- **Onde aparece no frontend:** `TabGestao.tsx` (card), `DashboardPage.tsx`, `ComercialPage.tsx`
- **Fonte tecnica:** `vw_kpis_gestao_mensal` (view antiga calculava) ou `dados_mensais` (fallback)
- **Regra aplicada hoje:**
  - View antiga (fase3): `AVG(valor_parcela) FILTER (WHERE tipo_aluno NOT IN (...))`
  - View 20260531: Calcula via CTE `alunos_ticket` — agrupa por pessoa (`nome + nascimento + unidade`), soma parcelas, depois `AVG(valor_total)`.
  - View V5: **NAO CALCULA** — financeiro "fora de escopo" da V5. Usa fallback `financeiro_legado` que nao e validado.
  - Frontend (VALIDACAO_KPI_CG_MAIO2026_V5_FINANCEIRO.sql): `MRR / pagantes` onde MRR = `SUM(valor_parcela) FILTER (WHERE conta_como_pagante AND valor > 0)`.
- **Regra canonica relacionada:** #24 (valor_parcela > 0 + conta_como_pagante nao bastam como regra universal), #23 (financeiro separa ativo operacional, pagante contratual, pagante financeiro)
- **Status:** **DIVERGENTE** — a view V5 nao calcula ticket. O frontend usa `dados_mensais.ticket_medio` que pode estar desatualizado. A validacao V5 propoe `MRR / pagantes` (por pessoa), mas a view antiga fazia `AVG(valor_parcela)` (por linha).
- **Evidencia:**
  - `docs/MIGRACAO_REGLA_KPI_V5_ALUNOS.sql` linha 118-128: CTE `financeiro_legado` com comentario `NÃO validar/alterar ticket agora`
  - `docs/VALIDACAO_KPI_CG_MAIO2026_V5_FINANCEIRO.sql` linha 102-110: `ticket_medio = MRR / pagantes` (pessoa-level)
  - `supabase/migrations/fase3_01_view_gestao.sql` linha 15: `AVG(valor_parcela) FILTER (...) as ticket_medio` (linha-level)
- **Risco:** Ticket medio e a base de MRR, ARR, LTV, metas. Se estiver errado, todos os KPIs financeiros downstream ficam errados.
- **Recomendacao:** Aprovar a validacao V5 (`MRR / pagantes` por pessoa) e aplicar na view + function + frontend.

---

### KPI: MRR / Faturamento Previsto / Faturamento Realizado

- **Onde aparece no frontend:** `TabGestao.tsx`, `DashboardPage.tsx`, `useKPIsGestao.ts`
- **Fonte tecnica:** `vw_kpis_gestao_mensal` ou `dados_mensais`
- **Regra aplicada hoje:**
  - View antiga: `SUM(valor_parcela)` dos pagantes (linha-level).
  - View 20260531: `SUM(valor_parcela) FILTER (WHERE conta_como_pagante AND status_pagamento <> 'sem_parcela')`.
  - View V5: `SUM(valor_parcela) FILTER (WHERE conta_como_pagante)` (fallback legado).
  - Frontend: `faturamento_previsto = MRR`; `faturamento_realizado = MRR * (1 - inadimplencia/100)`.
- **Regra canonica relacionada:** #23 (financeiro separa ativo operacional, pagante contratual, pagante financeiro)
- **Status:** **AMBIGUO** — o calculo muda entre versoes da view. A view 20260531 exclui `status_pagamento = 'sem_parcela'`; a V5 nao exclui.
- **Evidencia:**
  - `supabase/migrations/20260531_fix_renovacoes_reajuste_views.sql` linha 58: `sum(a.valor_parcela) FILTER (WHERE tm.conta_como_pagante = true AND COALESCE(a.status_pagamento, '') <> 'sem_parcela') AS mrr`
  - `docs/MIGRACAO_REGLA_KPI_V5_ALUNOS.sql` linha 122: `SUM(a.valor_parcela) FILTER (WHERE tm.conta_como_pagante = true) AS mrr`
- **Risco:** MRR pode variar entre versoes da view. O card "Faturamento Realizado" usa `inadimplencia_pct` que por sua vez depende de `status_pagamento = 'inadimplente'`.
- **Recomendacao:** Validar se `status_pagamento` e confiavel (vinda do Emusys?) antes de usar como filtro.

---

### KPI: Inadimplencia

- **Onde aparece no frontend:** `TabGestao.tsx` (card), `DashboardPage.tsx`
- **Fonte tecnica:** `vw_kpis_gestao_mensal` ou `dados_mensais`
- **Regra aplicada hoje:**
  - View 20260531: `qtd_inadimplentes / alunos_pagantes * 100` (percentual de CABECAS).
  - Validacao V5: `mrr_inadimplente / mrr * 100` (percentual de VALOR).
- **Regra canonica relacionada:** #23 (financeiro separa pagante contratual vs pagante financeiro)
- **Status:** **DIVERGENTE** — view calcula inadimplencia por cabeca; validacao V5 propoe por valor. Sao metricas diferentes.
- **Evidencia:**
  - `supabase/migrations/20260531_fix_renovacoes_reajuste_views.sql` linha 147: `CASE WHEN COALESCE(am.alunos_pagantes, 0) > 0 THEN round(COALESCE(am.qtd_inadimplentes, 0)::numeric / am.alunos_pagantes::numeric * 100, 2) ELSE 0::numeric END`
  - `docs/VALIDACAO_KPI_CG_MAIO2026_V5_FINANCEIRO.sql` linha 111-115: `inadimplencia_pct_valor = mrr_inadimplente / mrr_contratual * 100`
- **Risco:** A meta de inadimplencia (ex: "maximo 5%") pode estar sendo medida de forma diferente no dashboard vs no relatorio financeiro.
- **Recomendacao:** Definir com o Alf se inadimplencia e percentual de pessoas (cabeca) ou percentual de receita (valor).

---

### KPI: Reajuste Medio

- **Onde aparece no frontend:** `TabGestao.tsx` (grafico de reajuste)
- **Fonte tecnica:** `renovacoes` (frontend) ou `movimentacoes_admin` (view 20260531)
- **Regra aplicada hoje:**
  - View 20260531: `AVG((novo - anterior) / anterior * 100) FILTER (WHERE tipo='renovacao' AND anterior>0 AND novo>anterior)`.
  - Frontend (TabGestao.tsx): `AVG(percentual_reajuste)` de `renovacoes`.
- **Regra canonica relacionada:** #25 (reajuste medio considera somente renovacoes com aumento positivo; reajuste 0 ou sem valores anterior/novo nao entra)
- **Status:** **ALINHADO** com a regra #25. A view 20260531 implementa exatamente isso.
- **Evidencia:**
  - `supabase/migrations/20260531_fix_renovacoes_reajuste_views.sql` linha 119-127: filtro `novo > anterior` e `anterior > 0`.
- **Risco:** Baixo. A regra esta correta, mas o frontend ainda busca de `renovacoes` (tabela que pode nao ter sido atualizada com a mesma regra).

---

### KPI: Aulas Experimentais / Taxa Show-Up

- **Onde aparece no frontend:** `ComercialPage.tsx`, `DashboardPage.tsx`, `useKPIsComercial.ts`
- **Fonte tecnica:** `leads` (status) ou `vw_kpis_comercial_mensal`
- **Regra aplicada hoje:**
  - Agendadas: `status = 'experimental_agendada'` (nao inclui 'experimental_realizada' nem 'matriculado').
  - Realizadas: `status IN ('experimental_realizada', 'compareceu', 'matriculado')`.
  - Taxa show-up: `realizadas / agendadas * 100`.
- **Regra canonica relacionada:** #17 (aulas experimentais contam no mes em que foram FEITAS, nao no mes em que foram marcadas)
- **Status:** **AMBIGUO** — a regra #17 diz que conta quando foram FEITAS (data da aula), mas o banco filtra por `data_contato` (data do lead) e `status` (estado atual).
- **Evidencia:**
  - `supabase/migrations/fase3_views_kpis.sql` linha 100-106: `EXTRACT(MONTH FROM data_contato)` como base do mes.
  - `src/hooks/useKPIsComercial.ts` linha 175: `.gte('data_contato', startDate)`.
- **Risco:** Se uma aula experimental foi AGENDADA em Maio mas FEITA em Junho, ela aparece em Maio (por `data_contato`) e em Junho (por `status` mudado). A regra #17 propoe contar no mes da aula (data real), mas o sistema nao tem esse campo.
- **Recomendacao:** Adicionar campo `data_experimental_realizada` (ja existe em `leads`!) e usa-lo para filtro de mes.

---

### KPI: Taxa de Conversao (Professor)

- **Onde aparece no frontend:** `TabPerformanceProfessores.tsx`, `ModalDetalhesConversao.tsx`
- **Fonte tecnica:** RPC `get_kpis_professor_periodo`
- **Regra aplicada hoje:**
  - Denominador: `experimentais` = leads com `experimental_realizada = true`.
  - Numerador: `matriculas_pos_exp` = leads com `experimental_realizada = true` OU `(converteu=true AND faltou_experimental IS NOT TRUE)`.
- **Regra canonica relacionada:** Nao listada nas 25, mas documentada em regras-negocio.md
- **Status:** **AMBIGUO** — a assimetria entre numerador e denominador pode gerar taxa > 100% (exemplo real: Willian/T1 2026 = 200%).
- **Evidencia:**
  - `src/components/App/Professores/ModalDetalhesConversao.tsx` classifica 6 categorias de leads.
  - `supabase/migrations/20260126_create_get_dados_relatorio_coordenacao.sql` linha 95-96: `SUM(CASE WHEN l.experimental_realizada THEN ... END)` vs `SUM(CASE WHEN l.status IN ('matriculado','convertido') AND l.experimental_realizada THEN ... END)`.
- **Risco:** Taxa > 100% pode confundir usuarios. O `ModalDetalhesConversao` ja destaca casos ambiguos (badge ambar).
- **Recomendacao:** Decidir se corrige operacional (marca `experimental_realizada=true` no Emusys) ou corrige formula (numerador tambem exige `experimental_realizada=true`).

---

### KPI: Novas Matriculas

- **Onde aparece no frontend:** `TabGestao.tsx`, `ComercialPage.tsx`, `DashboardPage.tsx`
- **Fonte tecnica:** `alunos` (data_matricula no periodo)
- **Regra aplicada hoje:**
  - View/Function: `data_matricula BETWEEN inicio_mes AND fim_mes` AND `COALESCE(is_segundo_curso, false) = false` AND `COALESCE(c.is_projeto_banda, false) = false` AND `c.nome NOT ILIKE '%canto coral%'` AND `tm.codigo NOT IN ('BOLSISTA_INT', 'BOLSISTA_PARC')` AND `status IN ('ativo', 'trancado')` AND `(data_saida IS NULL OR data_saida > fim_mes)`.
  - Frontend (TabGestao.tsx): Mesma regra, mas sem filtro de `data_saida` (apenas `data_matricula` no periodo).
- **Regra canonica relacionada:** #14 (exclui bolsista, banda, coral), #15 (exclui segundo curso)
- **Status:** **ALINHADO**
- **Evidencia:**
  - `supabase/migrations/20260531_fix_renovacoes_reajuste_views.sql` linha 27: `WHERE a.data_matricula IS NOT NULL AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false) AND (c.is_projeto_banda IS NULL OR c.is_projeto_banda = false) AND (c.nome IS NULL OR c.nome::text !~~* '%canto coral%'::text) AND (tm.codigo IS NULL OR (tm.codigo::text <> ALL (ARRAY['BOLSISTA_INT'::character varying::text, 'BOLSISTA_PARC'::character varying::text])))`
  - `docs/MIGRACAO_REGLA_KPI_V5_ALUNOS.sql` linha 136-148: mesma regra com filtros explicitos.
- **Risco:** Baixo. A regra esta bem documentada e implementada consistentemente.

---

### KPI: Taxa de Conversao Geral (Lead -> Matricula)

- **Onde aparece no frontend:** `ComercialPage.tsx`, `useKPIsComercial.ts`, `DashboardPage.tsx`
- **Fonte tecnica:** Calculado no frontend (`novas_matriculas / total_leads * 100`)
- **Regra aplicada hoje:** `novas_matriculas / total_leads * 100`
- **Regra canonica relacionada:** #16 (taxa de conversao usa leads com status de realizacao, nao todos)
- **Status:** **AMBIGUO** — a regra #16 diz que so conta leads que realizaram aula experimental, mas o calculo atual usa `total_leads` (todos os leads do periodo, incluindo nao-agendados).
- **Evidencia:**
  - `src/hooks/useKPIsComercial.ts` linha 218: `taxa_conversao_geral = (novas_matriculas / total_leads) * 100`
  - `docs/regras-negocio-canonicas.md` regra #16: "Taxa de conversao geral usa apenas leads com status de realizacao de aula experimental como denominador"
- **Risco:** Taxa de conversao geral pode ficar artificialmente baixa se houver muitos leads que nunca agendaram experimental (ex: leads de indicacao direta).
- **Recomendacao:** Confirmar com Alf se denominador deve ser `total_leads` ou `leads_com_experimental_realizada`.

---

### KPI: Tempo de Permanencia / LTV

- **Onde aparece no frontend:** `TabGestao.tsx` (card), `DashboardPage.tsx`
- **Fonte tecnica:** `vw_kpis_gestao_mensal` (view antiga) ou `dados_mensais` (fallback)
- **Regra aplicada hoje:**
  - View antiga (fase3): `AVG(EXTRACT(MONTH FROM AGE(CURRENT_DATE, data_matricula)))` para alunos ativos.
  - View 20260531: Combina `alunos_historico` (tempo >= 4 meses) + `alunos` inativos/evadidos (exclui bolsistas/banda). `ROUND(AVG(meses), 1)`.
  - View V5: **NAO CALCULA** — usa fallback `financeiro_legado` com `AVG(a.tempo_permanencia_meses)`.
  - Frontend (TabGestao.tsx): `Number(d.tempo_permanencia) || 0` (le de dados_mensais).
  - LTV: `ticket_medio * tempo_permanencia_medio` (calculado no frontend).
- **Regra canonica relacionada:** #20 (LTV = ticket medio * tempo de permanencia)
- **Status:** **DIVERGENTE** — a view V5 nao calcula tempo de permanencia nem LTV. O frontend calcula LTV mas pode usar dados desatualizados.
- **Evidencia:**
  - `supabase/migrations/fase3_01_view_gestao.sql` linha 24: `AVG(EXTRACT(MONTH FROM AGE(CURRENT_DATE, data_matricula))) as tempo_permanencia_medio`
  - `docs/MIGRACAO_REGLA_KPI_V5_ALUNOS.sql` linha 123: `AVG(a.tempo_permanencia_meses) AS tempo_permanencia_medio` (fallback legado, nao validado)
  - `src/components/GestaoMensal/TabGestao.tsx` linha 361: `ltv_medio: (Number(d.ticket_medio) || 0) * (Number(d.tempo_permanencia) || 0)`
- **Risco:** LTV pode estar incorreto se `tempo_permanencia` nao for atualizado. A regra #20 diz que LTV = ticket * tempo, mas se o ticket tambem estiver errado, o LTV e duplamente afetado.
- **Recomendacao:** Implementar calculo de tempo de permanencia e LTV na view V5 conforme regra canonica.

---

### KPI: Carteira de Professores (MRR, Ticket, Turmas)

- **Onde aparece no frontend:** `TabCarteiraProfessores.tsx`
- **Fonte tecnica:** RPC `get_carteira_professores`
- **Regra aplicada hoje:**
  - Total alunos: `COUNT(*)` WHERE `status = 'ativo'`.
  - Ticket medio: `SUM(valor_parcela) / COUNT(*) FILTER (WHERE valor_parcela > 0 AND NOT is_segundo_curso)`.
  - Total turmas: `COUNT(DISTINCT (curso_id || '@' || dia_aula || ':' || horario_aula))` WHERE `conta_turma = true` (exclui banda).
  - Media alunos/turma: `COUNT(*) / COUNT(DISTINCT turmas)`.
- **Regra canonica relacionada:** Nao listada nas 25 canonicas, mas documentada em regras-negocio.md
- **Status:** **ALINHADO** com a logica de negocio documentada.
- **Evidencia:**
  - `supabase/migrations/20260515_get_carteira_professores.sql` linha 48-79: formulas de carteira.
  - `src/components/App/Professores/TabCarteiraProfessores.tsx` linha 100: chamada RPC.
- **Risco:** Baixo. A RPC e bem estruturada e alinhada.

---

## Regras Implicitas Encontradas

### R1. Snapshot Operacional vs Snapshot de Competencia
O sistema opera com **dois tipos de snapshot** que nunca foram explicitamente documentados como regras de negocio:
- **Snapshot operacional** (view `vw_kpis_gestao_mensal`): Le `alunos` em tempo real, usa `CURRENT_DATE`.
- **Snapshot de competencia** (function `recalcular_dados_mensais`): Le `alunos` no `fim_mes` da competencia, permite backfill.
- **Impacto:** Numeros do mes atual (view) podem diferir dos numeros do mes fechado (dados_mensais) se houver alteracoes retroactivas.

### R2. Deduplicacao de Evasoes
A regra de deduplicar evasoes por pessoa/mes existe **apenas no banco** (DISTINCT ON), nao no frontend. Isso e uma regra implicita de negocio que deveria ser universal.
- **Impacto:** Frontend pode mostrar evasoes duplicadas se a mesma pessoa for registrada 2x no mesmo mes.

### R3. Chave Unica de Pessoa
A regra de que "pessoa = nome + data_nascimento + unidade_id" e usada em algumas CTEs (ex: `alunos_ticket` na view 20260531), mas nunca foi documentada como regra canonica. Em outros lugares, usa-se apenas `nome` (ex: view V5).
- **Impacto:** Pessoas com mesmo nome mas datas diferentes podem ser contadas como 1 ou 2 dependendo da fonte.

### R4. Regra de Banda como Projeto
A exclusao de banda dos calculos de turma, carteira e score do professor e uma regra implicita importante que so existe no campo `is_projeto_banda`.
- **Impacto:** Se um curso de banda for cadastrado sem `is_projeto_banda = true`, ele sera contado como curso normal e distorcera os KPIs de professor.

### R5. Regra de Canto Coral
A exclusao de "canto coral" das novas matriculas e uma regra ad-hoc baseada em `nome ILIKE '%canto coral%'`.
- **Impacto:** Se o nome do curso mudar (ex: "Coral Infantil"), a regra quebra. Nao ha flag `is_coral` ou similar.

### R6. Status "sem_parcela"
O filtro `status_pagamento <> 'sem_parcela'` na view 20260531 indica uma regra implicita de que alunos sem parcela (ex: pagamento unico) nao entram no MRR.
- **Impacto:** Se um aluno paga passaporte (pagamento unico), seu valor nao entra no MRR mensal.

### R7. Assimetria Experimental/Matricula
A taxa de conversao de professor permite que um lead seja contado como matricula mesmo sem ter feito aula experimental (se `converteu=true AND faltou_experimental IS NOT TRUE`).
- **Impacto:** Taxa de conversao pode exceder 100%, o que e matematicamente estranho mas operacionalmente explicavel (matricula direta).

### R8. Regra de Trimestre para Professores
O modo trimestral (T1=Mar-Mai, T2=Jun-Ago, T3=Set-Nov, NC=Dez-Fev) e uma regra de agregacao que nao esta nas 25 canonicas.
- **Impacto:** Comparacoes mensais vs trimestrais podem parecer inconsistentes para o usuario.

### R9. Soft Delete em Passagens (LTV)
A regra de soft delete (`anulado = true`) em `alunos_historico` permite "desfazer" uma passagem sem apagar dados.
- **Impacto:** Se uma passagem for anulada, o tempo de permanencia e LTV da pessoa mudam retroactivamente.

### R10. Health Score
O calculo de health score (0-100) com 5 fatores ponderados e uma regra de negocio implicita que so existe na function `calcular_health_score_aluno`.
- **Impacto:** A classificacao ('saudavel', 'atencao', 'critico') depende de limites configuraveis que podem mudar sem aviso.

---

## Divergencias Criticas

### D1. Total Alunos Ativos: Linha-Level vs Pessoa-Level
- **Severidade:** ALTA
- **Onde:** View 20260531 (`COUNT(*)`) vs Frontend TabGestao (`DISTINCT nome`) vs View V5 (`COUNT(DISTINCT nome)`)
- **Impacto numerico:** Se 10 pessoas tem 2 cursos cada, a view 20260531 conta 20, o frontend conta 10.
- **Acao:** Padronizar para pessoa-level em TODAS as fontes.

### D2. Evasoes: 3 Fontes Diferentes
- **Severidade:** ALTA
- **Onde:** `evasoes_v2` (view retencao) vs `movimentacoes_admin` com dedup (view gestao) vs `movimentacoes_admin` sem dedup (frontend)
- **Impacto numerico:** Divergencia proporcional ao numero de duplicatas no mes.
- **Acao:** Unificar fonte para `movimentacoes_admin` com DISTINCT ON em TODAS as fontes.

### D3. Churn Rate: Formula Diferente no Doc Antigo
- **Severidade:** ALTA
- **Onde:** Codigo atual (`evasoes / pagantes`) vs `KPIs_LA_MUSIC_PERFORMANCE_REPORT.md` (`evasoes / ativos`) vs `METAS_RELACOES_MATEMATICAS.md` (`evasoes / ativos`)
- **Impacto numerico:** Com 500 ativos e 450 pagantes, churn de 2% vira 2,22% (diferenca de 0,22pp).
- **Acao:** Definir formula canonica com Alf e atualizar docs.

### D4. Renovacoes: Tabela Legada vs Movimentacoes
- **Severidade:** MEDIA
- **Onde:** Frontend busca `renovacoes` (tabela) vs View 20260531 busca `movimentacoes_admin` (tabela atual)
- **Impacto numerico:** Se `renovacoes` nao for sincronizada com `movimentacoes_admin`, numeros divergem.
- **Acao:** Migrar frontend para `movimentacoes_admin`.

### D5. Ticket Medio: Nao Calculado na View V5
- **Severidade:** ALTA
- **Onde:** View V5 nao calcula ticket. Frontend usa `dados_mensais.ticket_medio` (desatualizado).
- **Impacto numerico:** Ticket pode estar meses desatualizado se `recalcular_dados_mensais` nao rodar.
- **Acao:** Implementar ticket na view V5 conforme validacao V5 (`MRR / pagantes`).

### D6. Inadimplencia: Cabeca vs Valor
- **Severidade:** MEDIA
- **Onde:** View 20260531 calcula `qtd_inadimplentes / pagantes` (cabeca). Validacao V5 propoe `mrr_inadimplente / mrr` (valor).
- **Impacto numerico:** Sao metricas diferentes. 5% de cabeca pode ser 3% de valor (ou 8%, dependendo dos valores).
- **Acao:** Definir com Alf qual metrica usar.

### D7. Experimentais: Data do Lead vs Data da Aula
- **Severidade:** MEDIA
- **Onde:** Banco filtra por `data_contato` (lead). Regra #17 propoe `data_experimental_realizada`.
- **Impacto numerico:** Aulas agendadas em um mes e realizadas em outro contam no mes errado.
- **Acao:** Usar `data_experimental_realizada` para filtro de mes.

### D8. Views Faltando no Banco
- **Severidade:** ALTA
- **Onde:** `vw_kpis_comercial_historico`, `vw_kpis_professor_mensal`, `vw_kpis_professor_completo`, `vw_kpis_professor_historico`, `get_kpis_professor_periodo`
- **Impacto numerico:** Paginas que dependem dessas views/fallbacks podem mostrar dados inconsistentes ou falhar.
- **Acao:** Criar views/RPCs faltando.

### D9. LTV Nao Calculado na View Nova
- **Severidade:** MEDIA
- **Onde:** View V5 nao retorna `ltv_medio`. Frontend calcula como `ticket * tempo`.
- **Impacto numerico:** LTV pode ser calculado com dados desatualizados.
- **Acao:** Adicionar CTE de LTV na view V5.

### D10. Dashboard: Mistura Tempo Real + Snapshot
- **Severidade:** MEDIA
- **Onde:** `vw_dashboard_unidade` junta `alunos` (tempo real) com `dados_mensais` (snapshot).
- **Impacto numerico:** No mes de transicao, numeros podem parecer inconsistentes.
- **Acao:** Usar view de tempo real tambem para o mes atual no dashboard.

---

## Perguntas para o Alf

### P1. Churn Rate: Qual a formula canonica?
O codigo atual usa `evasoes / alunos_pagantes`. O documento antigo `KPIs_LA_MUSIC_PERFORMANCE_REPORT.md` usa `evasoes / total_alunos_ativos`. Qual e a formula oficial?

### P2. Inadimplencia: Percentual de pessoas ou de receita?
O dashboard atual mostra `% de pessoas inadimplentes`. A validacao V5 propoe `% de receita inadimplente` (MRR inadimplente / MRR total). Qual o Alf prefere?

### P3. Ticket Medio: Por pessoa ou por matricula?
A validacao V5 propoe `MRR / pagantes` (media por pessoa). A view antiga fazia `AVG(valor_parcela)` (media por matricula). Se uma pessoa tem 2 cursos de R$300, a media por pessoa e R$600, por matricula e R$300. Qual e a definicao correta?

### P4. Canto Coral: Sempre excluir?
A regra de excluir `c.nome ILIKE '%canto coral%'` das novas matriculas e permanente? Se sim, deveriamos criar uma flag `is_coral` em vez de depender do nome.

### P5. Bolsista Parcial: Conta como pagante?
A regra #8 diz que bolsista parcial NAO conta como pagante. Mas o frontend (TabGestao) mostra barra "Pagantes / Meta" que inclui bolsistas parciais? Confirmar.

### P6. Status "sem_parcela": Excluir do MRR?
A view 20260531 exclui `status_pagamento = 'sem_parcela'` do MRR. Isso significa que alunos de passaporte (pagamento unico) nao entram no MRR mensal. E intencional?

### P7. Assimetria Experimental: Corrige operacional ou formula?
A taxa de conversao de professor pode exceder 100% porque o numerador aceita matriculas sem experimental. O Alf prefere:
- (a) Corrigir no Emusys (marcar `experimental_realizada=true` para todos os leads matriculados), ou
- (b) Mudar a formula para exigir `experimental_realizada=true` tambem no numerador?

### P8. Recalculo Automatico de Dados Mensais?
Hoje `recalcular_dados_mensais` precisa ser chamada manualmente. O Alf quer que rode automaticamente (cron job) no ultimo dia de cada mes?

### P9. LTV: Qual a formula?
O frontend calcula LTV = ticket * tempo_permanencia. A view antiga calculava `AVG(valor_parcela * meses_desde_matricula)`. Qual e a formula preferida?

### P10. Kids/School: Por idade ou por classificacao?
O frontend classifica por `idade_atual` (<=11 = Kids). O banco (carteira professor) usa `classificacao` (LAMK/EMLA). Qual e a fonte da verdade?

---

## Checklist de Acoes Recomendadas

| Prioridade | Acao | Responsavel | Impacto |
|------------|------|-------------|---------|
| **P0 - CRITICO** | Padronizar `COUNT(DISTINCT nome)` para ativos/pagantes em todas as views | Dev | Corrige divergencia D1 |
| **P0 - CRITICO** | Unificar fonte de evasoes para `movimentacoes_admin` com DISTINCT ON | Dev | Corrige divergencia D2 |
| **P0 - CRITICO** | Criar views/RPCs faltando (professor, comercial historico) | Dev | Corrige divergencia D8 |
| **P1 - ALTO** | Definir formula canonica de churn com Alf | Alf + Dev | Corrige divergencia D3 |
| **P1 - ALTO** | Implementar ticket medio e LTV na view V5 | Dev | Corrige divergencia D5, D9 |
| **P1 - ALTO** | Definir metrica de inadimplencia (cabeca vs valor) | Alf | Corrige divergencia D6 |
| **P2 - MEDIO** | Migrar frontend de `renovacoes` para `movimentacoes_admin` | Dev | Corrige divergencia D4 |
| **P2 - MEDIO** | Usar `data_experimental_realizada` para filtro de mes | Dev | Corrige divergencia D7 |
| **P2 - MEDIO** | Criar flag `is_coral` em vez de filtro por nome | Dev | Elimina regra implicita R5 |
| **P3 - BAIXO** | Documentar regras implicitas (R1-R10) como canonicas | Dev | Previne regressao |
| **P3 - BAIXO** | Implementar cron job para recalcular dados mensais | Dev | Automacao |

---

*Fim do relatorio de auditoria. Gerado em 2026-06-04.*