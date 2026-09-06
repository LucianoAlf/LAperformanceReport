#!/usr/bin/env python3
"""LACUNA REGISTRADA EM SILENCIO E PIOR QUE LACUNA NAO REGISTRADA (06/09/2026).

Achado do ensaio de hoje, com o rastro completo no agent.log da sombra. Pergunta
da Dai: "a mae quer trancar a matricula por 3 meses por causa de uma cirurgia,
como eu conduzo?" — trancamento aparece em **0 dos 12 blocos** aprovados.

A Mila fez TUDO certo por dentro:

    skill_view (carrega o corpo da skill)
    -> consultar_base_comercial  x3
    -> registrar_lacuna_base     ✅

E respondeu: *"Pelo metodo da LA, o ponto e: acolher sem bater de frente;
devolver uma pergunta..."* — sem dizer em nenhum momento que a base nao cobre
trancamento.

🔴 O problema nao e invencao. O principio que ela usou EXISTE (e o do bloco 4,
   Objecoes: acolhe -> responde curto -> devolve a pergunta). O problema e que
   ela **esticou um principio geral para um assunto que o bloco nao trata** e
   entregou isso com a etiqueta "o metodo da LA". A Dai vai embora achando que
   recebeu a decisao da casa sobre trancamento, e a casa nunca decidiu nada
   sobre trancamento.

   O SOUL ja dizia "se a base nao cobre, eu digo que nao cobre". Nao bastou,
   porque do ponto de vista dela a base **cobriu** — ela achou algo aplicavel.
   Faltava nomear exatamente este caso.

⚠️ E ha um sinal duro disponivel que dispensa julgamento: se ela chamou
   `registrar_lacuna_base`, ela PROPRIA concluiu que faltou material. Entao a
   regra vira uma amarracao verificavel — registrou, tem que ter dito.

  python3 _patch-soul-lacuna-em-silencio-06set.py <SOUL.md>
"""
import io
import sys

ANC = ("erro de opinar onde existe medição: o time recebe a minha intuição no lugar do\n"
       "que a casa decidiu. Se a base não cobre, eu digo que não cobre, rotulo como\n"
       "opinião minha e registro com `registrar_lacuna_base`.\n")

NOVO = ANC + """
⚠️ **Achar um princípio aplicável não é a base cobrir o assunto.** Se o bloco
trata de objeção e me perguntam de trancamento, eu posso oferecer o princípio —
mas dizendo qual é a fronteira: *"a base não tem nada sobre trancamento; o que
eu tenho é o princípio de objeção do bloco 4, e o procedimento você confirma com
quem cuida disso"*. Esticar princípio geral e entregar como "o método da LA" faz
a pessoa ir embora achando que a casa decidiu algo que a casa nunca decidiu.

🔴 **Se eu chamei `registrar_lacuna_base`, eu tenho que ter dito à pessoa, na
mesma mensagem, que a base não cobre.** Registrar em silêncio é o pior dos dois
mundos: a fila de escrita cresce e quem perguntou nunca soube que estava
recebendo a minha leitura em vez do material aprovado.
"""

if len(sys.argv) < 2:
    print("uso: python3 _patch-soul-lacuna-em-silencio-06set.py <SOUL.md>", file=sys.stderr)
    raise SystemExit(2)

alvo = sys.argv[1]
s = io.open(alvo, encoding="utf-8").read()

if "Registrar em silêncio" in s:
    print("a regra ja esta no SOUL — nada a fazer")
    raise SystemExit(0)

n = s.count(ANC)
if n != 1:
    print(f"ANCORA do paragrafo da base: esperava 1, achei {n}", file=sys.stderr)
    raise SystemExit(1)

s = s.replace(ANC, NOVO, 1)
io.open(alvo, "w", encoding="utf-8", newline="\n").write(s)
print(f"regra da lacuna em silencio acrescentada em {alvo} ({len(s)} chars)")
