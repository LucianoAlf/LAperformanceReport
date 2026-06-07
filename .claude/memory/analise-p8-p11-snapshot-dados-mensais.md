# Analise P8/P11 — Snapshot `dados_mensais`: Por que os dados de abril foram "perdidos"

> Data: 2026-06-05
> Status: INVESTIGACAO CONCLUIDA — aguardando decisao do Alf

---

## 1. CONCLUSOES DA INVESTIGACAO

### 1.1 `dados_mensais` e tabela (NAO view)

```typescript
// database.types.ts
export type DadosMensais = {
  id: string
  unidade_id: string
  ano: number
  mes: number
  alunos_ativos: number
  alunos_pagantes: number
  matriculas_ativas: number
  matriculas_banda: number
  matriculas_2_curso: number
  novas_matriculas: number
  evasoes: number
  churn_rate: number
  ticket_medio: number
  taxa_renovacao: number
  tempo_permanencia: number
  inadimplencia: number
  reajuste_parcelas: number
  faturamento_estimado: number  // GENERATED ALWAYS
  saldo_liquido: number          // GENERATED ALWAYS
  created_at: string
  updated_at: string
}
```

Constraint: `ON CONFLICT (unidade_id, ano, mes) DO UPDATE SET` → **1 linha por unidade/mes**.

### 1.2 Como funciona o snapshot

A funcao `recalcular_dados_mensais(p_ano, p_mes, p_unidade_id)` faz:

1. Calcula todos os KPIs olhando para `alunos`, `movimentacoes_admin`, `tipos_matricula`, `cursos` no **fim do mes**
2. Faz `INSERT INTO dados_mensais ... ON CONFLICT (unidade_id, ano, mes) DO UPDATE SET ...`
3. Ou seja: **UPSERT** — se ja existe, sobrescreve.

### 1.3 Cron legado ja foi desativado (contencao)

Arquivo: `docs/MIGRACAO_FASE1_NEUTRALIZAR_CRON_SNAPSHOT_DADOS_MENSAIS.sql`

- Existia um cron `snapshot_dados_mensais_mensal` agendado para `0 3 1 * *` (dia 1, 3h da manha)
- Chamava `snapshot_dados_mensais(...)` — funcao com regras antigas/incompativeis
- **Ja foi desativado** via migracao de fase 1 (contencao de sangramento)
- O cron contaminou o snapshot de CG/Maio 2026 as 3:00

### 1.4 Onde e chamado hoje

| Origem | Funcao | Regras |
|--------|--------|--------|
| Botao "Recalcular" em TabGestao.tsx | `recalcular_dados_mensais` v2 | Novas (canonicas) |
| Botao "Recalcular" em AlunosPage.tsx | `recalcular_dados_mensais` v2 | Novas (canonicas) |
| Cron legado (DESATIVADO) | `snapshot_dados_mensais` | Antigas (contaminadas) |

### 1.5 Por que "perdeu dados de abril"

O Alf disse: "subscreveu e perdeu dados de abril".

**Causa raiz:** O snapshot NAO e imutavel. Ele e recalculado a partir de `alunos` + `movimentacoes_admin` que MUDAM no tempo.

Exemplo concreto:
- 01/05/2026: snapshot de abril e gravado. Aluno Joao estava ativo em 30/abr, entra no snapshot.
- 15/05/2026: alguem corrige a data de saida do Joao para 15/abr (descobriu que ele saiu mais cedo).
- 20/05/2026: alguem clica "Recalcular" para abril.
- Resultado: Joao some do snapshot de abril. O numero de "alunos_ativos de abril" diminui.
- Alf olha em junho: "os dados de abril estao diferentes do que eu vi em maio!"

**Isso NAO e perda de dados — e alteracao retroactiva de historico.**

---

## 2. DIAGNOSTICO

| Problema | Severidade | Evidencia |
|----------|------------|-----------|
| Snapshot nao e imutavel | **CRITICO** | ON CONFLICT DO UPDATE permite sobrescrever |
| Sem audit trail | **ALTO** | Nao sabemos QUANDO nem POR QUEM o snapshot foi gerado/recalculado |
| Sem versionamento | **ALTO** | So existe 1 versao por mes. Nao da para comparar "abril v1" vs "abril v2" |
| `created_at` = primeira gravacao, `updated_at` = ultima recalculacao | **MEDIO** | Nao distingue "snapshot original do mes" de "recalculo posterior" |
| Botao "Recalcular" permite sobrescrever qualquer mes, sem aviso | **MEDIO** | Frontend nao pede confirmacao nem explica o risco |

---

## 3. SOLUCOES PROPOSTAS

### Opcao A: Snapshot Imutavel (Mais Simples)

**Regra:** Depois do dia 5 do mes seguinte, o snapshot do mes anterior fica congelado.

Implementacao:
1. Adicionar campo `congelado BOOLEAN DEFAULT false` em `dados_mensais`
2. Modificar `recalcular_dados_mensais` para verificar: se `congelado = true`, retornar erro "Snapshot congelado, nao pode recalcular"
3. Criar funcao `congelar_snapshot(p_ano, p_mes)` que roda automaticamente no dia 5 do mes seguinte (ou manualmente pelo Alf)
4. No frontend, desabilitar botao "Recalcular" se snapshot estiver congelado

**Pros:** Simples, garante imutabilidade, barato.
**Contras:** Se houver erro no snapshot original, precisa descongelar para corrigir.

---

### Opcao B: Versionamento de Snapshot (Mais Completo)

**Regra:** Cada recalculo grava uma NOVA versao, mantendo a anterior.

Implementacao:
1. Criar tabela `dados_mensais_historico` com mesma estrutura + `versao INTEGER` + `snapshot_em` + `snapshot_por` + `motivo_recalculo`
2. Na tabela `dados_mensais` (principal), manter so a versao mais recente
3. `recalcular_dados_mensais` antes de atualizar, copia a linha atual para `dados_mensais_historico`
4. Dashboard e relatorios usam `dados_mensais` (versao mais recente)
5. Se precisar ver "abril como estava em maio", consulta `dados_mensais_historico`

**Pros:** Total audit trail, pode comparar versoes, pode recuperar dados.
**Contras:** Mais complexo, ocupa mais espaco (1 linha por recalculo).

---

### Opcao C: View Materializada (Alternativa Arquitetonica)

**Regra:** Em vez de tabela, usar uma view materializada que calcula tudo dinamicamente a partir de `alunos` + `movimentacoes_admin`.

**Pros:** Sempre reflete o estado atual do banco, nao precisa de recalculo manual.
**Contras:** Lenta para consultas frequentes. Snapshot de mes passado muda se alguem corrige `data_saida` retroactivamente (mesmo problema, mas de forma transparente).

---

### Opcao D: Snapshot Diario (Auditoria Extrema)

**Regra:** Gravar 1 snapshot por dia, nao so 1 por mes.

Implementacao:
1. Tabela `dados_diarios` com `data DATE` em vez de `ano + mes`
2. Cron roda todo dia, grava snapshot do dia
3. Para "mes de abril", pegar o snapshot do ultimo dia util de abril

**Pros:** Granularidade total, pode ver evolucao dentro do mes.
**Contras:** Muito mais dados, mais lento, overkill para a necessidade atual.

---

## 4. RECOMENDACAO

**Opcao A (Snapshot Imutavel) + pequena melhoria de audit trail.**

Porque:
- O Alf quer poder "olhar em janeiro e ver os dados de janeiro" — imutabilidade resolve isso
- E simples de implementar (1 campo + 1 verificacao na funcao)
- Nao muda a arquitetura atual
- Pode ser complementado depois com versao B se necessario

**Passos:**
1. Adicionar `congelado BOOLEAN DEFAULT false` e `congelado_em TIMESTAMPTZ` em `dados_mensais`
2. Modificar `recalcular_dados_mensais` para bloquear UPDATE se `congelado = true`
3. Criar RPC `congelar_snapshot(p_ano, p_mes, p_unidade_id)` (ou funcao para todas as unidades)
4. No frontend, desabilitar botao "Recalcular" quando snapshot ja esta congelado, mostrando tooltip "Snapshot de [mes] ja foi congelado em [data]"
5. Opcional: adicionar `recalculado_por UUID REFERENCES auth.users(id)` para saber quem recalculou

---

## 5. PROXIMOS PASSOS (aguardando Alf)

| Acao | Responsavel | Prioridade |
|------|-------------|------------|
| Decidir qual opcao (A, B, C, D, ou mistura) | Alf | P0 |
| Implementar campo `congelado` + logica de bloqueio | Dev | P1 |
| Atualizar frontend (botao Recalcular com estado congelado) | Dev | P1 |
| Backfill: definir quais meses ja estao "congelados" (ex: janeiro-abril de 2026) | Alf + Dev | P2 |
| Documentar no canônico que snapshot de mes passado NAO deve ser recalculado | Dev | P2 |

---

## 6. PERGUNTAS PARA O ALF

1. **Quer que eu implemente a Opcao A (snapshot imutavel)?** E simples e resolve o problema de "perda de dados".
2. **Quando um mes deve ser congelado?** Sugestao: dia 5 do mes seguinte (tempo suficiente para correcoes, mas antes de fechar o mes no financeiro).
3. **Ja existe algum mes que NAO deve ser congelado ainda?** Ex: maio de 2026 ainda esta sendo auditado, pode precisar de recalculo.
4. **Quer audit trail (quem e quando recalculou)?** E util para rastrear quem sobrescreveu o que.
