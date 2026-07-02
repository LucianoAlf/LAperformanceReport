# Aposentar a tabela legada `renovacoes` — Design

**Data:** 2026-07-01
**Autor:** Luciano / Hugo (via Claude)
**Status:** Proposto (aguardando revisão)

## Problema

O sistema tem duas tabelas paralelas para renovações:

- **`movimentacoes_admin`** — fonte operacional atual (o botão "confirmar renovação", o Fideliza+ canônico, o score de professor, tudo já lê daqui).
- **`renovacoes`** — tabela legada. A edge `processar-matricula-emusys` ainda grava nela (`status='pendente'`), mas **nada reverte** para `renovado` quando a renovação é confirmada (o botão da tela Administrativo só toca `movimentacoes_admin`). Resultado: dessincronia permanente.

Exemplo real (Adriana Christine): a mesma renovação (R$ 400 → R$ 447) aparece como `confirmada` em `movimentacoes_admin` e ainda como `pendente` em `renovacoes`.

Não há bug visível urgente para o usuário — na maioria das telas o front já mostra o dado certo via `movimentacoes_admin`. Isto é **limpeza de dívida técnica**: eliminar a segunda fonte para o sistema parar de acumular inconsistência silenciosa.

## Objetivo

Tornar `movimentacoes_admin` a **única fonte de verdade** de renovações, deixando `renovacoes` 100% legado (nada lê nem escreve nela), sem perda de dados e de forma reversível.

## Não-objetivos

- Não backfillar as 44 renovações órfãs de baixa qualidade (ver decisão abaixo).
- **NUNCA deletar (`DROP TABLE`) a tabela `renovacoes`.** Em nenhuma fase. O máximo é renomear para `renovacoes_legado` (Fase 3). Um eventual `DROP` no futuro seria uma decisão à parte, fora do escopo deste design.
- Não mexer em métricas que já usam `movimentacoes_admin` (score de professor, Fideliza+ canônico do front).

## Diagnóstico — dependências reais da tabela

Varredura completa no banco (functions, views, triggers, FKs) + frontend:

**Frontend — consumidores vivos (5):**
| Componente | Onde aparece | Uso |
|---|---|---|
| `ModalFichaAluno` | Ficha do aluno → Histórico → "Histórico de Renovações" | leitura (últimas 5) |
| `TabRetencao` | Analytics → Retenção | leitura (contagem do mês) |
| `useMetas` | Metas | contagem de renovadas |
| `TabelaAlunos` | Alunos → expandir aluno | leitura (histórico) |
| `useProfessorDependencies` | Excluir professor | contagem-guarda |

**Frontend — código morto (deletar):**
- `RelatorioDiario` — rota `/app/relatorios/diario`, órfã de navegação (não está no `AppSidebar` nem acessível pelo menu).
- `FormRenovacao` — insert com colunas erradas (escrita quebrada).
- `PlanilhaRetencao` — órfã (fora do menu), lê e escreve.
- `SnapshotDiario` — não montada em rota nenhuma.

**Backend:**
- `get_programa_fideliza_dados` (RPC) — CTE `renovacoes_trim` lê a tabela. O front sobrescreve com canônico, mas corrigir por higiene.
- `vw_alertas_inteligentes` (view **viva** — Dashboard, seção "Alertas Inteligentes") — só o ramo `CONTRATO_VENCENDO` toca a tabela, via join por `status='concluida'` (valor inexistente) → **já quebrado hoje**.
- `vw_renovacoes_pendentes` (view **morta** — só nos types) — usa status `realizada`/`nao_renovada` inexistentes.
- `vw_renovacoes_mensal` (view **morta** — sem consumo no front).
- 3 triggers na tabela (`trg_audit`, `trigger_calcular_reajuste`, `update_renovacoes_updated_at`) — só disparam em escrita.
- Edge `processar-matricula-emusys` — grava na tabela em `handleRenovacao`.

**Falso positivo (NÃO dependem da tabela):** `get_kpis_professor_periodo` e `get_dados_relatorio_coordenacao` têm um **CTE chamado `renovacoes`** que na verdade lê `FROM movimentacoes_admin`. O nome colidiu com o da tabela.

**Foreign keys:** nenhuma tabela referencia `renovacoes` → sem risco estrutural.

## Decisão sobre as 44 renovações órfãs

44 renovações existem só em `renovacoes` (sem correspondente em `movimentacoes_admin`): 42 `renovado` + 2 `pendente`.

Validação via API do Emusys (`GET /matriculas?aluno_id=`): **são renovações reais** (`qtd_contratos > 1` — ex.: Billy Vangu com 4 contratos). Porém **40 das 42** têm `valor_parcela_novo` e `percentual_reajuste` zerados/nulos, porque o `emusys_matricula_id` que guardamos aponta para uma matrícula secundária (valor 0), não a principal.

**Decisão:** não fazer backfill. Registros de baixa qualidade sujariam `movimentacoes_admin`. Ficam preservados em `renovacoes_legado` (consultáveis). O único efeito visível é que somem das telas de renovação — e já apareciam com valor 0. Reversível se necessário.

## Mapeamento `renovacoes` → `movimentacoes_admin`

| `renovacoes` | `movimentacoes_admin` | Observação |
|---|---|---|
| `data_renovacao` | `data` | data do evento |
| `valor_parcela_anterior` | `valor_parcela_anterior` | igual |
| `valor_parcela_novo` | `valor_parcela_novo` | igual |
| `percentual_reajuste` | *(calcular)* | `(valor_novo/valor_anterior − 1) × 100` |
| `agente` | `agente_comercial` | — |
| `status='renovado'` | `tipo='renovacao'` e `renovacao_status IN ('confirmada','antecipada_confirmada')` | — |
| `status='pendente'` | `renovacao_status IN ('pendente_validacao','antecipada_pendente')` | — |
| `status='nao_renovou'` | `tipo IN ('nao_renovacao','evasao')` | — |
| `data_inicio/fim_novo_contrato`, `data_fim_contrato_anterior` | *(não existem)* | nenhum consumidor vivo usa → descartadas (ficam no arquivo) |

## Solução em 3 fases

### Fase 1 — Estancar e limpar (risco quase zero, não toca nada vivo)
1. **Edge `processar-matricula-emusys`**: remover os writes em `renovacoes` no `handleRenovacao`, mantendo só `movimentacoes_admin`. Bump para v27. Deploy via CLI `--no-verify-jwt`.
2. **Deletar código morto:** `RelatorioDiario.tsx` (+ rota no `router.tsx` e card no `EntradaMenu.tsx`), `FormRenovacao.tsx`, `PlanilhaRetencao.tsx`, `SnapshotDiario.tsx` (+ imports/rotas órfãs).
3. **Dropar views mortas:** `vw_renovacoes_pendentes`, `vw_renovacoes_mensal`.

### Fase 2 — Reapontar consumidores vivos (com validação número a número)
Para cada item, rodar a query comparativa **antes** (ver Validação) e só trocar se os números baterem:
4. `ModalFichaAluno` — "Histórico de Renovações" lê `movimentacoes_admin` (`tipo='renovacao'`), reajuste calculado no map.
5. `TabRetencao` — contagem do mês por `movimentacoes_admin` (renovadas/não-renovadas/pendentes derivadas de `renovacao_status`/`tipo`).
6. `useMetas` — count de `movimentacoes_admin` (`tipo='renovacao'`, `renovacao_status` confirmada) por `data`.
7. `TabelaAlunos` — histórico por `movimentacoes_admin`.
8. `useProfessorDependencies` — contagem-guarda por `movimentacoes_admin`.
9. `get_programa_fideliza_dados` — reapontar CTE `renovacoes_trim` para `movimentacoes_admin` (manter shape do retorno; é `SECURITY DEFINER`).
10. `vw_alertas_inteligentes` — reescrever o ramo `CONTRATO_VENCENDO` para derivar renovação de `movimentacoes_admin` (ou remover o ramo, já que está quebrado). `CREATE OR REPLACE VIEW`; testar o Dashboard depois.

### Fase 3 — Arquivar (futuro, trivial, depois de confirmar zero referências)
11. **Renomear** `renovacoes` → `renovacoes_legado` (read-only) — `ALTER TABLE ... RENAME`, **nunca `DROP`**. Confirmar que nenhuma referência restou (grep + `pg_depend`). Triggers seguem inertes. Os dados (452 linhas, incl. as 44 órfãs) permanecem intactos.

## Validação (antes × depois)

Rodar e comparar em cada troca da Fase 2:

- **Contagem por mês/unidade:** `renovacoes` (`status='renovado'` por `data_renovacao`) vs `movimentacoes_admin` (`tipo='renovacao'`, confirmada, por `data`). Diferença esperada = as 44 órfãs; qualquer outra diferença é investigada antes.
- **Amostra de fichas:** para 5–10 alunos, comparar as últimas renovações nas duas fontes (valores e reajuste).
- **Meta do mês corrente:** total renovado nas duas fontes.
- **Dashboard:** conferir que os 7 tipos de alerta continuam corretos após recriar a view.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| `vw_alertas_inteligentes` é viva (Dashboard) | Ramo tocado já está quebrado; `CREATE OR REPLACE` + teste manual do Dashboard |
| RPC Fideliza `SECURITY DEFINER` | Manter shape do JSON; front já sobrescreve, então impacto baixo |
| 44 órfãs somem das telas | Decisão consciente; preservadas em `renovacoes_legado`; reversível |
| Regressão em contagem | Validação comparativa obrigatória antes de cada troca |

## Reversibilidade

Nenhuma etapa apaga dados. Reapontamento de leitura é troca de fonte; parar a escrita não remove nada; arquivar é renomear (não dropar). Reverter = reapontar de volta e/ou renomear `renovacoes_legado` → `renovacoes`.
