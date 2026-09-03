#!/usr/bin/env python3
"""Empurra o estado da bridge de Instagram para o LA Report (Mapa de Sinais / A1).

POR QUE EXISTE: o Instagram da LA nao passa pelo Chatwoot. O canal e a bridge
`instagram-comments-bridge.js` (systemd, porta 3212, tunnel Cloudflare), que
guarda TODO o estado num arquivo solto: ig_sessions.json. Sem isto, 500+ eventos
por mes em duas contas ficam invisiveis para relatorio e para o radar.

O QUE ELE NAO FAZ: nao le token da bridge, nao chama a Graph API, nao escreve
nada no VPS. So le um arquivo world-readable (644) e faz POST.

Idempotente: a edge faz upsert por (ig_user_id, sender_id). Rodar duas vezes e
o mesmo que rodar uma.
"""
import json
import os
import sys
import urllib.error
import urllib.request

ARQUIVO = "/home/mila/.openclaw/workspace/memory/ig_sessions.json"
URL = ("https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/"
       "ingerir-instagram-sessoes")
TOKEN = os.environ.get("INSTAGRAM_BRIDGE_TOKEN", "")


def main() -> int:
    if not TOKEN:
        print("erro: INSTAGRAM_BRIDGE_TOKEN ausente no ambiente", file=sys.stderr)
        return 1

    try:
        with open(ARQUIVO, encoding="utf-8") as fh:
            sessoes = json.load(fh)
    except FileNotFoundError:
        print(f"erro: {ARQUIVO} nao existe", file=sys.stderr)
        return 1
    except json.JSONDecodeError as e:
        # Arquivo sendo reescrito pela bridge no exato instante da leitura.
        # Sair com erro (e nao com foto parcial) e deliberado: o proximo ciclo
        # pega inteiro, e meia foto viraria "o Instagram esvaziou".
        print(f"erro: json invalido ({e}) — nada enviado", file=sys.stderr)
        return 1

    vivas = {k: v for k, v in sessoes.items() if not k.startswith("human")}
    if not vivas:
        print("erro: zero sessoes no arquivo — nada enviado", file=sys.stderr)
        return 1

    corpo = json.dumps({"sessoes": vivas}).encode("utf-8")
    req = urllib.request.Request(
        URL,
        data=corpo,
        method="POST",
        headers={"Content-Type": "application/json", "x-radar-token": TOKEN},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            saida = json.loads(res.read().decode())
    except urllib.error.HTTPError as e:
        print(f"erro HTTP {e.code}: {e.read().decode()[:200]}", file=sys.stderr)
        return 1
    except Exception as e:  # noqa: BLE001 — qualquer falha de rede vira exit 1
        print(f"erro: {e}", file=sys.stderr)
        return 1

    if not saida.get("ok"):
        print(f"erro da edge: {json.dumps(saida)[:300]}", file=sys.stderr)
        return 1

    print(
        "ok — recebidas {recebidas} | gravadas {gravadas} | "
        "transferidas {transferidas} | paradas {paradas_no_meio} | "
        "contas {contas}".format(**saida)
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
