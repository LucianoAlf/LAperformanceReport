#!/usr/bin/env python3
"""estudo-mila-sdr.py — o bot ajuda ou atrapalha?

A pergunta do Luciano (05/09): vale a pena manter a Mila SDR no pré-atendimento?
A preocupação é concreta e testável:

  · o cliente percebe que é robô e desiste;
  · o cliente pede para falar com gente e ninguém aparece;
  · a conversa que começa com bot converte menos que a que começa com humano.

Mede, por conversa das caixas comerciais:
  quem_abriu      — o primeiro a responder o cliente foi bot ou humano
  teve_bot        — houve alguma mensagem do bot
  teve_humano     — houve alguma mensagem de gente
  pediu_humano    — o cliente pediu explicitamente para falar com uma pessoa
  atendido_apos   — depois de pedir, veio humano
  cliente_sumiu   — depois da última mensagem da escola o cliente nunca mais falou
  converteu       — cruzado com `leads` por telefone

🔴 CUIDADO DE LEITURA: o bot atende TODO mundo primeiro por desenho, então
"conversa com bot converte menos" pode ser só o efeito de o humano entrar
apenas nos leads que já se qualificaram. Por isso o recorte que interessa é
`pediu_humano` e `atendido_apos` — esses são comportamento observável do
cliente, não artefato do fluxo.

⚠️ Não confunde bot com automação de sistema: a confirmação de agendamento e o
lembrete de aula têm remetente próprio e ficam fora.

Uso:  estudo-mila-sdr.py [--meses 6] [--max 1500] [--csv saida.csv]
"""
import argparse
import datetime as dt
import importlib.util
import os
import re
import sys
import time
from collections import defaultdict

BASE = os.path.dirname(os.path.abspath(__file__))
_s = importlib.util.spec_from_file_location("est", os.path.join(BASE, "estudo-atendimento-pareado.py"))
est = importlib.util.module_from_spec(_s)
_s.loader.exec_module(est)
mp = est.mp

CAIXAS = [147, 148, 155]

# O cliente dizendo, de alguma forma, "quero gente".
PEDE_HUMANO = re.compile(
    r"\b(falar com (algu[ée]m|uma pessoa|um humano|humano|atendente|consultor|consultora|"
    r"respons[áa]vel|gerente))|\b(atendente|humano)\b|"
    r"(isso|voc[êe]) [ée] (um )?(rob[ôo]|bot|m[áa]quina|intelig[êe]ncia artificial)|"
    r"\b(rob[ôo]|bot)\b|falando com (uma )?(m[áa]quina|rob[ôo]|bot)|"
    r"quero falar com|tem algu[ée]m a[ií]|tem gente a[ií]",
    re.IGNORECASE,
)
# Remetentes que são automação de sistema, não o bot conversacional.
AUTOMACAO = re.compile(r"WhatsApp Device|Sistema", re.IGNORECASE)


def eh_bot(m) -> bool:
    if m.get("sender_type") == "AgentBot":
        return True
    nome = ((m.get("sender") or {}).get("name") or "")
    return bool(re.match(r"^mi?ll?a\s", nome, re.IGNORECASE))


def eh_automacao(m) -> bool:
    nome = ((m.get("sender") or {}).get("name") or "")
    return bool(AUTOMACAO.search(nome)) or bool(est.AUTOMATICA.search(m.get("content") or ""))


def avaliar(msgs):
    falas = []
    for m in msgs:
        if m.get("message_type") == 2:
            continue
        txt = (m.get("content") or "").strip()
        if not txt:
            continue
        if m.get("message_type") == 0:
            falas.append({"quem": "cliente", "txt": txt})
        elif eh_automacao(m):
            continue                      # confirmação/lembrete não é atendimento
        else:
            falas.append({"quem": "bot" if eh_bot(m) else "humano", "txt": txt})
    if not falas:
        return None

    escola = [i for i, f in enumerate(falas) if f["quem"] in ("bot", "humano")]
    quem_abriu = falas[escola[0]]["quem"] if escola else "ninguem"
    teve_bot = any(f["quem"] == "bot" for f in falas)
    teve_humano = any(f["quem"] == "humano" for f in falas)

    idx_pedido = [i for i, f in enumerate(falas)
                  if f["quem"] == "cliente" and PEDE_HUMANO.search(f["txt"])]
    pediu = bool(idx_pedido)
    atendido_apos = False
    horas_ate_humano = None
    if idx_pedido:
        depois = falas[idx_pedido[0] + 1:]
        atendido_apos = any(f["quem"] == "humano" for f in depois)

    ult_escola = max(escola) if escola else -1
    sumiu = not any(f["quem"] == "cliente" for f in falas[ult_escola + 1:]) if ult_escola >= 0 else False

    return {
        "mensagens": len(falas),
        "do_cliente": sum(1 for f in falas if f["quem"] == "cliente"),
        "do_bot": sum(1 for f in falas if f["quem"] == "bot"),
        "do_humano": sum(1 for f in falas if f["quem"] == "humano"),
        "quem_abriu": quem_abriu,
        "teve_bot": teve_bot,
        "teve_humano": teve_humano,
        "pediu_humano": pediu,
        "atendido_apos_pedir": atendido_apos,
        "cliente_sumiu": sumiu,
        "trecho_pedido": falas[idx_pedido[0]]["txt"][:160] if idx_pedido else "",
    }


def pct(n, d):
    return f"{(100.0*n/d):.1f}%" if d else "—"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--meses", type=int, default=6)
    ap.add_argument("--max", type=int, default=1500)
    ap.add_argument("--csv")
    a = ap.parse_args()
    mp.load_env()

    desde = (dt.datetime.now() - dt.timedelta(days=30 * a.meses)).strftime("%Y-%m-%d")
    print(f"varrendo caixas {CAIXAS} desde {desde} (teto {a.max})")

    # telefones que converteram, para cruzar o desfecho
    st, conv = mp.rest("POST", "/rest/v1/rpc/convertidos_do_periodo_v1", {"p_meses": a.meses + 1})
    convertidos = {c["telefone"][-8:] for c in (conv or [])} if st == 200 else set()
    print(f"telefones convertidos no periodo: {len(convertidos)}")

    linhas = []
    # 🔴 COTA POR CAIXA, nao teto global. Com teto global o loop enchia a amostra
    # com a 1a caixa e a ULTIMA ficava de fora — medido: 784 Barra, 116 Recreio,
    # ZERO Campo Grande, e eu ia comparar unidades com uma amostra sem uma delas.
    # Mesmo erro do corte alfabetico na amostra pareada.
    cota = max(1, a.max // len(CAIXAS))
    for caixa in CAIXAS:
        na_caixa = 0
        pagina = 1
        while na_caixa < cota:
            try:
                d = mp._cw("GET", f"/conversations?inbox_id={caixa}&page={pagina}&status=all")
            except Exception as e:  # noqa: BLE001
                print(f"  caixa {caixa} pag {pagina}: {e}", file=sys.stderr)
                break
            convs = ((d.get("data") or {}).get("payload")) or d.get("payload") or []
            if not convs:
                break
            for cv in convs:
                criada = dt.datetime.fromtimestamp(cv.get("created_at") or 0).strftime("%Y-%m-%d")
                if criada < desde:
                    continue
                try:
                    dm = mp._cw("GET", f"/conversations/{cv['id']}/messages")
                except Exception:  # noqa: BLE001
                    continue
                msgs = sorted((dm.get("payload") or []), key=lambda m: m.get("created_at", 0))
                v = avaliar(msgs)
                if not v:
                    continue
                tel = re.sub(r"\D", "", ((cv.get("meta") or {}).get("sender") or {}).get("phone_number") or "")
                linhas.append({
                    "conversa_id": cv["id"], "caixa": caixa, "criada_em": criada,
                    "telefone_fim": tel[-8:], "converteu": tel[-8:] in convertidos, **v,
                })
                na_caixa += 1
                if na_caixa >= cota:
                    break
                time.sleep(0.05)
            pagina += 1
            print(f"  caixa {caixa} · pagina {pagina} · nesta caixa {na_caixa}/{cota}")

    if not linhas:
        print("nada medido")
        return

    n = len(linhas)
    print(f"\n{'='*72}\nA MILA SDR AJUDA OU ATRAPALHA? — {n} conversas\n{'='*72}\n")

    conv_n = sum(1 for x in linhas if x["converteu"])
    print(f"conversao geral da amostra: {conv_n}/{n}  {pct(conv_n, n)}\n")

    print("QUEM ABRIU O ATENDIMENTO")
    for q in ("bot", "humano", "ninguem"):
        g = [x for x in linhas if x["quem_abriu"] == q]
        c = sum(1 for x in g if x["converteu"])
        print(f"  {q:<8} {len(g):>5} conversas  ·  converteu {c:>4}  {pct(c, len(g))}")

    print("\nO CLIENTE PEDIU PARA FALAR COM GENTE")
    ped = [x for x in linhas if x["pediu_humano"]]
    print(f"  pediram: {len(ped)}  {pct(len(ped), n)} das conversas")
    if ped:
        at = [x for x in ped if x["atendido_apos_pedir"]]
        print(f"  foram atendidos depois: {len(at)}  {pct(len(at), len(ped))}")
        print(f"  NAO foram atendidos   : {len(ped)-len(at)}  {pct(len(ped)-len(at), len(ped))}")
        cp = sum(1 for x in ped if x["converteu"])
        ca = sum(1 for x in at if x["converteu"])
        print(f"  conversao de quem pediu        : {cp}/{len(ped)}  {pct(cp, len(ped))}")
        print(f"  conversao de quem pediu E foi atendido: {ca}/{len(at)}  {pct(ca, len(at))}")

    print("\nSO BOT x CHEGOU A HUMANO")
    so_bot = [x for x in linhas if x["teve_bot"] and not x["teve_humano"]]
    com_h = [x for x in linhas if x["teve_humano"]]
    for rot, g in (("so bot", so_bot), ("chegou a humano", com_h)):
        c = sum(1 for x in g if x["converteu"])
        s = sum(1 for x in g if x["cliente_sumiu"])
        print(f"  {rot:<18} {len(g):>5}  ·  converteu {pct(c, len(g)):>6}  ·  cliente sumiu {pct(s, len(g)):>6}")

    if a.csv:
        import csv
        with open(a.csv, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(linhas[0].keys()))
            w.writeheader(); w.writerows(linhas)
        print(f"\ndetalhe em {a.csv}")


if __name__ == "__main__":
    main()
