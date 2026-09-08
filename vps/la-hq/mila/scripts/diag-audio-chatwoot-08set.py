#!/usr/bin/env python3
"""Diagnóstico: a transcrição de áudio do Chatwoot é automática ou sob demanda?

Isso decide o conserto. A ponte da Mila lê `attachments[].transcribed_text` e viu
vazio nos áudios da Krissya (16:56, 17:03) e do Luciano (17:38) — mas o GET da API
devolve a transcrição dos três. As duas explicações possíveis são:

  (a) transcrição é ASSÍNCRONA/sob demanda → no instante do webhook ela não existe
  (b) o webhook não carrega o campo, mesmo já transcrito

Se for (a), varrer áudios recentes vai achar alguns SEM transcrição — os que
ninguém abriu. Se for (b), todos terão.
"""
import json
import os
import sys
import urllib.request

BASE = os.environ["CHATWOOT_BASE_URL"].rstrip("/")
ACC = os.environ["CHATWOOT_ACCOUNT_ID"]
TOK = os.environ.get("CHATWOOT_BOT_TOKEN") or os.environ["CHATWOOT_API_TOKEN"]


def get(path):
    req = urllib.request.Request(
        f"{BASE}/api/v1/accounts/{ACC}{path}",
        # ⚠️ o proxy do Chatwoot devolve 403 sem User-Agent explícito
        headers={"api_access_token": TOK, "User-Agent": "la-diag-audio"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def main():
    conversas = [c.strip() for c in (sys.argv[1:] or ["8809", "6308"])]
    com, sem = [], []
    for c in conversas:
        try:
            d = get(f"/conversations/{c}/messages?limit=40")
        except Exception as e:
            print(f"conversa {c}: falhou ({e})")
            continue
        msgs = d.get("payload") if isinstance(d, dict) else d
        for m in msgs or []:
            for a in m.get("attachments") or []:
                if a.get("file_type") != "audio":
                    continue
                t = (a.get("transcribed_text") or "").strip()
                alvo = com if t else sem
                alvo.append((c, m.get("id"), m.get("created_at"), t[:70]))

    print(f"audios COM transcricao: {len(com)}")
    for c, mid, ts, t in com[-6:]:
        print(f"   conv {c} msg {mid} ts {ts} -> {t!r}")
    print(f"audios SEM transcricao: {len(sem)}")
    for c, mid, ts, _ in sem[-6:]:
        print(f"   conv {c} msg {mid} ts {ts}")
    print()
    if sem and com:
        print("VEREDITO: transcricao NAO e garantida no momento da criacao (ha audio sem ela)")
    elif com and not sem:
        print("VEREDITO: todo audio acaba transcrito — o webhook e' que nao carrega o campo,")
        print("          OU a transcricao chega depois do webhook. Nos dois casos a ponte")
        print("          precisa BUSCAR na API em vez de confiar no payload.")
    else:
        print("VEREDITO: nenhum audio com transcricao — transcricao provavelmente desligada")


if __name__ == "__main__":
    main()
