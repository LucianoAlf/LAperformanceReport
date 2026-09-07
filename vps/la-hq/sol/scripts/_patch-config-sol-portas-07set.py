#!/usr/bin/env python3
"""LIGA O MCP `sol-portas` NO CONFIG DA SOL (07/09/2026).

Acrescenta o servidor ao bloco `mcp_servers` do perfil, ao lado dos seis que ja
existem. NAO remove nenhum — em especial nao toca no `mcp-hugo`, que e a caixa
de ferramentas do coordenador de tecnologia.

⚠️ O `sol-acesso-restrito` FICA, de proposito. Ele e a porta larga (`query`), e
   tira-lo no mesmo movimento em que as portas estreiam seria trocar de piso no
   escuro: se uma porta faltar, a Sol perde a capacidade sem alternativa. O
   caminho e as portas virarem o caminho FACIL e a porta larga definhar por
   desuso — medivel em `automacao_log` (evento `sol_portas`) contra o
   `pg_stat_statements` do papel restrito. Aposentar e decisao com numero, nao
   com fe.

⚠️ NAO injeta `SOL_SOLICITANTE_TELEFONE` no env. Descoberto ao ligar: o processo
   do MCP recebe env ESTATICO (`mcp_tool.py:3027`, `StdioServerParameters(
   env=_build_safe_env(user_env))`, onde `user_env` e o bloco `env:` do
   config). Um telefone fixo ali faria TODA conversa se passar pela mesma
   pessoa — pior que o telefone vir na chamada. Entao o argumento fica na tool,
   e o registro em `automacao_log` e o que torna isso verificavel.

  python3 _patch-config-sol-portas-07set.py <config.yaml>
"""
import io
import sys

BLOCO = """  sol-portas:
    command: node
    args:
      - /home/sol/.openclaw/workspace/scripts/sol-portas-mcp.mjs
"""

if len(sys.argv) < 2:
    print("uso: python3 _patch-config-sol-portas-07set.py <config.yaml>", file=sys.stderr)
    raise SystemExit(2)

alvo = sys.argv[1]
s = io.open(alvo, encoding="utf-8").read()

if "sol-portas:" in s:
    print("sol-portas ja esta no config — nada a fazer")
    raise SystemExit(0)

ANC = "mcp_servers:\n"
n = s.count(ANC)
if n != 1:
    print(f"ANCORA mcp_servers: esperava 1, achei {n}", file=sys.stderr)
    raise SystemExit(1)

s = s.replace(ANC, ANC + BLOCO, 1)
io.open(alvo, "w", encoding="utf-8", newline="\n").write(s)
print("sol-portas acrescentado ao mcp_servers")
