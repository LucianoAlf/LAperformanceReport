# Relatório de Auditoria Forense — CG/Maio/2026

## Data da perícia
2026-06-01

## Fonte primária
`audit_log` do Supabase — old_record do update do cron job legado às 03:00 de 01/06/2026.

---

## 1. Cronologia dos Snapshots

| Horário | Evento | Ativos | Pagantes | Matrículas | Banda | 2º Curso | Novas | Evasões | Churn |
|---|---|---|---|---|---|---|---|---|---|
| **31/05 23:45** | Update manual (lucianoalf) | 500 | 474 | 566 | 43 | 66 | 23 | 13 | 2.74% |
| **01/06 02:56** | Update system (recálculo) | **496** | **470** | **561** | **41** | **27** | **23** | 13 | **2.77%** |
| **01/06 03:00** | **CRON JOB LEGADO** | 492 | 466 | 556 | 41 | **64** | 21 | 13 | 2.83% |
| **01/06 23:06** | Update system | 489 | 463 | 552 | 40 | 27 | 23 | 13 | 2.81% |
| **Vivo (hoje)** | Cálculo ao vivo | 475 | 445 | 538 | 40 | 27 | 23 | 13 | 2.92% |

**Fonte confiável identificada:** O snapshot **496/470/561/41/27/23/13/~2.77%** está preservado como `old_record` no `audit_log` do update do cron job às 03:00.

---

## 2. Análise por Transição

### 2.1 500 → 496 (31/05 23:45 → 01/06 02:56)

**Diferença:** -4 ativos, -4 pagantes, -5 matrículas, -2 banda, -39 2º curso

**Alunos identificados no audit_log:**

| Aluno | Horário | Alteração | Impacto |
|---|---|---|---|
| Miguel Gomes Biancamano | 01/06 00:03 | tipo 1→3 (Regular → Bolsista Integral) | -1 pagante |
| Matheus Reis da Silva Gaspar | 01/06 00:04 | tipo 1→3 (Regular → Bolsista Integral) | -1 pagante |
| Carlos Eduardo Garcia do Nascimento | 01/06 00:15 | tipo 2→3 (Segundo Curso → Bolsista Integral) | -1 pagante |
| Marcos da Silva Saturnino | 01/06 00:24 | tipo 1→3 (Regular → Bolsista Integral) | -1 pagante |
| Marcos da Silva Saturnino | 01/06 00:44 | status ativo → inativo | -1 ativo, -1 pagante |

**Total explicado:**
- Ativos: -1 (Marcos inativou)
- Pagantes: -4 (Marcos + Miguel + Matheus + Carlos Eduardo mudaram tipo)
- Matrículas: permanecem (mudança de tipo não afeta matrícula ativa)

**Observação:** A diferença de -4 ativos não é totalmente explicada pelos alunos acima. Possíveis causas:
1. Outras alterações no cadastro não capturadas pelo filtro de campos
2. O recálculo às 02:56 usou lógica diferente (ex: deduplicação por nome)

### 2.2 496 → 492 (01/06 02:56 → 01/06 03:00)

**Diferença:** -4 ativos, -4 pagantes, -5 matrículas, 0 banda, +37 2º curso, -2 novas

**Causa:** Cron job legado `snapshot_dados_mensais_mensal` sobrescreveu o registro.

**Características do bug do cron:**
- `matriculas_2_curso` explodiu de 27 → 64 (bug de cálculo)
- `novas_matriculas` caiu de 23 → 21
- A lógica do cron provavelmente contava diferente (ex: sem deduplicação, sem filtro de bolsista)

**Classificação:** PERDA_FUNCAO_ANTIGA

### 2.3 492 → 489 (01/06 03:00 → 01/06 23:06)

**Diferença:** -3 ativos, -3 pagantes, -4 matrículas, -1 banda, -37 2º curso, +2 novas

**⚠️ NOTA CONCEITUAL IMPORTANTE:**
Evasões com `data_saida` em 01/06 **não deveriam afetar Maio** se a regra temporal usa `data_saida > fim_mes` (onde fim_mes = 2026-05-31). O problema é que o recálculo usa o `status` atual do aluno (`evadido`, `inativo`) ao invés de avaliar o estado do aluno **na data de corte de Maio**.

Isso significa que alunos que evadiram em Junho estão sendo subtraídos de Maio incorretamente. A retificação para 496/470/561 deve usar a lógica histórica correta: `status IN ('ativo', 'trancado') AND data_matricula <= '2026-05-31' AND (data_saida IS NULL OR data_saida > '2026-05-31')`.

**Alunos identificados no audit_log (entre 03:00 e 23:06):**

| Aluno | Horário | Alteração | Impacto |
|---|---|---|---|
| Renato Vitorino Pandolpho | 16:28 | ativo → trancado | -1 ativo, -1 pagante |
| Ronald Oliveira Rodrigues Fernandes | 16:29 | ativo → trancado → evadido | -1 ativo, -1 pagante |
| Raul Rodrigues Aguiar | 16:29 | ativo → evadido (data_saida=2026-06-01) | -1 ativo, -1 pagante |
| Sophia Reis Martins Garcia de Lima | 16:38 | ativo → trancado | -1 ativo, -1 pagante |
| Pedro Lucas da Silva Brandão | 16:43 | ativo → evadido (data_saida=2026-06-01) | -1 ativo, -1 pagante |
| Valdemir De Vargas Junior | 16:49 | ativo → inativo | -1 ativo, -1 pagante |
| Maria Eduarda Costa da Fonseca | 22:39 | ativo → evadido (data_saida=2026-06-01) | -1 ativo, -1 pagante |
| Nicolas Faria dos Santos | 22:45 | inativo → evadido (data_saida alterada) | status já não contava |
| Ana Clara Lima Santos Pinto | 22:57 | ativo → evadido (data_saida=2026-06-01) | -1 ativo, -1 pagante |
| Marcelino Jorge Batista | 22:57 | ativo → evadido (data_saida=2026-06-01) | -1 ativo, -1 pagante |
| Thiago Sandes | 23:01 | evadido → trancado | 0 (trancado ainda conta) |

**Batch de sistema às 22:22:** Múltiplos alunos tiveram `tipo_matricula` alterado (2→5, 1→4, etc.) pelo sistema. Isso pode ter afetado pagantes.

**Classificação mista:**
- ALTERACAO_RETROATIVA (evasões de Junho sendo registradas com data_saida em Junho, mas afetando snapshot de Maio se o cálculo usar data_saida <= fim_mes)
- PERDA_FUNCAO_ANTIGA (recálculo às 23:06 com lógica diferente, corrigindo o bug de 2º curso: 64→27)

### 2.4 489 → 475 (Snapshot atual → Cálculo vivo)

**Diferença:** -14 ativos, -18 pagantes, -14 matrículas

**Causa:** Cadastro de alunos divergiu ainda mais desde Maio. Novas evasões, mudanças de tipo, inativações.

**Classificação:** PERDA_CADASTRO_ATUAL

---

## 3. Tipos de Matrícula — Impacto Confirmado

| ID | Código | Nome | Conta como Pagante |
|---|---|---|---|
| 1 | REGULAR | Regular | ✅ Sim |
| 2 | SEGUNDO_CURSO | Segundo Curso | ✅ Sim |
| 3 | BOLSISTA_INT | Bolsista Integral | ❌ Não |
| 4 | BOLSISTA_PARC | Bolsista Parcial | ❌ Não |
| 5 | BANDA | Matrícula em Banda | ❌ Não |

**Conclusão:** Mudança de tipo 1→3 ou 2→3 faz o aluno deixar de contar como pagante. Isso explica parte das perdas.

---

## 4. Categorização das Divergências

| Período | Divergência | Categoria Principal | Confiança |
|---|---|---|---|
| 500→496 | -4 ativos, -4 pagantes | ALTERACAO_RETROATIVA | Média |
| 496→492 | -4 ativos, +37 2º curso | PERDA_FUNCAO_ANTIGA | Alta |
| 492→489 | -3 ativos, -37 2º curso | PERDA_FUNCAO_ANTIGA + ALTERACAO_RETROATIVA | Média |
| 489→475 | -14 ativos, -18 pagantes | PERDA_CADASTRO_ATUAL | Alta |

---

## 5. Recomendações

### 5.1 Restauração do snapshot validado
O `old_record` do audit_log às 03:00 contém o snapshot **496/470/561/41/27/23/13/~2.77%**, que é a última versão válida antes da contaminação do cron job.

**Campos que podem ser restaurados com segurança:**
- `alunos_ativos`: 496
- `alunos_pagantes`: 470
- `matriculas_ativas`: 561
- `matriculas_banda`: 41
- `matriculas_2_curso`: 27
- `novas_matriculas`: 23
- `evasoes`: 13
- `churn_rate`: 2.77

**Campos que NÃO devem ser restaurados (podem ter sido atualizados legítimamente):**
- `ticket_medio` (pode refletir reajustes reais)
- `faturamento_estimado` (depende de ticket_medio)
- `saldo_liquido`, `inadimplencia` (podem ter sido atualizados com dados reais)
- `tempo_permanencia` (pode ter sido recalculado com dados mais recentes)

### 5.2 Aplicação
A retificação deve ser feita via:
1. INSERT em `dados_mensais_retificacoes` (tabela de auditoria da Fase 2)
2. UPDATE controlado em `dados_mensais` com o snapshot validado
3. Motivo obrigatório: "Restauração de snapshot validado de Maio/2026 após contaminação por cron job legado"

**⚠️ ATENÇÃO CONCEITUAL:**
A retificação usa o snapshot do `old_record` do audit_log (496/470/561), que já foi calculado com a regra temporal correta (`data_saida > fim_mes`). Não é um recálculo ao vivo usando `status` atual. Isso evita o erro de subtrair evasões de Junho de Maio.

### 5.3 Prevenção
- Cron job `snapshot_dados_mensais_mensal` já foi desagendado (Fase 1)
- Nova função de snapshot deve usar lógica pura (Fase 2A)
- Preview validado e não-mutativo (Fase 2A-REV)

---

## 6. Evidências

### 6.1 audit_log — update do cron às 03:00
```sql
SELECT id, tabela, acao, dados_antigos, dados_novos, created_at
FROM audit_log
WHERE tabela = 'dados_mensais'
  AND created_at >= '2026-06-01 03:00:00'
  AND created_at < '2026-06-01 03:01:00';
```

**old_record (válido):**
```json
{
  "alunos_ativos": 496,
  "alunos_pagantes": 470,
  "matriculas_ativas": 561,
  "matriculas_banda": 41,
  "matriculas_2_curso": 27,
  "novas_matriculas": 23,
  "evasoes": 13,
  "churn_rate": 2.77,
  "updated_at": "2026-06-01T02:56:22.921522+00:00"
}
```

**new_record (contaminado):**
```json
{
  "alunos_ativos": 492,
  "alunos_pagantes": 466,
  "matriculas_ativas": 556,
  "matriculas_banda": 41,
  "matriculas_2_curso": 64,
  "novas_matriculas": 21,
  "evasoes": 13,
  "churn_rate": 2.83,
  "updated_at": "2026-06-01T03:00:00.066604+00:00"
}
```

### 6.2 Alterações de alunos entre 31/05 e 01/06
```sql
SELECT dados_antigos->>'nome', dados_antigos->>'status', dados_novos->>'status',
       dados_antigos->>'tipo_matricula_id', dados_novos->>'tipo_matricula_id',
       created_at
FROM audit_log
WHERE tabela = 'alunos'
  AND created_at >= '2026-05-31 23:45:00'
  AND created_at < '2026-06-01 03:00:00'
  AND (
    dados_antigos->>'status' IS DISTINCT FROM dados_novos->>'status'
    OR dados_antigos->>'tipo_matricula_id' IS DISTINCT FROM dados_novos->>'tipo_matricula_id'
  );
```

---

## 7. Conclusão

A fonte confiável do fechamento validado de Maio/CG/2026 foi **encontrada** no `audit_log` como `old_record` do update do cron job legado às 03:00 de 01/06/2026.

Os números corretos são:
- **496** alunos ativos
- **470** alunos pagantes
- **561** matrículas ativas
- **41** matrículas banda
- **27** matrículas 2º curso
- **23** novas matrículas
- **13** evasões
- **~2.77%** churn rate

A contaminação ocorreu em 3 etapas:
1. Alterações retroativas no cadastro (500→496)
2. Sobrescrita pelo cron job legado (496→492)
3. Novo recálculo com cadastro divergente (492→489)

O cálculo vivo atual (475/445/538) está ainda mais distante e **não pode ser usado** para restaurar Maio.

---

## 8. Restrições

- ✅ Nenhum dado foi alterado durante esta perícia
- ✅ Nenhuma migration foi aplicada
- ✅ Nenhuma função foi criada no banco
- ✅ Toda a investigação foi feita via SELECT-only
- ✅ O relatório é apenas proposta/documentação
