import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath = 'supabase/migrations/20260715224149_professores_saidas_fator_demanda_canonicos.sql';
const performanceMigrationPath = 'supabase/migrations/20260715232057_otimiza_kpis_professor_canonico_v3.sql';
const erickRepairPath = 'supabase/migrations/20260715224525_reparo_erick_osmy_vinculo_operacional.sql';
const clientPath = 'src/lib/professoresKpisCanonicos.ts';
const performancePath = 'src/components/App/Professores/TabPerformanceProfessores.tsx';
const modalPath = 'src/components/App/Professores/ModalDetalhesEvasoes.tsx';

const readOptional = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('migration separa saidas operacionais do subconjunto que impacta o score', () => {
  const migration = readOptional(migrationPath);

  assert.match(migration, /get_saidas_professor_periodo_canonicas_v1/i);
  assert.match(migration, /count\s*\(\s*\*\s*\)\s*filter\s*\(\s*where\s+tipo\s*=\s*'evasao'/i);
  assert.match(migration, /count\s*\(\s*\*\s*\)\s*filter\s*\(\s*where\s+tipo\s*=\s*'nao_renovacao'/i);
  assert.match(migration, /saidas_validas_total/i);
  assert.match(migration, /saidas_score_professor/i);
  assert.match(migration, /is_movimentacao_admin_retencao_valida/i);
  assert.match(migration, /is_segundo_curso/i);
});

test('rpc v3 preserva v2 e acrescenta contrato canonico novo', () => {
  const migration = readOptional(migrationPath);

  assert.match(migration, /get_kpis_professor_periodo_canonico_v3/i);
  assert.match(migration, /from\s+public\.get_kpis_professor_periodo_canonico_v2/i);
  assert.match(migration, /fator_demanda_publicavel/i);
  assert.match(migration, /taxa_impacto_score/i);
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated, fabio_agent/i);
  assert.match(migration, /grant execute[\s\S]*to authenticated, service_role/i);
});

test('fator usa pessoa curso da competencia e nao a view atual de alunos', () => {
  const migration = readOptional(migrationPath);
  const performance = readOptional(performancePath);

  assert.match(migration, /get_fator_demanda_professor_periodo_canonico_v1/i);
  assert.match(migration, /aluno_jornada_matricula_disciplina/i);
  assert.match(migration, /aula_alunos_emusys/i);
  assert.match(migration, /count\s*\(\s*distinct\s*\(\s*b\.pessoa_chave\s*,\s*b\.curso_id\s*\)\s*\)/i);
  assert.doesNotMatch(performance, /vw_fator_demanda_professor/i);
});

test('tela exibe saidas totais e usa apenas o subconjunto no score', () => {
  const client = readOptional(clientPath);
  const performance = readOptional(performancePath);

  assert.match(client, /get_kpis_professor_periodo_canonico_v3/i);
  assert.match(performance, />Saidas</i);
  assert.match(performance, /saidas_validas_total/i);
  assert.match(performance, /saidas_score_professor/i);
  assert.match(performance, /Retencao atribuivel/i);
});

test('modal consome detalhe canonico sem consultar movimentacoes cruas', () => {
  const modal = readOptional(modalPath);

  assert.match(modal, /get_saidas_professor_periodo_detalhes_v1/i);
  assert.doesNotMatch(modal, /\.from\(['"]movimentacoes_admin['"]\)/i);
  assert.doesNotMatch(modal, /\.from\(['"]motivos_saida['"]\)/i);
});

test('reparo Erick e estrito por identidade unidade periodo e sem acompanhamento', () => {
  const migration = readOptional(erickRepairPath);

  assert.match(migration, /professores_unidades/i);
  assert.match(migration, /pu\.professor_id\s*=\s*52/i);
  assert.match(migration, /pu\.unidade_id\s*=\s*v_unidade_id/i);
  assert.match(migration, /pu\.emusys_id\s*=\s*2109/i);
  assert.match(migration, /pu\.emusys_ativo\s*=\s*true/i);
  assert.match(migration, /pu\.professor_id\s*<>\s*52/i);
  assert.match(migration, /ae\.unidade_id\s*=\s*v_unidade_id/i);
  assert.match(migration, /ae\.emusys_professor_id\s*=\s*2109/i);
  assert.match(migration, /ae\.data_aula\s+between\s+date\s+'2026-07-08'\s+and\s+date\s+'2026-07-11'/i);
  assert.match(migration, /coalesce\s*\(\s*ae\.sem_acompanhamento\s*,\s*false\s*\)\s*=\s*false/i);
  assert.match(migration, /ae\.professor_id\s+is\s+null/i);
  assert.match(migration, /v_pendentes\s*=\s*45\s+and\s+v_vinculadas\s*=\s*0/i);
  assert.doesNotMatch(migration, /update\s+public\.aluno_presenca/i);
});

test('v3 agrega saidas uma vez sem recalcular a carteira canonica', () => {
  const migration = readOptional(performanceMigrationPath);

  assert.match(migration, /get_saidas_professor_periodo_agregadas_v1/i);
  assert.match(migration, /get_kpis_professor_periodo_canonico_v3/i);
  assert.match(migration, /from\s+public\.get_saidas_professor_periodo_agregadas_v1/i);
  assert.doesNotMatch(migration, /from\s+public\.get_saidas_professor_periodo_canonicas_v1/i);
  assert.doesNotMatch(migration, /get_carteira_professor_periodo_canonica/i);
});
