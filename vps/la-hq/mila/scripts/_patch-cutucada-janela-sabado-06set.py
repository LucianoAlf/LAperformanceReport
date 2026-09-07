import io, sys, subprocess, tempfile
D = "/home/mila/.openclaw/workspace/scripts/mila-cutucada.py"
s = io.open(D, encoding="utf-8").read()
if "def janela_do_dia" in s:
    print("janela de sabado ja ajustada"); sys.exit(0)

DE = """# Janela de cutucada em BRT, decisao do Alf em 06/09/2026: 8h as 20h.
# ⚠️ HORA_FECHA e EXCLUSIVA (`hora < HORA_FECHA`), entao 21 para incluir
#    as cutucadas das 20h. E ⚠️ TEM DE CASAR COM O CRON: o cron roda em
#    UTC (11-23 = 08-20 BRT) e esta checagem em BRT. Se os dois
#    divergirem, o mais apertado vence EM SILENCIO — o cron dispara e o
#    script sai sem fazer nada, sem erro e sem log de alarme.
HORA_ABRE, HORA_FECHA = 8, 21"""

PARA = '''# Janela de cutucada em BRT, decisao do Alf em 06/09/2026:
#   seg a sex ..... 8h as 20h
#   sabado ........ 8h as 16h   (a escola fecha mais cedo)
#
# ⚠️ A HORA DE FECHAR E EXCLUSIVA (`hora < fecha`), entao 21 e 17 para incluir
#    as cutucadas das 20h e das 16h.
# ⚠️ TEM DE CASAR COM O CRON, que roda em UTC e agora sao DUAS linhas:
#      0 11-23 * * 1-5   = 08-20 BRT
#      0 11-19 * * 6     = 08-16 BRT
#    Se os dois divergirem, o mais apertado vence EM SILENCIO — o cron dispara,
#    o script sai sem fazer nada, e nao ha erro nem alarme. So aparece semanas
#    depois, quando alguem pergunta "por que nao cutucou naquele horario?".
HORA_ABRE = 8
FECHA_SEMANA, FECHA_SABADO = 21, 17


def janela_do_dia(agora):
    """(abre, fecha) em BRT para o dia da semana de `agora`. Domingo devolve
    janela vazia — mas quem barra domingo de verdade e o cron (`* * 1-6`) e o
    guard de expediente; isto aqui e a terceira linha."""
    if agora.weekday() >= 6:          # domingo
        return (0, 0)
    if agora.weekday() == 5:          # sabado
        return (HORA_ABRE, FECHA_SABADO)
    return (HORA_ABRE, FECHA_SEMANA)'''

n = s.count(DE)
assert n == 1, f"ancora do bloco da janela: esperava 1, achei {n}"
s = s.replace(DE, PARA, 1)

DE2 = "    if not a.forcar_horario and not (HORA_ABRE <= agora.hour < HORA_FECHA and agora.weekday() < 6):"
PARA2 = ("    _abre, _fecha = janela_do_dia(agora)\n"
         "    if not a.forcar_horario and not (_abre <= agora.hour < _fecha):")
n2 = s.count(DE2)
assert n2 == 1, f"ancora da checagem: esperava 1, achei {n2}"
s = s.replace(DE2, PARA2, 1)
io.open(D, "w", encoding="utf-8", newline="\n").write(s)
print("script: seg-sex 8-20, sabado 8-16")

atual = subprocess.run(["crontab","-u","mila","-l"], capture_output=True, text=True, check=True).stdout
linhas, tocadas = [], 0
for l in atual.splitlines():
    if "cutucada" in l and "0 11-23 * * 1-6" in l:
        linhas.append(l.replace("0 11-23 * * 1-6", "0 11-23 * * 1-5"))
        linhas.append(l.replace("0 11-23 * * 1-6", "0 11-19 * * 6"))
        tocadas += 1
    else:
        linhas.append(l)
assert tocadas == 1, f"esperava 1 linha de cutucada, achei {tocadas}"
with tempfile.NamedTemporaryFile("w", suffix=".cron", delete=False) as f:
    f.write("\n".join(linhas) + "\n"); caminho = f.name
subprocess.run(["crontab","-u","mila",caminho], check=True)
print("cron: 11-23 seg-sex + 11-19 sabado (UTC)")
