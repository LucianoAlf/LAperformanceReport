#!/usr/bin/env python3
"""Placar runtime x roteador V4 para uma janela do caixa.log.

🔴 Parte 2 do combinado vigente (31/08): ao tratar QUALQUER problema da Sol,
   além de corrigir na raiz, **consultar o shadow para o mesmo caso e reportar
   se o roteador teria decidido certo**. Cada incidente é um ponto de dado da
   decisão de virar a chave da V4.

Uso: placar-v4-do-incidente.py <prefixo-de-hora-UTC> [...]
     ex.: placar-v4-do-incidente.py 2026-09-08T22:2 2026-09-08T22:3 2026-09-08T22:4
"""
import json
import sys

LOG = "/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa.log"
prefixos = sys.argv[1:] or ["2026-09-08T22:"]

linhas = []
for ln in open(LOG, encoding="utf-8", errors="replace"):
    ln = ln.strip()
    if not ln.startswith("{"):
        continue
    try:
        d = json.loads(ln)
    except Exception:  # noqa: BLE001
        continue
    if any(str(d.get("ts") or "").startswith(p) for p in prefixos):
        linhas.append(d)

print(f"{'hora':8s} | {'RUNTIME fez':42s} | ROTEADOR V4 diria")
print("-" * 104)
ultima_acao = ""
for d in linhas:
    ts = str(d.get("ts", ""))[11:19]
    acao = d.get("acao")
    r = d.get("r") if isinstance(d.get("r"), dict) else None
    if acao == "roteador_v4_shadow":
        campos = {k: v for k, v in (d.get("campos") or {}).items() if v}
        extra = " ".join(f"{k}={v}" for k, v in campos.items())
        v4 = f"{d.get('intencao')} ({d.get('confianca')}) {extra}"
        print(f"{ts:8s} | {ultima_acao:42s} | {v4[:52]}")
        ultima_acao = ""
    elif r and r.get("acao"):
        ultima_acao = str(r.get("acao"))
        print(f"{ts:8s} | {ultima_acao:42s} |")
    elif acao and acao not in ("classificador_v3_shadow",):
        print(f"{ts:8s} | · {acao:40s} |")
