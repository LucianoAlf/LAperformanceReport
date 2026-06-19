// Hook para buscar dados históricos para o simulador

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { DadosAtuais, DadosHistoricos } from '@/lib/simulador/tipos';
import { fetchKPIsAlunosCanonicos } from '@/hooks/useKPIsAlunosCanonicos';
import { isRenovacaoConfirmadaOperacional } from '@/lib/retencaoOperacionalCanonica';
import { fetchComercialOperacionalResumoV2 } from '@/hooks/useComercialOperacionalResumoV2';

interface UseDadosHistoricosResult {
  dadosAtuais: DadosAtuais | null;
  dadosHistoricos: DadosHistoricos | null;
  unidadeNome: string | null;
  loading: boolean;
  error: string | null;
}

export function useDadosHistoricos(
  unidadeId: string | null,
  ano: number,
  mes: number
): UseDadosHistoricosResult {
  const [dadosAtuais, setDadosAtuais] = useState<DadosAtuais | null>(null);
  const [dadosHistoricos, setDadosHistoricos] = useState<DadosHistoricos | null>(null);
  const [unidadeNome, setUnidadeNome] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDados() {
      if (!unidadeId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Buscar dados atuais da unidade
        const dadosCanonicos = await fetchKPIsAlunosCanonicos({ unidadeId, ano, mes });
        let taxaRenovacaoAtual = 0;

        if (dadosCanonicos.fonte === 'dados_mensais') {
          const { data: dadosMensaisAtual } = await supabase
            .from('dados_mensais')
            .select('taxa_renovacao')
            .eq('unidade_id', unidadeId)
            .eq('ano', ano)
            .eq('mes', mes)
            .maybeSingle();

          taxaRenovacaoAtual = Number(dadosMensaisAtual?.taxa_renovacao) || 0;
        } else if (dadosCanonicos.fonte === 'vivo') {
          const inicioMes = `${ano}-${String(mes).padStart(2, '0')}-01`;
          const fimMes = `${ano}-${String(mes).padStart(2, '0')}-${String(new Date(ano, mes, 0).getDate()).padStart(2, '0')}`;
          const { data: movimentosRenovacao } = await supabase
            .from('movimentacoes_admin')
            .select('tipo, data, competencia_referencia, renovacao_status, renovacao_antecipada, valor_parcela_anterior, valor_parcela_novo, forma_pagamento_id, agente_comercial')
            .eq('unidade_id', unidadeId)
            .in('tipo', ['renovacao', 'nao_renovacao'])
            .or(`and(data.gte.${inicioMes},data.lte.${fimMes}),and(competencia_referencia.gte.${inicioMes},competencia_referencia.lte.${fimMes})`);

          const movimentosDaCompetencia = (movimentosRenovacao || []).filter((mov: any) => {
            const competencia = String(mov.competencia_referencia || mov.data || '').slice(0, 7);
            return competencia === inicioMes.slice(0, 7);
          });
          const renovacoes = movimentosDaCompetencia.filter((mov: any) => (
            mov.tipo === 'renovacao' && isRenovacaoConfirmadaOperacional(mov)
          )).length;
          const totalContratos = movimentosDaCompetencia.length;
          taxaRenovacaoAtual = totalContratos > 0 ? (renovacoes / totalContratos) * 100 : 0;
        }

        // Buscar histórico dos últimos 12 meses
        const dataInicio = new Date(ano, mes - 13, 1); // 12 meses atrás
        const { data: historicoGestao, error: errorHistorico } = await supabase
          .from('dados_mensais')
          .select('*')
          .eq('unidade_id', unidadeId)
          .gte('ano', dataInicio.getFullYear())
          .order('ano', { ascending: false })
          .order('mes', { ascending: false })
          .limit(12);

        if (errorHistorico) {
          console.error('Erro ao buscar histórico:', errorHistorico);
        }

        // Buscar dados comerciais históricos (usar vw_kpis_comercial_historico que tem dados completos)
        const { data: historicoComercial, error: errorComercial } = await supabase
          .from('vw_kpis_comercial_historico')
          .select('*')
          .eq('unidade_id', unidadeId)
          .eq('ano', ano - 1) // Usar ano anterior para histórico
          .order('mes', { ascending: false })
          .limit(12);

        if (errorComercial) {
          console.error('Erro ao buscar histórico comercial:', errorComercial);
        }

        const resumoComercialV2 = await fetchComercialOperacionalResumoV2({
          unidadeId,
          ano: ano - 1,
          mesInicio: 1,
          mesFim: 12,
        });

        // Buscar nome da unidade primeiro
        const { data: unidadeData } = await supabase
          .from('unidades')
          .select('nome')
          .eq('id', unidadeId)
          .single();

        const nomeUnidade = unidadeData?.nome || '';
        setUnidadeNome(nomeUnidade);

        // Buscar dados anuais consolidados (churn, inadimplência, etc.)
        const { data: dadosAnuais, error: errorAnual } = await supabase
          .from('vw_unidade_anual')
          .select('*')
          .eq('unidade', nomeUnidade)
          .eq('ano', ano - 1) // Usar ano anterior para histórico
          .single();

        if (errorAnual && errorAnual.code !== 'PGRST116') {
          console.error('Erro ao buscar dados anuais:', errorAnual);
        }

        // Processar dados atuais
        const dadosAtuaisCanonicos = dadosCanonicos.porUnidade[0] || dadosCanonicos;
        if (dadosAtuaisCanonicos && dadosCanonicos.fonte !== 'indisponivel') {
          const alunosPagantes = dadosAtuaisCanonicos.alunosPagantes || 0;
          const ticketMedio = Number(dadosAtuaisCanonicos.ticketMedio) || 0;
          setDadosAtuais({
            alunosAtivos: dadosAtuaisCanonicos.alunosAtivos || 0,
            alunosPagantes,
            ticketMedio,
            churnRate: Number(dadosAtuaisCanonicos.churnRate) || 0,
            taxaRenovacao: taxaRenovacaoAtual,
            mrr: Number(dadosAtuaisCanonicos.mrr) || (alunosPagantes * ticketMedio),
            inadimplencia: Number(dadosAtuaisCanonicos.inadimplencia) || 0,
          });
        }

        // Processar dados históricos
        if (historicoGestao && historicoGestao.length > 0) {
          const mesesAnalisados = historicoGestao.length;
          
          // Calcular médias de gestão
          const mediaEvasoes = historicoGestao.reduce((sum, h) => sum + (h.evasoes || 0), 0) / mesesAnalisados;
          
          // Calcular médias comerciais
          let mediaLeads = resumoComercialV2.seriesMensais.length > 0
            ? resumoComercialV2.leadsEntrantes / resumoComercialV2.seriesMensais.length
            : 0;
          let mediaExperimentais = 0;
          let mediaMatriculas = 0;
          
          if (historicoComercial && historicoComercial.length > 0) {
            // Campos corretos da view vw_kpis_comercial_historico
            mediaExperimentais = historicoComercial.reduce((sum, h) => sum + (h.experimentais_realizadas || 0), 0) / historicoComercial.length;
            mediaMatriculas = historicoComercial.reduce((sum, h) => sum + (h.novas_matriculas_total || 0), 0) / historicoComercial.length;
          } else {
            // Fallback: usar dados de gestão se disponíveis
            mediaMatriculas = historicoGestao.reduce((sum, h) => sum + (h.novas_matriculas || 0), 0) / mesesAnalisados;
          }

          // Calcular taxas de conversão a partir dos dados históricos
          let taxaConversaoLeadExp = 60; // default
          let taxaConversaoExpMat = 50; // default
          
          if (historicoComercial && historicoComercial.length > 0) {
            // Usar as taxas já calculadas na view (média das taxas mensais)
            const taxasLeadExp = historicoComercial.map(h => parseFloat(h.taxa_lead_exp) || 0);
            const taxasExpMat = historicoComercial.map(h => parseFloat(h.taxa_exp_mat) || 0);
            taxaConversaoLeadExp = taxasLeadExp.reduce((a, b) => a + b, 0) / taxasLeadExp.length;
            taxaConversaoExpMat = taxasExpMat.reduce((a, b) => a + b, 0) / taxasExpMat.length;
          }
          
          const taxaConversaoTotal = (taxaConversaoLeadExp / 100) * (taxaConversaoExpMat / 100) * 100;
          
          // Usar churn da view vw_unidade_anual (dados consolidados de 2025)
          const churnHistorico = dadosAnuais 
            ? parseFloat(dadosAnuais.churn_medio) || 4
            : 4; // Default 4% se não houver dados

          setDadosHistoricos({
            mediaMatriculas: Math.round(mediaMatriculas),
            mediaEvasoes: Math.round(mediaEvasoes),
            mediaLeads: Math.round(mediaLeads),
            mediaExperimentais: Math.round(mediaExperimentais),
            taxaConversaoLeadExp,
            taxaConversaoExpMat,
            taxaConversaoTotal,
            churnHistorico: Math.round(churnHistorico * 10) / 10, // 1 casa decimal
            mesesAnalisados,
          });
        }

      } catch (err) {
        console.error('Erro ao buscar dados:', err);
        setError('Erro ao carregar dados históricos');
      } finally {
        setLoading(false);
      }
    }

    fetchDados();
  }, [unidadeId, ano, mes]);

  return { dadosAtuais, dadosHistoricos, unidadeNome, loading, error };
}

export default useDadosHistoricos;
