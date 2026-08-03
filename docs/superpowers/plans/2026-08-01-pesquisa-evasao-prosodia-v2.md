# Pesquisa de Evasão — Prosódia V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** adaptar a mensagem da pesquisa de evasão ao operador e ao destinatário, com artigo e preposição corretos, cópias diferentes para responsável e aluno adulto, formatação aprovada no WhatsApp e bloqueio seguro quando a idade não puder ser determinada.

**Architecture:** a decisão entre público direto e responsável permanece no servidor, a partir da data de nascimento. Um módulo puro resolve o público; outro resolve apenas o tratamento gramatical de exibição, por dicionários explícitos e fallback neutro. A Edge renderiza e congela o texto final, aceitando placeholders V1 e V2 durante a transição. Uma migration aditiva cria e ativa os templates V2 e faz a fila bloquear data ausente. O React apenas exibe esse bloqueio.

**Tech Stack:** Deno/TypeScript, Supabase Edge Functions, PostgreSQL, React/Vite, Node test runner

---

## Decisões vinculantes

1. Menor de 18 anos usa responsável, `responsavel_telefone` e template `responsavel`.
2. Aluno com 18 anos ou mais usa o fluxo `direto`.
3. Data de nascimento ausente ou inválida bloqueia; não há fallback para adulto.
4. `o/a` e `do/da/de` são tratamento de renderização, não gênero canônico.
5. Nomes usam dicionários explícitos, normalização só para consulta e fallback neutro.
6. O navegador nunca escolhe artigo, preposição, público, destinatário, template ou texto.
7. V1 permanece imutável; V2 entra em linhas novas.
8. A Edge compatível entra antes de a migration ativar V2.
9. Preview antiga preserva o texto congelado.
10. Pergunta usa `> *...*`; sinceridade usa `_..._`; não existe separador.
11. Produção exige nova autorização e reconfirmação do project ref.
12. O gate do webhook inbound foi concluído em 03/08/2026 na versão 85 de
    produção, com `resposta_status`, sem fallback global e sem payload integral
    no debug log. Novos redeploys devem preservar esses contratos, mas esse
    gate não permanece aberto.
13. O fallback neutro é esperado para a maioria dos nomes e não é defeito. A
    ampliação do dicionário fica fora deste plano.

## Task 0 — Gate do retorno da pesquisa — concluído em produção

**Files:**

- Verify: `supabase/functions/webhook-whatsapp-inbox/index.ts`
- Verify: `tests/pesquisaEvasaoCanonica.test.mjs`

### Step 1: verificar o contrato no código local

- [x] Confirmar que o webhook grava
  `resposta_status = 'pronta_para_revisao'` junto ao legado.
- [x] Confirmar que não existe fallback global para qualquer pesquisa aberta.
- [x] Confirmar que o payload integral não é inserido em
  `webhook_debug_log`.
- [x] Confirmar que inbox administrativa, CRM, status, reação, edição e
  `buttonOrListid -> processar-resposta-pesquisa` permanecem roteados.

### Step 2: registrar a evidência de runtime

- [x] Confirmar `webhook-whatsapp-inbox` versão 85 ativa em produção em
  03/08/2026.
- [x] Confirmar que a resposta real da família de Miguel Santos Borges foi
  associada à pesquisa correta e gerou o alerta privado da Fase A para Jéssica.
- [x] Tratar este gate como concluído; qualquer redeploy futuro deve executar
  regressão dos mesmos contratos, sem reabrir o bloqueio histórico.

## Task 1 — Tratamento gramatical puro

**Files:**

- Create: `supabase/functions/enviar-pesquisa-evasao/tratamentoGramatical.test.ts`
- Create: `supabase/functions/enviar-pesquisa-evasao/tratamentoGramatical.ts`

### Step 1: teste RED

- [ ] Criar os casos:

```ts
import {
  alunoComPreposicao,
  assinaturaComArtigo,
  resolverTratamentoGramatical,
} from "./tratamentoGramatical.ts";
import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("artigo de operador", () => {
  assertEquals(assinaturaComArtigo("Luciano"), "o Luciano");
  assertEquals(assinaturaComArtigo("Fabi"), "a Fabi");
  assertEquals(assinaturaComArtigo("Jéssica"), "a Jéssica");
  assertEquals(assinaturaComArtigo("Jessyca"), "a Jessyca");
});

Deno.test("preposição de aluno", () => {
  assertEquals(alunoComPreposicao("Davi"), "do Davi");
  assertEquals(alunoComPreposicao("Maria"), "da Maria");
});

Deno.test("normaliza consulta e preserva grafia", () => {
  assertEquals(resolverTratamentoGramatical("  FABIÓLA  "), "feminino");
  assertEquals(assinaturaComArtigo("Fabíola"), "a Fabíola");
});

Deno.test("ambíguo e desconhecido ficam neutros", () => {
  assertEquals(resolverTratamentoGramatical("Jan"), "neutro");
  assertEquals(assinaturaComArtigo("Alex"), "Alex");
  assertEquals(alunoComPreposicao("Alex"), "de Alex");
  assertEquals(resolverTratamentoGramatical("NomeInventadoa"), "neutro");
});

Deno.test("nome vazio falha fechado", () => {
  assertThrows(() => assinaturaComArtigo(" "), Error, "NOME_AUSENTE");
});
```

- [ ] Rodar:

```powershell
deno test supabase/functions/enviar-pesquisa-evasao/tratamentoGramatical.test.ts
```

Expected: FAIL por módulo ausente.

### Step 2: implementação GREEN

- [ ] Criar o módulo com:

```ts
export type TratamentoGramatical = "feminino" | "masculino" | "neutro";

const NOMES_FEMININOS = new Set([
  "ana", "antonella", "clara", "clarice", "fabi", "fabiola", "gabriela",
  "geovana", "giovanna", "helena", "isabela", "isabella", "jessica",
  "jessyca", "julia", "katia", "lis", "livia", "luisa", "malu",
  "manuela", "maria", "maristela", "olivia", "sophia", "suzana",
  "tammy", "vitoria",
]);

const NOMES_MASCULINOS = new Set([
  "anthony", "bernardo", "carlos", "cauan", "daniel", "davi", "ezequiel",
  "guilherme", "heitor", "joachim", "joao", "lorenzo", "luciano",
  "marcelo", "matheus", "miguel", "noah", "paulo", "pedro", "samuel",
  "vinicius", "vitor",
]);

function primeiroNomeOriginal(nome: string): string {
  const valor = nome.trim().split(/\s+/u)[0] ?? "";
  if (!valor) throw new Error("NOME_AUSENTE");
  return valor;
}

function chave(nome: string): string {
  return primeiroNomeOriginal(nome)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR");
}

export function resolverTratamentoGramatical(
  nome: string,
): TratamentoGramatical {
  const valor = chave(nome);
  if (NOMES_FEMININOS.has(valor)) return "feminino";
  if (NOMES_MASCULINOS.has(valor)) return "masculino";
  return "neutro";
}

export function assinaturaComArtigo(nome: string): string {
  const valor = primeiroNomeOriginal(nome);
  const tratamento = resolverTratamentoGramatical(valor);
  if (tratamento === "feminino") return "a " + valor;
  if (tratamento === "masculino") return "o " + valor;
  return valor;
}

export function alunoComPreposicao(nome: string): string {
  const valor = primeiroNomeOriginal(nome);
  const tratamento = resolverTratamentoGramatical(valor);
  if (tratamento === "feminino") return "da " + valor;
  if (tratamento === "masculino") return "do " + valor;
  return "de " + valor;
}
```

- [ ] Rodar teste e typecheck:

```powershell
deno test supabase/functions/enviar-pesquisa-evasao/tratamentoGramatical.test.ts
deno check supabase/functions/enviar-pesquisa-evasao/tratamentoGramatical.ts
```

Expected: PASS.

### Step 3: commit

- [ ] `git diff --check`.
- [ ] Commit: `feat: adicionar tratamento gramatical da pesquisa de evasao`.

## Task 2 — Público determinado com segurança

**Files:**

- Create: `supabase/functions/enviar-pesquisa-evasao/publico.test.ts`
- Create: `supabase/functions/enviar-pesquisa-evasao/publico.ts`
- Modify: `supabase/functions/enviar-pesquisa-evasao/index.ts`

### Step 1: teste RED

- [ ] Fixar hoje em `2026-08-01T12:00:00Z` e testar:
  - `2010-08-02` resulta `responsavel`;
  - `2008-08-01` resulta `direto`;
  - `2008-08-02` resulta `responsavel`;
  - `null` lança `DATA_NASCIMENTO_AUSENTE`;
  - `2026-02-31` lança `DATA_NASCIMENTO_INVALIDA`.
- [ ] Rodar e observar FAIL por módulo ausente.

### Step 2: implementação GREEN

- [ ] Implementar parse estrito `YYYY-MM-DD`, validação de calendário e idade UTC:

```ts
export type PublicoPesquisaEvasao = "direto" | "responsavel";

export function resolverPublicoPesquisa(
  dataNascimento: string | null,
  agora = new Date(),
): PublicoPesquisaEvasao {
  if (!dataNascimento?.trim()) {
    throw new Error("DATA_NASCIMENTO_AUSENTE");
  }
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataNascimento);
  if (!partes) throw new Error("DATA_NASCIMENTO_INVALIDA");

  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  const nascimento = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    nascimento.getUTCFullYear() !== ano ||
    nascimento.getUTCMonth() !== mes - 1 ||
    nascimento.getUTCDate() !== dia
  ) throw new Error("DATA_NASCIMENTO_INVALIDA");

  let idade = agora.getUTCFullYear() - ano;
  const antesDoAniversario =
    agora.getUTCMonth() < mes - 1 ||
    (agora.getUTCMonth() === mes - 1 && agora.getUTCDate() < dia);
  if (antesDoAniversario) idade -= 1;
  return idade < 18 ? "responsavel" : "direto";
}
```

- [ ] Rodar o teste e `deno check`. Expected: PASS.

### Step 3: integrar na Edge

- [ ] Remover `alunoEhMenor` de `index.ts`.
- [ ] Importar `resolverPublicoPesquisa` e usar:

```ts
const publico = resolverPublicoPesquisa(aluno.data_nascimento);
const destinatario = publico === "responsavel"
  ? aluno.responsavel_nome
  : aluno.nome;
```

- [ ] Mapear data ausente/inválida para HTTP 422 claro.
- [ ] Preservar a trava existente de nome, telefone e snapshot do responsável.
- [ ] Nunca cair para o telefone do aluno quando o público é responsável.
- [ ] Rodar:

```powershell
deno test supabase/functions/enviar-pesquisa-evasao/*.test.ts
```

Expected: suíte verde.

### Step 4: commit

- [ ] Commit: `fix: bloquear publico indeterminado na pesquisa de evasao`.

## Task 3 — Renderização V2 retrocompatível

**Files:**

- Modify: `supabase/functions/enviar-pesquisa-evasao/contract.ts`
- Modify: `supabase/functions/enviar-pesquisa-evasao/contract.test.ts`
- Modify: `supabase/functions/enviar-pesquisa-evasao/index.ts`

### Step 1: testes RED com texto exato

- [ ] Adicionar teste de responsável que renderiza:

```text
Joice! Aqui é o Luciano, do Sucesso do Aluno da LA Music. 🎵

Queria agradecer pelo tempo que Davi passou com a gente. As portas estarão sempre abertas!

Posso lhe fazer uma única pergunta?

> *Se você pudesse mudar alguma coisa aqui na LA para que a experiência do Davi fosse melhor, o que você mudaria?*

_Pedimos a gentileza de responder com sinceridade. Sua opinião vai nos ajudar a oferecer uma experiência cada vez melhor aos nossos alunos._

Pode responder com texto ou áudio. Fique à vontade. 🙏
```

- [ ] Adicionar teste direto que renderiza:

```text
Maria! Aqui é a Fabi, do Sucesso do Aluno da LA Music. 🎵

Queria agradecer pelo tempo que você passou com a gente. As portas estarão sempre abertas para você!

Posso te fazer uma única pergunta?

> *Se você pudesse mudar alguma coisa aqui na LA para que a sua experiência fosse melhor, o que você mudaria?*

_Pedimos a gentileza de responder com sinceridade. Sua opinião vai nos ajudar a oferecer uma experiência cada vez melhor aos nossos alunos._

Pode responder com texto ou áudio. Fique à vontade. 🙏
```

- [ ] Exigir nos dois testes: sem `---`, sem pontilhado e sem `{{...}}` residual.
- [ ] Rodar `contract.test.ts`. Expected: FAIL por placeholders novos.

### Step 2: placeholders V1 + V2

- [ ] Alterar a allowlist para:

```ts
const PLACEHOLDERS_PERMITIDOS = new Set([
  "aluno_primeiro_nome",
  "responsavel_primeiro_nome",
  "assinatura_nome",
  "assinatura_com_artigo",
  "aluno_com_preposicao",
]);
```

- [ ] Manter os três antigos para previews V1.
- [ ] Manter falha fechada para placeholder desconhecido, vazio ou residual.

### Step 3: valores server-side

- [ ] Importar `assinaturaComArtigo` e `alunoComPreposicao` em `index.ts`.
- [ ] Calcular o primeiro nome do aluno pela movimentação e o primeiro nome do
  destinatário já resolvido. Não exigir `responsavel_nome` no fluxo direto.
- [ ] Fornecer valores V1/V2; o valor extra de
  `responsavel_primeiro_nome` no template direto é inofensivo porque o
  renderizador substitui somente placeholders realmente presentes:

```ts
valores: {
  aluno_primeiro_nome: primeiroNome(movimentacao.aluno_nome),
  responsavel_primeiro_nome: primeiroNome(destinatario),
  assinatura_nome: assinaturaNome,
  assinatura_com_artigo: assinaturaComArtigo(assinaturaNome),
  aluno_com_preposicao: alunoComPreposicao(
    primeiroNome(movimentacao.aluno_nome),
  ),
},
```

- [ ] Confirmar que request não aceita nenhum desses valores.
- [ ] Confirmar que texto, hash e snapshot guardam a mensagem final.

### Step 4: verificar e commitar

- [ ] Rodar:

```powershell
deno test supabase/functions/enviar-pesquisa-evasao/*.test.ts
deno check supabase/functions/enviar-pesquisa-evasao/index.ts
git diff --check
```

- [ ] Commit: `feat: renderizar prosodia v2 da pesquisa de evasao`.

## Task 4 — Templates V2 e bloqueio na fila

**Files:**

- Create: `tests/pesquisaEvasaoProsodiaV2.test.mjs`
- Create: `supabase/migrations/20260801143000_pesquisa_evasao_prosodia_v2.sql`
- Reference only: `supabase/migrations/20260730170000_pesquisa_evasao_fundacao_segura.sql`
- Reference only: `supabase/migrations/20260801023000_pesquisa_evasao_backfill_telefone_responsavel_julho_2026.sql`

### Step 1: verificador RED

- [ ] Criar teste Node que lê opcionalmente a nova migration e exige:
  - duas linhas `evasao_aberta` versão 2, públicos `direto` e `responsavel`;
  - nenhum `DELETE` de template e nenhuma edição do corpo V1;
  - `> *Se você pudesse...*`;
  - `_Pedimos a gentileza..._`;
  - `Pode responder com texto ou áudio. Fique à vontade. 🙏`;
  - ausência de separador;
  - `data_nascimento_ausente` e `indeterminado` na RPC.
- [ ] Rodar. Expected: FAIL por migration ausente.

### Step 2: inserir V2 idempotente

- [ ] Criar a migration com este conteúdo de template:

```sql
insert into public.pesquisa_evasao_templates (
  chave, versao, publico, corpo, ativo
)
values
(
  'evasao_aberta', 2, 'direto',
  $direto$
{{aluno_primeiro_nome}}! Aqui é {{assinatura_com_artigo}}, do Sucesso do Aluno da LA Music. 🎵

Queria agradecer pelo tempo que você passou com a gente. As portas estarão sempre abertas para você!

Posso te fazer uma única pergunta?

> *Se você pudesse mudar alguma coisa aqui na LA para que a sua experiência fosse melhor, o que você mudaria?*

_Pedimos a gentileza de responder com sinceridade. Sua opinião vai nos ajudar a oferecer uma experiência cada vez melhor aos nossos alunos._

Pode responder com texto ou áudio. Fique à vontade. 🙏
$direto$,
  false
),
(
  'evasao_aberta', 2, 'responsavel',
  $responsavel$
{{responsavel_primeiro_nome}}! Aqui é {{assinatura_com_artigo}}, do Sucesso do Aluno da LA Music. 🎵

Queria agradecer pelo tempo que {{aluno_primeiro_nome}} passou com a gente. As portas estarão sempre abertas!

Posso lhe fazer uma única pergunta?

> *Se você pudesse mudar alguma coisa aqui na LA para que a experiência {{aluno_com_preposicao}} fosse melhor, o que você mudaria?*

_Pedimos a gentileza de responder com sinceridade. Sua opinião vai nos ajudar a oferecer uma experiência cada vez melhor aos nossos alunos._

Pode responder com texto ou áudio. Fique à vontade. 🙏
$responsavel$,
  false
)
on conflict (chave, versao, publico)
do update set corpo = excluded.corpo;
```

- [ ] Na mesma transação, desativar ativos de ambos os públicos e ativar somente V2.
- [ ] Adicionar bloco `DO` que falha se V1 sumiu, V2 não tem duas linhas ou não há exatamente um ativo por público.

### Step 3: recriar a RPC canônica

- [ ] Copiar integralmente `listar_evadidos_para_pesquisa_v2` da migration `20260801023000`.
- [ ] Incluir `a.data_nascimento` como campo interno do CTE.
- [ ] Classificar:

```sql
case
  when publico_interno.aluno_id is not null then publico_interno.tipo
  when a.data_nascimento is null then 'indeterminado'
  when extract(year from age(current_date, a.data_nascimento))::integer < 18
    then 'responsavel'
  else 'aluno'
end::text as publico_tipo,
```

- [ ] Em `bloqueio_codigo`, manter `sem_aluno` primeiro e inserir depois:

```sql
when data_nascimento is null then 'data_nascimento_ausente'
```

- [ ] Não mudar as regras de responsável, motivo, número compartilhado, teste ou status.

### Step 4: ensaio DDL

- [ ] Rodar teste estático.
- [ ] Criar projeto Supabase descartável com schema-only atual, roles e extensões estruturais; sem dados/segredos reais.
- [ ] Aplicar a migration duas vezes.
- [ ] Conferir após cada aplicação:

```sql
select chave, versao, publico, ativo,
       encode(digest(corpo, 'sha256'), 'hex') as corpo_sha256
from public.pesquisa_evasao_templates
where chave = 'evasao_aberta'
order by publico, versao;
```

Expected: V1 preservada/inativa, V2 ativa, um ativo por público e hashes estáveis.

- [ ] Com fixture sintética, provar `elegivel_envio=false` e `data_nascimento_ausente`.
- [ ] Destruir o projeto e registrar project ref/evidências.

### Step 5: commit

- [ ] Commit: `feat: versionar templates v2 da pesquisa de evasao`.

## Task 5 — Bloqueio visível no frontend

**Files:**

- Modify: `src/components/App/SucessoCliente/pesquisaEvasao.types.ts`
- Modify: `src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx`
- Create: `tests/pesquisaEvasaoDataNascimentoBloqueio.test.mjs`

### Step 1: teste RED

- [ ] Criar teste estático que exige:
  - `'data_nascimento_ausente'` na união de bloqueio;
  - `'indeterminado'` na união de público;
  - rótulo `Data de nascimento não cadastrada`;
  - o código presente no rótulo, na trava do modo teste e na orientação de cadastro.
- [ ] Rodar. Expected: FAIL.

### Step 2: implementar

- [ ] Atualizar as duas uniões.
- [ ] Em `getBloqueioLabel`:

```ts
case 'data_nascimento_ausente':
  return 'Data de nascimento não cadastrada';
```

- [ ] Incluir o código na lista que impede `Testar`.
- [ ] Incluir na lista que mostra `Corrigir no cadastro do aluno.`.
- [ ] Não calcular idade/público no React.

### Step 3: verificar e commitar

- [ ] Rodar:

```powershell
node --test tests/pesquisaEvasaoDataNascimentoBloqueio.test.mjs
npm run build
git diff --check
```

- [ ] Commit: `feat: sinalizar idade ausente na fila de evasao`.

## Task 6 — Spec e runbook

**Files:**

- Modify: `docs/superpowers/specs/2026-08-01-pesquisa-evasao-prosodia-v2-design.md`
- Modify: `docs/runbooks/pesquisa-evasao-subprojeto-a-rollout.md`
- Modify: `docs/superpowers/plans/2026-08-01-pesquisa-evasao-prosodia-v2.md`

### Step 1: fechar a spec após testes

- [ ] Status: `desenho aprovado; implementação local concluída; rollout pendente`.
- [ ] Registrar módulos, migration e fallback neutro.
- [ ] Não chamar o tratamento de gênero persistido.
- [ ] Registrar que o fallback neutro será frequente, é aceitável e não deve
  motivar expansão do dicionário neste plano.
- [ ] Registrar o pré-flight informado por Alf: 57 saídas desde 01/07/2026,
  45 menores, 12 adultos e zero sem `data_nascimento`.

### Step 2: ordem de rollout no runbook

- [ ] Documentar:
  1. publicar e revalidar primeiro o webhook inbound corrigido;
  2. reconfirmar project ref/schema;
  3. validar DDL descartável;
  4. publicar Edge V1/V2 com `verify_jwt=true`;
  5. provar preview com V1 ativo;
  6. aplicar migration e ativar V2;
  7. conferir template/RPC;
  8. publicar frontend;
  9. smoke responsável e direto;
  10. monitorar.
- [ ] Sem webhook seguro e validado, parar antes da Prosódia V2.
- [ ] Sem Edge compatível, parar antes da migration.
- [ ] Smoke padrão cria/cancela preview; não envia WhatsApp.

### Step 3: postflight e rollback

- [ ] Conferir:

```sql
select publico, versao, count(*) as ativos
from public.pesquisa_evasao_templates
where chave = 'evasao_aberta' and ativo = true
group by publico, versao
order by publico;
```

Expected: `direto / 2 / 1` e `responsavel / 2 / 1`.

- [ ] Smoke responsável: responsável, telefone mascarado, artigo, `do/da/de`, formatação e sem separador.
- [ ] Smoke direto: aluno, `a sua experiência` e sem responsável.
- [ ] Data ausente: bloqueada e sem `Testar`.
- [ ] Rollback: desativar V2, reativar V1; nunca apagar V2.
- [ ] Registrar que a Edge é retrocompatível e que a RPC anterior deve ser capturada antes da migration.

### Step 4: commit

- [ ] Commit: `docs: registrar rollout da prosodia v2`.

## Task 7 — Verificação final

### Step 1: suíte focada e integral

- [ ] Rodar:

```powershell
deno test supabase/functions/enviar-pesquisa-evasao/tratamentoGramatical.test.ts
deno test supabase/functions/enviar-pesquisa-evasao/publico.test.ts
deno test supabase/functions/enviar-pesquisa-evasao/contract.test.ts
deno test supabase/functions/enviar-pesquisa-evasao/*.test.ts
deno check supabase/functions/enviar-pesquisa-evasao/index.ts
node --test tests/pesquisaEvasao*.test.mjs
npm run build
git diff --check
git status --short
```

Expected: tudo verde; só arquivos intencionais.

### Step 2: revisão de segurança/escopo

- [ ] Confirmar que request não ganhou artigo, preposição, público, telefone, template ou mensagem.
- [ ] Confirmar que a Prosódia não alterou o webhook e que a correção local do
  inbound continua presente; o runtime produtivo permanece gate separado.
- [ ] Confirmar que migrations aplicadas não foram editadas.
- [ ] Revisar:

```powershell
git log --oneline --decorate origin/main..HEAD
git diff --stat origin/main...HEAD
git diff origin/main...HEAD -- supabase/functions/enviar-pesquisa-evasao supabase/migrations/20260801143000_pesquisa_evasao_prosodia_v2.sql src/components/App/SucessoCliente tests docs
```

- [ ] Solicitar revisão humana.
- [ ] Não fazer push, merge ou rollout sem autorização específica.

## Task 8 — Rollout assistido, somente com nova autorização

### Gate 0: retorno seguro — concluído em 03/08/2026

- [x] `webhook-whatsapp-inbox` versão 85 ativo em produção.
- [x] `resposta_status` preenchido e associação exata comprovada com a resposta
  real da família de Miguel Santos Borges.
- [x] Fallback global removido e payload integral ausente do debug log.
- [x] Gate encerrado; manter esses itens somente como regressão obrigatória em
  qualquer redeploy futuro do webhook.

### Gate 1: pré-flight

- [ ] Reconfirmar project ref, migrations concorrentes, RPC e templates para rollback.
- [ ] Reportar e parar antes da escrita.

### Gate 2: Edge compatível

- [ ] Publicar com `verify_jwt=true`.
- [ ] Rejeitar anônimo/JWT inválido.
- [ ] Criar/cancelar preview V1.
- [ ] Reportar e parar.

### Gate 3: migration V2

- [ ] Aplicar `20260801143000_pesquisa_evasao_prosodia_v2.sql`.
- [ ] Confirmar V1 preservada, V2 ativa e RPC atualizada.
- [ ] Reportar e parar.

### Gate 4: frontend e smoke

- [ ] Publicar frontend depois da migration.
- [ ] Validar preview responsável/direta sem enviar.
- [ ] Confirmar bloqueio por data ausente.
- [ ] Enviar somente com autorização separada, modo teste e número interno.
- [ ] Monitorar 30 minutos.

### Critérios de parada

- Edge não aceita V2;
- quantidade ativa diferente de um por público;
- V1 ausente/alterada;
- responsável usa aluno/telefone do aluno;
- direto usa texto do responsável;
- placeholder residual ou separador;
- anônimo/JWT inválido aceito;
- regressão em outro fluxo.
