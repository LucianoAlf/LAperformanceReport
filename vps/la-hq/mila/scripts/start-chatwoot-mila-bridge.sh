#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="/home/mila/.openclaw/workspace/scripts"
BRIDGE_JS="$SCRIPT_DIR/chatwoot-mila-bridge.js"
LOG_DIR="/home/mila/.openclaw/logs"
NODE_BIN="/home/mila/.openclaw/tools/node-v22.22.0/bin/node"

mkdir -p "$LOG_DIR"

# Load env files
set -a
[ -f /home/mila/.openclaw/secrets/chatwoot.env ] && source /home/mila/.openclaw/secrets/chatwoot.env
[ -f /home/mila/.openclaw/secrets/waha.env ] && source /home/mila/.openclaw/secrets/waha.env
# 16/09/2026: SUPABASE_LAREPORT_URL + SUPABASE_LAREPORT_SERVICE_KEY -- a bridge
# nunca tinha falado direto com o Supabase antes de hoje. Sem isto,
# rpcSupabase() em chatwoot-mila-bridge.js devolve null e o contexto proativo
# fica desligado em silencio (nunca derruba a resposta, so perde o que a Mila
# mandou sozinha). E' o mesmo arquivo que o mila-gestao-tools-mcp.sh ja usa --
# NAO secrets/supabase-mila.env, que aponta para o projeto ANTIGO da Mila SDR.
[ -f /home/mila/.openclaw/secrets/mila-sdr-tools.env ] && source /home/mila/.openclaw/secrets/mila-sdr-tools.env
set +a

export HOME=/home/mila
export PATH="/home/mila/.openclaw/tools/node-v22.22.0/bin:$PATH"

exec "$NODE_BIN" "$BRIDGE_JS" >> "$LOG_DIR/chatwoot-mila-bridge.log" 2>> "$LOG_DIR/chatwoot-mila-bridge.err.log"
