// Simulador de Metas - Página Principal
// Suporta dois objetivos: Alunos Pagantes e MRR/Faturamento

import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Target } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDadosHistoricos } from '@/hooks/useDadosHistoricos';
import { useSimulador } from '@/hooks/useSimulador';
import { TipoObjetivo } from '@/lib/simulador/tipos';
import { SeletorObjetivo } from './SeletorObjetivo';
import { SituacaoAtual } from './SituacaoAtual';
import { MetaObjetivo } from './MetaObjetivo';
import { TemplatesCenario } from './TemplatesCenario';
import { InputsEditaveis } from './InputsEditaveis';
import { CalculoAutomatico } from './CalculoAutomatico';
import { AlertasViabilidade } from './AlertasViabilidade';
import { MetasCalculadas } from './MetasCalculadas';
import { CenariosLista } from './CenariosLista';
import { InsightsIA } from './InsightsIA';

// Interface do contexto do layout
interface OutletContextType {
  filtroAtivo: string | null;
  unidadeSelecionada: string | null;
  competencia: {
    ano: number;
    mes: number;
    range: { label: string };
  };
}

export function SimuladorPage() {
  const { unidadeSelecionada, competencia } = useOutletContext<OutletContextType>();
  const unidadeId = unidadeSelecionada;
  const ano = competencia?.ano || new Date().getFullYear();
  const mes = competencia?.mes || new Date().getMonth() + 1;
  
  // Estado para metas aplicadas
  const [metasAplicadas, setMetasAplicadas] = useState<Record<string, number> | null>(null);
  const [loadingMetas, setLoadingMetas] = useState(true);
  const [templateAplicado, setTemplateAplicado] = useState(false);
  const [alunosEditado, setAlunosEditado] = useState(false);
  
  // Buscar dados históricos
  const { dadosAtuais, dadosHistoricos, unidadeNome, loading: loadingDados } = useDadosHistoricos(
    unidadeId,
    ano,
    mes
  );

  // Hook do simulador
  const {
    inputs,
    resultado,
    cenarios,
    cenarioAtivo,
    loading,
    salvando,
    error,
    setInput,
    setInputs,
    salvarCenario,
    carregarCenario,
    deletarCenario,
    aplicarMetas,
    carregarCenarios,
    resetar,
  } = useSimulador(
    unidadeId,
    ano,
    dadosHistoricos,
    dadosAtuais?.alunosPagantes || 0,
    dadosAtuais?.ticketMedio || 0,
    dadosAtuais?.churnRate || 4
  );

  // Carregar cenários e metas aplicadas ao montar
  useEffect(() => {
    if (unidadeId) {
      carregarCenarios();
      carregarMetasAplicadas();
    }
  }, [unidadeId, carregarCenarios]);

  // Função para carregar metas aplicadas da tabela metas_kpi
  async function carregarMetasAplicadas() {
    if (!unidadeId) return;
    
    setLoadingMetas(true);
    try {
      const { data, error } = await supabase
        .from('metas_kpi')
        .select('tipo, valor')
        .eq('unidade_id', unidadeId)
        .eq('ano', ano)
        .eq('mes', 12); // Pegar metas do mês objetivo (dezembro)
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        const metas: Record<string, number> = {};
        data.forEach(m => {
          metas[m.tipo] = typeof m.valor === 'string' ? parseFloat(m.valor) : m.valor;
        });
        setMetasAplicadas(metas);
      } else {
        setMetasAplicadas(null);
      }
    } catch (err) {
      console.error('Erro ao carregar metas aplicadas:', err);
      setMetasAplicadas(null);
    } finally {
      setLoadingMetas(false);
    }
  }

  // Atualizar inputs quando dados atuais carregarem OU quando metas aplicadas carregarem
  // NÃO sobrescrever se um template foi aplicado ou alunos foi editado manualmente
  useEffect(() => {
    if (dadosAtuais && !cenarioAtivo && !loadingMetas && !templateAplicado && !alunosEditado) {
      const mrrAtual = dadosAtuais.alunosPagantes * dadosAtuais.ticketMedio;
      
      // Função para arredondar para 1 casa decimal
      const round1 = (v: number | undefined | null) => v ? Math.round(v * 10) / 10 : null;
      
      // Se existem metas aplicadas, usar elas como objetivo
      if (metasAplicadas) {
        setInputs({
          // Usar alunos_atual salvo se existir, senão usar do banco
          alunosAtual: Math.round(metasAplicadas.alunos_atual || dadosAtuais.alunosPagantes),
          alunosObjetivo: Math.round(metasAplicadas.alunos_pagantes || dadosAtuais.alunosPagantes * 1.1),
          ticketMedio: round1(metasAplicadas.ticket_medio) || dadosAtuais.ticketMedio,
          churnProjetado: round1(metasAplicadas.churn_rate) || dadosAtuais.churnRate || 4,
          mrrObjetivo: Math.round(metasAplicadas.mrr || mrrAtual * 1.1),
          inadimplenciaPct: dadosAtuais.inadimplencia || 3,
          // Taxas de conversão das metas aplicadas (arredondadas)
          taxaLeadExp: round1(metasAplicadas.taxa_lead_exp) || round1(dadosHistoricos?.taxaConversaoLeadExp) || 20,
          taxaExpMat: round1(metasAplicadas.taxa_exp_mat) || round1(dadosHistoricos?.taxaConversaoExpMat) || 60,
        });
      } else {
        // Sem metas aplicadas, usar valores padrão (+10%)
        setInputs({
          alunosAtual: dadosAtuais.alunosPagantes,
          alunosObjetivo: Math.round(dadosAtuais.alunosPagantes * 1.1),
          ticketMedio: dadosAtuais.ticketMedio,
          churnProjetado: dadosAtuais.churnRate || 4,
          mrrObjetivo: Math.round(mrrAtual * 1.1),
          inadimplenciaPct: dadosAtuais.inadimplencia || 3,
          // Taxas do histórico (arredondadas)
          taxaLeadExp: round1(dadosHistoricos?.taxaConversaoLeadExp) || 20,
          taxaExpMat: round1(dadosHistoricos?.taxaConversaoExpMat) || 60,
        });
      }
    }
  }, [dadosAtuais, dadosHistoricos, cenarioAtivo, metasAplicadas, loadingMetas, templateAplicado, alunosEditado, setInputs]);

  if (loadingDados || loadingMetas) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
      </div>
    );
  }

  if (!unidadeId) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>Selecione uma unidade para usar o simulador</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com cenários */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-cyan-400" />
            Simulador de Metas
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Defina sua meta e veja o que precisa acontecer para atingi-la
          </p>
        </div>
        
        {cenarioAtivo && (
          <span className="text-xs text-slate-500">
            Cenário: <span className="text-cyan-400">{inputs.nome}</span>
          </span>
        )}
      </div>

      {/* Erro */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-rose-400">
          {error}
        </div>
      )}

      {/* Seletor de Objetivo */}
      <SeletorObjetivo
        tipoObjetivo={inputs.tipoObjetivo}
        onChange={(tipo: TipoObjetivo) => setInput('tipoObjetivo', tipo)}
      />

      {/* Indicador do modo atual */}
      <div className={`text-xs font-medium px-3 py-1 rounded-full w-fit ${
        inputs.tipoObjetivo === 'mrr' 
          ? 'bg-emerald-500/20 text-emerald-400' 
          : 'bg-cyan-500/20 text-cyan-400'
      }`}>
        MODO: {inputs.tipoObjetivo === 'mrr' ? 'MRR / FATURAMENTO' : 'ALUNOS PAGANTES'}
      </div>

      {/* Row 1: Situação Atual + Meta Objetivo */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SituacaoAtual 
          historico={dadosHistoricos}
          ano={ano}
          mes={mes}
          unidadeNome={unidadeId ? 'Unidade' : undefined}
          tipoObjetivo={inputs.tipoObjetivo}
          alunosAtual={inputs.alunosAtual}
          ticketMedio={inputs.ticketMedio}
          onChangeAlunosAtual={(valor) => {
            setAlunosEditado(true);
            setInput('alunosAtual', valor);
          }}
        />
        <MetaObjetivo
          tipoObjetivo={inputs.tipoObjetivo}
          tipoMetaFinanceira={inputs.tipoMetaFinanceira}
          alunosAtual={inputs.alunosAtual}
          alunosObjetivo={inputs.alunosObjetivo}
          mrrAtual={inputs.alunosAtual * inputs.ticketMedio}
          mrrObjetivo={inputs.mrrObjetivo}
          mesObjetivo={inputs.mesObjetivo}
          ticketMedio={inputs.ticketMedio}
          onChange={(campo, valor) => setInput(campo as keyof typeof inputs, valor as never)}
        />
      </div>

      {/* Templates de Cenário */}
      <TemplatesCenario
        unidadeId={unidadeId}
        alunosAtual={inputs.alunosAtual}
        ticketAtual={inputs.ticketMedio}
        churnAtual={inputs.churnProjetado}
        historicoLeadExp={dadosHistoricos?.taxaConversaoLeadExp || 20}
        historicoExpMat={dadosHistoricos?.taxaConversaoExpMat || 60}
        onAplicarTemplate={(valores) => {
          console.log('Template aplicado:', valores);
          setTemplateAplicado(true);
          setInputs({
            alunosObjetivo: valores.alunosObjetivo,
            ticketMedio: valores.ticketMedio,
            churnProjetado: valores.churnProjetado,
            taxaLeadExp: valores.taxaLeadExp,
            taxaExpMat: valores.taxaExpMat,
            mrrObjetivo: valores.mrrObjetivo,
          });
        }}
      />

      {/* Row 2: Inputs Editáveis */}
      <InputsEditaveis
        inputs={inputs}
        historico={dadosHistoricos}
        tipoObjetivo={inputs.tipoObjetivo}
        onChange={setInput}
      />

      {/* Row 3: Cálculo Automático */}
      {resultado && (
        <CalculoAutomatico 
          resultado={resultado} 
          tipoObjetivo={inputs.tipoObjetivo}
        />
      )}

      {/* Row 4: Alertas de Viabilidade */}
      {resultado && resultado.alertas.length > 0 && (
        <AlertasViabilidade 
          alertas={resultado.alertas} 
          score={resultado.scoreViabilidade}
        />
      )}

      {/* Row 5: Metas Calculadas + Ações */}
      {resultado && (
        <MetasCalculadas
          resultado={resultado}
          salvando={salvando}
          onSalvar={salvarCenario}
          onAplicar={aplicarMetas}
        />
      )}

      {/* Row 6: Insights IA - Plano de Ação Inteligente */}
      {resultado && (
        <InsightsIA
          inputs={inputs}
          resultado={resultado}
          alertas={resultado.alertas.map(a => ({
            tipo: a.tipo === 'erro' ? 'danger' : a.tipo === 'aviso' ? 'warning' : 'success',
            mensagem: a.mensagem
          }))}
          historico={dadosHistoricos ? [{
            mes: `${mes}/${ano}`,
            leads: dadosHistoricos.mediaLeads || 0,
            experimentais: dadosHistoricos.mediaExperimentais || 0,
            matriculas: dadosHistoricos.mediaMatriculas || 0,
            cancelamentos: dadosHistoricos.mediaEvasoes || 0,
          }] : undefined}
          unidadeId={unidadeId || ''}
          unidadeNome={unidadeNome || 'Unidade'}
        />
      )}

      {/* Row 7: Cenários Salvos */}
      {cenarios.length > 0 && (
        <CenariosLista
          cenarios={cenarios}
          cenarioAtivo={cenarioAtivo}
          onCarregar={carregarCenario}
          onDeletar={deletarCenario}
        />
      )}
    </div>
  );
}

export default SimuladorPage;
