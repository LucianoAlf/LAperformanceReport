# Boas-Vindas da Equipe (Sucesso do Aluno) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar uma subaba "Mensagens Automáticas" em Sucesso do Aluno que lista as automações do módulo e permite editar/disparar (manual) o carrossel de boas-vindas da equipe por unidade.

**Architecture:** Reuso (`crm_templates_whatsapp` guarda o texto editável) + tabela nova `staff_unidade` (equipe/fotos, já no bucket `staff-fotos`) + colunas de comunidade/secretaria em `unidades`. Edge nova `enviar-boas-vindas-equipe` (envio, `verify_jwt=true`) monta o carrossel via UAZAPI caixa 3. Frontend: subaba que lista 3 automações e dispara teste do carrossel.

**Tech Stack:** React 19 + TS + Vite; Supabase (Postgres + Edge Functions Deno); UAZAPI; Tailwind + Lucide; hooks customizados (sem React Query).

## Global Constraints

- **NÃO redeployar nenhuma edge de webhook receptora** (`webhook-whatsapp-inbox`, `processar-matricula-emusys`, etc.). Elas são `verify_jwt=false` por design (recebem chamada externa sem JWT). Este plano só **cria** `enviar-boas-vindas-equipe` (envio, `verify_jwt=true`) e **apaga** `upload-staff-foto` (temporária).
- Idioma: variáveis, funções e comentários em português.
- Supabase: operações de banco via MCP (`apply_migration` para DDL, `execute_sql` para verificação). Project ID: `ouqwbbermlzqqvtqwlul`.
- Caixa de envio: id **3** ("Sol - Sucesso do Aluno", UAZAPI). Resolver credenciais via `getUazapiCredentials(supabase, { caixaId: 3 })`.
- Frontend segue padrões existentes: hook tipo `useVcardsUnidade` (supabase direto + `toast` Sonner + `recarregar`), tab recebe `unidadeAtual: UnidadeId`.
- UUIDs das unidades: CG `2ec861f6-023f-4d7b-9927-3960ad8c2a92`, Recreio `95553e96-971b-4590-a6eb-0201d013c14d`, Barra `368d47f5-2d88-4475-bc14-ba084a9a348e`.
- Base das fotos: `https://ouqwbbermlzqqvtqwlul.supabase.co/storage/v1/object/public/staff-fotos/`.
- **Limitação aceita:** carrossel (mensagem interativa) não renderiza em iPhone/iOS — entregue mas invisível. Decisão do usuário: seguir com carrossel mesmo assim.

---

### Task 1: Tabela `staff_unidade` + seed da equipe

**Files:**
- Migration (via MCP `apply_migration`, name: `criar_staff_unidade`)

**Interfaces:**
- Produces: tabela `public.staff_unidade(id uuid, unidade_id uuid null, nome text, cargo text, foto_url text, ordem int, ativo bool, created_at, updated_at)`.

- [ ] **Step 1: Aplicar a migration (DDL + RLS + seed)**

Via MCP `apply_migration`, project `ouqwbbermlzqqvtqwlul`, name `criar_staff_unidade`:

```sql
create table if not exists public.staff_unidade (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid references public.unidades(id) on delete cascade,  -- null = global (CEOs)
  nome text not null,
  cargo text not null,
  foto_url text not null,
  ordem int not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.staff_unidade is 'Equipe por unidade para o carrossel de boas-vindas. unidade_id NULL = global (aparece em todas).';

alter table public.staff_unidade enable row level security;

create policy "staff_unidade_select_auth" on public.staff_unidade
  for select to authenticated using (true);
create policy "staff_unidade_all_admin" on public.staff_unidade
  for all to authenticated using (true) with check (true);

-- Seed: Recreio
insert into public.staff_unidade (unidade_id, nome, cargo, foto_url, ordem) values
('95553e96-971b-4590-a6eb-0201d013c14d','Daiana','Secretaria','https://ouqwbbermlzqqvtqwlul.supabase.co/storage/v1/object/public/staff-fotos/recreio/daiana.jpeg',1),
('95553e96-971b-4590-a6eb-0201d013c14d','Fernanda','Secretaria','https://ouqwbbermlzqqvtqwlul.supabase.co/storage/v1/object/public/staff-fotos/recreio/fernanda.jpg',2),
('95553e96-971b-4590-a6eb-0201d013c14d','Clayton','Gerente de Relacionamento','https://ouqwbbermlzqqvtqwlul.supabase.co/storage/v1/object/public/staff-fotos/recreio/clayton.jpeg',3),
-- Campo Grande
('2ec861f6-023f-4d7b-9927-3960ad8c2a92','Jereh','Gerente de Relacionamento','https://ouqwbbermlzqqvtqwlul.supabase.co/storage/v1/object/public/staff-fotos/cg/jereh.jpg',1),
('2ec861f6-023f-4d7b-9927-3960ad8c2a92','Jhon','Secretaria','https://ouqwbbermlzqqvtqwlul.supabase.co/storage/v1/object/public/staff-fotos/cg/jhon.jpg',2),
('2ec861f6-023f-4d7b-9927-3960ad8c2a92','Gabi','Secretaria','https://ouqwbbermlzqqvtqwlul.supabase.co/storage/v1/object/public/staff-fotos/cg/gabi.jpg',3),
('2ec861f6-023f-4d7b-9927-3960ad8c2a92','Vitória','Comercial','https://ouqwbbermlzqqvtqwlul.supabase.co/storage/v1/object/public/staff-fotos/cg/vitoria.jpg',4),
-- Barra
('368d47f5-2d88-4475-bc14-ba084a9a348e','Anne Krissya','Gerente de Relacionamento','https://ouqwbbermlzqqvtqwlul.supabase.co/storage/v1/object/public/staff-fotos/barra/krissya.jpg',1),
('368d47f5-2d88-4475-bc14-ba084a9a348e','Arthur','Secretaria','https://ouqwbbermlzqqvtqwlul.supabase.co/storage/v1/object/public/staff-fotos/barra/arthur.jpg',2),
('368d47f5-2d88-4475-bc14-ba084a9a348e','Duda','Secretaria','https://ouqwbbermlzqqvtqwlul.supabase.co/storage/v1/object/public/staff-fotos/barra/duda.jpg',3),
('368d47f5-2d88-4475-bc14-ba084a9a348e','Kailane','Comercial','https://ouqwbbermlzqqvtqwlul.supabase.co/storage/v1/object/public/staff-fotos/barra/kailane.jpg',4),
-- Global (CEOs) — card único
(null,'Luciano e Anne','Direção','https://ouqwbbermlzqqvtqwlul.supabase.co/storage/v1/object/public/staff-fotos/geral/luciano-anne.png',1);
```

- [ ] **Step 2: Verificar seed**

Via MCP `execute_sql`:
```sql
select coalesce(u.codigo,'GLOBAL') as unidade, count(*) from staff_unidade s
left join unidades u on u.id = s.unidade_id group by 1 order by 1;
```
Expected: BARRA=4, CG=4, GLOBAL=1, REC=3 (Recreio).

---

### Task 2: Colunas de comunidade/secretaria em `unidades` + popular

**Files:**
- Migration (via MCP `apply_migration`, name: `unidades_comunidade_secretaria`)

**Interfaces:**
- Produces: `unidades.link_comunidade text`, `unidades.secretaria_whatsapp text`, `unidades.secretaria_fixo text`.

- [ ] **Step 1: Aplicar a migration**

```sql
alter table public.unidades
  add column if not exists link_comunidade text,
  add column if not exists secretaria_whatsapp text,
  add column if not exists secretaria_fixo text;

update public.unidades set
  link_comunidade='https://chat.whatsapp.com/CqECiLkdvJZ2vQYFJT8v7N',
  secretaria_whatsapp='(21) 96552-9851', secretaria_fixo='(21) 2412-0461'
where id='2ec861f6-023f-4d7b-9927-3960ad8c2a92'; -- CG

update public.unidades set
  link_comunidade='https://chat.whatsapp.com/JLnoXDNJEOjGn0tDKlzsdF',
  secretaria_whatsapp='(21) 3955-1135', secretaria_fixo='(21) 3411-5703'
where id='95553e96-971b-4590-a6eb-0201d013c14d'; -- Recreio

update public.unidades set
  link_comunidade='https://chat.whatsapp.com/CQQyziknpqwCKvZPMLT3kY?mode=wwt',
  secretaria_whatsapp='(21) 96957-5619', secretaria_fixo='(21) 3400-8891'
where id='368d47f5-2d88-4475-bc14-ba084a9a348e'; -- Barra
```

> ⚠️ Números do `mapa.md` — **o usuário deve confirmar** antes do disparo real (o Wpp do Recreio parece fixo, sem 9º dígito). Não bloqueia a implementação.

- [ ] **Step 2: Verificar**

```sql
select codigo, link_comunidade, secretaria_whatsapp, secretaria_fixo from unidades
where id in ('2ec861f6-023f-4d7b-9927-3960ad8c2a92','95553e96-971b-4590-a6eb-0201d013c14d','368d47f5-2d88-4475-bc14-ba084a9a348e');
```
Expected: 3 linhas preenchidas.

---

### Task 3: Template do carrossel em `crm_templates_whatsapp`

**Files:**
- Migration (via MCP `apply_migration`, name: `template_boas_vindas_equipe`)

**Interfaces:**
- Produces: 1 linha em `crm_templates_whatsapp` com `slug='boas_vindas_equipe'`, `tipo='automacao_boas_vindas_equipe'`, `contexto='sucesso_aluno'`. Placeholders consumidos pela edge da Task 4: `{responsavel}`, `{aluno}`, `{curso}`, `{unidade}`, `{secretaria_whatsapp}`, `{secretaria_fixo}`, `{equipe}`.

- [ ] **Step 1: Inserir o template**

```sql
insert into public.crm_templates_whatsapp (nome, slug, conteudo, tipo, ativo, contexto)
values (
 'Boas-vindas da Equipe (carrossel)',
 'boas_vindas_equipe',
 E'🎵 Olá, {responsavel}! Seja muito bem-vinda à família LA Music! 🎵\n\nA matrícula de {aluno} no curso de {curso} está confirmada, e estamos muito felizes em tê-los conosco nessa jornada musical! 🎶✨\n\n👥 Conheça abaixo a nossa equipe da unidade, sempre pronta para te ajudar:\n\n📞 *Fale com a Secretaria {unidade}:*\n• WhatsApp: {secretaria_whatsapp}\n• Telefone fixo: {secretaria_fixo}\n\n{equipe}\n\n📲 E não esqueça de entrar na nossa Comunidade 👇',
 'automacao_boas_vindas_equipe',
 true,
 'sucesso_aluno'
)
on conflict do nothing;
```

- [ ] **Step 2: Verificar**

```sql
select id, slug, tipo, contexto, ativo from crm_templates_whatsapp where slug='boas_vindas_equipe';
```
Expected: 1 linha.

---

### Task 4: Edge `enviar-boas-vindas-equipe`

**Files:**
- Create: `supabase/functions/enviar-boas-vindas-equipe/index.ts`
- Reuse: `supabase/functions/_shared/uazapi.ts` (já existe)

**Interfaces:**
- Consumes: `staff_unidade`, `unidades` (Tasks 1-2), `crm_templates_whatsapp.slug='boas_vindas_equipe'` (Task 3), `getUazapiCredentials`.
- Produces: endpoint POST que recebe `{ unidadeId: string, numeroDestino: string, responsavel?: string, aluno?: string, curso?: string }` e retorna `{ ok: boolean, erro?: string }`. Consumido pela tela (Task 6).

- [ ] **Step 1: Escrever a edge**

Create `supabase/functions/enviar-boas-vindas-equipe/index.ts`:

```ts
// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUazapiCredentials } from '../_shared/uazapi.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CAIXA_SUCESSO_ID = 3; // "Sol - Sucesso do Aluno" (UAZAPI)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function normalizarTelefone(tel) {
  const limpo = String(tel || '').split('@')[0].replace(/\D/g, '');
  if (!limpo) return '';
  return limpo.startsWith('55') ? limpo : '55' + limpo;
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { unidadeId, numeroDestino, responsavel, aluno, curso } = await req.json();
    const destino = normalizarTelefone(numeroDestino);
    if (!unidadeId) return json({ ok: false, erro: 'unidadeId é obrigatório' }, 400);
    if (!destino) return json({ ok: false, erro: 'numeroDestino inválido' }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Unidade (comunidade + secretaria)
    const { data: uni, error: errUni } = await supabase
      .from('unidades')
      .select('id, nome, link_comunidade, secretaria_whatsapp, secretaria_fixo')
      .eq('id', unidadeId).maybeSingle();
    if (errUni || !uni) return json({ ok: false, erro: 'Unidade não encontrada' }, 404);

    // Equipe: locais (da unidade) + globais (unidade_id null)
    const { data: equipe, error: errEq } = await supabase
      .from('staff_unidade')
      .select('nome, cargo, foto_url, unidade_id, ordem')
      .eq('ativo', true)
      .or(`unidade_id.eq.${unidadeId},unidade_id.is.null`)
      .order('ordem');
    if (errEq) return json({ ok: false, erro: 'Falha ao ler equipe' }, 500);
    const locais = (equipe || []).filter((m) => m.unidade_id === unidadeId);
    const globais = (equipe || []).filter((m) => m.unidade_id === null);
    const ordenados = [...locais, ...globais];
    if (ordenados.length === 0) return json({ ok: false, erro: 'Sem equipe cadastrada para a unidade' }, 400);

    // Template (texto)
    const { data: tpl } = await supabase
      .from('crm_templates_whatsapp')
      .select('conteudo').eq('slug', 'boas_vindas_equipe').eq('ativo', true).maybeSingle();

    const listaEquipe = locais.map((m) => `• *${m.nome}* — ${m.cargo}`).join('\n');
    const texto = String(tpl?.conteudo || '')
      .replaceAll('{responsavel}', responsavel || '')
      .replaceAll('{aluno}', aluno || '')
      .replaceAll('{curso}', curso || '')
      .replaceAll('{unidade}', uni.nome || '')
      .replaceAll('{secretaria_whatsapp}', uni.secretaria_whatsapp || '')
      .replaceAll('{secretaria_fixo}', uni.secretaria_fixo || '')
      .replaceAll('{equipe}', listaEquipe);

    const cards = ordenados.map((m) => ({
      text: `*${m.nome}* — ${m.cargo}`,
      image: m.foto_url,
      buttons: [{ id: uni.link_comunidade, text: 'Entrar na comunidade', type: 'URL' }],
    }));

    const creds = await getUazapiCredentials(supabase, { caixaId: CAIXA_SUCESSO_ID });

    // 1) Carrossel
    const respCar = await fetch(`${creds.baseUrl}/send/carousel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: creds.token },
      body: JSON.stringify({ number: destino, text: texto, carousel: cards, delay: 0 }),
    });
    if (!respCar.ok) {
      const e = await respCar.json().catch(() => ({}));
      return json({ ok: false, erro: e?.error || `UAZAPI carrossel ${respCar.status}` }, 502);
    }

    // 2) Comunidade (card nativo via preview de link)
    await fetch(`${creds.baseUrl}/send/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: creds.token },
      body: JSON.stringify({
        number: destino,
        text: `📲 Entre na nossa *Comunidade do WhatsApp* para ficar por dentro de tudo, receber avisos e novidades! 👇\n\n${uni.link_comunidade}`,
        delay: 2500,
        linkPreview: true,
      }),
    });

    return json({ ok: true });
  } catch (err) {
    console.error('[enviar-boas-vindas-equipe] Erro:', err);
    return json({ ok: false, erro: err?.message || 'Erro interno' }, 500);
  }
});
```

- [ ] **Step 2: Deploy da edge (`verify_jwt=true`)**

Via MCP `deploy_edge_function`, project `ouqwbbermlzqqvtqwlul`, name `enviar-boas-vindas-equipe`, `verify_jwt: true`, files = `_shared/uazapi.ts` (copiar conteúdo atual) + `index.ts` acima.

> NÃO usar a CLI com/sem `--no-verify-jwt` aqui. É edge de ENVIO (front manda JWT), `verify_jwt=true` é o correto. Nenhuma edge de webhook é tocada.

- [ ] **Step 3: Testar disparo real (número de teste)**

Via MCP `execute_sql` pegar um token de teste não é necessário; testar pela CLI de invoke autenticada OU temporariamente via curl com a anon publishable. Teste mínimo recomendado: chamar a edge para `unidadeId` Recreio e `numeroDestino` do teste, e confirmar visualmente o carrossel + comunidade (formato já validado em 25/06).

Expected: `{ ok: true }` e mensagens chegando na caixa.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/enviar-boas-vindas-equipe/index.ts
git commit -m "feat(sucesso-aluno): edge enviar-boas-vindas-equipe (carrossel da equipe por unidade)"
```

---

### Task 5: Hook `useAutomacoesSucessoAluno`

**Files:**
- Create: `src/components/App/SucessoCliente/hooks/useAutomacoesSucessoAluno.ts`

**Interfaces:**
- Consumes: `crm_templates_whatsapp` (Task 3), `unidades` (para o select de disparo).
- Produces: hook que retorna `{ automacoes, loadingTexto, textoCarrossel, salvarTextoCarrossel(novo: string): Promise<boolean>, dispararTeste(unidadeId: string, numero: string, exemplo?: {responsavel?,aluno?,curso?}): Promise<boolean> }`. A lista `automacoes` é estática (catálogo do módulo).

- [ ] **Step 1: Escrever o hook**

Create `src/components/App/SucessoCliente/hooks/useAutomacoesSucessoAluno.ts`:

```ts
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export interface AutomacaoItem {
  slug: string;
  nome: string;
  descricao: string;
  gatilho: 'manual' | 'automatico';
  editavel: boolean;
}

// Catálogo das automações do módulo Sucesso do Aluno (Fase 1).
export const AUTOMACOES_SUCESSO_ALUNO: AutomacaoItem[] = [
  {
    slug: 'boas_vindas_equipe',
    nome: 'Boas-vindas da Equipe (carrossel)',
    descricao: 'Carrossel com a equipe da unidade + card da comunidade. Disparo manual de teste.',
    gatilho: 'manual',
    editavel: true,
  },
  {
    slug: 'boas_vindas_matricula',
    nome: 'Boas-vindas de Matrícula',
    descricao: 'Vídeo do professor (ou texto) ao confirmar matrícula nova. Automático, texto no código.',
    gatilho: 'automatico',
    editavel: false,
  },
  {
    slug: 'pesquisa_1a_aula',
    nome: 'Pesquisa pós-1ª aula',
    descricao: 'Pesquisa de satisfação com botões após a primeira aula. Texto no código.',
    gatilho: 'manual',
    editavel: false,
  },
];

export function useAutomacoesSucessoAluno() {
  const [textoCarrossel, setTextoCarrossel] = useState('');
  const [loadingTexto, setLoadingTexto] = useState(false);

  const carregarTexto = useCallback(async () => {
    setLoadingTexto(true);
    try {
      const { data, error } = await supabase
        .from('crm_templates_whatsapp')
        .select('conteudo').eq('slug', 'boas_vindas_equipe').maybeSingle();
      if (error) throw error;
      setTextoCarrossel(data?.conteudo || '');
    } catch (err) {
      console.error('[useAutomacoesSucessoAluno] carregarTexto:', err);
      toast.error('Erro ao carregar o texto da automação');
    } finally {
      setLoadingTexto(false);
    }
  }, []);

  useEffect(() => { carregarTexto(); }, [carregarTexto]);

  const salvarTextoCarrossel = useCallback(async (novo: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('crm_templates_whatsapp')
        .update({ conteudo: novo }).eq('slug', 'boas_vindas_equipe');
      if (error) throw error;
      setTextoCarrossel(novo);
      toast.success('Texto salvo');
      return true;
    } catch (err) {
      console.error('[useAutomacoesSucessoAluno] salvar:', err);
      toast.error('Erro ao salvar o texto');
      return false;
    }
  }, []);

  const dispararTeste = useCallback(async (
    unidadeId: string,
    numero: string,
    exemplo?: { responsavel?: string; aluno?: string; curso?: string },
  ): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke('enviar-boas-vindas-equipe', {
        body: { unidadeId, numeroDestino: numero, ...exemplo },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.erro || 'Falha no envio');
      toast.success('Boas-vindas disparadas');
      return true;
    } catch (err) {
      console.error('[useAutomacoesSucessoAluno] dispararTeste:', err);
      toast.error(`Erro ao disparar: ${err instanceof Error ? err.message : 'desconhecido'}`);
      return false;
    }
  }, []);

  return { automacoes: AUTOMACOES_SUCESSO_ALUNO, textoCarrossel, loadingTexto, carregarTexto, salvarTextoCarrossel, dispararTeste };
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npm run build`
Expected: build sem erro de tipo no hook novo (a tela ainda não usa, mas o arquivo compila).

- [ ] **Step 3: Commit**

```bash
git add src/components/App/SucessoCliente/hooks/useAutomacoesSucessoAluno.ts
git commit -m "feat(sucesso-aluno): hook useAutomacoesSucessoAluno (catalogo + editar/disparar)"
```

---

### Task 6: Componente `AutomacoesTab`

**Files:**
- Create: `src/components/App/SucessoCliente/AutomacoesTab.tsx`

**Interfaces:**
- Consumes: `useAutomacoesSucessoAluno` (Task 5), `UnidadeId`.
- Produces: componente `AutomacoesTab({ unidadeAtual }: { unidadeAtual: UnidadeId })`. Consumido pela Task 7.

- [ ] **Step 1: Escrever o componente**

Create `src/components/App/SucessoCliente/AutomacoesTab.tsx`:

```tsx
import { useState } from 'react';
import { Zap, Pencil, Send, Loader2, Save, X } from 'lucide-react';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAutomacoesSucessoAluno } from './hooks/useAutomacoesSucessoAluno';

const UNIDADES = [
  { id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92', nome: 'Campo Grande' },
  { id: '95553e96-971b-4590-a6eb-0201d013c14d', nome: 'Recreio' },
  { id: '368d47f5-2d88-4475-bc14-ba084a9a348e', nome: 'Barra' },
];

export function AutomacoesTab({ unidadeAtual }: { unidadeAtual: UnidadeId }) {
  const { automacoes, textoCarrossel, loadingTexto, salvarTextoCarrossel, dispararTeste } = useAutomacoesSucessoAluno();
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState('');
  const [salvando, setSalvando] = useState(false);

  const unidadePadrao = unidadeAtual !== 'todos' ? String(unidadeAtual) : UNIDADES[1].id;
  const [unidadeDisparo, setUnidadeDisparo] = useState(unidadePadrao);
  const [numero, setNumero] = useState('');
  const [disparando, setDisparando] = useState(false);

  const abrirEdicao = () => { setRascunho(textoCarrossel); setEditando(true); };
  const salvar = async () => {
    setSalvando(true);
    const ok = await salvarTextoCarrossel(rascunho);
    setSalvando(false);
    if (ok) setEditando(false);
  };
  const disparar = async () => {
    if (!numero.trim()) return;
    setDisparando(true);
    await dispararTeste(unidadeDisparo, numero, { responsavel: 'Maria', aluno: 'João', curso: 'Violão' });
    setDisparando(false);
  };

  return (
    <div className="space-y-4">
      {automacoes.map((a) => (
        <div key={a.slug} className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <Zap className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-white">{a.nome}</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                    a.gatilho === 'automatico'
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                  }`}>
                    {a.gatilho === 'automatico' ? 'Automático' : 'Manual'}
                  </span>
                  {!a.editavel && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full border bg-slate-600/20 text-slate-400 border-slate-600/40">
                      Texto no código
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-400 mt-0.5">{a.descricao}</p>
              </div>
            </div>
          </div>

          {a.editavel && a.slug === 'boas_vindas_equipe' && (
            <div className="mt-4 border-t border-slate-700/50 pt-4 space-y-3">
              {!editando ? (
                <>
                  <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans bg-slate-900/50 rounded-lg p-3 max-h-48 overflow-auto">
                    {loadingTexto ? 'Carregando…' : textoCarrossel}
                  </pre>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" className="border-slate-700" onClick={abrirEdicao}>
                      <Pencil className="w-4 h-4 mr-2" /> Editar texto
                    </Button>
                    <div className="flex items-center gap-2 ml-auto">
                      <select
                        value={unidadeDisparo}
                        onChange={(e) => setUnidadeDisparo(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 px-2 py-2"
                      >
                        {UNIDADES.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                      </select>
                      <Input placeholder="Número (DDD)" value={numero} onChange={(e) => setNumero(e.target.value)} className="w-44" />
                      <Button size="sm" onClick={disparar} disabled={disparando || !numero.trim()}
                        className="bg-gradient-to-r from-pink-500 to-violet-500">
                        {disparando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                        Disparar teste
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <textarea
                    value={rascunho}
                    onChange={(e) => setRascunho(e.target.value)}
                    rows={12}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 p-3 font-mono"
                  />
                  <p className="text-[11px] text-slate-500">
                    Variáveis: {'{responsavel}'} {'{aluno}'} {'{curso}'} {'{unidade}'} {'{secretaria_whatsapp}'} {'{secretaria_fixo}'} {'{equipe}'} (lista gerada da equipe).
                  </p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={salvar} disabled={salvando} className="bg-emerald-600 hover:bg-emerald-500">
                      {salvando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Salvar
                    </Button>
                    <Button size="sm" variant="outline" className="border-slate-700" onClick={() => setEditando(false)}>
                      <X className="w-4 h-4 mr-2" /> Cancelar
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verificar build**

Run: `npm run build`
Expected: compila sem erro (componente ainda não roteado).

- [ ] **Step 3: Commit**

```bash
git add src/components/App/SucessoCliente/AutomacoesTab.tsx
git commit -m "feat(sucesso-aluno): AutomacoesTab (lista automacoes + editar/disparar carrossel)"
```

---

### Task 7: Integrar a subaba em `TabSucessoAluno`

**Files:**
- Modify: `src/components/App/SucessoCliente/TabSucessoAluno.tsx`

**Interfaces:**
- Consumes: `AutomacoesTab` (Task 6).

- [ ] **Step 1: Importar o componente e o ícone**

Em `TabSucessoAluno.tsx`, adicionar ao import de `lucide-react` (linha 9-10) o ícone `Zap`, e após a linha 23 (`import { CartoesContatoTab }`):
```ts
import { AutomacoesTab } from './AutomacoesTab';
```

- [ ] **Step 2: Adicionar 'automacoes' ao tipo do estado**

Modificar a linha 76 (`const [subAba, setSubAba] = useState<...>`), incluindo `'automacoes'` no union:
```ts
const [subAba, setSubAba] = useState<'tabela' | 'jornada' | 'pesquisa' | 'presenca' | 'faltas' | 'marcos' | 'analise' | 'cartoes' | 'automacoes'>('tabela');
```

- [ ] **Step 3: Adicionar o botão da subaba**

Após o botão "Cartões" (fecha na linha 472, `</button>`) e antes do `</div>` da barra (linha 473), inserir:
```tsx
        <button
          onClick={() => setSubAba('automacoes')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            subAba === 'automacoes'
              ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          <Zap className="w-4 h-4" />
          Mensagens Automáticas
        </button>
```

- [ ] **Step 4: Adicionar o render condicional**

Após o bloco `{subAba === 'cartoes' && (...)}` (linhas 760-762), inserir:
```tsx
      {subAba === 'automacoes' && (
        <AutomacoesTab unidadeAtual={unidadeAtual} />
      )}
```

- [ ] **Step 5: Verificar build**

Run: `npm run build`
Expected: PASS. A nova subaba "Mensagens Automáticas" aparece em Sucesso do Aluno → Acompanhamento.

- [ ] **Step 6: Commit**

```bash
git add src/components/App/SucessoCliente/TabSucessoAluno.tsx
git commit -m "feat(sucesso-aluno): subaba Mensagens Automaticas em Acompanhamento"
```

---

### Task 8: Limpeza da edge temporária

**Files:**
- Remover edge `upload-staff-foto` (criada hoje só para subir as fotos; `verify_jwt=false`).

**Interfaces:**
- Nenhuma — as fotos já estão no bucket `staff-fotos` e referenciadas por URL.

- [ ] **Step 1: Confirmar que as fotos seguem acessíveis**

```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://ouqwbbermlzqqvtqwlul.supabase.co/storage/v1/object/public/staff-fotos/recreio/daiana.jpeg"
```
Expected: `200`.

- [ ] **Step 2: Apagar a edge temporária**

Via MCP, deletar a função `upload-staff-foto` (não há tool de delete no MCP listado → usar a CLI: `supabase functions delete upload-staff-foto --project-ref ouqwbbermlzqqvtqwlul`). Confirmar que **só** essa função foi removida; nenhuma edge de webhook é tocada.

- [ ] **Step 3: Verificar**

Listar edge functions (MCP `list_edge_functions`) e confirmar que `upload-staff-foto` sumiu e `enviar-boas-vindas-equipe` está ACTIVE.

---

## Pós-implementação (fora das tasks, antes do uso real)
- Usuário confirma os números das secretarias (Task 2) — atualizar via `execute_sql` se necessário.
- Atualizar `CLAUDE.md` + `.claude/memory/integracao-infra.md` com a nova edge/tela/tabelas.
- `staff/img/mapa.md` deixa de ser fonte de verdade (banco assume). Manter como referência ou remover.

## Self-review (feito)
- **Cobertura da spec:** staff_unidade (T1), unidades colunas (T2), template editável (T3), edge (T4), hook (T5), tela (T6-7), limpeza (T8). ✅
- **Placeholders:** todos os SQL/TS/TSX completos, sem TODO. ✅
- **Consistência de tipos:** `dispararTeste(unidadeId, numero, exemplo)` e `salvarTextoCarrossel(novo)` batem entre hook (T5) e tela (T6); edge consome `{unidadeId, numeroDestino, responsavel, aluno, curso}` igual ao body do `invoke`. ✅
- **Constraint do JWT:** nenhuma edge de webhook tocada; nova edge `verify_jwt=true`; só a temporária é removida. ✅
