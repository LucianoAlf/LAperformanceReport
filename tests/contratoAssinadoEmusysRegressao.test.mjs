import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

const scriptPath = '../scripts/verificar-regressao-contratos-emusys.mjs';

test('canario fixa as oito matriculas confirmadas como assinadas', async () => {
  assert.ok(existsSync(new URL(scriptPath, import.meta.url)), 'script de regressao ao vivo ainda nao existe');
  const { CONTRATOS_ASSINADOS_CANARIO, avaliarCanarioContratos } = await import(scriptPath);

  assert.deepEqual(
    CONTRATOS_ASSINADOS_CANARIO.map((item) => item.emusys_matricula_id),
    ['32', '78', '169', '328', '394', '409', '167', '416'],
  );
  assert.ok(CONTRATOS_ASSINADOS_CANARIO.every((item) => item.contrato_assinado === true));

  const ok = avaliarCanarioContratos(CONTRATOS_ASSINADOS_CANARIO);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.divergencias, []);

  const regressao = CONTRATOS_ASSINADOS_CANARIO.map((item) => (
    item.emusys_matricula_id === '32' ? { ...item, contrato_assinado: false } : item
  ));
  const falhou = avaliarCanarioContratos(regressao);
  assert.equal(falhou.ok, false);
  assert.deepEqual(falhou.divergencias, [{ emusys_matricula_id: '32', observado: false }]);
});
