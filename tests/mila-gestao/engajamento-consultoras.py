#!/usr/bin/env python3
"""A equipe está USANDO a Mila, ou já desistiu dela?

🔴 POR QUE EXISTE. O medo do Luciano (09/09/2026), nas palavras dele: *"se
   começar a chegar ruído para elas, não vão usar"*. Já aconteceu com o TOM.
   Só que ninguém tinha medido o outro lado: **o que elas fazem com o que
   recebem**. `radar_entregas` está VAZIA, então o registro canônico não existe
   — mas a DM da Mila é uma conversa do Chatwoot, e ali está tudo.

   Por consultora, responde:
     · quantas mensagens a Mila mandou (e de que tipo: briefing, cutucada…)
     · quantas ELA mandou de volta, e quando foi a última
     · a razão resposta/envio — o número que diz se o canal está vivo
     · o que ela escreveu, literalmente (é o que mostra se é uso ou desabafo)

⚠️ Silêncio NÃO é sinônimo de desinteresse: a cutucada pede AÇÃO no lead, não
   resposta à Mila. Por isso o script também mostra o texto — quem responde
   "já falei com ela" está usando; quem não responde nada pode estar agindo
   fora do canal, e isso só o cruzamento com o desfecho do lead diz.
"""
import concurrent.futures as fut
import json
import os
import sys
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime

BASE = os.environ["CHATWOOT_BASE_URL"].rstrip("/")
ACC = os.environ["CHATWOOT_ACCOUNT_ID"]
# la Chatwoot recusa token de BOT em /contacts/search (401) — aqui tem de ser
# o token de usuario admin. Ver "Chatwoot REST bloqueia tokens de BOT" no CLAUDE.md.
TOK = (os.environ.get("CHATWOOT_USER_TOKEN")
       or os.environ.get("CHATWOOT_API_TOKEN")
       or os.environ["CHATWOOT_BOT_TOKEN"])

# telefone -> (nome, inbox da Mila da unidade dela)
EQUIPE = [
    ("553171422022",  "Vitória (CG)",      "Mila_CG"),
    ("5521968060404", "Daiana (Recreio)",  "Mila_Recreio"),
    ("5521984690143", "Kailane (Barra)",   "Mila_Barra"),
]


def get(path):
    req = urllib.request.Request(
        f"{BASE}/api/v1/accounts/{ACC}{path}",
        headers={"api_access_token": TOK, "User-Agent": "la-engajamento"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def conversas_do_telefone(tel):
    """Toda conversa da pessoa, em qualquer caixa (a DM da Mila é uma delas).

    ⚠️ DEDUPLICA POR ID DE CONVERSA. O mesmo telefone tem VÁRIOS contatos no
    Chatwoot (a Vitória 3, a Daiana 6) e a mesma conversa vem por todos eles —
    a 1ª versão contou cada mensagem 3-6× e inflou a régua de engajamento. Ver
    "aluno com duas conversas no mesmo departamento" no CLAUDE.md: contato
    duplicado é a norma aqui, não a exceção.
    """
    achadas = {}
    busca = get("/contacts/search?q=" + urllib.parse.quote(tel))
    for c in (busca.get("payload") or []):
        digitos = "".join(ch for ch in str(c.get("phone_number") or "") if ch.isdigit())
        if digitos != tel:
            continue
        for cv in (get(f"/contacts/{c['id']}/conversations").get("payload") or []):
            achadas[cv["id"]] = cv
    return list(achadas.values())


def rotulo(texto):
    """Que tipo de mensagem a Mila mandou — pelo cabeçalho que ela mesma usa."""
    t = (texto or "")[:60].upper()
    if "BOM DIA" in t:      return "briefing manhã"
    if "FIM DO DIA" in t or "FECHOU O DIA" in t: return "fim do dia"
    if "AGORA" in t or "🔥" in t[:8]:            return "cutucada"
    return "outra"


def olhar(tel, nome, inbox_esperado):
    convs = conversas_do_telefone(tel)
    if not convs:
        print(f"\n### {nome}\n  sem conversa nenhuma no Chatwoot")
        return

    saida, entrada, tipos, falas = 0, 0, Counter(), []
    ult_entrada = ult_saida = None
    caixas = Counter()

    vistas = set()   # ⚠️ id de mensagem, 2ª rede contra a duplicata de contato
    for cv in convs:
        caixas[cv.get("meta", {}).get("channel") or str(cv.get("inbox_id"))] += 1
        try:
            msgs = get(f"/conversations/{cv['id']}/messages?limit=100")
        except Exception:  # noqa: BLE001
            continue
        for m in (msgs.get("payload") if isinstance(msgs, dict) else msgs) or []:
            if m.get("private") or m.get("message_type") == 2:
                continue
            if m.get("id") in vistas:
                continue
            vistas.add(m.get("id"))
            ts = m.get("created_at")
            if m.get("message_type") == 1:          # a Mila falando
                saida += 1
                tipos[rotulo(m.get("content"))] += 1
                ult_saida = max(ult_saida or 0, ts or 0)
            elif m.get("message_type") == 0:        # ELA falando
                entrada += 1
                ult_entrada = max(ult_entrada or 0, ts or 0)
                if (m.get("content") or "").strip():
                    falas.append((ts, m["content"].strip()[:160]))

    def q(ts):
        return datetime.fromtimestamp(ts).strftime("%d/%m %H:%M") if ts else "nunca"

    razao = f"{100*entrada/saida:.0f}%" if saida else "—"
    print(f"\n### {nome}   ({len(convs)} conversa(s))")
    print(f"  Mila mandou : {saida:3d}   última {q(ult_saida)}")
    print(f"  ELA mandou  : {entrada:3d}   última {q(ult_entrada)}   → razão {razao}")
    if tipos:
        print("  tipos       : " + ", ".join(f"{k} {v}" for k, v in tipos.most_common()))
    if falas:
        print("  o que ela escreveu (mais recentes):")
        for ts, txt in sorted(falas, reverse=True)[:8]:
            print(f"    [{q(ts)}] {txt}")
    else:
        print("  🔴 ELA NUNCA RESPONDEU NADA")


def main():
    print("ENGAJAMENTO DAS CONSULTORAS COM A MILA (fonte: Chatwoot ao vivo)")
    for tel, nome, inbox in EQUIPE:
        try:
            olhar(tel, nome, inbox)
        except Exception as e:  # noqa: BLE001
            print(f"\n### {nome}\n  erro: {e}")


if __name__ == "__main__":
    main()
