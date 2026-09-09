#!/usr/bin/env python3
"""Confronta a PAUTA que foi para os grupos com o estado REAL no Chatwoot.

🔴 POR QUE EXISTE. Em 09/09/2026 a Vitória (CG) e a Daiana (Recreio) relataram,
   cada uma no seu grupo, que a maior parte dos "SINAIS DO DIA" já estava
   resolvida. A Daiana foi específica: *"quando puxa é porque eu tô encerrando
   a conversa"*. Ruído no grupo faz a equipe abandonar o agente — já aconteceu
   com o TOM —, então o relato delas vira medição, não opinião.

   Para CADA sinal aberto que veio de conversa, pergunta ao Chatwoot:

     · a conversa foi RESOLVIDA?            → a equipe declarou o desfecho
     · a EQUIPE respondeu depois do sinal?  → o motivo do sinal deixou de valer
     · o inbox é da unidade do sinal?       → foi para o grupo certo?

   Nenhuma dessas três perguntas é feita hoje. É isso que o auditor mede.

Uso: auditar-pauta-conversas.py            (todas as unidades)
     auditar-pauta-conversas.py Recreio
"""
import concurrent.futures as fut
import json
import os
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone

BASE = os.environ["CHATWOOT_BASE_URL"].rstrip("/")
ACC = os.environ["CHATWOOT_ACCOUNT_ID"]
TOK = os.environ.get("CHATWOOT_BOT_TOKEN") or os.environ["CHATWOOT_API_TOKEN"]

SQL = """
select coalesce(json_agg(json_build_object(
         'sinal', left(s.id::text, 8), 'regra', s.regra_codigo,
         'unidade', u.nome, 'inbox', s.evidencia->>'inbox',
         'conv', (s.evidencia->>'conversa_id')::int,
         'ultima_msg_em', s.evidencia->>'ultima_msg_em')
         order by u.nome, (s.evidencia->>'conversa_id')::int), '[]'::json)
  from radar_sinais s left join unidades u on u.id = s.unidade_id
 where s.evidencia ? 'inbox' and s.status = 'aberto';
"""


def do_banco():
    # ⚠️ o papel read-only da la-hq NAO alcanca radar_sinais (escopo da Fatia 0-2),
    #    entao a lista tambem pode chegar por stdin: `aud.py - < sinais.json`
    if sys.argv[1:2] == ["-"]:
        return json.load(sys.stdin)
    env = dict(os.environ)
    uri = (f"postgresql://{env['LA_REPORT_READONLY_POOLER_USER']}:"
           f"{env['LA_REPORT_READONLY_PASSWORD']}@{env['LA_REPORT_READONLY_HOST']}:"
           f"{env['LA_REPORT_READONLY_PORT']}/{env['LA_REPORT_READONLY_DB']}")
    out = subprocess.run(["psql", uri, "-tAc", SQL], capture_output=True, text=True)
    if out.returncode != 0:
        # 🔴 nunca deixar a URI (com senha) subir no traceback
        raise SystemExit("psql falhou: " + out.stderr.strip()[:400])
    return json.loads(out.stdout.strip())


def get(path):
    req = urllib.request.Request(
        f"{BASE}/api/v1/accounts/{ACC}{path}",
        # ⚠️ o proxy devolve 403 sem User-Agent explícito
        headers={"api_access_token": TOK, "User-Agent": "la-audita-pauta"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def estado(conv_id):
    """Estado vivo de uma conversa: status, inbox e a última fala de cada lado."""
    d = get(f"/conversations/{conv_id}")
    meta = d.get("meta") or {}
    msgs = get(f"/conversations/{conv_id}/messages?limit=40")
    lista = msgs.get("payload") if isinstance(msgs, dict) else (msgs or [])

    ult_cliente = ult_equipe = None
    for m in lista or []:
        # nota privada e evento de sistema não são fala com o cliente
        if m.get("private") or m.get("message_type") == 2:
            continue
        ts = m.get("created_at")
        if m.get("message_type") == 0:
            ult_cliente = max(ult_cliente or 0, ts or 0)
        elif m.get("message_type") == 1:
            ult_equipe = max(ult_equipe or 0, ts or 0)
    return {
        "status": d.get("status"),
        "inbox_id": d.get("inbox_id"),
        "quem": (meta.get("sender") or {}).get("name"),
        "agente": (meta.get("assignee") or {}).get("name"),
        "ult_cliente": ult_cliente,
        "ult_equipe": ult_equipe,
    }


UNI_DO_INBOX = {"CG": "Campo Grande", "Recreio": "Recreio", "Barra": "Barra"}


def unidade_do_inbox(nome):
    if not nome:
        return None
    for sufixo, uni in UNI_DO_INBOX.items():
        if nome.lower().endswith(sufixo.lower()):
            return uni
    return None


def veredito(sinal, viva):
    """Por que este sinal não deveria estar na pauta de hoje (ou por que deveria)."""
    motivos = []

    if viva["status"] == "resolved":
        motivos.append("RESOLVIDA no Chatwoot")

    marco = sinal.get("ultima_msg_em")
    if marco and viva["ult_equipe"]:
        t = datetime.fromisoformat(marco).timestamp()
        if viva["ult_equipe"] > t:
            quando = datetime.fromtimestamp(viva["ult_equipe"], timezone.utc)
            motivos.append(f"EQUIPE RESPONDEU em {quando.strftime('%d/%m %H:%M')}Z")

    ui = unidade_do_inbox(sinal.get("inbox"))
    if ui and ui != sinal.get("unidade"):
        motivos.append(f"UNIDADE ERRADA (inbox={ui}, foi para {sinal['unidade']})")

    return motivos


def main():
    sinais = do_banco()
    filtro = sys.argv[2] if sys.argv[2:] else (
        sys.argv[1] if sys.argv[1:] and sys.argv[1] != "-" else None)
    if filtro:
        sinais = [s for s in sinais if s["unidade"] == filtro]

    convs = sorted({s["conv"] for s in sinais})
    print(f"pauta: {len(sinais)} sinais abertos em {len(convs)} conversas"
          + (f" (filtro: {filtro})" if filtro else ""))

    vivas = {}
    with fut.ThreadPoolExecutor(max_workers=8) as ex:
        tarefas = {ex.submit(estado, c): c for c in convs}
        for t in fut.as_completed(tarefas):
            c = tarefas[t]
            try:
                vivas[c] = t.result()
            except Exception as e:  # noqa: BLE001
                vivas[c] = {"erro": str(e)}

    sujos, limpos, placar = [], [], {}
    for s in sinais:
        viva = vivas.get(s["conv"], {})
        if "erro" in viva:
            print(f"  !! conv {s['conv']}: {viva['erro']}")
            continue
        ms = veredito(s, viva)
        (sujos if ms else limpos).append((s, viva, ms))
        for m in ms:
            placar[m.split(" (")[0].split(" em ")[0]] = \
                placar.get(m.split(" (")[0].split(" em ")[0], 0) + 1

    # duplicata: (conversa, regra) aparecendo mais de uma vez na mesma pauta
    vistos, dups = {}, 0
    for s in sinais:
        k = (s["conv"], s["regra"])
        vistos[k] = vistos.get(k, 0) + 1
    dups = sum(v - 1 for v in vistos.values() if v > 1)

    print(f"\n{'='*74}\nNAO DEVERIAM ESTAR NA PAUTA: {len(sujos)} de {len(sinais)}"
          f"  ({100*len(sujos)//max(len(sinais),1)}%)\n{'='*74}")
    for m, n in sorted(placar.items(), key=lambda x: -x[1]):
        print(f"  {n:3d}  {m}")
    print(f"  {dups:3d}  LINHA DUPLICADA (mesma conversa e regra 2x na pauta)")

    print(f"\n--- detalhe ---")
    for s, viva, ms in sorted(sujos, key=lambda x: (x[0]["unidade"], x[0]["conv"])):
        print(f"\n  [{s['unidade']}] {s['regra']} conv {s['conv']} · "
              f"{viva.get('quem')} · agente {viva.get('agente') or '—'}")
        for m in ms:
            print(f"      → {m}")

    # bloco legivel por maquina, para cruzar com a vigencia do banco
    print("\nJSON_SUJOS=" + json.dumps(sorted(x[0]["sinal"] for x in sujos)))
    print("JSON_LIMPOS=" + json.dumps(sorted(x[0]["sinal"] for x in limpos)))

    print(f"\n--- procedem ({len(limpos)}) ---")
    for s, viva, _ in sorted(limpos, key=lambda x: (x[0]["unidade"], x[0]["conv"])):
        print(f"  [{s['unidade']}] {s['regra']} conv {s['conv']} · {viva.get('quem')}"
              f" · {viva.get('status')} · agente {viva.get('agente') or '—'}")


if __name__ == "__main__":
    main()
