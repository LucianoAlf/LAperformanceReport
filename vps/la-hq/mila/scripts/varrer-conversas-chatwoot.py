#!/usr/bin/env python3
"""ESPELHA O ESTADO DAS CONVERSAS DO CHATWOOT NOS LEADS.

Existe por um achado da Daiana (06/09/2026): o relatorio diario manda "Ligar
HOJE, nao mandar mensagem" sobre leads que ela **ja fechou**. A regra R15
pergunta `motivo_nao_matricula is null` — olha o CRM. O desfecho dela mora no
Chatwoot, na conversa que ela resolve. Os dois nunca se falaram: a coluna
`leads.chatwoot_conversation_id` existia e estava **0 de 9.857 preenchida**.

O protocolo, nas palavras dela:

  "Quando tem alguma coisa ainda pra resolver, que da pra tentar resgatar, eu
   NAO resolvo a conversa — deixo ali ate pra eu nao esquecer daquele cliente.
   Quando eu ENCERRO e porque ja acabou o assunto."

Entao `aberta/resolvida` **e** declaracao de desfecho, e vale a regra que o Alf
enunciou: *"resolvida nao vem no relatorio; aberta vem a cobranca"*.

⚠️ NAO grava conteudo de mensagem. So metadado: status, quando mudou, quando foi
   a ultima mensagem e de quem veio. Espelho de conversa nao e arquivo dela.

⚠️ User-Agent OBRIGATORIO. O proxy na frente do Chatwoot devolve **403** para o
   `Python-urllib/3.x` padrao — mesma URL e mesmo token dao 200 no curl. Custou
   uma investigacao inteira em 04/09 porque parece erro de permissao.

⚠️ Le por `last_activity_at` decrescente e PARA na primeira pagina inteiramente
   fora da janela. Sem isso a varredura desce o historico todo a cada rodada.

  varrer-conversas-chatwoot.py [--dias 14] [--dry-run]
"""
import argparse
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

BRT = dt.timezone(dt.timedelta(hours=-3))
INBOXES = {"Barra": 147, "Recreio": 148, "Campo Grande": 155}
# ⚠️ MESMOS arquivos que a `mila-proativa.py` usa, e nao os da Sol: o user
#    `mila` nao le `/home/sol/.openclaw/secrets/`, e a falha aparece como
#    KeyError('CHATWOOT_BASE_URL'), que parece bug de codigo e nao de permissao.
ENV_FILES = [Path("/home/mila/.openclaw/secrets/mila-sdr-tools.env"),
             Path("/home/mila/.openclaw/secrets/chatwoot.env")]
MAX_PAGINAS = 40


def log(m):
    print(f"[{dt.datetime.now(BRT):%Y-%m-%d %H:%M:%S}] {m}", flush=True)


def carregar_env():
    for p in ENV_FILES:
        try:
            for l in p.read_text(encoding="utf-8").splitlines():
                l = l.strip()
                if l and not l.startswith("#") and "=" in l:
                    k, v = l.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
        except OSError:
            continue


def _cw(path):
    base = os.environ["CHATWOOT_BASE_URL"].rstrip("/")
    req = urllib.request.Request(
        f"{base}/api/v1/accounts/{os.environ['CHATWOOT_ACCOUNT_ID']}{path}",
        headers={"api_access_token": os.environ["CHATWOOT_BOT_TOKEN"],
                 "Content-Type": "application/json",
                 # ⚠️ ver cabecalho: sem isto o proxy devolve 403.
                 "User-Agent": "varrer-conversas/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        t = r.read().decode()
        return json.loads(t) if t else {}


def rpc(fn, args):
    url = (os.environ.get("SUPABASE_LAREPORT_URL")
           or os.environ.get("LA_REPORT_SUPABASE_URL") or os.environ.get("SUPABASE_URL"))
    key = (os.environ.get("SUPABASE_LAREPORT_SERVICE_KEY")
           or os.environ.get("LA_REPORT_SERVICE_ROLE_KEY")
           or os.environ.get("SUPABASE_SERVICE_ROLE_KEY"))
    req = urllib.request.Request(
        f"{url.rstrip('/')}/rest/v1/rpc/{fn}", data=json.dumps(args).encode(),
        headers={"apikey": key, "Authorization": f"Bearer {key}",
                 "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=60) as r:
        t = r.read().decode()
        return json.loads(t) if t else None


def quem_falou(conversa):
    """`cliente` ou `equipe`, pela ultima mensagem que nao e evento de sistema.

    ⚠️ `message_type` 2 e ATIVIDADE ("conversa resolvida por Fulano") e nao conta
    como fala de ninguem — por isso o Chatwoot separa em
    `last_non_activity_message`."""
    m = conversa.get("last_non_activity_message") or {}
    t = m.get("message_type")
    if t == 0:
        return "cliente"
    if t == 1:
        return "equipe"
    return None


def varrer(dias, dry):
    corte = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=dias)
    itens, lidas = [], 0

    for unidade, inbox in INBOXES.items():
        paginas_vazias = 0
        for pagina in range(1, MAX_PAGINAS + 1):
            try:
                r = _cw(f"/conversations?inbox_id={inbox}&status=all"
                        f"&sort_by=last_activity_at_desc&page={pagina}")
            except (urllib.error.URLError, OSError, KeyError) as e:
                log(f"{unidade}: falha na pagina {pagina} ({e}) — sigo para a proxima caixa")
                break

            lote = ((r.get("data") or {}).get("payload")
                    or r.get("payload") or [])
            if not lote:
                break

            dentro = 0
            for c in lote:
                lidas += 1
                ts = c.get("last_activity_at") or 0
                quando = dt.datetime.fromtimestamp(ts, dt.timezone.utc) if ts else None
                if quando and quando < corte:
                    continue
                dentro += 1
                tel = ((c.get("meta") or {}).get("sender") or {}).get("phone_number")
                if not tel:
                    continue
                msg = c.get("last_non_activity_message") or {}
                itens.append({
                    "telefone": tel,
                    "conversation_id": c.get("id"),
                    "status": c.get("status"),
                    "status_em": quando.isoformat() if quando else None,
                    "ultima_msg_em": (dt.datetime.fromtimestamp(
                        msg["created_at"], dt.timezone.utc).isoformat()
                        if msg.get("created_at") else None),
                    "ultima_msg_de": quem_falou(c),
                })

            # ⚠️ Para quando a pagina inteira ja saiu da janela: as conversas vem
            #    em ordem decrescente de atividade, entao dali para tras e tudo
            #    mais velho. Sem isto a varredura desce o historico todo.
            if dentro == 0:
                paginas_vazias += 1
                if paginas_vazias >= 1:
                    break

    log(f"{lidas} conversas lidas · {len(itens)} dentro da janela de {dias} dias")
    if dry:
        por_status = {}
        for i in itens:
            por_status[i["status"]] = por_status.get(i["status"], 0) + 1
        log(f"DRY-RUN — nada gravado. Por status: {por_status}")
        return 0

    # lotes de 200 para nao montar um jsonb gigante numa chamada so
    tocados = sem_lead = 0
    for i in range(0, len(itens), 200):
        r = rpc("registrar_espelho_chatwoot_v1", {"p_itens": itens[i:i + 200]}) or {}
        tocados += r.get("tocados") or 0
        sem_lead += r.get("sem_lead") or 0
    log(f"espelho atualizado: {tocados} leads · {sem_lead} conversas sem lead correspondente")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dias", type=int, default=14)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    carregar_env()
    return varrer(a.dias, a.dry_run)


if __name__ == "__main__":
    sys.exit(main())
