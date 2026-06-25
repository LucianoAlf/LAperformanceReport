# Design — vCard Fase 2: disparo no inbox (Sucesso do Aluno)

**Data:** 2026-06-24
**Autor:** Hugo (via Claude)
**Status:** Aprovado para planejamento
**Depende de:** Fase 1 (`docs/superpowers/specs/2026-06-24-vcard-contato-design.md`) — tabela `vcards_unidade` e edge `enviar-vcard` já em produção.

## Problema

Na Fase 1, os cartões de contato (vCard) podem ser gerenciados e testados, mas só via
aba de teste. A Fase 2 permite que o atendente **dispare um cartão dentro de uma conversa
real** da Caixa de Entrada, junto das mensagens prontas, como mais uma "ação rápida".

## Escopo

- **Apenas** o inbox **Sucesso do Aluno / Administrativo** (`AdminChatPanel`, contexto
  `administrativo`). Pré-atendimento e Comercial **não** mudam.
- Reusa a edge `enviar-vcard` (Fase 1) e a tabela `vcards_unidade`.

## Decisões tomadas (brainstorming)

- **Onde:** só Sucesso do Aluno (admin).
- **Fluxo:** **um chip por cartão** no seletor de templates (selo "Contato") + **envio
  direto** (sem modal de confirmação). Trade-off registrado: difere do padrão de
  confirmação usado na automação (pesquisa 1ª aula); risco de clique acidental aceito
  pelo Hugo em favor da rapidez.
- **Registro:** após o envio, **gravar no histórico** da conversa (`admin_mensagens`) como
  **texto descritivo** (`📇 Cartão de contato enviado: {titulo}`). Não renderizar o cartão
  clicável na timeline (YAGNI).
- **Resolução de unidade:** `aluno?.unidade_id || conversa.unidade_id`. Unidade nula →
  não exibe chips de cartão (sem erro).

## Arquitetura

### 1. Edge `enviar-vcard` — modificação retrocompatível

Arquivo: `supabase/functions/enviar-vcard/index.ts`.

- Aceita dois campos **opcionais** no body: `conversaId?: string` e `remetenteNome?: string`.
- Ao buscar por `vcardId`, passa a selecionar também `titulo` (para a mensagem de registro).
- **Após o `POST /send/contact` bem-sucedido**, se `conversaId` veio: insere 1 linha em
  `admin_mensagens` **espelhando o shape do `enviar-mensagem-admin`** (para a linha renderizar
  igual no `ChatBubble` e via realtime):
  - `conversa_id = conversaId`
  - `direcao = 'saida'`, `remetente = 'admin'` (NÃO usar `'sistema'` — isso renderiza pill
    cinza centralizado de "nota do sistema"; queremos a bolha de saída normal)
  - `remetente_nome = remetenteNome`
  - `tipo = 'texto'`
  - `conteudo = '📇 Cartão de contato enviado: ' + titulo` (fallback: usa `fullName` se
    não houver título — caso `vcard` ad-hoc)
  - `aluno_id` (nullable) e `status_entrega` conforme o `enviar-mensagem-admin` grava —
    **verificar o shape completo do insert contra essa edge no plano** (colunas confirmadas
    existentes: `conversa_id`, `direcao`, `remetente`, `remetente_nome`, `tipo`, `conteudo`,
    `aluno_id`, `status_entrega`).
- Sem `conversaId` (modo teste da Fase 1) → comportamento atual **inalterado**.
- Falha no envio → **não grava** em `admin_mensagens` (registro só após sucesso).
- O título: quando o envio é por `vcard` ad-hoc (sem id), usa `fullName` no texto.

### 2. `TemplateSelector` — modificação aditiva

Arquivo: `src/components/App/PreAtendimento/components/chat/TemplateSelector.tsx`.

- Novas props **opcionais**:
  - `vcards?: VcardChip[]` onde `VcardChip = { id: string; titulo: string; full_name: string; qtdTelefones: number }`
  - `onSelecionarVcard?: (id: string) => void`
- Renderiza os vcards como **chips adicionais** junto dos templates, **nos dois modos**
  (`bar` e `dropdown`): ícone `Contact` (lucide), selo "Contato" (cor distinta, ex. sky),
  rótulo = `titulo`.
- Clicar num chip de vcard chama `onSelecionarVcard(id)` (e fecha o seletor, como os
  templates fazem).
- Quando `vcards` não é passado (pré-atendimento/comercial) → nada muda. Sem regressão.
- O filtro de busca (modo dropdown) deve considerar os vcards também (por `titulo`/`full_name`).

### 3. `AdminChatPanel` — integração

Arquivo: `src/components/App/Administrativo/CaixaEntrada/AdminChatPanel.tsx`.

- Carrega os cartões da unidade da conversa: `useVcardsUnidade(unidadeResolvida)` onde
  `unidadeResolvida = aluno?.unidade_id || conversa.unidade_id`. Se nula, lista vazia.
  - (Obs.: `useVcardsUnidade` aceita `UnidadeId`; passar a unidade resolvida ou `'todos'`
    apenas quando houver unidade. Unidade nula → não chamar / lista vazia. Detalhe no plano.)
- Mapeia para `VcardChip[]` (`{ id, titulo, full_name, qtdTelefones: telefones.length }`)
  e passa ao `TemplateSelector` (nos dois usos: dropdown e bar) junto com `onSelecionarVcard`.
- `onSelecionarVcard(id)`: resolve o número (`conversa.whatsapp_jid`, ou monta de
  `aluno.whatsapp/telefone` com prefixo 55 — mesma lógica de `dispararAutomacao`), e chama:
  ```ts
  supabase.functions.invoke('enviar-vcard', {
    body: {
      vcardId: id,
      numeroDestino: jid,          // a edge normaliza (aceita @s.whatsapp.net ou número)
      conversaId: conversa.id,
      remetenteNome,
    },
  })
  ```
  - Sucesso → `toast.success('Cartão enviado')`. **O registro aparece na timeline
    automaticamente** — `useAdminMensagens` já assina INSERT de `admin_mensagens` via
    realtime (não precisa refetch manual; `AdminChatPanel` recebe `mensagens` como prop).
  - Erro → `toast.error(...)`.
- **Envio direto** (sem modal). Fecha o seletor ao clicar.

**Wiring no parent (`CaixaEntradaTab.tsx`):** `AdminChatPanel` hoje não tem fonte para
`remetenteNome` nem para a unidade resolvida. O parent (que já alimenta `remetenteNome` em
`useAdminMensagens`) deve **passar `remetenteNome` como prop** ao `AdminChatPanel`. O
`useVcardsUnidade` é chamado **dentro** do `AdminChatPanel` (a unidade é resolvida de
`aluno`/`conversa`, que ele já possui).

⚠️ **Nota sobre `numeroDestino`:** a edge hoje faz `replace(/\D/g, '')`, o que transforma
`5521...@s.whatsapp.net` em `5521...` + dígitos do sufixo. **No plano**, ajustar a
normalização da edge para descartar o sufixo `@...` antes de limpar (`split('@')[0]`),
para aceitar com segurança o `whatsapp_jid` vindo da conversa. (Padrão da skill uazapi:
`phone.split('@')[0].replace(/\D/g, '')`.)

## Fluxo de dados

```
Atendente na conversa (AdminChatPanel)
  → abre templates → TemplateSelector mostra chips "Contato" (vcards da unidade)
  → clica num cartão → onSelecionarVcard(id)
  → invoke enviar-vcard { vcardId, numeroDestino=jid, conversaId, remetenteNome }
  → edge: /send/contact (UAZAPI caixa 3) → grava admin_mensagens (texto descritivo)
  → frontend recarrega mensagens → timeline mostra "📇 Cartão de contato enviado: X"
```

## Tratamento de erros

- Unidade nula ou sem cartões → chips de contato não aparecem (silencioso).
- Conversa sem `whatsapp_jid` e aluno sem telefone → toast de erro, não invoca a edge.
- Falha UAZAPI → toast de erro; sem registro em `admin_mensagens`.
- Falha ao gravar `admin_mensagens` após envio ok → o cartão **já foi enviado**; logar o
  erro na edge mas ainda retornar `{ ok: true }` (não falhar o envio por causa do registro).
  Como o registro é só após sucesso, não há duplicação (a edge não tem retry interno).

## Testes / verificação

- Build TS (`npm run build`).
- Edge: invocar com `conversaId` de uma conversa real → cartão chega **e** linha aparece
  em `admin_mensagens` daquela conversa.
- Edge retrocompat: invocar sem `conversaId` (modo teste Fase 1) → envia, não grava.
- Edge: `numeroDestino` com sufixo `@s.whatsapp.net` → normaliza e envia corretamente.
- UI manual: abrir uma conversa no inbox Sucesso do Aluno → abrir templates → ver chips
  "Contato" da unidade → clicar → toast + cartão no WhatsApp + registro na timeline.
- UI regressão: pré-atendimento e comercial continuam sem chips de contato e funcionando.

## Fora de escopo

- Confirmação antes de enviar (decidido: envio direto).
- Renderizar o cartão clicável na timeline (decidido: texto descritivo).
- Pré-atendimento e Comercial.
- Uso do vCard na régua de boas-vindas automática (fase futura, separada).
