#!/usr/bin/env bash
# Prova da migration 20261006200000 (1 cheque → N faturas no validador do lote) num
# Postgres DESCARTÁVEL (docker postgres:17), com stubs mínimos. Nunca toca produção.
# Compara a definição viva (o ROLLBACK, verbatim) com a nova:
#   • item comum: resposta IDÊNTICA antes/depois;
#   • item sem fatura e sem `fatura_ids`: continua `snapshot_item_incompleto`;
#   • irmãos (fatura_ids f1+f2, R$ 800): ok, UMA linha com `fatura_ids`;
#   • soma que não fecha / status mudou / fatura inexistente: recusa com motivo.
# Sem docker: PULADO.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../../.."
command -v docker >/dev/null || { echo "PULADO (sem docker)"; exit 0; }
N=solchq-pg-$$
docker run -d --name "$N" -e POSTGRES_PASSWORD=x postgres:17 >/dev/null || { echo "PULADO (sem imagem postgres:17)"; exit 0; }
trap 'docker rm -f "$N" >/dev/null 2>&1' EXIT
for i in $(seq 1 30); do docker exec "$N" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
p() { docker exec -i "$N" psql -q -v ON_ERROR_STOP=1 -U postgres; }
q() { docker exec "$N" psql -At -U postgres -c "$1"; }
p < tests/sol-runtime/sql/lote-cheque-varias-faturas-stubs.sql
p < supabase/rollbacks/20261006200000_sol_lote_cheque_varias_faturas_ROLLBACK.sql
U="'00000000-0000-0000-0000-000000000001'::uuid"
V="public.sol_caixa_validar_multi_aluno_snapshot_v1"
COM="select $V($U, '[{\"aluno_nome\":\"Rafael Moura Braga\",\"valor\":400,\"categoria\":\"parcela\",\"canonical_fatura_id\":\"f1\"},{\"aluno_nome\":\"Otavio Reis\",\"valor\":390,\"categoria\":\"parcela\",\"canonical_fatura_id\":\"f3\"}]'::jsonb, 790, '2026-10-06')"
INC="select $V($U, '[{\"aluno_nome\":\"Rafael Moura Braga\",\"valor\":800,\"categoria\":\"parcela\"},{\"aluno_nome\":\"Otavio Reis\",\"valor\":390,\"categoria\":\"parcela\",\"canonical_fatura_id\":\"f3\"}]'::jsonb, 1190, '2026-10-06')"
IRM="select $V($U, '[{\"aluno_nome\":\"Rafael Moura Braga\",\"valor\":800,\"categoria\":\"parcela\",\"fatura_ids\":[\"f1\",\"f2\"],\"faturas\":[{\"canonical_fatura_id\":\"f1\",\"status\":\"aberta\"}]},{\"aluno_nome\":\"Otavio Reis\",\"valor\":390,\"categoria\":\"parcela\",\"canonical_fatura_id\":\"f3\"}]'::jsonb, 1190, '2026-10-06')"
SOMA="select $V($U, '[{\"aluno_nome\":\"Rafael Moura Braga\",\"valor\":700,\"categoria\":\"parcela\",\"fatura_ids\":[\"f1\",\"f2\"]},{\"aluno_nome\":\"Otavio Reis\",\"valor\":390,\"categoria\":\"parcela\",\"canonical_fatura_id\":\"f3\"}]'::jsonb, 1090, '2026-10-06')"
STAT="select $V($U, '[{\"aluno_nome\":\"Rafael Moura Braga\",\"valor\":800,\"categoria\":\"parcela\",\"fatura_ids\":[\"f1\",\"f2\"],\"faturas\":[{\"canonical_fatura_id\":\"f1\",\"status\":\"paga\"}]},{\"aluno_nome\":\"Otavio Reis\",\"valor\":390,\"categoria\":\"parcela\",\"canonical_fatura_id\":\"f3\"}]'::jsonb, 1190, '2026-10-06')"
FALTA="select $V($U, '[{\"aluno_nome\":\"Rafael Moura Braga\",\"valor\":800,\"categoria\":\"parcela\",\"fatura_ids\":[\"f1\",\"f9\"]},{\"aluno_nome\":\"Otavio Reis\",\"valor\":390,\"categoria\":\"parcela\",\"canonical_fatura_id\":\"f3\"}]'::jsonb, 1190, '2026-10-06')"
A_COM=$(q "$COM")
p < supabase/migrations/20261006200000_sol_lote_cheque_varias_faturas.sql
falhas=0
ok() { if eval "$2"; then echo "  ✓ $1"; else echo "  ✗ $1"; falhas=$((falhas+1)); fi; }
ok "item comum idêntico antes/depois" '[ "$A_COM" = "$(q "$COM")" ]'
ok "sem fatura e sem fatura_ids continua incompleto" 'q "$INC" | grep -q snapshot_item_incompleto'
ok "irmãos: ok com fatura_ids" 'q "$IRM" | grep -q "\"ok\": true" && q "$IRM" | grep -q "\"fatura_ids\": \[\"f1\", \"f2\"\]"'
ok "soma que não fecha recusa" 'q "$SOMA" | grep -q snapshot_valor_fatura_mudou'
ok "status mudou recusa" 'q "$STAT" | grep -q snapshot_status_fatura_mudou'
ok "fatura inexistente recusa" 'q "$FALTA" | grep -q snapshot_fatura_nao_encontrada'
[ $falhas -eq 0 ] && echo "verde" || { echo "VERMELHO ($falhas)"; exit 1; }
