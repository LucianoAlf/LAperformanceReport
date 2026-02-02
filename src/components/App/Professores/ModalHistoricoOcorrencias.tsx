import React, { useState, useEffect } from 'react';
import { X, Clock, Edit3, RotateCcw, CheckCircle, AlertTriangle, History, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOcorrenciasComLog, Ocorrencia360Completa, OcorrenciaLog, Criterio360 } from '@/hooks/useProfessor360';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ModalHistoricoOcorrenciasProps {
  isOpen: boolean;
  onClose: () => void;
  professorId: number;
  professorNome: string;
  competencia?: string;
  criterios: Criterio360[];
  onEditarOcorrencia?: (ocorrencia: Ocorrencia360Completa) => void;
  onReverterOcorrencia?: (ocorrencia: Ocorrencia360Completa) => void;
  onRestaurarOcorrencia?: (ocorrencia: Ocorrencia360Completa) => void;
}

// Ícone para cada tipo de ação
const acaoIcons: Record<string, React.ReactNode> = {
  criado: <CheckCircle className="w-4 h-4 text-emerald-400" />,
  editado: <Edit3 className="w-4 h-4 text-amber-400" />,
  revertido: <RotateCcw className="w-4 h-4 text-rose-400" />,
  restaurado: <CheckCircle className="w-4 h-4 text-cyan-400" />,
};

// Cores para cada tipo de ação
const acaoCores: Record<string, string> = {
  criado: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  editado: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  revertido: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  restaurado: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
};

// Textos para cada tipo de ação
const acaoTextos: Record<string, string> = {
  criado: 'Registrado',
  editado: 'Editado',
  revertido: 'Revertido',
  restaurado: 'Restaurado',
};

export default function ModalHistoricoOcorrencias({
  isOpen,
  onClose,
  professorId,
  professorNome,
  competencia,
  criterios,
  onEditarOcorrencia,
  onReverterOcorrencia,
  onRestaurarOcorrencia,
}: ModalHistoricoOcorrenciasProps) {
  const { fetchHistoricoProfessor, loading } = useOcorrenciasComLog();
  const [historico, setHistorico] = useState<{ ocorrencia: Ocorrencia360Completa; logs: OcorrenciaLog[] }[]>([]);
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'ativo' | 'revertido'>('todos');
  const [filtroCriterio, setFiltroCriterio] = useState<string>('todos');
  const [expandedOcorrencias, setExpandedOcorrencias] = useState<Set<number>>(new Set());
  const [loadingData, setLoadingData] = useState(false);

  // Carregar histórico quando abrir o modal
  useEffect(() => {
    if (isOpen && professorId) {
      loadHistorico();
    }
  }, [isOpen, professorId, competencia]);

  const loadHistorico = async () => {
    setLoadingData(true);
    try {
      const data = await fetchHistoricoProfessor(professorId, competencia);
      setHistorico(data);
    } catch (err) {
      console.error('Erro ao carregar histórico:', err);
    } finally {
      setLoadingData(false);
    }
  };

  // Filtrar histórico
  const historicoFiltrado = historico.filter(item => {
    const statusMatch = filtroStatus === 'todos' || item.ocorrencia.status === filtroStatus;
    const criterioMatch = filtroCriterio === 'todos' || item.ocorrencia.criterio_id.toString() === filtroCriterio;
    return statusMatch && criterioMatch;
  });

  // Toggle expandir/colapsar ocorrência
  const toggleExpand = (ocorrenciaId: number) => {
    const newExpanded = new Set(expandedOcorrencias);
    if (newExpanded.has(ocorrenciaId)) {
      newExpanded.delete(ocorrenciaId);
    } else {
      newExpanded.add(ocorrenciaId);
    }
    setExpandedOcorrencias(newExpanded);
  };

  // Formatar data
  const formatarData = (data: string) => {
    try {
      return format(new Date(data), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return data;
    }
  };

  // Formatar data curta
  const formatarDataCurta = (data: string) => {
    try {
      return format(new Date(data), 'dd/MM/yyyy', { locale: ptBR });
    } catch {
      return data;
    }
  };

  // Obter nome do critério
  const getNomeCriterio = (criterioId: number) => {
    const criterio = criterios.find(c => c.id === criterioId);
    return criterio?.nome || 'Critério desconhecido';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col bg-slate-900 border-slate-700">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-white">
            <History className="w-5 h-5 text-violet-400" />
            Histórico de Ocorrências - {professorNome}
          </DialogTitle>
        </DialogHeader>

        {/* Filtros */}
        <div className="flex gap-3 py-3 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-400">Filtros:</span>
          </div>
          
          <Select value={filtroStatus} onValueChange={(v) => setFiltroStatus(v as any)}>
            <SelectTrigger className="w-[140px] h-8 bg-slate-800 border-slate-700 text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="ativo">Ativos</SelectItem>
              <SelectItem value="revertido">Revertidos</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filtroCriterio} onValueChange={setFiltroCriterio}>
            <SelectTrigger className="w-[180px] h-8 bg-slate-800 border-slate-700 text-sm">
              <SelectValue placeholder="Critério" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os critérios</SelectItem>
              {criterios.map(c => (
                <SelectItem key={c.id} value={c.id.toString()}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="ml-auto text-sm text-slate-500">
            {historicoFiltrado.length} ocorrência(s)
          </div>
        </div>

        {/* Lista de Ocorrências */}
        <div className="flex-1 overflow-y-auto space-y-3 py-3">
          {loadingData ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
            </div>
          ) : historicoFiltrado.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Nenhuma ocorrência encontrada</p>
            </div>
          ) : (
            historicoFiltrado.map(({ ocorrencia, logs }) => (
              <div
                key={ocorrencia.id}
                className={`rounded-lg border ${
                  ocorrencia.status === 'revertido'
                    ? 'bg-slate-800/50 border-slate-700/50 opacity-70'
                    : 'bg-slate-800 border-slate-700'
                }`}
              >
                {/* Header da Ocorrência */}
                <div
                  className="flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-700/30 transition-colors"
                  onClick={() => toggleExpand(ocorrencia.id)}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${ocorrencia.status === 'revertido' ? 'line-through text-slate-500' : 'text-white'}`}>
                        {getNomeCriterio(ocorrencia.criterio_id)}
                      </span>
                      {ocorrencia.status === 'revertido' && (
                        <Badge variant="outline" className="text-xs bg-rose-500/20 text-rose-400 border-rose-500/30">
                          Revertido
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-slate-400">
                      <span>{formatarDataCurta(ocorrencia.data_ocorrencia)}</span>
                      {ocorrencia.descricao && (
                        <>
                          <span>•</span>
                          <span className="truncate max-w-[300px]">{ocorrencia.descricao}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-2">
                    {ocorrencia.status === 'ativo' ? (
                      <>
                        {onEditarOcorrencia && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-slate-400 hover:text-amber-400"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditarOcorrencia(ocorrencia);
                            }}
                          >
                            <Edit3 className="w-4 h-4" />
                          </Button>
                        )}
                        {onReverterOcorrencia && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-slate-400 hover:text-rose-400"
                            onClick={(e) => {
                              e.stopPropagation();
                              onReverterOcorrencia(ocorrencia);
                            }}
                          >
                            <RotateCcw className="w-4 h-4" />
                          </Button>
                        )}
                      </>
                    ) : (
                      onRestaurarOcorrencia && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-slate-400 hover:text-cyan-400"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRestaurarOcorrencia(ocorrencia);
                          }}
                        >
                          <CheckCircle className="w-4 h-4" />
                        </Button>
                      )
                    )}
                    {expandedOcorrencias.has(ocorrencia.id) ? (
                      <ChevronUp className="w-4 h-4 text-slate-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    )}
                  </div>
                </div>

                {/* Timeline de Logs (expandido) */}
                {expandedOcorrencias.has(ocorrencia.id) && (
                  <div className="border-t border-slate-700 p-3 bg-slate-800/50">
                    <h4 className="text-xs font-medium text-slate-400 mb-3 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Timeline de Alterações
                    </h4>
                    <div className="space-y-2">
                      {logs.length === 0 ? (
                        <p className="text-sm text-slate-500 italic">Nenhum registro de alteração</p>
                      ) : (
                        logs.map((log, index) => (
                          <div
                            key={log.id}
                            className={`flex items-start gap-3 p-2 rounded-lg border ${acaoCores[log.acao]}`}
                          >
                            <div className="mt-0.5">{acaoIcons[log.acao]}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{acaoTextos[log.acao]}</span>
                                <span className="text-xs opacity-70">por {log.usuario_nome}</span>
                              </div>
                              <div className="text-xs opacity-70 mt-0.5">
                                {formatarData(log.created_at)}
                              </div>
                              {log.justificativa && (
                                <div className="mt-2 p-2 bg-black/20 rounded text-xs">
                                  <span className="font-medium">Justificativa:</span> {log.justificativa}
                                </div>
                              )}
                              {log.acao === 'editado' && log.dados_anteriores && log.dados_novos && (
                                <div className="mt-2 text-xs space-y-1">
                                  {log.dados_anteriores.data_ocorrencia !== log.dados_novos.data_ocorrencia && (
                                    <div>
                                      <span className="opacity-70">Data:</span>{' '}
                                      <span className="line-through text-rose-400">{formatarDataCurta(log.dados_anteriores.data_ocorrencia)}</span>
                                      {' → '}
                                      <span className="text-emerald-400">{formatarDataCurta(log.dados_novos.data_ocorrencia)}</span>
                                    </div>
                                  )}
                                  {log.dados_anteriores.descricao !== log.dados_novos.descricao && (
                                    <div>
                                      <span className="opacity-70">Descrição alterada</span>
                                    </div>
                                  )}
                                  {log.dados_anteriores.minutos_atraso !== log.dados_novos.minutos_atraso && (
                                    <div>
                                      <span className="opacity-70">Minutos:</span>{' '}
                                      <span className="line-through text-rose-400">{log.dados_anteriores.minutos_atraso}</span>
                                      {' → '}
                                      <span className="text-emerald-400">{log.dados_novos.minutos_atraso}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Info de reversão */}
                    {ocorrencia.status === 'revertido' && ocorrencia.justificativa_reversao && (
                      <div className="mt-3 p-2 bg-rose-500/10 border border-rose-500/30 rounded-lg">
                        <div className="flex items-center gap-2 text-sm text-rose-400">
                          <AlertTriangle className="w-4 h-4" />
                          <span className="font-medium">Motivo da reversão:</span>
                        </div>
                        <p className="text-sm text-rose-300 mt-1">{ocorrencia.justificativa_reversao}</p>
                        {ocorrencia.revertido_por_nome && (
                          <p className="text-xs text-rose-400/70 mt-1">
                            Por {ocorrencia.revertido_por_nome} em {ocorrencia.revertido_em ? formatarData(ocorrencia.revertido_em) : ''}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 pt-3 border-t border-slate-700">
          <Button variant="outline" onClick={onClose} className="w-full">
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
