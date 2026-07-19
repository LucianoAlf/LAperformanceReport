import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const migrationPath = 'supabase/migrations/20260711194341_kpis_professores_canonicos.sql';
const conversionMigrationPath = 'supabase/migrations/20260711195600_kpis_professores_conversao_canonica.sql';
const totalsMigrationPath = 'supabase/migrations/20260711213000_totais_professores_canonicos.sql';
const carteiraHistoricaMigrationPath = 'supabase/migrations/20260713232404_kpis_professores_carteira_historica_canonica.sql';
const carteiraSeguraMigrationPath = 'supabase/migrations/20260713233627_kpis_professores_carteira_rpc_segura.sql';
const performanceCanonicaMigrationPath = 'supabase/migrations/20260714233000_professores_performance_junho_canonica.sql';
const mediaTurmaRestauracaoMigrationPath = 'supabase/migrations/20260715151000_professores_media_turma_pessoas_unicas.sql';
const conversaoVinculoMigrationPath = 'supabase/migrations/20260714234500_professores_conversao_vinculo_direto.sql';
const snapshotAutomaticoMigrationPath = 'supabase/migrations/20260714235500_professores_snapshot_fechamento_automatico.sql';
const performancePath = 'src/components/App/Professores/TabPerformanceProfessores.tsx';
const modalPath = 'src/components/App/Professores/ModalDetalhesProfessorPerformance.tsx';
const modalConversaoPath = 'src/components/App/Professores/ModalDetalhesConversao.tsx';
const modalTurmasPath = 'src/components/App/Professores/ModalDetalhesTurmas.tsx';
const edgePath = 'supabase/functions/gemini-relatorio-coordenacao/index.ts';

const readOptional = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('migration define uma unica fonte canonica por competencia', () => {
  const migration = readOptional(migrationPath);

  assert.match(migration, /get_kpis_professor_periodo_canonico/i);
  assert.match(migration, /turmas_elegiveis_media/i);
  assert.match(migration, /is_projeto_banda/i);
  assert.match(migration, /coalesce\s*\(\s*a\.data_matricula[\s\S]*?\)\s*<=\s*v_fim/i);
  assert.match(migration, /data_saida\s+is\s+null\s+or\s+.*data_saida\s*>\s*v_fim/i);
  assert.match(migration, /get_dados_relatorio_coordenacao_legado/i);
  assert.match(migration, /get_kpis_professor_periodo_canonico/i);
});

test('media oficial usa pessoas unicas e nao infere ocupacoes de reagendamentos', () => {
  const baseMigration = readOptional(performanceCanonicaMigrationPath);
  const migration = readOptional(mediaTurmaRestauracaoMigrationPath);

  assert.match(baseMigration, /pessoa_chave/i);
  assert.match(baseMigration, /turma_chave/i);
  assert.match(baseMigration, /curso_emusys_depara/i);
  assert.match(baseMigration, /d\.unidade_id\s*=\s*ae\.unidade_id/i);
  assert.match(baseMigration, /d\.emusys_disciplina_id\s*=\s*ae\.curso_emusys_id/i);
  assert.match(migration, /count\s*\(\s*distinct\s+b\.pessoa_chave\s*\)/i);
  assert.match(migration, /count\s*\(\s*distinct\s+\(\s*b\.pessoa_chave\s*,\s*b\.turma_chave\s*\)\s*\)/i);
  assert.match(migration, /reagendad[oa]/i);
});

test('competencia fechada usa snapshot auditado sem reescrever historico', () => {
  const migration = readOptional(performanceCanonicaMigrationPath);

  assert.match(migration, /create table[^;]+professor_carteira_mensal_canonica/is);
  assert.match(migration, /unique\s*\(\s*competencia\s*,\s*unidade_id\s*,\s*professor_id\s*\)/i);
  assert.match(migration, /fonte[^,]*text/i);
  assert.match(migration, /coordenacao_emusys/i);
  assert.match(migration, /when\s+s\.prof_id\s+is\s+not\s+null\s+then\s+'snapshot_auditado'/i);
});

test('fechamento automatico preserva auditoria humana e roda depois dos syncs', () => {
  const migration = readOptional(snapshotAutomaticoMigrationPath);

  assert.match(migration, /capturar_carteira_professores_mensal/i);
  assert.match(migration, /count\s*\(\s*distinct\s+coalesce/i);
  assert.match(migration, /status_matricula\s*=\s*'ativa'/i);
  assert.match(migration, /on conflict\s*\(\s*competencia\s*,\s*unidade_id\s*,\s*professor_id\s*\)\s*do update/i);
  assert.match(migration, /where\s+professor_carteira_mensal_canonica\.fonte\s*=\s*\n?\s*'sync_matriculas_emusys_fechamento_automatico'/i);
  assert.match(migration, /snapshot-carteira-professores-mensal/i);
  assert.match(migration, /'30 3 1 \* \*'/i);
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated/i);
});

test('conversao do professor usa a conciliacao canonica do Emusys', () => {
  const migration = readOptional(conversaoVinculoMigrationPath);
  const modal = readOptional(modalConversaoPath);

  assert.match(migration, /get_experimentais_professor_canonicos_v1/i);
  assert.match(migration, /realizadas_emusys/i);
  assert.match(migration, /matriculas_pos_exp/i);
  assert.match(migration, /raw_matriculas_pos_exp/i);
  assert.match(migration, /\{aluno,id_lead\}/i);
  assert.match(migration, /le\.emusys_lead_id/i);
  assert.doesNotMatch(migration, /delta_unidade|candidato_extra|extras_anteriores/i);
  assert.doesNotMatch(modal, /pode superar o denominador/i);
});

test('performance paraleliza historico e descarta resposta obsoleta', () => {
  const performance = readOptional(performancePath);

  assert.match(performance, /Promise\.allSettled/i);
  assert.match(performance, /requisicaoAtivaRef/i);
  assert.match(performance, /if\s*\(\s*requisicaoId\s*!==\s*requisicaoAtivaRef\.current\s*\)/i);
});

test('detalhe historico nao mistura snapshot fechado com carteira atual', () => {
  const modal = readOptional(modalTurmasPath);

  assert.match(modal, /periodoIncluiHoje/i);
  assert.match(modal, /competencia fechada preserva os totais auditados/i);
  assert.match(modal, /API do Emusys nao fornece uma carteira historica retroativa/i);
  assert.match(modal, /if\s*\(\s*!periodoIncluiHoje\s*\)/i);
});

test('tela e modal consomem competencia e denominador canonicos', () => {
  const performance = readOptional(performancePath);
  const modal = readOptional(modalPath);

  assert.match(performance, /buscarKpisProfessoresCanonicos/);
  assert.match(performance, /turmas_elegiveis_media/);
  assert.match(modal, /turmas_elegiveis_media/);
  assert.match(modal, /\[competenciaInicial,\s*open,\s*professor\?\.id\]/);
  assert.match(modal, /formatCompetencia/);
  assert.doesNotMatch(modal, /new Date\(competencia\s*\+\s*['"]-01['"]\)/);
});

test('carteira historica usa grade Emusys e jornada ativa sem vinculo legado', () => {
  const migration = readOptional(carteiraHistoricaMigrationPath);

  assert.match(migration, /aula_alunos_emusys/i);
  assert.match(migration, /aluno_presenca/i);
  assert.match(migration, /aluno_jornada_matricula_disciplina/i);
  assert.match(migration, /status_matricula\s*=\s*'ativa'/i);
  assert.match(migration, /pessoa_chave/i);
  assert.match(migration, /turma_chave/i);
  assert.match(migration, /count\s*\(\s*distinct\s+b\.pessoa_chave\s*\)/i);
  assert.doesNotMatch(migration, /count\s*\(\s*\*\s*\)::integer\s+as\s+carteira_alunos/i);
});

test('rpc publica encapsula a carteira sem expor tabelas canonicas ao navegador', () => {
  const migration = readOptional(carteiraSeguraMigrationPath);

  assert.match(migration, /get_kpis_professor_periodo_canonico[\s\S]*security definer/i);
  assert.match(migration, /set search_path\s*=\s*public/i);
  assert.match(migration, /revoke[\s\S]*get_carteira_professor_periodo_canonica[\s\S]*authenticated/i);
  assert.match(migration, /revoke[\s\S]*get_kpis_professor_periodo_canonico_base_20260711[\s\S]*authenticated/i);
  assert.doesNotMatch(migration, /grant\s+select\s+on\s+(table\s+)?public\.aula_alunos_emusys/i);
});

test('relatorio com IA prioriza health score canonico', () => {
  const edge = readOptional(edgePath);

  assert.match(edge, /parseHealthScoreV3Payload/);
  assert.match(edge, /isHealthScoreV3Visible/);
  assert.match(edge, /health_score_v3/);
  assert.doesNotMatch(edge, /calcularHealthScore/);
});

test('totais do relatorio recomputam taxas pelos numeradores canonicos', () => {
  const migration = readOptional(totalsMigrationPath);
  assert.match(migration, /sum\s*\(\s*r\.alunos_via_turmas\s*\)/i);
  assert.match(migration, /sum\s*\(\s*r\.turmas_elegiveis_media\s*\)/i);
  assert.match(migration, /sum\s*\(\s*r\.matriculas_pos_exp\s*\)/i);
  assert.match(migration, /sum\s*\(\s*r\.experimentais\s*\)/i);
  assert.match(migration, /sum\s*\(\s*r\.renovacoes\s*\)/i);
  assert.match(migration, /sum\s*\(\s*r\.nao_renovacoes\s*\)/i);
});
