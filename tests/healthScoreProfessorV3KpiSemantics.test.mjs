import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const migrationPath = path.join(
  root,
  'supabase/migrations/20260804170000_health_score_v3_kpis_temporais_canonicos.sql',
);
const performancePath = path.join(
  root,
  'src/components/App/Professores/TabPerformanceProfessores.tsx',
);

test('presenca identifica a ocorrencia pela data da aula sem rejeitar lancamento tardio', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration corretiva ainda nao existe');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(
    sql,
    /s\.aula_emusys_id\s*=\s*r\.aula_id[\s\S]{0,180}s\.data_aula\s*=\s*r\.data_aula/i,
    'o mesmo id de aula em datas distintas nao pode casar duas ocorrencias',
  );
  assert.doesNotMatch(
    sql,
    /respondido_em\s*(?:=|between|>=|<=)|evidencia_registrada_em\s*(?:=|between|>=|<=)/i,
    'o instante de lancamento nao pode excluir uma presenca registrada depois',
  );
  assert.match(sql, /'aceita_lancamento_tardio'\s*,\s*true/i);
});

test('ciclo usa fotografia do fim do recorte para carteira e media por turma', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration corretiva ainda nao existe');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /v_competencia_fotografia\s*:=\s*date_trunc/i);
  assert.match(sql, /least\s*\(\s*v_periodo_fim\s*,\s*current_date\s*\)/i);
  assert.match(
    sql,
    /get_hs_prof_v3_segmentadas_agregadas_before_snapshot_20260804\s*\([\s\S]{0,240}v_competencia_fotografia[\s\S]{0,240}'mensal'/i,
  );
  assert.match(
    sql,
    /get_hs_prof_v3_segmentadas_agregadas_before_snapshot_20260804\s*\([\s\S]{0,240}p_competencia[\s\S]{0,240}'ciclo'/i,
    'metricas de fluxo devem preservar a agregacao dos tres meses',
  );
  assert.match(sql, /'semantica_ciclo'\s*,\s*'fotografia_fim_recorte'/i);
});

test('tooltip explica a base de cada KPI sem chamar meta ponderada de media observada', () => {
  const source = fs.readFileSync(performancePath, 'utf8');

  assert.match(source, /Presentes\/classificados/i);
  assert.match(source, /Matr[ií]culas\/experimentais/i);
  assert.match(source, /Ocupa[cç][oõ]es\/meta ponderada/i);
  assert.match(source, /Fotografia do fim do recorte/i);
});
