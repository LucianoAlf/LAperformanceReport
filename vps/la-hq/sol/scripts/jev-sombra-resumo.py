#!/usr/bin/env python3
# Resumo diário da sombra do Jev na Sol (08/10/2026): compara a leitura do Jev
# com o que a Sol fez de fato. Só leitura; grava um .txt por dia ao lado do log.
import json, sys, collections, datetime
D = '/home/sol/.hermes/profiles/sol/caixa-ingestao'
dia = sys.argv[1] if len(sys.argv) > 1 else (datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - datetime.timedelta(hours=3)).strftime('%Y-%m-%d')
def sol_fez(acao):
    a = acao or ''
    if a in ('nada', 'ignorado_fora_grupo', '') or a.startswith('conversa') or 'ignorad' in a: return 'conversa'
    if a in ('lancado', 'lote_multi_lancado', 'aberto', 'fechado', 'saida_lancada') or a.endswith('_lancado') or a.startswith('cheques_lote_lanc'): return 'aprovar'
    if 'corrigid' in a or 'complemento' in a or 'atualiz' in a or a.startswith('cheques_') or 'divergencia_motivo' in a: return 'correcao'
    if a in ('preview_enviado', 'preview_multi_aluno_enviado', 'saida_texto_preview_enviado') or a.startswith('preview_'): return 'registro_novo'
    if a.startswith('bloqueado') or 'recusad' in a or 'descartad' in a: return 'recusar/bloqueio'
    return 'outro:' + a
linhas = []
import os
for l in (open(f"{D}/jev-sombra.jsonl") if os.path.exists(f"{D}/jev-sombra.jsonl") else []):
    try: x = json.loads(l)
    except Exception: continue
    t = x.get('ts', '')
    try: local = (datetime.datetime.fromisoformat(t.replace('Z', '+00:00')) - datetime.timedelta(hours=3)).strftime('%Y-%m-%d')
    except Exception: continue
    if local == dia and x.get('messageId') != 'PROVA': linhas.append(x)
out = [f'Sombra do Jev — Sol — {dia}', f'mensagens: {len(linhas)}']
via = collections.Counter(x.get('via') for x in linhas); out.append(f"por via: {dict(via)}")
erros = collections.Counter(x.get('erro') for x in linhas if x.get('erro')); out.append(f"erros do Jev: {dict(erros) or 0}")
ms = sorted(x['ms'] for x in linhas if isinstance(x.get('ms'), int))
if ms: out.append(f"latência p50 {ms[len(ms)//2]} ms · p90 {ms[int(len(ms)*.9)]} ms")
out.append(f"custo: US$ {sum(x.get('custo') or 0 for x in linhas):.5f}")
cruz = collections.Counter((x.get('final'), sol_fez(x.get('legado'))) for x in linhas if x.get('final'))
out.append('\nJev (final) × Sol fez:')
for (j, s), n in cruz.most_common(): out.append(f"  {j:14} × {s:16} {n}")
div = [x for x in linhas if x.get('final') and sol_fez(x.get('legado')) not in (x['final'],) and not (x['final'] == 'conversa' and sol_fez(x.get('legado')) == 'conversa')]
out.append(f'\ndivergências: {len(div)}')
for x in div[:40]:
    out.append(f"  [{x.get('unidade')}] jev={x.get('final')} ({x.get('confianca')}) sol={x.get('legado')} card={'s' if x.get('cita_card_sol') else 'n'}/{'a' if x.get('card_aberto') else '-'} | {x.get('texto','')[:90]}")
txt = '\n'.join(out)
open(f'{D}/jev-sombra-resumo-{dia}.txt', 'w').write(txt + '\n')
print(txt)
