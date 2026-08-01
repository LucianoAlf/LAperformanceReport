# Relatorios Mensais Canonicos De Julho Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Congelar e servir os relatorios mensais Administrativo e Comercial de julho de 2026 a partir de payloads completos e imutaveis no servidor.

**Architecture:** Dois novos dominios em `fechamento_mensal_snapshots` armazenam os payloads completos dos documentos. RPCs privadas capturam os dados enquanto a competencia ainda esta aprovada, validam os KPIs contra os snapshots-base e depois uma RPC de leitura escopada entrega o payload fechado para a edge, que e a unica produtora do texto consumido pelos botoes.

**Tech Stack:** PostgreSQL/Supabase RPC, Supabase Edge Functions em Deno/TypeScript, React/TypeScript, Node test runner e Deno tests.

---

### Task 1: Contrato de fechamento imutavel

**Files:**
- Create: `tests/relatoriosMensaisFechamentoCanonico.test.mjs`
- Create: `supabase/migrations/20260801090000_relatorios_mensais_fechamento_canonico.sql`

- [ ] **Step 1: Escrever o teste RED do contrato SQL**

O teste deve ler a migration e exigir:

```js
assert.match(sql, /relatorio_admin_mensal/);
assert.match(sql, /relatorio_comercial_mensal/);
assert.match(sql, /trg_fechamento_mensal_snapshot_immutavel/);
assert.match(sql, /SNAPSHOT_MENSAL_IMUTAVEL/);
assert.match(sql, /capturar_relatorios_mensais_canonicos_v1/);
assert.match(sql, /get_relatorio_mensal_canonico_v1/);
assert.match(sql, /fechar_competencia_mensal_canonica_v1/);
assert.doesNotMatch(sql, /on conflict[\s\S]*do update[\s\S]*payload\s*=/i);
```

- [ ] **Step 2: Rodar o teste e confirmar falha por migration ausente**

Run: `node --test tests/relatoriosMensaisFechamentoCanonico.test.mjs`

Expected: FAIL com `migration de relatorios mensais ainda nao existe`.

- [ ] **Step 3: Criar a migration estrutural**

A migration deve:

```sql
alter table public.fechamento_mensal_snapshots
  drop constraint fechamento_mensal_snapshots_dominio_check;

alter table public.fechamento_mensal_snapshots
  add constraint fechamento_mensal_snapshots_dominio_check check (
    dominio = any (array[
      'alunos_admin', 'alunos_executivo', 'comercial', 'retencao',
      'renovacoes', 'professores', 'relatorio_admin',
      'relatorio_admin_mensal', 'relatorio_comercial_mensal',
      'relatorio_gerencial', 'relatorio_coordenacao', 'metas',
      'programa_matriculador', 'programa_fideliza',
      'compatibilidade_dados_mensais'
    ]::text[])
  );
```

Adicionar trigger `before update or delete` que bloqueie qualquer alteracao em linha `fechado`; permitir somente a transicao `aprovado -> fechado` quando payload, hash, competencia, unidade, dominio e versao permanecerem identicos.

Criar as assinaturas:

```sql
public.capturar_relatorios_mensais_canonicos_v1(integer, integer, uuid default null)
public.get_relatorio_mensal_canonico_v1(text, uuid, integer, integer)
public.fechar_competencia_mensal_canonica_v1(integer, integer, text)
```

Revogar de `public` e `anon`; captura/fechamento somente `service_role`; leitura para `authenticated` e `service_role` com validacao de acesso da unidade.

- [ ] **Step 4: Rodar o teste GREEN**

Run: `node --test tests/relatoriosMensaisFechamentoCanonico.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add tests/relatoriosMensaisFechamentoCanonico.test.mjs supabase/migrations/20260801090000_relatorios_mensais_fechamento_canonico.sql
git commit -m "feat: governar fechamento dos relatorios mensais"
```

### Task 2: Payload administrativo completo

**Files:**
- Modify: `tests/relatoriosMensaisFechamentoCanonico.test.mjs`
- Modify: `supabase/migrations/20260801090000_relatorios_mensais_fechamento_canonico.sql`

- [ ] **Step 1: Escrever o teste RED do payload administrativo**

Exigir que `montar_relatorio_admin_mensal_payload_v1`:

```js
assert.match(admin, /dominio\s*=\s*'alunos_admin'/i);
assert.match(admin, /dominio\s*=\s*'relatorio_gerencial'/i);
assert.match(admin, /movimentacoes_admin/i);
assert.match(admin, /aluno_transferencias/i);
assert.match(admin, /alunos_com_exatamente_2_cursos/i);
assert.match(admin, /alunos_com_exatamente_3_cursos/i);
assert.match(admin, /matriculas_2_curso_extras/i);
assert.match(admin, /SNAPSHOT_ADMIN_DIVERGENTE/i);
```

- [ ] **Step 2: Rodar e observar a falha esperada**

Run: `node --test tests/relatoriosMensaisFechamentoCanonico.test.mjs`

Expected: FAIL por funcao administrativa ausente.

- [ ] **Step 3: Implementar o produtor administrativo**

Criar `montar_relatorio_admin_mensal_payload_v1(uuid, integer, integer) returns jsonb` que:

1. carrega os snapshots aprovados/fechados `alunos_admin` e `relatorio_gerencial` da maior versao;
2. falha se algum snapshot ou hash estiver ausente;
3. agrega renovacoes, nao renovacoes, avisos e evasoes de `movimentacoes_admin` pela competencia;
4. captura novos alunos e transferencias com os nomes exibidos;
5. copia os campos multicurso e trancamento do snapshot administrativo;
6. compara ativos, pagantes e matriculas com o snapshot-base;
7. retorna `schema_version = 1`, fontes com `snapshot_id/payload_hash` e todos os blocos de exibicao.

- [ ] **Step 4: Rodar o teste GREEN**

Run: `node --test tests/relatoriosMensaisFechamentoCanonico.test.mjs`

Expected: PASS.

### Task 3: Payload comercial completo

**Files:**
- Modify: `tests/relatoriosMensaisFechamentoCanonico.test.mjs`
- Modify: `supabase/migrations/20260801090000_relatorios_mensais_fechamento_canonico.sql`

- [ ] **Step 1: Escrever o teste RED do payload comercial**

```js
assert.match(comercial, /dominio\s*=\s*'comercial'/i);
assert.match(comercial, /matriculas_comerciais_principais/i);
assert.match(comercial, /ticket_medio_passaporte/i);
assert.match(comercial, /ticket_medio_parcela/i);
assert.match(comercial, /is_segundo_curso/i);
assert.match(comercial, /BOLSISTA_INT/);
assert.match(comercial, /TRANSFERENCIA/);
assert.match(comercial, /SNAPSHOT_COMERCIAL_DIVERGENTE/i);
assert.doesNotMatch(comercial, /BLOQUEADA/i);
```

- [ ] **Step 2: Rodar e observar a falha esperada**

Run: `node --test tests/relatoriosMensaisFechamentoCanonico.test.mjs`

Expected: FAIL por produtor comercial incompleto.

- [ ] **Step 3: Implementar o produtor comercial**

Criar `montar_relatorio_comercial_mensal_payload_v1(uuid, integer, integer) returns jsonb` com:

- KPIs de leads, experimentais e matriculas ancorados no snapshot `comercial`;
- coorte de matriculas agrupada por unidade, data, pessoa e telefone;
- exclusao de canceladas, segundo curso, banda, coral, bolsas e transferencias;
- tickets de passaporte e parcela calculados com denominadores positivos independentes;
- rankings por canal e curso e lista detalhada congelada;
- taxa Exp -> Mat sempre numerica quando houver denominador, com pendencias em `alertas`;
- validacao da quantidade de matriculas contra `matriculas_comerciais_principais`.

- [ ] **Step 4: Rodar o teste GREEN**

Run: `node --test tests/relatoriosMensaisFechamentoCanonico.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit dos produtores**

```powershell
git add tests/relatoriosMensaisFechamentoCanonico.test.mjs supabase/migrations/20260801090000_relatorios_mensais_fechamento_canonico.sql
git commit -m "feat: produzir snapshots mensais completos"
```

### Task 4: Renderizadores no servidor

**Files:**
- Create: `supabase/functions/_shared/relatorio-mensal-admin.ts`
- Create: `supabase/functions/_shared/relatorio-mensal-admin.test.ts`
- Create: `supabase/functions/_shared/relatorio-mensal-comercial.ts`
- Create: `supabase/functions/_shared/relatorio-mensal-comercial.test.ts`
- Modify: `supabase/functions/relatorio-admin-whatsapp/index.ts`

- [ ] **Step 1: Escrever fixtures RED**

Os testes devem exigir cabecalho brasileiro, secoes atuais, dois tickets no Comercial, multicurso no Administrativo e ausencia das palavras `BLOQUEADA`, `get_`, `snapshot` e nomes de RPC no texto publico.

Run:

```powershell
deno test supabase/functions/_shared/relatorio-mensal-admin.test.ts supabase/functions/_shared/relatorio-mensal-comercial.test.ts
```

Expected: FAIL por modulos ausentes.

- [ ] **Step 2: Implementar renderizadores puros**

Exportar:

```ts
export function formatarRelatorioAdminMensal(payload: RelatorioAdminMensalPayload): string;
export function formatarRelatorioComercialMensal(payload: RelatorioComercialMensalPayload): string;
```

Os renderizadores nao acessam banco, relogio ou rede. Data de geracao e competencia chegam no payload.

- [ ] **Step 3: Integrar modos manuais na edge**

Adicionar `dry_run_admin_mensal` e `dry_run_comercial_mensal`. Cada modo valida JWT e permissao da unidade, chama apenas `get_relatorio_mensal_canonico_v1` e devolve `{ success: true, texto, origem }`.

- [ ] **Step 4: Rodar testes GREEN e check Deno**

```powershell
deno test supabase/functions/_shared/relatorio-mensal-admin.test.ts supabase/functions/_shared/relatorio-mensal-comercial.test.ts
deno check supabase/functions/relatorio-admin-whatsapp/index.ts
```

Expected: todos os testes e check aprovados.

- [ ] **Step 5: Commit**

```powershell
git add supabase/functions/_shared/relatorio-mensal-admin.ts supabase/functions/_shared/relatorio-mensal-admin.test.ts supabase/functions/_shared/relatorio-mensal-comercial.ts supabase/functions/_shared/relatorio-mensal-comercial.test.ts supabase/functions/relatorio-admin-whatsapp/index.ts
git commit -m "feat: gerar relatorios mensais no servidor"
```

### Task 5: Botoes consomem o produtor unico

**Files:**
- Create: `tests/relatoriosMensaisBotoesCanonicos.test.mjs`
- Modify: `src/components/App/Administrativo/ModalRelatorio.tsx`
- Modify: `src/components/App/Comercial/ComercialPage.tsx`

- [ ] **Step 1: Escrever teste RED**

O teste isola `gerarRelatorioMensal` nos dois componentes e exige chamada da edge com os modos mensais. Tambem proibe `movimentacoes_admin`, `alunos`, `leads`, RPCs de KPI e calculo de tickets dentro das duas funcoes.

Run: `node --test tests/relatoriosMensaisBotoesCanonicos.test.mjs`

Expected: FAIL porque os dois botoes ainda montam o documento localmente.

- [ ] **Step 2: Trocar os dois geradores**

Cada funcao envia somente:

```ts
{
  modo: 'dry_run_admin_mensal' | 'dry_run_comercial_mensal',
  unidade: unidadeId,
  ano,
  mes,
}
```

e retorna `data.texto`. Nenhum fallback local e permitido.

- [ ] **Step 3: Rodar teste GREEN e regressao direcionada**

```powershell
node --test tests/relatoriosMensaisBotoesCanonicos.test.mjs
npx --yes tsx --test scripts/tests/relatorioMensalAdministrativo.test.ts scripts/tests/relatorioComercialMensalPeriodo.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add tests/relatoriosMensaisBotoesCanonicos.test.mjs src/components/App/Administrativo/ModalRelatorio.tsx src/components/App/Comercial/ComercialPage.tsx
git commit -m "fix: unificar botoes dos relatorios mensais"
```

### Task 6: Capturar, fechar e validar julho em producao

**Files:**
- Modify: `docs/METRICAS.md`
- Modify: `docs/MAPA-SISTEMA.md`

- [ ] **Step 1: Verificacao completa antes de escrita remota**

```powershell
node --test tests/relatoriosMensaisFechamentoCanonico.test.mjs tests/relatoriosMensaisBotoesCanonicos.test.mjs
deno test supabase/functions/_shared/relatorio-mensal-admin.test.ts supabase/functions/_shared/relatorio-mensal-comercial.test.ts
deno check supabase/functions/relatorio-admin-whatsapp/index.ts
npm run build
```

Expected: exit 0 em todos.

- [ ] **Step 2: Aplicar a migration e capturar julho**

Aplicar a migration pelo projeto Supabase confirmado. Depois, em uma transacao de service role:

```sql
select public.capturar_relatorios_mensais_canonicos_v1(2026, 7, null);
select public.fechar_competencia_mensal_canonica_v1(
  2026,
  7,
  'Fechamento aprovado por Luciano em 01/08/2026; ancora capturada em 31/07/2026'
);
```

Expected: seis payloads mensais capturados, tres competencias fechadas e nenhum payload-base reescrito.

- [ ] **Step 3: Implantar a edge e validar leitura**

Implantar `relatorio-admin-whatsapp` com JWT preservado. Consultar as duas RPCs para as tres unidades e confirmar `status = fechado`, hashes estaveis e competencia 07/2026.

- [ ] **Step 4: Atualizar documentacao**

Registrar que `fechamento_mensal_snapshots` e a unica fonte historica e que os botoes mensais usam os produtores da edge.

- [ ] **Step 5: Verificacao final e commit**

Repetir testes, Deno check, build, `git diff --check` e `git status --short`.

```powershell
git add docs/METRICAS.md docs/MAPA-SISTEMA.md
git commit -m "docs: registrar relatorios mensais canonicos"
```
