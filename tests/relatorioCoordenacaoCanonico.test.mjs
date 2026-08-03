import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migrationPath = 'supabase/migrations/20260802192000_relatorio_coordenacao_canonico.sql';
const correctionPath = 'supabase/migrations/20260803013000_relatorio_coordenacao_amostra_capacidade_honesta.sql';
const edgePath = 'supabase/functions/gemini-relatorio-coordenacao/index.ts';
const modalPath = 'src/components/App/Professores/ModalRelatorioCoordenacao.tsx';

const forbiddenPublicTerms = [
  'RPC',
  'snapshot',
  'migration',
  'camada canônica',
  'camada canonica',
  'read model',
  '(1/2)',
  '(2/2)',
];

test('produtor mensal da Coordenacao nasce no servidor e devolve contrato versionado', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration do produtor canônico deve existir');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.get_relatorio_coordenacao_canonico_v1\s*\(/i);
  assert.match(sql, /security\s+definer/i);
  assert.match(sql, /set\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
  assert.match(sql, /fn_health_score_professor_v3_ator_leitura\s*\(\s*p_unidade_id\s*\)/i);

  for (const key of [
    'schema_version', 'periodo', 'resumo_equipe', 'professores', 'mapa_sinais',
    'retencao_permanencia', 'presenca', 'experimentais', 'carteira_carga',
    'agenda_treinamentos', 'qualidade_dados', 'ranking_oficial', 'auditoria',
  ]) {
    assert.match(sql, new RegExp(`['"]${key}['"]`, 'i'), `contrato deve conter ${key}`);
  }

  assert.match(sql, /from\s+public\.professores\s+p/i);
  assert.match(sql, /professores_unidades/i);
  assert.match(sql, /fonte_canonica_indisponivel/i);
  assert.match(sql, /ranking_habilitado/i);
  assert.match(sql, /estado_publicacao\s*=\s*'oficial'/i);
});
test('correcao separa amostra observada de conversao pontuada no fechamento', () => {
  assert.equal(fs.existsSync(correctionPath), true, 'migration corretiva deve existir');
  const sql = fs.readFileSync(correctionPath, 'utf8');

  assert.match(sql, /professores_com_amostra_minima/i);
  assert.match(sql, /professores_com_conversao_pontuando/i);
  assert.match(sql, /amostra_minima/i);
  assert.match(sql, /peso_efetivo/i);
});

test('Edge busca o contrato com o JWT e limita a IA a narrativa', () => {
  const source = fs.readFileSync(edgePath, 'utf8');

  assert.match(source, /createClient/i);
  assert.match(source, /authorization/i);
  assert.match(source, /get_relatorio_coordenacao_canonico_v2/i);
  assert.match(source, /body\?\.unidade|body\.unidade/i);
  assert.match(source, /body\?\.ano|body\.ano/i);
  assert.match(source, /body\?\.mes|body\.mes/i);
  assert.doesNotMatch(source, /const\s+dados\s*=\s*body\.dados/i);
  assert.match(source, /resumo[\s\S]*conquistas[\s\S]*pontos_atencao[\s\S]*treinamentos[\s\S]*plano_acao/i);
  assert.match(source, /fallback|narrativaPadrao|narrativaDeterministica/i);
  assert.match(source, /sanitizarTextoPublico|assertPublicReportSafe/i);
});

test('texto público bloqueia finanças, termos internos e paginação artificial', () => {
  const source = fs.readFileSync(edgePath, 'utf8');
  const rendererStart = source.indexOf('function renderizarRelatorio');
  assert.notEqual(rendererStart, -1, 'renderer determinístico deve existir');
  const renderer = source.slice(rendererStart);

  for (const term of forbiddenPublicTerms) {
    assert.match(
      source,
      new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      `termo ${term} deve estar na lista de bloqueio/sanitização`,
    );
  }

  assert.doesNotMatch(renderer, /MRR|ticket\s+m[eé]dio|faturamento|parcela|financeiro/i);
  assert.match(renderer, /TODOS OS PROFESSORES|PROFESSORES DA EQUIPE/i);
  assert.match(renderer, /QUALIDADE DOS DADOS/i);
  assert.match(renderer, /MAPA DE SINAIS/i);
  assert.match(renderer, /recesso/i);
});

test('relatorio distingue mes vivo de dados historicos fechados sem chamar tudo de parcial', () => {
  const source = fs.readFileSync(edgePath, 'utf8');

  assert.match(source, /estado_publicacao\s*===\s*["']em_andamento["']/i);
  assert.match(source, /leitura do mês em andamento/i);
  assert.match(source, /Professores com nota disponível/i);
  assert.match(source, /dados operacionais estão fechados/i);
  assert.match(source, /ranking e premiação aguardam o fechamento oficial do ciclo/i);
});

test('botão mensal envia somente filtros e mantém cópia robusta', () => {
  const source = fs.readFileSync(modalPath, 'utf8');
  const monthlyStart = source.indexOf('const gerarRelatorioIA');
  const instantStart = source.indexOf('const gerarRelatorioInstantaneo');
  assert.notEqual(monthlyStart, -1);
  assert.notEqual(instantStart, -1);
  const monthly = source.slice(monthlyStart, instantStart);

  assert.match(monthly, /body\s*:\s*\{\s*unidade\s*:\s*unidadeId\s*,\s*ano\s*:\s*anoRelatorio\s*,\s*mes\s*:\s*mesRelatorio\s*\}/s);
  assert.doesNotMatch(monthly, /dados\s*:/i);
  assert.doesNotMatch(monthly, /buscarDadosRelatorioCoordenacao|buscarKpisHealthV3RelatorioCoordenacao/i);
  assert.match(source, /copyTextToClipboard\(textoRelatorio\)/);
  assert.match(source, /getManualCopyShortcut/);
});

test('relatorio explica amostra e capacidade estimada sem prescrever sobrecarga', () => {
  const source = fs.readFileSync(edgePath, 'utf8');

  assert.match(source, /const\s+alertas\s*=\s*filtrarSinaisParaNarrativa\(dados\.mapa_sinais\)/i);
  assert.match(source, /mapa_sinais:\s*filtrarSinaisParaNarrativa\(dados\.mapa_sinais\)/i);

  assert.match(source, /Professores com amostra m[ií]nima observada/i);
  assert.match(source, /Convers[aã]o compondo a nota hist[oó]rica/i);
  assert.match(source, /Capacidade estimada . conferir cadastro/i);
  assert.match(source, /capacidade estimada[\s\S]{0,300}n[aã]o[\s\S]{0,160}(sobrecarga|treinamento)/i);
});
