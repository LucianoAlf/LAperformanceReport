#!/usr/bin/env bash
# Sobe o banco isolado do ensaio do zero, em ordem determinística, e prova tudo.
#
# 🔴 UM CONTAINER NOVO TEM DE CHEGAR SOZINHO A 16/16 HASHES IGUAIS À PRODUÇÃO.
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
#   tests/sol-caixa/ensaio-subir.sh
set -euo pipefail

HOST="${SOL_HOST:-lahq}"
NOME="${ENSAIO_CONTAINER:-sol-ensaio}"
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$AQUI/../.." && pwd)"
REMOTO=/tmp/sol-ensaio

roda() { ssh -n "$HOST" "docker exec $NOME psql -U postgres -d ensaio $*"; }

echo "== 1/7 container novo (o antigo é DESCARTADO, nunca remendado)"
ssh -n "$HOST" "docker rm -f $NOME >/dev/null 2>&1 || true
  docker run -d --name $NOME -e POSTGRES_PASSWORD=ensaio -e POSTGRES_DB=ensaio \
    -p 127.0.0.1:55432:5432 --memory=2g --cpus=2 postgres:17 >/dev/null
  mkdir -p $REMOTO"
until ssh -n "$HOST" "docker exec $NOME pg_isready -U postgres" >/dev/null 2>&1; do sleep 2; done

echo "== 2/7 arquivos do ensaio + migrations"
tar czf /tmp/ensaio-migs.tgz -C "$RAIZ/supabase" migrations
scp -q /tmp/ensaio-migs.tgz "$AQUI"/ensaio-*.sql "$AQUI"/ensaio-preparar-remoto.sh "$AQUI"/ensaio-montar-todas.sh "$HOST:$REMOTO/"
ssh -n "$HOST" "bash $REMOTO/ensaio-preparar-remoto.sh $NOME"

echo "== 3/7 papéis, extensões e stubs"
roda -q -f /tmp/ensaio-bootstrap.sql 2>&1 | grep -iE '^psql.*error' | head -3 || true

echo "== 4/7 schema base ANTES das migrations (senão elas falham em cascata)"
roda -q -v ON_ERROR_STOP=1 -f /tmp/ensaio-schema-base.sql 2>&1 | grep -iE '^psql.*error' | head -3 || true

echo "== 5/7 replay ÚNICO das migrations (erros tolerados, passe único)"
ssh -n "$HOST" "docker exec $NOME bash -c 'psql -U postgres -d ensaio -f /tmp/todas.sql > /tmp/replay.log 2>&1; true'"
ssh -n "$HOST" "docker exec $NOME grep -c ': ERROR:' /tmp/replay.log" | sed 's/^/   erros no replay: /'

# 🔴 REPLAY QUE ENGOLE ERRO EM MIGRATION DESTA FRENTE É UM FALSO-VERDE. A
#    20260909193000 abortou pela própria guarda, o replay seguiu, e a regra
#    financeira ficou FORA do banco — a função passou a dizer `ok:true` com
#    R$ 777,77 de furo e nada acusou por dias.
# ⚠️ ESCOPO: as migrations do CAIXA de 09/09. Duas exclusões deliberadas:
#    · o histórico inteiro tem ~2.580 erros que são ruído do harness (`cron.job`
#      ausente, papel de outro agente, rename já aplicado), e o estado final
#      dele já é provado pelo manifesto 16/16 no passo seguinte;
#    · as migrations do RADAR/Mila do mesmo dia falham aqui porque este schema
#      base é o do caixa — `radar_sinais`, `vw_radar_sinal_vigencia_v1` e
#      companhia não existem, de propósito. Cobrar delas neste ensaio seria um
#      vermelho permanente e falso.
#    Alarme que ninguém consegue zerar vira ruído, e ruído ensina a ignorar o
#    canal — é literalmente o defeito que esta frente passou o dia consertando
#    na pauta da Mila.
echo "== 5b/7 nenhuma migration do caixa desta frente pode ter falhado"
ssh -n "$HOST" "docker exec $NOME cat /tmp/replay.log" > /tmp/replay-ensaio.log
awk '/^=== /{arq=$2; next}
     /: ERROR:/{
       if (arq ~ /^20260909/ && arq ~ /caixa|pagamento|reconciliacao|envelope|resolver_pagamento|lista_plana/)
         print "   " arq ": " $0
     }' \
  /tmp/replay-ensaio.log | sort -u > /tmp/criticas.txt || true
if [ -s /tmp/criticas.txt ]; then
  echo "🔴 migration desta frente falhou no replay:"; cat /tmp/criticas.txt; exit 1
fi
echo "   nenhuma"

echo "== 6/7 seed sintético"
roda -q -v ON_ERROR_STOP=1 -f /tmp/ensaio-seed.sql 2>&1 | grep -E 'NOTICE:  seed|ERROR' | head -3

echo
echo "== 7/7 provas"
echo "-- cadeia reproduz produção (16/16)"
roda -v ON_ERROR_STOP=1 -f /tmp/ensaio-verificar-cadeia.sql 2>&1 | grep -viE '^DO$' | tail -8
echo "-- pagamento inteiro (10/10, fail-stop)"
roda -v ON_ERROR_STOP=1 -f /tmp/ensaio-pagamento-inteiro.sql 2>&1 | grep -viE '^DO$|Timing' | tail -8
echo "-- orquestrador: envelope estruturado -> combinacao unica"
roda -v ON_ERROR_STOP=1 -f /tmp/ensaio-envelope-estruturado.sql 2>&1 | grep -viE '^DO$' | tail -4
echo "-- cadeia real, caminho feliz V3 e atomicidade"
roda -v ON_ERROR_STOP=1 -f /tmp/ensaio-cadeia-e-atomicidade.sql 2>&1 \
  | grep -viE '^BEGIN|^DO$|^ROLLBACK|^CREATE|^DROP|^INSERT|audit_log' | tail -8
