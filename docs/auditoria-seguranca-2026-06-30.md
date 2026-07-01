# Auditoria de Segurança — LA Music Performance Report

> Data: 2026-06-30 · Fonte: Supabase advisor (657 lints, 100% security) + inspeção manual de RLS/policies/grants + grep do frontend.
> Projeto Supabase: `ouqwbbermlzqqvtqwlul`.
> Status: **diagnóstico fechado, correções pendentes**. Marcar cada item ao resolver.

## Sumário executivo

O modelo de segurança do Supabase confia 100% no RLS: o role `anon` (cuja chave é pública, embutida no bundle do navegador) e o `authenticated` têm grants amplos por padrão. Onde o RLS está desligado, ou onde a policy é `USING(true)`, **qualquer pessoa com a anon key lê/escreve/deleta**.

Achados principais:
- **29 tabelas sem RLS** expostas via PostgREST (PII, logs, governança, credenciais).
- **Tokens de terceiros legíveis** por anon/authenticated (UAZAPI, WAHA, Emusys, OpenAI, Meta).
- **109 funções `SECURITY DEFINER` chamáveis sem login** (`anon`), incl. `admin_update_user_password`.
- **207 policies `USING(true)`/`WITH CHECK(true)`** em 111 tabelas → RLS neutralizado.
- **40 views `vw_*` com `SECURITY DEFINER`** → ignoram o RLS do usuário (vazam cross-unidade).
- Token UAZAPI no bundle do front (`VITE_UAZAPI_TOKEN`).

---

## 🔥 CRÍTICO — fazer primeiro

### C1. Funções `SECURITY DEFINER` executáveis por `anon` (sem login)
109 funções `SECURITY DEFINER` são chamáveis pelo role `anon` via `/rest/v1/rpc/...`.
- [x] `admin_update_user_password` — **falso alarme**: valida `auth.uid()` + perfil admin internamente; é stub (não altera senha). Não explorável.
- [x] **5 funções de SQL arbitrário fechadas** (migration `20260630121000_seguranca_revoke_funcoes_sql_arbitrario.sql`): `exec_readonly_sql`, `executar_query_readonly`, `executar_query_auditoria`, `introspect_schema_lamusic` → só `service_role`; `execute_bi_query_lamusic` → `service_role`+`authenticated` (front BiAgentMetrics usa). Eram o vetor de dump do banco sem login.
- [x] **Investigado como o n8n autentica (2026-06-30):** o n8n **não** chama RPC por PostgREST/anon. Usa 3 vias, nenhuma dependente de grant `EXECUTE`: (1) **escrita via nó `postgres` conectando como o role `postgres`** (owner+bypassrls) — ex. `upsert_lead`, `INSERT leads_automacao_log`, `UPDATE leads`; (2) **edge functions via `httpRequest` → `/functions/v1/` com a anon key** (gateway, não `/rest/v1/rpc/`) — ex. `processar-matricula-emusys`; (3) NocoDB/WAHA/UAZAPI. Prova empírica (logs API 24h): só **leituras do front autenticado** chegam por `/rest/v1/rpc/` (`get_kpis_*`, `usuario_permissoes`…); **zero** chamadas anon a funções de escrita ou a `anamnese`.
- [ ] **Pendente (agora seguro):** revogar `EXECUTE` das ~100 funções **`FROM PUBLIC, anon`** (não só `anon` — herdam por PUBLIC), mantendo `authenticated` onde o front usa. Whitelist real a preservar p/ anon = só front público de anamnese: `get_anamnese_by_token`, `get_anamnese_publica`. Plano em 6 sprints (104 funções: 2 whitelist + 9 triggers + 17 financeiro/estoque + 26 operacional + 8 identidade/admin + 28 leitura + 14 agentes/helpers).
  - [x] **Sprint 1 — triggers (9), revogadas de PUBLIC/anon/authenticated** (migration `20260630130000`): `set_updated_at_caixa`, `fn_audit_log`, `fn_bi_conversation_autofill`, `fn_log_ocorrencia_criada`, `preencher_campos_retencao_movimentacoes_admin`, `enqueue_sync_student_studio`, `sync_evasao_to_dados_mensais`, `sync_leads_to_dados_comerciais`, `sync_leads_to_origem_leads`. Sobrou só `postgres,service_role`. Impacto zero (executam pelo trigger). **95 funções restantes abertas a anon.**
  - [x] **Sprint 2 — financeiro/estoque/penalidades (17), revogadas de PUBLIC/anon** (migration `20260630131000`): mantido `authenticated,postgres,service_role`. Passo 1 confirmou: 8 chamadas por hooks autenticados (caixa/fideliza/matriculador), 9 backend (lojinha edge + cron inadimplência), **zero tráfego anon**. **78 funções restantes abertas a anon.**
    - ⚠️ **Camada 2 (pendente, item próprio):** 16 das 17 são SECURITY DEFINER **sem guarda interna** (só `reabrir_caixa_diario` valida) → qualquer **autenticado** ainda pode chamá-las via API (vender, baixar estoque, penalizar, estornar) sem checagem de admin/unidade. Revogar anon não resolve isto. Exige definir a regra de negócio (quem pode cada ação) e adicionar `is_admin_usuario()`/filtro de unidade no corpo. Mesmo padrão suspeito em muitas das outras funções de escrita (sprints 3+).
  - [x] **Sprint 3 — operacional (26), revogadas de PUBLIC/anon** (migrations `20260630132000` + `20260630133000` p/ criar_conversa_lead): leads, experimental, conciliação, health, ocorrências, checklist, rotinas, conversas. Mantido `authenticated`+`service_role`+`postgres`; roles de agente preservados (`fabio_agent` em registrar_aula_fabio, `sol_acesso_restrito` em sol_registrar_divergencia — já tinham grant explícito). Passo 1 confirmou: webhooks lead/experimental usam Postgres direto (sub-wf `j41tPbyjGXUQUxrN` só nós postgres), front=authenticated, edge inbox=service_role. `criar_conversa_lead` incluída (0 chamadas, ausente no repo, sem referência interna). **50 funções restantes abertas a anon** (2 são a whitelist de anamnese, ficam de propósito → 48 a revogar nos sprints 4-6).
  - [x] **Sprint 4 — identidade/admin (4 de 8), revogadas de PUBLIC/anon** (migration `20260630134000`): `usuario_permissoes`, `usuario_perfis_lista`, `usuario_tem_permissao`, `admin_update_user_password` (só front autenticado). **4 helpers ficam como EXCEÇÃO PERMANENTE** (`is_admin`, `is_admin_usuario`, `get_user_unidade_id`, `get_unidade_usuario`): usadas em policies RLS `roles={public}` → precisam de anon p/ o RLS não dar `permission denied`; inofensivas (boolean/uuid do auth.uid()). **48 funções ainda com anon** (6 exceções permanentes = 2 anamnese + 4 helpers RLS; 42 a revogar nos sprints 5-6).
  - [x] **Sprint 5 — leitura/KPIs (28), revogadas de PUBLIC/anon** (migration `20260630135000`): get_kpis_*, get_historico_*, get_conciliacao_*, get_rotinas_*, buscar_*, etc. Mantido authenticated/service_role/postgres; `maria_lareport_rpc` preservado nas 6 de KPI (grant explícito). Verificado: nenhuma em policy RLS. **20 funções restantes com anon** (6 exceções permanentes + 14 do sprint 6).
  - [x] **Sprint 6 — agentes/helpers (14), revogadas de PUBLIC/anon** (migration `20260630136000`): maria_lareport_* (5, com maria_lareport_rpc preservado), mila_*, toggles, limpezas, `is_movimentacao_admin_retencao_valida`, `campo_fixado` (helpers boolean chamados por outras funções definer). Verificado: nenhuma em policy RLS.
  - [x] **✅ C1 CONCLUÍDA (2026-06-30):** 98 funções SECURITY DEFINER fechadas p/ anon em 6 sprints (9+17+26+4+28+14). Sobram **6 com anon de propósito**: `get_anamnese_by_token`, `get_anamnese_publica` (front público) + `is_admin`, `is_admin_usuario`, `get_unidade_usuario`, `get_user_unidade_id` (helpers RLS, inofensivas). Logs Postgres pós-sprints: **zero `permission denied`/42501**. Rollback completo em `docs/auditoria-seguranca-c1-rollback.sql`.
  - [ ] **Camada 2 (transversal, pendente):** maioria das funções de escrita dos sprints 2-3 é SECURITY DEFINER sem guarda interna (admin/unidade). Revogar anon não cobre isto. Definir regra de negócio e adicionar checagem no corpo.
- [ ] **Achado lateral (risco alto, item próprio):** o n8n conecta como **`postgres`** (credencial com senha do superuser-equivalente). Migrar para role dedicado de escrita (sem bypassrls/superuser, grants mínimos nas tabelas/funções que usa).
- [ ] **Achado lateral:** anon key hardcoded nos workflows (esperado — é pública) e edge de **outro projeto** Supabase `ukmezhxmcrjxezmcexnp` ("dash do rayan") recebendo cópia das matrículas. A anon key é **necessária** p/ o gateway das edges → não rotacionar/desativar sem ajustar os webhooks.
- [ ] **Melhoria futura:** `execute_bi_query_lamusic` ainda permite SELECT arbitrário p/ qualquer logado → mover BiAgentMetrics p/ chamar via edge e revogar de `authenticated`.
- [ ] Revisar as 120 funções `SECURITY DEFINER` executáveis por `authenticated`

### C2. Tokens de terceiros legíveis pelo cliente
| Tabela | Colunas | Exposição | Status |
|---|---|---|---|
| `whatsapp_caixas` | `uazapi_token`, `waha_api_key` | era `SELECT` role **public** `true` | ✅ fechado p/ anon (SELECT authenticated) |
| `mila_config` | `emusys_token`, `token_quepasa` | era `SELECT/INSERT/UPDATE` role **public** | ✅ fechado p/ anon |
| `assistente_ia_config` | `openai_api_key` | `SELECT` `authenticated` `true` (qualquer logado lê a `sk-...`) | ⏳ Fase 2 |
| `numeros_meta` | `access_token`, `app_secret`, `verify_token` | `SELECT` authenticated + filtro unidade | ⏳ Fase 2 |
| `whatsapp_config` | (config) | **RLS off** + grant anon | ⏳ Grupo B RLS |

- [x] `whatsapp_caixas` + `mila_config`: SELECT só authenticated (migration `20260630122000`)
- [ ] **Fase 2:** tokens ainda legíveis por qualquer logado → mascarar na UI + salvar/testar via edge; depois revogar SELECT da coluna p/ não-admin (ou restringir SELECT a admin). Vale p/ `whatsapp_caixas`, `mila_config`, `assistente_ia_config`, `numeros_meta`.

### C3. Escrita/deleção destrutiva liberada (policy `public true`)
- [x] `whatsapp_caixas`: `INSERT/UPDATE/DELETE` agora exigem `is_admin_usuario()` (migration `20260630122000`)
- [x] `mila_config`: `INSERT/UPDATE` agora exigem `is_admin_usuario()`

---

## 🟠 ALTO

### A1. 29 tabelas sem RLS (`rls_disabled_in_public`)
Plano detalhado na seção "Plano RLS" abaixo.

### A2. 207 policies `USING(true)`/`WITH CHECK(true)` em 111 tabelas (`rls_policy_always_true`)
RLS ligado mas neutralizado para INSERT/UPDATE/DELETE/ALL. Substituir por checagem real.
- [ ] Levantar as 111 tabelas e priorizar as com PII/escrita sensível

### A3. 40 views `vw_*` com `SECURITY DEFINER` (`security_definer_view`)
Toda view de KPI/LTV/ranking roda com permissão do criador → ignora RLS do usuário (vê todas as unidades).
- [ ] Avaliar `ALTER VIEW ... SET (security_invoker = on)` por view, ou aceitar formalmente o vazamento cross-unidade

### A4. `VITE_UAZAPI_TOKEN` no bundle do front
[src/services/whatsapp.ts:22](../src/services/whatsapp.ts#L22)
- [ ] Mover chamadas UAZAPI para edge function; remover a env `VITE_*`

---

## 🟡 MÉDIO / Higiene

- [ ] **138 funções** com `search_path` mutável (`function_search_path_mutable`) → `ALTER FUNCTION ... SET search_path = ''`
- [ ] **6 buckets públicos listáveis** (`avatars`, `crm-midia`, `lojinha-produtos`, `professor-videos`, `projeto-anexos`, `whatsapp-media-campanhas`) → restringir SELECT em `storage.objects`
- [ ] **Leaked password protection** desligada → ligar (HaveIBeenPwned) no Auth
- [ ] **3 extensões em `public`** (`pg_net`, `pg_trgm`, `unaccent`) → mover de schema
- [ ] **2 tabelas RLS sem policy** (`governanca.agente_usuarios`, `public.aula_registros_fabio_log`)
- [ ] Remover tabelas `*_backup_*` de produção

---

## Plano RLS — 29 tabelas sem RLS

Estratégia: `service_role` (edges/crons) faz **bypass automático** de RLS. Então habilitar RLS já tranca anon/authenticated sem quebrar o backend. Divisão em 3 grupos conforme uso no frontend (grep em `src/`):

### Grupo A — Backend-only → `ENABLE RLS` sem policy (zero impacto funcional) ✅ FEITO 2026-06-30
Migration `20260630120000_seguranca_grupo_a_enable_rls_backend_only.sql` aplicada. 29→14 tabelas sem RLS.
Não há `from('<tabela>')` no frontend; acesso só por edge/cron/RPC.
- `alunos_arquivados`
- `boas_vindas_enviadas`
- `competencias_bloqueios_log`
- `curso_emusys_depara`
- `dados_mensais_retificacoes`
- `fila_relatorios_whatsapp`
- `loja_reservas`
- `matriculas_campos_fixados`
- `matriculas_divergencias` *(front usa via RPC, confirmar)*
- `matriculas_divergencias_decisoes`
- `professores_emusys_divergencias`
- `professores_sync_log`
- `transferencias_mila`
- `webhook_debug_log`
- `lead_experimentais_decisoes_humanas`

### Grupo B — Frontend acessa direto → `ENABLE RLS` + policy · ⏳ PENDENTE (9 tabelas)
Têm `from('<tabela>')` no front; precisam policy `authenticated` (+ filtro unidade/admin no padrão `is_admin_usuario()` / `get_unidade_usuario()`). **Testar a tela após aplicar.** ⚠️ `ENABLE RLS` sem policy aqui QUEBRA o front (authenticated deixa de ver) — policy é obrigatória junto.
- `lead_experimentais` (Comercial, PreAtendimento, Metas — read/write intenso)
- `leads_automacao_log` (FormLead, ModalNovoLead — write)
- `crm_templates_whatsapp` (templates — read/write) ⚠️ revisar se contém algo sensível
- `inventario_pendencias` (Salas — read/write)
- `projeto_equipe_membros` (Projetos — read/write)
- `projeto_config_permissoes` (Projetos — read/write)
- `competencias_mensais` (KPIs, status competência — read)
- `emusys_sync_log` (PresencaTab — read)
- `whatsapp_config` (Projetos ConfiguracoesView — read/write) ⚠️ checar conteúdo

### Grupo C — Backups / lixo → DROP ou mover de schema · ⏳ PENDENTE (5 tabelas)
Não deveriam estar em produção. Após confirmar que nada usa: `DROP TABLE` ou mover p/ schema privado. Enquanto isso, `ENABLE RLS` sem policy (risco zero — front não usa).
- `evasoes_backup_20260215` (677 linhas)
- `evasoes_legacy_backup` (677)
- `evasoes_v2_backup` (740)
- `leads_backup_flags_20260601`
- `leads_diarios_backup` (100)

> **Estado 2026-06-30 (pós-C1):** 14 tabelas ainda sem RLS = 9 Grupo B + 5 Grupo C. Grupo A (15 tabelas) já aplicado. C1 (revogação de funções anon) concluída — ver seção C1.

### Notas de método
- `ENABLE ROW LEVEL SECURITY` sem policy = nega tudo p/ anon/authenticated; `service_role` continua (atributo `BYPASSRLS`).
- **Não** usar `FORCE ROW LEVEL SECURITY` (desnecessário; só complica).
- Alternativa conservadora ao Grupo A: `REVOKE ALL ... FROM anon` mantendo authenticated — porém o padrão do projeto é RLS, então preferir RLS.
- Aplicar via migration versionada (`supabase/migrations/`), validar com `get_advisors` depois.

---

## Histórico
- 2026-06-30: auditoria inicial (Claude + advisor). Nada alterado no banco.
