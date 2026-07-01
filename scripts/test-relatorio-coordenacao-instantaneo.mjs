import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/relatorioCoordenacaoInstantaneo.ts', import.meta.url), 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const mod = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`);

const professoresNormalizados = mod.normalizarKpisProfessoresCoordenacao([
  {
    professor_id: 77,
    professor_nome: 'Carlos Canonico',
    cursos: ['Piano', 'Canto'],
    carteira_alunos: 21,
    total_turmas: 12,
    media_alunos_turma: 1.75,
    taxa_retencao: 95.2,
    taxa_conversao: 40,
    experimentais: 5,
    matriculas_pos_exp: 2,
    matriculas: 3,
    media_presenca: 82.5,
    evasoes: 1,
    nao_renovacoes: 1,
    mrr_perdido: 720,
    health_score: 88,
  },
]);

assert.equal(professoresNormalizados.length, 1);
assert.equal(professoresNormalizados[0].nome, 'Carlos Canonico');
assert.equal(professoresNormalizados[0].total_alunos, 21);
assert.equal(professoresNormalizados[0].total_turmas, 12);
assert.equal(professoresNormalizados[0].taxa_presenca, 82.5);
assert.equal(professoresNormalizados[0].evasoes_mes, 1);
assert.equal(professoresNormalizados[0].nao_renovacoes_mes, 1);
assert.equal(professoresNormalizados[0].mrr_perdido, 720);

const professores = [
  {
    id: 1,
    nome: 'Ana Forte',
    especialidades: ['Canto'],
    total_alunos: 30,
    total_turmas: 15,
    alunos_via_turmas: 30,
    media_alunos_turma: 2,
    taxa_retencao: 96,
    taxa_conversao: 50,
    experimentais: 4,
    experimentais_faltas: 1,
    matriculas_pos_exp: 2,
    matriculas_diretas: 1,
    taxa_presenca: 88,
    taxa_faltas: 12,
    evasoes_mes: 0,
    nao_renovacoes_mes: 0,
    mrr_perdido: 0,
    status: 'excelente',
    health_score: 92,
    health_status: 'saudavel',
    fator_demanda_ponderado: 1.1,
  },
  {
    id: 2,
    nome: 'Bruno Alerta',
    especialidades: ['Bateria'],
    total_alunos: 12,
    total_turmas: 10,
    alunos_via_turmas: 12,
    media_alunos_turma: 1.2,
    taxa_retencao: 82,
    taxa_conversao: 0,
    experimentais: 2,
    experimentais_faltas: 2,
    matriculas_pos_exp: 0,
    matriculas_diretas: 0,
    taxa_presenca: 61,
    taxa_faltas: 39,
    evasoes_mes: 3,
    nao_renovacoes_mes: 1,
    mrr_perdido: 1200,
    status: 'atencao',
    health_score: 48,
    health_status: 'atencao',
    fator_demanda_ponderado: 0.9,
  },
];

const base = {
  professores,
  unidadeNome: 'Campo Grande',
  periodoLabel: 'Junho/2026',
  intervaloLabel: '01/06/2026 ate 30/06/2026',
  dataGeracao: new Date('2026-07-01T12:00:00-03:00'),
};

const ranking = mod.gerarRelatorioCoordenacaoInstantaneo({ ...base, tipo: 'ranking' });
assert.match(ranking, /RELATORIO RANKING DE PROFESSORES/);
assert.match(ranking, /Ana Forte - 92 pontos/);
assert.match(ranking, /Fonte: indicadores canonicos da competencia selecionada no LA Report/);

const presenca = mod.gerarRelatorioCoordenacaoInstantaneo({ ...base, tipo: 'presenca' });
assert.match(presenca, /Bruno Alerta - 61\.0%/);
assert.match(presenca, /3 evasoes/);

const carteira = mod.gerarRelatorioCoordenacaoInstantaneo({ ...base, tipo: 'carteira' });
assert.match(carteira, /Total de alunos na carteira: \*42\*/);
assert.match(carteira, /Media geral alunos\/turma: \*1\.68\*/);

const retencao = mod.gerarRelatorioCoordenacaoInstantaneo({ ...base, tipo: 'retencao' });
assert.match(retencao, /MRR perdido estimado: \*R\$ 1\.200,00\*/);
assert.match(retencao, /Bruno Alerta - 3 evasoes/);

console.log('relatorioCoordenacaoInstantaneo ok');
