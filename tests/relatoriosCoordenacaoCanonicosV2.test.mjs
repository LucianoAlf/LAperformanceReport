import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { gerarRelatorioCoordenacaoCanonico } from '../src/lib/relatorioCoordenacaoCanonico.ts';

const migrationPath = 'supabase/migrations/20260803110000_relatorios_coordenacao_canonicos_v2.sql';
const migrationV3Path = 'supabase/migrations/20260803223000_relatorios_coordenacao_periodicidade_canonica.sql';
const modalPath = 'src/components/App/Professores/ModalRelatorioCoordenacao.tsx';
const edgePath = 'supabase/functions/gemini-relatorio-coordenacao/index.ts';

const metrica = (valor, amostra, pesoEfetivo = 0) => ({
  valor,
  amostra,
  peso_efetivo: pesoEfetivo,
  papel: 'nota',
  codigo_evidencia: valor === null ? 'fonte_canonica_indisponivel' : 'evidencia_valida',
});

const professor = ({
  id,
  nome,
  score,
  carteira,
  turmas,
  ocupacoes,
  elegiveis,
  media,
  presenca,
  presencaAmostra,
  retencao = 100,
  retencaoAmostra = carteira,
  estado = 'parcial',
}) => ({
  professor_id: id,
  nome,
  score,
  score_observado: score,
  score_comparavel: estado === 'em_maturacao' ? null : score,
  cobertura: 75,
  classificacao: estado === 'em_maturacao' ? null : score >= 80 ? 'saudavel' : 'atencao',
  estado_publicacao: estado,
  score_exibivel: true,
  ranking_habilitado: false,
  estado_evidencia: estado === 'em_maturacao' ? 'professor_em_maturacao' : 'avaliacao_parcial',
  pilares_validos: estado === 'em_maturacao' ? 2 : 4,
  pilares_esperados: 5,
  comparabilidade_estado: estado === 'em_maturacao' ? 'em_maturacao' : 'comparavel',
  comparabilidade_motivo: estado === 'em_maturacao' ? 'pilares_insuficientes' : 'criterios_atendidos',
  competencia_referencia: estado === 'em_maturacao' ? '2026-06-01' : null,
  score_referencia: estado === 'em_maturacao' ? 72 : null,
  metricas: {
    retencao: metrica(retencao, retencaoAmostra, 33.3),
    permanencia: metrica(10, 20, 33.3),
    conversao: metrica(33.3, 3, 0),
    media_turma: metrica(media, elegiveis, 20),
    numero_alunos: { ...metrica(carteira, carteira, 0), papel: 'diagnostico' },
    presenca: metrica(presenca, presencaAmostra, 13.3),
  },
  operacional: {
    total_turmas: turmas,
    alunos_via_turmas: ocupacoes,
    turmas_elegiveis_media: elegiveis,
  },
});

const contrato = {
  schema_version: 2,
  periodo: {
    unidade_id: '95553e96-971b-4590-a6eb-0201d013c14d',
    unidade_nome: 'Recreio',
    ano: 2026,
    mes: 7,
    inicio: '2026-07-01',
    fim: '2026-07-31',
  },
  resumo_equipe: {
    total_professores: 24,
    com_score: 24,
    parciais: 20,
    comparaveis: 1,
    em_maturacao: 4,
    sem_base_operacional: 0,
    score_medio_comparavel: 93.4,
  },
  professores: [
    professor({
      id: 1,
      nome: 'Professor Maior Score',
      score: 93.4,
      carteira: 51,
      turmas: 47,
      ocupacoes: 54,
      elegiveis: 46,
      media: 1.17,
      presenca: 53.1,
      presencaAmostra: 64,
      retencao: 94.4,
      retencaoAmostra: 54,
    }),
    professor({
      id: 2,
      nome: 'Professor Menor Score',
      score: 66.7,
      carteira: 1,
      turmas: 3,
      ocupacoes: 3,
      elegiveis: 3,
      media: 1,
      presenca: 85.7,
      presencaAmostra: 7,
      estado: 'em_maturacao',
    }),
  ],
  presenca: {
    presenca_media: 65.9,
    professores_com_evidencia: 24,
    pendencias: 0,
    eventos_elegiveis: 2098,
    presencas_confirmadas: 1382,
  },
  carteira_carga: {
    alunos_na_carteira: 417,
    professores_com_carteira_observada: 24,
    media_por_professor: 17.4,
    total_turmas_operacionais: 407,
    ocupacoes_elegiveis: 469,
    turmas_elegiveis: 391,
    media_alunos_turma: 1.2,
  },
  retencao_permanencia: {
    retencao_media: 96.8,
    professores_com_retencao: 24,
  },
  saidas_retencao: {
    evasoes_validas: 5,
    nao_renovacoes_validas: 2,
    saidas_validas_total: 7,
    saidas_atribuiveis_professor: 1,
    mrr_perdido_total: 2412.85,
    mrr_perdido_atribuivel: 395,
    movimentos: [
      {
        id: 10,
        data: '2026-07-15',
        tipo: 'evasao',
        aluno_nome: 'Aluno Movimento Geral',
        professor_id: 1,
        professor_nome: 'Professor Maior Score',
        valor_mrr: 1597.85,
        conta_score_professor: false,
      },
      {
        id: 11,
        data: '2026-07-20',
        tipo: 'evasao',
        aluno_nome: 'Aluno Movimento Atribuivel',
        professor_id: 2,
        professor_nome: 'Professor Menor Score',
        valor_mrr: 395,
        conta_score_professor: true,
      },
      {
        id: 12,
        data: '2026-07-25',
        tipo: 'nao_renovacao',
        aluno_nome: 'Aluno sem professor informado',
        professor_id: null,
        professor_nome: 'Professor não informado',
        valor_mrr: 420,
        conta_score_professor: false,
      },
    ],
  },
  ranking_oficial: null,
  auditoria: {
    contrato: 'relatorio-coordenacao-pedagogica-2',
    imutavel: true,
    fonte_publica: 'Fechamento mensal da Coordenação',
  },
};

const params = (tipo) => ({
  tipo,
  contrato,
  dataGeracao: new Date('2026-08-03T09:00:00-03:00'),
});

test('V2 permanece compativel e os cinco relatorios atuais usam o contrato canonico V3', () => {
  assert.equal(fs.existsSync(migrationPath), true);
  assert.equal(fs.existsSync(migrationV3Path), true);
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const sqlV3 = fs.readFileSync(migrationV3Path, 'utf8');
  const modal = fs.readFileSync(modalPath, 'utf8');
  const edge = fs.readFileSync(edgePath, 'utf8');

  assert.match(sql, /get_relatorio_coordenacao_canonico_v2/i);
  assert.match(sql, /fechamento_mensal_snapshots/i);
  assert.match(sql, /hash_jsonb_canonico/i);
  assert.match(sqlV3, /get_relatorio_coordenacao_canonico_v3/i);
  assert.match(sqlV3, /get_relatorio_coordenacao_canonico_v2/i);
  assert.match(modal, /get_relatorio_coordenacao_canonico_v3/i);
  assert.match(modal, /gerarRelatorioCoordenacaoCanonico/i);
  assert.doesNotMatch(modal.slice(modal.indexOf('const gerarRelatorioInstantaneo'), modal.indexOf('const regenerarRelatorio')), /professores,/i);
  assert.match(edge, /get_relatorio_coordenacao_canonico_v3/i);
  assert.match(edge, /schema_version\s*!==\s*3/i);
});

test('relatorio separa score comparavel de desempenho observado sem publicar premiacao parcial', () => {
  const texto = gerarRelatorioCoordenacaoCanonico(params('ranking'));

  assert.match(texto, /Professores comparáveis: \*1\*/);
  assert.match(texto, /Média do Health Score comparável: \*93,4\*/);
  assert.match(texto, /Professor Maior Score[\s\S]*93,4 pontos/);
  assert.match(texto, /Professor Menor Score[^\n]*Desempenho observado: 66,7/);
  assert.ok(texto.indexOf('Professor Maior Score') < texto.indexOf('Professor Menor Score'));
  assert.match(texto, /ranking e premiação exigem ciclo oficial fechado/i);
  assert.doesNotMatch(texto, /Health Score parcial médio: \*Sem base\*/i);
});

test('carteira explicita os graos sem chamar 417 de pessoas unicas', () => {
  const texto = gerarRelatorioCoordenacaoCanonico(params('carteira'));

  assert.match(texto, /Vínculos de acompanhamento nas carteiras: \*417\*/);
  assert.match(texto, /Turmas operacionais: \*407\*/);
  assert.match(texto, /Ocupações elegíveis: \*469\*/);
  assert.match(texto, /Turmas elegíveis para a média: \*391\*/);
  assert.match(texto, /Média ponderada alunos\/turma: \*1,20\*/);
  assert.doesNotMatch(texto, /Total de alunos na carteira: \*417\*/);
});

test('presenca usa o fechamento ponderado compartilhado pelo mensal', () => {
  const texto = gerarRelatorioCoordenacaoCanonico(params('presenca'));

  assert.match(texto, /Presença média ponderada: \*65,9%\*/);
  assert.match(texto, /Presenças confirmadas: \*1\.382\/2\.098\*/);
  assert.match(texto, /Professores com evidência: \*24\*/);
  assert.match(texto, /Pendências de evidência: \*0\*/);
});

test('presenca indisponivel nao vira zero artificial', () => {
  const contratoSemPresenca = structuredClone(contrato);
  contratoSemPresenca.presenca = {
    presenca_media: null,
    professores_com_evidencia: 0,
    pendencias: 32,
    eventos_elegiveis: 0,
    presencas_confirmadas: 0,
  };

  const texto = gerarRelatorioCoordenacaoCanonico({
    tipo: 'presenca',
    contrato: contratoSemPresenca,
    dataGeracao: new Date('2026-08-03T09:00:00-03:00'),
  });

  assert.match(texto, /Presença média ponderada: \*não calculável%\*/);
  assert.doesNotMatch(texto, /Presença média ponderada: \*0,0%\*/);
  assert.match(texto, /Pendências de evidência: \*32\*/);
});

test('retencao separa movimento total de impacto atribuivel e explica todo o MRR', () => {
  const texto = gerarRelatorioCoordenacaoCanonico(params('retencao'));

  assert.match(texto, /Retenção atribuível observada: \*96,8%\*/);
  assert.match(texto, /Evasões válidas: \*5\*/);
  assert.match(texto, /Não renovações válidas: \*2\*/);
  assert.match(texto, /Saídas atribuíveis ao professor: \*1\*/);
  assert.match(texto, /MRR perdido total: \*R\$ 2\.412,85\*/);
  assert.match(texto, /MRR atribuível ao professor: \*R\$ 395,00\*/);
  assert.match(texto, /Aluno Movimento Geral/);
  assert.match(texto, /Aluno Movimento Atribuivel/);
  assert.match(texto, /Aluno sem professor informado/);
});

test('texto publico sai em UTF-8 legivel e sem nomenclatura interna', () => {
  const textos = ['ranking', 'carteira', 'presenca', 'retencao']
    .map((tipo) => gerarRelatorioCoordenacaoCanonico(params(tipo)));

  for (const texto of textos) {
    assert.match(texto, /RELATÓRIO/);
    assert.doesNotMatch(texto, /Ãƒ|Ã§|Ã©|â”|ðŸ|â€¢|â€”/);
    assert.doesNotMatch(texto, /\bRPC\b|snapshot|migration|get_[a-z0-9_]+/i);
    assert.doesNotMatch(texto, /\(1\/2\)|\(2\/2\)/);
  }
});
