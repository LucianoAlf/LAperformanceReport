import assert from 'node:assert/strict';
import test from 'node:test';
import { apresentarContratoAssinatura, formatarObservacaoContrato } from '../src/lib/contratoAssinatura.ts';

test('rotulos nao prometem estado que o Emusys nao fornece', () => {
  const assinado = apresentarContratoAssinatura('assinado');
  assert.equal(assinado.label, 'Contrato assinado');
  assert.doesNotMatch(assinado.descricao, /eletr[oô]nic/i);

  const naoAssinado = apresentarContratoAssinatura('nao_assinado');
  assert.equal(naoAssinado.label, 'Não assinado');
  assert.equal(
    naoAssinado.descricao,
    'O Emusys informa contrato_assinado=false. O LA Report não sabe se o contrato ainda não foi enviado ou se aguarda a assinatura do aluno.',
  );
  assert.match(naoAssinado.classes, /amber/);
  assert.equal(apresentarContratoAssinatura('sem_contrato').label, 'Sem contrato no Emusys');
  assert.equal(apresentarContratoAssinatura('nao_verificado').label, 'Contrato não verificado');
  assert.equal(apresentarContratoAssinatura('dispensado').label, 'Contrato dispensado');
  assert.equal(apresentarContratoAssinatura('sem_assinatura_eletronica').status, 'nao_verificado');
  assert.equal(apresentarContratoAssinatura('qualquer_coisa').status, 'nao_verificado');
});

test('observacao e apresentada como observacao, nao assinatura', () => {
  const formatted = formatarObservacaoContrato('2026-09-04T08:20:00.000Z');
  assert.match(formatted, /04\/09\/2026/);
  assert.equal(formatarObservacaoContrato(null), 'Ainda não observado');
});
