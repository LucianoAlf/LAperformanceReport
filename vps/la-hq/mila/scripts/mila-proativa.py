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
    "/home/mila/.openclaw/secrets/chatwoot.env",        # CHATWOOT_BASE_URL / _ACCOUNT_ID / _BOT_TOKEN
]
HERMES_PY = "/home/mila/.hermes/hermes-agent/venv/bin/python"
HERMES_HOME = "/home/mila/.hermes/profiles/mila-consultor-readonly"  # o perfil das consultoras
LOG = "/home/mila/.openclaw/logs/mila-proativa.log"
# A caixa da Mila de cada unidade no Chatwoot. Enviar PELO CHATWOOT (e nao pela
# WAHA direto) e o que o proprio bridge faz: a mensagem entra na conversa, fica
# no historico e a consultora ve tudo num fio so. WAHA direto devolve 403 aqui —
# a chave do WAHA nesta VPS so serve para presence (typing).
INBOX_POR_UNIDADE = {"Barra": 147, "Recreio": 148, "Campo Grande": 155}
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


def _cw(method, path, body=None):
    base = os.environ["CHATWOOT_BASE_URL"].rstrip("/")
    url = f"{base}/api/v1/accounts/{os.environ['CHATWOOT_ACCOUNT_ID']}{path}"
    req = urllib.request.Request(url, data=(json.dumps(body).encode() if body is not None else None),
                                 headers={"api_access_token": os.environ["CHATWOOT_BOT_TOKEN"],
                                          "Content-Type": "application/json",
                                          # ⚠️ o proxy na frente do Chatwoot devolve 403 para o
                                          # User-Agent padrao do urllib (`Python-urllib/3.x`).
                                          # Medido em 04/09: mesma URL e mesmo token dao 200 no
                                          # curl e 403 no python — o que despista completamente,
                                          # porque parece problema de permissao do token.
                                          "User-Agent": "mila-proativa/1.0"}, method=method)
    with urllib.request.urlopen(req, timeout=60) as r:
        t = r.read().decode()
        return json.loads(t) if t else {}


def conversa_da_consultora(telefone, unidade_nome):
    """A conversa dela na caixa da Mila DA UNIDADE dela. Nunca cria conversa: se
    não existe, a pessoa nunca escreveu para aquela Mila e mandar do nada seria
    abrir conversa por conta própria."""
    inbox = INBOX_POR_UNIDADE[unidade_nome]
    achadas = []
    for c in (_cw("GET", f"/contacts/search?q={telefone}").get("payload") or []):
        if "".join(ch for ch in str(c.get("phone_number") or "") if ch.isdigit()) != telefone:
            continue
        for cv in (_cw("GET", f"/contacts/{c['id']}/conversations").get("payload") or []):
            if cv.get("inbox_id") == inbox:
                achadas.append(cv)
    if not achadas:
        raise RuntimeError(f"sem conversa na caixa {inbox} ({unidade_nome}) para {telefone}")
    return max(achadas, key=lambda cv: cv.get("last_activity_at") or 0)["id"]


def enviar(telefone, unidade_nome, texto):
    cid = conversa_da_consultora(telefone, unidade_nome)
    r = _cw("POST", f"/conversations/{cid}/messages",
            {"content": texto, "message_type": "outgoing", "private": False})
    return {"conversation_id": cid, "message_id": r.get("id")}


MOLDE_MANHA = """\
☀️ *BOM DIA, {apelido}* — {unidade}
_{dia_semana}, {data}_
━━━━━━━━━━━━━━━━━━━━━

🎯 *HOJE* · 3 experimentais · 1 visita

  ⏰ *09:00* — Flávia
     📍 _visita_

  ⏰ *10:00* — *Luci Machado Viegas*
     🎵 Canto · 👩‍🏫 Daiana Pacifico

━━━━━━━━━━━━━━━━━━━━━

🔥 *QUENTES AGORA* · 2

  • *Jullyane* — 15h só com o bot
    _entra na conversa e continua dali_

  • *Hetiene* — 12h só com o bot
    _entra na conversa e continua dali_

━━━━━━━━━━━━━━━━━━━━━

📌 *DE ONTEM* · 2 sem desfecho

  • *Luis Arthur* — Violão
  • *Anna Luisa* — Canto

━━━━━━━━━━━━━━━━━━━━━

⭐ *MATRICULADOR + LA*
  _Ticket Premiado_ — faltam *R$ 3* no ticket médio

━━━━━━━━━━━━━━━━━━━━━

_Quer que eu priorize os 2 quentes agora?_"""

MOLDE_FIM = """\
🌙 *FECHAMENTO — {apelido}* · {unidade}
_{dia_semana}, {data}_
━━━━━━━━━━━━━━━━━━━━━

📊 *O DIA* · 5 marcadas
  ✅ *4* aconteceram
  ❌ *1* falta
  🎓 *0* matrículas

━━━━━━━━━━━━━━━━━━━━━

✅ *ACONTECERAM*

  ⏰ 14:00 — *Luis Arthur*
     🎵 Violão · 👩‍🏫 Erick Cosme
     _sem desfecho ainda — normal no mesmo dia_

━━━━━━━━━━━━━━━━━━━━━

❌ *FALTOU*

  • *Sofia Mena* — Canto, 09:00
    _não remarcada · 2ª tentativa de 3_

━━━━━━━━━━━━━━━━━━━━━

📌 *FICA PRA AMANHÃ* · 3 sem desfecho

  • *Antonella Celino* — Canto
  • *Helena Guedes* — Canto

━━━━━━━━━━━━━━━━━━━━━

🗓️ *AMANHÃ* · 3 experimentais

  ⏰ 09:00 — *Thomás Matta Torres* · Teclado
  ⏰ 09:30 — *Laura Ribeiro* · Musicalização

━━━━━━━━━━━━━━━━━━━━━

⭐ _Ticket Premiado_ — faltam *R$ 17,50*

━━━━━━━━━━━━━━━━━━━━━

_Quer que eu já deixe os 3 na mira cedo?_"""

# dow do Postgres: 0 = domingo
DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"]


def envelope(tipo, dados, c):
    """O molde vai LITERAL no prompt.

    Instrução abstrata ("formato de WhatsApp, curto") produzia TEXTO CORRIDO, e o
    Luciano cortou em 04/09: "no fim de um dia cansativo a galera nem lê isso".
    Modelo segue exemplo muito melhor do que segue regra — então a régua é um
    exemplo pronto, com hierarquia, separadores e uma informação por linha.
    """
    rotulo = "manhã" if tipo == "manha" else "fim do dia"
    dia_semana = DIAS[int(dados.get("dow", 0)) % 7]
    molde = (MOLDE_MANHA if tipo == "manha" else MOLDE_FIM).format(
        apelido=c["apelido"].upper(), unidade=c["unidade_nome"],
        dia_semana=dia_semana, data=dados["data"][:5])
    if tipo == "manha":
        pedido = ("É de manhã. Escreva a mensagem que VOCÊ vai mandar agora no WhatsApp dela com o dia: "
                  "experimentais e visitas de hoje (hora, aluno, curso, professor), quem está quente agora, "
                  "quem ficou de ontem sem desfecho ou faltou e ainda dá para remarcar, e a estrela mais perto. "
                  "Se vier `reagendadas_para_outro_dia`, diga em uma linha para onde foram.")
    else:
        pedido = ("É fim do dia. Comece pelo TOTAL do dia (realizadas + faltas + canceladas) e a decomposição. "
                  "NUNCA escreva '0 experimentais' quando houve falta ou cancelamento: falta é experimental que "
                  "não aconteceu, não experimental que não existiu. Sem desfecho no mesmo dia é normal, não cobre. "
                  "Depois: quem faltou (remarcada? se `teto_atingido`, é para parar de insistir), matrículas de hoje, "
                  "quem é de dias anteriores e segue sem desfecho, e o que já está marcado para amanhã.")
    regras = (
        "FORMATO — siga este molde, ele é a régua da mensagem:\n"
        "<molde>\n" + molde + "\n</molde>\n"
        "Regras do molde: bloco sem conteúdo NÃO APARECE (nada de 'Pendências: nenhuma'); "
        "no máximo 4 itens por bloco, acima disso feche com `_+N_`; "
        "*negrito* com UM asterisco e _itálico_ com underscore (é WhatsApp, não markdown); "
        "nome de pessoa em negrito; o detalhe vai na linha de baixo, indentado; "
        "uma informação por linha, sem parágrafo corrido; "
        "campo sem valor SOME da linha — nunca escreva travessão nem `null` no lugar do curso ou do professor; "
        "o número do cabeçalho tem que ser o número de itens que você listou embaixo dele — na manhã conte o que AINDA VAI acontecer "
        "(`n_experimentais_ainda_agendadas`), e ponha cancelada/faltou como linha marcada, nunca dentro da contagem de \"tenho hoje\"; "
        "termine com UMA pergunta em itálico.\n"
        "CONTEÚDO: chame de " + c["apelido"] + "; use SÓ os nomes e números deste envelope, nunca invente; "
        "cada pessoa aparece uma vez só; a estrela diz em quê faltam (R$ 3 não é 3 matrículas), sem decimal inútil. "
        "Se `nada_para_hoje` for true, responda exatamente [SEM ENVIO] e nada mais. "
        "Responda SOMENTE com o texto da mensagem."
    )
    cab = "[MILA PROATIVA · " + rotulo + " · " + dados["data"] + "]"
    return cab + "\n" + pedido + "\n" + regras + "\n\nDADOS CANÔNICOS (json):\n" + json.dumps(dados, ensure_ascii=False)


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
            r = enviar(c["telefone"], c["unidade_nome"], texto)
            concluir(log_id, "ok", {"fase": "enviado", "texto": texto, "chatwoot": r, "dados": dados})
            log(f"{c['apelido']}: enviado ({len(texto)} chars)")
        except Exception as e:  # noqa: BLE001 — uma consultora não derruba as outras
            falhas += 1
            log(f"{c['apelido']}: ERRO {e}")
            if log_id:
                concluir(log_id, "erro", {"fase": "erro", "erro": str(e)[:500]})
    sys.exit(1 if falhas else 0)


if __name__ == "__main__":
    main()
