#!/usr/bin/env bash
# Prova da migration 20261007150000 (valor divergente no lote multi-aluno) num
# Postgres DESCARTÁVEL. Nunca toca produção. Sem docker: PULADO.
# Base = definições VIVAS (o rollback é exatamente elas); depois a migration.
#   resolver: divergência com fatura única volta casada (`valor_divergente`);
#             soma que não fecha, competência errada e aluno não encontrado recusam;
#             valores que batem seguem `ok:true` idêntico.
#   validador: aceita divergência com motivo; recusa sem motivo; soma não fecha
#              recusa; fatura de outro aluno / aluno inexistente recusam; fatura
#              que mudou de valor recusa; item sem divergência idêntico; ACL igual.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../../.."
command -v docker >/dev/null || { echo "PULADO (sem docker)"; exit 0; }
N=solmvd-pg-$$
docker run -d --name "$N" -e POSTGRES_PASSWORD=x postgres:17 >/dev/null || { echo "PULADO (sem imagem postgres:17)"; exit 0; }
trap 'docker rm -f "$N" >/dev/null 2>&1' EXIT
for i in $(seq 1 30); do docker exec "$N" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
sleep 1
p() { docker exec -i "$N" psql -q -v ON_ERROR_STOP=1 -U postgres; }
q() { docker exec "$N" psql -At -U postgres -c "$1"; }
p < tests/sol-runtime/sql/multi-valor-divergente-stubs.sql || { echo "VERMELHO (stubs)"; exit 1; }
# base viva (= rollback) + ACL viva
p < supabase/rollbacks/20261007150000_sol_multi_valor_divergente_ROLLBACK.sql || { echo "VERMELHO (base)"; exit 1; }
ACL="revoke all on function public.sol_caixa_resolver_pagamento_itens_v1(uuid,jsonb,numeric,date) from public;
grant execute on function public.sol_caixa_resolver_pagamento_itens_v1(uuid,jsonb,numeric,date) to service_role, sol_acesso_restrito;
revoke all on function public.sol_caixa_validar_multi_aluno_snapshot_v1(uuid,jsonb,numeric,date) from public;
grant execute on function public.sol_caixa_validar_multi_aluno_snapshot_v1(uuid,jsonb,numeric,date) to service_role, sol_acesso_restrito;"
echo "$ACL" | p
ACL_Q="select string_agg(proname||'='||coalesce(proacl::text,'null'), ' ' order by proname) from pg_proc where proname in ('sol_caixa_resolver_pagamento_itens_v1','sol_caixa_validar_multi_aluno_snapshot_v1')"
ACL_ANTES=$(q "$ACL_Q")

U="'00000000-0000-0000-0000-000000000001'::uuid"
F1=aaaaaaaa-0000-4000-8000-000000000001; F2=aaaaaaaa-0000-4000-8000-000000000002; F3=aaaaaaaa-0000-4000-8000-000000000003
fat() { echo "{\"canonical_fatura_id\":\"$1\",\"descricao\":\"Parcela 10/2026\",\"tipo_fatura\":\"parcela\",\"competencia\":\"2026-10-01\",\"status\":\"aberta\",\"data_vencimento\":\"2026-10-05\",\"vencida\":true,\"dias_atraso\":2,\"valor_da_parcela\":431.44,\"valor_sem_desconto_condicional\":479.84,\"valor_hoje\":489.92}"; }
# o que o resolver de pagamento inteiro devolve no caso real (fatura achada, valor não bate)
PAG_DIV="{\"ok\":false,\"alunos\":[
 {\"ordem\":1,\"ok\":false,\"motivo\":\"valor_declarado_nao_bate\",\"aluno_nome\":\"Lara Quintela Prado\",\"valor_declarado\":431.60,\"valor_encontrado\":489.92,\"faturas\":[$(fat $F1)]},
 {\"ordem\":2,\"ok\":false,\"motivo\":\"valor_declarado_nao_bate\",\"aluno_nome\":\"Caio Quintela Prado\",\"valor_declarado\":431.60,\"valor_encontrado\":489.92,\"faturas\":[$(fat $F2)]}]}"
PAG_NAOACHOU="{\"ok\":false,\"alunos\":[
 {\"ordem\":1,\"ok\":false,\"motivo\":\"valor_declarado_nao_bate\",\"aluno_nome\":\"Lara Quintela Prado\",\"valor_declarado\":431.60,\"valor_encontrado\":489.92,\"faturas\":[$(fat $F1)]},
 {\"ordem\":2,\"ok\":false,\"motivo\":\"aluno_nao_encontrado\",\"aluno_nome\":\"Fulano Inexistente\",\"valor_declarado\":431.60}]}"
PAG_OK="{\"ok\":true,\"alunos\":[
 {\"ordem\":1,\"ok\":true,\"aluno_nome\":\"Lara Quintela Prado\",\"valor\":489.92,\"faturas\":[$(fat $F1)]},
 {\"ordem\":2,\"ok\":true,\"aluno_nome\":\"Caio Quintela Prado\",\"valor\":489.92,\"faturas\":[$(fat $F2)]}]}"
setpag() { q "delete from public._pag; insert into public._pag values ('$1'::jsonb)" >/dev/null; }
R="public.sol_caixa_resolver_pagamento_itens_v1"
IT_OUT="'[{\"aluno_nome\":\"Lara\",\"valor\":431.60,\"categoria\":\"parcela\",\"competencia\":\"10/2026\"},{\"aluno_nome\":\"Caio\",\"valor\":431.60,\"categoria\":\"parcela\",\"competencia\":\"10/2026\"}]'::jsonb"
IT_SET="'[{\"aluno_nome\":\"Lara\",\"valor\":431.60,\"categoria\":\"parcela\",\"competencia\":\"09/2026\"},{\"aluno_nome\":\"Caio\",\"valor\":431.60,\"categoria\":\"parcela\",\"competencia\":\"09/2026\"}]'::jsonb"
IT_IGUAL="'[{\"aluno_nome\":\"Lara\",\"valor\":489.92,\"categoria\":\"parcela\"},{\"aluno_nome\":\"Caio\",\"valor\":489.92,\"categoria\":\"parcela\"}]'::jsonb"

setpag "$PAG_OK"; R_OK_ANTES=$(q "select $R($U, $IT_IGUAL, 979.84, '2026-10-01')")

V="public.sol_caixa_validar_multi_aluno_snapshot_v1"
it_div() { # aluno fatura valor valor_fatura aceita motivo
  echo "{\"aluno_nome\":\"$1\",\"valor\":$3,\"categoria\":\"parcela\",\"competencia\":\"10/2026\",\"canonical_fatura_id\":\"$2\",\"divergencia_valor\":true,\"valor_fatura\":$4,\"divergencia_aceita\":$5,\"divergencia_motivo\":\"$6\",\"fatura\":{\"status\":\"aberta\"}}"; }
it_ok() { echo "{\"aluno_nome\":\"$1\",\"valor\":$3,\"categoria\":\"parcela\",\"competencia\":\"10/2026\",\"canonical_fatura_id\":\"$2\",\"fatura\":{\"status\":\"aberta\"}}"; }
MOT="a escola autorizou sem juros, ultima parcela"
SEM_DIV="select $V($U, '[$(it_ok 'Otavio Reis' $F3 390)]'::jsonb || '[$(it_ok 'Lara Quintela Prado' $F1 489.92)]'::jsonb, 879.92, '2026-10-07')"
SEM_DIV_ANTES=$(q "$SEM_DIV")

p < supabase/migrations/20261007150000_sol_multi_valor_divergente.sql || { echo "VERMELHO (migration não aplicou)"; exit 1; }

falhas=0
ok() { if eval "$2"; then echo "  ✓ $1"; else echo "  ✗ $1"; falhas=$((falhas+1)); fi; }
setpag "$PAG_DIV"; R1=$(q "select $R($U, $IT_OUT, 863.20, '2026-10-01')")
ok "resolver: caso real volta casado como valor_divergente (não recusa)" 'echo "$R1" | grep -q "\"motivo\": \"valor_divergente\"" && echo "$R1" | grep -q "\"divergencias\": 2"'
ok "resolver: cada item com fatura, valor que entrou e valor da fatura" '[ "$(q "select count(*) from jsonb_array_elements(($R($U, $IT_OUT, 863.20, '"'"'2026-10-01'"'"'))->'"'"'itens'"'"') x where (x->>'"'"'divergencia_valor'"'"')::boolean and (x->>'"'"'valor'"'"')::numeric = 431.60 and (x->>'"'"'valor_fatura'"'"')::numeric = 489.92 and x->>'"'"'canonical_fatura_id'"'"' is not null and x->'"'"'fatura'"'"'->>'"'"'valor_com_desconto'"'"' = '"'"'431.44'"'"'")" = 2 ]'
ok "resolver: soma que não fecha com o comprovante recusa" 'q "select $R($U, $IT_OUT, 900, '"'"'2026-10-01'"'"')" | grep -q soma_itens_divergente'
ok "resolver: competência do item ≠ da fatura recusa com o motivo real" 'q "select $R($U, $IT_SET, 863.20, '"'"'2026-10-01'"'"')" | grep -q competencia_item_divergente'
setpag "$PAG_NAOACHOU"
ok "resolver: aluno não encontrado continua recusando o lote" 'q "select $R($U, $IT_OUT, 863.20, '"'"'2026-10-01'"'"')" | grep -q "\"motivo\": \"aluno_nao_encontrado\""'
setpag "$PAG_OK"
ok "resolver: valores que batem seguem idênticos (ok:true)" '[ "$R_OK_ANTES" = "$(q "select $R($U, $IT_IGUAL, 979.84, '"'"'2026-10-01'"'"')")" ] && echo "$R_OK_ANTES" | grep -q "\"ok\": true"'

V_OK="select $V($U, '[$(it_div 'Lara Quintela Prado' $F1 431.60 489.92 true "$MOT"),$(it_div 'Caio Quintela Prado' $F2 431.60 489.92 true "$MOT")]'::jsonb, 863.20, '2026-10-07')"
V_SEM="select $V($U, '[$(it_div 'Lara Quintela Prado' $F1 431.60 489.92 false ""),$(it_div 'Caio Quintela Prado' $F2 431.60 489.92 false "")]'::jsonb, 863.20, '2026-10-07')"
V_SOMA="select $V($U, '[$(it_div 'Lara Quintela Prado' $F1 431.60 489.92 true "$MOT"),$(it_div 'Caio Quintela Prado' $F2 431.60 489.92 true "$MOT")]'::jsonb, 900, '2026-10-07')"
V_TROCA="select $V($U, '[$(it_div 'Lara Quintela Prado' $F2 431.60 489.92 true "$MOT"),$(it_div 'Caio Quintela Prado' $F1 431.60 489.92 true "$MOT")]'::jsonb, 863.20, '2026-10-07')"
V_FANT="select $V($U, '[$(it_div 'Zebedeu Xavantes' $F1 431.60 489.92 true "$MOT"),$(it_div 'Caio Quintela Prado' $F2 431.60 489.92 true "$MOT")]'::jsonb, 863.20, '2026-10-07')"
V_MUDOU="select $V($U, '[$(it_div 'Lara Quintela Prado' $F1 431.60 479.84 true "$MOT"),$(it_div 'Caio Quintela Prado' $F2 431.60 479.84 true "$MOT")]'::jsonb, 863.20, '2026-10-07')"
OUT=$(q "$V_OK")
ok "validador: aceita divergência com motivo da equipe" 'echo "$OUT" | grep -q "\"ok\": true"'
ok "validador: lança o valor que ENTROU, vinculado à fatura" '[ "$(q "select count(*) from jsonb_array_elements(($V_OK)->'"'"'itens'"'"') x where (x->>'"'"'valor'"'"')::numeric = 431.60 and x->>'"'"'canonical_fatura_id'"'"' in ('"'"'$F1'"'"','"'"'$F2'"'"')")" = 2 ]'
ok "validador: descrição registra fatura, pago, diferença e motivo" 'echo "$OUT" | grep -q "fatura R\$ 489,92 · pago R\$ 431,60 · dif. -R\$ 58,32 · motivo (equipe): a escola autorizou sem juros"'
ok "validador: snapshot leva o objeto divergencia" 'echo "$OUT" | grep -q "\"diferenca\": -58.32"'
ok "validador: sem motivo recusa" 'q "$V_SEM" | grep -q snapshot_divergencia_sem_motivo'
ok "validador: soma não fecha recusa" 'q "$V_SOMA" | grep -q snapshot_soma_divergente'
ok "validador: fatura de outro aluno recusa" 'q "$V_TROCA" | grep -q snapshot_fatura_nao_encontrada'
ok "validador: aluno inexistente recusa" 'q "$V_FANT" | grep -q snapshot_aluno_nao_encontrado'
ok "validador: fatura mudou de valor desde o card recusa" 'q "$V_MUDOU" | grep -q snapshot_valor_fatura_mudou'
ok "validador: item sem divergência idêntico ao vivo" '[ "$SEM_DIV_ANTES" = "$(q "$SEM_DIV")" ]'
ok "ACL das duas funções preservada" '[ "$ACL_ANTES" = "$(q "$ACL_Q")" ] && echo "$ACL_ANTES" | grep -q sol_acesso_restrito'
# rollback volta ao vivo
p < supabase/rollbacks/20261007150000_sol_multi_valor_divergente_ROLLBACK.sql
setpag "$PAG_DIV"
ok "rollback: volta a recusar como antes (valor_declarado_nao_bate)" 'q "select $R($U, $IT_OUT, 863.20, '"'"'2026-10-01'"'"')" | grep -q valor_declarado_nao_bate'
[ $falhas -eq 0 ] && echo "verde" || { echo "VERMELHO ($falhas)"; exit 1; }
