#!/usr/bin/env bash
# Prova viva das portas pelo MCP, com o telefone vindo do PROCESSO.
set -uo pipefail
S=/home/sol/.openclaw/workspace/scripts/sol-portas-mcp.mjs
E=/home/sol/.openclaw/secrets/lareport-readonly.env
TEL="$1"; ROTULO="$2"
echo "=== $ROTULO ==="
SOL_SOLICITANTE_TELEFONE="$TEL" node "$S" < /tmp/mcpcall.txt 2>&1 | python3 -c "
import sys, json
for l in sys.stdin:
    try: d = json.loads(l)
    except Exception: continue
    r = d.get('result') or {}
    if 'content' not in r: continue
    o = json.loads(r['content'][0]['text'])
    nome = {3:'caixa_do_dia', 4:'numeros_da_unidade', 5:'contratos_vencendo(Barra)'}.get(d.get('id'), '?')
    if o.get('ok'):
        esc = o.get('escopo') or {}
        print(f\"  {nome:28} OK    · {esc.get('publico')} · {esc.get('unidade_nome')}\")
    else:
        print(f\"  {nome:28} NAO   · {o.get('motivo')}\")
"
