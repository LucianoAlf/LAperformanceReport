> **STATUS (04/09/2026): JÁ APLICADO no repo `la-teacher`**, que está em
> `OneDrive/Desktop/Projects/LA Music/la-teacher` (não em `C:\la-teacher`, como o
> `entrypoint_path` do deploy antigo sugere). Working tree do la-teacher com as
> mudanças, testes passando (`modo-reenvio.test.mjs`, 17 casos; `fronteira.test.mjs`,
> 18 casos). **Falta o deploy** — que é mudança em produção e depende de OK explícito.
> Este documento fica como registro do que foi mexido e por quê.

# Patch: `notificar-anamnese` — modo reenvio + `agendada_para`

**Repo de destino:** `la-teacher` (`supabase/functions/notificar-anamnese/index.ts`).
⚠️ **Não aplicar deste repositório.** O `CLAUDE.md` do LAperformanceReport é explícito:
a edge vive no la-teacher e deploy daqui sobrescreveria a fronteira de privacidade.

**Base:** versão **55** em produção (conferida via `get_edge_function` em 04/09/2026).
Se a versão em produção for outra, reler antes de aplicar — git ≠ produção neste projeto.

**Por que:** reenviar 160 briefings que ficaram para trás entre junho e 31/08/2026.
Sem estas duas mudanças o reenvio (a) chega dizendo "NOVO ALUNO" sobre aluno que o
professor já atende há meses, e (b) dispara tudo de uma vez, porque a linha nasce com
`agendada_para = now()` e o worker roda a cada minuto pegando 10.

---

## 1. Aceitar `modo` e `agendada_para` no corpo

```diff
-    const { anamnese_id, dry_run = false } = await req.json();
+    const { anamnese_id, dry_run = false, modo = "normal", agendada_para = null } = await req.json();
     if (!anamnese_id) {
```

E, logo abaixo da validação de `anamnese_id`, validar a data — formato inválido tem
que falhar alto, não virar `Invalid Date` silencioso no insert:

```js
    if (agendada_para !== null && Number.isNaN(new Date(agendada_para).getTime())) {
      return new Response(JSON.stringify({ error: "agendada_para invalido" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" }
      });
    }
```

## 2. Trazer a data em que a anamnese foi preenchida

O SELECT atual **não busca `created_at`** — sem ele o cabeçalho de reenvio não tem
como dizer de quando é o formulário.

```diff
     const { data: anamnese, error: anaErr } = await supabase.from("anamneses").select(`
           id,
           aluno_id,
+          created_at,
           tipo_formulario,
           nome_aluno,
```

## 3. Cabeçalho diferente no reenvio

Acrescentar a função e trocar as três primeiras linhas de `buildEstrutura`:

```js
function cabecalhoDaMensagem(a, modo) {
  if (modo !== "reenvio") {
    return ["📋 *NOVO ALUNO — PERFIL PREENCHIDO*", SEPARADOR, ""];
  }
  // Dizer "NOVO ALUNO" para quem já dá aula ao aluno há meses faz o professor
  // concluir que o sistema errou — e ignorar justamente a mensagem que tem
  // informação de saúde. Medido: 132 das 182 anamneses de agosto/2026 são de
  // alunos que já existiam, um deles matriculado desde março de 2020.
  const quando = a.created_at
    ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })
        .format(new Date(a.created_at))
    : null;
  return [
    "📋 *PERFIL DE ALUNO — ENVIO ATRASADO*",
    SEPARADOR,
    "",
    quando
      ? `Esta anamnese foi preenchida em ${quando} e não chegou até você por uma falha no nosso envio.`
      : "Esta anamnese não chegou até você na época por uma falha no nosso envio.",
    "A família não preencheu nada de novo — estamos regularizando o que ficou para trás.",
    "",
  ];
}
```

```diff
-function buildEstrutura(a) {
+function buildEstrutura(a, modo = "normal") {
```

```diff
   const out = [
-    "📋 *NOVO ALUNO — PERFIL PREENCHIDO*",
-    SEPARADOR,
-    "",
+    ...cabecalhoDaMensagem(a, modo),
     `👤 *Aluno:* ${a.nome_aluno || "—"}`,
```

## 4. Briefing ciente de que o professor já conhece o aluno

No `gerarBriefing`, as três dicas são fixadas pelo prompt como "Primeiras aulas".
Para aluno com meses de aula elas nascem inúteis — é a parte que mais perde valor
no reenvio, e é justamente onde está o trabalho da IA.

```diff
-async function gerarBriefing(a, respostas, idadeAnos) {
+async function gerarBriefing(a, respostas, idadeAnos, modo = "normal") {
   if (!GEMINI_API_KEY) return { texto: "", tentativas: 0 };
   const isLamk = a.tipo_formulario === "LAMK";
   const dadosLimpos = sanitizeForAI(a, respostas, idadeAnos);
   const temApoio = sinaisDeSaude(a).length > 0;
+  const ehReenvio = modo === "reenvio";
+  const tituloDicas = ehReenvio ? "O que ajustar daqui pra frente" : "Primeiras aulas";
+  const contextoReenvio = ehReenvio
+    ? "\n⚠️ ATENÇÃO: este professor JÁ DÁ AULA para este aluno há semanas ou meses. " +
+      "A anamnese é antiga e só agora chegou até ele. NÃO escreva como se fosse o " +
+      "primeiro encontro: nada de \"na primeira aula, apresente-se\". As dicas devem " +
+      "ser sobre o que ele pode incorporar às aulas que já acontecem.\n"
+    : "";
```

No corpo do prompt, duas substituições:

```diff
 ${isLamk ? "IMPORTANTE: é uma criança (LA Music Kids)..." : "IMPORTANTE: é adolescente/adulto..."}
+${contextoReenvio}
```

```diff
-💡 *Primeiras aulas:*
+💡 *${tituloDicas}:*
 - (dica 1 acionável)
```

E na chamada:

```diff
-    const briefingRes = await gerarBriefing(anamnese, respostas || [], idadeAnos);
+    const briefingRes = await gerarBriefing(anamnese, respostas || [], idadeAnos, modo);
```

```diff
-    const estrutura = buildEstrutura(anamnese);
+    const estrutura = buildEstrutura(anamnese, modo);
```

## 5. Respeitar `agendada_para` no insert

Esta é a mudança que impede a rajada.

```diff
       .insert({
         anamnese_id: anamnese.id,
         professor_id: professor.id,
         professor_nome: professor.nome,
         telefone_whatsapp: professor.telefone_whatsapp,
         jid,
         mensagem: message,
         status: "sol_pendente",
-        agendada_para: new Date().toISOString(),
+        agendada_para: agendada_para ?? new Date().toISOString(),
         notificacao_log_id: logRow.id,
         metadata: {
           aluno_id: anamnese.aluno_id,
           aluno_nome: anamnese.nome_aluno,
           tipo_formulario: anamnese.tipo_formulario,
           unidade_nome: anamnese.unidade?.nome ?? null,
-          source: "notificar-anamnese"
+          source: "notificar-anamnese",
+          modo
         }
       })
```

`modo` no metadata deixa auditável, depois, quais linhas foram do reenvio.

---

## O que NÃO muda

- **O destinatário.** Continua sendo só o professor da matrícula onde a anamnese foi
  preenchida. Avisar todos os professores da pessoa é a Task 7 do LAPE-19, **descartada**
  pelo Luciano em 01/09 por causa do volume de agosto (182 anamneses no mês). Fazer isso
  aqui seria implementá-la por outra porta.
- **O bloco de saúde.** Vai como sempre foi, decisão do Alf em 05/08/2026.
- **A ausência do link da ficha.** Continua fora; o token dá acesso à ficha inteira sem
  login e mensagem de WhatsApp é encaminhável.
- **A trava anti-duplicata** (`existingQueue` com status `sol_pendente`/`sol_enviando`/
  `enviada`). Ela protege o reenvio de graça: se alguma linha viva já existir, a edge
  responde `duplicate: true` em vez de criar outra.

## Como validar antes de soltar

```bash
# 1. dry_run no modo reenvio — não grava nada, devolve message_preview
curl -s -X POST "$SUPABASE_URL/functions/v1/notificar-anamnese" \
  -H "Authorization: Bearer $SERVICE_ROLE" -H "Content-Type: application/json" \
  -d '{"anamnese_id":258,"dry_run":true,"modo":"reenvio"}' | jq -r .message_preview

# 2. conferir no texto: cabeçalho "ENVIO ATRASADO", a data de preenchimento,
#    e que o bloco de dicas NÃO fala em primeira aula

# 3. o modo normal tem que continuar idêntico ao de hoje
curl -s ... -d '{"anamnese_id":258,"dry_run":true}' | jq -r .message_preview
```

⚠️ Ao deployar pelo MCP, conferir `verify_jwt` contra o `config.toml` — o default do
`deploy_edge_function` é `true` e não lê o arquivo. Hoje esta edge está com
**`verify_jwt: false`**.
