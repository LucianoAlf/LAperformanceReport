# Design — vCard de Contato (Cartões de Secretaria)

**Data:** 2026-06-24
**Autor:** Hugo (via Claude)
**Status:** Aprovado para planejamento

## Problema

Responsáveis e alunos frequentemente salvam o número errado da escola, chamam canais
antigos ou não sabem qual contato usar. A ideia é enviar um **cartão de contato (vCard)
clicável** pelo WhatsApp, por unidade, para o destinatário salvar a secretaria oficial
com um toque.

A UAZAPI tem suporte nativo via `POST /send/contact` (ver `docs/uazapi-openapi-spec.yaml`
linha 4179). Campos: `fullName`, `phoneNumber` (CSV de múltiplos telefones), `organization`,
`email`, `url`. Obrigatórios: `number` (destino), `fullName`, `phoneNumber`.

## Escopo e Faseamento

**Fase 1 (este spec):** gerenciar os cartões por unidade e **testar** o envio para qualquer
número, com preview visual de como o cartão chega no WhatsApp.

**Fase 2 (fora deste spec):** plugar os cartões no `TemplateSelector` do inbox, para o
atendente disparar o vCard dentro de uma conversa real (segue o padrão de "Automação"
das mensagens prontas — selo próprio, dispara edge em vez de preencher texto).

A Fase 1 entrega o "modo teste" pedido e deixa o dado pronto para a Fase 2 reusar sem
retrabalho.

## Decisões tomadas (brainstorming)

- **Preview:** simulação visual na tela **+** envio real para qualquer número (os dois).
- **Dados pré-preenchidos:** ao escolher a unidade, o form vem preenchido com o cartão
  dela e é **editável** antes de enviar.
- **Persistência:** banco (fonte única, reusável na Fase 2 e na régua de boas-vindas).
- **Cardinalidade:** vários cartões por unidade (secretaria, financeiro, etc.).
- **Arquitetura escolhida (A):** separar **dado** (tabela própria estruturada) de
  **apresentação** (na Fase 2 aparece junto das mensagens prontas via `TemplateSelector`).
  Rejeitada a abordagem B (serializar JSON dentro de `crm_templates_whatsapp.conteudo`),
  por criar dívida no dado e não ter `unidade_id`.
- **Caixa de envio:** "Sol – Sucesso do Aluno" (`whatsapp_caixas.id = 3`, provedor
  `uazapi`, função `administrativo`) — a mesma que enviará na Fase 2 e nas boas-vindas.
- **Localização da UI:** nova aba "Cartões de Contato" no módulo Sucesso do Aluno
  (`src/components/App/SucessoCliente/`).

## Arquitetura

### 1. Banco — tabela `vcards_unidade`

```sql
create table public.vcards_unidade (
  id          uuid primary key default gen_random_uuid(),
  unidade_id  uuid not null references public.unidades(id) on delete cascade,
  titulo      text not null,            -- rótulo no seletor: "Secretaria", "Financeiro"
  full_name   text not null,            -- nome salvo no contato: "LA Music CG — Secretaria"
  telefones   text[] not null default '{}',  -- vários números; vira CSV no /send/contact
  organizacao text,
  email       text,
  url         text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_vcards_unidade_unidade on public.vcards_unidade(unidade_id) where ativo;
```

- `updated_at` mantido por trigger padrão do projeto (reusar o existente, ex.
  `handle_updated_at`/`set_updated_at` — verificar nome real no schema antes da migration).
- **RLS:** habilitar e seguir o padrão das demais tabelas por unidade — admin/consolidado
  vê todas; usuário de unidade só a sua. Conferir helpers de RLS já usados
  (ex. `can_view_consolidated`, claim de `unidade_id`) e replicar. Não inventar política nova.
- `telefones` como `text[]` (não CSV) — melhor para a UI (lista de inputs) e validação.
  A conversão para CSV acontece só no momento do envio, na edge.
- O índice é parcial (`where ativo`): as queries do hook devem incluir `.eq('ativo', true)`
  para o planner usá-lo.

### 2. Edge function `enviar-vcard`

Caminho: `supabase/functions/enviar-vcard/index.ts`.

**Entrada (JSON):**
```ts
{
  numeroDestino: string;        // obrigatório; telefone destino (qualquer número, no teste)
  vcardId?: string;             // opção 1: cartão salvo (busca em vcards_unidade)
  vcard?: {                     // opção 2: cartão ad-hoc (testar antes de salvar)
    fullName: string;
    telefones: string[];
    organizacao?: string;
    email?: string;
    url?: string;
  };
}
```
Aceita `vcardId` **ou** `vcard`. Se ambos vierem, `vcard` (ad-hoc) tem prioridade — permite
testar edições não salvas. Se nenhum, erro 400.

**Fluxo:**
1. Validar entrada (`numeroDestino` obrigatório; ao menos um de `vcardId`/`vcard`;
   `fullName` e ao menos 1 telefone não-vazio).
2. Se `vcardId`: buscar a linha em `vcards_unidade` (service role).
3. Normalizar `numeroDestino` **e cada telefone do cartão** (prefixo `55`, limpar
   não-dígitos — padrão da skill uazapi), para o contato salvo ficar discável.
4. Resolver credenciais com `getUazapiCredentials(supabase, { caixaId: 3 })`
   (de `_shared/uazapi.ts`).
5. Montar payload `/send/contact`: `number=numeroDestino`, `fullName`,
   `phoneNumber = telefones.filter(Boolean).map(normalizar).join(',')`, `organization`,
   `email`, `url`.
6. `POST {baseUrl}/send/contact` com header `token`.
7. Retornar `{ ok: true, messageId }` ou `{ ok: false, erro }`.

**Stateless** — não grava nada. Serve teste (Fase 1) e disparo real (Fase 2).

### 3. Frontend — aba "Cartões de Contato"

Local: `src/components/App/SucessoCliente/`. Nova aba no `TabSucessoAluno`/`SucessoClientePage`
(seguir como as abas existentes — ex. `PesquisasTab` — são registradas).

**Componentes:**
- `CartoesContatoTab.tsx` — container: seletor de unidade + lista de cartões + área de edição/teste.
- `useVcardsUnidade.ts` (hook) — fetch/CRUD em `vcards_unidade` via `supabase` direto
  (padrão do projeto, sem React Query). Funções: `listarPorUnidade`, `criar`, `atualizar`,
  `excluir` (soft via `ativo=false` ou hard — seguir padrão do módulo; usar `ativo=false`
  para reversibilidade).
- `VcardPreview.tsx` — simulação visual do cartão como aparece no WhatsApp (avatar genérico,
  `full_name`, organização, lista de telefones, botão fake "Adicionar"/"Conversar"). Atualiza
  em tempo real conforme o form muda.
- Form de edição: campos `titulo`, `full_name`, `telefones` (lista dinâmica de inputs add/remove),
  `organizacao`, `email`, `url`. Validação com Zod + React Hook Form (padrão do projeto).

**Fluxo de teste:**
- Campo "Enviar teste para:" (número livre) + botão **Enviar**.
- Botão chama a edge `enviar-vcard` passando o `vcard` **ad-hoc** com os valores atuais do
  form (permite testar edições não salvas) e `numeroDestino`.
- Toast de sucesso/erro (Sonner). Usuário confere no próprio WhatsApp e compara com o preview.

**Acesso:** mesma permissão do módulo Sucesso do Aluno (não criar permissão nova).

## Fluxo de dados

```
[Aba Cartões de Contato]
  selecionar unidade → useVcardsUnidade.listarPorUnidade(unidadeId)
  editar form (preview atualiza em tempo real)
  salvar → useVcardsUnidade.criar/atualizar → vcards_unidade
  "Enviar teste" → supabase.functions.invoke('enviar-vcard', { vcard, numeroDestino })
                     → edge resolve caixa id 3 → POST /send/contact (UAZAPI)
                     → cartão chega no WhatsApp do número de teste
```

## Tratamento de erros

- **Edge:** 400 em entrada inválida (sem `numeroDestino`, sem cartão, sem telefone válido);
  502/500 com mensagem da UAZAPI se o `POST /send/contact` falhar; mensagem clara se a caixa
  id 3 não resolver credenciais (inativa/sem token).
- **Frontend:** desabilitar "Enviar" sem `numeroDestino` ou cartão sem telefone; toast de erro
  com a mensagem da edge; loading no botão durante o envio.
- **Telefones:** filtrar vazios antes de montar o CSV; exigir ao menos 1.

## Testes / verificação

- Migration aplicada: tabela existe, RLS ativa, índice criado.
- Edge: enviar `vcard` ad-hoc para o WhatsApp de teste do Hugo → cartão clicável chega com
  nome/telefones/organização corretos; salvar contato funciona em iOS e Android
  (**teste manual em device físico** — fora de CI).
- Edge: enviar por `vcardId` de um cartão salvo → mesmo resultado.
- Edge: entradas inválidas retornam 400 com mensagem.
- Frontend: CRUD persiste; preview reflete edições; teste dispara e dá feedback.
- Multi-telefone: cartão com 2+ telefones chega com todos.

## Fora de escopo (Fase 2 / futuro)

- Integração com `TemplateSelector` (disparo dentro de conversa do inbox).
- Disparo automático do vCard na régua de boas-vindas de matrícula.
- Importação dos dados oficiais reais das secretarias (a popular quando definidos).
