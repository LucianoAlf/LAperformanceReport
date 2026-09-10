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
  # 🔴 O `tr -d` E O QUE FAZ CI E la-hq DAREM O MESMO RESULTADO. Medido sem
  #    filtro (`git cat-file`, que nao aplica autocrlf): os blobs das migrations
  #    carregam 4.673 bytes CR, concentrados em CINCO migrations de agosto/2026
  #    (1772+1246+830+716+108) mais um byte solto na 20260909210000. Em Linux
  #    isso sai do checkout como esta e chega ao psql.
  # ⚠️ PROVA, nao suposicao: mesmo arquivo, mesma imagem postgres:17, unica
  #    variavel trocada — replay SEM `tr` da 2.553 erros, COM `tr` da 2.544.
  #    Sao exatamente os dois numeros que o Actions e a la-hq vinham dando, e a
  #    diferenca de 9 e o `syntax error` mais as oito consequencias dele: 13 das
  #    16 funcoes da cadeia ficavam fora do banco, com o CI vermelho e a la-hq
  #    verde lendo o MESMO conteudo.
  # ⚠️ Migration que patcha funcao com `pg_get_functiondef` + `replace` compara
  #    ancora MULTILINHA: um CR no meio faz a ancora nao casar e a guarda
  #    abortar. Por isso a normalizacao mora aqui, no unico lugar por onde os
  #    dois chamadores passam.
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
