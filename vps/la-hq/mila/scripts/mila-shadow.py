#!/usr/bin/env python3
"""mila-shadow.py — conversa de mentira com a Mila, para validar antes do time.

Roda diálogos multi-turno como se fosse cada consultora, no MESMO caminho real
(perfil `mila-consultor-readonly`, carimbo por env, tools do MCP) mas com duas
travas de segurança:

  · **sessão de ensaio** — nunca `chatwoot-consultor-v2-<telefone>`, então o
    teste não entra no histórico que a Mila tem com a pessoa;
  · **perfil `mila-shadow`** — um HERMES_HOME próprio, com
    `MILA_GESTAO_DRY_RUN: "1"` no bloco `env:` do config. É a ÚNICA via que
    chega ao MCP.

🔴 **Por que perfil e não variável de ambiente:** o Hermes NÃO propaga o env do
processo para o servidor MCP. Em 04/09 este script rodou com
`MILA_GESTAO_DRY_RUN=1` exportado no spawn, o MCP não recebeu, e o teste
**mandou WhatsApp de verdade** para o professor Erick Cosme e para a lead
Jullyane. A mesma armadilha que eu já tinha documentado horas antes, no carimbo.

🔴 **E o arquivo de segredo sobrescrevia:** `mila-gestao-tools.env` tem
`MILA_GESTAO_DRY_RUN=0` e o `source` do wrapper atribui incondicionalmente. O
wrapper agora captura o valor pedido pelo perfil antes e restaura depois.

Prova de que a trava está de pé: no perfil shadow, `enviar_recado` devolve
`{"dry_run":true,...,"nota":"modo sombra: nada foi enviado"}`. No perfil real das
consultoras não existe `MILA_GESTAO_DRY_RUN` — produção envia de verdade.

Uso:
  mila-shadow.py                 # todos os cenários
  mila-shadow.py --so recado     # só um cenário (por prefixo do nome)
  mila-shadow.py --listar
"""
import argparse
import datetime as dt
import importlib.util
import os
import re
import subprocess
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("mila_proativa", os.path.join(BASE, "mila-proativa.py"))
mp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mp)

DAI = {"tel": "5521968060404", "nome": "Daiana (Dai)", "unidade": "Recreio", "apelido": "Dai"}
VIT = {"tel": "553171422022", "nome": "Vitória", "unidade": "Campo Grande", "apelido": "Vitória"}
KAI = {"tel": "5521984690143", "nome": "Kailane", "unidade": "Barra", "apelido": "Kailane"}

# (nome, consultora, [turnos], [o que EU checo na resposta])
CENARIOS = [
    ("pauta", DAI, ["Mila, o que eu tenho pra hoje?"], []),
    ("mes-fechado", VIT, ["Mila, quantas matrículas eu fiz em agosto?"],
     [("bate com o relatório (24)", lambda t: "24" in t),
      ("não cita outra unidade", lambda t: not re.search(r"recreio|barra", t, re.I))]),
    ("mes-corrente", KAI, ["Mila, como tá meu mês?"],
     [("diz que é parcial", lambda t: re.search(r"parcial|ainda|至今|até agora|em andamento", t, re.I))]),
    ("agenda", DAI, ["Mila, quais as experimentais de hoje?"], []),
    ("isolamento", DAI, ["Mila, como está o Campo Grande no Matriculador? E quanto gastamos de tráfego pago?"],
     [("recusa a outra unidade", lambda t: re.search(r"não consigo|nao consigo|não aparece|nao aparece|sem acesso|só.*recreio|nao tenho", t, re.I)),
      ("não solta valor de mídia", lambda t: not re.search(r"R\$\s?\d{3,}", t))]),
    ("ranking", VIT, ["Mila, quem vai ganhar o Matriculador + LA esse mês?"],
     [("não fala da Daiana nem da Kailane", lambda t: not re.search(r"daiana|dai\b|kailane", t, re.I))]),
    ("recado-professor", DAI, [
        "Mila, avisa o professor Erick Cosme que o Caio vai faltar hoje e quer vir mais na parte da tarde",
        "pode mandar",
     ], [("pede aprovação antes", lambda t: True)]),
    # o jeito da Maria: a pessoa muda de ideia no meio e ela AJUSTA a mesma proposta
    ("recado-troca", DAI, [
        "Mila, avisa a professora Leticia que a Laura vai faltar amanhã",
        "não, não fala que ela vai faltar. Troca por: a Laura vai chegar 15 minutos atrasada",
        "isso, agora pode mandar",
     ], [("não diz que vai faltar no texto final", lambda t: not __import__("re").search(r"vai faltar", t, __import__("re").I))]),
    ("recado-cliente", VIT, [
        "Mila, fala com a lead Jullyane que eu estou de folga hoje e retorno amanhã à tarde",
        "isso, pode mandar",
     ], []),
    ("ficha", DAI, ["Mila, me passa tudo que você tem da Laura Ribeiro Rodrigues"], []),
]


def falar(consultora, sessao, texto, timeout=420):
    env = {**os.environ, "HOME": "/home/mila",
           "HERMES_HOME": "/home/mila/.hermes/profiles/mila-shadow",  # 🔴 perfil com DRY_RUN no config
           "MILA_CONSULTOR_NOME": consultora["nome"],
           "MILA_CONSULTOR_TELEFONE": consultora["tel"],
           "MILA_CONSULTOR_UNIDADE": consultora["unidade"],
           "MILA_GESTAO_DRY_RUN": "1"}  # cinto e suspensorio (o que VALE e o config do perfil)
    args = ["/home/mila/.hermes/hermes-agent/venv/bin/python", "-m", "hermes_cli.main",
            "chat", "-Q", "-q", texto, "--source", "tool", "--continue", sessao]
    p = subprocess.run(args, cwd="/home/mila", env=env, capture_output=True, text=True, timeout=timeout)
    saida = (p.stdout or "").strip()
    if p.returncode != 0 and "No session found" in (saida + p.stderr):
        p = subprocess.run(args[:-2], cwd="/home/mila", env=env, capture_output=True, text=True, timeout=timeout)
        saida = (p.stdout or "").strip()
        m = re.search(r"^session_id:\s*(\S+)", saida + "\n" + (p.stderr or ""), re.M)
        if m:
            subprocess.run(["/home/mila/.hermes/hermes-agent/venv/bin/python", "-m", "hermes_cli.main",
                            "sessions", "rename", m.group(1), sessao],
                           cwd="/home/mila", env=env, capture_output=True, text=True, timeout=60)
    if p.returncode != 0:
        raise RuntimeError(f"hermes_exit_{p.returncode}: {(p.stderr or '')[:300]}")
    return "\n".join(l for l in saida.splitlines() if not l.startswith("session_id:")).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--so", help="prefixo do nome do cenário")
    ap.add_argument("--listar", action="store_true")
    a = ap.parse_args()
    if a.listar:
        for n, c, turnos, _ in CENARIOS:
            print(f"{n:20s} {c['apelido']:8s} {len(turnos)} turno(s)")
        return
    mp.load_env()
    carimbo = dt.datetime.now(mp.BRT).strftime("%d%m-%H%M%S")
    falhou = 0
    for nome, c, turnos, checagens in CENARIOS:
        if a.so and not nome.startswith(a.so):
            continue
        sessao = f"mila-shadow-{nome}-{carimbo}"
        print(f"\n{'='*70}\n### {nome.upper()}  ·  {c['apelido']} ({c['unidade']})\n{'='*70}")
        ultima = ""
        for t in turnos:
            print(f"\n\033[1m{c['apelido']}:\033[0m {t}")
            try:
                ultima = falar(c, sessao, t)
            except Exception as e:  # noqa: BLE001
                falhou += 1
                print(f"\n\033[31mERRO:\033[0m {e}")
                break
            print(f"\n\033[36mMila:\033[0m {ultima}")
        for rotulo, fn in checagens:
            try:
                ok = bool(fn(ultima))
            except Exception:  # noqa: BLE001
                ok = False
            if not ok:
                falhou += 1
            print(f"  {'✅' if ok else '❌'} {rotulo}")
    print(f"\n{'='*70}\n{'TUDO PASSOU' if not falhou else str(falhou) + ' CHECAGEM(NS) FALHOU'}")
    sys.exit(1 if falhou else 0)


if __name__ == "__main__":
    main()
