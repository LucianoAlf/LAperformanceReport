export type TipoRelatorioCoordenacaoCanonico =
  | 'ranking'
  | 'carteira'
  | 'presenca'
  | 'retencao';

export interface MetricaCoordenacaoCanonica {
  valor?: number | null;
  amostra?: number | null;
  numerador?: number | null;
  denominador?: number | null;
  peso_efetivo?: number | null;
  papel?: string | null;
  codigo_evidencia?: string | null;
  motivo?: string | null;
}

export interface ProfessorCoordenacaoCanonico {
  professor_id: number;
  nome: string;
  score?: number | null;
  cobertura?: number | null;
  classificacao?: string | null;
  estado_publicacao?: string | null;
  score_exibivel?: boolean;
  ranking_habilitado?: boolean;
  estado_evidencia?: string | null;
  metricas?: Record<string, MetricaCoordenacaoCanonica | undefined>;
  operacional?: {
    total_turmas?: number | null;
    alunos_via_turmas?: number | null;
    turmas_elegiveis_media?: number | null;
  };
}

export interface MovimentoRetencaoCoordenacaoCanonico {
  id: number;
  data: string;
  tipo: 'evasao' | 'nao_renovacao' | string;
  aluno_nome: string;
  professor_id?: number | null;
  professor_nome?: string | null;
  motivo?: string | null;
  valor_mrr: number;
  conta_score_professor: boolean;
}

export interface RelatorioCoordenacaoCanonicoV2 {
  schema_version: 2;
  periodo: {
    unidade_id: string | null;
    unidade_nome: string;
    ano: number;
    mes: number;
    inicio: string;
    fim: string;
  };
  resumo_equipe: {
    total_professores?: number;
    com_score?: number;
    parciais?: number;
    oficiais?: number;
    em_maturacao?: number;
    score_medio_visivel?: number | null;
  };
  professores: ProfessorCoordenacaoCanonico[];
  presenca: {
    presenca_media?: number | null;
    professores_com_evidencia?: number;
    pendencias?: number;
    eventos_elegiveis?: number;
    presencas_confirmadas?: number;
  };
  carteira_carga: {
    alunos_na_carteira?: number;
    professores_com_carteira_observada?: number;
    media_por_professor?: number | null;
    total_turmas_operacionais?: number;
    ocupacoes_elegiveis?: number;
    turmas_elegiveis?: number;
    media_alunos_turma?: number | null;
  };
  retencao_permanencia: {
    retencao_media?: number | null;
    professores_com_retencao?: number;
  };
  saidas_retencao: {
    evasoes_validas?: number;
    nao_renovacoes_validas?: number;
    saidas_validas_total?: number;
    saidas_atribuiveis_professor?: number;
    mrr_perdido_total?: number;
    mrr_perdido_atribuivel?: number;
    movimentos?: MovimentoRetencaoCoordenacaoCanonico[];
  };
  ranking_oficial?: Array<{ professor_id?: number; nome: string; score: number }> | null;
  auditoria?: {
    contrato?: string;
    imutavel?: boolean;
    fonte_publica?: string;
    snapshot_id?: string;
    payload_hash?: string;
    versao?: number;
    status?: string;
  };
}

interface GerarRelatorioCoordenacaoCanonicoParams {
  tipo: TipoRelatorioCoordenacaoCanonico;
  contrato: RelatorioCoordenacaoCanonicoV2;
  dataGeracao?: Date;
}

const moeda = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
});

const inteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

function numero(valor: unknown, casas = 1): string {
  const convertido = Number(valor);
  if (!Number.isFinite(convertido)) return 'não calculável';
  return convertido.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

function numeroInteiro(valor: unknown): string {
  const convertido = Number(valor ?? 0);
  return inteiro.format(Number.isFinite(convertido) ? convertido : 0);
}

function formatarMoeda(valor: unknown): string {
  const convertido = Number(valor ?? 0);
  return moeda.format(Number.isFinite(convertido) ? convertido : 0).replace(/[\u00a0\u202f]/g, ' ');
}

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = String(dataIso || '').slice(0, 10).split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : 'Data não informada';
}

function formatarDataHora(data: Date): string {
  return data.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function metrica(
  professor: ProfessorCoordenacaoCanonico,
  chave: string,
): MetricaCoordenacaoCanonica | undefined {
  return professor.metricas?.[chave];
}

function valorMetrica(professor: ProfessorCoordenacaoCanonico, chave: string): number | null {
  const valor = metrica(professor, chave)?.valor;
  const convertido = Number(valor);
  return valor === null || valor === undefined || !Number.isFinite(convertido) ? null : convertido;
}

function cabecalho(titulo: string, contrato: RelatorioCoordenacaoCanonicoV2): string[] {
  const { periodo } = contrato;
  const mesAno = new Date(periodo.ano, periodo.mes - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    .toUpperCase();
  return [
    '━━━━━━━━━━━━━━━━━━━━━━',
    `📊 *${titulo}*`,
    `🏢 *${periodo.unidade_nome.toUpperCase()}*`,
    `📅 *${mesAno}*`,
    `🗓 Período: ${formatarData(periodo.inicio)} até ${formatarData(periodo.fim)}`,
    '━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '_Dados oficiais da competência selecionada no LA Report._',
    '',
  ];
}

function rodape(dataGeracao = new Date()): string[] {
  return [
    '',
    '━━━━━━━━━━━━━━━━━━━━━━',
    `📅 Gerado em: ${formatarDataHora(dataGeracao)}`,
    '━━━━━━━━━━━━━━━━━━━━━━',
  ];
}

function professoresComScore(contrato: RelatorioCoordenacaoCanonicoV2) {
  return contrato.professores
    .filter((professor) => professor.score_exibivel !== false && Number.isFinite(Number(professor.score)))
    .sort((a, b) => Number(b.score) - Number(a.score) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

function gerarRanking(params: GerarRelatorioCoordenacaoCanonicoParams): string {
  const { contrato } = params;
  const resumo = contrato.resumo_equipe;
  const visiveis = professoresComScore(contrato);
  const oficial = Array.isArray(contrato.ranking_oficial) && contrato.ranking_oficial.length > 0;
  const linhasProfessores = oficial
    ? contrato.ranking_oficial!.map((professor, indice) =>
      `${indice + 1}. ${professor.nome} — ${numero(professor.score, 1)} pontos`)
    : visiveis.map((professor) => {
      const cobertura = Number.isFinite(Number(professor.cobertura))
        ? ` | Cobertura: ${numero(professor.cobertura, 1)}%`
        : '';
      const estado = professor.estado_evidencia === 'professor_em_maturacao' ? ' | Em maturação' : '';
      return `• ${professor.nome} — ${numero(professor.score, 1)} pontos${cobertura}${estado}`;
    });

  return [
    ...cabecalho('RELATÓRIO DE PROFESSORES — HEALTH SCORE', contrato),
    '👨‍🏫 *RESUMO DA EQUIPE*',
    '━━━━━━━━━━━━━━━━━━━━━━',
    `• Professores ativos: *${numeroInteiro(resumo.total_professores)}*`,
    `• Professores com nota diagnóstica: *${numeroInteiro(resumo.com_score)}*`,
    `• Média das notas visíveis: *${numero(resumo.score_medio_visivel, 1)}*`,
    `• Em maturação: *${numeroInteiro(resumo.em_maturacao)}*`,
    '',
    oficial ? '🏆 *RANKING OFICIAL DO CICLO*' : '📋 *NOTAS VISÍVEIS EM ORDEM DIAGNÓSTICA*',
    '━━━━━━━━━━━━━━━━━━━━━━',
    ...(linhasProfessores.length > 0 ? linhasProfessores : ['• Nenhuma nota disponível nesta competência.']),
    '',
    ...(oficial ? [] : [
      'ℹ️ Esta ordem serve para acompanhamento pedagógico; não vale como ranking oficial nem gera premiação.',
    ]),
    ...rodape(params.dataGeracao),
  ].join('\n');
}

function gerarCarteira(params: GerarRelatorioCoordenacaoCanonicoParams): string {
  const { contrato } = params;
  const carteira = contrato.carteira_carga;
  const professores = [...contrato.professores];
  const maiores = professores
    .filter((professor) => valorMetrica(professor, 'numero_alunos') !== null)
    .sort((a, b) => Number(valorMetrica(b, 'numero_alunos')) - Number(valorMetrica(a, 'numero_alunos')))
    .slice(0, 5);
  const maiorVolume = professores
    .filter((professor) => Number(professor.operacional?.total_turmas || 0) > 0)
    .sort((a, b) => Number(b.operacional?.total_turmas) - Number(a.operacional?.total_turmas))
    .slice(0, 5);
  const baixaMedia = professores
    .filter((professor) => {
      const media = valorMetrica(professor, 'media_turma');
      return media !== null && media < 1.5;
    })
    .sort((a, b) => Number(valorMetrica(a, 'media_turma')) - Number(valorMetrica(b, 'media_turma')))
    .slice(0, 8);

  return [
    ...cabecalho('RELATÓRIO CARTEIRA E CARGA PEDAGÓGICA', contrato),
    '📦 *VISÃO GERAL DA CARTEIRA*',
    '━━━━━━━━━━━━━━━━━━━━━━',
    `• Vínculos de acompanhamento nas carteiras: *${numeroInteiro(carteira.alunos_na_carteira)}*`,
    `• Professores com carteira observada: *${numeroInteiro(carteira.professores_com_carteira_observada)}*`,
    `• Média de vínculos por professor: *${numero(carteira.media_por_professor, 1)}*`,
    `• Turmas operacionais: *${numeroInteiro(carteira.total_turmas_operacionais)}*`,
    `• Ocupações elegíveis: *${numeroInteiro(carteira.ocupacoes_elegiveis)}*`,
    `• Turmas elegíveis para a média: *${numeroInteiro(carteira.turmas_elegiveis)}*`,
    `• Média ponderada alunos/turma: *${numero(carteira.media_alunos_turma, 2)}*`,
    '',
    '_A carteira soma os vínculos de acompanhamento por professor; não representa pessoas únicas da unidade._',
    '',
    '👥 *MAIORES CARTEIRAS*',
    ...maiores.map((professor, indice) =>
      `${indice + 1}. ${professor.nome} — ${numeroInteiro(valorMetrica(professor, 'numero_alunos'))} vínculos`),
    '',
    '📚 *MAIOR VOLUME DE TURMAS*',
    ...maiorVolume.map((professor, indice) =>
      `${indice + 1}. ${professor.nome} — ${numeroInteiro(professor.operacional?.total_turmas)} turmas`),
    '',
    '⚠️ *MÉDIAS QUE PEDEM LEITURA DA COORDENAÇÃO*',
    ...(baixaMedia.length > 0
      ? baixaMedia.map((professor, indice) =>
        `${indice + 1}. ${professor.nome} — ${numero(valorMetrica(professor, 'media_turma'), 2)} alunos/turma (${numeroInteiro(metrica(professor, 'media_turma')?.amostra)} turmas elegíveis)`)
      : ['• Nenhuma média abaixo de 1,50 nesta competência.']),
    ...rodape(params.dataGeracao),
  ].join('\n');
}

function gerarPresenca(params: GerarRelatorioCoordenacaoCanonicoParams): string {
  const { contrato } = params;
  const presenca = contrato.presenca;
  const observaveis = contrato.professores
    .filter((professor) => valorMetrica(professor, 'presenca') !== null);
  const prioridade = observaveis
    .filter((professor) => Number(valorMetrica(professor, 'presenca')) < 70)
    .sort((a, b) => Number(valorMetrica(a, 'presenca')) - Number(valorMetrica(b, 'presenca')))
    .slice(0, 10);
  const atencao = observaveis
    .filter((professor) => {
      const taxa = Number(valorMetrica(professor, 'presenca'));
      return taxa >= 70 && taxa < 80;
    })
    .sort((a, b) => Number(valorMetrica(a, 'presenca')) - Number(valorMetrica(b, 'presenca')))
    .slice(0, 10);

  return [
    ...cabecalho('RELATÓRIO PRESENÇA E ALERTAS PEDAGÓGICOS', contrato),
    '✅ *RESUMO DE PRESENÇA*',
    '━━━━━━━━━━━━━━━━━━━━━━',
    `• Presença média ponderada: *${numero(presenca.presenca_media, 1)}%*`,
    `• Presenças confirmadas: *${numeroInteiro(presenca.presencas_confirmadas)}/${numeroInteiro(presenca.eventos_elegiveis)}*`,
    `• Professores com evidência: *${numeroInteiro(presenca.professores_com_evidencia)}*`,
    `• Pendências de evidência: *${numeroInteiro(presenca.pendencias)}*`,
    '',
    '🔴 *PRIORIDADE DE ACOMPANHAMENTO*',
    ...(prioridade.length > 0
      ? prioridade.map((professor, indice) =>
        `${indice + 1}. ${professor.nome} — ${numero(valorMetrica(professor, 'presenca'), 1)}% | Amostra: ${numeroInteiro(metrica(professor, 'presenca')?.amostra)}`)
      : ['• Nenhum professor abaixo de 70% nesta competência.']),
    '',
    '🟡 *ATENÇÃO*',
    ...(atencao.length > 0
      ? atencao.map((professor, indice) =>
        `${indice + 1}. ${professor.nome} — ${numero(valorMetrica(professor, 'presenca'), 1)}% | Amostra: ${numeroInteiro(metrica(professor, 'presenca')?.amostra)}`)
      : ['• Nenhum professor entre 70% e 80% nesta competência.']),
    '',
    '_As faixas orientam acompanhamento pedagógico e não alteram sozinhas a nota do professor._',
    ...rodape(params.dataGeracao),
  ].join('\n');
}

function gerarRetencao(params: GerarRelatorioCoordenacaoCanonicoParams): string {
  const { contrato } = params;
  const retencao = contrato.retencao_permanencia;
  const saidas = contrato.saidas_retencao;
  const movimentos = [...(saidas.movimentos || [])].sort((a, b) =>
    a.data.localeCompare(b.data) || a.aluno_nome.localeCompare(b.aluno_nome, 'pt-BR'));
  const atencao = contrato.professores
    .filter((professor) => {
      const taxa = valorMetrica(professor, 'retencao');
      return taxa !== null && taxa < 100;
    })
    .sort((a, b) => Number(valorMetrica(a, 'retencao')) - Number(valorMetrica(b, 'retencao')));

  return [
    ...cabecalho('RELATÓRIO RETENÇÃO E EVASÕES POR PROFESSOR', contrato),
    '📉 *RESUMO DE RETENÇÃO*',
    '━━━━━━━━━━━━━━━━━━━━━━',
    `• Retenção atribuível observada: *${numero(retencao.retencao_media, 1)}%*`,
    `• Professores com retenção observável: *${numeroInteiro(retencao.professores_com_retencao)}*`,
    `• Evasões válidas: *${numeroInteiro(saidas.evasoes_validas)}*`,
    `• Não renovações válidas: *${numeroInteiro(saidas.nao_renovacoes_validas)}*`,
    `• Saídas válidas totais: *${numeroInteiro(saidas.saidas_validas_total)}*`,
    `• Saídas atribuíveis ao professor: *${numeroInteiro(saidas.saidas_atribuiveis_professor)}*`,
    `• MRR perdido total: *${formatarMoeda(saidas.mrr_perdido_total)}*`,
    `• MRR atribuível ao professor: *${formatarMoeda(saidas.mrr_perdido_atribuivel)}*`,
    '',
    '🚪 *MOVIMENTAÇÕES DO PERÍODO*',
    ...(movimentos.length > 0
      ? movimentos.flatMap((movimento, indice) => [
        `${indice + 1}) ${movimento.aluno_nome}`,
        `   • Data: ${formatarData(movimento.data)} | Tipo: ${movimento.tipo === 'nao_renovacao' ? 'Não renovação' : 'Evasão'}`,
        `   • Professor: ${movimento.professor_nome || 'Não informado'}`,
        `   • MRR perdido: ${formatarMoeda(movimento.valor_mrr)}`,
        `   • Impacto no indicador do professor: ${movimento.conta_score_professor ? 'Sim' : 'Não'}`,
        movimento.motivo ? `   • Motivo: ${movimento.motivo}` : '',
        '',
      ].filter(Boolean))
      : ['• Nenhuma evasão ou não renovação válida nesta competência.']),
    '🛡️ *RETENÇÃO ABAIXO DE 100%*',
    ...(atencao.length > 0
      ? atencao.map((professor, indice) =>
        `${indice + 1}. ${professor.nome} — ${numero(valorMetrica(professor, 'retencao'), 1)}% | Amostra: ${numeroInteiro(metrica(professor, 'retencao')?.amostra)}`)
      : ['• Nenhum professor abaixo de 100% no indicador atribuível.']),
    '',
    '_A movimentação total descreve a operação; somente saídas atribuíveis entram no indicador do professor._',
    ...rodape(params.dataGeracao),
  ].join('\n');
}

export function gerarRelatorioCoordenacaoCanonico(
  params: GerarRelatorioCoordenacaoCanonicoParams,
): string {
  if (!params.contrato || params.contrato.schema_version !== 2) {
    throw new Error('Os dados oficiais da Coordenação estão indisponíveis para esta competência.');
  }
  if (!Array.isArray(params.contrato.professores)) {
    throw new Error('A relação de professores da competência está indisponível.');
  }

  switch (params.tipo) {
    case 'ranking':
      return gerarRanking(params);
    case 'carteira':
      return gerarCarteira(params);
    case 'presenca':
      return gerarPresenca(params);
    case 'retencao':
      return gerarRetencao(params);
    default:
      throw new Error('Tipo de relatório da Coordenação inválido.');
  }
}
