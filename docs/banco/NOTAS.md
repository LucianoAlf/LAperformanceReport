# Notas do banco

O que um script não descobre. O fato mecânico está nos `*.gerado.md` ao lado.

> Armadilhas de regra de negócio continuam no [`CLAUDE.md`](../../CLAUDE.md) e em
> `.claude/memory/`. Este arquivo **não as duplica** — registra só o que saiu da
> leitura do próprio banco, em 2026-09-02.

## Quadro geral

| | Total |
|---|---|
| Tabelas | 379 |
| Views | 122 |
| Funções nossas | 1.151 |
| — em uso (ATIVA) | 439 |
| — só chamadas por outra função (SÓ-INTERNA) | 365 |
| — sem consumidor conhecido (ÓRFÃ) | 336 |
| — superadas por versão maior (LEGADO) | 11 |
| Executáveis por `anon` | 150 |

**As funções de extensão ficam fora do catálogo.** `pg_trgm` e `unaccent` instalam
35 funções no schema `public` (`word_similarity`, `gtrgm_*`, `unaccent`…). Elas
não são nossas, ninguém as mantém, e infladas no meio das nossas escondiam o que
importa — o gerador as exclui por `pg_depend`. Note que **35 das 185 funções
`anon` que uma contagem ingênua acha são delas**: o número nosso é 150.

## 🔓 150 funções executáveis por `anon`

A `anon key` vai no bundle do front — é pública por construção. Toda função com
`EXECUTE` para `anon` é chamável por qualquer pessoa na internet.

A causa está descrita no `CLAUDE.md`: o `ALTER DEFAULT PRIVILEGES` do schema
`public` concede `EXECUTE` a `anon` em função nova, então **recriar uma função
reabre o acesso**, e `revoke ... from public` não basta — precisa de
`revoke execute ... from anon` nominal.

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
`get_metas_vs_realizado` · `recalcular_projecao` · `upsert_metas` ·
`hermes_patch_status_reportar` · `simular_emenda` · `transferir_estoque` ·
`calc_classificacao` · `calc_idade` · `get_unidade_usuario` ·
`is_admin_usuario` · `app_coordenacao_feedback_mes` (e mais 9 — filtrar por
`ORFA` + `🔓 anon` em `FUNCOES.gerado.md`).

⚠️ **`get_anamnese_publica`, `get_convite_anamnese` e `salvar_anamnese_online`
merecem olhar primeiro.** O `CLAUDE.md` as descreve como o caminho da página
pública de anamnese, aberta por token — mas **nenhuma delas é citada em `src/`
ou em `supabase/functions/`**. Ou a página passou a usar `get_anamnese_aluno`
(a leitura canônica adotada no LAPE-19) e elas ficaram para trás expostas, ou o
consumidor está fora do repo. Confirmar antes de mexer.

## 336 funções sem consumidor conhecido

**Sinal, não veredito.** O gerador enxerga seis fontes: `src/`, edge functions,
corpo de outras funções, definição de views, `cron.job` e triggers. Não enxerga
n8n, scripts na VPS (`la-hq`, `alfredo`), nem chamada direta ao PostgREST. Um
terço do catálogo aparecer assim é indício de acúmulo, não prova de código morto:
antes de apagar qualquer uma, procure fora do repo.

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
