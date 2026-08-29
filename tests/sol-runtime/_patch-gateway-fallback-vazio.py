#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Mensagem VAZIA nunca vai para o grupo — nem como fallback de erro.
#
# CASO (Sol/CG, 29/08 15:02-15:03): "Fechado pessoal" / "Bom final de semana"
# chegaram ao LLM, que respondeu vazio (silencio legitimo). O gateway tentou
# enviar assim mesmo; a bridge recusou ("chatId and message are required"); e o
# fallback de formatacao postou "(Response formatting failed, plain text:)" —
# o prefixo de erro CRU, sem conteudo — DUAS vezes num grupo com a equipe.
#
# Fix em _send_with_retry (gateway/platforms/base.py):
#  1. guard no inicio: content vazio => suprime o envio (vazio = silencio do
#     agente; honrar).
#  2. guard no fallback: se por qualquer outro caminho o content chegar vazio
#     ali, devolve o erro original em vez de postar o artefato.
import io
import sys

alvo = sys.argv[1] if len(sys.argv) > 1 else None
if not alvo:
    print('uso: _patch-gateway-fallback-vazio.py <base.py>')
    sys.exit(2)

src = io.open(alvo, encoding='utf-8').read()
antes = len(src)

def trocar(de, para, rotulo, esperado=1):
    global src
    n = src.count(de)
    if n != esperado:
        print('ANCORA "%s": esperava %d, achei %d' % (rotulo, esperado, n))
        sys.exit(1)
    src = src.replace(de, para)
    print('  ok  %s' % rotulo)

trocar(
    '''        """

        result = await self.send(
            chat_id=chat_id,
            content=content,
            reply_to=reply_to,
            metadata=metadata,
        )''',
    '''        """

        # An empty message can never be delivered (the WhatsApp bridge rejects it
        # with "chatId and message are required") and the plain-text fallback then
        # posts a bare "(Response formatting failed, plain text:)" artifact into a
        # customer-facing group (Sol/CG, 2026-08-29 15:02 BRT, twice). Empty means
        # the agent chose silence -- honor it.
        if not (content or "").strip():
            logger.warning("[%s] Suppressing empty message send", self.name)
            return SendResult(success=True)

        result = await self.send(
            chat_id=chat_id,
            content=content,
            reply_to=reply_to,
            metadata=metadata,
        )''',
    'guard de content vazio no inicio do _send_with_retry')

trocar(
    '''        # Non-network / post-retry formatting failure: try plain text as fallback
        logger.warning("[%s] Send failed: %s — trying plain-text fallback", self.name, error_str)''',
    '''        # Non-network / post-retry formatting failure: try plain text as fallback
        if not (content or "").strip():
            logger.warning("[%s] Send failed with empty content; suppressing artifact fallback: %s", self.name, error_str)
            return result
        logger.warning("[%s] Send failed: %s — trying plain-text fallback", self.name, error_str)''',
    'guard de content vazio no fallback plain-text')

io.open(alvo, 'w', encoding='utf-8').write(src)
print('\npatch aplicado: %d -> %d bytes (+%d)' % (antes, len(src), len(src) - antes))
