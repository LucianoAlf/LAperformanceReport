import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  calcularTicketParcelaCanonicoPorMes,
  toComercialMoneyNumber,
  type MatriculaComercialCanonicaLike,
} from '@/lib/comercialMatriculasCanonicas';

// Tipos
export interface ConfigPrograma {
  ano: number;
  metas: {
    taxa_showup_experimental: number;
    taxa_experimental_matricula: number;
    taxa_lead_matricula: number;
    volume_campo_grande: number;
    volume_recreio: number;
    volume_barra: number;
    ticket_campo_grande: number;
    ticket_recreio: number;
    ticket_barra: number;
  };
  pontuacao: {
    taxa_showup: number;
    taxa_exp_mat: number;
    taxa_geral: number;
    volume_medio: number;
    ticket_medio: number;
  };
  bonus?: {
    taxa_showup_por_2pct: number;
    taxa_exp_mat_por_5pct: number;
    taxa_geral_por_1pct: number;
    volume_por_2_acima: number;
    ticket_por_20_acima: number;
  };
  penalidades?: {
    nao_preencheu_emusys: number;
    nao_preencheu_lareport: number;
    lead_abandonado: number;
    reincidencia_mes: number;
  };
  nota_corte: number;
  periodo?: {
    mes_inicio: number;
    mes_fim: number;
  };
}

export interface HunterDados {
  unidade_id: string;
  unidade_nome: string;
  hunter_nome: string;
  hunter_apelido: string;
  metricas: {
    total_leads: number;
    total_experimentais: number;
    total_matriculas: number;
    meses_com_dados: number;
    media_matriculas_mes: number;
    media_ticket: number;
    taxa_showup_exp: number;
    taxa_exp_mat: number;
    taxa_exp_mat_liberada?: boolean;
    pendencias_exp_mat?: number;
    denominador_exp_mat?: number;
    conversoes_exp_mat?: number;
    taxa_geral: number;
  };
  penalidades: {
    total_pontos: number;
    quantidade: number;
  };
  // Calculados no frontend
  pontuacao?: {
    taxa_showup: number;
    taxa_exp_mat: number;
    taxa_geral: number;
    volume: number;
    ticket: number;
    bonus: number;
    penalidades: number;
    total: number;
  };
  posicao?: number;
  acima_corte?: boolean;
}

export interface Penalidade {
  id: number;
  unidade_id: string;
  unidade_nome: string;
  tipo: string;
  descricao: string | null;
  pontos_descontados: number;
  data_ocorrencia: string;
  registrado_por: string;
  created_at: string;
}

export interface DadosPrograma {
  config: ConfigPrograma;
  hunters: HunterDados[];
  penalidades: Penalidade[];
}

interface HistoricoMatriculadorItem {
  mes: number;
  unidade_id: string;
  unidade_nome: string;
  total_leads: number;
  total_experimentais: number;
  total_matriculas: number;
  ticket_medio: number;
  taxa_showup: number;
  taxa_exp_mat: number;
  taxa_exp_mat_liberada?: boolean;
  conciliacao_exp_mat_carregada?: boolean;
  pendencias_exp_mat?: number;
  denominador_exp_mat?: number;
  conversoes_exp_mat?: number;
  taxa_geral: number;
}

interface HistoricoMatriculador {
  historico: HistoricoMatriculadorItem[];
  media_grupo: {
    taxa_geral: number;
    volume_medio: number;
    ticket_medio: number;
  };
}

interface KpisComercialCanonicosV2Payload {
  kpis?: {
    leads_entrantes?: number | string | null;
    experimentais_realizadas_status_operacional?: number | string | null;
    matriculas_comerciais_principais?: number | string | null;
  } | null;
}

interface ConciliacaoExperimentaisV2Payload {
  resumo?: {
    taxa_exp_mat_liberada?: boolean | null;
    taxa_exp_mat_canonica?: number | string | null;
    pendencias_taxa_exp_mat?: number | string | null;
    denominador_taxa_exp_mat?: number | string | null;
    conversoes_exp_mat_canonicas?: number | string | null;
    experimentais_realizadas_confirmadas?: number | string | null;
  } | null;
}

// Mapeamento de UUIDs para metas de volume e ticket
const UNIDADE_METAS_MAP: Record<string, { volume: string; ticket: string }> = {
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92': { volume: 'volume_campo_grande', ticket: 'ticket_campo_grande' },
  '95553e96-971b-4590-a6eb-0201d013c14d': { volume: 'volume_recreio', ticket: 'ticket_recreio' },
  '368d47f5-2d88-4475-bc14-ba084a9a348e': { volume: 'volume_barra', ticket: 'ticket_barra' },
};

function toNumber(valor: unknown): number {
  return toComercialMoneyNumber(valor);
}

function calcularTicketMedioPonderado(historico: HistoricoMatriculadorItem[]): number {
  const linhasComTicket = historico.filter((item) => item.ticket_medio > 0 && item.total_matriculas > 0);
  const totalMatriculasComTicket = linhasComTicket.reduce((acc, item) => acc + item.total_matriculas, 0);

  if (totalMatriculasComTicket <= 0) return 0;

  const totalPonderado = linhasComTicket.reduce(
    (acc, item) => acc + item.ticket_medio * item.total_matriculas,
    0,
  );

  return Math.round(totalPonderado / totalMatriculasComTicket);
}

function calcularPontosProporcionais(
  valorAtual: number,
  meta: number,
  pontosMaximos: number,
  habilitado: boolean = true,
): number {
  if (!habilitado || meta <= 0 || pontosMaximos <= 0 || valorAtual <= 0) {
    return 0;
  }

  const proporcao = Math.min(1, valorAtual / meta);
  return Math.round(pontosMaximos * proporcao);
}

function normalizarMesesPrograma(config?: ConfigPrograma, mesReferencia?: number): number[] {
  const inicio = Math.max(1, Math.min(12, Math.trunc(config?.periodo?.mes_inicio || 1)));
  const fimConfigurado = Math.max(inicio, Math.min(12, Math.trunc(config?.periodo?.mes_fim || 11)));
  const fimReferencia = mesReferencia
    ? Math.max(inicio, Math.min(12, Math.trunc(mesReferencia)))
    : fimConfigurado;
  const fim = Math.min(fimConfigurado, fimReferencia);

  return Array.from({ length: fim - inicio + 1 }, (_, index) => inicio + index);
}

async function buscarMetricasMensaisV2(
  ano: number,
  unidadeId: string,
  config: ConfigPrograma,
  mesReferencia?: number,
): Promise<HistoricoMatriculadorItem[]> {
  const meses = normalizarMesesPrograma(config, mesReferencia);
  const kpisPorMes = await Promise.all(meses.map(async (mes) => {
    const kpisResponse = await supabase.rpc('get_kpis_comercial_canonicos_v2', {
        p_unidade_id: unidadeId,
        p_ano: ano,
        p_mes: mes,
        p_periodo: 'mensal',
        p_data: null,
    });

    if (kpisResponse.error) {
      throw new Error(
        `Erro ao buscar metricas v2 do Matriculador ${ano}-${String(mes).padStart(2, '0')}: ${kpisResponse.error.message}`,
      );
    }

    return {
      mes,
      payload: kpisResponse.data as KpisComercialCanonicosV2Payload | null,
    };
  }));

  const conciliacoes = await Promise.all(meses.map(async (mes) => {
    const conciliacaoResponse = await supabase.rpc('get_conciliacao_experimentais_v2', {
        p_unidade_id: unidadeId,
        p_ano: ano,
        p_mes: mes,
        p_periodo: 'mensal',
        p_data: null,
    });

    if (conciliacaoResponse.error) {
      console.warn(
        `Conciliacao v2 indisponivel no Matriculador ${ano}-${String(mes).padStart(2, '0')}:`,
        conciliacaoResponse.error.message,
      );
      return { mes, payload: null };
    }

    return { mes, payload: conciliacaoResponse.data as ConciliacaoExperimentaisV2Payload | null };
  }));
  const conciliacaoPorMes = new Map<number, ConciliacaoExperimentaisV2Payload | null>(
    conciliacoes.map((item) => [item.mes, item.payload]),
  );

  const primeiroMes = meses[0];
  const ultimoMes = meses[meses.length - 1];
  const dataInicio = `${ano}-${String(primeiroMes).padStart(2, '0')}-01`;
  const dataFim = `${ano}-${String(ultimoMes).padStart(2, '0')}-${new Date(ano, ultimoMes, 0).getDate()}`;
  const { data: matriculasData, error: matriculasError } = await supabase
    .from('alunos')
    .select(`
      data_matricula,
      valor_parcela,
      valor_passaporte,
      is_segundo_curso,
      status,
      cursos:curso_id!left(nome, is_projeto_banda),
      tipos_matricula:tipo_matricula_id!left(codigo, conta_como_pagante, entra_ticket_medio)
    `)
    .eq('unidade_id', unidadeId)
    .gte('data_matricula', dataInicio)
    .lte('data_matricula', dataFim);

  if (matriculasError) {
    throw new Error(
      `Erro ao buscar tickets canonicos do Matriculador ${ano}: ${matriculasError.message}`,
    );
  }

  const ticketParcelaPorMes = calcularTicketParcelaCanonicoPorMes(
    (matriculasData || []) as MatriculaComercialCanonicaLike[],
    meses,
  );

  return kpisPorMes.map(({ mes, payload }) => {
    const conciliacao = conciliacaoPorMes.get(mes) || null;
    const resumoConciliacao = conciliacao?.resumo || {};
    const leads = toNumber(payload?.kpis?.leads_entrantes);
    const experimentaisConciliacao = toNumber(
      resumoConciliacao.experimentais_realizadas_confirmadas ??
        resumoConciliacao.denominador_taxa_exp_mat,
    );
    const experimentais = experimentaisConciliacao ||
      toNumber(payload?.kpis?.experimentais_realizadas_status_operacional);
    const matriculas = toNumber(payload?.kpis?.matriculas_comerciais_principais);
    const pendenciasExpMat = toNumber(resumoConciliacao.pendencias_taxa_exp_mat);
    const denominadorExpMat = toNumber(resumoConciliacao.denominador_taxa_exp_mat);
    const conversoesExpMat = toNumber(resumoConciliacao.conversoes_exp_mat_canonicas);
    const taxaExpMatLiberada =
      resumoConciliacao.taxa_exp_mat_liberada === true &&
      pendenciasExpMat === 0 &&
      denominadorExpMat > 0;
    const taxaExpMat = taxaExpMatLiberada && denominadorExpMat > 0
      ? Number(((conversoesExpMat / denominadorExpMat) * 100).toFixed(1))
      : 0;

    return {
      mes,
      unidade_id: unidadeId,
      unidade_nome: '',
      total_leads: leads,
      total_experimentais: experimentais,
      total_matriculas: matriculas,
      ticket_medio: ticketParcelaPorMes.get(mes) || 0,
      taxa_showup: leads > 0 ? Number(((experimentais / leads) * 100).toFixed(1)) : 0,
      taxa_exp_mat: taxaExpMat,
      taxa_exp_mat_liberada: taxaExpMatLiberada,
      conciliacao_exp_mat_carregada: Boolean(conciliacao),
      pendencias_exp_mat: pendenciasExpMat,
      denominador_exp_mat: denominadorExpMat,
      conversoes_exp_mat: conversoesExpMat,
      taxa_geral: leads > 0 ? Number(((matriculas / leads) * 100).toFixed(1)) : 0,
    };
  });
}

function consolidarMetricasV2(
  historico: HistoricoMatriculadorItem[],
  metricasLegadas: HunterDados['metricas'],
  mesReferencia?: number,
): HunterDados['metricas'] {
  const totalLeads = historico.reduce((acc, item) => acc + item.total_leads, 0);
  const totalExperimentais = historico.reduce((acc, item) => acc + item.total_experimentais, 0);
  const totalMatriculas = historico.reduce((acc, item) => acc + item.total_matriculas, 0);
  const mesesComDados = historico.length || 1;
  const mediaTicketCanonica = calcularTicketMedioPonderado(historico);
  const referenciaExpMat =
    (mesReferencia ? historico.find((item) => item.mes === mesReferencia) : null) ||
    [...historico].reverse().find((item) => (item.denominador_exp_mat || 0) > 0);

  return {
    ...metricasLegadas,
    total_leads: totalLeads,
    total_experimentais: totalExperimentais,
    total_matriculas: totalMatriculas,
    meses_com_dados: mesesComDados,
    media_matriculas_mes: Number((totalMatriculas / mesesComDados).toFixed(1)),
    media_ticket: mediaTicketCanonica || 0,
    taxa_showup_exp: totalLeads > 0 ? (totalExperimentais / totalLeads) * 100 : 0,
    taxa_exp_mat: referenciaExpMat?.taxa_exp_mat_liberada ? referenciaExpMat.taxa_exp_mat : 0,
    taxa_exp_mat_liberada: referenciaExpMat?.taxa_exp_mat_liberada === true,
    pendencias_exp_mat: referenciaExpMat?.pendencias_exp_mat || 0,
    denominador_exp_mat: referenciaExpMat?.denominador_exp_mat || 0,
    conversoes_exp_mat: referenciaExpMat?.conversoes_exp_mat || 0,
    taxa_geral: totalLeads > 0 ? (totalMatriculas / totalLeads) * 100 : 0,
  };
}

function consolidarHistoricoMatriculadorV2(
  historicoV2: HistoricoMatriculadorItem[],
  historicoLegado?: HistoricoMatriculador | null,
): HistoricoMatriculador {
  const linhasComLeads = historicoV2.filter((item) => item.total_leads > 0);
  const mediaTicketCanonica = calcularTicketMedioPonderado(historicoV2);

  return {
    historico: historicoV2,
    media_grupo: {
      taxa_geral: linhasComLeads.length > 0
        ? Number((linhasComLeads.reduce((acc, item) => acc + item.taxa_geral, 0) / linhasComLeads.length).toFixed(1))
        : historicoLegado?.media_grupo?.taxa_geral || 0,
      volume_medio: historicoV2.length > 0
        ? Number((historicoV2.reduce((acc, item) => acc + item.total_matriculas, 0) / historicoV2.length).toFixed(1))
        : historicoLegado?.media_grupo?.volume_medio || 0,
      ticket_medio: mediaTicketCanonica || 0,
    },
  };
}
// Função para calcular pontuação de um Hunter
function calcularPontuacao(
  hunter: HunterDados,
  config: ConfigPrograma
): HunterDados['pontuacao'] {
  const { metricas, penalidades } = hunter;
  const { metas, pontuacao: pontosConfig } = config;

  // Identificar metas específicas da unidade
  const unidadeKey = UNIDADE_METAS_MAP[hunter.unidade_id];
  const metaVolume = unidadeKey ? (metas as any)[unidadeKey.volume] || 20 : 20;
  const metaTicket = unidadeKey ? (metas as any)[unidadeKey.ticket] || 400 : 400;

  // Calcular pontos por metrica com progresso proporcional.
  // A meta cheia continua dando 100% dos pontos; abaixo da meta ganha a parte proporcional.
  const pontosTaxaShowup = calcularPontosProporcionais(
    metricas.taxa_showup_exp,
    metas.taxa_showup_experimental,
    pontosConfig.taxa_showup,
  );
  const pontosTaxaExpMat = calcularPontosProporcionais(
    metricas.taxa_exp_mat,
    metas.taxa_experimental_matricula,
    pontosConfig.taxa_exp_mat,
    metricas.taxa_exp_mat_liberada === true,
  );
  const pontosTaxaGeral = calcularPontosProporcionais(
    metricas.taxa_geral,
    metas.taxa_lead_matricula,
    pontosConfig.taxa_geral,
  );
  const pontosVolume = calcularPontosProporcionais(
    metricas.media_matriculas_mes,
    metaVolume,
    pontosConfig.volume_medio,
  );
  const pontosTicket = calcularPontosProporcionais(
    metricas.media_ticket,
    metaTicket,
    pontosConfig.ticket_medio,
  );

  // Calcular bônus por performance acima da meta
  // LIMITE: máximo 20 pontos de bônus por categoria para evitar distorções com poucos dados
  const MAX_BONUS_POR_CATEGORIA = 20;
  let bonus = 0;
  if (config.bonus) {
    // Bônus taxa showup: +5 pts a cada 2% acima (máx 20 pts)
    if (metricas.taxa_showup_exp > metas.taxa_showup_experimental) {
      const acima = metricas.taxa_showup_exp - metas.taxa_showup_experimental;
      bonus += Math.min(MAX_BONUS_POR_CATEGORIA, Math.floor(acima / 2) * config.bonus.taxa_showup_por_2pct);
    }
    // Bonus taxa exp->mat: apenas quando a competencia estiver liberada pela conciliacao v2.
    if (
      metricas.taxa_exp_mat_liberada &&
      metricas.taxa_exp_mat > metas.taxa_experimental_matricula
    ) {
      const acima = metricas.taxa_exp_mat - metas.taxa_experimental_matricula;
      bonus += Math.min(MAX_BONUS_POR_CATEGORIA, Math.floor(acima / 5) * config.bonus.taxa_exp_mat_por_5pct);
    }
    // Bônus taxa geral: +10 pts a cada 1% acima (máx 20 pts)
    if (metricas.taxa_geral > metas.taxa_lead_matricula) {
      const acima = metricas.taxa_geral - metas.taxa_lead_matricula;
      bonus += Math.min(MAX_BONUS_POR_CATEGORIA, Math.floor(acima / 1) * config.bonus.taxa_geral_por_1pct);
    }
    // Bônus volume: +5 pts a cada 2 acima (máx 20 pts)
    if (metricas.media_matriculas_mes > metaVolume) {
      const acima = metricas.media_matriculas_mes - metaVolume;
      bonus += Math.min(MAX_BONUS_POR_CATEGORIA, Math.floor(acima / 2) * config.bonus.volume_por_2_acima);
    }
    // Bônus ticket: +5 pts a cada R$20 acima (máx 20 pts)
    if (metricas.media_ticket > metaTicket) {
      const acima = metricas.media_ticket - metaTicket;
      bonus += Math.min(MAX_BONUS_POR_CATEGORIA, Math.floor(acima / 20) * config.bonus.ticket_por_20_acima);
    }
  }

  // Total
  const total = pontosTaxaShowup + pontosTaxaExpMat + pontosTaxaGeral +
                pontosVolume + pontosTicket + bonus - penalidades.total_pontos;

  return {
    taxa_showup: pontosTaxaShowup,
    taxa_exp_mat: pontosTaxaExpMat,
    taxa_geral: pontosTaxaGeral,
    volume: pontosVolume,
    ticket: pontosTicket,
    bonus,
    penalidades: penalidades.total_pontos,
    total: Math.max(0, total),
  };
}

export function useMatriculadorPrograma(ano: number = 2026, unidadeId?: string | null, mesReferencia?: number) {
  const [dados, setDados] = useState<DadosPrograma | null>(null);
  const [historico, setHistorico] = useState<HistoricoMatriculador | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const carregarDados = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Chamar função SQL que retorna todos os dados
      const { data, error: rpcError } = await supabase.rpc('get_programa_matriculador_dados', {
        p_ano: ano,
        p_unidade_id: unidadeId === 'todos' ? null : unidadeId,
      });

      if (rpcError) throw rpcError;

      const resultado = data as DadosPrograma;

      // Calcular pontuacao para cada Hunter e reaproveitar a mesma serie v2 no historico.
      if (resultado.hunters && resultado.config) {
        const huntersComMetricasV2: HunterDados[] = [];
        const historicoV2Consolidado: HistoricoMatriculadorItem[] = [];
        let historicoLegado: HistoricoMatriculador | null = null;

        const { data: historicoData, error: historicoError } = await supabase.rpc('get_historico_mensal_matriculador', {
          p_ano: ano,
          p_unidade_id: unidadeId === 'todos' ? null : unidadeId,
        });

        if (historicoError) {
          console.warn('Historico legado do Matriculador indisponivel:', historicoError.message);
        } else {
          historicoLegado = historicoData as HistoricoMatriculador;
        }

        const legadoPorUnidadeMes = new Map<string, HistoricoMatriculadorItem>();
        historicoLegado?.historico?.forEach((item) => {
          legadoPorUnidadeMes.set(`${item.unidade_id}:${item.mes}`, item);
        });

        for (const hunter of resultado.hunters) {
          const historicoV2 = await buscarMetricasMensaisV2(ano, hunter.unidade_id, resultado.config, mesReferencia);
          const historicoV2ComLegado = historicoV2.map((item) => {
            const legado = legadoPorUnidadeMes.get(`${hunter.unidade_id}:${item.mes}`);

            return {
              ...item,
              unidade_nome: hunter.unidade_nome || legado?.unidade_nome || item.unidade_nome,
              ticket_medio: item.ticket_medio || 0,
            };
          });
          const metricasV2 = consolidarMetricasV2(historicoV2ComLegado, hunter.metricas, mesReferencia);
          const hunterComMetricasV2 = {
            ...hunter,
            metricas: metricasV2,
          };

          historicoV2Consolidado.push(...historicoV2ComLegado);

          huntersComMetricasV2.push({
            ...hunterComMetricasV2,
            pontuacao: calcularPontuacao(hunterComMetricasV2, resultado.config),
          });
        }

        resultado.hunters = huntersComMetricasV2;

        // Ordenar por pontuacao total (decrescente) e atribuir posicao
        resultado.hunters.sort((a, b) =>
          (b.pontuacao?.total || 0) - (a.pontuacao?.total || 0)
        );

        resultado.hunters = resultado.hunters.map((hunter, index) => ({
          ...hunter,
          posicao: index + 1,
          acima_corte: (hunter.pontuacao?.total || 0) >= resultado.config.nota_corte,
        }));

        setHistorico(consolidarHistoricoMatriculadorV2(historicoV2Consolidado, historicoLegado));
      }

      setDados(resultado);
    } catch (err) {
      console.error('Erro ao carregar dados do programa:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [ano, unidadeId, mesReferencia]);

  // Registrar penalidade
  const registrarPenalidade = useCallback(async (
    unidadeId: string,
    tipo: string,
    descricao: string,
    pontos: number,
    dataOcorrencia: Date,
    registradoPor: string
  ) => {
    try {
      const { data, error } = await supabase.rpc('registrar_penalidade_matriculador', {
        p_ano: ano,
        p_unidade_id: unidadeId,
        p_tipo: tipo,
        p_descricao: descricao,
        p_pontos: pontos,
        p_data_ocorrencia: dataOcorrencia.toISOString().split('T')[0],
        p_registrado_por: registradoPor,
      });

      if (error) throw error;

      // Recarregar dados
      await carregarDados();
      return { success: true, data };
    } catch (err) {
      console.error('Erro ao registrar penalidade:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Erro desconhecido' };
    }
  }, [ano, carregarDados]);

  // Deletar penalidade
  const deletarPenalidade = useCallback(async (id: number) => {
    try {
      const { data, error } = await supabase.rpc('deletar_penalidade_matriculador', {
        p_id: id,
      });

      if (error) throw error;

      // Recarregar dados
      await carregarDados();
      return { success: true, data };
    } catch (err) {
      console.error('Erro ao deletar penalidade:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Erro desconhecido' };
    }
  }, [carregarDados]);

  // Atualizar penalidade (edição inline)
  const atualizarPenalidade = useCallback(async (
    id: number,
    campo: string,
    valor: string | number | null
  ) => {
    try {
      const { error } = await supabase
        .from('programa_matriculador_penalidades')
        .update({ [campo]: valor, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      // Recarregar dados
      await carregarDados();
      return { success: true };
    } catch (err) {
      console.error('Erro ao atualizar penalidade:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Erro desconhecido' };
    }
  }, [carregarDados]);

  // Atualizar configurações
  const atualizarConfig = useCallback(async (novaConfig: Partial<ConfigPrograma>) => {
    try {
      const { data, error } = await supabase.rpc('atualizar_config_matriculador', {
        p_ano: ano,
        p_config: novaConfig,
      });

      if (error) throw error;

      // Recarregar dados
      await carregarDados();
      return { success: true, data };
    } catch (err) {
      console.error('Erro ao atualizar configurações:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Erro desconhecido' };
    }
  }, [ano, carregarDados]);


  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  return {
    dados,
    historico,
    loading,
    error,
    recarregar: carregarDados,
    registrarPenalidade,
    deletarPenalidade,
    atualizarPenalidade,
    atualizarConfig,
  };
}
