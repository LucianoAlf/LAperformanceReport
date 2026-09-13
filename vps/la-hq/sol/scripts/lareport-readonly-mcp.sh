#!/usr/bin/env bash
set -euo pipefail

readonly SECRET_FILE="/home/sol/.openclaw/secrets/lareport-readonly.env"

if [[ ! -r "$SECRET_FILE" ]]; then
  echo "LAREPORT_MCP_ERROR class=environment_missing" >&2
  exit 2
fi

set -a
# shellcheck disable=SC1090
source "$SECRET_FILE"
set +a

for required in LA_REPORT_READONLY_POOLER_USER LA_REPORT_READONLY_PASSWORD; do
  if [[ -z "${!required:-}" ]]; then
    echo "LAREPORT_MCP_ERROR class=credential_missing field=${required}" >&2
    exit 2
  fi
done

DATABASE_URI="$({
  python3 - <<'PY'
import os
from urllib.parse import quote

user = quote(os.environ["LA_REPORT_READONLY_POOLER_USER"], safe="")
password = quote(os.environ["LA_REPORT_READONLY_PASSWORD"], safe="")
database = quote(os.environ.get("LA_REPORT_READONLY_DB", "postgres"), safe="")
host = os.environ.get("LA_REPORT_READONLY_HOST", "aws-1-sa-east-1.pooler.supabase.com")
port = os.environ.get("LA_REPORT_READONLY_PORT", "5432")
print(f"postgresql://{user}:{password}@{host}:{port}/{database}?sslmode=no-verify")
PY
})"
export DATABASE_URI

# postgres-mcp reads DATABASE_URI from the environment, keeping the credential
# out of argv. Pin both packages so a fresh process cannot silently cross the
# MCP v1/v2 compatibility boundary.
cd /tmp
exec /usr/local/bin/uv tool run \
  --from 'postgres-mcp==0.3.0' \
  --with 'mcp<2' \
  postgres-mcp --access-mode=restricted
