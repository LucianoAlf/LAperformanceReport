# Auditoria READ-ONLY — Regra de KPIs por Pessoa (não por Linha)
## Campo Grande / Maio 2026

**Gerado em:** 31/05/2026  
**Status:** READ-ONLY — nenhuma migration, nenhum UPDATE, nenhum RPC  
**Objetivo:** Sanitizar a regra de `alunos_ativos` e `alunos_pagantes` antes de alterar `recalcular_dados_mensais`

---

## 1. Resumo Executivo

A função `recalcular_dados_mensais` e a view `vw_kpis_gestao_mensal` calculam KPIs **linha a linha** (row-by-row), usando filtros como `is_segundo_curso = false`. Isso é conceitualmente errado para métricas de **pessoa** (`alunos_ativos`, `alunos_pagantes`), porque um aluno pode ter múltiplas matrículas e a "linha principal" pode estar em qualquer uma delas.

**Exemplo crítico:** Barbara Ribeiro Alves tem Minha Banda Para Sempre + Home Studio. A regra row-by-row com filtro de banda a **apagaria inteira** dos KPIs de pessoa.

**Caso de sujeira (não exemplo de negócio):** Plínio da Silva Bezerra Neto (id 1361) aparecia como "2º curso ativo", mas o Emusys mostra o contrato como **Interrompido** — a linha ficou ativa indevidamente no banco. Removido da análise.

**Exemplo Barbara:** Barbara Ribeiro Alves tem Minha Banda Para Sempre (`is_projeto_banda=true`, `is_segundo_curso=false`) + Home Studio (`is_projeto_banda=false`, `is_segundo_curso=true`). Se aplicarmos `is_projeto_banda=false` em `alunos_ativos` row-by-row, a linha da banda seria removida, mas a linha do Home Studio (`is_segundo_curso=true`) também seria removida. **Barbara sumiria inteira**, apesar de ter curso regular ativo/pagante.

---

## 2. Números Atuais (3 Fontes Divergentes)

| Fonte | Ativos | Pagantes | Matrículas | Banda | 2º Curso | Novas | Evasões |
|-------|--------|----------|------------|-------|----------|-------|---------|
| `dados_mensais` (27/05, stale) | **511** | **481** | 579 | 46 | 68 | 29 | 13 |
| `vw_kpis_gestao_mensal` (snapshot status) | **498** | **474** | — | **41** | **66** | 23 | 13 |
| `recalcular_dados_mensais` (simulado hoje) | **500** | **474** | 567 | 43 | 67 | 23 | 13 |
| **Cálculo por PESSOA** (read-only, this audit) | **498** | **474** (provisório, valor>0) | 563 | 41 | — | — | — |
| **Cálculo reconciliado Emusys** (8 casos validados) | **498** | **479** (provisório) | — | — | — | — | — |
| **Relatório ADM / Alf** | **499** | **475** | **565** | **41** | — | — | — |

### Divergências explicadas:

- **511 → 498:** O `dados_mensais` tem dados de 27/05 (antes do saneamento v4). A view `vw_kpis_gestao_mensal` usa `status IN ('ativo', 'trancado')` sem filtrar `data_saida`, então incluía Arthur (antes do update) e outros. Após nosso update (status='inativo' para Arthur), a view caiu de 499 para **498**.
- **499 → 498 (view):** A diferença exata é **Arthur Souza Del Bosco**. Antes do update: Arthur tinha `status='ativo'` na view. Depois do update: `status='inativo'`, removido. **A view usa `status`, não `data_saida`.** Arthur não aparece no CSV ativo auditado (export_39) — já estava correto lá.
- **500 → 498:** A função `recalcular_dados_mensais` usa `data_saida > fim_mes` (não usa `status`). Ela inclui **Alan (1375)** e **Leamsi (1393)** — ambos `status='inativo'` mas `data_saida` no futuro (ou NULL). A view exclui eles por `status`. Por isso a função dá 500 e a view dá 498.
- **475 → 474 (provisório, valor>0):** A diferença de 1 pagante entre ADM (475) e view/cálculo por pessoa (474) **não é Arthur** — Arthur já não aparecia no CSV ativo.
- **479 (reconciliado Emusys) → 475 (ADM):** Após validar CSV, cálculo reconciliado dá **479** (474 base + 5 com valor=NULL/0 mas pagam 447 no Emusys). ADM (475) está **4 abaixo**. Possíveis explicações: ADM usa critério diferente, ou há mais falsos pagantes na lista completa de NULL/0 (query 10 pendente).
- **565 matrículas:** O relatório ADM provavelmente usa uma contagem diferente de `matriculas_ativas`. Nossa simulação dá 563. A diferença de 2 exige diff nominal — ver seção 6.3.

---

## 3. Query Read-Only — KPIs por Pessoa

```sql
WITH fim_mes AS (
  SELECT (DATE_TRUNC('month', MAKE_DATE(2026, 5, 1)) + INTERVAL '1 month - 1 day')::DATE AS dt
),

linhas AS (
  SELECT 
    a.nome,
    a.id AS linha_id,
    a.is_segundo_curso,
    a.valor_parcela,
    tm.nome AS tipo_matricula,
    tm.conta_como_pagante,
    c.nome AS curso_nome,
    COALESCE(c.is_projeto_banda, false) AS is_projeto_banda
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  LEFT JOIN cursos c ON c.id = a.curso_id
  WHERE a.unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND a.data_matricula <= (SELECT dt FROM fim_mes)
    AND (a.data_saida IS NULL OR a.data_saida > (SELECT dt FROM fim_mes))
    AND a.status IN ('ativo', 'trancado')
    AND a.nome != 'Plínio da Silva Bezerra Neto'
),

pessoa AS (
  SELECT 
    nome,
    bool_or(conta_como_pagante = true) AS tem_pagante,
    bool_or(is_projeto_banda = false OR is_projeto_banda IS NULL) AS tem_curso_regular,
    bool_or(is_projeto_banda = true) AS tem_banda,
    bool_and(is_projeto_banda = true) AS so_banda,
    count(*) AS num_linhas
  FROM linhas
  GROUP BY nome
)

SELECT 
  count(*) AS total_pessoas,
  count(*) AS alunos_ativos,              -- toda pessoa no snapshot é ativa
  count(*) FILTER (WHERE tem_pagante) AS alunos_pagantes,
  (SELECT count(*) FROM linhas) AS matriculas_ativas,
  (SELECT count(*) FROM linhas WHERE is_projeto_banda = true) AS matriculas_banda,
  count(*) FILTER (WHERE so_banda) AS pessoas_so_banda,
  count(*) FILTER (WHERE tem_curso_regular AND tem_banda) AS pessoas_regular_e_banda,
  count(*) FILTER (WHERE num_linhas > 1) AS pessoas_multipla_matricula
FROM pessoa;
```

**Resultado da query acima (sem Plínio — sujeira, `bool_or(conta_como_pagante)`):** 498 pessoas | 498 ativos | **475 pagantes** | 563 matrículas | 41 banda | 2 só-banda | 34 regular+banda | 51 múltiplas

**Resultado da query 1b corrigida (`valor_parcela > 0` provisório):** 498 pessoas | 498 ativos | **474 pagantes** (provisório; requer reconciliação Emusys) | 563 matrículas | 41 banda | 2 só-banda | 34 regular+banda | 51 múltiplas

---

## 4. Casos Críticos onde Row-by-Row Falha

### 4.1 Plínio da Silva Bezerra Neto (id 1361) — SUJEIRA, não caso de negócio

**Antes (estado que gerou a sujeira):**
- **No banco:** linha 1052 `evadido` (correta), linha 1361 `ativo` (incorreta — não foi sincronizada na evasão)
- **Status real (Emusys):** Contrato Canto = **Interrompido**

**Depois (pós-saneamento v4, já aplicado):**
- **No banco:** linha 1361 agora `inativo` (corrigido no saneamento)
- **Ação:** Excluído desta análise. Não é exemplo de "2º curso sem linha principal". É duplicidade de ciclo de vida que ficou ativa indevidamente.

### 4.2 Barbara Ribeiro Alves (ids 49 + 1413)
- **Linha 49:** Minha Banda Para Sempre | Regular | R$0 | `is_segundo_curso=false` | `is_projeto_banda=true`
- **Linha 1413:** Home Studio | Segundo Curso | R$499 | `is_segundo_curso=true` | `is_projeto_banda=false`
- **Problema:** Se aplicarmos `is_projeto_banda=false` em `alunos_ativos`, a linha 49 é removida. A linha 1413 já é removida por `is_segundo_curso=true`. **Barbara sumiria inteira** (2 filtros errados em sequência).
- **Deveria:** Contar 1 vez como ativo/pagante (tem Home Studio regular/pagante).
- **Função atual (sem filtro banda):** ✅ Conta 1x (via linha 49)
- **Função futura (com filtro banda row-by-row):** ❌ Remove (0)
- **Por pessoa:** ✅ Conta (1)

### 4.3 Carlos Eduardo Garcia do Nascimento (ids 1066 + 1067) — Pendência / possível falso pagante
- **Linha 1066:** Contrabaixo | Bolsista Integral | `valor_parcela=NULL` | `is_segundo_curso=false` | `conta_como_pagante=false`
- **Linha 1067:** Canto | Segundo Curso | `valor_parcela=0` | `is_segundo_curso=true` | `conta_como_pagante=true`
- **Emusys:** mensalidade 0,00
- **Status:** NÃO pode ser usado como explicação validada da diferença 474 → 475.
- **Por que:** `valor_parcela=0` no banco e mensalidade 0,00 no Emusys = não paga nada operacionalmente.
- **Flag `conta_como_pagante=true` no tipo_matricula não é suficiente** sem evidência financeira positiva.
- **Pendência:** validar no Emusys se existe outra fonte de mensalidade não refletida em `valor_parcela`.

### 4.4 Anne Krissya Cordeiro da Silva Noé (ids 31 + 1412)
- **Linha 31:** Piano | Bolsista Parcial | R$0 | `is_segundo_curso=false`
- **Linha 1412:** Minha Banda Para Sempre | Bolsista Parcial | R$0 | `is_segundo_curso=true`
- **Problema:** Só tem banda/projeto + curso principal bolsista. Não é pagante.
- **Função atual:** Conta 1x ativo (31), 0x pagante. ✅ Correto.

### 4.5 Bruna Damasceno de Castro — SUJEIRA PENDENTE (segundo curso zerado)

**Contexto (Alf, 31/05/2026):**
- Aluna faz **apenas Guitarra** com o professor **Matheus Sterc** (Mateus Sherque)
- No LA Report, aparecem **2 linhas**:
  - Guitarra | R$367 (curso principal, ativo)
  - Guitarra | **R$0** (segundo curso, ativo) — **ERRO**
- **Emusys:** não aparece (dados errados no Emusys — Alf vai avisar equipe amanhã)
- **Causa:** Aluna tinha nome diferente no sistema. Alf bloqueou o nome correto e ela entrou como segundo curso.
- **Ação pendente:** Apagar linha de segundo curso (R$0). Não deve afetar KPIs após correção.
- **Status:** Aguardando saneamento manual. **NÃO incluída nos cálculos deste relatório.**

---

## 5. Listas Nominais por Categoria

### 5.1 Pessoas com BANDA + CURSO REGULAR (34 pessoas)
Exemplos críticos:
- Barbara Ribeiro Alves (Home Studio R$499)
- Alexandre Ayres Filho (Teclado R$399 + Power Kids R$0)
- Alice Roza Baltar (Canto R$357 + Power Kids R$0)
- André Luis de Souza Rangel (Contrabaixo R$476 + Minha Banda R$0)
- Antonia Scudio Guidi da Rocha (Guitarra R$417 + Power Kids R$0)
- Arthur Felipe de Mattos (Bateria R$392 + Minha Banda R$0)
- ... (ver SQL completo no arquivo .sql)

**Risco:** Se filtrar `is_projeto_banda=false` row-by-row, a linha da banda é removida, mas a pessoa pode continuar via outra linha. Se todas as linhas da pessoa forem banda, ela some.

### 5.2 Pessoas com CURSO REGULAR marcado como SEGUNDO CURSO (sem linha principal óbvia)
Após remover Plínio (sujeira):
- **Nenhum caso encontrado** no snapshot atual de CG/Maio 2026.
- A lógica continua válida para outros meses/unidades: se uma pessoa tiver apenas uma linha ativa e ela for `is_segundo_curso=true`, a regra row-by-row a apaga dos KPIs de pessoa.

### 5.3 Pessoas com SÓ BANDA/PROJETO (2 pessoas)
- Leticia Fernandes Turques (Minha Banda Para Sempre | Bolsista Integral | R$0)
- Pedro Lucas da Silva Brandão (Minha Banda Para Sempre | Bolsista Parcial | R$0)

**Regra:** Não devem contar como `alunos_pagantes`. Podem ou não contar como `alunos_ativos` (definição de negócio). No Emusys, eles aparecem como "ativos" no programa de banda.

### 5.4 Pessoas com SEGUNDO CURSO PAGANTE sem curso principal óbvio
- Nenhum caso encontrado no snapshot atual (Plínio removido — era sujeira).

---

## 6. Reconciliação com Relatório ADM e Emusys

### 6.1 Relatório ADM (números informados)
| Métrica | ADM | Nosso cálculo | Diferença | Explicação |
|---------|-----|---------------|-----------|------------|
| Ativos | 499 | **498** (pessoa/view, sem Plínio) / 500 (função) | -1 | **Arthur** explica diferença view antiga (499) → view atual (498). No CSV ativo auditado, Arthur já não aparece. |
| Pagantes | 475 | **474** (view, operacionalmente correto) / 475 (pessoa, inclui falso) | +1 | ❌ **NÃO bate.** A view (474) está correta. A pessoa (475) inclui **Carlos Eduardo** (1067, `valor_parcela=0`) como falso pagante. ADM pode incluir outro falso ou usar filtro diferente. |
| Matrículas | 565 | **563** (linhas, sem Plínio) | -2 | **Candidatos nominais:** 4 alunos com status não-ativo no snapshot (Plínio, Alan, Leamsi, Alcione). O ADM inclui 2 deles. Diff nominal na seção 6.3. |
| Banda | 41 | 41 (linhas) | 0 | ✅ Exato. |

### 6.2 CSV Emusys
- **499 alunos ativos** — o ADM informa 499; nosso cálculo corrigido dá **498** (sem Plínio). Arthur não aparece no CSV ativo auditado (export_39) — já estava correto lá. A diferença de 1 no ADM exige validação nominal no relatório ADM original.
- **Barbara ativa** com Minha Banda Para Sempre + Home Studio — bate com nosso modelo
- **Arthur ausente do ativo / presente como interrompido** — bate com nosso update (status='inativo', data_saida='2026-01-09')
- **Plínio interrompido no Emusys** — confirma que a linha 1361 ativa no banco é sujeira
- **Carlos Eduardo não pagante** — Emusys mostra mensalidade 0,00. Não é pagante operacional.

### 6.3 Explicações Nominais das Diferenças

#### Ativos: ADM 499 vs Cálculo 498
**Arthur Souza Del Bosco (id 47) explica a diferença pré-saneamento:**
- A view `vw_kpis_gestao_mensal` antiga (antes do update 31/05) incluía Arthur (`status='ativo'`) → 499 ativos
- A view atual (após update, `status='inativo'`) → 498 ativos
- **No CSV ativo auditado (export_39), Arthur já não aparece** — o Emusys já estava correto
- Conclusão: Arthur explica diferença **view antiga → view atual**, mas **não explica CSV ativo vs cálculo 498**. A diferença de 1 no ADM (499) ainda precisa de validação nominal no relatório ADM original.

#### Pagantes: ADM 475 vs View 474 — VALIDADO COM CSV EMUSYS

**Validação Cruzada (CSV `relatorio_exportado_39`):**

| Aluno | LA Report valor | Emusys mensalidade | Status |
|-------|-----------------|-------------------|--------|
| Ana Clara Lima Santos Pinto | NULL | **447,00** | ✅ Pagante real |
| Sofia Elaile da Silva Campos | NULL | **447,00** | ✅ Pagante real |
| Sofia Lauermann Silva | NULL | **447,00** | ✅ Pagante real |
| Sarah Christina Mendes Silva | 0/NULL | **447,00** | ✅ Pagante real |
| Valkiria Carvalho Baeta | NULL | **447,00** | ✅ Pagante real |
| Carlos Eduardo Garcia do Nascimento | 0 | **0,00** | ❌ Não pagante (falso confirmado) |
| Miguel Gomes Biancamano | 0 | **0,00** | ❌ Não pagante (falso confirmado) |
| Matheus Reis da Silva Gaspar | 0 | **0,00** | ❌ Não pagante (falso confirmado) |

**Resultado:**
- **5 pagantes reais** têm `valor_parcela=NULL/0` no LA Report mas pagam 447 no Emusys
- **3 falsos pagantes** têm `valor_parcela=0` no LA Report E 0,00 no Emusys
- A regra `valor_parcela > 0` sozinha **perderia 5 pagantes reais**

**Cálculo corrigido provisório:**
- Base `valor_parcela > 0` (query 1b): **474**
- + 5 pagantes reais com valor=NULL/0 no banco: **+5**
- = **479 pagantes** (provisório, sujeito a lista COMPLETA da query 10)

**Divergência ADM (475) vs Cálculo (479 provisório):**
- ADM (475) está **4 abaixo** do cálculo reconciliado (479)
- Possíveis explicações:
  1. ADM usa critério diferente (ex: só conta `conta_como_pagante=true` sem reconciliar Emusys)
  2. ADM exclui algum dos 5 acima por outro motivo
  3. Há outros alunos com valor=NULL/0 no banco que NÃO pagam no Emusys (além dos 3 falsos já identificados)

**Próximo passo:** Rodar query 10 (seção 10 do SQL) para obter lista COMPLETA de `valor_parcela IS NULL OR valor_parcela=0`, depois cruzar todos com o CSV Emusys.

#### Matrículas: ADM 565 vs Cálculo 563
**4 candidatos no snapshot de maio com status não-ativo** (a função `recalcular_dados_mensais` os inclui, a view/pessoa não):
| ID | Nome | Status | Valor Parcela | Movimentação |
|----|------|--------|---------------|--------------|
| 1361 | Plínio da Silva Bezerra Neto | inativo | R$345 | evasão 02/05 (sujeira) |
| 1375 | Alan Samico do Nascimento | inativo | NULL | — |
| 1393 | Leamsi Guedes de Sant'anna | inativo | NULL | — |
| 1531 | Alcione Vieira Bastos de Mello | inativo | R$320 | evasão 15/04 |

Nosso cálculo (563) = função (567) - 4 acima.
O ADM (565) = nosso cálculo (563) + **2 desses 4**.
**Diff nominal pendente:** sem acesso ao relatório ADM original, não é possível confirmar quais 2. Os mais prováveis:
- **Plínio (1361)** — linha ficou ativa indevidamente no banco (pós-saneamento já corrigido para `inativo`)
- **Alcione (1531)** — tem valor_parcela > 0 (R$320), evasão em abril

**Nota:** "Cache" não é explicação aceitável. Precisa de ledger nominal no ADM.

---

## 7. Proposta de Regra Final (Pseudocódigo)

### 7.1 Princípios
1. `alunos_ativos` e `alunos_pagantes` são métricas de **PESSOA**, não de linha.
2. `matriculas_ativas`, `matriculas_banda`, `matriculas_2_curso` são métricas de **LINHA**.
3. Um aluno é **ativo** se tiver pelo menos 1 matrícula no snapshot (data_matricula + data_saida + status).
4. Um aluno é **pagante** se houver **evidência financeira positiva** (valor_parcela > 0 no LA Report reconciliado, ou mensalidade positiva no Emusys/CSV). `conta_como_pagante=true` sozinho não basta — validar contra fonte financeira.
5. Projeto/banda gratuito sozinho NÃO transforma aluno em pagante.
6. Segundo curso NÃO duplica pessoa, mas também NÃO apaga pessoa se for a única linha ativa.

### 7.2 Pseudocódigo SQL (não executar — apenas para validação conceitual)

```sql
-- 1. Definir snapshot de maio por LINHA
WITH snapshot_linhas AS (
  SELECT a.*, tm.conta_como_pagante, c.is_projeto_banda
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  LEFT JOIN cursos c ON c.id = a.curso_id
  WHERE a.unidade_id = p_unidade_id
    AND a.data_matricula <= v_fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes)
    AND a.status IN ('ativo', 'trancado')   -- ← ADICIONAR status aqui!
    AND a.nome != 'Plínio da Silva Bezerra Neto'  -- ← EXCLUIR sujeira
),

-- 2. Agregar por PESSOA (usar nome ou futuro pessoa_id)
aluno_pessoa AS (
  SELECT 
    nome,
    bool_or(conta_como_pagante = true AND valor_parcela > 0) AS eh_pagante_provisorio,
    -- NOTA: valor_parcela > 0 é insuficiente sozinho. Requer reconciliação com Emusys/CSV.
    -- Alunos com valor_parcela=NULL/0 no banco e mensalidade positiva no Emusys também são pagantes.
    count(*) AS num_matriculas
  FROM snapshot_linhas
  GROUP BY nome
)

-- 3. KPIs
SELECT 
  count(*) AS alunos_ativos,           -- toda pessoa no snapshot
  count(*) FILTER (WHERE eh_pagante_provisorio) AS alunos_pagantes_provisorio,
  (SELECT count(*) FROM snapshot_linhas) AS matriculas_ativas,
  (SELECT count(*) FROM snapshot_linhas WHERE is_projeto_banda = true) AS matriculas_banda,
  (SELECT count(*) FROM snapshot_linhas WHERE is_segundo_curso = true) AS matriculas_2_curso
FROM aluno_pessoa;
```

### 7.3 Diferenças da função atual
| Aspecto | Função Atual | Proposta |
|---------|-------------|----------|
| `alunos_ativos` | `COUNT(*)` linha + `is_segundo_curso=false` | `COUNT(DISTINCT nome)` no snapshot |
| `alunos_pagantes` | `COUNT(*)` linha + `is_segundo_curso=false` + pagante | `COUNT(DISTINCT nome)` no snapshot onde `bool_or(evidência financeira positiva)` |
| `status` | NÃO filtra status (só data_matricula/data_saida) | ADICIONA `status IN ('ativo', 'trancado')` |
| Banda em ativos | Não filtra | Não filtra (por pessoa) |
| Banda em pagantes | Não filtra | Não filtra (por pessoa) |

### 7.4 Impacto estimado (Campo Grande / Maio 2026)
| Métrica | Função Atual (simulada) | Proposta (por pessoa) | Δ |
|---------|------------------------|----------------------|---|
| alunos_ativos | 500 | **498** | -2 (remove Plínio sujeira + duplicatas) |
| alunos_pagantes | 474 | **474** (provisório, valor_parcela>0) / **479** (reconciliado Emusys, 8 casos) | +5 (5 pagantes reais com valor=NULL/0 no banco) |
| matriculas_ativas | 567 | **563** | -4 (remove Plínio sujeira) |
| matriculas_banda | 43 | **41** | -2 (não muda, é linha) |

**Nota:** A proposta por pessoa com `valor_parcela > 0` dá **474 pagantes** (provisório). Após validação CSV (`relatorio_exportado_39`), identificamos:
- **5 pagantes reais** com `valor_parcela=NULL/0` no LA Report mas mensalidade 447 no Emusys (Ana Clara, Sofia Elaile, Sofia Lauermann, Sarah, Valkiria)
- **3 falsos pagantes** com `valor_parcela=0` no LA Report E 0,00 no Emusys (Carlos Eduardo, Miguel, Matheus Reis)
- Cálculo reconciliado provisório: **479** pagantes (474 + 5)
- ADM (475) está **4 abaixo** do reconciliado. Query 10 (SQL) lista todos com `valor_parcela IS NULL OR 0` para validação completa.

---

## 8. Bloqueios e Escopo NÃO Aprovado

- ❌ NÃO alterar `recalcular_dados_mensais`
- ❌ NÃO executar RPC
- ❌ NÃO fazer backfill
- ❌ NÃO rodar em Barra/Recreio
- ❌ NÃO inserir/alterar `movimentacoes_admin`
- ❌ NÃO aplicar filtro cego `COALESCE(c.is_projeto_banda, false)=false` em `alunos_ativos`/`alunos_pagantes`
- ❌ NÃO usar `curso_id IS NOT NULL` como filtro global
- ✅ Apenas auditoria READ-VALIDE

---

## 9. Próximos Passos (após aprovação Alf)

1. Alf validar se **498 ativos** (por pessoa, sem Plínio) bate com expectativa operacional
2. Decidir se "só banda" conta como ativo (Leticia, Pedro Lucas)
3. ✅ **Reconciliar pagantes (parcial):** 8 casos validados no CSV Emusys — 5 pagantes reais (Ana Clara, Sofia Elaile, Sofia Lauermann, Sarah, Valkiria) + 3 falsos (Carlos Eduardo, Miguel, Matheus Reis). Cálculo provisório: **479**
4. **Reconciliar pagantes (completo):** Rodar query 10 no banco para listar TODOS com `valor_parcela IS NULL OR 0`, depois cruzar cada um com CSV Emusys
5. Validar no ADM original quais 2 dos 4 candidatos explicam matrículas 565 vs 563 (diff nominal, não cache)
6. Aprovar regra por pessoa vs row-by-row
7. Só então gerar migration para `recalcular_dados_mensais` + views
8. Executar `recalcular_dados_mensais(2026, 5, CG)` após migration
9. Validar `dados_mensais` vs view vs frontend
10. Backfill Jan-Abr (se aprovado)
11. Barra/Recreio (se aprovado)
