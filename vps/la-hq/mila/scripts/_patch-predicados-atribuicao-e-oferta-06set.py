#!/usr/bin/env python3
"""MAIS DOIS PREDICADOS QUE NAO ALCANCAVAM A FORMA REAL (06/09/2026).

Rodada completa da suite depois das correcoes anteriores: 4 falhas, e um
CONJUNTO DIFERENTE das 4 da rodada anterior. `base-bot` e `base-lacuna` tinham
passado quando rodados sozinhos minutos antes. A sessao e por cenario
(`mila-shadow-{nome}-{carimbo}`), entao nao ha vazamento entre cenarios — e
nao-determinismo do modelo mesmo.

Lendo as quatro respostas, duas eram predicado e duas eram comportamento:

  BASE-BOT ......... ela escreveu "**Pela base**, o bot nao converte: ele faz
                     pre-atendimento e passa o bastao". E atribuicao a fonte, que
                     e exatamente o que o check quer — mas o regex conhecia
                     "o que a base mostra" e nao "pela base".

  BASE-VOU-PENSAR .. ela escreveu "**eu seguro a turma de [dia/hora] ate
                     [data]**" e "Se quiser, eu tambem monto a mensagem". As duas
                     sao oferta de proximo passo com data; o regex procurava
                     "retomad|lembr|marcar|quer que eu".

  BASE-LACUNA ...... COMPORTAMENTO REAL. Nesta rodada ela nao disse que a base
                     nao cobre trancamento — deu o procedimento direto. A regra
                     nova do SOUL reduziu, nao eliminou. Nao se corrige com
                     regex: fica para medicao por repeticao.

  BASE-DIA-1 ....... COMPORTAMENTO REAL. Nao citou campanha nem calendario com
                     a Krissya no comeco do mes. Ja e item aberto conhecido
                     (a provocacao de inicio de mes). Idem: medir, nao remendar.

⚠️ So os dois primeiros sao mexidos aqui. Alargar predicado para "passar" nos
   dois ultimos seria fabricar verde — o oposto do que a suite serve.

  python3 _patch-predicados-atribuicao-e-oferta-06set.py <mila-shadow.py>
"""
import io
import sys

TROCAS = [
    (
        '''      ("nao conclui sem lastro", lambda t: re.search(
          r"bloco\\s*1[12]|est[áa] medido|o que (a base|a medi[çc][ãa]o) mostra|medi[çc][ãa]o"
          r"|experimento|n[ãa]o d[áa] pra (dizer|concluir)|ainda n[ãa]o|testar", t, re.I))]),''',
        '''      # ⚠️ AMPLIADO: "Pela base, o bot nao converte" e atribuicao tao boa
      #    quanto "o que a base mostra" — e era a forma que ela usou.
      ("nao conclui sem lastro", lambda t: re.search(
          r"bloco\\s*1[12]|est[áa] medido|medi[çc][ãa]o"
          r"|(pela|segundo a|na) base|a base (diz|mostra|traz|aponta)"
          r"|experimento|n[ãa]o d[áa] pra (dizer|concluir)|ainda n[ãa]o|testar", t, re.I))]),''',
        'base-bot: aceita "pela base" como atribuicao',
    ),
    (
        '''      ("oferece marcar retomada", lambda t: re.search(r"retomad|lembr|marcar|quer que eu", t, re.I))]),''',
        '''      # ⚠️ AMPLIADO: "eu seguro a turma de [dia/hora] ate [data]" e "Se quiser,
      #    eu monto a mensagem" sao oferta de proximo passo — a primeira ate com
      #    data, que e o miolo do bloco 5. O regex antigo nao alcancava nenhuma.
      ("oferece marcar retomada", lambda t: re.search(
          r"retomad|lembr|marcar|quer que eu|se (voc[êe] )?quiser"
          r"|seguro a (turma|vaga)|combin\\w+|volt(a|ar) em|at[ée] \\[?(data|dia)", t, re.I))]),''',
        'base-vou-pensar: aceita as ofertas reais',
    ),
]

if len(sys.argv) < 2:
    print("uso: python3 _patch-predicados-atribuicao-e-oferta-06set.py <mila-shadow.py>", file=sys.stderr)
    raise SystemExit(2)

alvo = sys.argv[1]
s = io.open(alvo, encoding="utf-8").read()

if 'aceita "pela base"' in s or "(pela|segundo a|na) base" in s:
    print("predicados ja ampliados — nada a fazer")
    raise SystemExit(0)

for de, para, rotulo in TROCAS:
    n = s.count(de)
    if n != 1:
        print(f"ANCORA '{rotulo}': esperava 1, achei {n}", file=sys.stderr)
        raise SystemExit(1)
    s = s.replace(de, para, 1)
    print(f"  ok  {rotulo}")

io.open(alvo, "w", encoding="utf-8", newline="\n").write(s)
print(f"\ndois predicados ampliados em {alvo}")
