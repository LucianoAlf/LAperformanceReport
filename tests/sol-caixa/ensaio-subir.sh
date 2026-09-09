#!/usr/bin/env bash
# Sobe o banco isolado do ensaio do zero, em ordem determinística.
#
# 🔴 UM CONTAINER NOVO TEM DE CHEGAR SOZINHO A 14/14 HASHES IGUAIS À PRODUÇÃO.
#    Se não chegar, o ensaio não vale — foi a dívida real que esta frente
#    descobriu, e o motivo pelo qual eu quase concluí (errado) que faltavam
#    migrations no repositório.
#
# ⚠️ O REPLAY NÃO É IDEMPOTENTE e por isso roda UMA VEZ SÓ. A migration
#    `20260817193125` renomeia a implementação grande e cria o wrapper fino;
#    numa segunda passada ela falha com "function already exists" e o nome
#    canônico fica com a implementação ANTIGA, sem o enriquecimento de tipo.
#    Nunca "rode de novo para consertar" — descarte e suba limpo.
#
#   tests/sol-caixa/ensaio-subir.sh          # sobe do zero e verifica
set -euo pipefail

HOST="${SOL_HOST:-lahq}"
NOME="${ENSAIO_CONTAINER:-sol-ensaio}"
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$AQUI/../.." && pwd)"
REMOTO=/tmp/sol-ensaio

echo "== 1/6 container novo (o antigo é DESCARTADO, nunca remendado)"
ssh -n "$HOST" "docker rm -f $NOME >/dev/null 2>&1 || true
  docker run -d --name $NOME -e POSTGRES_PASSWORD=ensaio -e POSTGRES_DB=ensaio \
    -p 127.0.0.1:55432:5432 --memory=2g --cpus=2 postgres:17 >/dev/null
  mkdir -p $REMOTO"
until ssh -n "$HOST" "docker exec $NOME pg_isready -U postgres" >/dev/null 2>&1; do sleep 2; done

echo "== 2/6 arquivos do ensaio + migrations"
tar czf /tmp/ensaio-migs.tgz -C "$RAIZ/supabase" migrations
scp -q /tmp/ensaio-migs.tgz "$AQUI"/ensaio-*.sql "$HOST:$REMOTO/"
# ⚠️ `sed` do CRLF: os arquivos vêm de Windows e o \r entra no corpo das funções.
#    Não muda semântica, mas faz TODO hash divergir — foi o que me fez achar que
#    14 funções estavam diferentes quando 8 eram idênticas.
ssh -n "$HOST" "cd $REMOTO && sed -i 's/\r\$//' ensaio-*.sql
  rm -rf migrations && tar xzf ensaio-migs.tgz
  for f in \$(ls migrations/*.sql | sort); do
    echo \"\\echo === \$(basename \$f)\"; cat \"\$f\"; echo
  done > todas.sql
  for f in ensaio-*.sql todas.sql; do docker cp \$f $NOME:/tmp/ >/dev/null; done"

echo "== 3/6 papéis, extensões e stubs"
ssh -n "$HOST" "docker exec $NOME psql -U postgres -d ensaio -q -f /tmp/ensaio-bootstrap.sql 2>&1 | grep -iE '^psql.*error' | head -3 || true"

echo "== 4/6 schema base ANTES das migrations (senão elas falham em cascata)"
ssh -n "$HOST" "docker exec $NOME psql -U postgres -d ensaio -q -v ON_ERROR_STOP=1 -f /tmp/ensaio-schema-base.sql 2>&1 | grep -iE '^psql.*error' | head -3 || true"

echo "== 5/6 replay ÚNICO das migrations (erros tolerados, passe único)"
ssh -n "$HOST" "docker exec $NOME bash -c 'psql -U postgres -d ensaio -f /tmp/todas.sql > /tmp/replay.log 2>&1; true'
  docker exec $NOME bash -c 'grep -c \": ERROR:\" /tmp/replay.log || true'" | tail -1 | sed 's/^/   erros no replay: /'

echo "== 6/6 seed sintético"
ssh -n "$HOST" "docker exec $NOME psql -U postgres -d ensaio -q -v ON_ERROR_STOP=1 -f /tmp/ensaio-seed.sql 2>&1 | grep -E 'NOTICE:  seed|ERROR' | head -3"

echo
echo "== verificação da cadeia (14/14 ou falha)"
ssh -n "$HOST" "docker exec $NOME psql -U postgres -d ensaio -v ON_ERROR_STOP=1 -f /tmp/ensaio-verificar-cadeia.sql 2>&1 | tail -20"
