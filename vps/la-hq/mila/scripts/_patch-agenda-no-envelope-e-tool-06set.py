#!/usr/bin/env python3
"""A MILA PASSA A SABER A AGENDA, NAO SO A FICAR CALADA (06/09/2026).

O guard anterior resolve metade do problema: ela nao fala em dia sem
expediente. Falta a outra metade — **avisar antes**. Quem recebe o fechamento
de sabado precisa ouvir "segunda e feriado, nao tem aula", senao descobre no
dia, e o briefing que nao chega vira duvida ("a Mila caiu?").

Duas mudancas:

  1. O ENVELOPE dos dois publicos passa a levar `agenda_proximos_dias` (hoje +
     6), com dia da semana, situacao e o numero de aulas contra o tipico. O
     pedido manda avisar quando algum dia da janela estiver fechado.

  2. Fica disponivel para ela responder quando perguntarem — a mesma RPC vira
     tool no MCP (arquivo separado, `_patch-tool-agenda-escola-06set.mjs`).

⚠️ A agenda entra no envelope por AQUI, no script, e nao dentro das RPCs de
   briefing. As RPCs sao grandes e tem outros consumidores; o envelope e o
   lugar certo para contexto de apresentacao. Uma chamada a mais por pessoa,
   ~40 ms.

⚠️ Falha na consulta NAO derruba o briefing: sem agenda, o envelope vai sem o
   campo e ela fala normalmente. O briefing e o produto; a agenda e enfeite util.

  python3 _patch-agenda-no-envelope-e-tool-06set.py <mila-proativa.py>
"""
import io
import sys

FUNCAO = '''
def agenda_da_semana(dia, dias=6):
    """Hoje + N dias, para a Mila avisar de feriado/recesso ANTES de acontecer.

    ⚠️ Nunca derruba o briefing: erro aqui devolve lista vazia e o envelope sai
    sem o campo. O briefing e o produto."""
    try:
        fim = (dt.date.fromisoformat(str(dia)) + dt.timedelta(days=dias)).isoformat()
        r = rpc("escola_agenda_v1", {"p_de": dia, "p_ate": fim, "p_unidade_id": None})
        return [x for x in (r or []) if x.get("situacao") != "desconhecido"]
    except Exception as e:  # noqa: BLE001
        log(f"agenda da semana indisponivel ({e}) — sigo sem ela")
        return []

'''

PEDIDO_EXTRA = (
    ' ⚠️ Se `agenda_proximos_dias` tiver algum dia com `tem_expediente` false, '
    'AVISE com todas as letras que naquele dia a escola nao abre (feriado ou recesso) '
    'e que voce nao vai mandar briefing — melhor a pessoa saber antes do que estranhar o silencio. '
    'Nao invente o motivo: diga apenas que nao ha aula.'
)

if len(sys.argv) < 2:
    print("uso: python3 _patch-agenda-no-envelope-e-tool-06set.py <mila-proativa.py>", file=sys.stderr)
    raise SystemExit(2)

alvo = sys.argv[1]
s = io.open(alvo, encoding="utf-8").read()

if "def agenda_da_semana(" in s:
    print("a agenda ja esta no envelope — nada a fazer")
    raise SystemExit(0)

# 1. a funcao, antes do primeiro envelope
ANC = "def escola_abre(dia, unidade_id=None):"
if s.count(ANC) != 1:
    print(f"ANCORA escola_abre: esperava 1, achei {s.count(ANC)}", file=sys.stderr)
    raise SystemExit(1)
s = s.replace(ANC, FUNCAO.strip() + "\n\n\n" + ANC, 1)

# 2. os dois envelopes recebem a agenda dentro do JSON de dados
trocas = 0
for ancora in ('f"[{rotulo.upper()} DA LIDERANCA]\\n\\nDADOS (JSON):\\n{json.dumps(dados, ensure_ascii=False)}"',):
    if s.count(ancora) == 1:
        s = s.replace(ancora, ancora.replace("json.dumps(dados,", "json.dumps(_com_agenda(dados),"), 1)
        trocas += 1

# o envelope das consultoras usa a mesma forma; troca generica e conferida
alvo_cons = "json.dumps(dados, ensure_ascii=False)"
n = s.count(alvo_cons)
if n < 1:
    print(f"ANCORA do json.dumps do envelope: achei {n}", file=sys.stderr)
    raise SystemExit(1)
s = s.replace(alvo_cons, "json.dumps(_com_agenda(dados), ensure_ascii=False)")
print(f"  ok  {n} envelope(s) passam a levar a agenda")

# 3. o helper que enriquece
HELPER = '''
def _com_agenda(dados):
    """Acrescenta `agenda_proximos_dias` ao dicionario de dados do envelope,
    sem alterar o original (o mesmo dict e usado no log de conclusao)."""
    try:
        ag = agenda_da_semana(dados.get("data"))
        if not ag:
            return dados
        d = dict(dados)
        d["agenda_proximos_dias"] = ag
        return d
    except Exception:  # noqa: BLE001
        return dados

'''
s = s.replace("def agenda_da_semana(dia, dias=6):", HELPER.strip() + "\n\n\ndef agenda_da_semana(dia, dias=6):", 1)

# 4. o pedido manda avisar — nos dois publicos
# ⚠️ A insercao e DENTRO da string literal, antes das aspas de fechamento.
# A 1a versao fez `a[:-1] + texto + '")'`, que removeu so o parentese e deixou
# o texto FORA das aspas — SyntaxError com o emoji no meio do codigo.
ANC_PEDIDO = "avise que o retrato tem mais de 45 dias."
if s.count(ANC_PEDIDO) != 1:
    print(f"ANCORA do pedido: esperava 1, achei {s.count(ANC_PEDIDO)}", file=sys.stderr)
    raise SystemExit(1)
s = s.replace(ANC_PEDIDO, ANC_PEDIDO + PEDIDO_EXTRA, 1)
print("  ok  o pedido manda avisar de dia sem expediente")

io.open(alvo, "w", encoding="utf-8", newline="\n").write(s)
print(f"agenda acrescentada ao envelope em {alvo}")
