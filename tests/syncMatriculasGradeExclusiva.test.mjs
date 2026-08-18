import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arquivo = path.join(raiz, 'supabase', 'functions', 'sync-matriculas-emusys', 'index.ts');
const fonte = await readFile(arquivo, 'utf8');

test('sync usa o classificador compartilhado antes de criar auto_preview', () => {
  assert.match(fonte, /separarPatchConciliacaoMatricula/);
  assert.match(fonte, /const\s+dominiosPatch\s*=\s*separarPatchConciliacaoMatricula\(patchRevisao\)/);
  assert.match(fonte, /autoPreviewCampo\(dominiosPatch\.grade\)/);
});

test('foto, status financeiro e valores não entram na sugestão de grade', () => {
  assert.doesNotMatch(fonte, /sugerirCampoRevisao\('status_pagamento'/);
  assert.doesNotMatch(fonte, /autoPreviewCampo\(r\.upd\)/);
  assert.match(fonte, /tipo:\s*'valor_divergente'/);
});

test('foto e Instagram usam o sync cadastral canônico, sem virar pendência de grade', () => {
  const inicio = fonte.indexOf('function gerarPatchCadastroCanonicoEmusys');
  const fim = fonte.indexOf('async function aplicarPatchAtributosEmusys');
  const gerador = inicio >= 0 && fim > inicio ? fonte.slice(inicio, fim) : '';

  assert.match(gerador, /'foto_url'/);
  assert.match(gerador, /'instagram'/);
  assert.match(gerador, /instagram_nao_possui/);
});
