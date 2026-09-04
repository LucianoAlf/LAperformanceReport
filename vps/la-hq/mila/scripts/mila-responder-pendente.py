#!/usr/bin/env python3
"""mila-responder-pendente.py — a Mila responde o que ficou sem resposta.

Existe por causa de 04/09/2026: a Daiana e a Kailane escreveram às 15:23-15:25 BRT,
o gatilho pegou (`consultor_acordou`), e o Hermes do perfil das consultoras morreu
em `hermes_exit_1` (auth do modelo). Elas ficaram no vácuo e **ninguém foi avisado**
— o bridge registra `reply_error` no log e segue. Quando isso acontecer de novo,
este script faz a Mila voltar e responder, em vez de a pessoa ter que repetir.

Reusa a mecânica do mila-proativa.py (mesma sessão do bridge, mesma WAHA), então
a resposta entra no histórico dela com a consultora — ela sabe o que mandou.

Uso:
  mila-responder-pendente.py --telefone 5521968060404 \
      --pergunta "Mila, me passa as experimentais que temos hoje na unidade do recreio?" \
      --quando "15:24" [--dry-run]
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--telefone", required=True)
    ap.add_argument("--pergunta", required=True, action="append",
                    help="pode repetir: uma por mensagem que ficou sem resposta, em ordem")
    ap.add_argument("--quando", default="mais cedo", help="hora BRT da 1ª pergunta, para ela se situar")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    mp.load_env()

    consultoras = {c["telefone"]: c for c in mp.rpc("mila_consultoras_ativas_v1", {})}
    c = consultoras.get(a.telefone)
    if not c:
        mp.log(f"{a.telefone} não é consultora ativa na governança — nada a fazer")
        sys.exit(1)

    perguntas = "\n".join(f"- {p}" for p in a.pergunta)
    envelope = (
        f"[MILA · RESPOSTA ATRASADA · {a.quando}]\n"
        f"A {c['apelido']} ({c['nome']}, {c['unidade_nome']}) te escreveu às {a.quando} e você NÃO respondeu — "
        f"deu falha técnica do teu lado (já corrigida), não foi ela. O que ela perguntou:\n{perguntas}\n"
        f"Responda AGORA, no WhatsApp dela: comece reconhecendo a demora em UMA linha curta e sem drama "
        f"(algo como 'Desculpa a demora, tive um problema aqui'), e em seguida responda de verdade, "
        f"usando as tuas ferramentas para buscar o dado. Se não tiver ferramenta para aquilo, diga com todas "
        f"as letras que não tem esse dado e o que você consegue dar no lugar — nunca invente número. "
        f"Formato de WhatsApp (*negrito* com um asterisco, quebras de linha, sem tabela), curto, tom de parceira. "
        f"Responda SOMENTE com o texto da mensagem."
    )
    # ensaio SEMPRE em sessão nova: reaproveitar a do ensaio anterior faz ela
    # repetir a resposta velha e some com o efeito do fix que se está testando
    ensaio = f"mila-pendente-ensaio-{a.telefone}-{dt.datetime.now(mp.BRT):%H%M%S}"
    sessao = f"chatwoot-consultor-v2-{a.telefone}" if not a.dry_run else ensaio
    env_extra = {"MILA_CONSULTOR_NOME": c["nome"], "MILA_CONSULTOR_TELEFONE": a.telefone,
                 "MILA_CONSULTOR_UNIDADE": c["unidade_nome"]}
    texto = mp.hermes(envelope, sessao, env_extra)
    if not texto:
        mp.log(f"{c['apelido']}: a Mila não produziu texto")
        sys.exit(1)
    if a.dry_run:
        mp.log(f"--- {c['apelido']} ({c['unidade_nome']}) [DRY-RUN — nada enviado] ---\n{texto}\n")
        return
    r = mp.enviar(a.telefone, c["unidade_nome"], texto)
    mp.log(f"{c['apelido']}: resposta atrasada enviada ({len(texto)} chars) · {r}")


if __name__ == "__main__":
    main()
