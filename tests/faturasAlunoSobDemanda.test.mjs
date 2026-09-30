import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { GlobalRateLimiter } from '../supabase/functions/_shared/faturasSync.ts';
import {
  coletarFaturasDoAluno,
  compararComEspelho,
  EmusysTimeoutError,
  RespostaInesperadaError,
} from '../supabase/functions/_shared/faturasDoAlunoSobDemanda.ts';
import { EmusysRateLimitError } from '../supabase/functions/_shared/faturasSync.ts';
import { avisoDaAtualizacao } from '../src/lib/atualizarFaturasAluno.ts';

const RECREIO = { nome: 'Recreio', id: '95553e96-971b-4590-a6eb-0201d013c14d', token: 't' };
const semEspera = () => new GlobalRateLimiter(0, async () => {});

// Caso real de 29/09/2026 (aluna 2318, Recreio): o credito de R$ 100 virou a fatura
// 31066, competencia 11/2026, que o espelho so traria no dia seguinte.
const fatura = (id, extra = {}) => ({
  id, aluno_id: 2318, matricula_id: 1591, contrato_id: 900, descricao: `Parcela 11/2026 do curso de Piano IND`,
  status: 'aberta', data_vencimento: '2026-11-05', data_pagamento: null,
  valor_original: 500, valor_pago: null, juros_e_multa: 0, desconto_aplicado: 0, desconto_fixo: 0, desconto_condicional: 0,
  ...extra,
});

const resposta = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });

test('coletarFaturasDoAluno', async (t) => {
  await t.test('pagina por cursor, filtra por aluno_id e deriva a competencia do vencimento', async () => {
    const urls = [];
    const paginas = [
      { items: [fatura(31066, { status: 'paga', valor_original: 100, valor_pago: 100, data_pagamento: '2026-09-29' })], paginacao: { proximo_cursor: 'c2', tem_mais: true } },
      { items: [fatura(31067, { data_vencimento: '2026-12-05', descricao: 'Parcela 12/2026 do curso de Piano IND' })], paginacao: { proximo_cursor: null, tem_mais: false } },
    ];
    const r = await coletarFaturasDoAluno({
      apiBaseUrl: 'https://x/v1', unidadeCodigo: 'recreio', unidade: RECREIO, emusysStudentId: '2318',
      limiter: semEspera(),
      fetchFn: async (url) => { urls.push(String(url)); return resposta(paginas[urls.length - 1]); },
    });
    assert.equal(r.paginas, 2);
    assert.match(urls[0], /aluno_id=2318/);
    assert.match(urls[0], /status=todas/);
    assert.match(urls[1], /cursor=c2/);
    assert.deepEqual(r.rows.map((x) => [x.emusys_fatura_id, x.competencia]), [['31066', '2026-11-01'], ['31067', '2026-12-01']]);
    assert.equal(r.rows[0].valor_pago, 100);
    assert.ok(!('validation_issues' in r.rows[0]), 'validation_issues nao e coluna do espelho');
  });

  await t.test('recusa fatura de outro aluno em vez de gravar em silencio', async () => {
    await assert.rejects(
      coletarFaturasDoAluno({
        apiBaseUrl: 'https://x/v1', unidadeCodigo: 'recreio', unidade: RECREIO, emusysStudentId: '2318', limiter: semEspera(),
        fetchFn: async () => resposta({ items: [fatura(1), fatura(2, { aluno_id: 999 })], paginacao: { tem_mais: false } }),
      }),
      RespostaInesperadaError,
    );
  });

  await t.test('429 vira EmusysRateLimitError com o Retry-After', async () => {
    await assert.rejects(
      coletarFaturasDoAluno({
        apiBaseUrl: 'https://x/v1', unidadeCodigo: 'recreio', unidade: RECREIO, emusysStudentId: '2318', limiter: semEspera(),
        fetchFn: async () => resposta({}, 429, { 'Retry-After': '30' }),
      }),
      (e) => e instanceof EmusysRateLimitError && e.retryAfterMs === 30_000,
    );
  });

  await t.test('sem resposta dentro do prazo vira EmusysTimeoutError', async () => {
    await assert.rejects(
      coletarFaturasDoAluno({
        apiBaseUrl: 'https://x/v1', unidadeCodigo: 'recreio', unidade: RECREIO, emusysStudentId: '2318', limiter: semEspera(),
        prazoMs: 30,
        // O timer do AbortSignal.timeout e' unref no Node: sem um timer vivo o event
        // loop encerra antes de ele disparar. O setTimeout abaixo simula o Emusys lento.
        fetchFn: (_url, init) => new Promise((_resolve, reject) => {
          const lento = setTimeout(() => reject(new Error('nao deveria chegar aqui')), 2000);
          init.signal.addEventListener('abort', () => { clearTimeout(lento); reject(init.signal.reason); });
        }),
      }),
      EmusysTimeoutError,
    );
  });

  await t.test('id de aluno invalido nem chama a API', async () => {
    let chamou = false;
    await assert.rejects(
      coletarFaturasDoAluno({
        apiBaseUrl: 'https://x/v1', unidadeCodigo: 'recreio', unidade: RECREIO, emusysStudentId: '0', limiter: semEspera(),
        fetchFn: async () => { chamou = true; return resposta({ items: [] }); },
      }),
      RespostaInesperadaError,
    );
    assert.equal(chamou, false);
  });

  await t.test('volume absurdo para um aluno = filtro ignorado, aborta', async () => {
    const muitos = Array.from({ length: 301 }, (_, i) => fatura(1000 + i));
    await assert.rejects(
      coletarFaturasDoAluno({
        apiBaseUrl: 'https://x/v1', unidadeCodigo: 'recreio', unidade: RECREIO, emusysStudentId: '2318', limiter: semEspera(),
        fetchFn: async () => resposta({ items: muitos, paginacao: { tem_mais: false } }),
      }),
      RespostaInesperadaError,
    );
  });
});

test('compararComEspelho separa novas, alteradas e iguais', async () => {
  const { rows } = await coletarFaturasDoAluno({
    apiBaseUrl: 'https://x/v1', unidadeCodigo: 'recreio', unidade: RECREIO, emusysStudentId: '2318', limiter: semEspera(),
    fetchFn: async () => resposta({
      items: [
        fatura(31065, { status: 'paga', valor_pago: 500, data_vencimento: '2026-10-05' }),
        fatura(31066, { status: 'paga', valor_original: 100, valor_pago: 100 }),
        fatura(31078, { valor_original: 400 }),
      ],
      paginacao: { tem_mais: false },
    }),
  });
  const r = compararComEspelho(rows, [
    { emusys_fatura_id: 31065, status: 'paga', valor_pago: '500.00', valor_original: '500.00', data_vencimento: '2026-10-05' },
    { emusys_fatura_id: 31078, status: 'aberta', valor_pago: null, valor_original: '500.00', data_vencimento: '2026-11-05' },
  ]);
  assert.deepEqual(r.novas.map((x) => x.emusys_fatura_id), ['31066']);
  assert.deepEqual(r.alteradas.map((x) => x.emusys_fatura_id), ['31078'], 'a parcela de 500 foi dividida em 400 + 100');
  assert.equal(r.iguais, 1);
});

test('avisoDaAtualizacao: nenhum desfecho fica mudo', async (t) => {
  await t.test('trouxe fatura nova: cita a fatura', () => {
    const a = avisoDaAtualizacao(200, {
      ok: true, total_emusys: 26, novas: 1, alteradas: 0,
      faturas_novas: [{ emusys_fatura_id: '31066', descricao: 'Parcela 11/2026 do curso de Piano IND', competencia: '2026-11-01', status: 'paga', valor_original: 100, valor_pago: 100 }],
    });
    assert.equal(a.tom, 'sucesso');
    assert.match(a.mensagem, /1 fatura nova/);
    assert.match(a.mensagem, /Parcela 11\/2026/);
    assert.match(a.mensagem, /R\$ 100,00/);
  });

  await t.test('nada novo diz que consultou — senao parece que o botao nao funcionou', () => {
    const a = avisoDaAtualizacao(200, { ok: true, total_emusys: 3, novas: 0, alteradas: 0 });
    assert.equal(a.tom, 'info');
    assert.match(a.mensagem, /Consultei o Emusys: nada novo/);
  });

  for (const [nome, status, corpo, padrao] of [
    ['429', 429, { ok: false, codigo: 'EMUSYS_LIMITE', retry_after_s: 30 }, /limitando.*30 segundos/],
    ['timeout', 504, { ok: false, codigo: 'EMUSYS_TIMEOUT' }, /nao respondeu a tempo/],
    ['sem id', 400, { ok: false, codigo: 'SEM_ID_EMUSYS' }, /nao tem vinculo com o Emusys/],
    ['fora do escopo', 403, { ok: false, codigo: 'ESCOPO', erro: 'voce nao tem acesso a esta unidade' }, /permissao/],
    ['gravacao', 500, { ok: false, codigo: 'GRAVACAO_FALHOU', erro: 'x' }, /nao consegui gravar/],
    ['sessao', 401, null, /sessao expirou/],
    ['sem resposta', null, null, /Nao consegui falar com o servidor/],
    ['http desconhecido', 418, null, /HTTP 418/],
  ]) {
    await t.test(`${nome} vira erro explicado`, () => {
      const a = avisoDaAtualizacao(status, corpo, status == null ? 'Failed to fetch' : null);
      assert.equal(a.tom, 'erro');
      assert.match(a.mensagem, padrao);
    });
  }

  await t.test('toda falha de consulta afirma que nada foi alterado', () => {
    for (const [s, c] of [[429, { codigo: 'EMUSYS_LIMITE' }], [504, { codigo: 'EMUSYS_TIMEOUT' }], [500, { codigo: 'GRAVACAO_FALHOU' }], [null, null], [418, null]]) {
      assert.match(avisoDaAtualizacao(s, c).mensagem, /Nada foi alterado/);
    }
  });
});

test('o form nao volta a engolir erro ao listar as parcelas do aluno', () => {
  const src = readFileSync(new URL('../src/components/App/Administrativo/CaixaFinanceiro/CaixaMovimentacaoForm.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /catch\s*\{\s*setIrmaos\(\[\]\)/, 'falha de leitura nao pode virar "nenhuma outra fatura"');
  assert.match(src, /atualizarFaturasDoAlunoNoEmusys/);
});

test('config.toml declara verify_jwt da edge nova (deploy pelo MCP resetaria)', () => {
  const toml = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
  assert.match(toml, /\[functions\.atualizar-faturas-aluno\]\s*(#[^\n]*\n\s*)*verify_jwt = true/);
});
