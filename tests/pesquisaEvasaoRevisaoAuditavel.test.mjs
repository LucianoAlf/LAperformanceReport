import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(
  root,
  'supabase/migrations/20260802223000_pesquisa_evasao_revisao_auditavel_fila.sql',
);
const specPath = resolve(
  root,
  'docs/superpowers/specs/2026-07-30-pesquisa-evasao-v2-mapa-sinais-design.md',
);
const read = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('inicio e conclusao da revisao preservam operadores e horarios distintos', () => {
  const sql = read(migrationPath);
  assert.ok(sql, 'migration corretiva da revisao ainda nao existe');
  assert.match(sql, /revisao_iniciada_por_usuario_id integer/i);
  assert.match(sql, /revisao_iniciada_em timestamptz/i);
  assert.match(sql, /set[\s\S]*revisao_iniciada_por_usuario_id\s*=\s*v_usuario_id/i);
  assert.match(sql, /revisao_iniciada_em\s*=\s*now\(\)/i);
  assert.match(sql, /set[\s\S]*revisor_usuario_id\s*=\s*v_usuario_id/i);
  assert.match(sql, /revisado_em\s*=\s*now\(\)/i);
  assert.match(sql, /pea\.status\s*=\s*'em_revisao'/i);
});

test('revisao legada sem autor volta para pronta em vez de ganhar autoria inventada', () => {
  const sql = read(migrationPath);
  assert.match(sql, /status\s*=\s*'pronta_para_revisao'/i);
  assert.match(sql, /status\s*=\s*'em_revisao'[\s\S]*revisor_usuario_id is null[\s\S]*revisado_em is null/i);
  assert.doesNotMatch(sql, /revisao_iniciada_por_usuario_id\s*=\s*\d+/i);
});

test('conteudo posterior mantem pesquisa na fila mesmo com rodada atual coletando', () => {
  const sql = read(migrationPath);
  assert.match(sql, /status in \('pronta_para_revisao', 'em_revisao', 'revisada'\)/i);
  assert.match(sql, /resposta_status\s*=\s*case[\s\S]*'pronta_para_revisao'[\s\S]*'coletando'/i);
  assert.match(sql, /pronta_para_revisao_em\s*=\s*case/i);
  assert.match(sql, /conteudo_novo_desde_revisao[\s\S]*v_tem_rodada_anterior_relevante/i);
});

test('subprojeto C registra alerta sem conteudo para quem enviou a pesquisa', () => {
  const spec = read(specPath);
  assert.match(spec, /executado_por_usuario_id/i);
  assert.match(spec, /nome do aluno, unidade e o fato de haver resposta nova/i);
  assert.match(spec, /sem o conte[uú]do da resposta/i);
  assert.match(spec, /rodada nova .*ap[oó]s revis[aã]o conclu[ií]da/i);
});
