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
import urllib.parse
import urllib.request

SECRETS = [
    "/home/mila/.openclaw/secrets/mila-sdr-tools.env",  # SUPABASE_LAREPORT_URL / _SERVICE_KEY
    "/home/mila/.openclaw/secrets/chatwoot.env",        # CHATWOOT_BASE_URL / _ACCOUNT_ID / _BOT_TOKEN
]
HERMES_PY = "/home/mila/.hermes/hermes-agent/venv/bin/python"
# 09/09/2026 - fusao dos perfis: o Modo Consultor inteiro passou a viver na raiz.
# 🔴 ESTA LINHA TEM DE VIRAR JUNTO COM O BRIDGE. A sessao e a MESMA
# (`chatwoot-consultor-v2-<telefone>`), mas cada perfil tem seu proprio
# state.db: com o cron num perfil e o bridge no outro, a Mila mandaria o briefing
# de um lado e leria a resposta do outro -- sem saber do que ela mesma falou. Foi
# exatamente o que o Luciano exigiu em 04/09 que nao acontecesse, e nao levantaria
# erro nenhum. O mila-cutucada.py importa este modulo e herda a constante.
HERMES_HOME = "/home/mila/.hermes"  # o perfil unico do Modo Consultor
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


# ── Topico "Cutucadas" (Mila Core) ───────────────────────────────────────────
# Onde o que a Mila fala SEM ser chamada fica VISIVEL. Ate 09/09/2026 o unico
# rastro era o arquivo de log acima, e ninguem abre arquivo de log: de fora,
# "nao tinha nada para cutucar" e "o cron morreu" eram os dois silencio.
TG_CHAT = "-1004293331642"      # Mila Core
TG_TOPICO = "626"               # topico Cutucadas
TG_ENV = "/home/mila/.hermes/.env"


def _tg_token():
    try:
        with open(TG_ENV, encoding="utf-8") as fh:
            for linha in fh:
                m = re.match(r"\s*TELEGRAM_BOT_TOKEN\s*=\s*(.+)", linha)
                if m:
                    return m.group(1).strip().strip('"').strip("'")
    except OSError:
        pass
    return None


def postar_topico(texto):
    """Publica no topico Cutucadas. NUNCA levanta.

    ⚠️ Instrumentacao nao pode derrubar o observado: perder o registro e
    aceitavel, perder a cutucada nao. Mesmo principio do followup-metricas.sh.

    ⚠️ O token vai no CORPO do POST, nunca em argv -- a mensagem carrega nome de
    lead real, e argv aparece inteiro no `ps`.

    ⚠️ A API do Telegram devolve HTTP 200 com `ok:false`. Quem checa so o status
    conclui que enviou quando nao enviou -- ja aconteceu no fiscal do Modo
    Consultor. Aqui se le o CORPO.
    """
    token = _tg_token()
    if not token:
        log("topico Cutucadas: TELEGRAM_BOT_TOKEN nao encontrado")
        return False
    dados = urllib.parse.urlencode({
        "chat_id": TG_CHAT,
        "message_thread_id": TG_TOPICO,
        "text": texto[:4000],
        "disable_web_page_preview": "true",
    }).encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=dados, headers={"User-Agent": "mila-proativa/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            corpo = json.loads(r.read().decode("utf-8", "replace"))
        if not corpo.get("ok"):
            log(f"topico Cutucadas recusou: {str(corpo)[:200]}")
            return False
        return True
    except Exception as e:  # noqa: BLE001 -- ver docstring
        log(f"topico Cutucadas falhou ({e}) — o envio ao WhatsApp NAO foi afetado")
        return False


def postar_fechamento_se_fim_do_dia():
    """Uma linha no fim do dia, lida do proprio log. NUNCA levanta.

    🔴 E ESTA LINHA que separa "nao tinha nada" de "o cron morreu". Sem ela o
    topico fica mudo nos dois casos -- que e exatamente o defeito que ele existe
    para acabar. Por isso sai MESMO com zero cutucada no dia.

    ⚠️ A hora vem do CRONTAB, nao de um numero escolhido a mao. O cron da
    cutucada e `0 11-23 * * 1-5` UTC (08h-20h BRT, ultima as 20h) e
    `0 11-19 * * 6` (08h-16h BRT, ultima as 16h). A primeira versao disto fixou
    19h: sairia fora da ultima rodada nos dias uteis e NUNCA no sabado.

    ⚠️ Domingo nao tem cron -- devolve False e nao ha fechamento, o que esta
    certo: nao houve dia de trabalho para fechar.
    """
    try:
        agora = dt.datetime.now(BRT)
        semana = agora.weekday()
        if semana >= 6:                      # domingo: o cron nem roda
            return False
        ultima = 16 if semana == 5 else 20   # sabado x dia util
        if agora.hour != ultima:
            return False
        hoje = agora.strftime("%Y-%m-%d")
        cut = brief = erros = 0
        pessoas = set()
        with open(LOG, encoding="utf-8") as fh:
            for linha in fh:
                if not linha.startswith(f"[{hoje}"):
                    continue
                corpo = linha.split("] ", 1)[-1]
                if ": cutucada com " in corpo:
                    cut += 1
                    pessoas.add(corpo.split(":")[0].strip())
                elif ": enviado (" in corpo:
                    brief += 1
                elif ": ERRO " in corpo:
                    erros += 1
        sino = "🚨" if erros else "📋"
        return postar_topico(
            f"{sino} Fechamento de {agora.strftime('%d/%m')}\n"
            f"{cut} cutucada(s) para {len(pessoas)} pessoa(s) · "
            f"{brief} briefing(s) · {erros} erro(s)")
    except Exception as e:  # noqa: BLE001
        log(f"fechamento do dia falhou ({e})")
        return False


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


# Laço 1/2/3 (13/09/2026): só os itens com sinal_id (QUENTES AGORA) entram no
# registro de entregas; a legenda vai fora do modelo, para nunca faltar.
LEGENDA_123 = "_Responda *1* já resolvi · *2* vou agora · *3* não é comigo_"

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

🔄 *RETOMAR HOJE* · 1

  • *Juliana Prado* — há 92 dias
    _"adorei a escola mas agora tá apertado, meu filho
    tá em prova, me chama em janeiro"_

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

📈 *O MÊS* _(parcial)_
  🧲 Leads *29* / 160
  🎯 Experimentais realizadas *6* / 38
  🎓 Matrículas *2* / 21
  💵 Ticket *R$ 407* / 435

  _funil:_ lead→exp *20,7%* · exp→mat *0%*

━━━━━━━━━━━━━━━━━━━━━

⭐ _Ticket Premiado_ — faltam *R$ 17,50*

━━━━━━━━━━━━━━━━━━━━━

_Quer que eu já deixe os 3 na mira cedo?_"""

# dow do Postgres: 0 = domingo
DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"]


# ── LIDERANCA ───────────────────────────────────────────────────────────────
# 🔴 O molde vai LITERAL no prompt, como os das consultoras: modelo segue
# exemplo muito melhor do que segue regra. Aqui a hierarquia e outra — primeiro
# a rede, depois cada unidade, depois o que exige decisao.
MOLDE_LIDERANCA_MANHA = """\
📊 *BOM DIA, {apelido}*
_{dia_semana}, {data} · dia {dia_do_mes} do mes_
━━━━━━━━━━━━━━━━━━━━━

🎯 *A REDE ATE HOJE* · 10 matriculas
_mesmo periodo do mes passado: 13_

  • *Campo Grande* — 4  _(6 no mes passado)_
  • *Recreio* — 3  _(4)_
  • *Barra* — 3  _(3)_

━━━━━━━━━━━━━━━━━━━━━

⏳ *CLIENTE ESPERANDO RESPOSTA*

  • *Vitoria* — 14 conversas _(piorando)_
  • *Dai* — 3 _(estavel)_

━━━━━━━━━━━━━━━━━━━━━

💡 *O QUE EU FARIA HOJE*

  _uma coisa so, com o porque medido e uma pergunta no fim_
"""

MOLDE_LIDERANCA_FIM = """\
🌙 *FECHANDO O DIA, {apelido}*
_{dia_semana}, {data}_
━━━━━━━━━━━━━━━━━━━━━

📊 *HOJE NA REDE* · 2 matriculas
  • *Campo Grande* — 2 · *Recreio* — 0 · *Barra* — 0

━━━━━━━━━━━━━━━━━━━━━

⚠️ *O QUE FICOU*

  • 3 conversas com o cliente esperando desde ontem

━━━━━━━━━━━━━━━━━━━━━

  _fecha com UMA pergunta que ajude a decidir amanha_
"""

def lideranca_ativa():
    """Quem lidera o comercial: diretoria + lider do comercial. Vem da
    governanca, nunca de lista fixa no script — telefone que muda em um lugar
    so."""
    return rpc("mila_lideranca_ativa_v1", {})


def conversa_da_lideranca(telefone):
    """A conversa mais recente dessa pessoa em QUALQUER caixa da Mila.

    ⚠️ Quem lidera nao tem unidade, entao nao da para escolher a caixa por ela.
    Varre as tres e pega a de atividade mais recente. NUNCA cria conversa — se
    nao existe, a pessoa nunca escreveu para a Mila e mandar do nada seria
    abrir conversa por conta propria (mesma regra da consultora)."""
    achadas = []
    for c in (_cw("GET", f"/contacts/search?q={telefone}").get("payload") or []):
        if "".join(ch for ch in str(c.get("phone_number") or "") if ch.isdigit()) != telefone:
            continue
        for cv in (_cw("GET", f"/contacts/{c['id']}/conversations").get("payload") or []):
            if cv.get("inbox_id") in INBOX_POR_UNIDADE.values():
                achadas.append(cv)
    if not achadas:
        raise RuntimeError(f"sem conversa em nenhuma caixa da Mila para {telefone}")
    return max(achadas, key=lambda cv: cv.get("last_activity_at") or 0)["id"]


def enviar_lideranca(telefone, texto):
    cid = conversa_da_lideranca(telefone)
    r = _cw("POST", f"/conversations/{cid}/messages",
            {"content": texto, "message_type": "outgoing", "private": False})
    return {"conversation_id": cid, "message_id": r.get("id")}


def envelope_lideranca(tipo, dados, p):
    rotulo = "manhã" if tipo == "manha" else "fim do dia"
    dia_semana = DIAS[dt.date.fromisoformat(str(dados["data"])).isoweekday() % 7]
    molde = (MOLDE_LIDERANCA_MANHA if tipo == "manha" else MOLDE_LIDERANCA_FIM).format(
        apelido=(p.get("apelido") or p["nome"]).upper(),
        dia_semana=dia_semana, data=str(dados["data"])[8:10] + "/" + str(dados["data"])[5:7],
        dia_do_mes=dados.get("dia_do_mes", ""))
    pedido = (
        "Voce esta falando com quem LIDERA o comercial das 3 unidades — nao com uma consultora. "
        "Traga a leitura da REDE: onde esta cada unidade contra o mesmo periodo do mes passado, "
        "quem esta deixando cliente esperando, e o que exige decisao. "
        "🔴 Termine com UMA coisa so: a acao ou a pergunta mais util de hoje, com o porque MEDIDO. "
        "Nunca liste cinco prioridades — quem lidera nao precisa de lista, precisa do proximo passo. "
        "⚠️ Se `perguntar_campanha` for true, PERGUNTE se ja definiram a campanha do mes: o sistema "
        "NAO sabe se existe uma (nao ha onde isso seja registrado), entao nunca afirme que falta. "
        "⚠️ Se `padroes_envelhecidos` for maior que zero, avise que o retrato tem mais de 45 dias. ⚠️ Se `agenda_proximos_dias` tiver algum dia com `tem_expediente` false, AVISE com todas as letras que naquele dia a escola nao abre (feriado ou recesso) e que voce nao vai mandar briefing — melhor a pessoa saber antes do que estranhar o silencio. Nao invente o motivo: diga apenas que nao ha aula.")
    if tipo != "manha":
        pedido = pedido.replace("Traga a leitura da REDE", "Feche o dia: o que aconteceu na REDE")
    return (f"[{rotulo.upper()} DA LIDERANCA]\n\nDADOS (JSON):\n{json.dumps(_com_agenda(dados, p), ensure_ascii=False)}"
            f"\n\nMOLDE (siga a forma, troque o conteudo):\n{molde}\n\n{pedido}")

def envelope(tipo, dados, c):
    """O molde vai LITERAL no prompt.

    Instrução abstrata ("formato de WhatsApp, curto") produzia TEXTO CORRIDO, e o
    Luciano cortou em 04/09: "no fim de um dia cansativo a galera nem lê isso".
    Modelo segue exemplo muito melhor do que segue regra — então a régua é um
    exemplo pronto, com hierarquia, separadores e uma informação por linha.
    """
    rotulo = "manhã" if tipo == "manha" else "fim do dia"
    dia_semana = DIAS[int(dados.get("dow", 0)) % 7]
    # 🔴 O bloco RETOMAR HOJE so existe se `retomar_hoje` vier preenchido, e a
    # frase da pessoa (`ele_disse`) e OBRIGATORIA nele: lembrete sem a frase a
    # consultora ignora, e em duas semanas para de ler o briefing inteiro.
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
                  "quem é de dias anteriores e segue sem desfecho, o que já está marcado para amanhã, e o bloco `mes_ate_agora` "
                  "com leads/experimentais/matrículas/ticket contra a meta e o funil. Se `mes_ate_agora.fechado` for true, "
                  "diga que é o fechamento oficial; se for false, escreva _(parcial)_ ao lado do título do mês. "
                  "A linha de experimentais do mês é `experimentais_realizadas` contra `meta_experimentais` — "
                  "NUNCA use `experimentais_agendadas` ali: agendada não é realizada, e o relatório da equipe mostra a realizada.")
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
    return cab + "\n" + pedido + "\n" + regras + "\n📋 SE VIER `pendencias_de_cadastro`, cite em UMA linha, com um nome de exemplo, e ofereca preencher na hora — \"o Fulano ta sem canal de origem, lembra de onde ele veio? eu registro\". Nunca liste todos: um nome e o numero bastam. Sao buracos que ela resolve falando com voce, em segundos, sem abrir sistema nenhum.\n🔴 SE VIER `convite_do_dia`, feche a mensagem com ELE e com mais nada: uma linha, com as suas palavras, convidando a pessoa a te pedir aquilo. Nunca liste outras capacidades junto — menu e o que ela pula. O objetivo e ela responder, entao termine em pergunta.\n\nDADOS CANÔNICOS (json):\n" + json.dumps(_com_agenda(dados, c), ensure_ascii=False)


# ── O CONVITE DO DIA ────────────────────────────────────────────────────────
# Cada entrada: (chave, aplicavel(dados) -> contexto|None, molde do convite).
# O molde e SUGESTAO de conteudo, nao texto pronto: quem escreve e ela, com as
# palavras dela. Texto pronto no prompt sai identico todo dia e vira assinatura.
CATALOGO_CONVITES = [
    ("ficha_lead",
     lambda d: (d.get("hoje", {}).get("experimentais") or [{}])[0].get("aluno"),
     "ofereca puxar a ficha completa de {ctx} antes da aula — telefone, "
     "responsavel, de onde veio e o que a pessoa contou na conversa"),
    ("base_comercial",
     lambda d: True,
     "lembre que ela pode te perguntar COMO fazer — passar preco, tratar "
     "objecao, conduzir o Tour, pedir indicacao — e que voce responde pelo "
     "material que o Alf escreveu, citando o bloco, nao pelo seu achismo"),
    # ⚠️ Olhava `n_pendencias_de_hoje`, que e SEMPRE 0 (conta pendencia nascida
    #    no dia, nao o acumulado). O convite existia e nunca disparava.
    ("registrar_pendencia",
     lambda d: (d.get("pendencias_de_cadastro") or {}).get("total") or None,
     "ofereca preencher os {ctx} cadastros incompletos que ela resolve FALANDO "
     "com voce — de onde o lead veio, que instrumento quer, por que nao fechou. "
     "Cite um nome de `pendencias_de_cadastro` para ser concreta"),
    ("programa",
     lambda d: (d.get("programa", {}).get("mais_perto") or {}).get("estrela"),
     "ofereca abrir o MATRICULADOR + LA estrela a estrela e mostrar o que "
     "falta para fechar {ctx}"),
    ("base_comercial_2",
     lambda d: True,
     "lembre que a base comercial cobre retomada de quem sumiu e ex-aluno "
     "querendo voltar, e que basta perguntar o que falar nesses casos"),
    ("falar_por_voce",
     lambda d: ((d.get("ontem", {}).get("sem_desfecho") or [{}])[0].get("aluno")
                or (d.get("ontem", {}).get("faltou_sem_remarcar") or [{}])[0].get("aluno")),
     "ofereca escrever a mensagem para {ctx} — voce mostra antes e so manda "
     "depois do ok dela"),
    ("mes_contra_meta",
     lambda d: True,
     "ofereca abrir o mes contra a meta — leads, experimentais, matriculas, "
     "ticket e o funil inteiro"),
]


def convite_do_dia(dados):
    """Qual capacidade lembrar hoje. Puro e deterministico: mesma data + mesmos
    dados = mesmo convite, entao da para recalcular na hora de registrar no log.

    Devolve dict com `chave` e `pedido`, ou None se nada se aplicar."""
    try:
        dia = dt.date.fromisoformat(str(dados.get("data_iso") or dados.get("data")))
    except (TypeError, ValueError):
        try:
            d = str(dados.get("data", ""))
            dia = dt.date(int(d[6:10]), int(d[3:5]), int(d[0:2]))
        except (TypeError, ValueError, IndexError):
            return None
    # ⚠️ Escolhe DENTRO da lista ja filtrada. A versao anterior comecava num
    #    indice e andava para frente ate achar um aplicavel — e a caminhada
    #    fazia dois dias diferentes pousarem no mesmo convite ("programa ·
    #    programa", medido em simulacao de 7 dias).
    aplicaveis = []
    for chave, aplicavel, molde in CATALOGO_CONVITES:
        try:
            ctx = aplicavel(dados)
        except (AttributeError, TypeError, IndexError, KeyError):
            ctx = None
        if ctx:
            aplicaveis.append((chave, ctx, molde))
    if not aplicaveis:
        return None

    # A pessoa entra no indice de proposito: as tres consultoras recebendo o
    # MESMO convite no mesmo dia parece robotico e, pior, me da tres amostras
    # da mesma pergunta. Com convites diferentes eu descubro em uma semana qual
    # deles faz a pessoa responder.
    quem = str((dados.get("consultora") or {}).get("apelido")
               or (dados.get("consultora") or {}).get("nome") or "")
    semente = sum(ord(ch) for ch in quem)
    # ⚠️ passo 3, nao 1: com passo 1 uma mudanca no tamanho da lista (a
    #    pendencia apareceu ou sumiu) faz o item repetir no dia seguinte.
    idx = (dia.timetuple().tm_yday * 3 + semente) % len(aplicaveis)
    chave, ctx, molde = aplicaveis[idx]
    return {"chave": chave,
            "pedido": molde.format(ctx=ctx) if "{ctx}" in molde else molde}


def pendencias_de_cadastro(telefone):
    """Os buracos de cadastro da consultora, da MESMA fonte que a tool
    `pendencias_comerciais` — ver o cabecalho do patch. Nunca derruba o
    briefing: erro aqui devolve None e ela fala normalmente."""
    if not telefone:
        return None
    try:
        r = rpc("radar_pendencias_comerciais_v1",
                {"p_solicitante_telefone": telefone, "p_amostra": 3}) or {}
        p = r.get("pendencias") or {}

        def bloco(chave):
            b = p.get(chave) or {}
            return {"total": b.get("total") or 0,
                    "exemplos": [x.get("nome") or x.get("nome_aluno")
                                 for x in (b.get("amostra") or [])][:3]}

        out = {"sem_canal_de_origem": bloco("lead_sem_canal_de_origem"),
               "sem_curso_de_interesse": bloco("lead_sem_curso_de_interesse"),
               "sem_motivo_da_nao_matricula": bloco("experimental_feita_sem_desfecho")}
        out["total"] = sum(v["total"] for v in out.values() if isinstance(v, dict))
        return out if out["total"] > 0 else None
    except Exception as e:  # noqa: BLE001
        log(f"pendencias de cadastro indisponiveis ({e}) — sigo sem elas")
        return None


def _com_agenda(dados, quem=None):
    """Acrescenta `agenda_proximos_dias` ao dicionario de dados do envelope,
    sem alterar o original (o mesmo dict e usado no log de conclusao)."""
    try:
        d = dict(dados)
        ag = agenda_da_semana(dados.get("data"))
        if ag:
            d["agenda_proximos_dias"] = ag
        # ⚠️ So na manha e so para consultora: o envelope da lideranca nao passa
        #    por aqui com tipo=manha, e duas vezes por dia viraria ruido.
        if dados.get("tipo") == "manha":
            pend = pendencias_de_cadastro((quem or {}).get("telefone"))
            if pend:
                d["pendencias_de_cadastro"] = pend
                dados = d          # o convite precisa ENXERGAR a pendencia
            c = convite_do_dia(dados)
            if c:
                d["convite_do_dia"] = c
        return d if len(d) > len(dados) else dados
    except Exception:  # noqa: BLE001
        return dados


def agenda_da_semana(dia, dias=6):
    """Hoje + N dias, para a Mila avisar de feriado/recesso ANTES de acontecer.

    ⚠️ Nunca derruba o briefing: erro aqui devolve lista vazia e o envelope sai
    sem o campo. O briefing e o produto."""
    try:
        # ⚠️ Aceita ISO e DD/MM/AAAA: `mila_briefing_lideranca_v1` devolve `data`
        #    em ISO e `mila_briefing_manha_v1` em BR. Sem normalizar, a agenda
        #    sumia SO para a consultora -- e em silencio, porque o except engole.
        d0 = str(dia).strip()
        if "/" in d0:
            dd, mm, aa = d0.split("/")
            d0 = f"{aa}-{mm}-{dd}"
        fim = (dt.date.fromisoformat(d0) + dt.timedelta(days=dias)).isoformat()
        r = rpc("escola_agenda_v1", {"p_de": d0, "p_ate": fim, "p_unidade_id": None})
        return [x for x in (r or []) if x.get("situacao") != "desconhecido"]
    except Exception as e:  # noqa: BLE001
        log(f"agenda da semana indisponivel ({e}) — sigo sem ela")
        return []


def escola_abre(dia, unidade_id=None):
    """A escola tem expediente nesse dia?

    Deriva da GRADE (`escola_agenda_v1`), nao de tabela de feriado: 07/09/2026
    tem 1 aula viva contra um tipico de 319 nas segundas. Cobre feriado,
    recesso e ponte com a mesma regra.

    Devolve (abre: bool, detalhe: dict). ⚠️ Quando a RPC responde
    `tem_expediente = None` (sem base de comparacao), esta funcao devolve
    **True** de proposito: "nao sei" nunca pode virar silencio, senao um atraso
    de sync emudece a Mila sem ninguem perceber.
    """
    try:
        r = rpc("escola_agenda_v1", {"p_de": dia, "p_ate": dia,
                                     "p_unidade_id": unidade_id})
        d = (r or [{}])[0] if isinstance(r, list) else {}
        te = d.get("tem_expediente")
        if te is None:
            log(f"agenda de {dia}: nao sei dizer ({d.get('situacao')}) — vou falar assim mesmo")
            return True, d
        return bool(te), d
    except Exception as e:  # noqa: BLE001
        # Falha ao consultar tambem NAO cala: mesma regra do "nao sei".
        log(f"agenda de {dia}: erro ao consultar ({e}) — vou falar assim mesmo")
        return True, {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tipo", choices=["manha", "fim_do_dia"], required=True)
    ap.add_argument("--dry-run", action="store_true", help="não reserva, não envia; roda o Hermes numa sessão de ensaio")
    ap.add_argument("--so", help="telefone de UMA consultora")
    ap.add_argument("--data", help="YYYY-MM-DD (default: hoje BRT)")
    # ⚠️ `ambos` e o default: se so consultoras rodasse por omissao, o cron
    # antigo continuaria excluindo a lideranca em silencio.
    ap.add_argument("--publico", choices=["consultoras", "lideranca", "ambos"],
                    default="ambos")
    a = ap.parse_args()
    load_env()
    hoje = a.data or dt.datetime.now(BRT).strftime("%Y-%m-%d")
    # ── a escola abre hoje? ────────────────────────────────────────────────
    # 🔴 Dia sem expediente NAO gera briefing nem fechamento — para nenhum dos
    #    dois publicos. Feriado, recesso e ponte caem todos aqui.
    abre, ag = escola_abre(hoje)
    if not abre:
        log(f"== {a.tipo} {hoje}: escola SEM EXPEDIENTE "
            f"({ag.get('aulas_vivas')} aula(s) viva(s) contra tipico {ag.get('tipico')}) — nao falo hoje")
        return 0

    fn = "mila_briefing_manha_v1" if a.tipo == "manha" else "mila_fechamento_dia_v1"
    consultoras = rpc("mila_consultoras_ativas_v1", {}) if a.publico in ("consultoras", "ambos") else []
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
            itens_123 = ([{"sinal_id": x.get("sinal_id"), "quem": x.get("quem")}
                          for x in (dados.get("quentes_agora") or []) if x.get("sinal_id")]
                         if a.tipo == "manha" else [])
            if itens_123:
                texto = texto.rstrip() + "\n\n" + LEGENDA_123
            if a.dry_run:
                log(f"--- {c['apelido']} ({c['unidade_nome']}) [DRY-RUN — nada enviado] ---\n{texto}\n")
                continue
            r = enviar(c["telefone"], c["unidade_nome"], texto)
            # O convite oferecido vai para o log para dar pra medir depois se
            # ele fez a pessoa responder. Recalculado, nao guardado: a funcao e
            # pura e deterministica, entao devolve a mesma escolha.
            concluir(log_id, "ok", {"fase": "enviado", "texto": texto, "chatwoot": r,
                                    "convite": (convite_do_dia(dados) or {}).get("chave"),
                                    "dados": dados})
            if itens_123:
                # radar_entregas: o registro canônico do que saiu — é a ele que o "1/2/3" se refere.
                try:
                    reg = rpc("mila_registrar_entrega_dm_v1",
                              {"p_solicitante_telefone": c["telefone"],
                               "p_origem": "briefing", "p_itens": itens_123})
                    log(f"{c['apelido']}: entregas registradas: {reg}")
                except Exception as e:  # noqa: BLE001 — registro falho nao desfaz o envio
                    log(f"{c['apelido']}: entrega NAO registrada: {e}")
            log(f"{c['apelido']}: enviado ({len(texto)} chars)")
            # Briefing vai so como LINHA: tem 500-1.300 chars e viraria parede
            # no topico. O texto inteiro ja esta na aba Conversas do LA-OS.
            postar_topico(f"☀️ Briefing · {c['apelido']} · {c['unidade_nome']} "
                          f"· {len(texto)} chars · {dt.datetime.now(BRT):%H:%M}")
        except Exception as e:  # noqa: BLE001 — uma consultora não derruba as outras
            falhas += 1
            log(f"{c['apelido']}: ERRO {e}")
            if log_id:
                concluir(log_id, "erro", {"fase": "erro", "erro": str(e)[:500]})

    # ── a lideranca ────────────────────────────────────────────────────────
    # Mesmo cano, dado e molde de rede. Uma pessoa que falha nao derruba a outra,
    # e a lideranca nao derruba as consultoras (o laco delas ja terminou aqui).
    if a.publico in ("lideranca", "ambos"):
        lideres = lideranca_ativa()
        log(f"== {a.tipo} {hoje} · {len(lideres)} da lideranca{' · DRY-RUN' if a.dry_run else ''}")
        for p in lideres:
            if a.so and p["telefone"] != a.so:
                continue
            key = f"mila_proativa_lideranca|{a.tipo}|{p['telefone']}|{hoje}"
            log_id = None
            if not a.dry_run:
                log_id = reservar(key, {"nome": p["nome"],
                                        "apelido": p.get("apelido") or p["nome"],
                                        "telefone": p["telefone"], "unidade_nome": "Rede"}, a.tipo)
                if log_id is None:
                    log(f"{p.get('apelido') or p['nome']}: ja tratado hoje — pulo")
                    continue
            try:
                dados = rpc("mila_briefing_lideranca_v1",
                            {"p_solicitante_telefone": p["telefone"], "p_data": hoje, "p_tipo": a.tipo})
                if not dados.get("ok"):
                    raise RuntimeError(f"rpc nao ok: {dados}")
                sessao = (f"chatwoot-lideranca-v1-{p['telefone']}" if not a.dry_run
                          else f"mila-lideranca-ensaio-{p['telefone']}")
                env_extra = {"MILA_CONSULTOR_NOME": p["nome"], "MILA_CONSULTOR_TELEFONE": p["telefone"],
                             "MILA_CONSULTOR_UNIDADE": "Rede (3 unidades)", "MILA_PROATIVA": a.tipo}
                if a.dry_run:
                    env_extra["MILA_GESTAO_DRY_RUN"] = "1"
                texto = hermes(envelope_lideranca(a.tipo, dados, p), sessao, env_extra)
                if not texto or "[SEM ENVIO]" in texto:
                    log(f"{p.get('apelido') or p['nome']}: a Mila decidiu nao enviar")
                    if log_id:
                        concluir(log_id, "ok", {"fase": "sem_envio", "motivo": "modelo"})
                    continue
                if a.dry_run:
                    log(f"--- {p.get('apelido') or p['nome']} [DRY-RUN] ---\n{texto}\n")
                    continue
                r = enviar_lideranca(p["telefone"], texto)
                concluir(log_id, "ok", {"fase": "enviado", "texto": texto, "chatwoot": r})
                log(f"{p.get('apelido') or p['nome']}: enviado ({len(texto)} chars)")
            except Exception as e:  # noqa: BLE001
                falhas += 1
                log(f"{p.get('apelido') or p['nome']}: ERRO {e}")
                if log_id:
                    concluir(log_id, "erro", {"fase": "erro", "erro": str(e)[:500]})

    sys.exit(1 if falhas else 0)


if __name__ == "__main__":
    main()
