import assert from 'node:assert/strict';
import { riscoDesatualizado, formatarDataCalculo } from '../../src/lib/agenda';

// Relogio fixo (meio-dia UTC) para as comparacoes nao dependerem do fuso de
// quem roda o teste.
const agora = new Date('2026-08-02T12:00:00Z');

assert.equal(riscoDesatualizado(null, agora), true, 'sem data de calculo deve ser tratado como desatualizado');

assert.equal(
  riscoDesatualizado('2026-08-02', agora),
  false,
  'calculado hoje nao pode ser desatualizado',
);

assert.equal(
  riscoDesatualizado('2026-07-27', agora),
  false,
  'calculado ha 6 dias ainda esta dentro da janela de frescor',
);

assert.equal(
  riscoDesatualizado('2026-07-25', agora),
  true,
  'calculado ha 8 dias ja deve ser tratado como desatualizado',
);

// Caso real: cron calcular-risco-evasao-3d parado desde 2026-07-13, tela
// aberta em 2026-08-02 (currentDate desta sessao) - ~20 dias de atraso.
assert.equal(
  riscoDesatualizado('2026-07-13', new Date('2026-08-02T12:00:00Z')),
  true,
  'risco de 2026-07-13 visto em 2026-08-02 deve ser desatualizado (cron pausado)',
);

assert.equal(formatarDataCalculo(null), '', 'sem data de calculo formata como string vazia');
assert.equal(formatarDataCalculo('2026-07-13'), '13/07', 'formata data ISO como dd/mm');
assert.equal(
  formatarDataCalculo('2026-07-13T15:30:00Z'),
  '13/07',
  'formata timestamp completo como dd/mm',
);

console.log('agenda risco desatualizado: OK');
