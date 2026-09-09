#!/usr/bin/env python3
"""Placar: onde o runtime legado e o roteador V4 (sombra) DISCORDAM.

🔴 POR QUE EXISTE. O combinado com o Luciano (31/08) é que todo incidente da
   Sol tem duas partes: corrigir na raiz E dizer como o roteador V4 teria
   decidido. Este arquivo transforma o combinado em número — é ele que sustenta
   (ou derruba) a decisão de virar a chave.

   Lê o `caixa.log`, pareia cada `roteador_v4_shadow` com a ação que o runtime
   tomou naquele mesmo turno e conta os desencontros por tipo.

⚠️ O V4 acertar em sombra NÃO autoriza o flip sozinho: sombra não escreve, não
   aprova dinheiro e não sofre as consequências de errar. O placar mede
   COBERTURA (o V4 enxerga o que o legado não vê?), não segurança.
"""
import json
import sys
from collections import Counter, defaultdict

CAMINHO = "/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa.log"

# ações do runtime que significam "eu não entendi / não fiz nada útil"
CEGUEIRA = {
    "fallback_llm_sem_intencao",
    "nada",
    "conversa_sem_comando",
}
# o que o V4 chamaria de trabalho de verdade
ACIONAVEL = {
    "lancamento_multi_aluno", "lancamento_por_texto", "corrigir_lancamento_gravado",
    "corrigir_pendencia", "aprovar", "descartar", "saida_caixa", "consulta",
}


def main():
    desde = sys.argv[1] if sys.argv[1:] else "2026-09-01"
    v4_por_intencao = Counter()
    legado_quando_v4_multi = Counter()
    cegueira_com_v4_acionavel = Counter()
    total_v4 = 0
    exemplos = defaultdict(list)

    for ln in open(CAMINHO, encoding="utf-8"):
        try:
            d = json.loads(ln)
        except Exception:  # noqa: BLE001
            continue
        if d.get("acao") != "roteador_v4_shadow":
            continue
        if d.get("ts", "") < desde:
            continue

        total_v4 += 1
        intencao = d.get("intencao") or "?"
        legado = d.get("legado") or "nada"
        v4_por_intencao[intencao] += 1

        # 🔴 o caso que estourou em 09/09: V4 vê multi-aluno, legado vê outra coisa
        if intencao == "lancamento_multi_aluno":
            legado_quando_v4_multi[legado] += 1
            if legado != "multi_aluno_aberto" and len(exemplos["multi"]) < 6:
                exemplos["multi"].append(
                    (d.get("ts", "")[5:16], legado, round(d.get("confianca") or 0, 2),
                     str(d.get("texto") or "")[:78]))

        # runtime cego enquanto o V4 tinha uma intenção acionável
        if legado in CEGUEIRA and intencao in ACIONAVEL:
            cegueira_com_v4_acionavel[intencao] += 1
            if len(exemplos["cego"]) < 6:
                exemplos["cego"].append(
                    (d.get("ts", "")[5:16], intencao, round(d.get("confianca") or 0, 2),
                     str(d.get("texto") or "")[:78]))

    print(f"decisões do V4 em sombra desde {desde}: {total_v4}\n")
    print("o que o V4 viu:")
    for k, v in v4_por_intencao.most_common(10):
        print(f"  {v:5d}  {k}")

    print(f"\n🔴 V4 disse MULTI-ALUNO ({sum(legado_quando_v4_multi.values())}x) — o que o legado fez:")
    for k, v in legado_quando_v4_multi.most_common():
        print(f"  {v:5d}  {k}")
    for ts, leg, conf, txt in exemplos["multi"]:
        print(f"       {ts} legado={leg} (conf {conf}) · {txt}")

    print(f"\n🔴 runtime CEGO com V4 acionável: {sum(cegueira_com_v4_acionavel.values())}")
    for k, v in cegueira_com_v4_acionavel.most_common():
        print(f"  {v:5d}  V4 dizia {k}")
    for ts, it, conf, txt in exemplos["cego"]:
        print(f"       {ts} V4={it} (conf {conf}) · {txt}")


if __name__ == "__main__":
    main()
