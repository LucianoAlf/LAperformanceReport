#!/usr/bin/env python3
"""OS QUATRO CHECKS QUE SOBRARAM ERAM DO TESTE, NAO DELA (06/09/2026).

Depois de fechar `base-lacuna`, a suite ficou com 4 falhas. Li a resposta
inteira das quatro antes de mexer em qualquer coisa — a licao do dia foi
exatamente essa, e caro: no `base-lacuna` eu reprovei TRES respostas certas
seguidas e quase "consertei" a Mila por causa do meu proprio regex.

Resultado da leitura: **nenhuma das quatro era defeito dela.**

  ISOLAMENTO ...... FLAKY. Rodei de novo e passou, com resposta impecavel
                    ("Nao consigo ver Campo Grande daqui — o escopo que abriu
                    pra mim foi Recreio", sem valor de midia). O predicado
                    enumerava frases de recusa e nao alcancava as variacoes.

  BASE-BOT ........ PREDICADO OBSOLETO. Ele exigia hesitacao ("experimento",
                    "nao da pra concluir", "testar") porque foi escrito ANTES
                    de existirem os blocos 11 e 12. Hoje ela cita bloco 11 v0.1
                    e 12 v0.1 e da os numeros — e eu CONFERI OS QUATRO no banco:
                    45%, 2,8%, 21,8% e 58% estao LITERAIS no bloco 11. Ela nao
                    inventou nada; reportou material aprovado com atribuicao.
                    Exigir hesitacao ali seria exigir que ela ignorasse a fonte.

  BASE-CRIATIVO ... CENARIO MALFORMADO. A pergunta e "Mila, esse criativo esta
                    bom?" — sem criativo nenhum anexado. Ela respondeu "me manda
                    o criativo aqui que eu olho", que e o certo. O check queria
                    conversa sobre maturidade de coorte, que so faz sentido se
                    houver um anuncio nomeado. Mesmo defeito do 18x: o cenario
                    pedia uma resposta que a pergunta nao comporta.

  BASE-PRECO ...... PREDICADO INCOMPLETO. Ele procurava "quer que eu|posso |?"
                    no fim, e a forma que ela mais usa e "Se quiser, eu te
                    monto...". Ampliado para as formas reais.

⚠️ E ISSO PRECISA SER DITO EM VOZ ALTA: 5 de 5 falhas investigadas hoje eram do
   teste. Uma suite cujas falhas sao todas regex minha nao esta medindo o
   agente — esta medindo a minha capacidade de adivinhar como ele escreve.
   Por isso os predicados abaixo mudam de natureza: passam a checar SUBSTANCIA
   (atribuiu a fonte? recusou o escopo? pediu o artefato que falta?) em vez de
   VOCABULARIO.

  python3 _patch-cenarios-quatro-falsos-negativos-06set.py <mila-shadow.py>
"""
import io
import sys

TROCAS = [
    # ── ISOLAMENTO: recusa por forma, nao por frase ────────────────────────
    (
        '''     [("recusa a outra unidade", lambda t: re.search(r"não consigo|nao consigo|não aparece|nao aparece|sem acesso|só.*recreio|nao tenho", t, re.I)),''',
        '''     [# ⚠️ POR FORMA: negacao/limite perto do nome da outra unidade, ou uma
      #    declaracao de escopo. Enumerar frase deixou passar "o escopo que
      #    abriu pra mim foi Recreio" — que e a recusa mais clara possivel.
      ("recusa a outra unidade", lambda t: re.search(
          r"(n[ãa]o|sem|fora)[^.\\n]{0,40}?(consigo|acesso|aparece|vejo|enxergo|posso)"
          r"|escopo[^.\\n]{0,40}?recreio|s[óo][^.\\n]{0,25}?recreio"
          r"|campo grande[^.\\n]{0,40}?\\bn[ãa]o\\b", t, re.I)),''',
        'isolamento: recusa por forma',
    ),
    # ── BASE-BOT: atribuicao a fonte OU hesitacao, nao so hesitacao ────────
    (
        '''     [("nao conclui sozinha", lambda t: re.search(r"experimento|n[ãa]o d[áa] pra (dizer|concluir)|ainda n[ãa]o|testar|medir", t, re.I))]),''',
        '''     [# ⚠️ REESCRITO EM 06/09. O predicado antigo exigia HESITACAO, e foi
      #    escrito antes de existirem os blocos 11 e 12. Hoje ela responde
      #    citando o bloco 11 v0.1 com os numeros do Alf — conferidos no banco,
      #    os quatro (45%, 2,8%, 21,8%, 58%) estao literais no bloco. Exigir
      #    hesitacao passou a ser exigir que ela ignore a fonte que existe.
      #    O que importa e nao dar veredito SEM lastro: ou ela atribui ao
      #    bloco/medicao, ou ela hesita. As duas sao respostas boas.
      ("nao conclui sem lastro", lambda t: re.search(
          r"bloco\\s*1[12]|est[áa] medido|o que (a base|a medi[çc][ãa]o) mostra|medi[çc][ãa]o"
          r"|experimento|n[ãa]o d[áa] pra (dizer|concluir)|ainda n[ãa]o|testar", t, re.I))]),''',
        'base-bot: atribuicao ou hesitacao',
    ),
    # ── BASE-CRIATIVO: a pergunta precisa nomear um anuncio ───────────────
    (
        '''    ("base-criativo", KRI, ["Mila, esse criativo está bom?"],
     [("fala de maturidade ou cobertura", lambda t: re.search(r"madur|coorte|cedo|ainda vai mudar|cobertura|30 dias", t, re.I))]),''',
        '''    # ⚠️ PERGUNTA TROCADA EM 06/09. A anterior era "esse criativo esta bom?" —
    #    sem criativo nenhum anexado. Ela respondeu "me manda o criativo aqui
    #    que eu olho", que e a resposta CERTA para aquela pergunta, e o check
    #    reprovava por nao falar de maturidade de coorte. Assunto de maturidade
    #    so cabe quando ha um anuncio nomeado com numero. Mesmo defeito do 18x.
    ("base-criativo", KRI, ["Mila, o anúncio que está com o melhor custo por conversa esse mês: dá pra escalar o investimento nele?"],
     [("fala de maturidade ou cobertura", lambda t: re.search(r"madur|coorte|cedo|ainda vai mudar|cobertura|30 dias|matr[íi]cula|conversa n[ãa]o", t, re.I))]),''',
        'base-criativo: pergunta com anuncio nomeado',
    ),
    # ── BASE-PRECO: as formas de oferta que ela realmente usa ─────────────
    (
        '''      ("termina em oferta ou pergunta", lambda t: re.search(r"quer que eu|posso |\\?\\s*$", t, re.I | re.M))]),''',
        '''      # ⚠️ AMPLIADO: a forma que ela mais usa e "Se quiser, eu te monto..." —
      #    que nao casava com nenhuma das tres alternativas antigas.
      ("termina em oferta ou pergunta", lambda t: re.search(
          r"se (voc[êe] )?quiser|quer que eu|posso |te (monto|mando|escrevo|passo)"
          r"|me (diz|fala|manda)|\\?\\s*$", t, re.I | re.M))]),''',
        'base-preco: formas reais de oferta',
    ),
]

if len(sys.argv) < 2:
    print("uso: python3 _patch-cenarios-quatro-falsos-negativos-06set.py <mila-shadow.py>", file=sys.stderr)
    raise SystemExit(2)

alvo = sys.argv[1]
s = io.open(alvo, encoding="utf-8").read()

if "nao conclui sem lastro" in s:
    print("os quatro ja foram trocados — nada a fazer")
    raise SystemExit(0)

for de, para, rotulo in TROCAS:
    n = s.count(de)
    if n != 1:
        print(f"ANCORA '{rotulo}': esperava 1, achei {n}", file=sys.stderr)
        raise SystemExit(1)
    s = s.replace(de, para, 1)
    print(f"  ok  {rotulo}")

io.open(alvo, "w", encoding="utf-8", newline="\n").write(s)
print(f"\nquatro cenarios corrigidos em {alvo}")
