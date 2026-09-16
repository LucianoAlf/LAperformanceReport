#!/usr/bin/env bash
# Supervisor: reinicia a bridge caso ela morra
SCRIPT_DIR="/home/mila/.openclaw/workspace/scripts"
LOG_DIR="/home/mila/.openclaw/logs"
RESTART_DELAY=5

while true; do
    bash "$SCRIPT_DIR/start-chatwoot-mila-bridge.sh"
    EXIT_CODE=$?
    echo "$(date '+%Y-%m-%d %H:%M:%S') Bridge exited with code $EXIT_CODE. Restarting in ${RESTART_DELAY}s..." >> "$LOG_DIR/chatwoot-mila-bridge.err.log"
    sleep "$RESTART_DELAY"
done
