# Faturas de Alunos — Visão Financeira A1 v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar `/app/faturas` em uma visão financeira global e auditável das faturas dos alunos, mantendo a cobrança D+2 como uma fila operacional derivada da mesma leitura canônica.

**Architecture:** Uma função SQL financeira única calcula os três valores contratuais e é reutilizada tanto pela carteira canônica existente quanto por uma nova RPC de faturas por item. A nova RPC lê somente o último snapshot completo de cada competência, devolve todos os estados de fatura, forma de pagamento, frescor e reconciliação; a UI nunca lê `sync_run_items` diretamente. A fila serial continua sendo a única escritora no Emusys, com agendamento controlado e backoff persistido.

**Tech Stack:** PostgreSQL/Supabase RPC e pg_cron, Edge Functions Deno, React 19 + TypeScript, Radix `Select`, Node test runner, Vite.

---

## File structure

| Arquivo | Responsabilidade |
| --- | --- |
| `supabase/migrations/20260817090000_financeiro_faturas_alunos_v2.sql` | Função pura de valores, `get_faturas_alunos_financeiro_v1`, nova versão de `get_inadimplencia_canonica`, grants e comentários de contrato. |
| `supabase/migrations/20260817090500_financeiro_sync_agendador.sql` | Três produtores pg_cron idempotentes para competência atual, duas anteriores e backlog, sem alterar a fila da Sol. |
| `src/lib/faturasAlunosFinanceiras.ts` | Decoder fail-closed da RPC, tipos de item/totais/reconciliação e filtros determinísticos de URL. |
| `src/components/App/FaturasAlunos/FaturasAlunosPage.tsx` | Orquestra URL, carregamento, frescor e troca de abas. |
| `src/components/App/FaturasAlunos/FaturasAlunosFilters.tsx` | Busca e filtros usando apenas `@/components/ui/select`. |
| `src/components/App/FaturasAlunos/FaturasAlunosTabela.tsx` | Tabela de faturas com status, pagamento e os três valores. |
| `src/components/App/FaturasAlunos/FaturasAlunosReconciliacao.tsx` | Reconciliação financeira contextual, sem redirecionar para a lista genérica de Alunos. |
| `src/components/App/FaturasAlunos/types.ts` | Tipos de apresentação compartilhados pela tela e diálogo. |
| `tests/faturasAlunosFinanceiroContract.test.mjs` | Contrato estático de RPC, autorização, fórmula e nenhuma leitura direta de snapshots pelo navegador. |
| `tests/faturasAlunosFinanceiroPostgres.test.mjs` | Fixture PostgreSQL com aberta, paga, a vencer, cancelada, D+2, ex-aluno, trancado e quarentena. |
| `tests/faturasAlunosPage.test.mjs` | Contrato de UX: abas, Select global, três valores, forma de pagamento e reconciliação local. |
| `tests/financeiroSyncQueueContract.test.mjs` e `tests/financeiroSyncQueuePostgres.test.mjs` | Garante agenda controlada, serialização, 429 e quarentena de identificador inválido. |

## Invariantes que não podem regredir

1. `source_missing` significa somente “não observado no snapshot novo”; nunca equivale a pagamento e nunca entra nos totais de cobrança.
2. D+0 é status financeiro: toda fatura `aberta` com vencimento anterior à data de corte. D+2 é somente atalho de cobrança e exige aluno/matrícula operacional elegível, contato resolvido e leitura fresca.
3. Em atraso perde **somente** o desconto condicional. O desconto fixo permanece. A base de mora é `valor_original - desconto_fixo`; aplicar multa de 2% e mora de 1% ao mês pro rata die.
4. Fatura paga exibe `valor_pago`, não “valor hoje”. Fatura aberta a vencer exibe o valor com desconto condicional; fatura vencida exibe o valor hoje.
5. O browser executa somente RPCs autorizadas. Não há leitura de `sync_run_items`, `sync_runs`, tokens Emusys ou segredo de service role no frontend.
6. Nenhuma alteração em `sol_caixa_lancar_recebimento`, `sol_caixa_abrir`, `sol_caixa_fechar` ou `sol_caixa_casar_parcela`. A Sol continua consumindo `get_inadimplencia_canonica` e aplica D+2.

### Task 1: Provar o contrato monetário antes de alterá-lo

**Files:**
- Create: `tests/faturasAlunosFinanceiroContract.test.mjs`
- Create: `tests/faturasAlunosFinanceiroPostgres.test.mjs`
- Modify: `tests/inadimplenciaCanonicaPostgres.test.mjs`

- [ ] **Step 1: Escrever testes que descrevem os três valores e as fronteiras de cobrança.**

Adicionar os seguintes casos à fixture PostgreSQL, com `p_as_of_date = '2026-08-16'`:

```sql
-- valor_original=500, fixo=50, condicional=30, vencimento 2026-07-17
-- com desconto = 420.00
-- sem desconto condicional = 450.00
-- 30 dias vencida: valor hoje = 463.50
select public.calcular_valores_fatura_financeiro_v1(
  500, 50, 30, '2026-07-17', 'aberta', '2026-08-16'
);
```

Asserções obrigatórias:

```js
assert.equal(valores.valor_com_desconto, 420);
assert.equal(valores.valor_sem_desconto_condicional, 450);
assert.equal(valores.multa, 9);
assert.equal(valores.mora, 4.5);
assert.equal(valores.valor_hoje, 463.5);
assert.equal(paga.valores.valor_pago, 420);
assert.equal(paga.valores.valor_hoje, null);
assert.equal(aVencer.valores.valor_hoje, aVencer.valores.valor_com_desconto);
assert.equal(cancelada.entra_em_totais_abertos, false);
assert.equal(exAluno.cobranca.d2_elegivel, false);
assert.equal(trancada.cobranca.d2_elegivel, false);
assert.equal(sourceMissing.reconciliation_categoria, 'source_missing');
```

O teste de contrato também deve procurar `revoke all ... from public, anon` e `grant execute ... to authenticated, service_role` na RPC nova, e verificar que nenhum arquivo de UI chama `.from('sync_run_items')` ou `.from('sync_runs')`.

- [ ] **Step 2: Rodar o teste e confirmar a falha inicial.**

Run:

```powershell
node --test tests/faturasAlunosFinanceiroContract.test.mjs tests/faturasAlunosFinanceiroPostgres.test.mjs
```

Expected: falha porque `calcular_valores_fatura_financeiro_v1` e `get_faturas_alunos_financeiro_v1` ainda não existem.

- [ ] **Step 3: Commitar somente a especificação executável dos testes.**

```powershell
git add tests/faturasAlunosFinanceiroContract.test.mjs tests/faturasAlunosFinanceiroPostgres.test.mjs tests/inadimplenciaCanonicaPostgres.test.mjs
git commit -m "test(financeiro): cobrir contrato de faturas v2"
```

### Task 2: Criar uma única fonte de cálculo e a leitura financeira global

**Files:**
- Create: `supabase/migrations/20260817090000_financeiro_faturas_alunos_v2.sql`
- Modify: `tests/faturasAlunosFinanceiroContract.test.mjs`
- Modify: `tests/faturasAlunosFinanceiroPostgres.test.mjs`
- Modify: `tests/inadimplenciaCanonicaPostgres.test.mjs`

- [ ] **Step 1: Implementar a função pura de valores.**

Na migration, criar exatamente esta assinatura:

```sql
create or replace function public.calcular_valores_fatura_financeiro_v1(
  p_valor_original numeric,
  p_desconto_fixo numeric,
  p_desconto_condicional numeric,
  p_data_vencimento date,
  p_status text,
  p_as_of_date date
) returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp;
```

Implementar com estes valores intermediários, sempre arredondados a duas casas:

```sql
v_com_desconto := greatest(coalesce(p_valor_original, 0)
  - coalesce(p_desconto_fixo, 0)
  - coalesce(p_desconto_condicional, 0), 0);
v_sem_condicional := greatest(coalesce(p_valor_original, 0)
  - coalesce(p_desconto_fixo, 0), 0);
v_dias_atraso := greatest(coalesce(p_as_of_date - p_data_vencimento, 0), 0);
v_multa := case when p_status = 'aberta' and p_data_vencimento < p_as_of_date
  then round(v_sem_condicional * 0.02, 2) else 0 end;
v_mora := case when p_status = 'aberta' and p_data_vencimento < p_as_of_date
  then round(v_sem_condicional * 0.01 * v_dias_atraso / 30, 2) else 0 end;
v_valor_hoje := case
  when p_status = 'paga' then null
  when p_status = 'cancelada' then null
  when p_data_vencimento < p_as_of_date then round(v_sem_condicional + v_multa + v_mora, 2)
  else round(v_com_desconto, 2)
end;
```

Retornar `valor_com_desconto`, `valor_sem_desconto_condicional`, `multa`, `mora`, `dias_atraso` e `valor_hoje` em `jsonb_build_object`.

- [ ] **Step 2: Recriar `get_inadimplencia_canonica` sem mudar a assinatura nem a fronteira da Sol.**

Copiar a versão vigente da função para a nova migration e fazer somente estas mudanças semânticas:

```sql
-- em linhas_ultimo_snapshot incluir i.desconto_fixo
-- em itens_confirmados substituir a fórmula local por:
cross join lateral jsonb_to_record(
  public.calcular_valores_fatura_financeiro_v1(
    lcr.valor_original,
    lcr.desconto_fixo,
    lcr.desconto_condicional,
    lcr.data_vencimento,
    lcr.status,
    p_as_of_date
  )
) as valores(
  valor_com_desconto numeric,
  valor_sem_desconto_condicional numeric,
  multa numeric,
  mora numeric,
  dias_atraso integer,
  valor_hoje numeric
)
```

Mapear `valores.valor_hoje` para o campo legado `valor_atualizado`; manter `dias_atraso`, toda a quarentena, os grants existentes e a assinatura `get_inadimplencia_canonica(uuid,date)`. Não tocar em nenhuma RPC `sol_caixa_*`.

- [ ] **Step 3: Implementar a RPC de página global.**

Criar:

```sql
create or replace function public.get_faturas_alunos_financeiro_v1(
  p_unidade_id uuid default null,
  p_ano integer default extract(year from (now() at time zone 'America/Sao_Paulo'))::integer,
  p_mes integer default extract(month from (now() at time zone 'America/Sao_Paulo'))::integer,
  p_modo_periodo text default 'janela_3',
  p_status text default 'todas',
  p_as_of_date date default (now() at time zone 'America/Sao_Paulo')::date
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp;
```

Regras exatas da RPC:

```text
p_modo_periodo: janela_3 | competencia
p_status: todas | pagas | em_aberto | em_atraso_d0 | a_vencer | canceladas | cobranca_d2 | reconciliacao
janela_3: primeiro dia de (p_ano,p_mes)-2 até primeiro dia de (p_ano,p_mes)
competencia: somente primeiro dia de (p_ano,p_mes)
```

Para cada competência, selecionar somente o último `sync_runs` `live/succeeded/snapshot_complete/unidades_concluidas=3`. Agrupar a identidade por `(unidade_id, canonical_fatura_id)` e não duplicar linhas por curso. Incluir toda fatura `aberta`, `paga` e `cancelada`; `source_missing`, ID inválido, status desconhecido e contato ausente entram em `reconciliation.items`, jamais em total aberto ou D+2.

Cada `items[]` deve conter pelo menos:

```json
{
  "canonical_fatura_id": "unit:invoice",
  "competencia": "2026-08-01",
  "status": "aberta",
  "data_vencimento": "2026-08-05",
  "data_pagamento": null,
  "descricao": "Parcela 08/2026",
  "aluno": {"id": 1435, "nome": "...", "curso_nome": "Bateria", "estado_operacional": "ativo"},
  "forma_pagamento": {"rotulo": "Forma prevista", "nome": "PIX Automático", "fonte": "matricula"},
  "valores": {"valor_com_desconto": 420, "valor_sem_desconto_condicional": 450, "multa": 9, "mora": 4.5, "valor_hoje": 463.5, "valor_pago": null},
  "cobranca": {"d0": true, "d2_elegivel": true, "motivo_nao_elegivel": null},
  "sync_completed_at": "...",
  "sync_fresh_until": "..."
}
```

Para `status='paga'`, `forma_pagamento.rotulo` é `Pago via` e `nome` vem de `i.payload->>'forma_pagamento_transacao'`; para abertas/canceladas, é `Forma prevista` de `alunos.forma_pagamento_id -> formas_pagamento.nome`; ausência vira `Forma não informada` + entrada de reconciliação `forma_pagamento_ausente`. Não inventar forma de pagamento a partir de descrição.

O resultado de topo deve conter `schema_version: 1`, `fonte: 'sync_run_items'`, `as_of_date`, `periodo`, `freshness`, `status`, `totais` por aba e `reconciliation`. `stale` preserva a lista histórica para consulta, mas `operational.collection_allowed=false` e `cobranca_d2` retorna `items=[]`.

- [ ] **Step 4: Aplicar grants explícitos.**

```sql
revoke all on function public.calcular_valores_fatura_financeiro_v1(numeric,numeric,numeric,date,text,date)
  from public, anon, authenticated;
revoke all on function public.get_faturas_alunos_financeiro_v1(uuid,integer,integer,text,text,date)
  from public, anon;
grant execute on function public.get_faturas_alunos_financeiro_v1(uuid,integer,integer,text,text,date)
  to authenticated, service_role;
grant execute on function public.calcular_valores_fatura_financeiro_v1(numeric,numeric,numeric,date,text,date)
  to service_role;
```

- [ ] **Step 5: Rodar as fixtures e a regressão canônica.**

Run:

```powershell
node --test tests/faturasAlunosFinanceiroContract.test.mjs tests/faturasAlunosFinanceiroPostgres.test.mjs tests/inadimplenciaCanonicaPostgres.test.mjs tests/inadimplenciaCanonicaContract.test.mjs
```

Expected: todas as três formas de valor e os gates D+0/D+2 passam; a Sol continua vendo `get_inadimplencia_canonica` com a mesma assinatura.

- [ ] **Step 6: Commitar o contrato do banco.**

```powershell
git add supabase/migrations/20260817090000_financeiro_faturas_alunos_v2.sql tests/faturasAlunosFinanceiroContract.test.mjs tests/faturasAlunosFinanceiroPostgres.test.mjs tests/inadimplenciaCanonicaPostgres.test.mjs
git commit -m "feat(financeiro): criar leitura global de faturas"
```

### Task 3: Tornar a atualização recorrente, serial e tolerante a origem ruim

**Files:**
- Create: `supabase/migrations/20260817090500_financeiro_sync_agendador.sql`
- Modify: `supabase/functions/_shared/faturasSync.ts`
- Modify: `supabase/functions/_shared/financeiroSyncQueue.ts`
- Modify: `tests/faturasSyncColeta.test.mjs`
- Modify: `tests/financeiroSyncQueueContract.test.mjs`
- Modify: `tests/financeiroSyncQueuePostgres.test.mjs`

- [ ] **Step 1: Escrever primeiro os testes de agendamento e quarentena de ID.**

Acrescentar cenários que exigem:

```js
assert.equal(mapFatura({ id: 1, matricula_id: 'abc', /* campos válidos */ }).emusys_matricula_id, null);
assert.deepEqual(issue, { field: 'matricula_id', code: 'invalid_optional_identifier', raw_value: 'abc' });
assert.match(scheduleSql, /sync-faturas-competencia-atual-15m/i);
assert.match(scheduleSql, /sync-faturas-historico-60m/i);
assert.match(scheduleSql, /sync-faturas-backlog-2h/i);
assert.match(scheduleSql, /enqueue_and_work/);
assert.match(scheduleSql, /cron_financeiro_sync_atual_15m/);
```

Também provar que um 429 deixa o job em `retry_wait`, que uma falha de identificador não é reclassificada como paga e que o único job `running` ainda é garantido pelo banco.

- [ ] **Step 2: Manter identificadores opcionais em quarentena por item.**

Em `faturasSync.ts`, manter `id` de fatura e `data_vencimento` obrigatórios; deixar `matricula_id`, `contrato_id` e `aluno_id` passarem por `optionalIdentifier`. A saída deve preservar a linha com:

```ts
payload: { ...row, _la_report: { validation_issues } }
```

Não lançar erro por `invalid_optional_identifier`; erro estrutural somente para id da fatura, data, valor, competência, paginação ou duplicidade de fatura.

- [ ] **Step 3: Criar o agendamento no banco sem chamar o Emusys diretamente pelo browser.**

Na migration, manter `sync-faturas-fila-worker` como único drenador por minuto e recriar idempotentemente estes produtores via `net.http_post` para `sync-faturas-emusys`:

```text
sync-faturas-competencia-atual-15m  -> */15 * * * * -> competência BRT atual, prioridade normal
sync-faturas-historico-60m          -> 7 * * * *  -> competências BRT atual-1 e atual-2
sync-faturas-backlog-2h             -> 23 */2 * * * -> include_backlog=true
```

Cada corpo deve usar `mode: 'enqueue_and_work'`, `trigger_source` distinto e o `x-sync-token` do Vault. A query SQL deve serializar as competências como strings `YYYY-MM-01`, usando `timezone('America/Sao_Paulo', now())`; não usar data do navegador. O backlog usa `enqueue_financeiro_sync_backlog`, que já procura competências com observação aberta ou `source_missing`; a fila garante que só uma coleta escreve por vez.

- [ ] **Step 4: Verificar sem publicar dados.**

Run:

```powershell
node --test tests/faturasSyncColeta.test.mjs tests/faturasSyncFrescorContrato.test.mjs tests/financeiroSyncQueueContract.test.mjs tests/financeiroSyncQueuePostgres.test.mjs tests/financeiroSyncWorker.test.mjs
```

Expected: 429 persiste Retry-After, ID inválido vira validação de uma fatura, e os três cron jobs não duplicam a fila ativa.

- [ ] **Step 5: Commitar o agendamento e a proteção da coleta.**

```powershell
git add supabase/migrations/20260817090500_financeiro_sync_agendador.sql supabase/functions/_shared/faturasSync.ts supabase/functions/_shared/financeiroSyncQueue.ts tests/faturasSyncColeta.test.mjs tests/financeiroSyncQueueContract.test.mjs tests/financeiroSyncQueuePostgres.test.mjs
git commit -m "feat(financeiro): agendar sync de faturas com backlog"
```

### Task 4: Criar o adaptador de frontend fail-closed

**Files:**
- Create: `src/lib/faturasAlunosFinanceiras.ts`
- Modify: `src/lib/faturasAlunosCanonicas.ts`
- Create: `src/lib/faturasAlunosFinanceiras.test.ts`
- Modify: `tests/faturasAlunosCanonicas.test.mjs`

- [ ] **Step 1: Escrever o decoder antes da página.**

Definir tipos explicitamente:

```ts
export type FaturaFinanceiraStatus = 'todas' | 'pagas' | 'em_aberto' | 'em_atraso_d0' | 'a_vencer' | 'canceladas' | 'cobranca_d2' | 'reconciliacao';
export type FaturaFinanceiraItem = {
  canonicalFaturaId: string;
  status: 'aberta' | 'paga' | 'cancelada';
  valores: { valorComDesconto: number; valorSemDescontoCondicional: number; multa: number; mora: number; valorHoje: number | null; valorPago: number | null };
  formaPagamento: { rotulo: 'Pago via' | 'Forma prevista' | 'Forma não informada'; nome: string | null; fonte: 'transacao' | 'matricula' | 'ausente' };
  cobranca: { d0: boolean; d2Elegivel: boolean; motivoNaoElegivel: string | null };
};
```

O decoder deve rejeitar estado, moeda, datas e frescor malformados; em erro devolve um estado bloqueado e não uma lista vazia que pareça confiável.

- [ ] **Step 2: Implementar o client autorizado.**

Usar somente:

```ts
supabase.rpc('get_faturas_alunos_financeiro_v1', {
  p_unidade_id: unidadeId,
  p_ano: ano,
  p_mes: mes,
  p_modo_periodo: modoPeriodo,
  p_status: status,
  p_as_of_date: asOfDate,
});
```

Remover da página a carga adicional `.from('alunos')`; a RPC já devolve o nome, curso, estado operacional e forma prevista canônica.

- [ ] **Step 3: Rodar testes do adaptador.**

Run:

```powershell
deno test src/lib/faturasAlunosFinanceiras.test.ts
node --test tests/faturasAlunosCanonicas.test.mjs tests/faturasAlunosFinanceiroContract.test.mjs
```

Expected: D+0 e D+2 são filtros diferentes, `source_missing` nunca se torna paga e a leitura stale mantém histórico sem liberar ação.

- [ ] **Step 4: Commitar o adaptador.**

```powershell
git add src/lib/faturasAlunosFinanceiras.ts src/lib/faturasAlunosFinanceiras.test.ts src/lib/faturasAlunosCanonicas.ts tests/faturasAlunosCanonicas.test.mjs
git commit -m "feat(faturas): adicionar adaptador financeiro global"
```

### Task 5: Implementar a tela A1 de faturas globais

**Files:**
- Modify: `src/components/App/FaturasAlunos/FaturasAlunosPage.tsx`
- Create: `src/components/App/FaturasAlunos/FaturasAlunosFilters.tsx`
- Create: `src/components/App/FaturasAlunos/FaturasAlunosTabela.tsx`
- Create: `src/components/App/FaturasAlunos/FaturasAlunosReconciliacao.tsx`
- Modify: `src/components/App/FaturasAlunos/types.ts`
- Modify: `tests/faturasAlunosPage.test.mjs`

- [ ] **Step 1: Escrever os testes de UX antes da troca da UI.**

Exigir no teste estático:

```js
for (const label of ['Todas as faturas', 'Pagas', 'Em aberto', 'Em atraso D+0', 'A vencer', 'Canceladas', 'Cobrar agora D+2', 'Reconciliação financeira']) {
  assert.match(page, new RegExp(label));
}
assert.match(page, /valorComDesconto|Com desconto/);
assert.match(page, /valorSemDescontoCondicional|Sem desconto condicional/);
assert.match(page, /valorHoje|Valor hoje/);
assert.match(page, /Pago via|Forma prevista|Forma não informada/);
assert.match(page, /SelectTrigger|SelectContent|SelectItem/);
assert.doesNotMatch(page, /<select[\s>]/);
assert.doesNotMatch(page, /\/app\/alunos\?tab=conciliacao/);
```

- [ ] **Step 2: Trocar a página para a estrutura A1.**

No topo, mostrar competência/mês, unidade e `Atualizar agora`. Abaixo, renderizar as oito abas acima. Os cartões devem responder à aba ativa com os totais retornados pela RPC; nunca agregar valores no navegador além de contagem visual.

As colunas da tabela são:

```text
Situação | Aluno / curso | Competência | Vencimento | Forma de pagamento |
Com desconto | Sem desconto condicional | Valor hoje ou Valor pago | Ação
```

Usar `Valor hoje` apenas para aberta; para paga, trocar o cabeçalho/célula por `Valor pago`; para cancelada, mostrar `—`. As três explicações devem aparecer no detalhe da fatura e em tooltip curto:

```text
Com desconto: valor válido até o vencimento.
Sem desconto condicional: base após o vencimento; desconto fixo é preservado.
Valor hoje: base vencida + multa de 2% + mora de 1% ao mês pro rata.
```

- [ ] **Step 3: Substituir todos os selects nativos pelo design system.**

Usar `Select`, `SelectTrigger`, `SelectValue`, `SelectContent` e `SelectItem` de `@/components/ui/select` para unidade, competência/período, curso, forma de pagamento e filtros avançados. Preservar os filtros em `URLSearchParams`, com `aria-label` e rótulo invisível associado.

- [ ] **Step 4: Colocar a reconciliação dentro da própria página.**

`FaturasAlunosReconciliacao` deve listar os itens retornados por `reconciliation.items`, agrupados por categoria:

```text
source_missing -> "Reconsultar competência" (solicita o refresh autorizado, não muda status)
identidade_invalida -> mostra matrícula/aluno bruto, identificador local quando houver e link para ficha específica
validation_issue -> mostra campo, valor recebido e motivo de quarentena
forma_pagamento_ausente -> "Forma não informada"; nunca infere a forma
contato_pendente -> link da ficha, sem envio de mensagem
```

Se o snapshot estiver stale, a página continua mostrando os dados com selo “histórico — atualização necessária”; a aba `Cobrar agora D+2`, botões de abordagem e total acionável ficam desabilitados. A mensagem não deve esconder faturas pagas ou histórico.

- [ ] **Step 5: Rodar os testes de UI e build.**

Run:

```powershell
node --test tests/faturasAlunosPage.test.mjs tests/faturasAlunosFinanceiroContract.test.mjs
npm run build
```

Expected: build sem erro TypeScript; nenhum `<select>` no módulo Faturas; URL de cada tab/filtro é compartilhável.

- [ ] **Step 6: Commitar a tela A1.**

```powershell
git add src/components/App/FaturasAlunos src/lib/faturasAlunosFinanceiras.ts tests/faturasAlunosPage.test.mjs
git commit -m "feat(faturas): ampliar tela financeira de alunos"
```

### Task 6: Validar dados reais, publicar com gate e documentar o handoff da Sol

**Files:**
- Modify: `docs/handoffs/2026-08-16-inadimplencia-canonica-sol.md`
- Create: `docs/validation/2026-08-17-faturas-alunos-v2.md`

- [ ] **Step 1: Rodar a suite completa antes de qualquer publicação.**

Run:

```powershell
npm test
deno test src/lib/inadimplenciaCanonica.test.ts src/lib/faturasAlunosFinanceiras.test.ts
npm run build
git status --short
```

Expected: todos os testes passam, build passa e somente arquivos desta feature estão alterados.

- [ ] **Step 2: Aplicar a migration e implantar as Edge Functions somente após teste local verde.**

Run:

```powershell
supabase db push
supabase functions deploy sync-faturas-emusys refresh-contas-receber atualizar-inadimplencia-emusys
```

Verificar no banco que `get_faturas_alunos_financeiro_v1` está presente, `PUBLIC` e `anon` não têm execute, os três novos jobs existem e não há mais de um job `running` em `financeiro_sync_queue`.

- [ ] **Step 3: Executar o gate controlado de origem.**

Usar `sync-faturas-emusys` em `mode: 'probe'` com service role para **uma** unidade e **uma** competência. Comparar por ID de fatura contra `GET /faturas` do Emusys: status, vencimento, valor original, descontos, `valor_pago`, `forma_pagamento_transacao` e `juros_e_multa` ao vivo. Registrar a diferença, se houver, em `docs/validation/2026-08-17-faturas-alunos-v2.md`; fórmula só é aceita se reproduzir o live considerando centavos/critério de arredondamento.

- [ ] **Step 4: Fazer a prova visual em produção.**

Depois do deploy frontend, abrir `/app/faturas` autenticado e registrar em `docs/validation/2026-08-17-faturas-alunos-v2.md`:

```text
Campo Grande, Recreio e Barra; janela de três competências;
abas Todas/Pagas/Em aberto/Em atraso/A vencer/Canceladas/D+2/Reconciliação;
forma de pagamento; três valores; stale versus leitura fresca;
URL de filtro; nenhum erro no console após reload.
```

- [ ] **Step 5: Atualizar o contrato da Sol e fechar o branch.**

O handoff deve afirmar explicitamente:

```text
Sol consulta somente get_inadimplencia_canonica para D+2.
Faturas globais usam get_faturas_alunos_financeiro_v1.
source_missing não é pagamento.
Não iniciar cron de cobrança até o gate de reconciliação Emusys estar verde.
```

Commit e publicação:

```powershell
git add docs/handoffs/2026-08-16-inadimplencia-canonica-sol.md docs/validation/2026-08-17-faturas-alunos-v2.md
git commit -m "docs(financeiro): registrar validacao e contrato da Sol"
git push -u origin feature/faturas-alunos-visao-financeira-a1-v2
```

## Self-review

- Cobertura da spec: estados globais (Task 5), D+0/D+2 separado (Tasks 2, 4, 5), três valores e forma de pagamento (Tasks 1, 2, 5), reconciliação contextual (Tasks 2, 5), frescor e fonte (Tasks 2, 4, 5), fila/backoff/429/ID inválido (Task 3), gate live e prova visual (Task 6).
- Fronteira da Sol: preservada explicitamente em Tasks 2 e 6; nenhuma `sol_caixa_*` é modificada.
- Sem placeholders: as assinaturas, valores, filtros, labels, jobs, comandos e critérios de aceite estão definidos neste documento.
