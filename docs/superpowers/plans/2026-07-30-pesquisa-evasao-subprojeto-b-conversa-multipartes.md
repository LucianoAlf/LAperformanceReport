# Pesquisa de Evasão — Subprojeto B: Conversa Multipartes Segura Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar cada resposta de evasão em uma conversa segura, idempotente e multipartes, preservando textos e áudios, tratando adiamento e opt-out, protegendo o webhook inbound por caixa e eliminando payloads privados dos logs.

**Architecture:** O webhook público continua com `verify_jwt=false`, porque é chamado pela UAZAPI, mas autentica a caixa por segredo forte antes de qualquer uso da service role. O segredo bruto nunca é persistido; a Edge calcula SHA-256 e uma RPC anônima de resposta booleana compara o hash em tabela backend-only ligada a `whatsapp_caixas`. Após autenticar, o roteador preserva todos os fluxos atuais, registra eventos de evasão de forma append-only e agenda consolidação/transcrição. O cabeçalho mantém estado; eventos e versões continuam imutáveis. Conversas abertas antes do corte permanecem no motor legado; o multipartes é ativado primeiro em modo teste e, depois, somente para novas pesquisas. Debug persistido é sanitizado e expira em sete dias.

**Tech Stack:** Supabase Edge Functions/Postgres/RLS/pg_cron, Deno/TypeScript, React 19, UAZAPI, Storage privado, Node `node:test`.

---

## Estado reconciliado com produção em 01/08/2026

Verificação somente leitura no projeto `ouqwbbermlzqqvtqwlul`:

### Já concluído — preservar, não refazer

- [x] Credenciais UAZAPI/WAHA retiradas do frontend pela migration `20260730180100_whatsapp_caixas_credenciais_privadas.sql`.
- [x] Os três consumidores do frontend usam os contratos seguros de caixas.
- [x] O fallback “Tentativa 2”, que podia associar uma resposta à família errada, foi removido e validado em produção com mensagem vinda de outro número.
- [x] A Edge deixou de inserir payload bruto em `webhook_debug_log`; a última linha persistida é anterior ao redeploy corretivo.
- [x] `pesquisa_evasao_mensagens`, `pesquisa_evasao_transcricoes` e `pesquisa_evasao_analises` já existem pela fundação do Subprojeto A.
- [x] O índice único `pesquisa_evasao_mensagens_provider_uidx` sobre `(caixa_id, provider_message_id)` já existe; B deve verificá-lo, não recriá-lo.

### Ainda pendente

- [ ] Remover PII dos logs de execução da Edge. O código ainda registra telefone, estado serializado, trecho de payload, corpo da transcrição e trecho do texto transcrito.
- [ ] Expurgar as `2.290` linhas legadas de `webhook_debug_log` e criar retenção de no máximo sete dias para diagnóstico tipado e sanitizado.
- [ ] Criar `whatsapp_caixa_webhook_secrets`, provisionar um segredo por caixa e rejeitar o inbound antes da service role.
- [ ] Ativar ingestão append-only: as três tabelas multipartes estão vazias em produção e a resposta ainda é consolidada diretamente nos campos legados.
- [ ] Corrigir a ordem de roteamento: `buttonOrListid` da pesquisa pós-1ª aula precisa ser encaminhado antes de qualquer `continue` específico da evasão.
- [ ] Implementar transcrição, consolidação, opt-out e revisão sobre os eventos imutáveis.

### Decisão de acesso vigente

- Qualquer usuário interno ativo pode ler e revisar a pesquisa, em qualquer unidade.
- Não existe gate `sucesso_aluno.evasao.*` no Subprojeto B.
- Roles de agentes Mila, Sol, Fabio e Lia continuam sem leitura direta das respostas privadas.
- Toda escrita humana ocorre por RPC auditada, com usuário e horário; unidade é filtro operacional, não autorização.

## Ordem revisada por janelas curtas

Cada janela tem deploy, smoke e ponto de parada próprios. Não trocar o motor de recepção enquanto houver uma conversa familiar aberta no motor atual.

1. **Janela B0 — privacidade sem mudança de roteamento**
   - Task 1: sanitizar logs de execução e publicar a Edge sem mudar a persistência de respostas;
   - Task 2: expurgar o legado, reduzir grants e instalar diagnóstico sanitizado com retenção de sete dias.
2. **Janela B1 — autenticação inbound por caixa**
   - criar tabela/hash e validador booleano;
   - proteger health/configurador;
   - provisionar todas as caixas enquanto o webhook ainda aceita o contrato atual;
   - somente depois ativar enforcement e validar a matriz `400/401/403/200`.
3. **Janela B2 — motor multipartes em modo teste**
   - preservar primeiro o roteamento pós-1ª aula;
   - fortalecer o schema já existente e adicionar `resposta_ingestao_versao`;
   - manter todas as pesquisas existentes em `legado_v1`;
   - ativar `multipartes_v2` apenas numa pesquisa de teste controlada;
   - validar texto, áudio, duplicata, ambiguidade, adiamento e opt-out.
4. **Janela B3 — novas conversas e revisão**
   - alterar, por migration versionada, apenas o default de novas pesquisas para `multipartes_v2`;
   - manter pesquisas já abertas em `legado_v1` até encerrarem ou expirarem;
   - publicar fila/timeline de revisão e monitorar por pelo menos uma hora.

O início de cada janela exige confirmação explícita. Falha em qualquer smoke interrompe a janela; não corrigir em produção no improviso.

## Dependências e fronteiras

- Implementar sobre a fundação do Subprojeto A e seu contrato de usuário interno ativo.
- O schema multipartes de A já existe em produção, mas está vazio; fortalecer de forma aditiva.
- A auditoria somente leitura da VPS pode ocorrer em paralelo; não bloqueia B.
- Preservar no `webhook-whatsapp-inbox`:
  - inbox administrativa;
  - CRM;
  - status `messages_update`;
  - edição e reação;
  - mensagens `fromMe` das caixas administrativas;
  - encaminhamento de `buttonOrListid` para `processar-resposta-pesquisa`;
  - deduplicação atual.
- Não decidir timing do primeiro disparo nem lembretes; Subprojeto C.
- `recusada_opt_out` bloqueia reenvio/lembrete da pesquisa, mas não vira causa de evasão nem resposta válida.
- Não guardar segredo inbound em texto puro em `whatsapp_caixas`; persistir somente o hash em tabela backend-only.
- A retirada de `uazapi_token`/`waha_api_key` dos contratos do frontend já foi concluída no Subprojeto A e é pré-condição a preservar.

## Contrato de autenticação inbound

### Provedor

Prioridade:

1. header `x-webhook-secret`, se o provedor oferecer header customizado;
2. query param `webhook_secret`, para a UAZAPI atual, cuja configuração disponível aceita apenas URL.

Obrigatórios:

```text
caixa_id
webhook_secret ou x-webhook-secret
caixa ativa
hash ativo correspondente à caixa
```

Respostas:

```text
400: caixa_id ausente ou inválido
401: segredo ausente
403: caixa inativa ou segredo divergente
200: payload autenticado e aceito/idempotente
```

Nenhum desses erros pode:

- criar cliente service role;
- inserir em `webhook_debug_log`;
- chamar `processar-resposta-pesquisa`;
- alterar `pesquisa_evasao`;
- revelar se um hash parcial está correto.

### Health check

`?_health=1` exige `x-health-secret`, lido de `WEBHOOK_HEALTH_TOKEN` nas duas Edge Functions. Não aceita o segredo de caixa e não usa exceção pública.

## Contrato da conversa

### Resolução da pesquisa

Ordem:

1. mensagem citada cujo `provider_message_id` pertence ao outbound da pesquisa;
2. `caixa_id + telefone_normalizado + única pesquisa aberta`;
3. evento não resolvido com `resolution_status='ambigua'`.

Não usar “qualquer estado ativo” como fallback.

### Eventos

Cada fragmento inbound gera uma linha em `pesquisa_evasao_mensagens`. Reentrega com o mesmo `(caixa_id, provider_message_id)` retorna sucesso idempotente sem nova linha.

### Janelas

```text
60 segundos sem nova parte:
consolidação provisória disponível

15 minutos sem nova parte substantiva e sem transcrição pendente:
resposta_status = pronta_para_revisao

7 dias desde envio:
janela total, salvo encerramento humano ou opt-out
```

## Task 1: Sanitizar logs de execução sem alterar o motor de respostas — PRIMEIRA TAREFA

> **Estado:** a gravação de payload bruto em tabela já parou. Esta tarefa trata o
> restante: PII e conteúdo ainda emitidos nos logs de execução da Edge. É o
> primeiro passo recomendado porque reduz exposição sem alterar autenticação,
> roteamento ou persistência da resposta.

**Files:**

- Create: `supabase/functions/webhook-whatsapp-inbox/diagnostics.ts`
- Create: `supabase/functions/webhook-whatsapp-inbox/diagnostics.test.ts`
- Modify: `supabase/functions/webhook-whatsapp-inbox/index.ts`
- Create: `tests/webhookWhatsAppPrivacidade.test.mjs`
- Modify: `docs/MAPA-SISTEMA.md`
- Modify: `.claude/memory/integracao-infra.md`

- [x] **Step 1: Escrever testes vermelhos**

Exigir ausência de:

```ts
insert({ payload })
JSON.stringify(payload).substring(...)
Payload COMPLETO
Áudio transcrito: "${texto}"
JSON.stringify(estado)
```

Cobrir também os padrões encontrados no código atual:

```text
telefone normalizado ou original
corpo bruto da resposta UAZAPI
URL de mídia ou storage
trecho da transcrição
texto livre de erro retornado pelo provedor
```

Exigir que o diagnóstico sanitizado só aceite:

```text
correlation_id
caixa_id
event_type
route
result
http_status
error_code de enum fechado
duration_ms
```

O logger recebe um objeto tipado. Não recebe `payload`, mensagem, telefone,
nome, URL, transcrição, token ou corpo de erro externo, nem mesmo para aplicar
redação depois.

```ts
interface WebhookDiagnostic {
  correlation_id: string;
  caixa_id: number;
  event_type: 'messages' | 'messages_update' | 'unknown';
  route: 'admin' | 'crm' | 'evasao' | 'pesquisa_primeira_aula' | 'ignored';
  result: 'accepted' | 'duplicate' | 'rejected' | 'error';
  http_status?: number;
  error_code?: 'invalid_payload' | 'provider_error' | 'database_error' | 'internal_error';
  duration_ms?: number;
  provider_message_id_hash?: string;
  occurred_at: string;
}
```

O helper deve remover/rejeitar:

- `message`;
- `text`;
- `body`;
- `phone`;
- `remoteJid`;
- `pushName`;
- URLs;
- tokens;
- transcrição;
- mídia.

- [x] **Step 2: Executar e confirmar a falha**

```powershell
deno test supabase/functions/webhook-whatsapp-inbox/diagnostics.test.ts
node --test tests/webhookWhatsAppPrivacidade.test.mjs tests/pesquisaEvasaoCanonica.test.mjs
```

Expected: FAIL enquanto o webhook ainda grava/loga payload.

- [x] **Step 3: Implementar o helper sanitizado**

Usar correlation ID aleatório e, se necessário, SHA-256 do provider message ID. Nunca hashear telefone como substituto de anonimização; telefones têm espaço pequeno e são reversíveis por dicionário.

- [x] **Step 4: Limpar logs de execução**

Trocar logs sensíveis por:

```ts
registrarDiagnosticoWebhook({
  correlationId,
  caixaId,
  eventType,
  route,
  result,
});
```

Erros externos devem registrar apenas:

- HTTP status;
- código normalizado;
- correlation ID.

Não registrar response body da UAZAPI quando puder conter mídia, telefone ou mensagem.

- [x] **Step 5: Executar testes**

```powershell
deno test supabase/functions/webhook-whatsapp-inbox/diagnostics.test.ts
node --test tests/webhookWhatsAppPrivacidade.test.mjs
```

Expected: PASS. O diff de `index.ts` deve conter somente substituição de logs;
nenhuma condição, `continue`, chamada RPC ou escrita em tabela pode mudar nesta
tarefa.

- [x] **Step 6: Commit independente**

```powershell
git add -- supabase/functions/webhook-whatsapp-inbox/diagnostics.ts supabase/functions/webhook-whatsapp-inbox/diagnostics.test.ts supabase/functions/webhook-whatsapp-inbox/index.ts tests/webhookWhatsAppPrivacidade.test.mjs
git commit -m "fix: remover payload privado dos logs do webhook"
```

Este commit pode ser implantado antes do restante de B, pois reduz exposição sem mudar autenticação nem roteamento.

## Task 2: Criar segredo backend-only, validador booleano e expurgar o legado

**Files:**

- Create: `supabase/migrations/20260801220000_webhook_inbound_secrets_debug_retention.sql`
- Create: `tests/webhookInboundSecurityMigration.test.mjs`
- Create: `tests/fixtures/webhook_inbound_security_pg17.sql`
- Create: `scripts/verify-webhook-inbound-security.sql`

- [x] **Step 1: Escrever testes estruturais vermelhos**

Cobrir:

- tabela ligada a `whatsapp_caixas`;
- só hash, sem coluna de segredo bruto;
- RLS habilitada;
- grants revogados de `public`, `anon`, `authenticated`, Mila e Sol;
- RPC validadora retorna apenas boolean;
- RPC recebe hash, não segredo bruto;
- expurgo integral do legado;
- retenção automática de sete dias;
- preservação da barreira atual de leitura de `webhook_debug_log`: RLS habilitada e nenhuma policy para frontend/agentes;
- tabela nova `webhook_diagnosticos_sanitizados` sem coluna livre `payload/json/body/message`;
- código novo não volta a escrever em `webhook_debug_log`;
- descrição do risco como retenção indevida e volume de dados pessoais, não como leitura por usuário logado.

- [x] **Step 2: Executar e confirmar a falha**

```powershell
node --test tests/webhookInboundSecurityMigration.test.mjs
```

Expected: FAIL por migração ausente.

- [x] **Step 3: Criar tabela de hashes**

Contrato:

```sql
create table public.whatsapp_caixa_webhook_secrets (
  caixa_id integer primary key references public.whatsapp_caixas(id) on delete cascade,
  secret_hash_sha256 text not null
    check (secret_hash_sha256 ~ '^[0-9a-f]{64}$'),
  ativo boolean not null default true,
  versao integer not null default 1,
  criado_em timestamptz not null default now(),
  rotacionado_em timestamptz not null default now()
);
```

Depois:

```sql
alter table public.whatsapp_caixa_webhook_secrets enable row level security;
revoke all on public.whatsapp_caixa_webhook_secrets
  from public, anon, authenticated, mila_acesso_restrito, sol_acesso_restrito;
grant select, insert, update, delete
  on public.whatsapp_caixa_webhook_secrets to service_role;
```

Não criar policy para `authenticated`.

- [x] **Step 4: Criar validador restrito**

```sql
public.validar_webhook_caixa_hash(
  p_caixa_id integer,
  p_secret_hash_sha256 text
) returns boolean
```

Requisitos:

- `SECURITY DEFINER`;
- `STABLE`;
- `search_path = public, pg_temp`;
- verifica caixa ativa e hash ativo;
- não retorna nome, token, unidade ou existência separada da caixa;
- `EXECUTE` apenas para `anon` e `service_role`;
- sem grant para `authenticated`, Mila ou Sol;
- qualquer input inválido retorna `false`.

A Edge calcula o SHA-256 antes da RPC. O valor bruto não entra no corpo enviado ao banco.

- [x] **Step 5: Expurgar o legado e reduzir grants**

Na reconciliação somente leitura de 2026-08-01, `webhook_debug_log` tinha RLS habilitada, zero policies e, portanto, já não era legível pelo frontend ou pelos agentes. O risco real é retenção indevida e volume: `2.290` payloads completos. O menor `created_at` correspondia a 2026-02-16 22:59:32 BRT e o maior a 2026-08-01 13:43:28 UTC (10:43:28 BRT). Não há cron de retenção.

O conteúdo é debug, não fonte canônica. A migração deve:

1. executar preflight com contagem e datas, sem selecionar `payload`;
2. travar a tabela durante o preflight, registrar a contagem encontrada no
   momento da aplicação e emitir `NOTICE` explícito antes do expurgo; qualquer
   volume positivo é válido e deve ser integralmente removido, sem comparar com
   a fotografia histórica de `2.290` linhas;
3. falhar fechado se a tabela não existir ou se houver escritor persistente
   conhecido; em banco de ensaio vazio, emitir `NOTICE` explícito e seguir sem
   tratar a ausência de linhas como erro;
4. `truncate table public.webhook_debug_log` sem copiar os payloads para backup ou outra tabela;
5. preservar RLS sem policy e revogar grants de `public`, `anon`, `authenticated`, Mila, Sol, Fabio, Lia, Maria, jobs e `service_role` como defesa em profundidade;
6. manter a tabela legada bloqueada e sem novos escritores;
7. criar `webhook_diagnosticos_sanitizados` com apenas as colunas tipadas do contrato da Task 1, sem `jsonb` livre;
8. habilitar RLS sem policy nessa tabela, com escrita/leitura somente por service role;
9. agendar expurgo diário dos diagnósticos sanitizados com mais de sete dias.

Função de retenção:

```sql
public.expurgar_webhook_diagnosticos_sanitizados()
```

Somente service role/cron executa.

- [x] **Step 6: Validar em banco local**

```powershell
node --test tests/webhookInboundSecurityMigration.test.mjs
npx supabase db reset
npx supabase db lint --local
```

Expected: PASS. Se o stack Supabase completo não estiver iniciado, executar a
fixture `tests/fixtures/webhook_inbound_security_pg17.sql` em PostgreSQL 17
descartável. Ela precisa provar tanto `N > 0 → NOTICE → 0` quanto
`0 → NOTICE expurgo ignorado`, além de ACL, RLS, validador, cron e retenção.
O `db reset`/`db lint` do histórico completo continua obrigatório na Task 12
quando o stack local estiver disponível.

- [x] **Step 7: Commit**

```powershell
git add -- supabase/migrations/20260801220000_webhook_inbound_secrets_debug_retention.sql tests/webhookInboundSecurityMigration.test.mjs tests/fixtures/webhook_inbound_security_pg17.sql scripts/verify-webhook-inbound-security.sql
git commit -m "feat: proteger segredo inbound e expurgar debug"
```

## Task 2A: Fechar a leitura direta de credenciais em `whatsapp_caixas` — CONCLUÍDA

> **Concluída em produção no rollout do Subprojeto A.** A migration
> `20260730180100_whatsapp_caixas_credenciais_privadas.sql` está aplicada; os
> três consumidores foram migrados; `authenticated` não obtém linhas da tabela
> sensível e as RPCs seguras não retornam `uazapi_token` nem `waha_api_key`.

- [x] Read models seguros criados.
- [x] Leitura direta do frontend removida.
- [x] `useWhatsAppCaixas.ts`, `CaixasManager.tsx` e `NovaConversaModal.tsx` migrados.
- [x] Caixa de Entrada do Sucesso do Aluno validada após o deploy.

**Regra para B:** não criar migration concorrente, não devolver tokens aos
tipos do frontend e manter `tests/whatsappCaixasCredenciaisPrivadas.test.mjs`
na suíte de regressão.

## Task 3: Implementar autenticação antes da service role

**Files:**

- Create: `supabase/functions/webhook-whatsapp-inbox/auth.ts`
- Create: `supabase/functions/webhook-whatsapp-inbox/auth.test.ts`
- Modify: `supabase/functions/webhook-whatsapp-inbox/index.ts`
- Modify: `supabase/config.toml`
- Create: `tests/webhookInboundAuthWiring.test.mjs`

- [ ] **Step 1: Escrever testes vermelhos do helper**

Casos:

- `caixa_id` ausente/inválido → `400`;
- segredo ausente → `401`;
- hash divergente → `403`;
- hash de outra caixa → `403`;
- segredo válido → contexto autenticado;
- header tem prioridade sobre query;
- segredo nunca é incluído em retorno/erro/log;
- `_health=1` exige `x-health-secret`;
- token de caixa não autentica health;
- health token não autentica mensagem do provedor.

- [ ] **Step 2: Escrever teste estrutural da ordem**

`tests/webhookInboundAuthWiring.test.mjs` deve localizar no fonte:

```text
await autenticarWebhookInbound(...)
createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
```

e afirmar que a autenticação ocorre primeiro. Também deve afirmar que `req.json()` acontece somente depois da autenticação, para não processar payload atacante.

- [ ] **Step 3: Executar e confirmar a falha**

```powershell
deno test supabase/functions/webhook-whatsapp-inbox/auth.test.ts
node --test tests/webhookInboundAuthWiring.test.mjs
```

Expected: FAIL.

- [ ] **Step 4: Implementar autenticação com cliente anon**

Fluxo:

```ts
const url = new URL(req.url);

if (url.searchParams.get('_health') === '1') {
  return responderHealthAutenticado(req);
}

const caixaId = parseCaixaId(url);
const rawSecret =
  req.headers.get('x-webhook-secret') ??
  url.searchParams.get('webhook_secret');

const secretHash = await sha256(rawSecret);
const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const { data: valido } = await anon.rpc('validar_webhook_caixa_hash', {
  p_caixa_id: caixaId,
  p_secret_hash_sha256: secretHash,
});
if (!valido) return forbidden();

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const payload = await req.json();
```

Nunca passar o `rawSecret` a outro helper depois do hash.

- [ ] **Step 5: Configurar função**

Adicionar ao `supabase/config.toml`:

```toml
[functions.webhook-whatsapp-inbox]
verify_jwt = false
```

Isso é intencional e deve ter comentário: autenticação de provedor ocorre no código por segredo por caixa.

- [ ] **Step 6: Executar testes**

```powershell
deno test supabase/functions/webhook-whatsapp-inbox/auth.test.ts
node --test tests/webhookInboundAuthWiring.test.mjs tests/webhookWhatsAppPrivacidade.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- supabase/functions/webhook-whatsapp-inbox/auth.ts supabase/functions/webhook-whatsapp-inbox/auth.test.ts supabase/functions/webhook-whatsapp-inbox/index.ts supabase/config.toml tests/webhookInboundAuthWiring.test.mjs
git commit -m "feat: autenticar webhook por caixa"
```

Não implantar este commit em produção antes de provisionar os hashes e atualizar as URLs do provedor na Task 5.

## Task 4: Proteger monitor e configuração de webhook

**Files:**

- Modify: `supabase/functions/monitor-saude-webhook/index.ts`
- Modify: `supabase/functions/configurar-webhook-caixa/index.ts`
- Create: `supabase/functions/configurar-webhook-caixa/contract.ts`
- Create: `supabase/functions/configurar-webhook-caixa/contract.test.ts`
- Create: `tests/webhookProvisioningSecurity.test.mjs`

- [ ] **Step 1: Escrever testes vermelhos**

Monitor:

- envia `x-health-secret`;
- não chama health sem autenticação;
- alerta deixa de recomendar somente `--no-verify-jwt`;
- lista de caixas monitoradas vem do banco, não de `[3, ...]`.

Configurador:

- exige JWT de usuário;
- exige capacidade administrativa específica, por exemplo `admin.whatsapp_caixas`;
- gera 32 bytes aleatórios por caixa;
- persiste apenas SHA-256;
- nunca retorna/loga URL completa com segredo;
- mantém `events: ['messages', 'messages_update']`;
- mantém `excludeMessages: []` para preservar eco de saídas administrativas;
- atualiza provider antes de ativar enforcement global.

- [ ] **Step 2: Executar e confirmar a falha**

```powershell
deno test supabase/functions/configurar-webhook-caixa/contract.test.ts
node --test tests/webhookProvisioningSecurity.test.mjs
```

Expected: FAIL.

- [ ] **Step 3: Atualizar health**

Em `monitor-saude-webhook`:

```ts
const healthToken = Deno.env.get('WEBHOOK_HEALTH_TOKEN');
```

Chamar:

```ts
headers: {
  'Content-Type': 'application/json',
  'x-health-secret': healthToken,
}
```

Carregar caixas ativas com webhook configurado de `whatsapp_caixas`. Não inserir token UAZAPI em log/alerta.

- [ ] **Step 4: Autenticar configurador**

Antes de service role:

1. validar JWT com `auth.getUser`;
2. resolver `usuarios`;
3. checar permissão administrativa;
4. validar `caixa_id`;
5. só então carregar credenciais da caixa.

Não deixar `configurar-webhook-caixa` como endpoint anônimo privilegiado.

- [ ] **Step 5: Gerar e provisionar segredo**

```ts
const bytes = crypto.getRandomValues(new Uint8Array(32));
const rawSecret = base64Url(bytes);
const secretHash = await sha256(rawSecret);
const webhookUrl =
  `${SUPABASE_URL}/functions/v1/webhook-whatsapp-inbox` +
  `?caixa_id=${caixa.id}&webhook_secret=${encodeURIComponent(rawSecret)}`;
```

Ordem transacional compensável:

1. configurar URL na UAZAPI;
2. se a UAZAPI aceitar, upsert do hash;
3. se o upsert falhar, tentar restaurar a configuração anterior e retornar erro crítico;
4. não retornar `rawSecret`;
5. retornar apenas URL redigida:

```text
...?caixa_id=3&webhook_secret=[REDACTED]
```

Como o webhook antigo ignora `webhook_secret`, essa atualização pode ser feita antes da versão que exige autenticação.

- [ ] **Step 6: Testar**

```powershell
deno test supabase/functions/configurar-webhook-caixa/contract.test.ts
node --test tests/webhookProvisioningSecurity.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- supabase/functions/monitor-saude-webhook/index.ts supabase/functions/configurar-webhook-caixa/index.ts supabase/functions/configurar-webhook-caixa/contract.ts supabase/functions/configurar-webhook-caixa/contract.test.ts tests/webhookProvisioningSecurity.test.mjs
git commit -m "feat: rotacionar webhook e autenticar health"
```

## Task 5: Fazer rollout do segredo sem interromper o inbound

**Files:**

- Create: `docs/runbooks/webhook-inbound-secret-rollout.md`
- Verify: `scripts/verify-webhook-inbound-security.sql`

- [ ] **Step 1: Documentar pré-check somente leitura**

Listar:

```sql
select id, nome, provedor, ativo, funcao, departamento
from public.whatsapp_caixas
where ativo
order by id;
```

E, via API do provedor, registrar apenas:

- ID do webhook;
- eventos;
- enabled;
- host/path redigidos;
- quantidade de webhooks por caixa.

Não copiar tokens nem query secrets para o documento.

- [ ] **Step 2: Implantar primeiro a redução de logs**

Deploy do commit da Task 1 e smoke test dos fluxos atuais.

- [ ] **Step 3: Aplicar migração**

Antes:

```sql
select count(*) as linhas_debug,
       min(created_at) as primeira,
       max(created_at) as ultima
from public.webhook_debug_log;
```

Registrar apenas contagens/datas. Aplicar a migração que expurga os payloads brutos. Após:

```sql
select count(*) from public.webhook_debug_log;
```

Expected: `0`.

O runbook descreve o incidente como retenção indevida de dados pessoais e crescimento sem expurgo. Não afirmar que os `2.290` payloads estavam expostos a qualquer usuário autenticado.

- [ ] **Step 4: Configurar health token**

Criar um valor forte distinto dos segredos de caixa e configurar `WEBHOOK_HEALTH_TOKEN` nas Edge Functions. Não versionar o valor.

- [ ] **Step 5: Implantar monitor/configurador**

Implantar:

- `monitor-saude-webhook`;
- `configurar-webhook-caixa`.

Validar health autenticado e confirmar que chamada sem token retorna `401`.

- [ ] **Step 6: Provisionar cada caixa ativa**

Para cada `caixa_id`:

1. chamar o configurador autenticado;
2. confirmar que há um hash ativo;
3. consultar provedor e confirmar URL com query presente, sem copiar o valor;
4. enviar um payload real de teste pelo WhatsApp;
5. confirmar roteamento atual.

Só avançar quando todas as caixas ativas estiverem provisionadas.

- [ ] **Step 7: Implantar enforcement**

Deploy:

```powershell
npx supabase functions deploy webhook-whatsapp-inbox --project-ref ouqwbbermlzqqvtqwlul --no-verify-jwt
```

O `--no-verify-jwt` é necessário apenas porque o provedor não envia Supabase JWT; a segurança passa a ser o segredo por caixa no código.

- [ ] **Step 8: Testar matriz**

Para uma caixa controlada:

- sem segredo → `401`, zero writes;
- segredo aleatório → `403`, zero writes;
- segredo válido de outra caixa → `403`, zero writes;
- segredo válido → `200`, uma única mensagem;
- duplicata → `200`, nenhuma nova linha.

- [ ] **Step 9: Critério de rollback**

Se uma caixa real parar:

1. não remover a autenticação global por reflexo;
2. conferir se a caixa tem hash e URL atual;
3. rotacionar somente a caixa afetada;
4. se necessário, reimplantar temporariamente a versão imediatamente anterior do webhook, mantendo a redução de logs;
5. registrar a janela de compatibilidade e concluir a rotação antes de reativar enforcement.

- [ ] **Step 10: Commit do runbook**

```powershell
git add -- docs/runbooks/webhook-inbound-secret-rollout.md
git commit -m "docs: registrar rollout seguro do webhook inbound"
```

## Task 6: Refatorar ingestão de evasão para eventos append-only

> **Pré-requisito de execução:** concluir primeiro a Task 7 (roteamento da
> pesquisa pós-1ª aula), ainda que ela apareça abaixo por continuidade histórica
> do documento. A mudança entra com compatibilidade por pesquisa; nenhuma
> conversa aberta troca de motor.

**Files:**

- Create: `supabase/functions/webhook-whatsapp-inbox/evasao.ts`
- Create: `supabase/functions/webhook-whatsapp-inbox/evasao.test.ts`
- Modify: `supabase/functions/webhook-whatsapp-inbox/index.ts`
- Create: `supabase/migrations/20260801190000_pesquisa_evasao_multipartes_constraints.sql`
- Create: `supabase/migrations/20260801190500_pesquisa_evasao_multipartes_ativacao_novas.sql`
- Create: `tests/pesquisaEvasaoMultipartesSchema.test.mjs`

- [ ] **Step 1: Escrever testes vermelhos de resolução**

Casos:

- match por mensagem citada;
- match por única pesquisa aberta no mesmo telefone/caixa;
- nenhum match → evento sem pesquisa e triagem;
- dois matches → ambígua;
- outro telefone nunca usa um estado ativo qualquer;
- duas caixas com mesmo telefone não se misturam;
- mensagem duplicada não cria evento;
- `fromMe` não vira resposta do aluno.

- [ ] **Step 2: Escrever testes vermelhos de estado**

Casos:

- em pesquisa `multipartes_v2`, primeiro texto cria evento e muda para `coletando`;
- segundo texto cria segunda linha, sem sobrescrever a primeira;
- texto + áudio + texto preserva timestamps e ordem;
- parte não substantiva continua `coletando`;
- conteúdo substantivo atualiza `ultima_interacao_em`;
- mensagem após revisão cria nova versão de análise;
- janela expirada não é associada silenciosamente.
- pesquisa `legado_v1` continua no caminho atual, sem escrever nas tabelas multipartes;
- uma pesquisa aberta antes do corte nunca muda automaticamente de versão.

- [ ] **Step 3: Implementar tipos e adapters**

Separar funções puras:

```ts
export function normalizarEventoUazapi(payload: unknown): EventoInbound;
export function classificarSubstantividade(texto: string | null):
  'adiamento' | 'abertura' | 'conteudo_substantivo' | 'opt_out' | 'indeterminado';
export async function resolverPesquisa(
  event: EventoInbound,
  repository: PesquisaRepository,
): Promise<ResolucaoPesquisa>;
export async function ingerirEvento(
  event: EventoInbound,
  resolution: ResolucaoPesquisa,
  repository: PesquisaRepository,
): Promise<IngestResult>;
```

`index.ts` fica como roteador; a regra de evasão vai para `evasao.ts`.

- [ ] **Step 4: Fortalecer constraints**

Em uma nova migração aditiva, sem reescrever a migração já implantada por A:

- unique parcial para pesquisa aberta por `(caixa_id, telefone_destino_snapshot)` em produção;
- verificar e preservar o unique já existente `(caixa_id, provider_message_id)` nas mensagens;
- adicionar em `pesquisa_evasao` a coluna `resposta_ingestao_versao text not null default 'legado_v1'` com check em `('legado_v1','multipartes_v2')`;
- manter todas as linhas existentes em `legado_v1`;
- trigger impede `UPDATE/DELETE` de conteúdo original;
- campos de processamento não sobrescrevem texto/áudio;
- `resolution_status in ('resolvida','sem_pesquisa','ambigua')`;
- `substantividade` inclui `opt_out`.

- [ ] **Step 5: Implementar persistência**

Para cada evento válido:

1. resolver a pesquisa sem fallback global;
2. se `resposta_ingestao_versao='legado_v1'`, executar exatamente o caminho atual e não tocar nas tabelas multipartes;
3. se `multipartes_v2`, tentar insert idempotente;
4. se duplicado, retornar `duplicate`;
5. vincular quando inequívoco;
6. atualizar somente timestamps/status do cabeçalho;
7. manter `pesquisa_evasao.resposta_texto/audio_url` como compatibilidade derivada, sem ser fonte canônica;
8. nunca marcar `respondido` no primeiro fragmento.

- [ ] **Step 6: Executar testes**

```powershell
deno test supabase/functions/webhook-whatsapp-inbox/evasao.test.ts
node --test tests/pesquisaEvasaoMultipartesSchema.test.mjs tests/pesquisaEvasaoCanonica.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- supabase/functions/webhook-whatsapp-inbox/evasao.ts supabase/functions/webhook-whatsapp-inbox/evasao.test.ts supabase/functions/webhook-whatsapp-inbox/index.ts supabase/migrations/20260801190000_pesquisa_evasao_multipartes_constraints.sql tests/pesquisaEvasaoMultipartesSchema.test.mjs
git commit -m "feat: registrar conversa de evasao em eventos"
```

- [ ] **Step 8: Ativar primeiro somente uma pesquisa de teste**

Sem alterar o default, selecionar uma pesquisa `modo_teste=true`, sem resposta
anterior e no número interno autorizado. Marcar somente essa linha como
`multipartes_v2`, executar o roteiro multipartes completo e conferir que
nenhuma pesquisa `legado_v1` recebeu evento.

- [ ] **Step 9: Ativar V2 apenas para novas pesquisas**

Depois do aceite do modo teste e em janela separada, aplicar
`20260801190500_pesquisa_evasao_multipartes_ativacao_novas.sql`, que altera
somente o default de `resposta_ingestao_versao` para `multipartes_v2`. Não
atualizar linhas existentes. O verificador deve provar que pesquisas abertas
antes da migration permanecem `legado_v1`.

## Task 7: Preservar explicitamente a pesquisa pós-1ª aula

**Files:**

- Modify: `supabase/functions/webhook-whatsapp-inbox/index.ts`
- Create: `supabase/functions/webhook-whatsapp-inbox/routing.test.ts`
- Create: `tests/webhookPesquisaPrimeiraAulaRegression.test.mjs`

- [ ] **Step 1: Escrever teste vermelho de roteamento**

Com payload autenticado contendo `buttonOrListid`:

- chama `processar-resposta-pesquisa` exatamente uma vez;
- continua gravando a mensagem na inbox;
- não é engolido por estado de evasão do mesmo telefone;
- payload duplicado não grava nota duas vezes;
- botão desconhecido continua na inbox e é ignorado pelo processador de nota;
- falha no processador de nota não impede a inbox, mas gera diagnóstico sanitizado.

- [ ] **Step 2: Reordenar o roteamento**

O encaminhamento pós-1ª aula deve ocorrer para todo `buttonOrListid` autenticado antes de qualquer `continue` específico da evasão:

```ts
const primeiraAula = msg.buttonOrListid
  ? await encaminharPesquisaPrimeiraAula(payload, supabase)
  : { handled: false };

const evasao = await ingerirRespostaEvasao(...);

// O registro normal da inbox continua.
```

Não expor `buttonOrListid` em log de texto.

- [ ] **Step 3: Validar a Edge interna**

Manter `processar-resposta-pesquisa` com `verify_jwt=true`. A invocação interna pelo cliente service role continua autorizada; não abrir a função diretamente ao provedor.

- [ ] **Step 4: Executar testes**

```powershell
deno test supabase/functions/webhook-whatsapp-inbox/routing.test.ts
node --test tests/webhookPesquisaPrimeiraAulaRegression.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- supabase/functions/webhook-whatsapp-inbox/index.ts supabase/functions/webhook-whatsapp-inbox/routing.test.ts tests/webhookPesquisaPrimeiraAulaRegression.test.mjs
git commit -m "fix: preservar resposta da pesquisa de primeira aula"
```

## Task 8: Tratar áudio e transcrição sem perder o evento

**Files:**

- Create: `supabase/functions/transcrever-mensagem-evasao/index.ts`
- Create: `supabase/functions/transcrever-mensagem-evasao/contract.ts`
- Create: `supabase/functions/transcrever-mensagem-evasao/contract.test.ts`
- Modify: `supabase/functions/webhook-whatsapp-inbox/evasao.ts`
- Modify: `supabase/config.toml`
- Create: `tests/pesquisaEvasaoAudioLifecycle.test.mjs`

- [ ] **Step 1: Escrever testes vermelhos**

Cobrir:

- evento de áudio é salvo antes da transcrição;
- status inicial `pendente`;
- sucesso cria versão com texto;
- falha cria versão `falhou` com código sanitizado;
- áudio vazio/falha não marca resposta pronta;
- reexecução é idempotente;
- storage path é privado;
- logs não contêm URL nem transcrição;
- somente service role pode invocar worker.

- [ ] **Step 2: Persistir primeiro, processar depois**

O inbound:

1. grava `pesquisa_evasao_mensagens`;
2. cria transcrição v1 `pendente`;
3. invoca `transcrever-mensagem-evasao` com `mensagem_id`;
4. retorna ao provedor sem esperar processamento longo.

O worker carrega credenciais e mídia pelo ID interno. Não recebe URL de mídia arbitrária do request.

- [ ] **Step 3: Implementar versionamento**

Transições permitidas:

```text
pendente -> processando -> concluida
pendente -> processando -> falhou
falhou -> nova versao pendente
```

Não atualizar texto da versão concluída.

- [ ] **Step 4: Configurar JWT**

```toml
[functions.transcrever-mensagem-evasao]
verify_jwt = true
```

Não permitir chamada anônima.

- [ ] **Step 5: Executar testes**

```powershell
deno test supabase/functions/transcrever-mensagem-evasao/contract.test.ts
node --test tests/pesquisaEvasaoAudioLifecycle.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- supabase/functions/transcrever-mensagem-evasao/index.ts supabase/functions/transcrever-mensagem-evasao/contract.ts supabase/functions/transcrever-mensagem-evasao/contract.test.ts supabase/functions/webhook-whatsapp-inbox/evasao.ts supabase/config.toml tests/pesquisaEvasaoAudioLifecycle.test.mjs
git commit -m "feat: transcrever audio de evasao de forma assincrona"
```

## Task 9: Consolidar rajadas e preparar revisão

**Files:**

- Create: `supabase/migrations/20260801191500_pesquisa_evasao_consolidacao_worker.sql`
- Create: `supabase/functions/processar-conversa-evasao/index.ts`
- Create: `supabase/functions/processar-conversa-evasao/contract.ts`
- Create: `supabase/functions/processar-conversa-evasao/contract.test.ts`
- Modify: `supabase/config.toml`
- Create: `tests/pesquisaEvasaoConsolidacao.test.mjs`

- [ ] **Step 1: Escrever testes vermelhos das janelas**

Casos com relógio injetado:

- 59s sem silêncio: não consolida rajada;
- 60s: cria consolidação provisória;
- 14m59s: continua coletando;
- 15m com conteúdo substantivo: pronta para revisão;
- transcrição pendente: continua coletando;
- só adiamento/abertura: continua coletando;
- nova parte antes de revisão substitui apenas consolidação derivada;
- nova parte após revisão cria versão nova;
- sete dias sem conteúdo válido: `expirada`;
- opt-out: não entra no worker de conteúdo.

- [ ] **Step 2: Criar claim atômico**

Tabela/função de fila:

```text
pesquisa_evasao_processamento:
pesquisa_id, executar_apos, motivo, tentativas,
locked_at, locked_by, ultimo_erro, updated_at
```

RPC service-only:

```sql
claim_pesquisas_evasao_processamento(
  p_worker_id uuid,
  p_limite integer
)
```

Usar `FOR UPDATE SKIP LOCKED`. Um evento novo faz upsert de `executar_apos = now() + interval '60 seconds'`.

- [ ] **Step 3: Implementar consolidação determinística**

Ordenar por:

```text
coalesce(provider_created_at, recebido_em), criado_em, id
```

Usar:

- texto original para mensagem textual;
- última transcrição concluída para áudio;
- marcador `[áudio pendente]` apenas na UI, nunca como conteúdo oficial;
- separador com timestamp/tipo sem inventar narrativa.

Persistir em `pesquisa_evasao_analises` uma versão com `status='rascunho'`.

- [ ] **Step 4: Agendar worker**

Executar a cada minuto via `pg_cron`/`pg_net`, com segredo interno já usado no projeto. Registrar job name e impedir duplicação de cron na migração.

Edge:

```toml
[functions.processar-conversa-evasao]
verify_jwt = true
```

- [ ] **Step 5: Executar testes**

```powershell
deno test supabase/functions/processar-conversa-evasao/contract.test.ts
node --test tests/pesquisaEvasaoConsolidacao.test.mjs
npx supabase db lint --local
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- supabase/migrations/20260801191500_pesquisa_evasao_consolidacao_worker.sql supabase/functions/processar-conversa-evasao/index.ts supabase/functions/processar-conversa-evasao/contract.ts supabase/functions/processar-conversa-evasao/contract.test.ts supabase/config.toml tests/pesquisaEvasaoConsolidacao.test.mjs
git commit -m "feat: consolidar respostas multipartes de evasao"
```

## Task 10: Implementar recusa/opt-out

**Files:**

- Modify: `supabase/functions/webhook-whatsapp-inbox/evasao.ts`
- Modify: `supabase/functions/webhook-whatsapp-inbox/evasao.test.ts`
- Modify: `supabase/functions/enviar-pesquisa-evasao/index.ts`
- Create: `tests/pesquisaEvasaoOptOut.test.mjs`

- [ ] **Step 1: Escrever testes vermelhos**

Frases explícitas iniciais:

```text
não quero responder
nao quero responder
não me mande mais mensagens
pare de mandar mensagem
remova meu número
```

Casos:

- texto exato/variação inequívoca → `recusada_opt_out`;
- “não quero responder agora, amanhã falo” → adiamento, não opt-out;
- áudio não recebe opt-out automático só pela transcrição ambígua;
- evento original permanece;
- `resposta_valida=false`;
- confirmação de novo envio para a mesma pesquisa retorna `409`;
- worker não cria análise de motivos;
- opt-out não altera consentimentos de outros domínios sem decisão jurídica/produto específica.

- [ ] **Step 2: Implementar regra conservadora**

Somente padrões explícitos e de alta precisão produzem opt-out automático. Casos incertos ficam `coletando` e recebem flag de revisão.

Ao confirmar:

```text
resposta_status = recusada_opt_out
opt_out_em = now()
opt_out_provider_message_id = ...
```

Não responder automaticamente ao contato nesta fase.

- [ ] **Step 3: Bloquear reenvio**

Na Edge de envio, antes de gerar/confirmar preview:

- negar a pesquisa atual em `recusada_opt_out`;
- exibir motivo seguro para a equipe;
- não criar lembrete;
- não transformar em `respondido`.

- [ ] **Step 4: Testar**

```powershell
deno test supabase/functions/webhook-whatsapp-inbox/evasao.test.ts
node --test tests/pesquisaEvasaoOptOut.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- supabase/functions/webhook-whatsapp-inbox/evasao.ts supabase/functions/webhook-whatsapp-inbox/evasao.test.ts supabase/functions/enviar-pesquisa-evasao/index.ts tests/pesquisaEvasaoOptOut.test.mjs
git commit -m "feat: respeitar opt-out da pesquisa de evasao"
```

## Task 11: Exibir conversa, estados e fila de revisão

**Files:**

- Create: `src/components/App/SucessoCliente/ConversaPesquisaEvasao.tsx`
- Create: `src/components/App/SucessoCliente/FilaRevisaoEvasao.tsx`
- Modify: `src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx`
- Modify: `src/components/App/SucessoCliente/pesquisaEvasao.types.ts`
- Create: `supabase/migrations/20260801193000_pesquisa_evasao_revisao_rpcs.sql`
- Create: `tests/pesquisaEvasaoConversaFrontend.test.mjs`

- [ ] **Step 1: Escrever testes vermelhos**

Exigir:

- timeline mostra cada parte, tipo e horário;
- texto e áudio aparecem na ordem;
- áudio pendente/falhou é visível sem marcar conclusão;
- adiamento aparece como interação não válida;
- opt-out aparece como recusa e sem botão reenviar;
- ambiguidade aparece em triagem;
- consolidação é separada dos eventos;
- usuário interno ativo pode revisar em qualquer unidade;
- usuário autenticado sem vínculo interno ativo não recebe dados via RPC;
- roles de agente não recebem acesso direto às tabelas privadas.

- [ ] **Step 2: Criar RPCs governadas**

```text
get_conversa_pesquisa_evasao(p_pesquisa_id uuid)
listar_pesquisas_evasao_revisao(p_unidade_id uuid, p_status text, p_limite int, p_offset int)
iniciar_revisao_pesquisa_evasao(p_pesquisa_id uuid)
concluir_revisao_pesquisa_evasao(p_analise_id uuid, p_texto_consolidado text)
resolver_mensagem_evasao_ambigua(p_mensagem_id uuid, p_pesquisa_id uuid)
```

Regras:

- `get/listar` exigem `fn_pesquisa_evasao_usuario_interno_ativo()`;
- iniciar/concluir/triagem exigem usuário interno ativo e registram o operador;
- unidade é filtro de consulta, não gate de autorização;
- `search_path` fixo;
- grants só a `authenticated` e `service_role`;
- sem acesso de `anon`;
- revisão guarda usuário e timestamp;
- texto original não é alterado.

- [ ] **Step 3: Implementar componentes**

`ConversaPesquisaEvasao.tsx`:

- eventos cronológicos;
- player por URL assinada obtida sob demanda;
- transcrição com status;
- consolidação versionada;
- badge `coletando`, `pronta`, `em revisão`, `revisada`, `opt-out`;
- sem telefone integral.

`FilaRevisaoEvasao.tsx`:

- filtros por unidade/status;
- paginação;
- idade da fila;
- transcrição pendente;
- ambiguidade;
- ação “Iniciar revisão”.

- [ ] **Step 4: Executar testes e build**

```powershell
node --test tests/pesquisaEvasaoConversaFrontend.test.mjs
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- src/components/App/SucessoCliente/ConversaPesquisaEvasao.tsx src/components/App/SucessoCliente/FilaRevisaoEvasao.tsx src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx src/components/App/SucessoCliente/pesquisaEvasao.types.ts supabase/migrations/20260801193000_pesquisa_evasao_revisao_rpcs.sql tests/pesquisaEvasaoConversaFrontend.test.mjs
git commit -m "feat: adicionar fila de revisao da evasao"
```

## Task 12: Verificação end-to-end e rollout de B

**Files:**

- Create: `docs/runbooks/pesquisa-evasao-subprojeto-b-rollout.md`
- Modify: `scripts/verify-webhook-inbound-security.sql`

- [ ] **Step 1: Rodar suíte completa**

```powershell
deno test supabase/functions/webhook-whatsapp-inbox/diagnostics.test.ts supabase/functions/webhook-whatsapp-inbox/auth.test.ts supabase/functions/webhook-whatsapp-inbox/evasao.test.ts supabase/functions/webhook-whatsapp-inbox/routing.test.ts supabase/functions/configurar-webhook-caixa/contract.test.ts supabase/functions/transcrever-mensagem-evasao/contract.test.ts supabase/functions/processar-conversa-evasao/contract.test.ts
node --test tests/webhookWhatsAppPrivacidade.test.mjs tests/webhookInboundSecurityMigration.test.mjs tests/whatsappCaixasCredenciaisPrivadas.test.mjs tests/webhookInboundAuthWiring.test.mjs tests/webhookProvisioningSecurity.test.mjs tests/pesquisaEvasaoMultipartesSchema.test.mjs tests/webhookPesquisaPrimeiraAulaRegression.test.mjs tests/pesquisaEvasaoAudioLifecycle.test.mjs tests/pesquisaEvasaoConsolidacao.test.mjs tests/pesquisaEvasaoOptOut.test.mjs tests/pesquisaEvasaoConversaFrontend.test.mjs
npm run build
npx supabase db lint --local
```

Expected: tudo PASS.

- [ ] **Step 2: Testar conversa real controlada**

Em número interno autorizado e sem conversa familiar em andamento na mesma caixa:

1. enviar pesquisa em modo teste;
2. responder “eu te respondo amanhã”;
3. confirmar `coletando` e resposta válida `false`;
4. enviar texto;
5. enviar áudio;
6. enviar segundo texto;
7. confirmar três eventos na ordem;
8. aguardar transcrição;
9. após 15 minutos de silêncio, confirmar `pronta_para_revisao`;
10. revisar;
11. enviar continuação;
12. confirmar nova versão.

- [ ] **Step 3: Testar opt-out**

Em outra pesquisa de teste:

1. responder “não quero responder, não me mande mais mensagens”;
2. confirmar `recusada_opt_out`;
3. confirmar que taxa válida não aumenta;
4. tentar gerar nova prévia;
5. confirmar bloqueio.

- [ ] **Step 4: Testar pesquisa pós-1ª aula**

Executar um clique real controlado:

- inbound autenticado recebe `buttonOrListid`;
- `processar-resposta-pesquisa` atualiza `pesquisas_whatsapp`;
- mensagem permanece na inbox;
- uma única nota é gravada;
- nenhum payload/telefone/texto aparece em log.

- [ ] **Step 5: Testar caixas e fluxos não relacionados**

Smoke:

- inbound admin;
- inbound CRM;
- mensagem `fromMe` administrativa;
- status update;
- reação;
- edição;
- mídia;
- duplicata;
- health autenticado.

- [ ] **Step 6: Conferir privacidade**

Verificar:

```sql
select count(*) from public.webhook_debug_log;

select count(*)
from public.webhook_diagnosticos_sanitizados
where occurred_at < now() - interval '7 days';
```

Expected: `0` nas duas consultas. A tabela sanitizada não possui coluna de
payload ou texto livre a ser pesquisada.

Confirmar também:

- usuário authenticated comum continua sem ler `webhook_debug_log` nem `webhook_diagnosticos_sanitizados` — preservação de uma barreira já existente, não correção da causa principal;
- Sol, Mila, Fabio e Lia não leem conversa privada diretamente;
- URLs de áudio exigem assinatura;
- segredo bruto não existe no banco.

- [ ] **Step 7: Rollout**

Ordem final por janelas:

1. **B0a:** redução de logs de execução; smoke dos fluxos atuais; parar e reportar;
2. **B0b:** antes da escrita, contar `webhook_debug_log` sem ler `payload` e
   exigir contagem maior que zero em produção; aplicar a migração, conferir no
   `NOTICE` a mesma contagem dinâmica `N` e verificar `N → 0`; contagem zero é
   aceita apenas em banco descartável/de ensaio e deve aparecer explicitamente
   como `expurgo ignorado`; parar e reportar;
3. **B1a:** health/configurador e provisionamento de todas as caixas sem enforcement;
4. **B1b:** enforcement inbound e matriz HTTP; parar e reportar;
5. **B2a:** corrigir ordem do pós-1ª aula e publicar Edge compatível V1/V2;
6. **B2b:** schema multipartes com existentes em `legado_v1`; testar uma única pesquisa `modo_teste` em `multipartes_v2`; parar e reportar;
7. **B2c:** transcrição, consolidação e opt-out em modo teste; parar e reportar;
8. **B3a:** alterar somente o default de novas pesquisas para `multipartes_v2`;
9. **B3b:** publicar UI de revisão, executar smoke sem envio adicional e monitorar por pelo menos uma hora.

A retirada das credenciais de `whatsapp_caixas` do frontend não aparece como
passo porque já foi concluída. Em B2/B3, nenhuma linha `legado_v1` pode ser
migrada em massa.

- [ ] **Step 8: Critério de parada**

Parar se:

- qualquer caixa ativa não tiver hash;
- pós-1ª aula não atualizar nota;
- inbox admin/CRM perder mensagem;
- duplicata criar dois eventos;
- opt-out contar como resposta;
- áudio falho marcar revisão pronta;
- usuário autenticado sem vínculo interno ativo ler conteúdo;
- payload bruto reaparecer em log.

- [ ] **Step 9: Registrar evidência**

Runbook deve conter:

- commits e versões;
- migrations;
- caixas validadas apenas por ID/nome;
- matriz HTTP `400/401/403/200`;
- IDs internos dos eventos de teste;
- resultado dos smoke tests;
- resultado da busca de PII em debug;
- responsável e horário;
- rollback versionado.

- [ ] **Step 10: Commit**

```powershell
git add -- docs/runbooks/pesquisa-evasao-subprojeto-b-rollout.md scripts/verify-webhook-inbound-security.sql
git commit -m "docs: fechar rollout da conversa multipartes"
```

## Definition of Done

- [ ] Webhook sem segredo válido é rejeitado antes da service role.
- [ ] Cada caixa ativa possui segredo próprio e apenas hash no banco.
- [ ] Health check exige segredo interno separado.
- [ ] Configurador de webhook exige usuário administrativo autorizado.
- [ ] Tokens UAZAPI/WAHA não são mais legíveis diretamente pelo frontend.
- [ ] Payload bruto legado foi expurgado.
- [ ] Logs persistidos/execução não contêm texto, telefone, mídia ou segredo.
- [ ] Retenção do diagnóstico sanitizado é de no máximo sete dias.
- [ ] Texto e áudio são eventos separados, ordenados e idempotentes.
- [ ] Primeira interação não encerra automaticamente a pesquisa.
- [ ] Adiamento não conta como resposta válida.
- [ ] Opt-out bloqueia reenvio/lembrete e não conta como resposta válida.
- [ ] Transcrição falha não perde áudio nem conclui resposta.
- [ ] Ambiguidade vai para triagem.
- [ ] Pesquisa pós-1ª aula continua atualizando a nota.
- [ ] Inbox administrativa, CRM, status, reação, edição e mídia passam nos smokes.
- [ ] RLS e RPCs permitem leitura/revisão a usuário interno ativo, sem gate por unidade, e bloqueiam acesso direto dos roles de agente.
- [ ] Pesquisas abertas antes do corte permanecem `legado_v1`; somente novas pesquisas após a ativação usam `multipartes_v2`.
- [ ] Testes, build e lint passam com evidência registrada.
