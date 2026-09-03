# Sol anunciava correção que não acontecia (Lucas Nunes — Mayra/CG, 03/09/2026)

## O que aconteceu

```
19:21  Jhon   PG pix parcela 09/2026 aluno Lucas Nunes de Souza - LA CG R$417,00
19:22  Sol    card com ALUNO "Lucas Nunes de Salles"
              ⚠️ Não tenho certeza de qual aluno é — confere o nome.
19:22  Mayra  Sol, o aluno é Lucas Nunes de Souza
19:22  Sol    "Atualizei a pendencia com o aluno informado:" -> card IDÊNTICO (Salles)
19:23  Mayra  Sol, o nome do aluno é Lucas Nunes de Souza
19:23  Sol    "Atualizei a pendencia com o aluno informado:" -> card IDÊNTICO (Salles)
```

A Mayra corrigiu duas vezes, recebeu o mesmo card as duas, e **o pagamento
nunca foi lançado** (conferido: em 03/09 só existe um lançamento de R$ 417 no
caixa, do Heitor Balthazar às 15:41).

## Causa-raiz

No caminho de correção tardia de nome, o cabeçalho é **hardcoded** em
`'Atualizei a pendencia com o aluno informado:'` — independentemente de algo ter
mudado. Quando o nome ditado resolve para o cadastro que **já estava** no card,
a Sol reenvia um card idêntico afirmando ter atualizado.

`_mesmaPessoa('Lucas Nunes de Salles', 'Lucas Nunes de Souza')` devolve **true**
(primeiro nome igual + `nunes` em comum), então `_trocouAluno` é `false` e nem
divergência era registrada. Os dois logs de 22:22:50 e 22:23:45 UTC gravaram
`preview_aluno_corrigido` com `aluno: "Lucas Nunes de Salles"` — ou seja, **o
placar lia os dois como sucesso**.

⚠️ **O casamento estava CERTO.** Só existe um `Lucas Nunes` ativo em Campo
Grande: `Lucas Nunes de Salles`, Teclado, R$ 417, parcela 09/2026 vencendo
05/09 — bate campo a campo com o comprovante. Quem diverge é a grafia usada
pelos dois humanos (Jhon escreveu "Souza" no texto original; a Mayra confirmou
"Souza"). **O defeito era a frase, não o casamento** — e é por isso que a
correção não podia ser mexer no `_mesmaPessoa`.

Mesma classe do `"Lancei ✅"` que anunciava gravação inexistente (01/09): **a
frase tem que descrever o que aconteceu**.

## Correção

`_conflitoDeGrafiaAluno(ditado, cadastro)` — função pura ao lado de
`_mesmaPessoa`: verdadeira quando existe token significativo (>2 letras, fora
conectivos) no nome ditado que **não existe** no cadastro. Quando ela dispara, o
cabeçalho passa a ser:

> É o mesmo cadastro que eu já tinha aqui — no sistema ele está como **Lucas
> Nunes de Salles**.
> Se for ele, responde **pode**. Se for outra pessoa, me manda o nome completo.
> *(se o errado for o cadastro, dá pra corrigir no Emusys)*

⚠️ **Nenhuma gramática nova de diálogo** (compromisso vigente da frente V4):
muda só a confirmação, não o parser.

⚠️ **Dispara em CONFLITO, nunca em abreviação.** `aluno: Lucas` contra `Lucas
Nunes de Salles` segue com o texto de sempre — senão a Sol viraria burocrata em
toda correção com nome curto.

⚠️ O log passou a gravar `correcao_nome_mesma_pessoa` e a marcar
`mesma_pessoa: true` no `preview_aluno_corrigido`, para os dois desfechos
pararem de se parecer no placar.

Patch idempotente e ancorado:
`vps/la-hq/sol/scripts/_patch-correcao-nome-mesma-pessoa-03set.py`
Teste: `tests/sol-runtime/conflito-grafia-nome.test.cjs` (7 casos, roda a função
real extraída do fonte — não confere texto). **7/7 em 03/09.**

## O roteador V4 (parte obrigatória do combinado de 31/08)

O shadow **acertou as duas vezes**, com confiança alta e o nome certo extraído:

| hora (UTC) | intenção | confiança | aluno extraído | legado |
|---|---|---|---|---|
| 22:23:03 | `corrigir_aluno` | **0,99** | **Lucas Nunes de Souza** ✅ | `preview_aluno_corrigido` |
| 22:24:03 | `corrigir_aluno` | **0,99** | **Lucas Nunes de Souza** ✅ | `preview_aluno_corrigido` |

**O roteador não era o problema aqui** — ele entendeu a intenção e leu o nome
corretamente. O defeito estava a jusante, no que o runtime faz com o nome já
extraído. É um ponto a favor do flip, mas também um lembrete: **trocar o
roteador não conserta bug de execução**.

⚠️ Contraste no mesmo dia (14:50-14:51, Recreio): o legado gravou
`aluno: "São dois curso teclado e"` — um pedaço de conversa virou nome de aluno.
O shadow, ali, deu `corrigir_aluno` com confiança **0,45** e `aluno: null`, ou
seja, **duvidou onde o legado se enganou**. Caso separado, ainda não corrigido.

## Operação

Bridge reiniciada às 22:32 UTC (o runtime faz `require` no start — editar o
arquivo não muda nada sem reiniciar). Conferido: `✅ WhatsApp connected!` e
**zero** `[caixa-financeiro] init falhou` depois do restart.

⚠️ A pendência do Lucas seguia aberta (`public_preview_sent`, R$ 417 pix) com
janela de **30 min desde o último toque** (22:23:45 UTC) — ou seja, expirava por
volta de 22:53 UTC / 19:53 BRT. Depois disso, reenviar o comprovante.


---

# 2º episódio, mesma noite: "Sol, a parcela é 09/2026" → "Não entendi essa"

```
20:36  Mayra  reenvia o comprovante (o 1º card tinha expirado às 19:53)
20:37  Sol    card com FATURA "Parcela 10/2026 ... vence 05/10"   ← competência errada
20:38  Mayra  "Sol, a parcela é 09/2026"
20:38  Sol    "Não entendi essa 🤔 ... escreve aluno: Nome Completo para eu corrigir"
```

## Por que a competência saiu errada — NÃO foi regressão do patch anterior

Às 19:22 a fatura 09/2026 estava `aberta` e a Sol escolheu ela, **corretamente**.
A ADM baixou o pagamento no Emusys e o espelho viu às **20:33:26** — 4 minutos
antes do card. Nesse instante a 09 já constava `paga` mas **sem `valor_pago`
propagado**, então não casava em nenhum ramo da cascata de
`sol_caixa_parcela_canonica` (nem `valor_exato`, nem `atrasada`, nem
`ja_consta_paga`), e a única com valor 417 era a 10/2026 → ramo `valor_exato` →
competência do mês seguinte.

Minutos depois a mesma RPC já devolve a 09/2026 com `motivo_escolha:
valor_exato`. **É uma janela de propagação**, não defeito de código — e o
conserto de verdade é o humano poder DIZER a competência.

## Causa-raiz do "Não entendi" — duas, somadas

**(a) Assimetria no bloco de correção.** Ele colhe o VALOR declarado no texto
humano (`extrairValor(txt)`, adicionado em 31/08 pelo caso do OCR de R$ 387) e
**não colhe a COMPETÊNCIA** — ela só era herdada da pendência
(`let competencia = alvoP.competencia`). O humano podia corrigir o valor pelo
texto e não a competência.

**(b) O bloco só roda `if (nomeTardio && alvoP)`** — exige um NOME. *"a parcela
é 09/2026"* não tem nome, então nem entrava.

**E o fallback LLM também não alcançava:** `classificarCorrecaoPendencia` tinha
as intenções `corrigir_aluno|categoria|valor|forma|sem_aluno|descartar|aprovar|nada`
— **não existia `corrigir_competencia`, nem campo `competencia` na saída**. O
classificador literalmente não tinha como expressar o que a Mayra disse.

## Correção — sem gramática nova de diálogo

1. **`_competenciaDitada`**: o bloco de correção colhe a competência do texto com
   `extrairCompetenciaTexto`, do mesmo jeito que já colhe o valor. **Declaração
   humana vence a fatura casada**: se a canônica trouxer outra competência, o
   vínculo de fatura é **solto** (lançamento sem vínculo, mesma política da
   contestação) em vez de gravar a fatura errada — sujar a carteira do aluno é
   pior que não vincular. Log `competencia_ditada_vence_fatura`.
2. **O classificador ganha `corrigir_competencia` + campo `competencia`**
   (normalizado por `extrairCompetenciaTexto`, porque o modelo devolve
   "09/2026", "9/26" ou "setembro").
3. **A intenção vira frase que a gramática já entende:**
   `parcela MM/AAAA aluno: <nome do card>`.

⚠️ **A competência vem ANTES do rótulo.** Com `aluno: Nome parcela MM/AAAA` o
captador de nome devolve **"Lucas Nunes de Salles parcela"** — a classe de
caracteres dele não aceita dígito, então ele para no "09" e deixa a palavra
colada. **O teste pegou isso antes de ir para produção.**

Patch: `vps/la-hq/sol/scripts/_patch-corrigir-competencia-03set.py`
Teste: `tests/sol-runtime/competencia-correcao.test.cjs` — **9/9**.
⚠️ Ele usa `require` do módulo, não `eval` de função solta: extrair por regex
arrasta dependência invisível (`_MES_NOME`, `BODY_SINTETICO`, `_UNIDADE_TAG`) e
o teste quebra por motivo que não é o defeito.

## Shadow V4 — terceiro acerto seguido

| hora (UTC) | intenção | confiança | campos | legado |
|---|---|---|---|---|
| 23:38:32 | **`corrigir_competencia`** | **0,99** | `competencia: "09/2026"`, `entidade: "parcela"` | **`nada`** |

O roteador **já tinha a intenção que o legado não tinha**. Três casos em duas
noites (`corrigir_aluno` ×2 com nome certo, `corrigir_competencia` ×1) em que o
shadow acerta e o runtime erra. ⚠️ E de novo a mesma lição: **o roteador estava
certo e o dano veio da execução** — trocar o roteador não conserta o que está a
jusante dele.

## Pendente, medido e não corrigido

🔴 **A janela de propagação continua aberta.** Fatura recém-baixada no Emusys,
com `status = paga` e `valor_pago` ainda nulo, **cai fora de todos os ramos** da
cascata — e a Sol avança para o mês seguinte **sem sinalizar incerteza**. O ramo
`ja_consta_paga` existe mas exige `valor_pago` casando com o comprovante, que é
exatamente o campo que ainda não chegou. Não corrigido: exigiria mexer em
`sol_caixa_parcela_canonica`, que tem consumidores vivos, e o caminho humano
agora existe.
