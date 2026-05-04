# TODOs Pendentes — Problemas Conhecidos sem Fix Aplicado

Lista de problemas identificados em auditoria mas que **não foram corrigidos ainda**. Atualizar conforme problemas são resolvidos (mover para a seção "Resolvidos" ou remover).

---

## 🚨 [ALTA] aluno_presenca: presenças tipo `turma` sem `professor_id`

**Identificado em:** 2026-05-04 (auditoria fiscal-dados)

**Descrição:** Em uma janela de 7 dias:

| Tipo de aula | Total presenças | Com `professor_id` | % OK |
|--------------|-----------------|--------------------|------|
| `individual` | 1.017 | 1.004 | **98.7%** ✅ |
| `turma` | 992 | 0 | **0%** ❌ |

Aulas tipo `individual` funcionam quase 100% — só ~13 ficam NULL (provavelmente os 3 professores ausentes do nosso banco: `Erick Osmy`, `Fabricio Costa de Oliveira`, `Léo Cabral de Castro`).

Aulas tipo `turma` ficam **100% NULL** porque o Emusys retorna `professores: []` no payload (ver `pendencias-emusys.md`). **Não são duplicatas das individuais** — são o registro do **encontro coletivo** (a individual representa o contrato de cada aluno).

**Impacto:** relatórios que misturam os 2 tipos sub-representam ou distorcem `media_presenca` por professor. Solução parcial **imediata sem código novo**: filtrar `tipo = 'individual'` na RPC/views que calculam métricas por professor.

**Pergunta operacional pendente:** o time marca presença na visão de turma ou individual no Emusys? Define qual é a "fonte da verdade" final.

**Soluções possíveis (escolher uma ou combinar):**

### A. Quick win sem código novo
Ajustar RPC/views que calculam `media_presenca` por professor para filtrar `tipo = 'individual'`. Resolve 98.7% dos casos imediatamente, sem deploy.

### B. Derivar professor das aulas individuais para popular as turmas
Para cada aula `tipo = turma`, buscar a aula `tipo = individual` correspondente (mesma `turma_nome + data + horário`) e copiar `professor_id` para a presença da turma. Pode ser feito como SQL job ou no próprio sync.

### C. Resolver os 13 NULL nas individuais (matching robusto)
Modificar `sync-presenca-emusys` (v22) para chamar `GET /v1/professores/` no início e construir map `{ nome → emusys_id }` por unidade. Cruzar com `professores_unidades` por `(emusys_id, unidade_id)`. Cobre os 3 professores ausentes (Erick, Fabricio, Léo) via auto-cadastro + popula 13 `emusys_id` faltantes em `professores_unidades` (CG: 8, REC: 3, BARRA: 2). Detalhes em `pendencias-emusys.md`.

**Arquivos potencialmente afetados:**
- `supabase/functions/sync-presenca-emusys/index.ts` (helper `matchProfessor`)
- RPC `get_kpis_professor_periodo` (se for filtrar por tipo)
- `.claude/memory/emusys-api.md` (documentar `GET /v1/professores/`)

**Risco:** baixo (operação read-only adicional + fallback para matching atual se a chamada falhar).

---

## ⚠️ [MÉDIA] Telefones ausentes em alunos antigos

**Identificado em:** 2026-05-01

**Descrição:** ~830 alunos ativos sem telefone no banco (CG: 419/546 = 77% sem; Recreio: 334/411 = 81% sem; Barra: 28/250 = 11% sem). Causa: edge function `processar-matricula-emusys` antes da v10 só persistia `telefone_aluno`, ignorando `telefone_responsavel`.

**Status:** **Fix aplicado para novos** (v10 deployada 01/05) — `INSERT` e `UPDATE` agora fazem fallback `telefone_aluno || telefone_responsavel`.

**Pendente:** decisão sobre **backfill** dos históricos. Self-healing natural via webhooks de renovação acontece em 6-12 meses. Backfill via API Emusys resolve em horas mas exige rotina dedicada.

**Decisão atual:** sem backfill — aceitar self-healing gradual.

---

## ⚠️ [MÉDIA] Recreio: razão ativos/inativos anormal (16x vs 4-7x normal)

**Identificado em:** 2026-05-01

**Descrição:** Recreio tem 411 ativos e apenas 25 inativos — razão 16.4x, muito acima de Barra (3.9x) e CG (7.6x). Indica que **alunos que saíram não estão sendo finalizados no Emusys**. Em 14 dias só 2 eventos `matricula_finalizacao` foram disparados, vs ~5-15% de churn esperado.

**Solução proposta:** treinamento operacional para o time de Recreio finalizar matrículas no Emusys quando aluno sai. Não é problema de código — é problema de processo.

---

## ⚠️ [MÉDIA] 9 duplicatas em Recreio criadas em 31/03/2026

**Identificado em:** 2026-05-01

**Descrição:** 9 pares de alunos duplicados em Recreio, sendo 5 criados em 31/03 entre 18:41 e 19:37 (lote consecutivo). Padrão indica script manual ou bulk import direto no banco, **bypassando a edge function** (telefones em formato cru "(21) 99999-9999" em vez do normalizado "55..."). Atualmente os 9 registros excedentes inflam contagem de alunos ativos.

**Solução proposta:**
1. Identificar **quem** rodou o script de 31/03 (auditoria via Supabase Dashboard)
2. Limpar os 9 duplicatas (manter o registro mais antigo, deletar o duplicado)
3. Garantir que scripts futuros usem `processar-matricula-emusys` ou implementem dedup

---

## ⚠️ [BAIXA] Taxa de conversão >100% em professores

**Identificado em:** 2026-04-30

**Descrição:** A RPC `get_kpis_professor_periodo` calcula `taxa_conversao = matriculas_pos_exp / experimentais * 100` com critérios assimétricos:
- Denominador exige `experimental_realizada = true`
- Numerador aceita também `converteu = true AND NOT faltou` (mesmo sem experimental_realizada)

Resultado: leads como o "Carlos Yan" (ex: matriculou 15/04, experimental marcada para 16/04 mas `experimental_realizada=false`) entram só no numerador, gerando taxas como 200%.

**Status:** documentado em `regras-negocio.md` e no modal `ModalDetalhesConversao` (categoria "matriculou_sem_realizar" destacada em âmbar). **Não é bug** — é uma definição de fórmula com dados em estado ambíguo no Emusys.

**Decisão pendente:** corrigir é **operacional** (treinar para sempre marcar `experimental_realizada=true` antes de matricular) ou **de fórmula** (RPC alinhar critérios — `matriculas_pos_exp` exigir também `experimental_realizada=true`, casos ambíguos caem em `matriculas_diretas`).

---

## ⚠️ [BAIXA] 3 edge functions órfãs no Supabase

**Identificado em:** 2026-05-02

**Descrição:** As edge functions `gemini-relatorio-individual`, `gemini-relatorio-professor` e `gemini-relatorio-turma` existem deployadas (versão 1, status ACTIVE) com conteúdo placeholder `"deploy"`, sem código real, sem referência no frontend, sem registro em `integracao-infra.md` e sem histórico no git. São artefatos do deploy massivo de 24/04 que sobrescreveu 13 funções com placeholder.

**Solução proposta:** deletar via Supabase Dashboard (não há tool MCP de delete). Risco zero — não são chamadas em lugar nenhum.

---

## ⚠️ [BAIXA] 2 cron jobs sem documentação

**Identificado em:** 2026-05-04

**Descrição:** Os cron jobs `cleanup-audit-log` (executa 03h BRT diariamente) e `cleanup-bi-conversations` (também 03h BRT) estão operacionais mas não constam em `integracao-infra.md`.

**Solução proposta:** adicionar à seção "pg_cron Jobs" do `integracao-infra.md` para que o subagent `fiscal-dados` não reporte como gap em toda auditoria.

---

## Resolvidos (histórico)

- **2026-05-02 — Edge functions Gemini com placeholder "deploy":** 10 funções redeployadas com código correto. Adicionado retry com backoff exponencial para erros 503/429.
- **2026-05-01 — Fix telefone responsável em `processar-matricula-emusys` v10:** fallback `telefone_aluno || telefone_responsavel` aplicado em INSERT e UPDATE.
- **2026-05-01 — RPC `get_kpis_professor_periodo` com fallback ILIKE em `motivos_saida`:** evasões com `motivo_saida_id` NULL agora não contam no score (regra alterada de "NULL conta" para "NULL não conta").
