import assert from 'node:assert/strict';
import test from 'node:test';
import { apresentarContratoAssinatura, formatarObservacaoContrato } from '../src/lib/contratoAssinatura.ts';

test('rotulos nao prometem estado que o Emusys nao fornece', () => {
  assert.equal(apresentarContratoAssinatura('assinado').label, 'Assinado eletronicamente');
  const semAssinaturaEletronica = apresentarContratoAssinatura('sem_assinatura_eletronica');
  assert.equal(semAssinaturaEletronica.label, 'Sem assinatura eletrônica');
  assert.equal(
    semAssinaturaEletronica.descricao,
    'O Emusys só informa a assinatura eletrônica. Contrato assinado manualmente aparece aqui e não é pendência. Conferir a data de assinatura na tela do Emusys.',
  );
  assert.match(semAssinaturaEletronica.classes, /slate/);
  assert.doesNotMatch(semAssinaturaEletronica.classes, /amber/);
  assert.equal(apresentarContratoAssinatura('sem_contrato').label, 'Sem contrato no Emusys');
  assert.equal(apresentarContratoAssinatura('nao_verificado').label, 'Contrato não verificado');
  assert.equal(apresentarContratoAssinatura('dispensado').label, 'Contrato dispensado');
  assert.equal(apresentarContratoAssinatura('nao_assinado').status, 'nao_verificado');
  assert.equal(apresentarContratoAssinatura('qualquer_coisa').status, 'nao_verificado');
});

test('observacao e apresentada como observacao, nao assinatura', () => {
  const formatted = formatarObservacaoContrato('2026-09-04T08:20:00.000Z');
  assert.match(formatted, /04\/09\/2026/);
  assert.equal(formatarObservacaoContrato(null), 'Ainda não observado');
});
