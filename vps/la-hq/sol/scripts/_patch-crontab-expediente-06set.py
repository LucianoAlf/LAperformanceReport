#!/usr/bin/env python3
"""EMBRULHA OS CRONS OPERACIONAIS DA SOL COM O GUARD DE EXPEDIENTE (06/09/2026).

Decisao do Luciano: em dia sem expediente a Sol nao abre caixa, nao fecha
caixa, nao manda relatorio e nao manda aviso previo — "assim como era no
domingo". O cron ja sabe pular domingo (`* * 1-6`), mas nao sabe o que e
feriado nem recesso.

O que ENTRA no guard:
  · relatorio admin e comercial (2 linhas cada: dia util + sabado)
  · caixa abrir e fechar, das 3 unidades
  · aviso previo, das 3 unidades

O que FICA DE FORA, de proposito:
  · backup diario — precisa rodar todo dia, inclusive feriado
  · fechamento mensal (dia 1) — o mes fecha mesmo se o dia 1 cair em feriado;
    era 01/09 numa terca, mas 01/11 cai num domingo e 01/05 e feriado
  · watchers de 1 minuto e @reboot — nao sao operacao de escola

⚠️ O guard vai DEPOIS do `flock` E DEPOIS do `cron-alerta.py <job>`, nunca
   antes. Antes do flock, o alarme dispararia em situacao normal de lock
   ocupado (licao de 01/09). Antes do cron-alerta, o pulo no feriado nao seria
   registrado no log do job.

⚠️ Guard por UNIDADE onde a unidade e conhecida (caixa e aviso previo), e de
   REDE nos relatorios — eles cobrem os 3 grupos numa chamada so, entao so
   fazem sentido pular quando a rede inteira esta parada.

  python3 _patch-crontab-expediente-06set.py [--aplicar]
"""
import re
import subprocess
import sys

GUARD = "/home/sol/.openclaw/workspace/scripts/so-com-expediente.py"

# job do cron-alerta -> slug de unidade (None = rede)
ALVOS = {
    "lareport-adm": None,
    "lareport-comercial": None,
    "relatorio-adm": None,
    "relatorio-comercial": None,
    "caixa-abrir-barra": "barra",
    "caixa-abrir-recreio": "recreio",
    "caixa-abrir-cg": "cg",
    "caixa-fechar-barra": "barra",
    "caixa-fechar-recreio": "recreio",
    "caixa-fechar-cg": "cg",
    "aviso-previo-barra": "barra",
    "aviso-previo-recreio": "recreio",
    "aviso-previo-campo-grande": "cg",
}


def main():
    aplicar = "--aplicar" in sys.argv
    atual = subprocess.run(["crontab", "-u", "sol", "-l"],
                           capture_output=True, text=True, check=True).stdout

    if GUARD in atual:
        print("o crontab ja usa o guard — nada a fazer")
        return 0

    saida, tocadas, por_job = [], 0, {}
    for linha in atual.splitlines():
        nova = linha
        for job, slug in ALVOS.items():
            # a ancora e `cron-alerta.py <job> ` — com o espaco, para
            # `caixa-abrir-cg` nao casar dentro de outro nome
            anc = f"cron-alerta.py {job} "
            if anc in linha:
                un = f"--unidade {slug} " if slug else ""
                nova = linha.replace(anc, f"{anc}{GUARD} {un}-- ", 1)
                tocadas += 1
                por_job[job] = por_job.get(job, 0) + 1
                break
        saida.append(nova)

    novo = "\n".join(saida) + "\n"

    print(f"linhas embrulhadas: {tocadas}")
    for j in sorted(por_job):
        print(f"  {j}: {por_job[j]}")
    faltando = [j for j in ALVOS if j not in por_job]
    if faltando:
        print(f"AVISO: jobs sem nenhuma linha no crontab: {', '.join(sorted(faltando))}")

    # guardas duras antes de escrever
    if tocadas < 14:
        print(f"ERRO: esperava ao menos 14 linhas, embrulhei {tocadas} — nao escrevo",
              file=sys.stderr)
        return 1
    if len(saida) != len(atual.splitlines()):
        print("ERRO: o numero de linhas mudou — nao escrevo", file=sys.stderr)
        return 1
    # nenhuma linha de 1 minuto, backup ou fechamento mensal pode ter sido tocada
    for linha in saida:
        if GUARD in linha and re.match(r"^\*\s+\*\s+\*\s+\*\s+\*", linha):
            print(f"ERRO: guard entrou numa linha de 1 minuto: {linha[:90]}", file=sys.stderr)
            return 1
        if GUARD in linha and ("backup" in linha or "fechamento-mensal" in linha):
            print(f"ERRO: guard entrou em backup/fechamento mensal: {linha[:90]}", file=sys.stderr)
            return 1

    if not aplicar:
        print("\n(ensaio — rode com --aplicar para gravar)")
        for l in saida:
            if GUARD in l:
                print("  " + l[:170])
        return 0

    import tempfile
    with tempfile.NamedTemporaryFile("w", suffix=".cron", delete=False) as f:
        f.write(novo)
        caminho = f.name
    subprocess.run(["crontab", "-u", "sol", caminho], check=True)
    print(f"crontab da sol atualizado ({tocadas} linhas)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
