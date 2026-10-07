// Elegibilidade do aluno para o recital — LAPE-39, fase 2.
//
// Os tres casos-limite nao sao hipotese: sao as 3 pessoas (de 1.001 ativas nas 3 unidades)
// que em 18/09/2026 nao tinham curso para apresentar. Duas sao a REGRA (banda e Power Kids
// nao sobem no recital) e uma e DEFEITO (curso_id nulo no cadastro da Barra, num aluno que
// o proprio CSV do Arthur lista com curso). Tratar as duas situacoes igual faz a
// coordenacao aceitar como regra da casa um erro que ela poderia mandar corrigir.
//
// Roda a funcao REAL (transpilada por esbuild), nunca uma copia da regra no teste.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const lib = await (async () => {
  const { code } = await esbuild.transform(readFileSync('src/lib/eventos.ts', 'utf8'), {
    loader: 'ts',
    format: 'esm',
  });
  const arquivo = path.join(mkdtempSync(path.join(tmpdir(), 'evt-eleg-')), 'eventos.mjs');
  writeFileSync(arquivo, code);
  return import(pathToFileURL(arquivo).href);
})();

const { avaliarElegibilidade, resumirParticipacao, resumirAlocacao } = lib;

test('quem tem curso no recital e apto e NAO recebe aviso', () => {
  // 998 das 1.001 pessoas caem aqui: o caso normal nao pode carregar ruido visual.
  const r = avaliarElegibilidade({
    nome: 'Alana Vasconcelos de Araujo',
    cursos_no_recital: 1,
    faz_banda: false,
    motivo_sem_curso: null,
  });
  assert.equal(r.situacao, 'apto');
  assert.equal(r.aviso, null);
  assert.equal(r.podeParticipar, true);
});

test('quem faz banda E curso regular continua apto — banda filtra CURSO, nunca pessoa', () => {
  // Medido na Barra: as 13 pessoas com matricula de banda tambem tem curso regular.
  const r = avaliarElegibilidade({
    nome: 'Pérola Madeira Maturano',
    cursos_no_recital: 2,
    faz_banda: true,
    motivo_sem_curso: null,
  });
  assert.equal(r.situacao, 'apto');
  assert.equal(r.podeParticipar, true);
});

test('so atividade extra: a REGRA, entao o aviso explica e nao acusa ninguem', () => {
  // Maria Eduarda de Lima Bomfim Pedro (CG) — so "Minha Banda Para Sempre".
  const r = avaliarElegibilidade({
    nome: 'Maria Eduarda de Lima Bomfim Pedro',
    cursos_no_recital: 0,
    faz_banda: true,
    motivo_sem_curso: 'so_atividade_extra',
  });
  assert.equal(r.situacao, 'sem_curso_regular');
  assert.ok(r.aviso, 'o motivo tem de estar escrito na tela, nao deduzido do "0"');
});

test('cadastro incompleto: DEFEITO, e a tela precisa dizer que ha o que corrigir', () => {
  // Manuela Isolani Tavares Estanho (Barra) — curso_id nulo, mas o Emusys sabe o curso.
  const r = avaliarElegibilidade({
    nome: 'Manuela Isolani Tavares Estanho Flávio',
    cursos_no_recital: 0,
    faz_banda: false,
    motivo_sem_curso: 'curso_nao_cadastrado',
  });
  assert.equal(r.situacao, 'cadastro_incompleto');
  assert.ok(r.aviso, 'sem aviso, um defeito corrigivel some dentro de um "0 apresentacoes"');
});

test('os dois casos sem curso NAO dizem a mesma coisa', () => {
  const extra = avaliarElegibilidade({
    nome: 'x', cursos_no_recital: 0, faz_banda: true, motivo_sem_curso: 'so_atividade_extra',
  });
  const defeito = avaliarElegibilidade({
    nome: 'y', cursos_no_recital: 0, faz_banda: false, motivo_sem_curso: 'curso_nao_cadastrado',
  });
  assert.notEqual(extra.situacao, defeito.situacao);
  assert.notEqual(extra.aviso, defeito.aviso);
});

/* ─────────────────────────── alocacao na grade ─────────────────────────── */

test('grade vazia: UM selo "nao alocado", nunca um por curso', () => {
  // Estado de 100% da lista no dia em que o evento nasce. Repetir o aviso em cada curso
  // de cada linha nao acrescenta informacao nenhuma.
  const r = resumirAlocacao(2, 0);
  assert.equal(r.situacao, 'nenhuma');
  assert.equal(r.rotulo, 'não alocado');
  assert.equal(r.detalharPorCurso, false);
});

test('ALOCACAO PARCIAL e o caso que o prototipo perde', () => {
  // Maria Fernanda faz Violao E Canto. Alocada so no Violao, o booleano do prototipo
  // diria "Bloco 1 (Violao)" e o Canto sumiria — sem aviso de que falta.
  const r = resumirAlocacao(2, 1);
  assert.equal(r.situacao, 'parcial');
  assert.match(r.rotulo, /1 de 2/u);
  assert.equal(r.detalharPorCurso, true, 'sem o detalhe por curso nao da para ver QUAL falta');
});

test('curso unico alocado nao vira contador — diz so que esta na grade', () => {
  const r = resumirAlocacao(1, 1);
  assert.equal(r.situacao, 'completa');
  assert.equal(r.detalharPorCurso, false, '"1 de 1" e ruido quando so existe um curso');
});

test('todos os cursos alocados, com 2+: mantem o detalhe para conferencia', () => {
  const r = resumirAlocacao(3, 3);
  assert.equal(r.situacao, 'completa');
  assert.match(r.rotulo, /3 de 3/u);
  assert.equal(r.detalharPorCurso, true);
});

test('quem nao tem curso NAO esta "faltando ser alocado"', () => {
  // Os 3 casos reais (2 so de banda em CG, 1 de cadastro nulo na Barra). Dizer
  // "nao alocado" aqui inventaria uma pendencia que ninguem consegue resolver.
  const r = resumirAlocacao(0, 0);
  assert.equal(r.situacao, 'nao_se_aplica');
  assert.equal(r.rotulo, null);
});

test('resumirParticipacao conta apresentacao por CURSO de quem participa', () => {
  // A regra do Hugo: 2 cursos diferentes = 2 apresentacoes; 2 matriculas do mesmo
  // curso = 1 (isso ja vem colapsado da view, por pessoa).
  const r = resumirParticipacao([
    { status: 'participa', cursos_no_recital: 2, cursos_alocados: 1 },
    { status: 'participa', cursos_no_recital: 1, cursos_alocados: 0 },
    { status: 'indefinido', cursos_no_recital: 3, cursos_alocados: 0 },
    { status: 'nao', cursos_no_recital: 1, cursos_alocados: 1 },
  ]);
  assert.equal(r.total, 4);
  assert.equal(r.participam, 2);
  assert.equal(r.indefinidos, 1);
  assert.equal(r.naoParticipam, 1);
  // 3, nao 6: quem esta indefinido ainda nao conta na grade.
  assert.equal(r.apresentacoesPrevistas, 3);
  // 2, contando a do "nao": apresentacao montada para quem desistiu e pendencia REAL da
  // grade, e sumiria da conta justamente na hora em que alguem precisa remove-la.
  assert.equal(r.apresentacoesAlocadas, 2);
  // So o segundo: o primeiro ja tem 1 dos 2 cursos na grade.
  assert.equal(r.participamSemAlocacao, 1);
});

test('resumirParticipacao aguenta a forma antiga, sem cursos_alocados', () => {
  // A leitura pode chegar antes da grade existir; `undefined` nao pode virar NaN e
  // contaminar o KPI inteiro.
  const r = resumirParticipacao([{ status: 'participa', cursos_no_recital: 2 }]);
  assert.equal(r.apresentacoesAlocadas, 0);
  assert.equal(r.participamSemAlocacao, 1);
});
