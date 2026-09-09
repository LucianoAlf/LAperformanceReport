#!/usr/bin/env bash
# Compara, por hash, o artefato do Git com o que está RODANDO na la-hq.
#
# 🔴 POR QUE EXISTE. Em 09/09/2026 a auditoria cruzada com o Alfredo achou o
#    mesmo buraco por dois caminhos: o `caixa-financeiro.cjs` que decide dinheiro
#    nos três grupos financeiros — 5.379 linhas — **não existia em Git**. O repo
#    guardava 29 scripts de patch (o delta) e nunca o artefato. Busca por nome e
#    busca por conteúdo (`preview_competencia_corrigida`) deram zero.
#
#    O versionamento de fato eram 174 arquivos `.bak-*` no diretório da VPS,
#    nomeados à mão. Funcionou — usei-os para bisseccionar uma regressão neste
#    mesmo dia — mas um `rm *.bak-*` apagaria a única história existente.
#
# ⚠️ Este script NÃO promove e NÃO escreve nada. Ele responde uma pergunta:
#    "o que está rodando é o que está versionado?". Promoção é ato humano, com
#    o gate do Alf.
#
# Uso:
#   ./paridade.sh            # confere e sai 0 (igual) ou 1 (divergiu)
#   ./paridade.sh --baixar   # traz o vivo para o repo (NÃO commita)
set -euo pipefail

REMOTO_HOST="${SOL_HOST:-lahq}"
REMOTO_ARQ="/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs"
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/caixa-financeiro.cjs"

hash_remoto() { ssh "$REMOTO_HOST" "sha256sum $REMOTO_ARQ" | awk '{print $1}'; }
hash_local()  { sha256sum "$AQUI" | awk '{print $1}'; }

if [[ "${1:-}" == "--baixar" ]]; then
  # ⚠️ trazer o vivo para o repo é o caminho CERTO hoje: a fonte de verdade
  #    ainda é o runtime. Quando a promoção Git -> runtime existir, este flag
  #    vira o caminho errado e deve ser removido.
  scp -q "$REMOTO_HOST:$REMOTO_ARQ" "$AQUI"
  echo "baixado do runtime · $(hash_local)"
  echo "⚠️ o repo agora reflete o RUNTIME. Commite dizendo de onde veio."
  exit 0
fi

R="$(hash_remoto)"
L="$(hash_local)"

echo "runtime (la-hq) : $R"
echo "git    (repo)   : $L"

if [[ "$R" == "$L" ]]; then
  echo "✅ paridade — o que roda é o que está versionado"
  exit 0
fi

cat <<'AVISO'
🔴 DIVERGIU — o runtime NÃO é o que está no Git.

Isto significa que alguém aplicou patch direto na VPS sem versionar, ou que o
repo avançou sem promover. Nos dois casos, a história do caixa está incompleta.

O que fazer, na ordem:
  1. NÃO apague nenhum .bak-* — eles são a única história que existe;
  2. `./paridade.sh --baixar` e leia o diff antes de commitar;
  3. se o diff for de alguém, pergunte antes de sobrescrever.
AVISO
exit 1
