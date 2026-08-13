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
> ### ✅ ATUALIZAÇÃO 2026-08-03 — torneira fechada no lado da RPC + 2 bugs corrigidos
>
> **FEITO (3 fixes no repo, sem mexer no n8n):**
>
> 1. **Bug 1 — `registrar_experimental` sem filtrar unidade (corrigido):** a busca por
>    `emusys_lead_id` na linha 39 agora filtra `AND unidade_id = p_unidade_id`. Como o id é
>    namespaced por escola, uma experimental da Barra podia casar num lead do Recreio (caso
>    real: `emusys_lead_id=6820` existe em ambas as unidades — "Line" na Barra, "reginatiburcio204"
>    no Recreio). A `upsert_lead` já filtrava; só a `registrar_experimental` não. Migration
>    `20260803180000`. Testado com o caso real — casou corretamente no Recreio.
>
> 2. **Bug 3 — Guard contra `professor_id` inativo (corrigido):** a RPC agora rejeita
>    `p_professor_id` inativo e loga em `automacao_log` (`acao='professor_inativo_rejeitado'`).
>    Fecha a torneira sem editar o n8n. Testado: professor 54 rejeitado, log gravado,
>    lead não criado.
>
>    > ⚠️ **Desatualizado a partir das 23:07 do MESMO dia** (os dois trabalhos correram em
>    > paralelo): o n8n **não manda mais** 54/57 — o lookup foi corrigido (ver "PASSO 1 FEITO"
>    > adiante). O guard virou rede de segurança inerte, que é o desejado.
>    >
>    > **Interação conferida:** o guard só dispara com `p_professor_id IS NOT NULL`. O n8n
>    > corrigido manda **NULL** quando não acha ninguém → a experimental **continua sendo
>    > criada**, sem professor. Se o guard rejeitasse NULL, os dois fixes juntos descartariam
>    > experimentais em silêncio.
>    >
>    > ⚠️ **Aresta:** o guard roda **antes** do ramo de cancelamento. Um
>    > `aula_experimental_cancelada` que chegasse com professor inativo seria rejeitado e o
>    > cancelamento se perderia. Hoje não acontece (o nó `Cancelar Experimental` passa NULL no
>    > 8º parâmetro), mas é frágil por construção.
>
> 3. **Bug 2 — sync-presenca sem backoff (corrigido):** 202 logs `nao_encontrada` em
>    `leads_automacao_log` desde 27/07, 9 leads distintos (cada um logado ~22x). O sync
>    roda a cada 15 min e logava o mesmo lead órfão repetidamente. Agora consulta logs das
>    últimas 24h antes do loop e suprime duplicatas (chave `lead_id|data_experimental`).
>    Console.log inclui contagem de suprimidos. Deploy via CLI.
>
> **AINDA ABERTO (depende do Hugo/n8n):**
> - ~~Passo 1: corrigir o lookup no n8n `j41tPbyjGXUQUxrN`~~ — **FEITO às 23:07 do mesmo dia**,
>   ver adiante. ⚠️ E "filtrar `ativo=true` no mínimo" **não resolveria**: testado contra os
>   3 casos reais, os três voltam NULL.
> - ~~Conferir o `EB0LibpOJCLhKp7M` (lead) se tem o mesmo padrão~~ — **CONFERIDO: não tem.**
>   Workflow aberto, os 20 nós são webhook, filtro de evento, preparar dados, upsert de lead,
>   arquivamento e NocoDB. **Nenhum nó consulta `professores`**; trata `lead_criado`/
>   `lead_editado`/`lead_arquivado`, eventos em que o Emusys nem manda professor. Era
>   especulação, não pendência.
> - Bug independente: camada 1 do `registrar_experimental` busca `emusys_lead_id` sem
>   filtrar unidade — **CORRIGIDO** (Bug 1 acima).
> - Passo 3 (backoff/alerta no `sync-presenca-emusys`) — **CORRIGIDO** (Bug 2 acima).
> - **Jeyson Gaia Ramos (id=49, ativo, CG, sem `emusys_id`):** buraco de mapeamento novo
>   aparecido no monitor. Provavelmente o mesmo Jeyson Gaia (id=12, inativo) recriado com
>   nome diferente. Vale conferir e unificar.
>
> **Consequência:** o `.limit(1)` do `resolverProfessor` (observador) virou determinístico
> sozinho — não há mais telefone repetido entre ativos.
>
> **⚠️ CORREÇÃO ao texto abaixo:** o item "`sync-professores-emusys` auto-cura `emusys_id`
> por nome" está **DESATUALIZADO**. Código lido em 27/07: casa só por `emusys_id` dentro da
> unidade; sem match, abre divergência com `regra:'nome_apenas_sugestao_requer_validacao_humana'`
> e **não cria vínculo**. O passo 2 da ordem sugerida provavelmente já está resolvido.
>
> **✅ PASSO 1 FEITO em 03\08/2026 23:07 BRT** — o lookup do n8n `j41tPbyjGXUQUxrN` (nó
> `Buscar Professor`) passou a resolver por **telefone** (`professores.telefone_whatsapp`,
> últimos 11 dígitos) com fallback em `professores_unidades.emusys_nome` **por unidade**,
> sempre com `ativo = true`. O nó `Extrair Dados` ganhou `telefone_professor` (o campo já
> vinha no payload e era descartado). Query, provas e plano de verificação em
> `daily-notes/2026-08-03.md`. **Aguardando confirmação pelos dados dos próximos dias** —
> não houve teste executável (rodar o fluxo grava experimental real).
>
> ⚠️ **Correção ao que estava escrito aqui:** filtrar só `ativo = true` **não resolve** —
> testado, os 3 casos voltam NULL, porque o nome do webhook é o da unidade e o cadastro vivo
> tem outro nome. Sozinho, troca "professor errado" por "sem professor".
>
> ⚠️ **Caso novo não previsto:** professor **44 Juliana Azevedo** recebeu experimental em
> 29\07 (aula 01\08). Não é cadáver de merge — é professora desativada de verdade (última
> aula 18\07). Mesmo bug, causa diferente. Pendente conferir com a secretaria.
>
> **AINDA ABERTO:** passo 2 (`sync-professores-emusys` casa por nome exato) e passo 4
> (reatribuir 54→52, 57→46 e desativar — só depois de confirmar pelos dados que a torneira
> está fechada; a limpeza de 27\07 sem corrigir a origem não durou uma semana). O passo 3
> (backoff) **já foi resolvido** no mesmo dia — ver Bug 2 acima. O observador segue em
> `DRY_RUN=true`.
>
> **Pedido ao fornecedor:** varridos 128 webhooks reais de 60 dias — **nenhum** evento do
> Emusys manda id de professor, mas o MESMO payload traz `sala_id` e `lead_id`. Pedir ao
> suporte que inclua `professor_id` no webhook de experimental; com ele, o lookup vira uma
> linha e o telefone deixa de ser necessário.

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
1. ~~Corrigir o lookup no n8n `j41tPbyjGXUQUxrN`~~ → **feito 03\08/2026**, ver nota no topo.
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
- `supabase/functions/debug-webhook-emusys-observador/index.ts` (v16 resolve por telefone + `ativo`;
  desde 29/07 ele chama as MESMAS RPCs do n8n — `upsert_lead` / `registrar_experimental` — em vez de
  reimplementá-las, então só o resolvedor de professor difere. Segue em `DRY_RUN=true`.)
- ⚠️ **Bug independente descoberto em 29/07:** a camada 1 do match de `registrar_experimental` busca
  `WHERE emusys_lead_id = p_emusys_lead_id` **sem filtrar unidade**. Como o id é namespaced por escola,
  uma experimental da Barra pode casar num lead do Recreio (caso real: Vanice/7090 × "Joaquim" 8248).
  Afeta o n8n hoje, não só o observador. A `upsert_lead` já faz certo (filtra unidade).

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

## 👀 [OBSERVAR] Observador emusys — ✅ VIRADA FEITA em 12/08/2026

> ✅ **A decisão descrita abaixo foi TOMADA E EXECUTADA em 12/08/2026.** O observador escreve
> (`OBSERVADOR_ESCREVE` com os 3 eventos de lead + os 3 de experimental) e a conexão
> `Webhook1 → tem numero?2` do n8n foi removida pelo Hugo às 13:31 BRT. O n8n segue ligado **de
> propósito**, como auditor: cada execução dele prova um webhook que o Emusys entregou, cobrindo
> o ponto cego do observador (401 e edge fora do ar não deixam rastro).
>
> Aferido em 13/08 (72h): **128 `lead_criado`, 127 `ok`, 1 `perdido`** — e o perdido é o
> `ZZTESTE OBSERVADOR V11 IGNORAR`. Zero `erro_rpc`/`erro_processamento` em 7 dias; observado ×
> processado fecha 1:1. Detalhe e queries na auto-memory (`virada-lead-observador-em-curso`).
>
> ⚠️ **`lead_arquivado` ainda não passou com a escrita ligada** (o único em 7 dias foi 07/08,
> ainda em sombra) — é o que mantém este item aberto, e continua sendo o único dos três com
> UPDATE destrutivo.
>
> ✅ **A paridade de webhook cobrada no fim deste item foi verificada em 13/08 e o fix de 03/08
> funcionou**: `matricula_alterada` Barra 19/19 e CG 33/33, `matricula_finalizacao` 6/6 e 16/16,
> `matricula_renovacao` 10/10 e 17/17. O `matricula_renovacao` do Recreio que ficou "1 de 4" e
> era o mistério em aberto **fechou sozinho (38/38)** — era resíduo da config, não um segundo
> problema. Sobra `matricula_alterada` do Recreio: 36 / **31**.
>
> 🔴 **Mas apareceu um buraco NOVO no mesmo formato:** `matricula_aviso_previo_*` (v1.4.0, nasceu
> depois do acerto de 03/08) **não está marcado no cadastro `webhook_matricula` da Barra** —
> Catarina Perim e Liv Ribeiro Oliveira avisaram em 13/08 que saem em 01/10 e **não há registro
> nosso** (as duas seguem `ativo`, zero linhas em `movimentacoes_admin`).
>
> Cadeia verificada na fonte: o observador recebe (mas só loga matrícula); o **n8n não filtra
> evento** (`WF_Matricula_Funcional`/`ZzuR9slRx8UqXg9N`: `Webhook → LAPerformanceReport` direto) e
> **não teve execução nos horários dos avisos**; a edge tem o handler e é idempotente. Logo, o
> Emusys não entregou ao endpoint do n8n → **conserto é no PAINEL da Barra**, não em código.
> Recuperável: o payload está salvo. Detalhes e ação em `aviso-previo-webhook-nao-marcado-barra`.
>
> ⚠️ **NÃO detectar isso casando pelo `id` do payload.** Tentei em 13/08 e o Emusys gera um id
> por **ENTREGA**, não por evento: o mesmo `matricula_nova` chegou 81798 na edge e 81799 no
> observador, e a view acusou **242** perdidos quando o real era **2**. Criada e dropada no mesmo
> minuto. Casar por evento + `escola_id` + `matricula_id` + janela; a query de paridade manual
> (no fim deste item) já basta e não precisa de objeto novo no banco.

**Identificado em:** 2026-07-29, atualizado em 2026-07-31

**Descrição:** edge `debug-webhook-emusys-observador` roda em paralelo ao n8n, capturando os mesmos webhooks do Emusys, em modo sombra (`OBSERVADOR_DRY_RUN=true`, default — nunca escreve). Objetivo final: substituir o n8n como quem grava `lead_criado`/`lead_editado`/experimentais/`lead_arquivado`.

**Status validado (30-31/07):**
- `lead_criado`, `lead_editado`, `aula_experimental_*`: cobertura 100% com o n8n, 0 erro, canal/curso/professor mapeando igual (canal cru resolvido pela RPC, curso e match batendo linha a linha). Pronto tecnicamente para virar a chave.
- `lead_arquivado`: código adicionado em 30/07 (mesmo padrão dry-run, UPDATE via client parametrizado em vez do SQL cru com risco de injection que o n8n usa). **Nunca recebeu um webhook sequer** desde que o observador existe — sem dado real pra validar.

**Achado novo (31/07):** `lead_arquivado` não é caso isolado. Dos 17 eventos configurados no webhook Emusys ("LAReport Sync" → `debug-webhook-emusys-observador`), **6 nunca chegaram nem uma vez**: `lead_arquivado`, `matricula_finalizacao`, `matricula_renovacao`, `boleto_pix_em_atraso`, `cobranca_cheque_vence_amanha`, `cobranca_recorrente_vence_amanha`. Os outros 11 chegam normalmente (`lead_editado` 814x, `lead_criado` 410x, etc. — ver `.claude/memory/integracao-infra.md`).

### 🔴 CORREÇÃO 2026-08-03 — não é "evento que não dispara", é RECEPÇÃO INCOMPLETA

O diagnóstico acima estava errado por olhar **só o log do observador**. O teste que discrimina é
comparar com o log da edge `processar-matricula-emusys`, que recebe do Emusys por uma
**configuração de webhook diferente**. Contar por `acao='webhook_recebido'` (a edge grava 2 linhas
por evento: recebido + processado — contar o total dobra o número):

| evento | disparou (edge) | chegou no observador | |
|---|---|---|---|
| `matricula_nova` | 22 | 22 | ✅ paridade |
| `matricula_trancamento` | 4 | 4 | ✅ paridade |
| `matricula_alterada` | 18 | 4 | ❌ faltam 14 |
| `matricula_renovacao` | 5 | 2 | ❌ faltam 3 |
| **`matricula_finalizacao`** | **20** | **0** | ❌ **faltam 20** |

- **`matricula_renovacao` chegou pela primeira vez em 03/08** (2 eventos, batendo com as 2
  renovações do dia). O evento existe e dispara — a lista de "nunca chegaram" caiu de 6 para 5.
- **`matricula_finalizacao` dispara 20x e chega 0x.** Os 20 batem **exatamente** com as 20 evasões
  de `movimentacoes_admin` no período → todas vieram do Emusys, nenhuma foi lançada à mão.
  Descartada a hipótese "evasão é registro manual, por isso não há webhook".
- ⚠️ **`matricula_alterada` e `matricula_renovacao` chegam PARCIALMENTE** — isso não estava
  documentado. O endpoint do observador não recebe tudo o que o Emusys manda.

**Consequência para a decisão:** a base de comparação que sustentaria virar `DRY_RUN=false` é
menos confiável do que se supunha. Matrícula não é processada pelo observador (só logada), então
não quebra nada hoje — mas invalida "cobertura 100%" como argumento geral.

### 🎯 CAUSA (mesma investigação, 03/08): a config do webhook é POR UNIDADE e estão diferentes

Cada unidade é um tenant separado no Emusys, com cadastro de webhook próprio. O "LAReport Sync"
foi criado com **listas de eventos diferentes** em cada uma. Recorte por `escola_nome`
(janela 23/07 → 03/08):

| unidade | evento | disparou | chegou no observador |
|---|---|---|---|
| **Campo Grande** | `matricula_nova` | 5 | 5 ✅ |
| | `matricula_alterada` | 4 | 4 ✅ |
| **Barra** | `matricula_nova` | 9 | 9 ✅ |
| | `matricula_renovacao` | 1 | 1 ✅ |
| | `matricula_trancamento` | 2 | 2 ✅ |
| | `matricula_alterada` | 1 | **0** ❌ |
| **Recreio** | `matricula_nova` | 8 | 8 ✅ |
| | `matricula_alterada` | 12 | **0** ❌ |
| | `matricula_renovacao` | 4 | **1** ❌ |
| | **`matricula_finalizacao`** | **20** | **0** ❌ |

**Campo Grande é a referência (completa). Recreio é o buraco** — as 20 evasões do período foram
todas de lá. Barra perde `matricula_alterada`.

Provado que são webhooks legítimos, não chamada interna: payload com `id` sequencial do Emusys
(71284, 71285), `data_hora_criacao` minutos antes, bloco `finalizacao:{motivo,observacoes}`
completo. E `processar-matricula-emusys` não é invocada por outro código nosso que produzisse isso.

⚠️ **Ressalvas (não superestimar):** janela curta e volume baixo. Ausência de um evento numa
unidade **não prova** que esteja desmarcado lá (`matricula_finalizacao` não disparou em CG nem
Barra no período). E `matricula_renovacao` do Recreio chegou 1 de 4 — parcial dentro da MESMA
unidade e MESMO evento, que config sozinha não explica. Conferir a lista inteira nos 3 painéis.

### ✅ CONFIRMADO NA FONTE E CORRIGIDO PELO HUGO (03/08/2026)

O Hugo abriu os painéis e **confirmou**: `matricula_alterada` e `matricula_finalizacao` estavam
**desmarcados nas unidades Barra e Recreio**. Ele marcou os dois no mesmo dia.
Deixa de ser hipótese minha — é fato verificado na configuração.

⚠️ **Forward-only.** O que já passou não é reenviado: os 20 `matricula_finalizacao` de 01/08
(Recreio) e os 12 `matricula_alterada` estão perdidos para o observador. Não há backfill —
o histórico de comparação começa em 03/08 para esses dois eventos.

**Conferir nos próximos dias** (esperar evasão/alteração real acontecer em Barra ou Recreio;
as duas colunas da direita têm que ficar iguais):

```sql
select coalesce(payload_bruto->>'escola_nome', detalhes->>'escola_nome') as escola,
       evento,
       count(*) filter (where workflow_id='processar-matricula-emusys'
                          and acao='webhook_recebido')            as disparou,
       count(*) filter (where workflow_id='debug-webhook-emusys-observador') as chegou_observador
from automacao_log
where created_at >= '2026-08-03' and evento like 'matricula%'
group by 1,2 order by 1,2;
```
⚠️ Contar a edge SÓ por `acao='webhook_recebido'` — ela grava 2 linhas por evento
(recebido + processado) e o total dobra o número.

**Ainda em aberto após o fix:** `matricula_renovacao` do Recreio chegou 1 de 4 — parcial dentro
da MESMA unidade e MESMO evento, o que config marcada/desmarcada não explica. Vigiar se some
sozinho agora ou se é um segundo problema (entrega falhando, não configuração).

**Próximos passos (atualizados 03/08):**
1. ~~Igualar a lista de eventos nas 3 unidades~~ — **feito pelo Hugo em 03/08** (Barra + Recreio).
   Rodar a query acima nos próximos dias para confirmar a paridade antes de qualquer decisão
   sobre `DRY_RUN`.
2. Só depois decidir sobre `DRY_RUN=false` — e ao decidir, desligar SÓ os branches de
   `lead_criado`/`lead_editado`/experimental do n8n (mesmo workflow `EB0LibpOJCLhKp7M`/`j41tPbyjGXUQUxrN`);
   `lead_arquivado` sem dado real ainda não deveria entrar na primeira leva.
3. Bug conhecido que **não** é corrigido ao virar a chave (fica pra depois, ver TODO de identidade
   de professor acima): camada 1 do `registrar_experimental` busca `emusys_lead_id` sem filtrar unidade.

**Lição de método:** ausência de evento no log de UM consumidor não prova que o evento não ocorreu.
Sempre cruzar com os outros consumidores do mesmo produtor antes de concluir "não dispara".

**Arquivos:** `supabase/functions/debug-webhook-emusys-observador/index.ts` (**v18** em 03/08, era v17).
Detalhes técnicos completos em `.claude/memory/integracao-infra.md` (seção "Observador emusys").

---

## Resolvidos (histórico)

- **2026-05-02 — Edge functions Gemini com placeholder "deploy":** 10 funções redeployadas com código correto. Adicionado retry com backoff exponencial para erros 503/429.
- **2026-05-01 — Fix telefone responsável em `processar-matricula-emusys` v10:** fallback `telefone_aluno || telefone_responsavel` aplicado em INSERT e UPDATE.
- **2026-05-01 — RPC `get_kpis_professor_periodo` com fallback ILIKE em `motivos_saida`:** evasões com `motivo_saida_id` NULL agora não contam no score (regra alterada de "NULL conta" para "NULL não conta").
