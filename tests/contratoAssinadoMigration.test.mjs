import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationName = readdirSync('supabase/migrations')
  .find((name) => name.includes('contrato_assinado_canonico'));
const sql = migrationName
  ? readFileSync(`supabase/migrations/${migrationName}`, 'utf8')
  : '';

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
