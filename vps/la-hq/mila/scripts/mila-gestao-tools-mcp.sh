#!/usr/bin/env bash
# Wrapper do MCP server mila-gestao-tools (padrão crachá + carimbo).
#
# CRACHÁ: este processo carrega o segredo (service key do LA Report, o MESMO
# arquivo que o mila-sdr-tools já usa) e chama as RPCs; o agente só vê tools.
#
# CARIMBO: MILA_SOLICITANTE_TELEFONE fixa QUEM PEDE nesta instância. O gateway
# do Hermes não passa o remetente às tools, então o telefone NUNCA vem do
# modelo — vem daqui. Passo 4 (teste na DM do Luciano) = carimbo do Luciano.
# Para as consultoras, cada instância/bridge carimba a sua.
#
# node chamado DIRETO (sem npx): é o que quebrou o mila-acesso-lareport em 04/09
# (shebang `env node` fora do PATH → "operation was rejected by your OS").
set -euo pipefail

SECRET_SDR="/home/mila/.openclaw/secrets/mila-sdr-tools.env"     # SUPABASE_LAREPORT_URL / _SERVICE_KEY
SECRET_GESTAO="/home/mila/.openclaw/secrets/mila-gestao-tools.env" # MILA_SOLICITANTE_TELEFONE (+ MILA_GESTAO_DRY_RUN)
for f in "$SECRET_SDR" "$SECRET_GESTAO"; do
  if [[ ! -r "$f" ]]; then echo "Missing secret file: $f" >&2; exit 1; fi
done
set -a
# shellcheck source=/dev/null
. "$SECRET_SDR"
# shellcheck source=/dev/null
. "$SECRET_GESTAO"
set +a

export HOME=/home/mila
cd /home/mila/.openclaw/workspace
# o @modelcontextprotocol/sdk já está instalado no node_modules do workspace (o SDR usa)
NODE_BIN=/home/mila/.openclaw/tools/node-v22.22.0/bin/node
SERVER=/home/mila/.openclaw/workspace/scripts/mila-gestao-tools-mcp.mjs
exec "$NODE_BIN" "$SERVER"
