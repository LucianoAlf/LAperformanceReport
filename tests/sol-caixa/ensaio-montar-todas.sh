#!/usr/bin/env bash
# Concatena as migrations em UM arquivo, em ordem, com marcador por migration.
#
#   ensaio-montar-todas.sh <dir-migrations> <arquivo-saida>
#
# 🔴 POR QUE ISTO E UM SCRIPT COMPARTILHADO. Esta logica existia duplicada no
#    preparador remoto e no YAML do CI. No YAML eu escrevi
#    `printf '\echo === %s\n'` com UMA barra — e o `printf` do bash le `\e` como
#    ESCAPE. Cada marcador virou ESC+"cho", que grudou na PRIMEIRA instrucao da
#    migration seguinte e matou as duas; como quase toda migration abre com o
#    `create or replace function` que ela existe para entregar, 13 das 16
#    funcoes da cadeia ficaram fora do banco. E a trava do replay ficou CEGA
#    pelo mesmo motivo: sem marcador `=== arquivo`, o awk nao tem a que atribuir
#    erro nenhum e responde "nenhuma migration falhou".
#
# ⚠️ `printf '%s\n' "\echo ..."` em vez de `printf '\echo ...'`: com o texto no
#    ARGUMENTO, printf nao interpreta escape nenhum. Nao ha barra para contar.
set -euo pipefail

DIR="${1:?diretorio das migrations}"
SAIDA="${2:?arquivo de saida}"

: > "$SAIDA"
for f in $(ls "$DIR"/*.sql | sort); do
  printf '%s\n' "\echo === $(basename "$f")" >> "$SAIDA"
  # ⚠️ O tar sai de uma maquina Windows, e ancora multilinha nao casa com CR no
  #    meio: migration que patcha funcao com `pg_get_functiondef` + `replace`
  #    aborta pela propria guarda e a regra financeira fica FORA do banco.
  #    Vinha do preparador da la-hq; mora aqui para os dois herdarem igual.
  tr -d '\015' < "$f" >> "$SAIDA"
  echo >> "$SAIDA"
done

# O marcador tem de existir uma vez por migration, senao a trava do replay fica
# cega. Conferir aqui e barato; descobrir depois custou dois SHAs vermelhos.
# ⚠️ `[\]` em vez de `\`: conforme o grep, `\` nao vira barra literal — a
#    conferencia dava ZERO com o arquivo CERTO. Classe de caractere nao tem
#    escape para interpretar.
esperado=$(ls "$DIR"/*.sql | wc -l)
obtido=$(grep -c '^[\]echo === ' "$SAIDA" || true)
if [ "$esperado" -ne "$obtido" ]; then
  echo "🔴 marcadores: esperava $esperado, gerou $obtido — a trava do replay ficaria cega" >&2
  exit 1
fi
echo "   $obtido migrations concatenadas, marcadores conferidos"
