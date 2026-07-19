export type TipoRelatorioCoordenacaoInstantaneo =
  | 'ranking'
  | 'carteira'
  | 'presenca'
  | 'retencao';

export interface HealthV3RelatorioCoordenacao {
  score: number | null;
  cobertura: number | null;
  classificacao: string | null;
  estadoPublicacao: 'parcial' | 'oficial' | 'sem_base';
  scoreExibivel: boolean;
  rankingHabilitado: boolean;
  periodicidade: 'mensal' | 'ciclo' | 'legado_calendario';
  cicloCodigo: string;
}

export interface ProfessorRelatorioCoordenacao {
  id: number;
  nome: string;
  especialidades?: string[];
  total_alunos: number;
  total_turmas: number;
  alunos_via_turmas?: number;
  turmas_elegiveis_media?: number;
  media_alunos_turma: number;
  taxa_retencao: number;
  taxa_conversao: number;
  experimentais: number;
  experimentais_faltas: number;
  matriculas_pos_exp: number;
  matriculas_diretas: number;
  taxa_presenca: number | null;
  taxa_faltas: number | null;
  presenca_publicavel: boolean;
  presenca_confianca: string;
  presenca_cobertura: number;
  presenca_eventos_confirmados: number;
  presenca_eventos_incertos: number;
  evasoes_mes: number;
  nao_renovacoes_mes: number;
  mrr_perdido: number;
  status: 'critico' | 'atencao' | 'excelente';
  health_score: number | null;
  health_status: 'critico' | 'atencao' | 'saudavel' | null;
  health_score_confiavel: boolean;
  fator_demanda_ponderado: number;
  healthV3?: HealthV3RelatorioCoordenacao | null;
}

interface GerarRelatorioParams {
  tipo: TipoRelatorioCoordenacaoInstantaneo;
  professores: ProfessorRelatorioCoordenacao[];
  unidadeNome: string;
  periodoLabel: string;
  intervaloLabel: string;
  dataGeracao?: Date;
}

type KpiProfessorCoordenacaoRaw = Record<string, unknown>;

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

function numeroSeguro(valor: unknown): number {
  const numero = Number(valor ?? 0);
  return Number.isFinite(numero) ? numero : 0;
}

function textoSeguro(valor: unknown, fallback = ''): string {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : fallback;
}

function listaTextoSeguro(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function statusPorHealth(score: number): ProfessorRelatorioCoordenacao['status'] {
  if (score >= 80) return 'excelente';
  if (score >= 60) return 'atencao';
  return 'critico';
}

function healthStatusPorScore(score: number): ProfessorRelatorioCoordenacao['health_status'] {
  if (score >= 80) return 'saudavel';
  if (score >= 60) return 'atencao';
  return 'critico';
}

function normalizarStatus(
  status: unknown,
  score: number
): ProfessorRelatorioCoordenacao['status'] {
  const valor = textoSeguro(status).toLowerCase();
  if (valor === 'excelente' || valor === 'atencao' || valor === 'critico') {
    return valor;
  }
  if (valor === 'saudavel') return 'excelente';
  return statusPorHealth(score);
}

function normalizarHealthStatus(
  status: unknown,
  score: number
): ProfessorRelatorioCoordenacao['health_status'] {
  const valor = textoSeguro(status).toLowerCase();
  if (valor === 'saudavel' || valor === 'atencao' || valor === 'critico') {
    return valor;
  }
  if (valor === 'excelente') return 'saudavel';
  return healthStatusPorScore(score);
}

function numeroOuNull(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : null;
}

export function normalizarKpisProfessoresCoordenacao(
  kpisProfessores: unknown
): ProfessorRelatorioCoordenacao[] {
  if (!Array.isArray(kpisProfessores)) return [];

  return kpisProfessores.map((row, index) => {
    const item = row as KpiProfessorCoordenacaoRaw;
    const totalAlunos = numeroSeguro(item.carteira_alunos ?? item.total_alunos);
    const mediaAlunosTurma = numeroSeguro(item.media_alunos_turma);
    const totalTurmasInformado = numeroSeguro(item.total_turmas);
    const totalTurmas = totalTurmasInformado > 0
      ? totalTurmasInformado
      : mediaAlunosTurma > 0
        ? Math.round(totalAlunos / mediaAlunosTurma)
        : 0;
    const experimentais = numeroSeguro(item.experimentais);
    const matriculasPosExp = numeroSeguro(item.matriculas_pos_exp ?? item.matriculas);
    const presencaPublicavel = item.presenca_publicavel === true;
    const taxaPresenca = presencaPublicavel
      ? numeroOuNull(item.media_presenca ?? item.taxa_presenca)
      : null;
    const taxaFaltas = presencaPublicavel ? numeroOuNull(item.taxa_faltas) : null;
    const healthScoreConfiavel = item.health_score_confiavel === true;
    const healthInformado = healthScoreConfiavel
      ? numeroOuNull(item.health_score ?? item.health)
      : null;
    const healthV3Value = item.health_score_v3 ?? item.healthV3;
    const healthV3Raw = healthV3Value && typeof healthV3Value === 'object'
      ? healthV3Value as Record<string, unknown>
      : null;
    const healthV3: HealthV3RelatorioCoordenacao | null = healthV3Raw ? {
      score: numeroOuNull(healthV3Raw.score),
      cobertura: numeroOuNull(healthV3Raw.cobertura),
      classificacao: healthV3Raw.classificacao ? String(healthV3Raw.classificacao) : null,
      estadoPublicacao: String(
        healthV3Raw.estado_publicacao ?? healthV3Raw.estadoPublicacao ?? 'sem_base',
      ) as HealthV3RelatorioCoordenacao['estadoPublicacao'],
      scoreExibivel: (healthV3Raw.score_exibivel ?? healthV3Raw.scoreExibivel) === true,
      rankingHabilitado: (healthV3Raw.ranking_habilitado ?? healthV3Raw.rankingHabilitado) === true,
      periodicidade: String(healthV3Raw.periodicidade || 'legado_calendario') as HealthV3RelatorioCoordenacao['periodicidade'],
      cicloCodigo: String(healthV3Raw.ciclo_codigo ?? healthV3Raw.cicloCodigo ?? ''),
    } : null;

    return {
      id: numeroSeguro(item.professor_id ?? item.id) || index + 1,
      nome: textoSeguro(item.professor_nome ?? item.nome, 'Professor sem nome'),
      especialidades: listaTextoSeguro(item.cursos ?? item.especialidades),
      total_alunos: totalAlunos,
      total_turmas: totalTurmas,
      alunos_via_turmas: numeroSeguro(item.alunos_via_turmas),
      turmas_elegiveis_media: numeroSeguro(item.turmas_elegiveis_media),
      media_alunos_turma: mediaAlunosTurma,
      taxa_retencao: numeroSeguro(item.taxa_retencao ?? item.taxa_renovacao),
      taxa_conversao: numeroSeguro(item.taxa_conversao) || (
        experimentais > 0 ? (matriculasPosExp / experimentais) * 100 : 0
      ),
      experimentais,
      experimentais_faltas: numeroSeguro(item.experimentais_faltas),
      matriculas_pos_exp: matriculasPosExp,
      matriculas_diretas: numeroSeguro(item.matriculas_diretas),
      taxa_presenca: taxaPresenca,
      taxa_faltas: taxaFaltas,
      presenca_publicavel: presencaPublicavel && taxaPresenca !== null && taxaFaltas !== null,
      presenca_confianca: textoSeguro(item.presenca_confianca, 'sem_base'),
      presenca_cobertura: numeroSeguro(item.presenca_cobertura),
      presenca_eventos_confirmados: numeroSeguro(item.presenca_eventos_confirmados),
      presenca_eventos_incertos: numeroSeguro(item.presenca_eventos_incertos),
      evasoes_mes: numeroSeguro(item.evasoes ?? item.evasoes_mes),
      nao_renovacoes_mes: numeroSeguro(item.nao_renovacoes ?? item.nao_renovacoes_mes),
      mrr_perdido: numeroSeguro(item.mrr_perdido),
      status: healthInformado === null
        ? 'atencao'
        : normalizarStatus(item.status ?? item.health_status, healthInformado),
      health_score: healthInformado,
      health_status: healthInformado === null
        ? null
        : normalizarHealthStatus(item.health_status ?? item.status, healthInformado),
      health_score_confiavel: healthScoreConfiavel && healthInformado !== null,
      fator_demanda_ponderado: numeroSeguro(item.fator_demanda_ponderado) || 1,
      healthV3,
    };
  });
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
    '_Fonte: indicadores canonicos da competencia selecionada no LA Report._',
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

export function calcularResumoRelatorioCoordenacao(
  professores: ProfessorRelatorioCoordenacao[],
) {
  const totalProfessores = professores.length;
  const totalAlunos = professores.reduce((acc, p) => acc + Number(p.total_alunos || 0), 0);
  const totalTurmas = professores.reduce((acc, p) => acc + Number(p.total_turmas || 0), 0);
  const totalOcupacoesElegiveis = professores.reduce((acc, p) => acc + Number(p.alunos_via_turmas || 0), 0);
  const totalTurmasElegiveis = professores.reduce((acc, p) => acc + Number(p.turmas_elegiveis_media || 0), 0);
  const totalEvasoes = professores.reduce((acc, p) => acc + Number(p.evasoes_mes || 0), 0);
  const totalNaoRenovacoes = professores.reduce((acc, p) => acc + Number(p.nao_renovacoes_mes || 0), 0);
  const totalMrrPerdido = professores.reduce((acc, p) => acc + Number(p.mrr_perdido || 0), 0);
  const totalExperimentais = professores.reduce((acc, p) => acc + Number(p.experimentais || 0), 0);
  const totalMatriculasPosExp = professores.reduce((acc, p) => acc + Number(p.matriculas_pos_exp || 0), 0);
  const presencasPublicaveis = professores.filter((p) =>
    p.presenca_publicavel
      && p.taxa_presenca !== null
      && p.presenca_eventos_confirmados > 0
  );
  const healthPublicaveis = professores.filter((p) =>
    p.healthV3?.rankingHabilitado && p.healthV3.estadoPublicacao === 'oficial'
      && p.healthV3.score !== null
  );
  const healthVisiveis = professores.filter((p) => p.healthV3?.scoreExibivel && p.healthV3.score !== null);
  const totalEventosPresenca = presencasPublicaveis.reduce(
    (acc, p) => acc + p.presenca_eventos_confirmados,
    0,
  );
  const mediaPresenca = totalEventosPresenca > 0
    ? presencasPublicaveis.reduce(
      (acc, p) => acc + Number(p.taxa_presenca) * p.presenca_eventos_confirmados,
      0,
    ) / totalEventosPresenca
    : null;
  const mediaRetencao = totalProfessores > 0
    ? professores.reduce((acc, p) => acc + Number(p.taxa_retencao || 0), 0) / totalProfessores
    : 0;
  const mediaHealth = healthVisiveis.length > 0
    ? healthVisiveis.reduce((acc, p) => acc + Number(p.healthV3?.score), 0) / healthVisiveis.length
    : null;

  return {
    totalProfessores,
    totalAlunos,
    totalTurmas,
    totalEvasoes,
    totalNaoRenovacoes,
    totalMrrPerdido,
    totalExperimentais,
    totalMatriculasPosExp,
    mediaAlunosTurma: totalTurmasElegiveis > 0
      ? totalOcupacoesElegiveis / totalTurmasElegiveis
      : 0,
    mediaPresenca,
    totalPresencasPublicaveis: presencasPublicaveis.length,
    totalPresencasEmAuditoria: totalProfessores - presencasPublicaveis.length,
    mediaRetencao,
    mediaHealth,
    totalHealthPublicaveis: healthPublicaveis.length,
    totalHealthParciais: healthVisiveis.filter((p) => p.healthV3?.estadoPublicacao === 'parcial').length,
    taxaConversao: totalExperimentais > 0 ? (totalMatriculasPosExp / totalExperimentais) * 100 : 0,
  };
}

function gerarRanking(params: GerarRelatorioParams): string {
  const professores = [...params.professores];
  const resumo = calcularResumoRelatorioCoordenacao(professores);
  const healthPublicaveis = professores.filter((p) =>
    p.healthV3?.rankingHabilitado && p.healthV3.estadoPublicacao === 'oficial'
      && p.healthV3.score !== null
  );
  const presencasPublicaveis = professores.filter((p) => p.presenca_publicavel && p.taxa_presenca !== null);

  const linhas = [
    ...cabecalho('RELATORIO RANKING DE PROFESSORES', params),
    '👨‍🏫 *RESUMO DA EQUIPE*',
    '━━━━━━━━━━━━━━━━━━━━━━',
    `• Professores: *${resumo.totalProfessores}*`,
    `• Alunos em carteira: *${resumo.totalAlunos}*`,
    `• Media alunos/turma: *${n(resumo.mediaAlunosTurma, 2)}*`,
    `• Presenca media: *${resumo.mediaPresenca === null ? 'Em auditoria' : `${n(resumo.mediaPresenca, 1)}%`}*`,
    `• Health Score parcial medio: *${resumo.mediaHealth === null ? 'Sem base' : n(resumo.mediaHealth, 1)}*`,
    `• Scores parciais visiveis: *${resumo.totalHealthParciais}*`,
    '',
    '🏆 *TOP HEALTH SCORE*',
    ...(healthPublicaveis.length > 0
      ? limitar([...healthPublicaveis].sort((a, b) => Number(b.health_score) - Number(a.health_score))).map((p, i) =>
          linhaRanking(p, i, `${Math.round(Number(p.healthV3?.score))} pontos`)
        )
      : ['Ranking indisponivel: o Health Score parcial nao participa de ranking ou premiacao.']),
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
    ...(presencasPublicaveis.length > 0
      ? limitar([...presencasPublicaveis].sort((a, b) => Number(b.taxa_presenca) - Number(a.taxa_presenca))).map((p, i) =>
          linhaRanking(p, i, `${n(p.taxa_presenca, 1)}%`)
        )
      : ['Em auditoria: nenhuma taxa de presenca atingiu confianca alta neste recorte.']),
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
  const resumo = calcularResumoRelatorioCoordenacao(professores);
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
  const todosProfessores = [...params.professores];
  const professores = todosProfessores.filter((p) => p.presenca_publicavel && p.taxa_presenca !== null);
  if (professores.length === 0) {
    const eventosConfirmados = todosProfessores.reduce(
      (total, professor) => total + professor.presenca_eventos_confirmados,
      0,
    );
    const eventosIncertos = todosProfessores.reduce(
      (total, professor) => total + professor.presenca_eventos_incertos,
      0,
    );
    return [
      ...cabecalho('RELATORIO PRESENCA E ALERTAS PEDAGOGICOS', params),
      '⚠️ *PRESENCA EM AUDITORIA*',
      '━━━━━━━━━━━━━━━━━━━━━━',
      'Nenhuma taxa de presenca atingiu confianca alta neste recorte.',
      'O Emusys ainda mistura falta confirmada com chamada nao registrada em parte do historico.',
      '',
      `• Professores em auditoria: *${todosProfessores.length}*`,
      `• Eventos confirmados: *${eventosConfirmados}*`,
      `• Eventos incertos: *${eventosIncertos}*`,
      '',
      '_Nenhum ranking, alerta ou avaliacao de desempenho foi publicado._',
      ...rodape(params),
    ].join('\n');
  }
  const resumo = calcularResumoRelatorioCoordenacao(professores);
  const criticos = professores
    .filter((p) => Number(p.taxa_presenca) < 70)
    .sort((a, b) => Number(a.taxa_presenca) - Number(b.taxa_presenca));
  const atencao = professores
    .filter((p) => Number(p.taxa_presenca) >= 70 && Number(p.taxa_presenca) < 80)
    .sort((a, b) => Number(a.taxa_presenca) - Number(b.taxa_presenca));

  const linhas = [
    ...cabecalho('RELATORIO PRESENCA E ALERTAS PEDAGOGICOS', params),
    '✅ *RESUMO DE PRESENCA*',
    '━━━━━━━━━━━━━━━━━━━━━━',
    `• Presenca media: *${n(resumo.mediaPresenca, 1)}%*`,
    `• Professores com dado publicavel: *${professores.length}*`,
    `• Professores em auditoria: *${todosProfessores.length - professores.length}*`,
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
  const resumo = calcularResumoRelatorioCoordenacao(professores);
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
