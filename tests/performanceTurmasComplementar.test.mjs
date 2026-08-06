import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  'src/components/App/Professores/TabPerformanceProfessores.tsx',
  'utf8',
);

test('Performance V3 mantem a lista quando Media/Turma canônica expira', () => {
  assert.match(
    source,
    /Promise\.allSettled\(\[[\s\S]*?kpisTurmasPromise[\s\S]*?\]\)/,
    'Media/Turma precisa ser tratada como enriquecimento, e não bloquear a Performance V3',
  );
  assert.match(
    source,
    /kpisTurmasResultado\.status\s*===\s*['"]fulfilled['"]/,
  );
  assert.match(source, /console\.warn\([^\n]*M[eé]dia\/Turma/i);
});

test('Performance V3 não consulta Média/Turma viva que já existe no retrato', () => {
  assert.match(
    source,
    /HEALTH_SCORE_V3_PERFORMANCE_ENABLED\s*\?\s*Promise\.resolve\(\[\]\s+as\s+KPITurmaCanonico\[\]\)\s*:\s*buscarKpisTurmasCanonicos/i,
    'o caminho V3 deve usar os seis pilares capturados no snapshot e não reabrir a RPC pesada',
  );
});
