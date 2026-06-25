# vCard de Contato (Fase 1 — Modo Teste) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir gerenciar cartões de contato (vCard) por unidade e testar o envio para qualquer número via WhatsApp, com preview visual de como o cartão chega.

**Architecture:** Tabela própria `vcards_unidade` (dado estruturado, fonte única) + edge function stateless `enviar-vcard` que chama `POST /send/contact` da UAZAPI (caixa "Sol – Sucesso do Aluno", id 3) + nova subaba "Cartões" no módulo Sucesso do Aluno com CRUD, preview e envio de teste.

**Tech Stack:** Supabase (PostgreSQL + RLS + Edge Functions/Deno), React 19 + TypeScript + Vite, Tailwind, Sonner (toasts), Lucide icons.

**Spec:** `docs/superpowers/specs/2026-06-24-vcard-contato-design.md`

## Global Constraints

- Projeto **não tem suite de testes automatizados** (scripts: só `dev`/`build`/`preview`). Verificação = `npm run build` (checagem TS) + teste manual de envio.
- **Número de teste autorizado:** `5521964171223`.
- **Caixa de envio:** `whatsapp_caixas.id = 3` ("Sol – Sucesso do Aluno", provedor `uazapi`).
- **Git:** author = Luciano, **sem** `Co-Authored-By` (Vercel Hobby bloqueia). Commit via `git -c user.name="Luciano" commit`.
- **Idioma:** variáveis, funções e comentários em português.
- **Banco:** operações no frontend passam por `src/lib/supabase.ts` (sem React Query; hooks customizados).
- **MCP Supabase** para migration (`apply_migration`) e deploy de edge (`deploy_edge_function`), project_id `ouqwbbermlzqqvtqwlul`. Confirmar com o usuário antes de aplicar migration.
- **Padrão RLS por unidade (verbatim da `metas`):** `is_admin() OR (unidade_id = get_user_unidade_id())`.
- **Trigger updated_at:** usar função genérica existente `set_updated_at()`.

---

### Task 1: Migration — tabela `vcards_unidade`

**Files:**
- Migration (via MCP `apply_migration`, name: `criar_vcards_unidade`)

**Interfaces:**
- Produces: tabela `public.vcards_unidade` com colunas `id uuid`, `unidade_id uuid`, `titulo text`, `full_name text`, `telefones text[]`, `organizacao text`, `email text`, `url text`, `ativo boolean`, `created_at timestamptz`, `updated_at timestamptz`.

- [ ] **Step 1: Confirmar com o usuário** que pode aplicar a migration no banco de produção (project `ouqwbbermlzqqvtqwlul`).

- [ ] **Step 2: Aplicar a migration** via MCP `mcp__supabase__apply_migration` com `name: "criar_vcards_unidade"` e o SQL:

```sql
create table public.vcards_unidade (
  id          uuid primary key default gen_random_uuid(),
  unidade_id  uuid not null references public.unidades(id) on delete cascade,
  titulo      text not null,
  full_name   text not null,
  telefones   text[] not null default '{}',
  organizacao text,
  email       text,
  url         text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_vcards_unidade_unidade on public.vcards_unidade(unidade_id) where ativo;

create trigger trg_vcards_unidade_updated_at
  before update on public.vcards_unidade
  for each row execute function public.set_updated_at();

alter table public.vcards_unidade enable row level security;

create policy "vcards_unidade_select" on public.vcards_unidade
  for select using (is_admin() or (unidade_id = get_user_unidade_id()));

create policy "vcards_unidade_insert" on public.vcards_unidade
  for insert with check (is_admin() or (unidade_id = get_user_unidade_id()));

create policy "vcards_unidade_update" on public.vcards_unidade
  for update using (is_admin() or (unidade_id = get_user_unidade_id()));

create policy "vcards_unidade_delete" on public.vcards_unidade
  for delete using (is_admin() or (unidade_id = get_user_unidade_id()));
```

- [ ] **Step 3: Verificar a tabela** via MCP `mcp__supabase__execute_sql`:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='vcards_unidade' ORDER BY ordinal_position;
```
Expected: 11 colunas conforme o schema acima.

- [ ] **Step 4: Verificar RLS** via MCP `mcp__supabase__execute_sql`:

```sql
SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='vcards_unidade';
```
Expected: 4 policies (select/insert/update/delete).

- [ ] **Step 5: Seed de 1 cartão por unidade** (dados placeholder, p/ a UI já abrir com algo). Via MCP `mcp__supabase__execute_sql`:

```sql
INSERT INTO public.vcards_unidade (unidade_id, titulo, full_name, telefones, organizacao)
VALUES
  ('2ec861f6-023f-4d7b-9927-3960ad8c2a92','Secretaria','LA Music Campo Grande — Secretaria','{}','LA Music'),
  ('95553e96-971b-4590-a6eb-0201d013c14d','Secretaria','LA Music Recreio — Secretaria','{}','LA Music'),
  ('368d47f5-2d88-4475-bc14-ba084a9a348e','Secretaria','LA Music Barra — Secretaria','{}','LA Music');
```
Expected: INSERT 0 3. (Telefones vazios — Hugo preenche depois na UI.)

---

### Task 2: Edge function `enviar-vcard`

**Files:**
- Create: `supabase/functions/enviar-vcard/index.ts`

**Interfaces:**
- Consumes: `getUazapiCredentials` de `../_shared/uazapi.ts`; tabela `vcards_unidade` (Task 1).
- Produces: endpoint POST que recebe `{ numeroDestino: string, vcardId?: string, vcard?: { fullName: string, telefones: string[], organizacao?: string, email?: string, url?: string } }` e retorna `{ ok: boolean, messageId?: string, erro?: string }`.

- [ ] **Step 1: Criar a edge** `supabase/functions/enviar-vcard/index.ts` com o conteúdo:

```ts
// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUazapiCredentials } from '../_shared/uazapi.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CAIXA_SUCESSO_ALUNO_ID = 3; // "Sol – Sucesso do Aluno" (UAZAPI)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Normaliza telefone: só dígitos, garante prefixo 55. Vazio retorna ''.
function normalizarTelefone(tel) {
  const limpo = String(tel || '').replace(/\D/g, '');
  if (!limpo) return '';
  return limpo.startsWith('55') ? limpo : '55' + limpo;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { numeroDestino, vcardId, vcard } = await req.json();

    const destino = normalizarTelefone(numeroDestino);
    if (!destino) return json({ ok: false, erro: 'numeroDestino inválido ou ausente' }, 400);
    if (!vcardId && !vcard) return json({ ok: false, erro: 'Informe vcardId ou vcard' }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // vcard ad-hoc tem prioridade (permite testar edições não salvas)
    let dados = vcard;
    if (!dados && vcardId) {
      const { data, error } = await supabase
        .from('vcards_unidade')
        .select('full_name, telefones, organizacao, email, url')
        .eq('id', vcardId)
        .maybeSingle();
      if (error || !data) return json({ ok: false, erro: 'Cartão não encontrado' }, 404);
      dados = {
        fullName: data.full_name,
        telefones: data.telefones || [],
        organizacao: data.organizacao,
        email: data.email,
        url: data.url,
      };
    }

    const fullName = (dados.fullName || '').trim();
    const telefones = (dados.telefones || []).map(normalizarTelefone).filter(Boolean);
    if (!fullName) return json({ ok: false, erro: 'fullName é obrigatório' }, 400);
    if (telefones.length === 0) return json({ ok: false, erro: 'Informe ao menos um telefone' }, 400);

    const creds = await getUazapiCredentials(supabase, { caixaId: CAIXA_SUCESSO_ALUNO_ID });

    const payload = {
      number: destino,
      fullName,
      phoneNumber: telefones.join(','),
      organization: dados.organizacao || undefined,
      email: dados.email || undefined,
      url: dados.url || undefined,
      delay: 1000,
    };

    const resp = await fetch(`${creds.baseUrl}/send/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: creds.token },
      body: JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error('[enviar-vcard] UAZAPI erro:', resp.status, data);
      return json({ ok: false, erro: data?.error || `UAZAPI retornou ${resp.status}` }, 502);
    }

    const messageId = data.id || data.messageid || data.key?.id || null;
    return json({ ok: true, messageId });
  } catch (err) {
    console.error('[enviar-vcard] Erro:', err);
    return json({ ok: false, erro: err?.message || 'Erro interno' }, 500);
  }
});
```

- [ ] **Step 2: Deploy** via MCP `mcp__supabase__deploy_edge_function` (project `ouqwbbermlzqqvtqwlul`, name `enviar-vcard`, arquivo acima).

- [ ] **Step 3: Teste real ad-hoc** — invocar a edge enviando para o número de teste autorizado. Via Bash (curl) ou MCP, com payload:

```json
{
  "numeroDestino": "5521964171223",
  "vcard": {
    "fullName": "LA Music — Teste vCard",
    "telefones": ["21964171223", "552133334444"],
    "organizacao": "LA Music"
  }
}
```
Expected: resposta `{ "ok": true, "messageId": "..." }` e o cartão chega no WhatsApp `5521964171223`.

- [ ] **Step 4: Teste de validação** — invocar sem `numeroDestino`.
Expected: `{ "ok": false, "erro": "numeroDestino inválido ou ausente" }` com HTTP 400.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/enviar-vcard/index.ts
git -c user.name="Luciano" commit -m "feat(vcard): edge enviar-vcard (POST /send/contact UAZAPI)"
```

---

### Task 3: Hook `useVcardsUnidade` + tipos

**Files:**
- Create: `src/components/App/SucessoCliente/hooks/useVcardsUnidade.ts`

**Interfaces:**
- Consumes: `supabase` de `@/lib/supabase`; `UnidadeId` de `@/components/ui/UnidadeFilter`.
- Produces:
  - `interface VcardUnidade { id: string; unidade_id: string; titulo: string; full_name: string; telefones: string[]; organizacao: string | null; email: string | null; url: string | null; ativo: boolean; }`
  - `interface VcardInput { unidade_id: string; titulo: string; full_name: string; telefones: string[]; organizacao?: string | null; email?: string | null; url?: string | null; }`
  - hook `useVcardsUnidade(unidadeAtual: UnidadeId)` retornando `{ cartoes: VcardUnidade[]; loading: boolean; recarregar: () => Promise<void>; criar: (input: VcardInput) => Promise<VcardUnidade | null>; atualizar: (id: string, input: Partial<VcardInput>) => Promise<boolean>; excluir: (id: string) => Promise<boolean>; }`

- [ ] **Step 1: Criar o hook** `src/components/App/SucessoCliente/hooks/useVcardsUnidade.ts`:

```ts
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';

export interface VcardUnidade {
  id: string;
  unidade_id: string;
  titulo: string;
  full_name: string;
  telefones: string[];
  organizacao: string | null;
  email: string | null;
  url: string | null;
  ativo: boolean;
}

export interface VcardInput {
  unidade_id: string;
  titulo: string;
  full_name: string;
  telefones: string[];
  organizacao?: string | null;
  email?: string | null;
  url?: string | null;
}

export function useVcardsUnidade(unidadeAtual: UnidadeId) {
  const [cartoes, setCartoes] = useState<VcardUnidade[]>([]);
  const [loading, setLoading] = useState(false);

  const recarregar = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('vcards_unidade')
        .select('*')
        .eq('ativo', true)
        .order('titulo');
      if (unidadeAtual !== 'todos') query = query.eq('unidade_id', unidadeAtual);
      const { data, error } = await query;
      if (error) throw error;
      setCartoes((data || []) as VcardUnidade[]);
    } catch (err) {
      console.error('[useVcardsUnidade] Erro:', err);
      toast.error('Erro ao carregar cartões');
    } finally {
      setLoading(false);
    }
  }, [unidadeAtual]);

  useEffect(() => { recarregar(); }, [recarregar]);

  const criar = useCallback(async (input: VcardInput): Promise<VcardUnidade | null> => {
    try {
      const { data, error } = await supabase
        .from('vcards_unidade')
        .insert(input)
        .select('*')
        .single();
      if (error) throw error;
      await recarregar();
      toast.success('Cartão criado');
      return data as VcardUnidade;
    } catch (err) {
      console.error('[useVcardsUnidade] criar:', err);
      toast.error('Erro ao criar cartão');
      return null;
    }
  }, [recarregar]);

  const atualizar = useCallback(async (id: string, input: Partial<VcardInput>): Promise<boolean> => {
    try {
      const { error } = await supabase.from('vcards_unidade').update(input).eq('id', id);
      if (error) throw error;
      await recarregar();
      toast.success('Cartão atualizado');
      return true;
    } catch (err) {
      console.error('[useVcardsUnidade] atualizar:', err);
      toast.error('Erro ao atualizar cartão');
      return false;
    }
  }, [recarregar]);

  const excluir = useCallback(async (id: string): Promise<boolean> => {
    try {
      // soft delete (reversível)
      const { error } = await supabase.from('vcards_unidade').update({ ativo: false }).eq('id', id);
      if (error) throw error;
      await recarregar();
      toast.success('Cartão removido');
      return true;
    } catch (err) {
      console.error('[useVcardsUnidade] excluir:', err);
      toast.error('Erro ao remover cartão');
      return false;
    }
  }, [recarregar]);

  return { cartoes, loading, recarregar, criar, atualizar, excluir };
}
```

- [ ] **Step 2: Verificar tipos** com `npm run build`.
Expected: build sem erros TS relacionados ao hook.

- [ ] **Step 3: Commit**

```bash
git add src/components/App/SucessoCliente/hooks/useVcardsUnidade.ts
git -c user.name="Luciano" commit -m "feat(vcard): hook useVcardsUnidade (CRUD)"
```

---

### Task 4: Componente `VcardPreview`

**Files:**
- Create: `src/components/App/SucessoCliente/VcardPreview.tsx`

**Interfaces:**
- Produces: `VcardPreview({ fullName, telefones, organizacao }: { fullName: string; telefones: string[]; organizacao?: string | null })` — render visual simulando o cartão de contato do WhatsApp.

- [ ] **Step 1: Criar o componente** `src/components/App/SucessoCliente/VcardPreview.tsx`:

```tsx
import { User, Phone } from 'lucide-react';

interface Props {
  fullName: string;
  telefones: string[];
  organizacao?: string | null;
}

// Simula o cartão de contato como o WhatsApp exibe ao receber um vCard.
export function VcardPreview({ fullName, telefones, organizacao }: Props) {
  const tels = telefones.filter(Boolean);
  return (
    <div className="bg-[#0b141a] rounded-2xl p-4 border border-slate-700/50 max-w-sm">
      <p className="text-[11px] text-slate-500 mb-2 uppercase tracking-wide">Pré-visualização (WhatsApp)</p>
      <div className="bg-[#202c33] rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 p-3">
          <div className="w-12 h-12 rounded-full bg-slate-600 flex items-center justify-center flex-shrink-0">
            <User className="w-6 h-6 text-slate-300" />
          </div>
          <div className="min-w-0">
            <p className="text-white font-medium truncate">{fullName || 'Nome do contato'}</p>
            {organizacao ? <p className="text-slate-400 text-xs truncate">{organizacao}</p> : null}
          </div>
        </div>
        {tels.length > 0 && (
          <div className="border-t border-slate-700/60 px-3 py-2 space-y-1">
            {tels.map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-slate-300 text-sm">
                <Phone className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t}</span>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 border-t border-slate-700/60">
          <span className="text-center py-2 text-emerald-400 text-sm font-medium">Conversar</span>
          <span className="text-center py-2 text-emerald-400 text-sm font-medium border-l border-slate-700/60">Adicionar</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos** com `npm run build`.
Expected: build sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/App/SucessoCliente/VcardPreview.tsx
git -c user.name="Luciano" commit -m "feat(vcard): componente VcardPreview"
```

---

### Task 5: Componente `CartoesContatoTab` (gerenciador + form + teste)

**Files:**
- Create: `src/components/App/SucessoCliente/CartoesContatoTab.tsx`

**Interfaces:**
- Consumes: `useVcardsUnidade`, `VcardUnidade`, `VcardInput` (Task 3); `VcardPreview` (Task 4); `supabase` (`functions.invoke('enviar-vcard', ...)`); `UnidadeId`.
- Produces: `CartoesContatoTab({ unidadeAtual }: { unidadeAtual: UnidadeId })`.

- [ ] **Step 1: Criar o componente** `src/components/App/SucessoCliente/CartoesContatoTab.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Plus, Trash2, Send, Loader2, X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { useVcardsUnidade, type VcardUnidade } from './hooks/useVcardsUnidade';
import { VcardPreview } from './VcardPreview';

interface Props {
  unidadeAtual: UnidadeId;
}

interface FormState {
  id: string | null;
  unidade_id: string;
  titulo: string;
  full_name: string;
  telefones: string[];
  organizacao: string;
  email: string;
  url: string;
}

const formVazio = (unidadeId: string): FormState => ({
  id: null, unidade_id: unidadeId, titulo: '', full_name: '',
  telefones: [''], organizacao: 'LA Music', email: '', url: '',
});

function paraForm(c: VcardUnidade): FormState {
  return {
    id: c.id, unidade_id: c.unidade_id, titulo: c.titulo, full_name: c.full_name,
    telefones: c.telefones.length ? c.telefones : [''],
    organizacao: c.organizacao || '', email: c.email || '', url: c.url || '',
  };
}

export function CartoesContatoTab({ unidadeAtual }: Props) {
  const { cartoes, loading, criar, atualizar, excluir } = useVcardsUnidade(unidadeAtual);
  const [form, setForm] = useState<FormState | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [numeroTeste, setNumeroTeste] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Unidade alvo para "novo cartão": a selecionada, ou a 1ª real se "todos".
  const unidadeParaNovo = unidadeAtual !== 'todos'
    ? unidadeAtual
    : (cartoes[0]?.unidade_id || '');

  useEffect(() => { setForm(null); }, [unidadeAtual]);

  const novoCartao = () => {
    if (!unidadeParaNovo) { toast.error('Selecione uma unidade específica para criar'); return; }
    setForm(formVazio(unidadeParaNovo));
  };

  const setCampo = (campo: keyof FormState, valor: string) =>
    setForm(f => f ? { ...f, [campo]: valor } : f);

  const setTelefone = (i: number, valor: string) =>
    setForm(f => f ? { ...f, telefones: f.telefones.map((t, idx) => idx === i ? valor : t) } : f);

  const addTelefone = () => setForm(f => f ? { ...f, telefones: [...f.telefones, ''] } : f);
  const rmTelefone = (i: number) =>
    setForm(f => f ? { ...f, telefones: f.telefones.filter((_, idx) => idx !== i) } : f);

  const salvar = async () => {
    if (!form) return;
    if (!form.titulo.trim() || !form.full_name.trim()) {
      toast.error('Preencha título e nome'); return;
    }
    setSalvando(true);
    const payload = {
      unidade_id: form.unidade_id,
      titulo: form.titulo.trim(),
      full_name: form.full_name.trim(),
      telefones: form.telefones.map(t => t.trim()).filter(Boolean),
      organizacao: form.organizacao.trim() || null,
      email: form.email.trim() || null,
      url: form.url.trim() || null,
    };
    const ok = form.id ? await atualizar(form.id, payload) : !!(await criar(payload));
    setSalvando(false);
    if (ok) setForm(null);
  };

  const enviarTeste = async () => {
    if (!form) return;
    const telefones = form.telefones.map(t => t.trim()).filter(Boolean);
    if (!form.full_name.trim()) { toast.error('Preencha o nome do contato'); return; }
    if (telefones.length === 0) { toast.error('Adicione ao menos um telefone'); return; }
    if (!numeroTeste.trim()) { toast.error('Informe o número de teste'); return; }
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke('enviar-vcard', {
        body: {
          numeroDestino: numeroTeste.trim(),
          vcard: {
            fullName: form.full_name.trim(),
            telefones,
            organizacao: form.organizacao.trim() || undefined,
            email: form.email.trim() || undefined,
            url: form.url.trim() || undefined,
          },
        },
      });
      if (error || !data?.ok) {
        toast.error('Falha no envio: ' + (data?.erro || error?.message || 'erro desconhecido'));
      } else {
        toast.success('Cartão de teste enviado');
      }
    } catch (err: any) {
      toast.error('Erro ao enviar: ' + (err?.message || 'desconhecido'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4">
      {/* Coluna esquerda: lista + form */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold">Cartões de Contato</h3>
          <Button size="sm" onClick={novoCartao} className="bg-violet-500 hover:bg-violet-600">
            <Plus className="w-4 h-4 mr-1" /> Novo cartão
          </Button>
        </div>

        {/* Lista de cartões */}
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 divide-y divide-slate-700/50">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
            </div>
          ) : cartoes.length === 0 ? (
            <p className="text-center text-slate-400 py-8 text-sm">Nenhum cartão cadastrado</p>
          ) : (
            cartoes.map(c => (
              <div key={c.id} className="flex items-center justify-between p-3">
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">{c.titulo}</p>
                  <p className="text-slate-400 text-xs truncate">{c.full_name} · {c.telefones.length} tel.</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button variant="ghost" size="sm" className="text-blue-400" onClick={() => setForm(paraForm(c))}>Editar</Button>
                  <Button variant="ghost" size="sm" className="text-rose-400" onClick={() => excluir(c.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Form de edição/criação */}
        {form && (
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-white font-medium text-sm">{form.id ? 'Editar cartão' : 'Novo cartão'}</h4>
              <button onClick={() => setForm(null)} className="text-slate-500 hover:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400">Título (interno)</label>
                <Input value={form.titulo} onChange={e => setCampo('titulo', e.target.value)} placeholder="Secretaria" />
              </div>
              <div>
                <label className="text-xs text-slate-400">Organização</label>
                <Input value={form.organizacao} onChange={e => setCampo('organizacao', e.target.value)} placeholder="LA Music" />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400">Nome exibido no contato</label>
              <Input value={form.full_name} onChange={e => setCampo('full_name', e.target.value)} placeholder="LA Music CG — Secretaria" />
            </div>
            <div>
              <label className="text-xs text-slate-400">Telefones</label>
              <div className="space-y-2">
                {form.telefones.map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input value={t} onChange={e => setTelefone(i, e.target.value)} placeholder="5521999999999" />
                    {form.telefones.length > 1 && (
                      <button onClick={() => rmTelefone(i)} className="text-rose-400"><X className="w-4 h-4" /></button>
                    )}
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addTelefone} className="border-slate-700">
                  <Plus className="w-3 h-3 mr-1" /> Telefone
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400">Email (opcional)</label>
                <Input value={form.email} onChange={e => setCampo('email', e.target.value)} placeholder="contato@lamusic.com.br" />
              </div>
              <div>
                <label className="text-xs text-slate-400">URL (opcional)</label>
                <Input value={form.url} onChange={e => setCampo('url', e.target.value)} placeholder="https://..." />
              </div>
            </div>
            <Button onClick={salvar} disabled={salvando} className="bg-emerald-500 hover:bg-emerald-600 w-full">
              {salvando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Salvar cartão
            </Button>
          </div>
        )}
      </div>

      {/* Coluna direita: preview + teste */}
      <div className="space-y-4">
        <VcardPreview
          fullName={form?.full_name || ''}
          telefones={form?.telefones || []}
          organizacao={form?.organizacao}
        />
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-4 space-y-2">
          <label className="text-xs text-slate-400">Enviar teste para (número WhatsApp)</label>
          <Input value={numeroTeste} onChange={e => setNumeroTeste(e.target.value)} placeholder="5521964171223" />
          <Button onClick={enviarTeste} disabled={enviando || !form} className="bg-violet-500 hover:bg-violet-600 w-full">
            {enviando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
            Enviar teste
          </Button>
          {!form && <p className="text-[11px] text-slate-500">Selecione ou crie um cartão para testar.</p>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos** com `npm run build`.
Expected: build sem erros. (Conferir que `Button`/`Input` existem em `@/components/ui/` — já usados em `TabSucessoAluno`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/App/SucessoCliente/CartoesContatoTab.tsx
git -c user.name="Luciano" commit -m "feat(vcard): CartoesContatoTab (CRUD + preview + envio de teste)"
```

---

### Task 6: Registrar subaba "Cartões" em `TabSucessoAluno`

**Files:**
- Modify: `src/components/App/SucessoCliente/TabSucessoAluno.tsx`

**Interfaces:**
- Consumes: `CartoesContatoTab` (Task 5).

- [ ] **Step 1: Importar o componente.** Em `TabSucessoAluno.tsx`, após a linha `import { MarcosJornadaSection } from './MarcosJornadaSection';` adicionar:

```tsx
import { CartoesContatoTab } from './CartoesContatoTab';
```

- [ ] **Step 2: Adicionar `'cartoes'` ao tipo do state.** Localizar:

```tsx
const [subAba, setSubAba] = useState<'tabela' | 'jornada' | 'pesquisa' | 'presenca' | 'faltas' | 'marcos' | 'analise'>('tabela');
```
Substituir por:

```tsx
const [subAba, setSubAba] = useState<'tabela' | 'jornada' | 'pesquisa' | 'presenca' | 'faltas' | 'marcos' | 'analise' | 'cartoes'>('tabela');
```

- [ ] **Step 3: Importar o ícone.** Na linha de import de `lucide-react`, adicionar `Contact` à lista de ícones (ex.: `... UserX, Flag, Contact }`).

- [ ] **Step 4: Adicionar o botão da subaba.** Logo após o botão da subaba "analise" (o `<button>` com `BarChart3`, que fecha antes do `</div>` do grupo de subabas), inserir:

```tsx
        <button
          onClick={() => setSubAba('cartoes')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            subAba === 'cartoes'
              ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          <Contact className="w-4 h-4" />
          Cartões
        </button>
```

- [ ] **Step 5: Adicionar a renderização condicional.** Após o bloco `{subAba === 'analise' && (...)}` e antes do `{/* Modal de Detalhes do Aluno */}`, inserir:

```tsx
      {subAba === 'cartoes' && (
        <CartoesContatoTab unidadeAtual={unidadeAtual} />
      )}
```

- [ ] **Step 6: Verificar build** com `npm run build`.
Expected: build sem erros.

- [ ] **Step 7: Teste manual na UI.** Rodar `npm run dev`, abrir Sucesso do Aluno → subaba "Cartões":
  - Selecionar unidade → lista mostra o cartão seed.
  - Clicar "Editar" → form abre preenchido; preview reflete os campos ao digitar.
  - Adicionar telefones, editar nome.
  - Preencher "Enviar teste para" com `5521964171223` → clicar "Enviar teste" → toast de sucesso e cartão chega no WhatsApp.
  - "Salvar cartão" → persiste; recarregar a página mostra os dados salvos.

- [ ] **Step 8: Commit**

```bash
git add src/components/App/SucessoCliente/TabSucessoAluno.tsx
git -c user.name="Luciano" commit -m "feat(vcard): subaba Cartões em Sucesso do Aluno"
```

---

### Task 7: Documentação e memória

**Files:**
- Modify: `CLAUDE.md` (seção Integrações)
- Modify: `docs/MAPA-SISTEMA.md` (página Sucesso do Aluno)
- Modify: `.claude/memory/integracao-infra.md`
- Create/append: `daily-notes/2026-06-24.md`

- [ ] **Step 1: Atualizar `CLAUDE.md`** — adicionar bullet na seção Integrações descrevendo o vCard: tabela `vcards_unidade`, edge `enviar-vcard` (caixa id 3, `POST /send/contact`), subaba "Cartões" em Sucesso do Aluno, Fase 1 = modo teste; Fase 2 (pendente) = integração com `TemplateSelector`.

- [ ] **Step 2: Atualizar `docs/MAPA-SISTEMA.md`** — na entrada de Sucesso do Aluno, registrar a subaba "Cartões" → componente `CartoesContatoTab` + hook `useVcardsUnidade` + edge `enviar-vcard` + tabela `vcards_unidade`.

- [ ] **Step 3: Atualizar `.claude/memory/integracao-infra.md`** — bullet conciso sobre a edge `enviar-vcard` e a tabela `vcards_unidade` (fonte única, reuso futuro na régua de boas-vindas/Fase 2).

- [ ] **Step 4: Append na daily note** `daily-notes/2026-06-24.md` — registro do que foi feito (vCard Fase 1: tabela, edge, UI), com ponteiros (commits, edge).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/MAPA-SISTEMA.md .claude/memory/integracao-infra.md daily-notes/2026-06-24.md
git -c user.name="Luciano" commit -m "docs(vcard): atualiza CLAUDE/MAPA/memória/daily — Fase 1"
```

---

## Self-Review

**Spec coverage:**
- Tabela `vcards_unidade` (estruturada, unidade_id, vários por unidade) → Task 1 ✅
- RLS por unidade → Task 1 ✅
- Edge `enviar-vcard` (vcardId OU vcard ad-hoc, caixa id 3, normalização de telefones, CSV) → Task 2 ✅
- Hook CRUD com `.eq('ativo', true)` (casa com índice parcial) → Task 3 ✅
- Preview visual atualizando em tempo real → Task 4 + Task 5 ✅
- UI: seletor unidade→cartão, form editável, telefones lista, envio de teste → Task 5 ✅
- Aba em Sucesso do Aluno → Task 6 ✅
- Teste manual em device (cartão chega/salva) → Task 6 Step 7 ✅
- Docs/memória → Task 7 ✅
- Fora de escopo (Fase 2, boas-vindas, dados oficiais) → não implementado, correto ✅

**Placeholder scan:** sem TODO/TBD; todo código presente.

**Type consistency:** `VcardUnidade`/`VcardInput` definidos na Task 3 e consumidos com os mesmos nomes/campos na Task 5; edge payload (`numeroDestino`/`vcard`/`vcardId`) consistente entre Task 2 e Task 5.
