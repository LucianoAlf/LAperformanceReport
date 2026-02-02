import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

// Tipos
export interface ConfigFideliza {
  ano: number;
  metas: {
    churn_maximo: number;
    inadimplencia_maxima: number;
    renovacao_minima: number;
    reajuste_minimo: number;
    lojinha_campo_grande: number;
    lojinha_recreio: number;
    lojinha_barra: number;
  };
  pontuacao: {
    churn: number;
    inadimplencia: number;
    renovacao: number;
    reajuste: number;
    lojinha: number;
  };
  penalidades: {
    nao_preencheu_sistema: number;
    nao_preencheu_lareport: number;
    reincidencia_mes: number;
  };
  nota_corte: number;
  criterio_desempate: string;
}

export interface FarmerDados {
  unidade_id: string;
  unidade_nome: string;
  farmers: {
    nomes: string;
    apelidos: string;
  };
  metricas: {
    churn_rate: number;
    inadimplencia_pct: number;
    taxa_renovacao: number;
    reajuste_medio: number;
    vendas_lojinha: number;
  };
  penalidades: {
    total_pontos: number;
    quantidade: number;
  };
  // Calculados no frontend
  pontuacao?: {
    churn: number;
    inadimplencia: number;
    renovacao: number;
    reajuste: number;
    lojinha: number;
    bonus: number;
    penalidades: number;
    total: number;
  };
  criterios_batidos?: number;
  experiencia_tipo?: 'premium' | 'standard' | null;
  posicao?: number;
}

export interface PenalidadeFideliza {
  id: number;
  unidade_id: string;
  unidade_nome: string;
  trimestre: number;
  tipo: string;
  descricao: string | null;
  pontos_descontados: number;
  data_ocorrencia: string;
  registrado_por: string;
  created_at: string;
}

export interface HistoricoTrimestral {
  ano: number;
  trimestre: number;
  unidade_id: string;
  unidade_nome: string;
  churn_rate: number;
  inadimplencia_pct: number;
  taxa_renovacao: number;
  reajuste_medio: number;
  vendas_lojinha: number;
  bateu_churn: boolean;
  bateu_inadimplencia: boolean;
  bateu_renovacao: boolean;
  bateu_reajuste: boolean;
  bateu_lojinha: boolean;
  pontos_total: number;
  posicao: number;
  experiencia_tipo: 'premium' | 'standard' | null;
}

export interface Experiencia {
  id: number;
  tipo: 'standard' | 'premium';
  nome: string;
  descricao: string;
  emoji: string;
  valor_estimado: number;
}

export interface DadosFideliza {
  config: ConfigFideliza;
  trimestre_atual: number;
  farmers: FarmerDados[];
  penalidades: PenalidadeFideliza[];
  historico: HistoricoTrimestral[];
  experiencias: Experiencia[];
}

// Mapeamento de UUIDs para metas de lojinha
const UNIDADE_LOJINHA_MAP: Record<string, string> = {
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 'lojinha_campo_grande',
  '95553e96-971b-4590-a6eb-0201d013c14d': 'lojinha_recreio',
  '368d47f5-2d88-4475-bc14-ba084a9a348e': 'lojinha_barra',
};

// Hook principal
export function useFidelizaPrograma(ano: number = 2026, trimestre?: number, unidadeId?: string) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<ConfigFideliza | null>(null);
  const [trimestreAtual, setTrimestreAtual] = useState<number>(1);
  const [farmers, setFarmers] = useState<FarmerDados[]>([]);
  const [penalidades, setPenalidades] = useState<PenalidadeFideliza[]>([]);
  const [historico, setHistorico] = useState<HistoricoTrimestral[]>([]);
  const [experiencias, setExperiencias] = useState<Experiencia[]>([]);

  // Calcular pontuação de cada farmer
  const calcularPontuacao = useCallback((farmer: FarmerDados, cfg: ConfigFideliza): FarmerDados => {
    const { metricas, penalidades: pen } = farmer;
    const { metas, pontuacao: pts } = cfg;
    
    // Meta de lojinha específica da unidade
    const metaLojinhaKey = UNIDADE_LOJINHA_MAP[farmer.unidade_id] as keyof typeof metas;
    const metaLojinha = metas[metaLojinhaKey] || 3000;

    // Verificar critérios batidos
    const bateuChurn = metricas.churn_rate <= metas.churn_maximo;
    const bateuInadimplencia = metricas.inadimplencia_pct <= metas.inadimplencia_maxima;
    const bateuRenovacao = metricas.taxa_renovacao >= metas.renovacao_minima;
    const bateuReajuste = metricas.reajuste_medio >= metas.reajuste_minimo;
    const bateuLojinha = metricas.vendas_lojinha >= metaLojinha;

    // Calcular pontos base
    const pontosChurn = bateuChurn ? pts.churn : 0;
    const pontosInadimplencia = bateuInadimplencia ? pts.inadimplencia : 0;
    const pontosRenovacao = bateuRenovacao ? pts.renovacao : 0;
    const pontosReajuste = bateuReajuste ? pts.reajuste : 0;
    const pontosLojinha = bateuLojinha ? pts.lojinha : 0;

    // Calcular bônus por performance acima da meta (máx 20 pts por categoria)
    let bonus = 0;
    
    // Bônus churn: +5 pts por cada 0.5% abaixo da meta (máx 20)
    if (bateuChurn && metricas.churn_rate < metas.churn_maximo) {
      const diferenca = metas.churn_maximo - metricas.churn_rate;
      bonus += Math.min(Math.floor(diferenca / 0.5) * 5, 20);
    }
    
    // Bônus inadimplência: +5 pts se 0%
    if (bateuInadimplencia && metricas.inadimplencia_pct === 0) {
      bonus += 5;
    }
    
    // Bônus renovação: +5 pts por cada 2% acima da meta (máx 20)
    if (bateuRenovacao && metricas.taxa_renovacao > metas.renovacao_minima) {
      const diferenca = metricas.taxa_renovacao - metas.renovacao_minima;
      bonus += Math.min(Math.floor(diferenca / 2) * 5, 20);
    }
    
    // Bônus reajuste: +3 pts por cada 0.5% acima da meta (máx 15)
    if (bateuReajuste && metricas.reajuste_medio > metas.reajuste_minimo) {
      const diferenca = metricas.reajuste_medio - metas.reajuste_minimo;
      bonus += Math.min(Math.floor(diferenca / 0.5) * 3, 15);
    }
    
    // Bônus lojinha: +5 pts por cada 20% acima da meta (máx 15)
    if (bateuLojinha && metricas.vendas_lojinha > metaLojinha) {
      const percentualAcima = ((metricas.vendas_lojinha - metaLojinha) / metaLojinha) * 100;
      bonus += Math.min(Math.floor(percentualAcima / 20) * 5, 15);
    }

    // Total de critérios batidos
    const criteriosBatidos = [bateuChurn, bateuInadimplencia, bateuRenovacao, bateuReajuste, bateuLojinha].filter(Boolean).length;

    // Tipo de experiência
    let experienciaTipo: 'premium' | 'standard' | null = null;
    if (criteriosBatidos === 5) {
      experienciaTipo = 'premium';
    } else if (criteriosBatidos >= 4) {
      experienciaTipo = 'standard';
    }

    // Total
    const total = pontosChurn + pontosInadimplencia + pontosRenovacao + pontosReajuste + pontosLojinha + bonus - pen.total_pontos;

    return {
      ...farmer,
      pontuacao: {
        churn: pontosChurn,
        inadimplencia: pontosInadimplencia,
        renovacao: pontosRenovacao,
        reajuste: pontosReajuste,
        lojinha: pontosLojinha,
        bonus,
        penalidades: pen.total_pontos,
        total: Math.max(0, total),
      },
      criterios_batidos: criteriosBatidos,
      experiencia_tipo: experienciaTipo,
    };
  }, []);

  // Carregar dados
  const carregarDados = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: rpcError } = await supabase.rpc('get_programa_fideliza_dados', {
        p_ano: ano,
        p_trimestre: trimestre || null,
        p_unidade_id: unidadeId || null,
      });

      if (rpcError) throw rpcError;

      const dados = data as DadosFideliza;
      
      setConfig(dados.config);
      setTrimestreAtual(dados.trimestre_atual);
      setPenalidades(dados.penalidades || []);
      setHistorico(dados.historico || []);
      setExperiencias(dados.experiencias || []);

      // Calcular pontuação e ordenar farmers
      if (dados.farmers && dados.config) {
        const farmersComPontuacao = dados.farmers
          .map(f => calcularPontuacao(f, dados.config))
          .sort((a, b) => (b.pontuacao?.total || 0) - (a.pontuacao?.total || 0))
          .map((f, idx) => ({ ...f, posicao: idx + 1 }));
        
        setFarmers(farmersComPontuacao);
      }
    } catch (err) {
      console.error('Erro ao carregar dados do Fideliza+:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [ano, trimestre, unidadeId, calcularPontuacao]);

  // Registrar penalidade
  const registrarPenalidade = useCallback(async (
    unidadeId: string,
    tipo: string,
    descricao: string,
    pontos: number,
    dataOcorrencia: string,
    registradoPor: string
  ) => {
    try {
      const trim = trimestre || Math.ceil((new Date().getMonth() + 1) / 3);
      
      const { error } = await supabase.rpc('registrar_penalidade_fideliza', {
        p_ano: ano,
        p_trimestre: trim,
        p_unidade_id: unidadeId,
        p_tipo: tipo,
        p_descricao: descricao,
        p_pontos: pontos,
        p_data_ocorrencia: dataOcorrencia,
        p_registrado_por: registradoPor,
      });

      if (error) throw error;
      
      await carregarDados();
      return { success: true };
    } catch (err) {
      console.error('Erro ao registrar penalidade:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Erro desconhecido' };
    }
  }, [ano, trimestre, carregarDados]);

  // Deletar penalidade
  const deletarPenalidade = useCallback(async (id: number) => {
    try {
      const { error } = await supabase.rpc('deletar_penalidade_fideliza', { p_id: id });
      if (error) throw error;
      
      await carregarDados();
      return { success: true };
    } catch (err) {
      console.error('Erro ao deletar penalidade:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Erro desconhecido' };
    }
  }, [carregarDados]);

  // Atualizar penalidade inline
  const atualizarPenalidade = useCallback(async (
    id: number,
    campo: string,
    valor: string | number | null
  ) => {
    try {
      const { error } = await supabase
        .from('programa_fideliza_penalidades')
        .update({ [campo]: valor, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      
      await carregarDados();
      return { success: true };
    } catch (err) {
      console.error('Erro ao atualizar penalidade:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Erro desconhecido' };
    }
  }, [carregarDados]);

  // Atualizar configuração
  const atualizarConfig = useCallback(async (campo: string, valor: string | number) => {
    try {
      const { error } = await supabase.rpc('atualizar_config_fideliza', {
        p_ano: ano,
        p_campo: campo,
        p_valor: String(valor),
      });

      if (error) throw error;
      
      await carregarDados();
      return { success: true };
    } catch (err) {
      console.error('Erro ao atualizar config:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Erro desconhecido' };
    }
  }, [ano, carregarDados]);

  // Atualizar config diretamente na tabela
  const atualizarConfigDireto = useCallback(async (campo: string, valor: string | number) => {
    try {
      const { error } = await supabase
        .from('programa_fideliza_config')
        .update({ [campo]: valor, updated_at: new Date().toISOString() })
        .eq('ano', ano);

      if (error) throw error;
      
      await carregarDados();
      return { success: true };
    } catch (err) {
      console.error('Erro ao atualizar config:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Erro desconhecido' };
    }
  }, [ano, carregarDados]);

  // Salvar snapshot trimestral
  const salvarHistoricoTrimestral = useCallback(async (trim: number) => {
    try {
      const { error } = await supabase.rpc('salvar_historico_trimestral_fideliza', {
        p_ano: ano,
        p_trimestre: trim,
      });

      if (error) throw error;
      
      await carregarDados();
      return { success: true };
    } catch (err) {
      console.error('Erro ao salvar histórico:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Erro desconhecido' };
    }
  }, [ano, carregarDados]);

  // ═══════════════════════════════════════════════════════════════
  // CRUD DE EXPERIÊNCIAS
  // ═══════════════════════════════════════════════════════════════

  // Adicionar experiência
  const adicionarExperiencia = useCallback(async (
    tipo: 'standard' | 'premium',
    nome: string,
    descricao: string,
    emoji: string,
    valorEstimado: number
  ) => {
    try {
      const { error } = await supabase
        .from('programa_fideliza_experiencias')
        .insert({
          tipo,
          nome,
          descricao,
          emoji,
          valor_estimado: valorEstimado,
          ativo: true,
        });

      if (error) throw error;
      
      await carregarDados();
      return { success: true };
    } catch (err) {
      console.error('Erro ao adicionar experiência:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Erro desconhecido' };
    }
  }, [carregarDados]);

  // Atualizar experiência
  const atualizarExperiencia = useCallback(async (
    id: number,
    dados: Partial<{ tipo: string; nome: string; descricao: string; emoji: string; valor_estimado: number }>
  ) => {
    try {
      const { error } = await supabase
        .from('programa_fideliza_experiencias')
        .update({ ...dados, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      
      await carregarDados();
      return { success: true };
    } catch (err) {
      console.error('Erro ao atualizar experiência:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Erro desconhecido' };
    }
  }, [carregarDados]);

  // Deletar experiência (soft delete - marca como inativo)
  const deletarExperiencia = useCallback(async (id: number) => {
    try {
      const { error } = await supabase
        .from('programa_fideliza_experiencias')
        .update({ ativo: false, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      
      await carregarDados();
      return { success: true };
    } catch (err) {
      console.error('Erro ao deletar experiência:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Erro desconhecido' };
    }
  }, [carregarDados]);

  // Carregar dados ao montar
  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  return {
    loading,
    error,
    config,
    trimestreAtual,
    farmers,
    penalidades,
    historico,
    experiencias,
    carregarDados,
    registrarPenalidade,
    deletarPenalidade,
    atualizarPenalidade,
    atualizarConfig,
    atualizarConfigDireto,
    salvarHistoricoTrimestral,
    adicionarExperiencia,
    atualizarExperiencia,
    deletarExperiencia,
  };
}
