# Pesquisa de Evasão — Prévia Editável Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** permitir que Jéssica e Fabi ajustem somente o corpo da pesquisa de evasão na última prévia, enviando exatamente o texto aprovado e preservando auditoria, identidade server-side e idempotência.

**Architecture:** uma migration aditiva preserva a RPC atual e acrescenta colunas de auditoria mais uma RPC service-only que congela texto final e claim na mesma transação. A Edge aceita tanto o contrato antigo (`preview_id`) quanto o novo (`preview_id` + `mensagem_final`), calcula o hash no servidor e envia apenas o snapshot devolvido pelo claim. O frontend entra por último com editor explícito, contador e visualização segura da formatação do WhatsApp.

**Tech Stack:** PostgreSQL/Supabase, Deno/TypeScript, React 19, Vite, Node test runner, PostgreSQL 17 fixture

---

## Decisões vinculantes

1. O navegador pode alterar somente `mensagem_final`.
2. Destinatário, telefone, caixa, template, assinatura, modo de teste e operador continuam resolvidos no servidor.
3. O limite é de 2.000 caracteres Unicode; `trim()` vazio é inválido, mas o texto válido é preservado byte a byte, sem trim ou normalização antes do envio.
4. O hash final é calculado pela Edge com os snapshots persistidos; o cliente nunca fornece hash.
5. Clique duplo com o mesmo texto retorna o resultado existente e não despacha novamente.
6. Confirmação posterior com texto diferente retorna conflito e não altera nem reenvia a mensagem congelada.
7. O texto original renderizado, o texto final, quem editou e quando ficam auditáveis na prévia e na pesquisa enviada.
8. Marcadores removidos pelo usuário não são restaurados.
9. A visualização interpreta os marcadores apenas para apresentação e nunca usa `dangerouslySetInnerHTML`.
10. A RPC antiga permanece disponível durante toda a janela de compatibilidade.
11. A ordem de rollout é obrigatória: migration aditiva, Edge compatível, frontend editável.
12. O webhook inbound, o motor multipartes e o cron da Lia ficam fora do diff e não são redeployados.
13. Os templates V1 permanecem inativos e preservados; os V2 ativos possuem 542 e 579 caracteres, com folga superior a três vezes dentro do limite.
14. Produção exige autorização específica do Alf e project ref `ouqwbbermlzqqvtqwlul` reconfirmado no momento do rollout.

## Task 1 — Validar o texto final e manter o contrato antigo

**Files:**

- Modify: `supabase/functions/enviar-pesquisa-evasao/contract.ts`
- Modify: `supabase/functions/enviar-pesquisa-evasao/contract.test.ts`

### Step 1: escrever os testes RED do request novo

- [ ] Alterar o teste de confirmação para provar os dois contratos aceitos:

```ts
Deno.test("confirmacao aceita contrato antigo e texto final opcional", () => {
  assertEquals(
    validarRequest({ acao: "confirmar", preview_id: previewIdCanonico }),
    { acao: "confirmar", preview_id: previewIdCanonico },
  );

  const mensagem = "> *Pergunta aprovada*\n\n_Pedido sincero_ 🙏";
  assertEquals(
    validarRequest({
      acao: "confirmar",
      preview_id: previewIdCanonico,
      mensagem_final: mensagem,
    }),
    {
      acao: "confirmar",
      preview_id: previewIdCanonico,
      mensagem_final: mensagem,
    },
  );
});

Deno.test("confirmacao rejeita texto vazio ou acima de 2000 caracteres", () => {
  for (const mensagem_final of ["", " \n\t ", "a".repeat(2001)]) {
    assertThrows(
      () => validarRequest({
        acao: "confirmar",
        preview_id: previewIdCanonico,
        mensagem_final,
      }),
      Error,
    );
  }
});

Deno.test("confirmacao conta caracteres Unicode e preserva o texto exato", () => {
  const mensagem_final = "🎵".repeat(2000);
  assertEquals(
    validarRequest({
      acao: "confirmar",
      preview_id: previewIdCanonico,
      mensagem_final,
    }),
    { acao: "confirmar", preview_id: previewIdCanonico, mensagem_final },
  );
});
```

- [ ] Manter na allowlist somente `acao`, `preview_id` e `mensagem_final`; acrescentar casos negativos para `telefone`, `caixa_id`, `operador`, `assinatura`, `template_id`, `modo_teste` e `payload_hash`.

### Step 2: executar o teste e observar a falha

Run:

```bash
deno test --allow-env supabase/functions/enviar-pesquisa-evasao/contract.test.ts
```

Expected: FAIL porque `mensagem_final` ainda é campo desconhecido.

### Step 3: implementar a validação pura

- [ ] Alterar a variante `confirmar` para:

```ts
| {
    acao: "confirmar";
    preview_id: string;
    mensagem_final?: string;
  };
```

- [ ] Adicionar e exportar a regra única usada pela Edge:

```ts
export const LIMITE_MENSAGEM_PESQUISA = 2_000;

export function validarMensagemFinal(valor: unknown): string {
  if (typeof valor !== "string") {
    throw new Error("mensagem_final deve ser texto");
  }
  if (valor.trim().length === 0) {
    throw new Error("mensagem_final nao pode ser vazia");
  }
  if (Array.from(valor).length > LIMITE_MENSAGEM_PESQUISA) {
    throw new Error("mensagem_final excede 2000 caracteres");
  }
  return valor;
}
```

- [ ] No ramo `confirmar`, aceitar a ausência do campo para a tela antiga e validar sem alterar o valor quando presente.

### Step 4: executar os testes GREEN

Run:

```bash
deno test --allow-env supabase/functions/enviar-pesquisa-evasao/contract.test.ts
```

Expected: PASS, incluindo 2.000 emojis aceitos e 2.001 rejeitados.

### Step 5: commit local

```bash
git add supabase/functions/enviar-pesquisa-evasao/contract.ts supabase/functions/enviar-pesquisa-evasao/contract.test.ts
git commit -m "feat: validar texto final da pesquisa de evasao"
```

## Task 2 — Criar auditoria aditiva e claim atômico

**Files:**

- Create: `supabase/migrations/20260803220000_pesquisa_evasao_preview_editavel.sql`
- Create: `tests/fixtures/pesquisa_evasao_preview_editavel_pg17.sql`
- Create: `tests/pesquisaEvasaoPreviewEditavelSchema.test.mjs`
- Create: `tests/helpers/runPesquisaEvasaoPreviewEditavelPg17Fixture.mjs`

### Step 1: escrever o teste estrutural RED

- [ ] Fazer o teste exigir, pelo nome exato:
  - as seis colunas novas de `pesquisa_evasao_previews`;
  - as sete colunas snapshot de `pesquisa_evasao`;
  - `claim_pesquisa_evasao_preview_editavel(uuid, uuid, text, text)`;
  - `FOR UPDATE`, `auth.role() = 'service_role'`, `char_length`, `btrim` e conflito por texto divergente;
  - revogação de `public`, `anon` e `authenticated`, com `EXECUTE` somente para `service_role`;
  - ausência de `DROP TABLE`, `TRUNCATE`, update de respostas, rodadas ou transcrições.

Use estas listas como contrato do teste:

```js
const previewColumns = [
  'mensagem_template_original',
  'mensagem_editada',
  'editado_por_usuario_id',
  'editado_por_auth_user_id',
  'editado_em',
  'payload_hash_original',
];

const pesquisaColumns = [
  'mensagem_template_original_snapshot',
  'mensagem_editada',
  'mensagem_editada_por_usuario_id',
  'mensagem_editada_por_auth_user_id',
  'mensagem_editada_em',
  'payload_hash_original_snapshot',
  'payload_hash_snapshot',
];
```

`mensagem_renderizada` e `payload_hash` já existem na prévia e continuam sendo os campos finais; por isso não são recriados.

### Step 2: executar o teste estrutural e observar a falha

Run:

```bash
node --test tests/pesquisaEvasaoPreviewEditavelSchema.test.mjs
```

Expected: FAIL porque a migration ainda não existe.

### Step 3: implementar as colunas e o backfill idempotente

- [ ] A migration deve adicionar:

```sql
alter table public.pesquisa_evasao_previews
  add column if not exists mensagem_template_original text,
  add column if not exists mensagem_editada boolean not null default false,
  add column if not exists editado_por_usuario_id integer references public.usuarios(id),
  add column if not exists editado_por_auth_user_id uuid,
  add column if not exists editado_em timestamptz,
  add column if not exists payload_hash_original text;

update public.pesquisa_evasao_previews
set mensagem_template_original = mensagem_renderizada,
    payload_hash_original = payload_hash
where mensagem_template_original is null
   or payload_hash_original is null;

alter table public.pesquisa_evasao_previews
  alter column mensagem_template_original set not null,
  alter column payload_hash_original set not null;

alter table public.pesquisa_evasao
  add column if not exists mensagem_template_original_snapshot text,
  add column if not exists mensagem_editada boolean not null default false,
  add column if not exists mensagem_editada_por_usuario_id integer references public.usuarios(id),
  add column if not exists mensagem_editada_por_auth_user_id uuid,
  add column if not exists mensagem_editada_em timestamptz,
  add column if not exists payload_hash_original_snapshot text,
  add column if not exists payload_hash_snapshot text;
```

- [ ] Preencher os snapshots somente quando houver `preview_id` correspondente. Linhas legadas sem prévia permanecem `mensagem_editada=false` e com os novos snapshots nulos; não inventar auditoria retrospectiva.
- [ ] Criar constraints com nomes determinísticos para:
  - original e final não vazios e com `char_length <= 2000` na prévia;
  - `mensagem_editada=false` exigir original = final, hashes iguais e campos de editor nulos;
  - `mensagem_editada=true` exigir texto diferente, editor, auth UID e horário preenchidos.
- [ ] Acrescentar constraints com `NOT VALID`, validá-las após o backfill e só então mantê-las ativas, evitando lock desnecessariamente longo.

### Step 4: implementar a RPC nova sem remover a antiga

- [ ] Criar a assinatura:

```sql
create or replace function public.claim_pesquisa_evasao_preview_editavel(
  p_preview_id uuid,
  p_auth_user_id uuid,
  p_mensagem_final text,
  p_payload_hash_final text
)
returns table (
  pesquisa_id uuid,
  preview_id uuid,
  evasao_id integer,
  aluno_id integer,
  unidade_id uuid,
  modo_teste boolean,
  destinatario_tipo text,
  aluno_nome text,
  aluno_curso text,
  aluno_professor text,
  tempo_permanencia_meses integer,
  data_evasao date,
  motivo_cadastrado text,
  telefone_destino text,
  mensagem_renderizada text,
  caixa_id integer,
  idempotency_key uuid,
  envio_status text,
  provider_message_id text,
  executado_por_usuario_id integer,
  executado_por_auth_user_id uuid,
  assinatura_id uuid,
  assinatura_nome text,
  template_id uuid,
  template_versao integer,
  deve_despachar boolean
)
language plpgsql
security definer
set search_path = public, pg_temp;
```

- [ ] O corpo deve seguir esta ordem exata:
  1. rejeitar role diferente de `service_role`;
  2. selecionar a prévia `FOR UPDATE`;
  3. validar ownership antes de expiração;
  4. validar `btrim(p_mensagem_final)`, `char_length <= 2000` e hash não vazio;
  5. se consumida e texto igual ao congelado, delegar ao claim antigo e retornar `deve_despachar=false`;
  6. se consumida e texto diferente, lançar `PESQUISA_EVASAO_PREVIEW_TEXTO_DIVERGENTE` com SQLSTATE `40001`;
  7. se não consumida, atualizar texto final, hash final e auditoria da edição;
  8. chamar o claim antigo uma única vez dentro de CTE `MATERIALIZED`;
  9. copiar os snapshots de auditoria para a pesquisa apenas quando o claim retornar a pesquisa correspondente;
  10. devolver a linha materializada sem chamar o claim pela segunda vez.

O núcleo da atualização deve ser:

```sql
update public.pesquisa_evasao_previews pp
set mensagem_renderizada = p_mensagem_final,
    payload_hash = p_payload_hash_final,
    mensagem_editada =
      p_mensagem_final is distinct from pp.mensagem_template_original,
    editado_por_usuario_id = case
      when p_mensagem_final is distinct from pp.mensagem_template_original
        then pp.usuario_id
      else null
    end,
    editado_por_auth_user_id = case
      when p_mensagem_final is distinct from pp.mensagem_template_original
        then pp.auth_user_id
      else null
    end,
    editado_em = case
      when p_mensagem_final is distinct from pp.mensagem_template_original
        then clock_timestamp()
      else null
    end
where pp.id = p_preview_id
  and pp.consumido_em is null;
```

E a delegação atômica deve usar uma única materialização:

```sql
return query
with claim as materialized (
  select *
  from public.claim_pesquisa_evasao_preview(
    p_preview_id,
    p_auth_user_id
  )
), auditoria as (
  update public.pesquisa_evasao pe
  set mensagem_template_original_snapshot = pp.mensagem_template_original,
      mensagem_renderizada = pp.mensagem_renderizada,
      mensagem_editada = pp.mensagem_editada,
      mensagem_editada_por_usuario_id = pp.editado_por_usuario_id,
      mensagem_editada_por_auth_user_id = pp.editado_por_auth_user_id,
      mensagem_editada_em = pp.editado_em,
      payload_hash_original_snapshot = pp.payload_hash_original,
      payload_hash_snapshot = pp.payload_hash
  from claim c
  join public.pesquisa_evasao_previews pp on pp.id = c.preview_id
  where pe.id = c.pesquisa_id
  returning pe.id
)
select c.*
from claim c
left join auditoria a on a.id = c.pesquisa_id;
```

- [ ] Garantir que o join da CTE não multiplique linhas; o fixture deve exigir exatamente uma linha de retorno.
- [ ] Revogar execução de `public`, `anon` e `authenticated`; conceder apenas a `service_role`.

### Step 5: provar o comportamento em PostgreSQL real

- [ ] O fixture transacional deve executar e fazer `ROLLBACK` ao final.
- [ ] Provar os casos:
  1. backfill idempotente executado duas vezes;
  2. texto não editado mantém editor nulo e hashes iguais;
  3. texto editado persiste original e final distintos, editor e horário;
  4. segundo claim com texto igual retorna `deve_despachar=false`;
  5. segundo claim com texto diferente lança conflito;
  6. exceção posterior ao update reverte texto, hash e auditoria;
  7. `authenticated` e `anon` não executam a RPC;
  8. RPC antiga continua existindo e executável pelo `service_role`.

Run:

```bash
node --test tests/pesquisaEvasaoPreviewEditavelSchema.test.mjs
node tests/helpers/runPesquisaEvasaoPreviewEditavelPg17Fixture.mjs
```

Expected: PASS; fixture termina com `ROLLBACK` e nenhuma persistência fora do banco descartável.

### Step 6: commit local

```bash
git add supabase/migrations/20260803220000_pesquisa_evasao_preview_editavel.sql tests/fixtures/pesquisa_evasao_preview_editavel_pg17.sql tests/pesquisaEvasaoPreviewEditavelSchema.test.mjs tests/helpers/runPesquisaEvasaoPreviewEditavelPg17Fixture.mjs
git commit -m "feat: adicionar claim atomico da previa editavel"
```

## Task 3 — Tornar a Edge compatível com os dois frontends

**Files:**

- Modify: `supabase/functions/enviar-pesquisa-evasao/index.ts`
- Modify: `supabase/functions/enviar-pesquisa-evasao/contract.ts`
- Modify: `supabase/functions/enviar-pesquisa-evasao/contract.test.ts`
- Modify: `tests/pesquisaEvasaoEdgeSegura.test.mjs`

### Step 1: escrever os testes RED do fluxo

- [ ] Exigir que a Edge:
  - carregue `mensagem_template_original`, `mensagem_renderizada`, `payload_hash_original` e os snapshots imutáveis da prévia;
  - use `request.mensagem_final ?? preview.mensagem_renderizada`;
  - recalcule `payload_hash_final` no servidor com `hashPreview`;
  - chame `claim_pesquisa_evasao_preview_editavel`;
  - nunca aceite `telefone`, `caixa_id`, `operador`, `assinatura`, `template_id`, `modo_teste` ou hash no request;
  - envie ao provider apenas `claim.mensagem_renderizada`;
  - não registre texto final, telefone ou payload em logs.

- [ ] Adicionar teste unitário que prova que alterar apenas uma quebra de linha altera o hash final.
- [ ] Adicionar teste que prova que omitir `mensagem_final` usa exatamente o texto persistido, mantendo a tela antiga operacional.

### Step 2: executar os testes e observar a falha

Run:

```bash
deno test --allow-env supabase/functions/enviar-pesquisa-evasao/contract.test.ts
node --test tests/pesquisaEvasaoEdgeSegura.test.mjs
```

Expected: FAIL porque a Edge ainda chama `claim_pesquisa_evasao_preview`.

### Step 3: implementar o fluxo compatível

- [ ] Expandir `PreviewPersistida` somente com campos vindos do banco.
- [ ] Resolver o texto final assim:

```ts
const mensagemFinal = validarMensagemFinal(
  request.mensagem_final ?? preview.mensagem_renderizada,
);

const payloadHashFinal = await hashPreview({
  evasaoId: preview.evasao_id,
  unidadeId: preview.unidade_id,
  usuarioId: preview.usuario_id,
  authUserId: preview.auth_user_id,
  assinaturaId: preview.assinatura_id,
  templateId: preview.template_id,
  templateVersao: preview.template_versao,
  caixaId: preview.caixa_id,
  modoTeste: preview.modo_teste,
  destinatarioTipo: preview.destinatario_tipo,
  telefoneDestino: preview.telefone_destino,
  mensagemRenderizada: mensagemFinal,
});
```

- [ ] Chamar:

```ts
const { data, error } = await serviceClient.rpc(
  "claim_pesquisa_evasao_preview_editavel",
  {
    p_preview_id: request.preview_id,
    p_auth_user_id: authUserId,
    p_mensagem_final: mensagemFinal,
    p_payload_hash_final: payloadHashFinal,
  },
);
```

- [ ] Não confiar no texto lido antes do claim para o dispatch. O provider deve receber exclusivamente `claim.mensagem_renderizada`, devolvido depois do lock.
- [ ] Mapear `PESQUISA_EVASAO_PREVIEW_TEXTO_DIVERGENTE` para HTTP 409, sem retry.
- [ ] Manter `verify_jwt=true` em `supabase/config.toml` e não tocar em `webhook-whatsapp-inbox`.

### Step 4: verificar regressões e o drift local/remoto

- [ ] Comparar a Edge local com a versão ativa imediatamente antes de publicar. O baseline de 03/08/2026 registrou checks locais de opt-out ausentes da v43 então ativa.
- [ ] Se esse drift ainda existir, separar em commit ou obter aceite explícito; não embarcar a diferença silenciosamente nesta entrega.
- [ ] Provar que o body antigo continua válido e que a ação de pré-visualizar não mudou.

Run:

```bash
deno test --allow-env supabase/functions/enviar-pesquisa-evasao/*.test.ts
node --test tests/pesquisaEvasaoEdgeSegura.test.mjs tests/pesquisaEvasaoPreviewFrontend.test.mjs
```

Expected: PASS; nenhum teste do webhook ou multipartes precisa ser alterado.

### Step 5: commit local

```bash
git add supabase/functions/enviar-pesquisa-evasao/index.ts supabase/functions/enviar-pesquisa-evasao/contract.ts supabase/functions/enviar-pesquisa-evasao/contract.test.ts tests/pesquisaEvasaoEdgeSegura.test.mjs
git commit -m "feat: confirmar previa editavel com compatibilidade"
```

## Task 4 — Interpretar a formatação do WhatsApp sem alterar o texto

**Files:**

- Create: `src/lib/whatsappPreview.ts`
- Create: `src/lib/whatsappPreview.test.ts`
- Modify: `src/lib/whatsappFormat.tsx`

### Step 1: escrever os testes RED do segmentador puro

```ts
import { assertEquals } from "jsr:@std/assert@1";
import { segmentarPreviewWhatsApp } from "./whatsappPreview.ts";

Deno.test("separa citacao e texto comum preservando linhas", () => {
  assertEquals(
    segmentarPreviewWhatsApp(
      "Posso perguntar?\n\n> *Pergunta importante*\n\n_Pedido sincero_",
    ),
    [
      { tipo: "texto", conteudo: "Posso perguntar?" },
      { tipo: "vazio", conteudo: "" },
      { tipo: "citacao", conteudo: "*Pergunta importante*" },
      { tipo: "vazio", conteudo: "" },
      { tipo: "texto", conteudo: "_Pedido sincero_" },
    ],
  );
});

Deno.test("nao interpreta maior que fora do inicio da linha", () => {
  assertEquals(
    segmentarPreviewWhatsApp("2 > 1"),
    [{ tipo: "texto", conteudo: "2 > 1" }],
  );
});
```

### Step 2: executar o teste e observar a falha

Run:

```bash
deno test src/lib/whatsappPreview.test.ts
```

Expected: FAIL porque o módulo ainda não existe.

### Step 3: implementar o segmentador sem HTML

```ts
export type LinhaPreviewWhatsApp = {
  tipo: "texto" | "citacao" | "vazio";
  conteudo: string;
};

export function segmentarPreviewWhatsApp(texto: string): LinhaPreviewWhatsApp[] {
  return texto.split("\n").map((linha) => {
    if (linha.length === 0) return { tipo: "vazio", conteudo: "" };
    if (linha.startsWith("> ")) {
      return { tipo: "citacao", conteudo: linha.slice(2) };
    }
    return { tipo: "texto", conteudo: linha };
  });
}
```

- [ ] Usar `formatarWhatsApp` para `*`, `_`, `~` e crases dentro de cada linha.
- [ ] Renderizar citação com elemento semântico `<blockquote>` e borda lateral.
- [ ] Não adicionar `dangerouslySetInnerHTML`, parser Markdown genérico ou mutação do editor.

### Step 4: executar GREEN

Run:

```bash
deno test src/lib/whatsappPreview.test.ts
```

Expected: PASS.

### Step 5: commit local

```bash
git add src/lib/whatsappPreview.ts src/lib/whatsappPreview.test.ts src/lib/whatsappFormat.tsx
git commit -m "feat: renderizar formatacao whatsapp na previa"
```

## Task 5 — Criar o editor explícito com contador

**Files:**

- Create: `src/components/App/SucessoCliente/EditorMensagemPesquisaEvasao.tsx`
- Modify: `src/components/App/SucessoCliente/ModalPreviewPesquisaEvasao.tsx`
- Modify: `tests/pesquisaEvasaoPreviewFrontend.test.mjs`

### Step 1: escrever os testes RED da interface

- [ ] Alterar o teste estrutural para exigir:
  - `Textarea` controlado;
  - texto `Você pode ajustar o texto antes de enviar.`;
  - contador `N / 2.000 caracteres` calculado com `Array.from`;
  - estado `Texto editado` por comparação exata;
  - alertas de vazio e excesso;
  - bloco `Como aparecerá no WhatsApp`;
  - confirmação desabilitada em vazio, excesso, expiração ou andamento;
  - editor desabilitado durante confirmação;
  - ausência de `dangerouslySetInnerHTML`.

- [ ] Exigir que o estado seja reiniciado quando `preview.preview_id` mudar, sem reaproveitar texto de outra família.

### Step 2: executar RED

Run:

```bash
node --test tests/pesquisaEvasaoPreviewFrontend.test.mjs
```

Expected: FAIL porque o modal continua somente leitura.

### Step 3: implementar o componente controlado

- [ ] A interface do componente deve ser:

```ts
interface EditorMensagemPesquisaEvasaoProps {
  mensagemOriginal: string;
  mensagem: string;
  desabilitado: boolean;
  onMensagemChange: (mensagem: string) => void;
}
```

- [ ] Calcular:

```ts
const totalCaracteres = Array.from(mensagem).length;
const vazio = mensagem.trim().length === 0;
const excedente = Math.max(0, totalCaracteres - 2_000);
const editado = mensagem !== mensagemOriginal;
```

- [ ] Mostrar o contador antes da confirmação e comunicar o erro com `role="alert"` e `aria-describedby` ligado ao editor.
- [ ] Manter os marcadores visíveis no editor cru e mostrar a interpretação no bloco abaixo.
- [ ] Não aplicar `maxLength=2000`: permitir que o usuário veja e reduza o excedente, bloqueando apenas a confirmação.

### Step 4: integrar ao modal

- [ ] Alterar a prop para `onConfirmar: (mensagemFinal: string) => void`.
- [ ] Criar estado local:

```ts
const [mensagemFinal, setMensagemFinal] = useState(preview?.mensagem ?? "");

useEffect(() => {
  if (!aberto || !preview) return;
  setMensagemFinal(preview.mensagem);
}, [aberto, preview?.preview_id, preview?.mensagem]);
```

- [ ] O botão chama `onConfirmar(mensagemFinal)` apenas se válido.
- [ ] O texto do destinatário, telefone, caixa e assinatura continua fora do editor.

### Step 5: executar GREEN e build parcial

Run:

```bash
node --test tests/pesquisaEvasaoPreviewFrontend.test.mjs
npm run build
```

Expected: PASS; Vite build termina sem erro de TypeScript.

### Step 6: commit local

```bash
git add src/components/App/SucessoCliente/EditorMensagemPesquisaEvasao.tsx src/components/App/SucessoCliente/ModalPreviewPesquisaEvasao.tsx tests/pesquisaEvasaoPreviewFrontend.test.mjs
git commit -m "feat: editar mensagem na previa da evasao"
```

## Task 6 — Enviar o texto aprovado pelo frontend

**Files:**

- Modify: `src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx`
- Modify: `src/components/App/SucessoCliente/ModalPreviewPesquisaEvasao.tsx`
- Modify: `tests/pesquisaEvasaoPreviewFrontend.test.mjs`

### Step 1: atualizar o teste de allowlist do request

- [ ] A confirmação do frontend deve possuir exatamente:

```js
['acao', 'preview_id', 'mensagem_final']
```

- [ ] Manter a pré-visualização com exatamente `acao`, `evasao_id`, `modo_teste` e `telefone_teste`.
- [ ] Rejeitar estruturalmente `operador`, `telefone`, `caixa_id`, `assinatura`, `template_id`, `modo_teste` e hash no objeto confirmar.

### Step 2: executar RED

Run:

```bash
node --test tests/pesquisaEvasaoPreviewFrontend.test.mjs
```

Expected: FAIL porque `confirmarEnvio` ainda não recebe o texto.

### Step 3: implementar a passagem explícita

```ts
const confirmarEnvio = async (mensagemFinal: string) => {
  if (!preview || confirmandoRef.current) return;

  const { data, error } = await supabase.functions.invoke(
    "enviar-pesquisa-evasao",
    {
      body: {
        acao: "confirmar",
        preview_id: preview.preview_id,
        mensagem_final: mensagemFinal,
      },
    },
  );
};
```

- [ ] Preservar integralmente o tratamento atual de expiração, `enviado`, `incerto`, `bloqueado`, falha e `captura_resposta_preparada`.
- [ ] Não criar retry nem segunda chamada de recuperação.
- [ ] Manter `confirmandoRef` como proteção local; a proteção definitiva continua na RPC.

### Step 4: executar GREEN e regressão do frontend

Run:

```bash
node --test tests/pesquisaEvasaoPreviewFrontend.test.mjs
npm run build
```

Expected: PASS.

### Step 5: commit local

```bash
git add src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx src/components/App/SucessoCliente/ModalPreviewPesquisaEvasao.tsx tests/pesquisaEvasaoPreviewFrontend.test.mjs
git commit -m "feat: enviar texto final aprovado na previa"
```

## Task 7 — Fechar regressões, documentação e pacote de rollout

**Files:**

- Modify: `docs/MAPA-SISTEMA.md`
- Create: `docs/runbooks/pesquisa-evasao-preview-editavel-rollout.md`
- Modify: `docs/superpowers/specs/2026-08-03-pesquisa-evasao-preview-editavel-design.md`
- Verify: `supabase/config.toml`
- Verify: `supabase/functions/webhook-whatsapp-inbox/**`

### Step 1: executar a suíte focada

Run:

```bash
deno test --allow-env supabase/functions/enviar-pesquisa-evasao/*.test.ts
deno test src/lib/whatsappPreview.test.ts
node --test tests/pesquisaEvasaoPreviewFrontend.test.mjs tests/pesquisaEvasaoEdgeSegura.test.mjs tests/pesquisaEvasaoPreviewEditavelSchema.test.mjs
node tests/helpers/runPesquisaEvasaoPreviewEditavelPg17Fixture.mjs
npm run build
```

Expected: todos os testes passam; a fixture termina em rollback; build Vite sem erro.

### Step 2: executar a suíte ampla disponível

Run:

```bash
node --test tests/*.test.mjs
```

Expected: PASS. Se houver falha preexistente, registrar arquivo, caso e evidência de que não foi introduzida por este diff; não mascarar nem corrigir frente alheia.

### Step 3: revisar escopo e dados sensíveis

Run:

```bash
git diff --check
git diff --stat origin/main...HEAD
git diff origin/main...HEAD -- supabase/functions/webhook-whatsapp-inbox supabase/functions/processar-conversa-evasao supabase/functions/processar-alertas-lia
rg -n "console\.(log|error)|telefone_destino|mensagem_final|service_role" supabase/functions/enviar-pesquisa-evasao
```

Expected:

- diff dos três fluxos fora de escopo vazio;
- nenhum log novo contém texto, telefone, token ou payload;
- nenhum segredo no diff;
- nenhum marcador de implementação pendente ou instrução incompleta.

### Step 4: documentar operação e recuperação

- [ ] No mapa do sistema, registrar `pesquisa_evasao_previews` como prévia/auditoria operacional e `pesquisa_evasao` como cabeçalho canônico da pesquisa; nenhum dos novos snapshots vira fonte de identidade do aluno.
- [ ] No runbook, registrar:
  - preflight de projeto, templates e Edge ativa;
  - ordem sem janela de quebra;
  - consultas de auditoria original/final;
  - smoke somente no número interno;
  - conflito de texto divergente sem reenvio;
  - rollback por camada;
  - proibição de redeploy do webhook e do cron da Lia.
- [ ] Marcar como resolvido o item visual dos marcadores crus.
- [ ] Manter o assistente de IA apenas como melhoria futura.

### Step 5: commit local

```bash
git add docs/MAPA-SISTEMA.md docs/runbooks/pesquisa-evasao-preview-editavel-rollout.md docs/superpowers/specs/2026-08-03-pesquisa-evasao-preview-editavel-design.md
git commit -m "docs: preparar rollout da previa editavel"
```

## Task 8 — Rollout assistido, somente com autorização do Alf

Esta task descreve o rollout; não executá-la durante a implementação local.

### Gate 0: pré-flight somente leitura

- [ ] Reconfirmar project ref `ouqwbbermlzqqvtqwlul`.
- [ ] Consultar migrations concorrentes aplicadas desde a última validação.
- [ ] Confirmar V1 inativos e preservados; V2 ativos únicos por público, com 542 e 579 caracteres.
- [ ] Confirmar `enviar-pesquisa-evasao` com `verify_jwt=true`.
- [ ] Comparar a Edge local com a versão ativa e resolver explicitamente qualquer drift de opt-out.
- [ ] Confirmar famílias reais aguardando resposta e cron da Lia saudável.
- [ ] Reportar e parar antes de qualquer escrita.

### Gate 1: migration aditiva

- [ ] Aplicar somente `20260803220000_pesquisa_evasao_preview_editavel.sql`.
- [ ] Confirmar colunas, constraints, ACL e as duas RPCs coexistindo.
- [ ] Confirmar que previews válidas e pesquisas existentes não foram reescritas além do backfill auditável previsto.
- [ ] Abrir a tela antiga e provar que gerar e confirmar uma prévia em modo teste continua possível com o contrato antigo.
- [ ] Reportar e parar.

### Gate 2: Edge compatível antes do frontend

- [ ] Publicar somente `enviar-pesquisa-evasao`, mantendo `verify_jwt=true`.
- [ ] Provar anônimo/JWT inválido rejeitados.
- [ ] Invocar confirmação antiga sem `mensagem_final` em modo teste e confirmar texto persistido inalterado.
- [ ] Invocar confirmação nova com `mensagem_final` em modo teste e confirmar auditoria.
- [ ] Confirmar que a tela antiga publicada continua funcionando normalmente.
- [ ] Não tocar no webhook, no multipartes ou no cron da Lia.
- [ ] Reportar e parar.

### Gate 3: frontend editável

- [ ] Publicar o frontend somente depois do Gate 2 verde.
- [ ] Abrir a prévia de responsável e a direta sem enviar; conferir editor, ajuda, contador e visualização formatada.
- [ ] Provar bloqueio local de vazio e 2.001 caracteres.
- [ ] Provar que remover marcador muda apenas a apresentação e o texto final.
- [ ] Confirmar que destinatário, telefone, caixa e assinatura não são editáveis.
- [ ] Reportar e parar antes de qualquer envio.

### Gate 4: smoke controlado e concorrência

- [ ] Com autorização explícita, usar somente o número interno do Alf.
- [ ] Enviar uma mensagem sem edição e comparar editor, auditoria e WhatsApp.
- [ ] Enviar uma mensagem editada e comparar texto original, final, editor, horário e hashes.
- [ ] Confirmar a mesma prévia duas vezes com o mesmo texto e provar uma entrega.
- [ ] Repetir com texto divergente e provar HTTP 409 sem segunda entrega.
- [ ] Confirmar que nenhuma família real, resposta multipartes ou alerta da Lia foi tocado.

### Gate 5: encerramento

- [ ] Atualizar o runbook com IDs técnicos mascarados, horários, versões e resultados.
- [ ] Monitorar erros da Edge e do frontend durante a janela acordada.
- [ ] Não apagar colunas/RPCs aditivas no rollback; reverter Edge e frontend por camada.
- [ ] Registrar que edição assistida por IA continua fora do escopo.

## Definition of Done

- [ ] A tela antiga funciona entre a publicação da Edge e o deploy do frontend.
- [ ] Somente o corpo pode ser editado.
- [ ] Texto válido de até 2.000 caracteres chega exatamente ao provider.
- [ ] Original, final, editor, horário e hashes ficam auditáveis.
- [ ] Clique duplo igual não reenvia; texto divergente gera conflito.
- [ ] Visualização mostra citação, negrito e itálico sem marcadores crus.
- [ ] Frontend bloqueia vazio/excesso antes da chamada e servidor repete a regra.
- [ ] Templates V1 e V2 não são alterados por esta entrega.
- [ ] Webhook inbound, multipartes e Lia permanecem fora do diff.
- [ ] Suíte focada, PostgreSQL real e build passam.
- [ ] Nenhuma migration ou deploy ocorre sem autorização específica do Alf.
