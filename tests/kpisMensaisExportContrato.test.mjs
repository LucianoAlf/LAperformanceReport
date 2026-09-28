import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const raiz = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const edge = readFileSync(join(raiz, 'supabase/functions/export-kpis-mensais/index.ts'), 'utf8');
const migration = readFileSync(join(raiz, 'supabase/migrations/20260928120000_kpis_mensais_export_v1.sql'), 'utf8');

test('edge autentica com segredo dedicado e fallback de contas a receber', () => {
  assert.match(edge, /SUPER_FOLHA_KPIS_SECRET/);
  assert.match(edge, /SUPER_FOLHA_CONTAS_RECEBER_SECRET/);
  assert.match(edge, /x-super-folha-sync-secret/);
  assert.match(edge, /safeEqual/);
});

test('edge aceita competencia YYYY-MM ou YYYY-MM-01 e rejeita formato invalido', () => {
  assert.match(edge, /\^\(\\d\{4\}\)-\(\\d\{2\}\)\(\?:-01\)\?\$/);
  assert.match(edge, /YYYY-MM ou YYYY-MM-01/);
});

test('edge nunca devolve telefone cru: aplica HMAC e remove fone_norm', () => {
  assert.match(edge, /hmacFone/);
  assert.match(edge, /professor-fone-v1:/);
  assert.match(edge, /delete item\.fone_norm/);
  assert.match(edge, /professor_fone_hmac/);
});

test('edge chama a RPC canonica e embala manifesto com hash', () => {
  assert.match(edge, /kpis_mensais_export_v1/);
  assert.match(edge, /payload_sha256/);
  assert.match(edge, /kpis-mensais-v1/);
});

test('RPC usa get_kpis_alunos_canonicos como fonte unica dos KPIs', () => {
  assert.match(migration, /get_kpis_alunos_canonicos\(p_unidade_id, v_ano, v_mes\)/);
  assert.match(migration, /jsonb_array_elements\(coalesce\(v_kpis -> 'por_unidade'/);
});

test('RPC distingue fechado, legado e aberto', () => {
  assert.match(migration, /fechamento_mensal_snapshots/);
  assert.match(migration, /dominio = 'alunos_admin'/);
  assert.match(migration, /status <> 'preview'/);
  assert.match(migration, /then 'legado'/);
  assert.match(migration, /then 'fechado'/);
  assert.match(migration, /else 'aberto'/);
});

test('RPC expõe novos_alunos (pessoas) e novas_matriculas (linhas) com régua de tipos_matricula', () => {
  assert.match(migration, /'novos_alunos', \(kpi\.value ->> 'novas_matriculas'\)::integer/);
  assert.match(migration, /'novas_matriculas', coalesce\(nl\.n, 0\)/);
  assert.match(migration, /tm\.codigo not in \('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA', 'TRANSFERENCIA'\)/);
});

test('RPC deduplica sessões de aula por chave de sessão (turma + individuais irmãs)', () => {
  assert.match(migration, /_kpis_mensais_export_sessoes/);
  assert.match(migration, /group by 1, 2, 3, 4, 5, 6, 7/);
  assert.match(migration, /a\.cancelada = false/);
});

test('RPC marca produtor de banda pelo papel canonico banda.produtor_professor_id', () => {
  assert.match(migration, /b\.produtor_professor_id = sa\.professor_id/);
  assert.match(migration, /e_produtor_banda/);
});

test('RPC restringe execucao ao service_role', () => {
  assert.match(migration, /revoke all on function public\.kpis_mensais_export_v1\(uuid, integer, integer\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.kpis_mensais_export_v1\(uuid, integer, integer\) to service_role/);
});
