#!/usr/bin/env bash
# Prova da migration 20261006213000 (cheque pré-datado para o vencimento vale com
# desconto) num Postgres DESCARTÁVEL. Nunca toca produção. Sem docker: PULADO.
#   • item SEM cheque_data_ref: resposta idêntica à 20261006200000;
#   • cheque R$ 387 com data até o vencimento, parcela vencida (hoje R$ 447): ok;
#   • mesma coisa com data DEPOIS do vencimento: recusa (valor mudou);
#   • irmãos (fatura_ids) com desconto pela data do cheque: ok.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../../.."
command -v docker >/dev/null || { echo "PULADO (sem docker)"; exit 0; }
N=solchq-pg2-$$
docker run -d --name "$N" -e POSTGRES_PASSWORD=x postgres:17 >/dev/null || { echo "PULADO (sem imagem postgres:17)"; exit 0; }
trap 'docker rm -f "$N" >/dev/null 2>&1' EXIT
for i in $(seq 1 30); do docker exec "$N" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
p() { docker exec -i "$N" psql -q -v ON_ERROR_STOP=1 -U postgres; }
q() { docker exec "$N" psql -At -U postgres -c "$1"; }
p < tests/sol-runtime/sql/lote-cheque-varias-faturas-stubs.sql
q "update public._env set j = '{\"status\":\"ok\",\"items\":[
 {\"canonical_fatura_id\":\"f1\",\"emusys_student_id\":\"101\",\"status\":\"aberta\",\"tipo_fatura\":\"parcela\",\"competencia\":\"2026-10-01\",\"data_vencimento\":\"2026-10-05\",\"descricao\":\"Parcela 10/2026\",\"valores\":{\"valor_hoje\":\"447\",\"valor_com_desconto\":\"387\"}},
 {\"canonical_fatura_id\":\"f2\",\"emusys_student_id\":\"102\",\"status\":\"aberta\",\"tipo_fatura\":\"parcela\",\"competencia\":\"2026-10-01\",\"data_vencimento\":\"2026-10-05\",\"descricao\":\"Parcela 10/2026\",\"valores\":{\"valor_hoje\":\"447\",\"valor_com_desconto\":\"387\"}},
 {\"canonical_fatura_id\":\"f3\",\"emusys_student_id\":\"103\",\"status\":\"aberta\",\"tipo_fatura\":\"parcela\",\"competencia\":\"2026-10-01\",\"data_vencimento\":\"2026-10-10\",\"descricao\":\"Parcela 10/2026\",\"valores\":{\"valor_hoje\":\"390\",\"valor_com_desconto\":\"390\"}}]}'::jsonb" >/dev/null
p < supabase/migrations/20261006200000_sol_lote_cheque_varias_faturas.sql
V="public.sol_caixa_validar_multi_aluno_snapshot_v1"; U="'00000000-0000-0000-0000-000000000001'::uuid"
SEM="select $V($U, '[{\"aluno_nome\":\"Rafael Moura Braga\",\"valor\":387,\"categoria\":\"parcela\",\"canonical_fatura_id\":\"f1\"},{\"aluno_nome\":\"Otavio Reis\",\"valor\":390,\"categoria\":\"parcela\",\"canonical_fatura_id\":\"f3\"}]'::jsonb, 777, '2026-10-06')"
ANTES=$(q "$SEM")
p < supabase/migrations/20261006213000_sol_cheque_valor_na_data_do_cheque.sql
COM="select $V($U, '[{\"aluno_nome\":\"Rafael Moura Braga\",\"valor\":387,\"categoria\":\"parcela\",\"canonical_fatura_id\":\"f1\",\"cheque_data_ref\":\"2026-10-05\"},{\"aluno_nome\":\"Otavio Reis\",\"valor\":390,\"categoria\":\"parcela\",\"canonical_fatura_id\":\"f3\",\"cheque_data_ref\":\"2026-10-05\"}]'::jsonb, 777, '2026-10-06')"
TARDE="select $V($U, '[{\"aluno_nome\":\"Rafael Moura Braga\",\"valor\":387,\"categoria\":\"parcela\",\"canonical_fatura_id\":\"f1\",\"cheque_data_ref\":\"2026-10-06\"},{\"aluno_nome\":\"Otavio Reis\",\"valor\":390,\"categoria\":\"parcela\",\"canonical_fatura_id\":\"f3\"}]'::jsonb, 777, '2026-10-06')"
IRM="select $V($U, '[{\"aluno_nome\":\"Rafael Moura Braga\",\"valor\":774,\"categoria\":\"parcela\",\"fatura_ids\":[\"f1\",\"f2\"],\"cheque_data_ref\":\"2026-10-05\"},{\"aluno_nome\":\"Otavio Reis\",\"valor\":390,\"categoria\":\"parcela\",\"canonical_fatura_id\":\"f3\"}]'::jsonb, 1164, '2026-10-06')"
falhas=0
ok() { if eval "$2"; then echo "  ✓ $1"; else echo "  ✗ $1"; falhas=$((falhas+1)); fi; }
ok "sem cheque_data_ref: idêntico à 20261006200000" '[ "$ANTES" = "$(q "$SEM")" ] && echo "$ANTES" | grep -q snapshot_valor_fatura_mudou'
ok "cheque até o vencimento vale com desconto" 'q "$COM" | grep -q "\"ok\": true"'
ok "cheque depois do vencimento recusa" 'q "$TARDE" | grep -q snapshot_valor_fatura_mudou'
ok "irmãos com desconto pela data do cheque" 'q "$IRM" | grep -q "\"ok\": true"'
[ $falhas -eq 0 ] && echo "verde" || { echo "VERMELHO ($falhas)"; exit 1; }
