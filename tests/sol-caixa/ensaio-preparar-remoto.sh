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
# ⚠️ Migrations NAO entram aqui: quem as normaliza e `ensaio-montar-todas.sh`,
#    o mesmo script que o CI usa. Um dono por coisa.
for f in ensaio-*.sql; do
  tr -d '\015' < "$f" > "$f.tmp" && mv "$f.tmp" "$f"
done

# Um arquivo só, em ordem determinística. A concatenação e a conferência dos
# marcadores vivem em `ensaio-montar-todas.sh`, compartilhado com o CI: era
# lógica duplicada, e a cópia do YAML tinha um `\e` que virava ESCAPE.
bash ./ensaio-montar-todas.sh migrations todas.sql

for f in ensaio-*.sql todas.sql; do
  docker cp "$f" "$NOME:/tmp/" >/dev/null
done
echo "   arquivos preparados: $(ls migrations/*.sql | wc -l) migrations, CRLF removido"
