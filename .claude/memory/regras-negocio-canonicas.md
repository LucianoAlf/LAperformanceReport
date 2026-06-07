# Regras de Negócio Canônicas — LA Music Performance Report

> **Versão:** 2026-06-04 (auditada)  
> **Uso:** Referência obrigatória para qualquer agente IA ao gerar código, queries, análises ou respostas.  
> **Princípio de Classificação:**
> - ✅ **VALIDADA PELO ALF** — confirmada pelo Alf, fonte da verdade
> - 📋 **INFERIDA DO CÓDIGO ATUAL** — implementada no código, não explicitamente validada
> - ❓ **PENDENTE DE VALIDAÇÃO** — divergência entre fontes, precisa de confirmação do Alf
> - 🚫 **LEGADO / NÃO USAR** — documento antigo divergente, código divergente = possível bug
>
> **REGRA DE OURO:** Documento antigo divergente = legado. Código divergente = possível bug. Regra validada pelo Alf = canônica.

---

## Legenda de Status

| Símbolo | Significado |
|---------|-------------|
| ✅ | Validada pelo Alf — confirmada verbalmente por Alf |
| 📋 | Inferida do código atual — funciona hoje, mas Alf ainda não confirmou verbalmente |
| ❓ | Pendente de validação — divergência entre fontes, precisa de confirmação do Alf |
| 🚫 | Legado / não usar — contradiz código atual ou foi substituída |

---

## 1. BASE DE DADOS — ALUNOS, MATRÍCULAS E PESSOAS

### 1.1 Pessoa vs Matrícula
- 📋 Tabela `alunos` armazena **matrículas**, não pessoas.
- 📋 Identidade operacional da pessoa = `LOWER(TRIM(nome)) + unidade_id`. **Atenção:** `nome` sozinho pode colidir (dois "João Silva" em unidades diferentes são pessoas distintas; dois "João Silva" na MESMA unidade podem ser a mesma pessoa ou não — depende de checagem humana).
- 📋 1 pessoa = 1 matrícula principal (`is_segundo_curso = false`) + N matrículas adicionais (`is_segundo_curso = true`).
- 📋 Edge function v12 grava `aluno_ids[]` em `alunos_historico` para rastrear todas as matrículas de uma passagem.

### 1.2 Segundo Curso (`is_segundo_curso = true`)
- 📋 Segundo curso = outro curso DIFERENTE do principal. Cada linha tem seu próprio `curso_id`, professor, turma e presenças.
- 📋 Dois registros com o MESMO `curso_id` da mesma pessoa = DUPLICATA, não segundo curso.
- 📋 A linha principal (`is_segundo_curso = false`) é única por pessoa.
- 📋 Segundo curso NÃO inclui banda/projeto nem bolsista.

### 1.3 Banda / Projeto (`cursos.is_projeto_banda = true`)
- 📋 Curso de banda/projeto é **excluído** de: médias de turma, carteira do professor, score do professor, ticket médio, LTV, churn, contagem de pagantes.
- 📋 Conta como matrícula ativa (registro), mas separado nos cards (card "Banda" próprio).
- 🚫 **Legado temporário:** `c.nome ILIKE '%banda%'` OU `c.nome ILIKE '%power kids%'` — filtros por nome são frágeis e devem ser substituídos por `c.is_projeto_banda = true`.

### 1.4 Status do Aluno
- 📋 `ativo` — frequentando normalmente
- 📋 `trancado` — pausa temporária (NÃO é evasão)
- 📋 `aviso_previo` — vai sair, paga mês atual + próximo (NÃO é evasão)
- 📋 `evadido` — saiu confirmado
- 📋 `nao_renovou` — contrato venceu sem renovação
- 📋 **Soft-delete via status é leaky:** o sync de presença do Emusys **ignora status**. Para um aluno realmente sumir das métricas, a linha deve SAIR de `alunos`.

### 1.5 Arquivamento (Lixeira Oficial) — ⚠️ AÇÃO DESTRUTIVA
- 📋 Tabela `alunos_arquivados` = espelho de `alunos` + `arquivado_em`, `arquivado_por`, `motivo`.
- 🚫 **⚠️ NÃO executar sem autorização do Alf.** A operação inclui `DELETE FROM alunos WHERE id=X` — irreversível sem backup manual.
- 📋 **Regra técnica:** arquivar = `INSERT INTO alunos_arquivados SELECT ...` + `DELETE FROM alunos WHERE id=X`.
- 📋 **NUNCA criar tabelas `*_backup_<data>`** — usar `alunos_arquivados`.

### 1.6 Telefone do Aluno (Fallback)
- 📋 `telefone_aluno` no Emusys pode ser null (kids). Fallback: `telefone_responsavel`.
- 📋 INSERT: `telefone = p.telefoneAluno || p.telefoneResponsavel`
- 📋 UPDATE: preserva valor existente se ambos forem null no payload.

---

## 2. KPIs DE GESTÃO / RETENÇÃO

### 2.1 Total Alunos Ativos
- 📋 **Base = PESSOAS**, não matrículas.
- 📋 Inclui `ativo` + `trancado`.
- 📋 **Exclui `is_segundo_curso = true`** para não duplicar pessoa.
- 📋 Inclui banda/projeto (a pessoa está ativa, a banda é uma das matrículas dela).
- 🚫 **View 20260531 usa `COUNT(*)` em vez de `COUNT(DISTINCT nome)`** → possível bug.
- 🚫 **DashboardPage fallback usa `filter(!is_segundo_curso).length` sem DISTINCT** → possível bug.

### 2.2 Alunos Pagantes
- 📋 Inclui `ativo` + `trancado` (se pagante).
- 📋 Exclui: `bolsista_integral`, `bolsista_parcial`, `nao_pagante`, `is_segundo_curso`, banda/projeto, coral.
- 📋 No frontend (TabGestao fallback): `conta_como_pagante = true` **E** `valor_parcela > 0`.
- 🚫 **View 20260531 conta `COUNT(*)` (linhas) em vez de `COUNT(DISTINCT nome)` (pessoas)** → possível bug.

### 2.3 Matrículas Ativas
- 📋 **Base = REGISTROS** (linhas em `alunos`).
- 📋 Inclui: primeiro curso, segundo curso, banda, coral.
- 📋 Por isso, matrículas ativas **sempre ≥** alunos ativos (e frequentemente maior).

### 2.4 Kids / School (Classificação LAMK / EMLA)
- 📋 **Base = mesma do Total Alunos Ativos** (pessoas com classificação, exclui segundo curso).
- 📋 Qualquer pessoa com matrícula ativa (regular, 2º ou banda) entra na classificação.
- 📋 `is_segundo_curso` é **promovido automaticamente** para classificação (não exclui).
- ✅ **LAMK (Kids):** `idade_atual <= 11` — confirmado pelo Alf (P10).
- ✅ **EMLA (School):** `idade_atual >= 12` — confirmado pelo Alf (P10).
- ❓ **Banco (carteira professor) usa `classificacao` (LAMK/EMLA)** em vez de `idade_atual` — pode estar desatualizada. Pendente: alinhar fonte da verdade.

### 2.5 Bolsistas
- 📋 **Bolsista Integral:** 100% desconto. NÃO conta como pagante. NÃO entra no pipeline comercial.
- ✅ **Bolsista Parcial:** NÃO conta como pagante e NÃO entra no ticket médio — confirmado pelo Alf (P5).
- 📋 Cards: Bolsistas Integrais e Bolsistas Parciais são separados no dashboard.

### 2.6 Evasão
- 📋 **Evasão = cancelamentos (`evasao`) + não renovações (`nao_renovacao`)**.
- 📋 Aviso prévio NÃO é evasão.
- 📋 Trancamento NÃO é evasão.
- 📋 **Deduplicação:** banco usa `DISTINCT ON (nome, unidade, ano, mes)`, frontend NÃO deduplica.
- 🚫 **View `vw_kpis_retencao_mensal` ainda lê `evasoes_v2` (tabela desatualizada)** — não usar.

### 2.7 Taxa de Renovação
- ❓ **Fórmula no canônico:** `renovacoes / (renovacoes + nao_renovacoes + aviso_previo) * 100`
- ❓ **Fórmula na view 20260531:** `renovacoes_realizadas / (renovacoes_realizadas + nao_renovacoes)` — **aviso_previo EXCLUÍDO**
- ❓ **Fórmula no frontend:** mesma da view 20260531 (sem aviso_previo no denominador)
- 🚫 **Documento `KPIs_LA_MUSIC_PERFORMANCE_REPORT.md` (legado):** `renovacoes / total_contratos` — contrato antigo, não usar.
- **PENDENTE:** Confirmar com Alf se aviso_previo entra no denominador.

### 2.8 Reajuste Médio
- 📋 **Apenas aumentos positivos entram:** `novo > anterior` E `anterior > 0`.
- 📋 Reajuste 0% ou negativo NÃO entra no cálculo.
- 📋 Meta: `>= 2%`.
- 📋 Frontend ainda busca de `renovacoes` (tabela legada) — migrar para `movimentacoes_admin`.

### 2.9 Churn / Taxa de Evasão
- ✅ **Canônica (Alf 2026-06-04):** `evasoes / alunos_pagantes * 100`
- 📋 **Código atual (view 20260531, recalcular_dados_mensais):** já implementa `evasoes / alunos_pagantes * 100` → ALINHADO.
- 🚫 **Documento `KPIs_LA_MUSIC_PERFORMANCE_REPORT.md` (legado):** `evasoes / total_alunos_ativos * 100` — NÃO USAR.
- 🚫 **Documento `METAS_RELACOES_MATEMATICAS.md` (legado):** `evasoes / alunos_ativos * 100` (chamado de `G2/G1`) — NÃO USAR.

### 2.10 Tempo Médio de Permanência (LTV)
- 📋 **Regra "saiu de tudo":** só conta quando o aluno encerra **TODAS** as matrículas (incluindo `is_segundo_curso`).
- 📋 Se mantém uma matrícula viva → NÃO grava em `alunos_historico`.
- 📋 Tempo = `MAX(data_saida) - MIN(data_matricula)` das matrículas da passagem.
- 📋 **Filtro:** `tempo_permanencia_meses >= 4` (saídas curtas excluídas).
- 📋 Exclui `BOLSISTA_INT`, `BOLSISTA_PARC`, `BANDA` do `aluno_ids[]` (mas não impede gravação se também tinha EMLA/LAMK).
- ✅ **Fórmula LTV:** `ticket_medio * tempo_permanencia_meses` — confirmado pelo Alf (Opção A). Aceitável no frontend por enquanto.
- 📋 **View V5 não calcula `ltv_medio`** — fallback legado incompleto.

### 2.11 Taxa de Retorno
- 📋 `% de pessoas com 2+ passagens` (janela/retorno ao sistema).
- 📋 Cada passagem é entrada independente.

### 2.12 Inadimplência
- ✅ **Canônica (Alf 2026-06-04):** `qtd_inadimplentes / alunos_pagantes * 100` — percentual de **PESSOAS** (cabças), NÃO de valor.
- 📋 **View 20260531:** já implementa `qtd_inadimplentes / alunos_pagantes * 100` → ALINHADO.
- 🚫 **Validação V5:** `mrr_inadimplente / mrr_contratual * 100` (percentual de VALOR) — REJEITADA pelo Alf.
- 🚫 **Documento `KPIs_LA_MUSIC_PERFORMANCE_REPORT.md` (legado):** `(faturamento_previsto - faturamento_realizado) / faturamento_previsto * 100` — NÃO USAR.

### 2.13 MRR / ARR / Faturamento
- 📋 `MRR = alunos_pagantes * ticket_medio`
- 📋 `ARR = MRR * 12`
- 📋 `faturamento_previsto = MRR`
- 📋 `faturamento_realizado = faturamento_previsto - inadimplencia`
- ✅ `LTV = ticket_medio * tempo_permanencia` — confirmado pelo Alf (P9).
- 📋 **View 20260531 usa `status_pagamento <> 'sem_parcela'` como filtro no MRR** — alunos de passaporte (pagamento único) excluídos do MRR.
- ❓ **View V5 não calcula MRR corretamente** — usa fallback legado não validado.
- ✅ **Passaporte:** NÃO entra no MRR. É receita à parte das parcelas/mensalidades. Confirmado pelo Alf.

### 2.14 Snapshot vs Tempo Real
- 📋 **`dados_mensais`** = snapshot/fechamento do dia 1 do mês (via cron `snapshot_dados_mensais`). Pode ficar defasado.
- 📋 **Mês corrente** usa views/tempo real (`vw_kpis_gestao_mensal`, `vw_dashboard_unidade`).
- 📋 Para evolução histórica: dados_mensais. Para mês atual: views.
- ❓ **RISCO CRÍTICO — P8/P11:** Alf confirmou que `recalcular_dados_mensais` (snapshot) SOBRESCREVE dados mensais anteriores. Dados de abril foram perdidos. Investigar se é view ou tabela, e implementar preservação de histórico mensal.
- 📋 **Risco menor:** `vw_dashboard_unidade` mistura `alunos` (tempo real) com `dados_mensais` (snapshot) — pode gerar inconsistência no mês de transição.

---

## 3. KPIs COMERCIAIS / FUNIL

### 3.1 Base do Funil
- 📋 **"Novos" (primeira etapa)** = `leadsMes.length` (todos os leads do período, NÃO apenas `status = 'novo'`).
- 📋 Porcentagens: experimentais/total, matrículas/total.

### 3.2 Aulas Experimentais — Regra da Data
- 📋 **Conta quando é REALIZADA, não quando é agendada.**
- 📋 `experimentais_realizadas` = leads com `status IN ('experimental_realizada', 'matriculado')`.
- 📋 `experimentais_agendadas` = leads com `status IN ('experimental_agendada', 'experimental_realizada', 'matriculado')`.
- 📋 `faltaram = agendadas - realizadas`.
- ❓ **Banco filtra por `data_contato` (data do lead), não por `data_experimental_realizada`** — aula agendada em Maio e feita em Junho conta em Maio. Pendente: usar campo correto.

### 3.3 Taxa Show-Up
- 📋 `taxa_showup = experimentais_realizadas / experimentais_agendadas * 100`

### 3.4 Taxas de Conversão
- 📋 `taxa_conversao_lead_exp = experimentais_realizadas / total_leads * 100`
- 📋 `taxa_conversao_exp_mat = novas_matriculas / experimentais_realizadas * 100`
- ❓ `taxa_conversao_geral = novas_matriculas / total_leads * 100` — Regra #16 propõe denominador = apenas leads com experimental realizada. Pendente: confirmar.

### 3.5 Matrículas no Funil — Fonte = `alunos`
- 📋 A etapa "Matrículas" do funil e o card de Matrículas leem de **`alunos`** (`data_matricula` no período), **NÃO** de `leads` convertidos.
- 📋 Motivo: matrículas sem lead (irmãos, matrículas diretas) sumiam do funil.
- 📋 `novas_matriculas` = COUNT de `alunos` com `data_matricula` no período.
- 📋 Exclui: segundo curso, banda, coral, bolsista.

### 3.6 Ticket Médio Passaporte (Novas Matrículas)
- 📋 `SUM(valor_passaporte) / COUNT(*) WHERE valor_passaporte > 0`
- 📋 Matrículas com `valor_passaporte = 0` (re-matrícula, bolsista, etc.) **NÃO entram**.

### 3.7 Faturamento de Novas Matrículas
- 📋 `faturamento_novos = SUM(valor_parcela) de alunos com data_matricula no período`

---

## 4. PROFESSORES / PERFORMANCE

### 4.1 Carteira do Professor
- 📋 `COUNT(alunos) WHERE professor_atual_id = <prof_id> AND status = 'ativo'`
- 📋 Inclui `is_segundo_curso = true`? **Sim** (cada matrícula conta como 1).
- 📋 Inclui banda? **Não**.
- 📋 Inclui `trancado`? **Não** (decisão 2026-05-20).
- 📋 Quando aluno sai, `professor_atual_id` **NÃO é zerado** (vínculo histórico mantido).

### 4.2 Score do Professor (Evasões)
- 📋 `evasoes WHERE motivos_saida.conta_score_professor = true`
- 📋 Motivo NULL sem match em `motivos_saida` = **não conta**.
- 📋 Exclui cursos `is_projeto_banda = true`.

### 4.3 Taxa de Conversão do Professor
- ✅ **Canônica (Alf 2026-06-04):** `taxa_conversao_professor = matriculas_pos_experimental / experimentais_realizadas * 100` (P7).
- ✅ **Apenas matrículas originadas de experimental realizada por aquele professor entram no numerador.**
- 🚫 **Legado/bug:** Qualquer cálculo que permita matrícula sem experimental entrar no numerador pode gerar taxa >100% (ex: Willian T1 2026 = 200%) e deve ser corrigido.

### 4.4 Modo Trimestral
- 📋 Toggle local na aba Performance.
- 📋 Agrega 3 meses: T1=Mar/Abr/Mai, T2=Jun/Jul/Ago, T3=Set/Out/Nov.
- 📋 "Período Não Considerado" = Dez/Jan/Fev.
- 📋 RPC aceita `p_data_inicio` + `p_data_fim` opcionais (sobrescrevem `p_ano + p_mes`).

---

## 5. DECISÕES DE DESIGN / REGRAS IMPLÍCITAS

| # | Regra | Status | Detalhe |
|---|-------|--------|---------|
| R1 | Snapshot operacional vs snapshot de competência | 📋 | View usa `CURRENT_DATE`; function usa `fim_mês` da competência. Podem divergir. |
| R2 | Deduplicação de evasões | 📋 | Existe só no banco (DISTINCT ON), não no frontend. |
| R3 | Chave única de pessoa | ❓ | View 20260531 usa `nome + nasc + unidade`; view V5 usa apenas `nome`. Divergente. |
| R4 | Banda como projeto | ✅ | `is_projeto_banda` exclui de turmas/carteira/score. |
| R5 | Canto coral excluído | ✅ | Canônica: usar `cursos.is_coral = true`. 🚫 Legado: filtros por nome (`ILIKE '%canto coral%'`) são frágeis e devem ser substituídos. |
| R6 | Status "sem_parcela" | 📋 | Excluído do MRR. Passaporte não entra no MRR mensal. |
| R7 | Assimetria experimental/matricula | 🚫 | Taxa >100% é bug. Canônica: somente matrículas com experimental realizada pelo professor entram no numerador (P7). |
| R8 | Trimestre para professores | ✅ | T1/T2/T3/NC definidos. |
| R9 | Soft delete em passagens (LTV) | ✅ | `anulado = true` em `alunos_historico`. |
| R10 | Health Score | 📋 | 5 fatores ponderados, limites configuráveis. |

---

## 6. DECISÕES VALIDADAS PELO ALF

| # | Decisão | Impacto | Onde Usada |
|---|---------|---------|------------|
| ✅ P1 | **Churn:** `evasoes / alunos_pagantes * 100` | ALTO | Todos os dashboards |
| ✅ P2 | **Inadimplência:** `% cabeças = qtd_inadimplentes / alunos_pagantes * 100` | ALTO | Financeiro, metas |
| ✅ P3 | **Ticket Médio:** Por pessoa (`MRR / COUNT(DISTINCT pagantes)`) | ALTO | MRR, ARR, LTV, metas |
| ✅ P4 | **Canto Coral:** Criar flag `cursos.is_coral`; não depender de filtro por nome | MÉDIO | Novas matrículas |
| ✅ P5 | **Bolsista Parcial:** NÃO conta como pagante e NÃO entra no ticket médio | MÉDIO | Dashboard |
| ✅ P6 | **Passaporte:** NÃO entra no MRR; é receita à parte das parcelas/mensalidades | MÉDIO | MRR, faturamento |
| ✅ P7 | **Conversão Professor:** SOMENTE experimentais realizadas por aquele professor contam; matrícula sem experimental não entra | MÉDIO | Taxa conversão professor |
| ✅ P9 | **LTV:** `ticket_medio * tempo_permanencia_meses` | MÉDIO | LTV, projeções |
| ✅ P10 | **Kids/School:** `idade_atual <= 11` = LAMK; `idade_atual >= 12` = EMLA | MÉDIO | Carteira professor |

---

## 7. PENDÊNCIAS ABERTAS / BLOQUEADORES

| # | Pendência | Impacto | Onde Usada |
|---|-----------|---------|------------|
| ❓ P8/P11 | **Snapshot `dados_mensais`:** Decisão de negócio: histórico mensal deve ser preservado; recalcular mês passado não pode sobrescrever sem audit trail. Próximo passo: SELECT-only para confirmar estrutura, depois migration de congelamento + audit trail. | CRÍTICO | Automação, histórico, arquitetura de dados |
| ❓ | **Taxa de Renovação:** Confirmar se `aviso_previo` entra no denominador | MÉDIO | Retenção |
| ❓ | **Taxa Conversão Geral do funil:** `novas / total_leads` (código) vs `novas / leads_com_exp` (regra #16) | MÉDIO | Funil |

---

## Decisões do Alf sobre P8/P11 (2026-06-05)

**Status atual (2026-06-05):**
- ✅ Migration v3 aprovada como **desenho técnico**
- ✅ **SELECT-only liberado** — rodar `verificacao-p8-p11-select-only.md`
- 🚫 **Produção travada** — nenhum ALTER, CREATE, UPDATE, DELETE, INSERT, cron ou migration

**Direção aprovada:** Opção A (Congelamento) + pedaço da B (Audit Trail Mínimo)

1. **Executar SELECTs de verificação** (arquivo `verificacao-p8-p11-select-only.md`)
2. **Congelamento:** Adicionar `congelado BOOLEAN` e `congelado_em TIMESTAMPTZ` em `dados_mensais`. Bloquear recálculo se `congelado = true`.
3. **Audit Trail:** Antes de sobrescrever `dados_mensais`, copiar linha antiga para `dados_mensais_historico` com `versao`, `copiado_em`, `copiado_por`, `motivo`.
4. **Auto-congelamento:** Opcional no dia 5 do mês seguinte (aguardar confirmação do Alf).
5. **Frontend:** Desabilitar botão "Recalcular" quando snapshot congelado, com tooltip explicativo.

**Arquivos:**
- `verificacao-p8-p11-select-only.md` — SELECTs para confirmar estrutura real (✅ liberado para executar)
- `proposta-migration-p8-p11-v3.md` — Migration v3 aprovada como desenho técnico (🚫 NÃO executar ainda)

---

*Documento antigo divergente = legado. Código divergente = possível bug. Regra validada pelo Alf = canônica.*
