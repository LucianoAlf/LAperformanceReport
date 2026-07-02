# Aposentar a tabela legada `renovacoes` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar `movimentacoes_admin` a única fonte de verdade de renovações, deixando `renovacoes` 100% legada (nada lê nem escreve nela em runtime), sem deletar componentes nem dropar a tabela.

**Architecture:** Faseado. Fase 1 estanca a escrita (edge) e remove views mortas. Fase 2 reaponta cada consumidor (vivo e órfão) para `movimentacoes_admin`, validando número a número com query comparativa antes de cada troca. Fase 3 (futura) renomeia a tabela para arquivo.

**Tech Stack:** React 19 + TypeScript + Vite; Supabase (Postgres + Edge Functions Deno); MCP Supabase para SQL/deploy.

## Global Constraints

- **NUNCA `DROP TABLE renovacoes`.** Máximo é `ALTER TABLE ... RENAME` (Fase 3).
- **NUNCA deletar componentes/arquivos.** Só reapontar referências.
- Git: author = Luciano, **sem** `Co-Authored-By` (Vercel Hobby bloqueia).
- Deploy de edge de webhook = CLI `supabase functions deploy ... --no-verify-jwt` (não MCP).
- Timezone BRT (UTC-3) nas datas de negócio.
- Supabase project_id: `ouqwbbermlzqqvtqwlul`.
- Não há test framework no projeto — validação = query SQL comparativa + `npx tsc --noEmit` + teste manual da tela.
- **Mapeamento de status canônico** (usado em várias tarefas):
  - `renovado` ⇔ `tipo='renovacao' AND renovacao_status IN ('confirmada','antecipada_confirmada')`
  - `pendente` ⇔ `tipo='renovacao' AND renovacao_status IN ('pendente_validacao','antecipada_pendente')`
  - `nao_renovou` ⇔ `tipo='nao_renovacao'`
  - `percentual_reajuste` não existe em `movimentacoes_admin` → calcular: `round((valor_parcela_novo/valor_parcela_anterior - 1)*100, 2)` quando `valor_parcela_anterior > 0`, senão `0`.

---

## FASE 1 — Estancar (risco quase zero)

### Task 1: Parar a edge de gravar em `renovacoes`

**Files:**
- Modify: `supabase/functions/processar-matricula-emusys/index.ts` (função `handleRenovacao` + banner de versão)

**Interfaces:**
- Consumes: nada novo.
- Produces: edge v27 que grava renovação só em `movimentacoes_admin`.

- [ ] **Step 1: Localizar os writes em `renovacoes`**

Run: `grep -n "from('renovacoes')\|\.from(\"renovacoes\")\|renovacoes'" supabase/functions/processar-matricula-emusys/index.ts`
Expected: 1+ ocorrências dentro de `handleRenovacao` (insert/upsert na tabela `renovacoes`).

- [ ] **Step 2: Remover o bloco de escrita em `renovacoes`**

Remover **apenas** o(s) `await supabase.from('renovacoes').insert(...)` / `.upsert(...)` / `.update(...)` dentro de `handleRenovacao`. Manter intacta toda a escrita em `movimentacoes_admin` e o cálculo de `complementarDescontoMatricula`. Se o valor inserido em `renovacoes` era usado depois, confirmar que não há dependência (o retorno do insert não deve alimentar nada em `movimentacoes_admin`).

- [ ] **Step 3: Atualizar o banner de versão**

Trocar `v26` por `v27` no topo e adicionar nota:
```
// MUDANÇAS v27 (2026-07-01):
// - Para de gravar na tabela legada `renovacoes` (handleRenovacao). movimentacoes_admin
//   passa a ser a única fonte de renovações. Parte da aposentadoria da tabela renovacoes.
```

- [ ] **Step 4: Validar sintaxe**

Run: `node --check supabase/functions/processar-matricula-emusys/index.ts` (ou `deno check` se disponível)
Expected: sem erros.

- [ ] **Step 5: Deploy**

Run: `npx supabase functions deploy processar-matricula-emusys --no-verify-jwt --project-ref ouqwbbermlzqqvtqwlul`
Expected: "Deployed Functions on project ... processar-matricula-emusys".

- [ ] **Step 6: Confirmar versão no ar**

Via MCP `get_edge_function` → grep `processar-matricula-emusys v27`.
Expected: v27 presente; nenhum `from('renovacoes')` no corpo deployado.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/processar-matricula-emusys/index.ts
git commit -m "Edge v27: para de gravar na tabela legada renovacoes"
```

---

### Task 2: Dropar as views mortas

**Files:**
- Migration via MCP `apply_migration` (nome: `drop_views_renovacoes_mortas`)

**Interfaces:**
- Consumes: confirmação de que `vw_renovacoes_pendentes` e `vw_renovacoes_mensal` não têm consumo no front (já confirmado por grep).
- Produces: banco sem essas 2 views.

- [ ] **Step 1: Reconfirmar zero consumo no código**

Run: `grep -rn "vw_renovacoes_pendentes\|vw_renovacoes_mensal" src/`
Expected: só aparições em `src/types/database.types.ts` (tipos gerados). Nenhuma query real. Se aparecer em `.tsx`/`.ts` de lógica, PARAR e reavaliar.

- [ ] **Step 2: Guardar a definição (backup no commit da migration)**

Via MCP `execute_sql`: `select viewname, definition from pg_views where viewname in ('vw_renovacoes_pendentes','vw_renovacoes_mensal');`
Copiar as definições para um comentário no corpo da migration (permite recriar se preciso).

- [ ] **Step 3: Aplicar a migration**

Via MCP `apply_migration` name `drop_views_renovacoes_mortas`:
```sql
-- Backup das definições no histórico da migration (ver comentário acima).
DROP VIEW IF EXISTS public.vw_renovacoes_pendentes;
DROP VIEW IF EXISTS public.vw_renovacoes_mensal;
```

- [ ] **Step 4: Validar**

Via MCP `execute_sql`: `select count(*) from pg_views where viewname in ('vw_renovacoes_pendentes','vw_renovacoes_mensal');`
Expected: `0`.

- [ ] **Step 5: Regenerar types e commitar**

Run: regenerar `src/types/database.types.ts` (via MCP `generate_typescript_types` ou script do projeto), depois:
```bash
git add src/types/database.types.ts
git commit -m "Dropa views mortas vw_renovacoes_pendentes e vw_renovacoes_mensal"
```

---

## FASE 2 — Reapontar referências (validação número a número)

> Antes de cada troca de leitura, rodar a query de baseline correspondente e anotar o número atual. Depois da troca, rodar de novo na nova fonte e confirmar diferença = só as 44 órfãs (ou zero).

### Task 3: `ModalFichaAluno` — Histórico de Renovações

**Files:**
- Modify: `src/components/App/Alunos/ModalFichaAluno.tsx:484-489` (query) + o `.map` do render do "Histórico de Renovações" + a interface local (L84-88)

**Interfaces:**
- Consumes: mapeamento de status canônico (Global Constraints).
- Produces: histórico de renovações lido de `movimentacoes_admin`.

- [ ] **Step 1: Baseline — comparar as duas fontes para 3 alunos com renovação**

Via MCP `execute_sql`:
```sql
select a.id, a.nome,
 (select count(*) from renovacoes r where r.aluno_id=a.id) as na_legada,
 (select count(*) from movimentacoes_admin m where m.aluno_id=a.id and m.tipo='renovacao') as na_nova
from alunos a
where exists (select 1 from renovacoes r where r.aluno_id=a.id)
order by a.id limit 10;
```
Anotar. Diferenças só devem ocorrer para alunos com órfãs de valor 0.

- [ ] **Step 2: Trocar a query**

Substituir o segundo item do `Promise.all` (L484-489):
```ts
        supabase
          .from('movimentacoes_admin')
          .select('id, data, valor_parcela_anterior, valor_parcela_novo')
          .eq('aluno_id', aluno.id)
          .eq('tipo', 'renovacao')
          .order('data', { ascending: false })
          .limit(5),
```

- [ ] **Step 3: Ajustar o mapeamento para o state `renovacoes`**

Onde `setRenovacoes(renRes.data || [])` (≈L508), mapear para o shape da interface local (`data_renovacao`, `percentual_reajuste`):
```ts
      setRenovacoes((renRes.data || []).map((m: any) => ({
        id: m.id,
        data_renovacao: m.data,
        valor_parcela_anterior: Number(m.valor_parcela_anterior) || 0,
        valor_parcela_novo: Number(m.valor_parcela_novo) || 0,
        percentual_reajuste: Number(m.valor_parcela_anterior) > 0
          ? Math.round((Number(m.valor_parcela_novo)/Number(m.valor_parcela_anterior) - 1) * 1000) / 10
          : 0,
      })));
```
(A interface local em L84-88 já tem esses campos — não muda.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem novos erros (ignorar erro pré-existente de `scripts/importar_historico_ltv.js`).

- [ ] **Step 5: Teste manual**

Abrir a ficha da Adriana Christine → aba Histórico. "Histórico de Renovações" deve mostrar 400 → 447 (+11.8%), igual a "Últimas Movimentações".

- [ ] **Step 6: Commit**

```bash
git add src/components/App/Alunos/ModalFichaAluno.tsx
git commit -m "ModalFichaAluno: historico de renovacoes le movimentacoes_admin"
```

---

### Task 4: `TabRetencao` — contagem do mês

**Files:**
- Modify: `src/components/GestaoMensal/TabRetencao.tsx:79-95` (query) + L147-159 (cálculo de renovadas/nao_renovadas/pendentes) + interface `Renovacao`

**Interfaces:**
- Consumes: status canônico.
- Produces: KPIs de renovação da aba Retenção vindos de `movimentacoes_admin`.

- [ ] **Step 1: Baseline por mês/unidade**

Via MCP `execute_sql` (mês corrente, ajustar range):
```sql
-- legada
select count(*) filter (where status='renovado') renovado,
       count(*) filter (where status='nao_renovou') nao_renovou,
       count(*) filter (where status='pendente') pendente
from renovacoes where data_renovacao >= '2026-07-01' and data_renovacao <= '2026-07-31';
-- nova
select count(*) filter (where tipo='renovacao' and renovacao_status in ('confirmada','antecipada_confirmada')) renovado,
       count(*) filter (where tipo='nao_renovacao') nao_renovou,
       count(*) filter (where tipo='renovacao' and renovacao_status in ('pendente_validacao','antecipada_pendente')) pendente
from movimentacoes_admin where data >= '2026-07-01' and data <= '2026-07-31';
```
Anotar e comparar.

- [ ] **Step 2: Trocar a query (L80-84)**

```ts
        let renovacoesQuery = supabase
          .from('movimentacoes_admin')
          .select('id, data, tipo, renovacao_status, valor_parcela_anterior, valor_parcela_novo, unidade_id')
          .in('tipo', ['renovacao', 'nao_renovacao'])
          .gte('data', startDate)
          .lte('data', endDate);
```

- [ ] **Step 3: Ajustar o cálculo (L147-159)**

```ts
        const renovacoesData = renovacoesRes.data || [];
        const renovadas = renovacoesData.filter(r => r.tipo === 'renovacao' && ['confirmada','antecipada_confirmada'].includes(r.renovacao_status)).length;
        const naoRenovadas = renovacoesData.filter(r => r.tipo === 'nao_renovacao').length;
        const pendentes = renovacoesData.filter(r => r.tipo === 'renovacao' && ['pendente_validacao','antecipada_pendente'].includes(r.renovacao_status)).length;
        const atrasadas = renovacoesData.filter(r => {
          if (!(r.tipo === 'renovacao' && ['pendente_validacao','antecipada_pendente'].includes(r.renovacao_status))) return false;
          return new Date(r.data) < new Date();
        }).length;
        const totalRenovacoes = renovadas + naoRenovadas;
```

- [ ] **Step 4: Atualizar a interface `Renovacao` (≈L32-39)**

Trocar os campos para os de `movimentacoes_admin`:
```ts
interface Renovacao {
  id: number;
  data: string;
  tipo: string;
  renovacao_status: string;
  valor_parcela_anterior: number | null;
  valor_parcela_novo: number | null;
  unidade_id: string;
}
```
Ajustar qualquer uso remanescente de `data_renovacao`/`status` nesse arquivo para `data`/derivação.

- [ ] **Step 5: Typecheck + teste manual**

Run: `npx tsc --noEmit` → sem novos erros.
Abrir Analytics → Retenção; conferir que renovadas/não-renovadas/pendentes batem com o baseline da nova fonte.

- [ ] **Step 6: Commit**

```bash
git add src/components/GestaoMensal/TabRetencao.tsx
git commit -m "TabRetencao: KPIs de renovacao vindos de movimentacoes_admin"
```

---

### Task 5: `useMetas` — contagem de renovadas

**Files:**
- Modify: `src/hooks/useMetas.ts:139-150`

**Interfaces:**
- Consumes: status canônico.
- Produces: meta de renovações contada de `movimentacoes_admin`.

- [ ] **Step 1: Baseline** — usar a mesma query da Task 4 Step 1 (renovado).

- [ ] **Step 2: Trocar a query**

```ts
      let renovacoesQuery = supabase
        .from('movimentacoes_admin')
        .select('*', { count: 'exact', head: true })
        .gte('data', startDate)
        .lte('data', endDate)
        .eq('tipo', 'renovacao')
        .in('renovacao_status', ['confirmada', 'antecipada_confirmada']);
```
(O filtro `.eq('unidade_id', ...)` logo abaixo permanece.)

- [ ] **Step 3: Typecheck (sem teste visual)**

Run: `npx tsc --noEmit` → ok.
NOTA: o hook `src/hooks/useMetas.ts` é consumido apenas por `src/components/Metas2026.tsx`, que **não tem rota** (tela morta). A tela viva `/app/metas` (`MetasPageNew`) usa `useMetasKPI` (tabela `metas_kpi`), **não** este hook. Portanto não há impacto visual — validação é só pela query de baseline (Step 1).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useMetas.ts
git commit -m "useMetas: conta renovacoes de movimentacoes_admin"
```

---

### Task 6: `TabelaAlunos` — histórico ao expandir aluno

**Files:**
- Modify: `src/components/App/Alunos/TabelaAlunos.tsx:882-886`

**Interfaces:**
- Consumes: status canônico.
- Produces: histórico do aluno lido de `movimentacoes_admin`.

- [ ] **Step 1: Ver como o resultado é usado**

Run: `grep -n "renovacoes\|setRenovac\|\.data_renovacao\|percentual_reajuste" src/components/App/Alunos/TabelaAlunos.tsx`
Anotar os campos consumidos no render/estado.

- [ ] **Step 2: Trocar a query**

```ts
        .from('movimentacoes_admin')
        .select('id, data, tipo, valor_parcela_anterior, valor_parcela_novo')
        .eq('aluno_id', aluno.id)
        .eq('tipo', 'renovacao')
        .order('data', { ascending: false });
```

- [ ] **Step 3: Ajustar consumo**

Onde o resultado é usado, mapear `data`→exibição e calcular reajuste como na Task 3 Step 3. Se só conta linhas, nenhum ajuste extra.

- [ ] **Step 4: Typecheck + teste manual**

Run: `npx tsc --noEmit` → ok. Expandir um aluno com renovação na tabela de Alunos; conferir histórico.

- [ ] **Step 5: Commit**

```bash
git add src/components/App/Alunos/TabelaAlunos.tsx
git commit -m "TabelaAlunos: historico de renovacao de movimentacoes_admin"
```

---

### Task 7: `useProfessorDependencies` — contagem-guarda

**Files:**
- Modify: `src/hooks/useProfessorDependencies.ts:114-117`

**Interfaces:**
- Consumes: nada novo.
- Produces: contagem-guarda de renovações do professor via `movimentacoes_admin`.

- [ ] **Step 1: Trocar a query**

```ts
        supabase
          .from('movimentacoes_admin')
          .select('id', { count: 'exact', head: true })
          .eq('professor_id', professorId)
          .eq('tipo', 'renovacao'),
```

- [ ] **Step 2: Confirmar que o resultado (contagem) segue somado corretamente**

Ver onde a contagem é agregada no total de dependências; garantir que a label/uso continua coerente ("renovações vinculadas").

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` → ok.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useProfessorDependencies.ts
git commit -m "useProfessorDependencies: contagem de renovacao via movimentacoes_admin"
```

---

### Task 8: `RelatorioDiario` (órfão) — contagem do mês

**Files:**
- Modify: `src/components/App/Entrada/RelatorioDiario.tsx:123-129`

**Interfaces:**
- Consumes: status canônico.
- Produces: contagem de renovações do relatório via `movimentacoes_admin`.

- [ ] **Step 1: Trocar a query**

```ts
        const { count: renovacoesMes } = await supabase
          .from('movimentacoes_admin')
          .select('*', { count: 'exact', head: true })
          .eq('unidade_id', unidade.id)
          .eq('tipo', 'renovacao')
          .in('renovacao_status', ['confirmada', 'antecipada_confirmada'])
          .gte('data', `${mesAtual}-01`)
          .lte('data', dataRelatorio);
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` → ok.

- [ ] **Step 3: Commit**

```bash
git add src/components/App/Entrada/RelatorioDiario.tsx
git commit -m "RelatorioDiario: contagem de renovacao via movimentacoes_admin"
```

---

### Task 9: `SnapshotDiario` (órfão) — leitura de status

**Files:**
- Modify: `src/components/App/Snapshot/SnapshotDiario.tsx:147-153` + o `forEach` que processa `renovacoesData` (≈L180+)

**Interfaces:**
- Consumes: status canônico.
- Produces: resumo de renovações/não-renovações via `movimentacoes_admin`.

- [ ] **Step 1: Trocar a query**

```ts
      const { data: renovacoesData } = await sb
        .from('movimentacoes_admin')
        .select('tipo, renovacao_status')
        .eq('unidade_id', selectedUnidade)
        .in('tipo', ['renovacao', 'nao_renovacao'])
        .gte('data', inicioMes)
        .lte('data', fimMes);
```

- [ ] **Step 2: Ajustar o processamento**

Onde `renovacoesData.forEach` calcula `resumo.renovacoes`/`resumo.nao_renovacoes` por `status`, trocar para o mapeamento canônico:
```ts
      if (renovacoesData) {
        renovacoesData.forEach((r: any) => {
          if (r.tipo === 'nao_renovacao') resumo.nao_renovacoes += 1;
          else if (['confirmada','antecipada_confirmada'].includes(r.renovacao_status)) resumo.renovacoes += 1;
        });
      }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` → ok.

- [ ] **Step 4: Commit**

```bash
git add src/components/App/Snapshot/SnapshotDiario.tsx
git commit -m "SnapshotDiario: resumo de renovacao via movimentacoes_admin"
```

---

### Task 10: `FormRenovacao` (órfão) — reapontar o insert

**Files:**
- Modify: `src/components/App/Entrada/FormRenovacao.tsx:117-128`

**Interfaces:**
- Consumes: status canônico.
- Produces: renovação manual gravada em `movimentacoes_admin`.

- [ ] **Step 1: Substituir o insert em `renovacoes`**

Trocar o bloco L117-128 (`from('renovacoes').insert`) por:
```ts
      await supabase.from('movimentacoes_admin').insert({
        aluno_id: data.aluno_id,
        unidade_id: selectedAluno?.unidade_id,
        tipo: 'renovacao',
        data: data.data_renovacao,
        valor_parcela_anterior: data.valor_anterior,
        valor_parcela_novo: data.valor_novo,
        renovacao_status: 'confirmada',
        observacoes: data.observacoes || null,
      });
```
(O `update` em `alunos` L112-115 e o insert em `movimentacoes` L130-137 permanecem inalterados. `percentual_reajuste`/`duracao_contrato`/`motivo_reajuste` não têm coluna em `movimentacoes_admin` e já vão no texto de `observacoes` do insert de `movimentacoes`.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` → ok.

- [ ] **Step 3: Teste manual (via URL direta)**

Abrir `/app/entrada/renovacao`, preencher e salvar; confirmar toast de sucesso e a linha em `movimentacoes_admin` (não mais erro de coluna, que era o bug original).

- [ ] **Step 4: Commit**

```bash
git add src/components/App/Entrada/FormRenovacao.tsx
git commit -m "FormRenovacao: grava renovacao em movimentacoes_admin"
```

---

### Task 11: `PlanilhaRetencao` (órfã) — reapontar leitura e escrita

**Files:**
- Modify: `src/components/App/Retencao/PlanilhaRetencao.tsx:114-126` (leitura), `:350-393` (escrita), + o mapeamento de linhas de renovação (≈L145+)

**Interfaces:**
- Consumes: status canônico.
- Produces: planilha de retenção lendo/gravando renovações em `movimentacoes_admin`.

- [ ] **Step 1: Trocar a leitura (L114-126)**

```ts
      let renovacoesQuery = sb
        .from('movimentacoes_admin')
        .select(`
          id, unidade_id, data, aluno_id, valor_parcela_anterior, valor_parcela_novo,
          tipo, renovacao_status, motivo_saida_id, agente_comercial, observacoes,
          alunos(nome)
        `)
        .eq('tipo', 'renovacao')
        .order('data', { ascending: false });
```

- [ ] **Step 2: Ajustar o mapeamento das linhas de renovação**

Onde processa `renovacoesRes.data` para `RetencaoRow`, mapear:
- `data_renovacao` ← `data`
- `status` ← derivar (`renovado` se `renovacao_status IN ('confirmada','antecipada_confirmada')`, senão `pendente`)
- `percentual_reajuste` ← calcular (fórmula canônica)
- `agente` ← `agente_comercial`

- [ ] **Step 3: Trocar a escrita (L350-393)**

`dataToSave` e os `insert`/`update` passam a apontar `movimentacoes_admin`:
```ts
        const dataToSave = {
          unidade_id: row.unidade_id,
          data: row.data,
          aluno_id: row.aluno_id,
          tipo: 'renovacao',
          valor_parcela_anterior: row.valor_parcela_anterior,
          valor_parcela_novo: row.valor_parcela_novo,
          renovacao_status: row.status === 'renovado' ? 'confirmada' : 'pendente_validacao',
          agente_comercial: row.agente,
          observacoes: row.observacoes,
          updated_at: new Date().toISOString(),
        };
```
Trocar `.from('renovacoes')` por `.from('movimentacoes_admin')` nos dois ramos (insert/update). Remover `created_by` se a coluna não existir em `movimentacoes_admin` (confirmar via `information_schema`).

- [ ] **Step 4: Confirmar colunas de `movimentacoes_admin`**

Via MCP `execute_sql`: `select column_name from information_schema.columns where table_name='movimentacoes_admin';`
Garantir que `agente_comercial`, `motivo_saida_id`, `renovacao_status` existem (já confirmado) e que `created_by` NÃO existe (então não incluir).

- [ ] **Step 5: Typecheck + teste manual (via URL)**

Run: `npx tsc --noEmit` → ok. Abrir `/app/retencao`, editar/salvar uma linha de renovação; confirmar gravação em `movimentacoes_admin`.

- [ ] **Step 6: Commit**

```bash
git add src/components/App/Retencao/PlanilhaRetencao.tsx
git commit -m "PlanilhaRetencao: le e grava renovacao em movimentacoes_admin"
```

---

### Task 12: RPC `get_programa_fideliza_dados` — CTE `renovacoes_trim`

**Files:**
- Migration via MCP `apply_migration` (nome: `fideliza_le_movimentacoes_admin`)

**Interfaces:**
- Consumes: status canônico.
- Produces: RPC que calcula taxa_renovacao/reajuste de `movimentacoes_admin`, mantendo o mesmo shape de retorno.

- [ ] **Step 1: Baseline do retorno atual**

Via MCP `execute_sql`: `select get_programa_fideliza_dados(2026, null, null);`
Salvar o JSON (bloco `farmers[].metricas.renovacao_bruto` e `taxa_renovacao`).

- [ ] **Step 2: Reescrever a CTE `renovacoes_trim`**

`CREATE OR REPLACE FUNCTION` com o mesmo corpo, trocando **apenas** a CTE:
```sql
  renovacoes_trim AS (
    SELECT m.unidade_id,
      COUNT(*) FILTER (WHERE m.tipo='renovacao' AND m.renovacao_status IN ('confirmada','antecipada_confirmada')) AS renovados,
      COUNT(*) FILTER (WHERE m.tipo IN ('renovacao','nao_renovacao')) AS total_contratos,
      COALESCE(AVG(
        CASE WHEN m.valor_parcela_anterior > 0
          THEN round((m.valor_parcela_novo/m.valor_parcela_anterior - 1)*100, 2) END
      ) FILTER (WHERE m.tipo='renovacao' AND m.renovacao_status IN ('confirmada','antecipada_confirmada')), 0) AS reajuste_medio
    FROM movimentacoes_admin m
    WHERE EXTRACT(YEAR FROM m.data) = p_ano
      AND EXTRACT(MONTH FROM m.data) BETWEEN ((v_trim_atual - 1) * 3 + 1) AND (v_trim_atual * 3)
      AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
    GROUP BY m.unidade_id
  ),
```
Manter `SECURITY DEFINER` e todo o resto idêntico.

- [ ] **Step 3: Aplicar e comparar retorno**

Via MCP `execute_sql`: `select get_programa_fideliza_dados(2026, null, null);`
Comparar com baseline. Diferença esperada: taxa/reajuste podem mudar (a legada estava dessincronizada). Confirmar que o **shape** é idêntico e os números fazem sentido vs `movimentacoes_admin`.

- [ ] **Step 4: Confirmar Fideliza+ na tela**

Abrir Administrativo → Programa Fideliza. Como o front sobrescreve com canônico, a tela não deve mudar. Confirmar que não quebrou.

- [ ] **Step 5: Commit** (a migration já versiona; registrar no git se houver arquivo local)

```bash
git add supabase/migrations/ 2>/dev/null; git commit -m "get_programa_fideliza_dados: le renovacoes de movimentacoes_admin" --allow-empty
```

---

### Task 13: `vw_alertas_inteligentes` — ramo CONTRATO_VENCENDO

**Files:**
- Migration via MCP `apply_migration` (nome: `alertas_contrato_vencendo_movimentacoes_admin`)

**Interfaces:**
- Consumes: status canônico.
- Produces: view de alertas sem depender de `renovacoes`; ramo CONTRATO_VENCENDO derivado de `movimentacoes_admin`.

- [ ] **Step 1: Baseline dos alertas**

Via MCP `execute_sql`: `select tipo_alerta, count(*) from vw_alertas_inteligentes group by 1;`
Anotar (especialmente `CONTRATO_VENCENDO`).

- [ ] **Step 2: Recriar a view trocando o join**

`CREATE OR REPLACE VIEW public.vw_alertas_inteligentes AS ...` com o corpo atual, trocando o ramo `CONTRATO_VENCENDO`: o `LEFT JOIN renovacoes r ON (r.aluno_id=a.id AND r.data_fim_novo_contrato > a.data_fim_contrato AND r.status='concluida')` passa a:
```sql
             LEFT JOIN movimentacoes_admin r ON (r.aluno_id = a.id
                AND r.tipo = 'renovacao'
                AND r.renovacao_status IN ('confirmada','antecipada_confirmada')
                AND r.data >= (CURRENT_DATE - '90 days'::interval)))
```
(Mantém o filtro `r.id IS NULL` = "sem renovação recente registrada". Ajustar o resto do ramo conforme necessário; os outros 6 ramos permanecem intactos.)

- [ ] **Step 3: Aplicar e comparar**

Via MCP `execute_sql`: `select tipo_alerta, count(*) from vw_alertas_inteligentes group by 1;`
Comparar com baseline. `CONTRATO_VENCENDO` pode mudar (antes o join era morto e contava todos). Validar que faz sentido.

- [ ] **Step 4: Teste manual no Dashboard**

Abrir Dashboard → "Alertas Inteligentes". Confirmar que os cards renderizam e os 7 tipos aparecem quando aplicável.

- [ ] **Step 5: Confirmar zero referência da view à tabela**

Via MCP `execute_sql`:
```sql
select count(*) from pg_depend d
join pg_rewrite rw on rw.oid=d.objid
join pg_class dep on dep.oid=rw.ev_class
join pg_class src on src.oid=d.refobjid
where src.relname='renovacoes' and dep.relname='vw_alertas_inteligentes';
```
Expected: `0`.

- [ ] **Step 6: Commit**

```bash
git commit -m "vw_alertas_inteligentes: ramo contrato_vencendo via movimentacoes_admin" --allow-empty
```

---

### Task 14: Verificação final da Fase 2 — tabela sem consumidores

**Files:** nenhum (auditoria)

- [ ] **Step 1: Grep no frontend**

Run: `grep -rn "from('renovacoes')\|from(\"renovacoes\")" src/`
Expected: **zero** ocorrências.

- [ ] **Step 2: Funções no banco**

Via MCP `execute_sql`:
```sql
select proname from pg_proc where prosrc ~* 'from\s+renovacoes\M' order by 1;
```
Expected: nenhuma função lendo `FROM renovacoes` (o CTE homônimo em `get_kpis_professor_periodo`/`get_dados_relatorio_coordenacao` lê `FROM movimentacoes_admin`, não conta).

- [ ] **Step 3: Views**

Via MCP `execute_sql` (o mesmo pg_depend da Task 13 Step 5, sem filtrar view):
```sql
select dep.relname from pg_depend d
join pg_rewrite rw on rw.oid=d.objid
join pg_class dep on dep.oid=rw.ev_class
join pg_class src on src.oid=d.refobjid
where src.relname='renovacoes' and dep.relname<>'renovacoes';
```
Expected: vazio.

- [ ] **Step 4: Registrar resultado**

Se tudo zero, a tabela está pronta para a Fase 3. Se algo aparecer, criar tarefa de reaponte para o item faltante antes de prosseguir.

---

## FASE 3 — Arquivar (só após Fase 2 100% verde; executar em sessão separada com OK do Hugo)

### Task 15: Renomear `renovacoes` → `renovacoes_legado`

**Files:**
- Migration via MCP `apply_migration` (nome: `arquiva_renovacoes_legado`)

- [ ] **Step 1: Reconfirmar zero referências** (repetir Task 14, Steps 1-3). Se qualquer uma falhar, PARAR.

- [ ] **Step 2: Renomear (NUNCA dropar)**

```sql
ALTER TABLE public.renovacoes RENAME TO renovacoes_legado;
COMMENT ON TABLE public.renovacoes_legado IS 'Arquivo read-only. Aposentada em 2026-07 — fonte de verdade migrou para movimentacoes_admin. NAO usar.';
```

- [ ] **Step 3: Validar dados intactos**

Via MCP `execute_sql`: `select count(*) from renovacoes_legado;`
Expected: `452` (nenhuma linha perdida).

- [ ] **Step 4: Regenerar types + commit**

Regenerar `src/types/database.types.ts`, depois:
```bash
git add src/types/database.types.ts
git commit -m "Arquiva tabela renovacoes como renovacoes_legado (rename, sem drop)"
```

---

## Self-Review (feito na escrita)

- **Cobertura da spec:** todos os 14 dependentes do diagnóstico têm tarefa (edge=T1; views mortas=T2; 5 vivos=T3-7; 4 órfãos=T8-11; RPC=T12; view alertas=T13; verificação=T14; rename=T15). ✓
- **Sem placeholders:** cada troca tem código real e comando de validação. ✓
- **Consistência de tipos:** mapeamento de status idêntico em todas as tarefas (bloco Global Constraints). ✓
- **Não-deleção:** nenhuma tarefa deleta componente ou dropa a tabela; só reaponta/renomeia. ✓
