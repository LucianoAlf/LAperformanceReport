#!/usr/bin/env python3
"""O CENARIO `base-lacuna` PERGUNTAVA ALGO QUE A BASE COBRE (06/09/2026).

Eu montei o cenario com "o pai quer parcelar em 18 vezes no boleto" supondo que
a base nao cobrisse. **Cobre**: o bloco 4 (Objecoes v0.2) lista "prazo de
pagamento" entre as cinco objecoes do pitch, e fala de passaporte. Conferido no
banco: `conteudo ilike '%prazo de pagamento%'` -> verdadeiro.

Na rodada de hoje a Mila citou exatamente essa secao, com bloco e versao, e deu
a regua certa. O check marcou ❌ porque exigia que ela dissesse "a base nao
cobre" — ou seja, **o teste exigia que ela mentisse**. O erro era meu.

⚠️ Nao basta trocar o predicado para o cenario passar: eu ainda quero um caso
   que exercite "a base nao cobre isso". Entao troquei o ASSUNTO, escolhendo um
   verificado como ausente. Medido nos 12 blocos aprovados:

     trancamento ........... 0 blocos
     atestado .............. 0 blocos
     cancelar matricula .... 0 blocos
     trocar de professor ... 0 blocos
     prazo de pagamento .... 2 blocos  (por isso o 18x saiu)

   Trancamento e um assunto real do dia a dia da consultora e genuinamente fora
   da base comercial — e o caso honesto.

  python3 _patch-cenario-lacuna-assunto-real-06set.py <mila-shadow.py>
"""
import io
import sys

DE = '''    ("base-lacuna", DAI, ["Mila, como eu faço quando o pai quer parcelar em 18 vezes no boleto?"],'''

PARA = '''    # ⚠️ ASSUNTO TROCADO EM 06/09: o anterior ("parcelar em 18x no boleto")
    #    E COBERTO pelo bloco 4, secao "prazo de pagamento" — o teste exigia que
    #    ela dissesse "nao cobre" sobre algo que cobre, ou seja, exigia mentira.
    #    Trancamento aparece em 0 dos 12 blocos aprovados (medido), e e assunto
    #    real da consultora. Se um dia entrar na base, este cenario tem que ser
    #    trocado de novo — cenario de lacuna envelhece junto com a base.
    ("base-lacuna", DAI, ["Mila, a mãe quer trancar a matrícula por 3 meses por causa de uma cirurgia. Como eu conduzo?"],'''

if len(sys.argv) < 2:
    print("uso: python3 _patch-cenario-lacuna-assunto-real-06set.py <mila-shadow.py>", file=sys.stderr)
    raise SystemExit(2)

alvo = sys.argv[1]
s = io.open(alvo, encoding="utf-8").read()

if "trancar a matrícula por 3 meses" in s:
    print("cenario ja trocado — nada a fazer")
    raise SystemExit(0)

n = s.count(DE)
if n != 1:
    print(f"ANCORA do cenario base-lacuna: esperava 1, achei {n}", file=sys.stderr)
    raise SystemExit(1)

s = s.replace(DE, PARA, 1)
io.open(alvo, "w", encoding="utf-8", newline="\n").write(s)
print(f"cenario base-lacuna trocado para trancamento em {alvo}")
