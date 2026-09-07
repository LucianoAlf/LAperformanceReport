#!/usr/bin/env python3
"""Placar da etapa (b): o roteador V4 CORRIGIDO sobre as 213 mensagens de 15/08.

⚠️ ESCALA DO VALOR — a primeira coisa que este script checa, e por um motivo
   concreto: no ensaio o roteador devolveu `499` para uma mensagem em que o
   legado gravou `49900` (centavos), enquanto na sombra de 31/08 ele devolvia
   `38700`, que E centavos. **A escala e inconsistente entre chamadas.**
   Isso nao e erro de julgamento — e a diferenca entre lancar R$ 387 e R$ 3,87.
   Tem de estar travado antes de qualquer flip, entao o placar mede quantos
   casos batem em cada escala em vez de escolher uma e torcer.

  analisar-replay-v4.py [/tmp/replay-v4-15ago.jsonl]
"""
import json
import statistics
import sys
from collections import Counter

P = sys.argv[1] if len(sys.argv) > 1 else "/tmp/replay-v4-15ago.jsonl"
d = [json.loads(l) for l in open(P, encoding="utf-8") if l.strip()]
print(f"== {len(d)} mensagens de 15/08, roteador corrigido ==\n")

# ── transporte ──────────────────────────────────────────────────────────────
erros = [x for x in d if x.get("erro")]
vazias = [x for x in d if not x.get("erro") and x.get("v4_intencao") is None]
ms = sorted(x["ms"] for x in d if isinstance(x.get("ms"), (int, float)))
print("── TRANSPORTE ──")
if ms:
    print(f"  latencia: mediana {ms[len(ms)//2]/1000:.1f}s · "
          f"p90 {ms[int(len(ms)*0.9)]/1000:.1f}s · max {ms[-1]/1000:.1f}s")
print(f"  erro de chamada: {len(erros)}/{len(d)} ({len(erros)*100//max(len(d),1)}%)")
print(f"  resposta vazia:  {len(vazias)}/{len(d)} ({len(vazias)*100//max(len(d),1)}%)")
print("  ⚠️ comparar com a sombra ANTIGA: mediana 19,8s · p90 44,1s · 15% de falha\n")

# ── escala do valor ─────────────────────────────────────────────────────────
com_ambos = [x for x in d if x.get("legado_valor") and x.get("v4_valor")]
igual_reais = sum(1 for x in com_ambos if abs(x["v4_valor"] * 100 - x["legado_valor"]) < 2)
igual_cent = sum(1 for x in com_ambos if abs(x["v4_valor"] - x["legado_valor"]) < 2)
nenhum = len(com_ambos) - igual_reais - igual_cent
print("── ESCALA DO VALOR (o risco de dinheiro) ──")
print(f"  casos com valor nos dois lados: {len(com_ambos)}")
print(f"    V4 em REAIS    (x100 bate): {igual_reais}")
print(f"    V4 em CENTAVOS (bate direto): {igual_cent}")
print(f"    nao bate em nenhuma escala:  {nenhum}")
if igual_reais and igual_cent:
    print("  🔴 AS DUAS ESCALAS APARECEM — o contrato do valor nao esta travado.")
elif nenhum > len(com_ambos) * 0.2:
    print("  🔴 divergencia alta de valor, independente de escala")
print()

# ── extracao ────────────────────────────────────────────────────────────────
print("── EXTRACAO ──")
leg_v = [x for x in d if x.get("legado_valor")]
achou = sum(1 for x in leg_v if x.get("v4_valor"))
perdeu = len(leg_v) - achou
inventou = sum(1 for x in d if x.get("v4_valor") and not x.get("legado_valor"))
print(f"  o legado extraiu valor em {len(leg_v)} · o V4 tambem em {achou} · PERDEU {perdeu}")
print(f"  o V4 extraiu valor onde o legado nao extraiu: {inventou}")
print(f"  extraiu aluno: {sum(1 for x in d if x.get('v4_aluno'))} "
      f"(o legado nao extraia nenhum nesta tabela)\n")

# ── julgamento ──────────────────────────────────────────────────────────────
print("── JULGAMENTO ──")
for st in ("ignorado", "recebido"):
    g = [x for x in d if x.get("status_legado") == st]
    if not g:
        continue
    print(f"  legado='{st}' (n={len(g)}): {dict(Counter(x.get('v4_intencao') for x in g).most_common(5))}")
conf = sorted(x["v4_confianca"] for x in d if isinstance(x.get("v4_confianca"), (int, float)))
if conf:
    print(f"  confianca: mediana {conf[len(conf)//2]:.2f} · <0.5 em {sum(1 for c in conf if c < 0.5)}")

# ⚠️ O legado 'ignorado' e o controle: sao mensagens que o caixa descartou. Se o
#    V4 quiser AGIR nelas, ou ele achou algo que o legado perdeu, ou e ruido —
#    e a unica forma de saber e ler os casos, nao contar.
disc = [x for x in d if x.get("status_legado") == "ignorado"
        and x.get("v4_intencao") not in (None, "nada", "conversa")]
if disc:
    print(f"\n  🔎 {len(disc)} que o legado IGNOROU e o V4 quer agir — ler um a um:")
    for x in disc[:8]:
        print(f"     {x['v4_intencao']:24} conf={x.get('v4_confianca')} "
              f"valor={x.get('v4_valor')} len={x['texto_len']}")
