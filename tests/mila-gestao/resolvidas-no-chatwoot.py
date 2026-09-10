#!/usr/bin/env python3
"""Lista as conversas RESOLVIDAS no Chatwoot, para o backfill do espelho.

🔴 POR QUE EXISTE. `sol_chatwoot_conversas` (09/09/2026) aprende pelo evento
   `conversation_status_changed`, que é forward-only. As conversas resolvidas
   ANTES dele continuariam gerando sinal — e são exatamente as que estão
   fazendo ruído hoje (Débora conv 20184 cobrada por 14 dias; Henrique conv
   20732 na DM da Daiana).

⚠️ Pergunta pelo que EXCLUI (`status=resolved`), não uma a uma: são 1.454
   conversas nas duas views e a varredura por id levaria minutos e 1.454
   chamadas. O filtro paginado resolve em poucas.
⚠️ A ausência de uma conversa aqui NÃO é "está aberta" — é "não sei", e a view
   faz `COALESCE(vivo, congelado)` justamente por isso.

Uso:  resolvidas-no-chatwoot.py [dias]     (default 45)
Saída: uma linha `IDS=<lista separada por espaço>` para o passo de gravação.
"""
import json
import os
import sys
import urllib.request

BASE = os.environ["CHATWOOT_BASE_URL"].rstrip("/")
ACC = os.environ["CHATWOOT_ACCOUNT_ID"]
TOK = (os.environ.get("CHATWOOT_USER_TOKEN")
       or os.environ.get("CHATWOOT_API_TOKEN")
       or os.environ["CHATWOOT_BOT_TOKEN"])

MAX_PAGINAS = 60   # teto: 60 x 25 = 1.500 conversas


def post(path, corpo):
    req = urllib.request.Request(
        f"{BASE}/api/v1/accounts/{ACC}{path}",
        data=json.dumps(corpo).encode(),
        headers={"api_access_token": TOK, "Content-Type": "application/json",
                 "User-Agent": "la-resolvidas"},
        method="POST")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def main():
    ids, pagina, truncou = [], 1, False
    while pagina <= MAX_PAGINAS:
        r = post(f"/conversations/filter?page={pagina}", {
            "payload": [{"attribute_key": "status", "filter_operator": "equal_to",
                         "values": ["resolved"], "query_operator": None}]
        })
        lote = (r.get("payload") or [])
        if not lote:
            break
        ids.extend(c["id"] for c in lote)
        pagina += 1
    else:
        truncou = True

    print(f"resolvidas encontradas: {len(ids)}  (paginas lidas: {pagina-1})")
    if truncou:
        # 🔴 teto batido = foto parcial. Dizer isso alto: o passo seguinte grava
        #    o que veio, e o que faltou segue com o status congelado (que e o
        #    comportamento de antes, nao um regresso).
        print("⚠️ TETO ATINGIDO — a lista esta incompleta")
    print("IDS=" + " ".join(str(i) for i in sorted(set(ids))))


if __name__ == "__main__":
    main()
