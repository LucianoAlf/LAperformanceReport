import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260709120000_passagem_bastao_professores.sql',
  'utf8',
);
const edge = readFileSync('supabase/functions/processar-matricula-emusys/index.ts', 'utf8');

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
  assert.match(edge, /aluno_professor_transicoes/);
  assert.match(edge, /professor_passagem_bastao/);
});
