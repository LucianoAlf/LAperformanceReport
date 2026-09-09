#!/usr/bin/env bash
# A suíte do caixa da Sol, em UM comando, a partir de um checkout limpo.
#
# 🔴 POR QUE ISTO EXISTE (09/09/2026). Antes de hoje, 35 dos 38 testes faziam
#    `require('/home/sol/...')` — o caminho do runtime na VPS. Em qualquer outra
#    máquina eles nem carregavam, então "a suíte está verde" era uma afirmação
#    que ninguém conseguia conferir. Na primeira execução honesta: 2 verdes.
#
# ⚠️ As três variáveis do ledger NÃO são decoração. Sem `FAKE=1` a suíte grava
#    previews V3 em PRODUÇÃO — em 24-31/08, 62% dos previews do ledger (499 de
#    807) eram artefato de teste.
#
# Saída: VERDE / PULADO (falta credencial, roda na la-hq) / VERMELHO.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

export SOL_CAIXA_V3_LEDGER_MODE=production
export SOL_CAIXA_V3_LEDGER_STRICT=0
export SOL_CAIXA_V3_LEDGER_FAKE=1
export SOL_CAIXA_V4_SHADOW=0

verdes=0; pulados=0; vermelhos=()
for t in *e2e.cjs *.test.cjs; do
  saida="$(node "$t" 2>&1)"; rc=$?
  if grep -q 'PULADO' <<<"$saida"; then
    pulados=$((pulados + 1)); printf '  ⏭  %s\n' "$t"
  elif [[ $rc -eq 0 ]]; then
    verdes=$((verdes + 1))
  else
    vermelhos+=("$t")
    printf '  ✗  %s\n' "$t"
    grep -E '✗|Error:' <<<"$saida" | head -3 | sed 's/^/       /'
  fi
done

echo
echo "verdes: $verdes · pulados: $pulados · vermelhos: ${#vermelhos[@]}"
[[ ${#vermelhos[@]} -eq 0 ]] || exit 1
