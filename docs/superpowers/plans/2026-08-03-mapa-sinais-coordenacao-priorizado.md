# Mapa de Sinais Priorizado da Coordenação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o mapa mensal ruidoso por uma projeção pública canônica, curta e determinística, separando prioridades pedagógicas, oportunidades de distribuição e pendências cadastrais de capacidade.

**Architecture:** O contrato V2 e o mapa bruto permanecem imutáveis para auditoria. Uma função pura projeta os sinais públicos, deduplica professores, aplica limites e ordenação e resume capacidade estimada; a IA e o renderizador recebem a mesma projeção, sem recalcular indicadores.

**Tech Stack:** Deno/TypeScript, Supabase Edge Functions, Node test runner, PostgreSQL 17 fixture, Vite, GitHub CLI e Supabase CLI.

---

## Mapa de arquivos

- Create: `supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.ts` — tipos, validação, seleção, deduplicação, ordenação e formatação do mapa público.
- Create: `supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.test.ts` — testes unitários da projeção e dos textos públicos.
- Modify: `supabase/functions/gemini-relatorio-coordenacao/index.ts` — produz uma projeção única, entrega-a à IA e ao renderizador e publica os três blocos aprovados.
- Delete: `supabase/functions/gemini-relatorio-coordenacao/narrativa.ts` — filtro parcial substituído pela projeção pública completa.
- Delete: `supabase/functions/gemini-relatorio-coordenacao/narrativa.test.ts` — cobertura absorvida pelo teste da projeção.
- Modify: `tests/relatorioCoordenacaoCanonico.test.mjs` — contrato estrutural da integração, linguagem pública e proibição de acesso ao mapa bruto.
- Modify: `docs/MAPA-SISTEMA.md` — registra que o mapa bruto é auditável e o relatório usa uma projeção pública única.

Nenhuma migration será criada. `get_relatorio_coordenacao_canonico_v2`, Health Score, pesos, metas e snapshots não serão alterados.

### Task 1: Criar a projeção de qualidade de capacidade

**Files:**
- Create: `supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.test.ts`
- Create: `supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.ts`

- [ ] **Step 1: Escrever os testes vermelhos de qualidade cadastral**

Criar `mapaSinaisPublico.test.ts` com os casos abaixo:

```ts
/// <reference lib="deno.ns" />

import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  listarCodigosSinaisDesconhecidos,
  projetarMapaSinaisPublico,
} from "./mapaSinaisPublico.ts";

Deno.test("capacidade estimada aparece somente na qualidade dos dados", () => {
  const sinais = [
    {
      professor_id: 1,
      professor: "Professora A",
      sinal: "capacidade_estimada_conferir",
      severidade: "medio",
      evidencias: { fonte: "estimada_segmento", turmas: [{ chave: "a" }, { chave: "b" }] },
    },
    {
      professor_id: 2,
      professor: "Professor B",
      sinal: "capacidade_estimada_conferir",
      severidade: "medio",
      evidencias: { fonte: "estimada_segmento", turmas: [{ chave: "c" }] },
    },
    {
      professor_id: 1,
      professor: "Professora A",
      sinal: "maturacao",
      severidade: "baixo",
      evidencias: { motivo: "professor_ou_base_em_maturacao" },
    },
  ] as const;
  const antes = structuredClone(sinais);
  const resultado = projetarMapaSinaisPublico(sinais);
  assertEquals(resultado.prioridades, []);
  assertEquals(resultado.oportunidades, []);
  assertEquals(resultado.qualidade_capacidade, {
    professores_afetados: 2,
    agrupamentos_estimados: 3,
  });
  assertEquals(resultado.total_sinais_publicos, 0);
  assertEquals(sinais, antes, "o mapa bruto deve permanecer imutável");
});

Deno.test("fixture auditada do Recreio resume cinco professores e nove agrupamentos", () => {
  const sinais = Array.from({ length: 5 }, (_, indice) => ({
    professor_id: indice + 1,
    professor: `Professor ${indice + 1}`,
    sinal: "capacidade_estimada_conferir",
    severidade: "medio",
    evidencias: {
      fonte: "estimada_segmento",
      turmas: Array.from({ length: indice < 4 ? 2 : 1 }, (__, turma) => ({ turma })),
    },
  }));
  assertEquals(projetarMapaSinaisPublico(sinais).qualidade_capacidade, {
    professores_afetados: 5,
    agrupamentos_estimados: 9,
  });
});

Deno.test("sinal conhecido sem evidência obrigatória falha fechado", () => {
  assertThrows(
    () => projetarMapaSinaisPublico([{
      professor_id: 1,
      professor: "Professora sem evidência",
      sinal: "capacidade_estimada_conferir",
      severidade: "medio",
      evidencias: { fonte: "estimada_segmento" },
    }]),
    Error,
    "agrupamentos de capacidade estimada",
  );
});

Deno.test("códigos desconhecidos ficam disponíveis somente para log de auditoria", () => {
  assertEquals(listarCodigosSinaisDesconhecidos([{
    professor_id: 1,
    professor: "Professor",
    sinal: "novo_sinal_interno",
    severidade: "baixo",
    evidencias: {},
  }]), ["novo_sinal_interno"]);
});
```

- [ ] **Step 2: Executar o teste e confirmar o RED**

Run: `deno test supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.test.ts`

Expected: FAIL porque `mapaSinaisPublico.ts` ainda não existe.

- [ ] **Step 3: Criar tipos e projeção mínima de qualidade**

Criar `mapaSinaisPublico.ts` com este contrato inicial:

```ts
export interface SinalBrutoCoordenacao {
  professor_id: number;
  professor: string;
  sinal: string;
  severidade: string;
  evidencias?: Record<string, unknown>;
}

export interface PrioridadePublica {
  professor_id: number;
  professor: string;
  severidade: "alto" | "medio";
  capacidade_fisica_excedida: boolean;
  agrupamentos_fisicos: number;
  carteira: number | null;
  p75_unidade: number | null;
  retencao: number | null;
  meta_retencao: number | null;
  presenca: number | null;
  meta_presenca: number | null;
  direcionamento: string;
}

export interface OportunidadePublica {
  professor_id: number;
  professor: string;
  tipo: "distribuicao" | "expansao_sustentavel";
  carteira: number;
  p50_unidade: number;
  retencao: number | null;
  presenca: number | null;
  disponibilidade_cadastrada: boolean;
}

export interface ProjecaoMapaSinaisPublico {
  prioridades: PrioridadePublica[];
  oportunidades: OportunidadePublica[];
  qualidade_capacidade: {
    professores_afetados: number;
    agrupamentos_estimados: number;
  };
  total_sinais_publicos: number;
}

const SINAIS_CONHECIDOS = new Set([
  "possivel_sobrecarga",
  "expansao_sustentavel",
  "oportunidade_distribuicao",
  "concentracao_operacional",
  "capacidade_estimada_conferir",
  "maturacao",
]);

function evidenciasDe(sinal: SinalBrutoCoordenacao): Record<string, unknown> {
  return sinal.evidencias && typeof sinal.evidencias === "object" ? sinal.evidencias : {};
}

function validarIdentidade(sinal: SinalBrutoCoordenacao): void {
  if (!Number.isInteger(sinal.professor_id) || sinal.professor_id <= 0 || !sinal.professor?.trim()) {
    throw new Error("Sinal pedagógico conhecido sem identidade válida do professor.");
  }
}

export function listarCodigosSinaisDesconhecidos(
  sinais: readonly SinalBrutoCoordenacao[],
): string[] {
  return [...new Set(sinais.map((item) => item.sinal).filter((codigo) => !SINAIS_CONHECIDOS.has(codigo)))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function projetarMapaSinaisPublico(
  sinais: readonly SinalBrutoCoordenacao[],
): ProjecaoMapaSinaisPublico {
  if (!Array.isArray(sinais)) throw new Error("Mapa de sinais canônico indisponível.");
  const capacidade = sinais.filter((sinal) => sinal.sinal === "capacidade_estimada_conferir");
  const professores = new Set<number>();
  let agrupamentos = 0;
  for (const sinal of capacidade) {
    validarIdentidade(sinal);
    const turmas = evidenciasDe(sinal).turmas;
    if (!Array.isArray(turmas)) {
      throw new Error("Não foi possível contar os agrupamentos de capacidade estimada.");
    }
    professores.add(sinal.professor_id);
    agrupamentos += turmas.length;
  }
  const prioridades: PrioridadePublica[] = [];
  const oportunidades: OportunidadePublica[] = [];
  return {
    prioridades,
    oportunidades,
    qualidade_capacidade: {
      professores_afetados: professores.size,
      agrupamentos_estimados: agrupamentos,
    },
    total_sinais_publicos: prioridades.length + oportunidades.length,
  };
}
```

- [ ] **Step 4: Executar o teste e confirmar o GREEN**

Run: `deno test supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.test.ts`

Expected: 4 tests PASS.

- [ ] **Step 5: Commitar a base da projeção**

```powershell
git add -- supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.ts supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.test.ts
git commit -m "test: fixar qualidade do mapa de sinais"
```

### Task 2: Selecionar e ordenar prioridades pedagógicas

**Files:**
- Modify: `supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.test.ts`
- Modify: `supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.ts`

- [ ] **Step 1: Adicionar testes de deduplicação, limite e ordenação**

Adicionar:

```ts
Deno.test("prioridades deduplicam professor, limitam cinco e ordenam por evidência", () => {
  const risco = (id: number, presenca: number, carteira: number) => ({
    professor_id: id,
    professor: `Professor ${id}`,
    sinal: "possivel_sobrecarga",
    severidade: "medio",
    evidencias: {
      carteira,
      p75_unidade: 24,
      retencao: 100,
      meta_retencao: 90,
      presenca,
      meta_presenca: 80,
      capacidade_fisica_excedida: false,
    },
  });
  const sinais = [
    ...[1, 2, 3, 4, 5, 6].map((id) => risco(id, 70 - id, 24 + id)),
    {
      professor_id: 3,
      professor: "Professor 3",
      sinal: "concentracao_operacional",
      severidade: "alto",
      evidencias: { capacidade_fisica_excedida: true, turmas: [{ turma_id: 10 }, { turma_id: 11 }] },
    },
  ];
  const prioridades = projetarMapaSinaisPublico(sinais).prioridades;
  assertEquals(prioridades.length, 5);
  assertEquals(prioridades[0].professor, "Professor 3");
  assertEquals(prioridades[0].agrupamentos_fisicos, 2);
  assertEquals(new Set(prioridades.map((item) => item.professor_id)).size, 5);
});

Deno.test("possível sobrecarga sem correlação canônica não vira prioridade", () => {
  const resultado = projetarMapaSinaisPublico([{
    professor_id: 1,
    professor: "Professor sem correlação",
    sinal: "possivel_sobrecarga",
    severidade: "medio",
    evidencias: {
      carteira: 20,
      p75_unidade: 24,
      presenca: 90,
      meta_presenca: 80,
      retencao: 100,
      meta_retencao: 90,
    },
  }]);
  assertEquals(resultado.prioridades, []);
});
```

- [ ] **Step 2: Executar e confirmar o RED**

Run: `deno test supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.test.ts`

Expected: FAIL porque `prioridades` ainda é vazio.

- [ ] **Step 3: Implementar a seleção factual**

Adicionar `numeroOuNull`, `abaixo` e `construirPrioridades`. A função valida `carteira > p75` e ao menos um indicador abaixo da meta, exceto quando houver capacidade física comprovada; agrupa por professor, une os dois sinais e aplica o limite de cinco.

```ts
function numeroOuNull(valor: unknown): number | null {
  const numero = Number(valor);
  return valor !== null && valor !== undefined && valor !== "" && Number.isFinite(numero) ? numero : null;
}

function abaixo(valor: number | null, meta: number | null): boolean {
  return valor !== null && meta !== null && valor < meta;
}

function construirPrioridades(
  sinais: readonly SinalBrutoCoordenacao[],
): PrioridadePublica[] {
  const grupos = new Map<number, SinalBrutoCoordenacao[]>();
  for (const sinal of sinais) {
    if (sinal.sinal !== "possivel_sobrecarga" && sinal.sinal !== "concentracao_operacional") continue;
    validarIdentidade(sinal);
    const evidencia = evidenciasDe(sinal);
    const carteira = numeroOuNull(evidencia.carteira);
    const p75 = numeroOuNull(evidencia.p75_unidade);
    const retencao = numeroOuNull(evidencia.retencao);
    const metaRetencao = numeroOuNull(evidencia.meta_retencao);
    const presenca = numeroOuNull(evidencia.presenca);
    const metaPresenca = numeroOuNull(evidencia.meta_presenca);
    const fisica = evidencia.capacidade_fisica_excedida === true;
    const publicavel = sinal.sinal === "concentracao_operacional"
      ? fisica && Array.isArray(evidencia.turmas)
      : carteira !== null && p75 !== null && carteira > p75
        && (abaixo(retencao, metaRetencao) || abaixo(presenca, metaPresenca) || fisica);
    if (!publicavel) continue;
    grupos.set(sinal.professor_id, [...(grupos.get(sinal.professor_id) || []), sinal]);
  }

  return [...grupos.values()].map((grupo) => {
    const risco = grupo.find((item) => item.sinal === "possivel_sobrecarga");
    const fisico = grupo.find((item) => item.sinal === "concentracao_operacional");
    const evidencia = risco ? evidenciasDe(risco) : {};
    const turmas = fisico ? evidenciasDe(fisico).turmas : [];
    return {
      professor_id: grupo[0].professor_id,
      professor: grupo[0].professor,
      severidade: fisico ? "alto" : "medio",
      capacidade_fisica_excedida: Boolean(fisico),
      agrupamentos_fisicos: Array.isArray(turmas) ? turmas.length : 0,
      carteira: numeroOuNull(evidencia.carteira),
      p75_unidade: numeroOuNull(evidencia.p75_unidade),
      retencao: numeroOuNull(evidencia.retencao),
      meta_retencao: numeroOuNull(evidencia.meta_retencao),
      presenca: numeroOuNull(evidencia.presenca),
      meta_presenca: numeroOuNull(evidencia.meta_presenca),
      direcionamento: fisico
        ? "conferir ocupação física e redistribuir turmas quando necessário"
        : "revisar distribuição de carteira e rotina pedagógica",
    } satisfies PrioridadePublica;
  }).sort((a, b) => {
    const severidade = Number(b.severidade === "alto") - Number(a.severidade === "alto");
    if (severidade !== 0) return severidade;
    const fisica = Number(b.capacidade_fisica_excedida) - Number(a.capacidade_fisica_excedida);
    if (fisica !== 0) return fisica;
    const sinaisA = Number(abaixo(a.retencao, a.meta_retencao)) + Number(abaixo(a.presenca, a.meta_presenca));
    const sinaisB = Number(abaixo(b.retencao, b.meta_retencao)) + Number(abaixo(b.presenca, b.meta_presenca));
    if (sinaisA !== sinaisB) return sinaisB - sinaisA;
    const deficitRetencaoA = (a.meta_retencao ?? 0) - (a.retencao ?? a.meta_retencao ?? 0);
    const deficitRetencaoB = (b.meta_retencao ?? 0) - (b.retencao ?? b.meta_retencao ?? 0);
    if (deficitRetencaoA !== deficitRetencaoB) return deficitRetencaoB - deficitRetencaoA;
    const deficitPresencaA = (a.meta_presenca ?? 0) - (a.presenca ?? a.meta_presenca ?? 0);
    const deficitPresencaB = (b.meta_presenca ?? 0) - (b.presenca ?? b.meta_presenca ?? 0);
    if (deficitPresencaA !== deficitPresencaB) return deficitPresencaB - deficitPresencaA;
    const distanciaA = (a.carteira ?? 0) - (a.p75_unidade ?? a.carteira ?? 0);
    const distanciaB = (b.carteira ?? 0) - (b.p75_unidade ?? b.carteira ?? 0);
    if (distanciaA !== distanciaB) return distanciaB - distanciaA;
    return a.professor.localeCompare(b.professor, "pt-BR", { sensitivity: "base" });
  }).slice(0, 5);
}
```

Substituir o array vazio por `const prioridades = construirPrioridades(sinais);`.

- [ ] **Step 4: Executar os testes**

Run: `deno test supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.test.ts`

Expected: todos os testes PASS.

- [ ] **Step 5: Commitar prioridades**

```powershell
git add -- supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.ts supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.test.ts
git commit -m "feat: priorizar sinais pedagógicos factuais"
```

### Task 3: Selecionar oportunidades e formatar os três blocos

**Files:**
- Modify: `supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.test.ts`
- Modify: `supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.ts`

- [ ] **Step 1: Escrever testes vermelhos de oportunidades e texto público**

Adicionar os imports dos formatadores e os casos:

```ts
import {
  formatarOportunidadesPublicas,
  formatarPrioridadesPublicas,
  formatarQualidadeCapacidade,
} from "./mapaSinaisPublico.ts";

Deno.test("oportunidades são limitadas, ordenadas e não repetem prioridade", () => {
  const oportunidades = [1, 2, 3, 4].map((id) => ({
    professor_id: id,
    professor: `Professor ${id}`,
    sinal: id === 4 ? "expansao_sustentavel" : "oportunidade_distribuicao",
    severidade: "baixo",
    evidencias: {
      carteira: id,
      p50_unidade: 10,
      retencao: 100,
      presenca: 90,
      disponibilidade_cadastrada: id !== 4,
    },
  }));
  const prioridade = {
    professor_id: 1,
    professor: "Professor 1",
    sinal: "possivel_sobrecarga",
    severidade: "medio",
    evidencias: {
      carteira: 30,
      p75_unidade: 24,
      retencao: 80,
      meta_retencao: 90,
      presenca: 70,
      meta_presenca: 80,
    },
  };
  const resultado = projetarMapaSinaisPublico([...oportunidades, prioridade]);
  assertEquals(resultado.oportunidades.map((item) => item.professor), [
    "Professor 2",
    "Professor 3",
    "Professor 4",
  ]);
  assertEquals(resultado.total_sinais_publicos, resultado.prioridades.length + 3);
});

Deno.test("formatadores publicam evidência factual e capacidade apenas na qualidade", () => {
  const resultado = projetarMapaSinaisPublico([{
    professor_id: 1,
    professor: "Professor Prioritário",
    sinal: "possivel_sobrecarga",
    severidade: "medio",
    evidencias: {
      carteira: 30,
      p75_unidade: 24,
      retencao: 100,
      meta_retencao: 90,
      presenca: 67.5,
      meta_presenca: 80,
    },
  }, {
    professor_id: 2,
    professor: "Professor Disponível",
    sinal: "oportunidade_distribuicao",
    severidade: "baixo",
    evidencias: {
      carteira: 6,
      p50_unidade: 13.5,
      retencao: 100,
      presenca: 81,
      disponibilidade_cadastrada: true,
    },
  }, {
    professor_id: 3,
    professor: "Professor Cadastro",
    sinal: "capacidade_estimada_conferir",
    severidade: "medio",
    evidencias: { fonte: "estimada_segmento", turmas: [{ chave: "x" }] },
  }]);
  const prioridades = formatarPrioridadesPublicas(resultado);
  const oportunidades = formatarOportunidadesPublicas(resultado);
  const qualidade = formatarQualidadeCapacidade(resultado);
  assertEquals(prioridades.includes("Possível sobrecarga"), false);
  assertEquals(prioridades.includes("Carteira: *30* | Referência superior da unidade: *24*"), true);
  assertEquals(oportunidades.includes("Professor Disponível"), true);
  assertEquals(qualidade.includes("*1* agrupamento de ocupação de *1* professor"), true);
  assertEquals(qualidade.includes("não representa sobrecarga e não altera nota"), true);
});
```

- [ ] **Step 2: Executar e confirmar o RED**

Run: `deno test supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.test.ts`

Expected: FAIL porque oportunidades e formatadores ainda não existem.

- [ ] **Step 3: Implementar oportunidades e impedir sobreposição**

Adicionar a função e usar seu retorno na projeção:

```ts
function construirOportunidades(
  sinais: readonly SinalBrutoCoordenacao[],
  prioridades: readonly PrioridadePublica[],
): OportunidadePublica[] {
  const bloqueados = new Set(prioridades.map((item) => item.professor_id));
  const porProfessor = new Map<number, OportunidadePublica>();
  for (const sinal of sinais) {
    if (sinal.sinal !== "oportunidade_distribuicao" && sinal.sinal !== "expansao_sustentavel") continue;
    validarIdentidade(sinal);
    if (bloqueados.has(sinal.professor_id)) continue;
    const evidencia = evidenciasDe(sinal);
    const carteira = numeroOuNull(evidencia.carteira);
    const p50 = numeroOuNull(evidencia.p50_unidade);
    if (carteira === null || p50 === null) continue;
    const distribuicao = sinal.sinal === "oportunidade_distribuicao";
    if (distribuicao && (carteira >= p50 || evidencia.disponibilidade_cadastrada !== true)) continue;
    if (!distribuicao && carteira < p50) continue;
    porProfessor.set(sinal.professor_id, {
      professor_id: sinal.professor_id,
      professor: sinal.professor,
      tipo: distribuicao ? "distribuicao" : "expansao_sustentavel",
      carteira,
      p50_unidade: p50,
      retencao: numeroOuNull(evidencia.retencao),
      presenca: numeroOuNull(evidencia.presenca),
      disponibilidade_cadastrada: evidencia.disponibilidade_cadastrada === true,
    });
  }
  return [...porProfessor.values()].sort((a, b) => {
    if (a.tipo !== b.tipo) return a.tipo === "distribuicao" ? -1 : 1;
    const distanciaA = Math.abs(a.carteira - a.p50_unidade);
    const distanciaB = Math.abs(b.carteira - b.p50_unidade);
    if (distanciaA !== distanciaB) return distanciaB - distanciaA;
    return a.professor.localeCompare(b.professor, "pt-BR", { sensitivity: "base" });
  }).slice(0, 3);
}
```

No corpo da projeção:

```ts
const prioridades = construirPrioridades(sinais);
const oportunidades = construirOportunidades(sinais, prioridades);
```

- [ ] **Step 4: Implementar os formatadores determinísticos**

Adicionar:

```ts
function pt(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function plural(total: number, singular: string, plural: string): string {
  return total === 1 ? singular : plural;
}

export function formatarPrioridadesPublicas(projecao: ProjecaoMapaSinaisPublico): string {
  if (projecao.prioridades.length === 0) return "• Nenhuma prioridade pedagógica registrada neste período.";
  return projecao.prioridades.map((item, indice) => {
    const linhas = [`${indice + 1}. *${item.professor}*`];
    if (item.capacidade_fisica_excedida) {
      linhas.push(`   • Ocupação acima da capacidade física cadastrada: *${item.agrupamentos_fisicos}* ${plural(item.agrupamentos_fisicos, "agrupamento", "agrupamentos")}.`);
    }
    if (item.carteira !== null && item.p75_unidade !== null) {
      linhas.push(`   • Carteira: *${pt(item.carteira)}* | Referência superior da unidade: *${pt(item.p75_unidade)}*`);
    }
    if (abaixo(item.presenca, item.meta_presenca)) {
      linhas.push(`   • Presença: *${pt(item.presenca!)}%* | Referência: *${pt(item.meta_presenca!)}%*`);
    }
    if (abaixo(item.retencao, item.meta_retencao)) {
      linhas.push(`   • Retenção: *${pt(item.retencao!)}%* | Referência: *${pt(item.meta_retencao!)}%*`);
    }
    linhas.push(`   • Direcionamento: ${item.direcionamento}`);
    return linhas.join(String.fromCharCode(10));
  }).join(`${String.fromCharCode(10)}${String.fromCharCode(10)}`);
}

export function formatarOportunidadesPublicas(projecao: ProjecaoMapaSinaisPublico): string {
  if (projecao.oportunidades.length === 0) return "• Nenhuma oportunidade de distribuição registrada neste período.";
  return projecao.oportunidades.map((item) => item.tipo === "distribuicao"
    ? `• *${item.professor}* — carteira ${pt(item.carteira)}, abaixo da referência ${pt(item.p50_unidade)}, com disponibilidade cadastrada.`
    : `• *${item.professor}* — expansão sustentável com carteira ${pt(item.carteira)}, presença ${item.presenca === null ? "não calculável" : `${pt(item.presenca)}%`} e retenção ${item.retencao === null ? "não calculável" : `${pt(item.retencao)}%`}.`
  ).join(String.fromCharCode(10));
}

export function formatarQualidadeCapacidade(projecao: ProjecaoMapaSinaisPublico): string {
  const { professores_afetados, agrupamentos_estimados } = projecao.qualidade_capacidade;
  if (professores_afetados === 0) return "• Leitura de capacidade: nenhuma pendência cadastral identificada.";
  return [
    `• Leitura de capacidade: *${agrupamentos_estimados}* ${plural(agrupamentos_estimados, "agrupamento de ocupação", "agrupamentos de ocupação")} de *${professores_afetados}* ${plural(professores_afetados, "professor", "professores")} usam apenas referência estimada.`,
    "• Complementar os vínculos de turma e sala para permitir a leitura de capacidade física.",
    "• Essa pendência não representa sobrecarga e não altera nota ou prioridade pedagógica.",
  ].join(String.fromCharCode(10));
}
```

- [ ] **Step 5: Executar testes e checagem do módulo**

Run:

```powershell
deno test supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.test.ts
deno check supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.ts
```

Expected: testes PASS e TypeScript sem erro.

- [ ] **Step 6: Commitar oportunidades e formatação**

```powershell
git add -- supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.ts supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.test.ts
git commit -m "feat: publicar oportunidades e qualidade do mapa"
```

### Task 4: Fazer IA e renderizador consumirem a mesma projeção

**Files:**
- Modify: `tests/relatorioCoordenacaoCanonico.test.mjs`
- Modify: `supabase/functions/gemini-relatorio-coordenacao/index.ts`
- Delete: `supabase/functions/gemini-relatorio-coordenacao/narrativa.ts`
- Delete: `supabase/functions/gemini-relatorio-coordenacao/narrativa.test.ts`

- [ ] **Step 1: Substituir integralmente o teste estrutural antigo**

Substituir o teste `relatorio explica amostra e capacidade estimada sem prescrever sobrecarga` pelo teste abaixo, preservando também as garantias das linhas experimentais:

```js
test('IA e renderer usam a mesma projeção pública do mapa de sinais', () => {
  const source = fs.readFileSync(edgePath, 'utf8');
  const rendererStart = source.indexOf('function renderizarRelatorio');
  const renderer = source.slice(rendererStart);
  assert.match(source, /projetarMapaSinaisPublico/i);
  assert.match(source, /const\s+mapaPublico\s*=\s*projetarMapaSinaisPublico\(contrato\.mapa_sinais\)/i);
  assert.match(source, /gerarNarrativa\(contrato,\s*mapaPublico,/i);
  assert.match(source, /renderizarRelatorio\(contrato,\s*narrativa,\s*mapaPublico\)/i);
  assert.match(source, /mapa_sinais_publico:\s*\{[\s\S]*prioridades:\s*mapaPublico\.prioridades[\s\S]*oportunidades:\s*mapaPublico\.oportunidades/i);
  assert.doesNotMatch(renderer, /dados\.mapa_sinais\.map/i);
  assert.match(renderer, /PRIORIDADES PEDAGÓGICAS/i);
  assert.match(renderer, /OPORTUNIDADES DE DISTRIBUIÇÃO/i);
  assert.match(renderer, /formatarQualidadeCapacidade\(mapaPublico\)/i);
  assert.match(renderer, /mapaPublico\.total_sinais_publicos/i);
  assert.match(renderer, /Professores com amostra m[ií]nima observada/i);
  assert.match(renderer, /Convers[aã]o compondo a nota hist[oó]rica/i);
  assert.doesNotMatch(renderer, /Capacidade estimada . conferir cadastro/i);
});
```

No teste de linguagem pública, trocar `MAPA DE SINAIS` por `PRIORIDADES PEDAGÓGICAS` e `OPORTUNIDADES DE DISTRIBUIÇÃO`.

- [ ] **Step 2: Executar e confirmar o RED**

Run: `node --test tests/relatorioCoordenacaoCanonico.test.mjs`

Expected: FAIL porque a Edge ainda usa o filtro e o mapa bruto.

- [ ] **Step 3: Trocar o import e as assinaturas**

Substituir o import antigo por:

```ts
import {
  formatarOportunidadesPublicas,
  formatarPrioridadesPublicas,
  formatarQualidadeCapacidade,
  listarCodigosSinaisDesconhecidos,
  projetarMapaSinaisPublico,
  type ProjecaoMapaSinaisPublico,
} from "./mapaSinaisPublico.ts";
```

Remover `rotulosSinais`, que ficará sem consumidor. Substituir `narrativaDeterministica` por:

```ts
function narrativaDeterministica(
  dados: RelatorioCoordenacaoCanonico,
  mapaPublico: ProjecaoMapaSinaisPublico,
): NarrativaCoordenacao {
  const resumo = dados.resumo_equipe;
  const total = inteiro(resumo.total_professores);
  const comScore = inteiro(resumo.com_score);
  const pendentes = inteiro(resumo.com_evidencia_pendente);
  return {
    resumo: `A equipe tem ${total} professores ativos; ${comScore} possuem nota disponível e ${pendentes} precisam completar evidências. O período deve ser lido como diagnóstico pedagógico, com foco em apoio e evolução.`,
    conquistas: [
      `${inteiro(resumo.saudaveis)} professores aparecem em faixa saudável entre os que possuem evidência suficiente.`,
      `${inteiro(dados.presenca.professores_com_evidencia)} professores possuem presença observável no período.`,
    ],
    pontos_atencao: mapaPublico.prioridades.slice(0, 3)
      .map((item) => `${item.professor}: revisar as evidências pedagógicas destacadas no mapa priorizado.`),
    treinamentos: [],
    plano_acao: [
      "Revisar primeiro as prioridades pedagógicas com evidências concretas.",
      "Tratar pendências cadastrais na qualidade dos dados, sem convertê-las em julgamento do professor.",
      "Acompanhar carteira, presença e retenção em conjunto, sem usar um indicador isolado como julgamento.",
    ],
  };
}
```

Alterar `gerarNarrativa` para:

```ts
async function gerarNarrativa(
  dados: RelatorioCoordenacaoCanonico,
  mapaPublico: ProjecaoMapaSinaisPublico,
  apiKey: string | undefined,
): Promise<NarrativaCoordenacao> {
  const fallback = narrativaDeterministica(dados, mapaPublico);
```

No objeto enviado à IA, enviar somente prioridades e oportunidades; `qualidade_capacidade` permanece exclusiva do renderizador determinístico:

```ts
mapa_sinais_publico: {
  prioridades: mapaPublico.prioridades,
  oportunidades: mapaPublico.oportunidades,
},
```

Adicionar ao prompt:

```ts
"Prioridades, oportunidades, limites e ordenação já estão prontos na projeção pública; não promova, remova ou reclassifique professores.",
"Pontos de atenção e treinamentos podem mencionar somente professores presentes em prioridades; oportunidades servem apenas à redistribuição ou conquista.",
```

- [ ] **Step 4: Renderizar os blocos e a contagem pública**

Alterar a assinatura, remover `descreverSinal` e o acesso `dados.mapa_sinais.map`:

```ts
function renderizarRelatorio(
  dados: RelatorioCoordenacaoCanonico,
  narrativa: NarrativaCoordenacao,
  mapaPublico: ProjecaoMapaSinaisPublico,
): string {
```

Substituir o bloco antigo por:

```ts
"🚦 *PRIORIDADES PEDAGÓGICAS*",
"───────────────────────",
formatarPrioridadesPublicas(mapaPublico),
"",
"🌱 *OPORTUNIDADES DE DISTRIBUIÇÃO*",
"───────────────────────",
formatarOportunidadesPublicas(mapaPublico),
```

Substituir a contagem por:

```ts
`• Sinais públicos de carga ou distribuição: *${inteiro(mapaPublico.total_sinais_publicos)}*`,
```

No bloco `QUALIDADE DOS DADOS`, acrescentar:

```ts
formatarQualidadeCapacidade(mapaPublico),
```

- [ ] **Step 5: Construir a projeção uma vez e auditar desconhecidos**

Após validar o contrato:

```ts
if (!Array.isArray(contrato.mapa_sinais)) {
  throw new Error("O mapa pedagógico retornou incompleto.");
}
const mapaPublico = projetarMapaSinaisPublico(contrato.mapa_sinais);
const codigosDesconhecidos = listarCodigosSinaisDesconhecidos(contrato.mapa_sinais);
if (codigosDesconhecidos.length > 0) {
  console.warn("Códigos de sinais não publicados:", codigosDesconhecidos.join(", "));
}
const narrativa = await gerarNarrativa(contrato, mapaPublico, Deno.env.get("OPENAI_API_KEY"));
const relatorio = renderizarRelatorio(contrato, narrativa, mapaPublico);
```

Excluir `narrativa.ts` e `narrativa.test.ts`.

- [ ] **Step 6: Executar testes e checagem TypeScript**

```powershell
deno test supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.test.ts
deno check supabase/functions/gemini-relatorio-coordenacao/index.ts
node --test tests/relatorioCoordenacaoCanonico.test.mjs
```

Expected: tudo PASS.

- [ ] **Step 7: Commitar a integração**

```powershell
git add -- supabase/functions/gemini-relatorio-coordenacao/index.ts supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.ts supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.test.ts tests/relatorioCoordenacaoCanonico.test.mjs
git rm -- supabase/functions/gemini-relatorio-coordenacao/narrativa.ts supabase/functions/gemini-relatorio-coordenacao/narrativa.test.ts
git commit -m "fix: priorizar mapa público da coordenação"
```

### Task 5: Fechar regressão, PostgreSQL e documentação

**Files:**
- Modify: `docs/MAPA-SISTEMA.md`

- [ ] **Step 1: Atualizar o mapa do sistema**

Na seção do relatório mensal da Coordenação, acrescentar:

```markdown
O `mapa_sinais` bruto permanece no contrato V2 para auditoria. A Edge produz uma projeção pública única e determinística, compartilhada pelo renderizador e pela IA: no máximo cinco prioridades, três oportunidades e um resumo agregado de capacidade estimada em Qualidade dos dados. Pendência de turma/sala não altera Health Score nem gera prioridade pedagógica.
```

- [ ] **Step 2: Executar a regressão dirigida**

```powershell
deno test supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.test.ts
deno check supabase/functions/gemini-relatorio-coordenacao/index.ts
node --test --test-concurrency=1 tests/relatorioCoordenacaoCanonico.test.mjs tests/healthScoreProfessorV3SinaisCapacidade.test.mjs
```

Expected: tudo PASS.

- [ ] **Step 3: Executar fixtures PostgreSQL reais**

```powershell
node --test --test-concurrency=1 tests/healthScoreProfessorV3SinaisCapacidadePostgres.test.mjs tests/relatorioCoordenacaoCanonicoPostgres.test.mjs
```

Expected: PASS. As fixtures confirmam que o produtor bruto continua separando concentração física de capacidade estimada; nenhum SQL ou snapshot foi alterado.

- [ ] **Step 4: Executar build e inspeção de escopo**

```powershell
npm run build
git diff --check origin/main...HEAD
git status --short
git diff --name-only origin/main...HEAD
```

Expected: build PASS, `git diff --check` sem saída e somente os arquivos deste plano.

- [ ] **Step 5: Commitar documentação**

```powershell
git add -- docs/MAPA-SISTEMA.md
git commit -m "docs: registrar projeção pública dos sinais"
```

### Task 6: Integrar, publicar a Edge e verificar produção

**Files:**
- No source file changes expected.

- [ ] **Step 1: Reconciliar a branch sem tocar no worktree principal**

No worktree `mapa-sinais-coordenacao-priorizado`:

```powershell
git fetch origin
git rebase origin/main
git status --short --branch
```

Expected: branch limpa e à frente de `origin/main`. Em conflito, interromper e revisar apenas os arquivos deste plano; nunca descartar alterações remotas.

- [ ] **Step 2: Repetir a verificação final após o rebase**

```powershell
deno test supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.test.ts
deno check supabase/functions/gemini-relatorio-coordenacao/index.ts
node --test --test-concurrency=1 tests/relatorioCoordenacaoCanonico.test.mjs tests/healthScoreProfessorV3SinaisCapacidade.test.mjs tests/healthScoreProfessorV3SinaisCapacidadePostgres.test.mjs tests/relatorioCoordenacaoCanonicoPostgres.test.mjs
npm run build
```

Expected: tudo PASS.

- [ ] **Step 3: Push, PR e merge com checks verdes**

```powershell
git push -u origin fix/mapa-sinais-coordenacao-priorizado
gh pr create --base main --head fix/mapa-sinais-coordenacao-priorizado --title "fix: priorizar mapa de sinais da coordenação" --body "Publica uma projeção única e determinística para prioridades, oportunidades e qualidade de capacidade. Preserva o mapa bruto, Health Score e snapshots."
gh pr checks --watch
gh pr merge --squash --delete-branch
```

Expected: PR integrada na `main`; nenhuma migration incluída.

- [ ] **Step 4: Criar worktree limpo da main mesclada para deploy**

```powershell
git fetch origin
git worktree add --detach "D:\2026\LA-performance-report\.worktrees\deploy-mapa-sinais-coordenacao" origin/main
git -C "D:\2026\LA-performance-report\.worktrees\deploy-mapa-sinais-coordenacao" status --short --branch
```

Expected: worktree destacado em `origin/main` e limpo.

- [ ] **Step 5: Confirmar alvo e publicar somente a Edge**

No worktree limpo:

```powershell
Select-String -LiteralPath supabase/config.toml -Pattern 'project_id = "ouqwbbermlzqqvtqwlul"'
supabase functions deploy gemini-relatorio-coordenacao --project-ref ouqwbbermlzqqvtqwlul
supabase functions list --project-ref ouqwbbermlzqqvtqwlul
```

Expected: projeto confirmado e `gemini-relatorio-coordenacao` publicada. Não executar `supabase db push`.

- [ ] **Step 6: Fazer smoke test autenticado**

No navegador autenticado, abrir `https://la-performance-report.vercel.app/app/professores`, selecionar Recreio e Julho/2026, clicar `Gerar Relatório Coordenação` e gerar o relatório mensal com IA. Conferir:

```text
🚦 PRIORIDADES PEDAGÓGICAS
🌱 OPORTUNIDADES DE DISTRIBUIÇÃO
🔎 QUALIDADE DOS DADOS
```

Validar também:

- no máximo cinco prioridades e três oportunidades;
- nenhum professor repetido dentro do mesmo bloco;
- nenhuma linha `Capacidade estimada — conferir cadastro` em prioridade, treinamento ou plano de ação;
- Qualidade dos dados resume 5 professores e 9 agrupamentos no recorte auditado do Recreio/Julho;
- total público de carga/distribuição igual a prioridades mais oportunidades;
- acentos e emojis em UTF-8, sem `(1/2)` ou `(2/2)`.

Expected: todos os critérios atendidos. A IA não pode alterar seleção, ordem ou números da projeção.

- [ ] **Step 7: Registrar o estado final**

```powershell
git -C "D:\2026\LA-performance-report\.worktrees\deploy-mapa-sinais-coordenacao" rev-parse HEAD
supabase functions list --project-ref ouqwbbermlzqqvtqwlul
gh pr view --json number,state,mergeCommit,url
```

Expected: hash da `main`, PR `MERGED` e versão ativa da Edge registrados no handoff.
