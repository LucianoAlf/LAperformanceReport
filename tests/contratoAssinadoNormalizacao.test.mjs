import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizarMatriculaContrato } from '../supabase/functions/_shared/contrato-assinatura.ts';

const BARRA = '368d47f5-2d88-4475-bc14-ba084a9a348e';
const RECREIO = '95553e96-971b-4590-a6eb-0201d013c14d';

test('identidade de matricula e contrato sempre inclui a unidade', () => {
  const payload = { id: 865, aluno: { id: 10 }, contrato_atual: { id: 901, contrato_assinado: true } };
  assert.deepEqual(normalizarMatriculaContrato(payload, BARRA), {
    unidade_id: BARRA,
    emusys_matricula_id: '865',
    emusys_aluno_id: '10',
    contrato_emusys_id: '901',
    contrato_assinado: true,
  });
  assert.equal(normalizarMatriculaContrato(payload, RECREIO).unidade_id, RECREIO);
});

test('false e sem contrato sao verdades diferentes', () => {
  const naoAssinado = normalizarMatriculaContrato({
    id: 867,
    contrato_atual: { id: 902, contrato_assinado: false },
  }, BARRA);
  const semContrato = normalizarMatriculaContrato({ id: 868, contrato_atual: null }, BARRA);
  assert.equal(naoAssinado.contrato_assinado, false);
  assert.equal(naoAssinado.contrato_emusys_id, '902');
  assert.equal(semContrato.contrato_assinado, null);
  assert.equal(semContrato.contrato_emusys_id, null);
});

test('contrato sem booleano falha fechado', () => {
  assert.throws(
    () => normalizarMatriculaContrato({ id: 869, contrato_atual: { id: 903 } }, BARRA),
    /contrato_assinado/,
  );
});
