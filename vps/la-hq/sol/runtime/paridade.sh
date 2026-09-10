#!/usr/bin/env bash
# Estado da promoção Git ↔ runtime da Sol. Três estados, não dois.
#
# 🔴 POR QUE TRÊS. A primeira versão comparava só "igual/diferente" e criou um
#    paradoxo que o Alfredo pegou em 09/09/2026: o canônico espelhava o runtime,
#    a guarda financeira ainda não estava no runtime, logo não estava no
#    canônico — e o teste dela falhava em checkout limpo.
#
#    A confusão era de papel. O canônico não é uma FOTO do runtime: é o estado
#    DESEJADO, testado, que ainda vai ser promovido. Git à frente é o normal de
#    quem trabalha; o que é anomalia é o runtime à frente.
#
#      IGUAL          → nada pendente
#      GIT À FRENTE   → há promoção a fazer (esperado durante o trabalho)
#      🔴 RUNTIME FORA DO GIT → alguém aplicou patch sem versionar
#
#    O terceiro é o perigoso, e o `RUNTIME_BASELINE.sha256` é o que permite
#    distingui-lo: ele guarda o hash do que estava rodando quando o canônico foi
#    escrito. Sem esse terceiro ponto de comparação, "diferente" é ambíguo.
#
# 🔴 SÃO TRÊS ARTEFATOS, NÃO UM (09/09/2026). Ao fazer a suíte rodar em checkout
#    limpo apareceram mais dois arquivos do runtime que nenhum lugar versionava
#    — `caixa-abertura-fechamento.cjs` e `group-engagement.cjs` —, e três testes
#    só carregavam na VPS por causa deles. Artefato fora do Git é código que
#    decide dinheiro sem revisão; o manifesto agora cobre os três.
#
# ⚠️ Não promove e não escreve nada em produção. Promoção é ato humano com gate.
set -euo pipefail

HOST="${SOL_HOST:-lahq}"
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFESTO="$AQUI/RUNTIME_BASELINE.sha256"

fora_do_git=0
pendentes=0

printf '%-30s %-10s %s\n' ARTEFATO ESTADO DETALHE
printf '%s\n' '---------------------------------------------------------------'

while read -r h_baseline arquivo remoto; do
  [[ -z "${h_baseline:-}" || "$h_baseline" == \#* ]] && continue
  # ⚠️ `ssh -n` e obrigatorio: sem ele o ssh consome o stdin do `while read` e
  #    o laco morre depois do primeiro artefato — as outras linhas somem em
  #    silencio, que e a pior forma de um verificador falhar.
  h_runtime="$(ssh -n "$HOST" "sha256sum $remoto" | awk '{print $1}')"
  h_canonico="$(sha256sum "$AQUI/$arquivo" | awk '{print $1}')"

  if [[ "$h_runtime" != "$h_baseline" ]]; then
    printf '%-30s %-10s %s\n' "$arquivo" '🔴 FORA' "runtime ${h_runtime:0:12} ≠ baseline ${h_baseline:0:12}"
    fora_do_git=1
  elif [[ "$h_canonico" == "$h_runtime" ]]; then
    printf '%-30s %-10s %s\n' "$arquivo" '✅ igual' "${h_canonico:0:12}"
  else
    printf '%-30s %-10s %s\n' "$arquivo" '🟡 git+' "canônico ${h_canonico:0:12} a promover"
    pendentes=$((pendentes + 1))
  fi
done < "$MANIFESTO"

echo

if [[ "$fora_do_git" -eq 1 ]]; then
  cat <<'AVISO'
🔴 RUNTIME FORA DO GIT — alguém aplicou patch na VPS sem versionar.

Este é o estado que não pode existir: há código decidindo dinheiro que nunca
passou por revisão nem teste. NÃO promova por cima — o diff pode ser de outra
pessoa.

  1. NÃO apague nenhum .bak-* (é a única história que existe);
  2. traga o vivo para um arquivo à parte e leia o diff;
  3. descubra quem aplicou antes de decidir o que fica.
AVISO
  exit 2
fi

if [[ "$pendentes" -eq 0 ]]; then
  echo "✅ IGUAL — nada pendente de promoção"
  exit 0
fi

cat <<PENDENTE
🟡 GIT À FRENTE — $pendentes artefato(s) pendente(s) (estado normal de trabalho)

O canônico foi testado e ainda não subiu. Promover é ato humano com gate, e a
ordem importa — o baseline por último, senão a próxima execução acusa "runtime
fora do Git":

  scp <canônico> $HOST:<remoto>
  ssh $HOST 'systemctl --user restart hermes-gateway-sol.service'
  ssh $HOST 'sha256sum <remoto>'      # atualizar a linha no manifesto
  ./paridade.sh                        # deve voltar IGUAL, e aí commitar
PENDENTE
exit 1
