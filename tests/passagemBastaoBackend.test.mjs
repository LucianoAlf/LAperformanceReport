import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260709120000_passagem_bastao_professores.sql',
  'utf8',
);
const edge = readFileSync('supabase/functions/processar-matricula-emusys/index.ts', 'utf8');
const jornadaCanonica = readFileSync('supabase/functions/_shared/jornada-canonica.ts', 'utf8');
const gate3MigrationPath =
  'supabase/migrations/20260717095000_health_score_v3_transicoes_atribuicao.sql';
const gate3Migration = existsSync(gate3MigrationPath)
  ? readFileSync(gate3MigrationPath, 'utf8')
  : '';
const gate3HardeningPath =
  'supabase/migrations/20260717101500_health_score_v3_transicoes_indices_rls.sql';
const gate3Hardening = existsSync(gate3HardeningPath)
  ? readFileSync(gate3HardeningPath, 'utf8')
  : '';

test('migration creates cold and hot handoff layers with required RPCs', () => {
  assert.match(migration, /create table if not exists public\.aluno_professor_transicoes/i);
  assert.match(migration, /create table if not exists public\.professor_passagem_bastao/i);
  assert.match(migration, /status text not null default 'pendente'/i);
  assert.match(migration, /check \(status in \('pendente', 'respondido', 'dispensado'\)\)/i);
  assert.match(migration, /emusys_matricula_disciplina_id bigint/i);
  assert.match(migration, /curso_id integer/i);
  assert.match(migration, /get_passagens_bastao_pendentes/i);
  assert.match(migration, /responder_passagem_bastao/i);
  assert.match(migration, /dispensar_passagem_bastao/i);
  assert.match(migration, /get_passagem_bastao_aluno/i);
});

test('matricula_alterada captures professor transition before canonical journey upsert', () => {
  const capturePos = edge.indexOf('registrarTransicaoProfessorSeNecessario');
  const upsertPos = edge.indexOf('await upsertJornadaMatriculaDisciplina');

  assert.ok(capturePos > -1, 'edge must call registrarTransicaoProfessorSeNecessario');
  assert.ok(upsertPos > -1, 'edge must still upsert canonical journey');
  assert.ok(capturePos < upsertPos, 'transition capture must happen before journey upsert call');
  assert.match(edge, /registrar_transicao_professor_v3/);
});

test('gate 3 adds nullable attribution and origin-period fields without touching legacy movements', () => {
  assert.equal(existsSync(gate3MigrationPath), true, `${gate3MigrationPath} deve existir`);
  assert.match(gate3Migration, /add column if not exists motivo_saida_id integer/i);
  assert.match(gate3Migration, /add column if not exists atribuicao_confirmada boolean/i);
  assert.match(gate3Migration, /add column if not exists conta_retencao_professor boolean/i);
  assert.match(gate3Migration, /add column if not exists revisado_por integer/i);
  assert.match(gate3Migration, /add column if not exists revisado_em timestamptz/i);
  assert.match(gate3Migration, /add column if not exists periodo_origem_id uuid/i);
  assert.doesNotMatch(gate3Migration, /\bmovimentacoes\b/i);
});

test('gate 3 records transition and handoff atomically through a service-role-only RPC', () => {
  assert.match(gate3Migration, /create or replace function public\.registrar_transicao_professor_v3/i);
  assert.match(gate3Migration, /language plpgsql[\s\S]*security definer/i);
  assert.match(gate3Migration, /set search_path = public, pg_temp/i);
  assert.match(gate3Migration, /insert into public\.aluno_professor_transicoes/i);
  assert.match(gate3Migration, /insert into public\.professor_passagem_bastao/i);
  assert.match(gate3Migration, /revoke all on function public\.registrar_transicao_professor_v3\(jsonb\)[\s\S]*from public, anon, authenticated/i);
  assert.match(gate3Migration, /grant execute on function public\.registrar_transicao_professor_v3\(jsonb\) to service_role/i);
});

test('webhook delegates enrichment to gate 3 RPC before the non-blocking journey upsert', () => {
  const rpcPos = edge.indexOf(".rpc('registrar_transicao_professor_v3'");
  const upsertPos = edge.indexOf('await upsertJornadaMatriculaDisciplina');

  assert.ok(rpcPos > -1, 'webhook deve chamar registrar_transicao_professor_v3');
  assert.ok(upsertPos > -1, 'webhook deve manter o upsert da jornada');
  assert.ok(rpcPos < upsertPos, 'enriquecimento deve ocorrer antes da jornada apontar para B');
  assert.doesNotMatch(edge, /\.from\('aluno_professor_transicoes'\)\s*\.insert/i);
  assert.doesNotMatch(edge, /payload_bruto:\s*input\.raw/i);
});

test('gate 3 builds a minimal transition context without copying raw student payloads', () => {
  assert.match(jornadaCanonica, /buildTransicaoProfessorContextoSemPii/);
  const helperStart = jornadaCanonica.indexOf('export function buildTransicaoProfessorContextoSemPii');
  const helperEnd = jornadaCanonica.indexOf('\n}\n', helperStart) + 3;
  const helper = jornadaCanonica.slice(helperStart, helperEnd);

  assert.match(helper, /emusys_matricula_disciplina_id/);
  assert.match(helper, /emusys_professor_anterior_id/);
  assert.match(helper, /emusys_professor_novo_id/);
  assert.doesNotMatch(helper, /nome_aluno|data_nascimento|disciplina\.raw|input\.raw/i);
});

test('processar matricula reads Emusys credentials only from Edge secrets', () => {
  assert.doesNotMatch(edge, /const TOKENS_API/i);
  assert.match(edge, /EMUSYS_TOKEN_CG/);
  assert.match(edge, /EMUSYS_TOKEN_RECREIO/);
  assert.match(edge, /EMUSYS_TOKEN_BARRA/);
});

test('gate 3 hardens transition indexes and scopes service-role policies explicitly', () => {
  assert.equal(existsSync(gate3HardeningPath), true, `${gate3HardeningPath} deve existir`);
  assert.match(gate3Hardening, /idx_aluno_professor_transicoes_motivo_saida/);
  assert.match(gate3Hardening, /idx_aluno_professor_transicoes_revisado_por/);
  assert.match(gate3Hardening, /idx_aluno_professor_transicoes_automacao_log/);
  assert.match(gate3Hardening, /idx_professor_passagem_bastao_curso/);
  assert.match(
    gate3Hardening,
    /create policy "service_role_all_aluno_professor_transicoes"[\s\S]*to service_role[\s\S]*using \(true\)/i,
  );
  assert.match(
    gate3Hardening,
    /create policy "service_role_all_professor_passagem_bastao"[\s\S]*to service_role[\s\S]*using \(true\)/i,
  );
});
