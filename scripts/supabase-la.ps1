param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$SupabaseArgs
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$tokenPath = Join-Path $repoRoot ".mcp-secrets\supabase_access_token.txt"

if (-not (Test-Path -LiteralPath $tokenPath)) {
  throw "Supabase access token not found at $tokenPath. Create this ignored local file with the Supabase access token on the first line."
}

$token = (Get-Content -Raw -LiteralPath $tokenPath).Trim()
if ([string]::IsNullOrWhiteSpace($token)) {
  throw "Supabase access token file is empty: $tokenPath"
}

$env:SUPABASE_ACCESS_TOKEN = $token
Push-Location $repoRoot
try {
  & supabase @SupabaseArgs
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}
finally {
  Pop-Location
}
