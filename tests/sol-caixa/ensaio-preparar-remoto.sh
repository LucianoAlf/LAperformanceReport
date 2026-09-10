#!/usr/bin/env bash
# Roda NA la-hq: prepara os arquivos e joga tudo para dentro do container.
#
# 🔴 POR QUE ISTO É UM ARQUIVO SEPARADO. Antes estava embutido numa string de
#    `ssh "..."` no orquestrador, com bash local → ssh → docker exec → sed. Nesse
#    caminho o padrão `\r` do CRLF virou um CR LITERAL dentro do script, e o
#    `sed` passou a morrer com "unterminated `s' command" — em silêncio, porque
#    o passo seguinte continuava. Resultado: as migrations seguiram com CRLF, as
#    âncoras multilinha não casaram e a regra financeira ficou fora do banco.
#
#    Três níveis de escaping é lugar de errar. Script próprio não tem nível
#    nenhum.
set -euo pipefail

NOME="${1:?nome do container}"
cd "$(dirname "$0")"

rm -rf migrations && tar xzf ensaio-migs.tgz

# ⚠️ `tr -d` em vez de `sed`: sem padrão para escapar, não há como errar.
#    O CRLF precisa sair porque migration que patcha função com
#    `pg_get_functiondef` + `replace` compara âncoras MULTILINHA.
for f in ensaio-*.sql migrations/*.sql; do
  tr -d '\015' < "$f" > "$f.tmp" && mv "$f.tmp" "$f"
done

# Um arquivo só, em ordem determinística, com marcador por migration para o
# log dizer QUAL falhou.
: > todas.sql
for f in $(ls migrations/*.sql | sort); do
  printf '\\echo === %s\n' "$(basename "$f")" >> todas.sql
  cat "$f" >> todas.sql
  echo >> todas.sql
done

for f in ensaio-*.sql todas.sql; do
  docker cp "$f" "$NOME:/tmp/" >/dev/null
done
echo "   arquivos preparados: $(ls migrations/*.sql | wc -l) migrations, CRLF removido"
