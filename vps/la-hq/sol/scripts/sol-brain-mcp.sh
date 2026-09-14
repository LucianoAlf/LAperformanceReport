#!/usr/bin/env bash
set -euo pipefail

readonly SECRET_FILE="/home/sol/.openclaw/secrets/sol-brain.env"

if [[ ! -r "$SECRET_FILE" ]]; then
  echo "SOL_BRAIN_MCP_ERROR class=environment_missing" >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$SECRET_FILE"
set +a

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" || "${SUPABASE_ACCESS_TOKEN}" == "REPLACE_ME" ]]; then
  echo "SOL_BRAIN_MCP_ERROR class=credential_missing" >&2
  exit 1
fi

export HOME="/home/sol"
export npm_config_cache="/home/sol/.npm"
export TOOLS="search_docs,list_projects,get_project,list_tables,list_extensions,list_migrations,execute_sql,get_logs,get_advisors,get_project_url,get_publishable_keys,generate_typescript_types,list_edge_functions,get_edge_function"
export MCP_FILTER_COMMAND="/home/sol/.openclaw/tools/node-v22.22.0/bin/npx"

args="-y @supabase/mcp-server-supabase --read-only --features account,database,debugging,development,functions,docs"
if [[ -n "${SUPABASE_PROJECT_REF:-}" ]]; then
  args="$args --project-ref ${SUPABASE_PROJECT_REF}"
fi
export MCP_FILTER_ARGS="$args"

cd /home/sol/.openclaw/workspace
exec /home/sol/.openclaw/tools/node-v22.22.0/bin/node \
  /home/sol/.openclaw/workspace/scripts/mcp-tool-filter.js
