#!/usr/bin/env python3
"""Patch idempotente: tira o `npx` do caminho quente do MCP `mila-acesso-lareport`.

SINTOMA (relatado pelo Luciano em 04/09, conversa com a Mila no Telegram):
    "Porém, o MCP mila-acesso-lareport está inacessível no momento (já tentou
     várias vezes e deu erro de conexão)."
A Mila ficava sem responder NENHUMA pergunta de dado do LA Report — quantos
alunos, quantas matriculas, quem fez experimental hoje.

CAUSA-RAIZ (medida, nao suposta):
  - TCP para o pooler do Supabase: OK.
  - Role `mila_acesso_restrito`: existe, pode logar, senha sem validade.
  - O MCP em si: FUNCIONA. Chamado com o node explicito, responde o
    `initialize` do protocolo na hora.
  - O que quebra e o `npx -y @modelcontextprotocol/server-postgres`. Ele resolve
    o pacote pelo cache `~/.npm/_npx` e, quando o cache descasa, re-executa o
    binario via `sh -c`. O arquivo tem shebang `#!/usr/bin/env node` e o node
    mora em `.openclaw/tools/node-v22.22.0/bin`, FORA do PATH padrao — entao o
    `env node` falha e o npm devolve "The operation was rejected by your
    operating system / you do not have the permissions to access this file".
    A mensagem aponta para permissao e o problema e PATH; foi o que fez o
    diagnostico parecer outro.

CORRECAO: pacote fixo em `tools/mcp-postgres` e chamada direta ao node.
Sem rede, sem cache do npx e sem shebang no caminho critico.

⚠️ Mesma familia do incidente de 27/08 da Sol (`/tmp` em 755): dependencia de
   ambiente no caminho quente falha em silencio e o sintoma nao descreve a causa.

Pre-requisito (rodar como `mila`):
    cd /home/mila/.openclaw/tools/mcp-postgres && npm install @modelcontextprotocol/server-postgres

Uso: sudo -u mila python3 _patch-mcp-lareport-sem-npx-04set.py [--check]
"""
import sys, time, shutil, subprocess

ALVO = "/home/mila/.openclaw/workspace/scripts/lareport-readonly-mcp.sh"
CHECK = "--check" in sys.argv

src = open(ALVO, encoding="utf-8").read()

if "tools/mcp-postgres" in src:
    print("ja aplicado — nada a fazer")
    sys.exit(0)

DE = 'exec /home/mila/.openclaw/tools/node-v22.22.0/bin/npx -y @modelcontextprotocol/server-postgres "$CONN"'

PARA = '''# 04/09/2026: o `npx -y` saiu do caminho quente. Ele resolvia o pacote pelo cache
# `~/.npm/_npx` e, quando o cache descasa, re-executa o binario via `sh -c` — o
# shebang `#!/usr/bin/env node` nao acha o node (que mora em .openclaw/tools,
# fora do PATH padrao) e o erro que chega e "operation was rejected by your
# operating system", que aponta para permissao quando o problema e PATH.
# Sintoma para quem usa: a Mila responde "o MCP mila-acesso-lareport esta
# inacessivel" e nao consegue responder NENHUMA pergunta de dado.
# Agora o pacote e fixo e o node e chamado direto: sem rede, sem cache, sem
# shebang no caminho critico.
MCP_JS=/home/mila/.openclaw/tools/mcp-postgres/node_modules/@modelcontextprotocol/server-postgres/dist/index.js
if [[ ! -f "$MCP_JS" ]]; then
  echo "MCP postgres ausente em $MCP_JS. Rodar: cd /home/mila/.openclaw/tools/mcp-postgres && npm install @modelcontextprotocol/server-postgres" >&2
  exit 1
fi
exec /home/mila/.openclaw/tools/node-v22.22.0/bin/node "$MCP_JS" "$CONN"'''

n = src.count(DE)
assert n == 1, f"ancora do npx apareceu {n} vezes, esperava 1"
novo = src.replace(DE, PARA)

if CHECK:
    print("--check: patch valido, nada escrito")
    sys.exit(0)

bak = f"{ALVO}.bak-{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}-antes-tirar-npx"
shutil.copy2(ALVO, bak)
open(ALVO, "w", encoding="utf-8").write(novo)
subprocess.run(["bash", "-n", ALVO], check=True)
print("aplicado e sintaxe ok. backup:", bak)
