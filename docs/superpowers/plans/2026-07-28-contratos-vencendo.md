# Contratos Vencendo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma aba **Contratos** em `/app/administrativo` que lista as matrículas com contrato acabando nos próximos 30/60/90 dias, com aulas restantes e vencimento da última fatura — replicando a aba "Matrículas Vencendo" do Emusys sem sair do LA Report.

**Architecture:** Quatro colunas de contrato novas na tabela da jornada (`aluno_jornada_matricula_disciplina`), preenchidas pelo `sync-matriculas-emusys` a partir do `contrato_atual` que ele **já** lê — zero chamada nova à API do Emusys. Uma view `vw_contratos_vencendo` junta jornada + `alunos` e deriva o vencimento da última fatura por fórmula. A página lê a view direto do Postgres.

**Tech Stack:** PostgreSQL (Supabase), Deno/TypeScript (edge functions), React 19 + TypeScript + Vite, Tailwind, React Router 7.

**Spec:** [`docs/superpowers/specs/2026-07-28-contratos-vencendo-emusys-design.md`](../specs/2026-07-28-contratos-vencendo-emusys-design.md)

## Global Constraints

- **Timezone BRT (UTC-3)** em toda data de negócio. `CURRENT_DATE` do Postgres já está em BRT neste projeto.
- **Idioma:** variáveis, funções e comentários em português.
- **Chave de join Emusys é SEMPRE `(unidade_id, emusys_matricula_id)`** — nunca só o ID. O ID do Emusys só é único dentro da unidade. Ignorar isso mistura alunos de unidades diferentes sem erro nenhum.
- **`vw_jornada_aluno_atual.emusys_matricula_id` é `bigint`; `alunos.emusys_matricula_id` é `text`.** Todo join entre eles precisa de cast explícito.
- **Nada é alterado em `alunos` por este plano.** As colunas novas vão na jornada, que é escrita direto; `alunos` passa por fila de aprovação humana.
- **Views novas usam `security_invoker = true`** (padrão do projeto, migration `20260630150000_seguranca_a3_views_security_invoker.sql`).
- **`git` autor:** os commits deste repo usam `Luciano <lucianoalf.la@gmail.com>`.
- **Migrations** ficam em `supabase/migrations/` com nome `YYYYMMDDHHMMSS_descricao.sql` e são aplicadas via MCP (`apply_migration`), nunca via CLI.
- **Edge function em produção:** antes de editar `sync-matriculas-emusys`, comparar o código deployado (`get_edge_function` via MCP) com o do repositório. Git ≠ produção neste projeto.

---

### Task 1: Colunas de contrato na jornada + migration

Adiciona as quatro colunas que sustentam "Venc. Última Fatura" e "Inadimplente". Elas ficam na tabela da jornada porque ela é escrita **direto** pelo sync (`upsertJornadasEmLote`), sem passar pela fila de aprovação humana que hoje deixa `alunos.data_fim_contrato` desatualizado em 17,8% dos casos.

**Files:**
- Create: `supabase/migrations/20260728180000_jornada_campos_contrato_fatura.sql`

**Interfaces:**
- Consumes: nada (primeira task).
- Produces: colunas `nr_faturas`, `data_primeira_fatura`, `dia_vencimento_emusys`, `inadimplente_emusys` em `public.aluno_jornada_matricula_disciplina`.

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/20260728180000_jornada_campos_contrato_fatura.sql`:

```sql
-- Campos de CONTRATO no espelho da jornada, para derivar o vencimento da ultima
-- fatura sem consultar /faturas e para ler inadimplencia sem depender do
-- inadimplencia_emusys_cache (que esta sem escrita desde 2026-07-15 e nunca teve
-- linha de Campo Grande).
--
-- Grao: a tabela e por matricula/disciplina, mas estes campos sao do CONTRATO --
-- repetem nas N linhas de uma matricula multi-disciplina, mesmo padrao do
-- qtd_contratos que ja existe aqui.

alter table public.aluno_jornada_matricula_disciplina
  add column if not exists nr_faturas integer,
  add column if not exists data_primeira_fatura date,
  add column if not exists dia_vencimento_emusys integer,
  add column if not exists inadimplente_emusys boolean;

comment on column public.aluno_jornada_matricula_disciplina.nr_faturas is
  'contrato_atual.nr_faturas do Emusys. 0 ou NULL = contrato sem parcelas.';
comment on column public.aluno_jornada_matricula_disciplina.data_primeira_fatura is
  'contrato_atual.data_primeira_fatura do Emusys.';
comment on column public.aluno_jornada_matricula_disciplina.dia_vencimento_emusys is
  'contrato_atual.dia_vencimento do Emusys. NAO confundir com alunos.dia_vencimento, '
  'que e default de formulario (91,2% no dia 5) e nao vem da origem.';
comment on column public.aluno_jornada_matricula_disciplina.inadimplente_emusys is
  'contrato_atual.inadimplente do Emusys: true se ha fatura nao paga vencida.';
```

- [ ] **Step 2: Aplicar a migration via MCP e verificar**

Aplicar com `mcp__supabase__apply_migration` (project_id `ouqwbbermlzqqvtqwlul`, name `jornada_campos_contrato_fatura`).

Depois rodar via `mcp__supabase__execute_sql`:

```sql
select column_name, data_type
from information_schema.columns
where table_name = 'aluno_jornada_matricula_disciplina'
  and column_name in ('nr_faturas','data_primeira_fatura','dia_vencimento_emusys','inadimplente_emusys')
order by column_name;
```

Esperado: 4 linhas — `data_primeira_fatura|date`, `dia_vencimento_emusys|integer`, `inadimplente_emusys|boolean`, `nr_faturas|integer`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260728180000_jornada_campos_contrato_fatura.sql
git commit -m "feat(jornada): colunas de contrato para venc. fatura e inadimplencia"
```

---

### Task 2: Extrair os campos de contrato no builder da jornada

O `_shared/jornada-canonica.ts` é o módulo puro que transforma o payload do Emusys em linhas da jornada. Ele já lê `contrato_atual` — só não extrai estes quatro campos. Como é módulo sem I/O, dá para testar de verdade.

**Files:**
- Modify: `supabase/functions/_shared/jornada-canonica.ts`
- Test: `supabase/functions/_shared/jornada-canonica.test.ts` (criar se não existir)

**Interfaces:**
- Consumes: colunas da Task 1.
- Produces: `JornadaMatriculaInput` ganha `nrFaturas: number | null`, `dataPrimeiraFatura: string | null`, `diaVencimentoEmusys: number | null`, `inadimplenteEmusys: boolean | null`. As linhas de `buildJornadaRowsForUpsert` ganham as 4 colunas snake_case da Task 1.

- [ ] **Step 1: Escrever o teste que falha**

Criar/abrir `supabase/functions/_shared/jornada-canonica.test.ts` e adicionar:

```ts
import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import {
  buildJornadaInputFromMatriculaApi,
  buildJornadaRowsForUpsert,
} from './jornada-canonica.ts';

const UNIDADE = '368d47f5-2d88-4475-bc14-ba084a9a348e';

// Payload real reduzido: Natan Pereira Calvo Demidoff, Barra, matricula 238.
function matriculaFake(overrides: Record<string, unknown> = {}) {
  return {
    id: 238,
    status: 'ativa',
    qtd_contratos: 2,
    aluno: { id: 408, nome: 'Natan Pereira Calvo Demidoff' },
    contrato_atual: {
      id: 834,
      nr_faturas: 12,
      data_primeira_fatura: '2025-06-05',
      dia_vencimento: 5,
      inadimplente: false,
      disciplinas: [{
        matricula_disciplina_id: 834,
        disciplina_id: 7,
        nome: 'Bateria T',
        nr_aulas_contratadas: 40,
        nr_aulas_passadas: 39,
        nr_aulas_futuras: 1,
        data_hora_ultima_aula: '2026-08-08 15:00:00',
        agendamentos: [],
      }],
      ...overrides,
    },
  };
}

Deno.test('extrai campos de contrato do payload da API', () => {
  const input = buildJornadaInputFromMatriculaApi(matriculaFake(), UNIDADE);
  assertEquals(input?.nrFaturas, 12);
  assertEquals(input?.dataPrimeiraFatura, '2025-06-05');
  assertEquals(input?.diaVencimentoEmusys, 5);
  assertEquals(input?.inadimplenteEmusys, false);
});

Deno.test('campos de contrato ausentes viram null', () => {
  const input = buildJornadaInputFromMatriculaApi(
    { id: 1, aluno: { id: 2 }, contrato_atual: { disciplinas: [] } },
    UNIDADE,
  );
  assertEquals(input?.nrFaturas, null);
  assertEquals(input?.dataPrimeiraFatura, null);
  assertEquals(input?.diaVencimentoEmusys, null);
  assertEquals(input?.inadimplenteEmusys, null);
});

Deno.test('campos de contrato repetem em cada linha de disciplina', () => {
  const mat = matriculaFake();
  (mat.contrato_atual.disciplinas as unknown[]).push({
    matricula_disciplina_id: 999,
    disciplina_id: 8,
    nome: 'Canto T',
    nr_aulas_contratadas: 40,
    nr_aulas_passadas: 38,
    nr_aulas_futuras: 2,
    data_hora_ultima_aula: '2026-08-15 11:00:00',
    agendamentos: [],
  });
  const input = buildJornadaInputFromMatriculaApi(mat, UNIDADE)!;
  const { rows } = buildJornadaRowsForUpsert(input, {
    alunoIdPorMatriculaEmusys: new Map(),
    alunoIdPorAlunoEmusys: new Map(),
    cursoIdPorDisciplinaEmusys: new Map(),
    professorIdPorProfessorEmusys: new Map(),
  });
  assertEquals(rows.length, 2);
  for (const row of rows) {
    assertEquals(row.nr_faturas, 12);
    assertEquals(row.data_primeira_fatura, '2025-06-05');
    assertEquals(row.dia_vencimento_emusys, 5);
    assertEquals(row.inadimplente_emusys, false);
  }
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
deno test --allow-net supabase/functions/_shared/jornada-canonica.test.ts
```

Esperado: FAIL. Os campos vêm `undefined` porque ainda não são extraídos.

- [ ] **Step 3: Adicionar os campos ao tipo de input**

Em `supabase/functions/_shared/jornada-canonica.ts`, na interface `JornadaMatriculaInput` (perto de `qtdContratos`), adicionar:

```ts
  nrFaturas: number | null;
  dataPrimeiraFatura: string | null;
  diaVencimentoEmusys: number | null;
  inadimplenteEmusys: boolean | null;
```

- [ ] **Step 4: Extrair os campos nos dois builders**

Em `buildJornadaInputFromMatriculaApi`, o `contrato` já está na variável `contrato`. Adicionar ao objeto retornado, logo depois de `qtdContratos`:

```ts
    nrFaturas: numberOrNull(contrato.nr_faturas),
    dataPrimeiraFatura: textOrNull(contrato.data_primeira_fatura),
    diaVencimentoEmusys: numberOrNull(contrato.dia_vencimento),
    inadimplenteEmusys: typeof contrato.inadimplente === 'boolean' ? contrato.inadimplente : null,
```

Em `buildJornadaInputFromWebhook`, o payload do webhook não expõe `contrato_atual` — os campos ficam nulos, e o sync noturno preenche depois. Adicionar depois de `qtdContratos`:

```ts
    // Webhook de matricula nao traz os campos de contrato financeiro;
    // o sync-matriculas-emusys preenche na varredura seguinte.
    nrFaturas: null,
    dataPrimeiraFatura: null,
    diaVencimentoEmusys: null,
    inadimplenteEmusys: null,
```

- [ ] **Step 5: Propagar para as linhas do upsert**

Em `buildJornadaRowsForUpsert`, dentro do objeto de linha montado por disciplina (onde já existe `nr_aulas_contratadas: disciplina.nrAulasContratadas`), adicionar:

```ts
      nr_faturas: input.nrFaturas,
      data_primeira_fatura: input.dataPrimeiraFatura,
      dia_vencimento_emusys: input.diaVencimentoEmusys,
      inadimplente_emusys: input.inadimplenteEmusys,
```

⚠️ Há **dois** blocos que montam linha nesse arquivo (por volta das linhas 334 e 396). Aplicar nos dois — o teste da Task 2 Step 1 só cobre um caminho, então conferir manualmente que ambos têm os quatro campos.

- [ ] **Step 6: Rodar o teste e confirmar que passa**

```bash
deno test --allow-net supabase/functions/_shared/jornada-canonica.test.ts
```

Esperado: PASS nos 3 testes.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/jornada-canonica.ts supabase/functions/_shared/jornada-canonica.test.ts
git commit -m "feat(jornada): extrair campos de contrato financeiro do payload Emusys"
```

---

### Task 3: Deploy das duas edges e verificação com dado real

O `_shared/jornada-canonica.ts` é importado por **duas** edge functions, e as duas precisam ser redeployadas para carregar a versão nova:

- `sync-matriculas-emusys` — o alvo da feature (cron noturno).
- **`processar-matricula-emusys`** — o webhook que trata matrícula nova, renovação, trancamento e finalização **em tempo real**. Usa `buildJornadaInputFromWebhook`, alterado na Task 2.

⚠️ Se só a primeira for redeployada, o webhook segue com o bundle antigo. Isso não quebra nada (ele simplesmente não grava as colunas novas — o sync noturno preenche depois), mas cria divergência de versão entre duas edges que compartilham o mesmo módulo. Redeployar as duas juntas evita esse rastro.

**Files:**
- Modify: nenhum (redeploy dos bundles existentes de `sync-matriculas-emusys/` e `processar-matricula-emusys/`)

**Interfaces:**
- Consumes: builder da Task 2, colunas da Task 1.
- Produces: `aluno_jornada_matricula_disciplina` com as 4 colunas populadas para as 3 unidades.

- [ ] **Step 1: Comparar o deployado com o repositório ANTES de mexer (nas DUAS edges)**

Rodar `mcp__supabase__get_edge_function` para `sync-matriculas-emusys` **e** para `processar-matricula-emusys`, comparando cada um com o respectivo `index.ts` do repositório.

Se qualquer um divergir, **parar e reportar** — significa que produção tem código que não está no git, e deployar por cima o destruiria. Não seguir sem resolver.

- [ ] **Step 2: Validar sintaxe antes do deploy**

```bash
node --check supabase/functions/_shared/jornada-canonica.ts 2>/dev/null || deno check supabase/functions/_shared/jornada-canonica.ts
```

Esperado: sem erro.

- [ ] **Step 3: Deploy das duas edges**

`mcp__supabase__deploy_edge_function` com slug `sync-matriculas-emusys`, incluindo `index.ts` e os arquivos de `_shared/` que ele importa.

Depois o mesmo para `processar-matricula-emusys` (slug `processar-matricula-emusys`), também com os `_shared/` que ele importa.

- [ ] **Step 4: Rodar o sync numa unidade e verificar população**

Invocar a edge para a Barra (`?u=barra`). Depois, via `mcp__supabase__execute_sql`:

```sql
select
  count(*) as linhas,
  count(nr_faturas) as com_nr_faturas,
  count(data_primeira_fatura) as com_1a_fatura,
  count(dia_vencimento_emusys) as com_dia_venc,
  count(inadimplente_emusys) as com_inadimplente
from aluno_jornada_matricula_disciplina
where unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e';
```

Esperado: `com_*` próximos de `linhas` (nulos só onde o contrato realmente não tem o campo).

- [ ] **Step 5: Confirmar que `dia_vencimento_emusys` traz valor REAL, não o default 5**

```sql
select dia_vencimento_emusys, count(*)
from aluno_jornada_matricula_disciplina
where unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
  and dia_vencimento_emusys is not null
group by 1 order by 2 desc;
```

Esperado: distribuição com **vários dias** (5, 8, 20, 9, 15, 29, 30, 1, 6, 16…), **não** ~91% no dia 5. Se vier quase tudo 5, o campo não está sendo lido da API — investigar antes de seguir.

- [ ] **Step 6: Rodar as outras duas unidades e commitar**

Invocar `?u=cg` e `?u=recreio`, repetir a verificação do Step 4 para cada `unidade_id`.

```bash
git commit --allow-empty -m "chore(emusys): redeploy sync-matriculas e processar-matricula com campos de contrato"
```

---

### Task 4: View `vw_contratos_vencendo`

**Files:**
- Create: `supabase/migrations/20260728190000_vw_contratos_vencendo.sql`

**Interfaces:**
- Consumes: colunas populadas na Task 3.
- Produces: view `public.vw_contratos_vencendo` com as colunas: `unidade_id`, `unidade_nome`, `aluno_id`, `aluno_nome`, `emusys_matricula_id`, `emusys_matricula_disciplina_id`, `curso_nome`, `professor_nome`, `data_matricula`, `data_ultima_aula`, `dias_ate_vencimento`, `nr_aulas_futuras`, `venc_ultima_fatura`, `valor_parcela`, `inadimplente`, `telefone`, `whatsapp`, `ultima_sincronizacao_emusys`.

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/20260728190000_vw_contratos_vencendo.sql`:

```sql
-- Matriculas com contrato acabando: base da aba Contratos em /app/administrativo.
--
-- Fonte = jornada (espelho do Emusys), NAO alunos.data_fim_contrato, que diverge
-- da origem em 17,8% dos casos porque o sync so propoe alteracao para aprovacao
-- humana e a fila nao e processada.
--
-- Sem filtro de janela aqui: a tela filtra 30/60/90 dias sobre dias_ate_vencimento.

create or replace view public.vw_contratos_vencendo as
select distinct on (j.unidade_id, j.emusys_matricula_disciplina_id)
  j.unidade_id,
  j.unidade_nome,
  j.aluno_id,
  j.aluno_nome,
  j.emusys_matricula_id,
  j.emusys_matricula_disciplina_id,
  j.curso_nome,
  j.professor_nome,
  a.data_matricula,
  j.data_ultima_aula,
  (j.data_ultima_aula::date - current_date) as dias_ate_vencimento,
  j.nr_aulas_futuras,
  -- Venc. ultima fatura = 1a fatura + (nr_faturas - 1) meses, com o DIA vindo do
  -- dia_vencimento do Emusys. Usar o dia da 1a fatura da errado: os dois divergem
  -- (1a fatura dia 11, vencimento dia 5). nr_faturas 0/NULL = sem parcela.
  case
    when jc.nr_faturas is null or jc.nr_faturas <= 0 then null
    when jc.data_primeira_fatura is null then null
    else (
      date_trunc(
        'month',
        jc.data_primeira_fatura + make_interval(months => jc.nr_faturas - 1)
      )::date
      + (least(
           coalesce(jc.dia_vencimento_emusys, extract(day from jc.data_primeira_fatura)::int),
           extract(day from (
             date_trunc('month', jc.data_primeira_fatura + make_interval(months => jc.nr_faturas - 1))
             + interval '1 month - 1 day'
           ))::int
         ) - 1)
    )
  end as venc_ultima_fatura,
  a.valor_parcela,
  jc.inadimplente_emusys as inadimplente,
  a.telefone,
  a.whatsapp,
  j.ultima_sincronizacao_emusys
from public.vw_jornada_aluno_atual j
-- As 4 colunas de contrato foram criadas na TABELA da jornada e a
-- vw_jornada_aluno_atual nao as expoe (view nao herda coluna nova). Buscamos
-- direto na tabela, em vez de recriar a view existente -- ela tem consumidores
-- ativos e mexer nela ampliaria o risco desta migration sem necessidade.
join public.aluno_jornada_matricula_disciplina jc
  on jc.unidade_id = j.unidade_id
 and jc.emusys_matricula_disciplina_id = j.emusys_matricula_disciplina_id
-- LEFT e sem filtro de alunos.status: quem manda no "ativo" e a jornada (fonte
-- Emusys). Filtrar por alunos.status sumiria com aluno que o Emusys diz ativo e
-- o cadastro local diz trancado -- exatamente o defeito que esta tela corrige.
left join public.alunos a
  on a.unidade_id = j.unidade_id
 and a.emusys_matricula_id = j.emusys_matricula_id::text
where j.status_matricula = 'ativa';

alter view public.vw_contratos_vencendo set (security_invoker = true);

comment on view public.vw_contratos_vencendo is
  'Matriculas ativas com data da ultima aula do contrato, aulas restantes e '
  'vencimento da ultima fatura derivado. Grao = matricula/disciplina.';
```

- [ ] **Step 2: Aplicar via MCP e conferir contagem da Barra**

Aplicar com `mcp__supabase__apply_migration` (name `vw_contratos_vencendo`). Depois:

```sql
select count(*) as total
from vw_contratos_vencendo
where unidade_nome ilike '%barra%'
  and dias_ate_vencimento between 0 and 30;
```

Esperado: **16**. Esse é o número conferido contra o print do Emusys em 28/07/2026. Se der diferente, a data mudou o conjunto — reconferir contra a tela do Emusys no dia, não assumir erro.

- [ ] **Step 3: Conferir a fórmula do vencimento em aluno que NÃO vence dia 5**

⚠️ Este passo existe porque a validação original da fórmula caiu inteira em alunos do dia 5 e por isso não detectou que `alunos.dia_vencimento` era default de formulário. Testar só no dia 5 reproduz o mesmo ponto cego.

```sql
select aluno_nome, curso_nome, venc_ultima_fatura, dias_ate_vencimento
from vw_contratos_vencendo v
join aluno_jornada_matricula_disciplina j
  on j.unidade_id = v.unidade_id
 and j.emusys_matricula_disciplina_id = v.emusys_matricula_disciplina_id
where j.dia_vencimento_emusys is not null
  and j.dia_vencimento_emusys <> 5
limit 10;
```

Esperado: pelo menos algumas linhas, e o **dia** de `venc_ultima_fatura` igual ao `dia_vencimento_emusys` de cada uma (ex.: dia 20 → vencimento cai dia 20). Conferir 3 delas na tela do Emusys.

- [ ] **Step 4: Conferir o caso de contrato sem parcela**

```sql
select aluno_nome, venc_ultima_fatura
from vw_contratos_vencendo
where aluno_nome ilike '%Rafael Mello dos Santos%';
```

Esperado: `venc_ultima_fatura` **NULL** — esse aluno tem `nr_faturas = 0` e aparece com a coluna vazia na tela do Emusys.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260728190000_vw_contratos_vencendo.sql
git commit -m "feat(contratos): view vw_contratos_vencendo"
```

---

### Task 5: Hook `useContratosVencendo`

**Files:**
- Create: `src/hooks/useContratosVencendo.ts`

**Interfaces:**
- Consumes: view da Task 4.
- Produces:
  ```ts
  export type ContratoVencendo = {
    unidade_id: string; unidade_nome: string;
    aluno_id: number | null; aluno_nome: string;
    emusys_matricula_id: number; emusys_matricula_disciplina_id: number;
    curso_nome: string | null; professor_nome: string | null;
    data_matricula: string | null; data_ultima_aula: string;
    dias_ate_vencimento: number; nr_aulas_futuras: number | null;
    venc_ultima_fatura: string | null; valor_parcela: number | null;
    inadimplente: boolean | null;
    telefone: string | null; whatsapp: string | null;
    ultima_sincronizacao_emusys: string | null;
  };
  export type JanelaDias = 30 | 60 | 90;
  export function useContratosVencendo(params: {
    unidadeId: string | 'todos';
    janelaDias: JanelaDias;
  }): {
    contratos: ContratoVencendo[];
    loading: boolean;
    erro: string | null;
    ultimoSync: string | null;
    refetch: () => void;
  };
  ```

- [ ] **Step 1: Escrever o hook**

Criar `src/hooks/useContratosVencendo.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type ContratoVencendo = {
  unidade_id: string;
  unidade_nome: string;
  aluno_id: number | null;
  aluno_nome: string;
  emusys_matricula_id: number;
  emusys_matricula_disciplina_id: number;
  curso_nome: string | null;
  professor_nome: string | null;
  data_matricula: string | null;
  data_ultima_aula: string;
  dias_ate_vencimento: number;
  nr_aulas_futuras: number | null;
  venc_ultima_fatura: string | null;
  valor_parcela: number | null;
  inadimplente: boolean | null;
  telefone: string | null;
  whatsapp: string | null;
  ultima_sincronizacao_emusys: string | null;
};

export type JanelaDias = 30 | 60 | 90;

type Params = { unidadeId: string | 'todos'; janelaDias: JanelaDias };

export function useContratosVencendo({ unidadeId, janelaDias }: Params) {
  const [contratos, setContratos] = useState<ContratoVencendo[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    setLoading(true);
    setErro(null);

    let query = supabase
      .from('vw_contratos_vencendo')
      .select('*')
      // dias_ate_vencimento negativo = contrato ja vencido; fora do escopo da tela.
      .gte('dias_ate_vencimento', 0)
      .lte('dias_ate_vencimento', janelaDias)
      .order('data_ultima_aula', { ascending: true });

    if (unidadeId !== 'todos') query = query.eq('unidade_id', unidadeId);

    const { data, error } = await query;
    if (error) {
      setErro(error.message);
      setContratos([]);
    } else {
      setContratos((data ?? []) as ContratoVencendo[]);
    }
    setLoading(false);
  }, [unidadeId, janelaDias]);

  useEffect(() => { buscar(); }, [buscar]);

  // Data do dado mais VELHO da tela: mostrar o mais novo daria falsa sensacao de frescor.
  const ultimoSync = contratos.reduce<string | null>((maisVelho, c) => {
    if (!c.ultima_sincronizacao_emusys) return maisVelho;
    if (!maisVelho) return c.ultima_sincronizacao_emusys;
    return c.ultima_sincronizacao_emusys < maisVelho ? c.ultima_sincronizacao_emusys : maisVelho;
  }, null);

  return { contratos, loading, erro, ultimoSync, refetch: buscar };
}
```

- [ ] **Step 2: Verificar que compila**

```bash
npx tsc --noEmit -p tsconfig.json
```

Esperado: sem erro em `useContratosVencendo.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useContratosVencendo.ts
git commit -m "feat(contratos): hook useContratosVencendo"
```

---

### Task 6: Aba "Contratos" no Administrativo

A tela vira uma **aba** em `/app/administrativo`, na segunda posição — logo após "Lançamentos", antes de "Programa Fideliza+ LA". É onde a operação de renovação já vive (Lançamentos concentra Renovações, Renovações pendentes, Não Renovação, Avisos Prévios), e é o grupo de abas que o Arthur apontou ao dizer "do lado de Entrada" — sendo "Entrada" a aba da Caixa de Entrada de WhatsApp.

Sem rota nova, sem lazy import, sem mexer em `EntradaMenu` — a aba entra no `PageTabs` já existente.

**Files:**
- Create: `src/components/App/Administrativo/TabContratosVencendo.tsx`
- Modify: `src/components/App/Administrativo/AdministrativoPage.tsx:253` (união de tipos do `mainTab`)
- Modify: `src/components/App/Administrativo/AdministrativoPage.tsx:1312-1317` (array de abas)
- Modify: `src/components/App/Administrativo/AdministrativoPage.tsx:1324+` (renderização condicional)

**Interfaces:**
- Consumes: `useContratosVencendo`, `ContratoVencendo`, `JanelaDias` da Task 5.
- Produces: componente `TabContratosVencendo` com a prop `{ unidadeId: string }`.

- [ ] **Step 1: Criar o componente da aba**

Criar `src/components/App/Administrativo/TabContratosVencendo.tsx`:

```tsx
import React, { useState } from 'react';
import { useContratosVencendo, type JanelaDias } from '@/hooks/useContratosVencendo';

const JANELAS: JanelaDias[] = [30, 60, 90];

function formatarData(iso: string | null): string {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

function formatarMoeda(valor: number | null): string {
  if (valor == null) return '—';
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function TabContratosVencendo({ unidadeId }: { unidadeId: string }) {
  const [janelaDias, setJanelaDias] = useState<JanelaDias>(30);
  const [busca, setBusca] = useState('');

  const { contratos, loading, erro, ultimoSync } = useContratosVencendo({ unidadeId, janelaDias });

  const termo = busca.trim().toLowerCase();
  const visiveis = termo
    ? contratos.filter((c) => c.aluno_nome.toLowerCase().includes(termo))
    : contratos;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {JANELAS.map((dias) => (
          <button
            key={dias}
            onClick={() => setJanelaDias(dias)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              janelaDias === dias
                ? 'bg-cyan-500 text-white'
                : 'bg-slate-800/50 text-gray-300 hover:bg-slate-700/50'
            }`}
          >
            {dias} dias
          </button>
        ))}
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar aluno…"
          className="rounded-xl border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-sm text-gray-200 placeholder:text-gray-500"
        />
        {ultimoSync && (
          <span className="ml-auto text-xs text-gray-400">
            Dados do Emusys sincronizados em {formatarData(ultimoSync)}
          </span>
        )}
      </div>

      {erro && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          Erro ao carregar: {erro}
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">Carregando…</p>
      ) : visiveis.length === 0 ? (
        <p className="text-gray-400">
          {termo
            ? `Nenhum aluno encontrado para "${busca}".`
            : `Nenhuma matrícula com contrato acabando nos próximos ${janelaDias} dias.`}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-700/50">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/50 text-gray-300">
              <tr>
                <th className="px-4 py-3 text-left">Aluno</th>
                <th className="px-4 py-3 text-left">Curso</th>
                <th className="px-4 py-3 text-left">Professor</th>
                <th className="px-4 py-3 text-left">Matrícula</th>
                <th className="px-4 py-3 text-left">Última aula</th>
                <th className="px-4 py-3 text-left">Venc. últ. fatura</th>
                <th className="px-4 py-3 text-right">Aulas restantes</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3 text-left">Situação</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((c) => (
                <tr
                  key={`${c.unidade_id}-${c.emusys_matricula_disciplina_id}`}
                  className="border-t border-slate-700/40 text-gray-200"
                >
                  <td className="px-4 py-3">
                    {c.aluno_nome}
                    {unidadeId === 'todos' && (
                      <span className="ml-2 text-xs text-gray-400">{c.unidade_nome}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{c.curso_nome ?? '—'}</td>
                  <td className="px-4 py-3">{c.professor_nome ?? '—'}</td>
                  <td className="px-4 py-3">{formatarData(c.data_matricula)}</td>
                  <td className="px-4 py-3">{formatarData(c.data_ultima_aula)}</td>
                  <td className="px-4 py-3">{formatarData(c.venc_ultima_fatura)}</td>
                  <td className="px-4 py-3 text-right">{c.nr_aulas_futuras ?? '—'}</td>
                  <td
                    className="px-4 py-3 text-right"
                    title="Valor como está na API do Emusys; pode estar bruto. Confira na Conciliação."
                  >
                    {formatarMoeda(c.valor_parcela)}
                  </td>
                  <td className="px-4 py-3">
                    {c.inadimplente == null ? (
                      <span className="text-gray-500">—</span>
                    ) : c.inadimplente ? (
                      <span className="rounded-lg bg-rose-500/15 px-2 py-1 text-xs text-rose-300">
                        Inadimplente
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Em dia</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default TabContratosVencendo;
```

- [ ] **Step 2: Importar o componente e o ícone**

Em `src/components/App/Administrativo/AdministrativoPage.tsx`, junto dos outros imports de aba (perto de `import { TabLojinha } from '../Lojinha';`):

```tsx
import { TabContratosVencendo } from './TabContratosVencendo';
```

E adicionar `CalendarClock` à lista de ícones importados de `lucide-react` na linha 11 (junto de `Clock`, `ArrowRightLeft` etc.).

- [ ] **Step 3: Adicionar `contratos` à união de tipos do `mainTab`**

Em `AdministrativoPage.tsx:253`, trocar:

```tsx
  const [mainTab, setMainTab] = useState<'lancamentos' | 'fideliza' | 'lojinha' | 'farmer' | 'caixa_financeiro' | 'caixa_entrada'>('lancamentos');
```

por:

```tsx
  const [mainTab, setMainTab] = useState<'lancamentos' | 'contratos' | 'fideliza' | 'lojinha' | 'farmer' | 'caixa_financeiro' | 'caixa_entrada'>('lancamentos');
```

- [ ] **Step 4: Adicionar a aba ao `PageTabs`**

No array de `tabs` do `PageTabs` (por volta da linha 1312), inserir **entre** `lancamentos` e `fideliza`:

```tsx
          { id: 'contratos' as const, label: 'Contratos', shortLabel: 'Contratos', icon: CalendarClock, activeGradient: 'from-amber-500 to-orange-500', activeShadow: 'shadow-amber-500/20' },
```

- [ ] **Step 5: Renderizar o conteúdo da aba**

Na cadeia de renderização condicional (por volta da linha 1324), adicionar um ramo antes do `mainTab === 'caixa_financeiro'`:

```tsx
      {mainTab === 'contratos' ? (
        <TabContratosVencendo unidadeId={unidade} />
      ) : mainTab === 'caixa_financeiro' ? (
```

⚠️ A cadeia é um ternário encadeado — o novo ramo precisa vir **antes** do `{mainTab === 'caixa_financeiro' ? (` que hoje abre a cadeia, e a chave `{` de abertura passa a ser a do ramo novo. Conferir que a estrutura de parênteses continua balanceada depois da edição.

- [ ] **Step 6: Build limpo**

```bash
npm run build
```

Esperado: build sem erro.

- [ ] **Step 7: Conferir na tela**

Subir `npm run dev` (porta 5175), acessar `/app/administrativo`, clicar na aba **Contratos** e verificar:

- a aba aparece em segundo lugar, entre "Lançamentos" e "Programa Fideliza+ LA";
- com a Barra selecionada e janela de 30 dias, a tabela mostra **16 linhas**;
- ordenadas por última aula crescente;
- "Venc. últ. fatura" preenchido, e **vazio** na linha do Rafael Mello dos Santos;
- trocar a janela para 60 e 90 dias aumenta a lista.

- [ ] **Step 8: Commit**

```bash
git add src/components/App/Administrativo/TabContratosVencendo.tsx src/components/App/Administrativo/AdministrativoPage.tsx
git commit -m "feat(contratos): aba Contratos no Administrativo"
```

---
### Task 7: Documentação

**Files:**
- Modify: `docs/MAPA-SISTEMA.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: tudo das tasks anteriores.
- Produces: nenhuma interface de código.

- [ ] **Step 1: Registrar a página no mapa do sistema**

Em `docs/MAPA-SISTEMA.md`, seguindo o formato já usado para as outras páginas, adicionar entrada para:

- **Rota:** `/app/administrativo` → aba **Contratos** (2ª posição)
- **Componente:** `src/components/App/Administrativo/TabContratosVencendo.tsx`
- **Hook:** `src/hooks/useContratosVencendo.ts`
- **View:** `vw_contratos_vencendo`
- **Edge/RPC:** nenhuma (leitura direta da view)

- [ ] **Step 2: Registrar a feature no CLAUDE.md**

Adicionar bullet na seção de módulos/integrações, no mesmo estilo dos existentes:

```markdown
- **Contratos vencendo (Administrativo → Contratos):** aba em `/app/administrativo` (`TabContratosVencendo` + `useContratosVencendo`) replica a aba "Matrículas Vencendo" do Emusys. Lê a view `vw_contratos_vencendo` (jornada + `alunos`), sem chamada à API. ⚠️ Fonte da data de fim é `vw_jornada_aluno_atual.data_ultima_aula`, **não** `alunos.data_fim_contrato` — este último diverge do Emusys em 17,8% dos casos porque o sync só propõe a alteração para aprovação humana. "Venc. última fatura" é **derivado** (`data_primeira_fatura + (nr_faturas-1) meses`, dia = `dia_vencimento_emusys`), não consultado em `/faturas`. ⚠️ `alunos.dia_vencimento` é default de formulário (91,2% no dia 5), por isso a fórmula usa `dia_vencimento_emusys` da jornada. Spec: `docs/superpowers/specs/2026-07-28-contratos-vencendo-emusys-design.md`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/MAPA-SISTEMA.md CLAUDE.md
git commit -m "docs(contratos): registrar tela de contratos vencendo"
```

---

## Fora deste plano

Quatro achados de produção apareceram na investigação. Nenhum é causado por esta feature, nenhum a bloqueia, e cada um merece decisão própria — estão documentados na seção "Achados em produção" do spec e na daily-note de 2026-07-28:

1. `sync-presenca-emusys` engole erro na paginação (`console.error` + `break`) e devolve aulas parciais como dia completo.
2. `sync-inadimplencia-emusys` falha em silêncio: cache sem escrita desde 2026-07-15, Campo Grande sem nenhuma linha, crons reportando `succeeded`.
3. `vw_renovacoes_proximas` (régua de renovação de Sucesso do Aluno) usa `alunos.data_fim_contrato` e perde 14 alunos vencendo em 30 dias.
4. `alunos.dia_vencimento` é default de formulário, não dado do Emusys — divergente do real em 16 de 256 alunos na Barra.

Também fora de escopo, por limitação da API do Emusys: as abas "Matrículas Renovadas" (projeção de valores depende da Tabela de Valores, sem endpoint) e "Renovação em Lote" (marcar "não será renovada" exige escrita, e a API só expõe `GET`).
