// Hook principal do Simulador de Metas

import { useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  InputsSimulacao, 
  ResultadoSimulacao, 
  DadosHistoricos,
  Cenario,
  DEFAULTS_SIMULACAO 
} from '@/lib/simulador/tipos';
import { calcularSimulacao, gerarProjecaoMensal } from '@/lib/simulador/calculos';

interface UseSimuladorResult {
  // Estado
  inputs: InputsSimulacao;
  resultado: ResultadoSimulacao | null;
  cenarios: Cenario[];
  cenarioAtivo: string | null;
  loading: boolean;
  salvando: boolean;
  error: string | null;
  
  // Ações
  setInput: <K extends keyof InputsSimulacao>(campo: K, valor: InputsSimulacao[K]) => void;
  setInputs: (novosInputs: Partial<InputsSimulacao>) => void;
  recalcular: () => void;
  salvarCenario: (nome: string, descricao?: string) => Promise<void>;
  carregarCenario: (id: string) => void;
  deletarCenario: (id: string) => Promise<void>;
  aplicarMetas: () => Promise<void>;
  carregarCenarios: () => Promise<void>;
  resetar: () => void;
}

export function useSimulador(
  unidadeId: string | null,
  ano: number,
  dadosHistoricos: DadosHistoricos | null,
  alunosAtual: number = 0,
  ticketMedioAtual: number = 0,
  churnAtual: number = 4
): UseSimuladorResult {
  // Estado dos inputs
  const [inputs, setInputsState] = useState<InputsSimulacao>(() => ({
    unidadeId: unidadeId || '',
    ano,
    nome: 'Cenário Principal',
    tipoObjetivo: DEFAULTS_SIMULACAO.tipoObjetivo || 'alunos',
    tipoMetaFinanceira: DEFAULTS_SIMULACAO.tipoMetaFinanceira || 'mensal',
    alunosAtual,
    alunosObjetivo: Math.round(alunosAtual * 1.1), // +10% por padrão
    mesObjetivo: DEFAULTS_SIMULACAO.mesObjetivo || 12,
    mrrObjetivo: Math.round(alunosAtual * ticketMedioAtual * 1.1), // +10% por padrão
    churnProjetado: churnAtual || DEFAULTS_SIMULACAO.churnProjetado || 4,
    ticketMedio: ticketMedioAtual || 285,
    taxaLeadExp: dadosHistoricos?.taxaConversaoLeadExp || DEFAULTS_SIMULACAO.taxaLeadExp || 60,
    taxaExpMat: dadosHistoricos?.taxaConversaoExpMat || DEFAULTS_SIMULACAO.taxaExpMat || 50,
    inadimplenciaPct: DEFAULTS_SIMULACAO.inadimplenciaPct || 3,
  }));

  const [cenarios, setCenarios] = useState<Cenario[]>([]);
  const [cenarioAtivo, setCenarioAtivo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calcular resultado sempre que inputs mudam
  const resultado = useMemo(() => {
    // Permitir cálculo mesmo com alunosAtual = 0, mas exigir alunosObjetivo > 0
    if (inputs.alunosObjetivo <= 0) return null;
    return calcularSimulacao(inputs, dadosHistoricos || undefined);
  }, [inputs, dadosHistoricos]);

  // Atualizar um input específico
  const setInput = useCallback(<K extends keyof InputsSimulacao>(
    campo: K, 
    valor: InputsSimulacao[K]
  ) => {
    setInputsState(prev => ({ ...prev, [campo]: valor }));
  }, []);

  // Atualizar múltiplos inputs
  const setInputs = useCallback((novosInputs: Partial<InputsSimulacao>) => {
    setInputsState(prev => ({ ...prev, ...novosInputs }));
  }, []);

  // Forçar recálculo (útil após mudanças externas)
  const recalcular = useCallback(() => {
    setInputsState(prev => ({ ...prev }));
  }, []);

  // Resetar para valores padrão
  const resetar = useCallback(() => {
    setInputsState({
      unidadeId: unidadeId || '',
      ano,
      nome: 'Cenário Principal',
      tipoObjetivo: 'alunos',
      tipoMetaFinanceira: 'mensal',
      alunosAtual,
      alunosObjetivo: Math.round(alunosAtual * 1.1),
      mesObjetivo: 12,
      mrrObjetivo: Math.round(alunosAtual * ticketMedioAtual * 1.1),
      churnProjetado: churnAtual || 4,
      ticketMedio: ticketMedioAtual || 285,
      taxaLeadExp: dadosHistoricos?.taxaConversaoLeadExp || 60,
      taxaExpMat: dadosHistoricos?.taxaConversaoExpMat || 50,
      inadimplenciaPct: 3,
    });
    setCenarioAtivo(null);
  }, [unidadeId, ano, alunosAtual, ticketMedioAtual, churnAtual, dadosHistoricos]);

  // Carregar cenários salvos
  const carregarCenarios = useCallback(async () => {
    if (!unidadeId) return;
    
    setLoading(true);
    try {
      const { data, error: err } = await supabase
        .from('simulacoes_metas')
        .select('*')
        .eq('unidade_id', unidadeId)
        .eq('ano', ano)
        .order('criado_em', { ascending: false });

      if (err) throw err;

      const cenariosCarregados: Cenario[] = (data || []).map(row => {
        const inputsCenario: InputsSimulacao = {
          unidadeId: row.unidade_id,
          ano: row.ano,
          nome: row.nome,
          descricao: row.descricao,
          tipoObjetivo: row.tipo_objetivo || 'alunos',
          tipoMetaFinanceira: row.tipo_meta_financeira || 'mensal',
          alunosAtual: row.alunos_atual,
          alunosObjetivo: row.alunos_objetivo,
          mesObjetivo: row.mes_objetivo,
          mrrObjetivo: row.mrr_objetivo || 0,
          churnProjetado: parseFloat(row.churn_projetado),
          ticketMedio: parseFloat(row.ticket_medio),
          taxaLeadExp: parseFloat(row.taxa_lead_exp),
          taxaExpMat: parseFloat(row.taxa_exp_mat),
          inadimplenciaPct: parseFloat(row.inadimplencia_pct || '3'),
        };
        return {
          id: row.id,
          unidadeId: row.unidade_id,
          ano: row.ano,
          nome: row.nome,
          descricao: row.descricao,
          inputs: inputsCenario,
          resultado: calcularSimulacao(inputsCenario, dadosHistoricos || undefined),
          criadoEm: new Date(row.criado_em),
          atualizadoEm: new Date(row.atualizado_em),
          aplicadoEm: row.aplicado_em ? new Date(row.aplicado_em) : undefined,
        };
      });

      setCenarios(cenariosCarregados);
    } catch (err) {
      console.error('Erro ao carregar cenários:', err);
      setError('Erro ao carregar cenários salvos');
    } finally {
      setLoading(false);
    }
  }, [unidadeId, ano, dadosHistoricos]);

  // Salvar cenário atual
  const salvarCenario = useCallback(async (nome: string, descricao?: string) => {
    if (!unidadeId || !resultado) return;

    setSalvando(true);
    setError(null);

    try {
      const dadosCenario = {
        unidade_id: unidadeId,
        ano,
        nome,
        descricao,
        alunos_atual: inputs.alunosAtual,
        alunos_objetivo: inputs.alunosObjetivo,
        mes_objetivo: inputs.mesObjetivo,
        churn_projetado: inputs.churnProjetado,
        ticket_medio: inputs.ticketMedio,
        taxa_lead_exp: inputs.taxaLeadExp,
        taxa_exp_mat: inputs.taxaExpMat,
        tipo_objetivo: inputs.tipoObjetivo,
        tipo_meta_financeira: inputs.tipoMetaFinanceira,
        mrr_objetivo: inputs.mrrObjetivo,
        inadimplencia_pct: inputs.inadimplenciaPct,
        evasoes_mensais: resultado.evasoesMensais,
        matriculas_mensais: resultado.matriculasMensais,
        experimentais_mensais: resultado.experimentaisMensais,
        leads_mensais: resultado.leadsMensais,
        mrr_projetado: resultado.mrrProjetado,
        faturamento_anual: resultado.faturamentoAnualProjetado,
        ltv_projetado: resultado.ltvProjetado,
        alertas: resultado.alertas,
        score_viabilidade: resultado.scoreViabilidade,
      };

      const { data, error: err } = await supabase
        .from('simulacoes_metas')
        .upsert(dadosCenario, { 
          onConflict: 'unidade_id,ano,nome',
          ignoreDuplicates: false 
        })
        .select()
        .single();

      if (err) throw err;

      // Recarregar cenários
      await carregarCenarios();
      
      if (data) {
        setCenarioAtivo(data.id);
      }
    } catch (err) {
      console.error('Erro ao salvar cenário:', err);
      setError('Erro ao salvar cenário');
    } finally {
      setSalvando(false);
    }
  }, [unidadeId, ano, inputs, resultado, carregarCenarios]);

  // Carregar um cenário específico
  const carregarCenario = useCallback((id: string) => {
    const cenario = cenarios.find(c => c.id === id);
    if (cenario) {
      setInputsState(cenario.inputs);
      setCenarioAtivo(id);
    }
  }, [cenarios]);

  // Deletar cenário
  const deletarCenario = useCallback(async (id: string) => {
    setSalvando(true);
    try {
      const { error: err } = await supabase
        .from('simulacoes_metas')
        .delete()
        .eq('id', id);

      if (err) throw err;

      setCenarios(prev => prev.filter(c => c.id !== id));
      if (cenarioAtivo === id) {
        setCenarioAtivo(null);
      }
    } catch (err) {
      console.error('Erro ao deletar cenário:', err);
      setError('Erro ao deletar cenário');
    } finally {
      setSalvando(false);
    }
  }, [cenarioAtivo]);

  // Aplicar metas calculadas na tabela metas_kpi
  const aplicarMetas = useCallback(async () => {
    if (!unidadeId || !resultado) return;

    setSalvando(true);
    setError(null);

    try {
      // Metas a serem aplicadas (incluindo taxas de conversão e alunos atual editado)
      const metasParaAplicar = [
        { tipo: 'alunos_pagantes', valor: inputs.alunosObjetivo },
        { tipo: 'alunos_atual', valor: inputs.alunosAtual }, // Alunos atual editado
        { tipo: 'churn_rate', valor: inputs.churnProjetado },
        { tipo: 'ticket_medio', valor: inputs.ticketMedio },
        { tipo: 'leads', valor: resultado.leadsMensais },
        { tipo: 'experimentais', valor: resultado.experimentaisMensais },
        { tipo: 'matriculas', valor: resultado.matriculasMensais },
        { tipo: 'mrr', valor: resultado.mrrProjetado },
        // Taxas de conversão (parâmetros do simulador)
        { tipo: 'taxa_lead_exp', valor: inputs.taxaLeadExp },
        { tipo: 'taxa_exp_mat', valor: inputs.taxaExpMat },
      ];

      // Aplicar para todos os meses restantes do ano
      const mesAtual = new Date().getMonth() + 1;
      
      for (let mes = mesAtual; mes <= 12; mes++) {
        for (const meta of metasParaAplicar) {
          await supabase
            .from('metas_kpi')
            .upsert({
              ano,
              mes,
              unidade_id: unidadeId,
              tipo: meta.tipo,
              valor: meta.valor,
            }, {
              onConflict: 'ano,mes,unidade_id,tipo',
            });
        }
      }

      // Marcar cenário como aplicado
      if (cenarioAtivo) {
        await supabase
          .from('simulacoes_metas')
          .update({ aplicado_em: new Date().toISOString() })
          .eq('id', cenarioAtivo);
      }

      await carregarCenarios();
    } catch (err) {
      console.error('Erro ao aplicar metas:', err);
      setError('Erro ao aplicar metas');
    } finally {
      setSalvando(false);
    }
  }, [unidadeId, ano, inputs, resultado, cenarioAtivo, carregarCenarios]);

  return {
    inputs,
    resultado,
    cenarios,
    cenarioAtivo,
    loading,
    salvando,
    error,
    setInput,
    setInputs,
    recalcular,
    salvarCenario,
    carregarCenario,
    deletarCenario,
    aplicarMetas,
    carregarCenarios,
    resetar,
  };
}

export default useSimulador;
