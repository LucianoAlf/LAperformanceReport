# vCard Fase 2 (disparo no inbox + tipos da caixa) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Disparar cartões de contato (vCard) dentro de uma conversa do inbox Sucesso do Aluno (chips no seletor de templates), registrar o envio como cartão renderizado de verdade na timeline, e completar os tipos de mensagem `contato`/`localizacao` (+ fallback) na caixa de entrada.

**Architecture:** Reusa a edge `enviar-vcard` (Fase 1, ganha `conversaId`/registro) e a tabela `vcards_unidade`. O chat é o componente compartilhado `AdminChatPanel` (usado por Administrativo e Sucesso do Aluno via `contexto`); chips de cartão só aparecem em `contexto === 'sucesso_aluno'`. Render de contato reaproveita `VcardPreview` (Fase 1). Recebimento de contato/localização é completado no webhook.

**Tech Stack:** Supabase Edge (Deno), React 19 + TypeScript + Vite, Tailwind, Sonner, Lucide, realtime (`useAdminMensagens`).

**Spec:** `docs/superpowers/specs/2026-06-24-vcard-fase2-inbox-design.md`

## Global Constraints

- **Sem suite de testes** (scripts: `dev`/`build`/`preview`). Verificação = `npm run build` + teste manual + deploy MCP.
- **Número de teste:** `5521964171223`.
- **Caixa de envio:** `whatsapp_caixas.id = 3`.
- **Git:** author Luciano, sem `Co-Authored-By`. Commit: `git -c user.name="Luciano" commit`.
- **MCP Supabase** (project `ouqwbbermlzqqvtqwlul`) para deploy de edge (`deploy_edge_function`) e SQL (`execute_sql`).
- **Idioma:** PT em variáveis/comentários.
- **Ordem (acoplamento):** tipos+render → webhook → edge → UI. Não pular: linhas `tipo=contato` só renderizam após Task 1.
- **Chips só em `contexto === 'sucesso_aluno'`.** Pré-atendimento/Comercial não mudam.
- **Envio direto** (sem modal de confirmação) — decisão do Hugo.
- **Edge retrocompatível:** sem `conversaId` = comportamento Fase 1 intacto.

---

### Task 1: Front — tipos `contato`/`localizacao`, parser vCard, render na bolha, `VcardPreview` compacto

**Files:**
- Modify: `src/components/App/Administrativo/CaixaEntrada/types.ts`
- Modify: `src/components/App/SucessoCliente/VcardPreview.tsx`
- Create: `src/components/App/Administrativo/CaixaEntrada/parseVcard.ts`
- Modify: `src/components/App/Administrativo/CaixaEntrada/AdminChatPanel.tsx` (função `MidiaRender`, ~linha 152-199)

**Interfaces:**
- Produces:
  - `TipoMensagemAdmin` passa a incluir `'contato' | 'localizacao'`.
  - `parseVcard(conteudo: string | null): { fullName: string; telefones: string[]; organizacao: string | null }`
  - `VcardPreview` aceita prop `compact?: boolean`.

- [ ] **Step 1: Adicionar os tipos** em `types.ts` linha 45:

```ts
export type TipoMensagemAdmin = 'texto' | 'imagem' | 'audio' | 'video' | 'documento' | 'sticker' | 'sistema' | 'interativo' | 'contato' | 'localizacao';
```

- [ ] **Step 2: Criar o parser de vCard** `parseVcard.ts`:

```ts
// Extrai nome, telefones e organização de uma string vCard (.vcf) OU de um nome simples.
// Tolerante: se não for vCard, devolve o texto como fullName e telefones vazio.
export function parseVcard(conteudo: string | null): { fullName: string; telefones: string[]; organizacao: string | null } {
  const texto = (conteudo || '').trim();
  if (!texto.toUpperCase().includes('BEGIN:VCARD')) {
    return { fullName: texto, telefones: [], organizacao: null };
  }
  const fnMatch = texto.match(/^FN:(.*)$/im);
  const orgMatch = texto.match(/^ORG:(.*)$/im);
  const telefones = Array.from(texto.matchAll(/^TEL[^:]*:(.+)$/gim)).map(m => m[1].trim()).filter(Boolean);
  return {
    fullName: (fnMatch?.[1] || '').trim(),
    telefones,
    organizacao: (orgMatch?.[1] || '').trim() || null,
  };
}
```

- [ ] **Step 3: Tornar o `VcardPreview` reutilizável na bolha** — adicionar prop `compact`. Em `VcardPreview.tsx`, substituir a assinatura e o header:

```tsx
interface Props {
  fullName: string;
  telefones: string[];
  organizacao?: string | null;
  compact?: boolean;
}

// Simula o cartão de contato como o WhatsApp exibe ao receber um vCard.
export function VcardPreview({ fullName, telefones, organizacao, compact = false }: Props) {
  const tels = telefones.filter(Boolean);
  return (
    <div className={compact ? '' : 'bg-[#0b141a] rounded-2xl p-4 border border-slate-700/50 max-w-sm'}>
      {!compact && <p className="text-[11px] text-slate-500 mb-2 uppercase tracking-wide">Pré-visualização (WhatsApp)</p>}
      <div className="bg-[#202c33] rounded-xl overflow-hidden min-w-[220px]">
```
(o restante do JSX do card permanece igual; só o wrapper externo e o header passam a depender de `compact`.)

- [ ] **Step 4: Renderizar `contato` e `localizacao` no `MidiaRender`.** Em `AdminChatPanel.tsx`, no início da função `MidiaRender` (linha 152, logo após a abertura), inserir os dois casos **ANTES** da linha `if (!msg.midia_url) return null;` (pois não têm `midia_url`):

```tsx
function MidiaRender({ msg, isSaida }: { msg: AdminMensagem; isSaida: boolean }) {
  if (msg.tipo === 'contato') {
    const { fullName, telefones, organizacao } = parseVcard(msg.conteudo);
    const nome = msg.midia_nome || fullName || 'Contato';
    return <VcardPreview compact fullName={nome} telefones={telefones} organizacao={organizacao} />;
  }

  if (msg.tipo === 'localizacao') {
    const [lat, lng] = (msg.conteudo || '').split(',').map(s => s.trim());
    if (!lat || !lng) return <span className="text-sm text-slate-300">📍 Localização</span>;
    return (
      <a
        href={`https://www.google.com/maps?q=${lat},${lng}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition text-sm"
      >
        <MapPin className="w-4 h-4 text-rose-400 flex-shrink-0" />
        <span className="text-slate-200">Abrir localização no mapa</span>
      </a>
    );
  }

  if (msg.tipo === 'sticker') {
```
(o corpo existente a partir de `if (msg.tipo === 'sticker')` permanece.)

- [ ] **Step 5: Imports.** No topo de `AdminChatPanel.tsx`, adicionar `MapPin` à lista de ícones `lucide-react` e os imports dos novos módulos:

```tsx
import { parseVcard } from './parseVcard';
import { VcardPreview } from '@/components/App/SucessoCliente/VcardPreview';
```
(adicionar `MapPin` no import existente de `lucide-react`.)

- [ ] **Step 6: Build** `npm run build`.
Expected: build sem erros TS.

- [ ] **Step 7: Verificação visual (manual, opcional mas recomendada)** — inserir uma linha de teste numa conversa existente e ver renderizar. Via MCP `execute_sql` (substituir `<CONV_ID>` por uma conversa real do inbox):

```sql
-- pega uma conversa qualquer para teste visual
SELECT id FROM admin_conversas LIMIT 1;
-- insere um cartão de teste
INSERT INTO admin_mensagens (conversa_id, direcao, tipo, conteudo, midia_nome, remetente, remetente_nome, status_entrega)
VALUES ('<CONV_ID>', 'saida', 'contato',
  E'BEGIN:VCARD\nVERSION:3.0\nFN:LA Music CG — Secretaria\nORG:LA Music\nTEL;type=CELL:5521964171223\nEND:VCARD',
  'LA Music CG — Secretaria', 'admin', 'Teste', 'enviada');
```
Abrir a conversa no app (`npm run dev`) → a bolha deve mostrar o cartão (nome + telefone). Depois apagar a linha de teste:
```sql
DELETE FROM admin_mensagens WHERE remetente_nome='Teste' AND tipo='contato';
```

- [ ] **Step 8: Commit**

```bash
git add src/components/App/Administrativo/CaixaEntrada/types.ts src/components/App/Administrativo/CaixaEntrada/parseVcard.ts src/components/App/Administrativo/CaixaEntrada/AdminChatPanel.tsx src/components/App/SucessoCliente/VcardPreview.tsx
git -c user.name="Luciano" commit -m "feat(caixa): render de contato/localizacao na bolha + VcardPreview compacto"
```

---

### Task 2: Webhook — receber `contactMessage`/`localizacao` e preservar telefones do contato

**Files:**
- Modify: `supabase/functions/webhook-whatsapp-inbox/index.ts` (`normalizeUazapiPayload` ~linha 78-116; `detectMessageType` contato ~linha 210-218)

**Interfaces:**
- Consumes: front da Task 1 (tipos `contato`/`localizacao`).
- Produces: mensagens recebidas de contato/localização gravadas com `tipo` correto e, no contato, `conteudo` = vCard e `midia_nome` = nome.

⚠️ **Confirmar o formato UAZAPI antes de editar.** O payload raw de contato/localização da UAZAPI não está coberto hoje. Conferir em `docs/uazapi-openapi-spec.yaml` e/ou logs reais (`mcp__supabase__get_logs` function `webhook-whatsapp-inbox`). O código abaixo assume os campos mais prováveis (`msg.mediaType`/`messageType` + `content`); ajustar nomes conforme o real observado.

- [ ] **Step 1: Confirmar formato** — buscar no openapi os campos de contato/localização e/ou logs. Anotar os nomes reais (ex.: `content.vcard`, `content.displayName`, `content.degreesLatitude`).

- [ ] **Step 2: Normalizar `contactMessage` e `locationMessage`** em `normalizeUazapiPayload`, dentro do objeto `message:` (após `stickerMessage`, antes de `reactionMessage`):

```ts
        // Contato (vCard)
        contactMessage: (msg.mediaType === 'contact' || msg.messageType === 'ContactMessage' || content.vcard) ? {
          displayName: content.displayName || content.name || msg.text || null,
          vcard: content.vcard || null,
        } : null,
        // Localização
        locationMessage: (msg.mediaType === 'location' || msg.messageType === 'LocationMessage' || content.degreesLatitude != null) ? {
          degreesLatitude: content.degreesLatitude ?? content.latitude ?? null,
          degreesLongitude: content.degreesLongitude ?? content.longitude ?? null,
        } : null,
```

- [ ] **Step 3: Preservar telefones no contato** — em `detectMessageType`, ramo `contato` (linha 210-218), passar a guardar o vCard em `conteudo` e o nome em `midia_nome`:

```ts
  // Contato
  if (message.message?.contactMessage) {
    const c = message.message.contactMessage;
    return {
      tipo: 'contato',
      conteudo: c.vcard || c.displayName || null,
      midia_url: null,
      midia_mimetype: null,
      midia_nome: c.displayName || null,
    };
  }
```

- [ ] **Step 4: Deploy** via MCP `mcp__supabase__deploy_edge_function` (name `webhook-whatsapp-inbox`). ⚠️ Esta edge é grande e usa `_shared/uazapi.ts` — incluir os mesmos arquivos compartilhados que o deploy atual usa. **Se o deploy via MCP inline for arriscado para esta função** (1100+ linhas), preferir deploy via Supabase CLI (`supabase functions deploy webhook-whatsapp-inbox`) conforme já documentado em `.claude/memory/integracao-infra.md`. Confirmar com o usuário qual via usar.

- [ ] **Step 5: Verificação** — pedir ao Hugo para enviar um **contato** e uma **localização** de um número de teste para uma caixa do Sucesso do Aluno; conferir que aparecem corretamente na timeline (cartão / link de mapa). Alternativa sem device: checar via `get_logs` que `normalizeUazapiPayload` produz os campos e a linha grava `tipo=contato`/`localizacao`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/webhook-whatsapp-inbox/index.ts
git -c user.name="Luciano" commit -m "feat(webhook): normaliza contato/localizacao UAZAPI + preserva vCard do contato"
```

---

### Task 3: Edge `enviar-vcard` — `conversaId`, registro como `contato`, normalização de número

**Files:**
- Modify: `supabase/functions/enviar-vcard/index.ts`

**Interfaces:**
- Consumes: tabela `vcards_unidade`; tabela `admin_mensagens`.
- Produces: edge aceita `{ numeroDestino, vcardId?, vcard?, conversaId?, remetenteNome? }`; quando `conversaId`, grava 1 linha `admin_mensagens` `tipo='contato'` com vCard em `conteudo`.

- [ ] **Step 1: Reescrever a edge** `supabase/functions/enviar-vcard/index.ts` com: normalização de número que descarta sufixo `@`, geração de vCard `.vcf`, busca de `titulo`, e registro condicional em `admin_mensagens`:

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

// Normaliza telefone: descarta sufixo @..., só dígitos, garante prefixo 55. Vazio -> ''.
function normalizarTelefone(tel) {
  const limpo = String(tel || '').split('@')[0].replace(/\D/g, '');
  if (!limpo) return '';
  return limpo.startsWith('55') ? limpo : '55' + limpo;
}

// Monta um vCard 3.0 (.vcf) a partir dos dados do cartão.
function montarVCard(fullName, telefones, organizacao) {
  const linhas = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${fullName}`];
  if (organizacao) linhas.push(`ORG:${organizacao}`);
  for (const t of telefones) linhas.push(`TEL;type=CELL:${t}`);
  linhas.push('END:VCARD');
  return linhas.join('\n');
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
    const { numeroDestino, vcardId, vcard, conversaId, remetenteNome } = await req.json();

    const destino = normalizarTelefone(numeroDestino);
    if (!destino) return json({ ok: false, erro: 'numeroDestino inválido ou ausente' }, 400);
    if (!vcardId && !vcard) return json({ ok: false, erro: 'Informe vcardId ou vcard' }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // vcard ad-hoc tem prioridade (permite testar edições não salvas)
    let dados = vcard;
    let titulo = null;
    if (!dados && vcardId) {
      const { data, error } = await supabase
        .from('vcards_unidade')
        .select('titulo, full_name, telefones, organizacao, email, url')
        .eq('id', vcardId)
        .maybeSingle();
      if (error || !data) return json({ ok: false, erro: 'Cartão não encontrado' }, 404);
      titulo = data.titulo;
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

    // Registro no histórico da conversa (só quando veio de uma conversa)
    if (conversaId) {
      try {
        const vcf = montarVCard(fullName, telefones, dados.organizacao);
        await supabase.from('admin_mensagens').insert({
          conversa_id: conversaId,
          direcao: 'saida',
          remetente: 'admin',
          remetente_nome: remetenteNome || 'Admin',
          tipo: 'contato',
          conteudo: vcf,
          midia_nome: fullName,
          status_entrega: 'enviada',
          whatsapp_message_id: messageId,
        });
      } catch (regErr) {
        console.error('[enviar-vcard] Falha ao registrar em admin_mensagens (envio ok):', regErr);
        // não falha o envio por causa do registro
      }
    }

    return json({ ok: true, messageId });
  } catch (err) {
    console.error('[enviar-vcard] Erro:', err);
    return json({ ok: false, erro: err?.message || 'Erro interno' }, 500);
  }
});
```

- [ ] **Step 2: Confirmar shape do insert** — comparar as colunas usadas no insert acima com o que `enviar-mensagem-admin` grava (ler `supabase/functions/enviar-mensagem-admin/index.ts`). Ajustar se faltar coluna obrigatória (ex.: `aluno_id`). As colunas existentes em `admin_mensagens`: `conversa_id, aluno_id, direcao, tipo, conteudo, midia_url, midia_mimetype, midia_nome, remetente, remetente_nome, status_entrega, whatsapp_message_id, created_at, reacoes, deletada, editada`.

- [ ] **Step 3: Deploy** via MCP `mcp__supabase__deploy_edge_function` (name `enviar-vcard`, incluir `index.ts` + `../_shared/uazapi.ts` como no deploy da Fase 1).

- [ ] **Step 4: Teste retrocompat (sem conversaId)** — curl/MCP enviando só `numeroDestino`+`vcard` para `5521964171223`.
Expected: `{ ok: true, messageId }`, nada gravado em `admin_mensagens`.

- [ ] **Step 5: Teste com conversaId** — pegar uma conversa real (`SELECT id FROM admin_conversas LIMIT 1`) e invocar com `conversaId`. Usar o token anon como na Fase 1.
Expected: cartão chega em `5521964171223` **e** nova linha `tipo=contato` em `admin_mensagens` daquela conversa. Verificar:
```sql
SELECT tipo, conteudo, midia_nome FROM admin_mensagens WHERE conversa_id='<CONV_ID>' ORDER BY created_at DESC LIMIT 1;
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/enviar-vcard/index.ts
git -c user.name="Luciano" commit -m "feat(vcard): edge registra envio como contato na conversa + normaliza JID"
```

---

### Task 4: `TemplateSelector` — chips de cartão (aditivo)

**Files:**
- Modify: `src/components/App/PreAtendimento/components/chat/TemplateSelector.tsx`

**Interfaces:**
- Produces:
  - `export interface VcardChip { id: string; titulo: string; full_name: string; qtdTelefones: number }`
  - props opcionais `vcards?: VcardChip[]` e `onSelecionarVcard?: (id: string) => void`.

- [ ] **Step 1: Adicionar a interface e as props.** No topo de `TemplateSelector.tsx` (após os imports) exportar o tipo, e estender `TemplateSelectorProps`:

```tsx
export interface VcardChip { id: string; titulo: string; full_name: string; qtdTelefones: number }
```
Em `TemplateSelectorProps` adicionar:
```tsx
  /** Cartões de contato (vCard) a exibir como chips junto dos templates (só admin/sucesso_aluno). */
  vcards?: VcardChip[];
  onSelecionarVcard?: (id: string) => void;
```
E na desestruturação dos props da função: adicionar `vcards = [], onSelecionarVcard`.

- [ ] **Step 2: Importar o ícone.** Na linha `import { X, Loader2, Search, Zap } from 'lucide-react';` adicionar `Contact`:
```tsx
import { X, Loader2, Search, Zap, Contact } from 'lucide-react';
```

- [ ] **Step 3: Renderizar chips de vcard no modo `bar`.** No bloco do modo bar (após o `.map` dos templates, dentro do mesmo container `flex flex-wrap`), adicionar:

```tsx
          {vcards.map(v => (
            <button
              key={`vc-${v.id}`}
              onClick={() => { onSelecionarVcard?.(v.id); onFechar(); }}
              className="px-3 py-1.5 text-[11px] border rounded-lg transition font-medium inline-flex items-center gap-1.5 bg-sky-500/10 text-sky-400 border-sky-500/25 hover:bg-sky-500/20"
            >
              <Contact className="w-3 h-3" />
              {v.titulo}
            </button>
          ))}
```

- [ ] **Step 4: Renderizar chips de vcard no modo `dropdown`.** Na lista do dropdown, após o `.map` de `templatesFiltrados`, adicionar os vcards filtrados pelo mesmo `filtro`:

```tsx
            {vcards
              .filter(v => !filtro.trim() || v.titulo.toLowerCase().includes(filtro.toLowerCase()) || v.full_name.toLowerCase().includes(filtro.toLowerCase()))
              .map(v => (
                <button
                  key={`vc-${v.id}`}
                  onClick={() => { onSelecionarVcard?.(v.id); onFechar(); }}
                  className="w-full text-left px-3 py-2.5 transition flex items-start gap-3 text-slate-300 hover:bg-slate-700/50"
                >
                  <Contact className="w-4 h-4 flex-shrink-0 mt-0.5 text-sky-400" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{v.titulo}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase bg-sky-500/15 text-sky-400 border border-sky-500/25 flex-shrink-0">Contato</span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">{v.full_name} · {v.qtdTelefones} tel.</p>
                  </div>
                </button>
              ))}
```
(Inserir logo após o fechamento do `.map` de templates e antes do fechamento do container da lista. Navegação por teclado opcional — não bloquear: o clique funciona.)

- [ ] **Step 5: Build** `npm run build`.
Expected: sem erros (props opcionais → demais usos não quebram).

- [ ] **Step 6: Commit**

```bash
git add src/components/App/PreAtendimento/components/chat/TemplateSelector.tsx
git -c user.name="Luciano" commit -m "feat(templates): chips de cartao de contato no TemplateSelector"
```

---

### Task 5: `AdminChatPanel` + `CaixaEntradaTab` — carregar cartões e disparar

**Files:**
- Modify: `src/components/App/Administrativo/CaixaEntrada/AdminChatPanel.tsx`
- Modify: `src/components/App/Administrativo/CaixaEntrada/CaixaEntradaTab.tsx`

**Interfaces:**
- Consumes: `useVcardsUnidade` (Fase 1), `VcardChip`/`onSelecionarVcard` (Task 4), edge `enviar-vcard` (Task 3).

- [ ] **Step 1: Passar `remetenteNome` do parent.** Em `CaixaEntradaTab.tsx`, no JSX `<AdminChatPanel ... />` (linha ~141), adicionar a prop:

```tsx
            remetenteNome={remetenteNome}
```
(`remetenteNome` já existe no escopo do `CaixaEntradaTab` — é passado ao `useAdminMensagens`.)

- [ ] **Step 2: Aceitar a prop no `AdminChatPanel`.** Na interface de props do componente, adicionar `remetenteNome?: string;` e desestruturar com default `'Admin'`. (Localizar a interface de props do `AdminChatPanel` e o parâmetro da função.)

- [ ] **Step 3: Importar o hook.** No topo de `AdminChatPanel.tsx`:
```tsx
import { useVcardsUnidade } from '@/components/App/SucessoCliente/hooks/useVcardsUnidade';
import type { VcardChip } from '@/components/App/PreAtendimento/components/chat/TemplateSelector';
```

- [ ] **Step 4: Carregar cartões só no Sucesso do Aluno, com guarda de unidade nula.** Dentro do componente `AdminChatPanel` (após os hooks de estado existentes), adicionar:

```tsx
  // Cartões de contato (vCard) — só no inbox Sucesso do Aluno
  const unidadeCartoes = contexto === 'sucesso_aluno'
    ? (aluno?.unidade_id || conversa.unidade_id || null)
    : null;
  const { cartoes: vcardsRaw } = useVcardsUnidade(unidadeCartoes || 'todos');
  const vcards: VcardChip[] = (contexto === 'sucesso_aluno' && unidadeCartoes)
    ? vcardsRaw.map(c => ({ id: c.id, titulo: c.titulo, full_name: c.full_name, qtdTelefones: c.telefones.length }))
    : [];
```
⚠️ A guarda `unidadeCartoes && ...` garante que, com unidade nula, `vcards` fica `[]` mesmo que o hook tenha sido chamado com `'todos'` (não vaza cartões de todas as unidades). O hook é sempre chamado (regra dos hooks), mas o resultado só é usado quando há unidade real.

- [ ] **Step 5: Handler de disparo (envio direto).** Adicionar um `useCallback`:

```tsx
  const dispararVcard = useCallback(async (vcardId: string) => {
    let jid = conversa.whatsapp_jid;
    if (!jid) {
      const tel = (aluno?.whatsapp || aluno?.telefone || '').replace(/\D/g, '');
      if (!tel) { toast.error('Conversa sem telefone para envio'); return; }
      jid = `${tel.startsWith('55') ? tel : '55' + tel}@s.whatsapp.net`;
    }
    try {
      const { data, error } = await supabase.functions.invoke('enviar-vcard', {
        body: { vcardId, numeroDestino: jid, conversaId: conversa.id, remetenteNome },
      });
      if (error || !data?.ok) {
        toast.error('Falha ao enviar cartão: ' + (data?.erro || error?.message || 'erro desconhecido'));
      } else {
        toast.success('Cartão enviado');
        // timeline atualiza via realtime (useAdminMensagens assina INSERT)
      }
    } catch (err: any) {
      toast.error('Erro ao enviar cartão: ' + (err?.message || 'desconhecido'));
    }
  }, [conversa.whatsapp_jid, conversa.id, aluno, remetenteNome]);
```

- [ ] **Step 6: Passar aos dois `TemplateSelector`.** Nos dois usos (modo bar linha ~811 e dropdown linha ~906), adicionar as props:
```tsx
              vcards={vcards}
              onSelecionarVcard={dispararVcard}
```

- [ ] **Step 7: Build** `npm run build`.
Expected: sem erros.

- [ ] **Step 8: Teste manual (UI ponta a ponta).** `npm run dev`:
  - Sucesso do Aluno → Caixa de Entrada → abrir uma conversa de um aluno com unidade.
  - Abrir templates (botão ou `/`) → ver chips "Contato" (cartões da unidade).
  - Clicar num cartão → toast "Cartão enviado" → o cartão aparece na timeline (renderizado) → chega no WhatsApp do destinatário.
  - Verificar **regressão**: no inbox Administrativo puro (não Sucesso do Aluno) os chips de contato **não** aparecem; pré-atendimento idem.

- [ ] **Step 9: Commit**

```bash
git add src/components/App/Administrativo/CaixaEntrada/AdminChatPanel.tsx src/components/App/Administrativo/CaixaEntrada/CaixaEntradaTab.tsx
git -c user.name="Luciano" commit -m "feat(caixa): disparo de cartao de contato na conversa (Sucesso do Aluno)"
```

---

### Task 6: Documentação e memória

**Files:**
- Modify: `CLAUDE.md`, `docs/MAPA-SISTEMA.md`, `.claude/memory/integracao-infra.md`
- Append: `daily-notes/2026-06-24.md`

- [ ] **Step 1: `CLAUDE.md`** — no bullet do vCard (seção Integrações), atualizar a Fase 2 de "pendente" para implementada: chips de contato no inbox Sucesso do Aluno (envio direto), registro como `tipo=contato` na timeline, tipos `contato`/`localizacao` + fallback na caixa.

- [ ] **Step 2: `docs/MAPA-SISTEMA.md`** — em Sucesso do Aluno e/ou Caixa de Entrada: registrar que o `AdminChatPanel` renderiza `contato`/`localizacao`, e que os chips de cartão disparam `enviar-vcard` com `conversaId`.

- [ ] **Step 3: `.claude/memory/integracao-infra.md`** — atualizar o bullet `enviar-vcard` (ganhou `conversaId`/registro), e o de `webhook-whatsapp-inbox` (normaliza contato/localização). Bullet conciso.

- [ ] **Step 4: daily note** `daily-notes/2026-06-24.md` — append do que foi feito na Fase 2 (tipos da caixa, disparo no inbox), com ponteiros (commits, edges).

- [ ] **Step 5: Commit + push**

```bash
git add CLAUDE.md docs/MAPA-SISTEMA.md .claude/memory/integracao-infra.md daily-notes/2026-06-24.md
git -c user.name="Luciano" commit -m "docs(vcard): Fase 2 — tipos da caixa + disparo no inbox"
git push
```

---

## Self-Review

**Spec coverage:**
- Recebimento contato/localização (webhook normalize + detect) → Task 2 ✅
- Front tipos `contato`/`localizacao` + render + fallback → Task 1 ✅
- `VcardPreview` compacto (esconde header) → Task 1 Step 3 ✅
- Edge `conversaId`/`remetenteNome` + registro `tipo=contato` + vCard .vcf + normalização `@` → Task 3 ✅
- `TemplateSelector` chips (bar+dropdown, busca) → Task 4 ✅
- `AdminChatPanel` carregar (guarda unidade nula, `qtdTelefones=telefones.length`) só em `sucesso_aluno` + disparo direto + realtime → Task 5 ✅
- `CaixaEntradaTab` passa `remetenteNome` → Task 5 Step 1 ✅
- Retrocompat edge (sem conversaId) → Task 3 Step 4 ✅
- Regressão Administrativo/Pré-atendimento → Task 5 Step 8 ✅
- Docs/memória → Task 6 ✅

**Placeholder scan:** sem TODO/TBD; Task 2 marca explicitamente "confirmar formato UAZAPI" como passo de verificação real (não placeholder de código).

**Type consistency:** `VcardChip {id,titulo,full_name,qtdTelefones}` definido na Task 4 e consumido na Task 5 com os mesmos campos; `parseVcard` retorno `{fullName,telefones,organizacao}` usado na Task 1 e espelha o `montarVCard` da Task 3 (FN/ORG/TEL); edge body `{numeroDestino,vcardId,vcard,conversaId,remetenteNome}` consistente entre Task 3 e Task 5.
