#!/usr/bin/env python3
"""A PROATIVA PASSA A FALAR COM A LIDERANCA (Alf e Krissya) — 06/09/2026.

Ate agora o briefing das 8:30 e o fechamento das 18:30 saiam **so para as tres
consultoras**. O Alf e a Krissya tinham as 31 tools e os 12 blocos e a Mila
nunca falava primeiro com eles — a diferenca entre "tem acesso" e "e parceira".

O cano e o mesmo (Hermes + molde + Chatwoot); o que muda e:
  · QUEM     — `mila_lideranca_ativa_v1` em vez de `mila_consultoras_ativas_v1`
  · O DADO   — `mila_briefing_lideranca_v1`: as 3 unidades contra o MESMO
               PERIODO do mes passado, atendimento, pendencias da rede
  · O MOLDE  — rede em vez de unidade, leitura em vez de agenda

⚠️ A LIDERANCA NAO TEM UNIDADE, e `conversa_da_consultora` escolhe a caixa pela
   unidade. Para elas a busca varre as TRES caixas e pega a conversa mais
   recente — sem nunca criar conversa, que e a regra que ja existia: mandar do
   nada seria abrir conversa por conta propria. Conferido em 06/09: a Krissya
   tem conversa na Barra, o Alf nas tres.

⚠️ "Nada para hoje" NAO existe na lideranca. Para a consultora faz sentido
   (agenda vazia = dia sem experimental). Para quem lidera, silencio vira "a
   Mila sumiu" — a leitura da rede vale mesmo num dia parado.

  python3 _patch-proativa-lideranca-06set.py <mila-proativa.py>
"""
import io
import sys

MOLDE_LIDERANCA = '''
# ── LIDERANCA ───────────────────────────────────────────────────────────────
# 🔴 O molde vai LITERAL no prompt, como os das consultoras: modelo segue
# exemplo muito melhor do que segue regra. Aqui a hierarquia e outra — primeiro
# a rede, depois cada unidade, depois o que exige decisao.
MOLDE_LIDERANCA_MANHA = """\\
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

MOLDE_LIDERANCA_FIM = """\\
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

'''

FUNCOES = '''
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
        "⚠️ Se `padroes_envelhecidos` for maior que zero, avise que o retrato tem mais de 45 dias.")
    if tipo != "manha":
        pedido = pedido.replace("Traga a leitura da REDE", "Feche o dia: o que aconteceu na REDE")
    return (f"[{rotulo.upper()} DA LIDERANCA]\\n\\nDADOS (JSON):\\n{json.dumps(dados, ensure_ascii=False)}"
            f"\\n\\nMOLDE (siga a forma, troque o conteudo):\\n{molde}\\n\\n{pedido}")

'''

if len(sys.argv) < 2:
    print("uso: python3 _patch-proativa-lideranca-06set.py <mila-proativa.py>", file=sys.stderr)
    raise SystemExit(2)

alvo = sys.argv[1]
s = io.open(alvo, encoding="utf-8").read()

if "MOLDE_LIDERANCA_MANHA" in s:
    print("a lideranca ja esta na proativa — nada a fazer")
    raise SystemExit(0)

# ── 1. moldes + funcoes, logo antes do envelope das consultoras ─────────────
ANC = "def envelope(tipo, dados, c):"
if s.count(ANC) != 1:
    print(f"ANCORA do envelope aparece {s.count(ANC)} vezes, esperado 1", file=sys.stderr)
    raise SystemExit(1)
s = s.replace(ANC, MOLDE_LIDERANCA.strip() + "\n\n" + FUNCOES.strip() + "\n\n" + ANC, 1)

# ── 2. o main ganha o publico ───────────────────────────────────────────────
ANC2 = '    ap.add_argument("--data", help="YYYY-MM-DD (default: hoje BRT)")'
if s.count(ANC2) != 1:
    print("ANCORA do --data nao bateu", file=sys.stderr)
    raise SystemExit(1)
s = s.replace(ANC2, ANC2 + '\n    # ⚠️ `ambos` e o default: se so consultoras rodasse por omissao, o cron\n'
                           '    # antigo continuaria excluindo a lideranca em silencio.\n'
                           '    ap.add_argument("--publico", choices=["consultoras", "lideranca", "ambos"],\n'
                           '                    default="ambos")', 1)

ANC3 = '    consultoras = rpc("mila_consultoras_ativas_v1", {})'
if s.count(ANC3) != 1:
    print("ANCORA da lista de consultoras nao bateu", file=sys.stderr)
    raise SystemExit(1)
s = s.replace(ANC3, '    consultoras = rpc("mila_consultoras_ativas_v1", {}) if a.publico in ("consultoras", "ambos") else []', 1)

# ── 3. o laco da lideranca, depois do das consultoras ──────────────────────
ANC4 = "    sys.exit(1 if falhas else 0)"
if s.count(ANC4) != 1:
    print("ANCORA do sys.exit nao bateu", file=sys.stderr)
    raise SystemExit(1)
LACO = '''
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
                log_id = reservar(key, {"apelido": p.get("apelido") or p["nome"],
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
                    log(f"--- {p.get('apelido') or p['nome']} [DRY-RUN] ---\\n{texto}\\n")
                    continue
                r = enviar_lideranca(p["telefone"], texto)
                concluir(log_id, "ok", {"fase": "enviado", "texto": texto, "chatwoot": r})
                log(f"{p.get('apelido') or p['nome']}: enviado ({len(texto)} chars)")
            except Exception as e:  # noqa: BLE001
                falhas += 1
                log(f"{p.get('apelido') or p['nome']}: ERRO {e}")
                if log_id:
                    concluir(log_id, "erro", {"fase": "erro", "erro": str(e)[:500]})

'''
s = s.replace(ANC4, LACO + ANC4, 1)

io.open(alvo, "w", encoding="utf-8", newline="\n").write(s)
print(f"lideranca acrescentada em {alvo}")
