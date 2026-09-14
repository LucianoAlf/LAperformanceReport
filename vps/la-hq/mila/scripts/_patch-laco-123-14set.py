#!/usr/bin/env python3
"""Patch (14/09/2026) — legenda 1/2/3 + registro em radar_entregas, sobre a versão VIVA.

Refaz o patch de 13/09 que se perdeu: naquele dia eu copiei `mila-proativa.py` e
`mila-cutucada.py` do REPO para a VPS sem comparar antes, e o repo estava atrás —
sumiram o bloco de liderança, o tópico Cutucadas do Telegram, o `HERMES_HOME` do
perfil unificado (09/09) e a janela de cutucada por dia da semana (Alf, 06/09).
Efeito medido: em 14/09 as 3 consultoras receberam o briefing pelo perfil errado e
a liderança não recebeu nada.

⚠️ Escreve as barras por `chr(92)`: o patch anterior perdeu o `\\` numa camada de
escape do shell e a âncora passou a não casar (armadilha já documentada no
CLAUDE.md). Aqui nenhuma barra literal atravessa o shell.

Idempotente: marcador `LEGENDA_123`. Uso: python3 _patch-laco-123-14set.py
"""
import os
import re
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
BARRA = chr(92)
NL = BARRA + 'n'          # o texto "\n" como ele fica DENTRO do arquivo gerado
FIM_DOCSTRING = '"""' + BARRA   # abertura de docstring que segue com barra de continuação

LEGENDA = ('LEGENDA_123 = "_Responda *1* já resolvi · *2* vou agora · *3* não é comigo_"')


def ler(path):
    raw = open(path, 'rb').read().decode('utf-8')
    return raw.replace(chr(13) + chr(10), chr(10)), (chr(13) + chr(10) if chr(13) + chr(10) in raw else chr(10))


def gravar(path, texto, eol):
    open(path, 'wb').write(texto.replace(chr(10), eol).encode('utf-8'))


def patch_proativa():
    p = os.path.join(BASE, 'mila-proativa.py')
    s, eol = ler(p)
    if 'LEGENDA_123' in s:
        print('proativa: já aplicado')
        return
    ancora = 'MOLDE_MANHA = ' + FIM_DOCSTRING + chr(10)
    assert s.count(ancora) == 1, f'ancora MOLDE_MANHA: {s.count(ancora)}'
    s = s.replace(ancora,
                  '# Laço 1/2/3 (13/09/2026): só os itens com sinal_id (QUENTES AGORA) entram no\n'
                  '# registro de entregas; a legenda vai fora do modelo, para nunca faltar.\n'
                  + LEGENDA + '\n\n' + ancora, 1)

    # 1) monta itens_123 e acrescenta a legenda ANTES do dry-run (o ensaio tem de ver o mesmo texto)
    alvo = ('            if a.dry_run:\n'
            '                log(f"--- {c[\'apelido\']} ({c[\'unidade_nome\']}) [DRY-RUN — nada enviado] ---'
            + NL + '{texto}' + NL + '")\n'
            '                continue\n'
            '            r = enviar(c["telefone"], c["unidade_nome"], texto)\n')
    assert s.count(alvo) == 1, f'ancora dry-run/enviar: {s.count(alvo)}'
    novo = ('            itens_123 = ([{"sinal_id": x.get("sinal_id"), "quem": x.get("quem")}\n'
            '                          for x in (dados.get("quentes_agora") or []) if x.get("sinal_id")]\n'
            '                         if a.tipo == "manha" else [])\n'
            '            if itens_123:\n'
            '                texto = texto.rstrip() + "' + NL + NL + '" + LEGENDA_123\n'
            + alvo)
    s = s.replace(alvo, novo, 1)

    # 2) registro do que saiu, DEPOIS do concluir() — envio bom não é desfeito por log ruim
    alvo2 = ('            concluir(log_id, "ok", {"fase": "enviado", "texto": texto, "chatwoot": r,\n'
             '                                    "convite": (convite_do_dia(dados) or {}).get("chave"),\n'
             '                                    "dados": dados})\n')
    assert s.count(alvo2) == 1, f'ancora concluir: {s.count(alvo2)}'
    s = s.replace(alvo2, alvo2 +
                  '            if itens_123:\n'
                  '                # radar_entregas: o registro canônico do que saiu — é a ele que o "1/2/3" se refere.\n'
                  '                try:\n'
                  '                    reg = rpc("mila_registrar_entrega_dm_v1",\n'
                  '                              {"p_solicitante_telefone": c["telefone"],\n'
                  '                               "p_origem": "briefing", "p_itens": itens_123})\n'
                  '                    log(f"{c[\'apelido\']}: entregas registradas: {reg}")\n'
                  '                except Exception as e:  # noqa: BLE001 — registro falho nao desfaz o envio\n'
                  '                    log(f"{c[\'apelido\']}: entrega NAO registrada: {e}")\n', 1)
    gravar(p, s, eol)
    print('proativa: legenda + registro aplicados')


def patch_cutucada():
    p = os.path.join(BASE, 'mila-cutucada.py')
    s, eol = ler(p)
    if 'LEGENDA_123' in s:
        print('cutucada: já aplicado')
        return
    ancora = 'TETO_DIA = 5\n'
    assert s.count(ancora) == 1
    s = s.replace(ancora, ancora +
                  '# Laço 1/2/3 (13/09/2026): a consultora responde um dígito e o bridge fecha o\n'
                  '# sinal sem modelo (mila_responder_cutucada_v1). A legenda é acrescentada AQUI,\n'
                  '# fora do modelo, para nunca faltar.\n' + LEGENDA + '\n', 1)

    alvo = ('            r = mp.enviar(c["telefone"], c["unidade_nome"], texto)\n'
            '            for lid in log_ids:\n')
    assert s.count(alvo) == 1, f'ancora enviar/log_ids: {s.count(alvo)}'
    s = s.replace(alvo, '            texto = texto.rstrip() + "' + NL + NL + '" + LEGENDA_123\n' + alvo, 1)

    seco = '[DRY-RUN] ---' + NL + '{texto}' + NL + '")'
    if s.count(seco) == 1:
        s = s.replace(seco, '[DRY-RUN] ---' + NL + '{texto.rstrip()}' + NL + NL + '{LEGENDA_123}' + NL + '")', 1)

    m = re.search(r'( +)for lid in log_ids:\n +mp\.concluir\(lid, "ok", \{[^\n]*\}\)\n', s)
    assert m, 'ancora concluir do lote'
    s = s[:m.end()] + (
        '            # radar_entregas: o registro canônico do que saiu.\n'
        '            try:\n'
        '                reg = mp.rpc("mila_registrar_entrega_dm_v1", {\n'
        '                    "p_solicitante_telefone": c["telefone"], "p_origem": "cutucada",\n'
        '                    "p_itens": [{"sinal_id": it["sinal_id"], "quem": it.get("quem")}\n'
        '                                for it in novos]})\n'
        '                mp.log(f"{c[\'apelido\']}: entregas registradas: {reg}")\n'
        '            except Exception as e:  # noqa: BLE001 — registro falho nao desfaz o envio\n'
        '                mp.log(f"{c[\'apelido\']}: entrega NAO registrada: {e}")\n') + s[m.end():]
    gravar(p, s, eol)
    print('cutucada: legenda + registro aplicados')


if __name__ == '__main__':
    patch_proativa()
    patch_cutucada()
    sys.exit(0)
