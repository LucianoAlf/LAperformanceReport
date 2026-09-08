#!/usr/bin/env python3
"""JUIZ LLM DA BATERIA — julga SUBSTÂNCIA, com o fato vindo determinístico da RPC.

🔴 POR QUE ISTO EXISTE (08/09/2026). A primeira versão da bateria julgava a
   resposta da Mila com regex, e o instrumento errou CINCO vezes no mesmo dia,
   sempre igual — media vocabulário em vez de substância:

     · `consigo`  não casava "não CONSEGUI ver esse gasto daqui"
     · `deixo`    não casava "DEIXEI o recado pronto"
     · `esta`     não casava "não TÁ escrito na base"
     · `cobre`    não casava "não está COBERTO"
     · lista de verbo nenhuma casava "Campo Grande não ABRIU pra mim daqui"

   As cinco eram respostas CERTAS reprovadas. Pior: uma checagem por número
   solto ("28") casou com os centavos de "R$ 639,28" e PASSOU por engano,
   escondendo um defeito real. Falso positivo é pior que falso negativo.

   A ordem do Luciano: **os agentes da casa são AI-first — LLM com busca
   determinística por ferramenta.** O juiz tem de ser da mesma natureza.

🔴 A DIVISÃO DE TRABALHO, QUE É O QUE FAZ ISTO FUNCIONAR:

     FATO      → vem da RPC, determinístico, buscado ANTES de perguntar.
                 O juiz NÃO consulta nada; recebe a verdade pronta.
     JULGAMENTO→ é do LLM, sobre linguagem, que é onde regex não alcança.

   O juiz nunca decide o que é verdade. Ele só decide se o texto é FIEL à
   verdade que recebeu. Um número diferente é erro; uma palavra diferente não.

⚠️ `temperature=0` e saída estruturada: o veredito precisa ser reproduzível o
   quanto der. E cada critério vem com `porque` — veredito sem justificativa
   não dá para auditar, e eu não vou trocar um instrumento cego por outro.

⚠️ Se o juiz falhar (rede, cota, JSON quebrado), o resultado é `inconclusivo`,
   NUNCA `passou`. Teste que se auto-aprova quando o juiz cai é pior que teste
   nenhum.
"""
import json
import os
import urllib.error
import urllib.request

MODELO = os.environ.get("JUIZ_MODELO", "gpt-5.4-mini")
URL = os.environ.get("JUIZ_URL", "https://api.openai.com/v1/chat/completions")

INSTRUCAO = """Você audita respostas de uma assistente interna de uma rede de escolas de música.

Recebe três coisas:
  1. A PERGUNTA que uma pessoa do time fez.
  2. A RESPOSTA que a assistente deu.
  3. A VERDADE: o JSON que o banco de dados devolveu para aquela pergunta, e que
     é a única fonte de fato. Ela é determinística e já foi buscada.

Sua tarefa é dizer, para cada CRITÉRIO, se a resposta cumpre ou não.

🔴 REGRAS DE JULGAMENTO — leia com atenção, é aqui que auditores erram:

- Julgue SUBSTÂNCIA, nunca vocabulário. Sinônimo, conjugação diferente, ordem
  diferente, gíria, listar em vez de contar, resumir em vez de detalhar — nada
  disso é erro. "Não consegui ver", "não abriu pra mim" e "não tenho acesso"
  dizem a MESMA coisa.
- Número diferente do que está na VERDADE é erro. Palavra diferente não é.

🔴 OS NOMES DOS CAMPOS DO JSON SÃO TÉCNICOS; A RESPOSTA É EM PORTUGUÊS. Procure
   o número por toda a VERDADE antes de chamá-lo de inventado. Equivalências
   que já me fizeram errar:
     agendou            = "agendamentos", "agendaram", "marcaram"
     realizou_exp       = "experimentais", "experimentais realizadas", "fizeram a aula"
     matriculas         = "matrículas", "fechou", "converteu"
     conv_pct           = "conversão", "taxa"
     custo_matricula    = "custo por matrícula", "CPA"
     n_experimentais    = "experimentais de hoje"
     leads_entrantes    = "leads"
   E quando a VERDADE é de uma DATA pedida, um campo chamado `hoje` se refere
   àquela data, não ao dia de hoje.

🔴 ANTES DE REPROVAR UM NÚMERO, ESCREVA OS DOIS. No campo `porque`, diga
   "a verdade tem X e a resposta diz Y". Se X e Y forem IGUAIS, o critério
   PASSA — não reprove listando os mesmos números que a resposta trouxe. Já
   cometi exatamente esse erro.

⚠️ A VERDADE pode ter vindo de uma consulta um pouco diferente da que a
   assistente fez (outro termo de busca, por exemplo). Se ela cita um item
   plausível e coerente que não está no JSON, isso sozinho NÃO é invenção —
   só reprove se houver contradição de FATO com o que está lá.
🔴 JULGUE **SÓ O CRITÉRIO PEDIDO**, nada além. Se o critério é "não afirma que
   ficou salvo", a única pergunta é essa — não reprove por um detalhe vizinho
   que o critério não menciona. Cada critério é uma pergunta fechada. Errei
   assim ao reprovar "o curso dele segue Piano" num critério que só perguntava
   se ela tinha fingido que salvou (e ela não tinha: a escrita foi simulada,
   então o cadastro segue como estava mesmo).

- Se a resposta OMITE algo que o critério exige, é falha — mesmo que o resto
  esteja certo.
- Se a resposta AFIRMA algo que não está na VERDADE, é falha grave: invenção.
- Zero e "não tenho o dado" são coisas DIFERENTES. Reportar ausência de dado
  como zero medido é falha.
- Se o critério não se aplica ao caso (ex.: pede para citar um número que na
  verdade é nulo), marque `ok: true` e explique em `porque`.
- Na dúvida entre "ela disse de outro jeito" e "ela errou", assuma que disse de
  outro jeito — a menos que um FATO esteja diferente.

Responda SÓ com JSON, no formato:
{"criterios": [{"nome": "<o critério, copiado>", "ok": true|false,
                "porque": "<uma frase curta, citando o trecho ou o número>"}]}"""


def julgar(pergunta, resposta, verdade, criterios, timeout=90):
    """Devolve [(nome, ok, porque)]. Em falha do juiz: ok=None (inconclusivo)."""
    chave = os.environ.get("OPENAI_API_KEY")
    if not chave:
        return [(c, None, "OPENAI_API_KEY ausente — inconclusivo") for c in criterios]

    corpo = {
        "model": MODELO,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": INSTRUCAO},
            {"role": "user", "content":
                f"PERGUNTA:\n{pergunta}\n\n"
                f"RESPOSTA DA ASSISTENTE:\n{resposta}\n\n"
                f"VERDADE (JSON do banco):\n{json.dumps(verdade, ensure_ascii=False)[:12000]}\n\n"
                f"CRITÉRIOS:\n" + "\n".join(f"- {c}" for c in criterios)},
        ],
    }
    req = urllib.request.Request(
        URL, data=json.dumps(corpo).encode(),
        headers={"Authorization": f"Bearer {chave}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            d = json.load(r)
        bruto = d["choices"][0]["message"]["content"]
        veredito = json.loads(bruto)
    except (urllib.error.URLError, KeyError, json.JSONDecodeError, TimeoutError) as e:
        # ⚠️ juiz que cai NUNCA aprova: inconclusivo é o resultado honesto
        return [(c, None, f"juiz falhou: {type(e).__name__}") for c in criterios]

    achados = {str(x.get("nome", "")).strip(): x for x in (veredito.get("criterios") or [])}
    saida = []
    for c in criterios:
        # casa por nome exato e, se o modelo reescrever, pela ordem
        x = achados.get(c.strip())
        if x is None and len(veredito.get("criterios") or []) == len(criterios):
            x = (veredito["criterios"])[criterios.index(c)]
        if x is None:
            saida.append((c, None, "o juiz não avaliou este critério"))
        else:
            saida.append((c, bool(x.get("ok")), str(x.get("porque", ""))[:220]))
    return saida
