import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath = 'supabase/migrations/20260714190000_professores_identidade_emusys_canonica.sql';
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';
const repairPath = 'supabase/migrations/20260714193000_professores_identidades_historicas_reparo.sql';
const repair = existsSync(repairPath) ? readFileSync(repairPath, 'utf8') : '';

const uiFiles = [
  'src/components/App/Professores/ProfessoresPage.tsx',
  'src/components/App/Professores/TabPerformanceProfessores.tsx',
  'src/hooks/useProfessor360.ts',
  'src/components/App/Dashboard/DashboardPage.tsx',
];

test('consumidores operacionais exibem somente vinculos ativos de unidade', () => {
  for (const path of uiFiles) {
    const source = readFileSync(path, 'utf8');
    assert.match(source, /\.eq\('emusys_ativo',\s*true\)/, path);
    assert.match(source, /\.neq\('validacao_status',\s*'ignorado'\)/, path);
  }
});

test('migration separa identidade historica de vinculo operacional', () => {
  assert.match(migration, /identidade_historica_valida\s+boolean/i);
  assert.match(migration, /origem\s*=\s*'validacao_humana_ignorado_p07'/i);
  assert.match(migration, /emusys_id\s*=\s*3221/i);
  assert.match(migration, /emusys_id[^\n]*1113|1113[^\n]*emusys_id/i);
  assert.match(migration, /Erick Osmy'::text,\s*2109/i);
  assert.match(migration, /Erick Osmy'::text,\s*1160/i);
  assert.match(migration, /professores_sync_log/i);
});

test('views operacionais filtram unidade ativa e Fabio ignora slots vazios', () => {
  for (const view of [
    'vw_disponibilidade_professores',
    'vw_professores_performance_atual',
    'vw_fabio_carteira_professor',
  ]) {
    assert.match(migration, new RegExp(`${view}[\\s\\S]*?pu\\.emusys_ativo\\s*=\\s*true`, 'i'));
  }

  assert.match(migration, /vw_fabio_aulas_contexto[\s\S]*ae\.emusys_professor_id/i);
  assert.match(migration, /professor_unidade_ativa/i);
  assert.match(migration, /get_fabio_aulas_do_professor[\s\S]*professor_unidade_ativa\s*=\s*true/i);
  assert.match(migration, /get_fabio_aulas_do_professor[\s\S]*qtd_alunos,\s*0\)\s*>\s*0/i);
});

test('diagnostico distingue treino, historico e falha real de vinculo', () => {
  assert.match(migration, /treino_sem_acompanhamento/i);
  assert.match(migration, /identidade_historica_inativa/i);
  assert.match(migration, /BUG_falha_de_vinculo/i);
});

test('reparo classifica Leonardo, Vinicius e Juliana sem misturar historico com ativo', () => {
  assert.match(repair, /LEONARDO CASTRO[\s\S]*?u\.codigo\s*=\s*'CG'[\s\S]*?identidade_historica_valida\s*=\s*true/i);
  assert.match(repair, /VINICIUS PINHEIRO DO NASCIMENTO[\s\S]*?u\.codigo\s*=\s*'REC'/i);
  assert.match(repair, /JULIANA AZEVEDO TEIXEIRA BALTAZAR[\s\S]*?u\.codigo\s*=\s*'CG'/i);
  assert.match(repair, /vinculo_operacional_confirmado_20260714/i);
  assert.match(repair, /L_o Cabral de Castro%/i);
});
