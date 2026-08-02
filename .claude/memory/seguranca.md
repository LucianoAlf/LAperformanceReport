# Segurança — LA Music Performance Report

## Edge functions de debug expostas anonimamente (achado 2026-08-01, pré-existente, não causado pelo módulo Agenda)

Durante a revisão da Task 13 do plano da Agenda, achado por acaso: 4 edge functions de
debug estavam `ACTIVE` com `verify_jwt=false` (invocáveis por qualquer requisição anônima
da internet). **3 delas nem existiam no repositório** — invisíveis a qualquer code review.

A pior era `debug-aulas-temp` (deployada em 2026-07-14): tinha os **3 tokens da API do
Emusys em texto puro** no corpo e devolvia a agenda completa das 3 unidades sem
autenticação. Exposição de ~18 dias.

| Função | No repo? | `verify_jwt` antes | Situação |
|---|---|---|---|
| `debug-aulas-temp` | não | false | **neutralizada** (v15, stub 410, `verify_jwt=true`) |
| `debug-emusys-secrets-check` | não | false | **neutralizada** (v16, stub 410, `verify_jwt=true`) |
| `debug-uazapi` | não | false | **neutralizada** (v24, stub 410, `verify_jwt=true`) |
| `debug-webhook-emusys-observador` | sim | false | mantida — versionada e sem credencial hardcoded |
| `debug-cursos-temp` | não | true | não exposta |

**O que foi feito:** corpo das 3 órfãs substituído por stub `410 Gone` + `verify_jwt=true`
(remove os tokens do artefato deployado e corta acesso público). Não foram deletadas — o
MCP do Supabase não tem tool de delete de edge function, só `deploy`/`get`/`list`; delete
definitivo exige CLI (`supabase functions delete <slug>`) ou painel. **Pendente.**

**Decisão do Hugo (dono do repo), registrada sem julgamento:** NÃO rotacionar os tokens do
Emusys (`EMUSYS_TOKEN_CG`, `EMUSYS_TOKEN_BARRA`, `EMUSYS_TOKEN_RECREIO`), mesmo cientes de
que circularam publicamente por ~18 dias e seguem válidos. Risco aceito por ele — não
reabrir o assunto sem novo pedido dele.

**Consequência da neutralização:** o corpo original das 3 órfãs foi sobrescrito e elas
nunca estiveram no git — o código se perdeu. Só o histórico de versões do painel Supabase
guarda o antes (`debug-aulas-temp` v14, `debug-uazapi` v23, `debug-emusys-secrets-check`
v15). Confirmado impacto zero no frontend (nenhuma referência em `src/`, nenhum
`functions.invoke` de edge debug).

**Lição estrutural:** função deployada que não existe no repositório é ponto cego — não
aparece em diff, code review nem `graphify`. Vale auditoria periódica cruzando
`list_edge_functions` (MCP Supabase) contra `supabase/functions/` do repo — foi assim que
este achado apareceu, por acaso, durante outra revisão.
