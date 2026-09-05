import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationName = readdirSync('supabase/migrations')
  .find((name) => name.includes('contrato_assinado_canonico'));
const sql = migrationName
  ? readFileSync(`supabase/migrations/${migrationName}`, 'utf8')
  : '';
const authorizationName = readdirSync('supabase/migrations')
  .find((name) => name.includes('contrato_assinado_autorizacao'));
const authorizationSql = authorizationName
  ? readFileSync(`supabase/migrations/${authorizationName}`, 'utf8')
  : '';
const electronicSemanticsName = readdirSync('supabase/migrations')
  .find((name) => name.includes('contrato_assinatura_eletronica_semantica'));
const electronicSemanticsSql = electronicSemanticsName
  ? readFileSync(`supabase/migrations/${electronicSemanticsName}`, 'utf8')
  : '';
const manualElectronicSemanticsName = readdirSync('supabase/migrations')
  .find((name) => name.includes('contrato_assinado_manual_eletronico'));
const manualElectronicSemanticsSql = manualElectronicSemanticsName
  ? readFileSync(`supabase/migrations/${manualElectronicSemanticsName}`, 'utf8')
  : '';
const tomDoc = readFileSync('docs/operacao/contrato-assinado-tom.md', 'utf8');
const designDoc = readFileSync('docs/superpowers/specs/2026-09-04-contrato-assinado-design.md', 'utf8');

test('migration cria persistencia por unidade, matricula e contrato com RLS fechado', () => {
  assert.ok(migrationName, 'migration contrato_assinado_canonico ainda nao existe');
  assert.match(sql, /create table public\.aluno_contratos_emusys/i);
  assert.match(sql, /unidade_id\s+uuid\s+not null/i);
  assert.match(sql, /emusys_matricula_id\s+text\s+not null/i);
  assert.match(sql, /contrato_emusys_id\s+text/i);
  assert.match(sql, /contrato_assinado\s+boolean/i);
  assert.match(sql, /contrato_status_observado_em\s+timestamptz\s+not null/i);
  assert.match(sql, /unique[\s\S]*unidade_id[\s\S]*emusys_matricula_id[\s\S]*contrato_emusys_id/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.aluno_contratos_emusys from (?:public,\s*)?anon, authenticated/i);
});

test('migration deixa toda execucao rastreavel e lote atomico exclusivo do service_role', () => {
  assert.match(sql, /create table public\.contrato_assinatura_sync_execucoes/i);
  assert.match(sql, /running[\s\S]*succeeded[\s\S]*failed/i);
  assert.match(sql, /erro\s+text/i);
  assert.match(sql, /registrar_contrato_assinatura_lote_v1/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /grant execute on function public\.registrar_contrato_assinatura_lote_v1[\s\S]*to service_role/i);
});

test('backfill le snapshots e nao reinterpreta data de periodo como assinatura', () => {
  assert.match(sql, /emusys_matriculas_estado_atual/i);
  assert.match(sql, /payload_snapshot[\s\S]*contrato_atual[\s\S]*contrato_assinado/i);
  assert.match(sql, /snapshot_backfill/i);
  assert.doesNotMatch(sql, /update\s+public\.alunos[\s\S]*contrato_assinado/i);
  assert.doesNotMatch(sql, /data_inicio_contrato\s+is\s+not\s+null[\s\S]*contrato_assinado/i);
});

test('RPC preserva tem_data_contrato e adiciona verdade e frescura do contrato', () => {
  assert.match(sql, /get_situacao_alunos_v1/i);
  assert.match(sql, /tem_data_contrato\s+boolean/i);
  assert.match(sql, /contrato_assinatura_status\s+text/i);
  assert.match(sql, /contratos_assinados_todos\s+boolean/i);
  assert.match(sql, /contrato_status_observado_em\s+timestamptz/i);
  assert.match(sql, /contrato_reconciliado_em\s+timestamptz/i);
  assert.match(sql, /contrato_dado_fresco\s+boolean/i);
  assert.match(sql, /get_contrato_assinatura_aluno_v1/i);
});

test('regra por pessoa exige todas as matriculas academicas e dispensa projeto de banda explicitamente', () => {
  assert.match(sql, /is_projeto_banda/i);
  assert.match(sql, /bool_and\s*\(/i);
  assert.match(sql, /nao_verificado/i);
  assert.match(sql, /sem_contrato/i);
  assert.match(sql, /nao_assinado/i);
  assert.match(sql, /assinado/i);
  assert.match(sql, /dispensado/i);
});

test('cron roda antes do TOM e possui segunda tentativa sem segredo incorporado', () => {
  assert.match(sql, /sync-contrato-assinatura-(cg|campo-grande)-principal/i);
  assert.match(sql, /sync-contrato-assinatura-recreio-principal/i);
  assert.match(sql, /sync-contrato-assinatura-barra-principal/i);
  assert.match(sql, /sync-contrato-assinatura-(cg|campo-grande)-retry/i);
  assert.match(sql, /0\s+8\s+\*\s+\*\s+\*/i);
  assert.match(sql, /50\s+8\s+\*\s+\*\s+\*/i);
  assert.doesNotMatch(sql, /EMUSYS_TOKEN_[A-Z]+\s*=/i);
});

test('RPCs SECURITY DEFINER autorizam por claim e permissao, nao pelo current_user do dono', () => {
  assert.ok(authorizationName, 'migration de autorizacao ainda nao existe');
  assert.match(authorizationSql, /auth\.role\(\)/i);
  assert.match(authorizationSql, /auth\.uid\(\)/i);
  assert.match(authorizationSql, /fn_usuario_atual_tem_permissao\(['"]alunos\.ver['"]/i);
  assert.match(authorizationSql, /fn_contrato_assinatura_pode_ler_v1/i);
  assert.doesNotMatch(authorizationSql, /current_user\s+in\s*\([^)]*postgres/i);
  assert.match(authorizationSql, /get_situacao_alunos_sem_contrato_assinado_core_v1/i);
  assert.match(authorizationSql, /revoke all on function public\.get_situacao_alunos_sem_contrato_assinado_core_v1/i);
});

test('RPCs publicam false como nao_assinado sem alterar persistencia ou frescor', () => {
  assert.ok(electronicSemanticsName, 'migration historica da semantica eletronica deve ser preservada');
  assert.ok(manualElectronicSemanticsName, 'migration da semantica manual + eletronica ainda nao existe');
  assert.match(manualElectronicSemanticsSql, /pg_get_functiondef/i);
  assert.match(manualElectronicSemanticsSql, /get_situacao_alunos_v1\(uuid,date,boolean\)/i);
  assert.match(manualElectronicSemanticsSql, /get_contrato_assinatura_aluno_v1\(integer\)/i);
  assert.match(manualElectronicSemanticsSql, /then\s+''nao_assinado''/i);
  assert.match(manualElectronicSemanticsSql, /replace\s*\(/i);
  assert.match(manualElectronicSemanticsSql, /raise exception[\s\S]*semantica/i);
  assert.match(manualElectronicSemanticsSql, /revoke all on function[\s\S]*from public, anon/i);
  assert.match(manualElectronicSemanticsSql, /grant execute on function[\s\S]*authenticated, service_role, sol_acesso_restrito/i);
  assert.doesNotMatch(manualElectronicSemanticsSql, /drop\s+table|truncate|delete\s+from|update\s+public\.aluno_contratos_emusys/i);
  assert.doesNotMatch(manualElectronicSemanticsSql, /normalizarMatriculaContrato|contrato_dado_fresco\s*:=/i);
});

test('documento libera o TOM e registra a virada das assinaturas manuais', () => {
  assert.match(tomDoc, /LIBERADO PARA RELIGAR O TOM/i);
  assert.match(tomDoc, /manual\s*\+\s*eletr[oô]nica/i);
  assert.match(tomDoc, /933\s*\/\s*238/i);
  assert.match(tomDoc, /aguardando a assinatura do aluno/i);
  for (const matricula of ['32', '78', '169', '328', '394', '409', '167', '416']) {
    assert.match(tomDoc, new RegExp(`\\|\\s*${matricula}\\s*\\|`));
  }
  assert.doesNotMatch(tomDoc, /não pode ser ativado enquanto o Emusys não expuser modo e data de assinatura/i);
  assert.match(designDoc, /`nao_assinado`/);
  assert.doesNotMatch(designDoc, /`sem_assinatura_eletronica`|Assinado eletronicamente/);
});
