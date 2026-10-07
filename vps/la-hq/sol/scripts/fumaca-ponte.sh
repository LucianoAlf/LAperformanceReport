#!/usr/bin/env bash
# Fumaça da ponte do WhatsApp da Sol — OBRIGATÓRIA depois de todo deploy na ponte.
#
# 🔴 Por que existe (28/09/2026): a rota /caixa/tool lia uma variável fora de
#    escopo; a primeira chamada levantou ReferenceError numa rota async sem
#    try/catch e DERRUBOU a ponte (~2 min sem WhatsApp). A ponte não tem teste que
#    a carregue — só roda de verdade na VPS. Este script é esse teste, com
#    rollback pronto.
#
# O que confere, em ordem:
#   1. /health responde "connected" (espera até FUMACA_ESPERA_S);
#   2. o scriptHash do /health é o do bridge.js INSTALADO (código no disco = código rodando);
#   3. /caixa/tool com 3 pedidos recusados ANTES de qualquer envio ao grupo
#      (contexto vazio, unidade trocada, total que não está no texto) — cada um com o
#      motivo exato esperado (JSON inteiro, não recortado);
#   4. a ponte CONTINUA de pé depois das chamadas (mesmo processo, uptime crescendo);
#   5. nenhum "exited unexpectedly" no log do gateway desde o início da fumaça.
#
# Uso (como root na la-hq):
#   bash fumaca-ponte.sh                         # só confere
#   bash fumaca-ponte.sh --reiniciar             # reinicia o gateway e confere
#   bash fumaca-ponte.sh --rollback-de <SUFIXO>  # se falhar: restaura *.bak-<SUFIXO>,
#                                                #   reinicia e confere de novo
# Saída 0 = ok; 1 = falhou (e, com --rollback-de, rollback aplicado); 2 = rollback também falhou.
set -u

BRIDGE_URL="${FUMACA_BRIDGE_URL:-http://127.0.0.1:3000}"
ENV_FILE="${FUMACA_ENV_FILE:-/home/sol/.hermes/profiles/sol/.env}"
BRIDGE_JS="${FUMACA_BRIDGE_JS:-/home/sol/.hermes/hermes-agent/scripts/whatsapp-bridge/bridge.js}"
GATEWAY_LOG="${FUMACA_GATEWAY_LOG:-/home/sol/.hermes/profiles/sol/logs/gateway.log}"
ESPERA_S="${FUMACA_ESPERA_S:-90}"
REINICIAR_CMD="${FUMACA_REINICIAR_CMD:-systemctl --user -M sol@ restart hermes-gateway-sol.service}"
DIRS_ROLLBACK="${FUMACA_DIRS_ROLLBACK:-/home/sol/.hermes/hermes-agent/scripts/whatsapp-bridge /home/sol/.hermes/profiles/sol/caixa-ingestao /home/sol/.openclaw/workspace/scripts}"
NODE="${FUMACA_NODE:-node}"
PAUSA_S="${FUMACA_PAUSA_S:-3}"

REINICIAR=0; SUFIXO=""
while [ $# -gt 0 ]; do
  case "$1" in
    --reiniciar) REINICIAR=1 ;;
    --rollback-de) SUFIXO="${2:-}"; shift ;;
    *) echo "argumento desconhecido: $1" >&2; exit 64 ;;
  esac
  shift
done

log() { printf '[fumaca %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

health() { curl -s -m 5 -H 'Host: localhost' "$BRIDGE_URL/health"; }
campo() { "$NODE" -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const v=JSON.parse(d)[process.argv[1]];process.stdout.write(v==null?"":String(v))}catch(e){}})' "$1"; }

esperar_conectada() {
  local fim=$(( $(date +%s) + ESPERA_S ))
  while [ "$(date +%s)" -lt "$fim" ]; do
    [ "$(health | campo status)" = "connected" ] && return 0
    sleep 2
  done
  return 1
}

fumaca() {
  local inicio_log=0
  [ -f "$GATEWAY_LOG" ] && inicio_log=$(wc -l < "$GATEWAY_LOG")

  if ! esperar_conectada; then log "FALHOU: /health não ficou 'connected' em ${ESPERA_S}s"; return 1; fi
  local h1; h1="$(health)"
  local hash_vivo; hash_vivo="$(printf '%s' "$h1" | campo scriptHash)"
  local hash_disco; hash_disco="$(sha256sum "$BRIDGE_JS" | cut -c1-16)"
  if [ "$hash_vivo" != "$hash_disco" ]; then
    log "FALHOU: ponte rodando $hash_vivo, instalado $hash_disco (código no disco ≠ código rodando)"; return 1
  fi
  local up1; up1="$(printf '%s' "$h1" | campo uptime)"
  log "ok: conectada, scriptHash=$hash_vivo"

  local linha grupo jid uni
  linha="$(grep '^SOL_CAIXA_FINANCE_GROUPS=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"')"
  grupo="$(printf '%s' "$linha" | tr ';' '\n' | head -1)"
  jid="$(printf '%s' "$grupo" | cut -d'|' -f1)"; uni="$(printf '%s' "$grupo" | cut -d'|' -f2)"
  if [ -z "$jid" ] || [ -z "$uni" ]; then log "FALHOU: não li SOL_CAIXA_FINANCE_GROUPS em $ENV_FILE"; return 1; fi

  local ferramenta='{"name":"caixa_preparar_lancamento","action":"preparar_lancamento"}'
  local casos=(
    "contexto_invalido|{\"tool\":$ferramenta,\"ctx\":{},\"args\":{}}"
    "unidade_divergente|{\"tool\":$ferramenta,\"ctx\":{\"ok\":true,\"_chat\":\"$jid\",\"_ator_numero\":\"5500000000000\",\"unidade_id\":\"00000000-0000-0000-0000-000000000000\"},\"args\":{\"p_texto_original\":\"x\",\"p_valor_total\":10}}"
    "valor_total_nao_aparece_no_texto_original|{\"tool\":$ferramenta,\"ctx\":{\"ok\":true,\"_chat\":\"$jid\",\"_ator_numero\":\"5500000000000\",\"unidade_id\":\"$uni\"},\"args\":{\"p_texto_original\":\"Parcela R\$ 10,00\",\"p_valor_total\":402.5}}"
  )
  local caso esperado corpo resp motivo estado
  for caso in "${casos[@]}"; do
    esperado="${caso%%|*}"; corpo="${caso#*|}"
    resp="$(curl -s -m 60 -X POST -H 'Host: localhost' -H 'Content-Type: application/json' "$BRIDGE_URL/caixa/tool" -d "$corpo")"
    motivo="$(printf '%s' "$resp" | campo motivo)"; estado="$(printf '%s' "$resp" | campo estado)"
    if [ "$motivo" != "$esperado" ] || [ "$estado" != "nada_aconteceu" ]; then
      log "FALHOU: /caixa/tool esperava motivo=$esperado estado=nada_aconteceu, veio motivo='$motivo' estado='$estado'"
      return 1
    fi
    log "ok: /caixa/tool → $esperado"
  done

  sleep "$PAUSA_S"
  local h2 up2 st2
  h2="$(health)"; st2="$(printf '%s' "$h2" | campo status)"; up2="$(printf '%s' "$h2" | campo uptime)"
  if [ "$st2" != "connected" ]; then log "FALHOU: a ponte caiu depois das chamadas (status='$st2')"; return 1; fi
  if ! "$NODE" -e 'process.exit(Number(process.argv[2])>Number(process.argv[1])?0:1)' "${up1:-0}" "${up2:-0}"; then
    log "FALHOU: a ponte reiniciou durante a fumaça (uptime $up1 → $up2)"; return 1
  fi
  if [ -f "$GATEWAY_LOG" ] && tail -n +"$((inicio_log + 1))" "$GATEWAY_LOG" | grep -q 'exited unexpectedly'; then
    log "FALHOU: o gateway registrou queda da ponte durante a fumaça"; return 1
  fi
  log "ok: ponte de pé depois das chamadas (uptime $up1 → $up2)"
  return 0
}

rollback() {
  local n=0 bak alvo
  for d in $DIRS_ROLLBACK; do
    for bak in "$d"/*.bak-"$SUFIXO"; do
      [ -e "$bak" ] || continue
      alvo="${bak%.bak-"$SUFIXO"}"
      cp -p "$bak" "$alvo" && n=$((n + 1)) && log "rollback: $(basename "$alvo")"
    done
  done
  if [ "$n" -eq 0 ]; then log "ROLLBACK SEM ARQUIVOS: nenhum *.bak-$SUFIXO encontrado"; return 1; fi
  log "rollback: $n arquivo(s) restaurado(s); reiniciando"
  eval "$REINICIAR_CMD"
}

if [ "$REINICIAR" = 1 ]; then log "reiniciando o gateway"; eval "$REINICIAR_CMD"; sleep "$PAUSA_S"; fi

if fumaca; then log "FUMAÇA OK"; exit 0; fi

if [ -z "$SUFIXO" ]; then log "FUMAÇA FALHOU — sem --rollback-de, nada foi revertido"; exit 1; fi
log "FUMAÇA FALHOU — aplicando rollback de *.bak-$SUFIXO"
if rollback && sleep "$PAUSA_S" && esperar_conectada; then
  log "rollback aplicado e ponte conectada — investigar antes de publicar de novo"; exit 1
fi
log "ROLLBACK TAMBÉM FALHOU — ponte possivelmente fora do ar, agir manualmente"; exit 2
