import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/components/App/Professores/TabCarteiraProfessores.tsx', 'utf8');

test('usa a mesma estrutura de tabela da Performance para alinhar a Carteira', () => {
  const inicioLista = source.indexOf('{/* Lista de Professores (Accordion) */}');
  const inicioPrimeiraLinha = source.indexOf('{carteirasFiltradas.map', inicioLista);
  const cabecalho = source.slice(inicioLista, inicioPrimeiraLinha);

  for (const label of ['Professor', 'Alunos', 'Trancados', 'MRR', 'Ticket', 'Média/Turma', 'Health Score']) {
    assert.match(cabecalho, new RegExp(label), `faltou a coluna ${label}`);
  }

  assert.match(cabecalho, /<table className="w-full min-w-\[1024px\]">/, 'a Carteira precisa usar tabela real, como a Performance');
  assert.match(cabecalho, /<thead className="sticky top-0 z-20 bg-slate-900\/95 backdrop-blur">/, 'o cabeçalho precisa seguir o padrão fixo da Performance');
  assert.match(cabecalho, /<th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Professor<\/th>/, 'Professor precisa ocupar a primeira coluna da tabela');
  assert.match(source, /<tbody className="divide-y divide-slate-700\/50">/, 'as linhas precisam seguir o corpo tabular da Performance');
  assert.match(source, /<td colSpan=\{8\}/, 'o detalhe expandido precisa ocupar todas as colunas sem quebrar a tabela');
});
