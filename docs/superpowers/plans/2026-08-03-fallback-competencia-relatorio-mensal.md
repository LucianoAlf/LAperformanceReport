# Fallback de Competência no Relatório Mensal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando a competência pedida não tem fechamento, o relatório mensal oferece o último mês fechado anterior e só gera após confirmação do usuário.

**Architecture:** A edge `relatorio-admin-whatsapp` passa a incluir, no 409 que já devolve, qual é o último mês fechado (`fallback`). O front lê esse corpo — hoje descartado — e abre o `ModalConfirmacao` existente antes de reenviar com a nova competência. Nenhum objeto novo no banco: a edge consulta `fechamento_mensal_snapshots` com o client `service_role` que já tem no escopo.

**Tech Stack:** Deno (edge functions), React 19 + TypeScript, Supabase JS v2, `node:test` para os testes de contrato.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-03-fallback-competencia-relatorio-mensal-design.md`
- Apenas os modos `dry_run_mensal_admin` e `dry_run_mensal_comercial` mudam. O ramo `modo === 'cron'` (relatório diário, enviado ao WhatsApp) **não pode ser tocado**.
- Status HTTP permanece **409** para fechamento indisponível e **403** para `ACESSO_NEGADO`.
- Domínios: `relatorio_admin_mensal` (administrativo) e `relatorio_comercial_mensal` (comercial).
- Fallback busca competência **anterior ou igual** à pedida. Nunca avança no tempo.
- Uma única tentativa de fallback — a confirmação não encadeia.
- `relatorio-admin-whatsapp` tem `verify_jwt = false` em `supabase/config.toml`. Todo deploy DEVE passar `verify_jwt: false` explícito (o MCP reseta para `true` e derruba o cron do relatório diário em 401 silencioso).
- Testes rodam com `node --test tests/<arquivo>.test.mjs`. Não há script npm de teste.
- Idioma do código e dos textos de UI: português.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/functions/_shared/relatorios-mensais-canonicos.ts` (modificar) | Passa a exportar `rotuloCompetencia(ano, mes)`, hoje embutido no módulo |
| `supabase/functions/relatorio-admin-whatsapp/index.ts` (modificar) | Enriquece o 409 dos modos mensais com `fallback` |
| `src/lib/fallbackCompetenciaRelatorio.ts` (criar) | Extrai `fallback` do erro do `functions.invoke` |
| `src/hooks/useConfirmacaoCompetencia.ts` (criar) | Estado + promise da confirmação, reusável pelas duas telas |
| `src/components/App/Administrativo/ModalRelatorio.tsx` (modificar) | Liga o fluxo no relatório administrativo |
| `src/components/App/Comercial/ComercialPage.tsx` (modificar) | Liga o fluxo no relatório comercial |
| `tests/relatorioMensalFallbackCompetencia.test.mjs` (criar) | Contrato da edge e do shared |
| `tests/fallbackCompetenciaFrontend.test.mjs` (criar) | Contrato do front |

---

### Task 1: Edge devolve o último mês fechado no 409

**Files:**
- Modify: `supabase/functions/_shared/relatorios-mensais-canonicos.ts:4-7`
- Modify: `supabase/functions/relatorio-admin-whatsapp/index.ts:2102-2113`
- Test: `tests/relatorioMensalFallbackCompetencia.test.mjs`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `rotuloCompetencia(ano: number, mes: number): string` exportado do shared. Contrato de resposta 409 consumido pelas Tasks 2-4:
  `{ success: false, motivo: 'fechamento_indisponivel', error: string, competencia_solicitada: { ano: number, mes: number }, fallback: { ano: number, mes: number, rotulo: string } | null }`

- [ ] **Step 1: Escrever o teste de contrato falhando**

Criar `tests/relatorioMensalFallbackCompetencia.test.mjs`:

```javascript
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const edge = await readFile(
  new URL('../supabase/functions/relatorio-admin-whatsapp/index.ts', import.meta.url),
  'utf8',
);
const shared = await readFile(
  new URL('../supabase/functions/_shared/relatorios-mensais-canonicos.ts', import.meta.url),
  'utf8',
);

test('rotulo de competencia e exportado do shared', () => {
  assert.match(shared, /export function rotuloCompetencia\s*\(/);
});

test('409 de fechamento indisponivel carrega o motivo e o fallback', () => {
  assert.match(edge, /motivo:\s*'fechamento_indisponivel'/);
  assert.match(edge, /competencia_solicitada:/);
  assert.match(edge, /fallback:/);
});

test('fallback so considera snapshot fechado de unidade no dominio certo', () => {
  assert.match(edge, /relatorio_comercial_mensal/);
  assert.match(edge, /\.eq\('status',\s*'fechado'\)/);
  assert.match(edge, /\.eq\('escopo',\s*'unidade'\)/);
});

test('acesso negado continua 403 e sem fallback', () => {
  assert.match(edge, /status:\s*403/);
  assert.doesNotMatch(
    edge,
    /acessoNegado\s*\?\s*403\s*:\s*409/,
    'o ramo 403 deve sair antes do calculo de fallback',
  );
});

test('o relatorio diario do cron nao ganha fallback', () => {
  const cron = edge.slice(edge.indexOf("payload.modo === 'cron'"));
  assert.doesNotMatch(cron, /fechamento_indisponivel/);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/relatorioMensalFallbackCompetencia.test.mjs`
Expected: FAIL — `rotuloCompetencia` não é exportado e `fechamento_indisponivel` não existe na edge.

- [ ] **Step 3: Exportar `rotuloCompetencia` do shared**

Em `supabase/functions/_shared/relatorios-mensais-canonicos.ts`, logo após a constante `MESES` (linha 4-7), adicionar:

```typescript
export function rotuloCompetencia(ano: number, mes: number): string {
  return `${MESES[mes - 1] ?? "MÊS"}/${ano}`;
}
```

- [ ] **Step 4: Importar o helper na edge**

Em `supabase/functions/relatorio-admin-whatsapp/index.ts`, no bloco de import que termina na linha 36 (`} from '../_shared/relatorios-mensais-canonicos.ts';`), acrescentar `rotuloCompetencia` à lista de símbolos importados.

- [ ] **Step 5: Substituir o ramo de erro do snapshot**

Trocar o bloco atual de `index.ts:2102-2113` por:

```typescript
      if (snapshotError) {
        if (snapshotError.message?.includes('ACESSO_NEGADO')) {
          return new Response(
            JSON.stringify({ success: false, error: 'Você não tem acesso a esta unidade.' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }

        const dominioSnapshot = tipo === 'administrativo'
          ? 'relatorio_admin_mensal'
          : 'relatorio_comercial_mensal';
        const { data: fechados } = await supabase
          .from('fechamento_mensal_snapshots')
          .select('ano, mes')
          .eq('dominio', dominioSnapshot)
          .eq('unidade_id', payload.unidade)
          .eq('status', 'fechado')
          .eq('escopo', 'unidade');

        const alvo = payload.ano! * 100 + payload.mes!;
        const anterior = (fechados ?? [])
          .map((item) => ({ ano: item.ano as number, mes: item.mes as number }))
          .filter((item) => item.ano * 100 + item.mes <= alvo)
          .sort((a, b) => (b.ano * 100 + b.mes) - (a.ano * 100 + a.mes))[0] ?? null;

        return new Response(
          JSON.stringify({
            success: false,
            motivo: 'fechamento_indisponivel',
            error: 'O fechamento oficial deste mês ainda não está disponível.',
            competencia_solicitada: { ano: payload.ano, mes: payload.mes },
            fallback: anterior
              ? {
                ano: anterior.ano,
                mes: anterior.mes,
                rotulo: rotuloCompetencia(anterior.ano, anterior.mes),
              }
              : null,
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
```

A filtragem acontece em memória de propósito: são poucos snapshots por unidade e domínio (3 hoje), e evita a sintaxe aninhada de `.or()` do PostgREST, que é fácil de escrever errado sem o erro aparecer.

- [ ] **Step 6: Rodar o teste e confirmar que passa**

Run: `node --test tests/relatorioMensalFallbackCompetencia.test.mjs`
Expected: PASS, 5 testes.

- [ ] **Step 7: Verificar a sintaxe do TypeScript da edge**

Run: `npx --yes deno@1.45 check supabase/functions/relatorio-admin-whatsapp/index.ts`
Expected: sem erros. Se o Deno não estiver disponível no ambiente, rodar `npx tsc --noEmit --allowJs false --skipLibCheck supabase/functions/relatorio-admin-whatsapp/index.ts` e ignorar erros de resolução de import remoto (`https://`), tratando apenas erros de sintaxe e de tipo local.

- [ ] **Step 8: Commit**

```bash
git add tests/relatorioMensalFallbackCompetencia.test.mjs supabase/functions/_shared/relatorios-mensais-canonicos.ts supabase/functions/relatorio-admin-whatsapp/index.ts
git commit -m "feat(relatorio-mensal): edge informa ultimo mes fechado no 409"
```

---

### Task 2: Ler o fallback do erro e confirmar com o usuário

**Files:**
- Create: `src/lib/fallbackCompetenciaRelatorio.ts`
- Create: `src/hooks/useConfirmacaoCompetencia.ts`
- Test: `tests/fallbackCompetenciaFrontend.test.mjs`

**Interfaces:**
- Consumes: contrato do 409 da Task 1.
- Produces:
  - `type FallbackCompetencia = { ano: number; mes: number; rotulo: string }`
  - `extrairFallbackCompetencia(erro: unknown): Promise<FallbackCompetencia | null>`
  - `useConfirmacaoCompetencia(): { pedirConfirmacao, confirmacaoPendente, confirmar, cancelar }` — usado pelas Tasks 3 e 4.

- [ ] **Step 1: Escrever o teste de contrato falhando**

Criar `tests/fallbackCompetenciaFrontend.test.mjs`:

```javascript
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const lib = await readFile(
  new URL('../src/lib/fallbackCompetenciaRelatorio.ts', import.meta.url),
  'utf8',
);
const hook = await readFile(
  new URL('../src/hooks/useConfirmacaoCompetencia.ts', import.meta.url),
  'utf8',
);

test('o corpo do erro e lido do context da resposta', () => {
  assert.match(lib, /context/);
  assert.match(lib, /\.json\(\)/);
});

test('parse ilegivel devolve null em vez de estourar', () => {
  assert.match(lib, /catch/);
  assert.match(lib, /return null/);
});

test('so aceita fallback com motivo de fechamento indisponivel', () => {
  assert.match(lib, /fechamento_indisponivel/);
});

test('o hook expoe a promise de confirmacao', () => {
  assert.match(hook, /export function useConfirmacaoCompetencia/);
  assert.match(hook, /Promise<boolean>/);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/fallbackCompetenciaFrontend.test.mjs`
Expected: FAIL com `ENOENT` — os arquivos ainda não existem.

- [ ] **Step 3: Criar a lib de parse**

Criar `src/lib/fallbackCompetenciaRelatorio.ts`:

```typescript
export type FallbackCompetencia = {
  ano: number;
  mes: number;
  rotulo: string;
};

/**
 * `supabase.functions.invoke` converte qualquer resposta não-2xx em FunctionsHttpError
 * e não entrega o corpo. A resposta original fica em `context`, e é lá que a edge
 * manda qual competência está disponível.
 */
export async function extrairFallbackCompetencia(
  erro: unknown,
): Promise<FallbackCompetencia | null> {
  const contexto = (erro as { context?: Response } | null)?.context;
  if (!contexto || typeof contexto.json !== 'function') return null;

  try {
    const corpo = await contexto.clone().json();
    if (corpo?.motivo !== 'fechamento_indisponivel') return null;

    const fallback = corpo?.fallback;
    if (
      !fallback
      || !Number.isInteger(fallback.ano)
      || !Number.isInteger(fallback.mes)
      || typeof fallback.rotulo !== 'string'
    ) {
      return null;
    }

    return { ano: fallback.ano, mes: fallback.mes, rotulo: fallback.rotulo };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Criar o hook de confirmação**

Criar `src/hooks/useConfirmacaoCompetencia.ts`:

```typescript
import { useCallback, useRef, useState } from 'react';
import type { FallbackCompetencia } from '@/lib/fallbackCompetenciaRelatorio';

export function useConfirmacaoCompetencia() {
  const [confirmacaoPendente, setConfirmacaoPendente] = useState<FallbackCompetencia | null>(null);
  const resolverRef = useRef<((aceitou: boolean) => void) | null>(null);

  const pedirConfirmacao = useCallback((fallback: FallbackCompetencia): Promise<boolean> => {
    setConfirmacaoPendente(fallback);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const responder = useCallback((aceitou: boolean) => {
    setConfirmacaoPendente(null);
    resolverRef.current?.(aceitou);
    resolverRef.current = null;
  }, []);

  const confirmar = useCallback(() => responder(true), [responder]);
  const cancelar = useCallback(() => responder(false), [responder]);

  return { pedirConfirmacao, confirmacaoPendente, confirmar, cancelar };
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `node --test tests/fallbackCompetenciaFrontend.test.mjs`
Expected: PASS, 4 testes.

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros novos. Se o projeto já tiver erros preexistentes, comparar com a saída antes da mudança e garantir que nenhum novo apareceu nos dois arquivos criados.

- [ ] **Step 7: Commit**

```bash
git add tests/fallbackCompetenciaFrontend.test.mjs src/lib/fallbackCompetenciaRelatorio.ts src/hooks/useConfirmacaoCompetencia.ts
git commit -m "feat(relatorio-mensal): lib e hook de confirmacao de competencia"
```

---

### Task 3: Ligar o fluxo no relatório administrativo

**Files:**
- Modify: `src/components/App/Administrativo/ModalRelatorio.tsx:886-907`
- Test: `tests/fallbackCompetenciaFrontend.test.mjs`

**Interfaces:**
- Consumes: `extrairFallbackCompetencia`, `useConfirmacaoCompetencia` (Task 2); contrato 409 (Task 1).
- Produces: nada consumido por tasks posteriores.

- [ ] **Step 1: Acrescentar o teste de contrato falhando**

Adicionar ao fim de `tests/fallbackCompetenciaFrontend.test.mjs`:

```javascript
const modalAdmin = await readFile(
  new URL('../src/components/App/Administrativo/ModalRelatorio.tsx', import.meta.url),
  'utf8',
);

test('relatorio administrativo oferece a competencia disponivel', () => {
  assert.match(modalAdmin, /extrairFallbackCompetencia/);
  assert.match(modalAdmin, /useConfirmacaoCompetencia/);
  assert.match(modalAdmin, /ModalConfirmacao/);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/fallbackCompetenciaFrontend.test.mjs`
Expected: FAIL no teste novo — `ModalRelatorio.tsx` ainda não importa nada disso.

- [ ] **Step 3: Adicionar os imports**

Em `src/components/App/Administrativo/ModalRelatorio.tsx`, junto aos demais imports do topo:

```typescript
import { ModalConfirmacao } from '@/components/ui/ModalConfirmacao';
import { extrairFallbackCompetencia } from '@/lib/fallbackCompetenciaRelatorio';
import { useConfirmacaoCompetencia } from '@/hooks/useConfirmacaoCompetencia';
```

- [ ] **Step 4: Instanciar o hook no componente**

Junto às demais chamadas de `useState` do componente:

```typescript
const {
  pedirConfirmacao,
  confirmacaoPendente,
  confirmar: confirmarCompetencia,
  cancelar: cancelarCompetencia,
} = useConfirmacaoCompetencia();
```

- [ ] **Step 5: Reescrever `gerarRelatorioMensal`**

Substituir o corpo da função (linhas 886-907) por:

```typescript
  async function gerarRelatorioMensal(): Promise<string> {
    const { anoRelatorio, mesRelatorio } = obterCompetenciaMensalAdministrativa();
    if (!unidade || unidade === 'todos') {
      throw new Error('Selecione uma unidade para gerar o relatório mensal administrativo.');
    }

    const solicitar = async (ano: number, mes: number) => {
      const { data, error } = await supabase.functions.invoke('relatorio-admin-whatsapp', {
        body: { modo: 'dry_run_mensal_admin', unidade, ano, mes },
      });
      return { data, error };
    };

    const primeira = await solicitar(anoRelatorio, mesRelatorio);

    if (primeira.error) {
      const fallback = await extrairFallbackCompetencia(primeira.error);
      if (!fallback) throw primeira.error;

      const aceitou = await pedirConfirmacao(fallback);
      if (!aceitou) {
        throw new Error('Geração cancelada. Escolha uma competência já fechada.');
      }

      const segunda = await solicitar(fallback.ano, fallback.mes);
      if (segunda.error) throw segunda.error;
      if (segunda.data?.success !== true || typeof segunda.data?.texto !== 'string' || !segunda.data.texto.trim()) {
        throw new Error(segunda.data?.error || 'O fechamento oficial deste mês ainda não está disponível.');
      }
      return segunda.data.texto;
    }

    if (primeira.data?.success !== true || typeof primeira.data?.texto !== 'string' || !primeira.data.texto.trim()) {
      throw new Error(primeira.data?.error || 'O fechamento oficial deste mês ainda não está disponível.');
    }

    return primeira.data.texto;
  }
```

- [ ] **Step 6: Renderizar o modal de confirmação**

Dentro do JSX do componente, imediatamente antes do fechamento do `<Dialog>` de nível mais externo:

```tsx
<ModalConfirmacao
  aberto={confirmacaoPendente !== null}
  onClose={cancelarCompetencia}
  onConfirmar={confirmarCompetencia}
  tipo="warning"
  titulo="Competência ainda não fechada"
  mensagem={
    confirmacaoPendente
      ? `O mês selecionado ainda não teve fechamento. Gerar o relatório de ${confirmacaoPendente.rotulo}?`
      : ''
  }
  textoConfirmar={confirmacaoPendente ? `Gerar ${confirmacaoPendente.rotulo}` : 'Confirmar'}
  textoCancelar="Cancelar"
/>
```

- [ ] **Step 7: Rodar os testes e confirmar que passam**

Run: `node --test tests/fallbackCompetenciaFrontend.test.mjs`
Expected: PASS, 5 testes.

- [ ] **Step 8: Verificar tipos e build**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: build conclui sem erro.

- [ ] **Step 9: Commit**

```bash
git add tests/fallbackCompetenciaFrontend.test.mjs src/components/App/Administrativo/ModalRelatorio.tsx
git commit -m "feat(relatorio-mensal): confirmacao de competencia no administrativo"
```

---

### Task 4: Ligar o fluxo no relatório comercial

**Files:**
- Modify: `src/components/App/Comercial/ComercialPage.tsx:3174-3196`
- Test: `tests/fallbackCompetenciaFrontend.test.mjs`

**Interfaces:**
- Consumes: `extrairFallbackCompetencia`, `useConfirmacaoCompetencia` (Task 2); contrato 409 (Task 1).
- Produces: nada consumido por tasks posteriores.

- [ ] **Step 1: Acrescentar o teste de contrato falhando**

Adicionar ao fim de `tests/fallbackCompetenciaFrontend.test.mjs`:

```javascript
const paginaComercial = await readFile(
  new URL('../src/components/App/Comercial/ComercialPage.tsx', import.meta.url),
  'utf8',
);

test('relatorio comercial oferece a competencia disponivel', () => {
  assert.match(paginaComercial, /extrairFallbackCompetencia/);
  assert.match(paginaComercial, /useConfirmacaoCompetencia/);
  assert.match(paginaComercial, /ModalConfirmacao/);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/fallbackCompetenciaFrontend.test.mjs`
Expected: FAIL no teste novo.

- [ ] **Step 3: Adicionar os imports**

Em `src/components/App/Comercial/ComercialPage.tsx`, junto aos demais imports do topo:

```typescript
import { ModalConfirmacao } from '@/components/ui/ModalConfirmacao';
import { extrairFallbackCompetencia } from '@/lib/fallbackCompetenciaRelatorio';
import { useConfirmacaoCompetencia } from '@/hooks/useConfirmacaoCompetencia';
```

- [ ] **Step 4: Instanciar o hook no componente**

Junto às demais chamadas de `useState` do componente:

```typescript
const {
  pedirConfirmacao,
  confirmacaoPendente,
  confirmar: confirmarCompetencia,
  cancelar: cancelarCompetencia,
} = useConfirmacaoCompetencia();
```

- [ ] **Step 5: Reescrever `gerarRelatorioMensal`**

Substituir o corpo da função (linhas 3174-3196) por:

```typescript
  const gerarRelatorioMensal = async () => {
    const { ano, mes } = obterCompetenciaRelatorioMensalComercial();
    const unidadeId = isAdmin ? context?.unidadeSelecionada : usuario?.unidade_id;
    if (!unidadeId || unidadeId === 'todos') {
      throw new Error('Selecione uma unidade para gerar o relatório mensal comercial.');
    }

    const solicitar = async (anoAlvo: number, mesAlvo: number) => {
      const { data, error } = await supabase.functions.invoke('relatorio-admin-whatsapp', {
        body: { modo: 'dry_run_mensal_comercial', unidade: unidadeId, ano: anoAlvo, mes: mesAlvo },
      });
      return { data, error };
    };

    const primeira = await solicitar(ano, mes);

    if (primeira.error) {
      const fallback = await extrairFallbackCompetencia(primeira.error);
      if (!fallback) throw primeira.error;

      const aceitou = await pedirConfirmacao(fallback);
      if (!aceitou) {
        throw new Error('Geração cancelada. Escolha uma competência já fechada.');
      }

      const segunda = await solicitar(fallback.ano, fallback.mes);
      if (segunda.error) throw segunda.error;
      if (segunda.data?.success !== true || typeof segunda.data?.texto !== 'string' || !segunda.data.texto.trim()) {
        throw new Error(segunda.data?.error || 'O fechamento oficial deste mês ainda não está disponível.');
      }
      return segunda.data.texto;
    }

    if (primeira.data?.success !== true || typeof primeira.data?.texto !== 'string' || !primeira.data.texto.trim()) {
      throw new Error(primeira.data?.error || 'O fechamento oficial deste mês ainda não está disponível.');
    }

    return primeira.data.texto;
  };
```

- [ ] **Step 6: Renderizar o modal de confirmação**

No JSX de `ComercialPage`, imediatamente antes do fechamento do elemento raiz do componente:

```tsx
<ModalConfirmacao
  aberto={confirmacaoPendente !== null}
  onClose={cancelarCompetencia}
  onConfirmar={confirmarCompetencia}
  tipo="warning"
  titulo="Competência ainda não fechada"
  mensagem={
    confirmacaoPendente
      ? `O mês selecionado ainda não teve fechamento. Gerar o relatório de ${confirmacaoPendente.rotulo}?`
      : ''
  }
  textoConfirmar={confirmacaoPendente ? `Gerar ${confirmacaoPendente.rotulo}` : 'Confirmar'}
  textoCancelar="Cancelar"
/>
```

- [ ] **Step 7: Rodar os testes e confirmar que passam**

Run: `node --test tests/fallbackCompetenciaFrontend.test.mjs`
Expected: PASS, 6 testes.

- [ ] **Step 8: Verificar tipos e build**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: build conclui sem erro.

- [ ] **Step 9: Commit**

```bash
git add tests/fallbackCompetenciaFrontend.test.mjs src/components/App/Comercial/ComercialPage.tsx
git commit -m "feat(relatorio-mensal): confirmacao de competencia no comercial"
```

---

### Task 5: Deploy da edge e verificação em produção

**Files:**
- Nenhum arquivo alterado. Esta task é operacional.

**Interfaces:**
- Consumes: edge da Task 1.
- Produces: edge publicada e cron diário confirmado vivo.

- [ ] **Step 1: Confirmar o flag no config.toml antes de deployar**

Run: `grep -A2 "functions.relatorio-admin-whatsapp" supabase/config.toml`
Expected: a saída contém `verify_jwt = false`. Se contiver outro valor, PARE e reporte — o resto desta task assume `false`.

- [ ] **Step 2: Rodar a suíte de testes tocada**

Run: `node --test tests/relatorioMensalFallbackCompetencia.test.mjs tests/fallbackCompetenciaFrontend.test.mjs`
Expected: PASS, todos.

- [ ] **Step 3: Deployar com o flag explícito**

Usar `mcp__supabase__deploy_edge_function` com `verify_jwt: false` explicitamente no payload. **Não** omitir esse campo: o default do MCP é `true` e ele ignora o `config.toml`.

- [ ] **Step 4: Confirmar que a edge não voltou trancada**

Chamar a edge com o modo mensal de uma competência que existe (Barra, 2026/7) usando um JWT de usuário real e verificar `200`. Depois verificar nos logs (`mcp__supabase__get_logs` service `edge-function`) que não há `401` novo para `relatorio-admin-whatsapp`.
Expected: 200 no caminho feliz, nenhum 401.

Se aparecer 401, o `verify_jwt` foi resetado: redeployar imediatamente com o flag correto. O relatório diário depende disso e falha em silêncio (`pg_cron` marca `succeeded` de qualquer jeito).

- [ ] **Step 5: Verificar o caminho novo em produção**

Chamar `dry_run_mensal_admin` para Barra com `ano: 2026, mes: 8` (agosto não tem fechamento).
Expected: `409` com `fallback: { ano: 2026, mes: 7, rotulo: "JULHO/2026" }`.

Chamar `dry_run_mensal_comercial` para Barra com `ano: 2026, mes: 5` (nenhum fechamento anterior existe — o mais antigo é julho/2026).
Expected: `409` com `fallback: null`.

- [ ] **Step 6: Verificar o guard de acesso nos três perfis**

Rodar a RPC do relatório com `set local role authenticated` e `request.jwt.claims` de um usuário real de cada perfil (admin, unidade, professor), confirmando que quem não tem a unidade recebe `ACESSO_NEGADO`. Nunca validar como `service_role` — ele ignora RLS e mascara exatamente esse tipo de falha.

- [ ] **Step 7: Confirmar que o relatório diário continua saindo**

Verificar nos logs que a próxima execução do cron do relatório diário respondeu `200`. Não basta o `pg_cron` marcar `succeeded` — ele só avalia se o `net.http_post` foi enfileirado.

- [ ] **Step 8: Atualizar a documentação do projeto**

Registrar em `CLAUDE.md` (seção de integrações/relatórios) uma linha sobre o novo comportamento: o mensal oferece o último fechamento anterior quando a competência pedida não fechou, com confirmação do usuário, e o envio automático não usa fallback. Registrar também o dia de trabalho em `daily-notes/2026-08-03.md`.

- [ ] **Step 9: Commit**

```bash
git add CLAUDE.md daily-notes/2026-08-03.md
git commit -m "docs(relatorio-mensal): registra fallback de competencia"
```

---

## Notas de verificação manual

Depois do deploy, o teste que importa para o Arthur: abrir o modal com a competência em **agosto/2026**, apertar gerar, e confirmar que aparece "Gerar JULHO/2026" — e que recusar não gera nada.

O número de alunos ativos de julho continua **241**. Este plano não mexe em snapshot fechado.
