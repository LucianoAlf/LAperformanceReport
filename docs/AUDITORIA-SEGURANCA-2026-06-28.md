# 🔒 Auditoria de Segurança — LA Music Performance Report

**Data:** 2026-06-28
**Escopo:** banco/RLS (662 advisors Supabase), 67 edge functions, frontend `src/`, segredos no git, dependências npm.
**Modo:** somente leitura — nenhuma alteração aplicada. Toda correção (RLS, policies, views, deploy de edge) exige aprovação antes de aplicar.

---

## Quadro geral

| Severidade | Qtd | Destaques |
|---|---|---|
| 🔴 CRÍTICO | 5 | Auto-promoção a admin; tokens Emusys no git; token UAZAPI no bundle; endpoints WhatsApp abertos; 29 tabelas sem RLS |
| 🟠 ALTO | 6 | 40 views SECURITY DEFINER; webhook Meta sem assinatura; buckets públicos; XSS; SQL-injection no BI; `xlsx` sem patch |
| 🟡 MÉDIO | 5 | `usuarios` SELECT público; 207 policies `true`; PII em logs; filter-injection PostgREST; 139 funções search_path |
| ⚪ BAIXO | 4 | senha-vazada off; extensões no public; `.env.branch` versionado; `rel` inconsistente |

---

## 🔴 CRÍTICO

### C1 — Escalonamento de privilégio: qualquer usuário vira admin *(confirmado no banco)*

`is_admin()` decide por `usuarios.perfil = 'admin'`. A policy de UPDATE de `usuarios` é:

```
USING (is_admin() OR auth_user_id = auth.uid())   -- sem WITH CHECK
```

`USING` controla **quais linhas** o usuário pode tocar; `WITH CHECK` controla **quais valores** pode gravar. Sem `WITH CHECK`, um usuário comum pode alterar qualquer campo da própria linha — inclusive `perfil`.

**Exploit** (usuário já logado, via console do navegador, usando a anon key que está no bundle):
```js
supabase.from('usuarios').update({ perfil: 'admin' }).eq('auth_user_id', <id dele>)
```
O banco aceita (é a linha dele) → vira admin. A UI esconder o botão não protege; quem protege é o RLS.

**Fix:** adicionar `WITH CHECK` impedindo não-admin de alterar `perfil` / `unidade_id` / `ativo`.

### C2 — Tokens de produção da API Emusys hardcoded no git *(confirmado)*

Funções `sync-professores-emusys`, `sync-presenca-emusys`, `sync-matriculas-emusys`, `marcos-jornada` contêm 3 tokens (CG/Barra/Recreio) em texto puro, versionados. Quem lê o repo controla a API Emusys das 3 unidades.

**Fix (2 partes):**
1. Mover para `Deno.env.get()` (secret do Supabase) e remover do código.
2. **Rotacionar os tokens no Emusys** — tirar do código não apaga do histórico do git; só a rotação invalida o que já vazou.
3. (Opcional) reescrever histórico (`git filter-repo`/BFG) para higiene total.

### C3 — Token UAZAPI exposto no bundle do frontend

`src/services/whatsapp.ts:22` lê `VITE_UAZAPI_TOKEN` e envia direto ao UAZAPI como header `token`. Todo `VITE_*` vira texto no JS do browser → qualquer um extrai e dispara WhatsApp em nome da escola. Módulo **em uso** (importado em `ChecklistDetail`, `DashboardTab`, `RecadosTab`, `ConfiguracoesView`).

**Fix:** mover o envio para uma edge function (modelos prontos: `enviar-vcard`, `enviar-mensagem-admin`). O front chama a edge autenticado; a edge guarda o token em `Deno.env.get('UAZAPI_TOKEN')`. Remover `VITE_UAZAPI_TOKEN` e o envio direto. Rotacionar o token se já foi a produção.

### C4 — Endpoints de mensagens de lead totalmente abertos *(verify_jwt confirmado = false)*

`enviar-mensagem-lead`, `editar-mensagem-lead`, `deletar-mensagem-lead`, `reagir-mensagem`, `enviar-mensagem-admin`, `transcrever-audio` estão com **`verify_jwt=false` + SERVICE_ROLE + sem checagem de auth interna**.

**Por que é brecha:** `verify_jwt` é o "porteiro" na entrada (false = qualquer um na internet chega ao código sem login). `service_role` é a "chave-mestra" usada dentro da função — ela **não protege a entrada**, é o poder que a função carrega. Com o porteiro desligado + sem conferir quem entrou, qualquer um que saiba a URL (visível na aba Network do navegador) executa a função com poder total: enviar/editar/apagar WhatsApp de leads e ler conversas.

**Nota:** `verify_jwt=false` é correto/necessário em webhooks (`webhook-whatsapp-inbox`, `meta-webhook-campanhas` — UAZAPI/Meta precisam chamar; ali a proteção é assinatura/secret) e aceitável quando há checagem interna (`admin-create-user`, `admin-update-password` validam admin por dentro — corretas). O problema é o conjunto false + service role + zero checagem.

**Fix:** `verify_jwt=true` nessas funções de mensagem, ou validar `auth.getUser()` + unidade dentro delas.

### C5 — 29 tabelas no schema público SEM RLS *(ERROR no advisor)*

Sem RLS + anon key pública = leitura/escrita por qualquer um. Inclui backups com PII e tabelas operacionais.

Habilitar RLS sem policy bloqueia tudo **exceto service role**. Por isso:

- **19 tabelas — seguro habilitar RLS** (frontend não acessa; só edges/service role):
  `*_backup_*`, `*_legacy_*`, `webhook_debug_log`, `matriculas_divergencias`, `matriculas_divergencias_decisoes`, `matriculas_campos_fixados`, `fila_relatorios_whatsapp`, `boas_vindas_enviadas`, `professores_emusys_divergencias`, `professores_sync_log`, `transferencias_mila`, `curso_emusys_depara`, `dados_mensais_retificacoes`, `competencias_bloqueios_log`, `loja_reservas`, `alunos_arquivados`.
  → os `*_backup_*` o ideal é **dropar** (lixo com PII).

- **10 tabelas — o frontend usa, precisam de policy JUNTO de habilitar RLS** (senão quebra a tela):
  `lead_experimentais` (5 arquivos), `leads_automacao_log` (4), `crm_templates_whatsapp` (3), `competencias_mensais` (2), `inventario_pendencias` (2), `emusys_sync_log`, `lead_experimentais_decisoes_humanas`, `projeto_config_permissoes`, `projeto_equipe_membros`, `whatsapp_config`.

---

## 🟠 ALTO

- **A1 — 40 views `SECURITY DEFINER`** ignoram o RLS do chamador. Várias com PII/cross-unidade: `vw_farmer_inadimplentes`, `vw_farmer_aniversariantes_hoje`, `vw_ltv_rede`, `vw_kpis_*`. **Fix:** recriar com `security_invoker=on` ou restringir grants.
- **A2 — Webhook Meta sem verificação de assinatura.** `meta-webhook-campanhas` valida `verify_token` no GET, mas o POST não checa `X-Hub-Signature-256` → mensagens inbound forjáveis acionam IA/autoreply. **Fix:** validar HMAC com App Secret.
- **A3 — 6 buckets públicos com listagem:** `crm-midia`, `whatsapp-media-campanhas`, `projeto-anexos`, `professor-videos`, `avatars`, `lojinha-produtos`. Mídia de conversa/anexos enumerável. **Fix:** desligar listagem; privar os com PII.
- **A4 — XSS via `dangerouslySetInnerHTML`.** `RelatorioAuditoria.tsx:169` injeta markdown de LLM sem escapar HTML (`formatMarkdown` só troca regex). Nome de aluno do Emusys + saída de IA = injeção plausível. **Fix:** DOMPurify.
- **A5 — SQL/tenant injection no BI agent.** `bi-agent-lamusic/tools.ts:498-525` interpola `coluna_banco`/`filtros_banco` crus em SQL; `filtros_banco` permite furar o `unidadeFilter` → vazar dados de outra unidade. **Fix:** allowlist de colunas, proibir filtro livre.
- **A6 — `npm audit`: 4 high.** `xlsx` (Prototype Pollution + ReDoS, **sem fix disponível**), `ws` (memory disclosure/DoS), `react-router`. **Fix:** migrar `xlsx` para a distribuição mantida da SheetJS ou isolar o parsing; `npm audit fix` cobre `ws`/router.

---

## 🟡 MÉDIO

- **M1 — `usuarios` SELECT `USING(true)`:** qualquer autenticado lê todos os usuários e emails.
- **M2 — 207 policies `rls_policy_always_true`:** revisar quais deveriam filtrar por unidade/dono.
- **M3 — PII em `console.log`:** telefone/payload em `webhook-whatsapp-inbox`; email em `AuthContext.tsx:244`.
- **M4 — Filter-injection PostgREST** via `.or()/.ilike` com termo de busca não sanitizado (`NovaConversaModal`, `TabAuditoria`, `FormRenovacao`). Limitado pelo RLS → médio.
- **M5 — 139 funções com `search_path` mutável** (hardening; risco de hijack).

---

## ⚪ BAIXO / Hardening

- **B1 — Proteção contra senha vazada desativada** no Auth (1 clique no dashboard).
- **B2 — Extensões `pg_net`/`pg_trgm`/`unaccent` no schema `public`.**
- **B3 — `.env.branch` versionado** (contém só URL + anon key — públicas; mas convém remover e adicionar ao `.gitignore`).
- **B4 — `target="_blank"` com `rel` inconsistente** em 2 pontos; `scripts/sync_nocodb_supabase.py:15` tem placeholder `SUPABASE_KEY=""`.

---

## Top 5 para agir primeiro

1. **C1** — `WITH CHECK` em `usuarios` (escalonamento de privilégio; trivial de explorar, fix pequeno).
2. **C2** — rotacionar + env os tokens Emusys.
3. **C4** — fechar os endpoints `*-mensagem-lead` (`verify_jwt`/auth interna).
4. **C5** — RLS nas 29 tabelas + dropar backups com PII (19 seguras; 10 exigem policy junto).
5. **C3** — tirar o token UAZAPI do frontend.

---

## Metodologia / evidências

- **Advisors:** `get_advisors(security)` → 69 ERROR (29 `rls_disabled_in_public` + 40 `security_definer_view`), 592 WARN, 1 INFO.
- **RLS auth:** inspeção de `pg_policy` em `usuarios`/`usuario_perfis`/`perfis`/`permissoes` + definição de `is_admin()`.
- **Edge functions:** `list_edge_functions` (verify_jwt real das 67) + leitura de padrões (service role, CORS, validação, assinatura de webhook).
- **Frontend:** varredura de `service_role`, `eyJ…`, `dangerouslySetInnerHTML`, `.or()`, `VITE_*`, `hasPermission`.
- **Tabelas sem RLS × uso no front:** grep de `.from('<tabela>')` em `src/`.
- **Dependências:** `npm audit --omit=dev`.
