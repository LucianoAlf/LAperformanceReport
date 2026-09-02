import assert from 'node:assert/strict';
import test from 'node:test';
import { DOMINIOS, classificarDominio } from '../scripts/mapa-banco/dominios.mjs';

test('os oito dominios da spec estao declarados', () => {
  assert.deepEqual(DOMINIOS, [
    'aluno', 'comercial', 'professor', 'financeiro',
    'gestao', 'operacao', 'plataforma', 'integracao',
  ]);
});

test('classifica por prefixo', () => {
  assert.equal(classificarDominio('pesquisa_evasao_previews'), 'aluno');
  assert.equal(classificarDominio('leads_campanhas'), 'comercial');
  assert.equal(classificarDominio('fabio_registros_aula'), 'professor');
  assert.equal(classificarDominio('sol_caixa_lotes_v1'), 'financeiro');
  assert.equal(classificarDominio('loja_produtos'), 'operacao');
});

test('excecao nominal vence o prefixo', () => {
  // 'professores_experimentais' comeca com prefixo de professor mas e materia comercial
  assert.equal(classificarDominio('professores_experimentais'), 'comercial');
});

test('prefixo mais longo vence o mais curto', () => {
  assert.equal(classificarDominio('alunos'), 'aluno');
  assert.equal(classificarDominio('alunos_emusys_atributos_divergencias'), 'integracao');
});

test('objeto sem regra cai em outros', () => {
  assert.equal(classificarDominio('tabela_que_ninguem_mapeou'), 'outros');
});

test('view herda a regra da tabela (prefixo vw_ e ignorado)', () => {
  assert.equal(classificarDominio('vw_contratos_vencendo'), 'financeiro');
  assert.equal(classificarDominio('vw_jornada_aluno_atual'), 'aluno');
});

test('funcao e classificada pelo miolo, ignorando prefixo de verbo', () => {
  assert.equal(classificarDominio('get_kpis_professor_periodo_canonico_v3'), 'professor');
  assert.equal(classificarDominio('fn_presenca_pendencias_do_dia'), 'professor');
  assert.equal(classificarDominio('upsert_lead'), 'comercial');
});
