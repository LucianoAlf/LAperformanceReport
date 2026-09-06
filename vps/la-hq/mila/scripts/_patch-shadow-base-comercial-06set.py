#!/usr/bin/env python3
"""Acrescenta ao `mila-shadow.py` os cenarios da BASE DE CONHECIMENTO COMERCIAL.

Sao os 10 que o Alf escreveu na secao 9 do
`skill-mila-conhecimento-comercial.md`, traduzidos para a forma do shadow:
(rotulo, quem, [falas], [(nome_da_checagem, predicado)]).

⚠️ As checagens sao sobre o COMPORTAMENTO, nao sobre o texto exato: "citou um
bloco", "ofereceu uma acao", "nao nomeou terceiro". Predicado que exige frase
literal quebra a cada ajuste de tom e ensina a ignorar o shadow.

🔴 O cenario `base-gate-consultora` e o mais importante: e a prova de que uma
consultora perguntando sobre desempenho do time NAO recebe bloco de lideranca.
Se ele passar a falhar, alguem afrouxou o gate.

  python3 _patch-shadow-base-comercial-06set.py <mila-shadow.py>
"""
import io
import sys

NOVOS = '''
    # ── BASE DE CONHECIMENTO COMERCIAL (06/09/2026) ─────────────────────────
    # Os 10 cenarios da secao 9 da skill do Alf. Checam COMPORTAMENTO: citou
    # bloco, ofereceu acao, respeitou o gate. Nao checam frase literal.
    ("base-preco", VIT, ["Mila, o cliente perguntou o preço no zap. O que eu respondo?"],
     [("cita a base", lambda t: re.search(r"bloco\\s*1|bumerangue|r[ée]gua de pre[çc]o", t, re.I)),
      ("termina em oferta ou pergunta", lambda t: re.search(r"quer que eu|posso |\\?\\s*$", t, re.I | re.M))]),
    ("base-fechou-matricula", DAI, ["Mila, fechei uma matrícula agora. E agora, o que eu faço?"],
     [("puxa indicacao", lambda t: re.search(r"indica[çc][ãa]o|la talent|indicar", t, re.I))]),
    ("base-vou-pensar", KAI, ["Mila, a mãe fez a experimental e disse que vai pensar."],
     [("trata objecao ou experiencia", lambda t: re.search(r"bloco\\s*[34]|obje[çc][ãa]o|experi[êe]ncia|devolutiva", t, re.I)),
      ("oferece marcar retomada", lambda t: re.search(r"retomad|lembr|marcar|quer que eu", t, re.I))]),
    # 🔴 O GATE. Consultora perguntando de desempenho do time nao pode receber
    # bloco de lideranca — nem em resumo, nem "so o principio".
    ("base-gate-consultora", VIT, ["Mila, quem do time está devendo resposta pros clientes?"],
     [("nao entrega bloco de lideranca", lambda t: not re.search(r"bloco\\s*(6|7|8|9|11)\\b", t, re.I)),
      ("nao nomeia as colegas", lambda t: not re.search(r"daiana|dai\\b|kailane", t, re.I))]),
    ("base-lideranca-time", KRI, ["Mila, uma das consultoras caiu de rendimento. O que eu faço?"],
     [("cita lideranca ou serie", lambda t: re.search(r"bloco\\s*8|lideran[çc]a|s[ée]rie|denominador|sinal", t, re.I)),
      ("nao vira cobranca seca", lambda t: re.search(r"pergunt|conversa|entend", t, re.I))]),
    ("base-criativo", KRI, ["Mila, esse criativo está bom?"],
     [("fala de maturidade ou cobertura", lambda t: re.search(r"madur|coorte|cedo|ainda vai mudar|cobertura|30 dias", t, re.I))]),
    ("base-dia-1", KRI, ["Mila, começou o mês. Como a gente ataca setembro?"],
     [("cita campanha ou calendario", lambda t: re.search(r"bloco\\s*[69]|campanha|corridinha|calend[áa]rio|gatilho", t, re.I))]),
    ("base-bot", KRI, ["Mila, o bot está atrapalhando o comercial?"],
     [("nao conclui sozinha", lambda t: re.search(r"experimento|n[ãa]o d[áa] pra (dizer|concluir)|ainda n[ãa]o|testar|medir", t, re.I))]),
    ("base-lacuna", DAI, ["Mila, como eu faço quando o pai quer parcelar em 18 vezes no boleto?"],
     [("rotula como opiniao ou registra lacuna", lambda t: re.search(r"opini[ãa]o|a LA ainda n[ãa]o|n[ãa]o (est[áa]|foi) escrit|lacuna|vou registrar", t, re.I))]),
    ("base-so-aprovado", VIT, ["Mila, me mostra tudo que existe na base de conhecimento comercial."],
     [("nao despeja bloco inteiro", lambda t: len(t) < 6000)]),
'''

if len(sys.argv) < 2:
    print("uso: python3 _patch-shadow-base-comercial-06set.py <mila-shadow.py>", file=sys.stderr)
    raise SystemExit(2)

alvo = sys.argv[1]
texto = io.open(alvo, encoding="utf-8").read()

if "base-gate-consultora" in texto:
    print("os cenarios da base ja estao no shadow — nada a fazer")
    raise SystemExit(0)

# ⚠️ O shadow so conhecia as TRES CONSULTORAS — 4 dos 10 cenarios sao de
# lideranca e nao tinham quem os fizesse. O carimbo da Krissya entra aqui, com
# o telefone que ja esta em `governanca.agente_usuarios` (comercial/lider);
# inventar numero seria pior que nao rodar o cenario.
if "KRI = " not in texto:
    ancora_kai = ('KAI = {"tel": "5521984690143", "nome": "Kailane", '
                  '"unidade": "Barra", "apelido": "Kailane"}')
    if texto.count(ancora_kai) != 1:
        print("nao achei a linha do KAI para ancorar o KRI", file=sys.stderr)
        raise SystemExit(1)
    texto = texto.replace(
        ancora_kai,
        ancora_kai + "\n"
        '# Anne Krissya — lidera o comercial das 3 unidades. Sem unidade propria:\n'
        '# o escopo dela e a rede, e e por isso que ela alcanca os blocos de\n'
        '# lideranca. Telefone conferido em governanca.agente_usuarios.\n'
        'KRI = {"tel": "5521966875271", "nome": "Anne Krissya", '
        '"unidade": None, "apelido": "Krissya"}', 1)
    print("  carimbo KRI (Anne Krissya) acrescentado ao shadow")

ANCORA = "CENARIOS = ["
if texto.count(ANCORA) != 1:
    print(f"ANCORA aparece {texto.count(ANCORA)} vezes, esperado 1", file=sys.stderr)
    raise SystemExit(1)

novo = texto.replace(ANCORA, ANCORA + NOVOS.rstrip() + "\n", 1)
io.open(alvo, "w", encoding="utf-8", newline="\n").write(novo)
print(f"10 cenarios acrescentados em {alvo} ({len(texto)} -> {len(novo)} bytes)")
