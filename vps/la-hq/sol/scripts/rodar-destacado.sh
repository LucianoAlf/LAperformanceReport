#!/bin/bash
# RODAR TRABALHO LONGO NA VPS SEM DEPENDER DA SESSÃO SSH (08/09/2026).
#
# 🔴 POR QUE ISTO EXISTE. Em 07/09 uma tarefa de fundo ("estudo da Mila SDR")
#    reportou **completed, exit 0** e não tinha feito nada. O conteúdo era:
#
#      ssh: connect to host 89.116.73.186 port 22: Connection timed out
#      sdr terminou
#      [exited with code 0]
#
#    Dois defeitos empilhados, e o segundo é o grave:
#
#    1. O SSH caiu. Isso é rede em trânsito e não tem conserto daqui —
#       investigado: fail2ban sem ban do meu IP (o único banido era um
#       13.222.227.107 da AWS), `auth.log` sem recusa, sshd no default,
#       ping 11 ms e 3/3 conexões OK depois. É intermitente, e vai repetir.
#
#    2. **O comando terminava com `; echo "terminou"`**, então o `echo`
#       bem-sucedido virou o status final e o exit 0 MENTIU. É a mesma
#       família de defeito que passei a sessão inteira caçando: sinal de
#       sucesso que engole a falha.
#
# 🔴 A CORREÇÃO DE RAIZ NÃO É "tentar SSH de novo" — é **não prender o
#    trabalho à sessão**. O comando roda destacado (`setsid`), escreve num
#    arquivo de resultado com o código de saída REAL, e quem chamou apenas
#    consulta o arquivo. Link caindo passa a custar zero: o trabalho continua
#    e a notícia fica guardada.
#
# USO
#   ./rodar-destacado.sh iniciar <nome> '<comando>'   → devolve o id
#   ./rodar-destacado.sh estado  <nome>               → rodando | ok | erro:N
#   ./rodar-destacado.sh saida   <nome>               → a saída completa
#
# ⚠️ Sempre com `set -o pipefail` do lado de dentro: sem ele, um pipe cujo
#    primeiro elemento falha devolve o status do ÚLTIMO, que é exatamente
#    como o `echo` mascarou tudo.
set -euo pipefail

BASE="${RODAR_DESTACADO_DIR:-$HOME/.rodar-destacado}"
mkdir -p "$BASE"

acao="${1:-}"; nome="${2:-}"
[ -n "$acao" ] && [ -n "$nome" ] || { echo "uso: $0 {iniciar|estado|saida} <nome> ['<comando>']" >&2; exit 2; }

out="$BASE/$nome.out"
cod="$BASE/$nome.code"
pid="$BASE/$nome.pid"

case "$acao" in
  iniciar)
    cmd="${3:-}"
    [ -n "$cmd" ] || { echo "falta o comando" >&2; exit 2; }
    # ⚠️ Limpa o resultado ANTES de começar: resto de execução anterior faria
    #    `estado` responder sobre a corrida errada — mentira silenciosa outra vez.
    rm -f "$out" "$cod" "$pid"
    # ⚠️ `setsid` desliga do terminal: derrubar o SSH manda SIGHUP para o grupo
    #    de processos, e sem isto o trabalho morre junto com a sessão.
    # 🔴 SUBSHELL (parênteses), nunca chaves. Chaves rodam no shell atual, então
    #    um "exit N" dentro do comando mata o bash -c INTEIRO e o código nunca
    #    chega a ser gravado — o estado vira morreu_sem_registrar e o erro real
    #    (7) se perde. Medido na 1a versão deste próprio script.
    #
    # ⚠️ E o comentário fica AQUI FORA, não dentro do bash -c: comentário dentro
    #    de string com aspas duplas ainda é lido pelo shell, e as crases dele
    #    viraram substituição de comando na 2a versão. Comentário não é inerte
    #    quando está dentro de aspas.
    setsid bash -c "
      set -o pipefail
      ( $cmd ) > '$out' 2>&1
      echo \$? > '$cod'
    " < /dev/null > /dev/null 2>&1 &
    echo $! > "$pid"
    echo "iniciado: $nome (pid $(cat "$pid"))"
    ;;

  estado)
    if [ -f "$cod" ]; then
      c=$(cat "$cod")
      # 🔴 O código REAL sai daqui, nunca do último comando do pipe.
      [ "$c" = "0" ] && echo "ok" || echo "erro:$c"
    elif [ -f "$pid" ] && kill -0 "$(cat "$pid")" 2>/dev/null; then
      echo "rodando"
    else
      # ⚠️ Sem código e sem processo = morreu sem registrar. Isto é um
      #    desfecho legítimo e precisa ter NOME — chamar de "ok" seria repetir
      #    o defeito que este script existe para matar.
      echo "morreu_sem_registrar"
    fi
    ;;

  saida)
    [ -f "$out" ] && cat "$out" || echo "(sem saída ainda)"
    ;;

  *) echo "ação desconhecida: $acao" >&2; exit 2 ;;
esac
