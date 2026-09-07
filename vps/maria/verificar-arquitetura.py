#!/usr/bin/env python3
"""Verifica COM OS PROPRIOS OLHOS as afirmacoes do agente da Maria (07/09/2026).

O agente da Maria respondeu duas rodadas de perguntas (Sol e TOM). A regra do
Alf: "nao e so eu te mandar a resposta do agente da Maria — voce tem que ver
com seus proprios olhos". Este script confere os numeros que decidem o desenho
da Sol, lendo o codigo e o log em vez de confiar no relato.

Le apenas: openclaw.json, private/mcp/*.mjs, workspace/logs. Nunca o maria.env.
"""
import json
import re
import collections
import glob
import os

M = "/home/maria/.openclaw/private/mcp/maria-db-mcp.mjs"
LOGS = "/home/maria/.openclaw/workspace/logs"

# ── (a) as descricoes: tamanho, fronteira negativa, irma nomeada ─────────────
s = open(M, encoding="utf-8").read()
nomes = re.findall(r"name:\s*['\"](maria_[a-z0-9_]+)['\"]", s)
descs = re.findall(r"description:\s*(['\"])(.*?)\1\s*,", s, re.S)
descs = [d for _, d in descs if len(d) >= 30]
L = sorted(len(d) for d in descs)
print("== (a) DESCRICOES em maria-db-mcp.mjs ==")
print(f"   tools com nome maria_*: {len(nomes)}")
if L:
    print(f"   descricoes: {len(L)} · media {sum(L)//len(L)} · mediana {L[len(L)//2]} · min {L[0]} · max {L[-1]}")
    neg = sum(1 for d in descs if re.search(r"\bN[AÃ]O\b|\bNUNCA\b", d))
    irma = sum(1 for d in descs if re.search(r"maria_[a-z0-9_]+", d))
    data = sum(1 for d in descs if re.search(r"\d{2}/\d{2}(/\d{4})?", d))
    print(f"   com NAO/NUNCA (fronteira negativa): {neg}")
    print(f"   que nomeiam a irma: {irma}")
    print(f"   com data/procedencia: {data}")
    ex = max(descs, key=len)
    print(f"   a maior, inteira ({len(ex)} chars):\n      {ex[:700]}")

# ── (b) a cerca do select ────────────────────────────────────────────────────
print("\n== (b) A CERCA DO SELECT ==")
for i, linha in enumerate(s.splitlines(), 1):
    if re.search(r"sanitizad|vw_maria_|objeto Maria|Consulta bloqueada", linha, re.I):
        print(f"   L{i}: {linha.strip()[:120]}")
        if i > 0 and sum(1 for _ in []) > 6: break

# ── (d) a rota: modelo x atalho ──────────────────────────────────────────────
print("\n== (d) ROTA — modelo x atalho, no log do bridge ==")
rotas = collections.Counter()
arqs = sorted(glob.glob(os.path.join(LOGS, "*")), key=os.path.getmtime)[-6:]
for a in arqs:
    try:
        for l in open(a, encoding="utf-8", errors="replace"):
            if "route_decision_v1" not in l: continue
            m = re.search(r'"route"\s*:\s*"([^"]+)"', l) or re.search(r"route[=:]\s*([a-z_]+)", l)
            if m: rotas[m.group(1)] += 1
    except OSError:
        continue
tot = sum(rotas.values())
if tot:
    for r, n in rotas.most_common(8):
        print(f"   {n:5} ({n*100//tot:>2}%)  {r}")
    print(f"   total: {tot}")
else:
    print("   (nao achei route_decision_v1 nos logs recentes)")
