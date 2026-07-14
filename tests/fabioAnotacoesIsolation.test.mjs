import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const syncPresenca = readFileSync(
  new URL('../supabase/functions/sync-presenca-emusys/index.ts', import.meta.url),
  'utf8',
);
const migration = readFileSync(
  new URL('../supabase/migrations/20260712125644_isolar_anotacoes_fabio_emusys.sql', import.meta.url),
  'utf8',
);
const mapaDominio = readFileSync(
  new URL('../docs/auditorias/2026-07-11-mapa-backend-aluno.md', import.meta.url),
  'utf8',
);

test('sync de presenca espelha anotacoes do Emusys sem tocar anotacoes_fabio', () => {
  assert.match(syncPresenca, /anotacoes:\s*aula\.anotacoes\s*\|\|\s*null/);
  assert.doesNotMatch(syncPresenca, /anotacoes_fabio/);
});

test('migration versiona a protecao e a porta canonica do Fabio', () => {
  assert.match(migration, /create trigger trg_proteger_anotacoes_fabio/i);
  assert.match(migration, /new\.anotacoes_fabio := old\.anotacoes_fabio/i);
  assert.match(migration, /create or replace function public\.registrar_aula_fabio/i);
  assert.match(migration, /set anotacoes_fabio = v_texto_novo/i);
  assert.doesNotMatch(migration, /set\s+anotacoes\s*=/i);
});

test('mapa do dominio registra a separacao canonica das fontes', () => {
  assert.match(mapaDominio, /aulas_emusys\.anotacoes_fabio/);
  assert.match(mapaDominio, /registrar_aula_fabio/);
  assert.match(mapaDominio, /fabio_protecao_log/);
});
