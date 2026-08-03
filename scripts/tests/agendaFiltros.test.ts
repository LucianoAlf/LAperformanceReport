import assert from 'node:assert/strict';
import {
  contarFiltrosAvancados,
  filtrarAulas,
  filtroAtivo,
  normalizarBusca,
  opcoesDeCategoria,
  opcoesDoCampo,
  rotuloCategoria,
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
    tipo: 'turma',
    categoria: 'normal',
    cancelada: false,
    qtd_alunos: 1,
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

// Lotacao: quem esta sozinho no horario x quem tem turma junto.
// ⚠️ NAO e modalidade — a modalidade contratada e 'turma' em 164 das 165 aulas.
const porLotacao = [aula({ qtd_alunos: 1 }), aula({ qtd_alunos: 4, turma_nome: 'G_Ter_14' })];
assert.equal(filtrarAulas(porLotacao, filtros({ lotacao: 'sozinho' })).length, 1);
assert.equal(filtrarAulas(porLotacao, filtros({ lotacao: 'turma' })).length, 1);
assert.equal(filtrarAulas(porLotacao, filtros()).length, 2);
assert.equal(filtroAtivo(filtros({ lotacao: 'turma' })), true);
// Aula SEM aluno vinculado nao e "sozinho" — e vinculo faltando, outro problema
assert.equal(filtrarAulas([aula({ qtd_alunos: 0 })], filtros({ lotacao: 'sozinho' })).length, 0);
assert.equal(filtrarAulas([aula({ qtd_alunos: 0 })], filtros({ lotacao: 'turma' })).length, 0);
// Modalidade continua no dado (vai para o painel de detalhe), so nao filtra
assert.equal(aula().tipo, 'turma');

// Categoria (experimental, extra...)
const porCategoria = [aula(), aula({ categoria: 'experimental' }), aula({ categoria: 'extra' })];
assert.equal(filtrarAulas(porCategoria, filtros({ categoria: 'experimental' })).length, 1);
assert.equal(filtrarAulas(porCategoria, filtros({ categoria: 'normal' })).length, 1);
assert.equal(filtrarAulas(porCategoria, filtros()).length, 3);
assert.equal(filtroAtivo(filtros({ categoria: 'experimental' })), true);
assert.deepEqual(opcoesDoCampo(porCategoria, 'categoria'), ['experimental', 'extra', 'normal']);
// Categoria desconhecida cai no valor cru em vez de sumir do filtro
assert.equal(rotuloCategoria('experimental'), 'Experimental');
assert.equal(rotuloCategoria('categoria_nova_do_emusys'), 'categoria_nova_do_emusys');

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

// contarFiltrosAvancados: so o que fica ESCONDIDO no popover
assert.equal(contarFiltrosAvancados(filtros()), 0);
// A busca e visivel na barra — nao entra na conta do badge
assert.equal(contarFiltrosAvancados(filtros({ busca: 'joao' })), 0);
assert.equal(contarFiltrosAvancados(filtros({ curso: 'Piano' })), 1);
assert.equal(contarFiltrosAvancados(filtros({ ocultarCanceladas: true })), 1);
assert.equal(
  contarFiltrosAvancados(
    filtros({ curso: 'Piano', professor: 'Carla', turma: 'G_Ter_14', lotacao: 'turma', categoria: 'normal', ocultarCanceladas: true }),
  ),
  6,
);

// opcoesDeCategoria: conjunto FECHADO, lista tudo com contagem — inclusive zero.
// Caso real (03/08/2026): Campo Grande sem nenhuma experimental fazia a opcao
// sumir, e nao havia como saber se o filtro quebrou ou se nao havia aula.
const soNormais = opcoesDeCategoria([{ categoria: 'normal' }, { categoria: 'normal' }]);
assert.deepEqual(
  soNormais.map((o) => `${o.valor}:${o.qtd}`),
  ['normal:2', 'experimental:0', 'extra:0', 'reposicao:0', 'avulsa:0'],
);
assert.equal(soNormais[1].rotulo, 'Experimental');
// Ordem e fixa (nao alfabetica nem por contagem), para o select nao dancar
assert.deepEqual(
  opcoesDeCategoria([{ categoria: 'extra' }, { categoria: 'extra' }, { categoria: 'experimental' }])
    .map((o) => o.valor),
  ['normal', 'experimental', 'extra', 'reposicao', 'avulsa'],
);
// Dia vazio ainda oferece as 5 conhecidas, todas zeradas
assert.equal(opcoesDeCategoria([]).length, 5);
assert.equal(opcoesDeCategoria([]).every((o) => o.qtd === 0), true);
// Categoria nova do Emusys entra no FIM em vez de sumir
const comNova = opcoesDeCategoria([{ categoria: 'ensaio_geral' }, { categoria: null }]);
assert.equal(comNova.length, 6);
assert.deepEqual(comNova[5], { valor: 'ensaio_geral', rotulo: 'ensaio_geral', qtd: 1 });

console.log('agendaFiltros: OK');
