import io, sys, subprocess
D = "/home/mila/.openclaw/workspace/scripts/mila-cutucada.py"
s = io.open(D, encoding="utf-8").read()
DE = "HORA_ABRE, HORA_FECHA = 9, 19"
PARA = ("# Janela de cutucada em BRT, decisao do Alf em 06/09/2026: 8h as 20h.\n"
        "# ⚠️ HORA_FECHA e EXCLUSIVA (`hora < HORA_FECHA`), entao 21 para incluir\n"
        "#    as cutucadas das 20h. E ⚠️ TEM DE CASAR COM O CRON: o cron roda em\n"
        "#    UTC (11-23 = 08-20 BRT) e esta checagem em BRT. Se os dois\n"
        "#    divergirem, o mais apertado vence EM SILENCIO — o cron dispara e o\n"
        "#    script sai sem fazer nada, sem erro e sem log de alarme.\n"
        "HORA_ABRE, HORA_FECHA = 8, 21")
if "decisao do Alf em 06/09/2026" in s:
    print("janela ja ajustada"); sys.exit(0)
n = s.count(DE)
assert n == 1, f"ancora da janela: esperava 1, achei {n}"
io.open(D, "w", encoding="utf-8", newline="\n").write(s.replace(DE, PARA, 1))
print("script: janela 8h-20h BRT")

# o cron, na mesma transacao logica
atual = subprocess.run(["crontab", "-u", "mila", "-l"], capture_output=True, text=True, check=True).stdout
DE_C, PARA_C = "0 12-21 * * 1-6", "0 11-23 * * 1-6"
linhas = [l.replace(DE_C, PARA_C) if ("cutucada" in l and DE_C in l) else l
          for l in atual.splitlines()]
tocadas = sum(1 for a, b in zip(atual.splitlines(), linhas) if a != b)
assert tocadas == 1, f"esperava tocar 1 linha do cron, toquei {tocadas}"
import tempfile
with tempfile.NamedTemporaryFile("w", suffix=".cron", delete=False) as f:
    f.write("\n".join(linhas) + "\n"); caminho = f.name
subprocess.run(["crontab", "-u", "mila", caminho], check=True)
print("cron: 11-23 UTC = 08-20 BRT")
