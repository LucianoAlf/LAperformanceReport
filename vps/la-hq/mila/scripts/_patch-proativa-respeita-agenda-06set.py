#!/usr/bin/env python3
"""A MILA PASSA A SABER SE A ESCOLA ABRE HOJE (06/09/2026).

Motivo imediato: **07/09/2026 e feriado da Independencia e cai numa segunda**.
Os crons disparariam 08:30 e 18:30 normalmente, e seria o PRIMEIRO briefing da
lideranca na historia — num dia em que a escola esta fechada. Mensagem
automatica em dia sem expediente ensina a pessoa a ignorar o canal, que e o
oposto do que a proatividade serve.

A fonte e a RPC `escola_agenda_v1`, que deriva o expediente da GRADE
(`aulas_emusys`) em vez de uma tabela de feriado cadastrada a mao. Medido:
07/09 tem **1 aula viva** contra um tipico de **319** nas segundas. Cobre
feriado, recesso escolar e ponte com a mesma regra, sem ninguem cadastrar nada.

⚠️ SILENCIO SO QUANDO A RESPOSTA E "FECHADO" COM CERTEZA. `tem_expediente` vem
   `null` quando nao ha base de comparacao (data fora do horizonte do sync), e
   nesse caso a Mila FALA. Tratar "nao sei" como "fechado" faria ela emudecer
   para sempre no dia em que o sync atrasasse — e o briefing que nao chega e
   invisivel, ninguem reclama, ninguem descobre.

⚠️ Vale para os DOIS publicos e para os DOIS tipos (manha e fim de dia). No
   fim de dia e ate mais obvio: nao houve dia para fechar.

⚠️ A cutucada de hora em hora tambem para. Ela e a mais barulhenta das tres.

  python3 _patch-proativa-respeita-agenda-06set.py <mila-proativa.py> <mila-cutucada.py>
"""
import io
import sys

FUNCAO = '''
def escola_abre(dia, unidade_id=None):
    """A escola tem expediente nesse dia?

    Deriva da GRADE (`escola_agenda_v1`), nao de tabela de feriado: 07/09/2026
    tem 1 aula viva contra um tipico de 319 nas segundas. Cobre feriado,
    recesso e ponte com a mesma regra.

    Devolve (abre: bool, detalhe: dict). ⚠️ Quando a RPC responde
    `tem_expediente = None` (sem base de comparacao), esta funcao devolve
    **True** de proposito: "nao sei" nunca pode virar silencio, senao um atraso
    de sync emudece a Mila sem ninguem perceber.
    """
    try:
        r = rpc("escola_agenda_v1", {"p_de": dia, "p_ate": dia,
                                     "p_unidade_id": unidade_id})
        d = (r or [{}])[0] if isinstance(r, list) else {}
        te = d.get("tem_expediente")
        if te is None:
            log(f"agenda de {dia}: nao sei dizer ({d.get('situacao')}) — vou falar assim mesmo")
            return True, d
        return bool(te), d
    except Exception as e:  # noqa: BLE001
        # Falha ao consultar tambem NAO cala: mesma regra do "nao sei".
        log(f"agenda de {dia}: erro ao consultar ({e}) — vou falar assim mesmo")
        return True, {}

'''

ANC_FUNC = "def main():"
ANC_MAIN = '''    fn = "mila_briefing_manha_v1" if a.tipo == "manha" else "mila_fechamento_dia_v1"'''
GUARDA = '''    # ── a escola abre hoje? ────────────────────────────────────────────────
    # 🔴 Dia sem expediente NAO gera briefing nem fechamento — para nenhum dos
    #    dois publicos. Feriado, recesso e ponte caem todos aqui.
    abre, ag = escola_abre(hoje)
    if not abre:
        log(f"== {a.tipo} {hoje}: escola SEM EXPEDIENTE "
            f"({ag.get('aulas_vivas')} aula(s) viva(s) contra tipico {ag.get('tipico')}) — nao falo hoje")
        return 0

'''

CUT_ANC = '''    dia = agora.strftime("%Y-%m-%d")
'''
CUT_GUARDA = '''    dia = agora.strftime("%Y-%m-%d")

    # 🔴 Dia sem expediente nao cutuca. E a mais barulhenta das tres rotinas.
    abre, ag = mp.escola_abre(dia)
    if not abre:
        mp.log(f"escola SEM EXPEDIENTE em {dia} "
               f"({ag.get('aulas_vivas')} aula(s) viva(s) contra tipico {ag.get('tipico')}) — nao cutuco")
        return
'''

if len(sys.argv) < 3:
    print("uso: python3 _patch-proativa-respeita-agenda-06set.py <mila-proativa.py> <mila-cutucada.py>",
          file=sys.stderr)
    raise SystemExit(2)

# ── proativa ────────────────────────────────────────────────────────────────
alvo = sys.argv[1]
s = io.open(alvo, encoding="utf-8").read()
if "def escola_abre(" in s:
    print("proativa ja respeita a agenda — nada a fazer")
else:
    if s.count(ANC_FUNC) != 1:
        print(f"ANCORA def main: esperava 1, achei {s.count(ANC_FUNC)}", file=sys.stderr)
        raise SystemExit(1)
    if s.count(ANC_MAIN) != 1:
        print(f"ANCORA do fn: esperava 1, achei {s.count(ANC_MAIN)}", file=sys.stderr)
        raise SystemExit(1)
    s = s.replace(ANC_FUNC, FUNCAO.strip() + "\n\n\n" + ANC_FUNC, 1)
    s = s.replace(ANC_MAIN, GUARDA + ANC_MAIN, 1)
    io.open(alvo, "w", encoding="utf-8", newline="\n").write(s)
    print(f"  ok  proativa respeita a agenda ({alvo})")

# ── cutucada ────────────────────────────────────────────────────────────────
alvo2 = sys.argv[2]
s2 = io.open(alvo2, encoding="utf-8").read()
if "SEM EXPEDIENTE" in s2:
    print("cutucada ja respeita a agenda — nada a fazer")
else:
    if s2.count(CUT_ANC) != 1:
        print(f"ANCORA do dia na cutucada: esperava 1, achei {s2.count(CUT_ANC)}", file=sys.stderr)
        raise SystemExit(1)
    s2 = s2.replace(CUT_ANC, CUT_GUARDA, 1)
    io.open(alvo2, "w", encoding="utf-8", newline="\n").write(s2)
    print(f"  ok  cutucada respeita a agenda ({alvo2})")
