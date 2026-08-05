# Experimental sem telefone: fallback de lead + fix de sobrescrita em `leads.aluno_id` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garantir que uma aula experimental sempre seja registrada em `lead_experimentais`
mesmo sem telefone no payload, e parar a tabela `leads` de acumular inconsistência interna
(`aluno_id`/`emusys_lead_id` de pessoas diferentes na mesma linha) quando dois irmãos convertem
pro mesmo lead.

**Architecture:** Duas mudanças independentes, cada uma num único edge function existente —
sem tabela nova, sem coluna nova, sem RPC nova. Task 1 adiciona um fallback de criação de lead
+ uma checagem pós-RPC (não uma exceção) dentro do observador de webhooks do Emusys. Task 2
troca duas atribuições incondicionais por condicionais dentro da função que converte lead em
matrícula.

**Tech Stack:** Deno (edge functions Supabase, TypeScript), `@supabase/supabase-js`, testes em
Node (`node:test` + `node:assert/strict`) rodando contra o código-fonte como texto — mesmo
padrão já usado no repo para essas funções (ver `tests/processarMatriculaLifecycleV131.test.mjs`),
já que o código roda em runtime Deno e não é importável diretamente pelo Node.

## Global Constraints

- Não mexer na regra geral de `lead_criado`/`lead_editado` (continuam descartando lead sem
  telefone) — o fallback é só para `aula_experimental_criada`.
- `aula_experimental_reagendada`/`aula_experimental_cancelada` NÃO ganham o fallback — não faz
  sentido criar lead do zero a partir de um reagendamento ou cancelamento.
- Não implementar merge de família nem duplicata de telefone — na colisão, só logar
  `status='warn'` para revisão manual futura.
- Não mexer em `ComercialPage.tsx` nem `relatorio-admin-whatsapp` — auditoria confirmou que já
  se defendem da inconsistência via `selecionarLeadParaAluno` (fallback próprio por
  `emusys_lead_id`/telefone).
- Não mexer em `alunos.lead_origem_id` nem no guard que já existe pra ele — já funciona
  corretamente hoje (confirmado com matrículas de julho/2026).

---

## Task 1: Fallback de lead sem telefone + detecção de colisão (observador)

**Files:**
- Modify: `supabase/functions/debug-webhook-emusys-observador/index.ts`
  - `processarLead` (linhas 365-398)
  - `processarExperimental` (linhas 492-581)
  - handler principal `serve()`, bloco de cálculo de `status` (linhas ~710-726)
- Test: `tests/observadorExperimentalFallbackLead.test.mjs`

**Interfaces:**
- Consumes: nada de outra task — mudança isolada neste arquivo.
- Produces: nada consumido por outra task — Task 2 é independente.

- [ ] **Step 1: Escrever o teste (vai falhar — as funções/trechos ainda não existem)**

Criar `tests/observadorExperimentalFallbackLead.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const webhookPath = 'supabase/functions/debug-webhook-emusys-observador/index.ts';
const source = readFileSync(webhookPath, 'utf8');

test('cria lead fallback quando experimental chega sem telefone e lead_not_found', () => {
  assert.match(source, /async function criarLeadFallbackExperimental/);
  assert.match(source, /criarLeadFallbackExperimental\(sb, unidadeId, emusysLeadId, nomeAluno\)/);
});

test('fallback so dispara na criacao, com telefone ausente e lead_not_found', () => {
  assert.match(source, /evento === 'aula_experimental_criada'/);
  assert.match(source, /&&\s*!telefone/);
  assert.match(source, /data\?\.success === false/);
  assert.match(source, /data\?\.reason === 'lead_not_found'/);
});

test('lead fallback criado com emusys_lead_id e sem telefone, na unidade certa', () => {
  assert.match(source, /emusys_lead_id: emusysLeadId,/);
  assert.match(source, /unidade_id: unidadeId,/);
  assert.match(source, /telefone: null,/);
  assert.match(source, /source_type: 'emusys',/);
});

test('lead_fallback aparece no retorno final da experimental', () => {
  assert.match(source, /lead_fallback:\s*leadFallback,/);
});

test('processarLead detecta colisao de telefone via releitura, nao via excecao', () => {
  assert.match(source, /acao: 'colisao_telefone_familia'/);
  assert.match(source, /leadAtual\.telefone !== telefone/);
});

test('status warn passa a cobrir colisao_telefone_familia', () => {
  assert.match(source, /acaoInterna === 'colisao_telefone_familia'/);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/observadorExperimentalFallbackLead.test.mjs`
Expected: FAIL em todos os `assert.match` (as strings ainda não existem no arquivo).

- [ ] **Step 3: Adicionar a função `criarLeadFallbackExperimental`**

Em `supabase/functions/debug-webhook-emusys-observador/index.ts`, inserir esta função
imediatamente **antes** de `async function processarExperimental` (linha 492 atual):

```ts
/** Quando a experimental chega SEM telefone (nem do aluno, nem do responsável) e a RPC não acha
 *  lead pra vincular, cria um lead mínimo pelo `emusys_lead_id` da própria aula — só assim a
 *  experimental não se perde (o n8n tinha a mesma regra de descarte e perdia do mesmo jeito).
 *  Telefone fica null. Se aparecer depois via lead_editado, quem decide o que fazer numa
 *  eventual colisão de telefone é `processarLead` (ver ali). */
async function criarLeadFallbackExperimental(
  sb: any, unidadeId: string, emusysLeadId: number | null, nomeAluno: string | null,
): Promise<{ leadId: number | null; erro: string | null }> {
  if (!emusysLeadId) return { leadId: null, erro: 'sem emusys_lead_id para criar o lead' };
  const { data, error } = await sb
    .from('leads')
    .insert({
      emusys_lead_id: emusysLeadId,
      nome: nomeAluno,
      unidade_id: unidadeId,
      telefone: null,
      source_type: 'emusys',
      status: 'novo',
      etapa_pipeline_id: 5,
      data_contato: new Date().toISOString().substring(0, 10),
    })
    .select('id')
    .single();
  if (error) return { leadId: null, erro: error.message };
  return { leadId: data?.id ?? null, erro: null };
}
```

- [ ] **Step 4: Alterar a chamada da RPC em `processarExperimental` pra usar o fallback**

Localizar este trecho (dentro de `processarExperimental`, hoje linhas 541-542):

```ts
  const { data, error } = await sb.rpc('registrar_experimental', args);
  if (error) return { acao: 'erro_rpc', rpc: 'registrar_experimental', erro: error.message, args };
```

Substituir por:

```ts
  let { data, error } = await sb.rpc('registrar_experimental', args);
  if (error) return { acao: 'erro_rpc', rpc: 'registrar_experimental', erro: error.message, args };

  let leadFallback: { lead_id: number } | null = null;
  if (
    evento === 'aula_experimental_criada'
    && !telefone
    && data?.success === false
    && data?.reason === 'lead_not_found'
  ) {
    const criado = await criarLeadFallbackExperimental(sb, unidadeId, emusysLeadId, nomeAluno);
    if (criado.erro) {
      return { acao: 'erro_lead_fallback', erro: criado.erro, args };
    }
    leadFallback = { lead_id: criado.leadId as number };
    const retry = await sb.rpc('registrar_experimental', args);
    data = retry.data;
    error = retry.error;
    if (error) {
      return {
        acao: 'erro_rpc', rpc: 'registrar_experimental', erro: error.message, args,
        lead_fallback: leadFallback,
      };
    }
  }
```

- [ ] **Step 5: Incluir `lead_fallback` no retorno final da função**

Localizar o `return` no final de `processarExperimental` (hoje linhas 573-580):

```ts
  return {
    acao: 'registrar_experimental',
    resultado: data,
    professor_via: professor.via,
    delta_observador: delta,
    substituidas,
    args,
  };
```

Substituir por:

```ts
  return {
    acao: 'registrar_experimental',
    resultado: data,
    professor_via: professor.via,
    delta_observador: delta,
    substituidas,
    lead_fallback: leadFallback,
    args,
  };
```

- [ ] **Step 6: Adicionar a checagem pós-RPC de colisão de telefone em `processarLead`**

Localizar este trecho (dentro de `processarLead`, hoje linhas 392-397):

```ts
  const { data, error } = await sb.rpc('upsert_lead', args);
  if (error) return { acao: 'erro_rpc', rpc: 'upsert_lead', erro: error.message, args };

  const leadId = data?.lead_id ?? null;
  const delta = leadId ? await aplicarDeltaLead(sb, leadId, lead) : null;
  return { acao: 'upsert_lead', resultado: data, delta_observador: delta, args };
```

Substituir por:

```ts
  const { data, error } = await sb.rpc('upsert_lead', args);
  if (error) return { acao: 'erro_rpc', rpc: 'upsert_lead', erro: error.message, args };

  const leadId = data?.lead_id ?? null;

  // upsert_lead nunca lança exceção na colisão de telefone: se `telefone` já pertence a outro
  // lead ativo na unidade, ela mantém o telefone atual em silêncio (COALESCE, ver corpo da
  // RPC). Só dá pra perceber relendo o lead e comparando com o que foi enviado.
  if (leadId && telefone) {
    const { data: leadAtual } = await sb.from('leads').select('telefone').eq('id', leadId).maybeSingle();
    if (leadAtual && leadAtual.telefone !== telefone) {
      return {
        acao: 'colisao_telefone_familia',
        motivo: 'telefone ja pertence a outro lead ativo na unidade',
        telefone_recusado: telefone,
        resultado: data,
        args,
      };
    }
  }

  const delta = leadId ? await aplicarDeltaLead(sb, leadId, lead) : null;
  return { acao: 'upsert_lead', resultado: data, delta_observador: delta, args };
```

- [ ] **Step 7: Fazer o handler principal tratar `colisao_telefone_familia` como `warn`**

Localizar este trecho em `serve()` (hoje linhas 721-726):

```ts
    let status: 'ok' | 'warn' | 'erro' = 'ok';
    if (acao === 'erro_processamento' || acaoInterna.indexOf('erro_') === 0) {
      status = 'erro';
    } else if (escrever && (acaoInterna === 'ignorado' || acaoInterna.indexOf('lead_not_found') >= 0 || rpcRecusou)) {
      status = 'warn';
    }
```

Substituir por:

```ts
    let status: 'ok' | 'warn' | 'erro' = 'ok';
    if (acao === 'erro_processamento' || acaoInterna.indexOf('erro_') === 0) {
      status = 'erro';
    } else if (
      escrever
      && (acaoInterna === 'ignorado'
        || acaoInterna === 'colisao_telefone_familia'
        || acaoInterna.indexOf('lead_not_found') >= 0
        || rpcRecusou)
    ) {
      status = 'warn';
    }
```

- [ ] **Step 8: Rodar o teste e confirmar que passa**

Run: `node --test tests/observadorExperimentalFallbackLead.test.mjs`
Expected: PASS em todos os 6 `test(...)`.

- [ ] **Step 9: Checar sintaxe TypeScript do arquivo (Deno não roda aqui, mas o `tsc` do editor não pode acusar erro)**

Run: `npx tsc --noEmit --allowJs false --target es2020 --module esnext --moduleResolution bundler "supabase/functions/debug-webhook-emusys-observador/index.ts" 2>&1 | head -30`
Expected: sem erros novos introduzidos por este diff (erros pré-existentes de imports `https://...` do Deno são esperados e não bloqueiam — conferir que nenhum erro novo cita as linhas alteradas).

- [ ] **Step 10: Commit**

```bash
git add supabase/functions/debug-webhook-emusys-observador/index.ts tests/observadorExperimentalFallbackLead.test.mjs
git commit -m "feat(observador): cria lead fallback quando experimental chega sem telefone

Antes, uma aula_experimental_criada sem telefone (nem do aluno, nem do
responsavel) e sem lead pra vincular era descartada silenciosamente
(mesma regra do n8n). Agora cria um lead minimo pelo emusys_lead_id da
propria aula e tenta de novo, garantindo que a experimental sempre seja
registrada. Adiciona tambem deteccao pos-RPC de colisao de telefone em
processarLead (upsert_lead nunca lanca excecao nesse caso, so mantem o
telefone atual em silencio) - vira status=warn pra revisao manual."
```

---

## Task 2: Parar de sobrescrever `leads.aluno_id`/`leads.emusys_lead_id`

**Files:**
- Modify: `supabase/functions/processar-matricula-emusys/index.ts` (`converterLead`, linhas 966-1005)
- Test: `tests/converterLeadNaoSobrescreveVinculo.test.mjs`

**Interfaces:**
- Consumes: nada de outra task — mudança isolada neste arquivo.
- Produces: nada consumido pela Task 1 — independentes.

- [ ] **Step 1: Escrever o teste (vai falhar — o código ainda sobrescreve incondicionalmente)**

Criar `tests/converterLeadNaoSobrescreveVinculo.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const webhookPath = 'supabase/functions/processar-matricula-emusys/index.ts';
const source = readFileSync(webhookPath, 'utf8');

test('converterLead le o lead atual antes de decidir o que sobrescrever', () => {
  assert.match(
    source,
    /const \{ data: leadAtual \} = await supabase\s*\n\s*\.from\('leads'\)\s*\n\s*\.select\('aluno_id, emusys_lead_id'\)/,
  );
});

test('so grava emusys_lead_id quando o lead ainda nao tinha um', () => {
  assert.match(
    source,
    /if \(p\.emusysLeadId && !leadAtual\?\.emusys_lead_id\) updates\.emusys_lead_id = p\.emusysLeadId;/,
  );
});

test('so grava aluno_id quando o lead ainda nao tinha um', () => {
  assert.match(
    source,
    /if \(alunoId && !leadAtual\?\.aluno_id\) updates\.aluno_id = alunoId;/,
  );
});

test('nao existe mais sobrescrita incondicional dos dois campos', () => {
  assert.doesNotMatch(
    source,
    /if \(p\.emusysLeadId\) updates\.emusys_lead_id = p\.emusysLeadId;\n\s*if \(alunoId\) updates\.aluno_id = alunoId;/,
  );
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/converterLeadNaoSobrescreveVinculo.test.mjs`
Expected: os testes 1, 2 e 3 falham (código ainda não existe); o teste 4 (`doesNotMatch`) passa
hoje, porque a sobrescrita incondicional é exatamente o código atual — vai falhar depois que
o Step 4 remover a sobrescrita antiga, então continua passando o tempo todo (é uma checagem de
regressão, não uma checagem de comportamento novo).

- [ ] **Step 3: Ler o trecho atual pra confirmar as linhas exatas antes de editar**

Run: `sed -n '966,1005p' "supabase/functions/processar-matricula-emusys/index.ts"`

Confirmar que o trecho bate com:

```ts
  if (!leadId) return { leadId: null, action: 'lead_nao_encontrado' };

  const hoje = new Date().toISOString().split('T')[0];
  const updates: any = {
    status: 'convertido',
    etapa_pipeline_id: 10,
    converteu: true,
    data_conversao: hoje,
    updated_at: new Date().toISOString(),
  };
  if (p.emusysLeadId) updates.emusys_lead_id = p.emusysLeadId;
  if (alunoId) updates.aluno_id = alunoId;

  await supabase.from('leads').update(updates).eq('id', leadId);

  return { leadId, action: 'lead_convertido' };
```

Se as linhas mudaram desde a escrita deste plano, localizar pelo texto (não pelo número).

- [ ] **Step 4: Aplicar a mudança**

Substituir o trecho acima por:

```ts
  if (!leadId) return { leadId: null, action: 'lead_nao_encontrado' };

  // Le o estado atual antes de decidir o que sobrescrever: quando dois irmaos convertem pro
  // mesmo lead (casado pelo telefone do responsavel), so o primeiro deve fixar
  // aluno_id/emusys_lead_id. O vinculo do 2o irmao com o lead ja fica registrado em
  // alunos.lead_origem_id (gravado logo abaixo, no arquivo, com a mesma guarda IS NULL), que
  // suporta N alunos por lead. leads.aluno_id/emusys_lead_id sao ponteiros 1:1 e nao devem
  // trocar de dono depois de fixados - senao o 1o irmao fica sem referencia (caso real:
  // Sophia/Luiz Felipe, lead #8025 com emusys_lead_id da Sophia e aluno_id do Luiz Felipe).
  const { data: leadAtual } = await supabase
    .from('leads')
    .select('aluno_id, emusys_lead_id')
    .eq('id', leadId)
    .maybeSingle();

  const hoje = new Date().toISOString().split('T')[0];
  const updates: any = {
    status: 'convertido',
    etapa_pipeline_id: 10,
    converteu: true,
    data_conversao: hoje,
    updated_at: new Date().toISOString(),
  };
  if (p.emusysLeadId && !leadAtual?.emusys_lead_id) updates.emusys_lead_id = p.emusysLeadId;
  if (alunoId && !leadAtual?.aluno_id) updates.aluno_id = alunoId;

  await supabase.from('leads').update(updates).eq('id', leadId);

  return { leadId, action: 'lead_convertido' };
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `node --test tests/converterLeadNaoSobrescreveVinculo.test.mjs`
Expected: PASS nos 4 testes.

- [ ] **Step 6: Checar sintaxe TypeScript do arquivo**

Run: `npx tsc --noEmit --allowJs false --target es2020 --module esnext --moduleResolution bundler "supabase/functions/processar-matricula-emusys/index.ts" 2>&1 | head -30`
Expected: sem erro novo introduzido por este diff.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/processar-matricula-emusys/index.ts tests/converterLeadNaoSobrescreveVinculo.test.mjs
git commit -m "fix(matricula): para de sobrescrever leads.aluno_id/emusys_lead_id

Quando dois irmaos (mesmo telefone do responsavel) convertem pro mesmo
lead, converterLead sobrescrevia aluno_id e emusys_lead_id sem checar
se ja havia valor - o 2o irmao a converter virava o novo dono desses
dois campos, deixando o 1o sem referencia (caso real confirmado: lead
#8025, emusys_lead_id da Sophia + aluno_id do Luiz Felipe). Agora so
grava cada campo se estiver NULL, mesma guarda que alunos.lead_origem_id
ja usa. Nao muda a contagem nem a exibicao em ComercialPage.tsx/
relatorio-admin-whatsapp - ja se defendem via selecionarLeadParaAluno."
```

---

## Self-Review

**Cobertura do spec:**
- Parte A (fallback de lead sem telefone) → Task 1, Steps 3-5. ✅
- Colisão de telefone (checagem pós-RPC, não exceção) → Task 1, Step 6-7. ✅
- Reagendamento/cancelamento sem fallback → Task 1, Step 4 (`evento === 'aula_experimental_criada'` no gate). ✅
- Parte B (parar de sobrescrever) → Task 2, Step 4. ✅
- Fora de escopo (Parte C, merge de família, mudar consumidores) → nenhuma task toca nesses
  arquivos/comportamentos. ✅

**Placeholders:** nenhum "TBD"/"implementar depois" — todo código está completo e literal em
cada step.

**Consistência de tipos/nomes:** `leadFallback`, `criarLeadFallbackExperimental`,
`colisao_telefone_familia`, `leadAtual` usados de forma idêntica em todas as referências
(implementação e teste) dentro de cada task.
