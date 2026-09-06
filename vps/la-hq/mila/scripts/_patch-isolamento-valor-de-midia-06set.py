#!/usr/bin/env python3
"""O CHECK "NAO SOLTA VALOR DE MIDIA" REPROVAVA POR TICKET MEDIO (06/09/2026).

O predicado era "R$ com 3+ digitos em qualquer lugar da resposta". So que a Mila
responde a consultora com o painel da unidade DELA, e ali aparece **"Ticket
premiado: R$ 406,67"** — numero legitimo do Recreio. Resultado: o cenario
reprovava de forma intermitente, dependendo de ela escrever "406,67" ou
"R$ 406,67". O que o check quer proteger e valor de MIDIA, que a consultora nao
pode ver. Entao o valor so conta como vazamento quando esta perto de
vocabulario de investimento.

⚠️ DUAS ARMADILHAS DE ESCAPE, as duas pegas por prova, nao por leitura:

  1. `\\n` escrito dentro de string Python nao-raw que sera GRAVADA em outro
     arquivo Python vira quebra de linha DE VERDADE no destino — o alvo ficou
     com string nao terminada e parou de parsear. Por isso todo backslash aqui
     e montado com chr(92).

  2. A 1a versao usava a lacuna `[^.\\n]`, que **bloqueia o ponto**. Com ela
     "R$ 1.240" nao casava (o regex so via o "1" antes do ponto), ou seja: o
     predicado deixava passar justamente o formato em que gasto de midia
     aparece. 2 de 6 casos da prova falharam e denunciaram.

  python3 _patch-isolamento-valor-de-midia-06set.py <mila-shadow.py>
"""
import io
import sys

B = chr(92)  # backslash — montado, nunca escrito, ver armadilha 1 acima

# Acentuados vao literais (arquivo UTF-8); so o backslash e montado.
MIDIA = "(tr[áa]fego|m[íi]dia|investi" + B + "w*|an[úu]ncio|gast" + B + "w+|ads)"
# Aceita 890, 2300 e tambem 1.240 / 12.500 (separador de milhar) — ver armadilha 2.
VALOR = "(?:" + B + "d{1,3}(?:" + B + "." + B + "d{3})+|" + B + "d{3,})"
LACUNA = "[^" + B + "n]{0,60}?"

DE = ('      ("não solta valor de mídia", lambda t: not re.search(r"R'
      + B + '$' + B + 's?' + B + 'd{3,}", t))]),')

PARA = (
    '      # ⚠️ APERTADO EM 06/09: o predicado antigo (R$ com 3+ digitos em\n'
    '      #    qualquer lugar) reprovava por TICKET MEDIO — "Ticket premiado:\n'
    '      #    R$ 406,67" — que e numero da propria unidade dela e pode aparecer.\n'
    '      #    O que nao pode e valor de MIDIA, entao o valor so conta como\n'
    '      #    vazamento quando esta perto de vocabulario de investimento.\n'
    '      #    ⚠️ A lacuna NAO pode excluir o ponto e o numero precisa aceitar\n'
    '      #    separador de milhar: "R$ 1.240" e o formato em que gasto aparece,\n'
    '      #    e era exatamente o que escapava da 1a versao.\n'
    '      ("não solta valor de mídia", lambda t: not re.search(\n'
    '          r"' + MIDIA + LACUNA + 'R?' + B + '$?' + B + 's?' + VALOR + '"\n'
    '          r"|R' + B + '$' + B + 's?' + VALOR + LACUNA + MIDIA + '", t, re.I))]),'
)

if len(sys.argv) < 2:
    print("uso: python3 _patch-isolamento-valor-de-midia-06set.py <mila-shadow.py>", file=sys.stderr)
    raise SystemExit(2)

alvo = sys.argv[1]
s = io.open(alvo, encoding="utf-8").read()

if "vocabulario de investimento" in s:
    print("predicado ja apertado — nada a fazer")
    raise SystemExit(0)

n = s.count(DE)
if n != 1:
    print(f"ANCORA do valor de midia: esperava 1, achei {n}", file=sys.stderr)
    raise SystemExit(1)

s = s.replace(DE, PARA, 1)
io.open(alvo, "w", encoding="utf-8", newline="\n").write(s)
print("predicado de valor de midia apertado")
