import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

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

// Mapeamento de UUIDs para metas de volume e ticket
const UNIDADE_METAS_MAP: Record<string, { volume: string; ticket: string }> = {
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92': { volume: 'volume_campo_grande', ticket: 'ticket_campo_grande' },
  '95553e96-971b-4590-a6eb-0201d013c14d': { volume: 'volume_recreio', ticket: 'ticket_recreio' },
  '368d47f5-2d88-4475-bc14-ba084a9a348e': { volume: 'volume_barra', ticket: 'ticket_barra' },
};

function toNumber(valor: unknown): number {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

function normalizarMesesPrograma(config?: ConfigPrograma): number[] {
  const inicio = Math.max(1, Math.min(12, Math.trunc(config?.periodo?.mes_inicio || 1)));
  const fim = Math.max(inicio, Math.min(12, Math.trunc(config?.periodo?.mes_fim || 11)));

  return Array.from({ length: fim - inicio + 1 }, (_, index) => inicio + index);
}

async function buscarMetricasMensaisV2(
  ano: number,
  unidadeId: string,
  config: ConfigPrograma,
): Promise<HistoricoMatriculadorItem[]> {
  const meses = normalizarMesesPrograma(config);
  const historico: HistoricoMatriculadorItem[] = [];

  for (const mes of meses) {
    const { data, error } = await supabase.rpc('get_kpis_comercial_canonicos_v2', {
      p_unidade_id: unidadeId,
      p_ano: ano,
      p_mes: mes,
      p_periodo: 'mensal',
      p_data: null,
    });

    if (error) {
      throw new Error(
        `Erro ao buscar metricas v2 do Matriculador ${ano}-${String(mes).padStart(2, '0')}: ${error.message}`,
      );
    }

    const payload = data as KpisComercialCanonicosV2Payload | null;
    const leads = toNumber(payload?.kpis?.leads_entrantes);
    const experimentais = toNumber(payload?.kpis?.experimentais_realizadas_status_operacional);
    const matriculas = toNumber(payload?.kpis?.matriculas_comerciais_principais);

    historico.push({
      mes,
      unidade_id: unidadeId,
      unidade_nome: '',
      total_leads: leads,
      total_experimentais: experimentais,
      total_matriculas: matriculas,
      ticket_medio: 0,
      taxa_showup: leads > 0 ? Number(((experimentais / leads) * 100).toFixed(1)) : 0,
      taxa_exp_mat: 0,
      taxa_geral: leads > 0 ? Number(((matriculas / leads) * 100).toFixed(1)) : 0,
    });
  }

  return historico;
}

function consolidarMetricasV2(
  historico: HistoricoMatriculadorItem[],
  metricasLegadas: HunterDados['metricas'],
): HunterDados['metricas'] {
  const totalLeads = historico.reduce((acc, item) => acc + item.total_leads, 0);
  const totalExperimentais = historico.reduce((acc, item) => acc + item.total_experimentais, 0);
  const totalMatriculas = historico.reduce((acc, item) => acc + item.total_matriculas, 0);
  const mesesComDados = historico.length || 1;

  return {
    ...metricasLegadas,
    total_leads: totalLeads,
    total_experimentais: totalExperimentais,
    total_matriculas: totalMatriculas,
    meses_com_dados: mesesComDados,
    media_matriculas_mes: Number((totalMatriculas / mesesComDados).toFixed(1)),
    taxa_showup_exp: totalLeads > 0 ? (totalExperimentais / totalLeads) * 100 : 0,
    taxa_exp_mat: 0,
    taxa_geral: totalLeads > 0 ? (totalMatriculas / totalLeads) * 100 : 0,
  };
}

async function sobreporHistoricoMatriculadorV2(
  ano: number,
  historicoLegado: HistoricoMatriculador,
  config: ConfigPrograma,
  unidadeId?: string | null,
): Promise<HistoricoMatriculador> {
  const unidadeIds = unidadeId && unidadeId !== 'todos'
    ? [unidadeId]
    : Array.from(new Set(historicoLegado.historico.map((item) => item.unidade_id))).filter(Boolean);

  const historicoV2: HistoricoMatriculadorItem[] = [];

  for (const id of unidadeIds) {
    const legadoPorMes = new Map(
      historicoLegado.historico
        .filter((item) => item.unidade_id === id)
        .map((item) => [item.mes, item]),
    );
    const unidadeNome = legadoPorMes.values().next().value?.unidade_nome || '';
    const serieV2 = await buscarMetricasMensaisV2(ano, id, config);

    serieV2.forEach((item) => {
      const legado = legadoPorMes.get(item.mes);
      historicoV2.push({
        ...item,
        unidade_nome: unidadeNome || legado?.unidade_nome || item.unidade_nome,
        ticket_medio: legado?.ticket_medio || 0,
      });
    });
  }

  const linhasComLeads = historicoV2.filter((item) => item.total_leads > 0);
  const linhasComTicket = historicoV2.filter((item) => item.ticket_medio > 0);

  return {
    historico: historicoV2,
    media_grupo: {
      taxa_geral: linhasComLeads.length > 0
        ? Number((linhasComLeads.reduce((acc, item) => acc + item.taxa_geral, 0) / linhasComLeads.length).toFixed(1))
        : 0,
      volume_medio: historicoV2.length > 0
        ? Number((historicoV2.reduce((acc, item) => acc + item.total_matriculas, 0) / historicoV2.length).toFixed(1))
        : 0,
      ticket_medio: linhasComTicket.length > 0
        ? Math.round(linhasComTicket.reduce((acc, item) => acc + item.ticket_medio, 0) / linhasComTicket.length)
        : historicoLegado.media_grupo?.ticket_medio || 0,
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

  // Calcular pontos por métrica (só ganha se bater a meta)
  const pontosTaxaShowup = metricas.taxa_showup_exp >= metas.taxa_showup_experimental 
    ? pontosConfig.taxa_showup : 0;
  const pontosTaxaExpMat = 0;
  const pontosTaxaGeral = metricas.taxa_geral >= metas.taxa_lead_matricula 
    ? pontosConfig.taxa_geral : 0;
  const pontosVolume = metricas.media_matriculas_mes >= metaVolume 
    ? pontosConfig.volume_medio : 0;
  const pontosTicket = metricas.media_ticket >= metaTicket 
    ? pontosConfig.ticket_medio : 0;

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
    // Taxa exp->mat segue bloqueada ate regra canonica de presenca/vinculo.
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
  const total = pontosTaxaShowup + pontosTaxaGeral +
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

export function useMatriculadorPrograma(ano: number = 2026, unidadeId?: string | null) {
  const [dados, setDados] = useState<DadosPrograma | null>(null);
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

      // Calcular pontuação para cada Hunter
      if (resultado.hunters && resultado.config) {
        const huntersComMetricasV2: HunterDados[] = [];

        for (const hunter of resultado.hunters) {
          const historicoV2 = await buscarMetricasMensaisV2(ano, hunter.unidade_id, resultado.config);
          const metricasV2 = consolidarMetricasV2(historicoV2, hunter.metricas);
          const hunterComMetricasV2 = {
            ...hunter,
            metricas: metricasV2,
          };

          huntersComMetricasV2.push({
            ...hunterComMetricasV2,
            pontuacao: calcularPontuacao(hunterComMetricasV2, resultado.config),
          });
        }

        resultado.hunters = huntersComMetricasV2;

        // Ordenar por pontuação total (decrescente) e atribuir posição
        resultado.hunters.sort((a, b) => 
          (b.pontuacao?.total || 0) - (a.pontuacao?.total || 0)
        );

        resultado.hunters = resultado.hunters.map((hunter, index) => ({
          ...hunter,
          posicao: index + 1,
          acima_corte: (hunter.pontuacao?.total || 0) >= resultado.config.nota_corte,
        }));
      }

      setDados(resultado);
    } catch (err) {
      console.error('Erro ao carregar dados do programa:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [ano, unidadeId]);

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

  // Buscar histórico mensal
  const [historico, setHistorico] = useState<HistoricoMatriculador | null>(null);

  const carregarHistorico = useCallback(async () => {
    try {
      const { data, error: rpcError } = await supabase.rpc('get_historico_mensal_matriculador', {
        p_ano: ano,
        p_unidade_id: unidadeId === 'todos' ? null : unidadeId,
      });

      if (rpcError) throw rpcError;

      const historicoLegado = data as HistoricoMatriculador;
      const configAtual: ConfigPrograma = {
        ano,
        metas: {
          taxa_showup_experimental: 0,
          taxa_experimental_matricula: 0,
          taxa_lead_matricula: 0,
          volume_campo_grande: 0,
          volume_recreio: 0,
          volume_barra: 0,
          ticket_campo_grande: 0,
          ticket_recreio: 0,
          ticket_barra: 0,
        },
        pontuacao: {
          taxa_showup: 0,
          taxa_exp_mat: 0,
          taxa_geral: 0,
          volume_medio: 0,
          ticket_medio: 0,
        },
        nota_corte: 0,
        periodo: {
          mes_inicio: 1,
          mes_fim: 11,
        },
      };

      setHistorico(
        await sobreporHistoricoMatriculadorV2(ano, historicoLegado, configAtual, unidadeId),
      );
    } catch (err) {
      console.error('Erro ao carregar histórico:', err);
    }
  }, [ano, unidadeId]);

  useEffect(() => {
    carregarDados();
    carregarHistorico();
  }, [carregarDados, carregarHistorico]);

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
