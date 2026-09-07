#!/usr/bin/env bash
# Prova VIVA da cerca da Fatia 0.1: conecta com o MESMO papel do MCP restrito e
# roda o que a Sol de fato usa, mais o que ela nao deve mais conseguir.
#
# ⚠️ Nunca imprime credencial — so o veredito de cada teste.
set -uo pipefail

SECRET_FILE="${1:-/home/sol/.openclaw/secrets/lareport-readonly.env}"
[[ -r "$SECRET_FILE" ]] || { echo "sem o arquivo de segredo: $SECRET_FILE"; exit 2; }
set -a; . "$SECRET_FILE"; set +a

U="${LA_REPORT_READONLY_POOLER_USER:-}"
P="${LA_REPORT_READONLY_PASSWORD:-}"
H="${LA_REPORT_READONLY_HOST:-}"
D="${LA_REPORT_READONLY_DB:-postgres}"
PORT="${LA_REPORT_READONLY_PORT:-6543}"
[[ -n "$U" && -n "$P" && -n "$H" ]] || { echo "faltou USER/PASS/HOST no env"; exit 2; }

run() { PGPASSWORD="$P" psql -qtAX -h "$H" -p "$PORT" -U "$U" -d "$D" -c "$1" 2>&1 | head -2; }

echo "=== DEVE FUNCIONAR (o que ela usa de verdade) ==="
printf "  quem_eh ................. "; run "select count(*) from governanca.quem_eh('5521999999999');"
printf "  grupos_detalhados ....... "; run "select count(*) from governanca.grupos_detalhados(null);"
# ⚠️ Sem subquery em `unidades`: a propria subquery le tabela crua e seria
# bloqueada pela cerca — o teste acusaria a cerca por um erro do teste. O uuid
# vai literal (Barra), e o que se prova e que a RPC SECURITY DEFINER atravessa.
printf "  caixa_resumo_do_dia ..... "; run "select left(public.sol_caixa_resumo_do_dia('95553e96-971b-4590-a6eb-0201d013c14d'::uuid, current_date)::text, 40);"
printf "  unidades (lookup) ....... "; run "select count(*) from public.unidades;"

echo
echo "=== NAO DEVE MAIS FUNCIONAR (tabela crua de producao) ==="
for T in alunos leads caixa_movimentacoes movimentacoes_admin emusys_faturas; do
  printf "  select em %-22s " "$T"
  R=$(run "select count(*) from public.$T;")
  case "$R" in
    *"permission denied"*) echo "BLOQUEADO ✅" ;;
    *[0-9]*)               echo "AINDA ABERTO 🔴 ($R)" ;;
    *)                     echo "? $R" ;;
  esac
done
