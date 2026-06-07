# Diff Documental Final — Correções Canônico + SKILL (2026-06-05)

> Status: Documentação corrigida. Aguardando aprovação final do Alf.
> Nenhuma migration executada. Nenhum banco alterado.

---

## 1. CANÔNICO (`regras-negocio-canonicas.md`)

### 1.1 Duplicidade de Bolsista Parcial — CORRIGIDO

**Antes:**
```markdown
- ✅ **Bolsista Parcial:** NÃO conta como pagante e NÃO entra no ticket médio — confirmado pelo Alf (P5).
- 📋 Cards: Bolsistas Integrais e Bolsistas Parciais são separados no dashboard.
- ✅ **Bolsista Parcial:** NÃO conta como pagante e NÃO entra no ticket médio — confirmado pelo Alf (P5).  ← DUPLICADO
```

**Depois:**
```markdown
- ✅ **Bolsista Parcial:** NÃO conta como pagante e NÃO entra no ticket médio — confirmado pelo Alf (P5).
- 📋 Cards: Bolsistas Integrais e Bolsistas Parciais são separados no dashboard.
```

---

### 1.2 Separação de Seções 6 e 7 — REORGANIZADO

**Antes:** Seção única "6. PENDÊNCIAS REGISTRADAS" misturava ✅ validados com ❓ pendentes.

**Depois:**
- **Seção 6. DECISÕES VALIDADAS PELO ALF** — P1, P2, P3, P4, P5, P6, P7, P9, P10
- **Seção 7. PENDÊNCIAS ABERTAS / BLOQUEADORES** — P8/P11, Taxa Renovação, Taxa Conversão Geral

---

### 1.3 Canto Coral — RECLASSIFICADO

**Antes:**
```markdown
- 📋 No banco: `c.nome ILIKE '%banda%'` OU `c.nome ILIKE '%power kids%'` OU `c.is_projeto_banda = true` — regra frágil baseada em nome.
```

**Depois:**
```markdown
- 🚫 **Legado temporário:** `c.nome ILIKE '%banda%'` OU `c.nome ILIKE '%power kids%'` — filtros por nome são frágeis e devem ser substituídos por `c.is_projeto_banda = true`.
```

**Tabela de Regras Implícitas (R5):**
```markdown
| R5 | Canto coral excluído | ✅ | Canônica: usar `cursos.is_coral = true`. 🚫 Legado: filtros por nome são frágeis e devem ser substituídos. |
```

---

### 1.4 Conversão por Professor — RECLASSIFICADO

**Antes:**
```markdown
- 📋 `taxa_conversao = matriculas_pos_exp / experimentais * 100`
- 📋 **Assimetria conhecida:** numerador aceita `experimental_realizada=true` OU `(converteu=true AND faltou_experimental IS NOT TRUE)`.
- 📋 **Pode exceder 100%** (ex: Willian T1 2026 = 200%). O `ModalDetalhesConversao` destaca casos ambíguos.
```

**Depois:**
```markdown
- ✅ **Canônica (Alf 2026-06-04):** `taxa_conversao_professor = matriculas_pos_experimental / experimentais_realizadas * 100` (P7).
- ✅ **Apenas matrículas originadas de experimental realizada por aquele professor entram no numerador.**
- 🚫 **Legado/bug:** Qualquer cálculo que permita matrícula sem experimental entrar no numerador pode gerar taxa >100% (ex: Willian T1 2026 = 200%) e deve ser corrigido.
```

**Tabela de Regras Implícitas (R7):**
```markdown
| R7 | Assimetria experimental/matricula | 🚫 | Taxa >100% é bug. Canônica: somente matrículas com experimental realizada pelo professor entram no numerador (P7). |
```

---

### 1.5 P8/P11 — ATUALIZADO

**Antes:**
```markdown
| ❓ P8 | **Cron/Snapshot:** ... Precisa investigar se é view ou tabela, e resolver para preservar histórico. |
| ❓ P11 | **Snapshot `dados_mensais`:** Investigar se é view ou tabela, e como preservar histórico mensal sem sobrescrita. |
```

**Depois:**
```markdown
| ❓ P8/P11 | **Snapshot `dados_mensais`:** Decisão de negócio: histórico mensal deve ser preservado; recalcular mês passado não pode sobrescrever sem audit trail. Próximo passo: SELECT-only para confirmar estrutura, depois migration de congelamento + audit trail. |
```

**Seção "Decisões do Alf sobre P8/P11" mantida** com direção aprovada (congelamento + audit trail) e link para arquivos de verificação/proposta.

---

### 1.6 Caractere Quebrado — CORRIGIDO

- **Antes:** ` **Validação V5:**` (caractere de substituição Unicode U+FFFD)
- **Depois:** `🚫 **Validação V5:**`
- Total de 3 ocorrências corrigidas no documento.

---

## 2. SKILL (`regras-negocio-la/SKILL.md`)

### 2.1 Canto Coral — RECLASSIFICADO

**Antes:**
```markdown
- 📋 `cursos.nome` contendo "canto coral"
```

**Depois:**
```markdown
- 🚫 `cursos.nome` contendo "canto coral" — legado temporário; canônica é `cursos.is_coral = true` (P4)
```

---

### 2.2 P8/P11 Alerta — ATUALIZADO

**Antes:**
```markdown
- ❓ **P8/P11 — Snapshot `dados_mensais`:** Alf confirmou que o snapshot sobrescreve dados mensais anteriores (ex: abril foi perdido). Investigar se é view ou tabela...
```

**Depois:**
```markdown
- ❓ **P8/P11 — Snapshot `dados_mensais`:** Decisão de negócio: histórico mensal deve ser preservado; recalcular mês passado não pode sobrescrever sem audit trail. Próximo passo: SELECT-only para confirmar estrutura, depois migration de congelamento + audit trail. NÃO executar migration sem aprovação do Alf.
```

---

### 2.3 Fórmulas Validadas — ORGANIZADAS

**Antes:** Churn, Inadimplência e Ticket Médio apareciam tanto em ✅ VALIDADAS quanto em ❓ PENDENTES.

**Depois:**
- ✅ VALIDADAS: 12 itens (inclui P1, P2, P3, P6, P7)
- 📋 INFERIDAS: 2 itens (Taxa Renovação, MRR)
- ❓ PENDENTES: 1 item (Taxa Conversão Geral) — zero itens validados na seção errada

---

## 3. ARQUIVOS DE REFERÊNCIA (incluídos na entrega)

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `verificacao-p8-p11-select-only.md` | SELECT-only | 10 SELECTs para confirmar estrutura real do banco |
| `proposta-migration-p8-p11.md` | Proposta | Migration completa (congelamento + audit trail) — **NÃO executar** |
| `analise-p8-p11-snapshot-dados-mensais.md` | Análise | Investigação técnica: tabela com UPSERT, cron desativado, 4 opções de solução |
| `diff-documental-final-2026-06-05.md` | Diff | Este documento — resumo de todas as mudanças |

---

## 4. CHECKLIST DE APROVAÇÃO

| # | Item | Status |
|---|------|--------|
| 1 | Bolsista Parcial não duplicado | ✅ |
| 2 | Seções 6 e 7 separadas (validados vs pendentes) | ✅ |
| 3 | Canto Coral marcado como legado temporário | ✅ |
| 4 | Conversão Professor: taxa >100% = bug, não aceitável | ✅ |
| 5 | P8/P11 com decisão de negócio clara | ✅ |
| 6 | Zero caracteres quebrados (U+FFFD) | ✅ |
| 7 | Zero itens validados na seção "Pendentes" do SKILL | ✅ |
| 8 | SELECTs de verificação prontos para execução | ✅ |
| 9 | Proposta de migration documentada (sem execução) | ✅ |
| 10 | Nenhum banco alterado, nenhuma migration executada | ✅ |
