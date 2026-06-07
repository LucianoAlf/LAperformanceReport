# Lista Nominal para Validacao com a Operacao

## Data: 2026-06-06
## Status: SELECT-only, zero UPDATE
## Pergunta para a Dai/ADM: "Qual criterio voces usaram em 26/05 para marcar esses alunos como sem parcela?"

---

## Grupo 1: Comprovado edicao manual (audit_log) — 8 alunos

### Alterado por dai@lamusic.com.br em 2026-05-26

| ID | Aluno | Unidade | Tipo | Valor | Contrato | Aulas 30d | Ultima Aula | De | Data/Hora Alteracao |
|----|-------|---------|------|-------|----------|-----------|-------------|----|---------------------|
| 422 | Agatha Sampaio Mendes dos Santos | Recreio | Regular | R$ 423,50 | 2026-05-25 (vencido) | 7 | 2026-06-01 | em_dia | 26/05 12:46 |
| 450 | Bento Vieira Sindeaux | Recreio | Regular | R$ 460,00 | null | 7 | 2026-06-06 | em_dia | 26/05 12:48 |
| 483 | Davi do nascimento alexandre da gama mello | Recreio | Regular | R$ 459,00 | 2025-04-26 (vencido) | 8 | 2026-06-03 | em_dia | 26/05 12:48 |
| 684 | Sofia Lima de Castro | Recreio | Regular | R$ 385,00 | 2025-04-29 (vencido) | 6 | 2026-06-02 | em_dia | 26/05 13:13 |
| 549 | Isabela Ferreira Moura | Recreio | Regular | R$ 365,15 | 2024-02-24 (vencido) | 10 | 2026-06-06 | em_dia | 26/05 13:14 |
| 445 | Beatriz Souto Machado | Recreio | Regular | R$ 445,50 | null | 16 | 2026-06-06 | em_dia | 26/05 13:14 |
| 1676 | Luciana Lima de Moura | Recreio | Regular | R$ 385,00 | 2027-02-20 (vigente) | 6 | 2026-06-06 | em_dia | 26/05 13:46 |

### Alterado por dai@lamusic.com.br em 2026-05-28

| ID | Aluno | Unidade | Tipo | Valor | Contrato | Aulas 30d | Ultima Aula | De | Data/Hora Alteracao |
|----|-------|---------|------|-------|----------|-----------|-------------|----|---------------------|
| 1723 | Giane Apoliana Albino de Oliveira | Recreio | Regular | R$ 357,00 | 2027-01-06 (vigente) | 2 | 2026-06-03 | em_dia | 28/05 21:53 |

**Nota sobre Giane:** Transferencia interna CG -> Recreio. Evasao na matricula 1026 (CG) nao e churn global.

---

## Grupo 2: Sem registro no audit_log — 5 alunos (hipotese aberta)

| ID | Aluno | Unidade | Tipo | Valor | Contrato | Aulas 30d | Ultima Aula | Observacao |
|----|-------|---------|------|-------|----------|-----------|-------------|------------|
| 191 | Joao Miguel da Cunha Alves Ferreira | Campo Grande | Regular | R$ 399,00 | null | 6 | 2026-05-28 | Sem audit_log. Pode ser legado/importacao. |
| 220 | Laura Andrade da Silveira | Campo Grande | Regular | R$ 347,00 | null | 0 | 2026-03-30 | Sem audit_log. Ultima aula ha 2+ meses. Investigar. |
| 269 | Manuela Lourenco Ribeiro | Campo Grande | Regular | R$ 347,00 | null | 8 | 2026-06-01 | Sem audit_log. Matricula recente, frequenta aulas. |
| 337 | Olavo Pereira Wood | Campo Grande | Regular | R$ 337,00 | null | 0 | null | Sem audit_log. Zero aulas no LA Report. Emusys confirma ativo/pago. Divergencia de movimentacao/sync. |
| 358 | Priscila Amaro da Silva | Campo Grande | Regular | R$ 347,00 | null | 12 | 2026-05-26 | Sem audit_log. Tem outra matricula (banda). |

**Hipotese para Grupo 2:**
- Criados antes do trigger de audit_log estar ativo;
- Importacao/carga legada;
- Ou outro fluxo nao mapeado ainda.

---

## Impacto no MRR (Grupo 1 = audit_log comprovado)

| Aluno | Valor | Status Esperado | Impacto MRR |
|-------|-------|-----------------|-------------|
| Luciana Lima | R$ 385,00 | em_dia | +R$ 385 |
| Giane Apoliana | R$ 357,00 | em_dia | +R$ 357 |
| Davi do nascimento | R$ 459,00 | em_dia | +R$ 459 |
| Isabela Ferreira | R$ 365,15 | em_dia? | +R$ 365 |
| Sofia Lima | R$ 385,00 | em_dia? | +R$ 385 |
| Agatha Sampaio | R$ 423,50 | em_dia? | +R$ 423 |
| Beatriz Souto | R$ 445,50 | em_dia? | +R$ 445 |
| Bento Vieira | R$ 460,00 | em_dia? | +R$ 460 |

**Total Grupo 1 (audit_log):** ~R$ 3.279,65 potencialmente subestimado no MRR

**Grupo 2 (sem_audit):** ~R$ 1.677,00 adicional, mas sem trilha de auditoria — investigar antes.

---

## Perguntas para Validacao com a Operacao (Dai/ADM)

### Sobre o lote de 26/05:

1. "Qual foi o criterio usado para alterar `status_pagamento` de `em_dia` para `sem_parcela` nesses 8 alunos do Recreio em 26/05?"
2. "Luciana (contrato vigente ate 2027, aulas ativas ate 06/06) e Giane (contrato vigente, aulas ativas) — realmente sao sem parcela?"
3. "Davi tem renovacao registrada no Emusys em maio/2026. Por que foi marcado como sem parcela?"

### Sobre os alunos sem audit_log (CG):

4. "Joao Miguel, Manuela, Priscila sao alunos ativos com aulas recentes. Realmente sao sem parcela ou ha algum beneficio/passaporte?"
5. "Laura nao tem aula desde marco/2026. Ainda e aluna ativa ou evadiu/trancou?"
6. "Olavo nao tem aula no LA Report mas o Emusys mostra ativo. Ha alguma divergencia de matricula/unidade?"

### Sobre processo:

7. "O campo `sem_parcela` esta sendo usado como marcador operacional (ex: 'nao cobrar este mes') ou como categoria definitiva de matricula?"
8. "Deveria haver validacao que impeça marcar Regular + contrato vigente como sem_parcela?"

---

## Proximo Passo

**Apos resposta da operacao:**

| Cenario | Acao |
|---------|------|
| Erro operacional (Regular ativo pagante marcado errado) | UPDATE nominal por ID para `em_dia` |
| Realmente sem parcela (bolsa, beneficio, etc.) | Verificar se `tipo_matricula_id` deveria ser bolsista |
| Transferencia (Giane) | Confirmar modelagem de transferencia entre unidades |
| Legado/importacao (Grupo 2) | Investigar origem historica |

**Nao executar UPDATE sem confirmacao da operacao.**
