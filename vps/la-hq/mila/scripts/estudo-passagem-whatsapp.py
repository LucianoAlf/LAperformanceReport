#!/usr/bin/env python3
"""estudo-passagem-whatsapp.py — quem fecha passa pelo WhatsApp?

O estudo pareado de 05/09 encontrou, de lado, o achado que reenquadra a
pergunta: **25 dos 99 convertidos com conversa só tinham conversa DEPOIS da
matrícula**. Ou seja, um quarto de quem fecha não passou por uma conversa de
pré-venda nas caixas da Mila.

Isto mede esse número direito, em TODOS os convertidos do período, por unidade e
por canal. É a pergunta que decide onde investir: antes de melhorar a conversa,
saber quantos fecham sem ela.

Três desfechos por lead convertido:
  · `antes`  — teve conversa nas caixas da Mila ANTES da matrícula (o WhatsApp
               participou da venda)
  · `so_depois` — só há conversa a partir do dia da matrícula (pós-venda:
               confirmação, dados, lembrete de 1ª aula)
  · `nenhuma` — nunca houve conversa nessas caixas

⚠️ "Não passou pelo WhatsApp" NÃO quer dizer "não houve atendimento": pode ter
sido visita, ligação, indicação presencial ou conversa numa caixa que não é da
Mila (secretaria). O que este número mede é a participação das CAIXAS
COMERCIAIS da Mila na venda — que é onde o time atua e onde a Mila enxerga.

⚠️ O corte é o FIM DO DIA da matrícula em BRT, igual ao estudo pareado: a
confirmação costuma vir horas depois do fechamento, e cortar à meia-noite
classificaria como "antes" o que é pós-venda.

Uso:  estudo-passagem-whatsapp.py [--meses 6] [--csv saida.csv]
"""
import argparse
import datetime as dt
import importlib.util
import os
import sys
import time
from collections import defaultdict

BASE = os.path.dirname(os.path.abspath(__file__))


def _carrega(nome, arquivo):
    spec = importlib.util.spec_from_file_location(nome, os.path.join(BASE, arquivo))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# reusa a busca de conversa do estudo pareado — mesma regra de caixa e de
# telefone. Duas implementações da mesma busca divergiriam com o tempo.
est = _carrega("est", "estudo-atendimento-pareado.py")
mp = est.mp


def corte_do_dia(data_iso: str) -> int:
    d = dt.date.fromisoformat(data_iso)
    return int(dt.datetime(d.year, d.month, d.day, 23, 59, 59).timestamp()) + 3 * 3600


def pct(n, d):
    return f"{(100.0 * n / d):.1f}%" if d else "—"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--meses", type=int, default=6)
    ap.add_argument("--csv")
    a = ap.parse_args()
    mp.load_env()

    st, leads = mp.rest("POST", "/rest/v1/rpc/convertidos_do_periodo_v1", {"p_meses": a.meses})
    if st != 200:
        print(f"falhou ao buscar convertidos: {st} {leads}")
        sys.exit(1)
    print(f"convertidos no periodo: {len(leads)} ({a.meses} meses)\n")

    linhas = []
    for i, r in enumerate(leads, 1):
        try:
            achado = est.conversa_do_telefone(r["telefone"])
        except Exception as e:  # noqa: BLE001
            print(f"  [{i}] erro {r['lead_id']}: {e}", file=sys.stderr)
            achado = None
        if not achado:
            desfecho, antes, depois = "nenhuma", 0, 0
            conversa = None
        else:
            conversa, msgs = achado
            corte = corte_do_dia(r["data_conversao"]) if r.get("data_conversao") else None
            antes = sum(1 for m in msgs
                        if m.get("message_type") in (0, 1) and (m.get("content") or "").strip()
                        and (corte is None or (m.get("created_at") or 0) <= corte))
            depois = sum(1 for m in msgs
                         if m.get("message_type") in (0, 1) and (m.get("content") or "").strip()) - antes
            desfecho = "antes" if antes > 0 else ("so_depois" if depois > 0 else "nenhuma")
        linhas.append({**r, "conversa_id": conversa, "msgs_antes": antes,
                       "msgs_depois": depois, "passagem": desfecho})
        if i % 25 == 0:
            print(f"  ...{i}/{len(leads)}")
        time.sleep(0.15)

    print(f"\n{'='*72}")
    print(f"QUEM FECHOU PASSOU PELAS CAIXAS DA MILA? — {len(linhas)} matriculas")
    print(f"{'='*72}\n")

    def tabela(rotulo, chave):
        grupos = defaultdict(lambda: defaultdict(int))
        for x in linhas:
            grupos[x[chave]][x["passagem"]] += 1
            grupos[x[chave]]["total"] += 1
        print(f"{rotulo:<22} {'total':>6} {'antes':>12} {'só depois':>12} {'nenhuma':>12}")
        for k in sorted(grupos, key=lambda z: -grupos[z]["total"]):
            g = grupos[k]
            print(f"{str(k)[:22]:<22} {g['total']:>6} "
                  f"{g['antes']:>5} {pct(g['antes'], g['total']):>6} "
                  f"{g['so_depois']:>5} {pct(g['so_depois'], g['total']):>6} "
                  f"{g['nenhuma']:>5} {pct(g['nenhuma'], g['total']):>6}")
        print()

    total = len(linhas)
    for d in ("antes", "so_depois", "nenhuma"):
        n = sum(1 for x in linhas if x["passagem"] == d)
        print(f"  {d:<10} {n:>4}  {pct(n, total)}")
    print()
    tabela("POR UNIDADE", "unidade")
    tabela("POR CANAL", "canal")

    if a.csv:
        import csv
        with open(a.csv, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(linhas[0].keys()))
            w.writeheader()
            w.writerows(linhas)
        print(f"detalhe por lead em {a.csv}")


if __name__ == "__main__":
    main()
