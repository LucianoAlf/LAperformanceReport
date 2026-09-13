#!/usr/bin/env python3
"""Patch (13/09/2026) — Mila entrega relatórios pela MESMA fonte que o grupo recebe.

Aplica, no repositório (vps/la-hq/mila/scripts/), as três edições desta frente:
  1. mila-gestao-tools-mcp.mjs: 5 tools novas (relatorio_diario_comercial,
     relatorio_mensal_comercial, relatorio_matriculas, relatorio_comparativo,
     link_la_report) + helpers de entrega na conversa.
  2. mila-proativa.py: legenda 1/2/3 no briefing da manhã e registro em radar_entregas.
  (mila-cutucada.py já foi editado no mesmo passo, sem este arquivo.)

Idempotente: cada edição confere a âncora e pula se já estiver aplicada. Preserva o
fim de linha original de cada arquivo (o proativa.py estava em CRLF — foi isso que
derrubou a primeira tentativa, feita por heredoc).
"""
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))


def ler(path):
    raw = open(path, 'rb').read().decode('utf-8')
    eol = '\r\n' if '\r\n' in raw else '\n'
    return raw.replace('\r\n', '\n'), eol


def gravar(path, texto, eol):
    open(path, 'wb').write(texto.replace('\n', eol).encode('utf-8'))


def patch_tools():
    p = os.path.join(BASE, 'mila-gestao-tools-mcp.mjs')
    s, eol = ler(p)
    if "case 'relatorio_diario_comercial'" in s:
        print('tools: já aplicado')
        return
    assert s.count('const LEITURA = [') == 1
    assert s.count("    case 'anotar_lead':") == 1
    assert s.count('  return [...LEITURA, ...(veBaseComercial() ? BASE_COMERCIAL : []),') == 1
    helpers = open(os.path.join(BASE, '_patch-relatorios-fonte-unica-13set.helpers.mjs.txt'), encoding='utf-8').read()
    cases = open(os.path.join(BASE, '_patch-relatorios-fonte-unica-13set.cases.mjs.txt'), encoding='utf-8').read()
    s = s.replace('const LEITURA = [', helpers + 'const LEITURA = [', 1)
    s = s.replace('  return [...LEITURA, ...(veBaseComercial() ? BASE_COMERCIAL : []),',
                  '  return [...LEITURA, ...RELATORIOS, ...(veBaseComercial() ? BASE_COMERCIAL : []),', 1)
    s = s.replace("    case 'anotar_lead':", cases + "    case 'anotar_lead':", 1)
    gravar(p, s, eol)
    print('tools: 5 tools + helpers inseridos')


def patch_proativa():
    p = os.path.join(BASE, 'mila-proativa.py')
    s, eol = ler(p)
    if 'LEGENDA_123' in s:
        print('proativa: já aplicado')
        return
    a = 'MOLDE_MANHA = """\\\n'
    assert s.count(a) == 1, s.count(a)
    s = s.replace(a, '# Laço 1/2/3 (13/09/2026): só os itens com sinal_id (QUENTES AGORA) entram no registro\n'
                     '# de entregas; a legenda vai fora do modelo, para nunca faltar.\n'
                     'LEGENDA_123 = "_Responda *1* já resolvi · *2* vou agora · *3* não é comigo_"\n\n' + a, 1)
    old = ('            if a.dry_run:\n'
           '                log(f"--- {c[\'apelido\']} ({c[\'unidade_nome\']}) [DRY-RUN — nada enviado] ---\\n{texto}\\n")\n'
           '                continue\n'
           '            r = enviar(c["telefone"], c["unidade_nome"], texto)\n'
           '            concluir(log_id, "ok", {"fase": "enviado", "texto": texto, "chatwoot": r, "dados": dados})\n')
    assert s.count(old) == 1, s.count(old)
    new = ('            itens_123 = ([{"sinal_id": x.get("sinal_id"), "quem": x.get("quem")}\n'
           '                          for x in (dados.get("quentes_agora") or []) if x.get("sinal_id")]\n'
           '                         if a.tipo == "manha" else [])\n'
           '            if itens_123:\n'
           '                texto = texto.rstrip() + "\\n\\n" + LEGENDA_123\n'
           '            if a.dry_run:\n'
           '                log(f"--- {c[\'apelido\']} ({c[\'unidade_nome\']}) [DRY-RUN — nada enviado] ---\\n{texto}\\n")\n'
           '                continue\n'
           '            r = enviar(c["telefone"], c["unidade_nome"], texto)\n'
           '            concluir(log_id, "ok", {"fase": "enviado", "texto": texto, "chatwoot": r, "dados": dados})\n'
           '            if itens_123:\n'
           '                # radar_entregas: o registro canônico do que saiu — é a que o "1/2/3" se refere.\n'
           '                try:\n'
           '                    reg = rpc("mila_registrar_entrega_dm_v1", {"p_solicitante_telefone": c["telefone"],\n'
           '                                                                "p_origem": "briefing", "p_itens": itens_123})\n'
           '                    log(f"{c[\'apelido\']}: entregas registradas: {reg}")\n'
           '                except Exception as e:  # noqa: BLE001 — registro falho nao desfaz o envio\n'
           '                    log(f"{c[\'apelido\']}: entrega NAO registrada: {e}")\n')
    s = s.replace(old, new, 1)
    gravar(p, s, eol)
    print('proativa: legenda + registro inseridos (eol=%r)' % eol)


def patch_cutucada():
    p = os.path.join(BASE, 'mila-cutucada.py')
    s, eol = ler(p)
    if 'LEGENDA_123' in s:
        print('cutucada: já aplicado')
        return
    a = 'TETO_DIA = 5\n'
    assert s.count(a) == 1
    s = s.replace(a, a + '# Laço 1/2/3 (13/09/2026): a consultora responde um dígito e o bridge fecha o sinal\n'
                         '# sem modelo (mila_responder_cutucada_v1). A legenda é acrescentada AQUI, fora do\n'
                         '# modelo, para nunca faltar.\n'
                         'LEGENDA_123 = "_Responda *1* já resolvi · *2* vou agora · *3* não é comigo_"\n', 1)
    old = ('            r = mp.enviar(c["telefone"], c["unidade_nome"], texto)\n'
           '            for lid in log_ids:\n'
           '                mp.concluir(lid, "ok", {"fase": "enviado", "texto": texto, "chatwoot": r})\n')
    assert s.count(old) == 1, s.count(old)
    new = ('            texto = texto.rstrip() + "\\n\\n" + LEGENDA_123\n'
           '            r = mp.enviar(c["telefone"], c["unidade_nome"], texto)\n'
           '            for lid in log_ids:\n'
           '                mp.concluir(lid, "ok", {"fase": "enviado", "texto": texto, "chatwoot": r})\n'
           '            # radar_entregas: o registro canônico do que saiu — é a que o "1/2/3" se refere.\n'
           '            try:\n'
           '                reg = mp.rpc("mila_registrar_entrega_dm_v1", {\n'
           '                    "p_solicitante_telefone": c["telefone"], "p_origem": "cutucada",\n'
           '                    "p_itens": [{"sinal_id": it["sinal_id"], "quem": it.get("quem")} for it in novos]})\n'
           '                mp.log(f"{c[\'apelido\']}: entregas registradas: {reg}")\n'
           '            except Exception as e:  # noqa: BLE001 — registro falho nao desfaz o envio\n'
           '                mp.log(f"{c[\'apelido\']}: entrega NAO registrada: {e}")\n')
    s = s.replace(old, new, 1)
    # dry-run mostra a legenda também
    old_dry = '[DRY-RUN] ---\\n{texto}\\n")'
    if s.count(old_dry) == 1:
        s = s.replace(old_dry, '[DRY-RUN] ---\\n{texto.rstrip()}\\n\\n{LEGENDA_123}\\n")', 1)
    gravar(p, s, eol)
    print('cutucada: legenda + registro inseridos (eol=%r)' % eol)


if __name__ == '__main__':
    patch_tools()
    patch_proativa()
    patch_cutucada()
    sys.exit(0)
