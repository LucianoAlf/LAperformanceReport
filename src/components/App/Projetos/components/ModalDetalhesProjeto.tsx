import React, { useState, useEffect } from 'react';
import { 
  X, 
  Calendar, 
  Users, 
  ChevronDown, 
  ChevronRight,
  Plus,
  Check,
  Trash2,
  Edit,
  Clock,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Circle,
  Flag
} from 'lucide-react';
import { Button } from '../../../ui/button';
import { 
  useProjetoDetalhes, 
  useCreateTarefa, 
  useUpdateTarefa, 
  useDeleteTarefa,
  useToggleTarefaConcluida,
  useUsuarios,
  useProfessores
} from '../../../../hooks/useProjetos';

interface ModalDetalhesProjetoProps {
  isOpen: boolean;
  projetoId: number | null;
  onClose: () => void;
  onSuccess?: () => void;
}

interface Tarefa {
  id: number;
  titulo: string;
  descricao?: string;
  status: string;
  prioridade: string;
  prazo?: string;
  responsavel_tipo?: string;
  responsavel_id?: number;
  ordem: number;
}

interface Fase {
  id: number;
  nome: string;
  ordem: number;
  status: string;
  data_inicio?: string;
  data_fim?: string;
  tarefas?: Tarefa[];
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pendente: { label: 'Pendente', color: 'text-slate-400', bg: 'bg-slate-500/20' },
  em_andamento: { label: 'Em Andamento', color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
  concluida: { label: 'Concluída', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
  cancelada: { label: 'Cancelada', color: 'text-rose-400', bg: 'bg-rose-500/20' },
};

const prioridadeConfig: Record<string, { label: string; color: string; icon: string }> = {
  baixa: { label: 'Baixa', color: 'text-slate-400', icon: '↓' },
  normal: { label: 'Normal', color: 'text-blue-400', icon: '→' },
  alta: { label: 'Alta', color: 'text-amber-400', icon: '↑' },
  urgente: { label: 'Urgente', color: 'text-rose-400', icon: '🔥' },
};

export function ModalDetalhesProjeto({ isOpen, projetoId, onClose, onSuccess }: ModalDetalhesProjetoProps) {
  const { data: projeto, loading, refetch } = useProjetoDetalhes(projetoId);
  const { data: usuarios } = useUsuarios();
  const { data: professores } = useProfessores();
  const { createTarefa, loading: criandoTarefa } = useCreateTarefa();
  const { updateTarefa, loading: atualizandoTarefa } = useUpdateTarefa();
  const { deleteTarefa, loading: excluindoTarefa } = useDeleteTarefa();
  const { toggleConcluida, loading: toggleLoading } = useToggleTarefaConcluida();

  // Estados locais
  const [fasesExpandidas, setFasesExpandidas] = useState<Set<number>>(new Set());
  const [novaTarefaFaseId, setNovaTarefaFaseId] = useState<number | null>(null);
  const [novaTarefaTitulo, setNovaTarefaTitulo] = useState('');
  const [tarefaEditando, setTarefaEditando] = useState<Tarefa | null>(null);
  const [tarefaParaExcluir, setTarefaParaExcluir] = useState<Tarefa | null>(null);

  // Expandir todas as fases ao abrir
  useEffect(() => {
    if (projeto?.fases) {
      setFasesExpandidas(new Set(projeto.fases.map((f: Fase) => f.id)));
    }
  }, [projeto]);

  if (!isOpen) return null;

  const toggleFase = (faseId: number) => {
    const novoSet = new Set(fasesExpandidas);
    if (novoSet.has(faseId)) {
      novoSet.delete(faseId);
    } else {
      novoSet.add(faseId);
    }
    setFasesExpandidas(novoSet);
  };

  const handleCriarTarefa = async () => {
    if (!novaTarefaFaseId || !novaTarefaTitulo.trim() || !projeto) return;

    try {
      await createTarefa({
        projeto_id: projeto.id,
        fase_id: novaTarefaFaseId,
        titulo: novaTarefaTitulo.trim(),
      });
      setNovaTarefaTitulo('');
      setNovaTarefaFaseId(null);
      refetch();
      onSuccess?.();
    } catch (err) {
      console.error('Erro ao criar tarefa:', err);
    }
  };

  const handleToggleConcluida = async (tarefa: Tarefa) => {
    try {
      const novaConcluida = tarefa.status !== 'concluida';
      await toggleConcluida(tarefa.id, novaConcluida);
      refetch();
      onSuccess?.();
    } catch (err) {
      console.error('Erro ao atualizar tarefa:', err);
    }
  };

  const handleSalvarEdicao = async () => {
    if (!tarefaEditando) return;

    try {
      await updateTarefa(tarefaEditando.id, {
        titulo: tarefaEditando.titulo,
        descricao: tarefaEditando.descricao,
        prioridade: tarefaEditando.prioridade,
        prazo: tarefaEditando.prazo || null,
        responsavel_tipo: tarefaEditando.responsavel_tipo as 'usuario' | 'professor' | null,
        responsavel_id: tarefaEditando.responsavel_id || null,
      });
      setTarefaEditando(null);
      refetch();
      onSuccess?.();
    } catch (err) {
      console.error('Erro ao atualizar tarefa:', err);
    }
  };

  const handleExcluirTarefa = async () => {
    if (!tarefaParaExcluir) return;

    try {
      await deleteTarefa(tarefaParaExcluir.id);
      setTarefaParaExcluir(null);
      refetch();
      onSuccess?.();
    } catch (err) {
      console.error('Erro ao excluir tarefa:', err);
    }
  };

  const formatarData = (data?: string) => {
    if (!data) return '-';
    return new Date(data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };

  const calcularProgressoFase = (fase: Fase) => {
    const tarefas = fase.tarefas || [];
    if (tarefas.length === 0) return { total: 0, concluidas: 0, percentual: 0 };
    const concluidas = tarefas.filter(t => t.status === 'concluida').length;
    return {
      total: tarefas.length,
      concluidas,
      percentual: Math.round((concluidas / tarefas.length) * 100),
    };
  };

  const getNomeResponsavel = (tipo?: string, id?: number) => {
    if (!tipo || !id) return null;
    if (tipo === 'usuario') {
      return usuarios.find(u => u.id === id)?.nome;
    }
    if (tipo === 'professor') {
      return professores.find(p => p.id === id)?.nome;
    }
    return null;
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl my-8">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-800">
          <div className="flex-1">
            {loading ? (
              <div className="animate-pulse">
                <div className="h-6 bg-slate-700 rounded w-64 mb-2"></div>
                <div className="h-4 bg-slate-700 rounded w-40"></div>
              </div>
            ) : projeto ? (
              <>
                <div className="flex items-center gap-3 mb-2">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
                    style={{ backgroundColor: `${projeto.tipo?.cor || '#8b5cf6'}20` }}
                  >
                    {projeto.tipo?.icone || '📁'}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">{projeto.nome}</h2>
                    <p className="text-sm text-slate-400">
                      {projeto.tipo?.nome} • {projeto.unidade?.nome || 'Todas as unidades'}
                    </p>
                  </div>
                </div>
                
                {/* Info rápida */}
                <div className="flex items-center gap-6 mt-4 text-sm">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Calendar className="w-4 h-4" />
                    <span>{formatarData(projeto.data_inicio)} - {formatarData(projeto.data_fim)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <Users className="w-4 h-4" />
                    <span>{projeto.equipe?.length || 0} membros</span>
                  </div>
                  <div className={`px-2 py-0.5 rounded text-xs font-medium ${statusConfig[projeto.status]?.bg} ${statusConfig[projeto.status]?.color}`}>
                    {statusConfig[projeto.status]?.label || projeto.status}
                  </div>
                </div>
              </>
            ) : null}
          </div>
          
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progresso geral */}
        {projeto && (
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-800/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-300">Progresso Geral</span>
              <span className="text-sm text-slate-400">
                {projeto.tarefas_concluidas || 0}/{projeto.total_tarefas || 0} tarefas
              </span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-violet-500 to-cyan-500 rounded-full transition-all duration-500"
                style={{ width: `${projeto.progresso || 0}%` }}
              />
            </div>
            <div className="text-right mt-1">
              <span className="text-lg font-bold text-white">{projeto.progresso || 0}%</span>
            </div>
          </div>
        )}

        {/* Conteúdo - Fases e Tarefas */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
            </div>
          ) : projeto?.fases && projeto.fases.length > 0 ? (
            <div className="space-y-4">
              {projeto.fases.map((fase: Fase) => {
                const progresso = calcularProgressoFase(fase);
                const isExpandida = fasesExpandidas.has(fase.id);
                
                return (
                  <div key={fase.id} className="border border-slate-700 rounded-xl overflow-hidden">
                    {/* Header da Fase */}
                    <button
                      onClick={() => toggleFase(fase.id)}
                      className="w-full flex items-center justify-between p-4 bg-slate-800/50 hover:bg-slate-800 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {isExpandida ? (
                          <ChevronDown className="w-5 h-5 text-slate-400" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-slate-400" />
                        )}
                        <div className="text-left">
                          <h3 className="font-medium text-white">{fase.nome}</h3>
                          <p className="text-xs text-slate-400">
                            {formatarData(fase.data_inicio)} - {formatarData(fase.data_fim)}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-sm font-medium text-white">{progresso.percentual}%</div>
                          <div className="text-xs text-slate-400">{progresso.concluidas}/{progresso.total}</div>
                        </div>
                        <div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-emerald-500 rounded-full transition-all"
                            style={{ width: `${progresso.percentual}%` }}
                          />
                        </div>
                      </div>
                    </button>

                    {/* Lista de Tarefas */}
                    {isExpandida && (
                      <div className="p-4 space-y-2 bg-slate-900/50">
                        {fase.tarefas && fase.tarefas.length > 0 ? (
                          fase.tarefas.map((tarefa: Tarefa) => (
                            <div 
                              key={tarefa.id}
                              className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                                tarefa.status === 'concluida'
                                  ? 'bg-emerald-500/5 border-emerald-500/20'
                                  : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                              }`}
                            >
                              {/* Checkbox */}
                              <button
                                onClick={() => handleToggleConcluida(tarefa)}
                                disabled={toggleLoading}
                                className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                                  tarefa.status === 'concluida'
                                    ? 'bg-emerald-500 border-emerald-500 text-white'
                                    : 'border-slate-500 hover:border-violet-500'
                                }`}
                              >
                                {tarefa.status === 'concluida' && <Check className="w-3 h-3" />}
                              </button>

                              {/* Conteúdo */}
                              <div className="flex-1 min-w-0">
                                <div className={`font-medium ${tarefa.status === 'concluida' ? 'text-slate-400 line-through' : 'text-white'}`}>
                                  {tarefa.titulo}
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-xs">
                                  {/* Prioridade */}
                                  <span className={prioridadeConfig[tarefa.prioridade]?.color || 'text-slate-400'}>
                                    {prioridadeConfig[tarefa.prioridade]?.icon} {prioridadeConfig[tarefa.prioridade]?.label}
                                  </span>
                                  
                                  {/* Prazo */}
                                  {tarefa.prazo && (
                                    <span className={`flex items-center gap-1 ${
                                      new Date(tarefa.prazo) < new Date() && tarefa.status !== 'concluida'
                                        ? 'text-rose-400'
                                        : 'text-slate-400'
                                    }`}>
                                      <Clock className="w-3 h-3" />
                                      {formatarData(tarefa.prazo)}
                                    </span>
                                  )}

                                  {/* Responsável */}
                                  {tarefa.responsavel_tipo && tarefa.responsavel_id && (
                                    <span className="text-slate-400">
                                      👤 {getNomeResponsavel(tarefa.responsavel_tipo, tarefa.responsavel_id) || 'Responsável'}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Ações */}
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => setTarefaEditando({ ...tarefa })}
                                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setTarefaParaExcluir(tarefa)}
                                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-700 rounded transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-slate-500 text-center py-4">
                            Nenhuma tarefa nesta fase
                          </p>
                        )}

                        {/* Adicionar nova tarefa */}
                        {novaTarefaFaseId === fase.id ? (
                          <div className="flex items-center gap-2 p-2 bg-slate-800 rounded-lg border border-violet-500/50">
                            <input
                              type="text"
                              value={novaTarefaTitulo}
                              onChange={(e) => setNovaTarefaTitulo(e.target.value)}
                              placeholder="Título da tarefa..."
                              className="flex-1 bg-transparent border-none text-white placeholder:text-slate-500 focus:outline-none text-sm"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCriarTarefa();
                                if (e.key === 'Escape') {
                                  setNovaTarefaFaseId(null);
                                  setNovaTarefaTitulo('');
                                }
                              }}
                            />
                            <Button
                              size="sm"
                              onClick={handleCriarTarefa}
                              disabled={criandoTarefa || !novaTarefaTitulo.trim()}
                              className="bg-violet-600 hover:bg-violet-500 h-7 px-3"
                            >
                              {criandoTarefa ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Adicionar'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setNovaTarefaFaseId(null);
                                setNovaTarefaTitulo('');
                              }}
                              className="h-7 px-2"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setNovaTarefaFaseId(fase.id)}
                            className="flex items-center gap-2 w-full p-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                            Adicionar tarefa
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>Nenhuma fase encontrada para este projeto</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-slate-800">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-slate-700"
          >
            Fechar
          </Button>
        </div>
      </div>

      {/* Modal de Edição de Tarefa */}
      {tarefaEditando && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-white mb-4">Editar Tarefa</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Título *</label>
                <input
                  type="text"
                  value={tarefaEditando.titulo}
                  onChange={(e) => setTarefaEditando({ ...tarefaEditando, titulo: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Descrição</label>
                <textarea
                  value={tarefaEditando.descricao || ''}
                  onChange={(e) => setTarefaEditando({ ...tarefaEditando, descricao: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-violet-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Prazo</label>
                  <input
                    type="date"
                    value={tarefaEditando.prazo || ''}
                    onChange={(e) => setTarefaEditando({ ...tarefaEditando, prazo: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Prioridade</label>
                  <select
                    value={tarefaEditando.prioridade}
                    onChange={(e) => setTarefaEditando({ ...tarefaEditando, prioridade: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-violet-500"
                  >
                    <option value="baixa">Baixa</option>
                    <option value="normal">Normal</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Responsável</label>
                <select
                  value={tarefaEditando.responsavel_tipo && tarefaEditando.responsavel_id 
                    ? `${tarefaEditando.responsavel_tipo}:${tarefaEditando.responsavel_id}` 
                    : ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      const [tipo, id] = e.target.value.split(':');
                      setTarefaEditando({ 
                        ...tarefaEditando, 
                        responsavel_tipo: tipo,
                        responsavel_id: parseInt(id)
                      });
                    } else {
                      setTarefaEditando({ 
                        ...tarefaEditando, 
                        responsavel_tipo: undefined,
                        responsavel_id: undefined
                      });
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-violet-500"
                >
                  <option value="">Sem responsável</option>
                  <optgroup label="Usuários">
                    {usuarios.map(u => (
                      <option key={`usuario:${u.id}`} value={`usuario:${u.id}`}>{u.nome}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Professores">
                    {professores.map(p => (
                      <option key={`professor:${p.id}`} value={`professor:${p.id}`}>{p.nome}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button
                variant="outline"
                onClick={() => setTarefaEditando(null)}
                className="border-slate-700"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSalvarEdicao}
                disabled={atualizandoTarefa || !tarefaEditando.titulo.trim()}
                className="bg-violet-600 hover:bg-violet-500"
              >
                {atualizandoTarefa ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      {tarefaParaExcluir && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm p-6">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-rose-500/20 flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-rose-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Excluir Tarefa</h3>
              <p className="text-slate-400 text-sm mb-6">
                Tem certeza que deseja excluir a tarefa "{tarefaParaExcluir.titulo}"?
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setTarefaParaExcluir(null)}
                className="flex-1 border-slate-700"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleExcluirTarefa}
                disabled={excluindoTarefa}
                className="flex-1 bg-rose-600 hover:bg-rose-500"
              >
                {excluindoTarefa ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
