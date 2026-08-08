---
name: regras-negocio-la
description: "Regras de negócio canônicas do LA Music Performance Report. Use OBRIGATORIAMENTE ao: escrever queries SQL/RPC, calcular KPIs, gerar relatórios, criar features de BI, ou responder perguntas sobre métricas. Evita bugs de duplicação, evasão, pagantes e experimentais."
source: projeto-la-music
risk: low
---

# Regras de Negócio — LA Music Performance Report

> **Referência obrigatória** antes de gerar qualquer query, cálculo, relatório ou feature que envolva KPIs do sistema.
> Arquivo fonte completo: `.claude/memory/regras-negocio-canonicas.md`
>
> **Princípio de Classificação:**
> - ✅ **VALIDADA PELO ALF** — confirmada verbalmente, fonte da verdade
> - 📋 **INFERIDA DO CÓDIGO ATUAL** — implementada hoje, não explicitamente validada
> - ❓ **PENDENTE DE VALIDAÇÃO** — divergência detectada, aguardando Alf
> - 🚫 **LEGADO / NÃO USAR** — documento antigo divergente, código divergente = possível bug
>
> **REGRA DE OURO:** Documento antigo divergente = legado. Código divergente = possível bug. Regra validada pelo Alf = canônica.

---

## Quando Usar Esta Skill

- Escrevendo queries SQL, views ou RPCs que calculam KPIs
- Criando componentes de dashboard, cards ou gráficos
- Respondendo perguntas do usuário sobre "quantos alunos", "qual a taxa", "o que é evasão"
- Gerando relatórios WhatsApp, Gemini insights ou planilhas
- Validando se um cálculo existente está correto

---

## Regras de Ouro (Anti-Erro)

### 1. Pessoa vs Matrícula
- 📋 **`alunos` = matrículas (registros)**, não pessoas.
- 📋 1 pessoa = 1 principal (`is_segundo_curso=false`) + N adicionais (`is_segundo_curso=true`).
- 📋 **Identidade operacional da pessoa = `LOWER(TRIM(nome)) + unidade_id`**. Só `nome` pode colidir (dois "João Silva" na mesma unidade).
- 📋 **Base de "alunos ativos" = PESSOAS** → `COUNT(DISTINCT nome)` excluindo `is_segundo_curso=true`.
- 🚫 **NUNCA usar `COUNT(*)` para ativos/pagantes** — conta linhas, duplica pessoas com 2+ cursos.
- 📋 **Base de "matrículas ativas" = REGISTROS** → `COUNT(*)` inclui tudo (1º, 2º, banda).

### 2. Quem NUNCA entra em "Pagantes"
- 📋 `bolsista_integral`
- ✅ `bolsista_parcial` — confirmado pelo Alf e no banco (`conta_como_pagante = false`): NÃO conta como pagante (P5)
- 📋 `nao_pagante`
- 📋 `is_segundo_curso` (**só para não duplicar a pessoa no denominador** — ver aviso abaixo)
- 📋 `cursos.is_projeto_banda = true`
- 📋 Canto coral (atividade extra, igual banda). ⚠️ `cursos.is_coral` **nunca foi criada** — hoje o filtro é por nome, com 4 critérios divergentes (ver `docs/REGRAS-DE-NEGOCIO.md` §14/P1)
- 📋 Trancado **não** conta como ativo nem como pagante
- ⚠️ **NÃO confundir:** o segundo curso sai do **denominador** (para não duplicar a pessoa), mas **ENTRA no numerador** do MRR e **eleva o ticket médio** (`tipos_matricula.SEGUNDO_CURSO.entra_ticket_medio = true`).

### 3. Evasão = Cancelamento + Não Renovação
- 📋 `movimentacoes_admin.tipo IN ('evasao', 'nao_renovacao')`
- ✅ **Aviso prévio NÃO é evasão** — cobre o mês vigente do aviso + o seguinte (2 meses). Usar a competência da **saída real**.
- 📋 **Trancamento NÃO é evasão.**
- ✅ **Transferência interna entre unidades NÃO é evasão nem churn global.**
- 📋 **Deduplicação:** banco usa `DISTINCT ON (nome, unidade, ano, mes)`; frontend NÃO deduplica.
- ✅ Movimentações de **atividade extra** (banda, canto coral, power kids, minha banda, garageband, percussion kids) ficam fora da retenção — função canônica `is_atividade_extra_curso`.
- 🚫 **As tabelas `evasoes`, `renovacoes` e `evasoes_v2` não são fonte.** `evasoes` e `renovacoes` **nem existem mais** no banco (2026-08-08). Usar `movimentacoes_admin`.

### 4. Aulas Experimentais Contam Quando São FEITAS
- 📋 `experimentais_realizadas` = `status IN ('experimental_realizada', 'matriculado')`.
- 📋 `experimentais_agendadas` = todas as experimentais do período **não canceladas**.
- 📋 **NUNCA contar pela data de agendamento.**
- ✅ **Resolvido em 2026-08-08:** o canônico `get_kpis_comercial_canonicos_v2` conta pela **`data_experimental`**. A pendência antiga valia para `vw_kpis_gestao_mensal`, que não é o caminho canônico.
- 📋 **Cancelamento sempre prevalece.** Aula futura vem do Emusys com `presenca='ausente'` por padrão — antes do início, a situação é `agendada`, não falta.

### 5. Kids / School (Classificação)
- 📋 **Base = mesma de "Total Alunos Ativos"** (pessoas, exclui 2º curso).
- 📋 Qualquer pessoa com matrícula ativa (regular, 2º, banda) entra na classificação.
- ✅ `idade_atual <= 11` → **LAMK (Kids)** — confirmado pelo Alf (P10).
- ✅ `idade_atual >= 12` → **EMLA (School)** — confirmado pelo Alf (P10).
- ❓ **Banco (carteira professor) usa `classificacao` (LAMK/EMLA)** em vez de `idade_atual` — pode estar desatualizada.

### 6. Ticket Médio Passaporte
- 📋 `SUM(valor_passaporte) / COUNT(*) WHERE valor_passaporte > 0`
- 📋 Matrículas com `valor_passaporte = 0` (re-matrícula, bolsista) **NÃO entram**.
- 📋 O agrupamento por pessoa acontece **antes** da divisão: 2º curso soma no numerador mas não cria outro denominador.

### 6b. Ticket Médio (mensalidade) — não confundir com o do passaporte
- ✅ `soma das parcelas de TODOS os cursos dos alunos pagantes / alunos pagantes únicos`
- ✅ Segundo curso **soma** no numerador e a pessoa conta **1×** → o 2º curso **eleva** o ticket.
- 🚫 Nunca `AVG(valor_parcela)` por linha.
- ⚠️ Refinamento validado (Alf 07/07/2026) e **não implementado**: o numerador deve vir da **fatura da competência**, não de `alunos.valor_parcela`.

### 7. Sync de Presença Ignora Status
- 📋 O sync do Emusys casa aula→aluno **só por nome+curso**, não olha `status`.
- 📋 Soft-delete (`status='inativo'`) **não para** o sync.
- 📋 Para parar: mover para `alunos_arquivados`.
- 🚫 **⚠️ AÇÃO DESTRUTIVA: inclui `DELETE FROM alunos`. NÃO executar sem autorização do Alf.**

### 8. Tempo de Permanência (LTV) — "Saiu de Tudo"
- 📋 Só conta quando aluno encerra **TODAS** as matrículas (incluindo 2º curso).
- 📋 Grava 1 linha em `alunos_historico` com `data_entrada=MIN(data_matricula)`, `data_saida=hoje`.
- 📋 Exclui passagens < 4 meses.
- 📋 **View V5 não calcula `ltv_medio`** — fallback legado incompleto.

---

## Fórmulas Canônicas (por Status)

### ✅ VALIDADAS PELO ALF
| Métrica | Fórmula |
|---------|---------|
| Total Alunos Ativos | Pessoas com ≥1 matrícula **acadêmica** e `entra_base_ativa=true`. **Trancado NÃO conta**; **só banda ou só coral NÃO conta** |
| Matrículas Ativas | `COUNT(*)` de vínculos/registros — inclui 1º curso, 2º curso, banda, coral e bolsistas. **Base diferente de "Alunos Ativos" (pessoas), por isso é sempre maior. Não tente reconciliar as duas.** |
| Evasão | `movimentacoes_admin.tipo IN ('evasao', 'nao_renovacao')` |
| Aviso Prévio | NÃO é evasão |
| Reajuste Médio | `AVG((novo - anterior) / anterior * 100) WHERE novo > anterior AND anterior > 0` |
| Taxa Show-Up | `experimentais_realizadas / experimentais_agendadas * 100` |
| Kids/School | `idade_atual <= 11` = LAMK; `>= 12` = EMLA |
| ✅ LTV | `ticket_medio * tempo_permanencia_meses` — confirmado pelo Alf (P9) |
| ✅ Churn | `evasoes / alunos_pagantes * 100` — confirmado pelo Alf (P1) |
| ✅ Inadimplência | `% cabeças = qtd_inadimplentes / alunos_pagantes * 100` — confirmado pelo Alf (P2) |
| ✅ Ticket Médio | Por pessoa (`MRR / COUNT(DISTINCT pagantes)`) — confirmado pelo Alf (P3) |
| ✅ Passaporte | NÃO entra no MRR — é receita à parte das parcelas/mensalidades (P6) |
| ✅ Conversão Professor | SOMENTE sobre experimentais realizadas por aquele professor (P7) |

### 📋 INFERIDAS DO CÓDIGO ATUAL
| Métrica | Fórmula | Nota |
|---------|---------|------|
| Taxa Renovação | ✅ `renovacoes / (renovacoes + nao_renovacoes) * 100` | **Resolvida em 2026-08-08:** aviso prévio NÃO entra no denominador |
| MRR | `SUM(valor_parcela) WHERE conta_como_pagante AND status <> 'sem_parcela'` | View 20260531 |

### ❓ PENDENTES DE VALIDAÇÃO
| Métrica | Divergência | Onde |
|---------|-------------|------|
| Taxa Conversão Geral | `novas / total_leads` (código) vs `novas / leads_com_exp` (regra #16) | Funil |

### 🚫 LEGADO / NÃO USAR
| Métrica | Fórmula Legada | Por que não usar |
|---------|----------------|------------------|
| Churn | `evasoes / total_alunos_ativos * 100` | Doc `KPIs_LA_MUSIC_PERFORMANCE_REPORT.md` desatualizado |
| Churn | `evasoes / (alunos_inicio + novas) * 100` | ❌ Descartada em 2026-08-08. A canônica é `evasoes / alunos_pagantes * 100` |
| Renovacao | `renovacoes / total_contratos` | Contrato antigo, não usa aviso_previo |
| Evasões | `FROM evasoes_v2` | Tabela desatualizada, usar `movimentacoes_admin` |
| Ticket | `AVG(valor_parcela) FILTER (WHERE tipo_aluno NOT IN (...))` | View antiga (fase3), não usa `tipos_matricula` |

---

## Decisões de Design que Confundem

| Questão | Resposta | Status |
|---------|----------|--------|
| `is_segundo_curso` inclui banda? | **Não.** Banda é `is_projeto_banda=true`. | ✅ |
| Trancado conta como ativo? | **Não** — nem em "Total Alunos Ativos", nem na carteira do professor. Corrigido em 2026-08-08 (regra Emusys v1.3.1). Aparece só em "Trancados agora". | ✅ |
| Quem só faz banda/coral é aluno ativo? | **Não.** São atividades extras — exigem curso regular. Contam em `matriculas_banda`/`matriculas_coral`. | ✅ |
| Matrícula direta entra no funil? | **Sim**, desde 2026-05-25 (fonte = `alunos`, não `leads`). | ✅ |
| Lead arquivado conta no funil? | **Não**. `arquivado=true` é excluído. | ✅ |
| Re-matrícula = nova matrícula? | **Sim** (cria nova linha em `alunos` se não existia matrícula viva). | ✅ |
| Segundo curso = pagante? | **Sim** (ele paga), mas **não conta** no card "Pagantes" (evita duplicar pessoa). | ✅ |
| Banda = pagante? | **Não** (excluído de pagantes, ticket, LTV, churn). | ✅ |
| `COUNT(*)` pode ser usado para ativos? | **Não** — duplica pessoas com 2+ cursos. Usar `COUNT(DISTINCT nome)`. | 🚫 (view 20260531 quebra isso) |

---

## Alertas Críticos

- ❓ **P8/P11 — Snapshot `dados_mensais`:** Decisão de negócio: histórico mensal deve ser preservado; recalcular mês passado não pode sobrescrever sem audit trail. Próximo passo: SELECT-only para confirmar estrutura, depois migration de congelamento + audit trail. NÃO executar migration sem aprovação do Alf.

## Arquivos de Referência

- `.claude/memory/regras-negocio-canonicas.md` — Lista completa com status por regra
- `.claude/memory/auditoria-regras-negocio-2026-06-04.md` — Auditoria técnica com divergências
- `.claude/memory/metricas.md` — Fórmulas detalhadas com onde são calculadas
- `.claude/memory/dominio-comercial.md` — Pipeline, leads, funil
- `.claude/memory/dominio-alunos.md` — Alunos, turmas, presença
- `.claude/memory/dominio-operacional.md` — Professores, salas, projetos
- `.claude/memory/integracao-infra.md` — Edge functions, webhooks, syncs
- `docs/KPIs_LA_MUSIC_PERFORMANCE_REPORT.md` — **LEGADO** — pode estar desatualizado
- `docs/METAS_RELACOES_MATEMATICAS.md` — **LEGADO** — usar com cautela

---

## Checklist Antes de Entregar Código/KPI

- [ ] Se conta "alunos", usei `COUNT(DISTINCT nome)` (pessoa) ou `COUNT(*)` (registro) conforme apropriado?
- [ ] Se conta "pagantes", excluí bolsistas, banda, coral, 2º curso e `valor_parcela=0`?
- [ ] Se uso `COUNT(*)` para ativos/pagantes, **verifiquei se não é um bug**?
- [ ] Se conta "evasão", usei `movimentacoes_admin` (não `evasoes_v2`) e incluí `nao_renovacao`?
- [ ] Se deduplico evasões, usei `DISTINCT ON (nome, unidade, ano, mes)`?
- [ ] Se uso `dados_mensais`, verifiquei se devia usar view tempo real para mês atual?
- [ ] Se conto experimentais, usei `experimental_realizada` e não `data_agendamento`?
- [ ] Se calculo ticket médio, excluí valores 0 e confirmei base (pessoa vs matrícula)?
- [ ] Se trabalho com professor, filtrei `status='ativo'` na carteira?
- [ ] Se é health score, os 5 pesos somam 100%?
- [ ] **NÃO executei DROP VIEW, CREATE OR REPLACE VIEW, migration ou backfill sem aprovação do Alf?**

---

*Mantenha esta skill atualizada. Quando descobrir uma nova regra, edite `.claude/memory/regras-negocio-canonicas.md` primeiro, depois resuma aqui.*
