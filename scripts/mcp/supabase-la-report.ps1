$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$tokenFile = Join-Path $repoRoot ".mcp-secrets\supabase_access_token.txt"

if (-not (Test-Path -LiteralPath $tokenFile)) {
  [Console]::Error.WriteLine("Supabase MCP token file not found: $tokenFile")
  [Console]::Error.WriteLine("Create it with only the Supabase MCP access token on the first line.")
  exit 1
}

$token = (Get-Content -LiteralPath $tokenFile -Raw).Trim()
if ([string]::IsNullOrWhiteSpace($token)) {
  [Console]::Error.WriteLine("Supabase MCP token file is empty: $tokenFile")
  exit 1
}

$env:SUPABASE_ACCESS_TOKEN = $token
npx -y @supabase/mcp-server-supabase@latest --project-ref ouqwbbermlzqqvtqwlul
