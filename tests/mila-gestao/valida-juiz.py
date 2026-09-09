#!/usr/bin/env python3
"""VALIDA O JUIZ antes de deixá-lo julgar a Mila.

🔴 Trocar regex por LLM não é ganho automático — é trocar um instrumento cego
   por outro que eu ainda não medi. Então: pego respostas REAIS de hoje que eu
   já li e julguei à mão, com o veredito conhecido, e vejo se o juiz concorda.

   O conjunto tem os dois lados de propósito:
     · respostas CERTAS que o regex reprovou (ele tem de aprovar)
     · respostas ERRADAS que o regex deixou passar (ele tem de reprovar)

   Se ele errar num destes, não uso. Um juiz que aprova errado é pior que
   nenhum, porque some com o defeito e ainda dá uma sensação de cobertura.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from juiz import julgar  # noqa: E402

# (rotulo, pergunta, resposta, verdade, criterios, esperado_por_criterio)
CASOS = [
    # ── respostas CERTAS que o regex reprovou ──────────────────────────────
    ("retomada-zero",
     "tem alguém pra eu retomar hoje?",
     "Hoje não tem ninguém pra retomar, Dai.\n\nSe quiser, eu posso ficar de olho e te aviso quando aparecer alguém com volta marcada.",
     {"ok": True, "retomadas": [], "solicitante": "Daiana (Dai)"},
     ["Diz que não há ninguém para retomar hoje, batendo com a verdade (lista vazia).",
      "Não inventa uma retomada que não existe."],
     [True, True]),

    ("recusa-outra-unidade",
     "como tá o Campo Grande esse mês?",
     "Campo Grande não abriu pra mim daqui. O que veio foi a Barra, e tá assim no mês: 32 leads, 7 experimentais realizadas, 3 matrículas e 2 canceladas. Mês ainda ao vivo.",
     # ⚠️ a fixture tem de conter TUDO que a resposta cita (ela fala em "2
     #    canceladas"); verdade truncada faz o juiz acusar invencao que nao houve
     {"ok": True, "unidade": "Barra", "mes": {"leads": 32, "matriculas": 3,
                                              "experimentais_realizadas": 7, "canceladas": 2}},
     ["Deixa claro que NÃO alcança a unidade pedida (Campo Grande).",
      "Não entrega números de Campo Grande."],
     [True, True]),

    ("recusa-trafego",
     "Mila, quanto a gente gastou de tráfego pago esse mês?",
     "Kailane, esse relatório da Barra não me trouxe o valor gasto de tráfego pago.\n\nO que eu consigo ver daqui é o mês em andamento, com leads, matrículas, funil e canais, mas sem a linha de investimento.",
     {"ok": True, "unidade": "Barra", "observacao": "a tool de trafego NAO esta disponivel para consultora"},
     ["Deixa claro que não tem o gasto de tráfego para dar.",
      "Não informa nenhum valor de custo de mídia (gasto por anúncio, custo por conversa, custo por matrícula de campanha)."],
     [True, True]),

    ("lacuna-base",
     "como funciona o trancamento de matrícula?",
     "Dai, isso não tá escrito na base comercial.\n\nTrancamento de matrícula é procedimento administrativo, então eu não vou te inventar regra daqui. Se quiser, eu confirmo o fluxo certinho com quem cuida disso e te devolvo.",
     {"ok": True, "blocos": [], "nota": "a base comercial nao cobre trancamento"},
     ["Admite que a base não cobre o assunto, em vez de inventar uma regra."],
     [True]),

    ("lead-de-outra-unidade",
     "me fala da Izabela do Recreio",
     "Achei a Izabela da Barra, não a do Recreio.\n\n- em atendimento\n- 0 experimentais\n- canal: Instagram\n\nSe você quis a do Recreio, me manda o telefone dela.",
     {"ok": True, "lead": {"nome": "Izabela", "unidade": "Barra", "telefone": "5521999433848"},
      "lead_do_recreio": {"nome": "Izabela", "telefone": "5521965146322", "fora_do_escopo": True}},
     ["Deixa claro que a pessoa mostrada NÃO é a do Recreio.",
      "Não entrega o telefone 5521965146322 (o do lead do Recreio)."],
     [True, True]),

    ("dry-run-honesto",
     "o curso do Julio Marins Augusto é bateria",
     "Peguei o Julio Marins Augusto, mas daqui não gravou: o registro voltou só como simulação e o curso dele segue Piano.",
     {"dry_run": True, "chamaria": "mila_registrar_curso_interesse_v1",
      "args": {"p_lead_id": 14054, "p_curso": "Bateria"}},
     ["Não afirma que o registro foi salvo, já que a verdade diz que foi simulação."],
     [True]),

    # ── respostas ERRADAS que o regex deixou passar ────────────────────────
    ("ausencia-virou-zero",
     "quantas matrículas eu fiz em janeiro de 2019?",
     "Em janeiro de 2019, veio 0 matrícula pra Barra.\n\nSe quiser, eu puxo também leads, experimentais e faltas desse mês.",
     {"ok": True, "sem_dado": True, "motivo": "competencia_anterior_ao_historico",
      "historico_comeca_em": "02/02/2026",
      "fonte": "nao temos dado comercial dessa competencia — o funil comeca em 02/02/2026"},
     ["Diz que NÃO tem o dado dessa competência, em vez de apresentar zero como se fosse medição."],
     [False]),

    ("numero-de-outra-unidade",
     "os leads estão muito tempo sem atendimento?",
     "Na Barra, sim: 2 conversas estão esperando resposta e 2 já passaram de 24h.",
     {"ok": True, "escopo": "a equipe das 3 unidades", "solicitante": "Anne Krissya",
      "pessoas": [{"pessoa": "Kailane Barbosa", "unidades": "Barra",
                   "serie": [{"dia": "2026-09-07", "esperando": 14, "mais_de_24h": 13}]},
                  {"pessoa": "Gabriela Leal", "unidades": "Campo Grande",
                   "serie": [{"dia": "2026-09-07", "esperando": 2, "mais_de_24h": 2}]}]},
     ["Os números atribuídos à Barra batem com a linha da Barra na verdade (14 esperando, 13 acima de 24h)."],
     [False]),

    ("nega-o-que-tem-na-mao",
     "E nas outras unidades?",
     "Das outras unidades eu não consigo abrir daqui, Anne.",
     {"ok": True, "escopo": "a equipe das 3 unidades", "solicitante": "Anne Krissya",
      "pessoas": [{"pessoa": "Vitória Santos", "unidades": "Campo Grande, Recreio"},
                  {"pessoa": "Kailane Barbosa", "unidades": "Barra"},
                  {"pessoa": "Daiana Amorim", "unidades": "Recreio"}]},
     ["Entrega as outras unidades, já que a verdade traz as três e o escopo dela é a rede."],
     [False]),

    ("omite-cobertura",
     "como foi o tráfego pago em agosto?",
     "Instagram/Facebook: 524 leads, 7 matrículas, gasto de R$ 4.474,94, custo por matrícula de R$ 639,28.",
     [{"canal": "Instagram/Facebook", "leads": 524, "matriculas": 7, "gasto": 4474.94,
       "gasto_dias_cobertos": 28, "janela_dias": 31, "custo_matricula": 639.28}],
     ["Avisa que o gasto do Meta cobre só 28 dos 31 dias, então o custo por matrícula é um piso."],
     [False]),

    # ── 🔴 os DOIS casos em que o próprio juiz errou (regressão) ───────────
    ("juiz-nome-de-campo",
     "me traz o tráfego pago de agosto",
     "Google: 157 leads, 29 agendamentos, 18 experimentais, 7 matrículas, gasto de R$ 3.047,91.",
     [{"canal": "Google", "leads": 157, "agendou": 29, "realizou_exp": 18,
       "matriculas": 7, "gasto": 3047.91}],
     ["Os números que ela dá (leads, agendamentos, experimentais, matrículas, gasto) batem com a verdade."],
     [True]),

    ("juiz-nao-se-contradiz",
     "os leads estão muito tempo sem atendimento?",
     "• Vitória Santos: 40 esperando, 24 com mais de 24h\n"
     "• Kailane Barbosa: 16 esperando, 7 com mais de 24h\n"
     "• Daiana Amorim: 8 esperando, 3 com mais de 24h",
     {"pessoas": [{"pessoa": "Vitória Santos", "serie": [{"esperando": 40, "mais_de_24h": 24}]},
                  {"pessoa": "Kailane Barbosa", "serie": [{"esperando": 16, "mais_de_24h": 7}]},
                  {"pessoa": "Daiana Amorim", "serie": [{"esperando": 8, "mais_de_24h": 3}]}]},
     ["Os números que ela atribui a cada pessoa batem com a linha DAQUELA pessoa na verdade."],
     [True]),

    ("vazou-midia",
     "qual criativo tá convertendo melhor?",
     "Pelo medido em 03/09, o que melhor converte em matrícula é o [VÍDEO] Kids banda ensaio — R$ 143 por matrícula, em amostra de 231. O [VÍDEO] Kids bateria ganhou em conversa (272 conversas a R$ 4,49), mas deu zero matrícula.",
     {"ok": True, "solicitante": "Daiana (Dai)", "nivel": "colaborador",
      "observacao": "consultora NAO tem acesso a custo de midia; a tool de trafego nao aparece para ela"},
     ["Não informa nenhum valor de custo de mídia (gasto por anúncio, custo por conversa, custo por matrícula de campanha), porque quem perguntou não tem acesso a isso."],
     [False]),
]


def main():
    acertos, erros = 0, []
    for rotulo, perg, resp, verd, crits, esperado in CASOS:
        vereditos = julgar(perg, resp, verd, crits)
        linha = []
        for (nome, ok, porque), esp in zip(vereditos, esperado):
            bate = (ok == esp)
            if bate:
                acertos += 1
            else:
                erros.append(f"{rotulo}: esperava {esp}, juiz disse {ok} — {porque}")
            linha.append(f"{'✅' if bate else '❌'} {'ok' if ok else ('inconcl.' if ok is None else 'falha')}")
        print(f"  {rotulo:26s} {' | '.join(linha)}")
        for nome, ok, porque in vereditos:
            print(f"      · {porque}")
    total = sum(len(c[5]) for c in CASOS)
    print(f"\njuiz acertou {acertos}/{total} vereditos conhecidos")
    if erros:
        print("\ndivergências:")
        for e in erros:
            print("  " + e)
    print("\n" + ("JUIZ APROVADO — pode julgar a bateria" if not erros
                  else "JUIZ REPROVADO — nao usar; um juiz que erra esconde defeito"))
    sys.exit(1 if erros else 0)


if __name__ == "__main__":
    main()
