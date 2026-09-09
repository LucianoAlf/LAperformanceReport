#!/usr/bin/env python3
"""Reproduz as contagens do shadow V4 na MESMA janela que o Alfredo usou.

🔴 POR QUE EXISTE. O handoff dele diz "161 decisões entre 08/09 11:14 e 09/09
   15:31, mediana 2,585s, p90 5,250s, foto pré-handle". Eu tinha medido 498
   desde 01/09 e 60 cegueiras. Os dois números podem estar certos ao mesmo
   tempo — janelas e filtros diferentes —, e antes de discordar é preciso
   reproduzir o dele.

⚠️ O filtro que ele nomeia é `contexto_de = foto_pre_handle`. Sem ele o corpus
   mistura duas gerações do shadow, e comparar as duas como se fossem a mesma
   coisa é o erro que este arquivo existe para não cometer.
"""
import json
import statistics
import sys
from collections import Counter

CAMINHO = "/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa.log"

# a janela do Alfredo, em UTC (o log é UTC; BRT = UTC-3)
INI = "2026-09-08T14:14"
FIM = "2026-09-09T18:31"

CEGO = {"nada", "fallback_llm_sem_intencao", "conversa_sem_comando"}


def main():
    ini = sys.argv[1] if sys.argv[1:] else INI
    fim = sys.argv[2] if sys.argv[2:] else FIM
    so_foto = "--todos" not in sys.argv

    linhas = []
    for ln in open(CAMINHO, encoding="utf-8"):
        try:
            d = json.loads(ln)
        except Exception:  # noqa: BLE001
            continue
        if d.get("acao") != "roteador_v4_shadow":
            continue
        if not (ini <= d.get("ts", "") <= fim):
            continue
        if so_foto and d.get("contexto_de") != "foto_pre_handle":
            continue
        linhas.append(d)

    print(f"janela {ini} .. {fim}"
          + (" · so foto_pre_handle" if so_foto else " · TODOS os contextos"))
    print(f"decisoes: {len(linhas)}")

    ms = [d["ms"] for d in linhas if isinstance(d.get("ms"), (int, float))]
    if ms:
        ms.sort()
        p90 = ms[int(len(ms) * 0.9) - 1] if len(ms) >= 10 else ms[-1]
        print(f"latencia: mediana {statistics.median(ms)/1000:.3f}s · "
              f"p90 {p90/1000:.3f}s · n={len(ms)}")

    legado = Counter(d.get("legado") or "nada" for d in linhas)
    print("\nlegado executou algo (V4 acompanhou):",
          sum(v for k, v in legado.items() if k not in CEGO))
    print("legado NADA (oportunidade do V4):",
          sum(v for k, v in legado.items() if k in CEGO))

    print("\nquando legado=nada, o V4 disse:")
    oport = Counter(d.get("intencao") or "?" for d in linhas
                    if (d.get("legado") or "nada") in CEGO)
    for k, v in oport.most_common():
        print(f"  {v:4d}  {k}")

    # 🔴 o que o Alfredo pediu para rotular a mao: as oportunidades COM texto.
    #    Sem texto nao da para rotular — e boa parte do corpus antigo nao tem.
    com_texto = [d for d in linhas
                 if (d.get("legado") or "nada") in CEGO and (d.get("texto") or "").strip()]
    print(f"\noportunidades rotulavel (tem texto): {len(com_texto)} de "
          f"{sum(v for k, v in legado.items() if k in CEGO)}")
    for d in com_texto[:40]:
        print(f"  [{d['ts'][5:16]}] {d.get('intencao'):26s} "
              f"conf={d.get('confianca')} · {str(d.get('texto'))[:70]}")


if __name__ == "__main__":
    main()
