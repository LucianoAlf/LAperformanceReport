// Simulador de Metas - Página Principal
// Suporta dois objetivos: Alunos Pagantes e MRR/Faturamento

import { useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Target } from 'lucide-react';
import { useDadosHistoricos } from '@/hooks/useDadosHistoricos';
import { useSimulador } from '@/hooks/useSimulador';
import { TipoObjetivo } from '@/lib/simulador/tipos';
import { SeletorObjetivo } from './SeletorObjetivo';
import { SituacaoAtual } from './SituacaoAtual';
import { MetaObjetivo } from './MetaObjetivo';
import { InputsEditaveis } from './InputsEditaveis';
import { CalculoAutomatico } from './CalculoAutomatico';
import { AlertasViabilidade } from './AlertasViabilidade';
import { MetasCalculadas } from './MetasCalculadas';
import { CenariosLista } from './CenariosLista';

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
  
  // Buscar dados históricos
  const { dadosAtuais, dadosHistoricos, loading: loadingDados } = useDadosHistoricos(
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

  // Carregar cenários ao montar
  useEffect(() => {
    if (unidadeId) {
      carregarCenarios();
    }
  }, [unidadeId, carregarCenarios]);

  // Atualizar inputs quando dados atuais carregarem
  useEffect(() => {
    if (dadosAtuais && !cenarioAtivo) {
      const mrrAtual = dadosAtuais.alunosPagantes * dadosAtuais.ticketMedio;
      setInputs({
        alunosAtual: dadosAtuais.alunosPagantes,
        alunosObjetivo: Math.round(dadosAtuais.alunosPagantes * 1.1),
        ticketMedio: dadosAtuais.ticketMedio,
        churnProjetado: dadosAtuais.churnRate || 4,
        // Inicializar MRR objetivo com +10% do atual
        mrrObjetivo: Math.round(mrrAtual * 1.1),
        // Inicializar inadimplência
        inadimplenciaPct: dadosAtuais.inadimplencia || 3,
      });
    }
  }, [dadosAtuais, cenarioAtivo, setInputs]);

  // Atualizar taxas quando histórico carregar
  useEffect(() => {
    if (dadosHistoricos && !cenarioAtivo) {
      setInputs({
        taxaLeadExp: Math.round(dadosHistoricos.taxaConversaoLeadExp * 10) / 10 || 60,
        taxaExpMat: Math.round(dadosHistoricos.taxaConversaoExpMat * 10) / 10 || 50,
      });
    }
  }, [dadosHistoricos, cenarioAtivo, setInputs]);

  if (loadingDados) {
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
          onChangeAlunosAtual={(valor) => setInput('alunosAtual', valor)}
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

      {/* Row 6: Cenários Salvos */}
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
