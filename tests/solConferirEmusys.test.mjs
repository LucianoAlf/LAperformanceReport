// Trava a comparação Emusys × LA Report que a Sol usa para explicar o relatório
// mensal (vps/la-hq/sol/scripts/sol-conferir-emusys.mjs). Os casos são os reais
// de 03/10/2026 em Campo Grande, reduzidos ao que a regra lê.
import test from 'node:test';
import assert from 'node:assert/strict';
import { compararAluno, normalizarCurso, nomeDoToken } from '../vps/la-hq/sol/scripts/sol-conferir-emusys.mjs';

const HOJE = '2026-10-03';
const em = (id, curso, inicio, extra = {}) => ({
  id, status: 'ativa', data_matricula: '2024-04-05', aluno: { id: 1 },
  contrato_atual: { data_original_primeira_aula: inicio, valor_mensalidade: 447, desconto_fixo: 73,
    desconto_condicional: 0, bolsa: false, disciplinas: [{ nome: curso }] },
  ...extra,
});
const nossa = (aluno_id, curso, emusys_matricula_id, movimentacoes = [], extra = {}) => ({
  aluno_id, curso, status: 'ativo', bolsista: false, banda: false, valor_parcela: 371,
  emusys_matricula_id, movimentacoes, ...extra,
});
const ren = (id, curso, conta_no_mes, primeira, status = 'confirmada', extra = {}) => ({
  id, tipo: 'renovacao', curso, conta_no_mes, primeira_aula_novo_contrato: primeira, status, entra_no_total: true, ...extra,
});
const tipos = (r) => r.divergencias.map((d) => d.tipo).sort();

test('Gabriel: renovação lançada como Canto é do Teclado — a data da 1ª aula decide', () => {
  const lr = { matriculas: [
    nossa(10, 'Canto', '1726'),
    nossa(11, 'Teclado', '1897', [
      ren(3140, 'Canto', '2026-08', '2026-08-19', 'antecipada_pendente'),
      ren(2728, 'Canto', '2026-04', null),
    ]),
  ] };
  const r = compararAluno(lr, [em('1726', 'Canto T', '2026-04-23'), em('1897', 'Teclado T', '2026-08-19')], HOJE);
  assert.equal(r.confere.length, 2, 'as duas renovações são reais');
  assert.deepEqual(tipos(r), ['curso_diverge']);
  assert.match(r.confere.find((c) => c.curso === 'Teclado T').explicacao, /PENDENTE/);
});

test('Marcello: contrato novo em julho, renovação pendente contando em agosto', () => {
  const lr = { matriculas: [nossa(276, 'Teclado', '1323', [ren(3142, 'Teclado', '2026-08', '2026-08-26', 'antecipada_pendente')])] };
  const r = compararAluno(lr, [em('1323', 'Teclado T', '2026-07-22')], HOJE);
  assert.deepEqual(tipos(r), ['mes_diverge']);
  assert.match(r.divergencias[0].explicacao, /07\/2026.*08\/2026/);
});

test('Elisa: contrato novo em 01/10 e renovação em outubro — bate', () => {
  const lr = { matriculas: [nossa(5, 'Canto', '900', [ren(3631, 'Canto', '2026-10', '2026-10-01', 'antecipada_confirmada')])] };
  const r = compararAluno(lr, [em('900', 'Canto T', '2026-10-01')], HOJE);
  assert.equal(r.divergencias.length, 0);
  assert.equal(r.confere.length, 1);
});

test('contrato novo no Emusys sem renovação no LA Report', () => {
  const lr = { matriculas: [nossa(5, 'Piano', '901')] };
  const r = compararAluno(lr, [em('901', 'Piano T', '2026-09-10')], HOJE);
  assert.deepEqual(tipos(r), ['renovacao_ausente']);
});

test('renovação no LA Report sem contrato novo no Emusys', () => {
  const lr = { matriculas: [nossa(5, 'Piano', '901', [ren(1, 'Piano', '2026-09', null)])] };
  // Contrato atual de 2023 (fora da janela): só a renovação sobra, sem par.
  const r = compararAluno(lr, [em('901', 'Piano T', '2023-04-10')], HOJE);
  assert.deepEqual(tipos(r), ['renovacao_sem_contrato']);
  assert.match(r.divergencias[0].explicacao, /10\/04\/2023/);
});

test('contrato que começou no mês da matrícula não é renovação (qtd_contratos não é usado)', () => {
  const lr = { matriculas: [nossa(5, 'Canto', '902')] };
  const r = compararAluno(lr, [em('902', 'Canto T', '2026-09-03', { data_matricula: '2026-09-01', qtd_contratos: 3 })], HOJE);
  assert.equal(r.divergencias.length, 0);
});

test('renovação antiga (fora dos 6 meses) não vira ruído', () => {
  const lr = { matriculas: [nossa(5, 'Guitarra', '903', [ren(1, 'Guitarra', '2026-02', null)])] };
  const r = compararAluno(lr, [em('903', 'Guitarra T', '2026-03-03')], HOJE);
  assert.equal(r.divergencias.length, 0);
});

test('líquida negativa NÃO é bolsa; parcela zero de aluno regular é sinalizada', () => {
  const neg = em('904', 'Canto T', '2026-04-23');
  neg.contrato_atual.desconto_condicional = 414; // 447 − 73 − 414 = −40, inconsistência da API
  const r1 = compararAluno({ matriculas: [nossa(5, 'Canto', '904', [], { valor_parcela: 33 })] }, [neg], HOJE);
  assert.ok(!tipos(r1).includes('bolsista_diverge'));
  const r2 = compararAluno({ matriculas: [nossa(6, 'Bateria', '905', [], { valor_parcela: 0 })] }, [em('905', 'Bateria T', '2025-08-20')], HOJE);
  assert.deepEqual(tipos(r2), ['bolsista_diverge']);
});

test('situação: inativa no Emusys e ativa no LA Report', () => {
  const r = compararAluno({ matriculas: [nossa(5, 'Canto', '906')] },
    [em('906', 'Canto T', '2025-01-10', { status: 'inativa', motivo_inativa: 'concluida' })], HOJE);
  assert.deepEqual(tipos(r), ['status_diverge']);
  assert.match(r.divergencias[0].explicacao, /concluído/);
});

test('banda continua avisando que não entra no total', () => {
  const lr = { matriculas: [nossa(5, 'Minha Banda Para Sempre', '907',
    [ren(1, 'Minha Banda Para Sempre', '2026-09', null, 'confirmada', { entra_no_total: false })], { banda: true })] };
  const r = compararAluno(lr, [em('907', 'Minha Banda Para Sempre T ', '2026-05-18', { data_matricula: '2026-05-18' })], HOJE);
  assert.deepEqual(tipos(r), ['renovacao_sem_contrato']);
  assert.match(r.divergencias[0].explicacao, /não entra no total/);
});

test('apoio: curso normalizado e token por código de unidade', () => {
  assert.equal(normalizarCurso('Canto T'), normalizarCurso('Canto'));
  assert.equal(normalizarCurso('Violão IND'), 'violao ind');
  assert.equal(nomeDoToken('REC'), 'EMUSYS_TOKEN_RECREIO');
  assert.equal(nomeDoToken('CG'), 'EMUSYS_TOKEN_CG');
  assert.equal(nomeDoToken('XX'), null);
});
