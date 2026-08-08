import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/components/App/Professores/TabCarteiraProfessores.tsx', 'utf8');

test('exibe cabeçalho das métricas da lista de Carteira', () => {
  const inicioLista = source.indexOf('{/* Lista de Professores (Accordion) */}');
  const inicioPrimeiraLinha = source.indexOf('{carteirasFiltradas.map', inicioLista);
  const cabecalho = source.slice(inicioLista, inicioPrimeiraLinha);

  for (const label of ['Professor', 'Alunos', 'Trancados', 'MRR', 'Ticket', 'Média/Turma', 'Health Score']) {
    assert.match(cabecalho, new RegExp(label), `faltou a coluna ${label}`);
  }

  assert.match(cabecalho, /bg-slate-950\/60/, 'o cabeçalho precisa estar integrado ao reader');
  assert.match(cabecalho, /border-b/, 'o cabeçalho precisa separar a régua da lista');
});
