#!/usr/bin/env python3
"""mila-alerta-falhas.py — avisa no Telegram quando a Mila falha com uma pessoa.

Existe por causa de 04/09/2026: a Daiana, a Kailane e a Vitória escreveram entre
15:23 e 15:37, o gatilho pegou (`consultor_acordou`), o Hermes morreu em
`hermes_exit_1` e as três ficaram no vácuo. O bridge registrou `reply_error` no
log e seguiu — **ninguém foi avisado**. Só descobrimos porque o Luciano olhou o
WhatsApp mais de uma hora depois.

Vigia dois defeitos, ambos do ponto de vista de QUEM ESCREVEU:
  1. `reply_error`      — a Mila tentou responder e falhou.
  2. acordou e calou    — houve `consultor_acordou` e nenhum `reply_sent` para a
                          mesma mensagem dentro da janela (default 6 min).
E, de quebra, o bridge fora do ar.

Regras de ruído (mesmas do cron-alerta.py da Sol, que já provou funcionar):
  · erro novo posta na hora;
  · erro repetido volta 1x por dia, com contador;
  · quando volta a responder, posta uma linha de recuperação;
  · nada acontecendo = silêncio absoluto.

Uso:  mila-alerta-falhas.py [--dry-run] [--janela-min 6] [--desde-min 60]
Cron (user mila): */5 * * * *
"""
import argparse
import datetime as dt
import json
import os
import subprocess
import urllib.error
import urllib.request

LOG_BRIDGE = "/home/mila/.openclaw/logs/chatwoot-mila-bridge.log"
ESTADO = "/home/mila/.openclaw/memory/mila-alerta-falhas.json"
LOG_PROPRIO = "/home/mila/.openclaw/logs/mila-alerta-falhas.log"
SECRETS_DIR = "/home/mila/.openclaw/secrets"
THREAD_LOGS = 603  # tópico "Logs" do grupo Mila Core (criado em 04/09/2026)
INBOX_UNIDADE = {"147": "Barra", "148": "Recreio", "155": "Campo Grande"}
MIN_ANTES_DE_DIZER_QUE_VOLTOU = 20  # minutos calados antes de postar o "voltou"
BRT = dt.timezone(dt.timedelta(hours=-3))


def log(msg):
    linha = f"[{dt.datetime.now(BRT):%Y-%m-%d %H:%M:%S}] {msg}"
    print(linha, flush=True)
    try:
        with open(LOG_PROPRIO, "a", encoding="utf-8") as fh:
            fh.write(linha + "\n")
    except OSError:
        pass


def load_env():
    for nome in sorted(os.listdir(SECRETS_DIR)):
        if not nome.endswith(".env"):
            continue
        try:
            with open(os.path.join(SECRETS_DIR, nome), encoding="utf-8") as fh:
                for ln in fh:
                    ln = ln.strip()
                    if not ln or ln.startswith("#") or "=" not in ln:
                        continue
                    k, v = ln.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
        except OSError:
            pass


def telegram(texto):
    tok, chat = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_MILA_CORE_CHAT_ID")
    if not tok or not chat:
        log("sem TELEGRAM_BOT_TOKEN/CHAT_ID — nao enviei")
        return False
    body = json.dumps({"chat_id": int(chat), "message_thread_id": THREAD_LOGS,
                       "text": texto, "parse_mode": "HTML"}).encode()
    req = urllib.request.Request(f"https://api.telegram.org/bot{tok}/sendMessage", data=body,
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode()).get("ok", False)
    except urllib.error.HTTPError as e:
        log(f"telegram HTTP {e.code}: {e.read().decode()[:200]}")
        return False


def chatwoot(path):
    """⚠️ User-Agent obrigatório: o proxy do Chatwoot devolve 403 para o padrão do
    urllib (`Python-urllib/3.x`) — mesma URL e token dão 200 no curl."""
    base = os.environ.get("CHATWOOT_BASE_URL", "").rstrip("/")
    acc, tok = os.environ.get("CHATWOOT_ACCOUNT_ID"), os.environ.get("CHATWOOT_BOT_TOKEN")
    if not (base and acc and tok):
        return None
    req = urllib.request.Request(f"{base}/api/v1/accounts/{acc}{path}",
                                 headers={"api_access_token": tok, "User-Agent": "mila-alerta/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode())
    except Exception:  # noqa: BLE001 — enriquecer é bônus, nunca motivo de não alarmar
        return None


def quem_e(conversation_id, cache):
    if conversation_id in cache:
        return cache[conversation_id]
    d = chatwoot(f"/conversations/{conversation_id}") or {}
    s = (d.get("meta") or {}).get("sender") or {}
    quem = {"nome": s.get("name") or "?", "telefone": s.get("phone_number") or "?",
            "unidade": INBOX_UNIDADE.get(str(d.get("inbox_id")), f"inbox {d.get('inbox_id')}")}
    cache[conversation_id] = quem
    return quem


def ler_estado():
    try:
        with open(ESTADO, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {"visto_ate": None, "assinaturas": {}, "em_falha": False}


def salvar_estado(e):
    os.makedirs(os.path.dirname(ESTADO), exist_ok=True)
    tmp = ESTADO + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(e, fh, ensure_ascii=False, indent=1)
    os.replace(tmp, ESTADO)


def eventos(desde_min):
    """Lê só a cauda do log (ele é grande e cresce o dia inteiro)."""
    corte = dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=desde_min)
    out = []
    try:
        with open(LOG_BRIDGE, "rb") as fh:
            fh.seek(0, os.SEEK_END)
            tam = fh.tell()
            fh.seek(max(0, tam - 4_000_000))
            bruto = fh.read().decode("utf-8", "replace")
    except OSError as e:
        log(f"nao consegui ler o log do bridge: {e}")
        return out
    for ln in bruto.splitlines():
        ln = ln.strip()
        if not ln.startswith("{"):
            continue
        try:
            d = json.loads(ln)
        except ValueError:
            continue
        ts = d.get("ts")
        if not ts:
            continue
        try:
            q = dt.datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except ValueError:
            continue
        if q >= corte:
            d["_ts"] = q
            out.append(d)
    return out


def bridge_vivo():
    try:
        r = subprocess.run(["systemctl", "is-active", "chatwoot-mila-bridge"],
                           capture_output=True, text=True, timeout=15)
        return r.stdout.strip() == "active"
    except Exception:  # noqa: BLE001
        return True  # na dúvida não alarma: falso alarme de servico ensina a ignorar o canal


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--janela-min", type=int, default=6,
                    help="quanto espero por uma resposta antes de chamar de vacuo")
    ap.add_argument("--desde-min", type=int, default=60)
    a = ap.parse_args()
    load_env()
    st = ler_estado()
    hoje = dt.datetime.now(BRT).strftime("%Y-%m-%d")
    agora = dt.datetime.now(dt.timezone.utc)
    evs = eventos(a.desde_min)

    respondidas = {e.get("message_id") for e in evs if e.get("event") == "reply_sent"}
    falhas = []

    for e in evs:
        if e.get("event") == "reply_error":
            falhas.append(("erro", e, str(e.get("error", ""))[:200]))
        elif e.get("event") == "consultor_acordou":
            # só é vácuo depois da janela: resposta demora (o Hermes leva minutos)
            if e["_ts"] < agora - dt.timedelta(minutes=a.janela_min) and e.get("message_id") not in respondidas:
                falhas.append(("vacuo", e, f"acordou as {e['_ts'].astimezone(BRT):%H:%M} e nao respondeu"))

    novas, cache = [], {}
    for tipo, e, detalhe in falhas:
        chave = f"{tipo}|{e.get('conversation_id')}|{e.get('message_id')}"
        if chave in st["assinaturas"]:
            continue
        st["assinaturas"][chave] = hoje
        novas.append((tipo, e, detalhe, quem_e(e.get("conversation_id"), cache)))

    # limpa assinaturas de dias anteriores (o arquivo nao pode crescer para sempre)
    st["assinaturas"] = {k: v for k, v in st["assinaturas"].items() if v == hoje}

    if not bridge_vivo():
        novas.append(("servico", {}, "chatwoot-mila-bridge NAO esta ativo", {}))

    if novas:
        linhas = ["🔴 <b>A Mila deixou gente sem resposta</b>", ""]
        for tipo, e, detalhe, quem in novas:
            if tipo == "servico":
                linhas.append(f"• <b>bridge fora do ar</b> — {detalhe}")
                continue
            cid = e.get("conversation_id")
            rot = "falhou ao responder" if tipo == "erro" else "não respondeu"
            linhas.append(f"• <b>{quem.get('nome','?')}</b> ({quem.get('unidade','?')}) — {rot}")
            linhas.append(f"  {detalhe}")
            linhas.append(f"  conversa {cid} · {os.environ.get('CHATWOOT_BASE_URL','')}/app/accounts/"
                          f"{os.environ.get('CHATWOOT_ACCOUNT_ID','')}/conversations/{cid}")
        linhas += ["", "Para a Mila voltar e responder o que ficou pendente:",
                   "<code>mila-responder-pendente.py --telefone &lt;tel&gt; --quando HH:MM --pergunta \"...\"</code>"]
        texto = "\n".join(linhas)
        if a.dry_run:
            log("[DRY-RUN] enviaria:\n" + texto)
        else:
            telegram(texto)
            log(f"alarme enviado: {len(novas)} ocorrencia(s)")
        st["em_falha"] = True
        st["ultimo_alarme_em"] = agora.isoformat()
    elif st.get("em_falha"):
        # so declaro recuperacao depois de um tempo calado. Sem isso o alarme e o
        # "voltou" saem no mesmo minuto (aconteceu no 1o teste) e o par vira ruido
        # — que e exatamente o que faz alguem parar de ler o canal.
        try:
            desde = dt.datetime.fromisoformat(st.get("ultimo_alarme_em", ""))
        except (TypeError, ValueError):
            desde = None
        if desde is not None and agora - desde < dt.timedelta(minutes=MIN_ANTES_DE_DIZER_QUE_VOLTOU):
            log("sem falhas novas, mas o alarme e recente — ainda nao declaro recuperacao")
        else:
            if not a.dry_run:
                telegram("✅ <b>Mila</b> — voltou a responder normalmente.")
            log("recuperacao registrada")
            st["em_falha"] = False
    else:
        log("nada a reportar")

    if not a.dry_run:
        salvar_estado(st)


if __name__ == "__main__":
    main()
