import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resultSource = fs.readFileSync(path.join(root, 'public', 'ficha-tecnica', 'index.html'), 'utf8');
const perfilSource = fs.readFileSync(path.join(root, 'src', 'data', 'perfilTextos.ts'), 'utf8');
const timeSource = fs.readFileSync(path.join(root, 'src', 'components', 'App', 'Time', 'FichaColaborador.tsx'), 'utf8');

test('resultado anuncia a etapa no eyebrow antes da frase do codinome', () => {
  assert.match(
    resultSource,
    /<p class="eyebrow result-eyebrow">[\s\S]*?Seu perfil LA[\s\S]*?Parte 1 de 2[\s\S]*?<\/p>/,
  );
  assert.equal(resultSource.includes('id="resultProgress"'), false);
  assert.ok(resultSource.indexOf('result-eyebrow') < resultSource.indexOf('id="resultHello"'));
  assert.ok(resultSource.indexOf('id="resultHello"') < resultSource.indexOf('id="resultCodename"'));
});

test('resultado orienta explicitamente para a última parte', () => {
  assert.match(resultSource, /class="btn btn-primary"[^>]*id="btnRider"/);
  assert.match(resultSource, />Falta a última parte →<\/button>/);
  assert.match(resultSource, /São mais 5 minutos\. É a parte que mais ajuda a gente a te conhecer\./);
});

test('subtítulo usa o artista secundário, não a palavra do chip', () => {
  assert.match(resultSource, /resultSubline[\s\S]*?com tempero.*s\.artista/);
});

test('textos derivados do perfil não usam pronomes de gênero fixos', () => {
  assert.doesNotMatch(perfilSource, /\b(?:ela|dela|nela|ele|dele|nele)\b/i);
  assert.match(perfilSource, /Não se desestabiliza fácil/);
  assert.match(perfilSource, /combine o prazo junto/);
  assert.match(perfilSource, /Reconhecimento funciona por/);
  assert.match(perfilSource, /não entrega abaixo do padrão que se cobra/);
});

test('bloco de valores também usa título neutro', () => {
  assert.match(timeSource, /O que prioriza/);
  assert.doesNotMatch(timeSource, /O que ela prioriza/i);
});

test('briefing usa apelido ou primeiro nome, sem alterar o nome completo do topo', () => {
  assert.match(timeSource, /const nome = ficha\.apelido \|\| ficha\.nome/);
  assert.match(timeSource, /const nomeCurto = ficha\.apelido\?\.trim\(\) \|\| ficha\.nome\.trim\(\)/);
  assert.ok(timeSource.includes('ficha.nome.trim().split(/\\s+/)[0]'));
  assert.match(timeSource, /<Briefing[\s\S]*?nome=\{nomeCurto\}/);
});

test('régua mantém todos os perfis na legenda mesmo quando a contagem é zero', () => {
  assert.match(timeSource, /Object\.keys\(PERFIL_NOMES\)/);
  assert.match(timeSource, /contagem\[key\] \?\? 0/);
  assert.match(timeSource, /entradasLegenda\.map/);
  assert.match(timeSource, /const entradasBarra = entradasLegenda\.filter\(\(\[, valor\]\) => valor > 0\)/);
  assert.doesNotMatch(timeSource, /const entries = Object\.entries\(contagem\)\.filter\(\(\[, v\]\) => v > 0\)/);
});

test('subtítulo da ficha Time preserva a capitalização do artista secundário', () => {
  assert.doesNotMatch(perfilSource, /subtitulo: \(s\) => `[^`]*\$\{s\.toLowerCase\(\)\}`/);
  assert.match(perfilSource, /subtitulo: \(s\) => `Estabilidade com tempero de \$\{s\}`/);
});
