#!/usr/bin/env python3
"""estudo-atendimento-pareado.py — o padrão existe antes de virar agente?

Mede, numa AMOSTRA PAREADA (mesma unidade, mesmo canal, mesmo mês), se as duas
marcas de mau atendimento do bloco "Atendimento Bumerangue" aparecem mais nas
conversas que NÃO viraram matrícula:

  S1 — a bola ficou com o cliente: a escola mandou 2+ mensagens seguidas sem
       nenhuma pergunta de retorno.
  S2 — o bumerangue não voltou: o cliente perguntou preço e, depois disso, nunca
       mais falou.

🔴 POR QUE PAREADO: comparar convertido com não-convertido sem parear mede o
CANAL, não o atendimento — indicação converte ~5x mais que Instagram, então
qualquer amostra desbalanceada "descobriria" que conversa de indicação é melhor.

🔴 POR QUE DETERMINÍSTICO: antes de pagar LLM por conversa e antes de apontar o
dedo para alguém, é preciso saber se o sinal separa. Se não separar aqui, ele não
vira agente. Contar mensagem e achar interrogação não precisa de modelo.

⚠️ ISTO É CORRELAÇÃO. Conversa boa pode ser consequência de lead bom, não causa
da matrícula. O resultado diz se vale investigar, não que a técnica causou a
venda.

Uso:  estudo-atendimento-pareado.py [--pares 120] [--meses 6] [--csv saida.csv]
"""
import argparse
import importlib.util
import json
import os
import re
import sys
import time

BASE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("mp", os.path.join(BASE, "mila-proativa.py"))
mp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mp)

# ── as duas réguas ──────────────────────────────────────────────────────────
# "pergunta" no WhatsApp quase nunca tem "?": o bloco diz isso e a medição
# confirma. Por isso a marca é o ponto de interrogação OU vocabulário
# interrogativo/convite explícito.
INTERROGATIVA = re.compile(
    r"\?|\b(qual|quais|quando|como|onde|quanto|quantos|quantas|por que|porque|"
    r"prefere|preferem|quer|querem|poderia|podemos|posso|pode|consegue|conseguem|"
    r"me diz|me conta|qual seria|o que)\b",
    re.IGNORECASE,
)
PRECO = re.compile(
    r"\b(pre[çc]o|valor|valores|quanto custa|quanto [ée]|quanto fica|mensalidade|"
    r"mensalidades|investimento|or[çc]amento|tabela)\b",
    re.IGNORECASE,
)
# Mensagem disparada por automação: não é técnica de ninguém e distorceria S1.
AUTOMATICA = re.compile(
    r"Aula Experimental Gratuita foi marcada|Lembrete de Aula Experimental|"
    r"Visita Presencial Agendada|Resumo da Qualifica|O agendamento já está salvo",
    re.IGNORECASE,
)

CAIXAS_MILA = {147, 148, 155}


def tem_pergunta(t: str) -> bool:
    return bool(INTERROGATIVA.search(t or ""))


def avaliar(msgs):
    """Recebe as mensagens em ordem e devolve os dois sinais + contexto."""
    falas = []
    for m in msgs:
        if m.get("message_type") == 2:          # evento de sistema
            continue
        txt = (m.get("content") or "").strip()
        if not txt:
            continue
        quem = "cliente" if m.get("message_type") == 0 else "escola"
        auto = quem == "escola" and bool(AUTOMATICA.search(txt))
        falas.append({"quem": quem, "txt": txt, "auto": auto})

    if not falas:
        return None

    # S1: maior sequência de mensagens da ESCOLA (fora as automáticas) sem pergunta
    maior_run, run = 0, 0
    for f in falas:
        if f["quem"] == "escola" and not f["auto"]:
            run = run + 1 if not tem_pergunta(f["txt"]) else 0
            maior_run = max(maior_run, run)
        elif f["quem"] == "cliente":
            run = 0
    s1 = maior_run >= 2

    # S2: o cliente perguntou preço e, depois da ÚLTIMA vez, nunca mais falou
    idx_preco = [i for i, f in enumerate(falas) if f["quem"] == "cliente" and PRECO.search(f["txt"])]
    perguntou_preco = bool(idx_preco)
    s2 = False
    if idx_preco:
        depois = falas[idx_preco[-1] + 1:]
        s2 = not any(f["quem"] == "cliente" for f in depois)

    escola = [f for f in falas if f["quem"] == "escola" and not f["auto"]]
    return {
        "mensagens": len(falas),
        "do_cliente": sum(1 for f in falas if f["quem"] == "cliente"),
        "da_escola": len(escola),
        "escola_com_pergunta": sum(1 for f in escola if tem_pergunta(f["txt"])),
        "maior_sequencia_sem_pergunta": maior_run,
        "s1_bola_com_o_cliente": s1,
        "perguntou_preco": perguntou_preco,
        "s2_morreu_apos_preco": s2,
    }


def conversa_do_telefone(tel: str):
    """A conversa mais longa do contato nas caixas comerciais da Mila."""
    dig = re.sub(r"\D", "", tel or "")
    if len(dig) < 10:
        return None
    busca = mp._cw("GET", f"/contacts/search?q={dig}")
    melhor = None
    for c in (busca.get("payload") or []):
        if re.sub(r"\D", "", c.get("phone_number") or "")[-8:] != dig[-8:]:
            continue
        convs = mp._cw("GET", f"/contacts/{c['id']}/conversations")
        for cv in (convs.get("payload") or []):
            if cv.get("inbox_id") not in CAIXAS_MILA:
                continue
            d = mp._cw("GET", f"/conversations/{cv['id']}/messages")
            msgs = sorted((d.get("payload") or []), key=lambda m: m.get("created_at", 0))
            if melhor is None or len(msgs) > len(melhor[1]):
                melhor = (cv["id"], msgs)
    return melhor


def pct(n, d):
    return f"{(100.0 * n / d):.1f}%" if d else "—"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pares", type=int, default=120)
    ap.add_argument("--meses", type=int, default=6)
    ap.add_argument("--csv")
    a = ap.parse_args()
    mp.load_env()

    st, amostra = mp.rest("POST", "/rest/v1/rpc/amostra_pareada_atendimento_v1",
                          {"p_pares": a.pares, "p_meses": a.meses})
    if st != 200:
        print(f"falhou ao buscar amostra: {st} {amostra}")
        sys.exit(1)
    print(f"amostra: {len(amostra)} leads · {a.pares} pares · {a.meses} meses")

    linhas, sem_conversa = [], 0
    for i, r in enumerate(amostra, 1):
        try:
            achado = conversa_do_telefone(r["telefone"])
        except Exception as e:  # noqa: BLE001
            print(f"  [{i}] erro {r['lead_id']}: {e}", file=sys.stderr)
            achado = None
        if not achado:
            sem_conversa += 1
            continue
        v = avaliar(achado[1])
        if not v:
            sem_conversa += 1
            continue
        linhas.append({**r, "conversa_id": achado[0], **v})
        if i % 20 == 0:
            print(f"  ...{i}/{len(amostra)} · com conversa: {len(linhas)}")
        time.sleep(0.15)

    if not linhas:
        print("nenhuma conversa encontrada — nada a medir")
        return

    conv = [x for x in linhas if x["converteu"]]
    nao = [x for x in linhas if not x["converteu"]]
    print(f"\n{'='*66}")
    print(f"MEDIDO: {len(linhas)} conversas ({len(conv)} matricularam · {len(nao)} não)")
    print(f"sem conversa nas caixas da Mila: {sem_conversa}")
    print(f"{'='*66}\n")

    def bloco(rotulo, chave, universo_conv=None, universo_nao=None):
        c = universo_conv if universo_conv is not None else conv
        n = universo_nao if universo_nao is not None else nao
        cc = sum(1 for x in c if x[chave])
        nn = sum(1 for x in n if x[chave])
        print(f"{rotulo}")
        print(f"   matricularam    : {cc:3d}/{len(c):3d}  {pct(cc, len(c))}")
        print(f"   NÃO matricularam: {nn:3d}/{len(n):3d}  {pct(nn, len(n))}")
        if len(c) and len(n):
            dif = (nn / len(n)) - (cc / len(c))
            print(f"   diferença       : {dif*100:+.1f} pontos"
                  f"{'  ← aparece mais em quem NÃO fechou' if dif > 0 else ''}")
        print()

    bloco("S1 — a bola ficou com o cliente (2+ msgs da escola sem pergunta)",
          "s1_bola_com_o_cliente")

    cp_c = [x for x in conv if x["perguntou_preco"]]
    cp_n = [x for x in nao if x["perguntou_preco"]]
    print(f"perguntaram preço: {len(cp_c)} de {len(conv)} que fecharam · "
          f"{len(cp_n)} de {len(nao)} que não fecharam\n")
    bloco("S2 — morreu depois de perguntar preço (só entre quem perguntou)",
          "s2_morreu_apos_preco", cp_c, cp_n)

    for rot, chave in (("mensagens da escola COM pergunta", "escola_com_pergunta"),
                       ("mensagens no total", "mensagens")):
        mc = sum(x[chave] for x in conv) / len(conv)
        mn = sum(x[chave] for x in nao) / len(nao)
        print(f"média de {rot}: fechou {mc:.1f} · não fechou {mn:.1f}")

    if a.csv:
        import csv
        with open(a.csv, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(linhas[0].keys()))
            w.writeheader()
            w.writerows(linhas)
        print(f"\ndetalhe por conversa em {a.csv}")


if __name__ == "__main__":
    main()
