import React from 'react';
import { Target, CheckCircle, Clock, AlertTriangle, Users, DollarSign, TrendingDown, Calendar } from 'lucide-react';
import { useEvasoesData } from '../../hooks/useEvasoesData';
import { UnidadeRetencao } from '../../types/retencao';

interface RetencaoAcoesProps {
  ano: number;
  unidade: UnidadeRetencao;
}

interface Acao {
  id: number;
  titulo: string;
  descricao: string;
  prioridade: 'alta' | 'media' | 'baixa';
  categoria: string;
  impacto: string;
  prazo: string;
  icone: React.ComponentType<{ className?: string }>;
}

export function RetencaoAcoes({ ano, unidade }: RetencaoAcoesProps) {
  const { kpis, motivos, professores, loading } = useEvasoesData(ano, unidade);

  // Gerar ações recomendadas baseadas nos dados
  const gerarAcoes = (): Acao[] => {
    const acoes: Acao[] = [];

    // Ação 1: Programa de Retenção Financeira
    const motivoFinanceiro = motivos.find(m => m.motivo_categoria === 'Financeiro');
    if (motivoFinanceiro && motivoFinanceiro.percentual > 15) {
      acoes.push({
        id: 1,
        titulo: 'Programa de Flexibilização Financeira',
        descricao: `Criar programa de negociação e parcelamento para alunos com dificuldades financeiras. ${motivoFinanceiro.percentual.toFixed(1)}% das evasões são por motivos financeiros.`,
        prioridade: 'alta',
        categoria: 'Financeiro',
        impacto: `Reduzir ${Math.round(motivoFinanceiro.quantidade * 0.3)} evasões/ano`,
        prazo: 'Q1 2026',
        icone: DollarSign,
      });
    }

    // Ação 2: Flexibilidade de Horários
    const motivoHorario = motivos.find(m => m.motivo_categoria === 'Horário');
    if (motivoHorario && motivoHorario.percentual > 10) {
      acoes.push({
        id: 2,
        titulo: 'Ampliação de Grade Horária',
        descricao: 'Expandir opções de horários, incluindo aulas aos sábados e horários alternativos durante a semana.',
        prioridade: 'alta',
        categoria: 'Operacional',
        impacto: `Reduzir ${Math.round(motivoHorario.quantidade * 0.4)} evasões/ano`,
        prazo: 'Q1 2026',
        icone: Clock,
      });
    }

    // Ação 3: Acompanhamento de Professores
    const professoresCriticos = professores.filter(p => p.risco === 'crítico' || p.risco === 'alto');
    if (professoresCriticos.length > 0) {
      acoes.push({
        id: 3,
        titulo: 'Programa de Mentoria para Professores',
        descricao: `Implementar acompanhamento e treinamento para ${professoresCriticos.length} professores com alto índice de evasão.`,
        prioridade: 'alta',
        categoria: 'Pessoas',
        impacto: 'Melhoria na retenção de alunos',
        prazo: 'Q1 2026',
        icone: Users,
      });
    }

    // Ação 4: Pesquisa de Satisfação
    acoes.push({
      id: 4,
      titulo: 'NPS Mensal e Pesquisa de Satisfação',
      descricao: 'Implementar pesquisa de satisfação mensal para identificar problemas antes da evasão.',
      prioridade: 'media',
      categoria: 'Qualidade',
      impacto: 'Detecção precoce de insatisfação',
      prazo: 'Q1 2026',
      icone: Target,
    });

    // Ação 5: Programa de Fidelização
    acoes.push({
      id: 5,
      titulo: 'Programa de Fidelização e Benefícios',
      descricao: 'Criar programa de benefícios progressivos para alunos com mais tempo de casa.',
      prioridade: 'media',
      categoria: 'Marketing',
      impacto: 'Aumento da retenção de longo prazo',
      prazo: 'Q2 2026',
      icone: CheckCircle,
    });

    // Ação 6: Ações Sazonais
    acoes.push({
      id: 6,
      titulo: 'Campanhas de Retenção Sazonal',
      descricao: 'Criar campanhas específicas para meses com maior evasão histórica (Janeiro, Julho, Dezembro).',
      prioridade: 'media',
      categoria: 'Marketing',
      impacto: 'Redução de picos de evasão',
      prazo: 'Contínuo',
      icone: Calendar,
    });

    // Ação 7: Monitoramento de Churn
    acoes.push({
      id: 7,
      titulo: 'Dashboard de Monitoramento em Tempo Real',
      descricao: 'Implementar alertas automáticos para identificar alunos em risco de evasão.',
      prioridade: 'baixa',
      categoria: 'Tecnologia',
      impacto: 'Ação preventiva automatizada',
      prazo: 'Q2 2026',
      icone: TrendingDown,
    });

    return acoes;
  };

  const acoes = gerarAcoes();

  const getPrioridadeStyles = (prioridade: string) => {
    switch (prioridade) {
      case 'alta':
        return {
          bg: 'bg-red-500/10',
          border: 'border-red-500/30',
          text: 'text-red-400',
          badge: 'bg-red-500',
        };
      case 'media':
        return {
          bg: 'bg-yellow-500/10',
          border: 'border-yellow-500/30',
          text: 'text-yellow-400',
          badge: 'bg-yellow-500',
        };
      default:
        return {
          bg: 'bg-green-500/10',
          border: 'border-green-500/30',
          text: 'text-green-400',
          badge: 'bg-green-500',
        };
    }
  };

  return (
    <div className="min-h-screen p-8 bg-slate-950">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">Ações Recomendadas 2026</h2>
        <p className="text-gray-400">Plano de ação para reduzir evasões baseado na análise de {ano}</p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-rose-500"></div>
        </div>
      )}

      {!loading && (
        <>
          {/* Resumo de Metas */}
          <div className="bg-gradient-to-r from-rose-500/20 to-red-500/20 border border-rose-500/30 rounded-2xl p-6 mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Target className="w-8 h-8 text-rose-400" />
              <div>
                <h3 className="text-xl font-bold text-white">Meta de Retenção 2026</h3>
                <p className="text-gray-400">Reduzir evasões em 20% comparado a 2025</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-900/50 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-white">{kpis?.totalEvasoes || 0}</div>
                <div className="text-gray-400 text-sm">Evasões 2025</div>
              </div>
              <div className="bg-slate-900/50 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-green-400">
                  {Math.round((kpis?.totalEvasoes || 0) * 0.8)}
                </div>
                <div className="text-gray-400 text-sm">Meta 2026</div>
              </div>
              <div className="bg-slate-900/50 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-rose-400">
                  -{Math.round((kpis?.totalEvasoes || 0) * 0.2)}
                </div>
                <div className="text-gray-400 text-sm">Redução Esperada</div>
              </div>
            </div>
          </div>

          {/* Resumo por Prioridade */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {['alta', 'media', 'baixa'].map((prioridade) => {
              const count = acoes.filter(a => a.prioridade === prioridade).length;
              const styles = getPrioridadeStyles(prioridade);
              const labels: Record<string, string> = {
                alta: 'Alta Prioridade',
                media: 'Média Prioridade',
                baixa: 'Baixa Prioridade',
              };
              
              return (
                <div key={prioridade} className={`${styles.bg} ${styles.border} border rounded-2xl p-4`}>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">{labels[prioridade]}</span>
                    <span className={`${styles.badge} text-white text-sm px-2 py-1 rounded-full`}>
                      {count} ações
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Lista de Ações */}
          <div className="space-y-4">
            {acoes.map((acao) => {
              const styles = getPrioridadeStyles(acao.prioridade);
              const Icon = acao.icone;
              
              return (
                <div
                  key={acao.id}
                  className={`bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 hover:border-rose-500/30 transition-colors`}
                >
                  <div className="flex items-start gap-4">
                    {/* Número */}
                    <div className="w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-rose-400 font-bold">{acao.id}</span>
                    </div>
                    
                    {/* Conteúdo */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold text-white">{acao.titulo}</h3>
                        <span className={`${styles.badge} text-white text-xs px-2 py-0.5 rounded-full capitalize`}>
                          {acao.prioridade}
                        </span>
                        <span className="bg-slate-700 text-gray-300 text-xs px-2 py-0.5 rounded-full">
                          {acao.categoria}
                        </span>
                      </div>
                      <p className="text-gray-400 mb-4">{acao.descricao}</p>
                      
                      {/* Métricas */}
                      <div className="flex flex-wrap gap-4">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-rose-400" />
                          <span className="text-sm text-gray-400">Impacto:</span>
                          <span className="text-sm text-white font-medium">{acao.impacto}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-blue-400" />
                          <span className="text-sm text-gray-400">Prazo:</span>
                          <span className="text-sm text-white font-medium">{acao.prazo}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
