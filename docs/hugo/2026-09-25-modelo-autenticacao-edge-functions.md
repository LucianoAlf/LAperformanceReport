# Por que `verify_jwt` não é autenticação — e como cada edge deve checar

Documento de apoio à varredura `2026-09-25-edge-functions-verify-jwt-varredura.md`.
Escrito para quem vai auditar/corrigir em outro repositório (Hugo / la-teacher / n8n).

## O modelo de ameaça em 3 fatos

1. **A chave `anon` do Supabase é pública.** Ela vai dentro do bundle JS do app
   (qualquer um extrai do DevTools). Logo, `apikey: <anon>` não identifica ninguém.
2. **`verify_jwt=true` no gateway só exige "algum JWT válido".** O gateway aceita
   o token de sessão de QUALQUER usuário logado — inclusive perfil `professor`
   (11 ativos, 7 logaram nos últimos 30 dias) — e não sabe se aquele usuário pode
   usar aquela função.
3. **`verify_jwt=false` deixa o endpoint totalmente aberto.** Sem checagem no
   código, qualquer anônimo na internet chama a função.

Conclusão: quem decide é **o código da função**. O gateway é só a porta; a
autorização mora dentro.

## O que um atacante anônimo consegue hoje (estado antes das correções)

- `POST /functions/v1/webhook-whatsapp-inbox?caixa_id=99999` com payload forjado
  retornava **200** e injetava "mensagens" no CRM — disparando Mila (LLM pago),
  respostas automáticas no WhatsApp, pesquisas e transcrição. **Corrigido:**
  segredo por caixa + enforcement (forjado → 401).
- `POST /functions/v1/gemini-insights` (e 9 outras de IA) sem nenhum header:
  cada chamada queima tokens do Gemini/OpenAI da empresa.
- `POST /functions/v1/enviar-campanha` com `{"campanha_id": X}` dispara envio
  real de campanha Meta em execução.
- `POST /functions/v1/lojinha-enviar-comprovante` / `-relatorio-professor` /
  `-alerta-estoque` / `relatorio-coordenacao-whatsapp`: envia mensagem WhatsApp
  (texto em parte controlado pelo payload) pelo número oficial da escola.
- `POST /functions/v1/meta-webhook-campanhas` com JSON no formato da Meta:
  processado como se fosse evento real (resposta automática de agente, status
  de campanha) — sem verificação de assinatura.
- `POST /functions/v1/monitor-saude-webhook`: inspecionava provedores e mandava
  alerta no WhatsApp do admin. **Corrigido.**
- `debug-webhook-emusys-observador`: se `OBSERVADOR_TOKEN` ficasse vazio em algum
  deploy, liberava tudo. **Corrigido: vazio = 401.**

## Os três modelos de autenticação aceitos

Escolher por **quem chama**:

| Caller | Modelo | Implementação |
|---|---|---|
| Usuário no app (front chama `supabase.functions.invoke`) | JWT do usuário + cadastro ativo + perfil/permissão da tela | `autorizarEquipe` ou equivalente |
| Cron pg_cron / n8n / script interno | Segredo dedicado (`x-sync-token`) ou `service_role` | comparar header com valor do vault/env — falha fechada se env vazio |
| Provedor externo (UAZAPI, Meta, WAHA, Emusys) | Segredo por webhook ou assinatura do provedor | `webhook_secret` na URL (hash no DB) ou `X-Hub-Signature-256` |

### A receita pronta (já usada em produção)

`supabase/functions/_shared/equipeAuthorization.ts` — `autorizarEquipe(req, deps)`:

```ts
const acesso = await autorizarEquipe(req, {
  syncAdminToken: Deno.env.get('SYNC_MATRICULAS_ADMIN_TOKEN')?.trim() ?? '',
  serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
  getUser: async (token) => { /* admin.auth.getUser(token) -> {id} | null */ },
  buscarUsuario: async (authUserId) => { /* usuarios: perfil, ativo por auth_user_id */ },
});
if (acesso.ok === false) return json({ erro: acesso.erro }, acesso.status);
```

Ordem de aceite: `x-sync-token` == SYNC_MATRICULAS_ADMIN_TOKEN → bearer ==
service_role → bearer JWT de usuário com `usuarios.ativo=true` e perfil
`admin`/`unidade`. Retorna 401 sem credencial válida, 403 com usuário válido
sem papel.

**Atenção ao detalhe que muda tudo:** usuários de perfil `professor` usam este
app (7 logaram em 30 dias). Antes de exigir `admin/unidade`, conferir se a tela
chamadora é acessível a professor — se for, a regra certa é "usuário ativo +
permissão da tela", não "admin/unidade". Telas envolvidas no lote pendente:
insights de Metas/Simulador, PlanoAcaoRetencao/Comercial, ModalDetalhesProfessor,
PlanoAcaoEquipe, ModalRelatorioCoordenacao, ModalDetalhesSucessoAluno,
ModalEditarAgente, Lojinha (4 tabs), Campanhas, CalendarioEscolar/FeriadosSection.

### Segredo de provedor (padrão webhook-whatsapp-inbox)

- segredo aleatório 32 bytes → na URL do webhook do provedor (`?webhook_secret=`);
- no banco só o **SHA-256** (`whatsapp_caixa_webhook_secrets` + RPC
  `validar_webhook_caixa_hash`); o valor bruto nunca é persistido;
- env `WEBHOOK_INBOUND_SECRET_ENFORCEMENT=true` liga a exigência — rollout: só
  depois de provisionar CADA caixa com webhook efetivo apontando pro endpoint
  (medido no provedor, não no registro local — caixas 7/8/9 apontam pro
  crmchat e NÃO batem no inbox);
- `_health=1` exige `x-health-secret` separado (`WEBHOOK_HEALTH_TOKEN`) pro
  monitor não depender do segredo de caixa.

### Meta webhook (meta-webhook-campanhas)

`numeros_meta.app_secret` está cadastrado. A correção é ler o corpo **bruto**,
calcular `HMAC-SHA256(secret, body)` e comparar com o header
`X-Hub-Signature-256` (`sha256=<hex>`). Aceitar se bater com o app_secret de
qualquer número ativo. Sem app_secret configurado → fail-closed (503/rejeita),
nunca fail-open. Manter o GET de verificação por `hub.verify_token` como está.

## O que NÃO fazer (todos já encontrados na base)

- `if (!TOKEN_ESPERADO) return true` — env vazia abre o endpoint. Sempre
  fail-closed: sem segredo configurado, tudo 401/503.
- Confiar em `caixa_id`/parâmetro como se fosse credencial.
- Confiar no `verify_jwt` do `config.toml` como documentação — só ~31 das 87
  estão lá; o resto foi publicado sem registro e um deploy futuro pode resetar
  para `true` e matar integrações (o cron passa a levar 401 no gateway e o
  pg_cron marca "succeeded" mesmo assim — falha silenciosa).
- Devolver o segredo ou o hash em resposta/log.
- Acreditar no registro local de webhook_url — medir SEMPRE no provedor
  (GET /webhook UAZAPI, GET /api/sessions WAHA).

## Protocolo por correção (o que conta como "fechada")

1. Teste que falha sem a correção (Deno.test no módulo do contrato/auth).
2. `deno check` na função.
3. Deploy: `supabase functions deploy <fn> --project-ref ouqwbbermlzqqvtqwlul --use-api`
   (`--use-api` porque o bundler Docker trava neste ambiente).
4. Prova ao vivo: anônimo → 401/403; usuário comum sem papel → 403;
   caminho legítimo → 200 (replay de cron via `net.http_post` com segredo do
   vault mantém o segredo dentro do banco).
5. Tráfego real confirmado nos logs (`function_edge_logs`, `automacao_log`).
6. Commit.

## Callers que vão quebrar ao fechar (atualizar para x-sync-token)

Medido em `function_edge_logs` (24h): `classificar-desinteresse` recebe ~14
chamadas/dia de `curl/8.5.0` IP 89.116.73.186 sem Authorization;
`sync-students-studio` ~3/dia de `pg_net/0.19.5` (origem Postgres — achar o job
ou RPC que dispara); `agente-webhook` sem tráfego. Antes de deployar o auth,
o caller precisa mandar `x-sync-token: <SYNC_MATRICULAS_ADMIN_TOKEN>` —
a secret já existe no vault (`sync_matriculas_admin_token`) e como env nas
funções.

## Checklist de encerramento do programa

- [ ] ~20 brechas do front fechadas (respeitando o mapa de permissões por tela)
- [ ] 3 callers externos com `x-sync-token` + auth deployada
- [ ] `meta-webhook-campanhas` validando X-Hub-Signature-256
- [ ] `perfil-professor` decidido (token por professor ou aceitar público)
- [ ] `config.toml` documentando TODAS as verify_jwt=false intencionais
- [ ] 15 funções fora do repo auditadas no repositório de origem
- [ ] Revisão nominal das "176 funções executáveis por anon" (postgrest) —
      escopo separado mas mesma lógica
