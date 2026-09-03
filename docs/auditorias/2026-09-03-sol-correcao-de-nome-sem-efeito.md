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
