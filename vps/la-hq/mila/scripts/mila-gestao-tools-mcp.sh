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
# Prioridade do CARIMBO (quem esta falando):
#   1) MILA_SOLICITANTE_TELEFONE ja exportado (instancia dedicada)
#   2) MILA_CONSULTOR_TELEFONE — e o que o chatwoot-mila-bridge.js JA passa por
#      env a cada spawn no modo consultor (telefone do remetente, fora do
#      alcance do modelo). Zero mudanca no bridge, zero risco no caminho de lead.
#   3) o arquivo de segredo (fallback: perfil raiz / teste do Luciano)
_CARIMBO="${MILA_SOLICITANTE_TELEFONE:-${MILA_CONSULTOR_TELEFONE:-}}"
set -a
# shellcheck source=/dev/null
. "$SECRET_SDR"
# shellcheck source=/dev/null
. "$SECRET_GESTAO"
set +a
if [[ -n "$_CARIMBO" ]]; then export MILA_SOLICITANTE_TELEFONE="$_CARIMBO"; fi

export HOME=/home/mila
cd /home/mila/.openclaw/workspace
# o @modelcontextprotocol/sdk já está instalado no node_modules do workspace (o SDR usa)
NODE_BIN=/home/mila/.openclaw/tools/node-v22.22.0/bin/node
SERVER=/home/mila/.openclaw/workspace/scripts/mila-gestao-tools-mcp.mjs
exec "$NODE_BIN" "$SERVER"
