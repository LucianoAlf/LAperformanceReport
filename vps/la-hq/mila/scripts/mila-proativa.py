#!/usr/bin/env python3
"""mila-proativa.py — a Mila MANDA (manhã / fim do dia) para cada consultora.

Por que roda DENTRO da sessão dela com a consultora (e não dispara texto por fora):
o Luciano exigiu (04/09) que a Mila SAIBA o que enviou — se a Vitória responder
"não é nada disso", a Mila tem que saber do que se trata. Então este cron faz
exatamente o que o chatwoot-mila-bridge.js faz a cada mensagem: sobe o Hermes na
sessão `chatwoot-consultor-v2-<telefone>` (perfil mila-consultor-readonly, carimbo
por env) com um envelope [MILA PROATIVA · …] + os dados canônicos da RPC, e o que
a Mila escreve vai para o WhatsApp dela pela WAHA da unidade. A próxima mensagem
da consultora cai na MESMA sessão pelo bridge — contexto intacto.

Determinístico (RPC): o que entra e se há algo a dizer (`nada_para_hoje`).
LLM: só a redação. Uma vez por (tipo, consultora, dia) — reserva em
automacao_log.idempotency_key ANTES de rodar (padrão LAPE-21: cron vira 2-4
execuções). Silêncio > ruído: sem dado, sem mensagem.

Uso:  mila-proativa.py --tipo manha|fim_do_dia [--dry-run] [--so TELEFONE] [--data YYYY-MM-DD]
Cron (user mila, VPS em UTC):  30 11 * * 1-6 (08:30 BRT)  ·  30 21 * * 1-6 (18:30 BRT)
"""
import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

SECRETS = [
    "/home/mila/.openclaw/secrets/mila-sdr-tools.env",  # SUPABASE_LAREPORT_URL / _SERVICE_KEY
    "/home/mila/.openclaw/secrets/waha.env",            # WAHA_BASE_URL / WAHA_API_KEY / WAHA_SESSION_*
]
HERMES_PY = "/home/mila/.hermes/hermes-agent/venv/bin/python"
HERMES_HOME = "/home/mila/.hermes/profiles/mila-consultor-readonly"  # o perfil das consultoras
LOG = "/home/mila/.openclaw/logs/mila-proativa.log"
WAHA_SESSAO_POR_UNIDADE = {"Campo Grande": "WAHA_SESSION_CG", "Recreio": "WAHA_SESSION_RECREIO", "Barra": "WAHA_SESSION_BARRA"}
BRT = dt.timezone(dt.timedelta(hours=-3))


def log(msg):
    linha = f"[{dt.datetime.now(BRT).strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(linha, flush=True)
    try:
        with open(LOG, "a", encoding="utf-8") as fh:
            fh.write(linha + "\n")
    except OSError:
        pass


def load_env():
    for f in SECRETS:
        with open(f, encoding="utf-8") as fh:
            for ln in fh:
                ln = ln.strip()
                if not ln or ln.startswith("#") or "=" not in ln:
                    continue
                k, v = ln.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def rest(method, path, body=None, prefer=None):
    url = os.environ["SUPABASE_LAREPORT_URL"].rstrip("/") + path
    key = os.environ["SUPABASE_LAREPORT_SERVICE_KEY"]
    h = {"apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json"}
    if prefer:
        h["Prefer"] = prefer
    req = urllib.request.Request(url, data=(json.dumps(body).encode() if body is not None else None), headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            t = r.read().decode()
            return r.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]


def rpc(fn, args):
    st, b = rest("POST", f"/rest/v1/rpc/{fn}", args)
    if st != 200:
        raise RuntimeError(f"rpc {fn} -> {st}: {b}")
    return b


def reservar(key, c, tipo):
    """Toma a vez ANTES de gastar LLM/WhatsApp. 409 = outra execução já pegou."""
    st, b = rest("POST", "/rest/v1/automacao_log", {
        "idempotency_key": key, "evento": "mila_proativa", "acao": tipo, "status": "warn",
        "aluno_nome": c["nome"], "unidade_nome": c["unidade_nome"], "detalhes": {"fase": "reservado"},
    }, "return=representation")
    if st == 201:
        return b[0]["id"]
    if st == 409:
        return None
    raise RuntimeError(f"reserva -> {st}: {b}")


def concluir(log_id, status, detalhes):
    rest("PATCH", f"/rest/v1/automacao_log?id=eq.{log_id}", {"status": status, "detalhes": detalhes}, "return=minimal")


def hermes(prompt, sessao, env_extra):
    """Mesmo spawn do bridge (runHermesMeta): --continue <sessao>; se não existe, cria e batiza."""
    env = {**os.environ, "HOME": "/home/mila", "HERMES_HOME": HERMES_HOME, **env_extra}
    base = [HERMES_PY, "-m", "hermes_cli.main", "chat", "-Q", "-q", prompt, "--source", "tool"]

    def run(args, t=240):
        p = subprocess.run(args, cwd="/home/mila", env=env, capture_output=True, text=True, timeout=t)
        return p.returncode, p.stdout.strip(), p.stderr.strip()

    code, out, err = run(base + ["--continue", sessao])
    if code != 0 and re.search(r"No session found matching", out + err, re.I):
        code, out, err = run(base)
        if code != 0:
            raise RuntimeError(f"hermes_exit_{code}: {err[:400]}")
        m = re.search(r"^session_id:\s*(\S+)", out + "\n" + err, re.M)
        if m:
            rc, _, rerr = run([HERMES_PY, "-m", "hermes_cli.main", "sessions", "rename", m.group(1), sessao], 30)
            if rc != 0:
                log(f"aviso: rename da sessao falhou ({rerr[:120]})")
    elif code != 0:
        raise RuntimeError(f"hermes_exit_{code}: {err[:400]}")
    return "\n".join(l for l in out.splitlines() if not l.startswith("session_id:")).strip()


def waha_enviar(sessao_waha, telefone, texto):
    base = os.environ["WAHA_BASE_URL"].rstrip("/")
    req = urllib.request.Request(base + "/api/sendText",
                                 data=json.dumps({"session": sessao_waha, "chatId": f"{telefone}@c.us", "text": texto}).encode(),
                                 headers={"X-Api-Key": os.environ["WAHA_API_KEY"], "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode() or "{}")


def envelope(tipo, dados, c):
    rotulo = "manhã" if tipo == "manha" else "fim do dia"
    cab = f"[MILA PROATIVA · {rotulo} · {dados['data']}]"
    if tipo == "manha":
        pedido = (f"É de manhã. Escreva a mensagem que VOCÊ vai mandar agora no WhatsApp da {c['apelido']} "
                  f"({c['nome']}, {c['unidade_nome']}) com o dia dela: experimentais e visitas de hoje (hora, aluno, curso, professor), "
                  f"quem ficou de ontem sem desfecho ou faltou e ainda dá para remarcar, quem está quente agora, "
                  f"e a estrela mais perto do MATRICULADOR + LA.")
    else:
        pedido = (f"É fim do dia. Escreva a mensagem que VOCÊ vai mandar agora no WhatsApp da {c['apelido']} "
                  f"({c['nome']}, {c['unidade_nome']}) fechando o dia: quem fez experimental hoje (quantos e quem — sem desfecho no MESMO dia "
                  f"é normal, não cobre), faltas de hoje (remarcada ou não; se `teto_atingido`, é para parar de insistir), matrículas de hoje, "
                  f"quem é de DIAS ANTERIORES e ainda está sem desfecho (`fica_para_amanha`), `pendencias_de_hoje` (curso/canal vazio que ela "
                  f"resolve comigo em uma linha) e o que já está marcado para amanhã.")
    regras = (f"Regras: chame pelo nome ({c['apelido']}); use SÓ os números e nomes deste envelope — nada de inventar; "
              "curto (até ~10 linhas), direto, tom de parceira; formato de WhatsApp (*negrito*, quebras de linha, sem tabelas, sem markdown de título); "
              "cada nome aparece UMA vez (não repita a mesma pessoa em dois blocos); lista com ATÉ 5 itens vai inteira; só acima de 5 vira contagem + 3 exemplos; experimentais e visitas de hoje SEMPRE com hora, curso e professor (é a agenda dela); "
              "`quentes_agora` NUNCA vira só um número: é nome (`quem`) + `o_que_houve` + o que fazer, um por linha — é a parte mais urgente da mensagem; "
              "bloco vazio simplesmente não aparece (nada de 'Pendências: nenhuma'); a estrela diz em quê faltam, em português natural ('faltam R$ 3 no ticket médio', 'faltam 2 matrículas'), sem decimal inútil; negrito de WhatsApp é UM asterisco (*assim*), nunca dois; "
              "termine com UMA pergunta ou UM próximo passo, nunca uma lista de cobranças. "
              "Se `nada_para_hoje` for true, responda exatamente [SEM ENVIO] e nada mais. "
              "Responda SOMENTE com o texto da mensagem, sem comentário antes ou depois.")
    return f"{cab}\n{pedido}\n{regras}\n\nDADOS CANÔNICOS (json):\n{json.dumps(dados, ensure_ascii=False)}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tipo", choices=["manha", "fim_do_dia"], required=True)
    ap.add_argument("--dry-run", action="store_true", help="não reserva, não envia; roda o Hermes numa sessão de ensaio")
    ap.add_argument("--so", help="telefone de UMA consultora")
    ap.add_argument("--data", help="YYYY-MM-DD (default: hoje BRT)")
    a = ap.parse_args()
    load_env()
    hoje = a.data or dt.datetime.now(BRT).strftime("%Y-%m-%d")
    fn = "mila_briefing_manha_v1" if a.tipo == "manha" else "mila_fechamento_dia_v1"
    consultoras = rpc("mila_consultoras_ativas_v1", {})
    log(f"== {a.tipo} {hoje} · {len(consultoras)} consultora(s){' · DRY-RUN' if a.dry_run else ''}")
    falhas = 0
    for c in consultoras:
        if a.so and c["telefone"] != a.so:
            continue
        key = f"mila_proativa|{a.tipo}|{c['telefone']}|{hoje}"
        log_id = None
        if not a.dry_run:
            log_id = reservar(key, c, a.tipo)
            if log_id is None:
                log(f"{c['apelido']}: já tratado hoje ({key}) — pulo")
                continue
        try:
            dados = rpc(fn, {"p_solicitante_telefone": c["telefone"], "p_data": hoje})
            if not dados.get("ok"):
                raise RuntimeError(f"rpc nao ok: {dados}")
            if dados.get("nada_para_hoje"):
                log(f"{c['apelido']}: nada para hoje — sem envio")
                if log_id:
                    concluir(log_id, "ok", {"fase": "sem_envio", "motivo": "nada_para_hoje", "dados": dados})
                continue
            # DRY-RUN nunca toca a sessão real da consultora (senão o ensaio vira contexto dela)
            sessao = f"chatwoot-consultor-v2-{c['telefone']}" if not a.dry_run else f"mila-proativa-ensaio-{c['telefone']}"
            env_extra = {"MILA_CONSULTOR_NOME": c["nome"], "MILA_CONSULTOR_TELEFONE": c["telefone"],
                         "MILA_CONSULTOR_UNIDADE": c["unidade_nome"], "MILA_PROATIVA": a.tipo}
            if a.dry_run:
                env_extra["MILA_GESTAO_DRY_RUN"] = "1"
            texto = hermes(envelope(a.tipo, dados, c), sessao, env_extra)
            if not texto or "[SEM ENVIO]" in texto:
                log(f"{c['apelido']}: a Mila decidiu não enviar")
                if log_id:
                    concluir(log_id, "ok", {"fase": "sem_envio", "motivo": "modelo", "dados": dados})
                continue
            if a.dry_run:
                log(f"--- {c['apelido']} ({c['unidade_nome']}) [DRY-RUN — nada enviado] ---\n{texto}\n")
                continue
            r = waha_enviar(os.environ[WAHA_SESSAO_POR_UNIDADE[c["unidade_nome"]]], c["telefone"], texto)
            concluir(log_id, "ok", {"fase": "enviado", "texto": texto, "waha": str(r)[:200], "dados": dados})
            log(f"{c['apelido']}: enviado ({len(texto)} chars)")
        except Exception as e:  # noqa: BLE001 — uma consultora não derruba as outras
            falhas += 1
            log(f"{c['apelido']}: ERRO {e}")
            if log_id:
                concluir(log_id, "erro", {"fase": "erro", "erro": str(e)[:500]})
    sys.exit(1 if falhas else 0)


if __name__ == "__main__":
    main()
