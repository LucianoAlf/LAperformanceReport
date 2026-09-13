import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// O repo guarda .ts/.tsx com CRLF no working tree; normalizar deixa os regex
// abaixo legiveis e independentes do fim de linha.
const ler = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const hook = ler('../src/hooks/useDashboardDados.ts');
const page = ler('../src/components/App/Dashboard/DashboardPage.tsx');

// As chaves que o JSX do desktop consome. Se o hook parar de devolver
// qualquer uma, a tela quebra em runtime — aqui quebra no teste.
const CHAVES = [
  'loading', 'alertas', 'dadosGestao', 'fonteKpisAlunos', 'dadosComercial',
  'dadosProfessores', 'evolucaoAlunos', 'funilComercial', 'resumoUnidades',
  'metas', 'labelPeriodo', 'unidade', 'competencia', 'anosDisponiveis',
  'setTipo', 'setAno', 'setMes', 'setTrimestre', 'setSemestre',
  'setDataInicio', 'setDataFim', 'leadsComercialV2', 'loadingLeadsComercialV2',
  'errorLeadsComercialV2', 'healthScoreV3Enabled', 'healthScoreV3Loading',
  'healthScoreV3Period', 'healthScoreV3Summary', 'taxaExpMatLiberada',
  'taxaExpMatSemBase', 'modalMatriculas', 'setModalMatriculas', 'modalEvasoes',
  'setModalEvasoes', 'modalExperimentais', 'setModalExperimentais',
  'modalConversao', 'setModalConversao', 'dadosModalMatriculas',
  'dadosModalEvasoes', 'dadosModalExperimentais', 'dadosModalConversao',
  'carregandoModal', 'fetchMatriculas', 'fetchEvasoes', 'fetchExperimentais',
  'fetchConversao',
];

test('o hook declara a interface DashboardDados com todas as chaves do JSX', () => {
  const bloco = hook.match(/export interface DashboardDados \{([\s\S]*?)\n\}/);
  assert.ok(bloco, 'faltou `export interface DashboardDados`');
  for (const chave of CHAVES) {
    assert.match(bloco[1], new RegExp(`\\n\\s*${chave}[?:]`), `interface sem a chave ${chave}`);
  }
});

// A interface sozinha nao prova nada: um `return {} as DashboardDados` passaria
// no teste acima e quebraria a tela inteira. Aqui a prova e o objeto devolvido.
test('o hook DEVOLVE todas as chaves, nao so as declara', () => {
  const corpo = hook.match(/export function useDashboardDados\(\): DashboardDados \{([\s\S]*)\n\}/);
  assert.ok(corpo, 'faltou `export function useDashboardDados(): DashboardDados`');
  const retorno = corpo[1].match(/\n  return \{\n([\s\S]*?)\n  \};/);
  assert.ok(retorno, 'o hook nao termina com um objeto literal `return { ... };`');
  for (const chave of CHAVES) {
    assert.match(
      retorno[1],
      new RegExp(`(^|[\\s,{])${chave}\\s*(,|:|$)`, 'm'),
      `o objeto devolvido nao tem a chave ${chave}`,
    );
  }
});

test('o DashboardPage consome o hook em vez de buscar por conta propria', () => {
  assert.match(
    page,
    /import \{[^}]*\buseDashboardDados\b[^}]*\} from ['"]@\/hooks\/useDashboardDados['"]/,
    'a pagina nao importa o hook',
  );
  assert.match(page, /=\s*useDashboardDados\(\);/, 'a pagina nao chama o hook');
  // A busca saiu da pagina: nenhum fetch/consulta pode ter ficado para tras.
  assert.doesNotMatch(page, /supabase\s*\n?\s*\.from\(/, 'sobrou consulta ao Supabase na pagina');
  assert.doesNotMatch(page, /\buseEffect\(/, 'sobrou useEffect na pagina');
  assert.doesNotMatch(page, /\buseState[<(]/, 'sobrou useState na pagina');
});

// "Mover, nao reescrever": a logica tem de aparecer INTEIRA no hook. Sem isto,
// apagar a busca da pagina e devolver zeros passaria nos testes acima.
test('a busca foi movida para o hook, nao reescrita', () => {
  for (const marco of [
    "from('vw_alertas_inteligentes')",
    'fetchKPIsAlunosCanonicos(',
    'fetchComercialOperacionalResumoV2(',
    'fetchExperimentaisDiagnosticoComercialV2(',
    'buscarResumoDashboardProfessoresCanonico(',
    "from('dados_mensais')",
    "from('alunos')",
    "from('leads')",
    "from('movimentacoes_admin')",
    'filtrarRetencaoCanonica(',
    'anexarCursosMovimentacoesAdmin(',
    'useHealthScoreProfessorV3Performance(',
    'getHealthScoreV3Period(',
    'useMetasKPI(',
    'useOutletContext<',
  ]) {
    assert.ok(hook.includes(marco), `o hook nao trouxe \`${marco}\` da pagina`);
  }
  // O early return de loading e o unico consumo de estado que fica na pagina.
  assert.match(page, /if \(loading\) \{/, 'a pagina perdeu o early return de loading');
});

test('os tipos saem do hook com export (Tasks 4 e 5 os importam)', () => {
  for (const tipo of [
    'DadosGestao', 'DadosComercial', 'DadosProfessores',
    'ResumoUnidade', 'Alerta', 'FonteKPIAlunosState',
  ]) {
    assert.match(
      hook,
      new RegExp(`export interface ${tipo} \\{`),
      `${tipo} precisa ser exportado do hook`,
    );
    assert.ok(
      !new RegExp(`\\binterface ${tipo} \\{`).test(page),
      `${tipo} continua declarado na pagina — a fonte tem de ser unica`,
    );
  }
});

test('o JSX do desktop nao foi reescrito: as 13 chamadas de KPICard continuam la', () => {
  const kpis = page.match(/<KPICard\b/g) ?? [];
  assert.equal(kpis.length, 13, `esperava 13 KPICard, achei ${kpis.length}`);
  // Rotulos que provam que os KPIs sao os mesmos, nao "equivalentes".
  for (const rotulo of ['Pagantes', 'Ticket Médio Parcelas', 'Taxa Exp→Mat',
                        'Ticket Médio Passaporte', 'Média Alunos/Turma']) {
    assert.ok(page.includes(rotulo), `sumiu o KPI "${rotulo}" do desktop`);
  }
});
