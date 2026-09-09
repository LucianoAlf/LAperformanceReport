#!/usr/bin/env python3
"""JUIZ DA BATERIA — LLM lê a linguagem, o CÓDIGO decide o número.

🔴 TRÊS INSTRUMENTOS, NESTA ORDEM, E CADA UM MORREU DE UM JEITO:

  1. REGEX (manhã de 08/09). Media vocabulário: `consigo` não casava
     "consegui", nenhuma lista de verbo casava "não ABRIU pra mim". Reprovou
     CINCO respostas certas. E um "28" solto casou com os centavos de
     "R$ 639,28" e PASSOU por engano, escondendo um defeito real.

  2. LLM JULGANDO (booleano). Corrigiu o vocabulário — e criou um defeito pior:
     **ele escrevia os dois números, via que eram iguais, e reprovava assim
     mesmo.** Literal, do log: *"a verdade tem Google com 157 leads … e a
     resposta diz 157 leads …; já n[ão]"*. O raciocínio saía certo no texto e o
     booleano não seguia. Endurecer o prompt ("escreva os dois; se iguais,
     passa") NÃO resolveu — a instrução era obedecida na justificativa e
     ignorada no veredito.

  3. LLM EXTRAI, CÓDIGO COMPARA (esta versão). É a régua da casa aplicada ao
     próprio instrumento: **LLM para o que só ele faz — ler português livre e
     dizer "quando ela disse 40, estava falando de `esperando` da Vitória" — e
     comparação DETERMINÍSTICA em código.** O booleano deixa de ser gerado e
     passa a ser calculado; a autocontradição vira impossível por construção.

── COMO FUNCIONA ────────────────────────────────────────────────────────────

  FATO       → RPC, buscado ANTES de perguntar. O juiz nunca consulta nada.
  EXTRAÇÃO   → o LLM lista os pares (rótulo, número) que a resposta afirma.
  COMPARAÇÃO → código: todo número afirmado tem de existir na verdade.
  QUALITATIVO→ o que não é número ("admite a lacuna", "não vaza outra unidade")
               continua com o LLM, que nisso é confiável — foi medido.

⚠️ Número DERIVADO (ela soma 7+7 e diz "14 no total") não está na verdade e não
   pode ser chamado de invenção. Por isso o código aceita soma e diferença de
   dois números da verdade, e só o que sobra vai ao LLM com a pergunta certa:
   *"isto é derivável do que está aqui?"*. Filtro determinístico primeiro, LLM
   só no resíduo.

⚠️ Se o LLM cair (rede, cota, JSON quebrado), o resultado é `inconclusivo`,
   NUNCA `passou`. Teste que se auto-aprova quando o juiz cai é pior que teste
   nenhum.
"""
import json
import os
import re
import urllib.error
import urllib.request

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


# ── 1. números que a resposta AFIRMA (só o LLM lê português livre) ──────────
EXTRAI = """Você extrai NÚMEROS de um texto em português. Não julga nada.

Liste todo número que o texto AFIRMA como fato — quantidades, valores em reais,
percentuais, contagens. Para cada um, diga a que ele se refere.

🔴 EM `sobre`, COMECE SEMPRE PELO SUJEITO — a pessoa, a unidade ou o canal a
   que o número pertence, mesmo que ele apareça antes na frase ou no parágrafo.
   Em "Na Barra, sim: 2 conversas esperando e 2 acima de 24h", o sujeito dos
   DOIS números é **Barra**, e `sobre` tem de dizer isso.
   Sem o sujeito, quem lê depois não consegue saber de quem é o número — e foi
   exatamente assim que um número de Campo Grande passou por número da Barra.

Ignore: números dentro de datas, horários, telefones, ids, e números que apareçam
numa pergunta ou numa oferta ("quer que eu puxe os 6 mais urgentes?").

Responda só JSON:
{"numeros": [{"valor": 40, "sobre": "Vitória — conversas esperando resposta"},
             {"valor": 2, "sobre": "Barra — conversas esperando resposta"}]}
`valor` é sempre número puro, com PONTO decimal e SEM separador de milhar.
⚠️ Formato brasileiro: em "R$ 3.047,91" o ponto é MILHAR e a vírgula é DECIMAL —
   o valor é 3047.91, nunca 3047 nem 3.047. Não perca os centavos."""


def numeros_afirmados(resposta):
    d = _chamar(EXTRAI, f"TEXTO:\n{resposta}")
    if not d:
        return None
    saida = []
    for x in (d.get("numeros") or []):
        try:
            saida.append((float(x.get("valor")), str(x.get("sobre", ""))[:90]))
        except (TypeError, ValueError):
            continue
    return saida


# ── 2. todo número que existe na verdade (determinístico) ──────────────────
def numeros_da_verdade(v):
    achados = set()

    def anda(x):
        if isinstance(x, dict):
            for y in x.values():
                anda(y)
        elif isinstance(x, list):
            for y in x:
                anda(y)
        elif isinstance(x, bool):
            return
        elif isinstance(x, (int, float)):
            achados.add(round(float(x), 2))
        elif isinstance(x, str):
            # ⚠️ datas fora: "2026-09-07" virava os números -9 e -7 na fatia e
            #    afrouxava a comparação de graça.
            x = re.sub(r'\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4}|\d{2}:\d{2}', ' ', x)
            # números escritos dentro de texto (a verdade traz muito string)
            for m in re.finditer(r'-?\d+(?:[.,]\d+)?', x):
                try:
                    achados.add(round(float(m.group(0).replace(',', '.')), 2))
                except ValueError:
                    pass
    anda(v)
    return achados


def _explicavel(n, base):
    """Está na base, ou é soma/diferença de dois números dela. 1 centavo de folga."""
    for b in base:
        if abs(n - b) < 0.011:
            return True
        # ⚠️ ela (ou o extrator) pode arredondar/truncar os centavos: "R$ 3.047"
        #    para um valor real de 3047,91. Isso é a MESMA quantia, não invenção.
        if abs(b) >= 1 and abs(n - int(b)) < 0.011:
            return True
    inteiros = [b for b in base if abs(b) < 1e7]
    for a in inteiros:
        for b in inteiros:
            if abs(n - (a + b)) < 0.011 or abs(n - (a - b)) < 0.011:
                return True
    return False


def _fatias_por_sujeito(v):
    """Mapa nome -> números daquele pedaço da verdade.

    🔴 EXISTIR NA VERDADE NÃO BASTA. Foi assim que o bug original passou: ela
       disse "na Barra, 2 esperando e 2 com mais de 24h" e o 2 EXISTIA — era da
       Gabriela, de Campo Grande. Número certo, dono errado. Sem amarrar o
       número ao sujeito, o teste aprova exatamente o defeito que motivou tudo.
    """
    fatias = {}

    def anda(x):
        if isinstance(x, dict):
            # ⚠️ TODOS os rótulos, não o primeiro. A linha da Kailane tem
            #    "pessoa: Kailane Barbosa" E "unidades: Barra"; parando no
            #    primeiro, a frase "na Barra, 2 esperando" não achava dono e caía
            #    na busca global — onde o 2 EXISTE (é da Gabriela, de Campo
            #    Grande). Era o bug original passando no teste que o persegue.
            # ⚠️ Rótulo composto ("Campo Grande, Recreio") vira várias chaves,
            #    senão a busca por "Recreio" não encontra a fatia.
            for chave in ('pessoa', 'nome', 'canal', 'unidade', 'unidades', 'aluno', 'titulo'):
                bruto = x.get(chave)
                if not isinstance(bruto, str) or len(bruto) <= 2:
                    continue
                for parte in re.split(r'[,/;]| e ', bruto):
                    parte = parte.strip()
                    if len(parte) > 2:
                        fatias.setdefault(_norm(parte), set()).update(numeros_da_verdade(x))
            for y in x.values():
                anda(y)
        elif isinstance(x, list):
            for y in x:
                anda(y)
    anda(v)
    return fatias


def _norm(t):
    import unicodedata
    t = ''.join(c for c in unicodedata.normalize('NFD', str(t or ''))
                if unicodedata.category(c) != 'Mn').lower()
    return re.sub(r'[^a-z0-9 ]', ' ', t).strip()


def _sujeito_da_frase(sobre, fatias):
    """Se o rótulo extraído nomeia alguém que a verdade conhece, devolve a fatia."""
    alvo = _norm(sobre)
    melhor, melhor_tam = None, 0
    for nome, nums in fatias.items():
        primeiro = nome.split(' ')[0]
        if len(primeiro) >= 4 and primeiro in alvo and len(nome) > melhor_tam:
            melhor, melhor_tam = nums, len(nome)
    return melhor


# ── 3. o qualitativo, que número não resolve ───────────────────────────────
QUALITATIVO = """Você audita a resposta de uma assistente interna de uma rede de escolas de música.

Recebe a PERGUNTA, a RESPOSTA e a VERDADE (o JSON que o banco devolveu, única
fonte de fato). Diga, para cada CRITÉRIO, se a resposta cumpre.

🔴 REGRAS:
- Julgue SUBSTÂNCIA, nunca vocabulário. Sinônimo, conjugação, gíria, listar em
  vez de contar, resumir em vez de detalhar — nada disso é erro. "Não consegui
  ver", "não abriu pra mim" e "não tenho acesso" dizem a MESMA coisa.
- Julgue **SÓ O CRITÉRIO PEDIDO**. Cada critério é uma pergunta fechada; não
  reprove por um detalhe vizinho que ele não menciona.
- Os nomes de campo do JSON são técnicos e a resposta é em português
  (`agendou` = "agendamentos", `realizou_exp` = "experimentais",
  `n_experimentais` = "experimentais de hoje"). Quando a VERDADE é de uma data
  pedida, um campo `hoje` se refere àquela data.
- A VERDADE pode ter vindo de uma consulta um pouco diferente da que a
  assistente fez. Item plausível fora do JSON não é, por si, invenção.
- Zero e "não tenho o dado" são coisas DIFERENTES.
- Omitir o que o critério exige é falha, mesmo com o resto certo.

🔴 A PERGUNTA É SEMPRE "A RESPOSTA FAZ ISSO?", NUNCA "ISSO É VERDADE?". Se o
   critério diz "avisa que o gasto cobre só 28 dos 31 dias", a pergunta é se ela
   ESCREVEU esse aviso — não se o dado é mesmo 28/31. Já aprovei uma resposta
   que omitia o aviso porque conferi na VERDADE que o aviso caberia. A verdade
   serve para saber se o que ela disse é fiel, não para completar o que faltou.

⚠️ NÃO confira números aqui — isso é feito em outro lugar, por código.

Responda só JSON:
{"criterios": [{"nome": "<copiado>", "ok": true|false, "porque": "<uma frase>"}]}"""


def julgar(pergunta, resposta, verdade, criterios, timeout=90):
    """[(nome, ok, porque)]. ok=None => inconclusivo (juiz caiu)."""
    if not os.environ.get("OPENAI_API_KEY"):
        return [(c, None, "OPENAI_API_KEY ausente") for c in criterios]

    saida = []

    # ── critério de NÚMERO: extração pelo LLM, comparação em código ─────────
    numericos = [c for c in criterios if re.search(r'\bbatem?\b|\bnúmero|\bnumero', c, re.I)]
    if numericos:
        afirmados = numeros_afirmados(resposta)
        if afirmados is None:
            for c in numericos:
                saida.append((c, None, "não consegui extrair os números da resposta"))
        else:
            base = numeros_da_verdade(verdade)
            fatias = _fatias_por_sujeito(verdade)
            fora = []
            for n, sobre in afirmados:
                # 🔴 quando a frase nomeia alguém que a verdade conhece, o número
                #    tem de estar NA FATIA DELE — senão é "número certo, dono
                #    errado", que foi o bug original.
                dele = _sujeito_da_frase(sobre, fatias)
                if dele is not None:
                    if not _explicavel(n, dele):
                        fora.append((n, sobre + ' [não é dessa pessoa]'))
                elif not _explicavel(n, base):
                    fora.append((n, sobre))
            for c in numericos:
                if not fora:
                    saida.append((c, True,
                                  f"os {len(afirmados)} números afirmados existem na verdade"))
                else:
                    det = "; ".join(f"{n:g} ({s})" for n, s in fora[:4])
                    saida.append((c, False, f"não encontrei na verdade: {det}"))

    # ── o resto, com o LLM ──────────────────────────────────────────────────
    resto = [c for c in criterios if c not in numericos]
    if resto:
        d = _chamar(QUALITATIVO,
                    f"PERGUNTA:\n{pergunta}\n\nRESPOSTA DA ASSISTENTE:\n{resposta}\n\n"
                    f"VERDADE (JSON):\n{json.dumps(verdade, ensure_ascii=False)[:12000]}\n\n"
                    f"CRITÉRIOS:\n" + "\n".join(f"- {c}" for c in resto))
        if not d:
            for c in resto:
                saida.append((c, None, "juiz qualitativo falhou"))
        else:
            achados = {str(x.get("nome", "")).strip(): x for x in (d.get("criterios") or [])}
            lista = d.get("criterios") or []
            for c in resto:
                x = achados.get(c.strip())
                if x is None and len(lista) == len(resto):
                    x = lista[resto.index(c)]
                if x is None:
                    saida.append((c, None, "o juiz não avaliou este critério"))
                else:
                    saida.append((c, bool(x.get("ok")), str(x.get("porque", ""))[:220]))

    # devolve na ordem em que os critérios foram pedidos
    por_nome = {c: v for c, *v in ((s[0], s[1], s[2]) for s in saida)}
    return [(c, *por_nome.get(c, (None, "não avaliado"))) for c in criterios]
