import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  repoRoot,
  'supabase/migrations/20260721123000_professor_curso_modalidade_excecoes_reais.sql',
);

const sql = fs.existsSync(migrationPath)
  ? fs.readFileSync(migrationPath, 'utf8')
  : '';

test('migration distingue de-para pendente de disciplina fora do escopo', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration corretiva deve existir');
  assert.match(sql, /status_mapeamento/i);
  assert.match(sql, /fora_escopo/i);
  assert.match(sql, /pendente/i);
  assert.match(sql, /mapeado/i);
});

test('atividades operacionais conhecidas ficam fora da fila sem criar curso ficticio', () => {
  assert.match(sql, /Circuito Musical/i);
  assert.match(sql, /Visita Musical/i);
  assert.match(sql, /\bCircuito\b/i);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.cursos/i);
});

test('fila V2 publica disciplina sem de-para uma unica vez por unidade e disciplina', () => {
  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.get_professor_curso_modalidade_excecoes_v2/i);
  assert.match(sql, /distinct\s+on\s*\(\s*evidencia\.unidade_id\s*,\s*evidencia\.emusys_disciplina_id\s*\)/i);
  assert.match(sql, /evidencia\.estado\s*=\s*'disciplina_sem_depara'/i);
});

test('fila V2 preserva seguranca e nao reintroduz fontes legadas', () => {
  assert.match(sql, /set\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
  assert.match(sql, /usuario_tem_permissao/i);
  assert.match(sql, /professores\.editar/i);
  assert.match(sql, /revoke\s+all[\s\S]*get_professor_curso_modalidade_excecoes_v2/i);
  assert.doesNotMatch(sql, /\bprofessores_cursos\b/i);
  assert.doesNotMatch(sql, /aulas_emusys\s*\.\s*tipo/i);
});
