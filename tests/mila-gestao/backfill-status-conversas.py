#!/usr/bin/env python3
"""Ensina ao espelho o status ATUAL das conversas que hoje viram sinal.

🔴 POR QUE EXISTE. `sol_chatwoot_conversas` nasceu em 09/09/2026 alimentada pelo
   evento `conversation_status_changed`, e evento é FORWARD-ONLY: conversa
   resolvida ANTES disso continuaria invisível — e são justamente essas que
   estão fazendo ruído hoje (Débora conv 20184, Henrique conv 20732).

   Este script pergunta o status à fonte, uma vez, para o conjunto que importa:
   as conversas que hoje aparecem nas duas views de atendimento.

⚠️ Grava `fonte='backfill'` para o dia em que alguém perguntar por que uma linha
   não veio de webhook. E grava TODOS os status, não só `resolved`: registrar só
   o que exclui deixaria a tabela mentindo por omissão.

Uso:  backfill-status-conversas.py            (aplica)
      backfill-status-conversas.py --ensaio   (só mostra)
"""
import concurrent.futures as fut
import json
import os
import subprocess
import sys
import urllib.request
from collections import Counter

BASE = os.environ["CHATWOOT_BASE_URL"].rstrip("/")
ACC = os.environ["CHATWOOT_ACCOUNT_ID"]
TOK = (os.environ.get("CHATWOOT_USER_TOKEN")
       or os.environ.get("CHATWOOT_API_TOKEN")
       or os.environ["CHATWOOT_BOT_TOKEN"])

SOL_URL = os.environ["SOL_SUPABASE_URL"].rstrip("/")
SOL_KEY = os.environ["SOL_SERVICE_ROLE_KEY"]


def cw(path):
    req = urllib.request.Request(
        f"{BASE}/api/v1/accounts/{ACC}{path}",
        headers={"api_access_token": TOK, "User-Agent": "la-backfill-status"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def sol(metodo, path, corpo=None, extra=None):
    cab = {"apikey": SOL_KEY, "Authorization": "Bearer " + SOL_KEY,
           "Content-Type": "application/json"}
    cab.update(extra or {})
    dados = json.dumps(corpo).encode() if corpo is not None else None
    req = urllib.request.Request(SOL_URL + path, data=dados, headers=cab, method=metodo)
    with urllib.request.urlopen(req, timeout=60) as r:
        txt = r.read().decode()
        return json.loads(txt) if txt.strip() else None


def alvos():
    """As conversas que hoje alimentam sinal — as duas views, sem repetir."""
    ids = set()
    for view in ("vw_atendimento_candidatos_sinal", "vw_atendimento_calor_conversa"):
        for linha in sol("GET", f"/rest/v1/{view}?select=conversa_id") or []:
            ids.add(int(linha["conversa_id"]))
    return sorted(ids)


def status_de(conv_id):
    try:
        return conv_id, cw(f"/conversations/{conv_id}").get("status")
    except Exception:  # noqa: BLE001
        # ⚠️ falha de leitura NAO vira linha: gravar "nao sei" como aberto seria
        #    inventar, e gravar como resolvido sumiria com o caso.
        return conv_id, None


def main():
    ensaio = "--ensaio" in sys.argv
    ids = alvos()
    print(f"conversas nas duas views: {len(ids)}")

    achados = {}
    with fut.ThreadPoolExecutor(max_workers=8) as ex:
        for cid, st in ex.map(status_de, ids):
            if st:
                achados[cid] = st

    placar = Counter(achados.values())
    print("status na fonte: " + ", ".join(f"{k}={v}" for k, v in placar.most_common()))
    resolvidas = [c for c, s in achados.items() if s == "resolved"]
    print(f"🔴 RESOLVIDAS que ainda geram sinal: {len(resolvidas)} -> {sorted(resolvidas)}")
    print(f"nao consegui ler: {len(ids) - len(achados)}")

    if ensaio:
        print("\n(ensaio — nada gravado)")
        return

    linhas = [{"conversa_id": c, "status": s, "fonte": "backfill"}
              for c, s in achados.items()]
    for i in range(0, len(linhas), 200):
        sol("POST", "/rest/v1/sol_chatwoot_conversas", linhas[i:i + 200],
            {"Prefer": "resolution=merge-duplicates"})
    print(f"\ngravadas {len(linhas)} linhas em sol_chatwoot_conversas")


if __name__ == "__main__":
    main()
