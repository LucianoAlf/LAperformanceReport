#!/usr/bin/env bash
# Concatena as migrations em UM arquivo, em ordem, com marcador por migration.
#
#   ensaio-montar-todas.sh <dir-migrations> <arquivo-saida>
#
# 🔴 POR QUE ISTO E UM SCRIPT COMPARTILHADO. Esta mesma lógica existia duplicada
#    no preparador remoto e no YAML do CI. No YAML eu escrevi
#    `printf '\echo === %s\n'` com UMA barra — e o `printf` do bash interpreta
#    `\e` como ESCAPE. Os marcadores viraram ESC+"cho", o replay quebrou em massa
#    e, pior, a TRAVA FICOU CEGA: sem marcador `=== arquivo`, o awk não atribui
#    erro nenhum a arquivo nenhum e responde "nenhuma migration falhou".
#    Um falso-verde dentro da trava que existe para matar falso-verde.
#
# ⚠️ `printf '%s\n' "\echo ..."` em vez de `printf '\echo ...'`: com o texto no
#    ARGUMENTO, printf não interpreta escape nenhum. Não há barra para contar.
set -euo pipefail

DIR="${1:?diretorio das migrations}"
SAIDA="${2:?arquivo de saida}"

: > "$SAIDA"
for f in $(ls "$DIR"/*.sql | sort); do
  printf '%s\n' "\echo === $(basename "$f")" >> "$SAIDA"
  # 🔴 `tr -d` NAO E PARANOIA DE WINDOWS. 2.132 migrations estao no repositorio
  #    com CRLF DENTRO DO BLOB — commitadas assim antes de existir regra de
  #    normalizacao, entao em Linux elas saem do checkout COM CR. E migration que
  #    patcha funcao com `pg_get_functiondef` + `replace` compara ancora
  #    MULTILINHA: com CR no meio a ancora nao casa, a guarda aborta e a regra
  #    financeira fica FORA do banco. Foi isto, exatamente: la-hq 16/16 porque
  #    removia o CR, CI 3/16 porque nao removia.
  # ⚠️ Renormalizar as 2.132 no git seria um diff sobre a historia inteira do
  #    repositorio; remover na leitura resolve para os dois chamadores de uma vez.
  tr -d '' < "$f" >> "$SAIDA"
  echo >> "$SAIDA"
done

# O marcador tem de existir uma vez por migration, senao a trava do replay fica
# cega. Conferir aqui e barato; descobrir depois custou um CI vermelho.
esperado=$(ls "$DIR"/*.sql | wc -l)
# ⚠️ `[\]` em vez de `\`: dependendo do grep, `\` nao vira barra literal — a
#    conferencia dava ZERO com o arquivo correto. Classe de caractere nao tem
#    escape para interpretar.
obtido=$(grep -c '^[\]echo === ' "$SAIDA" || true)
if [ "$esperado" -ne "$obtido" ]; then
  echo "🔴 marcadores: esperava $esperado, gerou $obtido — a trava do replay ficaria cega" >&2
  exit 1
fi
echo "   $obtido migrations concatenadas, marcadores conferidos"
