import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ler = (p) => readFileSync(p, 'utf8');
const itens = ler('src/lib/menuItems.tsx');
const sidebar = ler('src/components/App/Layout/AppSidebar.tsx');

const PATHS_ESPERADOS = [
  '/app', '/app/gestao-mensal', '/app/metas', '/app/config',
  '/app/pre-atendimento', '/app/campanhas', '/app/trafego-pago', '/app/comercial',
  '/app/agenda', '/app/administrativo', '/app/alunos', '/app/bandas',
  '/app/eventos',
  '/app/faturas', '/app/sucesso-aluno', '/app/professores', '/app/time',
  '/app/salas', '/app/projetos',
];

test('menuItems concentra os 19 modulos do menu', () => {
  for (const p of PATHS_ESPERADOS) {
    assert.match(itens, new RegExp(`path: '${p.replace(/\//gu, '\\/')}'`, 'u'), `falta ${p}`);
  }
});

test('itens sensiveis declaram a regra de visibilidade', () => {
  assert.match(itens, /path: '\/app\/campanhas'[\s\S]{0,220}?visibilidade: 'campanhas'/u);
  assert.match(itens, /path: '\/app\/trafego-pago'[\s\S]{0,220}?visibilidade: 'trafego_pago'/u);
  assert.match(itens, /path: '\/app\/eventos'[\s\S]{0,220}?visibilidade: 'eventos'/u);
});

test('a barra inferior aprovada: Inicio, Alunos, Agenda, Administrativo', () => {
  assert.match(
    itens,
    /ROTAS_BARRA_INFERIOR[\s\S]{0,200}'\/app'[\s\S]{0,80}'\/app\/alunos'[\s\S]{0,80}'\/app\/agenda'[\s\S]{0,80}'\/app\/administrativo'/u,
  );
});

test('AppSidebar LE a fonte unica em vez de declarar a propria lista', () => {
  assert.match(sidebar, /from '@\/lib\/menuItems'/u, 'sidebar precisa importar a fonte unica');
  // As constantes locais tem que ter sumido, senao voltamos a ter duas verdades.
  assert.doesNotMatch(sidebar, /^const menuItems = \[/mu);
  assert.doesNotMatch(sidebar, /^const operacional = \[/mu);
});

test('o render da sidebar continua resolvendo o icone como componente', () => {
  // Guarda de nao-regressao: se isto sumir, o icone virou string e o desktop quebrou.
  assert.match(sidebar, /const Icon = item\.icon/u);
});
