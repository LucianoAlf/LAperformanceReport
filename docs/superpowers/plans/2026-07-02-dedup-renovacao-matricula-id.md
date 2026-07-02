# Dedup de renovação por `emusys_matricula_id` — Plano de Implementação

> **Para workers:** este projeto **não tem harness de teste unitário para edge functions**. A
> validação real é reprocessar payloads reais numa **branch do Supabase** e conferir o efeito no
> banco. Os "testes" abaixo são replays + queries SQL, não pytest. Steps usam checkbox (`- [ ]`).

**Goal:** Impedir que uma edição de cronograma numa matrícula já renovada (que faz o Emusys
reenviar o webhook `matricula_renovacao`) gere uma segunda linha de renovação em
`movimentacoes_admin`.

**Arquitetura:** Adicionar a `movimentacoes_admin` uma coluna nullable `emusys_matricula_id`
(o identificador estável do contrato no Emusys, que hoje a tabela não guarda). A edge
`processar-matricula-emusys` passa a gravar esse campo e a deduplicar por ele numa janela de
tempo — mantendo o dedup antigo (aluno+curso+competência) como rede de segurança. Mudança
aditiva e reversível; toca **só** o ramo `tipo='renovacao'`.

**Tech Stack:** PostgreSQL (migração via Supabase MCP `apply_migration`), Deno/TypeScript
(edge function), Supabase branch para validação.

## Global Constraints

- Timezone do negócio: **BRT (UTC-3)**. A edge já usa `hojeISOBRT()` — reusar, nunca `new Date()` cru pra data de negócio.
- Deploy de edge de webhook externo **sempre com `--no-verify-jwt`** + checar health depois (incidente 25/06). Preferir deploy via MCP `deploy_edge_function`.
- Migração vai direto no projeto remoto — **confirmar com o Hugo antes de aplicar em produção**. Validar primeiro em branch.
- Não remover nenhuma checagem existente. A regra nova é **aditiva** (camada por cima).
- `p.matriculaIdEmusys` é a fonte do id (vem do payload do webhook, campo `matricula.matricula_id`) — **não** ler de `alunos`.
- Projeto Supabase: `ouqwbbermlzqqvtqwlul`.

---

### Task 1: Migração — coluna `emusys_matricula_id` em `movimentacoes_admin`

**Files:**
- Migração (via MCP `apply_migration`, name: `add_emusys_matricula_id_movimentacoes_admin`)

**Interfaces:**
- Produz: coluna `movimentacoes_admin.emusys_matricula_id text NULL` + índice
  `idx_mov_admin_emusys_matricula_id` para o dedup ser rápido.

- [ ] **Step 1: Criar branch do Supabase para validar sem tocar produção**

Via MCP: `create_branch` (project `ouqwbbermlzqqvtqwlul`, name `dedup-renovacao`). Guardar o `project_id` da branch para os próximos steps.

- [ ] **Step 2: Aplicar a migração na BRANCH**

Via MCP `apply_migration` no project da branch:

```sql
ALTER TABLE movimentacoes_admin
  ADD COLUMN IF NOT EXISTS emusys_matricula_id text;

CREATE INDEX IF NOT EXISTS idx_mov_admin_emusys_matricula_id
  ON movimentacoes_admin (emusys_matricula_id)
  WHERE emusys_matricula_id IS NOT NULL;

COMMENT ON COLUMN movimentacoes_admin.emusys_matricula_id IS
  'ID da matrícula no Emusys (matricula.matricula_id do webhook). Usado para deduplicar renovações reenviadas após edição de cronograma. Nullable/forward-only: só preenchido a partir de 2026-07.';
```

- [ ] **Step 3: Verificar que a coluna existe e não alterou linha nenhuma**

Via MCP `execute_sql` na branch:

```sql
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='movimentacoes_admin' AND column_name='emusys_matricula_id') AS coluna_existe,
  (SELECT count(*) FROM movimentacoes_admin WHERE emusys_matricula_id IS NOT NULL) AS linhas_preenchidas;
```

Esperado: `coluna_existe = 1`, `linhas_preenchidas = 0` (nada retroativo).

- [ ] **Step 4: Confirmar que os outros tipos seguem intactos (índice parcial não indexa null)**

```sql
SELECT tipo, count(*) FROM movimentacoes_admin GROUP BY tipo ORDER BY 2 DESC;
```

Esperado: mesma contagem de sempre (evasao/renovacao/nao_renovacao/aviso_previo/trancamento/ajuste_valor/destrancamento) — a coluna nova é irrelevante pra eles.

---

### Task 2: Edge — gravar `emusys_matricula_id` e deduplicar por ele

**Files:**
- Modify: `supabase/functions/processar-matricula-emusys/index.ts`
  - `registrarMovimentacao` (dedup + payload do insert, ~L606-680)
  - `handleRenovacao` (o check `renovacaoDuplicada` que gate o `numero_renovacoes`, ~L983-998)

**Interfaces:**
- Consome: `p.matriculaIdEmusys` (já existe no `Payload`), `hojeISOBRT()` (já existe).
- Produz: comportamento novo de dedup no ramo `tipo==='renovacao'`; coluna preenchida.

- [ ] **Step 1: No `registrarMovimentacao`, adicionar a checagem por `matricula_id` ANTES da checagem por competência (ramo renovacao)**

Localizar o bloco `if (tipo === 'renovacao') { ... existingQuery ... }` (~L630-639). Substituir o
corpo do `if` por: primeiro tentar deduplicar pelo `matricula_id` numa janela de 60 dias; se achou,
retorna cedo. Senão, cai na checagem antiga por competência (mantida como rede).

```typescript
if (tipo === 'renovacao') {
  // Camada nova: dedup por matricula_id do Emusys (estável entre reenvios do webhook —
  // imune a mudança de competência causada por edição de cronograma). Janela de 60 dias:
  // maior que qualquer reenvio observado (<1 a ~30 dias) e MUITO menor que um ciclo de
  // renovação real (>= ~6 meses), então nunca bloqueia renovação legítima do ano seguinte.
  const matriculaIdEmusys = p.matriculaIdEmusys ? String(p.matriculaIdEmusys) : null;
  if (matriculaIdEmusys) {
    const janelaInicio = addDiasISO(hoje, -60);
    const { data: jaExistePorMatricula } = await supabase.from('movimentacoes_admin')
      .select('id')
      .eq('tipo', 'renovacao')
      .eq('emusys_matricula_id', matriculaIdEmusys)
      .gte('data', janelaInicio)
      .limit(1);
    if (jaExistePorMatricula?.length) return false;
  }

  // Rede antiga (mantida): dedup por aluno+curso+competência. Cobre a janela de transição
  // (renovações cuja 1a entrega foi antes do deploy e tem emusys_matricula_id null).
  if (alunoId) {
    existingQuery = existingQuery.eq('aluno_id', alunoId);
  } else {
    existingQuery = existingQuery.eq('aluno_nome', p.nomeAluno);
  }
  if (cursoId) {
    existingQuery = existingQuery.eq('curso_id', cursoId);
  }
  existingQuery = existingQuery.eq('competencia_referencia', competenciaReferencia);
} else {
  existingQuery = existingQuery
    .eq('aluno_nome', p.nomeAluno)
    .gte('data', inicioMes);
}
```

- [ ] **Step 2: Adicionar o helper `addDiasISO` (se não existir) junto dos outros helpers de data**

Procurar por `function dateOnlyISO` (~L289). Se não houver um utilitário de somar/subtrair dias em
ISO date-only, adicionar logo abaixo:

```typescript
// Soma (ou subtrai, com n negativo) dias a uma data ISO 'YYYY-MM-DD', retornando ISO date-only.
function addDiasISO(dataISO: string, dias: number): string {
  const d = parseDateOnly(dataISO) ?? new Date(dataISO);
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
```

- [ ] **Step 3: Incluir `emusys_matricula_id` no payload do INSERT**

Localizar a montagem do `const payload: any = { unidade_id: p.unidadeId, data: hoje, tipo, ... }`
(~L662). Adicionar o campo (só faz sentido em renovação, mas gravar sempre que houver o id é
inofensivo e útil):

```typescript
  const payload: any = {
    unidade_id: p.unidadeId,
    data: hoje,
    tipo,
    // ... campos existentes ...
    emusys_matricula_id: p.matriculaIdEmusys ? String(p.matriculaIdEmusys) : null,
  };
```

- [ ] **Step 4: Alinhar o `renovacaoDuplicada` do `handleRenovacao` (evitar inflar `numero_renovacoes`)**

Em `handleRenovacao`, o check `existente` (~L983-990) só serve pra decidir se incrementa
`numero_renovacoes` (L998). Hoje ele casa por competência — mesmo problema. Trocar por casar
pelo `matricula_id` na mesma janela, com fallback pra competência:

```typescript
    // Dedup: ja existe renovacao para esta matricula/competencia? (protege contra reentrega
    // de webhook + reenvio pos-edicao de cronograma). matricula_id e estavel entre reenvios.
    const matIdEmusys = p.matriculaIdEmusys ? String(p.matriculaIdEmusys) : null;
    let existQuery = supabase.from('movimentacoes_admin').select('id').eq('tipo', 'renovacao');
    if (matIdEmusys) {
      existQuery = existQuery.eq('emusys_matricula_id', matIdEmusys).gte('data', addDiasISO(hoje, -60));
    } else {
      existQuery = existQuery
        .eq('aluno_id', aluno.id)
        .eq('unidade_id', p.unidadeId)
        .eq('competencia_referencia', inicioMes);
    }
    const { data: existente } = await existQuery.limit(1);
    const renovacaoDuplicada = !!existente?.length;
```

(Manter a linha `const inicioMes = classificacaoCompetencia.competenciaReferencia;` acima, que o fallback usa.)

- [ ] **Step 5: `node --check` na sintaxe do arquivo**

```bash
node --check "supabase/functions/processar-matricula-emusys/index.ts"
```

Esperado: sem erro. (Se `--check` reclamar de sintaxe TS, validar via `deno check` se disponível; o objetivo é só pegar erro grosseiro antes do deploy.)

- [ ] **Step 6: Deploy da edge na BRANCH (não produção)**

Via MCP `deploy_edge_function` no project da branch (`processar-matricula-emusys`). Conferir que subiu sem erro.

---

### Task 3: Validação ponta a ponta na branch (replay dos payloads reais)

**Files:** nenhum — validação via replay + SQL.

**Interfaces:** consome os payloads reais da Millene (webhooks 55510 e 55760), já capturados em `automacao_log` de produção.

- [ ] **Step 1: Limpar as linhas da Millene na branch (estado zero pro teste)**

Na branch, via `execute_sql`:

```sql
DELETE FROM movimentacoes_admin WHERE aluno_nome ILIKE '%Millene Chris Pimentel%' AND tipo='renovacao';
```

- [ ] **Step 2: Reenviar o 1º webhook (55510) para a edge da branch**

Pegar o `payload_bruto` do `automacao_log` id 11348 (produção) e fazer `POST` no endpoint da
edge da branch (URL via MCP `get_project_url` + `/functions/v1/processar-matricula-emusys`,
header `Authorization: Bearer <anon key da branch>`). Corpo = o JSON do webhook 55510.

- [ ] **Step 3: Conferir que gravou 1 linha, com `emusys_matricula_id` preenchido**

```sql
SELECT id, competencia_referencia, valor_parcela_anterior, valor_parcela_novo, emusys_matricula_id
FROM movimentacoes_admin WHERE aluno_nome ILIKE '%Millene Chris Pimentel%' AND tipo='renovacao';
```

Esperado: **1 linha**, `emusys_matricula_id = '2287'`, competência `2026-08-01`.

- [ ] **Step 4: Reenviar o 2º webhook (55760) — o reenvio pós-edição**

Mesmo procedimento, corpo = JSON do webhook 55760 (`data_primeira_aula` = 24/07).

- [ ] **Step 5: Conferir que NÃO gravou 2ª linha (o dedup pegou)**

```sql
SELECT count(*) AS n, array_agg(competencia_referencia) AS competencias
FROM movimentacoes_admin WHERE aluno_nome ILIKE '%Millene Chris Pimentel%' AND tipo='renovacao';
```

Esperado: **`n = 1`** (antes do fix seriam 2, com competências ago + jul). Este é o teste que prova a correção.

- [ ] **Step 6: Regressão — uma renovação de OUTRO aluno/matrícula grava normal**

Reenviar um webhook de renovação de matrícula diferente (ex: outro `matricula_id`) e conferir
que grava 1 linha normalmente (o dedup não é global, é por matrícula). Esperado: nova linha criada.

- [ ] **Step 7: Regressão — outros tipos não afetados**

Reenviar um webhook de `matricula_finalizacao` (evasão) na branch e conferir que grava em
`movimentacoes_admin` com `tipo='evasao'` normalmente. Esperado: linha de evasão criada, sem interferência.

---

### Task 4: Promover para produção

**Files:** migração + edge em produção.

- [ ] **Step 1: Confirmar com o Hugo** que a validação na branch passou (mostrar o resultado do Step 5 da Task 3: `n=1`).

- [ ] **Step 2: Aplicar a migração em PRODUÇÃO** (via `apply_migration`, project `ouqwbbermlzqqvtqwlul`) — mesmo SQL da Task 1 Step 2.

- [ ] **Step 3: Deploy da edge em PRODUÇÃO** via MCP `deploy_edge_function` (project `ouqwbbermlzqqvtqwlul`).

- [ ] **Step 4: Health check** — `POST` de um payload de teste conhecido e conferir `automacao_log` recebeu; conferir que a edge respondeu 200.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/processar-matricula-emusys/index.ts docs/superpowers/plans/2026-07-02-dedup-renovacao-matricula-id.md
git commit -m "fix: dedup de renovacao por emusys_matricula_id (reenvio pos-edicao de cronograma)"
```

- [ ] **Step 6: Deletar a branch do Supabase** (via MCP `delete_branch`) depois do merge/validação.

- [ ] **Step 7: Atualizar memória** (`integracao-infra.md` + item #10 de `pendencias-2026-07-01-renovacoes-retencao.md`) e `CLAUDE.md` (nota da nova versão da edge com o dedup por matricula_id).

---

## Fora de escopo (registrado, NÃO fazer aqui)

- **Limpeza retroativa** das ~21 duplicatas já existentes (Millene, Benjamim, Levi, Miguel, Joanna, Clarisse, João Paulo, etc.) — decisão e execução separadas, com o Hugo.
- **Pares de junho** (Antônio José, Isabela, Luciene) — fenômeno à parte (sem 2º webhook no log), não é este bug; o fix forward-only não os toca.
- **Aviso à Gabriela Leal** sobre editar cronograma logo após renovar.
- **Card 26≠28** (item #9) — já resolvido em `AdministrativoPage.tsx`, commit à parte.

## Reversibilidade

- A coluna é nullable e aditiva: `DROP COLUMN emusys_matricula_id` reverte sem perder dado de negócio.
- A lógica da edge é um ramo novo por cima do dedup antigo (que continua lá): reverter = deploy da versão anterior. Nenhuma checagem existente foi removida.
