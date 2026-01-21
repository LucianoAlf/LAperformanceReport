// Simulador de Média de Alunos por Turma (Lucratividade)
// Baseado no wireframe V3 e documento AULAS_TURMA_SIMULADOR.md

import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Users, TrendingUp, Target, Zap, CheckCircle, AlertCircle } from 'lucide-react';
import { useSimuladorTurma } from '@/hooks/useSimuladorTurma';
import { CENARIOS_ESCALONAMENTO } from '@/lib/simulador-turma/tipos';
import { supabase } from '@/lib/supabase';
import { ParametrosSimulacao } from './ParametrosSimulacao';
import { CenariosEscalonamento } from './CenariosEscalonamento';
import { SimularMetaMedia } from './SimularMetaMedia';
import { ProjecaoLucro } from './ProjecaoLucro';
import { TabelaBonificacoes } from './TabelaBonificacoes';
import { ModeloGarantia } from './ModeloGarantia';
import { AlertasViabilidadeTurma } from './AlertasViabilidadeTurma';
import { MetasCalculadasTurma } from './MetasCalculadasTurma';
import { RankingProfessores } from './RankingProfessores';
import { PlanoAcaoTurma } from './PlanoAcaoTurma';

interface OutletContextType {
  filtroAtivo: string | null;
  unidadeSelecionada: string | null;
  competencia: {
    ano: number;
    mes: number;
    range: { label: string };
  };
}

export function SimuladorTurmaPage() {
  const { unidadeSelecionada, competencia } = useOutletContext<OutletContextType>();
  const unidadeId = unidadeSelecionada;
  
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);
  
  const {
    dadosUnidade,
    professores,
    resultado,
    bonificacoes,
    inputs,
    setInput,
    setCenario,
    loading,
    error,
  } = useSimuladorTurma(unidadeId);

  // Função para salvar cenário no banco
  const handleSalvarCenario = async () => {
    if (!resultado || !dadosUnidade || !unidadeId) return;
    
    setSalvando(true);
    setMensagem(null);
    
    try {
      const cenario = {
        unidade_id: unidadeId,
        ano: competencia.ano,
        mes: competencia.mes,
        nome: `Cenário ${new Date().toLocaleDateString('pt-BR')}`,
        media_atual: dadosUnidade.mediaAlunosTurmaAtual,
        media_meta: inputs.mediaMeta,
        valor_base: inputs.valorBase,
        incremento: inputs.incremento,
        percentual_folha_atual: resultado.percentualFolhaAtual,
        percentual_folha_meta: resultado.percentualFolhaMeta,
        margem_atual: resultado.margemAtual,
        margem_meta: resultado.margemMeta,
        economia_mensal: resultado.economiaMensal,
        economia_anual: resultado.economiaAnual,
        total_alunos: dadosUnidade.totalAlunos,
        ticket_medio: dadosUnidade.ticketMedio,
        mrr_total: dadosUnidade.mrrTotal,
        alertas: resultado.alertas,
        score_viabilidade: resultado.scoreViabilidade,
      };

      const { error: saveError } = await supabase
        .from('simulacoes_turma')
        .insert(cenario);

      if (saveError) throw saveError;

      setMensagem({ tipo: 'sucesso', texto: 'Cenário salvo com sucesso!' });
      setTimeout(() => setMensagem(null), 3000);
    } catch (err) {
      console.error('Erro ao salvar cenário:', err);
      setMensagem({ tipo: 'erro', texto: 'Erro ao salvar cenário. Tente novamente.' });
    } finally {
      setSalvando(false);
    }
  };

  // Função para aplicar metas (salvar e marcar como aplicado)
  const handleAplicarMetas = async () => {
    if (!resultado || !dadosUnidade || !unidadeId) return;
    
    setSalvando(true);
    setMensagem(null);
    
    try {
      const cenario = {
        unidade_id: unidadeId,
        ano: competencia.ano,
        mes: competencia.mes,
        nome: `Meta Aplicada ${new Date().toLocaleDateString('pt-BR')}`,
        media_atual: dadosUnidade.mediaAlunosTurmaAtual,
        media_meta: inputs.mediaMeta,
        valor_base: inputs.valorBase,
        incremento: inputs.incremento,
        percentual_folha_atual: resultado.percentualFolhaAtual,
        percentual_folha_meta: resultado.percentualFolhaMeta,
        margem_atual: resultado.margemAtual,
        margem_meta: resultado.margemMeta,
        economia_mensal: resultado.economiaMensal,
        economia_anual: resultado.economiaAnual,
        total_alunos: dadosUnidade.totalAlunos,
        ticket_medio: dadosUnidade.ticketMedio,
        mrr_total: dadosUnidade.mrrTotal,
        alertas: resultado.alertas,
        score_viabilidade: resultado.scoreViabilidade,
        aplicado_em: new Date().toISOString(),
      };

      const { error: saveError } = await supabase
        .from('simulacoes_turma')
        .insert(cenario);

      if (saveError) throw saveError;

      setMensagem({ tipo: 'sucesso', texto: 'Metas aplicadas com sucesso!' });
      setTimeout(() => setMensagem(null), 3000);
    } catch (err) {
      console.error('Erro ao aplicar metas:', err);
      setMensagem({ tipo: 'erro', texto: 'Erro ao aplicar metas. Tente novamente.' });
    } finally {
      setSalvando(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
      </div>
    );
  }

  if (!unidadeId) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>Selecione uma unidade para usar o simulador</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-6 text-rose-400">
        <p className="font-medium">Erro ao carregar dados</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-emerald-400" />
          Simulador de Lucratividade por Turma
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Otimize a margem de lucro aumentando a média de alunos por turma
        </p>
      </div>

      {/* Indicador do modo */}
      <div className="inline-block bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-xs font-medium">
        MODO: LUCRATIVIDADE POR TURMA
      </div>

      {/* Seção 0: Parâmetros da Simulação (editáveis) */}
      <ParametrosSimulacao
        inputs={inputs}
        onChangeInput={setInput}
        temDadosReais={dadosUnidade !== null && dadosUnidade.totalAlunos > 0}
      />

      {/* Seção 1: Cenários de Escalonamento */}
      <CenariosEscalonamento
        cenarios={CENARIOS_ESCALONAMENTO}
        cenarioAtivo={inputs.cenarioId}
        valorBase={inputs.valorBase}
        incremento={inputs.incremento}
        mediaMeta={inputs.mediaMeta}
        onSelectCenario={setCenario}
        onChangeValorBase={(v) => setInput('valorBase', v)}
        onChangeIncremento={(v) => setInput('incremento', v)}
      />

      {/* Seção 2: Simular Meta de Média */}
      {resultado && (
        <SimularMetaMedia
          mediaAtual={inputs.mediaAtual}
          mediaMeta={inputs.mediaMeta}
          resultado={resultado}
          valorBase={inputs.valorBase}
          incremento={inputs.incremento}
          onChangeMeta={(v) => setInput('mediaMeta', v)}
        />
      )}

      {/* Seção 2.5: Projeção de Lucro */}
      {resultado && (
        <ProjecaoLucro resultado={resultado} />
      )}

      {/* Seção 3: Tabela de Bonificações Sugeridas */}
      {bonificacoes.length > 0 && (
        <TabelaBonificacoes
          bonificacoes={bonificacoes}
          mediaMeta={inputs.mediaMeta}
          mediaAtual={inputs.mediaAtual}
        />
      )}

      {/* Seção 4: Modelo de Garantia */}
      <ModeloGarantia
        valorBase={inputs.valorBase}
        incremento={inputs.incremento}
        mediaMeta={inputs.mediaMeta}
        ticketMedio={inputs.ticketMedio}
      />

      {/* Seção 5: Alertas de Viabilidade */}
      {resultado && resultado.alertas.length > 0 && (
        <AlertasViabilidadeTurma
          alertas={resultado.alertas}
          score={resultado.scoreViabilidade}
        />
      )}

      {/* Mensagem de feedback */}
      {mensagem && (
        <div className={`flex items-center gap-2 p-4 rounded-xl ${
          mensagem.tipo === 'sucesso' 
            ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' 
            : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
        }`}>
          {mensagem.tipo === 'sucesso' ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          <span>{mensagem.texto}</span>
        </div>
      )}

      {/* Seção 6: Metas Calculadas */}
      {resultado && (
        <MetasCalculadasTurma
          resultado={resultado}
          onAplicarMetas={handleAplicarMetas}
          onSalvarCenario={handleSalvarCenario}
        />
      )}

      {/* Seção 7: Ranking de Professores */}
      {professores.length > 0 && (
        <RankingProfessores
          professores={professores}
          mediaMeta={inputs.mediaMeta}
          unidadeId={unidadeId}
        />
      )}

      {/* Seção 8: Plano de Ação Inteligente */}
      {resultado && dadosUnidade && (
        <PlanoAcaoTurma
          unidadeId={unidadeId}
          unidadeNome={dadosUnidade.unidadeNome}
          resultado={resultado}
          inputs={inputs}
          professores={professores}
        />
      )}

      {/* Espaço no final */}
      <div className="h-20" />
    </div>
  );
}

export default SimuladorTurmaPage;
