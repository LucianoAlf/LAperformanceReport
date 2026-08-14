import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const alunosPage = readFileSync('src/components/App/Alunos/AlunosPage.tsx', 'utf8');
const tabelaAlunos = readFileSync('src/components/App/Alunos/TabelaAlunos.tsx', 'utf8');

test('a carteira de alunos nao usa a competencia mensal como escopo de data da lista', () => {
  assert.doesNotMatch(alunosPage, /\.gte\(['"]data_matricula['"],\s*competenciaRange\.startDate\)/u);
  assert.doesNotMatch(alunosPage, /\.lte\(['"]data_matricula['"],\s*competenciaRange\.endDate\)/u);
});

test('a busca de alunos volta para a primeira pagina quando a fonte ou os filtros mudam', () => {
  assert.match(
    tabelaAlunos,
    /useEffect\(\(\)\s*=>\s*\{\s*setPaginaAtual\(1\);\s*\},\s*\[filtros,\s*alunosProp\]\);/su,
  );
});
