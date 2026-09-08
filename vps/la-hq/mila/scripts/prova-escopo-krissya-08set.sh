#!/usr/bin/env bash
# PROVA DE PONTA A PONTA DO ESCOPO (08/09/2026).
#
# Reproduz o CAMINHO REAL do bridge — mesmo binário, mesmo perfil, mesmo bloco de
# env — e faz as duas perguntas do caso: a que a Anne Krissya fez às 15:10 e a
# insistência das 15:11 que produziu *"das outras unidades eu não consigo abrir
# daqui"*.
#
# Uso:
#   prova-escopo-krissya-08set.sh                      # Krissya, escopo de REDE
#   MODO=unidade prova-escopo-krissya-08set.sh 5521984690143 "Kailane" Barra
#                                                      # CONTROLE: consultora
#
# ⚠️ Sessão NOVA e descartável a cada execução: sessão reaproveitada carregaria a
#    resposta velha e provaria o passado.
#
# ⚠️ `--create-if-missing` já no PRIMEIRO turno. Sem ele a sessão nasce com id
#    automático e o `--continue <nome>` do 2º turno não acha nada — foi o que
#    deixou a pergunta 2 sair vazia na primeira execução desta prova.
#
# ⚠️ Só PERGUNTA. Nenhuma das frases aciona tool de escrita, e nada vai para
#    conversa nenhuma — a resposta sai no terminal.
set -uo pipefail

TEL="${1:-5521966875271}"          # padrão: Krissya (líder comercial, rede)
NOME="${2:-Anne Krissya}"
INBOX_UNIDADE="${3:-Barra}"        # a porta por onde a pessoa escreveu
MODO="${MODO:-rede}"

BIN=/home/mila/.hermes/hermes-agent/venv/bin/python
PERFIL=/home/mila/.hermes/profiles/mila-consultor-readonly
SESSAO="prova-escopo-$(date +%Y%m%d%H%M%S)-$$"

# As duas formas que o bridge monta hoje (chatwoot-mila-bridge.js, `escopoLinhas`).
if [[ "$MODO" == "unidade" ]]; then
  ESCOPO_LINHAS="Unidade: ${INBOX_UNIDADE}"
  UNIDADE_ENV="$INBOX_UNIDADE"
else
  ESCOPO_LINHAS="Escopo: REDE — as 3 unidades (Barra, Campo Grande, Recreio). Quem fala aqui lidera a rede: o que as ferramentas devolverem das três é dela por direito, e esconder qualquer parte disso é mentir.
Caixa de entrada: ${INBOX_UNIDADE} (é apenas a porta por onde ela escreveu, NÃO o limite do que ela enxerga)"
  UNIDADE_ENV="todas as unidades"
fi

perguntar() {
  local texto="$1"
  local prompt="[MODO CONSULTOR]
Consultor: ${NOME}
Telefone: ${TEL}
${ESCOPO_LINHAS}
Mensagem: ${texto}"
  HOME=/home/mila HERMES_HOME="$PERFIL" \
  MILA_UNIDADE="$INBOX_UNIDADE" \
  MILA_CONSULTOR_NOME="$NOME" \
  MILA_CONSULTOR_TELEFONE="$TEL" \
  MILA_CONSULTOR_UNIDADE="$UNIDADE_ENV" \
    "$BIN" -m hermes_cli.main chat -Q -q "$prompt" --source tool \
      --continue "$SESSAO" --create-if-missing 2>>/tmp/prova-escopo.err
}

cd /home/mila || exit 1
: >/tmp/prova-escopo.err

echo "### quem: ${NOME} (${TEL}) · modo=${MODO} · caixa=${INBOX_UNIDADE}"
echo
echo "########## pergunta 1 (a das 15:10) ##########"
perguntar "${PERGUNTA1:-Mila, os leads estão muito tempo sem atendimento?}"
echo
echo "########## pergunta 2 (a que quebrou: 'E nas outras unidades?') ##########"
perguntar "${PERGUNTA2:-E nas outras unidades?}"
echo
echo "### stderr (se houver):"
tail -5 /tmp/prova-escopo.err
