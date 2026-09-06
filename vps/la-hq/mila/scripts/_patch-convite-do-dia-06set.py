#!/usr/bin/env python3
"""O CONVITE DO DIA — fazer as consultoras PERGUNTAREM (06/09/2026).

O problema medido: a Mila entrega briefing duas vezes por dia desde 04/09 e as
consultoras respondem *"Obrigada"* e *"Bom dia"*. Em tres dias foram 34
mensagens entrantes e **uma unica pergunta de verdade**, no primeiro dia. A
ultima mensagem que alguem escreveu para ela foi sabado 05/09 as 11h37. E a
base de conhecimento, com 12 blocos aprovados pelo Alf, tem **zero consultas
reais**.

Ela fala com elas; elas nao falam com ela. Construir mais ferramenta para quem
nao esta perguntando e o jeito mais caro de nao resolver o problema.

A apresentacao ("Oi Dai, sou a Mila, pode me perguntar...") foi enviada UMA
vez, em 04/09, e nada relembra. Este patch faz o lembrete nascer dentro do
briefing que ela ja manda.

🔴 UM CONVITE POR DIA, NUNCA UMA LISTA. Menu de capacidades e o formato que a
   pessoa pula — foi o que aconteceu com a apresentacao, que era boa e tinha 6
   secoes. O convite aqui e uma linha so, no fim, e sempre ANCORADO no dado
   daquele dia: "quer que eu te passe tudo do Thomas antes das 9h?" ensina mais
   que "posso buscar fichas de lead".

⚠️ SO NO BRIEFING DA MANHA. Duas vezes por dia vira ruido, e ruido ensina a
   ignorar o canal — a mesma razao pela qual a proativa cala em feriado.

⚠️ SO PARA CONSULTORA. A lideranca tem outro problema (nao e falta de saber o
   que perguntar) e o briefing dela ja termina com uma decisao.

⚠️ ROTACAO ESTAVEL: comeca pelo indice do dia do ano sobre o catalogo INTEIRO e
   anda ate achar um aplicavel. Rodar o modulo sobre a lista ja filtrada faria
   o convite mudar de posicao conforme o dia tem ou nao pendencia, e ela
   receberia o mesmo convite varios dias seguidos.

⚠️ A BASE COMERCIAL APARECE DUAS VEZES no catalogo, de proposito: e a unica
   capacidade com ZERO uso, e a que carrega material que o Alf escreveu e
   aprovou. Peso maior enquanto for a mais desconhecida.

⚠️ A escolha e PURA e deterministica (mesma data + mesmos dados = mesmo
   convite), entao da para recalcular na hora de registrar no log sem guardar
   estado. E o registro e o que vai permitir responder "o convite funcionou?".

  python3 _patch-convite-do-dia-06set.py <mila-proativa.py>
"""
import io
import sys

FUNCAO = '''
# ── O CONVITE DO DIA ────────────────────────────────────────────────────────
# Cada entrada: (chave, aplicavel(dados) -> contexto|None, molde do convite).
# O molde e SUGESTAO de conteudo, nao texto pronto: quem escreve e ela, com as
# palavras dela. Texto pronto no prompt sai identico todo dia e vira assinatura.
CATALOGO_CONVITES = [
    ("ficha_lead",
     lambda d: (d.get("hoje", {}).get("experimentais") or [{}])[0].get("aluno"),
     "ofereca puxar a ficha completa de {ctx} antes da aula — telefone, "
     "responsavel, de onde veio e o que a pessoa contou na conversa"),
    ("base_comercial",
     lambda d: True,
     "lembre que ela pode te perguntar COMO fazer — passar preco, tratar "
     "objecao, conduzir o Tour, pedir indicacao — e que voce responde pelo "
     "material que o Alf escreveu, citando o bloco, nao pelo seu achismo"),
    ("registrar_pendencia",
     lambda d: d.get("n_pendencias_de_hoje") or None,
     "ofereca registrar no LA Report o que ela souber de cabeca sobre os "
     "{ctx} cadastros incompletos — canal de origem, curso, motivo de perda"),
    ("programa",
     lambda d: (d.get("programa", {}).get("mais_perto") or {}).get("estrela"),
     "ofereca abrir o MATRICULADOR + LA estrela a estrela e mostrar o que "
     "falta para fechar {ctx}"),
    ("base_comercial_2",
     lambda d: True,
     "lembre que a base comercial cobre retomada de quem sumiu e ex-aluno "
     "querendo voltar, e que basta perguntar o que falar nesses casos"),
    ("falar_por_voce",
     lambda d: ((d.get("ontem", {}).get("sem_desfecho") or [{}])[0].get("aluno")
                or (d.get("ontem", {}).get("faltou_sem_remarcar") or [{}])[0].get("aluno")),
     "ofereca escrever a mensagem para {ctx} — voce mostra antes e so manda "
     "depois do ok dela"),
    ("mes_contra_meta",
     lambda d: True,
     "ofereca abrir o mes contra a meta — leads, experimentais, matriculas, "
     "ticket e o funil inteiro"),
]


def convite_do_dia(dados):
    """Qual capacidade lembrar hoje. Puro e deterministico: mesma data + mesmos
    dados = mesmo convite, entao da para recalcular na hora de registrar no log.

    Devolve dict com `chave` e `pedido`, ou None se nada se aplicar."""
    try:
        dia = dt.date.fromisoformat(str(dados.get("data_iso") or dados.get("data")))
    except (TypeError, ValueError):
        try:
            d = str(dados.get("data", ""))
            dia = dt.date(int(d[6:10]), int(d[3:5]), int(d[0:2]))
        except (TypeError, ValueError, IndexError):
            return None
    n = len(CATALOGO_CONVITES)
    inicio = dia.timetuple().tm_yday % n
    for i in range(n):
        chave, aplicavel, molde = CATALOGO_CONVITES[(inicio + i) % n]
        try:
            ctx = aplicavel(dados)
        except (AttributeError, TypeError, IndexError, KeyError):
            ctx = None
        if not ctx:
            continue
        return {"chave": chave,
                "pedido": molde.format(ctx=ctx) if "{ctx}" in molde else molde}
    return None

'''

ANC_FUNC = "def _com_agenda(dados):"

# o helper passa a carregar tambem o convite
DE_HELPER = '''        ag = agenda_da_semana(dados.get("data"))
        if not ag:
            return dados
        d = dict(dados)
        d["agenda_proximos_dias"] = ag
        return d'''
PARA_HELPER = '''        d = dict(dados)
        ag = agenda_da_semana(dados.get("data"))
        if ag:
            d["agenda_proximos_dias"] = ag
        # ⚠️ So na manha e so para consultora: o envelope da lideranca nao passa
        #    por aqui com tipo=manha, e duas vezes por dia viraria ruido.
        if dados.get("tipo") == "manha":
            c = convite_do_dia(dados)
            if c:
                d["convite_do_dia"] = c
        return d if len(d) > len(dados) else dados'''

# o pedido do envelope das consultoras
ANC_PEDIDO = "DADOS CANÔNICOS (json):"
PEDIDO_EXTRA = (
    "\\n🔴 SE VIER `convite_do_dia`, feche a mensagem com ELE e com mais nada: uma linha, "
    "com as suas palavras, convidando a pessoa a te pedir aquilo. Nunca liste outras "
    "capacidades junto — menu e o que ela pula. O objetivo e ela responder, entao termine "
    "em pergunta.\\n"
)

if len(sys.argv) < 2:
    print("uso: python3 _patch-convite-do-dia-06set.py <mila-proativa.py>", file=sys.stderr)
    raise SystemExit(2)

alvo = sys.argv[1]
s = io.open(alvo, encoding="utf-8").read()

if "CATALOGO_CONVITES" in s:
    print("o convite do dia ja esta na proativa — nada a fazer")
    raise SystemExit(0)

for anc, rotulo in ((ANC_FUNC, "_com_agenda"), (DE_HELPER, "corpo do helper"),
                    (ANC_PEDIDO, "pedido das consultoras")):
    if s.count(anc) != 1:
        print(f"ANCORA {rotulo}: esperava 1, achei {s.count(anc)}", file=sys.stderr)
        raise SystemExit(1)

s = s.replace(ANC_FUNC, FUNCAO.strip() + "\n\n\n" + ANC_FUNC, 1)
s = s.replace(DE_HELPER, PARA_HELPER, 1)
s = s.replace('"\\n\\nDADOS CANÔNICOS (json):\\n"',
              f'"{PEDIDO_EXTRA}\\nDADOS CANÔNICOS (json):\\n"', 1)

if "convite_do_dia`, feche" not in s:
    # o envelope monta a string por concatenacao; tenta a outra forma
    s = s.replace('regras + "\\n\\nDADOS CANÔNICOS (json):\\n"',
                  f'regras + "{PEDIDO_EXTRA}\\nDADOS CANÔNICOS (json):\\n"', 1)

if "convite_do_dia`, feche" not in s:
    print("AVISO: nao consegui injetar a instrucao no pedido — o campo vai no JSON, "
          "mas ela pode ignorar", file=sys.stderr)

io.open(alvo, "w", encoding="utf-8", newline="\n").write(s)
print(f"convite do dia acrescentado em {alvo}")
