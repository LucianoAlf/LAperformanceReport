import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migrationPath = 'supabase/migrations/20260909031109_relatorio_coordenacao_documento_v4.sql';

function functionBody(sql, name) {
  const start = sql.toLowerCase().indexOf(`function public.${name.toLowerCase()}`);
  assert.notEqual(start, -1, `funcao ${name} deve existir`);
  const next = sql.toLowerCase().indexOf('create or replace function public.', start + 20);
  return sql.slice(start, next === -1 ? sql.length : next);
}

test('migration V4 cria dominio separado, indice parcial e materializacao idempotente', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /'relatorio_coordenacao_ciclo'/i);
  assert.match(sql, /idx_fechamento_coordenacao_v4_lookup/i);
  assert.match(sql, /where[\s\S]*?schema_version["']?\s*:\s*4/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /hash_jsonb_canonico\s*\(v_conteudo\)/i);
  assert.match(sql, /supersede_id/i);
  assert.match(sql, /is not distinct from/i);
});

test('produtor V4 e materializador sao privados, leitor apenas consulta documento', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const reader = functionBody(sql, 'get_relatorio_coordenacao_documento_v4');

  assert.match(sql, /revoke all on function public\.montar_relatorio_coordenacao_conteudo_v4[\s\S]*?from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.materializar_relatorio_coordenacao_documento_v4[\s\S]*?to service_role/i);
  assert.match(sql, /grant execute on function public\.get_relatorio_coordenacao_documento_v4[\s\S]*?to authenticated, service_role/i);
  assert.match(reader, /fechamento_mensal_snapshots/i);
  assert.match(reader, /hash_jsonb_canonico/i);
  assert.doesNotMatch(reader, /montar_relatorio_coordenacao_payload_v3/i);
  assert.doesNotMatch(reader, /get_kpis_professor_periodo/i);
  assert.doesNotMatch(reader, /matriculas_comerciais_v1/i);
});

test('migration preserva todos os dominios de fechamento existentes', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const existingDomains = [
    'alunos_admin',
    'alunos_executivo',
    'comercial',
    'retencao',
    'renovacoes',
    'professores',
    'relatorio_admin',
    'relatorio_admin_mensal',
    'relatorio_comercial_mensal',
    'relatorio_gerencial',
    'relatorio_coordenacao',
    'metas',
    'programa_matriculador',
    'programa_fideliza',
    'compatibilidade_dados_mensais',
  ];

  for (const domain of existingDomains) {
    assert.match(sql, new RegExp(`'${domain}'`));
  }
});

