#!/usr/bin/env python3
"""JUIZ DA BATERIA — o LLM LIGA o número ao campo; o código faz a conta.

🔴 QUATRO DESENHOS, E CADA UM MORREU DE UM JEITO. Vale ler antes de mexer:

  1. REGEX. Media vocabulário: `consigo` não casava "consegui", nenhuma lista de
     verbo casava "não ABRIU pra mim". Reprovou CINCO respostas certas. E um
     "28" solto casou com os centavos de "R$ 639,28" e PASSOU por engano,
     escondendo um defeito real.

  2. LLM DEVOLVENDO BOOLEANO. Corrigiu o vocabulário e criou coisa pior: ele
     escrevia os dois números, via que eram iguais, e reprovava assim mesmo —
     "a verdade tem Google com 157 leads … e a resposta diz 157 leads …; já
     n[ão]". O raciocínio saía certo no texto e o booleano não seguia.

  3. LLM EXTRAI RÓTULO + EU CASO STRING. O booleano virou cálculo, mas eu passei
     a **remontar na mão** o vínculo entre "Recreio — experimentais" e o JSON.
     Foram CINCO heurísticas seguidas (indexar por `unidades`, por todos os
     rótulos, pela chave do dicionário, só nome próprio…) e cada uma consertou
     um caso e abriu outro. O problema nunca foi a heurística: **era eu
     reconstruir um vínculo que dava para pedir direto.**

  4. LLM LIGA AO CAMPO (esta). O JSON vira um CARDÁPIO numerado de
     `caminho = valor`, e o LLM diz a qual item cada número da resposta se
     refere. O código confere o valor naquele item. Nenhuma string é casada por
     mim, e o veredito é aritmética.

── A DIVISÃO ────────────────────────────────────────────────────────────────

  FATO       → RPC, buscado ANTES de perguntar. O juiz nunca consulta nada.
  LIGAÇÃO    → LLM: "quando ela disse 2 sobre a Barra, ela apontou o item 7".
  CONFERÊNCIA→ CÓDIGO: o item 7 vale 14, ela disse 2 → erro.
  QUALITATIVO→ LLM, preso ao critério pedido.

🔴 É ASSIM QUE "NÚMERO CERTO, DONO ERRADO" É PEGO. Ela disse "na Barra, 2
   esperando"; o 2 EXISTE na verdade — é da Gabriela, de Campo Grande. Ligando
   ao campo da Barra (que vale 14), o erro aparece. Comparar contra o conjunto
   inteiro de números aprovaria o bug original.

⚠️ O LLM é instruído a escolher **pelo significado, nunca pelo valor bater** —
   senão ele acharia o 2 em qualquer lugar e o teste se auto-aprovaria.

⚠️ Número AGREGADO (ela soma 7+7 e diz "14 no total") não tem item no cardápio:
   o LLM devolve `item: null` e o código aceita se for soma ou diferença de dois
   valores da verdade.

⚠️ Se o LLM cair, o resultado é `inconclusivo`, NUNCA `passou`. Teste que se
   auto-aprova quando o juiz cai é pior que teste nenhum.
"""
import json
import os
import re
import urllib.error
import urllib.request

# Prefixo com que o CENÁRIO declara "este critério é de número — confira em
# código". Sem ele, o critério vai para o juiz qualitativo.
# ⚠️ Declarado, nunca inferido: a versão que escolhia por regex misroteou
#    "Não entrega NÚMEROS de outra unidade" (qualitativo) para a aritmética.
NUM = "[NUM] "

MODELO = os.environ.get("JUIZ_MODELO", "gpt-5.4-mini")
URL = os.environ.get("JUIZ_URL", "https://api.openai.com/v1/chat/completions")


def _chamar(system, user, timeout=90):
    chave = os.environ.get("OPENAI_API_KEY")
    if not chave:
        return None
    corpo = {"model": MODELO, "temperature": 0,
             "response_format": {"type": "json_object"},
             "messages": [{"role": "system", "content": system},
                          {"role": "user", "content": user}]}
    req = urllib.request.Request(
        URL, data=json.dumps(corpo).encode(),
        headers={"Authorization": f"Bearer {chave}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            d = json.load(r)
        return json.loads(d["choices"][0]["message"]["content"])
    except (urllib.error.URLError, KeyError, json.JSONDecodeError, TimeoutError, ValueError):
        return None


# ── 1. o CARDÁPIO: cada número da verdade com o caminho até ele ────────────
_LIXO = re.compile(r'\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4}|\d{2}:\d{2}|\d{9,}')


def _anota(caminho, valor, saida):
    if valor is None or isinstance(valor, bool):
        return
    if isinstance(valor, (int, float)):
        saida.append((caminho, round(float(valor), 2)))
    elif isinstance(valor, str):
        # ⚠️ data, hora e telefone fora: viravam número e sujavam o cardápio
        for m in re.finditer(r'-?\d+(?:[.,]\d+)?', _LIXO.sub(' ', valor)):
            try:
                saida.append((caminho + ' (no texto)',
                              round(float(m.group(0).replace(',', '.')), 2)))
            except ValueError:
                pass


def cardapio(v, prefixo='', saida=None, limite=450, dono=None):
    """[(caminho legível, valor)] de todo número da verdade.

    🔴 O NOME DO BLOCO DESCE NA RECURSÃO — é isto que faz o cardápio funcionar.
       Na `mila_atendimento_serie_v1` o identificador está no bloco PAI
       (`pessoas.0` tem `pessoa: "Kailane Barbosa"` e `unidades: "Barra"`) e o
       número está no FILHO (`serie.0.esperando`). Sem herdar, o item saía como
       `pessoas.0.serie.0.esperando = 14`, sem dizer de quem era — e a frase "na
       Barra, 2 esperando" não tinha como ser ligada a ele. O LLM então escolhia
       o item de valor 2 (da Gabriela, de Campo Grande) e o teste APROVAVA
       exatamente o bug que originou tudo isto.

    ⚠️ TODOS os identificadores entram, não o primeiro: a mesma linha é "Kailane
       Barbosa" para quem fala de pessoa e "Barra" para quem fala de unidade.
    """
    if saida is None:
        saida = []
    if len(saida) >= limite:
        return saida
    if isinstance(v, dict):
        ident = [str(v[k]) for k in ('pessoa', 'nome', 'aluno', 'canal', 'unidade', 'unidades')
                 if isinstance(v.get(k), str) and len(str(v[k])) > 2]
        nome = ' · '.join(dict.fromkeys(ident)) if ident else dono
        for k, y in v.items():
            rot = prefixo + str(k)
            if isinstance(y, (dict, list)):
                cardapio(y, rot + '.', saida, limite, nome)
            else:
                _anota(rot + (' [de ' + nome + ']' if nome else ''), y, saida)
    elif isinstance(v, list):
        for i, y in enumerate(v):
            if isinstance(y, (dict, list)):
                cardapio(y, prefixo + str(i) + '.', saida, limite, dono)
            else:
                _anota(prefixo + str(i) + (' [de ' + dono + ']' if dono else ''), y, saida)
    else:
        _anota(prefixo.rstrip('.') + (' [de ' + dono + ']' if dono else ''), v, saida)
    return saida


MAPEIA = """Você liga NÚMEROS de um texto aos campos de um JSON. Não julga nada.

Recebe a RESPOSTA de uma assistente e um CARDÁPIO numerado — cada item é um
campo do banco de dados com o valor real.

Para cada número que a RESPOSTA AFIRMA como fato, diga a qual item do cardápio
ele se refere.

🔴 ESCOLHA PELO SIGNIFICADO, NUNCA PELO VALOR BATER. Se a resposta diz "na Barra
   são 2 esperando", o item certo é o de `esperando` DA BARRA — mesmo que lá o
   valor seja 14 e exista um 2 em outro item. Casar pelo valor esconde
   exatamente o erro que estou procurando: número certo, dono errado.

Use `item: null` quando o número não corresponder a nenhum campo:
  · ela AGREGOU ("14 no total", somando dois canais);
  · é número de conversa ("te mando os 6 mais urgentes");
  · simplesmente não está no cardápio.
Explique em `nota`.

Ignore números de data, hora, telefone e id.

Responda só JSON:
{"ligacoes": [{"valor": 2, "sobre": "Barra — conversas esperando", "item": 7, "nota": ""}]}"""


def ligar_numeros(resposta, itens):
    menu = "\n".join(str(i) + ". " + c + " = " + format(v, 'g') for i, (c, v) in enumerate(itens))
    d = _chamar(MAPEIA, "RESPOSTA:\n" + resposta + "\n\nCARDÁPIO:\n" + menu[:11000])
    if not d:
        return None
    saida = []
    for x in (d.get("ligacoes") or []):
        try:
            valor = float(x.get("valor"))
        except (TypeError, ValueError):
            continue
        i = x.get("item")
        i = int(i) if isinstance(i, (int, float)) and 0 <= int(i) < len(itens) else None
        saida.append((valor, str(x.get("sobre", ""))[:80], i, str(x.get("nota", ""))[:80]))
    return saida


def _igual(a, b):
    """Mesma quantia, com 1 centavo de folga — e aceitando centavo truncado
    ("R$ 3.047" para 3047,91), que é arredondamento, não invenção."""
    return abs(a - b) < 0.011 or (abs(b) >= 1 and abs(a - int(b)) < 0.011)


def _derivavel(n, valores):
    """Soma ou diferença de dois números da verdade (ela agrega: 7+7 = 14)."""
    v = [x for x in valores if abs(x) < 1e7]
    return any(_igual(n, a + b) or _igual(n, a - b) for a in v for b in v)


# ── 2. o qualitativo, que número não resolve ───────────────────────────────
QUALITATIVO = """Você audita a resposta de uma assistente interna de uma rede de escolas de música.

Recebe a PERGUNTA, a RESPOSTA e a VERDADE (o JSON que o banco devolveu, única
fonte de fato). Diga, para cada CRITÉRIO, se a resposta cumpre.

🔴 REGRAS:
- Julgue SUBSTÂNCIA, nunca vocabulário. Sinônimo, conjugação, gíria, listar em
  vez de contar, resumir em vez de detalhar — nada disso é erro. "Não consegui
  ver", "não abriu pra mim" e "não tenho acesso" dizem a MESMA coisa.
- Julgue **SÓ O CRITÉRIO PEDIDO**. Cada critério é uma pergunta fechada; não
  reprove por um detalhe vizinho que ele não menciona.
- A PERGUNTA É SEMPRE "A RESPOSTA FAZ ISSO?", NUNCA "ISSO É VERDADE?". Se o
  critério diz "avisa que o gasto cobre só 28 dos 31 dias", a pergunta é se ela
  ESCREVEU o aviso — não se o dado é mesmo 28/31. Já aprovei resposta que
  OMITIA o aviso porque conferi na verdade que o aviso cabia.
- Os nomes de campo do JSON são técnicos e a resposta é em português
  (`agendou` = "agendamentos", `realizou_exp` = "experimentais"). Quando a
  VERDADE é de uma data pedida, um campo `hoje` se refere àquela data.
- A VERDADE pode ter vindo de uma consulta um pouco diferente da que a
  assistente fez. Item plausível fora do JSON não é, por si, invenção.
- Zero e "não tenho o dado" são coisas DIFERENTES.
- Omitir o que o critério exige é falha, mesmo com o resto certo.

⚠️ NÃO confira números aqui — isso é feito em código, noutro lugar.

Responda só JSON:
{"criterios": [{"nome": "<copiado>", "ok": true|false, "porque": "<uma frase>"}]}"""


def julgar(pergunta, resposta, verdade, criterios, timeout=90):
    """[(nome, ok, porque)]. ok=None => inconclusivo (juiz caiu)."""
    if not os.environ.get("OPENAI_API_KEY"):
        return [(c, None, "OPENAI_API_KEY ausente") for c in criterios]

    saida = {}

    # ── critério de NÚMERO: LLM liga ao campo, código confere ───────────────
    numericos = [c for c in criterios if c.startswith(NUM)]
    if numericos:
        itens = cardapio(verdade)
        ligacoes = ligar_numeros(resposta, itens) if itens else []
        if ligacoes is None:
            for c in numericos:
                saida[c] = (None, "não consegui ligar os números da resposta ao banco")
        else:
            valores = [v for _, v in itens]
            erros, conferidos = [], 0
            for n, sobre, i, nota in ligacoes:
                if i is not None:
                    caminho, valor = itens[i]
                    conferidos += 1
                    if not _igual(n, valor):
                        erros.append("disse " + format(n, 'g') + " para «" + sobre
                                     + "», mas " + caminho + " vale " + format(valor, 'g'))
                elif abs(n) >= 1e9:
                    # ⚠️ telefone/id não é métrica. O LLM extraiu "5521994836653"
                    #    da resposta e, como o cardápio filtra números longos, ele
                    #    virou "não está no banco" — reprovando uma agenda certa.
                    continue
                elif not _derivavel(n, valores):
                    erros.append(format(n, 'g') + " («" + sobre + "») não está no banco"
                                 + " nem sai de soma dele" + (" — " + nota if nota else ""))
            for c in numericos:
                if erros:
                    saida[c] = (False, "; ".join(erros[:3]))
                else:
                    extra = (" e " + str(len(ligacoes) - conferidos) + " agregado(s)"
                             if len(ligacoes) > conferidos else "")
                    saida[c] = (True, str(conferidos) + " número(s) conferido(s) campo a campo" + extra)

    # ── o resto, com o LLM ──────────────────────────────────────────────────
    resto = [c for c in criterios if c not in numericos]
    if resto:
        d = _chamar(QUALITATIVO,
                    "PERGUNTA:\n" + pergunta + "\n\nRESPOSTA DA ASSISTENTE:\n" + resposta
                    + "\n\nVERDADE (JSON):\n" + json.dumps(verdade, ensure_ascii=False)[:12000]
                    + "\n\nCRITÉRIOS:\n" + "\n".join("- " + c for c in resto))
        if not d:
            for c in resto:
                saida[c] = (None, "juiz qualitativo falhou")
        else:
            lista = d.get("criterios") or []
            achados = {str(x.get("nome", "")).strip(): x for x in lista}
            for c in resto:
                x = achados.get(c.strip())
                if x is None and len(lista) == len(resto):
                    x = lista[resto.index(c)]
                saida[c] = ((bool(x.get("ok")), str(x.get("porque", ""))[:220])
                            if x is not None else (None, "o juiz não avaliou este critério"))

    return [(c, *saida.get(c, (None, "não avaliado"))) for c in criterios]
