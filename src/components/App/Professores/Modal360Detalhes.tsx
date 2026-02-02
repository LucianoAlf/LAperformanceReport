import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { 
  Eye, Clock, UserX, Building2, Calendar, Sparkles, 
  TrendingUp, TrendingDown, Minus, X, Shirt, Monitor, Smartphone,
  ChevronDown, ChevronUp, Edit3, RotateCcw, History, AlertTriangle
} from 'lucide-react';
import { Criterio360, Professor360Resumo, useOcorrenciasComLog, Ocorrencia360Completa } from '@/hooks/useProfessor360';
import ModalEditarOcorrencia from './ModalEditarOcorrencia';
import ModalReverterOcorrencia from './ModalReverterOcorrencia';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Modal360DetalhesProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  avaliacao: Professor360Resumo;
  criterios: Criterio360[];
  competencia: string;
  competenciaLabel: string;
  onRefresh?: () => void;
}

// Ícones para cada critério
const CRITERIO_ICONS: Record<string, React.ReactNode> = {
  atrasos: <Clock className="h-4 w-4" />,
  faltas: <UserX className="h-4 w-4" />,
  organizacao_sala: <Building2 className="h-4 w-4" />,
  uniforme: <Shirt className="h-4 w-4" />,
  prazos: <Calendar className="h-4 w-4" />,
  emusys: <Monitor className="h-4 w-4" />,
  projetos: <Sparkles className="h-4 w-4" />,
  videos_renovacao: <Smartphone className="h-4 w-4" />,
};

// Cor da nota
const getNotaColor = (nota: number) => {
  if (nota >= 90) return 'text-emerald-400';
  if (nota >= 70) return 'text-amber-400';
  return 'text-rose-400';
};

const getNotaBg = (nota: number) => {
  if (nota >= 90) return 'bg-emerald-500/20 border-emerald-500/30';
  if (nota >= 70) return 'bg-amber-500/20 border-amber-500/30';
  return 'bg-rose-500/20 border-rose-500/30';
};

export function Modal360Detalhes({
  open,
  onOpenChange,
  avaliacao,
  criterios,
  competencia,
  competenciaLabel,
  onRefresh,
}: Modal360DetalhesProps) {
  const { fetchOcorrenciasAvaliacao } = useOcorrenciasComLog();
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia360Completa[]>([]);
  const [loadingOcorrencias, setLoadingOcorrencias] = useState(false);
  const [expandedCriterio, setExpandedCriterio] = useState<number | null>(null);
  
  // Modais de edição/reversão
  const [modalEditar, setModalEditar] = useState<Ocorrencia360Completa | null>(null);
  const [modalReverter, setModalReverter] = useState<{ ocorrencia: Ocorrencia360Completa; modo: 'reverter' | 'restaurar' } | null>(null);

  // Carregar ocorrências quando abrir o modal
  useEffect(() => {
    if (open && avaliacao) {
      loadOcorrencias();
    }
  }, [open, avaliacao]);

  const loadOcorrencias = async () => {
    setLoadingOcorrencias(true);
    try {
      const data = await fetchOcorrenciasAvaliacao(
        avaliacao.professor_id,
        avaliacao.unidade_id,
        competencia
      );
      setOcorrencias(data);
    } catch (err) {
      console.error('Erro ao carregar ocorrências:', err);
    } finally {
      setLoadingOcorrencias(false);
    }
  };

  // Formatar data
  const formatarData = (data: string) => {
    try {
      return format(parseISO(data), 'dd/MM/yyyy', { locale: ptBR });
    } catch {
      return data;
    }
  };

  // Filtrar ocorrências por critério
  const getOcorrenciasCriterio = (criterioId: number) => {
    return ocorrencias.filter(oc => oc.criterio_id === criterioId);
  };

  // Handler após edição/reversão
  const handleSuccess = () => {
    loadOcorrencias();
    onRefresh?.();
  };

  // Calcular detalhes por critério baseado nas ocorrências carregadas (para atualização em tempo real)
  const detalhesCriterios = criterios.map(criterio => {
    // Contar ocorrências ATIVAS deste critério
    const ocsAtivas = ocorrencias.filter(oc => 
      oc.criterio_id === criterio.id && oc.status !== 'revertido'
    );
    const quantidade = ocsAtivas.length;
    let pontosImpacto = 0;

    if (criterio.tipo === 'penalidade') {
      const excedente = Math.max(0, quantidade - (criterio.tolerancia || 0));
      pontosImpacto = excedente * (criterio.pontos_perda || 0) * -1;
    } else {
      pontosImpacto = quantidade * 5; // pontos por projeto
    }

    return {
      criterio,
      quantidade,
      pontosImpacto,
    };
  });

  // Calcular nota final em tempo real
  const totalPenalidades = detalhesCriterios
    .filter(d => d.pontosImpacto < 0)
    .reduce((sum, d) => sum + d.pontosImpacto, 0);
  const totalBonus = detalhesCriterios
    .filter(d => d.pontosImpacto > 0)
    .reduce((sum, d) => sum + d.pontosImpacto, 0);
  const notaFinalCalculada = Math.min(100, Math.max(0, 100 + totalPenalidades + totalBonus));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Eye className="h-5 w-5 text-cyan-400" />
            Detalhes da Avaliação 360°
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Cabeçalho com info do professor */}
          <div className="flex items-center gap-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
            <div className="w-14 h-14 rounded-full bg-slate-700 flex items-center justify-center overflow-hidden">
              {avaliacao.professor_foto ? (
                <img src={avaliacao.professor_foto} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-lg font-bold text-slate-400">
                  {avaliacao.professor_nome.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </span>
              )}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-white text-lg">{avaliacao.professor_nome}</h3>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="px-2 py-0.5 bg-slate-700 rounded text-xs">{avaliacao.unidade_codigo}</span>
                <span>•</span>
                <span>{competenciaLabel}</span>
              </div>
            </div>
            <div className={`text-center p-3 rounded-xl border ${getNotaBg(notaFinalCalculada)}`}>
              <p className={`text-3xl font-bold ${getNotaColor(notaFinalCalculada)}`}>
                {notaFinalCalculada}
              </p>
              <p className="text-xs text-slate-400">pontos</p>
            </div>
          </div>

          {/* Resumo do Mês com barra de progresso */}
          <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
            <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
              📊 Resumo do Mês
            </h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Nota Final:</span>
                <span className={`text-2xl font-bold ${getNotaColor(notaFinalCalculada)}`}>
                  {notaFinalCalculada} / 100
                </span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all ${
                    notaFinalCalculada >= 90 ? 'bg-emerald-500' :
                    notaFinalCalculada >= 70 ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                  style={{ width: `${notaFinalCalculada}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-sm text-slate-400 mt-2">
                <span>Nota Base: 100</span>
                <span>|</span>
                <span className="text-rose-400">
                  Penalidades: {detalhesCriterios.filter(d => d.pontosImpacto < 0).reduce((sum, d) => sum + d.pontosImpacto, 0)}
                </span>
                <span>|</span>
                <span className="text-emerald-400">
                  Bônus: +{detalhesCriterios.filter(d => d.pontosImpacto > 0).reduce((sum, d) => sum + d.pontosImpacto, 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Detalhamento por critério - Clicável para ver ocorrências */}
          <div>
            <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
              📋 Detalhamento por Critério
            </h4>
            <div className="space-y-1">
              {detalhesCriterios.map(({ criterio, quantidade, pontosImpacto }) => {
                const ocorrenciasCriterio = getOcorrenciasCriterio(criterio.id);
                const isExpanded = expandedCriterio === criterio.id;
                const hasOcorrencias = ocorrenciasCriterio.length > 0;

                return (
                  <div key={criterio.id} className="rounded-lg border border-slate-700/30 overflow-hidden">
                    {/* Header do critério - clicável */}
                    <div 
                      className={`flex items-center justify-between py-2 px-3 bg-slate-800/30 ${
                        hasOcorrencias ? 'cursor-pointer hover:bg-slate-800/50' : ''
                      }`}
                      onClick={() => hasOcorrencias && setExpandedCriterio(isExpanded ? null : criterio.id)}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          criterio.tipo === 'bonus' ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-700 text-slate-400'
                        }`}>
                          {CRITERIO_ICONS[criterio.codigo] || <span>📋</span>}
                        </div>
                        <span className="text-sm text-white">
                          {criterio.nome}
                          {criterio.tipo === 'bonus' && (
                            <span className="ml-1 text-xs text-purple-400">⭐</span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-sm ${
                          quantidade === 0 ? 'text-slate-500' : 
                          criterio.tipo === 'bonus' ? 'text-purple-400' : 'text-amber-400'
                        }`}>
                          {quantidade} ocorr.
                        </span>
                        <span className={`text-sm font-bold min-w-[45px] text-right ${
                          criterio.tipo === 'bonus' ? 'text-purple-400' :
                          pontosImpacto === 0 ? 'text-emerald-400' :
                          pontosImpacto >= -10 ? 'text-amber-400' : 'text-rose-400'
                        }`}>
                          {criterio.tipo === 'bonus' ? `+${pontosImpacto}` : pontosImpacto}pts
                        </span>
                        {hasOcorrencias && (
                          isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-slate-500" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-500" />
                          )
                        )}
                      </div>
                    </div>

                    {/* Lista de ocorrências expandida */}
                    {isExpanded && hasOcorrencias && (
                      <div className="border-t border-slate-700/30 bg-slate-900/50 p-2 space-y-1">
                        {loadingOcorrencias ? (
                          <div className="flex items-center justify-center py-4">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-violet-500"></div>
                          </div>
                        ) : (
                          ocorrenciasCriterio.map(oc => (
                            <div 
                              key={oc.id}
                              className={`flex items-center justify-between p-2 rounded-lg ${
                                oc.status === 'revertido' 
                                  ? 'bg-slate-800/30 opacity-60' 
                                  : 'bg-slate-800/50'
                              }`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`text-sm ${oc.status === 'revertido' ? 'line-through text-slate-500' : 'text-white'}`}>
                                    {formatarData(oc.data_ocorrencia)}
                                  </span>
                                  {oc.status === 'revertido' && (
                                    <span className="text-xs px-1.5 py-0.5 bg-rose-500/20 text-rose-400 rounded">
                                      Revertido
                                    </span>
                                  )}
                                </div>
                                {oc.descricao && (
                                  <p className="text-xs text-slate-400 truncate mt-0.5">{oc.descricao}</p>
                                )}
                                <p className="text-xs text-slate-500 mt-0.5">
                                  Por: {oc.registrado_por || 'Sistema'}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 ml-2">
                                {oc.status === 'ativo' ? (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0 text-slate-400 hover:text-amber-400"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setModalEditar(oc);
                                      }}
                                      title="Editar"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0 text-slate-400 hover:text-rose-400"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setModalReverter({ ocorrencia: oc, modo: 'reverter' });
                                      }}
                                      title="Reverter"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-xs text-cyan-400 hover:text-cyan-300"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setModalReverter({ ocorrencia: oc, modo: 'restaurar' });
                                    }}
                                  >
                                    Restaurar
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Histórico de Ocorrências - TODO: buscar do banco */}
          {/* 
          <div>
            <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
              📝 Histórico de Ocorrências
            </h4>
            <div className="space-y-2 max-h-[150px] overflow-y-auto">
              {ocorrencias.map(oc => (
                <div key={oc.id} className="p-2 bg-slate-800/30 rounded-lg text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">{oc.data}</span>
                    <span className="text-slate-500">{oc.registrado_por}</span>
                  </div>
                  <p className="text-white">{oc.descricao}</p>
                </div>
              ))}
            </div>
          </div>
          */}

          {/* Status */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Status da avaliação:</span>
            {avaliacao.status === 'fechado' ? (
              <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full font-medium">
                ✓ Fechado
              </span>
            ) : avaliacao.status === 'avaliado' ? (
              <span className="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded-full font-medium">
                Avaliado
              </span>
            ) : (
              <span className="px-3 py-1 bg-slate-700 text-slate-400 rounded-full font-medium">
                Pendente
              </span>
            )}
          </div>
        </div>

        {/* Modal de Edição */}
        <ModalEditarOcorrencia
          isOpen={!!modalEditar}
          onClose={() => setModalEditar(null)}
          ocorrencia={modalEditar}
          criterios={criterios}
          onSuccess={handleSuccess}
        />

        {/* Modal de Reversão/Restauração */}
        <ModalReverterOcorrencia
          isOpen={!!modalReverter}
          onClose={() => setModalReverter(null)}
          ocorrencia={modalReverter?.ocorrencia || null}
          criterios={criterios}
          modo={modalReverter?.modo || 'reverter'}
          onSuccess={handleSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}

export default Modal360Detalhes;
