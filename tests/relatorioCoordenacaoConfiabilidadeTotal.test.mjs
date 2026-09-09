import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migrationPath = 'supabase/migrations/20260909142301_coordenacao_confiabilidade_total.sql';
const edgePath = 'supabase/functions/gemini-relatorio-coordenacao/index.ts';
const pagePath = 'src/components/App/Professores/TabPerformanceProfessores.tsx';

test('migration publica o fechamento completo e não usa o veto por indicador isolado', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration corretiva deve existir');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const fechamento = sql.slice(sql.indexOf('create or replace function public.fechar_health_score_professor_v3_ciclo'));

  assert.match(fechamento, /RELATORIO.*RECORTE_INCOMPLETO|FECHAMENTO.*RECORTE_INCOMPLETO/i);
  assert.match(fechamento, /snapshots_esperados/i);
  assert.match(fechamento, /snapshots_fechados/i);
  assert.match(fechamento, /comparaveis_esperados/i);
  assert.doesNotMatch(fechamento, /m\.nota\s+is\s+not\s+null[\s\S]{0,200}apta_oficial/i);
  assert.match(sql, /snapshot_ids/i);
  assert.match(sql, /2026-JUN-AGO/i);
});

test('presença do Health Score usa ocorrências classificadas sem bloqueio global da unidade', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const inicio = sql.indexOf('create or replace function public.get_health_score_professor_v3_presenca_periodo_v2');
  const fim = sql.indexOf('create or replace function public.fechar_health_score_professor_v3_ciclo', inicio);
  const presenca = sql.slice(inicio, fim);

  assert.match(presenca, /fn_presenca_ocorrencias_escopo_interno_v2/i);
  assert.match(presenca, /considera_frequencia_denominador/i);
  assert.match(presenca, /ocorrencias_fora_calculo/i);
  assert.doesNotMatch(presenca, /fn_presenca_estado_publicacao_periodo_v2/i);
  assert.doesNotMatch(presenca, /bloqueado_roster|em_auditoria/i);
});

test('produtor identifica conversão pontuando, universos e qualidade da presença', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /professores_conversao_pontuando/i);
  assert.match(sql, /peso_efetivo/i);
  assert.match(sql, /turmas_usadas_na_media_individual/i);
  assert.match(sql, /ocorrencias_incompletas/i);
  assert.match(sql, /ocorrencias_com_conflito/i);
  assert.match(sql, /coordenacao-v4-confiabilidade-total-20260909/i);
});

test('relatório completo cobre todas as prioridades uma vez e mostra a versão', () => {
  const source = fs.readFileSync(edgePath, 'utf8');
  assert.doesNotMatch(source, /prioridades\.slice\(0,\s*3\)/);
  assert.match(source, /isCicloOficialCompleto/);
  assert.match(source, /documento\.versao|dados\.documento\?\.versao/);
  assert.match(source, /treinamentosPorProfessor/);
  assert.match(source, /professores_conversao_pontuando/);
});

test('página distingue ciclo oficial completo de ciclo em andamento', () => {
  const source = fs.readFileSync(pagePath, 'utf8');
  assert.match(source, /cicloOficialCompleto/);
  assert.match(source, /Ciclo oficial fechado/);
  assert.match(source, /Ciclo em acompanhamento/);
  assert.doesNotMatch(source, />\s*Health Score em andamento usa os dados já disponíveis da competência\./);
});
