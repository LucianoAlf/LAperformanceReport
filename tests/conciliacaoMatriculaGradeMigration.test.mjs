import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  raiz,
  'supabase',
  'migrations',
  '20260818190000_conciliacao_matricula_grade_separa_dominios.sql',
);
const migration = await readFile(migrationPath, 'utf8');
const migrationReintroducaoPath = path.join(
  raiz,
  'supabase',
  'migrations',
  '20260818194337_conciliacao_auto_preview_reclassifica_reintroducao.sql',
);
const migrationReintroducao = await readFile(migrationReintroducaoPath, 'utf8');

test('a migration conserva auditoria e retira campos não-grade da fila auto_preview', () => {
  assert.match(migration, /matriculas_divergencias_decisoes/i);
  assert.match(migration, /patch_legado_original/i);
  assert.match(migration, /'curso_id',\s*'professor_atual_id',\s*'dia_aula',\s*'horario_aula'/i);
  assert.match(migration, /alunos_emusys_atributos_divergencias/i);
  assert.match(migration, /forma_pagamento_divergente/i);
  assert.match(migration, /status_financeiro_divergente/i);
  assert.match(migration, /valor_divergente/i);
});

test('a decisão manual de forma de pagamento fica fixada contra reabertura pelo sync', () => {
  assert.match(migration, /definir_forma_pagamento_conciliacao_aluno/i);
  assert.match(migration, /matriculas_campos_fixados/i);
  assert.match(migration, /'forma_pagamento_id'/i);
});

test('a guarda de cadastro aceita foto e Instagram, mas continua fora do domínio financeiro', () => {
  assert.match(migration, /'foto_url'/i);
  assert.match(migration, /'instagram'/i);
  assert.match(migration, /foto_url\s*=\s*case/i);
  assert.match(migration, /instagram\s*=\s*case/i);
  assert.doesNotMatch(
    migration.slice(migration.indexOf('create or replace function public.aplicar_cadastro_emusys_canonico')),
    /forma_pagamento_id\s*=\s*case/i,
  );
});

test('a limpeza de reintroduções lê o patch legado e nunca deixa financeiro ou valor em Sync grade', () => {
  assert.match(migrationReintroducao, /valor_api\s*->\s*'patch'/i);
  assert.match(migrationReintroducao, /status_financeiro_divergente/i);
  assert.match(migrationReintroducao, /valor_divergente/i);
  assert.match(migrationReintroducao, /reclassificado_por_dominio_reintroducao/i);
  assert.match(migrationReintroducao, /resolvido\s*=\s*true/i);
});
