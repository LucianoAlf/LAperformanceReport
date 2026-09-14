#!/usr/bin/env python3
"""mila-cutucada.py — a Mila cutuca na hora o que não pode esperar amanhã.

Duas situações, as que o Luciano aprovou como "de hora em hora":
  · **preso no bot** (R18) — a pessoa escreveu e só a Mila respondeu;
  · **promessa sem retorno** (R7, só domínio comercial) — a escola ficou de
    voltar e não voltou. Essa regra já existia e estava ativa desde 03/09, com
    sinais abertos que ninguém consumia.

As outras três (experimental sem desfecho, faltou, remarcar) ficam no briefing
das 8:30 de propósito: cutucar a cada hora sobre tudo vira enxurrada, e
enxurrada ensina a ignorar.

Regras de silêncio, que são o que faz isso durar:
  · **uma vez por sinal** — reserva em `automacao_log.idempotency_key` ANTES de
    escrever (um disparo de cron aqui vira 2-4 execuções);
  · **teto de 5 cutucadas por consultora por dia**;
  · **só em horário comercial** (09h–19h BRT, seg-sáb);
  · nada novo = nenhuma mensagem.

Uso:  mila-cutucada.py [--dry-run] [--so TELEFONE] [--teto 5] [--forcar-horario]
Cron (user mila, VPS em UTC): 0 12-22 * * 1-6  (09h-19h BRT)
"""
import argparse
import datetime as dt
import importlib.util
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("mila_proativa", os.path.join(BASE, "mila-proativa.py"))
mp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mp)

TETO_DIA = 5
# Laço 1/2/3 (13/09/2026): a consultora responde um dígito e o bridge fecha o
# sinal sem modelo (mila_responder_cutucada_v1). A legenda é acrescentada AQUI,
# fora do modelo, para nunca faltar.
LEGENDA_123 = "_Responda *1* já resolvi · *2* vou agora · *3* não é comigo_"
# Janela de cutucada em BRT, decisao do Alf em 06/09/2026:
#   seg a sex ..... 8h as 20h
#   sabado ........ 8h as 16h   (a escola fecha mais cedo)
#
# ⚠️ A HORA DE FECHAR E EXCLUSIVA (`hora < fecha`), entao 21 e 17 para incluir
#    as cutucadas das 20h e das 16h.
# ⚠️ TEM DE CASAR COM O CRON, que roda em UTC e agora sao DUAS linhas:
#      0 11-23 * * 1-5   = 08-20 BRT
#      0 11-19 * * 6     = 08-16 BRT
#    Se os dois divergirem, o mais apertado vence EM SILENCIO — o cron dispara,
#    o script sai sem fazer nada, e nao ha erro nem alarme. So aparece semanas
#    depois, quando alguem pergunta "por que nao cutucou naquele horario?".
HORA_ABRE = 8
FECHA_SEMANA, FECHA_SABADO = 21, 17


def janela_do_dia(agora):
    """(abre, fecha) em BRT para o dia da semana de `agora`. Domingo devolve
    janela vazia — mas quem barra domingo de verdade e o cron (`* * 1-6`) e o
    guard de expediente; isto aqui e a terceira linha."""
    if agora.weekday() >= 6:          # domingo
        return (0, 0)
    if agora.weekday() == 5:          # sabado
        return (HORA_ABRE, FECHA_SABADO)
    return (HORA_ABRE, FECHA_SEMANA)

MOLDE = """\
🔥 *AGORA, {apelido}*
━━━━━━━━━━━━━━━━━━━━━

  • *Jullyane* — 15h só com o bot
    _entra na conversa e continua de onde eu parei_

  • *Hetiene* — prometemos retorno e não voltamos
    _ela perguntou o valor ontem_

━━━━━━━━━━━━━━━━━━━━━

_Consegue pegar agora?_"""


def ja_cutucados_hoje(telefone, dia):
    """Quantas cutucadas já saíram hoje para essa consultora."""
    st, b = mp.rest("GET", f"/rest/v1/automacao_log?evento=eq.mila_cutucada"
                           f"&idempotency_key=like.mila_cutucada|{telefone}|{dia}|*&select=id")
    return len(b or []) if st == 200 else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--so")
    ap.add_argument("--teto", type=int, default=TETO_DIA)
    ap.add_argument("--forcar-horario", action="store_true",
                    help="ignora a janela comercial (para teste)")
    a = ap.parse_args()
    mp.load_env()

    agora = dt.datetime.now(mp.BRT)

    # 🔴 ANTES dos guards, de proposito. Abaixo ha dois `return` precoces (fora
    # do horario comercial; escola sem expediente) e o fechamento estava depois
    # deles -- ou seja, justamente nos dias SEM cutucada, que sao os dias em que
    # ele mais importa, nunca era alcancado. A funcao decide sozinha se e a hora.
    if not a.dry_run:
        mp.postar_fechamento_se_fim_do_dia()

    _abre, _fecha = janela_do_dia(agora)
    if not a.forcar_horario and not (_abre <= agora.hour < _fecha):
        mp.log("fora do horario comercial — nao cutuco")
        return
    dia = agora.strftime("%Y-%m-%d")

    # 🔴 Dia sem expediente nao cutuca. E a mais barulhenta das tres rotinas.
    abre, ag = mp.escola_abre(dia)
    if not abre:
        mp.log(f"escola SEM EXPEDIENTE em {dia} "
               f"({ag.get('aulas_vivas')} aula(s) viva(s) contra tipico {ag.get('tipico')}) — nao cutuco")
        return

    # ⚠️ DETECTA ANTES DE LER. O detector diario (pg_cron 196) roda as 06:10 e
    #    nao serve para "a matricula acabou de entrar" — o Alf pediu aviso na
    #    hora. Chamar daqui garante a ordem detecta->le sem corrida entre dois
    #    crons, e o custo e uma RPC por hora.
    # ⚠️ Falha aqui NAO derruba a cutucada: sem o detector ela ainda entrega os
    #    sinais que ja existem.
    try:
        r = mp.rpc("radar_detectar_matricula_sem_anamnese_v1", {}) or {}
        if r.get("novos"):
            mp.log(f"{r['novos']} matricula(s) sem anamnese detectada(s) agora")
    except Exception as e:  # noqa: BLE001
        mp.log(f"detector de anamnese falhou ({e}) — sigo com os sinais existentes")

    falhas = 0
    for c in mp.rpc("mila_consultoras_ativas_v1", {}):
        if a.so and c["telefone"] != a.so:
            continue
        try:
            dados = mp.rpc("mila_cutucada_v1", {"p_solicitante_telefone": c["telefone"], "p_limite": 3})
            if not dados.get("ok") or dados.get("nada_para_cutucar"):
                mp.log(f"{c['apelido']}: nada para cutucar")
                continue

            # so o que ainda nao foi cutucado: a reserva por SINAL e o que
            # garante "uma vez por pessoa, nunca duas"
            novos, log_ids = [], []
            usados = ja_cutucados_hoje(c["telefone"], dia)
            for item in dados["itens"]:
                if usados + len(novos) >= a.teto:
                    mp.log(f"{c['apelido']}: teto de {a.teto} atingido hoje")
                    break
                key = f"mila_cutucada|{c['telefone']}|{dia}|{item['sinal_id']}"
                if a.dry_run:
                    novos.append(item)
                    continue
                st, b = mp.rest("POST", "/rest/v1/automacao_log", {
                    "idempotency_key": key, "evento": "mila_cutucada", "acao": item.get("regra"),
                    "status": "warn", "aluno_nome": item.get("quem"), "unidade_nome": c["unidade_nome"],
                    "lead_id": item.get("lead_id"), "detalhes": {"fase": "reservado", "sinal_id": item["sinal_id"]},
                }, "return=representation")
                if st == 201:
                    novos.append(item)
                    log_ids.append(b[0]["id"])
                elif st != 409:
                    raise RuntimeError(f"reserva -> {st}: {b}")
            if not novos:
                mp.log(f"{c['apelido']}: nada novo (tudo ja cutucado hoje)")
                continue

            envelope = (
                f"[MILA · CUTUCADA · {agora:%H:%M}]\n"
                f"Isto é urgente e é agora: {len(novos)} pessoa(s) da {c['unidade_nome']} esperando gente. "
                f"Escreva a mensagem curta que VOCÊ manda no WhatsApp da {c['apelido']} para ela pegar AGORA.\n"
                "FORMATO — siga este molde:\n<molde>\n"
                + MOLDE.format(apelido=c["apelido"].upper()) +
                "\n</molde>\n"
                "Regras: no máximo 3 itens; nome em negrito; embaixo, em itálico, o que houve e o que fazer; "
                "*negrito* com UM asterisco (é WhatsApp); sem saudação longa, sem 'bom dia' — é interrupção, tem que ser rápida; "
                "use SÓ o que está no envelope; termine com UMA pergunta curta. "
                # 2º ANDAR na cutucada: o porque MEDIDO vem no envelope
                # (mila_cutucada_v1 resolve o padrao pela regra do sinal).
                # Nao pedimos ao modelo que busque — ele so pode citar o que
                # veio, senao volta a argumentar de intuicao.
                "Se vier `porque_vale_agora` preenchido, acrescente ANTES da pergunta UMA linha em "
                "itálico comecando com _Vale porque_ resumindo esse aprendizado em ate 120 caracteres, "
                "com o numero medido. Se vier vazio, nao invente motivo. "
                "Responda SOMENTE com o texto da mensagem.\n\n"
                "DADOS CANÔNICOS (json):\n" + mp.json.dumps({**dados, "itens": novos}, ensure_ascii=False)
            )
            sessao = (f"chatwoot-consultor-v2-{c['telefone']}" if not a.dry_run
                      else f"mila-cutucada-ensaio-{c['telefone']}-{agora:%H%M%S}")
            texto = mp.hermes(envelope, sessao, {
                "MILA_CONSULTOR_NOME": c["nome"], "MILA_CONSULTOR_TELEFONE": c["telefone"],
                "MILA_CONSULTOR_UNIDADE": c["unidade_nome"]})
            if not texto or "[SEM ENVIO]" in texto:
                mp.log(f"{c['apelido']}: a Mila decidiu nao cutucar")
                continue
            if a.dry_run:
                mp.log(f"--- {c['apelido']} ({c['unidade_nome']}) [DRY-RUN] ---\n{texto.rstrip()}\n\n{LEGENDA_123}\n")
                continue
            texto = texto.rstrip() + "\n\n" + LEGENDA_123
            r = mp.enviar(c["telefone"], c["unidade_nome"], texto)
            for lid in log_ids:
                mp.concluir(lid, "ok", {"fase": "enviado", "texto": texto, "chatwoot": r})
            # radar_entregas: o registro canônico do que saiu.
            try:
                reg = mp.rpc("mila_registrar_entrega_dm_v1", {
                    "p_solicitante_telefone": c["telefone"], "p_origem": "cutucada",
                    "p_itens": [{"sinal_id": it["sinal_id"], "quem": it.get("quem")}
                                for it in novos]})
                mp.log(f"{c['apelido']}: entregas registradas: {reg}")
            except Exception as e:  # noqa: BLE001 — registro falho nao desfaz o envio
                mp.log(f"{c['apelido']}: entrega NAO registrada: {e}")
            mp.log(f"{c['apelido']}: cutucada com {len(novos)} item(ns)")
            # Cutucada vai INTEIRA: e curta (~10 linhas) e e o que o Hugo quer
            # ver. Diferente do briefing, que vai so como linha.
            mp.postar_topico(
                f"🔥 CUTUCADA · {c['apelido']} · {c['unidade_nome']} · "
                f"{len(novos)} item(ns) · {mp.dt.datetime.now(mp.BRT):%H:%M}\n\n{texto}")
        except Exception as e:  # noqa: BLE001 — uma consultora nao derruba as outras
            falhas += 1
            mp.log(f"{c['apelido']}: ERRO {e}")
            mp.postar_topico(f"🚨 ERRO na cutucada de {c['apelido']} "
                             f"({c['unidade_nome']}): {str(e)[:400]}")
    sys.exit(1 if falhas else 0)


if __name__ == "__main__":
    main()
