import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const semAcentos = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const migrationPath = 'supabase/migrations/20260801222500_corrigir_relatorio_gerencial_metas_matriculador.sql';
const integridadeMigrationPath = 'supabase/migrations/20260811123000_relatorio_gerencial_integridade_hibrido.sql';

test('produtor gerencial compoe somente fechamentos mensais e rankings canonicos', () => {
  assert.equal(fs.existsSync(path.join(root, migrationPath)), true, 'migration canonica ainda nao existe');
  const migration = read(migrationPath);

  assert.match(migration, /get_relatorio_gerencial_canonico_v1/);
  assert.match(migration, /get_relatorio_admin_mensal_rico_v1/);
  assert.match(migration, /get_relatorio_mensal_canonico_v1\s*\(\s*'comercial'/);
  assert.doesNotMatch(migration, /get_kpis_professor_periodo_canonico_v3/);
  assert.match(migration, /get_health_score_professor_v3_performance/);
  assert.match(migration, /h\.estado_publicacao\s*=\s*'oficial'/);
  assert.match(migration, /h\.ranking_habilitado/);
  assert.match(migration, /h\.snapshot_publicavel/);
  assert.match(migration, /h\.score is not null/);
  assert.match(migration, /c\.meta_taxa_showup_experimental/);
  assert.match(migration, /c\.meta_taxa_experimental_matricula/);
  assert.match(migration, /c\.meta_taxa_lead_matricula/);
  assert.match(migration, /c\.meta_volume_campo_grande/);
  assert.match(migration, /c\.meta_volume_recreio/);
  assert.match(migration, /c\.meta_volume_barra/);
  assert.match(migration, /c\.meta_ticket_campo_grande/);
  assert.match(migration, /c\.meta_ticket_recreio/);
  assert.match(migration, /c\.meta_ticket_barra/);
  assert.doesNotMatch(migration, /c\.metas_(?:volume|ticket)/);
  assert.match(migration, /get_health_score_professor_v3_performance/);
  assert.match(migration, /programa_matriculador_config/);
  assert.match(migration, /programa_fideliza_config/);
  assert.doesNotMatch(migration, /get_dados_relatorio_gerencial/);
  assert.match(migration, /comparativos[\s\S]*indisponivel/);
  assert.match(migration, /revoke all on function public\.get_relatorio_gerencial_canonico_v1/);
  assert.match(migration, /grant execute on function public\.get_relatorio_gerencial_canonico_v1[\s\S]*authenticated, service_role/);
});

test('edge busca o contrato no servidor e nao aceita numeros enviados pelo navegador', () => {
  const edge = read('supabase/functions/gemini-relatorio-gerencial/index.ts');
  const requestContract = edge.slice(
    edge.indexOf('interface RelatorioGerencialRequest'),
    edge.indexOf('interface RelatorioGerencialCanonico'),
  );

  assert.match(edge, /createClient/);
  assert.match(edge, /get_relatorio_gerencial_canonico_v1/);
  assert.match(edge, /contratoGerencialValido/);
  assert.match(requestContract, /unidade:\s*string/);
  assert.match(requestContract, /ano:\s*number/);
  assert.match(requestContract, /mes:\s*number/);
  assert.doesNotMatch(requestContract, /dados/);
  assert.match(edge, /authorization/i);
});

test('botao gerencial envia somente unidade e competencia para a edge', () => {
  const admin = read('src/components/App/Administrativo/ModalRelatorio.tsx');
  const body = admin.slice(
    admin.indexOf('async function gerarRelatorioGerencialIA()'),
    admin.indexOf('async function gerarRelatorioDiario()'),
  );

  assert.match(body, /gemini-relatorio-gerencial/);
  assert.match(body, /unidade:\s*unidadeUUID/);
  assert.match(body, /ano:\s*anoRelatorio/);
  assert.match(body, /mes:\s*mesRelatorio/);
  assert.doesNotMatch(body, /get_dados_relatorio_gerencial/);
  assert.doesNotMatch(body, /return `❌ Erro ao gerar relatório/);
  assert.doesNotMatch(body, /dados:/);
  assert.doesNotMatch(body, /unidade_nome/);
  assert.doesNotMatch(body, /is_consolidado/);
});

test('competencia sem fechamento retorna indisponibilidade explicita ao usuario', () => {
  const edge = read('supabase/functions/gemini-relatorio-gerencial/index.ts');
  const admin = read('src/components/App/Administrativo/ModalRelatorio.tsx');

  assert.match(edge, /RELATORIO_ADMIN_MENSAL_FECHADO_INVALIDO/);
  assert.match(edge, /indisponivel\s*\?\s*409\s*:\s*500/);
  assert.match(edge, /etapaRelatorio/);
  assert.match(admin, /errorEdge as \{ context\?: Response \}\)\.context/);
  assert.match(admin, /responseData\?\.error/);
});

test('texto publico preserva riqueza gerencial sem linguagem de implementacao', () => {
  const edge = read('supabase/functions/gemini-relatorio-gerencial/index.ts');
  const renderer = edge.slice(
    edge.indexOf('async function montarRelatorio'),
    edge.indexOf('Deno.serve'),
  );
  const rendererSemAcentos = semAcentos(renderer);

  for (const secao of [
    'FINANCEIRO',
    'BASE DE ALUNOS',
    'MATRICULAS',
    'TRANCAMENTOS',
    'FUNIL COMERCIAL',
    'RETENCAO',
    'RANKINGS',
    'METAS DO MES',
    'PROGRAMA FIDELIZA+ LA',
    'PROGRAMA MATRICULADOR+ LA',
    'CONQUISTAS DO MES',
    'PONTOS DE ATENCAO',
    'PLANO DE ACAO',
  ]) {
    assert.match(rendererSemAcentos, new RegExp(secao.replace(/[+]/g, '\\+'), 'i'));
  }

  assert.match(renderer, /faturado_emusys/);
  assert.match(renderer, /faturamento_realizado/);
  assert.match(rendererSemAcentos, /Faturado no Emusys \(pago \+ em aberto\)/i);
  assert.match(rendererSemAcentos, /Recebido na competencia \(pago\)/i);
  assert.match(renderer, /ticket_medio_parcela/);
  assert.match(renderer, /ticket_medio_passaporte/);
  assert.doesNotMatch(renderer, /linhaMeta\("Ticket da base ativa",\s*financeiro\.ticket_medio,\s*metasMensais\.ticket_parcela/);
  assert.match(renderer, /linhaMeta\(\s*"Ticket das novas parcelas",\s*comercialResumo\.ticket_medio_parcela,\s*metasOperacionais\.ticket_parcela/);
  assert.doesNotMatch(renderer, /linhaMeta\("Experimentais",\s*comercialResumo\.experimentais,\s*metasMensais\.experimentais/);
  assert.match(renderer, /matriculas_adicionais/);
  assert.match(renderer, /renovacoes_previstas/);
  assert.match(renderer, /avisos_previos/);
  assert.match(renderer, /trancamentos_detalhados/);
  assert.match(renderer, /alertas/);

  for (const termo of [
    'camada canonica',
    'conciliação canônica',
    'conciliacao canonica',
    'metricas legadas',
    'métricas legadas',
    'bloqueio seguro',
    'snapshot emusys',
    'fontes e snapshot',
    'nota de controle',
  ]) {
    assert.doesNotMatch(renderer.toLowerCase(), new RegExp(termo, 'i'));
  }
});

test('ausencia de dado nao e publicada como zero e comparacao incompatível e omitida', () => {
  const edge = read('supabase/functions/gemini-relatorio-gerencial/index.ts');
  const renderer = edge.slice(
    edge.indexOf('async function montarRelatorio'),
    edge.indexOf('Deno.serve'),
  );
  const rendererSemAcentos = semAcentos(renderer);

  assert.match(renderer, /comparativos\?\.status\s*===\s*["']disponivel["']/);
  assert.match(rendererSemAcentos, /comparacao nao disponivel/i);
  assert.doesNotMatch(renderer, /n\(dados\?\.vendas_lojinha\)/);
  assert.match(renderer, /lojinha[\s\S]*!=\s*null/i);
});

test('contrato gerencial explicita metas, cobertura, distribuicoes e destaques parciais', () => {
  const edge = read('supabase/functions/gemini-relatorio-gerencial/index.ts');
  assert.match(edge, /metas\??\.operacionais/);
  assert.match(edge, /cobertura_curso_interesse/);
  assert.match(edge, /leads_por_canal/);
  assert.match(edge, /matriculas_por_curso/);
  assert.match(edge, /rankings\.oficiais/);
  assert.match(edge, /rankings\.destaques_mensais_parciais/);
  assert.match(edge, /narrativaTemporalmenteSegura/);
  assert.match(edge, /normalizarControle\(bruto\)/);
});

test('migration de integridade publica campos separados e ACL nominal', () => {
  assert.equal(fs.existsSync(path.join(root, integridadeMigrationPath)), true, 'migration de integridade ainda nao existe');
  const sql = read(integridadeMigrationPath);
  assert.match(sql, /metas[\s\S]*operacionais/);
  assert.match(sql, /cobertura_curso_interesse/);
  assert.match(sql, /leads_por_canal/);
  assert.match(sql, /matriculas_por_curso/);
  assert.match(sql, /comparativos[\s\S]*disponibilidade/);
  assert.match(sql, /status_exigido[\s\S]*fechado/);
  assert.match(sql, /fingerprint_atual/);
  assert.match(sql, /fingerprint_anterior/);
  assert.match(sql, /destaques_mensais_parciais/);
  assert.match(sql, /revoke all on function public\.get_relatorio_gerencial_canonico_v1/);
  assert.match(sql, /grant execute on function public\.get_relatorio_gerencial_canonico_v1[\s\S]*authenticated, service_role/);
});
