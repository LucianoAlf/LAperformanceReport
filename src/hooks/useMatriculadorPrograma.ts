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

// Mapeamento de UUIDs para metas de volume e ticket
const UNIDADE_METAS_MAP: Record<string, { volume: string; ticket: string }> = {
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92': { volume: 'volume_campo_grande', ticket: 'ticket_campo_grande' },
  '95553e96-971b-4590-a6eb-0201d013c14d': { volume: 'volume_recreio', ticket: 'ticket_recreio' },
  '368d47f5-2d88-4475-bc14-ba084a9a348e': { volume: 'volume_barra', ticket: 'ticket_barra' },
};

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
  const pontosTaxaExpMat = metricas.taxa_exp_mat >= metas.taxa_experimental_matricula 
    ? pontosConfig.taxa_exp_mat : 0;
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
    // Bônus taxa exp→mat: +5 pts a cada 5% acima (máx 20 pts)
    if (metricas.taxa_exp_mat > metas.taxa_experimental_matricula) {
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
        resultado.hunters = resultado.hunters.map(hunter => ({
          ...hunter,
          pontuacao: calcularPontuacao(hunter, resultado.config),
        }));

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
  const [historico, setHistorico] = useState<{
    historico: Array<{
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
    }>;
    media_grupo: {
      taxa_geral: number;
      volume_medio: number;
      ticket_medio: number;
    };
  } | null>(null);

  const carregarHistorico = useCallback(async () => {
    try {
      const { data, error: rpcError } = await supabase.rpc('get_historico_mensal_matriculador', {
        p_ano: ano,
        p_unidade_id: unidadeId === 'todos' ? null : unidadeId,
      });

      if (rpcError) throw rpcError;
      setHistorico(data);
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
