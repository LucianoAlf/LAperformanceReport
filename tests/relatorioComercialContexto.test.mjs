import assert from 'node:assert/strict';
import test from 'node:test';

const contrato = await import(
  '../src/components/App/Comercial/relatorioComercialContexto.js'
).catch(() => ({}));

test('texto gerado para A nao pode ser usado depois de A para B ou A para todos', () => {
  assert.equal(typeof contrato.criarOrigemRelatorio, 'function');
  assert.equal(typeof contrato.podeUsarRelatorio, 'function');

  const origemA = contrato.criarOrigemRelatorio({
    tipo: 'diario',
    unidade: 'unidade-a',
    periodo: 'personalizado',
    dataInicio: '2026-07-01',
    dataFim: '2026-07-30',
    competencia: '2026-07',
  });
  const origemB = contrato.criarOrigemRelatorio({
    tipo: 'diario',
    unidade: 'unidade-b',
    periodo: 'personalizado',
    dataInicio: '2026-07-01',
    dataFim: '2026-07-30',
  });
  const origemTodos = contrato.criarOrigemRelatorio({
    tipo: 'diario',
    unidade: 'todos',
    periodo: 'personalizado',
    dataInicio: '2026-07-01',
    dataFim: '2026-07-30',
  });

  assert.equal(contrato.podeUsarRelatorio('relatorio A', origemA, origemA), true);
  assert.equal(contrato.podeUsarRelatorio('relatorio A', origemA, origemB), false);
  assert.equal(contrato.podeUsarRelatorio('relatorio A', origemA, origemTodos), false);
});

test('tipo periodo e datas fazem parte da identidade do relatorio', () => {
  assert.equal(typeof contrato.criarOrigemRelatorio, 'function');
  assert.equal(typeof contrato.podeUsarRelatorio, 'function');

  const base = {
    tipo: 'diario',
    unidade: 'unidade-a',
    periodo: 'personalizado',
    dataInicio: '2026-07-01',
    dataFim: '2026-07-30',
  };
  const origem = contrato.criarOrigemRelatorio(base);

  for (const alteracao of [
    { tipo: 'semanal' },
    { periodo: 'ontem' },
    { dataInicio: '2026-07-02' },
    { dataFim: '2026-07-31' },
    { competencia: '2026-08' },
  ]) {
    const outra = contrato.criarOrigemRelatorio({ ...base, ...alteracao });
    assert.equal(contrato.podeUsarRelatorio('texto', origem, outra), false);
  }
});

test('resposta de envio anterior e ignorada depois de regenerar ou trocar contexto', () => {
  assert.equal(typeof contrato.criarOrigemRelatorio, 'function');
  assert.equal(typeof contrato.respostaEnvioAindaValida, 'function');

  const origemA = contrato.criarOrigemRelatorio({
    tipo: 'diario',
    unidade: 'unidade-a',
    periodo: 'hoje',
    dataInicio: '2026-07-30',
    dataFim: '2026-07-30',
  });
  const origemB = contrato.criarOrigemRelatorio({
    tipo: 'diario',
    unidade: 'unidade-b',
    periodo: 'hoje',
    dataInicio: '2026-07-30',
    dataFim: '2026-07-30',
  });

  assert.equal(contrato.respostaEnvioAindaValida({
    respostaId: 4,
    envioAtualId: 4,
    origemEnvio: origemA,
    origemAtual: origemA,
  }), true);
  assert.equal(contrato.respostaEnvioAindaValida({
    respostaId: 4,
    envioAtualId: 5,
    origemEnvio: origemA,
    origemAtual: origemA,
  }), false);
  assert.equal(contrato.respostaEnvioAindaValida({
    respostaId: 4,
    envioAtualId: 4,
    origemEnvio: origemA,
    origemAtual: origemB,
  }), false);
});

test('editar T1 para T2 invalida o envio pendente e limpa seu estado antes da resposta', () => {
  assert.equal(typeof contrato.invalidarEnvioRelatorio, 'function');
  assert.equal(typeof contrato.respostaEnvioAindaValida, 'function');

  const origem = contrato.criarOrigemRelatorio({
    tipo: 'diario',
    unidade: 'unidade-a',
    periodo: 'hoje',
    dataInicio: '2026-07-30',
    dataFim: '2026-07-30',
  });
  const envioT1 = {
    respostaId: 7,
    envioAtualId: 7,
    origemEnvio: origem,
    origemAtual: origem,
  };

  assert.equal(contrato.respostaEnvioAindaValida(envioT1), true);

  const estadoAposEditarT2 = contrato.invalidarEnvioRelatorio({
    envioAtualId: envioT1.envioAtualId,
    enviando: true,
    enviado: true,
    erro: 'erro antigo',
  });

  assert.deepEqual(estadoAposEditarT2, {
    envioAtualId: 8,
    enviando: false,
    enviado: false,
    erro: null,
  });
  assert.equal(contrato.respostaEnvioAindaValida({
    ...envioT1,
    envioAtualId: estadoAposEditarT2.envioAtualId,
  }), false);
});
