// LAPE-19 — ficha e Lista de Alunos leem a anamnese da PESSOA.
// Plano: docs/superpowers/plans/2026-09-01-anamnese-por-pessoa.md (Task 5)
//
//   node --test tests/anamnesePessoaFrontend.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ficha = readFileSync(
  new URL('../src/components/App/Alunos/ModalFichaAluno.tsx', import.meta.url), 'utf8');
const lista = readFileSync(
  new URL('../src/components/App/Alunos/AlunosPage.tsx', import.meta.url), 'utf8');

test('a ficha le pela RPC unica, nao mais por aluno_id direto', () => {
  assert.match(ficha, /rpc\('get_anamnese_aluno'/);
  // o padrao antigo (.from('anamneses')...eq('aluno_id')) nao pode sobrar em
  // lugar nenhum: era ele que mostrava "Anamnese nao preenchida" no 2o curso
  assert.doesNotMatch(ficha, /from\('anamneses'\)[\s\S]{0,240}eq\('aluno_id'/);
});

test('a ficha mostra a procedencia quando a anamnese veio de outra matricula', () => {
  assert.match(ficha, /anamneseProcedencia/);
  assert.match(ficha, /e_esta_matricula/);
});

test('o texto de WhatsApp carrega a procedencia junto com a data', () => {
  const inicio = ficha.indexOf('function montarTextoAnamnese');
  assert.ok(inicio > -1, 'montarTextoAnamnese deve existir');
  assert.match(ficha.slice(inicio, inicio + 2500), /anamneseProcedencia/);
});

test('a ficha indica que existe anamnese anterior, para nao parecer que sumiu', () => {
  assert.match(ficha, /anamneseAnteriores/);
});

test('o filtro de diagnostico da Lista tambem enxerga por pessoa', () => {
  // AlunosPage lia anamneses por aluno_id -- quarto consumidor, achado depois
  // que o spec ja estava escrito.
  const inicio = lista.indexOf("from('anamneses')");
  assert.ok(inicio > -1, 'AlunosPage deve continuar consultando anamneses');
  assert.match(lista.slice(inicio, inicio + 400), /pessoa_chave/);
});

test('a Lista resolve a chave da pessoa pela view canonica, nao remonta a regra', () => {
  assert.match(lista, /from\('vw_aluno_pessoa_chave'\)/);
  assert.doesNotMatch(lista, /'emusys:'\s*\+/);
});
