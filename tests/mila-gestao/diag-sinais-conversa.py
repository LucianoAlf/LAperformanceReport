#!/usr/bin/env python3
"""Confere, conversa a conversa, se o sinal que foi para o grupo ainda procede.

🔴 POR QUE EXISTE. Em 09/09/2026 a Vitória (CG) e a Daiana (Recreio) relataram,
   cada uma no seu grupo, que a maioria dos "SINAIS DO DIA" já estava atendida.
   A Daiana foi específica: *"quando puxa é porque eu tô encerrando a conversa"*.

   Ruído no grupo desanima a equipe e faz o agente ser abandonado — já aconteceu
   com o TOM. Então cada linha do bloco vira uma pergunta ao Chatwoot:

     · a conversa ainda está ABERTA?
     · a última mensagem é do CLIENTE ou da EQUIPE?
     · o inbox é da unidade em que o sinal apareceu?

Uso: diag-sinais-conversa.py <conv_id> [...]
     diag-sinais-conversa.py --unidade Recreio     (puxa do banco)
"""
import json
import os
import sys
import urllib.request
from datetime import datetime

BASE = os.environ["CHATWOOT_BASE_URL"].rstrip("/")
ACC = os.environ["CHATWOOT_ACCOUNT_ID"]
TOK = os.environ.get("CHATWOOT_BOT_TOKEN") or os.environ["CHATWOOT_API_TOKEN"]


def get(path):
    req = urllib.request.Request(
        BASE + "/api/v1/accounts/" + ACC + path,
        # ⚠️ o proxy do Chatwoot devolve 403 sem User-Agent explícito
        headers={"api_access_token": TOK, "User-Agent": "la-diag-sinais"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def quando(ts):
    return datetime.fromtimestamp(ts).strftime("%d/%m %H:%M") if ts else "-"


def olhar(conv_id):
    try:
        d = get("/conversations/" + str(conv_id))
    except Exception as e:  # noqa: BLE001
        print(f"  conv {conv_id}: NAO LI ({e})")
        return
    meta = d.get("meta") or {}
    sender = meta.get("sender") or {}
    assignee = meta.get("assignee") or {}

    try:
        msgs = get("/conversations/" + str(conv_id) + "/messages?limit=30")
        lista = msgs.get("payload") if isinstance(msgs, dict) else msgs
    except Exception:  # noqa: BLE001
        lista = []

    # última mensagem que NÃO é nota privada nem evento de sistema
    ultima = None
    for m in reversed(lista or []):
        if m.get("private") or m.get("message_type") == 2:
            continue
        ultima = m
        break

    quem = "?"
    if ultima:
        tipo = ultima.get("message_type")           # 0 = entrada (cliente), 1 = saída
        quem = "CLIENTE" if tipo == 0 else "EQUIPE"

    print(f"  conv {conv_id} · {sender.get('name') or '?'}")
    print(f"      status={d.get('status')} · inbox={meta.get('channel')} "
          f"· inbox_id={d.get('inbox_id')} · agente={assignee.get('name') or '—'}")
    print(f"      última fala: {quem} em {quando((ultima or {}).get('created_at'))}"
          f" — {repr((ultima or {}).get('content') or '')[:90]}")


def main():
    if not sys.argv[1:]:
        print(__doc__)
        return
    print("estado REAL no Chatwoot agora:")
    for c in sys.argv[1:]:
        olhar(c)


if __name__ == "__main__":
    main()
