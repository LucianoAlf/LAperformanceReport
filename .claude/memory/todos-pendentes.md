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

> ⚠️ **Revisado em 2026-07-27 — a proposta abaixo, do jeito que está, NÃO funciona.**
> Ela constrói `{ nome → emusys_id }`, e nome não identifica professor: a mesma pessoa
> usa nomes diferentes por unidade (Erick Osmy / Erick Cosme da Silva — mesmo CPF).
> Usar **telefone** (ou CPF via `/pessoas/buscar`) como chave. Ver o TODO
> "Identidade de professor resolvida por nome" abaixo.

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

## 🚨 [ALTA] Identidade de professor resolvida por NOME — quebra o sync e duplica cadastro

**Identificado em:** 2026-07-27 (investigação a partir da EDA de temperatura de leads, LA-labs)

> ### ✅ ATUALIZAÇÃO 2026-07-27 (~22h30) — passivo limpo, torneira ainda aberta
>
> **FEITO (passos 4 e 5 da ordem sugerida abaixo):** os 3 duplicados foram unificados e o
> cadáver 54 foi esvaziado. Matheus 46←57, Marcos 56←58, Lucas 48←51, Erick 52←54.
> Placar: telefone duplicado entre ativos **3→0**, vínculo sem `emusys_id` **1→0**,
> monitor de vínculo **4→2** (sobram Felipe 5 e Jeyson 12, inativos históricos sem torneira).
> Detalhe completo, receita da transação e as 3 travas de imutabilidade do banco em
> `daily-notes/2026-07-27.md`.
>
> **Consequência:** o `.limit(1)` do `resolverProfessor` (observador) virou determinístico
> sozinho — não há mais telefone repetido entre ativos.
>
> **⚠️ CORREÇÃO ao texto abaixo:** o item "`sync-professores-emusys` auto-cura `emusys_id`
> por nome" está **DESATUALIZADO**. Código lido em 27/07: casa só por `emusys_id` dentro da
> unidade; sem match, abre divergência com `regra:'nome_apenas_sugestao_requer_validacao_humana'`
> e **não cria vínculo**. O passo 2 da ordem sugerida provavelmente já está resolvido.
>
> **AINDA ABERTO (o que importa agora):** passo 1 — o n8n `j41tPbyjGXUQUxrN` continua
> resolvendo por `professores.nome` sem filtrar `ativo`. É o único que ainda grava (o
> observador está em `DRY_RUN=true`). Fechar via `DRY_RUN=false` + desligar os branches
> do n8n no mesmo instante. Passo 3 (backoff/alerta no `sync-presenca-emusys`) também aberto.

**Descrição:** Vários pontos do sistema resolvem professor comparando **nome**. Nome não
identifica professor, por dois motivos que ocorrem ao mesmo tempo:

1. **A mesma pessoa tem nomes diferentes por unidade.** Cada unidade é um tenant separado
   no Emusys, com cadastro e id próprios. Confirmado por **CPF** (`GET /pessoas/buscar`,
   que expõe o CPF por unidade):

   | Pessoa | CPF | Cadastros no Emusys |
   |---|---|---|
   | Erick | `16559246728` | Barra `1160` "Erick Cosme da Silva" · Recreio `2109` "Erick Osmy" |
   | Lucas | `15203351724` | Barra `1122` "Lucas Amorim Souza" · CG `3223` "Lucas Souza dos Santos" |
   | Marcos | `18460156770` | CG `3500` "Marcos Delfino Serafim" · Recreio `2155` "Marcos Serafim" |
   | Matheus | `17713026746` | Barra `1115` "Matheus Reis" · Recreio `2069` "Matheus Reis da Silva Gaspar" |

2. **Nomes quase idênticos podem ser registros distintos.** `professor_id` 54
   ("Erick Osmy (mesclado 54)") é o resto de um merge, **inativo e sem mapeamento**;
   o canônico é o 52. Um match por nome/prefixo cai no 54.

**Impacto medido:**
- `sync-presenca-emusys` não acha as aulas: **6.188 eventos** `sync_experimental_presenca /
  nao_encontrada` (3.534 só do professor 54), ~31 retries por lead durante até 15 dias,
  **sem backoff** — o job nunca desiste nem alerta.
- **147 experimentais sem desfecho** (115 já passaram da data): nem `realizada` nem `faltou`.
  É parte do gap LA Report 16,4% × Emusys 37,2% na conversão pós-experimental.
- **3 pessoas duplicadas** no `professores`: Lucas (48/51), Marcos (56/58), Matheus (46/57).
  Cada uma com a carteira e as aulas partidas entre dois registros.
- O workflow n8n `j41tPbyjGXUQUxrN` continua criando experimentais no professor 54
  (4 só na semana de 27/07) — a limpeza sem corrigir a origem não se sustenta.

**Onde está o bug (todos resolvem por nome):**
- n8n `j41tPbyjGXUQUxrN` (webhook de aula experimental) — compara com `professores.nome`
  e **não filtra `ativo`**.
- `sync-professores-emusys` (cron dom 04:00) — "auto-cura `emusys_id` por nome"
  (`origem='emusys_professores_api_nome_exato'`).
- Proposta C do TODO de `aluno_presenca` acima — mesma armadilha, anotada.

### Como resolver (descoberto e validado em 2026-07-27)

**Chave de identidade correta: TELEFONE** (ou CPF). Já dá para usar hoje, sem schema novo:
- `professores.telefone_whatsapp` está preenchido em **47 dos 48 ativos**, já normalizado
  (`5521964915386`).
- O webhook de experimental traz **`aula.telefone_professor`** e **`aula.email_professor`**
  no payload — o n8n descarta, o observador guarda.
- `GET /pessoas/buscar?email=` devolve **CPF** por unidade → é o desempate definitivo.
- ⚠️ `GET /professores` devolve **só `id` e `nome`** — não serve para identidade. Para
  colher telefone/e-mail em lote, varrer `GET /aulas` de uma semana (o objeto
  `professores[]` traz `telefone` e `email`).

**Regra de ouro:** resolver sempre por `(telefone, ativo=true)`; como fallback, o nome
**por unidade** (`professores_unidades.emusys_nome`), nunca `professores.nome` solto.
Os 79 pares `(professor, unidade)` estão limpos — 1 `emusys_id` por unidade, zero duplicata.
O modelo de dados já está certo; o que erra é quem consulta.

**Ordem sugerida:**
1. Corrigir o lookup no n8n `j41tPbyjGXUQUxrN` → fecha a torneira (sem isso o resto volta).
2. Corrigir `sync-professores-emusys` (chave por telefone; hoje casa por nome exato).
3. Adicionar **backoff/alerta** no `sync-presenca-emusys` — falha permanente não pode
   virar 31 retries silenciosos.
4. Reatribuir o professor 54 → 52 (28 em `lead_experimentais`, 14 em
   `leads.professor_experimental_id`, 3 em `experimentais_professor_mensal`) e desativar o 54.
   Ele **não tem** aula, presença nem aluno vinculado — é reatribuição de baixo risco.
5. Unificar Lucas/Marcos/Matheus (esses **têm** aula, presença e aluno — merecem transação
   e validação). Mover também a linha de `professores_unidades` do duplicado para o canônico,
   preservando **um `emusys_id` por unidade**.

**Monitor (deveria retornar zero; hoje retorna 4):**
```sql
SELECT p.id, p.nome, u.nome AS unidade
FROM (SELECT DISTINCT professor_experimental_id pid, unidade_id
      FROM lead_experimentais WHERE professor_experimental_id IS NOT NULL) a
JOIN professores p ON p.id = a.pid
JOIN unidades u ON u.id = a.unidade_id
WHERE NOT EXISTS (SELECT 1 FROM professores_unidades pu
                  WHERE pu.professor_id = a.pid AND pu.unidade_id = a.unidade_id
                    AND pu.emusys_id IS NOT NULL);
```
Pega tanto o órfão total (sem mapeamento nenhum) quanto a **cobertura parcial** — professor
mapeado numa unidade dando aula em outra (caso do Matheus Reis).

**Efeito colateral em análise:** o health score de professor do LA-labs
(`professor-360/notebooks/04_health_score_professor`) está contaminado — Lucas ocupa
**1º e 2º lugar** do ranking como se fossem duas pessoas, e carteira partida ao meio infla
a nota (denominador menor → menos evasão relativa). Recalcular após a unificação.

**Arquivos afetados:**
- n8n `j41tPbyjGXUQUxrN` (não versionado — não está no repo `Fluxos_n8n`)
- `supabase/functions/sync-professores-emusys/index.ts`
- `supabase/functions/sync-presenca-emusys/index.ts`
- `supabase/functions/debug-webhook-emusys-observador/index.ts` (v15 já resolve por telefone)

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

## ✅ [CONCLUÍDO 2026-06-17] Sucesso do Aluno: mensagem de boas-vindas automática na matrícula

**Implementado:** edge `enviar-boas-vindas-matricula` (v10, `MODO_TESTE=false`) disparada por `processar-matricula-emusys` v21 (deploy v26) no fim de `handleMatriculaNova` via `fetch`, só `matricula_nova`. Idempotência por `ext:<emusys_matricula_id>` em `boas_vindas_enviadas`. Registra na Caixa (admin_conversas/admin_mensagens) + notifica Fabi. Detalhes em `regras-negocio.md` / `integracao-infra.md`. Histórico do pedido abaixo.

**Pedido em:** 2026-06-15

**Descrição:** Ao chegar um aluno **novo** (webhook de matrículas), disparar automaticamente uma mensagem de **boas-vindas via WhatsApp pela caixa do Sucesso do Aluno** (departamento `sucesso_aluno`).

**Esboço de implementação:**
- **Gatilho:** webhook de matrícula — `handleMatricula` da edge `processar-matricula-emusys` (apenas matrícula **nova**, NÃO renovação/trancamento) ou o workflow n8n WF_Matricula.
- **Envio:** reusar `enviar-mensagem-admin` com `funcao=administrativo` + `departamento=sucesso_aluno` (o `getWhatsAppCredentials` resolve a caixa certa). Cria/usa conversa em `admin_conversas` (departamento `sucesso_aluno`).
- **Idempotência:** enviar só 1x por aluno (checar/flag). Definir o **template** da mensagem.
- **Guard:** aluno sem telefone (ver seção "Telefones ausentes em alunos antigos") → não enviar.

---

## 💡 [FEATURE] Caixa de Entrada Fase 2: liga/desliga do robô (Sol) por caixa

**Pedido em:** 2026-06-15 (adiado de propósito)

**Descrição:** Botão no frontend para ligar/desligar o agente **Sol** por caixa, coordenado com o agente da VPS (skill `la-agents`). Cada caixa (administrativo/sucesso_aluno) controla se a IA responde ou só humano.

---

## ⚠️ [BAIXA] Marco "15ª aula" (aba Marcos) assume ritmo semanal

**Identificado em:** 2026-06-15

**Descrição:** A aba **Marcos** do Sucesso do Aluno usa `nr_da_aula = N` (edge `marcos-jornada`) como proxy de "~N/4 meses de escola", só para calouros (`numero_renovacoes=0`). Para aluno de ritmo irregular (muitas faltas/reposições) o nº não bate com o tempo real (ex: matriculado há tempo mas só na 15ª aula). Raro; refinar (cruzar com tempo de casa) se incomodar.

---

## ⚠️ [BAIXA] `marcos-jornada` on-demand pode ficar lento

**Identificado em:** 2026-06-15

**Descrição:** A edge `marcos-jornada` busca aulas futuras na API Emusys **a cada abertura** da aba (on-demand). Para `unidade='todos'` são ~3 unidades × janela paginada. Se ficar lento, migrar para **cron diário + tabela espelho** da agenda futura. Ver `integracao-infra.md`.

---

## Resolvidos (histórico)

- **2026-05-02 — Edge functions Gemini com placeholder "deploy":** 10 funções redeployadas com código correto. Adicionado retry com backoff exponencial para erros 503/429.
- **2026-05-01 — Fix telefone responsável em `processar-matricula-emusys` v10:** fallback `telefone_aluno || telefone_responsavel` aplicado em INSERT e UPDATE.
- **2026-05-01 — RPC `get_kpis_professor_periodo` com fallback ILIKE em `motivos_saida`:** evasões com `motivo_saida_id` NULL agora não contam no score (regra alterada de "NULL conta" para "NULL não conta").
