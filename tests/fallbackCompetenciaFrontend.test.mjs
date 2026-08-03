import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  executarCicloFallback,
  extrairFallbackCompetencia,
  CancelamentoCompetenciaError,
} from '../src/lib/fallbackCompetenciaRelatorio.ts';

const lib = await readFile(
  new URL('../src/lib/fallbackCompetenciaRelatorio.ts', import.meta.url),
  'utf8',
);
const hook = await readFile(
  new URL('../src/hooks/useConfirmacaoCompetencia.ts', import.meta.url),
  'utf8',
);

// --- Testes de contrato (checagem sobre o código-fonte) ---

test('o corpo do erro e lido do context da resposta', () => {
  assert.match(lib, /context/);
  assert.match(lib, /\.json\(\)/);
});

test('parse ilegivel devolve null em vez de estourar', async () => {
  const corpoQuebrado = new Response('<html>gateway timeout</html>', { status: 504 });
  assert.equal(await extrairFallbackCompetencia({ context: corpoQuebrado }), null);
  assert.equal(await extrairFallbackCompetencia(new Error('sem context')), null);
  assert.equal(await extrairFallbackCompetencia(null), null);
});

test('so aceita fallback com motivo de fechamento indisponivel', () => {
  assert.match(lib, /fechamento_indisponivel/);
});

test('o hook expoe a promise de confirmacao', () => {
  assert.match(hook, /export function useConfirmacaoCompetencia/);
  assert.match(hook, /Promise<boolean>/);
});

test('o ciclo tentar-oferecer-reenviar mora numa unica funcao', () => {
  assert.match(lib, /export async function solicitarRelatorioMensalComFallback/);
});

// --- Testes comportamentais do ciclo (prova real contra o laço) ---

function erroComFallback(fallback) {
  const response = new Response(
    JSON.stringify({
      success: false,
      motivo: 'fechamento_indisponivel',
      error: 'O fechamento oficial deste mês ainda não está disponível.',
      competencia_solicitada: { ano: 2026, mes: 8 },
      fallback,
    }),
    { status: 409 },
  );
  return { context: response };
}

test('sucesso de primeira tentativa: invocar 1x, pedirConfirmacao nunca', async () => {
  let chamadasInvocar = 0;
  let chamadasConfirmacao = 0;

  const resultado = await executarCicloFallback({
    invocar: async (ano, mes) => {
      chamadasInvocar += 1;
      return { data: { success: true, texto: `relatorio ${ano}-${mes}` }, error: null };
    },
    ano: 2026,
    mes: 8,
    pedirConfirmacao: async () => {
      chamadasConfirmacao += 1;
      return true;
    },
  });

  assert.equal(resultado, 'relatorio 2026-8');
  assert.equal(chamadasInvocar, 1);
  assert.equal(chamadasConfirmacao, 0);
});

test('409 com fallback + usuario aceita: invocar 2x, segunda com a competencia do fallback', async () => {
  const chamadas = [];

  const resultado = await executarCicloFallback({
    invocar: async (ano, mes) => {
      chamadas.push([ano, mes]);
      if (chamadas.length === 1) {
        return {
          data: null,
          error: erroComFallback({ ano: 2026, mes: 7, rotulo: 'JULHO/2026' }),
        };
      }
      return { data: { success: true, texto: `relatorio ${ano}-${mes}` }, error: null };
    },
    ano: 2026,
    mes: 8,
    pedirConfirmacao: async (fallback) => {
      assert.deepEqual(fallback, { ano: 2026, mes: 7, rotulo: 'JULHO/2026' });
      return true;
    },
  });

  assert.equal(resultado, 'relatorio 2026-7');
  assert.equal(chamadas.length, 2);
  assert.deepEqual(chamadas[1], [2026, 7]);
});

test('409 com fallback + usuario recusa: invocar 1x, lanca CancelamentoCompetenciaError', async () => {
  let chamadasInvocar = 0;

  await assert.rejects(
    () =>
      executarCicloFallback({
        invocar: async () => {
          chamadasInvocar += 1;
          return {
            data: null,
            error: erroComFallback({ ano: 2026, mes: 7, rotulo: 'JULHO/2026' }),
          };
        },
        ano: 2026,
        mes: 8,
        pedirConfirmacao: async () => false,
      }),
    (erro) => erro instanceof CancelamentoCompetenciaError,
  );

  assert.equal(chamadasInvocar, 1);
});

test('segunda tentativa tambem falha: NAO chama invocar uma terceira vez', async () => {
  let chamadasInvocar = 0;

  await assert.rejects(() =>
    executarCicloFallback({
      invocar: async () => {
        chamadasInvocar += 1;
        if (chamadasInvocar === 1) {
          return {
            data: null,
            error: erroComFallback({ ano: 2026, mes: 7, rotulo: 'JULHO/2026' }),
          };
        }
        return { data: null, error: new Error('falha na segunda tentativa') };
      },
      ano: 2026,
      mes: 8,
      pedirConfirmacao: async () => true,
    }),
  );

  assert.equal(chamadasInvocar, 2);
});

test('409 sem fallback: mensagem legivel da edge propagada, pedirConfirmacao nunca chamado', async () => {
  let chamadasConfirmacao = 0;
  const erroOriginal = erroComFallback(null);

  await assert.rejects(
    () =>
      executarCicloFallback({
        invocar: async () => ({ data: null, error: erroOriginal }),
        ano: 2026,
        mes: 8,
        pedirConfirmacao: async () => {
          chamadasConfirmacao += 1;
          return true;
        },
      }),
    (erro) =>
      erro instanceof Error
      && erro.message === 'O fechamento oficial deste mês ainda não está disponível.',
  );

  assert.equal(chamadasConfirmacao, 0);
});

test('erro sem corpo legivel preserva o erro original', async () => {
  const erroOriginal = new Error('Edge Function returned a non-2xx status code');

  await assert.rejects(
    () =>
      executarCicloFallback({
        invocar: async () => ({ data: null, error: erroOriginal }),
        ano: 2026,
        mes: 8,
        pedirConfirmacao: async () => true,
      }),
    (erro) => erro === erroOriginal,
  );
});

test('erro generico com corpo (sem motivo de fallback) mostra a frase da edge', async () => {
  const response = new Response(
    JSON.stringify({
      success: false,
      error: 'Não foi possível gerar o relatório mensal desta competência.',
    }),
    { status: 500 },
  );

  await assert.rejects(
    () =>
      executarCicloFallback({
        invocar: async () => ({ data: null, error: { context: response } }),
        ano: 2026,
        mes: 8,
        pedirConfirmacao: async () => true,
      }),
    (erro) =>
      erro instanceof Error
      && erro.message === 'Não foi possível gerar o relatório mensal desta competência.',
  );
});

test('extrairFallbackCompetencia devolve null quando fallback e null', async () => {
  const fallback = await extrairFallbackCompetencia(erroComFallback(null));
  assert.equal(fallback, null);
});

test('extrairFallbackCompetencia devolve os dados quando fallback e valido', async () => {
  const fallback = await extrairFallbackCompetencia(
    erroComFallback({ ano: 2026, mes: 7, rotulo: 'JULHO/2026' }),
  );
  assert.deepEqual(fallback, { ano: 2026, mes: 7, rotulo: 'JULHO/2026' });
});

const modalAdmin = await readFile(
  new URL('../src/components/App/Administrativo/ModalRelatorio.tsx', import.meta.url),
  'utf8',
);

test('relatorio administrativo oferece a competencia disponivel', () => {
  assert.match(modalAdmin, /solicitarRelatorioMensalComFallback/);
  assert.match(modalAdmin, /useConfirmacaoCompetencia/);
  assert.match(modalAdmin, /ModalConfirmacao/);
});

const paginaComercial = await readFile(
  new URL('../src/components/App/Comercial/ComercialPage.tsx', import.meta.url),
  'utf8',
);

test('relatorio comercial oferece a competencia disponivel', () => {
  assert.match(paginaComercial, /solicitarRelatorioMensalComFallback/);
  assert.match(paginaComercial, /useConfirmacaoCompetencia/);
  assert.match(paginaComercial, /ModalConfirmacao/);
});
