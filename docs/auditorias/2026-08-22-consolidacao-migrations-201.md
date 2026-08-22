# Consolidação das migrations históricas (issue #201) — 2026-08-22

**O que:** materialização no repo canônico das migrations aplicadas em produção sem
arquivo versionado. Antes: catálogo `supabase_migrations.schema_migrations` = 1.703
aplicadas, repo = 845 nomes. Depois: **1.757 arquivos, cobrindo 1.687 dos 1.703 nomes**
(100% do recuperável).

**Método** (o mesmo do PR #196, agora com redação):
1. SQL extraído byte a byte de `schema_migrations.statements` (como aplicado);
2. casamento por **name** (não por version — migrations via MCP têm version de arquivo
   ≠ version aplicada); 60 nomes reaplicados no catálogo viram arquivos distintos por version;
3. header `NAO REAPLICAR` em todos;
4. **redação de segredos** antes do commit (o gitleaks já barrou este CI uma vez, 08/08).

## Redações aplicadas (5 arquivos: 13 JWTs + 1 token)

Migrations de cron antigas embutiam a chave (anon/service) no header do `net.http_post`.
Valores substituídos por `<REDACTED:jwt>` com header explicando que o SQL não é
executável como está — o valor real vive no ambiente:

- `20260129131550_create_alertas_cron_jobs.sql` (3)
- `20260303222243_change_presenca_cron_to_weekly.sql` (1)
- `20260707163631_sync_grade_futura_cron.sql` (3)
- `20260707164650_sync_grade_futura_alinhar_presenca.sql` (6)
- `20260422161816_add_token_quepasa_to_mila_config.sql` (1 `token_quepasa` →
  `<REDACTED:token>`) — ⚠️ este o regex manual NÃO pegou; foi o **gitleaks do CI**
  que barrou (`leaks found: 1`). Defesa em profundidade funcionando como desenhada:
  a varredura manual reduz, o gitleaks é o gate. Padrão aprendido: `token_\w+ = '…'`.

⚠️ **Falso positivo revertido:** `20260625210252_unidades_comunidade_secretaria.sql` —
o padrão `secret*` casou `secretaria_whatsapp`/`secretaria_fixo`, que são telefone
público de atendimento, não segredo. Restaurado com o SQL original. Lição para a
próxima redação em massa: `secret\w*` alcança "secretaria" — exigir word boundary ou
revisar todo hit à mão (foi revisado).

## Irrecuperáveis pelo catálogo (16 — `statements` vazio)

O lote de 13/08/2026 (versions `202608131*`–`202608133*`, nomes narrativos:
`limpeza_nao_se_repete`, `a_pessoa_ganha_nome`, `a_porta_do_agente`, …) foi registrado
no `schema_migrations` **sem o SQL**. O efeito deles está vivo no schema; recuperar o
texto exigiria reconstruir do objeto vigente (`pg_get_functiondef`), o que produziria
o estado ATUAL, não o daquele dia — marcação de proveniência enganosa. Decisão:
**ficam sem arquivo**, listados aqui como lacuna conhecida e finita.

## Verificação

- Paridade: todo `name` do catálogo com `statements` tem arquivo (script de conferência
  na descrição do PR); os 16 sem arquivo = exatamente os 16 sem SQL.
- Varredura residual de segredos nos 907 novos: `eyJ…`, `x-sync-token`, `Bearer` longos —
  **zero ocorrências** pós-redação.
- Nada foi reaplicado no banco: isto é materialização de histórico, não mudança de estado.
