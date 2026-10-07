# Notas do banco

O que um script não descobre. O fato mecânico está nos `*.gerado.md` ao lado.

> Armadilhas de regra de negócio continuam no [`CLAUDE.md`](../../CLAUDE.md) e em
> `.claude/memory/`. Este arquivo **não as duplica** — registra só o que saiu da
> leitura do próprio banco, em 2026-09-02 (quadro geral e contagem `anon`
> reconferidos em 2026-09-14 e 2026-09-19; as revisões nominais de 02/09
> continuam; em 19/09 fechou-se a *entrada* de `anon` e duas funções que
> gravavam).

## Quadro geral

| | 2026-09-02 | 2026-09-14 | 2026-09-19 |
|---|---|---|---|
| Tabelas | 379 | 423 | — |
| Views | 122 | 134 | — |
| Funções nossas | 1.151 | 1.459 | 1.582 |
| — em uso (ATIVA) | 439 | 496 | — |
| — só chamadas por outra função (SÓ-INTERNA) | 365 | 524 | — |
| — sem consumidor conhecido (ÓRFÃ) | 336 | 422 | — |
| — superadas por versão maior (LEGADO) | 11 | 17 | — |
| Executáveis por `anon` | 150 | 166 | 179 → 167 |

**As funções de extensão ficam fora do catálogo.** `pg_trgm` e `unaccent` instalam
35 funções no schema `public` (`word_similarity`, `gtrgm_*`, `unaccent`…). Elas
não são nossas, ninguém as mantém, e infladas no meio das nossas escondiam o que
importa — o gerador as exclui por `pg_depend`. Note que dezenas das funções `anon` que uma contagem ingênua acha são delas:
o número nosso é o da tabela acima (`has_function_privilege`, sem extensão).

## 🔓 179 funções executáveis por `anon`

> ⚠️ **A contagem viva é de 19/09/2026** (`has_function_privilege('anon', …,
> 'execute')`, sem extensão): 150 (02/09) → 166 (14/09) → **179** (manhã) →
> **167** depois de sair `recalcular_projecao` e `hermes_patch_status_reportar`.
> A revisão
> nominal das ÓRFÃ continua sendo a de 02/09. Entraram depois, sem revisão:
> `app_coordenacao_radar`, `app_corrigir_presenca_do_aluno`,
> `app_falta_professor_cancelar_aulas`, `calcular_pontos_perdidos_com_tolerancia`,
> `dispensar_passagem_bastao`, `financeiro_enriquecer_fatura_item`,
> `fn_presenca_fonte_legivel`, `fn_presenca_status_efetivo`, `get_ocorrencias_mes`,
> `responder_passagem_bastao`, `retirar_do_roster_health_score_v3_ciclo` — e o
> restante até fechar 179.

A `anon key` vai no bundle do front — é pública por construção. Toda função com
`EXECUTE` para `anon` é chamável por qualquer pessoa na internet.

**Porta de entrada fechada em 19/09/2026** (`20260919223000`):
`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE
ON FUNCTIONS FROM anon`. Função nova criada pelo `postgres` (nossas migrations)
deixa de nascer aberta. Função pública de propósito precisa de
`GRANT EXECUTE … TO anon` explícito. As 179 já existentes **não** caem com
isso — revisão uma a uma. O default do `supabase_admin` (dashboard) continua
concedendo `anon` até uma sessão superuser revogar.

⚠️ Distinção que a seção antiga misturava: **`DROP` + `CREATE` reabria** o
`EXECUTE` para `anon` (o default privilege do papel que cria). **`CREATE OR
REPLACE` nunca reabriu**: dono e grants sobrevivem. Depois de 19/09, um
`CREATE` novo do `postgres`/`supabase_admin` em `public` também **não** nasce
com `anon`. `revoke … from public` não basta contra grant nominal a `anon`.

Em 19/09 também saíram de `anon` (e de `PUBLIC`) duas que **gravam** como
`SECURITY DEFINER` sem conferir quem chama (`20260919224000`):
`recalcular_projecao` (`authenticated` + `service_role`, grant do authenticated
reposto na `20260919224500`) e `hermes_patch_status_reportar` (só
`service_role`, que é quem o guard usa).

As três da anamnese pública (`get_anamnese_publica`, `get_convite_anamnese`,
`salvar_anamnese_online`) **ficam** com `anon`: exigem `p_token` de 32 hex
(128 bits, `gen_random_bytes(16)` / uuid sem hífen). Não é adivinhável.

Duas populações, com riscos diferentes:

- **95 são ATIVA + `anon`** — estão em uso e expostas. Algumas são públicas de
  propósito (páginas abertas por token). As demais precisam de revisão.
- **33 são ÓRFÃ + `anon`** — a pior combinação: ninguém chama, e qualquer um
  pode. É superfície de ataque sem contrapartida de uso.

As 33, para revisão nominal:

`get_anamnese_publica` · `get_convite_anamnese` · `salvar_anamnese_online` ·
`get_kpis_retencao` · `get_radar_renovacoes` · `registrar_movimentacao` ·
`consolidar_origem_leads_mes` · `consolidar_dados_comerciais_mes` ·
`creditar_lalita_matricula` · `get_dados_comercial_ia` · `normalize_phone` ·
`texto_indica_sem_instagram` · `get_historico_mensal_matriculador` ·
`get_metas_vs_realizado` · `upsert_metas` ·
`simular_emenda` · `transferir_estoque` ·
`calc_classificacao` · `calc_idade` · `get_unidade_usuario` ·
`is_admin_usuario` · `app_coordenacao_feedback_mes` (e mais 9 — filtrar por
`ORFA` + `🔓 anon` em `FUNCOES.gerado.md`).

As três da anamnese pública continuam com `anon` de propósito (token 128 bits,
conferido 19/09). O consumidor está no repo `anamnese-la-music`, não neste.

## Professor no mesmo projeto (19/09/2026, espelho do LA Teacher)

Professores do LA Teacher logam como `authenticated` neste banco. O que fecha
isso **já está aplicado** (migrations `20260919194000`–`199700`, origem
`la-teacher`, copiadas byte a byte). Não desfazer.

- Porteiro: `authenticator.pgrst.db_pre_request = public.fn_porteiro_requisicao`.
  **Não criar outro pre-request** e não apagar este. Professor só passa nas rotas
  de `porteiro_rota_professor` (`rpc/<nome>` que devolve jsonb). Emergência:
  `update porteiro_config set modo = 'observar'`.
- `usuarios`: gatilho `trg_usuarios_trava_privilegio` — não-admin não mexe em
  perfil/ativo/auth_user_id/unidade_id/email/senha_hash/id.
- Realtime: policies das 9 tabelas da publicação ganharam
  `and not (select fn_usuario_e_professor())`. Policy nova com `using (true)`
  para `authenticated` em tabela da publicação é furo.
- `execute_bi_query_lamusic`: SQL livre só `service_role` ou `is_admin()`.
- `projecao_aulas`: `authenticated` só SELECT; sem `anon`.
- ~101 RPCs internas sem `EXECUTE` para `authenticated`/`anon`.

Ainda aberto, de propósito, para outro commit: `fn_exigir_equipe()` nas RPCs que
o site chama (segunda camada se o porteiro cair); default privilege do
`postgres` ainda dá `EXECUTE` a `authenticated` em função nova; default do
`supabase_admin` ainda dá `anon`; `anon` ainda tem privilégio de tabela em
`usuarios` (policies seguram; 6 SELECTs anônimos sem dono no código).

## 336 funções sem consumidor conhecido

**Sinal, não veredito.** O gerador enxerga seis fontes: `src/`, edge functions,
corpo de outras funções, definição de views, `cron.job` e triggers. Não enxerga
n8n, scripts na VPS (`la-hq`, `alfredo`), nem chamada direta ao PostgREST. Um
terço do catálogo aparecer assim é indício de acúmulo, não prova de código morto:
antes de apagar qualquer uma, procure fora do repo.

## `CREATE OR REPLACE` apaga `SET` da função (19/09/2026)

`get_professor_presenca_v3_sombra` ganhava nested loop entre CTEs materializados
porque o CTE `params` tem `where p_competencia is not null` e o planejador
estima 1 linha. `ALTER FUNCTION … SET enable_nestloop = off` (migration
`20260919210000`) caiu consolidado de 34,37 s para 1,47 s com jsonb idêntico
nas 5 combinações. O corpo não mudou (`md5` `6cb0df4de0fcdc523b8fac4c0552a113`).

⚠️ `CREATE OR REPLACE` **não** reabre `EXECUTE` para `anon` — dono e grants
sobrevivem. O que apaga o ajuste é recriar a partir de `20260718235000` sem
`SET enable_nestloop TO 'off'` (e sem o `search_path`) no cabeçalho. Mesma
família do `statement_timeout` por função (`publish_financeiro_sync_run`,
leitura financeira): o GUC mora no `proconfig`, não no SQL do corpo.

Volta: `alter function public.get_professor_presenca_v3_sombra(date, uuid) reset enable_nestloop;`

## 11 funções com versão maior viva

Onde o `_v1` continua existindo ao lado do `_v3`. Vale conferir se o antigo ainda
é chamado por alguém fora do repo antes de dropar — mas também vale o alerta do
`CLAUDE.md`: **assinatura antiga esquecida com `DEFAULT` novo gera
`function is not unique`**, que já derrubou o webhook de leads por 21 horas.

```
listar_evadidos_para_pesquisa      → listar_evadidos_para_pesquisa_v4
sol_caixa_abrir                    → sol_caixa_abrir_v3
sol_caixa_fechar                   → sol_caixa_fechar_v3
sol_caixa_readonly_preflight_v1/v2 → sol_caixa_readonly_preflight_v3
registrar_entrada_estoque          → registrar_entrada_estoque_v2
get_agenda_semana                  → get_agenda_semana_v2
get_kpis_turmas_canonicos_v1       → get_kpis_turmas_canonicos_v2
maria_lareport_roi_professores_base → ..._v2
reconciliar_professor_curso_modalidade_v1 → ..._v2
```

## 15 tabelas sem RLS

Sem RLS, o acesso depende inteiramente de `GRANT`. A maioria é subproduto de
trabalho (staging, auditoria pontual, backup) e não incomoda, mas três guardam
volume real:

| Tabela | Linhas | O que parece ser |
|---|---|---|
| `projecao_aulas` | 50.298 | projeção de aulas |
| `emusys_experimentais_snapshot_execucoes` | 18.843 | execuções de snapshot |
| `lead_experimentais_arquivadas` | 174 | arquivo de experimentais |

As demais: `_auditoria_chave_natural_20260809`, `_auditoria_reconstrucao_20260809`,
`migrations_audit_data_nascimento`, `fechamento_snapshots_backup_20260808`,
`unidade_contato_comercial`, `hermes_patch_status`,
`health_score_professor_v3_materializacao_execucoes`, `projecao_recaculo_log`,
`calendario_escolar`, `fabio_participacao_ocorrencias`,
`fabio_participacao_ocorrencia_eventos`, `lead_experimental_aulas_arquivadas`.

⚠️ As quatro com `_backup_`/`_auditoria_`/`migrations_audit_` no nome são
resíduo datado de agosto de 2026. Não têm consumidor e ninguém as regenera —
candidatas naturais a limpeza, com a ressalva de sempre: confirmar fora do repo.
