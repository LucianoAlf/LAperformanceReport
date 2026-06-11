# Auditoria de Deprecação Segura — Legados de KPIs de Alunos

> **Data:** 2026-06-10 · **Fase:** somente leitura, inventário e relatório
> **Regra observada:** nenhuma escrita executada (zero DROP/ALTER/UPDATE/DELETE/INSERT/migration).
> **Fontes lidas:** `pg_proc.prosrc`, `pg_views`, `pg_depend`, `information_schema`, `src/`, `supabase/functions/`, `supabase/migrations/`, `outputs/`.

---

## 1. Resumo Executivo

A migração para as fontes canônicas vivas **está pela metade**. As duas RPCs públicas que o frontend e a IA consomem — `get_dados_relatorio_gerencial` e `get_dados_retencao_ia` — **ainda delegam** para as funções `_legacy_p01g`, que por sua vez leem as views `vw_kpis_gestao_mensal` e `vw_kpis_retencao_mensal`. Os "canônicos" sobrepõem KPIs via `jsonb_set` **sobre a base legada**, em vez de calcularem a base nativamente.

Consequência: **nenhum dos objetos `_legacy_p01g` nem as duas views podem ser dropados hoje** — há consumidor vivo dentro do próprio banco. Os sufixos `p01q`/`p01t` **não são legado**: são as camadas-base da cadeia canônica viva (confirmado — não tocam views legadas nem `renovacoes`).

**Único candidato real a deprecação:** `vw_dashboard_unidade` — zero consumidor no banco; a única referência no código está em `TabDashboard.tsx`, componente **não renderizado** (marcado como legado no próprio código).

`renovacoes` está **fora do escopo de remoção**: recebeu INSERT hoje (2026-06-10 22:46) e é consumida por 4 RPCs, incluindo Fideliza+ e Professores (ambos protegidos).

**Veredito:** 1 candidato seguro (`vw_dashboard_unidade`, após remover código morto). Todo o resto é MANTER ou BLOQUEADO. Deprecação do bloco `_legacy_p01g`+views exige primeiro **de-legacy-ficar os 2 wrappers públicos**.

---

## 2. Mapa de Objetos Auditados

### Cadeia canônica de ALUNOS (viva — MANTER)
```
get_kpis_alunos_financeiro_vivo_canonico ─┐
get_kpis_alunos_vinculos_vivo_canonico ───┤
get_kpis_alunos_canonicos_base_p01q ──────► base_p01t ──► get_kpis_alunos_canonicos ──► edge relatorio-admin-whatsapp
```

### Cadeia de RELATÓRIO/RETENÇÃO (legado ainda ativo — BLOQUEADO)
```
vw_kpis_gestao_mensal ──┐
                         ├─► get_dados_relatorio_gerencial_legacy_p01g ──► get_dados_relatorio_gerencial (público)
vw_kpis_retencao_mensal ┤
                         └─► get_dados_retencao_ia_legacy_p01g ─────────► get_dados_retencao_ia (público)
```
> Os wrappers públicos chamam o legado e injetam canônicos por cima (`jsonb_set`). A base ainda é legada.

### Isolados
- `vw_dashboard_unidade` — sem consumidor no banco; só código morto no front.
- `renovacoes` — tabela operacional viva (writer externo + 4 RPCs consumidoras).

---

## 3. Referências no Código (`src/`, `functions/`)

| Objeto | Onde | Tipo de referência |
|---|---|---|
| `get_kpis_alunos_canonicos` | `supabase/functions/relatorio-admin-whatsapp/index.ts:198` | **runtime** `supabase.rpc(...)` |
| `useKPIsAlunosCanonicos` / `kpisAlunosVivosCanonicos` | 10 arquivos: `useDadosHistoricos.ts`, `useKPIsRetencao.ts`, `useKPIsGestao.ts`, `fidelizaCanonico.ts`, `retencaoOperacionalCanonica.ts`, `AdministrativoPage.tsx`, `TabGestao.tsx`, `AlunosPage.tsx`, `DashboardPage.tsx` | **runtime** import/hook |
| `vw_dashboard_unidade` | `src/components/GestaoMensal/TabDashboard.tsx:71` | **código morto** `.from('vw_dashboard_unidade')` — comentário: "LEGADO… não é renderizada… mantida até a deprecação formal" |
| `vw_kpis_gestao_mensal` | — | **zero** referência no front/edge |
| `vw_kpis_retencao_mensal` | — | **zero** referência no front/edge |
| `renovacoes` | — | **zero** `.from('renovacoes')` no front/edge (writes vêm de fora do código) |
| `*_legacy_p01g`, `base_p01q`, `base_p01t`, `financeiro_vivo_canonico` | `outputs/**`, `supabase/migrations/2026060[89]_*.sql` | **doc/migration histórica** apenas |

> ⚠️ "Zero referência no front" **não** significa removível: as views são consumidas **dentro do banco** pelas `_legacy_p01g` (ver §4). O scan de código sozinho geraria falso-positivo de remoção.

---

## 4. Dependências no Banco (SELECT-only)

| Objeto | Existe | Consumidor no banco | Triggers/FKs | Conclusão |
|---|---|---|---|---|
| `vw_kpis_gestao_mensal` | sim | `get_dados_relatorio_gerencial_legacy_p01g`, `get_dados_retencao_ia_legacy_p01g` (leem via `prosrc`) | — | bloqueada pelas 2 legacy |
| `vw_kpis_retencao_mensal` | sim | mesmas 2 legacy | — | bloqueada pelas 2 legacy |
| `vw_dashboard_unidade` | sim | **nenhum** (`prosrc` scan = 0; `pg_depend` = 0) | nenhum | sem consumidor no banco |
| `get_dados_relatorio_gerencial_legacy_p01g` | sim | `get_dados_relatorio_gerencial` (público) | — | bloqueada |
| `get_dados_retencao_ia_legacy_p01g` | sim | `get_dados_retencao_ia` (público) | — | bloqueada |
| `get_kpis_alunos_canonicos_base_p01q` | sim | `…base_p01t` | — | canônica (base) |
| `get_kpis_alunos_canonicos_base_p01t` | sim | `get_kpis_alunos_canonicos` | — | canônica (elo) |
| `get_kpis_alunos_canonicos` | sim | `relatorio-admin-whatsapp` (edge) | — | canônica (destino) |
| `get_kpis_alunos_financeiro_vivo_canonico` | sim | `…base_p01t` | — | canônica |
| `renovacoes` | sim (402 linhas) | RPCs: `get_resumo_renovacoes_proximas`, `get_programa_fideliza_dados`, `get_dados_relatorio_coordenacao`, `get_kpis_professor_periodo` | 3 triggers (`trg_audit`, `trigger_calcular_reajuste`, `update_…_updated_at`); FKs de saída p/ alunos/unidades/motivos_saida/professores | operacional |

**Writer de `renovacoes`:** nenhuma função SQL faz INSERT/UPDATE (regex amplo, schema-qualified, = vazio). Última inserção **2026-06-10 22:46** (hoje). **Todas as 402 linhas têm `created_by IS NULL`** → não é o app. Writer é **externo — provável n8n service-role** (⚠️ confirmar na fonte antes de qualquer ação; não verificado o workflow nesta fase).

### Achados fora do escopo (registrar)
- `registrar_venda_legacy` (RPC, 13 args) — não estava na lista. **NÃO_AVALIADO.**
- `sync_aluno_contatos_from_legacy` (trigger function) — verificar se algum trigger a usa. **NÃO_AVALIADO.**

---

## 5. Classificação por Objeto

| Objeto | Classificação | Justificativa |
|---|---|---|
| `get_kpis_alunos_canonicos` | **MANTER_CANONICO** | destino da migração; chamado pela edge WhatsApp |
| `get_kpis_alunos_canonicos_base_p01t` | **MANTER_CANONICO** | elo central da cadeia viva |
| `get_kpis_alunos_canonicos_base_p01q` | **MANTER_CANONICO** | camada-base da cadeia viva |
| `get_kpis_alunos_financeiro_vivo_canonico` | **MANTER_CANONICO** | cálculo financeiro vivo (MRR/ticket/inadimplência) |
| `useKPIsAlunosCanonicos` / `kpisAlunosVivosCanonicos` | **MANTER_CANONICO** | contrato de front, 10 callers |
| `renovacoes` | **MANTER_OPERACIONAL** | writer externo ativo (hoje) + 4 RPCs incl. Fideliza+/Professores |
| `get_dados_relatorio_gerencial_legacy_p01g` | **BLOQUEADO_POR_CONSUMIDOR** | chamada por `get_dados_relatorio_gerencial` |
| `get_dados_retencao_ia_legacy_p01g` | **BLOQUEADO_POR_CONSUMIDOR** | chamada por `get_dados_retencao_ia` |
| `vw_kpis_gestao_mensal` | **BLOQUEADO_POR_CONSUMIDOR** | lida pelas 2 `_legacy_p01g` |
| `vw_kpis_retencao_mensal` | **BLOQUEADO_POR_CONSUMIDOR** | lida pelas 2 `_legacy_p01g` |
| `vw_dashboard_unidade` | **CANDIDATO_DEPRECATED** | zero consumidor no banco; só código morto no front |
| `registrar_venda_legacy` | **NAO_AVALIADO** | fora do escopo; achado extra |
| `sync_aluno_contatos_from_legacy` | **NAO_AVALIADO** | fora do escopo; achado extra |

---

## 6. Riscos de Quebra por Área

| Área | Depende de | Risco se dropar legado hoje |
|---|---|---|
| Dashboard / Gestão | `useKPIsAlunosCanonicos` → `get_kpis_alunos_canonicos` (vivo) | **Baixo** p/ canônico; **Alto** se mexer em `_legacy_p01g` (relatório gerencial quebra) |
| Relatório WhatsApp | edge → `get_kpis_alunos_canonicos` | **Alto** se tocar a cadeia `p01q/p01t/canonicos` |
| IA / Gemini (retenção) | `get_dados_retencao_ia` → `_legacy_p01g` → views | **Crítico** — dropar views/legacy quebra a IA de retenção |
| Administrativo / Página Alunos | `useKPIsAlunosCanonicos` | Baixo (não toca legado) |
| Fideliza+ | `get_programa_fideliza_dados` → `renovacoes` | **Crítico** se tocar `renovacoes` |
| Professores / Carteira | `get_kpis_professor_periodo` → `renovacoes` | **Crítico** se tocar `renovacoes` |
| Comercial / Leads / Funil | objetos próprios (fora desta lista) | Nenhum nesta auditoria |
| Crons / n8n / Edge | writer externo de `renovacoes`; edge canônica | **Alto** — writer de `renovacoes` não está no código (confirmar n8n) |

---

## 7. Objetos Bloqueados e Motivo

1. `vw_kpis_gestao_mensal` — lida por ambas `_legacy_p01g`.
2. `vw_kpis_retencao_mensal` — lida por ambas `_legacy_p01g`.
3. `get_dados_relatorio_gerencial_legacy_p01g` — chamada por `get_dados_relatorio_gerencial` (público/IA).
4. `get_dados_retencao_ia_legacy_p01g` — chamada por `get_dados_retencao_ia` (IA retenção).
5. `renovacoes` — **BLOQUEADO_POR_REGRA_PENDENTE + consumidor**: writer externo ativo (insert hoje) + 4 RPCs, incluindo módulos protegidos. Não avaliar remoção.

---

## 8. Objetos Candidatos a Deprecated

**`vw_dashboard_unidade`** — único.
- Zero consumidor no banco (`pg_depend`=0, `prosrc` scan=0).
- Única referência: `TabDashboard.tsx:71`, em componente **não renderizado** (comentário do próprio código confirma intenção de deprecar).
- **Pré-requisito:** remover/limpar a referência morta no front **antes** de qualquer DROP, senão a aba legada quebra se alguém a reativar.

---

## 9. Plano de Deprecação em Fases

> Todas as escritas abaixo são **propostas para fases futuras** — nada executado nesta fase.

### Fase A — `vw_dashboard_unidade` (caminho curto)
1. **Código:** remover `TabDashboard.tsx` (ou a query `.from('vw_dashboard_unidade')`). PR isolado.
2. **Marcar deprecated:** `COMMENT ON VIEW vw_dashboard_unidade IS 'DEPRECATED 2026-06-10 — sem consumidor; remover após 30d';`
3. **Observação:** 30 dias. Monitorar logs PostgREST por acesso à view.
4. **Smoke:** Dashboard/Gestão renderizam sem a aba; nenhum 404/erro de view.
5. **Rollback:** reverter PR (view nunca foi dropada na janela).
6. **DROP:** só após janela limpa.

### Fase B — Bloco `_legacy_p01g` + 2 views (caminho longo, exige refatoração)
1. **De-legacy-ficar os wrappers:** reescrever `get_dados_relatorio_gerencial` e `get_dados_retencao_ia` para calcular a base **nativamente/canônica**, sem chamar `_legacy_p01g`. (migration com aprovação do Alf)
2. **Validar paridade:** comparar saída nova vs antiga por unidade/mês (snapshot diff) antes de cortar o legado.
3. **Cortar consumo:** quando os wrappers não citarem mais `_legacy_p01g`, as 2 funções e as 2 views ficam órfãs.
4. **Marcar deprecated** (COMMENT) → janela 30–60 dias → smoke (relatório gerencial + IA retenção idênticos) → rollback = restaurar delegação → **DROP** em ordem: funções `_legacy_p01g` primeiro, depois as views.

### Fora de fase
- `renovacoes`, `registrar_venda_legacy`, `sync_aluno_contatos_from_legacy`: **não entram** — exigem auditoria própria (writer n8n / uso de trigger).

---

## 10. SQL SELECT-only Usado

```sql
-- Funções legacy/p01g/p01q/p01t
SELECT proname, pronargs, prorettype::regtype FROM pg_proc
WHERE proname ~* '(legacy|p01g|p01q|p01t)'
  AND pronamespace=(SELECT oid FROM pg_namespace WHERE nspname='public');

-- Wiring: quem chama legacy_p01g / lê as views / chama canônico
SELECT p.proname,
  (p.prosrc ~* 'legacy_p01g') AS chama_legacy_p01g,
  (p.prosrc ~* 'vw_kpis_gestao_mensal') AS le_vw_gestao,
  (p.prosrc ~* 'vw_kpis_retencao_mensal') AS le_vw_retencao
FROM pg_proc p
WHERE p.pronamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')
  AND p.proname IN ('get_dados_relatorio_gerencial','get_dados_retencao_ia',
    'get_dados_relatorio_gerencial_legacy_p01g','get_dados_retencao_ia_legacy_p01g',
    'get_dados_relatorio_coordenacao');

-- Consumidores das views/renovacoes via prosrc
SELECT proname FROM pg_proc
WHERE prosrc ~* '(vw_kpis_gestao_mensal|vw_kpis_retencao_mensal|renovacoes)'
  AND pronamespace=(SELECT oid FROM pg_namespace WHERE nspname='public');

-- pg_depend das views/renovacoes
SELECT dep_obj.relname, ref_obj.relname FROM pg_depend d
JOIN pg_class ref_obj ON ref_obj.oid=d.refobjid
JOIN pg_class dep_obj ON dep_obj.oid=d.objid
WHERE ref_obj.relname IN ('vw_kpis_gestao_mensal','vw_dashboard_unidade',
  'vw_kpis_retencao_mensal','renovacoes') AND d.deptype='n';

-- Writer de renovacoes (regex amplo)
SELECT proname FROM pg_proc
WHERE pronamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')
  AND prosrc ~* 'into\s+(public\.)?"?renovacoes"?|update\s+(public\.)?"?renovacoes"?';

-- Origem das escritas em renovacoes
SELECT MAX(created_at) AS ultima, COUNT(*) FILTER (WHERE created_by IS NOT NULL) AS app,
       COUNT(*) FILTER (WHERE created_by IS NULL) AS nao_app, COUNT(*) total FROM renovacoes;

-- Triggers e FKs de renovacoes
SELECT trigger_name,event_manipulation FROM information_schema.triggers
WHERE event_object_table='renovacoes' AND trigger_schema='public';
```

---

## 11. Checklist Antes de Qualquer DROP

- [ ] Objeto tem **zero** consumidor em `pg_proc.prosrc` (não só no front)?
- [ ] `pg_depend` (deptype `n`) = vazio?
- [ ] Zero referência runtime em `src/` e `supabase/functions/` (excluir doc/migration)?
- [ ] Logs PostgREST/Supabase sem acesso ao objeto na janela de observação?
- [ ] Para views legadas: os 2 wrappers públicos **já não citam** `_legacy_p01g`?
- [ ] Para `renovacoes`: writer externo (n8n) confirmado na fonte e desligado?
- [ ] `COMMENT … 'DEPRECATED'` aplicado e janela de 30–60d cumprida?
- [ ] Smoke tests verdes (Relatório Gerencial, IA Retenção, WhatsApp, Dashboard)?
- [ ] Rollback testado (reverter PR / restaurar delegação) **sem** ter dropado nada?
- [ ] Aprovação explícita do Alf para a migration de DROP?

---

## 12. Recomendação Final

1. **Avançar só com `vw_dashboard_unidade`** (Fase A): é o único objeto com risco real próximo de zero. Começar pela limpeza do código morto em `TabDashboard.tsx`.
2. **Não tocar** em `_legacy_p01g` nem nas 2 views enquanto os wrappers públicos delegarem a elas. A deprecação desse bloco é uma **refatoração** (Fase B), não um DROP.
3. **`renovacoes` permanece operacional** — há INSERT de hoje e consumidores Fideliza+/Professores. Antes de qualquer hipótese futura, **mapear o writer na fonte** (provável n8n) conforme a regra "ler-a-fonte".
4. **Reclassificar `p01q`/`p01t` como canônicos** na documentação — o sufixo confunde, mas são infraestrutura viva, não legado.
5. **Abrir avaliação separada** para `registrar_venda_legacy` e `sync_aluno_contatos_from_legacy` (fora do escopo desta auditoria).

**Saldo:** 1 candidato seguro · 4 bloqueados-por-consumidor · 5 manter-canônico · 1 manter-operacional · 2 não-avaliados. Nenhum DROP autorizado nesta fase.
