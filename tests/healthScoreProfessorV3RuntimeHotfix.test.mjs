import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const carteiraPath = new URL(
  '../src/components/App/Professores/TabCarteiraProfessores.tsx',
  import.meta.url,
);
const performancePath = new URL(
  '../src/components/App/Professores/TabPerformanceProfessores.tsx',
  import.meta.url,
);
const modalPath = new URL(
  '../src/components/App/Professores/ModalDetalhesProfessorPerformance.tsx',
  import.meta.url,
);
const healthLibPath = new URL(
  '../src/lib/healthScoreProfessorV3Performance.ts',
  import.meta.url,
);
const migrationPath = new URL(
  '../supabase/migrations/20260803235000_health_score_v3_ciclo_presenca_runtime.sql',
  import.meta.url,
);

test('Carteira continua canônica quando o enriquecimento de Health Score expira', () => {
  const source = fs.readFileSync(carteiraPath, 'utf8');

  assert.doesNotMatch(source, /throw new Error\(`Health Score V3 indisponível:/);
  assert.match(source, /enriquecimento[\s\S]*Health Score V3[\s\S]*não bloqueia/i);
  assert.match(source, /console\.warn\('Health Score V3 indisponível na Carteira'/);
});

test('ciclo usa presença canônica do próprio período sem corte por data fixa', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration do ciclo ainda não existe');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /metrica\s*=\s*'presenca'[\s\S]*valor_bruto\s+is\s+not\s+null/i);
  assert.match(sql, /jsonb_strip_nulls/i);
  assert.doesNotMatch(sql, /periodo_inicio\s*<\s*date\s*'2026-08-03'/i);
});

test('professor não comparável usa linguagem neutra de acompanhamento', () => {
  const sources = [performancePath, modalPath, healthLibPath]
    .map((path) => fs.readFileSync(path, 'utf8'))
    .join('\n');

  assert.match(sources, /Desempenho observado/);
  assert.match(sources, /Em acompanhamento/);
  assert.doesNotMatch(sources, /Base em formação/i);
  assert.doesNotMatch(sources, /Nota em formação/i);
});
