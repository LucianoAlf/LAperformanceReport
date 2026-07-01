import assert from 'node:assert/strict';
import { isMatriculaBandaAtivaOperacional } from '../../src/lib/alunosFiltrosCanonicos';

const cursosBandaIds = [10, 20];

assert.equal(
  isMatriculaBandaAtivaOperacional({ curso_id: 10, status: 'ativo' }, cursosBandaIds),
  true,
  'curso flagado como banda e ativo deve contar',
);

assert.equal(
  isMatriculaBandaAtivaOperacional({ curso_id: 10, status: 'inativo' }, cursosBandaIds),
  false,
  'banda inativa/historica nao deve aparecer como ativa',
);

assert.equal(
  isMatriculaBandaAtivaOperacional({ curso_id: 10, status: 'evadido' }, cursosBandaIds),
  false,
  'banda evadida nao deve aparecer como ativa',
);

assert.equal(
  isMatriculaBandaAtivaOperacional({ curso_id: 10, status: 'trancado' }, cursosBandaIds),
  false,
  'banda trancada nao deve aparecer como ativa',
);

assert.equal(
  isMatriculaBandaAtivaOperacional({ curso_id: 99, status: 'ativo', tipo_matricula_codigo: 'BANDA' }, cursosBandaIds),
  true,
  'tipo BANDA ativo deve contar mesmo se o curso ainda nao estiver flagado',
);

assert.equal(
  isMatriculaBandaAtivaOperacional({ curso_id: 99, status: 'ativo', tipo_matricula_id: 5 }, cursosBandaIds),
  true,
  'tipo_matricula_id 5 ativo deve contar como banda',
);

assert.equal(
  isMatriculaBandaAtivaOperacional({ curso_id: 99, status: 'ativo', tipo_matricula_codigo: 'REGULAR' }, cursosBandaIds),
  false,
  'matricula regular sem curso de banda nao deve contar',
);

console.log('alunos filtro banda canonico: OK');
