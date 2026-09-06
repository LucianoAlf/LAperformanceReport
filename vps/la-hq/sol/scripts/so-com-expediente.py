#!/usr/bin/env python3
"""SÓ RODA SE A ESCOLA ABRIR HOJE — guard de expediente para os crons da Sol.

Uso (sempre DEPOIS do `flock` e DEPOIS do `cron-alerta.py <job>`):

    so-com-expediente.py [--unidade barra|recreio|cg] -- <comando...>

Existe porque 07/09/2026 (Independência, numa segunda) mostrou o buraco: os
crons da Sol abririam e fechariam caixa, mandariam relatório admin e comercial
nos 3 grupos e o aviso prévio — tudo num dia em que a escola está fechada. O
cron sabe pular domingo (`* * 1-6`), mas não sabe o que é feriado, e ninguém
vai lembrar de cadastrar recesso todo semestre.

🔴 A FONTE É A GRADE, não uma tabela de feriado: a RPC `escola_agenda_v1`
   compara as aulas vivas do dia com a mediana do mesmo dia da semana nas 8
   semanas anteriores. Medido em 07/09/2026: **1 aula viva contra um típico de
   319**. Cobre feriado, recesso escolar e ponte com a mesma regra.

⚠️ FALHA PARA RODAR, NUNCA PARA PULAR. Se a RPC não responde, se a data não tem
   base de comparação (`tem_expediente = null`), ou se qualquer coisa dá erro,
   o comando **roda**. O dano dos dois lados não é simétrico: um relatório a
   mais num feriado é ruído; um caixa que não abriu num dia útil quebra o dia
   inteiro da unidade — e ninguém percebe que algo NÃO aconteceu.

⚠️ Sai com **0** ao pular, de propósito: o `cron-alerta.py` transforma exit
   diferente de zero em alarme no Telegram, e pular no feriado é o
   comportamento correto, não uma falha.

⚠️ O que NÃO deve usar este guard: backup diário e fechamento mensal (dia 1
   pode cair em feriado e o mês precisa fechar do mesmo jeito), além dos
   watchers de 1 minuto.
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

BRT = timezone(timedelta(hours=-3))
ENV_CANDIDATES = [
    Path("/opt/LA-Organizer/.env"),
    Path("/home/sol/.openclaw/gateway.systemd.env"),
]
FALLBACK_URL = "https://ouqwbbermlzqqvtqwlul.supabase.co"

# slug -> pedaço do nome da unidade em `unidades`
SLUGS = {"barra": "barra", "recreio": "recreio", "cg": "campo grande",
         "campo-grande": "campo grande"}


def log(msg):
    print(f"[{datetime.now(BRT):%Y-%m-%d %H:%M:%S}] expediente: {msg}", flush=True)


def carregar_env():
    env = {}
    for p in ENV_CANDIDATES:
        try:
            for linha in p.read_text(encoding="utf-8").splitlines():
                linha = linha.strip()
                if not linha or linha.startswith("#") or "=" not in linha:
                    continue
                k, v = linha.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
        except OSError:
            continue
    url = (env.get("LA_REPORT_SUPABASE_URL") or env.get("SUPABASE_URL")
           or os.environ.get("SUPABASE_URL") or FALLBACK_URL)
    key = (env.get("LA_REPORT_SERVICE_ROLE_KEY") or env.get("SUPABASE_SERVICE_ROLE_KEY")
           or env.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY"))
    return url.rstrip("/"), key


def _post(url, key, caminho, corpo):
    req = urllib.request.Request(
        f"{url}{caminho}", data=json.dumps(corpo).encode(),
        headers={"apikey": key, "Authorization": f"Bearer {key}",
                 "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode() or "null")


def _get(url, key, caminho):
    req = urllib.request.Request(
        f"{url}{caminho}", headers={"apikey": key, "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode() or "null")


def unidade_id(url, key, slug):
    """Resolve o slug para o uuid. Devolve None se não achar — e None faz a
    consulta ser da REDE, que é o comportamento certo para feriado nacional."""
    alvo = SLUGS.get(slug.lower())
    if not alvo:
        log(f"slug '{slug}' desconhecido — consulto a rede inteira")
        return None
    linhas = _get(url, key, f"/rest/v1/unidades?select=id,nome&nome=ilike.*{alvo.replace(' ', '%20')}*")
    if not linhas:
        log(f"nenhuma unidade casou com '{alvo}' — consulto a rede inteira")
        return None
    if len(linhas) > 1:
        log(f"'{alvo}' casou com {len(linhas)} unidades — consulto a rede inteira")
        return None
    return linhas[0]["id"]


def main():
    argv = sys.argv[1:]
    slug = None
    data = None
    # ⚠️ `--data` existe para PROVAR o guard contra um feriado conhecido sem
    #    esperar o dia chegar. Nenhum cron passa esse argumento.
    while argv and argv[0] in ("--unidade", "--data"):
        if argv[0] == "--unidade":
            slug = argv[1] if len(argv) > 1 else None
        else:
            data = argv[1] if len(argv) > 1 else None
        argv = argv[2:]
    if argv and argv[0] == "--":
        argv = argv[1:]
    if not argv:
        print("uso: so-com-expediente.py [--unidade barra|recreio|cg] -- <comando...>",
              file=sys.stderr)
        return 2

    hoje = data or datetime.now(BRT).strftime("%Y-%m-%d")
    try:
        url, key = carregar_env()
        if not key:
            raise RuntimeError("sem service role key")
        uid = unidade_id(url, key, slug) if slug else None
        r = _post(url, key, "/rest/v1/rpc/escola_agenda_v1",
                  {"p_de": hoje, "p_ate": hoje, "p_unidade_id": uid})
        d = (r or [{}])[0] if isinstance(r, list) else {}
        tem = d.get("tem_expediente")
        if tem is False:
            log(f"{hoje}: SEM EXPEDIENTE ({d.get('aulas_vivas')} aula(s) viva(s) "
                f"contra tipico {d.get('tipico')}) — nao rodo `{argv[0]}`")
            return 0
        if tem is None:
            log(f"{hoje}: nao sei dizer ({d.get('situacao')}) — rodo assim mesmo")
    except (urllib.error.URLError, OSError, ValueError, RuntimeError, KeyError) as e:
        # ⚠️ Erro NUNCA vira pulo: ver o cabeçalho. Melhor ruído que buraco.
        log(f"{hoje}: falha ao consultar a agenda ({e}) — rodo assim mesmo")

    return subprocess.call(argv)


if __name__ == "__main__":
    sys.exit(main())
