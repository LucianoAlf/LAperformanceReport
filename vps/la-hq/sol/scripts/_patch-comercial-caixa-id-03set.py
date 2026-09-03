#!/usr/bin/env python3
"""Patch idempotente: o relatorio comercial passa a respeitar `caixa_id` do
destinatario — e assim pode sair pela Mila em vez da Sol.

POR QUE: `send-lareport-comercial-hermes.py` lia os destinatarios com
`select: tipo,nome,jid,unidade_id,ativo` — SEM caixa_id — entao todo envio caia
na bridge nativa da Sol. O consolidado de presenca da Fabi ja passa caixa_id
desde 26/08; este patch faz o comercial usar o mesmo mecanismo.

Comportamento: destinatario com caixa_id NULL continua saindo pela Sol (zero
mudanca hoje). Destinatario com caixa_id preenchido sai SO por aquela caixa.

Uso: python3 _patch-comercial-caixa-id-03set.py [--check]
"""
import sys, time, shutil

ALVO = "/home/sol/.openclaw/workspace/scripts/send-lareport-comercial-hermes.py"
CHECK = "--check" in sys.argv
src = open(ALVO, encoding="utf-8").read()
orig = src

if "caixa_id=destination.get('caixa_id')" in src:
    print("ja aplicado — nada a fazer")
    sys.exit(0)


def trocar(de, para, rotulo, esperado=1):
    global src
    n = src.count(de)
    assert n == esperado, f"{rotulo}: esperava {esperado}, achei {n}"
    src = src.replace(de, para)
    print(f"  ok {rotulo}")


trocar(
    "        'select': 'tipo,nome,jid,unidade_id,ativo',",
    "        'select': 'tipo,nome,jid,unidade_id,ativo,caixa_id',",
    "select com caixa_id",
)
trocar(
    "def send_report(target, text):",
    "def send_report(target, text, caixa_id=None):",
    "assinatura de send_report",
)
trocar(
    "        return {'success': True, **send_single_report(target, text)}",
    "        return {'success': True, **send_single_report(target, text, caixa_id=caixa_id)}",
    "send_single_report com caixa_id",
)
trocar(
    "            send_result = send_report(destination['jid'], texto)",
    "            send_result = send_report(destination['jid'], texto, caixa_id=destination.get('caixa_id'))",
    "chamada com caixa_id do destinatario",
)

assert src != orig
compile(src, ALVO, "exec")
if CHECK:
    print("--check: patch valido, nada escrito")
    sys.exit(0)
bak = f"{ALVO}.bak-{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}-before-caixa-id"
shutil.copy2(ALVO, bak)
open(ALVO, "w", encoding="utf-8").write(src)
print("aplicado. backup:", bak)
