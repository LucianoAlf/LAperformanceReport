export type UnidadeOperacionalV2 = string | 'todos' | null;

export interface ComercialOperacionalCompetenciaV2 {
  unidadeId: UnidadeOperacionalV2;
  ano: number;
  mesInicio: number;
  mesFim: number;
}

export interface ComercialOperacionalRpcParamsV2 {
  p_unidade_id: string | null;
  p_ano: number;
  p_mes: number;
  p_periodo: 'mensal';
  p_data: null;
}

export interface OrigemCanalPayloadV2 {
  canal?: string | null;
  leads?: number | string | null;
}

export interface PorUnidadePayloadV2 {
  unidade_nome?: string | null;
  leads_entrantes?: number | string | null;
}

export interface ComercialOperacionalPayloadV2 {
  kpis?: {
    leads_entrantes?: number | string | null;
  } | null;
  origem_canal?: OrigemCanalPayloadV2[] | null;
  por_unidade?: PorUnidadePayloadV2[] | null;
}

export interface ExperimentaisDiagnosticoTotaisPayloadV2 {
  experimentais_agendadas_eventos?: number | string | null;
  experimentais_canceladas?: number | string | null;
  no_show_status_operacional?: number | string | null;
  experimentais_realizadas_status_operacional?: number | string | null;
  experimentais_realizadas_presenca_confirmada?: number | string | null;
  experimentais_status_operacional_sem_presenca?: number | string | null;
  experimentais_sem_aluno_id?: number | string | null;
  conversoes_canonicas_com_vinculo_presenca?: number | string | null;
  conversoes_pendentes_vinculo?: number | string | null;
  realizadas_sem_conversao_aparente?: number | string | null;
  decisoes_humanas_excluidas_denominador?: number | string | null;
  decisoes_humanas_pendentes_canonizacao?: number | string | null;
  taxa_exp_mat_minima_canonica?: number | string | null;
  taxa_exp_mat_maxima_apos_revisao?: number | string | null;
  taxa_exp_mat_status?: string | null;
  presencas_emusys_experimentais_presentes?: number | string | null;
  presencas_emusys_com_funil?: number | string | null;
  presencas_emusys_sem_funil?: number | string | null;
}

export interface ExperimentaisDiagnosticoPayloadV2 {
  totais?: ExperimentaisDiagnosticoTotaisPayloadV2 | null;
}

export interface OrigemCanalOperacionalV2 {
  canal: string;
  leads: number;
  percentual: number;
}

export interface UnidadeLeadsOperacionalV2 {
  unidadeNome: string;
  leadsEntrantes: number;
}

export interface ComercialOperacionalMesV2 {
  mes: number;
  leadsEntrantes: number;
  origemCanal: OrigemCanalOperacionalV2[];
  porUnidade: UnidadeLeadsOperacionalV2[];
}

export interface ComercialOperacionalResumoDadosV2 {
  leadsEntrantes: number;
  origemCanal: OrigemCanalOperacionalV2[];
  seriesMensais: ComercialOperacionalMesV2[];
}

export interface ExperimentaisDiagnosticoMesV2 {
  mes: number;
  agendadasEventos: number;
  canceladas: number;
  noShowStatusOperacional: number;
  realizadasStatusOperacional: number;
  realizadasPresencaConfirmada: number;
  statusOperacionalSemPresenca: number;
  semAlunoId: number;
  conversoesCanonicasComVinculoPresenca: number;
  conversoesPendentesVinculo: number;
  realizadasSemConversaoAparente: number;
  decisoesHumanasExcluidasDenominador: number;
  decisoesHumanasPendentesCanonizacao: number;
  taxaExpMatMinimaCanonica: number | null;
  taxaExpMatMaximaAposRevisao: number | null;
  taxaExpMatStatus: string;
  presencasEmusysExperimentaisPresentes: number;
  presencasEmusysComFunil: number;
  presencasEmusysSemFunil: number;
}

export interface ExperimentaisDiagnosticoResumoV2
  extends Omit<ExperimentaisDiagnosticoMesV2, 'mes'> {
  seriesMensais: ExperimentaisDiagnosticoMesV2[];
}

export function toComercialNumber(valor: unknown): number {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

export function normalizarMesRange(mesInicio: number, mesFim: number): number[] {
  const inicio = Math.max(1, Math.min(12, Math.trunc(mesInicio)));
  const fim = Math.max(inicio, Math.min(12, Math.trunc(mesFim)));

  return Array.from({ length: fim - inicio + 1 }, (_, index) => inicio + index);
}

export function normalizarUnidadeOperacionalV2(unidadeId: UnidadeOperacionalV2): string | null {
  return !unidadeId || unidadeId === 'todos' ? null : unidadeId;
}

export function buildComercialOperacionalRpcParamsV2({
  unidadeId,
  ano,
  mes,
}: {
  unidadeId: UnidadeOperacionalV2;
  ano: number;
  mes: number;
}): ComercialOperacionalRpcParamsV2 {
  return {
    p_unidade_id: normalizarUnidadeOperacionalV2(unidadeId),
    p_ano: ano,
    p_mes: mes,
    p_periodo: 'mensal',
    p_data: null,
  };
}

function normalizarOrigemCanal(
  origemCanal: OrigemCanalPayloadV2[] | null | undefined,
): OrigemCanalOperacionalV2[] {
  return (Array.isArray(origemCanal) ? origemCanal : [])
    .map((item) => ({
      canal: item.canal?.trim() || 'Sem canal',
      leads: toComercialNumber(item.leads),
      percentual: 0,
    }))
    .filter((item) => item.leads > 0);
}

function normalizarPorUnidade(
  porUnidade: PorUnidadePayloadV2[] | null | undefined,
): UnidadeLeadsOperacionalV2[] {
  return (Array.isArray(porUnidade) ? porUnidade : [])
    .map((item) => ({
      unidadeNome: item.unidade_nome?.trim() || 'Sem unidade',
      leadsEntrantes: toComercialNumber(item.leads_entrantes),
    }))
    .filter((item) => item.leadsEntrantes > 0);
}

export function normalizarPayloadMensalComercialV2(
  mes: number,
  payload: ComercialOperacionalPayloadV2 | null,
): ComercialOperacionalMesV2 {
  return {
    mes,
    leadsEntrantes: toComercialNumber(payload?.kpis?.leads_entrantes),
    origemCanal: normalizarOrigemCanal(payload?.origem_canal),
    porUnidade: normalizarPorUnidade(payload?.por_unidade),
  };
}

export function normalizarPayloadMensalExperimentaisDiagnosticoV2(
  mes: number,
  payload: ExperimentaisDiagnosticoPayloadV2 | null,
): ExperimentaisDiagnosticoMesV2 {
  const totais = payload?.totais;

  return {
    mes,
    agendadasEventos: toComercialNumber(totais?.experimentais_agendadas_eventos),
    canceladas: toComercialNumber(totais?.experimentais_canceladas),
    noShowStatusOperacional: toComercialNumber(totais?.no_show_status_operacional),
    realizadasStatusOperacional: toComercialNumber(
      totais?.experimentais_realizadas_status_operacional,
    ),
    realizadasPresencaConfirmada: toComercialNumber(
      totais?.experimentais_realizadas_presenca_confirmada,
    ),
    statusOperacionalSemPresenca: toComercialNumber(
      totais?.experimentais_status_operacional_sem_presenca,
    ),
    semAlunoId: toComercialNumber(totais?.experimentais_sem_aluno_id),
    conversoesCanonicasComVinculoPresenca: toComercialNumber(
      totais?.conversoes_canonicas_com_vinculo_presenca,
    ),
    conversoesPendentesVinculo: toComercialNumber(totais?.conversoes_pendentes_vinculo),
    realizadasSemConversaoAparente: toComercialNumber(
      totais?.realizadas_sem_conversao_aparente,
    ),
    decisoesHumanasExcluidasDenominador: toComercialNumber(
      totais?.decisoes_humanas_excluidas_denominador,
    ),
    decisoesHumanasPendentesCanonizacao: toComercialNumber(
      totais?.decisoes_humanas_pendentes_canonizacao,
    ),
    taxaExpMatMinimaCanonica:
      totais?.taxa_exp_mat_minima_canonica === null ||
      totais?.taxa_exp_mat_minima_canonica === undefined
        ? null
        : toComercialNumber(totais.taxa_exp_mat_minima_canonica),
    taxaExpMatMaximaAposRevisao:
      totais?.taxa_exp_mat_maxima_apos_revisao === null ||
      totais?.taxa_exp_mat_maxima_apos_revisao === undefined
        ? null
        : toComercialNumber(totais.taxa_exp_mat_maxima_apos_revisao),
    taxaExpMatStatus: totais?.taxa_exp_mat_status || 'bloqueada_regra_canonica',
    presencasEmusysExperimentaisPresentes: toComercialNumber(
      totais?.presencas_emusys_experimentais_presentes,
    ),
    presencasEmusysComFunil: toComercialNumber(totais?.presencas_emusys_com_funil),
    presencasEmusysSemFunil: toComercialNumber(totais?.presencas_emusys_sem_funil),
  };
}

export function somarSeriesMensaisComercialV2(
  seriesMensais: ComercialOperacionalMesV2[],
): ComercialOperacionalResumoDadosV2 {
  const origemPorCanal = new Map<string, OrigemCanalOperacionalV2>();
  let leadsEntrantes = 0;

  seriesMensais.forEach((mes) => {
    leadsEntrantes += mes.leadsEntrantes;

    mes.origemCanal.forEach((item) => {
      const atual = origemPorCanal.get(item.canal) || {
        canal: item.canal,
        leads: 0,
        percentual: 0,
      };

      atual.leads += item.leads;
      origemPorCanal.set(item.canal, atual);
    });
  });

  const origemCanal = Array.from(origemPorCanal.values())
    .map((item) => ({
      ...item,
      percentual: leadsEntrantes > 0 ? (item.leads / leadsEntrantes) * 100 : 0,
    }))
    .sort((a, b) => b.leads - a.leads);

  return {
    leadsEntrantes,
    origemCanal,
    seriesMensais,
  };
}

export function somarSeriesMensaisExperimentaisDiagnosticoV2(
  seriesMensais: ExperimentaisDiagnosticoMesV2[],
): ExperimentaisDiagnosticoResumoV2 {
  return seriesMensais.reduce<ExperimentaisDiagnosticoResumoV2>(
    (acc, mes) => {
      const realizadasStatusOperacional =
        acc.realizadasStatusOperacional + mes.realizadasStatusOperacional;
      const conversoesCanonicasComVinculoPresenca =
        acc.conversoesCanonicasComVinculoPresenca +
        mes.conversoesCanonicasComVinculoPresenca;
      const conversoesPendentesVinculo =
        acc.conversoesPendentesVinculo + mes.conversoesPendentesVinculo;

      return {
        agendadasEventos: acc.agendadasEventos + mes.agendadasEventos,
        canceladas: acc.canceladas + mes.canceladas,
        noShowStatusOperacional: acc.noShowStatusOperacional + mes.noShowStatusOperacional,
        realizadasStatusOperacional,
        realizadasPresencaConfirmada:
          acc.realizadasPresencaConfirmada + mes.realizadasPresencaConfirmada,
        statusOperacionalSemPresenca:
          acc.statusOperacionalSemPresenca + mes.statusOperacionalSemPresenca,
        semAlunoId: acc.semAlunoId + mes.semAlunoId,
        conversoesCanonicasComVinculoPresenca,
        conversoesPendentesVinculo,
        realizadasSemConversaoAparente:
          acc.realizadasSemConversaoAparente + mes.realizadasSemConversaoAparente,
        decisoesHumanasExcluidasDenominador:
          acc.decisoesHumanasExcluidasDenominador +
          mes.decisoesHumanasExcluidasDenominador,
        decisoesHumanasPendentesCanonizacao:
          acc.decisoesHumanasPendentesCanonizacao +
          mes.decisoesHumanasPendentesCanonizacao,
        taxaExpMatMinimaCanonica:
          realizadasStatusOperacional > 0
            ? (conversoesCanonicasComVinculoPresenca / realizadasStatusOperacional) * 100
            : null,
        taxaExpMatMaximaAposRevisao:
          realizadasStatusOperacional > 0
            ? ((conversoesCanonicasComVinculoPresenca + conversoesPendentesVinculo) /
                realizadasStatusOperacional) *
              100
            : null,
        taxaExpMatStatus: mes.taxaExpMatStatus || acc.taxaExpMatStatus,
        presencasEmusysExperimentaisPresentes:
          acc.presencasEmusysExperimentaisPresentes +
          mes.presencasEmusysExperimentaisPresentes,
        presencasEmusysComFunil: acc.presencasEmusysComFunil + mes.presencasEmusysComFunil,
        presencasEmusysSemFunil: acc.presencasEmusysSemFunil + mes.presencasEmusysSemFunil,
        seriesMensais: [...acc.seriesMensais, mes],
      };
    },
    {
      agendadasEventos: 0,
      canceladas: 0,
      noShowStatusOperacional: 0,
      realizadasStatusOperacional: 0,
      realizadasPresencaConfirmada: 0,
      statusOperacionalSemPresenca: 0,
      semAlunoId: 0,
      conversoesCanonicasComVinculoPresenca: 0,
      conversoesPendentesVinculo: 0,
      realizadasSemConversaoAparente: 0,
      decisoesHumanasExcluidasDenominador: 0,
      decisoesHumanasPendentesCanonizacao: 0,
      taxaExpMatMinimaCanonica: null,
      taxaExpMatMaximaAposRevisao: null,
      taxaExpMatStatus: 'bloqueada_regra_canonica',
      presencasEmusysExperimentaisPresentes: 0,
      presencasEmusysComFunil: 0,
      presencasEmusysSemFunil: 0,
      seriesMensais: [],
    },
  );
}
