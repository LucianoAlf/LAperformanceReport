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
SECRET_CW="/home/mila/.openclaw/secrets/chatwoot.env"          # CHATWOOT_* — so para ENVIAR recado aprovado
for f in "$SECRET_SDR" "$SECRET_GESTAO" "$SECRET_CW"; do
  if [[ ! -r "$f" ]]; then echo "Missing secret file: $f" >&2; exit 1; fi
done
# Prioridade do CARIMBO (quem esta falando):
#   1) MILA_SOLICITANTE_TELEFONE ja exportado (instancia dedicada)
#   2) MILA_CONSULTOR_TELEFONE — e o que o chatwoot-mila-bridge.js JA passa por
#      env a cada spawn no modo consultor (telefone do remetente, fora do
#      alcance do modelo). Zero mudanca no bridge, zero risco no caminho de lead.
#   3) o arquivo de segredo (fallback: perfil raiz / teste do Luciano)
#
# 🔴 O HERMES NAO PROPAGA O ENV DO PROCESSO PARA O MCP (medido em 04/09/2026:
# chegam 12 variaveis, e MILA_CONSULTOR_TELEFONE nao esta entre elas). Por isso
# o carimbo TEM que vir do bloco `env:` do mcp_servers no config.yaml do perfil,
# que aceita interpolacao:
#     env:
#       MILA_SOLICITANTE_TELEFONE: ${MILA_CONSULTOR_TELEFONE}
#       MILA_CARIMBO_OBRIGATORIO: "1"
# Sem isso o wrapper caia no telefone do arquivo de segredo (Luciano, diretoria,
# unidade NULL) e a Mila respondia a consultora com escopo de DIRETORIA -- foi o
# que fez ela contar para a Vitoria o desempenho da Daiana e da Kailane.
#
# FAIL-CLOSED: com MILA_CARIMBO_OBRIGATORIO=1, carimbo ausente e' recusa, nunca
# fallback para o arquivo. Perfil sem carimbo (raiz/Telegram) segue usando o
# arquivo, que la e' o comportamento certo.
# 🔴 O arquivo de segredo tambem define MILA_GESTAO_DRY_RUN, e o `.` (source)
# atribui INCONDICIONALMENTE — ele sobrescrevia o valor vindo do bloco `env:`
# do config.yaml. Foi assim que um teste em "modo sombra" mandou WhatsApp de
# verdade para um professor e uma lead em 04/09: o perfil pedia DRY_RUN=1 e o
# secret devolvia 0. Capturamos antes e restauramos depois, igual ao carimbo.
_DRY_PEDIDO="${MILA_GESTAO_DRY_RUN:-}"
_CARIMBO="${MILA_SOLICITANTE_TELEFONE:-${MILA_CONSULTOR_TELEFONE:-}}"
if [[ "${MILA_CARIMBO_OBRIGATORIO:-0}" == "1" && -z "$_CARIMBO" ]]; then
  echo "carimbo ausente (MILA_CARIMBO_OBRIGATORIO=1): recusando iniciar sem saber quem pergunta" >&2
  exit 1
fi
set -a
# shellcheck source=/dev/null
. "$SECRET_SDR"
# shellcheck source=/dev/null
. "$SECRET_GESTAO"
# shellcheck source=/dev/null
. "$SECRET_CW"
set +a
if [[ -n "$_CARIMBO" ]]; then export MILA_SOLICITANTE_TELEFONE="$_CARIMBO"; fi
if [[ -n "$_DRY_PEDIDO" ]]; then export MILA_GESTAO_DRY_RUN="$_DRY_PEDIDO"; fi

export HOME=/home/mila
cd /home/mila/.openclaw/workspace
# o @modelcontextprotocol/sdk já está instalado no node_modules do workspace (o SDR usa)
NODE_BIN=/home/mila/.openclaw/tools/node-v22.22.0/bin/node
SERVER=/home/mila/.openclaw/workspace/scripts/mila-gestao-tools-mcp.mjs
exec "$NODE_BIN" "$SERVER"
