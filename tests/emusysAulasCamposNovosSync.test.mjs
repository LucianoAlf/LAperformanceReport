import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const syncPresenca = readFileSync(
  new URL('../supabase/functions/sync-presenca-emusys/index.ts', import.meta.url),
  'utf8',
);
const syncGradeFutura = readFileSync(
  new URL('../supabase/functions/sync-grade-futura-emusys/index.ts', import.meta.url),
  'utf8',
);

const extrairObjetoAula = (source, inicio) => {
  const start = source.indexOf(inicio);
  assert.notEqual(start, -1, `bloco de upsert nao encontrado: ${inicio}`);

  const ultimaColuna = 'anotacoes: aula.anotacoes || null';
  const end = source.indexOf(ultimaColuna, start);
  assert.notEqual(end, -1, 'fim do objeto de aula nao encontrado');
  return source.slice(start, end + ultimaColuna.length);
};

test('sync de presenca mapeia campos novos com timezone local do Emusys', () => {
  const row = extrairObjetoAula(syncPresenca, 'emusys_id: aula.id');

  assert.match(row, /reagendada:\s*aula\.reagendada\s*===\s*true/);
  assert.match(row, /justificada:\s*aula\.justificada\s*===\s*true/);
  assert.match(
    row,
    /data_hora_inicio_original:[\s\S]*parseDataHoraEmusys\(aula\.data_hora_inicio_original\)/,
  );
  assert.match(row, /professor_presenca:\s*aula\.professores\?\.\[0\]\?\.presenca\s*\?\?\s*null/);
  assert.doesNotMatch(row, /horario_presenca/);
  assert.doesNotMatch(row, /anotacoes_fabio/);
  assert.match(row, /anotacoes:\s*aula\.anotacoes\s*\|\|\s*null/);
});

test('sync de grade futura preserva o mesmo contrato e nao toca anotacoes_fabio', () => {
  const row = extrairObjetoAula(syncGradeFutura, 'emusys_id: aula.id');

  assert.match(row, /reagendada:\s*aula\.reagendada\s*===\s*true/);
  assert.match(row, /justificada:\s*aula\.justificada\s*===\s*true/);
  assert.match(
    row,
    /data_hora_inicio_original:[\s\S]*parseDataHoraEmusys\(aula\.data_hora_inicio_original\)/,
  );
  assert.match(row, /professor_presenca:\s*aula\.professores\?\.\[0\]\?\.presenca\s*\?\?\s*null/);
  assert.doesNotMatch(row, /horario_presenca/);
  assert.doesNotMatch(syncGradeFutura, /anotacoes_fabio/);
  assert.match(row, /anotacoes:\s*aula\.anotacoes\s*\|\|\s*null/);
});

test('parser de data preserva hora local BRT com offset explicito', () => {
  for (const source of [syncPresenca, syncGradeFutura]) {
    assert.match(
      source,
      /return dataHora\.replace\(' ', 'T'\) \+ ':00-03:00';/,
    );
  }
});

test('sync de presenca oferece backfill de metadados em lote sem reconciliar alunos', () => {
  assert.match(syncPresenca, /let modo:\s*'presenca'\s*\|\s*'agenda'\s*\|\s*'metadados'/);
  assert.match(syncPresenca, /body\.modo === 'metadados'/);
  assert.match(syncPresenca, /sincronizarMetadadosAulas\(/);
  assert.match(syncPresenca, /if \(modo === 'metadados'\)[\s\S]*sincronizarMetadadosAulas/);
});

test('sync leve de metadados cobre ontem e os proximos 35 dias', () => {
  assert.match(syncPresenca, /Math\.min\(Math\.max\(body\.dias_futuros \|\| 14, 1\), 35\)/);
  assert.match(
    syncPresenca,
    /if \(modo === 'metadados'\)[\s\S]*for \(let d = dias - 1; d >= 0; d--\)[\s\S]*for \(let d = 1; d <= diasFuturos; d\+\+\)/,
  );
});

test('cron leve roda a cada 15 minutos sem sobrepor as tres unidades', () => {
  const cron = readFileSync(
    new URL('../supabase/migrations/20260713214650_cron_sync_metadados_aulas_15min.sql', import.meta.url),
    'utf8',
  );

  assert.match(cron, /sync-metadados-aulas-15m-u%s/);
  assert.match(cron, /0,15,30,45 \* \* \* \*/);
  assert.match(cron, /5,20,35,50 \* \* \* \*/);
  assert.match(cron, /10,25,40,55 \* \* \* \*/);
  assert.match(cron, /'modo', 'metadados'/);
  assert.match(cron, /'dias', 2/);
  assert.match(cron, /'dias_futuros', 35/);
  assert.match(cron, /timeout_milliseconds := 180000/);
});
