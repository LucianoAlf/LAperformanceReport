import assert from 'node:assert/strict';
import {
  filtrarAulas,
  filtroAtivo,
  normalizarBusca,
  opcoesDoCampo,
  FILTROS_AGENDA_VAZIOS,
  type AulaFiltravel,
  type FiltrosAgenda,
} from '../../src/lib/agenda';

function aula(over: Partial<AulaFiltravel> = {}): AulaFiltravel {
  return {
    professor_nome: 'Bruno Sá',
    sala_nome: 'Sala 1',
    curso_nome: 'Violão',
    turma_nome: null,
    tipo: 'individual',
    cancelada: false,
    alunos: [{ nome: 'João Pereira' }],
    ...over,
  };
}

function filtros(over: Partial<FiltrosAgenda> = {}): FiltrosAgenda {
  return { ...FILTROS_AGENDA_VAZIOS, ...over };
}

// normalizarBusca
assert.equal(normalizarBusca('  JOÃO Pereira '), 'joao pereira');
assert.equal(normalizarBusca('Violão'), 'violao');
assert.equal(normalizarBusca(''), '');

// Sem filtro devolve tudo, sem copiar objeto por engano
const todas = [aula(), aula({ professor_nome: 'Carla', alunos: [{ nome: 'Marina Alves' }] })];
assert.deepEqual(filtrarAulas(todas, filtros()), todas);
assert.equal(filtroAtivo(filtros()), false);

// Busca acha aluno por nome sem acento e ignorando caixa
assert.equal(filtrarAulas(todas, filtros({ busca: 'joao' })).length, 1);
assert.equal(filtrarAulas(todas, filtros({ busca: 'JOÃO' })).length, 1);
assert.equal(filtrarAulas(todas, filtros({ busca: 'ninguem' })).length, 0);

// Busca casa tambem professor, sala, curso e turma
assert.equal(filtrarAulas(todas, filtros({ busca: 'carla' })).length, 1);
assert.equal(filtrarAulas(todas, filtros({ busca: 'sala 1' })).length, 2);
assert.equal(filtrarAulas(todas, filtros({ busca: 'violao' })).length, 2);
assert.equal(
  filtrarAulas([aula({ turma_nome: 'G_Ter_14' })], filtros({ busca: 'g_ter' })).length,
  1,
);

// Espaco em branco puro nao e filtro
assert.equal(filtrarAulas(todas, filtros({ busca: '   ' })).length, 2);
assert.equal(filtroAtivo(filtros({ busca: '   ' })), false);

// Campos nulos nao quebram a busca
assert.equal(
  filtrarAulas(
    [aula({ professor_nome: null, sala_nome: null, curso_nome: null, alunos: [] })],
    filtros({ busca: 'x' }),
  ).length,
  0,
);

// Selects casam por igualdade exata
assert.equal(filtrarAulas(todas, filtros({ professor: 'Carla' })).length, 1);
assert.equal(filtrarAulas(todas, filtros({ curso: 'Violão' })).length, 2);
assert.equal(filtrarAulas(todas, filtros({ curso: 'Piano' })).length, 0);

// Filtros combinam por E, nao por OU
const mistas = [
  aula({ professor_nome: 'Carla', curso_nome: 'Piano' }),
  aula({ professor_nome: 'Carla', curso_nome: 'Violão' }),
];
assert.equal(filtrarAulas(mistas, filtros({ professor: 'Carla', curso: 'Piano' })).length, 1);

// Tipo de aula: individual x turma
const porTipo = [aula(), aula({ tipo: 'turma', turma_nome: 'G_Ter_14' })];
assert.equal(filtrarAulas(porTipo, filtros({ tipo: 'individual' })).length, 1);
assert.equal(filtrarAulas(porTipo, filtros({ tipo: 'turma' })).length, 1);
assert.equal(filtrarAulas(porTipo, filtros()).length, 2);
assert.equal(filtroAtivo(filtros({ tipo: 'turma' })), true);
// Tipo nulo (RPC sem contrato identificado) nao casa com nenhum dos dois
assert.equal(filtrarAulas([aula({ tipo: null })], filtros({ tipo: 'individual' })).length, 0);

// Ocultar canceladas
const comCancelada = [aula(), aula({ cancelada: true })];
assert.equal(filtrarAulas(comCancelada, filtros()).length, 2);
assert.equal(filtrarAulas(comCancelada, filtros({ ocultarCanceladas: true })).length, 1);
assert.equal(filtroAtivo(filtros({ ocultarCanceladas: true })), true);

// opcoesDoCampo: distinto, ordenado, sem nulo
const paraOpcoes = [
  aula({ curso_nome: 'Violão' }),
  aula({ curso_nome: 'Bateria' }),
  aula({ curso_nome: 'Violão' }),
  aula({ curso_nome: null }),
];
assert.deepEqual(opcoesDoCampo(paraOpcoes, 'curso_nome'), ['Bateria', 'Violão']);
assert.deepEqual(opcoesDoCampo([], 'professor_nome'), []);

// Acentuada ordena junto da equivalente sem acento (localeCompare pt-BR)
assert.deepEqual(
  opcoesDoCampo(
    [aula({ professor_nome: 'Zeca' }), aula({ professor_nome: 'Ângela' })],
    'professor_nome',
  ),
  ['Ângela', 'Zeca'],
);

console.log('agendaFiltros: OK');
