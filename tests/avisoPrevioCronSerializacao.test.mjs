import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const path = new URL('../vps/la-hq/sol/crontab-aviso-previo.txt', import.meta.url);

test('sabado usa uma unica rodada serial para as tres unidades', () => {
  const cron = fs.readFileSync(path, 'utf8');
  const sabado = cron.split(/\r?\n/).filter((line) => /^5 11 \* \* 6\b/.test(line));
  assert.equal(sabado.length, 1);
  assert.match(sabado[0], /sol-aviso-previo-global\.lock/);
  assert.doesNotMatch(sabado[0], /--unidade/);
});

test('todas as rodadas usam o mesmo lock de rate limit', () => {
  const cron = fs.readFileSync(path, 'utf8');
  const jobs = cron.split(/\r?\n/).filter((line) => /^5 \d+ \* \* [1-6]/.test(line));
  assert.equal(jobs.length, 4);
  assert.ok(jobs.every((line) => line.includes('/tmp/sol-aviso-previo-global.lock')));
});
