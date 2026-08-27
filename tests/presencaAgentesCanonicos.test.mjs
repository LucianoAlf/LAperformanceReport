import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20260827031200_presenca_contexto_agentes_v1.sql', import.meta.url),
  'utf8',
);
const sol = readFileSync(
  new URL('../supabase/functions/relatorio-admin-whatsapp/index.ts', import.meta.url),
  'utf8',
);

test('contexto por papel fecha anon, valida finalidade e publica metadados canonicos', () => {
  assert.match(migration, /get_presenca_contexto_agente_v1\s*\(/iu);
  for (const field of [
    'dados_status', 'sincronizado_em', 'regra_versao', 'universo_eventos',
    'presentes', 'faltas_confirmadas', 'indeterminados', 'conflitos',
    'revisoes_estruturais', 'periodo', 'estado_publicacao',
  ]) assert.match(migration, new RegExp(`['"]${field}['"]`, 'iu'));
  assert.match(migration, /p_escopo[\s\S]*sol[\s\S]*lia[\s\S]*mila[\s\S]*fabio[\s\S]*bi/iu);
  assert.match(migration, /revoke all on function public\.get_presenca_contexto_agente_v1[\s\S]*public, anon, authenticated/iu);
  assert.match(migration, /grant execute on function public\.get_presenca_contexto_agente_v1[\s\S]*service_role/iu);
  assert.doesNotMatch(migration, /grant execute on function public\.get_presenca_contexto_agente_v1[\s\S]*\bto\s+anon\b/iu);
  assert.match(migration, /revoke select on table public\.aluno_presenca from lia_acesso_restrito/iu);
});

test('Sol usa exclusivamente o envelope por papel e não recompõe presença na Edge', () => {
  assert.match(sol, /get_presenca_contexto_agente_v1/iu);
  assert.match(sol, /escopo[^\r\n]*sol/iu);
  assert.doesNotMatch(sol, /from\(['"]aluno_presenca['"]\)/iu);
});

test('Mila permanece no contrato experimental e BI/Lia não recebem listas nominais', () => {
  assert.match(migration, /v_escopo\s*=\s*'mila'[\s\S]*presenca-experimental/iu);
  assert.match(migration, /'pendencias'[\s\S]*v_escopo\s*=\s*'sol'/iu);
  assert.match(migration, /'ocorrencias'[\s\S]*v_escopo\s*=\s*'fabio'/iu);
  assert.doesNotMatch(migration, /v_escopo\s+in\s*\([^)]*(?:lia|bi)[^)]*\)[\s\S]{0,900}aluno_nome/iu);
});
