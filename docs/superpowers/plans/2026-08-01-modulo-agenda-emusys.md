# Módulo Agenda — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar em `/app/agenda` um espelho da timeline do Emusys — as 3 unidades numa tela, com régua do horário atual em tempo real — enriquecido com risco de evasão, inadimplência e nota da pesquisa.

**Architecture:** Nada de dado novo vindo da API. A agenda já está em `aulas_emusys`, alimentada por crons ativos. Três frentes: (1) uma tabela `aula_alunos` que passa a guardar o `alunos[]` que a resposta do `GET /aulas` já traz e os syncs hoje descartam; (2) uma RPC `get_agenda_dia` que devolve as aulas **já agrupadas** e enriquecidas, porque `aulas_emusys` guarda uma linha por aluno em turmas; (3) uma página React com timeline horizontal, com toda a matemática de posicionamento em funções puras testáveis.

**Tech Stack:** React 19 + TypeScript 5.8 + Vite 6, Tailwind, Supabase (PostgreSQL + RPC + RLS), Deno (edge functions). Testes: arquivos `.ts` avulsos em `scripts/tests/` com `node:assert/strict`, executados por `npx tsx`.

**Spec:** [`docs/superpowers/specs/2026-08-01-modulo-agenda-emusys-design.md`](../specs/2026-08-01-modulo-agenda-emusys-design.md)

## Global Constraints

- **Idioma:** variáveis, funções, comentários e textos de tela em português. Sem acento em mensagem de commit.
- **Timezone:** BRT (UTC-3). A RPC devolve horário como texto `HH:MM` já convertido (`at time zone 'America/Sao_Paulo'`); o cliente **nunca** faz conversão de fuso — assim o teste não depende do fuso da máquina.
- **Sem cron novo e sem chamada nova à API do Emusys.** Reusar `sync-grade-futura-emusys` e `sync-presenca-emusys` (crons `sync-metadados-aulas-15m-u0/u1/u2` e `sync-grade-futura-*`).
- **Sem botão de "atualizar agora"** na tela: `GET /aulas` sem filtro de data custa ~9 s e o rate limit é 60 req/min.
- **Data fetching:** hook customizado com Supabase direto, sem React Query (padrão do repo).
- **Estado global:** Context API. Sem Redux/Zustand.
- **Migrations:** aplicar via MCP Supabase (`apply_migration`), não via CLI. As mudanças vão direto ao projeto remoto `ouqwbbermlzqqvtqwlul`.
- **Deploy de edge function:** via MCP (`deploy_edge_function`), partindo **do código realmente deployado** (`get_edge_function`), não do git — os dois podem divergir.
- **Janela histórica incompleta:** `2026-07-19` a `2026-08-01` (inclusive). Não fazer backfill; só avisar na tela.
- **Rodar teste:** `npx tsx scripts/tests/<arquivo>.test.ts` — sai `OK` e exit 0 quando passa.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/agenda.ts` (criar) | Funções puras: posicionamento na timeline, alocação de faixas quando aulas colidem, contagem "em aula agora", frescor do sync, detecção de dia incompleto. Nenhum import de React ou Supabase. |
| `scripts/tests/agendaFaixas.test.ts` (criar) | Testes da alocação de faixas. |
| `scripts/tests/agendaTimeline.test.ts` (criar) | Testes de posicionamento, régua, frescor e janela incompleta. |
| `supabase/migrations/*_aula_alunos.sql` (criar) | Tabela `aula_alunos` + índices + RLS. |
| `supabase/migrations/*_get_agenda_dia.sql` (criar) | RPC `get_agenda_dia`. |
| `supabase/functions/_shared/emusys-aulas.ts` (modificar) | Helper único que monta e grava os vínculos aula↔aluno, usado pelas duas edges. Mora aqui porque é o arquivo que já concentra os helpers de aulas do Emusys e já tem teste ao lado. |
| `supabase/functions/_shared/emusys-aulas.test.ts` (modificar) | Testes do helper. |
| `supabase/functions/sync-grade-futura-emusys/index.ts` (modificar) | Chama o helper após o upsert das aulas. |
| `supabase/functions/sync-presenca-emusys/index.ts` (modificar) | Idem, no modo metadados. |
| `src/hooks/useAgendaDia.ts` (criar) | Chama a RPC, calcula frescor, expõe `{ aulas, carregando, erro, frescorMin, recarregar }`. |
| `src/components/App/Agenda/AgendaCard.tsx` (criar) | Um bloco de aula: cor, badge e rótulo por estado. |
| `src/components/App/Agenda/AgendaTimeline.tsx` (criar) | Trilhos por professor ou sala, cabeçalho de horas, régua. |
| `src/components/App/Agenda/AgendaDrawer.tsx` (criar) | Painel de detalhe da aula selecionada. |
| `src/components/App/Agenda/AgendaPage.tsx` (criar) | Estado da tela, filtros, KPIs, avisos. |
| `src/components/App/Agenda/index.ts` (criar) | Reexport para o preload do sidebar. |
| `src/router.tsx` (modificar) | Rota `agenda`. |
| `src/components/App/Layout/AppSidebar.tsx` (modificar) | Preload + item de menu. |

---

### Task 1: Funções puras da timeline

Toda a matemática da tela vive aqui, fora do React, para poder ser testada com `node:assert`.

**Files:**
- Create: `src/lib/agenda.ts`
- Test: `scripts/tests/agendaFaixas.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `AGENDA_HORA_INICIO`, `AGENDA_HORA_FIM`, `AGENDA_LARGURA_HORA_PX`, `AGENDA_ALTURA_FAIXA_PX`, `AGENDA_GAP_FAIXA_PX`, `minutosDeHHMM(hhmm: string): number`, `type ItemPosicionavel = { hora_inicio: string; duracao_minutos: number }`, `alocarFaixas<T extends ItemPosicionavel>(itens: T[]): Array<T & { faixa: number }>`, `contarFaixas(itens: Array<{ faixa: number }>): number`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `scripts/tests/agendaFaixas.test.ts`:

```ts
import assert from 'node:assert/strict';
import { alocarFaixas, contarFaixas, minutosDeHHMM } from '../../src/lib/agenda';

assert.equal(minutosDeHHMM('08:00'), 480, '08:00 deve virar 480 minutos');
assert.equal(minutosDeHHMM('17:30'), 1050, '17:30 deve virar 1050 minutos');

// Aulas que nao se sobrepoem ficam todas na faixa 0.
const seguidas = alocarFaixas([
  { hora_inicio: '14:00', duracao_minutos: 50 },
  { hora_inicio: '15:00', duracao_minutos: 50 },
]);
assert.deepEqual(
  seguidas.map((a) => a.faixa),
  [0, 0],
  'aulas em horarios distintos devem dividir a mesma faixa',
);

// Caso real: Isaque, Recreio, 04/08/2026.
// Experimental de 30min as 17:00 colide com a turma de 50min as 17:00;
// a segunda experimental as 17:30 cabe de volta na faixa 0.
const isaque = alocarFaixas([
  { hora_inicio: '17:00', duracao_minutos: 30 },
  { hora_inicio: '17:00', duracao_minutos: 50 },
  { hora_inicio: '17:30', duracao_minutos: 30 },
]);
assert.deepEqual(
  isaque.map((a) => a.faixa),
  [0, 1, 0],
  'aulas sobrepostas devem ocupar faixas distintas e reaproveitar a faixa livre',
);
assert.equal(contarFaixas(isaque), 2, 'o trilho do Isaque precisa de 2 faixas');

// A entrada pode chegar fora de ordem e o resultado deve ser o mesmo.
const desordenado = alocarFaixas([
  { hora_inicio: '17:30', duracao_minutos: 30 },
  { hora_inicio: '17:00', duracao_minutos: 50 },
  { hora_inicio: '17:00', duracao_minutos: 30 },
]);
assert.equal(contarFaixas(desordenado), 2, 'ordem da entrada nao pode mudar o numero de faixas');

// Aula que termina exatamente quando a proxima comeca nao conta como colisao.
const encostadas = alocarFaixas([
  { hora_inicio: '17:00', duracao_minutos: 30 },
  { hora_inicio: '17:30', duracao_minutos: 30 },
]);
assert.deepEqual(
  encostadas.map((a) => a.faixa),
  [0, 0],
  'fim == inicio da seguinte nao e colisao',
);

assert.deepEqual(alocarFaixas([]), [], 'lista vazia devolve lista vazia');
assert.equal(contarFaixas([]), 0, 'lista vazia precisa de 0 faixas');

console.log('agenda faixas: OK');
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx tsx scripts/tests/agendaFaixas.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/agenda'`

- [ ] **Step 3: Implementar o mínimo**

Criar `src/lib/agenda.ts`:

```ts
// Geometria da timeline da Agenda. Sem React, sem Supabase: tudo testavel isoladamente.

export const AGENDA_HORA_INICIO = 8;
export const AGENDA_HORA_FIM = 22;
export const AGENDA_LARGURA_HORA_PX = 88;
export const AGENDA_ALTURA_FAIXA_PX = 34;
export const AGENDA_GAP_FAIXA_PX = 3;

export type ItemPosicionavel = {
  hora_inicio: string;
  duracao_minutos: number;
};

/** 'HH:MM' -> minutos desde a meia-noite. A RPC ja entrega em BRT. */
export function minutosDeHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

/**
 * Distribui aulas em faixas horizontais para que aulas sobrepostas nao se
 * cubram. Uma faixa e reaproveitada assim que a aula anterior dela termina.
 * A ordenacao interna torna o resultado independente da ordem de entrada.
 */
export function alocarFaixas<T extends ItemPosicionavel>(
  itens: T[],
): Array<T & { faixa: number }> {
  const ordenados = itens
    .map((item, indice) => ({ item, indice }))
    .sort((a, b) => {
      const ia = minutosDeHHMM(a.item.hora_inicio);
      const ib = minutosDeHHMM(b.item.hora_inicio);
      if (ia !== ib) return ia - ib;
      if (a.item.duracao_minutos !== b.item.duracao_minutos) {
        return a.item.duracao_minutos - b.item.duracao_minutos;
      }
      return a.indice - b.indice;
    });

  const fimDaFaixa: number[] = [];
  const faixaPorIndice = new Map<number, number>();

  for (const { item, indice } of ordenados) {
    const inicio = minutosDeHHMM(item.hora_inicio);
    const fim = inicio + item.duracao_minutos;
    let faixa = 0;
    while (fimDaFaixa[faixa] !== undefined && fimDaFaixa[faixa] > inicio) {
      faixa++;
    }
    fimDaFaixa[faixa] = fim;
    faixaPorIndice.set(indice, faixa);
  }

  return itens.map((item, indice) => ({
    ...item,
    faixa: faixaPorIndice.get(indice) ?? 0,
  }));
}

export function contarFaixas(itens: Array<{ faixa: number }>): number {
  if (itens.length === 0) return 0;
  return Math.max(...itens.map((i) => i.faixa)) + 1;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx tsx scripts/tests/agendaFaixas.test.ts`
Expected: PASS — imprime `agenda faixas: OK`, exit 0

- [ ] **Step 5: Commit**

```bash
git add src/lib/agenda.ts scripts/tests/agendaFaixas.test.ts
git commit -m "feat(agenda): alocacao de faixas para aulas sobrepostas na timeline"
```

---

### Task 2: Posicionamento, régua e avisos

Completa `src/lib/agenda.ts` com o que a página precisa além das faixas.

**Files:**
- Modify: `src/lib/agenda.ts`
- Test: `scripts/tests/agendaTimeline.test.ts`

**Interfaces:**
- Consumes: `minutosDeHHMM`, `AGENDA_HORA_INICIO`, `AGENDA_HORA_FIM`, `AGENDA_LARGURA_HORA_PX` da Task 1.
- Produces: `posicaoPx(hhmm: string): number`, `larguraPx(duracaoMinutos: number): number`, `minutosAgora(agora: Date): number`, `dentroDoExpediente(minutos: number): boolean`, `contarEmAulaAgora(aulas: Array<{ hora_inicio: string; duracao_minutos: number; cancelada: boolean; sala_nome: string | null }>, minutos: number): { aulas: number; salas: number }`, `formatarFrescor(ultimaSync: string | null, agora: Date): string`, `DIA_INCOMPLETO_INICIO`, `DIA_INCOMPLETO_FIM`, `diaIncompleto(data: string): boolean`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `scripts/tests/agendaTimeline.test.ts`:

```ts
import assert from 'node:assert/strict';
import {
  posicaoPx,
  larguraPx,
  minutosAgora,
  dentroDoExpediente,
  contarEmAulaAgora,
  formatarFrescor,
  diaIncompleto,
} from '../../src/lib/agenda';

// Posicionamento: 08:00 e a origem do trilho, cada hora vale 88px.
assert.equal(posicaoPx('08:00'), 0, '08:00 fica na origem');
assert.equal(posicaoPx('09:00'), 88, 'uma hora depois = 88px');
assert.equal(posicaoPx('17:30'), 836, '17:30 = 9,5h apos as 08:00');
assert.equal(larguraPx(60), 88, 'aula de 1h ocupa 88px');
assert.equal(larguraPx(30), 44, 'aula de 30min ocupa metade');

// Regua: usa o relogio local, sem conversao de fuso.
assert.equal(minutosAgora(new Date(2026, 7, 4, 13, 17)), 797, '13:17 = 797 minutos');
assert.equal(dentroDoExpediente(797), true, '13:17 esta no expediente');
assert.equal(dentroDoExpediente(60), false, '01:00 esta fora do expediente');
assert.equal(dentroDoExpediente(1320), true, '22:00 e o limite superior, ainda dentro');
assert.equal(dentroDoExpediente(1321), false, '22:01 ja esta fora');

// "Em aula agora": aula cancelada nao conta, e a mesma sala nao conta duas vezes.
const aulas = [
  { hora_inicio: '14:00', duracao_minutos: 50, cancelada: false, sala_nome: 'Slash' },
  { hora_inicio: '14:00', duracao_minutos: 50, cancelada: false, sala_nome: 'Aposan' },
  { hora_inicio: '14:00', duracao_minutos: 50, cancelada: true, sala_nome: 'Barone' },
  { hora_inicio: '16:00', duracao_minutos: 50, cancelada: false, sala_nome: 'Slash' },
];
assert.deepEqual(
  contarEmAulaAgora(aulas, minutosDeHHMMLocal('14:20')),
  { aulas: 2, salas: 2 },
  'as 14:20 ha 2 aulas vivas em 2 salas',
);
assert.deepEqual(
  contarEmAulaAgora(aulas, minutosDeHHMMLocal('14:50')),
  { aulas: 0, salas: 0 },
  'as 14:50 a aula de 50min ja terminou',
);
assert.deepEqual(
  contarEmAulaAgora(aulas, minutosDeHHMMLocal('03:00')),
  { aulas: 0, salas: 0 },
  'de madrugada nao ha ninguem em aula',
);

function minutosDeHHMMLocal(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

// Frescor do sync.
const agora = new Date(2026, 7, 1, 14, 30);
assert.equal(formatarFrescor(null, agora), 'sem dado de sincronizacao');
assert.equal(formatarFrescor(new Date(2026, 7, 1, 14, 30).toISOString(), agora), 'agora mesmo');
assert.equal(formatarFrescor(new Date(2026, 7, 1, 14, 26).toISOString(), agora), 'ha 4 min');
assert.equal(formatarFrescor(new Date(2026, 7, 1, 12, 30).toISOString(), agora), 'ha 2 h');

// Janela historica incompleta (19/07 a 01/08/2026, inclusive).
assert.equal(diaIncompleto('2026-07-18'), false, '18/07 esta integro');
assert.equal(diaIncompleto('2026-07-19'), true, '19/07 abre a janela quebrada');
assert.equal(diaIncompleto('2026-07-25'), true, '25/07 esta dentro da janela');
assert.equal(diaIncompleto('2026-08-01'), true, '01/08 fecha a janela quebrada');
assert.equal(diaIncompleto('2026-08-03'), false, '03/08 ja esta integro');

console.log('agenda timeline: OK');
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx tsx scripts/tests/agendaTimeline.test.ts`
Expected: FAIL — `posicaoPx is not a function` (ou erro de export não encontrado)

- [ ] **Step 3: Implementar o mínimo**

Acrescentar ao final de `src/lib/agenda.ts`:

```ts
/** Distancia em px do inicio do trilho (08:00) ate o horario dado. */
export function posicaoPx(hhmm: string): number {
  const minutos = minutosDeHHMM(hhmm);
  return ((minutos - AGENDA_HORA_INICIO * 60) / 60) * AGENDA_LARGURA_HORA_PX;
}

export function larguraPx(duracaoMinutos: number): number {
  return (duracaoMinutos / 60) * AGENDA_LARGURA_HORA_PX;
}

/** Minutos desde a meia-noite no relogio local. O app roda em BRT. */
export function minutosAgora(agora: Date): number {
  return agora.getHours() * 60 + agora.getMinutes();
}

export function dentroDoExpediente(minutos: number): boolean {
  return minutos >= AGENDA_HORA_INICIO * 60 && minutos <= AGENDA_HORA_FIM * 60;
}

/** Aulas vivas neste minuto e quantas salas elas ocupam. Cancelada nao conta. */
export function contarEmAulaAgora(
  aulas: Array<{
    hora_inicio: string;
    duracao_minutos: number;
    cancelada: boolean;
    sala_nome: string | null;
  }>,
  minutos: number,
): { aulas: number; salas: number } {
  const salas = new Set<string>();
  let total = 0;

  for (const aula of aulas) {
    if (aula.cancelada) continue;
    const inicio = minutosDeHHMM(aula.hora_inicio);
    if (minutos < inicio || minutos >= inicio + aula.duracao_minutos) continue;
    total++;
    if (aula.sala_nome) salas.add(aula.sala_nome);
  }

  return { aulas: total, salas: salas.size };
}

export function formatarFrescor(ultimaSync: string | null, agora: Date): string {
  if (!ultimaSync) return 'sem dado de sincronizacao';

  const minutos = Math.floor((agora.getTime() - new Date(ultimaSync).getTime()) / 60000);
  if (minutos < 1) return 'agora mesmo';
  if (minutos < 60) return `ha ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `ha ${horas} h`;
  return `ha ${Math.floor(horas / 24)} d`;
}

// Janela em que aulas foram apagadas por um evento pontual (ver spec).
// Nao ha backfill: a tela avisa em vez de mostrar um dia vazio como verdade.
export const DIA_INCOMPLETO_INICIO = '2026-07-19';
export const DIA_INCOMPLETO_FIM = '2026-08-01';

export function diaIncompleto(data: string): boolean {
  return data >= DIA_INCOMPLETO_INICIO && data <= DIA_INCOMPLETO_FIM;
}
```

- [ ] **Step 4: Rodar os dois testes e confirmar que passam**

Run: `npx tsx scripts/tests/agendaTimeline.test.ts && npx tsx scripts/tests/agendaFaixas.test.ts`
Expected: PASS — imprime `agenda timeline: OK` e `agenda faixas: OK`, exit 0

- [ ] **Step 5: Commit**

```bash
git add src/lib/agenda.ts scripts/tests/agendaTimeline.test.ts
git commit -m "feat(agenda): posicionamento, regua do horario atual e aviso de dia incompleto"
```

---

### Task 3: Tabela `aula_alunos`

Guarda o vínculo aula↔aluno da grade futura. **Não** reusa `aluno_presenca`: aquela tabela é a fonte de verdade da presença e alimenta os KPIs de frequência e o fluxo de confirmação por WhatsApp.

**Files:**
- Create: migration `aula_alunos` (via MCP `apply_migration`, nome `criar_aula_alunos`)

**Interfaces:**
- Consumes: `aulas_emusys(id)`, `unidades(id)`, `alunos(id)`.
- Produces: tabela `public.aula_alunos` com colunas `id`, `aula_emusys_id`, `unidade_id`, `aluno_id`, `emusys_aluno_id`, `lead_id`, `nome`, `telefone`, `created_at`, `updated_at`; constraint `aula_alunos_aula_nome_key` sobre `(aula_emusys_id, nome)`.

- [ ] **Step 1: Aplicar a migration**

Via MCP Supabase `apply_migration`, projeto `ouqwbbermlzqqvtqwlul`, nome `criar_aula_alunos`:

```sql
create table if not exists public.aula_alunos (
  id               bigserial primary key,
  aula_emusys_id   integer not null references public.aulas_emusys(id) on delete cascade,
  unidade_id       uuid not null references public.unidades(id),
  aluno_id         uuid references public.alunos(id) on delete set null,
  emusys_aluno_id  integer,
  lead_id          integer,
  nome             text not null,
  telefone         text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint aula_alunos_aula_nome_key unique (aula_emusys_id, nome)
);

comment on table public.aula_alunos is
  'Vinculo aula<->aluno da grade (inclusive futura). Populado pelos syncs a partir do alunos[] '
  'que o GET /aulas do Emusys ja devolve. NAO e fonte de presenca: presenca vive em aluno_presenca.';
comment on column public.aula_alunos.nome is
  'Snapshot do nome_aluno vindo da API. Nao acompanha renomeacao em alunos; use aluno_id para join.';
comment on column public.aula_alunos.aluno_id is
  'Null quando o participante ainda e lead (aula experimental).';
comment on column public.aula_alunos.emusys_aluno_id is
  'id_aluno da API do Emusys. Casa com alunos.emusys_student_id (NAO existe alunos.emusys_aluno_id).';

create index if not exists idx_aula_alunos_aula on public.aula_alunos(aula_emusys_id);
create index if not exists idx_aula_alunos_aluno on public.aula_alunos(aluno_id);
create index if not exists idx_aula_alunos_unidade on public.aula_alunos(unidade_id);

alter table public.aula_alunos enable row level security;

create policy aula_alunos_select_policy on public.aula_alunos
  for select using (is_admin() or unidade_id in (select get_user_unidade_ids()));

create policy aula_alunos_insert_policy on public.aula_alunos
  for insert with check (is_admin() or unidade_id in (select get_user_unidade_ids()));

create policy aula_alunos_update_policy on public.aula_alunos
  for update using (is_admin() or unidade_id in (select get_user_unidade_ids()));

create policy aula_alunos_delete_policy on public.aula_alunos
  for delete using (is_admin() or unidade_id in (select get_user_unidade_ids()));
```

- [ ] **Step 2: Verificar que a tabela e as policies existem**

Via MCP `execute_sql`:

```sql
select
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='aula_alunos') as colunas,
  (select count(*) from pg_policies
     where schemaname='public' and tablename='aula_alunos') as policies,
  (select relrowsecurity from pg_class where relname='aula_alunos') as rls_ativo;
```

Expected: `colunas = 10`, `policies = 4`, `rls_ativo = true`

- [ ] **Step 3: Commit do arquivo de migration**

Salvar o SQL acima em `supabase/migrations/20260801120000_criar_aula_alunos.sql` para o repo ficar alinhado com o banco.

```bash
git add supabase/migrations/20260801120000_criar_aula_alunos.sql
git commit -m "feat(agenda): tabela aula_alunos para o vinculo aula-aluno da grade"
```

---

### Task 4: RPC `get_agenda_dia`

Resolve no SQL o problema que quebraria a tela: `aulas_emusys` guarda **uma linha por aluno** em aulas de turma e ainda duplica `tipo=turma` + `tipo=individual` no mesmo horário. A turma `C_Ter_18` da Lohana em 04/08 às 18:00 são 5 linhas que precisam virar 1 card.

**Files:**
- Create: migration `get_agenda_dia` (via MCP `apply_migration`)

**Interfaces:**
- Consumes: `aulas_emusys`, `aula_alunos` (Task 3), `aluno_presenca`, `alunos`, `unidades`, `vw_risco_evasao_atual`, `aluno_jornada_matricula_disciplina`, `pesquisas_whatsapp`, `vw_jornada_aluno_atual`.
- Produces: `public.get_agenda_dia(p_data date, p_unidade_id uuid default null)` devolvendo as colunas listadas no SQL abaixo. `alunos` é `jsonb` array de `{ aluno_id, nome, idade, responsavel_nome, responsavel_telefone, status_presenca, risco_pct, inadimplente, nota_pesquisa, data_ultima_aula }`.

- [ ] **Step 1: Aplicar a migration**

Via MCP `apply_migration`, nome `criar_get_agenda_dia`:

```sql
create or replace function public.get_agenda_dia(
  p_data date,
  p_unidade_id uuid default null
)
returns table (
  chave              text,
  unidade_id         uuid,
  unidade_nome       text,
  professor_nome     text,
  professor_id       integer,
  sala_nome          text,
  curso_nome         text,
  turma_nome         text,
  hora_inicio        text,
  hora_fim           text,
  duracao_minutos    integer,
  categoria          text,
  tipo               text,
  cancelada          boolean,
  justificada        boolean,
  reagendada         boolean,
  hora_original      text,
  nr_da_aula         integer,
  qtd_alunos         integer,
  anotacoes          text,
  professor_presenca text,
  alunos             jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
with base as (
  select ae.*, u.nome as unidade_nome
  from aulas_emusys ae
  join unidades u on u.id = ae.unidade_id
  where ae.data_aula = p_data
    and (p_unidade_id is null or ae.unidade_id = p_unidade_id)
),
-- Alunos da aula: presenca batida (passado) tem prioridade sobre o vinculo
-- da grade (futuro), para nao perder o status_presenca.
vinculos as (
  select distinct on (x.aula_emusys_id, coalesce(x.aluno_id::text, x.nome))
    x.aula_emusys_id, x.aluno_id, x.nome, x.status_presenca
  from (
    select ap.aula_emusys_id,
           ap.aluno_id,
           coalesce(al.nome, '(aluno removido)') as nome,
           ap.status_presenca::text as status_presenca,
           1 as prioridade
    from aluno_presenca ap
    join base b on b.id = ap.aula_emusys_id
    left join alunos al on al.id = ap.aluno_id
    union all
    select aa.aula_emusys_id,
           aa.aluno_id,
           aa.nome,
           null::text,
           2
    from aula_alunos aa
    join base b on b.id = aa.aula_emusys_id
  ) x
  order by x.aula_emusys_id, coalesce(x.aluno_id::text, x.nome), x.prioridade
),
enriquecidos as (
  select
    v.aula_emusys_id,
    jsonb_build_object(
      'aluno_id', v.aluno_id,
      'nome', v.nome,
      'idade', case
        when al.data_nascimento is null then null
        else extract(year from age(al.data_nascimento))::int
      end,
      'responsavel_nome', al.responsavel_nome,
      'responsavel_telefone', al.responsavel_telefone,
      'status_presenca', v.status_presenca,
      'risco_pct', case
        when r.probabilidade is null then null
        else round((r.probabilidade * 100)::numeric)::int
      end,
      'inadimplente', coalesce(inad.tem, false),
      'nota_pesquisa', pesq.nota,
      'data_ultima_aula', jor.data_ultima_aula
    ) as aluno_json
  from vinculos v
  left join alunos al on al.id = v.aluno_id
  left join vw_risco_evasao_atual r on r.aluno_id = v.aluno_id
  left join vw_jornada_aluno_atual jor on jor.aluno_id = v.aluno_id
  left join lateral (
    select true as tem
    from aluno_jornada_matricula_disciplina j
    where j.aluno_id = v.aluno_id
      and j.inadimplente_emusys is true
    limit 1
  ) inad on true
  left join lateral (
    select p.nota
    from pesquisas_whatsapp p
    where p.aluno_id = v.aluno_id
      and p.tipo = 'pos_primeira_aula'
      and p.nota is not null
    order by p.created_at desc
    limit 1
  ) pesq on true
),
agrupado as (
  select
    md5(
      b.unidade_id::text || '|' || coalesce(b.professor_nome, '') || '|' ||
      coalesce(b.sala_nome, '') || '|' || b.data_hora_inicio::text || '|' ||
      coalesce(b.duracao_minutos, 0)::text || '|' || coalesce(b.curso_nome, '') || '|' ||
      coalesce(b.turma_nome, '') || '|' || b.cancelada::text
    ) as chave,
    b.unidade_id,
    b.unidade_nome,
    b.professor_nome,
    b.sala_nome,
    b.curso_nome,
    b.turma_nome,
    b.data_hora_inicio,
    b.duracao_minutos,
    b.cancelada,
    min(b.professor_id)     as professor_id,
    min(b.categoria)        as categoria,
    min(b.tipo)             as tipo,
    bool_or(b.justificada)  as justificada,
    bool_or(b.reagendada)   as reagendada,
    min(b.data_hora_inicio_original) as data_hora_inicio_original,
    -- nr_da_aula so faz sentido quando o card representa um aluno so;
    -- numa turma cada aluno esta num numero diferente do proprio contrato.
    case when count(distinct b.id) = 1 then min(b.nr_da_aula) else null end as nr_da_aula,
    greatest(
      coalesce(max(b.qtd_alunos), 0),
      count(distinct e.aluno_json) filter (where e.aluno_json is not null)::int
    ) as qtd_alunos,
    max(b.anotacoes)        as anotacoes,
    max(b.professor_presenca) as professor_presenca,
    coalesce(
      jsonb_agg(distinct e.aluno_json) filter (where e.aluno_json is not null),
      '[]'::jsonb
    ) as alunos
  from base b
  left join enriquecidos e on e.aula_emusys_id = b.id
  group by
    b.unidade_id, b.unidade_nome, b.professor_nome, b.sala_nome,
    b.curso_nome, b.turma_nome, b.data_hora_inicio, b.duracao_minutos, b.cancelada
)
select
  a.chave,
  a.unidade_id,
  a.unidade_nome,
  a.professor_nome,
  a.professor_id,
  a.sala_nome,
  a.curso_nome,
  a.turma_nome,
  to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI') as hora_inicio,
  to_char(
    (a.data_hora_inicio at time zone 'America/Sao_Paulo')
      + make_interval(mins => coalesce(a.duracao_minutos, 0)),
    'HH24:MI'
  ) as hora_fim,
  a.duracao_minutos,
  a.categoria,
  a.tipo,
  a.cancelada,
  a.justificada,
  a.reagendada,
  case
    when a.reagendada and a.data_hora_inicio_original is not null
      then to_char(a.data_hora_inicio_original at time zone 'America/Sao_Paulo', 'DD/MM/YY "as" HH24:MI')
    else null
  end as hora_original,
  a.nr_da_aula,
  a.qtd_alunos,
  a.anotacoes,
  a.professor_presenca,
  a.alunos
from agrupado a
order by a.professor_nome nulls last, a.data_hora_inicio, a.sala_nome;
$$;

comment on function public.get_agenda_dia(date, uuid) is
  'Agenda de um dia ja agrupada por (professor, sala, horario, curso, turma, cancelada). '
  'Necessario porque aulas_emusys guarda uma linha por aluno em aulas de turma. '
  'p_unidade_id null = todas as unidades visiveis pelo RLS.';

grant execute on function public.get_agenda_dia(date, uuid) to authenticated;
```

- [ ] **Step 2: Verificar o agrupamento contra o caso real**

Via MCP `execute_sql` — a turma da Lohana que hoje são 5 linhas:

```sql
select hora_inicio, professor_nome, sala_nome, turma_nome, qtd_alunos,
       jsonb_array_length(alunos) as alunos_vinculados
from get_agenda_dia('2026-08-04', '95553e96-971b-4590-a6eb-0201d013c14d')
where professor_nome = 'Lohana Leopoldo de Araújo' and hora_inicio = '18:00';
```

Expected: **exatamente 1 linha** (turma `C_Ter_18`, sala Palavra Cantada). Antes da Task 6 rodar, `alunos_vinculados` será `0` — é o esperado, o vínculo ainda não foi populado.

Conferir também que o total de cards caiu em relação às linhas cruas:

```sql
select
  (select count(*) from aulas_emusys
     where data_aula = '2026-08-04'
       and unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d') as linhas_cruas,
  (select count(*) from get_agenda_dia('2026-08-04', '95553e96-971b-4590-a6eb-0201d013c14d')) as cards;
```

Expected: `linhas_cruas = 136` e `cards` **menor** que 136.

- [ ] **Step 3: Verificar a duplicação `turma` + `individual`**

O Emusys devolve o mesmo slot duas vezes, uma como `tipo=turma` e outra como `tipo=individual`. Caso real: Isaque, 04/08 às 10:00, turma `T_Ter_10`, sala Elton John — 2 linhas cruas.

```sql
select
  (select count(*) from aulas_emusys
     where data_aula='2026-08-04'
       and unidade_id='95553e96-971b-4590-a6eb-0201d013c14d'
       and professor_nome='Isaque Mendes da Silva'
       and turma_nome='T_Ter_10') as linhas_cruas,
  (select count(*) from get_agenda_dia('2026-08-04','95553e96-971b-4590-a6eb-0201d013c14d')
     where professor_nome='Isaque Mendes da Silva' and turma_nome='T_Ter_10') as cards;
```

Expected: `linhas_cruas = 2` e `cards = 1`.

Conferir também que aula cancelada **não** se funde com a viva no mesmo slot (Marcos, 04/08 às 14:00, `B_Ter_14`: duas vivas e uma cancelada):

```sql
select cancelada, count(*)
from get_agenda_dia('2026-08-04','95553e96-971b-4590-a6eb-0201d013c14d')
where professor_nome='Marcos Serafim' and hora_inicio='14:00'
group by cancelada;
```

Expected: 2 linhas — uma com `cancelada = false` e outra com `cancelada = true`.

- [ ] **Step 4: Verificar que um dia passado traz aluno e presença**

```sql
select hora_inicio, professor_nome, jsonb_array_length(alunos) as n,
       alunos -> 0 ->> 'nome' as primeiro_aluno,
       alunos -> 0 ->> 'status_presenca' as presenca
from get_agenda_dia('2026-07-15', '95553e96-971b-4590-a6eb-0201d013c14d')
where jsonb_array_length(alunos) > 0
limit 5;
```

Expected: pelo menos 1 linha, com `primeiro_aluno` preenchido — prova que o passado funciona via `aluno_presenca`, antes mesmo do sync novo.

- [ ] **Step 5: Commit do arquivo de migration**

Salvar o SQL em `supabase/migrations/20260801121000_criar_get_agenda_dia.sql`.

```bash
git add supabase/migrations/20260801121000_criar_get_agenda_dia.sql
git commit -m "feat(agenda): RPC get_agenda_dia agrupando linha-por-aluno em card unico"
```

---

### Task 5: Helper compartilhado dos vínculos aula↔aluno

As duas edges (`sync-grade-futura-emusys` e `sync-presenca-emusys`) precisam da mesma lógica: transformar o `alunos[]` da resposta do Emusys em linhas de `aula_alunos` e gravá-las em lotes. O repo já concentra helpers de aulas do Emusys em `supabase/functions/_shared/emusys-aulas.ts`, com teste ao lado — é ali que isso mora, não duplicado nas duas edges.

**Files:**
- Modify: `supabase/functions/_shared/emusys-aulas.ts`
- Test: `supabase/functions/_shared/emusys-aulas.test.ts`

**Interfaces:**
- Consumes: nada (função pura + uma função de gravação que recebe o client Supabase por parâmetro).
- Produces:
  - `export interface AlunoNaAulaEmusys { id_aluno: number | null; id_lead: number | null; nome_aluno: string; telefone_aluno: string | null }`
  - `export interface VinculoAulaAluno { aula_emusys_id: number; unidade_id: string; emusys_aluno_id: number | null; lead_id: number | null; nome: string; telefone: string | null }`
  - `export function montarVinculosAulaAlunos(aulas, idPorEmusysId, unidadeId): VinculoAulaAluno[]` — pura, testável.
  - `export async function gravarVinculosAulaAlunos(supabase, vinculos, tamanhoLote?): Promise<{ gravados: number; erros: string[] }>`

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar ao final de `supabase/functions/_shared/emusys-aulas.test.ts` (seguir o estilo de asserção já usado no arquivo; se ele usa `node:assert/strict`, manter):

```ts
import { montarVinculosAulaAlunos } from './emusys-aulas.ts';

const UNIDADE = '95553e96-971b-4590-a6eb-0201d013c14d';
const mapa = new Map<number, number>([[900, 1], [901, 2]]);

// Aula individual com 1 aluno.
const individual = montarVinculosAulaAlunos(
  [{ id: 900, alunos: [{ id_aluno: 55, id_lead: 0, nome_aluno: 'Hugo Penedo Amorim', telefone_aluno: '(21) 99914-3430' }] }],
  mapa,
  UNIDADE,
);
assert.equal(individual.length, 1, 'aula individual gera 1 vinculo');
assert.equal(individual[0].aula_emusys_id, 1, 'usa o id interno, nao o emusys_id');
assert.equal(individual[0].emusys_aluno_id, 55);
assert.equal(individual[0].lead_id, null, 'id_lead 0 vira null');

// Aula de turma: 1 vinculo por aluno.
const turma = montarVinculosAulaAlunos(
  [{ id: 901, alunos: [
    { id_aluno: 1, id_lead: 0, nome_aluno: 'Daniel Cardoso', telefone_aluno: null },
    { id_aluno: 2, id_lead: 0, nome_aluno: 'Guilherme Varjao', telefone_aluno: null },
  ] }],
  mapa,
  UNIDADE,
);
assert.equal(turma.length, 2, 'turma com 2 alunos gera 2 vinculos');

// Experimental: aluno ainda e lead, id_aluno null.
const experimental = montarVinculosAulaAlunos(
  [{ id: 900, alunos: [{ id_aluno: null, id_lead: 987, nome_aluno: 'Lead Novo', telefone_aluno: '(21) 97777-6666' }] }],
  mapa,
  UNIDADE,
);
assert.equal(experimental[0].emusys_aluno_id, null, 'experimental nao tem emusys_aluno_id');
assert.equal(experimental[0].lead_id, 987, 'experimental carrega o lead_id');

// Aula que nao esta no mapa (nao foi gravada) e ignorada, sem quebrar.
const foraDoMapa = montarVinculosAulaAlunos(
  [{ id: 999, alunos: [{ id_aluno: 1, id_lead: 0, nome_aluno: 'Fantasma', telefone_aluno: null }] }],
  mapa,
  UNIDADE,
);
assert.deepEqual(foraDoMapa, [], 'aula fora do mapa nao gera vinculo');

// Aluno sem nome e descartado: nome e a chave do upsert.
const semNome = montarVinculosAulaAlunos(
  [{ id: 900, alunos: [{ id_aluno: 1, id_lead: 0, nome_aluno: '', telefone_aluno: null }] }],
  mapa,
  UNIDADE,
);
assert.deepEqual(semNome, [], 'aluno sem nome nao gera vinculo');

// Aula sem a chave alunos nao quebra.
assert.deepEqual(
  montarVinculosAulaAlunos([{ id: 900 }], mapa, UNIDADE),
  [],
  'aula sem alunos[] nao quebra',
);

console.log('vinculos aula-aluno: OK');
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `deno test --allow-net supabase/functions/_shared/emusys-aulas.test.ts` (os testes de `_shared/` rodam com Deno, NAO com tsx — os imports `jsr:` quebram no tsx)
Expected: FAIL — `montarVinculosAulaAlunos is not a function` (ou export não encontrado).

Se o arquivo de teste usar o runner do Deno em vez de `tsx`, usar o comando que o arquivo já pressupõe — conferir o topo do arquivo antes.

- [ ] **Step 3: Implementar**

Acrescentar ao final de `supabase/functions/_shared/emusys-aulas.ts`:

```ts
export interface AlunoNaAulaEmusys {
  id_aluno: number | null;
  id_lead: number | null;
  nome_aluno: string;
  telefone_aluno: string | null;
}

export interface VinculoAulaAluno {
  aula_emusys_id: number;
  unidade_id: string;
  emusys_aluno_id: number | null;
  lead_id: number | null;
  nome: string;
  telefone: string | null;
}

/**
 * Transforma o alunos[] que o GET /aulas ja devolve em linhas de aula_alunos.
 * Sem isso a grade futura sabe curso/turma/sala mas nao sabe de quem e a aula.
 * `idPorEmusysId` mapeia o id do Emusys para o id interno de aulas_emusys.
 */
export function montarVinculosAulaAlunos(
  aulas: Array<{ id: number; alunos?: AlunoNaAulaEmusys[] }>,
  idPorEmusysId: Map<number, number>,
  unidadeId: string,
): VinculoAulaAluno[] {
  const vinculos: VinculoAulaAluno[] = [];

  for (const aula of aulas) {
    const aulaId = idPorEmusysId.get(aula.id);
    if (!aulaId) continue;

    for (const aluno of aula.alunos || []) {
      // nome e a chave do upsert (aula_emusys_id, nome): sem nome, sem linha.
      if (!aluno.nome_aluno) continue;
      vinculos.push({
        aula_emusys_id: aulaId,
        unidade_id: unidadeId,
        emusys_aluno_id: aluno.id_aluno || null,
        lead_id: aluno.id_lead || null,
        nome: aluno.nome_aluno,
        telefone: aluno.telefone_aluno || null,
      });
    }
  }

  return vinculos;
}

/** Grava os vinculos em lotes. Idempotente pelo unique (aula_emusys_id, nome). */
export async function gravarVinculosAulaAlunos(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  vinculos: VinculoAulaAluno[],
  tamanhoLote = 500,
): Promise<{ gravados: number; erros: string[] }> {
  const erros: string[] = [];
  let gravados = 0;
  const agora = new Date().toISOString();

  for (let offset = 0; offset < vinculos.length; offset += tamanhoLote) {
    const lote = vinculos
      .slice(offset, offset + tamanhoLote)
      .map((v) => ({ ...v, updated_at: agora }));

    const { error } = await supabase
      .from('aula_alunos')
      .upsert(lote, { onConflict: 'aula_emusys_id,nome', ignoreDuplicates: false });

    if (error) erros.push(error.message);
    else gravados += lote.length;
  }

  return { gravados, erros };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `deno test --allow-net supabase/functions/_shared/emusys-aulas.test.ts` (os testes de `_shared/` rodam com Deno, NAO com tsx — os imports `jsr:` quebram no tsx)
Expected: PASS — imprime `vinculos aula-aluno: OK`, exit 0. Os testes que já existiam no arquivo continuam passando.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/emusys-aulas.ts supabase/functions/_shared/emusys-aulas.test.ts
git commit -m "feat(agenda): helper compartilhado dos vinculos aula-aluno"
```

---

### Task 6: `sync-grade-futura-emusys` grava `aula_alunos`

A resposta do `GET /aulas` já traz `alunos[]`; hoje o sync só conta em `qtd_alunos` e descarta o resto.

**Files:**
- Modify: `supabase/functions/sync-grade-futura-emusys/index.ts`

**Interfaces:**
- Consumes: tabela `aula_alunos` (Task 3); `montarVinculosAulaAlunos`, `gravarVinculosAulaAlunos`, `AlunoNaAulaEmusys` de `../_shared/emusys-aulas.ts` (Task 5).
- Produces: linhas em `aula_alunos` para as aulas da janela sincronizada.

- [ ] **Step 1: Ler o código realmente deployado**

Via MCP `get_edge_function`, slug `sync-grade-futura-emusys`. Comparar com `supabase/functions/sync-grade-futura-emusys/index.ts` no git. **Se divergirem, partir do deployado** e avisar antes de seguir — git não é prova do que está em produção.

- [ ] **Step 2: Ampliar a interface do aluno na resposta**

Em `supabase/functions/sync-grade-futura-emusys/index.ts`, acrescentar o import do helper junto aos outros de `../_shared/`:

```ts
import {
  montarVinculosAulaAlunos,
  gravarVinculosAulaAlunos,
  type AlunoNaAulaEmusys,
} from '../_shared/emusys-aulas.ts';
```

E na interface `AulaEmusys`, trocar o campo `alunos` para reusar o tipo do helper:

```ts
  alunos: AlunoNaAulaEmusys[];
```

- [ ] **Step 3: Gravar os vínculos após o upsert das aulas**

Depois do laço que faz `upsert` em `aulas_emusys` (o bloco que incrementa `gravadas`) e **antes** do bloco que busca `existentesFuturas`, inserir:

```ts
      // Persiste o alunos[] que a resposta ja traz. Sem isso a grade futura
      // sabe curso/turma/sala mas nao sabe de quem e a aula.
      const { data: aulasGravadas } = await supabase
        .from('aulas_emusys')
        .select('id, emusys_id')
        .eq('unidade_id', unidade.id)
        .gte('data_aula', hoje)
        .lte('data_aula', dataFim);

      const idPorEmusysId = new Map<number, number>();
      for (const linha of aulasGravadas || []) {
        idPorEmusysId.set(linha.emusys_id as number, linha.id as number);
      }

      const vinculos = montarVinculosAulaAlunos(aulas, idPorEmusysId, unidade.id);
      const resultado = await gravarVinculosAulaAlunos(supabase, vinculos, chunkSize);
      for (const erro of resultado.erros) {
        console.error(`[sync-grade-futura] upsert aula_alunos (${unidade.nome}): ${erro}`);
      }
      console.log(
        `[sync-grade-futura] ${unidade.nome}: ${resultado.gravados} vinculos aluno-aula`,
      );
```

Nota: `aluno_id` não é preenchido aqui. O casamento `emusys_aluno_id` → `alunos.id` é feito na Task 7, num passo único que serve aos dois syncs.

- [ ] **Step 4: Validar sintaxe e deployar**

Run: `node --check supabase/functions/sync-grade-futura-emusys/index.ts` — se acusar erro por ser TypeScript, pular e confiar na validação do deploy.

Deployar via MCP `deploy_edge_function`, slug `sync-grade-futura-emusys`.

- [ ] **Step 5: Executar uma vez e conferir**

Invocar a função para uma unidade (Recreio) e depois:

```sql
select count(*) as vinculos,
       count(*) filter (where aluno_id is not null) as com_aluno_id,
       count(distinct aula_emusys_id) as aulas_cobertas
from aula_alunos
where unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d';
```

Expected: `vinculos > 0`, `aulas_cobertas > 0`, `com_aluno_id = 0` (o casamento vem na Task 7).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/sync-grade-futura-emusys/index.ts
git commit -m "feat(agenda): grade futura passa a gravar o vinculo aluno-aula"
```

---

### Task 7: Casar `emusys_aluno_id` com `alunos.id` e cobrir o sync de 15 min

Sem o `aluno_id`, o enriquecimento (risco, inadimplência, pesquisa) não acha o aluno.

**Files:**
- Create: migration `casar_aula_alunos_aluno_id` (trigger + backfill)
- Modify: `supabase/functions/sync-presenca-emusys/index.ts`

**Interfaces:**
- Consumes: `aula_alunos` (Task 3); `alunos.emusys_student_id`, `alunos.curso_id`, `alunos.is_segundo_curso`, `alunos.status`; `cursos.emusys_ids` (`int4[]`); `aulas_emusys.curso_emusys_id`.
- Produces: trigger `trg_aula_alunos_casar_aluno` que preenche `aula_alunos.aluno_id` no insert/update.

**Cuidado de domínio — `alunos` são matrículas, não pessoas.** A mesma pessoa com 2 cursos tem 2 linhas com o **mesmo** `emusys_student_id` (medido: 1.105 linhas ativas para 886 IDs distintos). Um casamento com `limit 1` sem critério pegaria a matrícula do curso errado, e o risco/inadimplência exibidos no card seriam de outro curso. Por isso o desempate abaixo prioriza a matrícula **do curso daquela aula**.

- [ ] **Step 1: Criar o trigger de casamento**

Via MCP `apply_migration`, nome `casar_aula_alunos_aluno_id`:

```sql
create or replace function public.fn_aula_alunos_casar_aluno()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curso_emusys_id integer;
begin
  if new.aluno_id is not null or new.emusys_aluno_id is null then
    return new;
  end if;

  select ae.curso_emusys_id into v_curso_emusys_id
  from aulas_emusys ae
  where ae.id = new.aula_emusys_id;

  -- Desempate entre as matriculas da mesma pessoa:
  -- 1) a do curso desta aula, 2) matricula viva, 3) o curso principal.
  select a.id into new.aluno_id
  from alunos a
  left join cursos c on c.id = a.curso_id
  where a.emusys_student_id = new.emusys_aluno_id
    and a.unidade_id = new.unidade_id
  order by
    (v_curso_emusys_id is not null and c.emusys_ids @> array[v_curso_emusys_id]) desc,
    (a.status = 'ativo') desc,
    coalesce(a.is_segundo_curso, false) asc,
    a.id
  limit 1;

  return new;
end;
$$;

create trigger trg_aula_alunos_casar_aluno
  before insert or update on public.aula_alunos
  for each row execute function public.fn_aula_alunos_casar_aluno();

-- Backfill do que a Task 6 ja gravou sem aluno_id: um update vazio
-- dispara o trigger e aplica o mesmo criterio de desempate.
update public.aula_alunos
set updated_at = now()
where aluno_id is null and emusys_aluno_id is not null;
```

- [ ] **Step 2: Verificar a taxa de casamento**

```sql
select count(*) total,
       count(aluno_id) casados,
       round(100.0 * count(aluno_id) / nullif(count(*), 0), 1) as pct
from aula_alunos;
```

Expected: `pct` acima de 80. Referência: `emusys_student_id` está preenchido em 93,4% dos alunos ativos, então o teto realista é ~93%. Bem abaixo disso, **parar e investigar** — provavelmente o `id_aluno` da API não corresponde a `emusys_student_id`.

Conferir também que aluno multi-curso casou com o curso certo:

```sql
select aa.nome, ae.curso_nome as curso_da_aula, c.nome as curso_da_matricula
from aula_alunos aa
join aulas_emusys ae on ae.id = aa.aula_emusys_id
join alunos a on a.id = aa.aluno_id
left join cursos c on c.id = a.curso_id
where aa.emusys_aluno_id in (
  select emusys_student_id from alunos
  where emusys_student_id is not null
  group by emusys_student_id having count(*) > 1
)
limit 10;
```

Expected: `curso_da_aula` e `curso_da_matricula` coincidem na maioria das linhas.

- [ ] **Step 3: Replicar a gravação no sync de 15 min**

Em `supabase/functions/sync-presenca-emusys/index.ts`, na função `sincronizarMetadadosAulas`, após o upsert das aulas, gravar `aula_alunos` usando **o mesmo helper da Task 5** — nada de duplicar a lógica. O arquivo já importa de `../_shared/emusys-aulas.ts`; acrescentar `montarVinculosAulaAlunos` e `gravarVinculosAulaAlunos` a esse import existente.

```ts
      const { data: aulasGravadas } = await supabase
        .from('aulas_emusys')
        .select('id, emusys_id')
        .eq('unidade_id', unidade.id)
        .gte('data_aula', dataInicio)
        .lte('data_aula', dataFim);

      const idPorEmusysId = new Map<number, number>();
      for (const linha of aulasGravadas || []) {
        idPorEmusysId.set(linha.emusys_id as number, linha.id as number);
      }

      const vinculos = montarVinculosAulaAlunos(aulas, idPorEmusysId, unidade.id);
      const resultado = await gravarVinculosAulaAlunos(supabase, vinculos);
      for (const erro of resultado.erros) {
        console.error(`[sync-presenca] upsert aula_alunos (${unidade.nome}): ${erro}`);
      }
```

Antes de editar, ler o deployado via MCP `get_edge_function` (slug `sync-presenca-emusys`) e conferir o nome real do tipo de aluno na interface local — se o tipo não tiver `id_aluno`/`telefone_aluno`, ampliá-lo como na Task 6 Step 2.

- [ ] **Step 4: Deployar e confirmar idempotência**

Deployar via MCP `deploy_edge_function`. Invocar duas vezes seguidas para a mesma data e conferir que não duplica:

```sql
select aula_emusys_id, nome, count(*)
from aula_alunos
group by 1, 2
having count(*) > 1
limit 5;
```

Expected: **zero linhas**.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260801122000_casar_aula_alunos_aluno_id.sql supabase/functions/sync-presenca-emusys/index.ts
git commit -m "feat(agenda): casa vinculo com aluno_id e cobre o sync de 15 min"
```

---

### Task 8: Hook `useAgendaDia`

**Files:**
- Create: `src/hooks/useAgendaDia.ts`

**Interfaces:**
- Consumes: `supabase` de `@/lib/supabase`; `formatarFrescor` de `@/lib/agenda`.
- Produces: `type AlunoAgenda`, `type AulaAgenda`, `useAgendaDia({ data, unidadeId }): { aulas: AulaAgenda[]; carregando: boolean; erro: string | null; frescor: string; recarregar: () => void }`.

- [ ] **Step 1: Implementar o hook**

```ts
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatarFrescor } from '@/lib/agenda';

export interface AlunoAgenda {
  // integer no banco (alunos.id), nao uuid. Null quando o participante e lead.
  aluno_id: number | null;
  nome: string;
  idade: number | null;
  responsavel_nome: string | null;
  responsavel_telefone: string | null;
  status_presenca: string | null;
  risco_pct: number | null;
  inadimplente: boolean;
  nota_pesquisa: number | null;
  data_ultima_aula: string | null;
}

export interface AulaAgenda {
  chave: string;
  unidade_id: string;
  unidade_nome: string;
  professor_nome: string | null;
  professor_id: number | null;
  sala_nome: string | null;
  curso_nome: string | null;
  turma_nome: string | null;
  hora_inicio: string;
  hora_fim: string;
  duracao_minutos: number;
  categoria: string | null;
  tipo: string | null;
  cancelada: boolean;
  justificada: boolean;
  reagendada: boolean;
  hora_original: string | null;
  nr_da_aula: number | null;
  qtd_alunos: number;
  anotacoes: string | null;
  professor_presenca: string | null;
  alunos: AlunoAgenda[];
}

interface Params {
  data: string;
  unidadeId: string | null;
}

export function useAgendaDia({ data, unidadeId }: Params) {
  const [aulas, setAulas] = useState<AulaAgenda[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [frescor, setFrescor] = useState('sem dado de sincronizacao');

  const buscar = useCallback(async () => {
    setCarregando(true);
    setErro(null);

    const { data: linhas, error } = await supabase.rpc('get_agenda_dia', {
      p_data: data,
      p_unidade_id: unidadeId,
    });

    if (error) {
      setErro(error.message);
      setAulas([]);
      setCarregando(false);
      return;
    }

    setAulas((linhas || []) as AulaAgenda[]);

    // Frescor: ultima linha inserida em aulas_emusys para o escopo atual.
    let q = supabase
      .from('aulas_emusys')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1);
    if (unidadeId) q = q.eq('unidade_id', unidadeId);
    const { data: ultima } = await q;

    setFrescor(formatarFrescor(ultima?.[0]?.created_at ?? null, new Date()));
    setCarregando(false);
  }, [data, unidadeId]);

  useEffect(() => {
    buscar();
  }, [buscar]);

  return { aulas, carregando, erro, frescor, recarregar: buscar };
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erro apontando para `src/hooks/useAgendaDia.ts`. (Erros preexistentes em outros arquivos não bloqueiam — comparar com a saída antes da mudança se houver dúvida.)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useAgendaDia.ts
git commit -m "feat(agenda): hook useAgendaDia"
```

---

### Task 9: `AgendaCard` e `AgendaTimeline`

**Files:**
- Create: `src/components/App/Agenda/AgendaCard.tsx`
- Create: `src/components/App/Agenda/AgendaTimeline.tsx`

**Interfaces:**
- Consumes: `AulaAgenda` de `@/hooks/useAgendaDia`; `alocarFaixas`, `contarFaixas`, `posicaoPx`, `larguraPx`, `minutosAgora`, `dentroDoExpediente`, `AGENDA_HORA_INICIO`, `AGENDA_HORA_FIM`, `AGENDA_LARGURA_HORA_PX`, `AGENDA_ALTURA_FAIXA_PX`, `AGENDA_GAP_FAIXA_PX` de `@/lib/agenda`.
- Produces: `<AgendaCard aula selecionada onSelecionar />`, `<AgendaTimeline aulas agruparPor selecionada onSelecionar />` onde `agruparPor` é `'professor' | 'sala'`.

- [ ] **Step 1: Implementar `AgendaCard`**

Estados visuais, nesta ordem de precedência: experimental → cancelada → reagendada → sem aluno vinculado → normal.

```tsx
import { cn } from '@/lib/utils';
import type { AulaAgenda } from '@/hooks/useAgendaDia';

interface Props {
  aula: AulaAgenda;
  selecionada: boolean;
  estilo: React.CSSProperties;
  onSelecionar: (aula: AulaAgenda) => void;
}

function primeiroENome(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return partes.length > 1 ? `${partes[0]} ${partes[1]}` : partes[0];
}

export function AgendaCard({ aula, selecionada, estilo, onSelecionar }: Props) {
  const experimental = aula.categoria === 'experimental';
  const semAluno = aula.alunos.length === 0 && !aula.cancelada;

  let titulo: string;
  if (experimental) titulo = 'Experimental';
  else if (aula.alunos.length === 1) titulo = primeiroENome(aula.alunos[0].nome);
  else if (aula.alunos.length > 1) {
    titulo = `${primeiroENome(aula.alunos[0].nome)} +${aula.alunos.length - 1}`;
  } else titulo = aula.turma_nome || aula.curso_nome || 'Aula';

  const subtitulo = aula.nr_da_aula
    ? `${aula.sala_nome ?? 'sem sala'} · aula ${aula.nr_da_aula}`
    : `${aula.sala_nome ?? 'sem sala'}${aula.qtd_alunos ? ` · ${aula.qtd_alunos} alunos` : ''}`;

  const risco = Math.max(0, ...aula.alunos.map((a) => a.risco_pct ?? 0));

  return (
    <button
      type="button"
      style={estilo}
      onClick={() => onSelecionar(aula)}
      aria-current={selecionada}
      title={`${aula.hora_inicio}–${aula.hora_fim} · ${aula.curso_nome ?? ''}`}
      className={cn(
        'absolute flex items-center gap-1.5 overflow-hidden rounded-md border border-l-[3px] px-2 text-left',
        'border-slate-700 bg-slate-800 hover:border-slate-500',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500',
        !experimental && !aula.cancelada && !aula.reagendada && !semAluno && 'border-l-emerald-500',
        experimental && 'border-l-violet-400 bg-violet-500/15',
        aula.cancelada && 'border-l-rose-400 bg-rose-500/10 opacity-70',
        aula.reagendada && !aula.cancelada && 'border-l-amber-400 bg-amber-500/15',
        semAluno && !experimental && !aula.reagendada && 'border-l-slate-500',
        selecionada && 'ring-1 ring-emerald-500',
      )}
    >
      <span className="min-w-0 flex-1 leading-tight">
        <span
          className={cn(
            'block truncate text-xs font-semibold',
            aula.cancelada && 'line-through',
            semAluno && !experimental && 'italic font-medium text-slate-300',
          )}
        >
          {titulo}
        </span>
        <span className="block truncate text-[10.5px] text-slate-400">{subtitulo}</span>
      </span>

      {experimental && <Marca cor="bg-violet-400 text-violet-950" texto="E" />}
      {!experimental && aula.cancelada && <Marca cor="bg-rose-400 text-rose-950" texto="✕" />}
      {!experimental && !aula.cancelada && aula.reagendada && (
        <Marca cor="bg-amber-400 text-amber-950" texto="R" />
      )}
      {!experimental && !aula.cancelada && !aula.reagendada && risco >= 40 && (
        <Marca cor="bg-rose-400 text-rose-950" texto="!" />
      )}
    </button>
  );
}

function Marca({ cor, texto }: { cor: string; texto: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('grid h-[15px] w-[15px] shrink-0 place-items-center rounded text-[9px] font-extrabold', cor)}
    >
      {texto}
    </span>
  );
}
```

- [ ] **Step 2: Implementar `AgendaTimeline`**

```tsx
import { useEffect, useState } from 'react';
import {
  AGENDA_ALTURA_FAIXA_PX,
  AGENDA_GAP_FAIXA_PX,
  AGENDA_HORA_FIM,
  AGENDA_HORA_INICIO,
  AGENDA_LARGURA_HORA_PX,
  alocarFaixas,
  contarFaixas,
  dentroDoExpediente,
  larguraPx,
  minutosAgora,
  posicaoPx,
} from '@/lib/agenda';
import type { AulaAgenda } from '@/hooks/useAgendaDia';
import { AgendaCard } from './AgendaCard';

const PADDING_TRILHO = 7;
const LARGURA_ROTULO = 150;

interface Props {
  aulas: AulaAgenda[];
  agruparPor: 'professor' | 'sala';
  selecionada: AulaAgenda | null;
  onSelecionar: (aula: AulaAgenda) => void;
}

export function AgendaTimeline({ aulas, agruparPor, selecionada, onSelecionar }: Props) {
  const [minutos, setMinutos] = useState(() => minutosAgora(new Date()));

  useEffect(() => {
    const id = setInterval(() => setMinutos(minutosAgora(new Date())), 30000);
    return () => clearInterval(id);
  }, []);

  const horas = Array.from(
    { length: AGENDA_HORA_FIM - AGENDA_HORA_INICIO },
    (_, i) => AGENDA_HORA_INICIO + i,
  );

  const grupos = new Map<string, AulaAgenda[]>();
  for (const aula of aulas) {
    const chave =
      (agruparPor === 'professor' ? aula.professor_nome : aula.sala_nome) ?? 'Sem alocação';
    const lista = grupos.get(chave);
    if (lista) lista.push(aula);
    else grupos.set(chave, [aula]);
  }

  const reguaVisivel = dentroDoExpediente(minutos);
  const horaAgora = `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;

  return (
    <div className="relative overflow-x-auto">
      <div style={{ minWidth: LARGURA_ROTULO + horas.length * AGENDA_LARGURA_HORA_PX }} className="relative">
        <div
          className="sticky top-0 z-10 grid border-b border-slate-700 bg-slate-800/95"
          style={{
            gridTemplateColumns: `${LARGURA_ROTULO}px repeat(${horas.length}, ${AGENDA_LARGURA_HORA_PX}px)`,
          }}
        >
          <div className="border-r border-slate-700 px-3.5 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
            {agruparPor === 'professor' ? 'Professor' : 'Sala'}
          </div>
          {horas.map((h) => (
            <div key={h} className="border-l border-slate-800 py-1.5 pl-2 text-[11.5px] tabular-nums text-slate-400">
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {[...grupos.entries()].map(([nome, doGrupo]) => {
          const comFaixa = alocarFaixas(doGrupo);
          const nFaixas = contarFaixas(comFaixa);
          const altura =
            PADDING_TRILHO * 2 + nFaixas * AGENDA_ALTURA_FAIXA_PX + (nFaixas - 1) * AGENDA_GAP_FAIXA_PX;

          return (
            <div
              key={nome}
              className="grid border-b border-slate-800"
              style={{ gridTemplateColumns: `${LARGURA_ROTULO}px 1fr` }}
            >
              <div className="flex flex-col justify-center border-r border-slate-700 px-3.5 py-2.5">
                <span className="truncate text-[13px] font-semibold">{nome}</span>
                <span className="text-[11px] text-slate-400">
                  {doGrupo.filter((a) => !a.cancelada).length} aulas
                </span>
              </div>
              <div className="relative" style={{ height: Math.max(52, altura) }}>
                {comFaixa.map((aula) => (
                  <AgendaCard
                    key={aula.chave}
                    aula={aula}
                    selecionada={selecionada?.chave === aula.chave}
                    onSelecionar={onSelecionar}
                    estilo={{
                      left: posicaoPx(aula.hora_inicio),
                      width: Math.max(46, larguraPx(aula.duracao_minutos) - 4),
                      top: PADDING_TRILHO + aula.faixa * (AGENDA_ALTURA_FAIXA_PX + AGENDA_GAP_FAIXA_PX),
                      height: AGENDA_ALTURA_FAIXA_PX,
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {reguaVisivel && (
          <div
            className="pointer-events-none absolute bottom-0 top-0 z-20 w-0.5 bg-red-500"
            style={{ left: LARGURA_ROTULO + posicaoPx(horaAgora) }}
          >
            <span className="absolute left-1/2 top-0 -translate-x-1/2 rounded-b bg-red-500 px-1.5 text-[10.5px] font-bold tabular-nums text-white">
              {horaAgora}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erro nos dois arquivos novos.

- [ ] **Step 4: Commit**

```bash
git add src/components/App/Agenda/AgendaCard.tsx src/components/App/Agenda/AgendaTimeline.tsx
git commit -m "feat(agenda): timeline por professor ou sala com regua do horario atual"
```

---

### Task 10: `AgendaDrawer`

**Files:**
- Create: `src/components/App/Agenda/AgendaDrawer.tsx`

**Interfaces:**
- Consumes: `AulaAgenda`, `AlunoAgenda` de `@/hooks/useAgendaDia`.
- Produces: `<AgendaDrawer aula />` — `aula` pode ser `null` (estado vazio).

- [ ] **Step 1: Implementar**

```tsx
import { cn } from '@/lib/utils';
import type { AlunoAgenda, AulaAgenda } from '@/hooks/useAgendaDia';

function corRisco(v: number): string {
  if (v >= 60) return 'text-rose-400';
  if (v >= 30) return 'text-amber-400';
  return 'text-emerald-400';
}

export function AgendaDrawer({ aula }: { aula: AulaAgenda | null }) {
  if (!aula) {
    return (
      <aside className="w-[296px] shrink-0 border-l border-slate-700 bg-slate-800/50 p-4 text-sm text-slate-400">
        Selecione uma aula na timeline para ver os detalhes.
      </aside>
    );
  }

  const aluno: AlunoAgenda | null = aula.alunos[0] ?? null;

  return (
    <aside className="flex w-[296px] shrink-0 flex-col gap-3.5 border-l border-slate-700 bg-slate-800/50 p-4">
      <div>
        <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
          {aula.hora_inicio}–{aula.hora_fim} · {aula.duracao_minutos} min
        </p>
        <h2 className="text-[17px] font-semibold leading-tight">
          {aluno ? aluno.nome : aula.turma_nome || aula.curso_nome || 'Aula'}
        </h2>
        <p className="text-xs text-slate-400">
          {[aula.curso_nome, aula.sala_nome, aula.professor_nome].filter(Boolean).join(' · ')}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {aula.categoria === 'experimental' && <Etiqueta tom="violeta">Experimental</Etiqueta>}
        {aula.cancelada && <Etiqueta tom="rosa">Cancelada</Etiqueta>}
        {aula.reagendada && <Etiqueta tom="ambar">Reagendada</Etiqueta>}
        {aula.justificada && <Etiqueta tom="neutro">Justificada</Etiqueta>}
        {aula.turma_nome && <Etiqueta tom="neutro">{aula.turma_nome}</Etiqueta>}
        {aula.nr_da_aula && <Etiqueta tom="neutro">Aula {aula.nr_da_aula}</Etiqueta>}
        {aula.alunos.length === 0 && !aula.cancelada && (
          <Etiqueta tom="neutro">Sem aluno vinculado</Etiqueta>
        )}
      </div>

      {aula.reagendada && aula.hora_original && (
        <p className="text-xs text-slate-400">Agendamento original: {aula.hora_original}</p>
      )}

      {aluno && (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
            {aluno.idade !== null && <Linha rotulo="Idade" valor={`${aluno.idade} anos`} />}
            {aluno.responsavel_nome && <Linha rotulo="Responsável" valor={aluno.responsavel_nome} />}
            {aluno.responsavel_telefone && <Linha rotulo="Contato" valor={aluno.responsavel_telefone} />}
            {aluno.status_presenca && <Linha rotulo="Presença" valor={aluno.status_presenca} />}
          </dl>

          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
            Só no LA Report
          </p>
          <div className="flex flex-col gap-1.5 text-[12.5px]">
            {aluno.risco_pct !== null && (
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Risco de evasão</span>
                <span className={cn('font-semibold tabular-nums', corRisco(aluno.risco_pct))}>
                  {aluno.risco_pct}%
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Financeiro</span>
              <span className={aluno.inadimplente ? 'text-rose-400' : 'text-emerald-400'}>
                {aluno.inadimplente ? 'Inadimplente' : 'Em dia'}
              </span>
            </div>
            {aluno.nota_pesquisa !== null && (
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Pesquisa 1ª aula</span>
                <span className={aluno.nota_pesquisa <= 2 ? 'text-rose-400' : 'text-emerald-400'}>
                  {'★'.repeat(aluno.nota_pesquisa)}
                  {'☆'.repeat(5 - aluno.nota_pesquisa)}
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {aula.alunos.length > 1 && (
        <>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
            Turma · {aula.alunos.length} alunos
          </p>
          <ul className="flex flex-col gap-1 text-[12.5px]">
            {aula.alunos.map((a) => (
              <li key={a.aluno_id ?? a.nome} className="flex items-center justify-between gap-2">
                <span className="truncate text-slate-300">{a.nome}</span>
                {a.risco_pct !== null && (
                  <span className={cn('shrink-0 font-semibold tabular-nums', corRisco(a.risco_pct))}>
                    {a.risco_pct}%
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {aula.anotacoes && (
        <>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Anotações</p>
          <p className="text-[12.5px] text-slate-300">{aula.anotacoes}</p>
        </>
      )}
    </aside>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <>
      <dt className="text-slate-400">{rotulo}</dt>
      <dd className="m-0 truncate text-right">{valor}</dd>
    </>
  );
}

function Etiqueta({ tom, children }: { tom: 'violeta' | 'rosa' | 'ambar' | 'neutro'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'rounded border px-1.5 py-0.5 text-[10.5px] font-semibold',
        tom === 'violeta' && 'border-violet-400 bg-violet-500/15 text-violet-300',
        tom === 'rosa' && 'border-rose-400 bg-rose-500/15 text-rose-300',
        tom === 'ambar' && 'border-amber-400 bg-amber-500/15 text-amber-300',
        tom === 'neutro' && 'border-slate-600 bg-slate-900 text-slate-300',
      )}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erro em `AgendaDrawer.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/App/Agenda/AgendaDrawer.tsx
git commit -m "feat(agenda): painel de detalhe com enriquecimento do LA Report"
```

---

### Task 11: `AgendaPage`, rota e menu

**Files:**
- Create: `src/components/App/Agenda/AgendaPage.tsx`
- Create: `src/components/App/Agenda/index.ts`
- Modify: `src/router.tsx`
- Modify: `src/components/App/Layout/AppSidebar.tsx`

**Interfaces:**
- Consumes: `useAgendaDia`, `AgendaTimeline`, `AgendaDrawer`, `diaIncompleto`, `contarEmAulaAgora`, `minutosAgora` de `@/lib/agenda`.
- Produces: rota `/app/agenda`; export default `AgendaPage` em `src/components/App/Agenda/index.ts`.

- [ ] **Step 1: Implementar `AgendaPage`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { useAgendaDia, type AulaAgenda } from '@/hooks/useAgendaDia';
import { contarEmAulaAgora, diaIncompleto, minutosAgora } from '@/lib/agenda';
import { AgendaTimeline } from './AgendaTimeline';
import { AgendaDrawer } from './AgendaDrawer';
import { cn } from '@/lib/utils';

export default function AgendaPage() {
  const [data, setData] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [unidadeId, setUnidadeId] = useState<string | null>(null);
  const [agruparPor, setAgruparPor] = useState<'professor' | 'sala'>('professor');
  const [selecionada, setSelecionada] = useState<AulaAgenda | null>(null);

  const { aulas, carregando, erro, frescor } = useAgendaDia({ data, unidadeId });

  // O KPI "em aula agora" precisa andar junto com a regua, nao so quando a
  // lista de aulas muda — senao congela no minuto em que a pagina abriu.
  const [minutos, setMinutos] = useState(() => minutosAgora(new Date()));
  useEffect(() => {
    const id = setInterval(() => setMinutos(minutosAgora(new Date())), 30000);
    return () => clearInterval(id);
  }, []);

  const agora = useMemo(() => contarEmAulaAgora(aulas, minutos), [aulas, minutos]);
  const canceladas = aulas.filter((a) => a.cancelada).length;
  const experimentais = aulas.filter((a) => a.categoria === 'experimental').length;
  const emRisco = aulas.filter((a) => a.alunos.some((al) => (al.risco_pct ?? 0) >= 40)).length;

  function mover(dias: number) {
    setData(format(addDays(parseISO(data), dias), 'yyyy-MM-dd'));
    setSelecionada(null);
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Agenda</h1>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => mover(-1)} aria-label="Dia anterior"
            className="h-7 w-7 rounded-md border border-slate-700 text-slate-300 hover:text-white">
            <ChevronLeft className="mx-auto h-4 w-4" />
          </button>
          <button type="button" onClick={() => mover(1)} aria-label="Próximo dia"
            className="h-7 w-7 rounded-md border border-slate-700 text-slate-300 hover:text-white">
            <ChevronRight className="mx-auto h-4 w-4" />
          </button>
          <span className="font-semibold">
            {format(parseISO(data), "EEEE, d 'de' MMMM", { locale: ptBR })}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          Sincronizado {frescor}
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <Grupo
          opcoes={[
            { valor: 'professor', rotulo: 'Professores' },
            { valor: 'sala', rotulo: 'Salas' },
          ]}
          valor={agruparPor}
          onChange={(v) => setAgruparPor(v as 'professor' | 'sala')}
        />
      </div>

      {diaIncompleto(data) && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-[13px] text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Este dia está incompleto no banco. Aulas entre 19/07 e 01/08/2026 foram perdidas por uma
            falha de sincronização e não foram recuperadas — o que aparece aqui é parcial.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-700 bg-slate-700 sm:grid-cols-5">
        <Kpi rotulo="Aulas no dia" valor={String(aulas.length)} />
        <Kpi rotulo="Em aula agora" valor={String(agora.aulas)} nota={`${agora.salas} salas`} destaque="text-emerald-400" />
        <Kpi rotulo="Canceladas" valor={String(canceladas)} destaque="text-rose-400" />
        <Kpi rotulo="Experimentais" valor={String(experimentais)} />
        <Kpi rotulo="Alunos em risco" valor={String(emRisco)} destaque="text-amber-400" />
      </div>

      {erro && (
        <p className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-[13px] text-rose-200">
          Não foi possível carregar a agenda: {erro}
        </p>
      )}

      {carregando ? (
        <p className="p-8 text-center text-sm text-slate-400">Carregando agenda…</p>
      ) : aulas.length === 0 && !diaIncompleto(data) ? (
        <p className="p-8 text-center text-sm text-slate-400">Nenhuma aula neste dia.</p>
      ) : (
        <div className="flex items-stretch overflow-hidden rounded-lg border border-slate-700">
          <div className="min-w-0 flex-1">
            <AgendaTimeline
              aulas={aulas}
              agruparPor={agruparPor}
              selecionada={selecionada}
              onSelecionar={setSelecionada}
            />
          </div>
          <AgendaDrawer aula={selecionada} />
        </div>
      )}
    </div>
  );
}

function Kpi({ rotulo, valor, nota, destaque }: {
  rotulo: string; valor: string; nota?: string; destaque?: string;
}) {
  return (
    <div className="bg-slate-900 px-4 py-2.5">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{rotulo}</p>
      <p className={cn('text-xl font-semibold tabular-nums', destaque)}>
        {valor} {nota && <span className="text-[11.5px] font-normal text-slate-400">{nota}</span>}
      </p>
    </div>
  );
}

function Grupo({ opcoes, valor, onChange }: {
  opcoes: Array<{ valor: string; rotulo: string }>;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex gap-0.5 rounded-md border border-slate-700 bg-slate-900 p-0.5">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={valor === o.valor}
          onClick={() => onChange(o.valor)}
          className={cn(
            'rounded px-3 py-1 text-[12.5px]',
            valor === o.valor ? 'bg-slate-800 font-semibold text-white' : 'text-slate-400',
          )}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}
```

Nota: o filtro de unidade fica com `unidadeId = null` (todas) nesta entrega. O `setUnidadeId` já existe para plugar o `UnidadeFilter` do app no passo seguinte, se o padrão da página exigir.

- [ ] **Step 2: Criar o barrel**

`src/components/App/Agenda/index.ts`:

```ts
export { default } from './AgendaPage';
```

- [ ] **Step 3: Registrar a rota**

Em `src/router.tsx`, junto ao import lazy das outras páginas:

```tsx
const AgendaPage = lazy(() => import('@/components/App/Agenda'));
```

E logo antes da entrada `path: 'administrativo'`:

```tsx
          {
            path: 'agenda',
            element: <Suspense fallback={<PageLoader />}><AgendaPage /></Suspense>,
          },
```

- [ ] **Step 4: Registrar no menu**

Em `src/components/App/Layout/AppSidebar.tsx`, adicionar `CalendarClock` ao import de `lucide-react`; no mapa de preload, junto de `'/app/administrativo'`:

```ts
  '/app/agenda': () => import('@/components/App/Agenda'),
```

E no array `operacional`, logo antes de `Administrativo`:

```ts
  { path: '/app/agenda', label: 'Agenda', icon: CalendarClock },
```

- [ ] **Step 5: Verificar build e abrir a tela**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: build conclui sem erro.

Run: `npm run dev` e abrir `http://localhost:5175/app/agenda`.

Conferir manualmente:
1. A régua vermelha aparece no horário atual e some fora de 08:00–22:00.
2. Navegar até 04/08/2026: a turma da Lohana às 18:00 é **um** card, não cinco.
3. Navegar até 25/07/2026: aparece o aviso de dia incompleto.
4. Clicar num card abre o painel com os dados do aluno.
5. Alternar Professores/Salas reagrupa a timeline.

- [ ] **Step 6: Commit**

```bash
git add src/components/App/Agenda src/router.tsx src/components/App/Layout/AppSidebar.tsx
git commit -m "feat(agenda): pagina, rota /app/agenda e item no menu"
```

---

### Task 12: Documentação

O CLAUDE.md do projeto exige manter `docs/MAPA-SISTEMA.md` atualizado no mesmo ciclo.

**Files:**
- Modify: `docs/MAPA-SISTEMA.md`
- Modify: `CLAUDE.md`
- Create: `daily-notes/2026-08-01.md` (ou append se já existir)

- [ ] **Step 1: Registrar a página no mapa do sistema**

Em `docs/MAPA-SISTEMA.md`, seguindo o formato das outras entradas, acrescentar a Agenda: rota `/app/agenda`, componentes (`AgendaPage`, `AgendaTimeline`, `AgendaCard`, `AgendaDrawer`), hook (`useAgendaDia`), RPC (`get_agenda_dia`), tabelas (`aulas_emusys`, `aula_alunos`, `aluno_presenca`), edges que alimentam (`sync-grade-futura-emusys`, `sync-presenca-emusys`).

- [ ] **Step 2: Registrar o módulo no CLAUDE.md**

Acrescentar um item na seção de integrações/módulos, curto, cobrindo: a Agenda vive em `/app/agenda`; a fonte é `aulas_emusys` + `aula_alunos`; leitura pela RPC `get_agenda_dia`, que **agrupa** porque `aulas_emusys` guarda uma linha por aluno em turmas; não há cron novo; a janela 19/07–01/08/2026 está incompleta e a tela avisa; cancelar/reagendar ficaram para a fase 2.

- [ ] **Step 3: Registrar no daily-note**

Em `daily-notes/2026-08-01.md`, seção `## Módulo Agenda (~HHh BRT)`: o que foi feito, a decisão de não reusar `aluno_presenca`, o achado do apagão 19–26/07 (causa raiz não identificada, não está no código dos syncs) e as pendências (fase 2: cancelar/reagendar, visão Semana; reparo opcional da janela).

- [ ] **Step 4: Commit**

```bash
git add docs/MAPA-SISTEMA.md CLAUDE.md daily-notes/2026-08-01.md
git commit -m "docs(agenda): registra o modulo no mapa do sistema e no daily-note"
```

---

## Pendências deixadas explicitamente de fora

- **Cancelar e reagendar aula** (fase 2). A API suporta: `POST /aulas/cancelar` e `PATCH /aulas/reagendar`.
- **Visão Semana** (fase 2).
- **Backfill da janela 19/07–01/08/2026.** Reprocessável quando quiser: `sync-presenca-emusys` aceita `data` e `dias` no corpo. Respeitar o rate limit de 60 req/min.
- **Causa raiz do apagão de 19–26/07.** Não está no código dos syncs — nenhum deles deleta passado, e não há cron nem trigger de limpeza em `aulas_emusys`. Investigação à parte.
