#!/usr/bin/env python3
"""O PREDICADO DO CENARIO `base-lacuna` ENUMERAVA FRASE LITERAL (06/09/2026).

Terceira vez que este mesmo predicado reprova comportamento CERTO. O historico:

  1ª — ela: "nao tem um bloco especifico sobre 18x no boleto... minha orientacao
       pratica". ❌ porque o predicado exigia outra frase. Eu ampliei a lista.
  2ª — o ASSUNTO estava errado (18x E coberto pelo bloco 4). Troquei para
       trancamento, que aparece em 0 dos 12 blocos.
  3ª — ela: **"Base nao traz um procedimento especifico pra trancamento
       temporario, so a orientacao geral de objecao/retomada"** — que e
       exatamente o que eu queria. ❌ porque "traz" nao estava na lista de
       verbos (`tem|ha|cobre|encontrei|achei`).

🔴 A LICAO: predicado de teste que enumera FRASE reprova parafrase legitima, e o
   custo e alto — leva a "consertar" um agente que ja estava certo. Duas vezes
   hoje eu quase mexi no comportamento dela por causa do meu proprio regex.

   O predicado tem que checar FORMA, nao vocabulario: uma negacao perto da
   palavra "base"/"material", em qualquer ordem. Isso pega "a base nao traz",
   "nao ha nada na base", "sem material sobre isso" — e continua reprovando uma
   resposta que simplesmente entrega a regua como se fosse da casa.

  python3 _patch-predicado-lacuna-por-forma-06set.py <mila-shadow.py>
"""
import io
import sys

DE = '''      ("admite que a base nao cobre", lambda t: re.search(r"n[ãa]o (tem|h[áa]|cobre|encontrei|achei)|ainda n[ãa]o|minha orienta[çc][ãa]o|opini[ãa]o|lacuna|confirmar a regra", t, re.I))]),'''

PARA = '''      # ⚠️ POR FORMA, NAO POR VOCABULARIO. Enumerar verbo ("nao tem/ha/cobre")
      #    reprovou 3x uma resposta certa — a ultima por ela ter escrito "a base
      #    nao TRAZ". O que importa e existir uma negacao perto de
      #    "base"/"material", em qualquer ordem, ou ela rotular como leitura
      #    propria. Parafrase nova passa; entregar a regua como decisao da casa
      #    continua reprovando.
      ("admite que a base nao cobre", lambda t: re.search(
          r"(base|material|bloco)[^.\\n]{0,70}?\\bn[ãa]o\\b"
          r"|\\bn[ãa]o\\b[^.\\n]{0,50}?(base|material)"
          r"|\\bsem\\b[^.\\n]{0,30}?(material|bloco|nada na base)"
          r"|minha (orienta[çc][ãa]o|leitura)|opini[ãa]o minha|lacuna", t, re.I))]),'''

if len(sys.argv) < 2:
    print("uso: python3 _patch-predicado-lacuna-por-forma-06set.py <mila-shadow.py>", file=sys.stderr)
    raise SystemExit(2)

alvo = sys.argv[1]
s = io.open(alvo, encoding="utf-8").read()

if "POR FORMA, NAO POR VOCABULARIO" in s:
    print("predicado ja trocado — nada a fazer")
    raise SystemExit(0)

n = s.count(DE)
if n != 1:
    print(f"ANCORA do predicado: esperava 1, achei {n}", file=sys.stderr)
    raise SystemExit(1)

s = s.replace(DE, PARA, 1)
io.open(alvo, "w", encoding="utf-8", newline="\n").write(s)
print(f"predicado de base-lacuna trocado para checagem por forma em {alvo}")
