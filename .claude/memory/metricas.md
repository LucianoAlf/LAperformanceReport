# Métricas e Indicadores — LA Music

Índice canônico das fórmulas usadas em KPIs/relatórios. Quando a mesma métrica é calculada em vários lugares, todas as implementações devem bater com a fórmula aqui.

**Quando mudar a fórmula: atualizar este arquivo PRIMEIRO, depois ajustar todos os locais listados.**

---

## Carteira do Professor

**Definição:** Alunos vinculados a um professor que estão estudando hoje.

**Fórmula:**
```
COUNT(alunos)
WHERE alunos.professor_atual_id = <prof_id>
  AND alunos.status = 'ativo'
```

**Decisões:**
- Inclui `is_segundo_curso = true`? **Sim** (cada matrícula conta como 1)
- Inclui curso `is_projeto_banda = true`? **Não** (banda é projeto, não carteira regular)
- Inclui `trancado`? **Não** (decisão 2026-05-20)

**Onde é calculada:**
| Local | Filtra `status='ativo'`? |
|---|---|
| RPC `get_carteira_professores()` | ✅ |
| Modal `ModalCarteiraProfessor` (frontend) | ✅ |
| Função `get_dados_relatorio_coordenacao()` | ❌ inclui inativo/evadido/trancado |
| `TabCarteiraProfessores.tsx:196` | ❌ sem filtro |
| `ModalDetalhesProfessorPerformance.tsx` (3 queries) | ❌ inclui todos os status |
| `ModalDetalhesTurmas.tsx:82` | ⚠️ inclui ativo + trancado |
| View `vw_kpis_professor_mensal` | ❓ definição não localizada |

Background: `professor_atual_id` é mantido em alunos não-ativos (ver `regras-negocio.md` → "Vínculo Professor↔Aluno"). Filtrar por status é responsabilidade da query.

---

## Saldo Líquido Mensal (entradas − saídas)

**Definição:** Variação líquida da base de alunos no mês.

**Fórmula:**
```
saldo_mes = novas_matriculas_mes − evasoes_mes
```

**Onde é calculada:**
- Tabela `dados_mensais` (snapshot dia 1 do mês via cron `snapshot_dados_mensais`).
- Atual: `movimentacoes_admin` só registra **saídas** (evasão, renovação, trancamento, aviso prévio). **Não registra entradas.**
- Entradas vêm de `alunos.created_at` no mês corrente.

**Pontos de atenção:**
- Re-matrícula (aluno que volta) conta como nova matrícula? Conforme `processar-matricula-emusys` v11+: cria entrada nova na `alunos` com `is_segundo_curso=false` se não existia matrícula viva.
- Matrícula de segundo curso (`is_segundo_curso=true`) conta? Sim — é uma nova linha em `alunos`.
- Banda? Sim entra como criação, mas excluída de várias contagens via `cursos.is_projeto_banda`.

**TODO/Investigar:**
- Confirmar definição com admin: "matrícula nova" = pessoa nova OU matrícula nova (incluindo segundo curso)?
- Snapshot `dados_mensais` de Maio/2026 ainda não rodou (rola dia 1 de Junho).

---

## Score do Professor

**Definição:** Indicador de performance composto. Penaliza professor por evasões cujo motivo seja "responsabilidade do professor".

**Filtro de evasão que conta:**
```
motivos_saida.conta_score_professor = true
```

**Lookup:**
1. `evasoes.motivo_saida_id` (FK) — preferencial
2. Fallback ILIKE em `evasoes.motivo` (texto) contra `motivos_saida.nome`
3. **Motivo NULL sem match = NÃO conta** (regra alterada em 2026-04, antes contava por padrão)

**Onde é calculada:**
- RPC `get_kpis_professor_periodo` — fonte canônica
- Modais `ModalDetalhesEvasoes`, `ModalDetalhesRetencao` mostram coluna "Score" (Conta/Não conta)
- `MotivosScoreConfig.tsx` — gerencia toggles de `conta_score_professor`

**Exclusão:** alunos `is_projeto_banda` não entram no denominador (carteira do professor).

---

## Taxa de Conversão do Professor

**Definição:** % de experimentais que viraram matrícula, por professor.

**Fórmula atual (RPC `get_kpis_professor_periodo`):**
```
taxa_conversao = matriculas_pos_exp / experimentais * 100
```

**Assimetria conhecida que pode levar a >100%:**
- Denominador `experimentais`: exige `experimental_realizada = true`
- Numerador `matriculas_pos_exp`: aceita `experimental_realizada = true` **OU** `(converteu = true AND faltou_experimental IS NOT TRUE)`

**Caso ambíguo:** lead com `data_experimental` no período, `experimental_realizada = false`, `faltou_experimental = false`, `status IN ('matriculado','convertido')`. Ocorre quando:
- Lead matricula antes da experimental
- Operador esquece de marcar `experimental_realizada = true` no Emusys

**Exemplo real:** Willian/T1 2026 → 200% (Carlos Yan matriculou em 15/04 com experimental marcada para 16/04 sem `experimental_realizada=true`).

**Ferramenta de diagnóstico:** `ModalDetalhesConversao` na `TabPerformanceProfessores` — classifica leads em 6 categorias, destaca ambíguos (badge âmbar).

**TODO/Decisão pendente:** fix operacional (corrigir Emusys) ou de fórmula (RPC alinhar critérios).

---

## Ticket Médio (Passaporte)

**Definição:** Valor médio do passaporte das matrículas do mês.

**Fórmula:**
```
ticket_medio_passaporte = SUM(valor_passaporte) / COUNT(*)
WHERE valor_passaporte > 0
```

**Decisão importante:** matrículas com `valor_passaporte = 0` (re-matrícula, bolsista, etc.) **NÃO entram** no ticket médio. Documentado em `CLAUDE.md`.

**Onde é calculada:**
- `ComercialPage.tsx` — exibido no resumo financeiro do funil
- Relatório admin WhatsApp (`relatorio-admin-whatsapp`)
- `ModalRelatorioCoordenacao`

---

## Churn / Taxa de Evasão

**Definição:** % de evasões sobre base ativa do período.

**Fórmula:**
```
churn = evasoes_periodo / (alunos_inicio_periodo + novas_matriculas_periodo) * 100
```

**Decisões:**
- Risco por professor: crítico ≥ 15%, alto ≥ 10%, médio ≥ 5%, normal < 5%
- Meta corporativa: ver `metas.taxa_churn` por unidade
- Cursos `is_projeto_banda` são excluídos (não entram em alunos nem em evasoes)
- Tipos de aluno excluídos: `bolsista_integral`, `nao_pagante`

---

## Tempo Médio de Permanência (LTV)

**Definição:** Tempo entre primeira matrícula e saída total da pessoa (saiu de TODOS os cursos).

**Regra "saiu de tudo":** só conta quando o aluno encerrou **todas** as matrículas (`is_segundo_curso` inclusive). Se mantém uma matrícula viva → não grava em `alunos_historico`.

**Fórmula:**
```
tempo_meses = (data_saida - data_entrada) / 30.44
WHERE data_entrada = MIN(data_matricula) das matrículas da pessoa
  AND data_saida = data do disparo do webhook de finalização
```

**Filtros:**
- `tempo_permanencia_meses >= 4` (saídas curtas excluídas)
- Excluir `BOLSISTA_INT`, `BOLSISTA_PARC`, `BANDA` do `aluno_ids[]` (mas não impede gravação)
- `anulado = false`

**Onde é calculada:**
- Edge function `processar-matricula-emusys` (`handleEvasao` → `registrarPassagemFinalizada`)
- RPC `get_historico_ltv`
- `TabHistoricoLTV`

**Taxa de Retorno:** % pessoas com `qtd_passagens_pessoa >= 2`.

Detalhes completos em `regras-negocio.md` → "Histórico LTV / Tempo de Permanência".

---

## Taxa de Renovação

**Definição:** % de alunos elegíveis que renovaram o contrato no período.

**Fórmula:**
```
taxa_renovacao = renovacoes / (renovacoes + nao_renovacoes + aviso_previo) * 100
```

Tracking em `movimentacoes_admin` com `tipo IN ('renovacao', 'nao_renovacao', 'aviso_previo')`.

**Reajuste médio:** `AVG((valor_parcela - valor_parcela_anterior) / valor_parcela_anterior * 100)`.

**Metas:**
- `taxa_renovacao >= 80%`
- `reajuste_medio >= 2%`

---

## Indicadores Pendentes de Documentação

Métricas que **existem no sistema** mas a fórmula exata ainda não foi consolidada aqui (TODO):

- **Health Score do Professor** — composto que aparece em `TabPerformanceProfessores`
- **NPS Médio do Professor** — em `professores.nps_medio`, fonte e cálculo?
- **Programas Gamificados (Matriculador+ / Fideliza+)** — pesos e critérios estão em `regras-negocio.md` mas fórmula numérica não está aqui
- **Taxa show-up experimental** — usado no Matriculador+
- **Inadimplência** — usado no Fideliza+
