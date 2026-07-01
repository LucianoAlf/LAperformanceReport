export type TipoRelatorioCoordenacaoInstantaneo =
  | 'ranking'
  | 'carteira'
  | 'presenca'
  | 'retencao';

export interface ProfessorRelatorioCoordenacao {
  id: number;
  nome: string;
  especialidades?: string[];
  total_alunos: number;
  total_turmas: number;
  alunos_via_turmas?: number;
  media_alunos_turma: number;
  taxa_retencao: number;
  taxa_conversao: number;
  experimentais: number;
  experimentais_faltas: number;
  matriculas_pos_exp: number;
  matriculas_diretas: number;
  taxa_presenca: number;
  taxa_faltas: number;
  evasoes_mes: number;
  nao_renovacoes_mes: number;
  mrr_perdido: number;
  status: 'critico' | 'atencao' | 'excelente';
  health_score: number;
  health_status: 'critico' | 'atencao' | 'saudavel';
  fator_demanda_ponderado: number;
}

interface GerarRelatorioParams {
  tipo: TipoRelatorioCoordenacaoInstantaneo;
  professores: ProfessorRelatorioCoordenacao[];
  unidadeNome: string;
  periodoLabel: string;
  intervaloLabel: string;
  dataGeracao?: Date;
}

const moeda = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
});

const numero = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function n(valor: number | null | undefined, casas = 1): string {
  return Number(valor || 0).toFixed(casas);
}

function formatarMoeda(valor: number | null | undefined): string {
  return moeda.format(Number(valor || 0)).replace(/[\u00a0\u202f]/g, ' ');
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

function limitar<T>(itens: T[], quantidade = 5): T[] {
  return itens.slice(0, quantidade);
}

function linhaRanking(
  item: ProfessorRelatorioCoordenacao,
  indice: number,
  detalhe: string
): string {
  return `${indice + 1}. ${item.nome} - ${detalhe}`;
}

function cabecalho(titulo: string, params: GerarRelatorioParams): string[] {
  return [
    '━━━━━━━━━━━━━━━━━━━━━━',
    `📊 *${titulo}*`,
    `🏢 *${params.unidadeNome}*`,
    `📅 *${params.periodoLabel.toUpperCase()}*`,
    `🗓 Periodo: ${params.intervaloLabel}`,
    '━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '_Fonte: indicadores ja carregados na tela de Professores do LA Report._',
    '_Relatorio instantaneo, sem IA e sem Edge Function._',
    '',
  ];
}

function rodape(params: GerarRelatorioParams): string[] {
  return [
    '',
    '━━━━━━━━━━━━━━━━━━━━━━',
    `📅 Gerado em: ${formatarDataHora(params.dataGeracao || new Date())}`,
    '━━━━━━━━━━━━━━━━━━━━━━',
  ];
}

function calcularResumo(professores: ProfessorRelatorioCoordenacao[]) {
  const totalProfessores = professores.length;
  const totalAlunos = professores.reduce((acc, p) => acc + Number(p.total_alunos || 0), 0);
  const totalTurmas = professores.reduce((acc, p) => acc + Number(p.total_turmas || 0), 0);
  const totalEvasoes = professores.reduce((acc, p) => acc + Number(p.evasoes_mes || 0), 0);
  const totalNaoRenovacoes = professores.reduce((acc, p) => acc + Number(p.nao_renovacoes_mes || 0), 0);
  const totalMrrPerdido = professores.reduce((acc, p) => acc + Number(p.mrr_perdido || 0), 0);
  const totalExperimentais = professores.reduce((acc, p) => acc + Number(p.experimentais || 0), 0);
  const totalMatriculasPosExp = professores.reduce((acc, p) => acc + Number(p.matriculas_pos_exp || 0), 0);
  const mediaPresenca = totalProfessores > 0
    ? professores.reduce((acc, p) => acc + Number(p.taxa_presenca || 0), 0) / totalProfessores
    : 0;
  const mediaRetencao = totalProfessores > 0
    ? professores.reduce((acc, p) => acc + Number(p.taxa_retencao || 0), 0) / totalProfessores
    : 0;
  const mediaHealth = totalProfessores > 0
    ? professores.reduce((acc, p) => acc + Number(p.health_score || 0), 0) / totalProfessores
    : 0;

  return {
    totalProfessores,
    totalAlunos,
    totalTurmas,
    totalEvasoes,
    totalNaoRenovacoes,
    totalMrrPerdido,
    totalExperimentais,
    totalMatriculasPosExp,
    mediaAlunosTurma: totalTurmas > 0 ? totalAlunos / totalTurmas : 0,
    mediaPresenca,
    mediaRetencao,
    mediaHealth,
    taxaConversao: totalExperimentais > 0 ? (totalMatriculasPosExp / totalExperimentais) * 100 : 0,
  };
}

function gerarRanking(params: GerarRelatorioParams): string {
  const professores = [...params.professores];
  const resumo = calcularResumo(professores);

  const linhas = [
    ...cabecalho('RELATORIO RANKING DE PROFESSORES', params),
    '👨‍🏫 *RESUMO DA EQUIPE*',
    '━━━━━━━━━━━━━━━━━━━━━━',
    `• Professores: *${resumo.totalProfessores}*`,
    `• Alunos em carteira: *${resumo.totalAlunos}*`,
    `• Media alunos/turma: *${n(resumo.mediaAlunosTurma, 2)}*`,
    `• Presenca media: *${n(resumo.mediaPresenca, 1)}%*`,
    `• Health medio: *${n(resumo.mediaHealth, 1)}*`,
    '',
    '🏆 *TOP HEALTH SCORE*',
    ...limitar([...professores].sort((a, b) => b.health_score - a.health_score)).map((p, i) =>
      linhaRanking(p, i, `${Math.round(p.health_score)} pontos`)
    ),
    '',
    '👥 *TOP CARTEIRA*',
    ...limitar([...professores].sort((a, b) => b.total_alunos - a.total_alunos)).map((p, i) =>
      linhaRanking(p, i, `${p.total_alunos} alunos`)
    ),
    '',
    '📊 *TOP MEDIA ALUNOS/TURMA*',
    ...limitar([...professores].sort((a, b) => b.media_alunos_turma - a.media_alunos_turma)).map((p, i) =>
      linhaRanking(p, i, `${n(p.media_alunos_turma, 2)} alunos/turma`)
    ),
    '',
    '✅ *TOP PRESENCA*',
    ...limitar([...professores].sort((a, b) => b.taxa_presenca - a.taxa_presenca)).map((p, i) =>
      linhaRanking(p, i, `${n(p.taxa_presenca, 1)}%`)
    ),
    '',
    '🎓 *TOP MATRICULADORES POS-EXPERIMENTAL*',
    ...limitar([...professores].sort((a, b) => b.matriculas_pos_exp - a.matriculas_pos_exp)).map((p, i) =>
      linhaRanking(p, i, `${p.matriculas_pos_exp} matriculas / ${p.experimentais} experimentais`)
    ),
    ...rodape(params),
  ];

  return linhas.join('\n');
}

function gerarCarteira(params: GerarRelatorioParams): string {
  const professores = [...params.professores];
  const resumo = calcularResumo(professores);
  const baixaMedia = professores
    .filter((p) => p.total_turmas > 0 && p.media_alunos_turma < 1.5)
    .sort((a, b) => a.media_alunos_turma - b.media_alunos_turma);

  const linhas = [
    ...cabecalho('RELATORIO CARTEIRA E CARGA PEDAGOGICA', params),
    '📦 *VISAO GERAL DA CARTEIRA*',
    '━━━━━━━━━━━━━━━━━━━━━━',
    `• Total de alunos na carteira: *${resumo.totalAlunos}*`,
    `• Total de turmas: *${resumo.totalTurmas}*`,
    `• Media geral alunos/turma: *${n(resumo.mediaAlunosTurma, 2)}*`,
    '',
    '👥 *MAIORES CARTEIRAS*',
    ...limitar([...professores].sort((a, b) => b.total_alunos - a.total_alunos)).map((p, i) =>
      linhaRanking(p, i, `${p.total_alunos} alunos em ${p.total_turmas} turmas`)
    ),
    '',
    '📚 *MAIOR VOLUME DE TURMAS*',
    ...limitar([...professores].sort((a, b) => b.total_turmas - a.total_turmas)).map((p, i) =>
      linhaRanking(p, i, `${p.total_turmas} turmas / ${p.total_alunos} alunos`)
    ),
    '',
    '⚠️ *TURMAS COM BAIXA MEDIA*',
    ...(baixaMedia.length > 0
      ? limitar(baixaMedia, 8).map((p, i) =>
          linhaRanking(p, i, `${n(p.media_alunos_turma, 2)} alunos/turma (${p.total_turmas} turmas)`)
        )
      : ['Nenhum professor abaixo de 1.5 aluno/turma neste periodo.']),
    ...rodape(params),
  ];

  return linhas.join('\n');
}

function gerarPresenca(params: GerarRelatorioParams): string {
  const professores = [...params.professores];
  const resumo = calcularResumo(professores);
  const criticos = professores
    .filter((p) => p.taxa_presenca < 70)
    .sort((a, b) => a.taxa_presenca - b.taxa_presenca);
  const atencao = professores
    .filter((p) => p.taxa_presenca >= 70 && p.taxa_presenca < 80)
    .sort((a, b) => a.taxa_presenca - b.taxa_presenca);

  const linhas = [
    ...cabecalho('RELATORIO PRESENCA E ALERTAS PEDAGOGICOS', params),
    '✅ *RESUMO DE PRESENCA*',
    '━━━━━━━━━━━━━━━━━━━━━━',
    `• Presenca media: *${n(resumo.mediaPresenca, 1)}%*`,
    `• Professores abaixo de 70%: *${criticos.length}*`,
    `• Professores entre 70% e 80%: *${atencao.length}*`,
    '',
    '🔴 *PRIORIDADE DE ACOMPANHAMENTO*',
    ...(criticos.length > 0
      ? limitar(criticos, 10).map((p, i) =>
          linhaRanking(
            p,
            i,
            `${n(p.taxa_presenca, 1)}% | ${p.evasoes_mes} evasoes | ${p.total_alunos} alunos`
          )
        )
      : ['Nenhum professor abaixo de 70% neste periodo.']),
    '',
    '🟡 *ATENCAO*',
    ...(atencao.length > 0
      ? limitar(atencao, 10).map((p, i) =>
          linhaRanking(p, i, `${n(p.taxa_presenca, 1)}% | ${p.total_alunos} alunos`)
        )
      : ['Nenhum professor na faixa de atencao neste periodo.']),
    '',
    'ℹ️ *OBSERVACAO*',
    'Aulas a repor nao entram neste relatorio instantaneo porque nao estao nos indicadores carregados nesta tela.',
    ...rodape(params),
  ];

  return linhas.join('\n');
}

function gerarRetencao(params: GerarRelatorioParams): string {
  const professores = [...params.professores];
  const resumo = calcularResumo(professores);
  const comEvasao = professores
    .filter((p) => p.evasoes_mes > 0 || p.nao_renovacoes_mes > 0)
    .sort((a, b) => (b.evasoes_mes + b.nao_renovacoes_mes) - (a.evasoes_mes + a.nao_renovacoes_mes));

  const linhas = [
    ...cabecalho('RELATORIO RETENCAO E EVASOES POR PROFESSOR', params),
    '📉 *RESUMO DE RETENCAO*',
    '━━━━━━━━━━━━━━━━━━━━━━',
    `• Retencao media: *${n(resumo.mediaRetencao, 1)}%*`,
    `• Evasoes no periodo: *${resumo.totalEvasoes}*`,
    `• Nao renovacoes no periodo: *${resumo.totalNaoRenovacoes}*`,
    `• MRR perdido estimado: *${formatarMoeda(resumo.totalMrrPerdido)}*`,
    '',
    '🚪 *PROFESSORES COM EVASAO/NAO RENOVACAO*',
    ...(comEvasao.length > 0
      ? limitar(comEvasao, 15).map((p, i) =>
          linhaRanking(
            p,
            i,
            `${p.evasoes_mes} evasoes | ${p.nao_renovacoes_mes} nao renov. | ${formatarMoeda(p.mrr_perdido)}`
          )
        )
      : ['Nenhuma evasao ou nao renovacao vinculada aos professores neste periodo.']),
    '',
    '🛡️ *TOP RETENCAO*',
    ...limitar([...professores].filter((p) => p.total_alunos > 0).sort((a, b) => b.taxa_retencao - a.taxa_retencao)).map((p, i) =>
      linhaRanking(p, i, `${n(p.taxa_retencao, 1)}% | ${p.total_alunos} alunos`)
    ),
    ...rodape(params),
  ];

  return linhas.join('\n');
}

export function gerarRelatorioCoordenacaoInstantaneo(params: GerarRelatorioParams): string {
  if (params.professores.length === 0) {
    return [
      ...cabecalho('RELATORIO COORDENACAO PEDAGOGICA', params),
      'Nenhum professor encontrado para este filtro.',
      ...rodape(params),
    ].join('\n');
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
      return gerarRanking(params);
  }
}
