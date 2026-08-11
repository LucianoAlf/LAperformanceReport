# Conversão de Campanhas WhatsApp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar quantos matriculados vieram de cada campanha de WhatsApp (aba "Conversão" comparando todas) e trocar o Drawer lateral de detalhe por uma página própria (`/app/campanhas/:campanhaId`) que mostra template completo, conversão, conversas e contatos sem cortar nada.

**Architecture:** Lógica de atribuição/cálculo pura e testável em `src/lib/campanhasConversao.mjs` (segue o padrão já usado em `carteiraFallbackContratual.mjs`, testado com `node --test`). Um hook React (`useConversaoCampanhas`) faz a busca no Supabase e aplica essa lógica + a regra canônica de matrícula já existente (`ehMatriculaComercialCanonica`). A UI ganha uma aba nova (`ConversaoTab`) e uma página nova (`CampanhaDetalhePage`), que assume o conteúdo hoje só disponível no `CampanhaDrawer.tsx` (removido ao final).

**Tech Stack:** React 19 + TypeScript, React Router 7 (`useParams`/`useNavigate`), Supabase JS client, Tailwind (dark theme já estabelecido no módulo), Node `--test` para a lib pura.

## Global Constraints

- Nenhuma RPC, hook ou métrica existente é alterada — tudo aqui é leitura nova.
- Não duplicar a regra de "o que conta como matrícula": importar `ehMatriculaComercialCanonica` de `src/lib/comercialMatriculasCanonicas.ts` — nunca reimplementar.
- Atribuição de conversão por campanha = `leads_campanhas.campanha_slug` (extraído de `agentes.tools[].config.campanha_label`, agente vinculado ao mesmo `numero_meta_id` da campanha) **+** `leads.unidade_id = campanhas.unidade_id`. Campanha sem agente/label correspondente retorna `leadsGerados=0`, nunca lança erro.
- `custoPorMatricula` é `null` (renderiza "—") quando `matriculados === 0` — nunca dividir por zero.
- Sem filtro de período adicional na aba Conversão (cada linha de `campanhas` já é uma unidade de disparo própria).
- Sem assinatura realtime (`postgres_changes`) na página de detalhamento.
- Seguir a convenção do repo: lógica pura/testável vira `.mjs` em `src/lib/` com teste em `tests/*.test.mjs` registrado no script `test` do `package.json`; hooks React com chamada a Supabase não têm teste automatizado (nenhum hook do módulo Campanhas tem hoje — `useCampanhas.ts`, `useContatosCampanha.ts`, `useConversasCampanha.ts` — mantém o padrão).

---

### Task 1: Lib pura de atribuição/cálculo (`campanhasConversao.mjs`)

**Files:**
- Create: `src/lib/campanhasConversao.mjs`
- Create: `tests/campanhasConversao.test.mjs`
- Modify: `package.json:10` (adicionar o novo arquivo de teste ao script `test`)

**Interfaces:**
- Produces: `extrairCampanhaLabel(agentes: Array<{ tools: any[] }>): string | null`, `filtrarLeadsCampanhaPorUnidade(linhas: Array<{ leads: any }>, unidadeId: string): Array<any>`, `calcularTaxaConversao(leadsGerados: number, matriculados: number): number`, `calcularCustoPorMatricula(custoReal: number, matriculados: number): number | null`

- [ ] **Step 1: Escrever os testes (devem falhar — módulo ainda não existe)**

Criar `tests/campanhasConversao.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extrairCampanhaLabel,
  filtrarLeadsCampanhaPorUnidade,
  calcularTaxaConversao,
  calcularCustoPorMatricula,
} from '../src/lib/campanhasConversao.mjs';

test('extrairCampanhaLabel acha o label na tool "transfer" do primeiro agente que tiver', () => {
  const agentes = [
    { tools: [{ name: 'think', config: {} }, { name: 'transfer', config: { campanha_label: 'feirao-matriculas26' } }] },
  ];
  assert.equal(extrairCampanhaLabel(agentes), 'feirao-matriculas26');
});

test('extrairCampanhaLabel retorna null quando nenhum agente tem campanha_label', () => {
  const agentes = [{ tools: [{ name: 'transfer', config: {} }] }, { tools: [] }];
  assert.equal(extrairCampanhaLabel(agentes), null);
});

test('extrairCampanhaLabel retorna null para lista vazia ou undefined', () => {
  assert.equal(extrairCampanhaLabel([]), null);
  assert.equal(extrairCampanhaLabel(undefined), null);
});

test('filtrarLeadsCampanhaPorUnidade mantém só linhas cujo lead.unidade_id bate (lead como objeto)', () => {
  const linhas = [
    { lead_id: 1, leads: { unidade_id: 'cg' } },
    { lead_id: 2, leads: { unidade_id: 'barra' } },
    { lead_id: 3, leads: { unidade_id: 'cg' } },
  ];
  const resultado = filtrarLeadsCampanhaPorUnidade(linhas, 'cg');
  assert.equal(resultado.length, 2);
  assert.deepEqual(resultado.map(r => r.lead_id), [1, 3]);
});

test('filtrarLeadsCampanhaPorUnidade lida com lead vindo como array (embed one-to-many do PostgREST)', () => {
  const linhas = [{ lead_id: 1, leads: [{ unidade_id: 'cg' }] }];
  const resultado = filtrarLeadsCampanhaPorUnidade(linhas, 'cg');
  assert.equal(resultado.length, 1);
});

test('filtrarLeadsCampanhaPorUnidade descarta linha sem lead vinculado', () => {
  const linhas = [{ lead_id: 1, leads: null }];
  assert.equal(filtrarLeadsCampanhaPorUnidade(linhas, 'cg').length, 0);
});

test('calcularTaxaConversao divide matriculados por leads gerados', () => {
  assert.equal(calcularTaxaConversao(37, 4), 4 / 37);
});

test('calcularTaxaConversao retorna 0 quando não há leads (nunca divide por zero)', () => {
  assert.equal(calcularTaxaConversao(0, 0), 0);
});

test('calcularCustoPorMatricula divide custo real pelos matriculados', () => {
  assert.equal(calcularCustoPorMatricula(16.57, 4), 16.57 / 4);
});

test('calcularCustoPorMatricula retorna null quando não há matriculados (nunca divide por zero)', () => {
  assert.equal(calcularCustoPorMatricula(112.19, 0), null);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `node --test tests/campanhasConversao.test.mjs`
Expected: FAIL — `Cannot find module '../src/lib/campanhasConversao.mjs'`

- [ ] **Step 3: Implementar `src/lib/campanhasConversao.mjs`**

```js
/**
 * Lógica pura de atribuição de leads a campanhas de WhatsApp e cálculo de
 * conversão/custo. Sem dependência de React/Supabase — só transforma dados
 * já buscados. Ver docs/superpowers/specs/2026-08-11-conversao-campanhas-whatsapp-design.md
 */

export function extrairCampanhaLabel(agentes) {
  for (const agente of agentes ?? []) {
    const tools = Array.isArray(agente?.tools) ? agente.tools : [];
    const transferTool = tools.find((t) => t?.name === 'transfer');
    const label = transferTool?.config?.campanha_label;
    if (label) return label;
  }
  return null;
}

function primeiroLead(linha) {
  const leads = linha?.leads;
  if (Array.isArray(leads)) return leads[0] ?? null;
  return leads ?? null;
}

export function filtrarLeadsCampanhaPorUnidade(linhas, unidadeId) {
  return (linhas ?? []).filter((linha) => {
    const lead = primeiroLead(linha);
    return lead != null && lead.unidade_id === unidadeId;
  });
}

export function calcularTaxaConversao(leadsGerados, matriculados) {
  if (!leadsGerados) return 0;
  return matriculados / leadsGerados;
}

export function calcularCustoPorMatricula(custoReal, matriculados) {
  if (!matriculados) return null;
  return custoReal / matriculados;
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test tests/campanhasConversao.test.mjs`
Expected: PASS — 10 testes, 0 falhas

- [ ] **Step 5: Registrar o novo teste no script `test` do `package.json`**

Editar a linha 10 de `package.json`, acrescentando `tests/campanhasConversao.test.mjs` à lista de arquivos do comando `node --test`.

- [ ] **Step 6: Rodar a suíte completa pra confirmar que nada quebrou**

Run: `npm test`
Expected: PASS — todos os arquivos, incluindo o novo

- [ ] **Step 7: Commit**

```bash
git add src/lib/campanhasConversao.mjs tests/campanhasConversao.test.mjs package.json
git commit -m "feat(campanhas): lib pura de atribuição e cálculo de conversão"
```

---

### Task 2: Hook `useConversaoCampanhas`

**Files:**
- Create: `src/components/App/Campanhas/hooks/useConversaoCampanhas.ts`

**Interfaces:**
- Consumes: `extrairCampanhaLabel`, `filtrarLeadsCampanhaPorUnidade`, `calcularTaxaConversao`, `calcularCustoPorMatricula` (Task 1, `@/lib/campanhasConversao.mjs`); `ehMatriculaComercialCanonica` (`@/lib/comercialMatriculasCanonicas`)
- Produces: `useConversaoCampanhas(campanhaId?: string | null): { conversoes: ConversaoCampanha[]; loading: boolean; error: string | null }` onde

```ts
export interface MatriculaConversao {
  leadId: number
  alunoId: number
  nome: string
  dataMatricula: string | null
}

export interface ConversaoCampanha {
  campanhaId: string
  campanhaNome: string
  leadsGerados: number
  matriculados: number
  taxaConversao: number
  custoPorMatricula: number | null
  matriculasDetalhe: MatriculaConversao[]
}
```

Sem `campanhaId` (ou `null`), busca **todas** as campanhas (equivalente ao que `useCampanhas()` já lista, mas sem o join de `templates_meta`/`numeros_meta` — não são necessários aqui); com `campanhaId`, filtra só aquela.

Sem teste automatizado — é wiring de Supabase, mesmo padrão de `useCampanhas.ts`/`useContatosCampanha.ts`/`useConversasCampanha.ts`, nenhum dos quais tem teste hoje. A lógica que importa (atribuição, taxa, custo) já foi validada na Task 1.

- [ ] **Step 1: Implementar o hook**

Criar `src/components/App/Campanhas/hooks/useConversaoCampanhas.ts`:

```ts
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { ehMatriculaComercialCanonica } from '@/lib/comercialMatriculasCanonicas'
import {
  extrairCampanhaLabel,
  filtrarLeadsCampanhaPorUnidade,
  calcularTaxaConversao,
  calcularCustoPorMatricula,
} from '@/lib/campanhasConversao.mjs'

export interface MatriculaConversao {
  leadId: number
  alunoId: number
  nome: string
  dataMatricula: string | null
}

export interface ConversaoCampanha {
  campanhaId: string
  campanhaNome: string
  leadsGerados: number
  matriculados: number
  taxaConversao: number
  custoPorMatricula: number | null
  matriculasDetalhe: MatriculaConversao[]
}

const SELECT_ALUNO_CANONICO = `
  id, nome, status, data_matricula, valor_parcela, valor_passaporte,
  is_segundo_curso, is_banda,
  cursos(nome, is_projeto_banda),
  tipos_matricula(codigo, conta_como_pagante, entra_ticket_medio)
`

export function useConversaoCampanhas(campanhaId?: string | null) {
  const [conversoes, setConversoes] = useState<ConversaoCampanha[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchConversoes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let query = supabase.from('campanhas').select('id, nome, unidade_id, numero_meta_id, custo_real')
      if (campanhaId) query = query.eq('id', campanhaId)
      const { data: campanhas, error: campErr } = await query
      if (campErr) throw campErr
      if (!campanhas || campanhas.length === 0) { setConversoes([]); return }

      const resultado: ConversaoCampanha[] = []

      for (const campanha of campanhas) {
        if (!campanha.numero_meta_id) {
          resultado.push(vazio(campanha))
          continue
        }

        const { data: agentes } = await supabase
          .from('agentes')
          .select('tools')
          .eq('numero_meta_id', campanha.numero_meta_id)

        const label = extrairCampanhaLabel(agentes ?? [])
        if (!label) {
          resultado.push(vazio(campanha))
          continue
        }

        const { data: linhas, error: leadsErr } = await supabase
          .from('leads_campanhas')
          .select(`lead_id, leads(id, aluno_id, unidade_id, alunos(${SELECT_ALUNO_CANONICO}))`)
          .eq('campanha_slug', label)
        if (leadsErr) throw leadsErr

        const daUnidade = filtrarLeadsCampanhaPorUnidade(linhas ?? [], campanha.unidade_id)
        const leadsGerados = daUnidade.length

        const matriculasDetalhe: MatriculaConversao[] = []
        for (const linha of daUnidade) {
          const lead = Array.isArray((linha as any).leads) ? (linha as any).leads[0] : (linha as any).leads
          const aluno = lead?.alunos ? (Array.isArray(lead.alunos) ? lead.alunos[0] : lead.alunos) : null
          if (aluno && ehMatriculaComercialCanonica(aluno)) {
            matriculasDetalhe.push({
              leadId: linha.lead_id,
              alunoId: lead.aluno_id,
              nome: aluno.nome,
              dataMatricula: aluno.data_matricula ?? null,
            })
          }
        }

        const matriculados = matriculasDetalhe.length
        resultado.push({
          campanhaId: campanha.id,
          campanhaNome: campanha.nome,
          leadsGerados,
          matriculados,
          taxaConversao: calcularTaxaConversao(leadsGerados, matriculados),
          custoPorMatricula: calcularCustoPorMatricula(campanha.custo_real ?? 0, matriculados),
          matriculasDetalhe,
        })
      }

      setConversoes(resultado)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [campanhaId])

  useEffect(() => { fetchConversoes() }, [fetchConversoes])

  return { conversoes, loading, error, refetch: fetchConversoes }
}

function vazio(campanha: { id: string; nome: string }): ConversaoCampanha {
  return {
    campanhaId: campanha.id,
    campanhaNome: campanha.nome,
    leadsGerados: 0,
    matriculados: 0,
    taxaConversao: 0,
    custoPorMatricula: null,
    matriculasDetalhe: [],
  }
}
```

- [ ] **Step 2: Checagem de tipos**

Run: `npx tsc --noEmit`
Expected: sem novos erros relacionados a `useConversaoCampanhas.ts` (o projeto pode já ter erros pré-existentes em outros arquivos — checar só que este arquivo não introduz nenhum)

- [ ] **Step 3: Verificação manual com dado real (Feirão)**

Antes de existir UI (Task 3), verificar via console do navegador na página do app (com sessão logada) ou script Node com o client Supabase: chamar o hook indiretamente rodando a mesma query pelo MCP `execute_sql` já usada durante o brainstorming e comparar:
- Campo Grande: `leadsGerados=17`, `matriculados=1` (Mayara Caio Manhães de Moraes)
- Barra: `leadsGerados=10`, `matriculados=1` (Luíza P Caruso)
- Recreio: `leadsGerados=10`, `matriculados=2` (Benjamin Mota Falci Ramos, José Gabriel Borges)

**Correção pós-verificação (2026-08-11):** a versão original deste plano afirmava que os 4
matriculados eram todos de Campo Grande ("todos unidade_id de Campo Grande") — essa afirmação
nunca foi checada por uma query que trouxesse `leads.unidade_id` junto, só assumida a partir da
contagem agregada (17/10/10) bater com as transferências. A distribuição real, confirmada por
`select l.unidade_id, u.nome from leads_campanhas lc join leads l on ... where campanha_slug=
'feirao-matriculas26' and l.converteu=true`, é a acima — descoberta durante a implementação da
Task 2 (o hook devolveu os números certos; o texto do plano estava errado). Os números batem
com `leads.unidade_id`, que é a mesma coluna usada por `filtrarLeadsCampanhaPorUnidade` — não há
ambiguidade sobre qual é a fonte de verdade.

(Esses números já foram confirmados por SQL direto durante o design; aqui é só validar que o hook reproduz o mesmo resultado depois de implementado — pode ser adiado pra depois da Task 3, quando há UI pra olhar.)

- [ ] **Step 4: Commit**

```bash
git add src/components/App/Campanhas/hooks/useConversaoCampanhas.ts
git commit -m "feat(campanhas): hook useConversaoCampanhas"
```

---

### Task 3: Aba "Conversão" (`ConversaoTab.tsx`)

**Files:**
- Create: `src/components/App/Campanhas/tabs/ConversaoTab.tsx`
- Modify: `src/components/App/Campanhas/CampanhasPage.tsx`

**Interfaces:**
- Consumes: `useConversaoCampanhas` (Task 2)
- Produces: componente `ConversaoTab({ unidadeId }: { unidadeId: string | null })`

- [ ] **Step 1: Criar `tabs/ConversaoTab.tsx`**

```tsx
import { useNavigate } from 'react-router-dom'
import { TrendingUp, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConversaoCampanhas } from '../hooks/useConversaoCampanhas'

export function ConversaoTab({ unidadeId: _unidadeId }: { unidadeId: string | null }) {
  const { conversoes, loading, error } = useConversaoCampanhas()
  const navigate = useNavigate()

  if (loading) {
    return <div className="text-center py-16 text-gray-500">Carregando conversão...</div>
  }
  if (error) {
    return <div className="text-center py-16 text-red-400">{error}</div>
  }
  if (conversoes.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>Nenhuma campanha criada ainda.</p>
      </div>
    )
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700/50 text-left text-xs text-gray-500 uppercase tracking-wide">
            <th className="px-4 py-3 font-medium">Campanha</th>
            <th className="px-4 py-3 font-medium text-right">Leads gerados</th>
            <th className="px-4 py-3 font-medium text-right">Matriculados</th>
            <th className="px-4 py-3 font-medium text-right">Taxa de conversão</th>
            <th className="px-4 py-3 font-medium text-right">Custo por matrícula</th>
            <th className="px-4 py-3 font-medium text-right"></th>
          </tr>
        </thead>
        <tbody>
          {conversoes.map(c => (
            <tr
              key={c.campanhaId}
              onClick={() => navigate(`/app/campanhas/${c.campanhaId}`)}
              className="border-b border-slate-700/30 last:border-0 hover:bg-slate-700/30 cursor-pointer transition-colors"
            >
              <td className="px-4 py-3 text-white font-medium">{c.campanhaNome}</td>
              <td className="px-4 py-3 text-right text-gray-300">{c.leadsGerados}</td>
              <td className={cn('px-4 py-3 text-right font-medium', c.matriculados > 0 ? 'text-emerald-400' : 'text-gray-500')}>
                {c.matriculados}
              </td>
              <td className="px-4 py-3 text-right text-gray-300">
                {c.leadsGerados > 0 ? `${(c.taxaConversao * 100).toFixed(1)}%` : '—'}
              </td>
              <td className="px-4 py-3 text-right text-gray-300">
                {c.custoPorMatricula != null
                  ? `US$ ${c.custoPorMatricula.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  : '—'}
              </td>
              <td className="px-4 py-3 text-right">
                <ArrowRight className="w-4 h-4 text-gray-600 inline-block" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

Nota: `custoPorMatricula` é sempre exibido em `US$` porque `campanhas.custo_real` hoje só é gravado em USD (`atualizarCustoReal` em `useCampanhas.ts:203-230` sempre grava `data.moeda` vindo de `meta-pricing-estimate`, que retorna USD). Se no futuro existir campanha com custo em BRL, ajustar aqui (fora de escopo agora — nenhuma campanha real tem `custo_moeda !== 'USD'` hoje).

- [ ] **Step 2: Adicionar a aba em `CampanhasPage.tsx`**

Em `src/components/App/Campanhas/CampanhasPage.tsx`, editar:

Linha 3, adicionar `TrendingUp` ao import de ícones:
```ts
import { Megaphone, LayoutDashboard, MessageSquare, Bot, FileText, BarChart2, Settings, TrendingUp } from 'lucide-react'
```

Linha 10, adicionar o import do componente:
```ts
import { ConversaoTab } from './tabs/ConversaoTab'
```

Linha 17, adicionar `'conversao'` ao tipo `Aba`:
```ts
type Aba = 'dashboard' | 'campanhas' | 'conversao' | 'conversas' | 'agentes' | 'templates' | 'analytics' | 'config'
```

Linhas 19-27, inserir a nova aba entre `campanhas` e `conversas`:
```ts
const abas: { id: Aba; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'campanhas', label: 'Campanhas', icon: Megaphone },
  { id: 'conversao', label: 'Conversão', icon: TrendingUp },
  { id: 'conversas', label: 'Conversas', icon: MessageSquare },
  { id: 'agentes', label: 'Agentes IA', icon: Bot },
  { id: 'templates', label: 'Templates', icon: FileText },
  { id: 'analytics', label: 'Analytics', icon: BarChart2 },
  { id: 'config', label: 'Config', icon: Settings },
]
```

Linhas 96-102, inserir a renderização:
```tsx
{abaAtiva === 'dashboard' && <DashboardTab unidadeId={unidadeId} />}
{abaAtiva === 'campanhas' && <CampanhasTab unidadeId={unidadeId} />}
{abaAtiva === 'conversao' && <ConversaoTab unidadeId={unidadeId} />}
{abaAtiva === 'conversas' && <ConversasTab unidadeId={unidadeId} />}
{abaAtiva === 'agentes' && <AgentesTab unidadeId={unidadeId} />}
{abaAtiva === 'templates' && <TemplatesTab unidadeId={unidadeId} />}
{abaAtiva === 'analytics' && <AnalyticsTab unidadeId={unidadeId} />}
{abaAtiva === 'config' && <ConfigTab unidadeId={unidadeId} />}
```

- [ ] **Step 3: Testar manualmente no navegador**

Run: `npm run dev`, abrir `/app/campanhas`, clicar na aba "Conversão".
Expected: tabela com as 3 campanhas do Feirão mostrando Campo Grande com 17 leads/1 matriculado, Barra com 10 leads/1 matriculado, Recreio com 10 leads/2 matriculados, custo por matrícula preenchido nas três (nenhuma tem `matriculados=0`). Clicar numa linha navega pra `/app/campanhas/<id>` (rota ainda não existe — 404 esperado até a Task 4, tudo bem, só confirmar que a navegação dispara pro id certo pela URL).

- [ ] **Step 4: Commit**

```bash
git add src/components/App/Campanhas/tabs/ConversaoTab.tsx src/components/App/Campanhas/CampanhasPage.tsx
git commit -m "feat(campanhas): aba Conversão comparando leads e matriculados por campanha"
```

---

### Task 4: Rota `/app/campanhas/:campanhaId` + página esqueleto

**Files:**
- Modify: `src/router.tsx:103` (novo lazy import), `src/router.tsx:249-252` (nova rota)
- Modify: `src/components/App/Campanhas/index.ts`
- Create: `src/components/App/Campanhas/CampanhaDetalhePage.tsx`

**Interfaces:**
- Consumes: nenhuma (esta task só monta o esqueleto: busca a campanha por id, header, ações, loading/not-found)
- Produces: componente `CampanhaDetalhePage()` (sem props — lê `campanhaId` via `useParams`), exportado no barrel `index.ts`

- [ ] **Step 1: Registrar a rota**

Em `src/router.tsx`, logo após a linha 103 (`const CampanhasPage = lazy(...)`), adicionar:
```ts
const CampanhaDetalhePage = lazy(() => import('./components/App/Campanhas').then(m => ({ default: m.CampanhaDetalhePage })));
```

Logo após o bloco da rota `campanhas` (linhas 249-252), adicionar:
```ts
{
  path: 'campanhas/:campanhaId',
  element: <CampanhasGuard><Suspense fallback={<PageLoader />}><CampanhaDetalhePage /></Suspense></CampanhasGuard>,
},
```

- [ ] **Step 2: Exportar no barrel**

Editar `src/components/App/Campanhas/index.ts` (conteúdo atual: `export { CampanhasPage } from './CampanhasPage'`):
```ts
export { CampanhasPage } from './CampanhasPage'
export { CampanhaDetalhePage } from './CampanhaDetalhePage'
```

- [ ] **Step 3: Criar a página esqueleto**

```tsx
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Play, Pause, RotateCw, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import type { Campanha } from './hooks/useCampanhas'

const STATUS_CFG: Record<string, { label: string; cls: string; bgCls: string }> = {
  rascunho:   { label: 'Rascunho',   cls: 'text-gray-400 border-gray-500/30', bgCls: 'bg-gray-500/10' },
  executando: { label: 'Executando', cls: 'text-blue-400 border-blue-500/30', bgCls: 'bg-blue-500/10' },
  pausada:    { label: 'Pausada',    cls: 'text-yellow-400 border-yellow-500/30', bgCls: 'bg-yellow-500/10' },
  concluida:  { label: 'Concluída',  cls: 'text-emerald-400 border-emerald-500/30', bgCls: 'bg-emerald-500/10' },
  falha:      { label: 'Falha',      cls: 'text-red-400 border-red-500/30', bgCls: 'bg-red-500/10' },
}

export function CampanhaDetalhePage() {
  const { campanhaId } = useParams<{ campanhaId: string }>()
  const navigate = useNavigate()
  const [campanha, setCampanha] = useState<Campanha | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const fetchCampanha = useCallback(async () => {
    if (!campanhaId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('campanhas')
      .select('*, templates_meta(nome), numeros_meta(nome)')
      .eq('id', campanhaId)
      .single()
    if (error || !data) {
      setNotFound(true)
      setCampanha(null)
    } else {
      const row = data as any
      setCampanha({ ...row, template_nome: row.templates_meta?.nome ?? null, numero_nome: row.numeros_meta?.nome ?? null })
    }
    setLoading(false)
  }, [campanhaId])

  useEffect(() => { fetchCampanha() }, [fetchCampanha])

  async function handleAction(action: 'iniciar' | 'pausar' | 'retomar') {
    if (!campanhaId) return
    const { error } = await supabase.functions.invoke('controle-campanha', { body: { campanha_id: campanhaId, action } })
    if (error) { toast.error(error.message); return }
    toast.success(`Campanha ${action === 'iniciar' ? 'iniciada' : action === 'pausar' ? 'pausada' : 'retomada'}`)
    fetchCampanha()
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-gray-500"><RefreshCw className="w-5 h-5 animate-spin" /></div>
  }
  if (notFound || !campanha) {
    return (
      <div className="text-center py-24 text-gray-500">
        <p>Campanha não encontrada.</p>
        <button onClick={() => navigate('/app/campanhas')} className="mt-3 text-amber-400 hover:text-amber-300 text-sm">
          Voltar para Campanhas
        </button>
      </div>
    )
  }

  const cfg = STATUS_CFG[campanha.status] ?? STATUS_CFG.rascunho

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <button onClick={() => navigate('/app/campanhas')} className="p-2 text-gray-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0 mt-0.5">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-white truncate">{campanha.nome}</h1>
              <span className={cn('inline-flex items-center text-xs px-2 py-0.5 rounded-full border', cfg.cls, cfg.bgCls)}>
                {cfg.label}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {campanha.template_nome ?? 'Sem template'} · {campanha.numero_nome ?? 'Sem número'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {campanha.status === 'rascunho' && (
            <button onClick={() => handleAction('iniciar')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-emerald-400 hover:bg-emerald-500/20 rounded-lg transition-colors">
              <Play className="w-4 h-4" /> Iniciar
            </button>
          )}
          {campanha.status === 'executando' && (
            <button onClick={() => handleAction('pausar')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-yellow-400 hover:bg-yellow-500/20 rounded-lg transition-colors">
              <Pause className="w-4 h-4" /> Pausar
            </button>
          )}
          {campanha.status === 'pausada' && (
            <button onClick={() => handleAction('retomar')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-400 hover:bg-blue-500/20 rounded-lg transition-colors">
              <RotateCw className="w-4 h-4" /> Retomar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Testar manualmente**

Run: `npm run dev`, navegar direto pra `/app/campanhas/e58ba3df-8942-4995-b0dd-bb088326d7f2` (id real da campanha de Campo Grande, confirmado durante o design).
Expected: header com nome "Feirão de Matrículas 2026 — Campo Grande", badge "Pausada", botão "Retomar" visível, botão voltar funcionando. Testar também um id inexistente (`/app/campanhas/00000000-0000-0000-0000-000000000000`) — deve mostrar "Campanha não encontrada".

- [ ] **Step 5: Commit**

```bash
git add src/router.tsx src/components/App/Campanhas/index.ts src/components/App/Campanhas/CampanhaDetalhePage.tsx
git commit -m "feat(campanhas): rota e esqueleto da página de detalhamento por campanha"
```

---

### Task 5: Métricas de entrega + template completo + timeline

**Files:**
- Modify: `src/components/App/Campanhas/CampanhaDetalhePage.tsx`

**Interfaces:**
- Consumes: `DeliveryCoverageRing` (`../components/DeliveryCoverageRing`, já existe, props `{ total, entregues, lidos, size }`)

Este task migra pro `CampanhaDetalhePage.tsx` os blocos que hoje só existem no `CampanhaDrawer.tsx`: ring+KPIs, alerta de falhas, template (agora **sem** `line-clamp`), timeline. `CampanhaDrawer.tsx` continua existindo até a Task 9 (outros lugares ainda podem referenciá-lo até lá).

- [ ] **Step 1: Adicionar os imports e o estado de template**

No topo de `CampanhaDetalhePage.tsx`, ampliar os imports:
```tsx
import { ArrowLeft, Play, Pause, RotateCw, RefreshCw, Send, CheckCircle, Eye, MessageSquare, AlertTriangle, ImageIcon } from 'lucide-react'
import { DeliveryCoverageRing } from './components/DeliveryCoverageRing'
```

Dentro do componente, após o `useState`/`useCallback` de `campanha`, adicionar:
```tsx
const [template, setTemplate] = useState<any>(null)

useEffect(() => {
  if (!campanha?.template_id) { setTemplate(null); return }
  supabase
    .from('templates_meta')
    .select('nome, header_type, media_url, body_text, componentes')
    .eq('id', campanha.template_id)
    .single()
    .then(({ data }) => setTemplate(data))
}, [campanha?.template_id])
```

- [ ] **Step 2: Reenviar falhas**

Adicionar a função (mesma chamada de `useCampanhas.reenviarFalhas`, sem depender do hook de lista):
```tsx
async function handleReenviarFalhas() {
  if (!campanhaId) return
  const { error: resetErr } = await supabase.from('campanha_contatos').update({ status: 'pendente', erro: null }).eq('campanha_id', campanhaId).eq('status', 'falha')
  if (resetErr) { toast.error(resetErr.message); return }
  await supabase.from('campanhas').update({ falhas: 0, status: 'executando', updated_at: new Date().toISOString() }).eq('id', campanhaId)
  const { data, error } = await supabase.functions.invoke('enviar-campanha', { body: { campanha_id: campanhaId } })
  if (error) { toast.error(error.message); return }
  if (data?.error) { toast.error(data.error); return }
  toast.success(`Reenviando ${campanha?.falhas ?? 0} contatos com falha`)
  fetchCampanha()
}
```

- [ ] **Step 3: Adicionar as seções no JSX**

Substituir o `<div className="space-y-6 max-w-4xl">...</div>` de fechamento do header (fim da Task 4) por, logo após o `</div>` do header:

```tsx
      {/* Métricas de entrega */}
      <div className="flex gap-6 items-start bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
        <DeliveryCoverageRing total={campanha.total_contatos} entregues={campanha.entregues} lidos={campanha.lidos} size={100} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
          <MiniKPI icon={Send} label="Enviados" value={campanha.enviados} total={campanha.total_contatos} color="blue" />
          <MiniKPI icon={CheckCircle} label="Entregues" value={campanha.entregues} sub={campanha.enviados > 0 ? `${Math.round((campanha.entregues / campanha.enviados) * 100)}%` : undefined} color="emerald" />
          <MiniKPI icon={Eye} label="Lidos" value={campanha.lidos} sub={campanha.entregues > 0 ? `${Math.round((campanha.lidos / campanha.entregues) * 100)}%` : undefined} color="purple" />
          <MiniKPI icon={MessageSquare} label="Respostas" value={campanha.respondidos} sub={campanha.entregues > 0 ? `${Math.round((campanha.respondidos / campanha.entregues) * 100)}%` : undefined} color="amber" />
        </div>
      </div>

      {/* Alerta de falhas */}
      {campanha.falhas > 0 && (
        <div className="flex items-center justify-between px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-sm text-red-300">{campanha.falhas} mensagens com falha</span>
          </div>
          <button onClick={handleReenviarFalhas} className="text-sm text-amber-400 hover:text-amber-300 font-medium transition-colors">
            Reenviar
          </button>
        </div>
      )}

      {/* Template completo */}
      {template && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="flex items-center gap-1.5 px-4 pt-3 pb-1.5">
            <ImageIcon className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">Template</span>
          </div>
          {template.header_type === 'IMAGE' && (() => {
            const imgUrl = campanha.media_url_custom || template.media_url || template.componentes?.[0]?.example?.header_handle?.[0]
            return imgUrl ? (
              <div className="px-4 pb-2">
                <img src={imgUrl} alt="Header" className="w-full max-h-72 object-cover rounded-lg" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
              </div>
            ) : null
          })()}
          {template.body_text && (
            <div className="px-4 pb-3">
              <p className="text-sm text-gray-300 whitespace-pre-wrap">{template.body_text}</p>
            </div>
          )}
          {template.componentes?.find((c: any) => c.type === 'BUTTONS')?.buttons && (
            <div className="px-4 pb-3 flex flex-wrap gap-2">
              {template.componentes.find((c: any) => c.type === 'BUTTONS').buttons.map((btn: any, i: number) => (
                <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-slate-700/50 text-blue-400 border border-slate-600/50">
                  {btn.text}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Timeline */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <p className="text-xs text-gray-400 mb-3">Timeline</p>
        <div className="space-y-2">
          <TimelineItem label="Criada" data={campanha.created_at} />
          {campanha.iniciada_em && <TimelineItem label="Iniciada" data={campanha.iniciada_em} />}
          {campanha.concluida_em && <TimelineItem label="Concluída" data={campanha.concluida_em} />}
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function MiniKPI({ icon: Icon, label, value, total, sub, color }: {
  icon: React.ElementType; label: string; value: number; total?: number; sub?: string
  color: 'blue' | 'emerald' | 'purple' | 'amber'
}) {
  const colors = { blue: 'text-blue-400', emerald: 'text-emerald-400', purple: 'text-purple-400', amber: 'text-amber-400' }
  return (
    <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={cn('w-3.5 h-3.5', colors[color])} />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className="text-lg font-bold text-white leading-tight">
        {value.toLocaleString('pt-BR')}
        {total !== undefined && <span className="text-xs text-gray-600 font-normal ml-1">/ {total}</span>}
      </div>
      {sub && <span className={cn('text-xs', colors[color])}>{sub}</span>}
    </div>
  )
}

function TimelineItem({ label, data }: { label: string; data: string }) {
  const d = new Date(data)
  return (
    <div className="flex items-center gap-3">
      <div className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
      <div className="flex-1 flex items-center justify-between">
        <span className="text-sm text-gray-400">{label}</span>
        <span className="text-xs text-gray-500">
          {d.toLocaleDateString('pt-BR')} {d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  )
}
```

(Note: o `return (...)` do componente principal deixa de fechar em `</div>` único — o bloco acima já inclui o fechamento `</div>\n)\n}` original mais os helpers logo abaixo, no mesmo arquivo.)

- [ ] **Step 4: Testar manualmente**

Run: `npm run dev`, abrir `/app/campanhas/e58ba3df-8942-4995-b0dd-bb088326d7f2`.
Expected: ring + 4 KPIs, template do Feirão completo (texto inteiro, sem cortar — comparar com o texto salvo em `templates_meta.body_text`, ~700 caracteres, todo visível), timeline com "Criada" e "Iniciada".

- [ ] **Step 5: Commit**

```bash
git add src/components/App/Campanhas/CampanhaDetalhePage.tsx
git commit -m "feat(campanhas): métricas de entrega, template completo e timeline na página de detalhamento"
```

---

### Task 6: `CampanhaContatosPanel.tsx` (extraído do Drawer)

**Files:**
- Create: `src/components/App/Campanhas/components/CampanhaContatosPanel.tsx`
- Modify: `src/components/App/Campanhas/CampanhaDetalhePage.tsx`

**Interfaces:**
- Consumes: `useContatosCampanha` (já existe), `BulkActionBar` (já existe, props `{ falhas, onReenviarFalhas, onCopiarNumeros, onExportarCSV }`)
- Produces: `CampanhaContatosPanel({ campanha, onReenviarFalhas }: { campanha: Campanha; onReenviarFalhas: () => void })`

- [ ] **Step 1: Criar o componente**

Extrai o bloco "Modo expandido" do `CampanhaDrawer.tsx` (linhas 216-300, tabs+busca+lista) e o `BulkActionBar` (linhas 304-312), sem o conceito de expandir/colapsar (aqui é sempre a versão completa, já que é página):

```tsx
import { Search, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Campanha } from '../hooks/useCampanhas'
import { useContatosCampanha, type TabStatus } from '../hooks/useContatosCampanha'
import { BulkActionBar } from './BulkActionBar'

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pendente: { label: 'Pendente', cls: 'bg-gray-500/20 text-gray-400' },
  enviado: { label: 'Enviado', cls: 'bg-blue-500/20 text-blue-400' },
  entregue: { label: 'Entregue', cls: 'bg-emerald-500/20 text-emerald-400' },
  lido: { label: 'Lido', cls: 'bg-purple-500/20 text-purple-400' },
  falha: { label: 'Falha', cls: 'bg-red-500/20 text-red-400' },
  bloqueado: { label: 'Opt-out', cls: 'bg-orange-500/20 text-orange-400' },
  invalido: { label: 'Não WhatsApp', cls: 'bg-zinc-500/20 text-zinc-400' },
  ignorado: { label: 'Ignorado', cls: 'bg-yellow-500/20 text-yellow-400' },
}

const TABS: { id: TabStatus; label: string; color: string }[] = [
  { id: 'todos', label: 'Todos', color: 'gray' },
  { id: 'pendentes', label: 'Pendentes', color: 'gray' },
  { id: 'falhas', label: 'Falhas', color: 'red' },
  { id: 'nao_entregues', label: 'Não entregues', color: 'yellow' },
  { id: 'entregues', label: 'Entregues', color: 'emerald' },
]

const TAB_BADGE_COLORS: Record<string, string> = {
  gray: 'bg-gray-500/20 text-gray-400',
  red: 'bg-red-500/20 text-red-400',
  yellow: 'bg-yellow-500/20 text-yellow-400',
  emerald: 'bg-emerald-500/20 text-emerald-400',
}

export function CampanhaContatosPanel({ campanha, onReenviarFalhas }: { campanha: Campanha; onReenviarFalhas: () => void }) {
  const {
    loading, contadores, filtrados,
    searchTerm, setSearchTerm, activeTab, setActiveTab,
    copiarNaoEntregues, exportarCSV,
  } = useContatosCampanha(campanha.id)

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-3">
      <p className="text-xs text-gray-400">Contatos ({campanha.total_contatos})</p>

      <div className="flex gap-1.5 flex-wrap">
        {TABS.map(tab => {
          const count = contadores[tab.id]
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                isActive ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'text-gray-400 border-slate-700 hover:text-white hover:border-slate-600',
              )}
            >
              {tab.label}
              {count > 0 && <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', TAB_BADGE_COLORS[tab.color])}>{count}</span>}
            </button>
          )
        })}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Buscar por telefone..."
          className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:border-amber-500/50 focus:outline-none transition"
        />
      </div>

      <div className="space-y-1 max-h-96 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8"><RefreshCw className="w-4 h-4 text-slate-500 animate-spin" /></div>
        ) : filtrados.length === 0 ? (
          <p className="text-center text-gray-500 text-sm py-6">Nenhum contato nesta categoria</p>
        ) : (
          filtrados.map(ct => {
            const badge = STATUS_BADGE[ct.status] ?? STATUS_BADGE.pendente
            const isFalha = ct.status === 'falha'
            return (
              <div key={ct.id} className={cn('flex items-center justify-between px-3 py-2 rounded-lg transition-colors', isFalha ? 'bg-red-500/5 border-l-2 border-red-500' : 'bg-slate-900/50 hover:bg-slate-900')}>
                <span className="text-xs text-gray-300 font-mono">{ct.telefone}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap', badge.cls)}>{badge.label}</span>
                  {ct.erro && <span className="text-[10px] text-red-400 truncate max-w-[150px]" title={ct.erro}>{ct.erro}</span>}
                  {ct.enviado_em && <span className="text-[10px] text-gray-600 whitespace-nowrap">{new Date(ct.enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
                </div>
              </div>
            )
          })
        )}
      </div>

      <BulkActionBar
        falhas={campanha.falhas}
        onReenviarFalhas={async () => { onReenviarFalhas() }}
        onCopiarNumeros={copiarNaoEntregues}
        onExportarCSV={() => exportarCSV(campanha.nome)}
      />
    </div>
  )
}
```

- [ ] **Step 2: Embutir na página de detalhamento**

Em `CampanhaDetalhePage.tsx`, adicionar o import:
```tsx
import { CampanhaContatosPanel } from './components/CampanhaContatosPanel'
```

E inserir, logo antes do fechamento `</div>\n  )\n}` do componente principal (depois da Timeline):
```tsx
      {/* Contatos */}
      <CampanhaContatosPanel campanha={campanha} onReenviarFalhas={handleReenviarFalhas} />
```

- [ ] **Step 3: Testar manualmente**

Run: `npm run dev`, abrir a página de detalhamento da campanha de Campo Grande.
Expected: bloco de contatos com tabs (Todos/Pendentes/Falhas/Não entregues/Entregues), busca por telefone funcionando, lista rolável, barra de ações no fim (reenviar falhas/copiar/exportar CSV).

- [ ] **Step 4: Commit**

```bash
git add src/components/App/Campanhas/components/CampanhaContatosPanel.tsx src/components/App/Campanhas/CampanhaDetalhePage.tsx
git commit -m "feat(campanhas): painel de contatos na página de detalhamento"
```

---

### Task 7: Bloco de Conversão na página de detalhamento

**Files:**
- Modify: `src/components/App/Campanhas/CampanhaDetalhePage.tsx`

**Interfaces:**
- Consumes: `useConversaoCampanhas` (Task 2), `MatriculaConversao`/`ConversaoCampanha` types

- [ ] **Step 1: Adicionar o import e a chamada do hook**

No topo do arquivo:
```tsx
import { useConversaoCampanhas } from './hooks/useConversaoCampanhas'
```

Dentro do componente, junto aos outros hooks:
```tsx
const { conversoes, loading: loadingConversao } = useConversaoCampanhas(campanhaId)
const conversao = conversoes[0]
```

- [ ] **Step 2: Adicionar a seção no JSX**

Inserir logo depois do bloco de Template (antes da Timeline):
```tsx
      {/* Conversão */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-4">
        <p className="text-xs text-gray-400">Conversão</p>
        {loadingConversao ? (
          <div className="flex items-center justify-center py-6"><RefreshCw className="w-4 h-4 text-slate-500 animate-spin" /></div>
        ) : !conversao || conversao.leadsGerados === 0 ? (
          <p className="text-sm text-gray-500">Nenhum lead atribuído a esta campanha ainda.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MiniKPI icon={MessageSquare} label="Leads gerados" value={conversao.leadsGerados} color="blue" />
              <MiniKPI icon={CheckCircle} label="Matriculados" value={conversao.matriculados} color="emerald" />
              <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
                <span className="text-xs text-gray-500 block mb-1">Taxa de conversão</span>
                <span className="text-lg font-bold text-white">{(conversao.taxaConversao * 100).toFixed(1)}%</span>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
                <span className="text-xs text-gray-500 block mb-1">Custo por matrícula</span>
                <span className="text-lg font-bold text-white">
                  {conversao.custoPorMatricula != null ? `US$ ${conversao.custoPorMatricula.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                </span>
              </div>
            </div>
            {conversao.matriculasDetalhe.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-gray-500">Quem matriculou</p>
                {conversao.matriculasDetalhe.map(m => (
                  <div key={m.leadId} className="flex items-center justify-between px-3 py-2 bg-slate-900/50 rounded-lg text-sm">
                    <span className="text-gray-200">{m.nome}</span>
                    <span className="text-xs text-gray-500">
                      {m.dataMatricula ? new Date(m.dataMatricula).toLocaleDateString('pt-BR') : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
```

- [ ] **Step 3: Testar manualmente**

Run: `npm run dev`, abrir a página da campanha de Campo Grande.
Expected: na campanha de Campo Grande, bloco "Conversão" com Leads gerados=17, Matriculados=1, Taxa=5.9%, Custo por matrícula preenchido, lista com "Mayara Caio Manhães de Moraes" e a data. Na de Barra: Leads gerados=10, Matriculados=1 ("Luíza P Caruso"). Na de Recreio: Leads gerados=10, Matriculados=2 ("Benjamin Mota Falci Ramos", "José Gabriel Borges"). Nenhuma das três mostra "—" no custo por matrícula, já que todas têm ao menos 1 matriculado.

- [ ] **Step 4: Commit**

```bash
git add src/components/App/Campanhas/CampanhaDetalhePage.tsx
git commit -m "feat(campanhas): bloco de conversão (leads/matriculados/custo) na página de detalhamento"
```

---

### Task 8: `CampanhaConversasPanel.tsx` (quem respondeu a esta campanha)

**Files:**
- Create: `src/components/App/Campanhas/components/CampanhaConversasPanel.tsx`
- Modify: `src/components/App/Campanhas/CampanhaDetalhePage.tsx`

**Interfaces:**
- Consumes: `useMensagensCampanha` (já existe em `../hooks/useConversasCampanha`)
- Produces: `CampanhaConversasPanel({ campanhaId }: { campanhaId: string })`

Escopo simplificado em relação ao spec original: em vez de reabrir o `ChatInfoPanel` (que hoje é um painel de metadados da conversa, não a thread de mensagens), o painel lista quem respondeu a **esta** campanha (via `mensagens_campanha.campanha_id`) com preview da última mensagem, e ao clicar expande a thread completa **somente leitura** (sem campo de envio — responder continua sendo função da aba "Conversas" geral). Decisão de implementação registrada aqui porque o spec deixava o componente exato em aberto.

- [ ] **Step 1: Criar o componente**

```tsx
import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useMensagensCampanha } from '../hooks/useConversasCampanha'

interface ContatoConversa {
  conversaId: string
  telefone: string
  nomeContato: string | null
  ultimaMensagem: string | null
  ultimaMensagemEm: string | null
}

export function CampanhaConversasPanel({ campanhaId }: { campanhaId: string }) {
  const [contatos, setContatos] = useState<ContatoConversa[]>([])
  const [loading, setLoading] = useState(true)
  const [expandido, setExpandido] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    supabase
      .from('mensagens_campanha')
      .select('conversa_id, telefone, texto, created_at, conversas_campanha(nome_contato)')
      .eq('campanha_id', campanhaId)
      .eq('direcao', 'inbound')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const porConversa = new Map<string, ContatoConversa>()
        for (const row of (data ?? []) as any[]) {
          if (porConversa.has(row.conversa_id)) continue
          porConversa.set(row.conversa_id, {
            conversaId: row.conversa_id,
            telefone: row.telefone,
            nomeContato: row.conversas_campanha?.nome_contato ?? null,
            ultimaMensagem: row.texto,
            ultimaMensagemEm: row.created_at,
          })
        }
        setContatos(Array.from(porConversa.values()))
        setLoading(false)
      })
  }, [campanhaId])

  if (loading) {
    return (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <div className="flex items-center justify-center py-6"><RefreshCw className="w-4 h-4 text-slate-500 animate-spin" /></div>
      </div>
    )
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-2">
      <p className="text-xs text-gray-400">Conversas ({contatos.length} responderam)</p>
      {contatos.length === 0 ? (
        <p className="text-sm text-gray-500 py-4 text-center">Ninguém respondeu a esta campanha ainda.</p>
      ) : (
        contatos.map(c => (
          <div key={c.conversaId} className="bg-slate-900/50 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpandido(expandido === c.conversaId ? null : c.conversaId)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-slate-900 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm text-gray-200 truncate">{c.nomeContato ?? c.telefone}</p>
                <p className="text-xs text-gray-500 truncate">{c.ultimaMensagem ?? '—'}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <span className="text-xs text-gray-600">
                  {c.ultimaMensagemEm ? new Date(c.ultimaMensagemEm).toLocaleDateString('pt-BR') : ''}
                </span>
                {expandido === c.conversaId ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
              </div>
            </button>
            {expandido === c.conversaId && <ThreadSomenteLeitura conversaId={c.conversaId} telefone={c.telefone} />}
          </div>
        ))
      )}
    </div>
  )
}

function ThreadSomenteLeitura({ conversaId, telefone }: { conversaId: string; telefone: string }) {
  const { mensagens, loading } = useMensagensCampanha(conversaId, telefone)

  if (loading) {
    return <div className="px-3 pb-3"><RefreshCw className="w-4 h-4 text-slate-500 animate-spin" /></div>
  }

  return (
    <div className="px-3 pb-3 space-y-1.5 max-h-64 overflow-y-auto border-t border-slate-800">
      {mensagens.map(m => (
        <div key={m.id} className={cn('flex', m.direcao === 'outbound' ? 'justify-end' : 'justify-start')}>
          <div className={cn(
            'max-w-[80%] px-3 py-1.5 rounded-lg text-xs mt-2',
            m.direcao === 'outbound' ? 'bg-amber-500/15 text-amber-100' : 'bg-slate-800 text-gray-200',
          )}>
            {m.texto || `[${m.tipo}]`}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Embutir na página de detalhamento**

Em `CampanhaDetalhePage.tsx`, adicionar o import:
```tsx
import { CampanhaConversasPanel } from './components/CampanhaConversasPanel'
```

Inserir logo antes do bloco de Contatos (Task 6):
```tsx
      {/* Conversas */}
      <CampanhaConversasPanel campanhaId={campanha.id} />
```

- [ ] **Step 3: Testar manualmente**

Run: `npm run dev`, abrir a página de uma campanha com respostas (ex. Barra, `respondidos=51`).
Expected: lista de contatos que responderam, preview da última mensagem; clicar num contato expande a thread completa (mensagens outbound à direita em âmbar, inbound à esquerda em cinza).

- [ ] **Step 4: Commit**

```bash
git add src/components/App/Campanhas/components/CampanhaConversasPanel.tsx src/components/App/Campanhas/CampanhaDetalhePage.tsx
git commit -m "feat(campanhas): painel de conversas (quem respondeu) na página de detalhamento"
```

---

### Task 9: Navegação do card + remoção do Drawer

**Files:**
- Modify: `src/components/App/Campanhas/tabs/CampanhasTab.tsx`
- Delete: `src/components/App/Campanhas/components/CampanhaDrawer.tsx`

Esta é a última task — só depois que a página de detalhamento (Tasks 4-8) cobre 100% do que o Drawer mostrava é seguro remover o Drawer.

- [ ] **Step 1: Trocar o clique do card pra navegação**

Em `CampanhasTab.tsx`, adicionar o import de `useNavigate`:
```ts
import { useNavigate } from 'react-router-dom'
```

Remover o import de `CampanhaDrawer`:
```ts
// remover: import { CampanhaDrawer } from '../components/CampanhaDrawer'
```

Dentro de `CampanhasTab`, remover o estado `drawerCampanha` (linha 26) e adicionar:
```ts
const navigate = useNavigate()
```

No JSX do card (linha 119), trocar:
```tsx
onClick={() => setDrawerCampanha(c)}
```
por:
```tsx
onClick={() => navigate(`/app/campanhas/${c.id}`)}
```

Remover a linha 132 (`<CampanhaDrawer campanha={drawerCampanha} onClose={...} onReenviarFalhas={handleRetry} />`).

- [ ] **Step 2: Remover o arquivo do Drawer**

```bash
git rm src/components/App/Campanhas/components/CampanhaDrawer.tsx
```

- [ ] **Step 3: Checagem de tipos e busca por referências órfãs**

Run: `npx tsc --noEmit`
Expected: sem erro de import quebrado (`CampanhaDrawer` não é mais referenciado em nenhum lugar)

Run: `grep -rn "CampanhaDrawer" src/`
Expected: nenhum resultado

- [ ] **Step 4: Testar manualmente o fluxo completo**

Run: `npm run dev`, abrir `/app/campanhas`, aba "Campanhas", clicar num card.
Expected: navega direto pra `/app/campanhas/<id>` (não abre mais painel lateral), botão voltar retorna pra lista, botão do navegador "voltar" também funciona (é rota de verdade agora).

- [ ] **Step 5: Commit**

```bash
git add src/components/App/Campanhas/tabs/CampanhasTab.tsx
git commit -m "feat(campanhas): card navega pra página de detalhamento, remove Drawer"
```

---

## Self-Review

**Cobertura do spec:**
- Aba "Conversão" comparativa → Task 3. ✓
- Página de detalhamento por campanha (rota própria) → Tasks 4-8. ✓
- Template completo sem corte → Task 5. ✓
- Conversão por campanha específica → Task 7. ✓
- Conversas → Task 8. ✓
- Contatos → Task 6. ✓
- Timeline → Task 5. ✓
- Atribuição `campanha_slug` + `unidade_id`, reaproveitando `ehMatriculaComercialCanonica` → Tasks 1-2. ✓
- Custo por matrícula sem divisão por zero → testado na Task 1, consumido nas Tasks 3 e 7. ✓
- Não alterar nada existente → nenhuma task toca RPC/hook fora do módulo Campanhas; único arquivo fora do módulo é `router.tsx` (rota nova, aditiva) e `package.json` (linha do script `test`, aditiva).

**Consistência de tipos:** `ConversaoCampanha`/`MatriculaConversao` definidos na Task 2 e usados sem alteração de forma nas Tasks 3 e 7. `Campanha` (de `useCampanhas.ts`) reaproveitado como está, sem modificação.

**Placeholder scan:** sem TBD/TODO; toda seção tem código completo, inclusive os helpers (`MiniKPI`, `TimelineItem`) movidos por extenso.
