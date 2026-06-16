# Relatório P0.1C — Flatten dos Wrappers Públicos em Produção

Data: 2026-06-13

## 1. Resumo Executivo

O P0.1C foi aplicado com sucesso em produção.

O objetivo desta entrega foi remover a chamada runtime a `_legacy_p01g` apenas dos wrappers públicos usados por relatórios, IA/Gemini e fluxo administrativo, preservando contrato público e sem remover os objetos legados do banco.

Pontos principais:

- Os wrappers públicos `get_dados_relatorio_gerencial` e `get_dados_retencao_ia` deixaram de chamar `_legacy_p01g` em runtime.
- O legado `_legacy_p01g` foi preservado no banco.
- `dados_mensais` não foi alterado.
- Não houve recálculo, backfill, DML ou mudança de histórico fechado.
- A produção só foi tocada depois de QA final em staging.

## 2. Ambientes

| Ambiente | Project ref | Status |
|---|---|---|
| Staging validado | `nzwqjepncrtufpykjita` | Validado antes da produção |
| Produção aplicada | `ouqwbbermlzqqvtqwlul` | Aplicada após QA final |

A produção foi tocada somente após validação técnica e visual no staging.

## 3. Escopo Aplicado em Produção

Wrappers públicos alterados:

- `public.get_dados_relatorio_gerencial(uuid, integer, integer)`
- `public.get_dados_retencao_ia(uuid, integer, integer)`

Alterações aplicadas:

- Removida a chamada runtime a `_legacy_p01g`.
- Preservado `SET search_path = public, pg_temp`.
- Preservado o comportamento de segurança existente:
  - `get_dados_relatorio_gerencial`: `SECURITY DEFINER`
  - `get_dados_retencao_ia`: `SECURITY INVOKER/default`

O contrato público foi preservado:

- Mesmo nome.
- Mesmos parâmetros.
- Mesmo shape JSON esperado por frontend, relatórios e Gemini/IA.

## 4. Escopo Explicitamente Não Aplicado

Esta entrega não fez:

- Nenhum `DROP`.
- Nenhuma remoção de `_legacy_p01g`.
- Nenhum `UPDATE`, `DELETE`, `INSERT`, backfill ou recálculo.
- Nenhuma alteração em `dados_mensais`.
- Nenhum recálculo de histórico fechado.
- Nenhuma alteração de regra de negócio.
- Nenhum refactor fora do escopo P0.1C.

Importante: esta fase desacoplou o runtime público do legado. Ela não é uma fase de limpeza final de banco.

## 5. Rollback

Rollback local capturado antes da produção:

- `outputs/la-report-kpi-frontend-p01/rollback_producao_p01c_before_20260613_104011.sql`

Esse arquivo deve ser preservado como referência de reversão imediata caso apareça regressão diretamente relacionada ao P0.1C.

O rollback foi capturado antes da aplicação em produção e deve ser tratado como artefato de segurança da etapa.

## 6. QA Final em Staging

O QA final em staging passou antes da produção.

Casos testados:

- Barra/Maio
- Campo Grande/Maio
- Recreio/Maio
- Barra/Junho
- Campo Grande/Junho
- Recreio/Junho
- Consolidado/Junho

Confirmado em staging:

- Maio voltou como Maio.
- Junho voltou como Junho.
- Sem `undefined`, `null` ou `NaN` na saída final validada.
- `gemini-relatorio-gerencial`: HTTP 200.
- `gemini-insights-retencao`: HTTP 200.
- `ModalRelatorio` abriu e gerou relatório.
- `PlanoAcaoRetencao` abriu e gerou análise.

## 7. Pós-check em Produção

### `get_dados_relatorio_gerencial`

Status: OK

- `SECURITY DEFINER` preservado.
- `search_path = public, pg_temp` preservado.
- Sem chamada runtime a `_legacy_p01g`.

### `get_dados_retencao_ia`

Status: OK

- `SECURITY INVOKER/default` preservado.
- `search_path = public, pg_temp` preservado.
- Sem chamada runtime a `_legacy_p01g`.

Antes da aplicação, o baseline indicava chamada runtime ao legado nos wrappers públicos. Após a aplicação, os wrappers públicos deixaram de depender de `_legacy_p01g` em runtime.

## 8. Validação Produção — 7 Casos

| Caso | Status |
|---|---|
| Barra/Maio | OK |
| Campo Grande/Maio | OK |
| Recreio/Maio | OK |
| Barra/Junho | OK |
| Campo Grande/Junho | OK |
| Recreio/Junho | OK |
| Consolidado/Junho | OK |

## 9. RPC, Edge e Gemini em Produção

Validação em produção:

- `get_dados_relatorio_gerencial`: OK.
- `get_dados_retencao_ia`: OK.
- `gemini-relatorio-gerencial`: HTTP 200.
- `gemini-insights-retencao`: HTTP 200.
- Saída final sem `undefined`, `null` ou `NaN`.

## 10. Smoke Visual em Produção

Smoke visual em produção:

- `ModalRelatorio` abriu e gerou relatório.
- `PlanoAcaoRetencao` abriu e gerou análise.
- O frontend do smoke chamou somente a produção `ouqwbbermlzqqvtqwlul`.
- Sem warning de botão dentro de botão.
- Sem warning de descrição ausente no modal.

## 11. Arquivos Locais Alterados na Etapa

Arquivos locais relacionados ao pacote P0.1C:

- `src/components/App/Administrativo/ModalRelatorio.tsx`
- `outputs/la-report-kpi-frontend-p01/relatorio_p01c_flatten_wrappers_publicos.md`
- `supabase/migration-drafts/20260611_p01c_flatten_wrappers_publicos_NAO_APLICAR.sql`
- `outputs/la-report-kpi-frontend-p01/rollback_producao_p01c_before_20260613_104011.sql`
- `docs/relatorio_p01c_producao_2026-06-13_hugo.md`

Observação: o SQL do P0.1C permanece versionado como draft/local. Este documento não autoriza aplicar migrations adicionais nem mover esse arquivo para uma pasta de migrations executáveis.

## 12. Observação Sobre Staging

Em 13/06/2026 10:54, foi registrado erro de console `Realtime/WebSocket auth failure` no staging `nzwqjepncrtufpykjita`.

Esse ponto foi classificado como observação de configuração do staging, não blocker do P0.1C, porque RPC, REST, Edge, Gemini e fluxo visual passaram.

## 13. Status Final

Status: Produção P0.1C verde.

## 14. Orientação Para Próximos Agentes

Regras para Hugo, agentes e IAs que continuarem esta frente:

- Não remover `_legacy_p01g` ainda.
- Não fazer `DROP` por intuição.
- Manter legado em observação antes de qualquer deprecação real.
- Qualquer deprecação precisa de inventário de consumidores, janela de observação, rollback e aprovação explícita.
- Não mexer em `dados_mensais` sem fluxo próprio de retificação.
- Histórico fechado deve ser tratado como fechamento contábil.
- Mês fechado não muda silenciosamente.
- Qualquer alteração pós-fechamento é retificação, não recálculo comum.
- Regra validada pelo Alf vence código antigo ou documento antigo.

Objetos legados ainda devem ser tratados como observáveis, não removíveis automaticamente.

## 15. Checklist Final

- [x] QA staging concluído
- [x] Produção aplicada somente nos wrappers
- [x] `_legacy_p01g` preservado
- [x] `dados_mensais` intocado
- [x] 7 casos âncora OK
- [x] Edge/Gemini 200
- [x] Smoke visual OK
- [x] Rollback capturado
- [x] Legado mantido em observação

