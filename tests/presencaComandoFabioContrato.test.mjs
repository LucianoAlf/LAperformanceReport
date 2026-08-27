import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync('supabase/migrations/20260827030800_presenca_comando_portas_fabio.sql','utf8');
const compatibilidade = readFileSync('supabase/migrations/20260827030900_presenca_comando_overloads_compatibilidade.sql','utf8');

test('Fábio usa IDs estáveis do registro e da ação no ledger canônico', () => {
  assert.match(sql, /md5\('fabio-registro:'\|\|p_registro_id::text\)::uuid/i);
  assert.match(sql, /fabio_criar_comando_chamada_v1\(\s*p_acao_id/i);
  assert.match(sql, /app_aplicar_comando_presenca_v1\(p_acao_id\)/i);
  assert.match(sql, /presenca_request_id/i);
});

test('portas antigas possuem overload com request id e delegam ao ledger', () => {
  assert.match(compatibilidade, /app_registrar_chamada_agenda\s*\(\s*p_itens jsonb,\s*p_request_id uuid/i);
  assert.match(compatibilidade, /app_registrar_presencas_aula\s*\([\s\S]*p_request_id uuid/i);
  assert.match(compatibilidade, /fabio_registrar_presencas_aula\s*\([\s\S]*p_request_id uuid/i);
  assert.match(compatibilidade, /app_aplicar_comando_presenca_v1\(p_request_id\)/gi);
  assert.match(compatibilidade, /Fechamento do bypass/);
  assert.match(compatibilidade, /revoke all on function public\.app_registrar_chamada_agenda\(jsonb\) from public,anon,authenticated/i);
  assert.match(compatibilidade, /app_marcar_presenca_professor_aula\s*\(\s*p_aula_emusys_id integer,p_presente boolean,p_request_id uuid/i);
});

test('Fábio não chama mais o core de presença fora do protocolo', () => {
  assert.doesNotMatch(sql, /fn_registrar_presencas_core\s*\(/i);
  assert.match(sql, /v_escrita->>'status'\s*<>\s*'concluido'/i);
  assert.match(sql, /grant execute[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /grant execute on function public\.fabio_emitir_presenca_por_registro\(uuid\) to authenticated/i);
  assert.match(sql, /request_id_obrigatorio_use_overload_4_argumentos/i);
});
