#!/usr/bin/env python3
"""estudo-conversa-de-uma-mensagem.py — quem fala UMA vez e some.

Pendência 9 da base comercial (bloco 11): das conversas em que o cliente
escreveu **uma única vez** e nunca mais voltou, de que canal elas vêm e o que
está escrito na primeira mensagem? Antes de mexer no bot, saber se é lead ruim
(canal), pergunta que o bot não soube responder (texto), ou horário morto.

🔴 POR QUE NÃO DÁ PARA RESPONDER COM O CSV QUE JÁ EXISTE: o
`mila-sdr-cota.csv` **já saiu anonimizado da extração** — `telefone_fim` é um
hash (`c_00bc4e`), não os 8 dígitos. Foi a decisão certa na hora (PII nunca
tocou o repo) e é justamente o que impede o join com `leads` agora. O telefone
precisa ser lido de novo do Chatwoot, cruzado em memória, e só o AGREGADO sai
daqui.

⚠️ A saída NÃO tem telefone nem nome. Sai: canal, unidade, conversão, e o texto
da 1ª mensagem **classificado por tema** — mais a amostra literal só com
`--amostra`, que grava em `.local/` (gitignored), nunca no stdout.

Uso:  estudo-conversa-de-uma-mensagem.py [--meses 6] [--max 900] [--amostra saida.csv]
"""
import argparse
import datetime as dt
import importlib.util
import os
import re
import sys
from collections import Counter, defaultdict

BASE = os.path.dirname(os.path.abspath(__file__))
_s = importlib.util.spec_from_file_location("est", os.path.join(BASE, "estudo-atendimento-pareado.py"))
est = importlib.util.module_from_spec(_s)
_s.loader.exec_module(est)
mp = est.mp

CAIXAS = {147: "Barra", 148: "Recreio", 155: "Campo Grande"}

# Tema da primeira (e única) mensagem. Ordem importa: o primeiro que casar vence,
# e "quanto custa" é mais informativo que "oi".
TEMAS = [
    ("preço",        r"\b(pre[çc]o|valor|quanto\s+(custa|é|fica|sai)|mensalidade|investimento|or[çc]amento)\b"),
    ("horário",      r"\b(hor[áa]rio|que\s+horas?|manh[ãa]|tarde|noite|s[áa]bado|dispon[íi]vel)\b"),
    ("curso",        r"\b(viol[ãa]o|guitarra|baixo|teclado|piano|bateria|canto|voz|sax|flauta|violino|ukulele|musicaliza)\b"),
    ("idade",        r"\b(anos?|idade|crian[çc]a|filh[oa]|beb[êe]|adulto)\b"),
    ("aula grátis",  r"\b(experimental|aula\s+gr[áa]tis|teste|conhecer)\b"),
    ("endereço",     r"\b(endere[çc]o|onde\s+(fica|é|vc|voc[êe])|localiza|fica\s+onde)\b"),
    ("saudação só",  r"^\W*(oi+|ol[áa]+|bom\s+dia|boa\s+(tarde|noite)|e\s*a[íi])\W*$"),
]


def tema(txt: str) -> str:
    t = (txt or "").strip()
    if not t:
        return "(vazia)"
    for nome, re_ in TEMAS:
        if re.search(re_, t, re.IGNORECASE):
            return nome
    return "outro"


def pct(n, d):
    return f"{(100.0*n/d):.1f}%" if d else "—"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--meses", type=int, default=6)
    ap.add_argument("--max", type=int, default=900)
    ap.add_argument("--amostra")
    a = ap.parse_args()
    mp.load_env()

    desde = (dt.datetime.now() - dt.timedelta(days=30 * a.meses)).strftime("%Y-%m-%d")
    # ⚠️ COTA POR CAIXA, não teto global — a lição de 05/09: com teto global a
    # última unidade fica com ZERO e a comparação entre unidades vira ficção.
    cota = max(1, a.max // len(CAIXAS))
    achados = []

    for caixa in CAIXAS:
        na_caixa, pagina = 0, 1
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
                if dt.datetime.fromtimestamp(cv.get("created_at") or 0).strftime("%Y-%m-%d") < desde:
                    continue
                na_caixa += 1
                try:
                    dm = mp._cw("GET", f"/conversations/{cv['id']}/messages")
                except Exception:  # noqa: BLE001
                    continue
                msgs = sorted((dm.get("payload") or []), key=lambda m: m.get("created_at", 0))
                do_cliente = [m for m in msgs
                              if m.get("message_type") == 0 and (m.get("content") or "").strip()]
                if len(do_cliente) != 1:
                    continue
                tel = re.sub(r"\D", "", ((cv.get("meta") or {}).get("sender") or {}).get("phone_number") or "")
                achados.append({
                    "caixa": CAIXAS[caixa],
                    "tel": tel,                       # fica só em memória
                    "texto": (do_cliente[0].get("content") or "").strip(),
                    "hora": dt.datetime.fromtimestamp(do_cliente[0].get("created_at") or 0).hour,
                })
                if na_caixa >= cota:
                    break
            pagina += 1
            print(f"  caixa {CAIXAS[caixa]} · pág {pagina} · {na_caixa}/{cota}", file=sys.stderr)

    if not achados:
        print("nada medido")
        return

    # ── canal e conversão, pelo telefone, resolvidos no banco ────────────────
    canais, convertidos = {}, set()
    st, leads = mp.rest("POST", "/rest/v1/rpc/convertidos_do_periodo_v1", {"p_meses": a.meses + 1})
    if st == 200:
        convertidos = {re.sub(r"\D", "", x["telefone"])[-8:] for x in (leads or [])}
    for x in achados:
        fim = x["tel"][-8:]
        x["converteu"] = fim in convertidos
    st, dados = mp.rest("GET", "/rest/v1/leads?select=telefone,canal_origem_id,canais_origem(nome)"
                                "&order=created_at.desc&limit=6000")
    if st == 200:
        for l in (dados or []):
            f = re.sub(r"\D", "", l.get("telefone") or "")[-8:]
            if f and f not in canais:
                canais[f] = ((l.get("canais_origem") or {}) or {}).get("nome") or "(sem canal)"
    for x in achados:
        x["canal"] = canais.get(x["tel"][-8:], "(lead não encontrado)")

    n = len(achados)
    print(f"\n{'='*70}\nCONVERSAS EM QUE O CLIENTE FALOU UMA VEZ SÓ — {n}\n{'='*70}\n")
    conv = sum(1 for x in achados if x["converteu"])
    print(f"converteram: {conv}  {pct(conv, n)}\n")

    for rotulo, chave in (("POR UNIDADE", "caixa"), ("POR CANAL", "canal"), ("TEMA DA 1ª MENSAGEM", None)):
        print(rotulo)
        c = Counter(tema(x["texto"]) if chave is None else x[chave] for x in achados)
        for k, v in c.most_common():
            print(f"  {str(k)[:26]:<26} {v:>4}  {pct(v, n)}")
        print()

    print("POR FAIXA DE HORÁRIO (BRT)")
    faixas = defaultdict(int)
    for x in achados:
        h = x["hora"]
        faixas["00-08 madrugada" if h < 8 else "08-12 manhã" if h < 12
               else "12-18 tarde" if h < 18 else "18-24 noite"] += 1
    for k in sorted(faixas):
        print(f"  {k:<18} {faixas[k]:>4}  {pct(faixas[k], n)}")

    if a.amostra:
        import csv
        with open(a.amostra, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=["caixa", "canal", "converteu", "hora", "tema", "texto"])
            w.writeheader()
            for x in achados:
                w.writerow({"caixa": x["caixa"], "canal": x["canal"], "converteu": x["converteu"],
                            "hora": x["hora"], "tema": tema(x["texto"]), "texto": x["texto"][:300]})
        print(f"\namostra (SEM telefone) em {a.amostra}")


if __name__ == "__main__":
    main()
