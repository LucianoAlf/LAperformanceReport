import assert from 'node:assert/strict';
import {
  agregarDivergencia,
  ehTemaValido,
  nivelDeConfianca,
  respostaConfirmaMotivo,
  resumirRespostas,
  rotuloTema,
  separarBlocosResposta,
  temaDoMotivoRegistrado,
  type RespostaEvasao,
} from '../../src/lib/pesquisaEvasao';

let seq = 0;
function r(motivo: string | null, tema: string | null): RespostaEvasao {
  return { pesquisa_id: `p${++seq}`, motivo_cadastrado: motivo, categoria_resposta: tema };
}

// ------------------------------------------------------- tema x motivo
assert.equal(temaDoMotivoRegistrado('Falta de tempo'), 'horario');
assert.equal(temaDoMotivoRegistrado('FALTA DE TEMPO'), 'horario');
assert.equal(temaDoMotivoRegistrado('  Dificuldade financeira  '), 'financeiro');
assert.equal(temaDoMotivoRegistrado('Inadimplência'), 'financeiro');
// Saúde tem categoria NULL no catalogo — por isso o mapa e por NOME, nao por categoria
assert.equal(temaDoMotivoRegistrado('Saúde'), 'saude');
assert.equal(temaDoMotivoRegistrado('Problema de Saúde'), 'saude');
// Insatisfação/Desânimo estao em categoria 'outro' no catalogo, mas sao professor
assert.equal(temaDoMotivoRegistrado('Insatisfação'), 'professor_metodo');
assert.equal(temaDoMotivoRegistrado('Desânimo'), 'professor_metodo');
assert.equal(temaDoMotivoRegistrado('Desistência'), 'sem_motivo_claro');
// Motivo fora do catalogo nao vira palpite
assert.equal(temaDoMotivoRegistrado('Motivo inventado'), null);
assert.equal(temaDoMotivoRegistrado(null), null);
assert.equal(temaDoMotivoRegistrado(''), null);

assert.equal(ehTemaValido('professor_metodo'), true);
assert.equal(ehTemaValido('inventado'), false);
assert.equal(ehTemaValido(null), false);
assert.equal(rotuloTema('professor_metodo'), 'Professor / método');
assert.equal(rotuloTema('desconhecido'), 'desconhecido');

// ------------------------------------------------------- confirma?
assert.equal(respostaConfirmaMotivo(r('Falta de tempo', 'horario')), true);
assert.equal(respostaConfirmaMotivo(r('Falta de tempo', 'professor_metodo')), false);
// Motivos diferentes que traduzem para o mesmo tema confirmam
assert.equal(respostaConfirmaMotivo(r('Inadimplência', 'financeiro')), true);
// Sem tema marcado NAO e divergencia — e "ainda nao sei"
assert.equal(respostaConfirmaMotivo(r('Falta de tempo', null)), null);
// Motivo fora do catalogo tambem nao da para comparar
assert.equal(respostaConfirmaMotivo(r('Motivo inventado', 'horario')), null);

// ------------------------------------------------------- resumo
const amostra = [
  r('Falta de tempo', 'horario'),          // confirma
  r('Falta de tempo', 'professor_metodo'), // diverge + cita professor nao registrado
  r('Falta de tempo', 'financeiro'),       // diverge
  r('Dificuldade financeira', 'financeiro'), // confirma
  r('Insatisfação', 'professor_metodo'),   // confirma + cita professor JA registrado
  r('Saúde', null),                        // nao classificada
  r('Motivo inventado', 'outro'),          // classificada, nao comparavel
];
const resumo = resumirRespostas(amostra);
assert.equal(resumo.total, 7);
assert.equal(resumo.classificadas, 6);
assert.equal(resumo.comparaveis, 5);
assert.equal(resumo.confirmadas, 3);
assert.equal(resumo.divergentes, 2);
assert.equal(resumo.percentualConfirmado, 60);
assert.equal(resumo.citamProfessor, 2);
// Só a que NAO estava registrada como insatisfacao/desanimo conta como achado
assert.equal(resumo.citamProfessorNaoRegistrado, 1);

// Denominador e `comparaveis`: nao classificada nao pode contar como "nao confirmou"
const soPendentes = resumirRespostas([r('Falta de tempo', null), r('Saúde', null)]);
assert.equal(soPendentes.percentualConfirmado, null);
assert.equal(soPendentes.classificadas, 0);
assert.deepEqual(resumirRespostas([]).percentualConfirmado, null);
assert.equal(resumirRespostas([]).total, 0);

// ------------------------------------------------------- confianca
assert.equal(nivelDeConfianca(0), 'insuficiente');
assert.equal(nivelDeConfianca(4), 'insuficiente');
assert.equal(nivelDeConfianca(5), 'indicativo');
assert.equal(nivelDeConfianca(29), 'indicativo');
assert.equal(nivelDeConfianca(30), 'estavel');

// ------------------------------------------------------- divergencia
const linhas = agregarDivergencia(amostra);
// Ordenado por total desc; "Motivo inventado" fica de fora (sem traducao)
assert.deepEqual(linhas.map((l) => l.motivo), [
  'Falta de tempo',
  'Dificuldade financeira',
  'Insatisfação',
]);
const tempo = linhas[0];
assert.equal(tempo.total, 3);
// Quem confirma vem primeiro, independente da frequencia
assert.equal(tempo.temas[0].tema, 'horario');
assert.equal(tempo.temas[0].confirma, true);
assert.equal(tempo.temas[0].qtd, 1);
assert.equal(tempo.temas.filter((t) => !t.confirma).length, 2);
assert.equal(agregarDivergencia([]).length, 0);
// Só respostas sem tema nao geram linha nenhuma
assert.equal(agregarDivergencia([r('Falta de tempo', null)]).length, 0);

// ------------------------------------------------------- blocos do texto
const bruto = '[2026-08-03T14:41:28.000Z | texto]\nNão mudaria nada eu amo esse lugar aí\n\n[2026-08-03T14:45:02.000Z | audio]\nfoi ótimo';
const blocos = separarBlocosResposta(bruto);
assert.equal(blocos.length, 2);
assert.deepEqual(blocos[0], {
  quando: '2026-08-03T14:41:28.000Z',
  tipo: 'texto',
  texto: 'Não mudaria nada eu amo esse lugar aí',
});
assert.equal(blocos[1].tipo, 'audio');
assert.equal(blocos[1].texto, 'foi ótimo');

// Texto consolidado da revisao nao tem marcador: vira um bloco sem metadados
assert.deepEqual(separarBlocosResposta('Saiu porque mudou de cidade.'), [
  { quando: null, tipo: null, texto: 'Saiu porque mudou de cidade.' },
]);
assert.deepEqual(separarBlocosResposta(''), []);
assert.deepEqual(separarBlocosResposta('   '), []);
assert.deepEqual(separarBlocosResposta(null), []);
// Marcador sem conteudo depois nao cria bloco vazio
assert.deepEqual(separarBlocosResposta('[2026-08-03T14:41:28.000Z | texto]\n'), []);

console.log('pesquisaEvasao: OK');
