# Relatório Técnico — Regras de KPI v2

**Data:** 31/05/2026
**Unidade:** Campo Grande (pilot)
**Responsável técnico:** Cascade + Alfredo/Alf
**Status:** Aguardando aprovação antes de aplicar em produção

---

## 1. Resumo Executivo

A fase exploratória de auditoria CG/Maio identificou que a lógica atual de cálculo de KPIs mistura **métricas por pessoa** (alunos ativos/pagantes) com **métricas por linha/matricula** (matriculas ativas, banda, segundo curso) sem distinguir corretamente os dois níveis.

Este patch corrige `vw_kpis_gestao_mensal` e `recalcular_dados_mensais` para:
- Contar pessoas distintas em `alunos_ativos` e `alunos_pagantes`
- Contar linhas em `matriculas_ativas`, `matriculas_banda`, `matriculas_2_curso`
- Separar banda/projeto do segundo curso operacional
- Manter snapshot base consistente: `ativo`/`trancado` + `data_matricula <= fim_mes` + `data_saida` nula ou futura

---

## 2. Regras de Negócio Validadas

### 2.1 Snapshot Base (filtro temporal)

Toda métrica parte do mesmo snapshot:

```
status IN ('ativo', 'trancado')
data_matricula <= fim_do_mes
(data_saida IS NULL OR data_saida > fim_do_mes)
```

> **Nota:** Não se filtra por `is_segundo_curso` nem `is_projeto_banda` no snapshot base. O filtro acontece na agregação.

### 2.2 Alunos Ativos (`alunos_ativos`)

- **Nível:** Pessoa (`COUNT(DISTINCT nome)`)
- **Regra:** Pessoas distintas presentes no snapshot base
- **Inclui:** Quem tem banda/projeto (não exclui cegamente)
- **Inclui:** Trancados
- **Não duplica:** Segundo curso

> Exemplo: Uma aluna tem Violino (R$300) + Banda (R$0). Conta **1 ativa** (é 1 pessoa, independente de quantos cursos/bandas ela tenha).

### 2.3 Alunos Pagantes (`alunos_pagantes`)

- **Nível:** Pessoa (`COUNT(DISTINCT nome)`)
- **Regra:** Pessoas distintas no snapshot base com **pelo menos uma linha** onde `tipos_matricula.conta_como_pagante = true`
- **Não usa:** `valor_parcela > 0` como filtro global
- **Exclui:** Bolsista integral, bolsista parcial, professor, estagiário, permuta, não pagante

> Exemplo: Carlos Eduardo tem Permuta (R$0, não pagante) em ambos os cursos. Não conta como pagante, mesmo que um dos cursos tivesse valor > 0. Regra: conta como pagante apenas se pelo menos uma linha tiver `conta_como_pagante = true`.

### 2.4 Matrículas Ativas (`matriculas_ativas`)

- **Nível:** Linha (`COUNT(*)`)
- **Regra:** Todas as linhas do snapshot base
- **Esperado CG/Mai:** 561

### 2.5 Matrículas Banda/Projeto (`matriculas_banda`)

- **Nível:** Linha (`COUNT(*)`)
- **Regra:** Linhas do snapshot onde `cursos.is_projeto_banda = true`
- **Esperado CG/Mai:** 41

### 2.6 Segundo Curso Operacional (`matriculas_2_curso`)

- **Nível:** Linha (`COUNT(*)`)
- **Regra:** `is_segundo_curso = true` **AND** `COALESCE(cursos.is_projeto_banda, false) = false`
- **Não confundir com:** Bruto de `is_segundo_curso=true` (que dá 65 e mistura banda)
- **Esperado CG/Mai:** 27

### 2.7 Novas Matrículas (`novas_matriculas`)

- **Nível:** Linha
- **Regra:** Linhas novas no mês (`data_matricula` dentro do mês), excluindo:
  - Segundo curso
  - Bolsista integral/parcial
  - Banda/projeto
  - Canto coral
- **Esperado CG/Mai:** 23

### 2.8 Evasões (`evasoes`)

- **Nível:** Pessoa (deduplicado por nome)
- **Regra:** `movimentacoes_admin` com tipo `evasao` ou `nao_renovacao` no mês
- **Deduplicação:** `DISTINCT ON (LOWER(TRIM(nome)))` por mês
- **Esperado CG/Mai:** 13

### 2.9 Churn (`churn_rate`)

- `evasoes / alunos_pagantes * 100`
- **Esperado CG/Mai:** 2,77%

### 2.10 Ticket Médio (`ticket_medio`)

- **Status:** Pendente de validação nominal.
- **Nível provisório:** Pessoa
- **Regra provisória:** Média da **soma de parcelas por pessoa** (não média das linhas)
- **Filtro:** `tipos_matricula.entra_ticket_medio = true`
- **Observação:** O valor do card atual (R$ 386) ainda não foi reconciliado nominalmente com a regra acima. Não aplicar até Alf validar contra o ADM/Emusys.

---

## 3. Arquivos Entregues

| Arquivo | Propósito |
|---------|-----------|
| `MIGRACAO_REGLA_KPI_V2.sql` | Recria `vw_kpis_gestao_mensal` e `recalcular_dados_mensais` com regras v2 |
| `VALIDACAO_KPI_CG_MAIO2026.sql` | SQL read-only para conferir resultados esperados em CG/Maio |
| `AUDITORIA_SOL_INCONSISTENCIAS.sql` | View `vw_auditoria_inconsistencias` + 8 queries para detecção automática de sujeira |
| `RELATORIO_TECNICO_REGLAS_KPI.md` | Este documento |

---

## 4. Riscos Antes de Backfill

### Risco 1 — Snapshot base sem filtro de status na função antiga
A função antiga de `recalcular_dados_mensais` não filtrava por `status` nas contagens de ativos/pagantes. O novo código filtra explicitamente `status IN ('ativo', 'trancado')`. Se houver alunos com status fora desse conjunto mas sem `data_saida`, eles deixarão de contar.

**Mitigação:** Rodar `VALIDACAO_KPI_CG_MAIO2026.sql` em outras unidades antes do backfill.

### Risco 2 — `alunos_ativos` agora inclui banda
Antes, a função excluía `is_segundo_curso=true` de ativos. A nova regra conta pessoas distintas no snapshot, incluindo quem tem banda. Isso pode aumentar o número em unidades onde banda era excluída implicitamente.

**Mitigação:** Validar com Alf se banda deve ou não contar como ativo. (Auditoria CG confirma: deve contar.)

### Risco 3 — `novas_matriculas` exclui bolsista e banda
A regra de novas matrículas sempre excluiu bolsista/banda/coral, mas agora está explicita. Se Alf considera bolsista como "nova matrícula" em algum contexto, o número vai divergir.

**Mitigação:** Confirmar se bolsista integral entra em "novas".

### Risco 4 — Deduplicação por `nome` pode colidir
`COUNT(DISTINCT nome)` para ativos/pagantes assume que nomes são únicos por pessoa. Se houver dois alunos distintos com mesmo nome, haverá undercount. O mesmo vale para evasões deduplicadas por nome.

**Mitigação:** Considerar futura migração para `pessoa_id` ou chave composta (nome + data_nascimento + unidade).

### Risco 5 — `faturamento_estimado` e `saldo_liquido` são colunas geradas
O JSON de retorno da função calcula `faturamento_estimado = pagantes * ticket_medio` e `saldo_liquido = novas - evasoes`. Essas colunas **existem** em `dados_mensais` como colunas geradas/computadas, mas **não devem ser inseridas nem atualizadas manualmente** pelo `INSERT/UPDATE` da função — o banco as mantém automaticamente. O JSONB de retorno as inclui para consumo do frontend.

**Mitigação:** Confirmar que o `ON CONFLICT ... DO UPDATE` da função **não toca** em `faturamento_estimado` nem `saldo_liquido`. (Já verificado: não toca.)

### Risco 6 — Dados de outras unidades não auditados
Este patch foi validado apenas em Campo Grande / Maio. Barra e Recreio não foram auditados.

**Mitigação:** Rodar `VALIDACAO_KPI_CG_MAIO2026.sql` adaptado para outras unidades antes de backfill geral.

### Risco 7 — `vw_kpis_gestao_mensal` pode quebrar consumidores
A view retorna os mesmos nomes de colunas, mas valores diferentes (ex: `total_segundo_curso` agora é 27 em vez de 65). Se houver relatórios que comparam com dados antigos, haverá divergência aparente.

**Mitigação:** Comunicar mudança semântica da coluna `total_segundo_curso`.

---

## 5. Checklist de Aprovação (Alf)

- [ ] Validar SQL de validação em CG/Maio: ativos=496, pagantes=470, matriculas=561, banda=41, segundo_curso=27, novas=23, evasoes=13
- [ ] Confirmar que banda/projeto não é excluída cegamente da contagem de pessoa (ativo), mas também não transforma alguém em pagante sozinho — pagante depende de `conta_como_pagante = true`
- [ ] Confirmar que bolsista integral/parcial NÃO entra em pagantes
- [ ] Confirmar que segundo curso operacional = 27 (não 65 bruto)
- [ ] Validar em Barra (amostra de 1 mês)
- [ ] Validar em Recreio (amostra de 1 mês)
- [ ] Aprovar data de deploy do patch
- [ ] Agendar backfill (se necessário) com supervisão

---

## 6. Próximos Passos Pós-Aprovação

1. Executar `MIGRACAO_REGLA_KPI_V2.sql` em produção
2. Rodar `VALIDACAO_KPI_CG_MAIO2026.sql` em todas as unidades
3. Executar `recalcular_dados_mensais(2026, 5, 'CG-uuid')` para backfill de Maio
4. Acompanhar `vw_auditoria_inconsistencias` por 7 dias
5. Documentar no README técnico do projeto
