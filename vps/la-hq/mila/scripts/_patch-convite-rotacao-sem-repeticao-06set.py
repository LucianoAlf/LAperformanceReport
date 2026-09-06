#!/usr/bin/env python3
"""A ROTACAO DO CONVITE REPETIA EM DIAS SEGUIDOS (06/09/2026).

Simulado antes de ir para producao, em 7 dias x 3 consultoras:

    Kailane   mes · base_comercial · base_comercial · programa · programa · ...
    Vitoria   mes · ficha_lead · base_comercial · programa · programa · ...

**"programa · programa"** em dias consecutivos, e nas tres ao mesmo tempo.

A causa e a caminhada: o indice comeca em `dia_do_ano % 7` e ANDA PARA FRENTE
ate achar um item aplicavel. No dia em que o indice cai num item que nao se
aplica (por exemplo `registrar_pendencia` com zero pendencias), ele anda e
pousa exatamente onde o dia SEGUINTE ja ia comecar. Duas datas diferentes
convergem para o mesmo convite.

Correcao: escolher DENTRO da lista ja filtrada, com um indice que mistura o dia
e a pessoa. Isso resolve dois problemas de uma vez —

  · acaba a colisao por caminhada (nao ha mais caminhada);
  · as tres consultoras deixam de receber o MESMO convite no mesmo dia, o que
    alem de parecer robotico no grupo, media pior: com convites diferentes eu
    descubro em uma semana qual deles faz a pessoa responder, em vez de ter
    tres amostras do mesmo.

⚠️ O `*3` importa: sem ele, `yday % len` anda de 1 em 1 e, quando `len` muda de
   um dia para o outro (porque a pendencia apareceu ou sumiu), o item repete.
   Com passo 3 sobre listas de 5 a 7 itens, a sequencia se espalha. Isso nao e
   teoria: a simulacao abaixo e a prova, e ela roda de novo depois do patch.

  python3 _patch-convite-rotacao-sem-repeticao-06set.py <mila-proativa.py>
"""
import io
import sys

DE = '''    n = len(CATALOGO_CONVITES)
    inicio = dia.timetuple().tm_yday % n
    for i in range(n):
        chave, aplicavel, molde = CATALOGO_CONVITES[(inicio + i) % n]
        try:
            ctx = aplicavel(dados)
        except (AttributeError, TypeError, IndexError, KeyError):
            ctx = None
        if not ctx:
            continue
        return {"chave": chave,
                "pedido": molde.format(ctx=ctx) if "{ctx}" in molde else molde}
    return None'''

PARA = '''    # ⚠️ Escolhe DENTRO da lista ja filtrada. A versao anterior comecava num
    #    indice e andava para frente ate achar um aplicavel — e a caminhada
    #    fazia dois dias diferentes pousarem no mesmo convite ("programa ·
    #    programa", medido em simulacao de 7 dias).
    aplicaveis = []
    for chave, aplicavel, molde in CATALOGO_CONVITES:
        try:
            ctx = aplicavel(dados)
        except (AttributeError, TypeError, IndexError, KeyError):
            ctx = None
        if ctx:
            aplicaveis.append((chave, ctx, molde))
    if not aplicaveis:
        return None

    # A pessoa entra no indice de proposito: as tres consultoras recebendo o
    # MESMO convite no mesmo dia parece robotico e, pior, me da tres amostras
    # da mesma pergunta. Com convites diferentes eu descubro em uma semana qual
    # deles faz a pessoa responder.
    quem = str((dados.get("consultora") or {}).get("apelido")
               or (dados.get("consultora") or {}).get("nome") or "")
    semente = sum(ord(ch) for ch in quem)
    # ⚠️ passo 3, nao 1: com passo 1 uma mudanca no tamanho da lista (a
    #    pendencia apareceu ou sumiu) faz o item repetir no dia seguinte.
    idx = (dia.timetuple().tm_yday * 3 + semente) % len(aplicaveis)
    chave, ctx, molde = aplicaveis[idx]
    return {"chave": chave,
            "pedido": molde.format(ctx=ctx) if "{ctx}" in molde else molde}'''

if len(sys.argv) < 2:
    print("uso: python3 _patch-convite-rotacao-sem-repeticao-06set.py <mila-proativa.py>",
          file=sys.stderr)
    raise SystemExit(2)

alvo = sys.argv[1]
s = io.open(alvo, encoding="utf-8").read()

if "Escolhe DENTRO da lista ja filtrada" in s:
    print("rotacao ja corrigida — nada a fazer")
    raise SystemExit(0)

if s.count(DE) != 1:
    print(f"ANCORA da rotacao: esperava 1, achei {s.count(DE)}", file=sys.stderr)
    raise SystemExit(1)

s = s.replace(DE, PARA, 1)
io.open(alvo, "w", encoding="utf-8", newline="\n").write(s)
print("rotacao do convite corrigida")
