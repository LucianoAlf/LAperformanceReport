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
set +a

export HOME=/home/mila
export PATH="/home/mila/.openclaw/tools/node-v22.22.0/bin:$PATH"

exec "$NODE_BIN" "$BRIDGE_JS" >> "$LOG_DIR/chatwoot-mila-bridge.log" 2>> "$LOG_DIR/chatwoot-mila-bridge.err.log"
