import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arquivo = path.join(raiz, 'src', 'components', 'App', 'Alunos', 'ConciliacaoMatriculas.tsx');
const fonte = await readFile(arquivo, 'utf8');

test('a tela só trata auto_preview como Sync grade quando o patch é exclusivamente de grade', () => {
  assert.match(fonte, /separarPatchConciliacaoMatricula/);
  assert.match(fonte, /function previewEhSomenteGrade\(item: ConciliacaoItem\): boolean/);
  assert.match(fonte, /previewEhSomenteGrade\(item\)/);
  assert.match(fonte, /const isPreviewGrade = isPreview && previewEhSomenteGrade\(item\)/);
});

test('aprovação rápida da tela exige patch exclusivo de grade', () => {
  assert.match(
    fonte,
    /if \(item\.tipo_divergencia !== 'auto_preview' \|\| !previewEhSomenteGrade\(item\) \|\| temCampoAltoRisco\(item\)\) return false;/,
  );
});
