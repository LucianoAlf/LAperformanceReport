# 2026-06-20 — Raw event store + investigação da costura experimental

> Catálogo do que foi feito (regra: tudo que fizermos vai aqui em `docs/hugo/`).

## Contexto
Investigação da costura **lead → experimental → aluno → matrícula → presença** no LA Report:
`lead_experimentais.aluno_id` quase sempre vazio, taxa de conversão estourando >100%. Diagnóstico completo e decisões em `.claude/memory/pendencias-2026-06-20-costura-experimental.md`.

Conclusão-chave: os IDs do Emusys **já chegam** (webhook de matrícula traz `lead_id`); o furo é interno — a edge costura `leads` mas não propaga pra `lead_experimentais`, e **nenhum payload cru é arquivado** (lead/experimental não guardam nada; matrícula guardava só ~65%). Decidido criar um **raw event store** (arquivar todo payload cru, append-only) como fundação antes de qualquer correção.

## O que foi feito (raw event store)

### 1. Banco — coluna nova (aplicado)
- `ALTER TABLE leads_automacao_log ADD COLUMN payload_bruto jsonb;`
- Migration: `add_payload_bruto_leads_automacao_log`. `automacao_log` (matrícula) já tinha a coluna.

### 2. Edge `processar-matricula-emusys` → v23 ✅ DEPLOYADA
- Arquivo: `supabase/functions/processar-matricula-emusys/index.ts`.
- Grava o payload cru em `automacao_log` (`acao='webhook_recebido'`) no **início** do `serve()`, antes do `parsePayload` → captura 100% (antes só ~65%, gravava no fim dos handlers).
- `try/catch` isolado: falha ao arquivar nunca derruba a matrícula. Client supabase movido pra antes do parse.
- **Deploy:** Supabase internal version v28, status ACTIVE, `verify_jwt: false`. Deployada ~17:22 BRT.
- **Validação:** aguardando próximo webhook real (último matricula_nova chegou às 11:51 BRT, antes do deploy).

### 3. n8n — nós de raw nos webhooks ✅ APLICADOS
- `EB0LibpOJCLhKp7M` (leads): nó "Gravar Raw Lead" (id: `raw-lead-node-001`) → `leads_automacao_log` (`evento='webhook_lead_raw'`), posição [-848, 608], paralelo ao `Webhook1`, `continueOnFail: true`.
- `Fucq0bQwF4oeuWnv` (experimental): nó "Gravar Raw Experimental" (id: `raw-experimental-node-001`) → `evento='webhook_experimental_raw'`, posição [-2272, 288], 5ª saída paralela do `recebeEmusys`, `continueOnFail: true`.
- Ambos usam credencial Postgres existente `LA Performance Report Creds` (id: `4oVVstGl3KixyKpd`).
- **Incidente:** agente reconectou por engano o nó `manda pro dash do rayan4` (que o Alf havia desconectado intencionalmente — envia para projeto Supabase do Rayan `aexacbmirdlcssmjjbzx`). Alf removeu manualmente via UI do n8n. Causa: `removeConnection` via `n8n_update_partial_workflow` falha silenciosamente com "No connections found" — bug do MCP, não contornar via código.
- **WF_Matricula_Funcional** (`ZzuR9slRx8UqXg9N`): **não tocado**. Raw archiving ocorre dentro da edge (`LAPerformanceReport` → `processar-matricula-emusys` v23).

### 4. Agente `fiscal-dados` (atualizado)
- `.claude/agents/fiscal-dados.md` ganhou **Seção M — Raw event store**: queries pra verificar se os 3 fluxos de payload bruto estão chegando, com `payload_bruto` não-nulo, e detectar gaps (nó n8n caído / edge sem arquivar).

## Por que jsonb serve (validado)
Pesquisa por mês é rápida (índice `created_at` já existe) e extrair campos do JSON é trivial (`payload->'matricula'->>'nome_aluno'`). Permite "reprocessar o mês inteiro" — caso de uso pedido pelo Alf.

## Status Final — Raw Event Store ✅ IMPLEMENTADO

| Origem | Tabela | Status |
|--------|--------|--------|
| Leads (n8n `EB0LibpOJCLhKp7M`) | `leads_automacao_log` (`webhook_lead_raw`) | ✅ Nó adicionado |
| Experimental (n8n `Fucq0bQwF4oeuWnv`) | `leads_automacao_log` (`webhook_experimental_raw`) | ✅ Nó adicionado |
| Matrícula (edge `processar-matricula-emusys`) | `automacao_log` (`webhook_recebido`) | ✅ Edge v23 deployada |

Validação pendente (aguardar chegada do próximo webhook real de cada tipo → rodar SELECTs da Seção M do fiscal-dados).

## Pendências (não feito ainda)
- **Validar** raw event store com próximo webhook real (Seção M do `fiscal-dados.md`).
- **Decisões abertas** (Alf pendente):
  1. Score de conversão do professor é usado para avaliar/cobrar/premiar?
  2. Aluno existente fazendo experimental de outro instrumento entra na régua do professor?
- **Correção da costura** (propagar `leads.aluno_id` → `lead_experimentais.aluno_id` na edge) — bloqueada pelas decisões acima.
- **Backfill 72 baixo risco** — preview SELECT antes de aplicar.
- **Corrigir `docs/MAPA-INTEGRACAO-EMUSYS.md` linha 79** — diz que edge grava `alunos.lead_origem_id`, código v23 não grava.
- **`adicionar no dash do rayan`** em `WF_Matricula_Funcional` Switch4 saída 2 — ainda conectado; avaliar remoção como o do leads.

## Ponteiros
- Pendência/decisões: `.claude/memory/pendencias-2026-06-20-costura-experimental.md`
- Edge: `supabase/functions/processar-matricula-emusys/index.ts`
- Mapa de integração: `docs/MAPA-INTEGRACAO-EMUSYS.md`
