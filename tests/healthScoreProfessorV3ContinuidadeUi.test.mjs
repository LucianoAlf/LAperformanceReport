import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const tab = readFileSync(
  new URL('../src/components/App/Professores/TabPerformanceProfessores.tsx', import.meta.url),
  'utf8',
);
const modal = readFileSync(
  new URL('../src/components/App/Professores/ModalDetalhesProfessorPerformance.tsx', import.meta.url),
  'utf8',
);
const hook = readFileSync(
  new URL('../src/hooks/useHealthScoreProfessorV3.ts', import.meta.url),
  'utf8',
);
const carteira = readFileSync(
  new URL('../src/components/App/Professores/TabCarteiraProfessores.tsx', import.meta.url),
  'utf8',
);
const presenca = readFileSync(
  new URL('../src/components/App/Professores/ModalDetalhesPresenca.tsx', import.meta.url),
  'utf8',
);
const configuracao = readFileSync(
  new URL('../src/components/App/Professores/HealthScoreV3Config.tsx', import.meta.url),
  'utf8',
);

test('tabela diferencia Health Score comparavel de desempenho observado', () => {
  assert.match(tab, /Desempenho observado/);
  assert.match(tab, /Em acompanhamento/);
  assert.match(tab, /Sem dados no per[ií]odo/);
  assert.doesNotMatch(tab, /Dados em auditoria|Sem base operacional/i);
  assert.match(tab, /pilaresValidos/);
  assert.match(tab, /scoreComparavel/);
  assert.match(tab, /scoreObservado/);
});

test('continuidade mensal mostra referencia anterior separada da competencia atual', () => {
  assert.match(tab, /competenciaReferencia/);
  assert.match(tab, /scoreReferencia/);
  assert.match(tab, /Refer(?:ê|\u00ea)ncia compar(?:á|\u00e1)vel/);
});

test('modal consome o mesmo snapshot normalizado do read model', () => {
  assert.match(hook, /normalizeHealthScoreV3PerformanceRows/);
  assert.match(hook, /snapshot/);
  assert.match(modal, /performance=\{healthScoreV3Performance\}/);
  assert.match(modal, /Desempenho observado/);
  assert.match(modal, /Sem dados no per[ií]odo/);
  assert.doesNotMatch(modal, /Dados em auditoria|Sem base operacional/i);
});

test('filtros da tabela usam os tres estados canonicos', () => {
  assert.match(tab, /value="comparavel"/);
  assert.match(tab, /value="em_maturacao"/);
  assert.match(tab, /value="sem_base_operacional"/);
});

test('mensagens visiveis da pagina de professores nao expoem implementacao', () => {
  assert.doesNotMatch(carteira, /Snapshot can[oô]nico indisponível/i);
  assert.doesNotMatch(presenca, /fonte can[oô]nica da presença/i);
  assert.doesNotMatch(configuracao, /Nenhum snapshot|snapshots em sombra/i);
});
