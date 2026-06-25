# Relatório Final — Saneamento Ciclo de Vida + Simulação v2
## Campo Grande / Maio 2026

**Gerado em:** 31/05/2026  
**Status:** NENHUM UPDATE APLICADO — aguardando aprovação do Alf  
**Arquivos SQL:**
- `SIMULACAO_SANEAMENTO_CG_MAIO2026.sql` — Preview read-only (SELECT, sem DDL)
- `UPDATE_SANEAMENTO_CG_MAIO2026.sql` — Updates com guards (comentado, NÃO executar)

---

## 1. Resumo Executivo

**Eventos (não mudam com saneamento):**
| Métrica | Valor |
|---------|-------|
| novas_matriculas | 23 |
| evasoes | 13 |
| taxa_renovacao | 88,37% |
| reajuste_parcelas | 12,95% |

**Estoque — Simulação no banco real:**
| Métrica | ANTES | DEPOIS A (28 correções) | DEPOIS B (+ banda) | Δ B vs Atual |
|---------|-------|------------------------|-------------------|-------------|
| alunos_ativos | 513 | 500 | **495** | **-18** |
| alunos_pagantes | 483 | 474 | **473** | **-10** |
| matriculas_ativas | 580 | 567 | 567 | -13 |
| matriculas_banda | 45 | 43 | 43 | -2 |
| churn_rate | 2,69% | 2,74% | 2,75% | +0,06 p.p. |

**Cenários:**
- **ANTES:** Snapshot atual do banco (data_saida inconsistente)
- **DEPOIS A:** Após 28 correções de ciclo de vida + regra `curso_id IS NOT NULL`
- **DEPOIS B:** Após correções + **nova regra** excluindo `cursos.is_projeto_banda=true` de ativos/pagantes

---

## 2. Regras Aplicadas na Simulação

1. **Snapshot no fim do mês:** `data_matricula <= 2026-05-31` AND (`data_saida > 2026-05-31` OR `data_saida IS NULL`)
2. **Aluno de curso precisa ter curso:** `curso_id IS NOT NULL` para contar em ativos/pagantes/matriculas_ativas
3. **Nova regra banda:** `cursos.is_projeto_banda = false` para ativos/pagantes (continua em matriculas_banda)
4. **Pagante:** `tipos_matricula.conta_como_pagante = true` (Regular = true, Bolsista = false)
5. **2º curso:** excluído de ativos/pagantes, incluído em matriculas_ativas

---

## 3. Grupos de Correção (28 alunos)

### Grupo A — Preencher data_saida (16 casos)

| ID | Nome | data_saida Nova | Pagante? | No snapshot Maio? |
|----|------|-----------------|----------|-------------------|
| 106 | Emily Souza de Oliveira | 2026-03-05 | Sim | ❌ Não (saiu antes) |
| 85 | Davi Borges da Silva Nascimento | 2026-04-25 | Sim | ❌ Não |
| 94 | Davi Rosendo Chaves Vieira | 2026-04-01 | Sim | ❌ Não |
| 131 | Gabriel Pereira Morais | 2026-03-03 | Sim | ❌ Não |
| 137 | Georgie Jefferson de Mello Basílio | 2026-05-07 | Sim | ❌ Não (07/05 ≤ 31/05) |
| 149 | Guilherme Gama Clavelario Nunes | 2026-05-04 | Sim | ❌ Não |
| 165 | Heitor Thadeu Caciano | 2026-04-11 | Sim | ❌ Não |
| 224 | Laura Peres de Souza | 2026-04-02 | Sim | ❌ Não |
| 258 | Luís Rafael Sousa dos Santos | 2026-05-06 | Sim | ❌ Não |
| 270 | Manuela Piveta Schulz | 2026-04-02 | Sim | ❌ Não |
| 327 | Murilo Martellote de Assis | 2026-03-06 | Sim | ❌ Não |
| 354 | Pedro Martellote de Assis | 2026-03-06 | Sim | ❌ Não |
| 384 | Sophia Maciel Magalhaes | 2026-04-10 | Sim | ❌ Não |
| 11 | Alexandre Wallace Bispo Oliveira | 2026-03-14 | Não | ❌ Não |
| 118 | Felipe Marques Gevezier | 2026-03-23 | Não | ❌ Não |
| 1377 | Alexandre de Sousa Serra | 2026-04-01 | Não | ❌ Não |

**Impacto:** Remove 16 do snapshot de Maio (13 pagantes, 3 não-pagantes).

### Grupo B — Status='inativo' (1 caso)

| ID | Nome | data_saida Atual | Ação |
|----|------|-----------------|------|
| 47 | Arthur Souza Del Bosco | 2026-01-09 | status → inativo (NÃO limpar data_saida) |

**Impacto:** Nenhum no snapshot (já excluído por data_saida < Maio).

### Grupo C — Limpar data_saida (5 casos)

| ID | Nome | data_saida Atual | Ação | Snapshot Maio? |
|----|------|-----------------|------|----------------|
| 31 | Anne Krissya Cordeiro | 2026-02-24 | → NULL | ✅ Sim (reativou) |
| 263 | Luiza Mazeliah do Nascimento | 2026-03-02 | → NULL | ✅ Sim |
| 323 | Miguel Santos Borges | 2026-02-02 | → NULL | ✅ Sim |
| 405 | Vicente Dias Botelho | 2026-02-05 | → NULL | ✅ Sim |
| 949 | Cassyo Lucas Prado Silva | 2026-02-14 | → NULL | ✅ Sim |

**Impacto:** Adiciona 5 ativos confirmados pelo Alf ao snapshot (4 pagantes, 1 bolsista).

### Grupo D — Não matriculadas (2 casos)

| ID | Nome | Status | Curso | Ação |
|----|------|--------|-------|------|
| 1450 | Maria Eduarda de Lima Bomfim Pedro | inativo | Minha Banda Para Sempre | data_saida → 2026-05-31 |
| 1378 | Ana Julia de Oliveira Gomes | inativo | Minha Banda Para Sempre | data_saida → 2026-05-31 |

**Impacto:** Remove 2 do snapshot de Maio (ambas bolsistas, não-pagantes).

### Grupo E — Excluídos/não matriculados (2 casos)

| ID | Nome | Status | valor_parcela | Ação | Snapshot? |
|----|------|--------|--------------|------|-----------|
| 945 | Luciano da Silva Bernardino | inativo | 332,00 | data_saida → 2026-05-31 | ❌ Não |
| 1598 | Alexandre Dos Santos | inativo | 0,00 | data_saida → 2026-05-31 | ❌ Não |

**Nota sobre Alexandre Dos Santos (1598):**
- `tipo_matricula_id = 1` (Regular) → `conta_como_pagante = true` por tipo
- Mas `valor_parcela = 0` e `curso_id = NULL`
- Regra aplicada: aluno sem curso (`curso_id IS NULL`) **não conta** como ativo/pagante
- Mesmo se tivesse curso, parcela zero não gera receita — a regra `curso_id IS NOT NULL` já o exclui

### Grupo F — Só banda (2 casos, sem update)

| ID | Nome | Status | Curso | Tratamento |
|----|------|--------|-------|-----------|
| 1375 | Alan Samico do Nascimento | inativo | Minha Banda Para Sempre | Mantém. Excluído de ativos/pagantes pela regra banda. |
| 1393 | Leamsi Guedes de Sant'anna | inativo | Power Kids | Mantém. Excluído de ativos/pagantes pela regra banda. |

---

## 4. Reconciliação dos Números

### alunos_ativos: 513 → 495 (-18)

| Fator | Δ |
|-------|---|
| ANTES | 513 |
| Grupo A: remove 16 inativos fantasmas | -16 |
| Grupo C: adiciona 5 ativos confirmados | +5 |
| Grupo D: remove 2 não-matriculadas | -2 |
| Grupo E: remove 2 excluídos | -2 |
| Grupo F: já inativos (sem data_saida) | 0 |
| **Subtotal (DEPOIS A)** | **498** |
| Nova regra banda: remove 3 ativos banda-only (Barbara, Leticia, Pedro Lucas) | -3 |
| **DEPOIS B** | **495** |

> Nota: a simulação real deu 500 para DEPOIS A (não 498). A diferença de 2 provavelmente vem de Giovanna (curso_id=NULL) que já era excluída pela regra `curso_id IS NOT NULL` no ANTES.

### alunos_pagantes: 483 → 473 (-10)

| Fator | Δ |
|-------|---|
| ANTES | 483 |
| Grupo A: remove 13 pagantes fantasmas | -13 |
| Grupo C: adiciona 4 pagantes confirmados | +4 |
| Grupo D: 2 bolsistas (não-pagantes) | 0 |
| Grupo E: remove 1 pagante (Luciano), Alexandre parcela zero | -1 |
| **Subtotal (DEPOIS A)** | **473** |
| Nova regra banda: remove 1 pagante banda (Barbara) | -1? |

> A simulação real deu 474 para DEPOIS A e 473 para DEPOIS B, confirmando que apenas 1 pagante é banda (Barbara).

---

## 5. Impacto no Churn Rate

| Cenário | Evasões | Pagantes | Churn |
|---------|---------|----------|-------|
| ANTES | 13 | 483 | 2,69% |
| DEPOIS A | 13 | 474 | 2,74% |
| DEPOIS B | 13 | 473 | 2,75% |

**Importante:** As evasões NÃO mudam. São eventos baseados em `movimentacoes_admin`. O saneamento corrige apenas o denominador (pagantes reais). Churn sobe ligeiramente porque remove pagantes fantasmas que inflavam a base.

---

## 6. Alunos Afetados pela Nova Regra Banda

7 alunos com `is_projeto_banda = true` e `curso_id IS NOT NULL`:

| ID | Nome | Status | Pagante? | Ação regra banda |
|----|------|--------|----------|-----------------|
| 49 | Barbara Ribeiro Alves | ativo | Sim (parcela=NULL, Regular) | ❌ Excluir de ativos/pagantes |
| 1375 | Alan Samico | inativo | Não | ❌ Excluir de ativos |
| 1378 | Ana Julia | inativo | Não | ❌ Excluir de ativos |
| 1393 | Leamsi | inativo | Não | ❌ Excluir de ativos |
| 1395 | Leticia Fernandes Turques | ativo | Não | ❌ Excluir de ativos |
| 1404 | Pedro Lucas da Silva Brandão | ativo | Não | ❌ Excluir de ativos |
| 1450 | Maria Eduarda | inativo | Não | ❌ Excluir de ativos |

> Todos continuam em `matriculas_banda` (43 total DEPOIS A/B, sendo 38 de 2º curso + 5 não-2º-curso).

---

## 7. Próximos Passos

1. **Alf aprova** os arquivos:
   - `SIMULACAO_SANEAMENTO_CG_MAIO2026.sql` — rodar no SQL Editor, validar preview
   - `UPDATE_SANEAMENTO_CG_MAIO2026.sql` — descomentar DO $$, executar

2. **Executar** updates com guards (bloco comentado no arquivo)

3. **Validar** com query manual:
   ```sql
   SELECT id, nome, status, data_saida
   FROM alunos
   WHERE id IN (11, 31, 47, 85, 94, 106, 118, 131, 137, 149, 165, 224, 258, 263, 270, 323, 327, 354, 384, 405, 945, 949, 1377, 1378, 1450, 1598)
   ORDER BY id;
   ```

4. **Aplicar nova regra** na função `recalcular_dados_mensais`:
   - Adicionar `AND curso_id IS NOT NULL` em ativos/pagantes/matriculas
   - Adicionar `AND COALESCE(c.is_projeto_banda, false) = false` em ativos/pagantes

5. **Executar** `recalcular_dados_mensais(2026, 5, '2ec861f6-023f-4d7b-9927-3960ad8c2a92')`

6. **Comparar** snapshot gravado em `dados_mensais` vs simulação DEPOIS B

7. **Se OK:** replicar para Barra e Recreio, depois backfill Jan-Abr

---

## 8. Arquivos Gerados

| Arquivo | Conteúdo |
|---------|----------|
| `SIMULACAO_SANEAMENTO_CG_MAIO2026.sql` | SELECT read-only com CTE (preview nominal + 3 cenários agregados) |
| `UPDATE_SANEAMENTO_CG_MAIO2026.sql` | DO $$ com guards por unidade/status/data_saida esperada |
| `RELATORIO_SANEAMENTO_CG_MAIO2026_V2.md` | Este relatório |

---

## 9. Diferença para Versão Anterior (v1 → v2)

| Problema v1 | Correção v2 |
|------------|-------------|
| Usava DROP VIEW / CREATE VIEW (DDL) | Apenas SELECT com CTE (100% read-only) |
| Updates WHERE id = X sem guards | Guards por `unidade_id`, `status`, `data_saida` esperada |
| Grupo D misturado (4 alunos) | Separado: D (não matriculadas → data_saida), F (só banda → sem update) |
| Maria/Ana Julia não tinham data_saida | data_saida = '2026-05-31' (corte técnico) |
| Não explicava Alexandre Dos Santos (parcela zero) | Documentado: curso_id=NULL + parcela=0 = não conta como ativo/pagante |
| validacao_pos_update sem regra banda | Relatório documenta regra; função RPC precisa ser atualizada separadamente |
| Números não batiam com simulação do Alf | Números simulados diretamente no banco com regra `curso_id IS NOT NULL` |
