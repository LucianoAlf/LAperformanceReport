# Entregável: Bug Ticket Médio + Segundo Curso Bolsista

## Data: 2026-06-06
## Status: Patches validados, NÃO EXECUTADOS
## Aprovado por: Alfredo (4 travas)

---

## 1. Resumo Executivo

Dois bugs foram identificados e corrigidos em código:

1. **Bug ATIVO (view):** Ticket médio calculado por linha (matrícula) em vez de por pessoa. Impacto: **R$ 22,06 a mais** no ticket médio (5,6% deflacionado).
2. **Bug PREVENTIVO (frontend):** Criação de segundo curso força `tipo_matricula_id = 2`, transformando bolsista em pagante. Dados atuais já corrigidos, mas próximo bolsista com segundo curso será afetado.

**MRR está correto** — segundo curso entra no faturamento. O erro é só no denominador do ticket médio.

---

## 2. Evidências do Banco (2026-06-06)

### Validação do SELECT puro (compila sem erros)

| Métrica | Atual (por linha) | Nova (por pessoa) | Diferença |
|---------|------------------|-------------------|-----------|
| Ticket médio | **R$ 393,75** | **R$ 415,81** | **+ R$ 22,06** (+5,6%) |
| MRR | R$ 400.837,97 | R$ 400.837,97 | **R$ 0** (exatamente igual) |

### Dados por unidade (SELECT puro validado)

| Unidade | Ticket Atual | Ticket Corrigido | MRR |
|---------|-------------|------------------|-----|
| Recreio | - | R$ 434,29 | R$ 130.952,69 |
| Campo Grande | - | R$ 387,73 | R$ 171.928,23 |
| Barra | - | R$ 447,59 | R$ 100.707,15 |

### Casos Rayane/Kailane

**Rayane Bianca:** já corrigida no banco. Violão ativo com `tipo_aluno = 'bolsista_parcial'`, `tipo_matricula_id = 4`.

**Kailane:** já corrigida no banco.

**Zero registros** hoje com inconsistência bolsista/segundo curso ativo.

---

## 3. Patches Preparados e Validados

### 3.1 View `vw_kpis_gestao_mensal` — Ticket por Pessoa

**Arquivo:** `.claude/memory/patch-view-ticket-medio-por-pessoa.sql`

**Mudança principal:**
- Substitui CTE `financeiro_legado` (calculava por linha) por `alunos_ticket` + `ticket_por_unidade` (calculam por pessoa)
- Chave de pessoa: `LOWER(TRIM(nome)) + unidade_id` (conforme regra Alf)
- Exclui bolsistas integral/parcial, banda, coral, parcela zero
- MRR permanece inalterado (soma de todas as parcelas pagantes)

**Correção aplicada:** Adicionado `status_pagamento` ao `snapshot_base` (bloqueador técnico encontrado e corrigido)

**Validação:** SELECT puro executado com sucesso no banco. Ticket médio subiu de R$ 393,75 para R$ 415,81. MRR permaneceu R$ 400.837,97.

### 3.2 Frontend `ModalFichaAluno.tsx` — Preservar Bolsista

**Arquivo:** `src/components/App/Alunos/ModalFichaAluno.tsx` (linha 590)

**Mudança:**
```typescript
// Preservar tipo_matricula_id se for bolsista (3=Integral, 4=Parcial)
// Só força 2 (Segundo Curso) se for pagante regular (1)
const tipoMatriculaId = cursoSelecionadoEhBanda
  ? 5  // Banda
  : ([3, 4].includes(formData.tipo_matricula_id)
      ? formData.tipo_matricula_id  // Preserva bolsista integral/parcial
      : 2);  // Segundo Curso (só para pagante regular)
```

**Status:** Patch aplicado no repo local (confirmado na leitura do arquivo).

### 3.3 Trigger `trg_alunos_calcular_campos`

**Verificação:** Trigger existe sim! Função `calcular_campos_aluno()` faz auto-detecção:

```sql
IF TG_OP = 'INSERT' AND COALESCE(NEW.tipo_matricula_id, 1) IN (1, 2) THEN
  -- Só atua se Regular (1) ou Segundo Curso (2)
```

**Impacto:** Se o frontend enviar `tipo_matricula_id = 3` ou `4` (bolsista), a trigger **não entra** no IF. A correção do frontend é suficiente para evitar a sobrescrita da trigger.

**Mas:** Se alguém criar segundo curso direto no banco (sem frontend) ou a trigger for alterada no futuro, o risco persiste. Recomendação: manter monitoramento.

---

## 4. Travas de Execução (Alfredo)

### Trava 1: SELECT antes de qualquer UPDATE
```sql
-- Obrigatório rodar antes de qualquer UPDATE nominal:
SELECT id, nome, curso_id, tipo_aluno, tipo_matricula_id, is_segundo_curso, status
FROM alunos
WHERE nome ILIKE '%Rayane Bianca%'
   OR nome ILIKE '%Kailane%'
ORDER BY nome, curso_id;
```

### Trava 2: Validar view em ambiente de teste
- SELECT puro já validado no banco real (compila e retorna resultados)
- Ticket médio sobe de R$ 393,75 para R$ 415,81 (+R$ 22,06)
- MRR permanece igual (R$ 400.837,97)

### Trava 3: Nunca excluir segundo curso do MRR
- Regra correta: MRR = soma de TODAS as parcelas pagantes
- Segundo curso entra no numerador (soma) e no MRR
- Só não duplica pessoa no denominador do ticket médio

### Trava 4: Agrupar pessoa corretamente
- Chave: `LOWER(TRIM(nome)) + unidade_id`
- Não usar só `nome` (homônimos em unidades diferentes)

---

## 5. Checklist de Execução

- [x] Trava 1: SELECT de validação em Rayane/Kailane (zero inconsistências ativas)
- [x] Trava 2: SELECT puro da view validado no banco (compila, retorna resultados)
- [x] Trava 2: Ticket médio validado (sobe de R$ 393,75 para R$ 415,81)
- [x] Trava 2: MRR validado (permanece R$ 400.837,97)
- [x] Trava 3: MRR não exclui segundo curso (confirmado)
- [x] Trava 4: Agrupamento por pessoa usa LOWER(TRIM(nome)) + unidade_id
- [ ] Commit do patch do frontend (ModalFichaAluno.tsx)
- [ ] Deploy do frontend
- [ ] Aplicar migration SQL da view (após deploy do frontend)
- [ ] Testar criação de segundo curso para bolsista (deve preservar 3/4)
- [ ] Testar criação de segundo curso para pagante (deve virar 2)
- [ ] Monitorar próximos segundos cursos criados

---

## 6. Arquivos Criados/Editados

1. `.claude/memory/diagnostico-ticket-medio-segundo-curso.md` — Diagnóstico completo
2. `.claude/memory/patch-view-ticket-medio-por-pessoa.sql` — Migration SQL da view (corrigida)
3. `src/components/App/Alunos/ModalFichaAluno.tsx` — Patch do frontend (aplicado)
4. `.claude/memory/entregavel-bug-ticket-medio-segundo-curso.md` — Este arquivo

---

## 7. Observação Técnica Importante

A view `vw_kpis_gestao_mensal` no banco está com uma versão **INTERMEDIÁRIA**:
- Não é a fase3 original (usa `tipo_aluno` string)
- Não é a migration 20260531 (tem `alunos_ticket` por pessoa)
- É uma versão com `financeiro_legado` que calcula por linha

Isso explica por que o ticket médio está deflacionado. A migration 20260531 pode não ter sido completamente aplicada, ou outra alteração posterior sobrescreveu a view.

**Bloqueador corrigido:** O SQL original não incluía `status_pagamento` no `snapshot_base`. Foi adicionado e validado.
