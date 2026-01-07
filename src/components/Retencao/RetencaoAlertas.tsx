import React from 'react';
import { AlertTriangle, AlertCircle, Info, CheckCircle, TrendingUp, Users, DollarSign, Calendar } from 'lucide-react';
import { useEvasoesData } from '../../hooks/useEvasoesData';
import { UnidadeRetencao } from '../../types/retencao';

interface RetencaoAlertasProps {
  ano: number;
  unidade: UnidadeRetencao;
}

interface Alerta {
  tipo: 'critico' | 'alto' | 'medio' | 'info';
  titulo: string;
  descricao: string;
  metrica: string;
  icone: React.ComponentType<{ className?: string }>;
}

export function RetencaoAlertas({ ano, unidade }: RetencaoAlertasProps) {
  const { kpis, professores, motivos, dadosMensais, loading } = useEvasoesData(ano, unidade);

  // Gerar alertas baseados nos dados
  const gerarAlertas = (): Alerta[] => {
    const alertas: Alerta[] = [];

    if (!kpis) return alertas;

    // Alerta de churn alto
    if (kpis.churnMedio > 5) {
      alertas.push({
        tipo: 'critico',
        titulo: 'Churn Acima do Aceitável',
        descricao: `Taxa de churn de ${kpis.churnMedio}% está acima do limite de 5%. Ação imediata necessária.`,
        metrica: `${kpis.churnMedio}%`,
        icone: TrendingUp,
      });
    }

    // Alerta de MRR perdido
    if (kpis.mrrPerdidoTotal > 200000) {
      alertas.push({
        tipo: 'critico',
        titulo: 'MRR Perdido Crítico',
        descricao: `Perda de receita recorrente ultrapassou R$ 200k. Impacto significativo no faturamento.`,
        metrica: `R$ ${(kpis.mrrPerdidoTotal / 1000).toFixed(0)}k`,
        icone: DollarSign,
      });
    }

    // Alerta de professores críticos
    const professoresCriticos = professores.filter(p => p.risco === 'crítico');
    if (professoresCriticos.length > 0) {
      alertas.push({
        tipo: 'alto',
        titulo: 'Professores em Situação Crítica',
        descricao: `${professoresCriticos.length} professor(es) com mais de 15 evasões. Necessário acompanhamento urgente.`,
        metrica: `${professoresCriticos.length} prof.`,
        icone: Users,
      });
    }

    // Alerta de motivo principal
    const motivoPrincipal = motivos[0];
    if (motivoPrincipal && motivoPrincipal.percentual > 25) {
      alertas.push({
        tipo: 'alto',
        titulo: `${motivoPrincipal.motivo_categoria} é o Principal Motivo`,
        descricao: `${motivoPrincipal.percentual.toFixed(1)}% das evasões são por ${motivoPrincipal.motivo_categoria.toLowerCase()}. Foco em ações preventivas.`,
        metrica: `${motivoPrincipal.percentual.toFixed(1)}%`,
        icone: AlertCircle,
      });
    }

    // Alerta de sazonalidade
    const mesesAltos = dadosMensais.filter(m => m.evasoes > 50);
    if (mesesAltos.length > 0) {
      alertas.push({
        tipo: 'medio',
        titulo: 'Meses com Alta Evasão Identificados',
        descricao: `${mesesAltos.length} mês(es) com mais de 50 evasões. Preparar ações preventivas para estes períodos.`,
        metrica: `${mesesAltos.length} meses`,
        icone: Calendar,
      });
    }

    // Alerta informativo
    alertas.push({
      tipo: 'info',
      titulo: 'Análise Completa Disponível',
      descricao: 'Todos os dados de evasão foram processados. Navegue pelas seções para insights detalhados.',
      metrica: `${kpis.totalEvasoes} registros`,
      icone: Info,
    });

    return alertas;
  };

  const alertas = gerarAlertas();

  const getAlertaStyles = (tipo: string) => {
    switch (tipo) {
      case 'critico':
        return {
          bg: 'bg-red-500/10',
          border: 'border-red-500/50',
          text: 'text-red-400',
          badge: 'bg-red-500',
        };
      case 'alto':
        return {
          bg: 'bg-orange-500/10',
          border: 'border-orange-500/50',
          text: 'text-orange-400',
          badge: 'bg-orange-500',
        };
      case 'medio':
        return {
          bg: 'bg-yellow-500/10',
          border: 'border-yellow-500/50',
          text: 'text-yellow-400',
          badge: 'bg-yellow-500',
        };
      default:
        return {
          bg: 'bg-blue-500/10',
          border: 'border-blue-500/50',
          text: 'text-blue-400',
          badge: 'bg-blue-500',
        };
    }
  };

  const getAlertaIcon = (tipo: string) => {
    switch (tipo) {
      case 'critico': return AlertTriangle;
      case 'alto': return AlertCircle;
      case 'medio': return Info;
      default: return CheckCircle;
    }
  };

  return (
    <div className="min-h-screen p-8 bg-slate-950">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">Alertas e Insights</h2>
        <p className="text-gray-400">Pontos de atenção identificados na análise de evasão</p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-rose-500"></div>
        </div>
      )}

      {!loading && (
        <>
          {/* Resumo de Alertas */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            {['critico', 'alto', 'medio', 'info'].map((tipo) => {
              const count = alertas.filter(a => a.tipo === tipo).length;
              const styles = getAlertaStyles(tipo);
              const Icon = getAlertaIcon(tipo);
              const labels: Record<string, string> = {
                critico: 'Críticos',
                alto: 'Alto Risco',
                medio: 'Médio',
                info: 'Informativos',
              };
              
              return (
                <div key={tipo} className={`${styles.bg} ${styles.border} border rounded-2xl p-4`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`w-5 h-5 ${styles.text}`} />
                    <span className="text-gray-400 text-sm">{labels[tipo]}</span>
                  </div>
                  <div className={`text-2xl font-bold ${styles.text}`}>{count}</div>
                </div>
              );
            })}
          </div>

          {/* Lista de Alertas */}
          <div className="space-y-4">
            {alertas.map((alerta, index) => {
              const styles = getAlertaStyles(alerta.tipo);
              const StatusIcon = getAlertaIcon(alerta.tipo);
              const MetricaIcon = alerta.icone;
              
              return (
                <div
                  key={index}
                  className={`${styles.bg} ${styles.border} border rounded-2xl p-6 hover:scale-[1.01] transition-transform`}
                >
                  <div className="flex items-start gap-4">
                    {/* Ícone de Status */}
                    <div className={`w-12 h-12 rounded-xl ${styles.bg} flex items-center justify-center flex-shrink-0`}>
                      <StatusIcon className={`w-6 h-6 ${styles.text}`} />
                    </div>
                    
                    {/* Conteúdo */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold text-white">{alerta.titulo}</h3>
                        <span className={`${styles.badge} text-white text-xs px-2 py-0.5 rounded-full capitalize`}>
                          {alerta.tipo}
                        </span>
                      </div>
                      <p className="text-gray-400 mb-3">{alerta.descricao}</p>
                      
                      {/* Métrica */}
                      <div className="flex items-center gap-2">
                        <MetricaIcon className={`w-4 h-4 ${styles.text}`} />
                        <span className={`font-semibold ${styles.text}`}>{alerta.metrica}</span>
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
