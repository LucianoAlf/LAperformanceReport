# Mapa de Integração Emusys ↔ LA Music Report

> Ciclo das automações **Emusys ↔ nosso sistema (Supabase Performance Report)**: webhooks que entram, endpoints que o sistema chama, e a finalidade de cada um.
> Escopo: o que o **Performance Report** chama/recebe. O agente **Mila SDR** é um produto separado (upstream) — aparece só como contexto.
> Última verificação na fonte (n8n + código): **2026-06-08** (varredura exaustiva).
> Referências: `emusys-api.md` (API), `pendencias-emusys.md` (limitações), `integracao-infra.md` (infra geral).

---

## Visão geral

```
                ┌───────────────────────────────────────────────┐
   ENTRADA      │  EMUSYS dispara webhook → nós gravamos no DB   │
   (push)       └───────────────────────────────────────────────┘
        leads        → n8n  EB0LibpOJCLhKp7M       → upsert_lead (Supabase)
        experimental → n8n  Fucq0bQwF4oeuWnv       → UPDATE leads (Supabase) + WhatsApp
        matrícula    → n8n  WF_Matricula_Funcional → edge processar-matricula-emusys → alunos

                ┌───────────────────────────────────────────────┐
   SAÍDA        │  O NOSSO sistema chama a API do Emusys         │
   (pull)       └───────────────────────────────────────────────┘
        GET /v1/aulas/       → sync-presenca-emusys    (cron diário)
        GET /v1/professores  → sync-professores-emusys (cron semanal)
        GET /v1/faturas      → sync-faturas-emusys      (cron atual+anterior / refresh interno)

                ┌───────────────────────────────────────────────┐
   UPSTREAM     │  Mila SDR (produto SEPARADO) alimenta o Emusys │
   (contexto)   └───────────────────────────────────────────────┘
        Mila cadastra lead / agenda experimental NO EMUSYS
        → é isso que faz o Emusys disparar os webhooks de entrada acima.
        A Mila NUNCA grava no nosso Supabase — quem grava é o webhook.
```

- **Quem grava no Supabase é sempre o webhook** (EB0 / Fucq0 / edge), nunca a Mila.
- **Pulls operacionais documentados aqui:** `/aulas`, `/professores` e `/faturas`.
- Webhooks chegam no host n8n `https://webhookla.latecnology.com.br/webhook/<evento>`.
- **Escola_id → unidade:** `39` = Campo Grande, `40` = Recreio, `316` = Barra.

---

## 1. ENTRADA — Webhooks que o Emusys dispara (gravam no Supabase)

### 1.1 Leads → n8n `EB0LibpOJCLhKp7M`
**Webhook:** `POST .../webhook/lead_criado`. Switch separa 3 eventos. **Grava só no Supabase** (credencial "LA Performance Report Creds"):

| Evento | O que faz no Supabase |
|---|---|
| `lead_criado` | `upsert_lead(nome, telefone, email, unidade, instrumento, como_conheceu, emusys_id, 'emusys', FALSE, data_contato)` — cria/atualiza o lead (estágio "Novos Leads"). Porta de entrada de **todo lead**. |
| `lead_editado` | Mesma `upsert_lead(...)` — atualiza dados do lead. |
| `lead_arquivado` | `UPDATE leads SET arquivado=true, status='arquivado', etapa_pipeline_id=11` (preserva `convertido`/`matriculado`). |

- Telefone chega `(21) 99999-9999` → normalizado para `5521...`.
- ⚠️ `upsert_lead` **não recebe o estágio do funil** → `lead_editado` não marca experimental realizada/faltou (ver 1.2).
- ⚠️ Os nós NocoDB deste workflow estão **desconectados** — não gravam no NocoDB.

### 1.2 Aula experimental → n8n `Fucq0bQwF4oeuWnv` (+ sub `j41tPbyjGXUQUxrN`)
**Webhook** (ativo). Switch separa **Criada / Reagendada / Cancelada**. Grava direto em `leads` (Postgres):

| Evento | O que faz |
|---|---|
| `aula_experimental_criada` | UPDATE `leads` (`experimental_agendada=true`, `data_experimental`, `horario_experimental`, `professor_experimental_id`) + **notifica consultor e professor via WhatsApp (WAHA)**. |
| `aula_experimental_reagendada` | Atualiza data/horário + notifica. |
| `aula_experimental_cancelada` | UPDATE `leads` (cancela) + notifica. |

**Comparecimento/falta — vem do Emusys (sync de aulas), fallback manual:**
1. **Automático:** o `sync-presenca-emusys` (ver 2.1) cruza as aulas `categoria=experimental` do `GET /aulas/` (`presenca: presente/ausente`) com as agendadas → marca `experimental_realizada` (etapa 7) ou `faltou_experimental` (etapa 9). Auto-marca `faltou` após +7 dias sem confirmação.
2. **Manual:** consultor pode marcar na aba **Agenda do Pré-Atendimento** (`AgendaTab.tsx`).

### 1.3 Matrículas → n8n `WF_Matricula_Funcional` → edge `processar-matricula-emusys`
**Webhook:** `POST .../webhook/webhook_matricula`. O n8n:
1. **Reencaminha o body cru pra edge** `processar-matricula-emusys` (com retry).
2. `matricula_nova`/`renovacao` → etiqueta aluno ativo (Chatwoot) + mensagem de boas-vindas.
3. Se a edge falhar → alerta de erro via UAZAPI (`5521964171223`).

A edge faz `switch(evento)`:

| Evento | Finalidade |
|---|---|
| `matricula_nova` | Insere aluno em `alunos`, resolve professor/curso/pagamento, converte o lead (`leads.aluno_id` + `alunos.lead_origem_id`). |
| `matricula_renovacao` | Atualiza contrato/valor + `movimentacoes_admin` (renovação). |
| `matricula_trancamento` | Trancamento + `movimentacoes_admin`. |
| `matricula_finalizacao` | Evasão + `movimentacoes_admin`; se saiu de TODAS as matrículas, grava `alunos_historico` (LTV). |

- Idempotência por evento; saúde via `_shared/invariantes.ts` (`automacao_log`/`automacao_invariantes`). `verify_jwt: false`.

### 1.4 Webhook NÃO consumido
`aula_cancelada` (aula regular) — sem receptor; a presença vem pelo sync diário de `/aulas/`.

---

## 2. SAÍDA — Endpoints que o NOSSO sistema chama (só estes dois)

### 2.1 `GET /v1/aulas/` → `sync-presenca-emusys` (cron diário) — duplo propósito
- **Quando:** pg_cron diário (CG 01:00, Barra 01:20, Recreio 01:40 UTC ≈ 22h BRT).
- **Para quê:** (1) presença de aulas regulares → `aulas_emusys` + `aluno_presenca`; (2) **confirmar experimentais** → marca `experimental_realizada`/`faltou_experimental` no lead (ver 1.2).
- ⚠️ Casa aula→aluno por nome+curso (ignora `status`). Professor matched por nome (API não retorna `professor_id`).
- **Uso pedagógico do campo `anotacoes`:** o texto que o professor escreve na aula (Objetivo/Metodologia/Repertório) fica em `aulas_emusys.anotacoes`. É a matéria-prima do **Relatório Pedagógico com IA** (aba Histórico Pedagógico da ficha do aluno): RPC `get_relatorio_pedagogico_aluno` consolida por período e a edge `gerar-relatorio-pedagogico` (Gemini) transforma em relatório para o responsável. Mesma fonte que o agente Fábio reusará (Fase 4) para enviar via WhatsApp.

### 2.2 `GET /v1/professores` → `sync-professores-emusys` (cron semanal)
- **Quando:** pg_cron Domingo 04:00 BRT.
- **Para quê:** sincronizar professores — auto-cura `emusys_id` por nome, cria novos, vincula a `professores_unidades`.
- ⚠️ `emusys_id` é por unidade.

---

## 3. UPSTREAM — Mila SDR (produto separado, fora do sistema)

> A Mila é o **agente de atendimento** (WhatsApp/n8n), não o Performance Report. Ela escreve **no Emusys**, e é isso que dispara os webhooks da seção 1. **Não grava no nosso Supabase.** Documentado aqui só para explicar a origem dos leads/experimentais.

Quem é: os 3 agentes Mila SDR (CG `aHD4kJdzByLwFXA1`, Recreio `gSHJHYMOYDQZqleW`, Barra `yko5HstPTze0gsIM`) + a edge `mila-processar-mensagem`. O que fazem no Emusys:

| Ação da Mila | Endpoint Emusys | Resultado no nosso sistema |
|---|---|---|
| Cadastrar lead | `POST sys.emusys.com.br/w2bh99k_/api/criar_lead.php` (legado) | Emusys dispara `lead_criado` → EB0 grava |
| Agendar experimental (sub-workflow "Agendar experimental") | `GET /v1/disciplinas`, `PATCH /v1/crm/leads/por_telefone`, `POST /v1/crm/aula_experimental` | Emusys dispara `aula_experimental_criada` → Fucq0 grava |
| Atualizar origem ("Definir Origem e Etiqueta", `5lRs2`) | `PATCH /v1/crm/leads/por_telefone` | reflete no Emusys; chega via `lead_editado` |

⚠️ **Falha silenciosa:** o nó "Cadastrar no Emusys" tem `neverError: true`. Se o Emusys rejeita (telefone duplicado), segue como sucesso, nenhum webhook dispara, e o lead **não chega ao Supabase**.

---

## 4. Tabela-resumo

| # | Direção | Gatilho / Endpoint | Caminho | Finalidade |
|---|---|---|---|---|
| 1 | ⬅ entra | `lead_criado` | n8n EB0 → `upsert_lead` | Cria lead |
| 2 | ⬅ entra | `lead_editado` | n8n EB0 → `upsert_lead` | Atualiza lead |
| 3 | ⬅ entra | `lead_arquivado` | n8n EB0 → `UPDATE` | Arquiva lead |
| 4 | ⬅ entra | `aula_experimental_criada/reagendada/cancelada` | n8n Fucq0 → `j41` | Agenda/reagenda/cancela experimental + notifica |
| 5 | ⬅ entra | `matricula_nova/renovacao/trancamento/finalizacao` | n8n WF_Matricula → edge | Cria aluno / renovação / trancamento / evasão+LTV |
| 6 | ➡ sai | `GET /v1/aulas/` | sync-presenca-emusys (diário) | Presença + confirma experimentais |
| 7 | ➡ sai | `GET /v1/professores` | sync-professores-emusys (semanal) | Sync professores |
| 8 | ➡ sai | `GET /v1/faturas` | sync-faturas-emusys (atual+anterior / sob demanda) | Espelho atual + snapshot financeiro auditável |
| — | upstream | Mila → Emusys (cadastro/experimental) | fora do sistema | Origina os webhooks (ver seção 3) |

---

## 5. Ciclo de vida do lead (ponta a ponta)

```
1. [UPSTREAM] WhatsApp → Mila cadastra no Emusys (criar_lead.php)
2. Emusys dispara lead_criado → EB0 → upsert_lead (Supabase, "Novos Leads")
3. [UPSTREAM] Mila agenda experimental no Emusys (POST /crm/aula_experimental)
4. Emusys dispara aula_experimental_criada → Fucq0 → UPDATE leads (agendada) + avisa consultor/professor
5. [APÓS A AULA] sync diário de /aulas/ confirma presença → experimental_realizada/faltou (etapa 7/9)
6. Se matricula → Emusys dispara matricula_nova → WF_Matricula → edge → cria aluno + converte lead
```

> Passos 1 e 3 são da Mila (upstream). O resto é o nosso sistema reagindo aos webhooks do Emusys.

---

## 6. Workflows Emusys legados (NÃO em uso)
Inativos no n8n, fora do ciclo: `Update no crm do emusys` (`6a2VDVkzzs3Avj39`), `Verificar disponibilidade no emusys` (`rPEHbiR5AQrEzglh`), `[ Emusys ] - Gerenciar Lead` (`NfDoy9o2QCQdMJjC`), versões antigas arquivadas do webhook de experimental.

> O sub-workflow "Agendar experimental" (`Zyw5jatATcstbTx0`) aparece `active:false` mas roda em produção — é chamado como tool pelos Mila (sub-workflow não precisa estar ativo).

---

## 7. Prova de exaustividade (varredura 2026-06-08)
Lidos na fonte **todos os ~30 workflows n8n ativos** + edge functions. **Tocam Emusys:** EB0, Fucq0+j41, WF_Matricula (nosso sistema, via webhook); sync-presenca, sync-professores (nosso sistema, saída); Mila SDR + "Agendar experimental" + "Definir Origem" 5lRs2 + edge mila-processar-mensagem (**upstream**, seção 3).

**Workflows ativos verificados que NÃO tocam Emusys** (Chatwoot/WhatsApp/NocoDB/financeiro/interno): Lembretes de experimental (1d/2h), Follow Lista de Espera, Fluxo de Follow Ups-v2, Retornar/Pausar/Abertura FollowUPS, Aviso Diário de Visitas, Etiquetar, criação de etiquetas, Controle de Estagio, Envio de Relatórios, WF1-Webhook-Receiver, Importar Contatos, TypeBot IG, Agente Fiscal Auditoria Mila, [chwt] Gerenciar CRM NocoDB, [Nocodb] Criação/Atualização (Upsert `disabled`), Chatwoot Supervisor, Lembrete Financeiro, Disparador Meta, Monitoramento Servidor, Transcrição de Áudio, LA Band Pilot.

**Teste (não-produção):** "teste hugo" (`k66EcPwAtT0E2taH`) invoca sub-workflow Emusys via trigger manual.

---

## 8. Limitações conhecidas (lado Emusys)
Detalhes em `pendencias-emusys.md`. Resumo:
- `GET /aulas/` não retorna `professor_id` → matching por nome.
- Aulas tipo **turma** vêm com `professores: []` → 0% cobertura de professor.
- `emusys_id` de professor é por unidade, não global.

---

## 9. Fora de escopo (tocam Emusys, mas outros sistemas)
- **NocoDB** — CRM paralelo dos agentes Mila. Recebe dados direto dos agentes, mas **não alimenta o Performance Report** (ramos NocoDB nos webhooks de lead desconectados; sync NocoDB→Supabase desativado desde ~28/03/2026).

## 10. Exportação de faturas para o Super Folha

`refresh-contas-receber` recebe uma competência explícita (`YYYY-MM-01`), executa o sync completo das 3 unidades e devolve `sync_run_id`. Para o cron, a mesma Edge resolve `atual` e `anterior` em BRT e executa os dois em sequência. O segredo dedicado vem do Vault e não expõe credenciais do banco.

`sync-faturas-emusys` cria o run `running` antes da coleta, usa mutex global no banco, limita chamadas a 50/min e só publica depois de validar paginação, IDs, datas e completude das 3 unidades. A publicação atômica atualiza `emusys_faturas` como espelho canônico atual e grava `sync_run_items` imutáveis, eventos e tombstones por competência. Baseline legado compara ausências, mas não prova frescor.

`export-contas-receber` lê somente snapshots live completos. Com `sync_run_id`, exporta o run exato; com `require_latest=true`, também exige que ele seja o último completo. Sem ID, seleciona o último completo da competência para o fallback read-only. O manifesto informa `sync_run_id` e `latest_complete_sync_run_id`. O exportador cruza aluno/curso por `(unidade_id, emusys_matricula_id)` e usa o UUID estável de `emusys_faturas` como `la_report_fatura_id`. `row_source_hash` e `manifest_hash` excluem IDs técnicos de run/item e timestamps operacionais.

O plano de contas e a auditoria da classificação continuam no projeto Super Folha.
- **Dash do rayan** (`emusys-webhook` no projeto `aexacbmirdlcssmjjbzx`) — recebe cópia dos webhooks, projeto separado.
- **emusys-agent** (chat) — repositório separado.

---

## 10. Onde fica cada coisa
| Componente | Caminho |
|---|---|
| Webhook leads (n8n) | `EB0LibpOJCLhKp7M` |
| Webhook experimental (n8n) | `Fucq0bQwF4oeuWnv` + sub `j41tPbyjGXUQUxrN` |
| Webhook matrícula (n8n) | `WF_Matricula_Funcional` (`ZzuR9slRx8UqXg9N`) |
| Edge matrícula | `supabase/functions/processar-matricula-emusys/index.ts` |
| Sync presença | `supabase/functions/sync-presenca-emusys/index.ts` |
| Sync professores | `supabase/functions/sync-professores-emusys/index.ts` |
| Sync faturas | `supabase/functions/sync-faturas-emusys/index.ts` |
| Refresh interno de faturas | `supabase/functions/refresh-contas-receber/index.ts` |
| Export financeiro por run | `supabase/functions/export-contas-receber/index.ts` |
| Marcação compareceu/faltou (manual) | `src/components/App/PreAtendimento/tabs/AgendaTab.tsx` |
| Mila SDR (upstream) | `aHD4kJdzByLwFXA1` / `gSHJHYMOYDQZqleW` / `yko5HstPTze0gsIM` |
