import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const helperPath = 'supabase/functions/_shared/presenca-db-retry.ts';
const syncPath = 'supabase/functions/sync-presenca-emusys/index.ts';
const gradePath = 'supabase/functions/sync-grade-futura-emusys/index.ts';
const emusysAulasPath = 'supabase/functions/_shared/emusys-aulas.ts';
const runPath = 'supabase/functions/_shared/presenca-sync-run.ts';
const reconciliacaoPath = 'supabase/functions/_shared/reconciliacao-grade-snapshot.ts';

async function carregarHelper() {
  assert.ok(existsSync(helperPath), `helper ausente: ${helperPath}`);
  return import(`../${helperPath}?t=${Date.now()}`);
}

test('retry reconhece somente SQLSTATE transitorio estruturado', async () => {
  const { sqlStatePresencaTransitorio } = await carregarHelper();

  assert.equal(sqlStatePresencaTransitorio({ code: '55P03' }), true);
  assert.equal(sqlStatePresencaTransitorio({ code: '40001' }), true);
  assert.equal(sqlStatePresencaTransitorio({ code: '40P01' }), true);
  assert.equal(sqlStatePresencaTransitorio({ code: '23505' }), false);
  assert.equal(
    sqlStatePresencaTransitorio({ code: '23505', message: '55P03 presenca_slot_lock_ocupado' }),
    false,
  );
  assert.equal(sqlStatePresencaTransitorio(new Error('55P03')), false);
});

test('retry aplica backoff limitado e conclui depois que o lock e liberado', async () => {
  const { executarComRetrySqlPresenca } = await carregarHelper();
  const esperas = [];
  let chamadas = 0;

  const resposta = await executarComRetrySqlPresenca(
    async () => {
      chamadas += 1;
      return chamadas < 3
        ? { data: null, error: { code: '55P03', message: 'detalhe privado' } }
        : { data: { id: 7 }, error: null };
    },
    {
      maxTentativas: 7,
      atrasoBaseMs: 250,
      atrasoMaximoMs: 4000,
      dormir: async (ms) => { esperas.push(ms); },
    },
  );

  assert.equal(chamadas, 3);
  assert.deepEqual(esperas, [250, 500]);
  assert.deepEqual(resposta.resultado, { data: { id: 7 }, error: null });
  assert.equal(resposta.tentativas, 3);
  assert.equal(resposta.transitorioEsgotado, false);
});

test('retry nao repete falha permanente e sinaliza esgotamento sem serializar detalhe', async () => {
  const { executarComRetrySqlPresenca } = await carregarHelper();
  let permanentes = 0;
  const permanente = await executarComRetrySqlPresenca(async () => {
    permanentes += 1;
    return { data: null, error: { code: '23505', message: 'Aluno Privado' } };
  }, { dormir: async () => {} });

  assert.equal(permanentes, 1);
  assert.equal(permanente.transitorioEsgotado, false);

  let transitorias = 0;
  const esgotada = await executarComRetrySqlPresenca(async () => {
    transitorias += 1;
    return { data: null, error: { code: '55P03', message: 'Aluno Privado' } };
  }, {
    maxTentativas: 3,
    atrasoBaseMs: 1,
    atrasoMaximoMs: 2,
    dormir: async () => {},
  });

  assert.equal(transitorias, 3);
  assert.equal(esgotada.tentativas, 3);
  assert.equal(esgotada.transitorioEsgotado, true);
  assert.doesNotMatch(JSON.stringify(esgotada), /Aluno Privado/u);
});

test('todos os escritores Edge do espelho usam o retry e mantem codigo seguro', () => {
  const sync = readFileSync(syncPath, 'utf8');
  const grade = readFileSync(gradePath, 'utf8');
  const emusysAulas = readFileSync(emusysAulasPath, 'utf8');
  const run = readFileSync(runPath, 'utf8');
  const reconciliacao = readFileSync(reconciliacaoPath, 'utf8');

  for (const source of [sync, grade, emusysAulas, reconciliacao]) {
    assert.match(source, /executarComRetrySqlPresenca/u);
  }
  for (const source of [sync, grade]) {
    assert.match(
      source,
      /erros\.includes\(['"]PRESENCA_SYNC_CONCORRENCIA_ESGOTADA['"]\)/u,
    );
  }
  assert.match(run, /PRESENCA_SYNC_CONCORRENCIA_ESGOTADA/u);
  for (const source of [sync, grade]) {
    assert.doesNotMatch(
      source,
      /transitorioEsgotado[\s\S]{0,220}\.message/u,
    );
  }
});
