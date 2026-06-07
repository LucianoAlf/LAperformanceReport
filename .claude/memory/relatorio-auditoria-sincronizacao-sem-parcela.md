# Auditoria Cruzada: Alunos Ativos com `status_pagamento = 'sem_parcela'`

## Data: 2026-06-06
## Status: SELECT-only, nenhum UPDATE executado
## Objetivo: investigar bug de sincronização Emusys → LA Report

---

## Resumo Executivo

**28 alunos ativos** com `status_pagamento = 'sem_parcela'` no LA Report.

A maioria é **explicável** (banda, bolsista, contrato vencido), mas **2 alunos com contrato vigente + tipo Regular + valor_parcela > 0** sugerem que a sincronização pode estar falhando ao atualizar `status_pagamento` de alunos pagantes ativos.

**Nenhum UPDATE proposto.** Recomendação: investigar pipeline de sincronização Emusys → `alunos.status_pagamento`.

---

## Resultado por Grupo

### Grupo A: Contrato VIGENTE + sem_parcela (11 alunos)

| ID | Aluno | Unidade | Curso | Valor | Tipo Matrícula | Recent | Mov Saída | Diagnóstico |
|----|-------|---------|-------|-------|---------------|--------|-----------|-------------|
| 1370 | Maria Fernanda Sellos | Barra | Minha Banda | R$ 0 | BANDA | Não | 0 | **OK** — banda não paga |
| 1067 | Carlos Eduardo Garcia | CG | Canto | — | BOLSISTA_INT | Não | 0 | **OK** — bolsista integral |
| 1019 | Alex Mendes | Recreio | GarageBand | — | BANDA | Não | 0 | **OK** — banda |
| 1498 | Ana Beatriz Paz | Recreio | Canto | — | BOLSISTA_INT | Não | 0 | **OK** — bolsista integral |
| 1078 | Arthur Carvalho | Recreio | GarageBand | — | BANDA | Não | 0 | **OK** — banda |
| 1085 | Caio Vinicius | Recreio | GarageBand | R$ 0 | BANDA | Não | 0 | **OK** — banda |
| 1723 | **Giane Apoliana** | Recreio | Teclado | **R$ 357** | **REGULAR** | **Sim** | **1 (evasao)** | **⚠️ INVESTIGAR** — evasao recente mas ativo |
| 1369 | Giovanna Alves | Recreio | GarageBand | R$ 0 | BANDA | Não | 0 | **OK** — banda |
| 1720 | Larissa Bheattriz | Recreio | Canto | R$ 190 | BOLSISTA_PARC | Sim | 0 | **OK** — bolsista parcial |
| 1676 | **Luciana Lima** | Recreio | Canto | **R$ 385** | **REGULAR** | **Sim** | 0 | **⚠️ INVESTIGAR** — contrato vigente, Regular, com valor |
| 1366 | Victor Alexandre | Recreio | GarageBand | R$ 0 | BANDA | Não | 0 | **OK** — banda |

**Conclusão Grupo A:**
- 9 de 11 são banda/bolsista → `sem_parcela` esperado ✅
- **2 de 11 são REGULAR com valor > 0** → `sem_parcela` suspeito ⚠️
- 1 desses 2 (Giane) tem evasao registrada em 05/06/2026 — possível caso real de evasão muito recente
- 1 (Luciana) tem contrato vigente até 2027, Regular, R$ 385 — **forte candidato a sincronização falha**

---

### Grupo B: Contrato VENCIDO + sem_parcela (4 alunos)

| ID | Aluno | Unidade | Curso | Valor | Tipo Matrícula | Contrato Vencido | Mov Saída | Diagnóstico |
|----|-------|---------|-------|-------|---------------|------------------|-----------|-------------|
| 422 | Agatha Sampaio | Recreio | Canto | R$ 423,50 | REGULAR | 2026-05-25 | 0 | ⚠️ Contrato vencido 12 dias, renovação em 28/05 |
| 483 | Davi do nascimento | Recreio | Musicalização Prep. | R$ 459 | REGULAR | 2025-04-26 | 0 | ⚠️ **Falso positivo** — ativo no Emusys/Report |
| 549 | Isabela Ferreira | Recreio | Canto | R$ 365 | REGULAR | 2024-02-24 | 0 | ⚠️ Contrato vencido há 2 anos |
| 684 | Sofia Lima | Recreio | Canto | R$ 385 | REGULAR | 2025-04-29 | 0 | ⚠️ Contrato vencido há 1 ano |

**Conclusão Grupo B:**
- Davi: **CONFIRMADO ativo no Emusys** — falso positivo, sincronização de contrato falha
- Agatha: renovação registrada em 28/05, contrato venceu 25/05 — possível atraso de sincronização
- Isabela e Sofia: contratos vencidos há 1-2 anos, mas ativos — **prováveis erros de cadastro ou inativos que não foram fechados**

---

### Grupo C: Contrato NULO + sem_parcela (13 alunos)

| ID | Aluno | Unidade | Curso | Valor | Tipo Matrícula | Recent | Mov Saída | Diagnóstico |
|----|-------|---------|-------|-------|---------------|--------|-----------|-------------|
| 1066 | Carlos Eduardo Garcia | CG | Contrabaixo | — | BOLSISTA_INT | Não | 0 | OK — bolsista (2º curso) |
| 228 | Lavynea dos Anjos | CG | Guitarra | — | BOLSISTA_INT | Não | 0 | OK — bolsista |
| 1064 | Miguel Gomes Biancamano | CG | Contrabaixo | R$ 0 | BOLSISTA_INT | Não | 0 | OK — bolsista |
| 338 | Olivia Rocha Venturi | CG | Ukulelê | R$ 265 | BOLSISTA_INT | Não | 0 | OK — bolsista |
| 415 | Willer Arruda Machado | CG | Bateria | — | BOLSISTA_INT | Não | 0 | OK — bolsista |
| 1013 | Arthur Quinteiro Artacho | Recreio | Teclado | — | BOLSISTA_INT | Não | 0 | OK — bolsista |
| 191 | João Miguel | CG | Violino | R$ 399 | REGULAR | Não | 0 | ⚠️ Passaporte? Sem contrato, sem movimentação |
| 220 | Laura Andrade | CG | Teclado | R$ 347 | REGULAR | Não | 0 | ⚠️ Passaporte? Sem contrato, sem movimentação |
| 269 | Manuela Lourenço | CG | Teclado | R$ 347 | REGULAR | Não | 0 | ⚠️ Passaporte? Sem contrato, sem movimentação |
| 337 | Olavo Pereira Wood | CG | Bateria | R$ 337 | REGULAR | Não | 1 | ⚠️ `nao_renovacao` em out/2025 — deveria ser evadido |
| 358 | Priscila Amaro | CG | Contrabaixo | R$ 347 | REGULAR | Não | 0 | ⚠️ Sem contrato, mas tem outra matrícula (banda) |
| 445 | Beatriz Souto Machado | Recreio | Teclado | R$ 445 | REGULAR | Não | 0 | ⚠️ Sem contrato, mas tem outra matrícula (2º curso) |
| 450 | Bento Vieira | Recreio | Musicalização Infantil | R$ 460 | REGULAR | Não | 0 | ⚠️ Passaporte? Sem contrato, sem movimentação |

**Conclusão Grupo C:**
- 7 de 13 são bolsistas → `sem_parcela` esperado ✅
- 3 de 13 são passaportes isolados sem contrato (João Miguel, Laura, Manuela, Bento) → possível serviço isolado
- 2 de 13 têm outra matrícula ativa (Priscila = banda, Beatriz = 2º curso) → passaporte vinculado
- 1 de 13 tem movimentação de saída (Olavo) → **provável erro de status**

---

## Hipótese de Sincronização

### Evidências do bug

1. **Davi (483):** Confirmado ativo no Emusys/Report, cobrança automática ativa, contrato renovado até 2027. No LA Report: `data_fim_contrato = 2025-04-26` (vencido). **Divergência clara de contrato.**

2. **Luciana (1676):** Contrato vigente até 2027, tipo Regular, valor R$ 385, mas `status_pagamento = 'sem_parcela'`. Se é Regular com contrato vigente, deveria ter parcela.

3. **Giane (1723):** Mesmo padrão — Regular, contrato vigente, R$ 357, mas `sem_parcela`. Além disso, evasão registrada em 05/06/2026, mas ainda `ativo`.

### Padrão do possível bug

```
Emusys: aluno ativo, pagante, contrato renovado
    ↓
Sync Emusys → LA Report
    ↓
LA Report: status_pagamento = 'sem_parcela' (NÃO ATUALIZADO)
    ↓
View vw_kpis_gestao_mensal: exclui do MRR (filtro sem_parcela)
    ↓
Resultado: MRR pode estar SUBESTIMADO
```

### Impacto estimado no MRR

| Unidade | Alunos afetados | Valor potencial |
|---------|----------------|-----------------|
| **Recreio** | 2 (Luciana + Giane) | **R$ 742,00** |
| Campo Grande | 0 | R$ 0 |
| Barra | 0 | R$ 0 |

**Nota:** Se houver mais alunos com mesmo padrão fora dos 28 identificados, o impacto pode ser maior.

---

## Recomendações

### 1. Não executar UPDATEs de status/status_pagamento agora

O problema não é dado isolado — é **pipeline de sincronização**. Corrigir manualmente 2-3 casos não resolve a causa raiz e pode mascarar o problema.

### 2. Investigar pipeline de sincronização

Verificar:
- Edge function `processar-matricula-emusys` (v12) — campo `status_pagamento` está sendo mapeado?
- Sync de contrato (`data_inicio_contrato`, `data_fim_contrato`) — está atualizando renovações?
- Trigger de `status_pagamento` — há algum que sobrescreve para `sem_parcela`?
- Webhook Emusys → LA Report — evento de renovação está chegando?

### 3. Validar casos suspeitos no Emusys

| ID | Aluno | O que confirmar no Emusys |
|----|-------|---------------------------|
| 1676 | Luciana Lima | Status real, cobrança ativa, contrato vigente |
| 1723 | Giane Apoliana | Status real (evadiu?), cobrança, contrato |
| 483 | Davi do nascimento | Já confirmado ativo — usar como benchmark |

### 4. Olavo (337) — separar investigação

`nao_renovacao` em out/2025 + status `ativo` = erro de cadastro do LA Report, não necessariamente sincronização. Pode ser corrigido separadamente.

---

## SQLs Utilizados

```sql
-- Grupo A: Contrato vigente
SELECT a.id, a.nome, u.nome AS unidade, c.nome AS curso, a.valor_parcela,
       tm.codigo AS tipo_matricula, tm.conta_como_pagante, c.is_projeto_banda,
       a.data_matricula, a.data_inicio_contrato, a.data_fim_contrato,
       (SELECT COUNT(*) FROM movimentacoes_admin m 
        WHERE (m.aluno_id = a.id OR m.aluno_nome = a.nome) 
          AND m.tipo IN ('evasao','nao_renovacao')) AS mov_saida
FROM alunos a
LEFT JOIN unidades u ON u.id = a.unidade_id
LEFT JOIN cursos c ON c.id = a.curso_id
LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
WHERE a.status = 'ativo' AND a.status_pagamento = 'sem_parcela'
  AND a.data_fim_contrato >= CURRENT_DATE
ORDER BY u.nome, a.nome;

-- Grupo B: Contrato vencido
SELECT a.id, a.nome, u.nome AS unidade, c.nome AS curso, a.valor_parcela,
       tm.codigo AS tipo_matricula, a.data_fim_contrato,
       (SELECT COUNT(*) FROM movimentacoes_admin m 
        WHERE (m.aluno_id = a.id OR m.aluno_nome = a.nome) 
          AND m.tipo IN ('evasao','nao_renovacao')) AS mov_saida
FROM alunos a
LEFT JOIN unidades u ON u.id = a.unidade_id
LEFT JOIN cursos c ON c.id = a.curso_id
LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
WHERE a.status = 'ativo' AND a.status_pagamento = 'sem_parcela'
  AND a.data_fim_contrato < CURRENT_DATE
ORDER BY u.nome, a.nome;

-- Grupo C: Contrato nulo
SELECT a.id, a.nome, u.nome AS unidade, c.nome AS curso, a.valor_parcela,
       tm.codigo AS tipo_matricula,
       (SELECT COUNT(*) FROM movimentacoes_admin m 
        WHERE (m.aluno_id = a.id OR m.aluno_nome = a.nome) 
          AND m.tipo IN ('evasao','nao_renovacao')) AS mov_saida
FROM alunos a
LEFT JOIN unidades u ON u.id = a.unidade_id
LEFT JOIN cursos c ON c.id = a.curso_id
LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
WHERE a.status = 'ativo' AND a.status_pagamento = 'sem_parcela'
  AND a.data_fim_contrato IS NULL
ORDER BY u.nome, a.nome;

-- Impacto no MRR
SELECT u.nome AS unidade, COUNT(*) AS qtd, SUM(a.valor_parcela) AS valor_parcelas
FROM alunos a
LEFT JOIN unidades u ON u.id = a.unidade_id
LEFT JOIN cursos c ON c.id = a.curso_id
LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
WHERE a.status = 'ativo' AND a.status_pagamento = 'sem_parcela'
  AND a.data_fim_contrato >= CURRENT_DATE
  AND tm.codigo IN ('REGULAR', 'SEGUNDO_CURSO')
  AND c.is_projeto_banda = false
GROUP BY u.nome;
```

---

## Status dos Casos Anteriores

| Caso | Status | Motivo |
|------|--------|--------|
| Davi (483) | **REMOVIDO da correção** | Confirmado ativo no Emusys — falso positivo |
| Giane (1723) | **REMOVIDO da correção** | Contrato vigente, possível evasão recente real |
| Olavo (337) | **AGUARDANDO** | Único caso que ainda parece erro de cadastro |
| Luciana (1676) | **AGUARDANDO validação Emusys** | Forte candidato a sincronização falha |

---

## Próximos Passos Sugeridos

1. **Validar Luciana e Giane no Emusys** — status real, cobrança, contrato
2. **Investigar edge function de sincronização** — por que `status_pagamento` e `data_fim_contrato` não atualizam?
3. **Auditoria adicional:** verificar se há mais alunos com padrão `Regular + contrato vigente + sem_parcela` fora dos 28
4. **Só então** decidir se faz UPDATE manual ou corrige a sincronização
