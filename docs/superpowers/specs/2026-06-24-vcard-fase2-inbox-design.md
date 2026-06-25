# Design — vCard Fase 2: disparo no inbox + tipos de mensagem da caixa

**Data:** 2026-06-24
**Autor:** Hugo (via Claude)
**Status:** Aprovado para planejamento
**Depende de:** Fase 1 (`docs/superpowers/specs/2026-06-24-vcard-contato-design.md`) — tabela `vcards_unidade` e edge `enviar-vcard` já em produção.

## Problema

Na Fase 1, os cartões de contato (vCard) podem ser gerenciados e testados, mas só via aba
de teste. A Fase 2 permite que o atendente **dispare um cartão dentro de uma conversa real**
da Caixa de Entrada do Sucesso do Aluno, junto das mensagens prontas, e que o cartão fique
registrado no histórico **exatamente como um cartão de contato do WhatsApp** (clicável/visual,
não um texto resumido).

Ao investigar, descobriu-se que a caixa não renderiza tipos `contato` e `localizacao` (o
webhook até os detecta, mas o front os desconhece e o normalizador UAZAPI não os repassa).
Então a Fase 2 também **completa os tipos de mensagem padrão do WhatsApp** na caixa.

## Arquitetura do chat (contexto importante)

O componente de chat é **compartilhado**: vive em `Administrativo/CaixaEntrada/`
(`CaixaEntradaTab` → `AdminChatPanel`), e o Sucesso do Aluno o reusa via
`SucessoClientePage` com `departamento="sucesso_aluno"` (passado adiante como `contexto`).
Logo, mexer no `AdminChatPanel` afeta **os dois** inboxes (Administrativo e Sucesso do Aluno);
o que for específico do Sucesso do Aluno deve ser condicionado a `contexto === 'sucesso_aluno'`.

## Decisões tomadas (brainstorming)

- **Onde disparar:** só Sucesso do Aluno → chips de cartão **só quando `contexto === 'sucesso_aluno'`**.
- **Fluxo de envio:** **um chip por cartão** no seletor de templates (selo "Contato") +
  **envio direto** (sem modal). Trade-off registrado: difere do padrão de confirmação da
  automação (pesquisa 1ª aula); risco de clique acidental aceito pelo Hugo em favor da rapidez.
- **Registro:** o cartão enviado é gravado em `admin_mensagens` como **tipo `contato`** e
  renderizado como **cartão visual de verdade** na timeline (não texto resumido).
- **Tipos da caixa:** completar **contato** e **localizacao** (render + recebimento) +
  **fallback gracioso** para tipos raros. Enquete/evento/figurinha animada ficam no fallback.
- **Resolução de unidade (qual cartão exibir):** `aluno?.unidade_id || conversa.unidade_id`.
  Unidade nula → não exibe chips de cartão (sem erro).

## Escopo

- **Disparo de vCard:** só inbox Sucesso do Aluno (`contexto === 'sucesso_aluno'`).
- **Tipos de mensagem (render + recebimento):** valem para os dois inboxes (componente
  compartilhado) — contato, localizacao, fallback.
- **Fora de escopo:** envio de localização por nós (só recebimento); enquete/poll, evento,
  figurinha animada (caem no fallback); Pré-atendimento/Comercial não ganham chips de cartão;
  uso do vCard na régua de boas-vindas automática (fase futura).

## Arquitetura

### A. Recebimento — `webhook-whatsapp-inbox`

Arquivo: `supabase/functions/webhook-whatsapp-inbox/index.ts`.

1. **`normalizeUazapiPayload`** (hoje só normaliza texto/áudio/imagem/vídeo/documento/
   sticker/reação): passar a repassar **`contactMessage`** e **`locationMessage`** a partir
   do payload UAZAPI raw.
   - ⚠️ O formato exato do contato/localização recebido via UAZAPI **deve ser confirmado no
     plano** (consultar `docs/uazapi-openapi-spec.yaml` e/ou logs reais). Provável: contato em
     `msg.content`/`messageType='ContactMessage'` com campo `vcard`/`displayName`; localização
     com `degreesLatitude`/`degreesLongitude`. O plano confirma antes de implementar.
2. **`detectMessageType`** (já tem os ramos `contato` e `localizacao`):
   - `contato`: gravar o **vCard completo** (`.vcf`) em `conteudo` e o `displayName` em
     `midia_nome` (hoje grava `displayName || vcard` só em `conteudo` — passar a guardar o
     vcard para preservar os telefones, e o nome em `midia_nome`).
   - `localizacao`: manter lat/lng em `conteudo` (formato a confirmar; ex. `"lat,lng"` ou JSON).
3. Tipos desconhecidos (estado atual confirmado): o `detectMessageType` **já colapsa**
   qualquer tipo não reconhecido em `tipo:'texto'`, `conteudo:'[Mensagem não suportada]'`.
   Ou seja, **o fallback de recebimento já existe** (vira texto legível) — **não mudar** o
   webhook nesse ponto. O fallback do front (§B) é uma defesa adicional para linhas
   `contato`/`localizacao` com conteúdo inválido, não um substituto disso.

### B. Front — tipos e renderização

**`types.ts`** (`Administrativo/CaixaEntrada/types.ts`):
`TipoMensagemAdmin` passa a incluir `'contato' | 'localizacao'`.

**Render na bolha (`AdminChatPanel`)** — a função que hoje trata `sticker/imagem/audio/
video/documento` (≈ linha 153+):
- `contato` → parseia o vCard de `conteudo` (extrair `FN`/nome e `TEL`/telefones via regex
  simples) e renderiza o **cartão visual reaproveitando `VcardPreview`** (Fase 1):
  `src/components/App/SucessoCliente/VcardPreview.tsx` (avatar, nome, telefones, botões
  "Conversar/Adicionar"). **Necessário** ajustar o `VcardPreview`: hoje ele tem header
  hardcoded "Pré-visualização (WhatsApp)" e `max-w-sm` — adicionar prop `compact?: boolean`
  que **esconde o header** (e relaxa o `max-w`) para uso na bolha, mantendo o uso da Fase 1
  (sem `compact`). Fallback de nome: `midia_nome`.
- `localizacao` → card com rótulo "📍 Localização" + link "Abrir no mapa"
  (`https://www.google.com/maps?q=<lat>,<lng>`), parseando `conteudo`.
- **Fallback gracioso:** qualquer `tipo` sem case conhecido → bolha
  "📎 Mensagem não suportada" (em vez de retornar `null`/quebrar). Cobrir também o caminho
  atual `if (!msg.midia_url) return null;` para não engolir contato/localizacao (que não têm
  `midia_url`).

⚠️ **Reuso cross-módulo:** `AdminChatPanel` (em `Administrativo/`) passaria a importar
`VcardPreview` (em `SucessoCliente/`). Aceitável (já há import cruzado: `CaixaEntradaTab` é
importado pelo `SucessoCliente`). Se preferir evitar acoplamento de pasta, o plano pode mover
`VcardPreview` para `components/ui/` — decisão do plano; default: importar de onde está.

### C. Envio do vCard — edge + TemplateSelector + AdminChatPanel

**Edge `enviar-vcard`** (`supabase/functions/enviar-vcard/index.ts`) — modificação
retrocompatível:
- Novos campos opcionais no body: `conversaId?: string`, `remetenteNome?: string`.
- Ao buscar por `vcardId`, selecionar também `titulo` e (já seleciona) `full_name`/`telefones`/
  `organizacao` para montar o vCard.
- **Normalização de número:** ajustar para descartar sufixo `@...` antes de limpar
  (`String(x).split('@')[0].replace(/\D/g,'')`), pois o `numeroDestino` virá do
  `conversa.whatsapp_jid` (`...@s.whatsapp.net`). Aplicar tanto em `numeroDestino` quanto nos
  telefones do cartão.
- **Após `POST /send/contact` bem-sucedido**, se `conversaId` veio: montar um **vCard string
  (.vcf)** a partir dos dados (mesmo formato/uso do que vai à UAZAPI) e inserir 1 linha em
  `admin_mensagens` espelhando o shape do `enviar-mensagem-admin`:
  - `conversa_id = conversaId`
  - `direcao = 'saida'`, `remetente = 'admin'` (NÃO `'sistema'` — evita pill cinza centralizado)
  - `remetente_nome = remetenteNome`
  - `tipo = 'contato'`
  - `conteudo = <vCard .vcf>` (BEGIN:VCARD … FN … TEL … END:VCARD)
  - `midia_nome = <fullName>`
  - `aluno_id` (nullable) e `status_entrega` conforme `enviar-mensagem-admin` — **verificar o
    shape completo do insert contra essa edge no plano** (colunas existentes confirmadas:
    `conversa_id, direcao, tipo, conteudo, midia_url, midia_mimetype, midia_nome, remetente,
    remetente_nome, status_entrega, aluno_id, whatsapp_message_id, reacoes, deletada, editada`).
- Sem `conversaId` (modo teste Fase 1) → comportamento **inalterado**.
- Falha ao gravar `admin_mensagens` após envio ok → o cartão **já foi enviado**; logar o erro
  mas ainda retornar `{ ok: true }` (não falhar o envio por causa do registro; sem retry interno,
  não há duplicação).

**`TemplateSelector`** (`PreAtendimento/components/chat/TemplateSelector.tsx`) — aditivo:
- Props opcionais: `vcards?: VcardChip[]` (`{ id, titulo, full_name, qtdTelefones }`) e
  `onSelecionarVcard?: (id: string) => void`.
- Renderiza os vcards como **chips adicionais** junto dos templates, nos dois modos (`bar` e
  `dropdown`): ícone `Contact` (lucide), selo "Contato" (cor distinta). Busca (dropdown)
  considera `titulo`/`full_name`.
- Sem `vcards` → nada muda (pré-atendimento/comercial sem regressão).

**`AdminChatPanel`** (`Administrativo/CaixaEntrada/AdminChatPanel.tsx`):
- **Só quando `contexto === 'sucesso_aluno'`**: chama `useVcardsUnidade(unidadeResolvida)`
  (`unidadeResolvida = aluno?.unidade_id || conversa.unidade_id`).
  - ⚠️ **Guarda de unidade nula:** o hook recebe `UnidadeId` e trata `'todos'` como "todas as
    unidades" (NÃO retorna vazio). Então, quando `unidadeResolvida` for nula/ausente, **não
    chamar com `'todos'`** — passar a unidade real só quando existir e, se nula, garantir lista
    vazia (ex.: só montar/mostrar chips quando `unidadeResolvida` truthy; ou guard no hook).
  - Mapeia para `VcardChip[]` derivando **`qtdTelefones = telefones.length`** (o hook retorna
    `cartoes` com `{ id, titulo, full_name, telefones }`, sem `qtdTelefones`).
  - Passa ao `TemplateSelector` (nos dois usos) + `onSelecionarVcard`.
- `onSelecionarVcard(id)`: resolve o número (`conversa.whatsapp_jid`, ou monta de
  `aluno.whatsapp/telefone` com prefixo 55 — mesma lógica de `dispararAutomacao`) e invoca:
  ```ts
  supabase.functions.invoke('enviar-vcard', {
    body: { vcardId: id, numeroDestino: jid, conversaId: conversa.id, remetenteNome },
  })
  ```
  - Sucesso → `toast.success('Cartão enviado')`. **A timeline atualiza sozinha** via realtime
    (`useAdminMensagens` já assina INSERT de `admin_mensagens`); sem refetch manual.
  - Erro → `toast.error(...)`. **Envio direto** (sem modal). Fecha o seletor ao clicar.

**Wiring no parent (`CaixaEntradaTab.tsx`):** `AdminChatPanel` não tem fonte para
`remetenteNome` — o parent (que já alimenta `remetenteNome` em `useAdminMensagens`) deve
**passar `remetenteNome` como prop** ao `AdminChatPanel`.

## Fluxo de dados

```
Atendente (Sucesso do Aluno, AdminChatPanel)
  → abre templates → TemplateSelector mostra chips "Contato" (vcards da unidade)
  → clica num cartão → onSelecionarVcard(id)
  → invoke enviar-vcard { vcardId, numeroDestino=jid, conversaId, remetenteNome }
  → edge: /send/contact (UAZAPI caixa 3) → grava admin_mensagens tipo=contato (vCard .vcf)
  → realtime → bolha renderiza o CARTÃO (VcardPreview), não texto

Recebimento (aluno manda contato/localização)
  → webhook normaliza contactMessage/locationMessage → detectMessageType → admin_mensagens
  → front renderiza cartão de contato / card de localização (ou fallback)
```

## Tratamento de erros

- Unidade nula ou sem cartões → chips de contato não aparecem (silencioso).
- Conversa sem `whatsapp_jid` e aluno sem telefone → toast de erro, não invoca a edge.
- Falha UAZAPI → toast de erro; sem registro em `admin_mensagens`.
- Falha ao gravar registro após envio ok → loga, retorna `{ ok: true }` (cartão já saiu).
- vCard malformado no render → cair no fallback "Mensagem não suportada" em vez de quebrar.

## Testes / verificação

- Build TS (`npm run build`).
- **Edge envio+registro:** invocar com `conversaId` real → cartão chega no WhatsApp **e** linha
  `tipo=contato` aparece em `admin_mensagens`; a bolha renderiza o cartão.
- **Edge retrocompat:** invocar sem `conversaId` → envia, não grava (Fase 1 intacta).
- **Número com sufixo:** `numeroDestino` `...@s.whatsapp.net` → normaliza e envia.
- **UI disparo:** conversa no inbox Sucesso do Aluno → templates → chips "Contato" da unidade
  → clicar → toast + cartão no WhatsApp + cartão na timeline.
- **UI tipos recebidos:** simular/receber contato e localização → renderizam corretamente;
  tipo desconhecido → "Mensagem não suportada".
- **Regressão:** Administrativo puro (sem `sucesso_aluno`) **não** mostra chips de cartão;
  Pré-atendimento/Comercial inalterados.

## Componentes/arquivos tocados

- `supabase/functions/webhook-whatsapp-inbox/index.ts` (normalize + detect)
- `supabase/functions/enviar-vcard/index.ts` (params + registro + normalização número)
- `src/components/App/Administrativo/CaixaEntrada/types.ts` (tipos)
- `src/components/App/Administrativo/CaixaEntrada/AdminChatPanel.tsx` (render + chips + envio)
- `src/components/App/Administrativo/CaixaEntrada/CaixaEntradaTab.tsx` (passa `remetenteNome`)
- `src/components/App/PreAtendimento/components/chat/TemplateSelector.tsx` (chips de vcard)
- `src/components/App/SucessoCliente/VcardPreview.tsx` (variante compacta, se necessária)
